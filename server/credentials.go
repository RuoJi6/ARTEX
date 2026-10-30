package server

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/llmrec"
	"github.com/Autumn-27/artex/traffic"
	"github.com/Autumn-27/norma/transcript"
)

func (s *Server) seedCredentialProcessor() {
	const flag = "credential_processor_seed_v1"
	if s.m.pg.GetBool(flag, false) {
		return
	}
	a, err := s.m.pg.GetAgentByKey(db.CredentialAgentKey)
	if err != nil {
		return
	}
	if a == nil {
		a, err = s.m.pg.CreateAgent(db.CredentialAgentKey, "凭据整理", "Agent 开关控制的凭据整理：拆分账号、密码、Token、Cookie，仅分析已上报内容，不主动登录。可独立绑定模型；每条最多一次模型调用。")
		if err != nil {
			return
		}
		if err = s.m.pg.SeedPromptIfEmpty(a.ID, agent.CredentialProcessorPrompt); err != nil {
			return
		}
		_ = s.m.pg.SetAgentMaxTurns(db.CredentialAgentKey, 1)
	}
	_ = s.m.pg.SetBool(flag, true)
}
func (s *Server) runCredentialProcessor() {
	// Events wake the worker immediately. The slow ticker is only a recovery
	// scan for rows created before a notification or after a process restart.
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
		case <-s.credentialWake:
		}
		if !s.m.pg.GetBool(db.SettingTaskIntelligence, false) || !s.m.pg.GetBool(db.SettingCredentialAgent, false) {
			continue
		}
		a, err := s.m.pg.GetAgentByKey(db.CredentialAgentKey)
		if err != nil || a == nil || !a.Enabled {
			continue
		}
		item, err := s.m.pg.ClaimCredentialJob(s.ctx, s.m.pg.GetBool(db.SettingCredentialTraffic, false), 0)
		if err != nil {
			if s.ctx.Err() == nil {
				log.Printf("[credentials] queue: %v", err)
			}
			continue
		}
		if item == nil {
			continue
		}
		s.processCredentialJob(s.ctx, item)
	}
}
func (s *Server) processCredentialJob(parent context.Context, item *db.Intelligence) {
	if !s.m.pg.GetBool(db.SettingTaskIntelligence, false) || !s.m.pg.GetBool(db.SettingCredentialAgent, false) {
		_ = s.m.pg.FinishCredentialJob(parent, item, *item.Credentials)
		return
	}
	ctx, cancel := context.WithTimeout(parent, 90*time.Second)
	defer cancel()
	// Turning the switch off cancels even an in-flight model call.
	go func() {
		tick := time.NewTicker(500 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				if !s.m.pg.GetBool(db.SettingTaskIntelligence, false) || !s.m.pg.GetBool(db.SettingCredentialAgent, false) {
					cancel()
					return
				}
			}
		}
	}()
	result := *item.Credentials
	conversationID := result.ConversationID
	if conversationID == 0 {
		if c, err := s.m.pg.CreateConversation(db.CredentialAgentKey, "凭据整理 · "+firstLine(item.Title, 42), nil); err == nil {
			conversationID = c.ID
			result.ConversationID = c.ID
			_, _ = s.m.pg.AppendConvActivity(c.ID, db.Activity{Worker: db.CredentialAgentKey, Kind: "user", Summary: "收到凭据上报，开始整理", Detail: item.Content})
		}
	}
	needsExtract := result.ForceExtract || result.SourceHash != db.CredentialSourceHash(item.Content) || result.Method == "" || (result.Error != "" && len(result.Accounts) == 0)
	result.State = "ready"
	result.ForceExtract = false
	result.Error = ""
	result.TrafficNote = ""
	sourceHash := db.CredentialSourceHash(item.Content)
	if needsExtract {
		result.Accounts = nil
		if result.SourceHash != sourceHash {
			result.Traffic = nil
		}
		result.InputTokens = 0
		result.OutputTokens = 0
		result.Model = ""
		result.Note = ""
		accounts, parsed := agent.ParseCredentialJSON(item.Content)
		if parsed {
			result.Method = "rules"
			result.Accounts = accounts
		} else {
			result.Method = "agent"
			prov, cfg, ok := s.agentBindingProvider(db.CredentialAgentKey)
			if !ok {
				prov, cfg, ok = s.globalProvider()
			}
			if !ok {
				result.State = "error"
				result.Error = "未配置可用模型，请在 Agent 配置中为凭据整理选择模型，或激活全局模型后重试"
			} else {
				prompt := agent.CredentialProcessorPrompt
				if a, err := s.m.pg.GetAgentByKey(db.CredentialAgentKey); err == nil && a != nil {
					if p, err := s.m.pg.CurrentPrompt(a.ID); err == nil && strings.TrimSpace(p) != "" {
						prompt = p
					}
				}
				callCtx := llmrec.WithTaskID(ctx, strconv.FormatInt(item.TaskID, 10))
				callCtx = llmrec.WithWorker(callCtx, db.CredentialAgentKey)
				callCtx = transcript.WithSessionID(callCtx, "credential-"+strconv.FormatInt(item.ID, 10)+"-"+sourceHash[:12])
				accounts, usage, err := agent.ExtractCredentials(callCtx, prov, prompt, item.Content, cfg.MaxTokens)
				result.Model = cfg.Model
				result.InputTokens = usage.InputTokens
				result.OutputTokens = usage.OutputTokens
				if err != nil {
					result.State = "error"
					result.Error = err.Error()
				} else {
					result.Accounts = accounts
				}
			}
		}
		result.SourceHash = sourceHash
	}
	if result.State == "ready" && len(result.Accounts) == 100 {
		result.Note = "单条最多整理 100 组凭据，完整信息仍可在原始上报中查看"
	}
	if result.State == "ready" && len(result.Accounts) == 0 {
		result.Note = "未识别到可独立展示的凭据，原文已保留"
	}
	if result.State == "ready" && s.m.pg.GetBool(db.SettingCredentialTraffic, false) && ctx.Err() == nil {
		matched, state, note := s.matchCredentialTraffic(ctx, item, result.Accounts)
		// Binding is additive: a later retry must not discard previously saved
		// evidence just because disposable traffic has since been purged.
		seen := map[string]bool{}
		merged := []db.CredentialTraffic{}
		for _, ref := range append(append([]db.CredentialTraffic{}, result.Traffic...), matched...) {
			if !seen[ref.ID] && len(merged) < 12 {
				seen[ref.ID] = true
				merged = append(merged, ref)
			}
		}
		result.Traffic = merged
		result.TrafficState = state
		result.TrafficNote = note
		if len(merged) > 0 {
			result.TrafficState = "ready"
			if len(matched) == 0 {
				result.TrafficNote = "既有流量引用与匹配片段已保留；原始流量可能已删除或暂不可用"
			}
		}
	} else if !s.m.pg.GetBool(db.SettingCredentialTraffic, false) {
		result.TrafficState = "off"
	}
	if ctx.Err() != nil && result.State == "ready" {
		result.State = "error"
		result.Error = "整理已中断，原始内容保留，可手动重试"
	}
	// Use a fresh bounded persistence context so cancellation can release the lease.
	finish, stop := context.WithTimeout(context.Background(), 5*time.Second)
	defer stop()
	if err := s.m.pg.FinishCredentialJob(finish, item, result); err != nil {
		log.Printf("[credentials] save record #%d: %v", item.ID, err)
	}
	if conversationID > 0 {
		detail, _ := json.Marshal(result)
		kind, summary := "result", "凭据整理完成"
		isError := result.State == "error"
		if isError {
			kind, summary = "text", "凭据整理失败："+result.Error
		}
		_, _ = s.m.pg.AppendConvActivity(conversationID, db.Activity{Worker: db.CredentialAgentKey, Kind: kind, IsError: isError, Summary: summary, Detail: string(detail), InputTokens: intPtr(result.InputTokens), OutputTokens: intPtr(result.OutputTokens)})
		_ = s.m.pg.TouchConversation(conversationID)
	}
}

