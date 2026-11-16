package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
)

// FOFA 资产同步。与 ScopeSentry 同步共用资产入库通道（ip + open_ports，企业
// scope 自动认领），数据源是 FOFA 官方或兼容第三方代理的 /api/v1/search/all。
// 查询完全被动：数据来自 FOFA 的历史索引，不向目标发送任何流量。
//
// 端点三档（下拉可选）：
//   official → https://fofa.info   （email + key 鉴权）
//   fofoapi  → https://fofoapi.com （key-only，第三方代理预设）
//   custom   → 自定义 base_url     （任意官方兼容代理）
//
// 计费提醒（第三方代理实测）：每次查询扣 1 次配额 + 按返回条数扣总量；
// /api/v1/info/my（余额）免费。配额耗尽的错误语义统一翻译成 429，调用方应停。

const (
	fofaConfigKey        = "fofa_config"
	fofaFields           = "host,ip,port,title,server,protocol,product"
	fofaMaxSize          = 10000
	fofaDefaultSize      = 1000
	fofaOfficialEndpoint = "https://fofa.info"
	fofaProxyEndpoint    = "https://fofoapi.com"
)

type fofaConfig struct {
	Endpoint string `json:"endpoint"` // official | fofoapi | custom
	BaseURL  string `json:"base_url"` // custom 时必填；预设档自动填充
	Email    string `json:"email"`    // official 需要
	APIKey   string `json:"api_key"`
}

type fofaPreset struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	BaseURL string `json:"base_url"`
	Email   bool   `json:"email"` // 是否需要 email
}

var fofaPresets = []fofaPreset{
	{ID: "official", Label: "官方 fofa.info", BaseURL: fofaOfficialEndpoint, Email: true},
	{ID: "fofoapi", Label: "第三方代理 fofoapi.com（预设）", BaseURL: fofaProxyEndpoint, Email: false},
	{ID: "custom", Label: "自定义", BaseURL: "", Email: false},
}

// fofaLoadConfig 读取配置；key 永不回传前端，只回 key_set。
func (s *Server) fofaLoadConfig() (fofaConfig, bool) {
	var c fofaConfig
	raw, ok, _ := s.m.pg.GetSetting(fofaConfigKey)
	if ok && raw != "" {
		_ = json.Unmarshal([]byte(raw), &c)
	}
	return c, c.APIKey != "" && c.baseURL() != ""
}

func (c *fofaConfig) baseURL() string {
	if c.Endpoint == "official" {
		return fofaOfficialEndpoint
	}
	if c.Endpoint == "fofoapi" {
		return fofaProxyEndpoint
	}
	return strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
}

func (c *fofaConfig) valid() bool {
	if c.APIKey == "" || c.baseURL() == "" {
		return false
	}
	if c.Endpoint == "official" && c.Email == "" {
		return false
	}
	return true
}

// ---------- GET/POST /api/sync/fofa/config ----------

func (s *Server) fofaConfigGet(w http.ResponseWriter, r *http.Request) {
	if s.pg(w) == nil {
		return
	}
	c, _ := s.fofaLoadConfig()
	writeJSON(w, 200, map[string]any{
		"endpoint": c.Endpoint,
		"base_url": c.BaseURL,
		"email":    c.Email,
		"key_set":  c.APIKey != "",
		"valid":    c.valid(),
		"presets":  fofaPresets,
	})
}

func (s *Server) fofaConfigSet(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var body fofaConfig
	if err := decode(r, &body); err != nil {
		writeProductError(w, 400, "invalid_request", "请求格式错误", nil)
		return
	}
	body.Endpoint = strings.TrimSpace(body.Endpoint)
	body.BaseURL = strings.TrimSpace(body.BaseURL)
	body.Email = strings.TrimSpace(body.Email)
	body.APIKey = strings.TrimSpace(body.APIKey)
	if body.Endpoint == "" {
		body.Endpoint = "official"
	}
	known := false
	for _, p := range fofaPresets {
		if p.ID == body.Endpoint {
			known = true
		}
	}
	if !known {
		writeProductError(w, 400, "fofa_unknown_endpoint", "未知端点类型: "+body.Endpoint, map[string]any{"endpoint": body.Endpoint})
		return
	}
	if body.Endpoint == "custom" && body.BaseURL == "" {
		writeProductError(w, 400, "fofa_base_url_required", "自定义端点必须填写 base_url", nil)
		return
	}
	// 空 key = 保留原值（与 LLM 配置同语义），便于只换端点不重输 key。
	old, _ := s.fofaLoadConfig()
	if body.APIKey == "" {
		body.APIKey = old.APIKey
	}
	raw, _ := json.Marshal(body)
	if err := pg.SetSetting(fofaConfigKey, string(raw)); err != nil {
		writeProductError(w, 500, "fofa_save_failed", "保存失败: "+err.Error(), nil)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "valid": body.valid()})
}

// ---------- FOFA HTTP ----------

type fofaResp struct {
	Error  bool    `json:"error"`
	Errmsg string  `json:"errmsg"`
	Size   int     `json:"size"` // 命中总数
	Rows   [][]any `json:"results"`
}

