package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUpdateSettingsHTTPPersistence(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	old, existed, err := m.pg.GetSetting(updateSettingsKey)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if existed {
			m.pg.SetSetting(updateSettingsKey, old)
		} else {
			m.pg.Exec("DELETE FROM settings WHERE key=$1", updateSettingsKey)
		}
	}()
	m.pg.Exec("DELETE FROM settings WHERE key=$1", updateSettingsKey)
	dir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := New(ctx, m, dir, dir, dir)
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	handler := s.Handler()
	request := func(method, body string, authenticated bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/api/update/settings", bytes.NewBufferString(body))
		if authenticated {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		return res
	}
	for _, method := range []string{"GET", "PUT"} {
		if r := request(method, `{}`, false); r.Code != http.StatusUnauthorized {
			t.Fatalf("unauthenticated %s: %d", method, r.Code)
		}
	}
	if cfg, err := s.loadUpdateSettings(); err != nil || cfg.Proxy != "" {
		t.Fatalf("default: %+v %v", cfg, err)
	}
	for _, body := range []string{`{"proxy":"127.0.0.1:7897"}`, `{"proxy":"http://proxy:65536"}`, `{`} {
		if r := request("PUT", body, true); r.Code != 400 {
			t.Fatalf("invalid setting accepted: %d %s", r.Code, r.Body.String())
		}
	}
	m.mu.Lock()
	m.globalProxy = "http://127.0.0.1:1"
	m.mu.Unlock()
	originalGlobal := m.GlobalProxy()
	for _, proxy := range []string{" http://127.0.0.1:7897 ", ""} {
		body, _ := json.Marshal(updateSettings{Proxy: proxy})
		if r := request("PUT", string(body), true); r.Code != 200 {
			t.Fatalf("save: %d %s", r.Code, r.Body.String())
		}
		// Read through a fresh Server to prove the setting comes from the DB.
		fresh := &Server{m: m}
		cfg, err := fresh.loadUpdateSettings()
		if err != nil || cfg.Proxy != strings.TrimSpace(proxy) {
			t.Fatalf("reload: %+v %v", cfg, err)
		}
		r := request("GET", "", true)
		if r.Code != 200 {
			t.Fatalf("GET settings: %d", r.Code)
		}
		want := cfg
		var got updateSettings
		if err := json.Unmarshal(r.Body.Bytes(), &got); err != nil || got != want {
			t.Fatalf("GET: %+v %v", got, err)
		}
		client, effective, err := fresh.updateClient()
		if err != nil {
			t.Fatal(err)
		}
		defer client.CloseIdleConnections()
		if proxy != "" && effective != "http://127.0.0.1:7897" {
			t.Fatalf("proxy not normalized: %q", effective)
		}
		if proxy == "" && client.Transport.(*http.Transport).Proxy != nil {
			t.Fatal("direct inherited proxy")
		}
		if m.GlobalProxy() != originalGlobal {
			t.Fatal("update setting changed global proxy")
		}
	}
}