func intPtr(v int) *int { return &v }

var credentialURLs = regexp.MustCompile(`https?://[^\s<>"'，；）)]+`)
var credentialTrafficIDs = regexp.MustCompile(`\b[0-9]{8,}-[0-9]{3,}\b`)

func (s *Server) credentialHosts(item *db.Intelligence) map[string]bool {
	hosts := map[string]bool{}
	add := func(raw string, children bool) {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			return
		}
		if !strings.Contains(raw, "://") {
			raw = "http://" + raw
		}
		u, err := url.Parse(raw)
		if err == nil && u.Hostname() != "" {
			host := strings.ToLower(u.Hostname())
			hosts[host] = hosts[host] || children
		}
	}
	if assets, err := s.m.Assets().GetByIDs(item.AssetIDs); err == nil {
		for _, a := range assets {
			switch a.Type {
			case "root_domain":
				add(a.Domain, true)
			case "service", "endpoint":
				add(a.URL, false)
				add(a.Domain, false)
				add(a.IP, false)
			case "subdomain":
				add(a.Domain, false)
			case "ip":
				add(a.IP, false)
			}
		}
	}
	for _, raw := range credentialURLs.FindAllString(item.Content+"\n"+item.Evidence, 16) {
		add(raw, false)
	}
	return hosts
}
func matchesCredentialHost(raw string, hosts map[string]bool) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for known, children := range hosts {
		if host == known || children && strings.HasSuffix(host, "."+known) {
			return true
		}
	}
	return false
}
func credentialMatches(raw string, a db.CredentialAccount) bool {
	source := agent.CredentialSourceText(raw)
	// Tokens and cookies can be returned without a username in the same response.
	for _, secret := range []string{a.Token, a.Cookie} {
		if len(secret) >= 8 && strings.Contains(source, secret) {
			return true
		}
	}
	if len(a.Password) < 6 || !strings.Contains(source, a.Password) {
		return false
	}
	if a.Username != "" {
		return strings.Contains(source, a.Username)
	}
	return len(a.Password) >= 8
}
func credentialExcerpt(raw string, accounts []db.CredentialAccount) string {
	index := 0
	found := false
	for _, a := range accounts {
		for _, secret := range []string{a.Token, a.Cookie, a.Password} {
			if secret != "" {
				if at := strings.Index(raw, secret); at >= 0 {
					index = at
					found = true
					break
				}
			}
		}
		if found {
			break
		}
	}
	runes := []rune(raw[:index])
	start := len(runes) - 100
	if start < 0 {
		start = 0
	}
	all := []rune(raw)
	end := start + 600
	if end > len(all) {
		end = len(all)
	}
	return string(all[start:end])
}
func (s *Server) matchCredentialTraffic(ctx context.Context, item *db.Intelligence, accounts []db.CredentialAccount) ([]db.CredentialTraffic, string, string) {
	bound := []db.CredentialTraffic{}
	if s.m.traffic == nil {
		return bound, "unavailable", "未启用流量采集或没有可用的流量存储"
	}
	hosts := s.credentialHosts(item)
	if len(hosts) == 0 {
		return bound, "unavailable", "没有可核对的关联资产或 URL，未猜测流量归属"
	}
	seen := map[string]bool{}
	inspected, queries := 0, 0
	inspect := func(id string) {
		if seen[id] || inspected >= 32 || len(bound) >= 12 || ctx.Err() != nil {
			return
		}
		seen[id] = true
		inspected++
		// Reads only captured data. No network requests or authentication attempts.
		_ = s.m.traffic.ReadEvidence(ctx, []string{id}, func(e traffic.EvidenceExchange) error {
			if !matchesCredentialHost(e.URL, hosts) {
				return nil
			}
			req, err := io.ReadAll(io.LimitReader(e.Request, 128<<10))
			if err != nil {
				return err
			}
			resp, err := io.ReadAll(io.LimitReader(e.Response, 128<<10))
			if err != nil {
				return err
			}
			head := func(s string) string {
				if len(s) > 8192 {
					return s[:8192]
				}
				return s
			}
			for _, side := range []struct{ name, raw string }{{"request", head(e.ReqHead) + "\n" + string(req)}, {"response", head(e.RespHead) + "\n" + string(resp)}} {
				matches := []int{}
				for i, a := range accounts {
					if credentialMatches(side.raw, a) {
						matches = append(matches, i)
					}
				}
				if len(matches) > 0 {
					bound = append(bound, db.CredentialTraffic{ID: e.ID, URL: e.URL, Method: e.Method, Status: e.Status, Side: side.name, Excerpt: credentialExcerpt(side.raw, accounts), Accounts: matches})
					break
				}
			}
			return nil
		})
	}
	for _, id := range credentialTrafficIDs.FindAllString(item.Evidence, 8) {
		inspect(id)
	}
	names := make([]string, 0, len(hosts))
	for host := range hosts {
		names = append(names, host)
	}
	sort.Strings(names)
	if len(names) > 8 {
		names = names[:8]
	}
	for _, a := range accounts {
		for _, secret := range []string{a.Token, a.Cookie, a.Password} {
			if len(secret) < 6 {
				continue
			}
			for _, host := range names {
				if queries >= 24 || len(bound) >= 12 || ctx.Err() != nil {
					break
				}
				queries++
				rows, _, err := s.m.traffic.Page(traffic.PageQuery{Host: host, Body: secret, RespMin: -1, RespMax: -1}, 0, 4)
				if err != nil {
					continue
				}
				for _, row := range rows {
					inspect(row.ID)
				}
			}
		}
	}
	if ctx.Err() != nil {
		return bound, "error", "流量核对已中断，可手动重试"
	}
	if len(bound) == 0 {
		return bound, "none", "未找到包含匹配凭据的已抓取流量；不会据此改变凭据验证状态"
	}
	return bound, "ready", "已核对资产域名及凭据原文；保存流量引用与片段，原始流量删除后仍可查看片段"
}

