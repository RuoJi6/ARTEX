package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestOutputLanguageForLocale(t *testing.T) {
	cases := map[string]string{
		"en": "en", "en-US": "en", "EN-gb": "en", " en ": "en",
		"zh-CN": "zh", "zh": "zh", "": "zh", "fr-FR": "zh",
	}
	for in, want := range cases {
		if got := outputLanguageForLocale(in); got != want {
			t.Errorf("outputLanguageForLocale(%q) = %q, want %q", in, got, want)
		}
	}
}

// The web client sends X-Artex-Locale on every /api call, so CORS preflight must
// allow it or split frontend/backend deploys break.
func TestCORSAllowsLocaleHeader(t *testing.T) {
	r := httptest.NewRequest(http.MethodOptions, "http://127.0.0.1:8787/api/tasks", nil)
	r.Header.Set("Origin", "http://127.0.0.1:3000")
	r.Header.Set("Access-Control-Request-Method", "POST")
	r.Header.Set("Access-Control-Request-Headers", "content-type,x-artex-locale")
	w := httptest.NewRecorder()
	cors(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("preflight reached handler") })).ServeHTTP(w, r)
	allowed := strings.ToLower(w.Header().Get("Access-Control-Allow-Headers"))
	if w.Code != http.StatusNoContent || !strings.Contains(allowed, "x-artex-locale") {
		t.Fatalf("preflight code=%d allow-headers=%q", w.Code, allowed)
	}
}

// An explicit output_language in the body wins over X-Artex-Locale; an empty or
// omitted one falls back to the header.
func TestCreateOutputLanguagePrecedence(t *testing.T) {
	cases := []struct{ body, header, want string }{
		{"en", "zh-CN", "en"},
		{"zh", "en", "zh"},
		{" EN ", "", "en"},
		{"", "en-US", "en"},
		{"  ", "en", "en"},
		{"", "zh-CN", "zh"},
		{"", "", "zh"},
		{"fr", "en", "zh"}, // explicit but unsupported: normalized, header not consulted
	}
	for _, tc := range cases {
		if got := createOutputLanguage(tc.body, tc.header); got != tc.want {
			t.Errorf("createOutputLanguage(%q, %q) = %q, want %q", tc.body, tc.header, got, tc.want)
		}
	}
}

func TestSpawnOutputLanguage(t *testing.T) {
	en := &Task{OutputLanguage: "en"}
	zh := &Task{OutputLanguage: "zh"}
	cases := []struct {
		explicit string
		parent   *Task
		want     string
	}{
		{"en", nil, "en"},
		{"zh", en, "zh"},
		{"", en, "en"},
		{"", zh, "zh"},
		{"", &Task{}, "zh"},
		{"", nil, "zh"},
	}
	for _, tc := range cases {
		if got := spawnOutputLanguage(tc.explicit, tc.parent); got != tc.want {
			t.Errorf("spawnOutputLanguage(%q, %+v) = %q, want %q", tc.explicit, tc.parent, got, tc.want)
		}
	}
}

// Both spawn_task tools (orchestration agent and MCP) advertise output_language.
func TestSpawnTaskSchemasExposeOutputLanguage(t *testing.T) {
	s := &Server{}
	tool := s.toolSpawnTask()
	raw, _ := json.Marshal(tool.InputSchema())
	if !strings.Contains(string(raw), `"output_language"`) {
		t.Errorf("orchestration spawn_task schema lacks output_language: %s", raw)
	}
	found := false
	for _, mt := range s.mcpTools() {
		if mt.Name != "spawn_task" {
			continue
		}
		found = true
		raw, _ := json.Marshal(mt.Schema)
		if !strings.Contains(string(raw), `"output_language"`) {
			t.Errorf("MCP spawn_task schema lacks output_language: %s", raw)
		}
	}
	if !found {
		t.Fatal("MCP spawn_task not registered")
	}
}

// End to end through POST /api/tasks: the returned TaskDTO carries the resolved
// language for each body/header combination.
func TestCreateTaskHTTPOutputLanguage(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())
	defer func() { cancel(); s.Close() }()
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, bodyLang, header, want string
	}{
		{"body wins over header", "en", "zh-CN", "en"},
		{"body zh wins over en header", "zh", "en", "zh"},
		{"omitted falls back to header", "", "en", "en"},
		{"no body no header", "", "", "zh"},
	}
	for _, tc := range cases {
		payload := map[string]any{"description": "output language " + tc.name, "goal": "goal"}
		if tc.bodyLang != "" {
			payload["output_language"] = tc.bodyLang
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/tasks", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		if tc.header != "" {
			req.Header.Set(localeHeader, tc.header)
		}
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("%s: status %d: %s", tc.name, rec.Code, rec.Body.String())
		}
		var dto struct {
			ID             string `json:"id"`
			OutputLanguage string `json:"output_language"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &dto); err != nil {
			t.Fatal(err)
		}
		if id, err := strconv.ParseInt(dto.ID, 10, 64); err == nil {
			defer m.pg.DeleteTask(id)
		}
		if dto.OutputLanguage != tc.want {
			t.Errorf("%s: output_language = %q, want %q", tc.name, dto.OutputLanguage, tc.want)
		}
	}
}
