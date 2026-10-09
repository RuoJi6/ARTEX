package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type basicAuthMemoryStore struct {
	raw string
	err error
}

func (m *basicAuthMemoryStore) GetSetting(string) (string, bool, error) {
	return m.raw, m.raw != "", m.err
}
func (m *basicAuthMemoryStore) SetSetting(_, value string) error {
	if m.err != nil {
		return m.err
	}
	m.raw = value
	return nil
}

func basicAuthTestServer(t *testing.T) (*Server, *basicAuthMemoryStore) {
	t.Helper()
	store := &basicAuthMemoryStore{}
	s := &Server{jwtKey: []byte("test-only-signing-key-32-characters")}
	if err := s.basicAuth.load(store); err != nil {
		t.Fatal(err)
	}
	return s, store
}

func saveBasicAuthForTest(s *Server, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	s.saveBasicAuthSettings(w, httptest.NewRequest("PUT", "/api/settings/basic-auth", strings.NewReader(body)))
	return w
}

func TestBasicAuthGate(t *testing.T) {
	s, _ := basicAuthTestServer(t)
	h := s.requireBasicAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/login", nil))
	if w.Code != 204 {
		t.Fatal("must default to disabled")
	}
	w = saveBasicAuthForTest(s, `{"enabled":true,"username":"entry","password":"密码:test-pass"}`)
	if w.Code != 200 {
		t.Fatalf("enable: %s", w.Body.String())
	}
	cookie := w.Result().Cookies()[0]
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/" {
		t.Fatalf("unsafe cookie: %+v", cookie)
	}
	if verifyJWT(cookie.Value, s.jwtKey) {
		t.Fatal("gate cookie accepted as admin JWT")
	}
	adminJWT, _ := signJWT(s.jwtKey)
	for _, tc := range []struct {
		name, path, user, pass, bearer string
		cookie                         *http.Cookie
		want                           int
	}{
		{name: "page challenge", path: "/", want: 401},
		{name: "login challenge", path: "/login", want: 401},
		{name: "asset challenge", path: "/_next/static/app.js", want: 401},
		{name: "auth API challenge", path: "/api/auth/status", want: 401},
		{name: "check challenge", path: "/api/basic-auth/check", want: 401},
		{name: "health exempt", path: "/api/health", want: 204},
		{name: "health prefix not exempt", path: "/api/health/anything", want: 401},
		{name: "wrong password", path: "/login", user: "entry", pass: "wrong", want: 401},
		{name: "wrong user", path: "/login", user: "wrong", pass: "密码:test-pass", want: 401},
		{name: "correct Unicode credentials", path: "/login", user: "entry", pass: "密码:test-pass", want: 204},
		{name: "gate cookie and bearer", path: "/api/tasks", cookie: cookie, bearer: adminJWT, want: 204},
		{name: "admin JWT cannot bypass gate", path: "/api/tasks", bearer: adminJWT, want: 401},
		{name: "tampered cookie", path: "/login", cookie: &http.Cookie{Name: basicAuthCookie, Value: cookie.Value + "x"}, want: 401},
		{name: "admin JWT is not gate cookie", path: "/login", cookie: &http.Cookie{Name: basicAuthCookie, Value: adminJWT}, want: 401},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", tc.path, nil)
			if tc.user != "" {
				r.SetBasicAuth(tc.user, tc.pass)
			}
			if tc.cookie != nil {
				r.AddCookie(tc.cookie)
			}
			if tc.bearer != "" {
				r.Header.Set("Authorization", "Bearer "+tc.bearer)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status=%d want %d: %s", w.Code, tc.want, w.Body.String())
			}
			if w.Code == 401 && w.Header().Get("WWW-Authenticate") != `Basic realm="ARTEX", charset="UTF-8"` {
				t.Fatal("missing browser challenge")
			}
		})
	}
	// Passing the outer gate must not grant access to the inner admin API.
	r := httptest.NewRequest("GET", "/api/settings/basic-auth", nil)
	r.AddCookie(cookie)
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatal("gate cookie bypassed admin authentication")
	}
	r.Header.Set("Authorization", "Bearer "+adminJWT)
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("gate + JWT rejected: %s", w.Body.String())
	}
}

