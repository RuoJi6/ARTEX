package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/mcphttp"
	"golang.org/x/crypto/bcrypt"
)

// mcpMemoryStore backs the endpoint without PostgreSQL.
type mcpMemoryStore struct {
	mu      sync.Mutex
	enabled bool
	tokens  map[string]*db.APIToken
	access  string // JSON stored under db.SettingMCPServerAccess
	touched []int64
	audit   []db.MCPAuditEntry
}

func (m *mcpMemoryStore) GetBool(key string, def bool) bool {
	if key == db.SettingMCPServerEnabled {
		return m.enabled
	}
	return def
}

func (m *mcpMemoryStore) GetSetting(key string) (string, bool, error) {
	if key == db.SettingMCPServerAccess && m.access != "" {
		return m.access, true, nil
	}
	return "", false, nil
}

func (m *mcpMemoryStore) APITokenByHash(hash string) (*db.APIToken, error) {
	return m.tokens[hash], nil
}

func (m *mcpMemoryStore) TouchAPIToken(id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.touched = append(m.touched, id)
	return nil
}

func (m *mcpMemoryStore) InsertMCPAudit(e db.MCPAuditEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.audit = append(m.audit, e)
	return nil
}

func (m *mcpMemoryStore) add(id int64, plaintext string, scopes ...string) *db.APIToken {
	token := &db.APIToken{ID: id, Name: "token-" + strconv.FormatInt(id, 10), Scopes: scopes}
	m.tokens[db.HashAPIToken(plaintext)] = token
	return token
}

const (
	mcpTestReadToken = db.APITokenPrefix + "read-only"
	mcpTestFullToken = db.APITokenPrefix + "full"
)

func mcpTestServer(t *testing.T) (*Server, *mcpMemoryStore) {
	t.Helper()
	store := &mcpMemoryStore{enabled: true, tokens: map[string]*db.APIToken{}}
	store.add(1, mcpTestReadToken, db.APIScopeRead)
	store.add(2, mcpTestFullToken, db.APIScopeRead, db.APIScopeTaskCreate, db.APIScopeTaskControl)
	s := &Server{jwtKey: []byte("test-only-signing-key-32-characters"), mcpStoreOverride: store}
	if err := s.basicAuth.load(&basicAuthMemoryStore{}); err != nil {
		t.Fatal(err)
	}
	return s, store
}

func mcpPost(s *Server, token, body string, headers ...string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, mcpEndpointPath, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		r.Header.Set(headers[i], headers[i+1])
	}
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	return w
}