func (s *Server) fofaCall(ctx context.Context, path string, query url.Values) (*fofaResp, error) {
	c, ok := s.fofaLoadConfig()
	if !ok || !c.valid() {
		return nil, errFofaNotConfigured
	}
	q := url.Values{}
	for k, v := range query {
		q[k] = v
	}
	q.Set("key", c.APIKey)
	if c.Endpoint == "official" && c.Email != "" {
		q.Set("email", c.Email)
	}
	u := c.baseURL() + path + "?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 FOFA 失败: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	var fr fofaResp
	if err := json.Unmarshal(body, &fr); err != nil {
		return nil, fmt.Errorf("解析 FOFA 响应失败(HTTP %d): %s", resp.StatusCode, fofaTruncate(string(body), 200))
	}
	if fr.Error {
		// 配额耗尽/限流:翻译成 429 语义,调用方必须停(代理方明示继续撞会封 key)。
		msg := fr.Errmsg
		for _, kw := range []string{"已用完", "今日上限", "请求频繁", "820041"} {
			if strings.Contains(msg, kw) {
				return nil, &fofaQuotaError{msg: msg}
			}
		}
		return nil, fmt.Errorf("FOFA 错误: %s", msg)
	}
	return &fr, nil
}

var errFofaNotConfigured = fmt.Errorf("FOFA 未配置或配置不完整")

type fofaQuotaError struct{ msg string }

func (e *fofaQuotaError) Error() string { return e.msg }

func fofaTruncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// fofaSearch 执行一次查询。fields 固定 7 列;size 为返回条数(同时是条数配额消耗)。
func (s *Server) fofaSearch(ctx context.Context, query string, size int) (*fofaResp, error) {
	q := url.Values{}
	q.Set("qbase64", base64.StdEncoding.EncodeToString([]byte(query)))
	q.Set("fields", fofaFields)
	if size <= 0 {
		size = fofaDefaultSize
	}
	if size > fofaMaxSize {
		size = fofaMaxSize
	}
	q.Set("size", fmt.Sprint(size))
	return s.fofaCall(ctx, "/api/v1/search/all", q)
}

// ---------- GET /api/sync/fofa/quota ----------（info/my 免费，不扣配额）

func (s *Server) fofaQuota(w http.ResponseWriter, r *http.Request) {
	if s.pg(w) == nil {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	// info/my 返回账号对象（无 results 数组），单独走原始解析。
	c, ok := s.fofaLoadConfig()
	if !ok || !c.valid() {
		fofaWriteErr(w, errFofaNotConfigured)
		return
	}
	q := url.Values{}
	q.Set("key", c.APIKey)
	if c.Endpoint == "official" && c.Email != "" {
		q.Set("email", c.Email)
	}
	u := c.baseURL() + "/api/v1/info/my?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		fofaWriteErr(w, err)
		return
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fofaWriteErr(w, fmt.Errorf("请求 FOFA 失败: %w", err))
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var info json.RawMessage
	if err := json.Unmarshal(body, &info); err != nil {
		fofaWriteErr(w, fmt.Errorf("解析余额响应失败(HTTP %d)", resp.StatusCode))
		return
	}
	writeJSON(w, 200, map[string]any{"info": info})
}

// ---------- POST /api/sync/fofa/preview ----------（size=1：命中总数 + 样例，几乎不耗条数）

type fofaPreviewReq struct {
	Query string `json:"query"`
}

func (s *Server) fofaPreview(w http.ResponseWriter, r *http.Request) {
	if s.pg(w) == nil {
		return
	}
	var body fofaPreviewReq
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Query) == "" {
		writeProductError(w, 400, "fofa_query_required", "query 不能为空", nil)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	fr, err := s.fofaSearch(ctx, body.Query, 1)
	if err != nil {
		fofaWriteErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"match_size": fr.Size, "sample": fr.Rows})
}

func fofaWriteErr(w http.ResponseWriter, err error) {
	if err == errFofaNotConfigured {
		writeProductError(w, 400, "fofa_not_configured", err.Error(), nil)
		return
	}
	if _, ok := err.(*fofaQuotaError); ok {
		writeProductError(w, 429, "fofa_quota_exceeded", "FOFA 配额耗尽或限流，当天请停止查询: "+err.Error(), nil)
		return
	}
	writeProductError(w, 502, "fofa_request_failed", err.Error(), nil)
}

// ---------- POST /api/sync/fofa/import ----------

type fofaImportReq struct {
	Query         string `json:"query"`          // FOFA 查询语句，如 domain="example.com"
	Size          int    `json:"size"`           // 返回/入库上限，默认 1000，最大 10000
	CompanyName   string `json:"company_name"`   // 入库归属企业；空 = 从 domain="x" 提取
	CreateCompany bool   `json:"create_company"` // 企业不存在时创建并写入资产范围
}

