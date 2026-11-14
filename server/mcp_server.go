package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

// 本文件实现 ARTEX 的 MCP 服务端：一个无状态的 Streamable HTTP 端点 /mcp，把
// mcp_server_tools.go 里的白名单工具暴露给外部智能体。只支持 initialize / ping /
// tools/list / tools/call，响应一律 application/json，不开 SSE、不维护会话。
//
// 鉴权只认访问令牌(Authorization: Bearer artex_mcp_...)。/mcp 不经过 HTTP Basic
// Auth 门，也不接受管理员 JWT：一个请求只有一个 Authorization 头，外部客户端无法
// 同时携带 Basic 凭证和 Bearer 令牌。

const (
	mcpEndpointPath = "/mcp"
	mcpMaxBodyBytes = 1 << 20
	mcpCallTimeout  = 2 * time.Minute
	mcpAuditArgsMax = 2000
	mcpAuditResMax  = 500
)

// Protocol revisions this server can speak, newest first. All of them are
// served identically because only the tools capability is implemented.
var mcpProtocolVersions = []string{"2025-06-18", "2025-03-26", "2024-11-05"}

// JSON-RPC error codes.
const (
	rpcParseError     = -32700
	rpcInvalidRequest = -32600
	rpcMethodNotFound = -32601
	rpcInvalidParams  = -32602
)

// mcpStore is the persistence the endpoint itself needs. *db.DB satisfies it.
type mcpStore interface {
	GetBool(key string, def bool) bool
	APITokenByHash(hash string) (*db.APIToken, error)
	TouchAPIToken(id int64) error
	InsertMCPAudit(e db.MCPAuditEntry) error
}

func (s *Server) mcpStore() mcpStore {
	if s.mcpStoreOverride != nil {
		return s.mcpStoreOverride
	}
	if s.m == nil || s.m.pg == nil {
		return nil
	}
	return s.m.pg
}

type mcpRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type mcpRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *mcpRPCError    `json:"error,omitempty"`
}

func writeMCPResult(w http.ResponseWriter, id json.RawMessage, result any) {
	writeJSON(w, http.StatusOK, mcpRPCResponse{JSONRPC: "2.0", ID: id, Result: result})
}

func writeMCPError(w http.ResponseWriter, status int, id json.RawMessage, code int, msg string) {
	if len(id) == 0 {
		id = json.RawMessage("null")
	}
	writeJSON(w, status, mcpRPCResponse{JSONRPC: "2.0", ID: id, Error: &mcpRPCError{Code: code, Message: msg}})
}

// mcpOriginAllowed rejects cross-origin browser requests (DNS rebinding and
// drive-by pages). Non-browser MCP clients send no Origin header.
func mcpOriginAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	return strings.EqualFold(u.Host, r.Host)
}

// mcpBearerToken reads the access token. Only the Authorization header is
// accepted: cookies and query strings would let a browser or a logged URL carry it.
func mcpBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

func mcpRemoteAddr(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (s *Server) serveMCP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	store := s.mcpStore()
	if store == nil || !store.GetBool(db.SettingMCPServerEnabled, false) {
		// Indistinguishable from an unknown path while the feature is off.
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if !mcpOriginAllowed(r) {
		writeErr(w, http.StatusForbidden, "origin not allowed")
		return
	}
	token, authErr := s.authenticateMCP(store, r)
	if authErr != "" {
		w.Header().Set("WWW-Authenticate", `Bearer realm="artex-mcp"`)
		writeErr(w, http.StatusUnauthorized, authErr)
		return
	}
	if r.Method != http.MethodPost {
		// No server-initiated stream and no session to delete.
		w.Header().Set("Allow", http.MethodPost)
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, mcpMaxBodyBytes))
	if err != nil {
		writeMCPError(w, http.StatusRequestEntityTooLarge, nil, rpcInvalidRequest, "request body too large")
		return
	}
	body = bytes.TrimSpace(body)
	if len(body) > 0 && body[0] == '[' {
		writeMCPError(w, http.StatusBadRequest, nil, rpcInvalidRequest, "batch requests are not supported")
		return
	}
	var req mcpRPCRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeMCPError(w, http.StatusBadRequest, nil, rpcParseError, "parse error")
		return
	}
	if req.JSONRPC != "2.0" {
		writeMCPError(w, http.StatusBadRequest, req.ID, rpcInvalidRequest, "jsonrpc must be \"2.0\"")
		return
	}
	// Notifications and client responses carry no id (or no method) and get no body.
	if len(req.ID) == 0 || bytes.Equal(req.ID, []byte("null")) || req.Method == "" {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	switch req.Method {
	case "initialize":
		var p struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(req.Params, &p)
		version := mcpProtocolVersions[0]
		for _, v := range mcpProtocolVersions {
			if v == p.ProtocolVersion {
				version = v
			}
		}
		writeMCPResult(w, req.ID, map[string]any{
			"protocolVersion": version,
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}},
			"serverInfo":      map[string]any{"name": "artex", "title": "ARTEX", "version": BuildVersion},
			"instructions":    mcpInstructions,
		})
	case "ping":
		writeMCPResult(w, req.ID, map[string]any{})
	case "tools/list":
		out := make([]map[string]any, 0)
		for _, tool := range s.mcpTools() {
			if !token.HasScope(tool.Scope) {
				continue
			}
			out = append(out, map[string]any{
				"name":        tool.Name,
				"description": tool.Description,
				"inputSchema": tool.Schema,
				"annotations": map[string]any{
					"readOnlyHint":    tool.Scope == db.APIScopeRead,
					"destructiveHint": false,
				},
			})
		}
		writeMCPResult(w, req.ID, map[string]any{"tools": out})
	case "tools/call":
		s.serveMCPToolCall(w, r, store, token, req)
	default:
		writeMCPError(w, http.StatusOK, req.ID, rpcMethodNotFound, "method not found: "+req.Method)
	}
}