type mcpTestResponse struct {
	ID     json.RawMessage `json:"id"`
	Result struct {
		ProtocolVersion string `json:"protocolVersion"`
		Tools           []struct {
			Name        string         `json:"name"`
			InputSchema map[string]any `json:"inputSchema"`
			Annotations struct {
				ReadOnlyHint bool `json:"readOnlyHint"`
			} `json:"annotations"`
		} `json:"tools"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	} `json:"result"`
	Error *mcpRPCError `json:"error"`
}

func decodeMCP(t *testing.T, w *httptest.ResponseRecorder) mcpTestResponse {
	t.Helper()
	var out mcpTestResponse
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", w.Body.String(), err)
	}
	return out
}

func TestMCPServerDisabledByDefault(t *testing.T) {
	s, store := mcpTestServer(t)
	store.enabled = false
	if w := mcpPost(s, mcpTestFullToken, `{"jsonrpc":"2.0","id":1,"method":"ping"}`); w.Code != http.StatusNotFound {
		t.Fatalf("disabled endpoint status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestMCPServerAuthentication(t *testing.T) {
	s, store := mcpTestServer(t)
	ping := `{"jsonrpc":"2.0","id":1,"method":"ping"}`
	past := time.Now().Add(-time.Minute)
	store.add(3, db.APITokenPrefix+"revoked", db.APIScopeRead).RevokedAt = &past
	store.add(4, db.APITokenPrefix+"expired", db.APIScopeRead).ExpiresAt = &past
	adminJWT, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	for name, token := range map[string]string{
		"missing": "", "unknown": db.APITokenPrefix + "nope", "revoked": db.APITokenPrefix + "revoked",
		"expired": db.APITokenPrefix + "expired", "admin jwt": adminJWT,
	} {
		w := mcpPost(s, token, ping)
		if w.Code != http.StatusUnauthorized || !strings.HasPrefix(w.Header().Get("WWW-Authenticate"), "Bearer") {
			t.Errorf("%s: status=%d challenge=%q", name, w.Code, w.Header().Get("WWW-Authenticate"))
		}
	}
	if w := mcpPost(s, mcpTestReadToken, ping); w.Code != http.StatusOK || decodeMCP(t, w).Error != nil {
		t.Fatalf("valid token status=%d body=%s", w.Code, w.Body.String())
	}
	if len(store.touched) != 1 || store.touched[0] != 1 {
		t.Fatalf("touched=%v, want only the valid token", store.touched)
	}
	// The token is accepted from the Authorization header only.
	r := httptest.NewRequest(http.MethodPost, mcpEndpointPath+"?token="+mcpTestReadToken, strings.NewReader(ping))
	r.AddCookie(&http.Cookie{Name: "artex_token", Value: mcpTestReadToken})
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("query/cookie token status=%d", w.Code)
	}
}

// /mcp must stay reachable with an access token while the Basic Auth gate is
// on, and Basic credentials must not open it.
func TestMCPServerBypassesBasicAuthGate(t *testing.T) {
	s, _ := mcpTestServer(t)
	hash, err := bcrypt.GenerateFromPassword([]byte("gate-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	s.basicAuth.cfg = basicAuthConfig{Enabled: true, Username: "gate", PasswordHash: string(hash), Revision: "r1"}

	health := httptest.NewRecorder()
	s.Handler().ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if health.Code != http.StatusUnauthorized || health.Header().Get("X-Artex-Auth") != "basic" {
		t.Fatalf("gate should still protect /api: status=%d", health.Code)
	}
	ping := `{"jsonrpc":"2.0","id":1,"method":"ping"}`
	if w := mcpPost(s, mcpTestReadToken, ping); w.Code != http.StatusOK {
		t.Fatalf("token behind gate status=%d body=%s", w.Code, w.Body.String())
	}
	r := httptest.NewRequest(http.MethodPost, mcpEndpointPath, strings.NewReader(ping))
	r.SetBasicAuth("gate", "gate-password")
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("basic credentials on /mcp status=%d, want 401", w.Code)
	}
}

func TestMCPServerTransportRules(t *testing.T) {
	s, _ := mcpTestServer(t)
	ping := `{"jsonrpc":"2.0","id":1,"method":"ping"}`
	if w := mcpPost(s, mcpTestReadToken, ping, "Origin", "https://evil.example"); w.Code != http.StatusForbidden {
		t.Fatalf("cross-origin status=%d", w.Code)
	}
	if w := mcpPost(s, mcpTestReadToken, ping, "Origin", "http://example.com"); w.Code != http.StatusOK {
		t.Fatalf("same-origin status=%d", w.Code)
	}
	if w := mcpPost(s, mcpTestReadToken, ping); w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("/mcp must not send CORS headers")
	}
	for _, method := range []string{http.MethodGet, http.MethodDelete} {
		r := httptest.NewRequest(method, mcpEndpointPath, nil)
		r.Header.Set("Authorization", "Bearer "+mcpTestReadToken)
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		if w.Code != http.StatusMethodNotAllowed || w.Header().Get("Allow") != http.MethodPost {
			t.Errorf("%s status=%d allow=%q", method, w.Code, w.Header().Get("Allow"))
		}
	}
	if w := mcpPost(s, mcpTestReadToken, `[`+ping+`]`); w.Code != http.StatusBadRequest || decodeMCP(t, w).Error.Code != rpcInvalidRequest {
		t.Fatalf("batch status=%d body=%s", w.Code, w.Body.String())
	}
	if w := mcpPost(s, mcpTestReadToken, `{not json`); w.Code != http.StatusBadRequest || decodeMCP(t, w).Error.Code != rpcParseError {
		t.Fatalf("bad json status=%d body=%s", w.Code, w.Body.String())
	}
	if w := mcpPost(s, mcpTestReadToken, `{"jsonrpc":"2.0","method":"notifications/initialized"}`); w.Code != http.StatusAccepted || w.Body.Len() != 0 {
		t.Fatalf("notification status=%d body=%q", w.Code, w.Body.String())
	}
	if out := decodeMCP(t, mcpPost(s, mcpTestReadToken, `{"jsonrpc":"2.0","id":"a","method":"resources/list"}`)); out.Error == nil || out.Error.Code != rpcMethodNotFound || string(out.ID) != `"a"` {
		t.Fatalf("unknown method: %+v", out)
	}
	if w := mcpPost(s, mcpTestReadToken, `{"jsonrpc":"2.0","id":1,"method":"ping","params":"`+strings.Repeat("x", mcpMaxBodyBytes)+`"}`); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized body status=%d", w.Code)
	}
}

// mcpPostFrom sends a ping from a given TCP peer with optional X-Forwarded-For.
func mcpPostFrom(s *Server, peer string, forwarded ...string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, mcpEndpointPath, strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"ping"}`))
	r.RemoteAddr = peer
	r.Header.Set("Authorization", "Bearer "+mcpTestReadToken)
	for _, value := range forwarded {
		r.Header.Add("X-Forwarded-For", value)
	}
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	return w
}