func TestBasicAuthSettingsPersistenceAndRevocation(t *testing.T) {
	s, store := basicAuthTestServer(t)
	w := saveBasicAuthForTest(s, `{"enabled":true,"username":"entry","password":"test-pass"}`)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	oldCookie := w.Result().Cookies()[0]
	before := s.basicAuth.snapshot()
	if strings.Contains(w.Body.String(), "password_hash") || strings.Contains(store.raw, "test-pass") {
		t.Fatal("password leaked")
	}
	if bcrypt.CompareHashAndPassword([]byte(before.PasswordHash), []byte("test-pass")) != nil {
		t.Fatal("password not hashed")
	}
	var restarted basicAuthGate
	if err := restarted.load(store); err != nil || restarted.snapshot() != before {
		t.Fatalf("restart lost config: %v", err)
	}
	w = saveBasicAuthForTest(s, `{"enabled":false,"password":""}`)
	if w.Code != 200 || w.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("disable failed")
	}
	w = saveBasicAuthForTest(s, `{"enabled":true,"password":""}`)
	if w.Code != 200 || s.basicAuth.snapshot().PasswordHash != before.PasswordHash {
		t.Fatal("blank password must preserve hash")
	}
	r := httptest.NewRequest("GET", "/", nil)
	r.AddCookie(oldCookie)
	if s.validBasicAuthCookie(r, s.basicAuth.snapshot()) {
		t.Fatal("old cookie survived disable/re-enable")
	}
	cookie := w.Result().Cookies()[0]
	w = saveBasicAuthForTest(s, `{"username":"new-entry","password":"new-pass-123"}`)
	r = httptest.NewRequest("GET", "/", nil)
	r.AddCookie(cookie)
	if w.Code != 200 || s.validBasicAuthCookie(r, s.basicAuth.snapshot()) {
		t.Fatal("credential change did not revoke cookie")
	}
	before = s.basicAuth.snapshot()
	store.err = errors.New("DB unavailable")
	w = saveBasicAuthForTest(s, `{"enabled":false}`)
	if w.Code != 503 || s.basicAuth.snapshot() != before {
		t.Fatal("failed save changed live config")
	}
}

func TestBasicAuthValidationAndLoadFailures(t *testing.T) {
	s, _ := basicAuthTestServer(t)
	for _, body := range []string{
		`{"enabled":true}`, `{"enabled":true,"username":"entry"}`,
		`{"username":"bad:name"}`, `{"username":"bad\nname"}`, `{"password":"short"}`,
		`{"password":"` + strings.Repeat("a", 73) + `"}`, `not-json`,
	} {
		if w := saveBasicAuthForTest(s, body); w.Code != 400 {
			t.Fatalf("body=%s status=%d", body, w.Code)
		}
	}
	for _, store := range []*basicAuthMemoryStore{
		{err: errors.New("unavailable")}, {raw: `not-json`}, {raw: `{"enabled":true}`},
		{raw: `{"enabled":true,"username":"entry","revision":"v1","password_hash":"invalid"}`},
	} {
		var gate basicAuthGate
		if err := gate.load(store); err == nil {
			t.Fatal("invalid persisted config did not fail closed")
		}
	}
}

