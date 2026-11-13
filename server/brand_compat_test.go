package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestRenamedAuthCookies(t *testing.T) {
	for _, name := range []string{"mysterysecurityteam_token", "artex_token"} {
		r := httptest.NewRequest("GET", "/api/version", nil)
		r.AddCookie(&http.Cookie{Name: name, Value: "existing-session"})
		if got := extractToken(r); got != "existing-session" {
			t.Fatalf("%s: got %q", name, got)
		}
	}
	r := httptest.NewRequest("GET", "/api/version?token=query", nil)
	r.AddCookie(&http.Cookie{Name: "artex_token", Value: "old"})
	r.AddCookie(&http.Cookie{Name: "mysterysecurityteam_token", Value: "new"})
	if got := extractToken(r); got != "new" {
		t.Fatalf("new cookie must take precedence: %q", got)
	}
	r.Header.Set("Authorization", "Bearer header")
	if got := extractToken(r); got != "header" {
		t.Fatalf("bearer must take precedence: %q", got)
	}
}

func TestRenamedLoginAcceptsLegacyUsername(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	original, _, err := m.pg.GetSetting(authPassKey)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.pg.SetSetting(authPassKey, original) })
	hash, err := bcrypt.GenerateFromPassword([]byte("rename-test-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if err := m.pg.SetSetting(authPassKey, string(hash)); err != nil {
		t.Fatal(err)
	}
	s := &Server{m: m, jwtKey: []byte("rename-test-signing-key")}
	for _, username := range []string{"MysterySecurityTeam", "ARTEX", "invalid-user"} {
		body, _ := json.Marshal(map[string]string{"username": username, "password": "rename-test-password"})
		w := httptest.NewRecorder()
		s.authLogin(w, httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(string(body))))
		want := http.StatusOK
		if username == "invalid-user" {
			want = http.StatusUnauthorized
		}
		if w.Code != want {
			t.Fatalf("%s: status %d, body %s", username, w.Code, w.Body.String())
		}
	}
}