func TestMCPServerSourceAllowlist(t *testing.T) {
	s, store := mcpTestServer(t)
	// No allowlist: any source.
	if w := mcpPostFrom(s, "203.0.113.9:4000"); w.Code != http.StatusOK {
		t.Fatalf("no allowlist status=%d", w.Code)
	}

	store.access = `{"allowed_ips":["198.51.100.7","10.1.0.0/16","2001:db8::/32"]}`
	for peer, want := range map[string]int{
		"198.51.100.7:1":          http.StatusOK,
		"10.1.200.3:1":            http.StatusOK,
		"[2001:db8::5]:1":         http.StatusOK,
		"[::ffff:198.51.100.7]:1": http.StatusOK, // IPv4-mapped peer matches the IPv4 entry
		"198.51.100.8:1":          http.StatusForbidden,
		"10.2.0.1:1":              http.StatusForbidden,
		"[2001:db9::1]:1":         http.StatusForbidden,
		"not-an-address":          http.StatusForbidden,
	} {
		if w := mcpPostFrom(s, peer); w.Code != want {
			t.Errorf("peer %s status=%d want %d", peer, w.Code, want)
		}
	}
	// The allowlist is checked before the token: a blocked source gets 403
	// whether or not it holds a valid token, and the token is never touched.
	before := len(store.touched)
	r := httptest.NewRequest(http.MethodPost, mcpEndpointPath, strings.NewReader(`{}`))
	r.RemoteAddr = "198.51.100.8:1"
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "198.51.100.8") {
		t.Fatalf("blocked source without token status=%d body=%s", w.Code, w.Body.String())
	}
	mcpPostFrom(s, "198.51.100.8:1")
	if len(store.touched) != before {
		t.Fatal("token was looked up for a blocked source")
	}

	// Without a trusted proxy, X-Forwarded-For is ignored: it cannot be used to
	// claim an allowed address, and an allowed peer is not affected by it.
	if w := mcpPostFrom(s, "203.0.113.9:1", "198.51.100.7"); w.Code != http.StatusForbidden {
		t.Fatalf("spoofed X-Forwarded-For status=%d", w.Code)
	}
	if w := mcpPostFrom(s, "198.51.100.7:1", "203.0.113.9"); w.Code != http.StatusOK {
		t.Fatalf("allowed peer with foreign X-Forwarded-For status=%d", w.Code)
	}

	// Behind a trusted proxy the rightmost untrusted hop is the client.
	store.access = `{"allowed_ips":["198.51.100.7"],"trusted_proxies":["127.0.0.1","10.9.0.0/24"]}`
	for name, tc := range map[string]struct {
		peer      string
		forwarded []string
		want      int
	}{
		"client via proxy":               {"127.0.0.1:1", []string{"198.51.100.7"}, http.StatusOK},
		"other client via proxy":         {"127.0.0.1:1", []string{"203.0.113.9"}, http.StatusForbidden},
		"client forges leftmost entry":   {"127.0.0.1:1", []string{"198.51.100.7, 203.0.113.9"}, http.StatusForbidden},
		"two trusted proxies":            {"127.0.0.1:1", []string{"203.0.113.1, 198.51.100.7, 10.9.0.4"}, http.StatusOK},
		"header split across lines":      {"127.0.0.1:1", []string{"198.51.100.7", "10.9.0.4"}, http.StatusOK},
		"proxy sends no header":          {"127.0.0.1:1", nil, http.StatusForbidden},
		"malformed hop stops the chain":  {"127.0.0.1:1", []string{"198.51.100.7, garbage, 10.9.0.4"}, http.StatusForbidden},
		"untrusted peer ignores header":  {"203.0.113.9:1", []string{"198.51.100.7"}, http.StatusForbidden},
		"allowed client connects direct": {"198.51.100.7:1", nil, http.StatusOK},
	} {
		if w := mcpPostFrom(s, tc.peer, tc.forwarded...); w.Code != tc.want {
			t.Errorf("%s: status=%d want %d", name, w.Code, tc.want)
		}
	}

	// The audit records the resolved client, not the proxy.
	call := httptest.NewRequest(http.MethodPost, mcpEndpointPath, strings.NewReader(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"spawn_task","arguments":{"goal":"x"}}}`))
	call.RemoteAddr = "127.0.0.1:1"
	call.Header.Set("Authorization", "Bearer "+mcpTestReadToken)
	call.Header.Set("X-Forwarded-For", "198.51.100.7")
	s.Handler().ServeHTTP(httptest.NewRecorder(), call)
	if len(store.audit) != 1 || store.audit[0].RemoteAddr != "198.51.100.7" {
		t.Fatalf("audit=%+v", store.audit)
	}

	// A corrupt configuration refuses requests instead of opening the endpoint.
	store.access = `{"allowed_ips":["nonsense"]}`
	if w := mcpPostFrom(s, "198.51.100.7:1"); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("corrupt config status=%d", w.Code)
	}
}

func TestNormalizeMCPAccessConfig(t *testing.T) {
	cfg, _, err := normalizeMCPAccessConfig(mcpAccessConfig{
		AllowedIPs:     []string{" 10.0.0.5 ", "10.0.0.5/32", "192.168.1.77/24", "", "::ffff:1.2.3.4", "2001:DB8::1"},
		TrustedProxies: []string{"127.0.0.1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(cfg.AllowedIPs, " "); got != "10.0.0.5 192.168.1.0/24 1.2.3.4 2001:db8::1" {
		t.Fatalf("allowed=%q", got)
	}
	if len(cfg.TrustedProxies) != 1 || cfg.TrustedProxies[0] != "127.0.0.1" {
		t.Fatalf("proxies=%v", cfg.TrustedProxies)
	}
	for _, bad := range []string{"example.com", "10.0.0.1/33", "10.0.0", "1.2.3.4:80", "fe80::1%eth0/64"} {
		if _, _, err := normalizeMCPAccessConfig(mcpAccessConfig{AllowedIPs: []string{bad}}); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
	if _, _, err := normalizeMCPAccessConfig(mcpAccessConfig{TrustedProxies: []string{"bad"}}); err == nil || !strings.Contains(err.Error(), "可信代理") {
		t.Fatalf("proxy error=%v", err)
	}
	tooMany := make([]string, 0, maxMCPAccessEntries+1)
	for i := 0; i <= maxMCPAccessEntries; i++ {
		tooMany = append(tooMany, "10.0."+strconv.Itoa(i/256)+"."+strconv.Itoa(i%256))
	}
	if _, _, err := normalizeMCPAccessConfig(mcpAccessConfig{AllowedIPs: tooMany}); err == nil {
		t.Fatal("oversized list accepted")
	}
}

func TestMCPServerInitializeNegotiatesVersion(t *testing.T) {
	s, _ := mcpTestServer(t)
	for requested, want := range map[string]string{
		"2025-03-26": "2025-03-26", "2024-11-05": "2024-11-05", "1999-01-01": mcpProtocolVersions[0], "": mcpProtocolVersions[0],
	} {
		body := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"` + requested + `","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}`
		if got := decodeMCP(t, mcpPost(s, mcpTestReadToken, body)).Result.ProtocolVersion; got != want {
			t.Errorf("requested %q: got %q want %q", requested, got, want)
		}
	}
}