// authenticateMCP resolves the bearer token. A non-empty message means reject.
func (s *Server) authenticateMCP(store mcpStore, r *http.Request) (*db.APIToken, string) {
	plaintext := mcpBearerToken(r)
	if plaintext == "" {
		return nil, "missing access token: send Authorization: Bearer <token>"
	}
	if !strings.HasPrefix(plaintext, db.APITokenPrefix) {
		return nil, "invalid access token"
	}
	token, err := store.APITokenByHash(db.HashAPIToken(plaintext))
	if err != nil {
		log.Printf("[mcp-server] 令牌查询失败: %v", err)
		return nil, "access token could not be verified"
	}
	if token == nil {
		return nil, "invalid access token"
	}
	if !token.Usable(time.Now()) {
		return nil, "access token revoked or expired"
	}
	if err := store.TouchAPIToken(token.ID); err != nil {
		log.Printf("[mcp-server] 更新令牌使用时间失败: %v", err)
	}
	return token, ""
}

func (s *Server) serveMCPToolCall(w http.ResponseWriter, r *http.Request, store mcpStore, token *db.APIToken, req mcpRPCRequest) {
	var p struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(req.Params, &p); err != nil || p.Name == "" {
		writeMCPError(w, http.StatusOK, req.ID, rpcInvalidParams, "params.name is required")
		return
	}
	var tool *mcpTool
	for _, candidate := range s.mcpTools() {
		if candidate.Name == p.Name {
			tool = &candidate
			break
		}
	}
	if tool == nil {
		writeMCPError(w, http.StatusOK, req.ID, rpcInvalidParams, "unknown tool: "+p.Name)
		return
	}
	args := bytes.TrimSpace(p.Arguments)
	if len(args) == 0 || bytes.Equal(args, []byte("null")) {
		args = []byte("{}")
	}
	start := time.Now()
	var result actool.Result
	switch {
	case !token.HasScope(tool.Scope):
		result = actool.Errorf(fmt.Sprintf("访问令牌没有 %s 权限，无法调用 %s", tool.Scope, tool.Name))
	case args[0] != '{':
		result = actool.Errorf("arguments 必须是 JSON 对象")
	default:
		result = s.runMCPTool(r.Context(), tool, token, args)
	}
	text := result.Flatten()
	if err := store.InsertMCPAudit(db.MCPAuditEntry{
		TokenID: token.ID, TokenName: token.Name, Tool: tool.Name,
		Args: truncateRunes(compactJSON(args), mcpAuditArgsMax), OK: !result.IsError,
		Result: truncateRunes(text, mcpAuditResMax), RemoteAddr: mcpRemoteAddr(r),
		DurationMS: time.Since(start).Milliseconds(),
	}); err != nil {
		log.Printf("[mcp-server] 审计写入失败(token=%d tool=%s): %v", token.ID, tool.Name, err)
	}
	writeMCPResult(w, req.ID, map[string]any{
		"content": []map[string]any{{"type": "text", "text": text}},
		"isError": result.IsError,
	})
}

// runMCPTool executes one tool with a deadline. A tool failure is reported to
// the caller as an isError result, never as a transport error.
func (s *Server) runMCPTool(ctx context.Context, tool *mcpTool, token *db.APIToken, args json.RawMessage) (result actool.Result) {
	ctx, cancel := context.WithTimeout(ctx, mcpCallTimeout)
	defer cancel()
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[mcp-server] 工具 %s panic: %v", tool.Name, rec)
			result = actool.Errorf("工具执行出错")
		}
	}()
	result, err := tool.Run(ctx, token, args)
	if err != nil {
		return actool.Errorf(err.Error())
	}
	return result
}