func TestBasicAuthExpiredCookieAndSecureFlag(t *testing.T) {
	s, _ := basicAuthTestServer(t)
	w := saveBasicAuthForTest(s, `{"enabled":true,"username":"entry","password":"test-pass"}`)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	cfg := s.basicAuth.snapshot()
	for _, expires := range []*jwt.NumericDate{nil, jwt.NewNumericDate(time.Now().Add(-time.Minute))} {
		token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
			Subject: cfg.Revision, Audience: jwt.ClaimStrings{"artex-basic-auth"}, ExpiresAt: expires,
		}).SignedString(s.basicAuthSigningKey())
		r := httptest.NewRequest("GET", "/", nil)
		r.AddCookie(&http.Cookie{Name: basicAuthCookie, Value: token})
		if s.validBasicAuthCookie(r, cfg) {
			t.Fatal("expired or unbounded cookie accepted")
		}
	}
	r := httptest.NewRequest("GET", "https://example.test/login", nil)
	w = httptest.NewRecorder()
	if err := s.setBasicAuthCookie(w, r, cfg); err != nil {
		t.Fatal(err)
	}
	if !w.Result().Cookies()[0].Secure {
		t.Fatal("HTTPS cookie is not Secure")
	}
	var public map[string]any
	w = httptest.NewRecorder()
	s.getBasicAuthSettings(w, r)
	if err := json.Unmarshal(w.Body.Bytes(), &public); err != nil {
		t.Fatal(err)
	}
	if len(public) != 3 || public["password_set"] != true {
		t.Fatalf("bad public settings: %v", public)
	}
}

func TestBasicAuthCORS(t *testing.T) {
	for _, tc := range []struct {
		origin      string
		credentials bool
	}{
		{"http://127.0.0.1:3000", true}, {"https://evil.test", false}, {"http://127.0.0.1.evil.test:3000", false},
	} {
		r := httptest.NewRequest("OPTIONS", "http://127.0.0.1:8787/api/settings/basic-auth", nil)
		r.Header.Set("Origin", tc.origin)
		w := httptest.NewRecorder()
		cors(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("preflight reached handler") })).ServeHTTP(w, r)
		if w.Code != 204 || (w.Header().Get("Access-Control-Allow-Credentials") == "true") != tc.credentials {
			t.Fatalf("unexpected CORS for %s: %v", tc.origin, w.Header())
		}
	}
}

func TestBasicAuthPostgresLoginFlow(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	for _, key := range []string{basicAuthKey, authPassKey} {
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
	hash, err := bcrypt.GenerateFromPassword([]byte("admin-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if err := m.pg.SetSetting(authPassKey, string(hash)); err != nil {
		t.Fatal(err)
	}
	s := &Server{m: m, jwtKey: []byte("test-only-signing-key-32-characters")}
	if err := s.basicAuth.load(m.pg); err != nil {
		t.Fatal(err)
	}
	adminJWT, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	body := `{"enabled":true,"username":"entry","password":"entry-password"}`
	r := httptest.NewRequest("PUT", "/api/settings/basic-auth", strings.NewReader(body))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != 401 || s.basicAuth.snapshot().Enabled {
		t.Fatal("unauthenticated settings write succeeded")
	}
	r = httptest.NewRequest("PUT", "/api/settings/basic-auth", strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+adminJWT)
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("save: %d %s", w.Code, w.Body.String())
	}

	restarted := &Server{m: m, jwtKey: s.jwtKey}
	if err := restarted.basicAuth.load(m.pg); err != nil {
		t.Fatal(err)
	}
	loginBody := `{"username":"ARTEX","password":"admin-password"}`
	r = httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(loginBody))
	w = httptest.NewRecorder()
	restarted.Handler().ServeHTTP(w, r)
	if w.Code != 401 || w.Header().Get("WWW-Authenticate") == "" {
		t.Fatal("login was not protected after restart")
	}
	r = httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(loginBody))
	r.SetBasicAuth("entry", "entry-password")
	w = httptest.NewRecorder()
	restarted.Handler().ServeHTTP(w, r)
	var login struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &login); err != nil || w.Code != 200 || !verifyJWT(login.Token, s.jwtKey) {
		t.Fatalf("Basic Auth + existing login failed: %d %s", w.Code, w.Body.String())
	}
	cookie := w.Result().Cookies()[0]
	r = httptest.NewRequest("PUT", "/api/settings/basic-auth", strings.NewReader(`{"enabled":false}`))
	r.AddCookie(cookie)
	r.Header.Set("Authorization", "Bearer "+login.Token)
	w = httptest.NewRecorder()
	restarted.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("disable with gate cookie and JWT: %d %s", w.Code, w.Body.String())
	}
}