func TestMCPServerToolsFollowTokenScopes(t *testing.T) {
	s, store := mcpTestServer(t)
	list := `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
	names := func(token string) map[string]bool {
		out := map[string]bool{}
		for _, tool := range decodeMCP(t, mcpPost(s, token, list)).Result.Tools {
			if tool.InputSchema["type"] != "object" {
				t.Errorf("%s: inputSchema.type=%v", tool.Name, tool.InputSchema["type"])
			}
			out[tool.Name] = tool.Annotations.ReadOnlyHint
		}
		return out
	}
	read := names(mcpTestReadToken)
	for _, name := range []string{"list_tasks", "get_task", "get_task_graph", "list_task_findings", "list_companies", "list_task_categories", "list_llm_profiles"} {
		if readOnly, ok := read[name]; !ok || !readOnly {
			t.Errorf("read token: %s listed=%v readOnly=%v", name, ok, readOnly)
		}
	}
	for _, name := range []string{"spawn_task", "pause_task", "resume_task", "add_task_hint"} {
		if _, ok := read[name]; ok {
			t.Errorf("read token must not list %s", name)
		}
	}
	full := names(mcpTestFullToken)
	if len(full) != 11 || full["spawn_task"] || full["pause_task"] {
		t.Fatalf("full token tools=%v", full)
	}
	// Nothing that edits tools, skills, MCP servers, files or settings is exposed.
	for name := range full {
		for _, banned := range []string{"custom", "skill", "mcp", "workspace", "_file", "setting", "report", "create_", "update_", "delete_"} {
			if strings.Contains(name, banned) {
				t.Errorf("tool %s must not be exposed", name)
			}
		}
	}

	// A write tool called with a read-only token is refused and audited.
	call := `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"spawn_task","arguments":{"goal":"https://example.com"}}}`
	out := decodeMCP(t, mcpPost(s, mcpTestReadToken, call))
	if out.Error != nil || !out.Result.IsError || !strings.Contains(out.Result.Content[0].Text, db.APIScopeTaskCreate) {
		t.Fatalf("scope refusal: %+v", out)
	}
	if len(store.audit) != 1 || store.audit[0].OK || store.audit[0].Tool != "spawn_task" || store.audit[0].TokenID != 1 ||
		!strings.Contains(store.audit[0].Args, "example.com") {
		t.Fatalf("audit=%+v", store.audit)
	}
	unknown := `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_custom_tool","arguments":{}}}`
	if out := decodeMCP(t, mcpPost(s, mcpTestFullToken, unknown)); out.Error == nil || out.Error.Code != rpcInvalidParams {
		t.Fatalf("unknown tool: %+v", out)
	}
	if len(store.audit) != 1 {
		t.Fatalf("unknown tool must not be audited as a call: %+v", store.audit)
	}
}