func compactJSON(raw []byte) string {
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		return string(raw)
	}
	return buf.String()
}

func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}

// --- admin API (JWT + optional Basic Auth, like every other /api route) ---

func (s *Server) getMCPServerSettings(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]any{
		"enabled":            pg.GetBool(db.SettingMCPServerEnabled, false),
		"path":               mcpEndpointPath,
		"basic_auth_enabled": s.basicAuth.snapshot().Enabled,
	})
}

func (s *Server) putMCPServerSettings(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if err := decode(r, &req); err != nil || req.Enabled == nil {
		writeErr(w, 400, "enabled 为必填")
		return
	}
	if err := pg.SetBool(db.SettingMCPServerEnabled, *req.Enabled); err != nil {
		writeErr(w, 500, "保存失败: "+err.Error())
		return
	}
	log.Printf("[mcp-server] MCP 服务端已%s", map[bool]string{true: "开启", false: "关闭"}[*req.Enabled])
	s.getMCPServerSettings(w, r)
}

func (s *Server) listMCPServerTokens(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	tokens, err := pg.ListAPITokens()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]any{"tokens": tokens})
}

func (s *Server) createMCPServerToken(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req struct {
		Name            string   `json:"name"`
		Scopes          []string `json:"scopes"`
		CompanyIDs      []int64  `json:"company_ids"`
		MaxActiveTasks  int      `json:"max_active_tasks"`
		MaxTasksPerHour int      `json:"max_tasks_per_hour"`
		ExpiresInDays   int      `json:"expires_in_days"` // 0 = 永不过期
	}
	if err := decode(r, &req); err != nil {
		writeErr(w, 400, "请求格式错误")
		return
	}
	if req.ExpiresInDays < 0 || req.ExpiresInDays > 3650 {
		writeErr(w, 400, "有效期必须在 0 到 3650 天之间")
		return
	}
	in := db.APITokenInput{
		Name: req.Name, Scopes: req.Scopes, CompanyIDs: req.CompanyIDs,
		MaxActiveTasks: req.MaxActiveTasks, MaxTasksPerHour: req.MaxTasksPerHour,
	}
	if req.ExpiresInDays > 0 {
		expires := time.Now().Add(time.Duration(req.ExpiresInDays) * 24 * time.Hour)
		in.ExpiresAt = &expires
	}
	in, err := db.NormalizeAPITokenInput(in)
	if err != nil {
		writeErr(w, 400, strings.TrimPrefix(err.Error(), db.ErrAPITokenInvalid.Error()+": "))
		return
	}
	for _, id := range in.CompanyIDs {
		if company, err := pg.Companies().GetCompany(id); err != nil || company == nil {
			writeErr(w, 400, fmt.Sprintf("企业 #%d 不存在", id))
			return
		}
	}
	token, plaintext, err := pg.CreateAPIToken(in)
	if err != nil {
		writeErr(w, 500, "创建失败: "+err.Error())
		return
	}
	log.Printf("[mcp-server] 新建访问令牌 #%d «%s» 权限=%v 企业=%v", token.ID, token.Name, token.Scopes, token.CompanyIDs)
	w.Header().Set("Cache-Control", "no-store")
	// The plaintext is returned exactly once; only its hash is stored.
	writeJSON(w, 201, map[string]any{"token": plaintext, "item": token})
}

func (s *Server) revokeMCPServerToken(w http.ResponseWriter, r *http.Request) {
	s.mutateMCPServerToken(w, r, "吊销", func(pg *db.DB, id int64) error { return pg.RevokeAPIToken(id) })
}

func (s *Server) deleteMCPServerToken(w http.ResponseWriter, r *http.Request) {
	s.mutateMCPServerToken(w, r, "删除", func(pg *db.DB, id int64) error { return pg.DeleteAPIToken(id) })
}

func (s *Server) mutateMCPServerToken(w http.ResponseWriter, r *http.Request, verb string, apply func(*db.DB, int64) error) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	id, ok := pathInt(r, "id")
	if !ok || id <= 0 {
		writeErr(w, 400, "令牌 id 无效")
		return
	}
	if err := apply(pg, id); err != nil {
		if errors.Is(err, db.ErrAPITokenNotFound) {
			writeErr(w, 404, "访问令牌不存在")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	log.Printf("[mcp-server] 访问令牌 #%d 已%s", id, verb)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) listMCPServerAudit(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	tokenID, _ := strconv.ParseInt(r.URL.Query().Get("token_id"), 10, 64)
	entries, err := pg.ListMCPAudit(tokenID, atoiDefault(r.URL.Query().Get("limit"), 100))
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"entries": entries})
}
