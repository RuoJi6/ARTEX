package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/Autumn-27/artex/agent"
)

func TestOutputLanguageSettings(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	previous, existed, err := m.pg.GetSetting(settingOutputLanguage)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if existed {
			_ = m.pg.SetSetting(settingOutputLanguage, previous)
		} else {
			_, _ = m.pg.Exec("DELETE FROM settings WHERE key=$1", settingOutputLanguage)
		}
	}()
	if _, err := m.pg.Exec("DELETE FROM settings WHERE key=$1", settingOutputLanguage); err != nil {
		t.Fatal(err)
	}
	oldLanguage := agent.OutputLanguage
	t.Cleanup(func() { agent.OutputLanguage = oldLanguage })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	dir := t.TempDir()
	s := New(ctx, m, dir, dir, dir)
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	handler := s.Handler()
	request := func(method, body string, authenticated bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/api/settings", bytes.NewBufferString(body))
		if authenticated {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		return rr
	}
	for _, method := range []string{"GET", "PUT"} {
		if rr := request(method, `{ "output_language": "en" }`, false); rr.Code != 401 {
			t.Fatalf("unauthenticated %s: %d", method, rr.Code)
		}
	}
	if s.outputLanguage() != "zh" || agent.OutputLanguage() != "zh" {
		t.Fatal("default is not Chinese")
	}
	promptSnapshot := func() string {
		t.Helper()
		var snapshot string
		if err := m.pg.QueryRow(`SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id)::text, '[]') FROM agent_prompts p`).Scan(&snapshot); err != nil {
			t.Fatal(err)
		}
		return snapshot
	}
	prompts := promptSnapshot()
	for _, language := range []string{"en", "zh", "en"} {
		rr := request("PUT", `{"output_language":"`+language+`"}`, true)
		if rr.Code != 200 {
			t.Fatalf("save %s: %d %s", language, rr.Code, rr.Body.String())
		}
		var response struct {
			Language string `json:"output_language"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil || response.Language != language {
			t.Fatalf("save response: %s %v", rr.Body.String(), err)
		}
		fresh := &Server{m: m}
		if fresh.outputLanguage() != language || agent.OutputLanguage() != language {
			t.Fatal("saved language not resolved")
		}
		if rr := request("PUT", `{}`, true); rr.Code != 200 || s.outputLanguage() != language {
			t.Fatal("omitted language reset setting")
		}
		if rr := request("GET", "", true); rr.Code != 200 || json.Unmarshal(rr.Body.Bytes(), &response) != nil || response.Language != language {
			t.Fatal("GET language mismatch")
		}
	}
	oldConstraint := m.pg.GetBool(settingConstraintsInjectPlanner, true)
	for _, value := range []string{`"fr"`, `""`, `"zh-CN"`, `42`} {
		body := `{"output_language":` + value + `,"constraints_inject_planner":false}`
		if rr := request("PUT", body, true); rr.Code != 400 {
			t.Fatalf("invalid language accepted: %s", body)
		}
		if s.outputLanguage() != "en" || m.pg.GetBool(settingConstraintsInjectPlanner, true) != oldConstraint {
			t.Fatal("invalid request changed settings")
		}
	}
	if promptSnapshot() != prompts {
		t.Fatal("language save changed prompt history")
	}
	// A read-only database transaction forces the real save to fail without
	// closing the shared connection or altering the deployment database.
	m.pg.SetMaxOpenConns(1)
	if _, err := m.pg.Exec(`SET default_transaction_read_only = on`); err != nil {
		t.Fatal(err)
	}
	defer m.pg.Exec(`SET default_transaction_read_only = off`)
	if rr := request("PUT", `{"output_language":"zh"}`, true); rr.Code != 500 {
		t.Fatalf("failed save status: %d", rr.Code)
	}
	if s.outputLanguage() != "en" {
		t.Fatal("failed save changed effective language")
	}
}