func TestNormalizeAPITokenInput(t *testing.T) {
	past := time.Now().Add(-time.Hour)
	for name, in := range map[string]db.APITokenInput{
		"empty name":    {Scopes: []string{db.APIScopeRead}},
		"no scope":      {Name: "x"},
		"unknown scope": {Name: "x", Scopes: []string{"admin"}},
		"bad company":   {Name: "x", Scopes: []string{db.APIScopeRead}, CompanyIDs: []int64{0}},
		"bad limit":     {Name: "x", Scopes: []string{db.APIScopeRead}, MaxActiveTasks: -1},
		"past expiry":   {Name: "x", Scopes: []string{db.APIScopeRead}, ExpiresAt: &past},
	} {
		if _, err := db.NormalizeAPITokenInput(in); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	got, err := db.NormalizeAPITokenInput(db.APITokenInput{
		Name: "  my   bot ", Scopes: []string{db.APIScopeTaskCreate, db.APIScopeRead, db.APIScopeRead}, CompanyIDs: []int64{7, 3, 7},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "my bot" || strings.Join(got.Scopes, ",") != "read,task:create" || len(got.CompanyIDs) != 2 || got.CompanyIDs[0] != 3 {
		t.Fatalf("normalized=%+v", got)
	}
}

// mcpCallTool calls one tool through the repository's own MCP client.
func mcpCallTool(t *testing.T, c *mcphttp.Client, name string, args map[string]any, out any) (string, error) {
	t.Helper()
	text, err := c.Call(context.Background(), name, args)
	if err == nil && out != nil {
		if uerr := json.Unmarshal([]byte(text), out); uerr != nil {
			t.Fatalf("%s: decode %q: %v", name, text, uerr)
		}
	}
	return text, err
}

// End to end against PostgreSQL: admin API issues tokens, then the in-repo MCP
// client drives the endpoint through creation, quota, company restriction,
// control and revocation.
func TestMCPServerPostgresEndToEnd(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	defer restoreConcurrencySetting(t, m)()
	if err := m.SetConcurrency(false, defaultConcurrencyLimit); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{db.SettingMCPServerEnabled, db.SettingMCPServerAccess, basicAuthKey} {
		old, exists, err := m.pg.GetSetting(key)
		if err != nil {
			t.Fatal(err)
		}
		defer func(key, old string, exists bool) {
			if exists {
				_ = m.pg.SetSetting(key, old)
			} else {
				_, _ = m.pg.Exec("DELETE FROM settings WHERE key=$1", key)
			}
		}(key, old, exists)
	}
	if err := m.pg.SetSetting(basicAuthKey, `{"enabled":false}`); err != nil {
		t.Fatal(err)
	}
	// Start without a source allowlist whatever the database held before.
	if err := m.pg.SetSetting(db.SettingMCPServerAccess, `{}`); err != nil {
		t.Fatal(err)
	}
	s := newAdmissionTestServer(m, nil)
	s.jwtKey = []byte("test-only-signing-key-32-characters")
	m.SetTaskControlMutex(&s.concMu)
	if err := s.basicAuth.load(m.pg); err != nil {
		t.Fatal(err)
	}
	adminJWT, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	admin := func(method, path, body string, out any) int {
		t.Helper()
		req, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+adminJWT)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if out != nil {
			if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
				t.Fatalf("%s %s: decode: %v", method, path, err)
			}
		}
		return resp.StatusCode
	}
	suffix := strconv.FormatInt(time.Now().UnixNano(), 36)
	// Company scope attributes by registrable domain, so each company owns its own.
	inRoot, outRoot := "mcp-in-"+suffix+".com", "mcp-out-"+suffix+".org"
	inScope, outOfScope := "app."+inRoot, "app."+outRoot
	allowedID, _, _, _, _, err := m.pg.Companies().CreateCompanyWithScope("mcp-allowed-"+suffix, "", []db.ScopeInput{{Value: inRoot}}, "test")
	if err != nil {
		t.Fatal(err)
	}
	otherID, _, _, _, _, err := m.pg.Companies().CreateCompanyWithScope("mcp-other-"+suffix, "", []db.ScopeInput{{Value: outRoot}}, "test")
	if err != nil {
		t.Fatal(err)
	}
	var created []string
	var tokenIDs []int64
	defer func() {
		for _, id := range created {
			_, _ = m.DeleteTask(id, DeleteTaskOptions{})
		}
		for _, id := range tokenIDs {
			_ = m.pg.DeleteAPIToken(id)
			_, _ = m.pg.Exec(`DELETE FROM mcp_audit_log WHERE token_id=$1`, id)
		}
		_ = m.pg.Companies().DeleteCompany(allowedID)
		_ = m.pg.Companies().DeleteCompany(otherID)
	}()
	newToken := func(body string) (string, int64) {
		t.Helper()
		var out struct {
			Token string      `json:"token"`
			Item  db.APIToken `json:"item"`
		}
		if code := admin(http.MethodPost, "/api/mcp-server/tokens", body, &out); code != http.StatusCreated {
			t.Fatalf("create token status=%d", code)
		}
		tokenIDs = append(tokenIDs, out.Item.ID)
		return out.Token, out.Item.ID
	}
	connect := func(token string) (*mcphttp.Client, error) {
		return mcphttp.New(context.Background(), "artex", srv.URL+mcpEndpointPath, map[string]string{"Authorization": "Bearer " + token}, false)
	}

	// Disabled until an administrator turns it on.
	if code := admin(http.MethodPut, "/api/mcp-server/settings", `{"enabled":false}`, nil); code != http.StatusOK {
		t.Fatalf("disable status=%d", code)
	}
	fullToken, fullID := newToken(`{"name":"full","scopes":["read","task:create","task:control"],"max_tasks_per_hour":2}`)
	if !strings.HasPrefix(fullToken, db.APITokenPrefix) {
		t.Fatalf("token=%q", fullToken)
	}
	if _, err := connect(fullToken); err == nil {
		t.Fatal("connected while the MCP server is disabled")
	}
	if code := admin(http.MethodPut, "/api/mcp-server/settings", `{"enabled":true}`, nil); code != http.StatusOK {
		t.Fatalf("enable status=%d", code)
	}
	// The plaintext is never stored or listed again.
	var listed struct {
		Tokens []map[string]any `json:"tokens"`
	}
	admin(http.MethodGet, "/api/mcp-server/tokens", "", &listed)
	raw, _ := json.Marshal(listed)
	if strings.Contains(string(raw), fullToken) || strings.Contains(string(raw), db.HashAPIToken(fullToken)) {
		t.Fatal("token list leaks the token or its hash")
	}
	if code := admin(http.MethodPost, "/api/mcp-server/tokens", `{"name":"bad","scopes":["read"],"company_ids":[999999999]}`, nil); code != http.StatusBadRequest {
		t.Fatalf("unknown company status=%d", code)
	}

	full, err := connect(fullToken)
	if err != nil {
		t.Fatal(err)
	}
	defer full.Close()
	tools, err := full.Tools(context.Background())
	if err != nil || len(tools) != 11 {
		t.Fatalf("tools=%d err=%v", len(tools), err)
	}

	type spawned struct {
		TaskID string `json:"task_id"`
		Status string `json:"status"`
	}
	spawn := func(c *mcphttp.Client, args map[string]any) (spawned, error) {
		var out spawned
		_, err := mcpCallTool(t, c, "spawn_task", args, &out)
		if err == nil {
			created = append(created, out.TaskID)
		}
		return out, err
	}
	parent, err := spawn(full, map[string]any{"description": "mcp parent " + suffix, "goal": "测试 https://" + inScope, "company_ids": []int64{allowedID}})
	if err != nil || parent.TaskID == "" {
		t.Fatalf("spawn parent: %+v err=%v", parent, err)
	}
	child, err := spawn(full, map[string]any{"description": "mcp child " + suffix, "goal": "测试 https://" + outOfScope, "parent_ref": parent.TaskID})
	if err != nil {
		t.Fatalf("spawn child: %v", err)
	}
	if _, err := spawn(full, map[string]any{"goal": "third task"}); err == nil || !strings.Contains(err.Error(), "每小时") {
		t.Fatalf("hourly quota not enforced: %v", err)
	}
	if _, err := spawn(full, map[string]any{"goal": "x", "company_ids": []int64{999999999}}); err == nil {
		t.Fatal("unknown company accepted")
	}

	var task map[string]any
	if _, err := mcpCallTool(t, full, "get_task", map[string]any{"task_id": child.TaskID}, &task); err != nil {
		t.Fatal(err)
	}
	if task["parent_ref"] != parent.TaskID || task["id"] != child.TaskID {
		t.Fatalf("get_task=%v", task)
	}
	stored, ok := m.Task(parent.TaskID)
	if !ok || !strings.Contains(stored.lifecycleSnapshot().Remark, "full") {
		t.Fatalf("task remark does not name the token: %+v", stored)
	}

	var tasks struct {
		Tasks []map[string]any `json:"tasks"`
		Total int              `json:"total"`
	}
	if _, err := mcpCallTool(t, full, "list_tasks", map[string]any{"company_id": allowedID}, &tasks); err != nil {
		t.Fatal(err)
	}
	if tasks.Total != 1 || tasks.Tasks[0]["id"] != parent.TaskID {
		t.Fatalf("list_tasks by company=%+v", tasks)
	}

	// pause → paused, resume → running again, hint accepted.
	var control spawned
	if _, err := mcpCallTool(t, full, "pause_task", map[string]any{"task_id": parent.TaskID}, &control); err != nil || control.Status != "paused" {
		t.Fatalf("pause: %+v err=%v", control, err)
	}
	if _, err := mcpCallTool(t, full, "get_task", map[string]any{"task_id": parent.TaskID}, &task); err != nil || task["status"] != "paused" {
		t.Fatalf("status after pause=%v err=%v", task["status"], err)
	}
	if _, err := mcpCallTool(t, full, "resume_task", map[string]any{"task_id": parent.TaskID}, &control); err != nil || control.Status == "paused" {
		t.Fatalf("resume: %+v err=%v", control, err)
	}
	if _, err := mcpCallTool(t, full, "add_task_hint", map[string]any{"task_id": parent.TaskID, "text": "重点看登录接口"}, nil); err != nil {
		t.Fatalf("add_task_hint: %v", err)
	}
	if _, err := mcpCallTool(t, full, "add_task_hint", map[string]any{"task_id": parent.TaskID}, nil); err == nil {
		t.Fatal("empty hint accepted")
	}
	for _, name := range []string{"get_task_graph", "list_task_findings"} {
		if _, err := mcpCallTool(t, full, name, map[string]any{"task_id": parent.TaskID}, nil); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	for _, name := range []string{"list_companies", "list_task_categories", "list_llm_profiles"} {
		if _, err := mcpCallTool(t, full, name, map[string]any{}, nil); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}

	// A company-restricted token sees and controls only that company's tasks.
	scopedToken, _ := newToken(`{"name":"scoped","scopes":["read","task:create","task:control"],"company_ids":[` + strconv.FormatInt(allowedID, 10) + `],"max_active_tasks":1}`)
	scoped, err := connect(scopedToken)
	if err != nil {
		t.Fatal(err)
	}
	defer scoped.Close()
	if _, err := mcpCallTool(t, scoped, "list_tasks", map[string]any{}, &tasks); err != nil {
		t.Fatal(err)
	}
	for _, row := range tasks.Tasks {
		if row["id"] == child.TaskID {
			t.Fatal("restricted token lists a task outside its companies")
		}
	}
	for _, name := range []string{"get_task", "pause_task", "list_task_findings"} {
		if _, err := mcpCallTool(t, scoped, name, map[string]any{"task_id": child.TaskID}, nil); err == nil || !strings.Contains(err.Error(), "不存在") {
			t.Errorf("%s on hidden task: %v", name, err)
		}
	}
	var companies struct {
		Companies []map[string]any `json:"companies"`
	}
	if _, err := mcpCallTool(t, scoped, "list_companies", map[string]any{}, &companies); err != nil || len(companies.Companies) != 1 {
		t.Fatalf("restricted list_companies=%+v err=%v", companies, err)
	}
	for name, args := range map[string]map[string]any{
		"no company":       {"goal": "测试 https://" + inScope},
		"other company":    {"goal": "测试 https://" + inScope, "company_ids": []int64{otherID}},
		"target elsewhere": {"goal": "测试 https://" + outOfScope, "company_ids": []int64{allowedID}},
		"hidden parent":    {"goal": "测试 https://" + inScope, "company_ids": []int64{allowedID}, "parent_ref": child.TaskID},
	} {
		if _, err := spawn(scoped, args); err == nil {
			t.Errorf("restricted token: %s accepted", name)
		}
	}
	if _, err := spawn(scoped, map[string]any{"goal": "测试 https://" + inScope, "company_ids": []int64{allowedID}}); err != nil {
		t.Fatalf("restricted spawn in scope: %v", err)
	}
	if _, err := spawn(scoped, map[string]any{"goal": "测试 https://" + inScope, "company_ids": []int64{allowedID}}); err == nil || !strings.Contains(err.Error(), "尚未结束") {
		t.Fatalf("active-task quota not enforced: %v", err)
	}

	// Source allowlist through the admin API: the test client is on loopback.
	var settings struct {
		AllowedIPs []string `json:"allowed_ips"`
		ClientIP   string   `json:"client_ip"`
	}
	if code := admin(http.MethodPut, "/api/mcp-server/settings", `{"allowed_ips":["not-an-ip"]}`, nil); code != http.StatusBadRequest {
		t.Fatalf("invalid allowlist status=%d", code)
	}
	if code := admin(http.MethodPut, "/api/mcp-server/settings", `{"allowed_ips":["203.0.113.0/24"]}`, &settings); code != http.StatusOK ||
		len(settings.AllowedIPs) != 1 || settings.ClientIP != "127.0.0.1" {
		t.Fatalf("set allowlist status=%d settings=%+v", code, settings)
	}
	if _, err := mcpCallTool(t, full, "list_tasks", map[string]any{}, nil); err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("source outside the allowlist still works: %v", err)
	}
	if code := admin(http.MethodPut, "/api/mcp-server/settings", `{"allowed_ips":["203.0.113.0/24","127.0.0.1"]}`, nil); code != http.StatusOK {
		t.Fatalf("extend allowlist status=%d", code)
	}
	if _, err := mcpCallTool(t, full, "list_tasks", map[string]any{}, nil); err != nil {
		t.Fatalf("allowed source rejected: %v", err)
	}
	if code := admin(http.MethodPut, "/api/mcp-server/settings", `{"allowed_ips":[]}`, &settings); code != http.StatusOK || len(settings.AllowedIPs) != 0 {
		t.Fatalf("clear allowlist status=%d settings=%+v", code, settings)
	}

	// Every call above was audited, refusals included.
	var audit struct {
		Entries []db.MCPAuditEntry `json:"entries"`
	}
	admin(http.MethodGet, "/api/mcp-server/audit?token_id="+strconv.FormatInt(fullID, 10)+"&limit=500", "", &audit)
	seen, refused := map[string]bool{}, 0
	for _, entry := range audit.Entries {
		seen[entry.Tool] = true
		if !entry.OK {
			refused++
		}
	}
	if !seen["spawn_task"] || !seen["pause_task"] || !seen["get_task"] || refused < 3 {
		t.Fatalf("audit tools=%v refused=%d", seen, refused)
	}

	// Revocation takes effect on the very next request.
	if code := admin(http.MethodPost, "/api/mcp-server/tokens/"+strconv.FormatInt(fullID, 10)+"/revoke", "", nil); code != http.StatusOK {
		t.Fatalf("revoke status=%d", code)
	}
	if _, err := mcpCallTool(t, full, "list_tasks", map[string]any{}, nil); err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("revoked token still works: %v", err)
	}
	if code := admin(http.MethodDelete, "/api/mcp-server/tokens/"+strconv.FormatInt(fullID, 10), "", nil); code != http.StatusOK {
		t.Fatalf("delete status=%d", code)
	}
	if code := admin(http.MethodDelete, "/api/mcp-server/tokens/"+strconv.FormatInt(fullID, 10), "", nil); code != http.StatusNotFound {
		t.Fatalf("second delete status=%d", code)
	}
}