func (s *Server) retryCredentials(w http.ResponseWriter, r *http.Request) {
	if !s.m.pg.GetBool(db.SettingTaskIntelligence, false) || !s.m.pg.GetBool(db.SettingCredentialAgent, false) {
		writeErr(w, 409, "请先开启 Agent 开关")
		return
	}
	taskID, ok := pathInt(r, "id")
	if !ok {
		return
	}
	id, ok := pathInt(r, "intelID")
	if !ok {
		return
	}
	item, err := s.m.pg.GetIntelligence(r.Context(), id)
	if err != nil || item.TaskID != taskID || item.Kind != "credential" {
		intelligenceError(w, db.ErrIntelligenceNotFound)
		return
	}
	if item.Credentials != nil && item.Credentials.State == "processing" {
		writeErr(w, 409, "该凭据正在整理，请稍后再试")
		return
	}
	if err = s.m.pg.RetryCredentialJob(r.Context(), taskID, id); err != nil {
		intelligenceError(w, err)
		return
	}
	writeJSON(w, 202, map[string]bool{"queued": true})
}

// Scope checking reuses the intelligence API before exposing a live flow. A
// bound excerpt remains visible even if the original exchange has been purged.
func (s *Server) credentialTrafficDetail(w http.ResponseWriter, r *http.Request) {
	f, ok := s.intelligenceFilter(w, r)
	if !ok {
		return
	}
	id, ok := pathInt(r, "intelID")
	if !ok {
		return
	}
	item, err := s.m.pg.GetIntelligence(r.Context(), id)
	if err != nil {
		intelligenceError(w, err)
		return
	}
	allowed := false
	if f.TaskID > 0 {
		err = s.m.pg.QueryRowContext(r.Context(), `SELECT $1::bigint=$2::bigint OR EXISTS(SELECT 1 FROM task_relations WHERE task_id=$1 AND source_task_id=$2)`, f.TaskID, item.TaskID).Scan(&allowed)
	} else {
		for _, a := range item.AssetIDs {
			if a == f.AssetID {
				allowed = true
			}
		}
	}
	if err != nil || !allowed || item.Credentials == nil {
		intelligenceError(w, db.ErrIntelligenceNotFound)
		return
	}
	var ref *db.CredentialTraffic
	for i := range item.Credentials.Traffic {
		if item.Credentials.Traffic[i].ID == r.PathValue("trafficID") {
			ref = &item.Credentials.Traffic[i]
			break
		}
	}
	if ref == nil {
		intelligenceError(w, db.ErrIntelligenceNotFound)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if s.m.traffic == nil {
		writeJSON(w, 200, map[string]any{"reference": ref, "unavailable": true})
		return
	}
	req, resp, err := s.m.traffic.Get(ref.ID)
	if err != nil {
		writeJSON(w, 200, map[string]any{"reference": ref, "unavailable": true})
		return
	}
	writeJSON(w, 200, map[string]any{"reference": ref, "req": req, "resp": resp, "unavailable": false})
}