func (s *Server) fofaImport(w http.ResponseWriter, r *http.Request) {
	if s.pg(w) == nil {
		return
	}
	var body fofaImportReq
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Query) == "" {
		writeProductError(w, 400, "fofa_query_required", "query 不能为空", nil)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	fr, err := s.fofaSearch(ctx, body.Query, body.Size)
	if err != nil {
		fofaWriteErr(w, err)
		return
	}

	// 聚合:IP → 端口服务列表 + 绑定域名
	type ipAgg struct {
		ports   []db.PortService
		domains map[string]bool
	}
	agg := map[string]*ipAgg{}
	for _, row := range fr.Rows {
		cells := make([]string, 7)
		for i := 0; i < len(row) && i < 7; i++ {
			if v, ok := row[i].(string); ok {
				cells[i] = v
			}
		}
		host, ip, port, srv, protocol := cells[0], cells[1], cells[2], cells[4], cells[5]
		if ip == "" {
			continue
		}
		a := agg[ip]
		if a == nil {
			a = &ipAgg{domains: map[string]bool{}}
			agg[ip] = a
		}
		if h := hostDomain(host); h != "" {
			a.domains[h] = true
		}
		if p := atoiSafe(port); p > 0 {
			svc := strings.TrimSpace(srv)
			if svc == "" {
				svc = strings.TrimSpace(protocol)
			}
			a.ports = append(a.ports, db.PortService{Port: p, Service: svc})
		}
	}

	// 企业 + 范围（镜像 ScopeSentry 同步的做法:scope 认领域名类资产）
	as := s.m.Assets()
	companyName := strings.TrimSpace(body.CompanyName)
	if companyName == "" {
		companyName = fofaQueryRootDomain(body.Query)
	}
	var companies []string
	var errs []string
	var companyID int64
	if body.CreateCompany && companyName != "" {
		cs := as.Companies()
		var cerr error
		companyID, cerr = cs.UpsertByName(companyName)
		if cerr != nil {
			errs = append(errs, "企业 "+companyName+": "+cerr.Error())
		} else {
			companies = append(companies, companyName)
			if root := fofaQueryRootDomain(body.Query); root != "" {
				if _, _, _, aerr := cs.AddScope(companyID, []string{root}, "fofa:"+companyName); aerr != nil {
					// scope 写入失败不阻断导入,资产仍入库(仅自动认领缺位)。
					errs = append(errs, "scope "+root+": "+strings.Join(aerr, "; "))
				}
			}
		}
	}

	synced := map[string]int{"ip": 0, "port": 0}
	var importedIPs []string
	for ip, a := range agg {
		domains := make([]string, 0, len(a.domains))
		for d := range a.domains {
			domains = append(domains, d)
		}
		if _, uerr := as.UpsertIP(db.UpsertIPReq{IP: ip, BoundDomains: domains, OpenPorts: a.ports}); uerr != nil {
			errs = append(errs, "ip "+ip+": "+uerr.Error())
			continue
		}
		synced["ip"]++
		synced["port"] += len(a.ports)
		importedIPs = append(importedIPs, ip)
	}
	// IP 资产不走 domain scope 认领:用户指定了企业就显式归属(不覆盖已有 explicit)。
	if companyID > 0 && len(importedIPs) > 0 {
		if serr := as.SetIPCompany(companyID, importedIPs); serr != nil {
			errs = append(errs, "企业归属: "+serr.Error())
		}
	}
	writeJSON(w, 200, map[string]any{
		"synced":    synced,
		"companies": companies,
		"errors":    errs,
		"warnings":  []string{fmt.Sprintf("FOFA 命中 %d 条，返回 %d 条；本次消耗对应条数配额", fr.Size, len(fr.Rows))},
	})
}

// hostDomain 从 FOFA host 字段("https://a.b.c:8443" 或裸 host)提取域名，纯 IP 返回空。
func hostDomain(host string) string {
	h := strings.TrimPrefix(strings.TrimPrefix(host, "https://"), "http://")
	if i := strings.IndexByte(h, '/'); i >= 0 {
		h = h[:i]
	}
	if i := strings.LastIndexByte(h, ':'); i >= 0 && !strings.Contains(h, "]") {
		h = h[:i]
	}
	if h == "" || !strings.Contains(h, ".") {
		return ""
	}
	if isAllDigitsAndDots(h) {
		return ""
	}
	return strings.ToLower(h)
}

func isAllDigitsAndDots(s string) bool {
	for _, c := range s {
		if (c < '0' || c > '9') && c != '.' {
			return false
		}
	}
	return true
}

func atoiSafe(s string) int {
	n := 0
	for _, c := range strings.TrimSpace(s) {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
		if n > 65535 {
			return 0
		}
	}
	return n
}

// fofaQueryRootDomain 从 domain="example.com" 语法提取根域，供企业 scope 使用。
func fofaQueryRootDomain(q string) string {
	i := strings.Index(q, `domain="`)
	if i < 0 {
		return ""
	}
	rest := q[i+len(`domain="`):]
	if j := strings.IndexByte(rest, '"'); j > 0 {
		return rest[:j]
	}
	return ""
}
