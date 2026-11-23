package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGeminiModelListAndConnectionEndpoints(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-goog-api-key") != "AIza-test-key" {
			t.Errorf("missing x-goog-api-key header: %q", r.Header.Get("x-goog-api-key"))
		}
		switch r.URL.Path {
		case "/v1beta/models":
			if r.Method != http.MethodGet {
				t.Errorf("models must use GET, got %s", r.Method)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[
				{"name":"models/gemini-2.5-pro","supportedGenerationMethods":["generateContent","countTokens"]},
				{"name":"models/text-embedding-004","supportedGenerationMethods":["embedContent"]},
				{"name":"models/gemini-2.5-flash","supportedGenerationMethods":["generateContent"]}
			]}`))
		case "/v1beta/models/gemini-2.5-pro:streamGenerateContent":
			if r.URL.Query().Get("alt") != "sse" {
				t.Errorf("missing alt=sse query, got %q", r.URL.RawQuery)
			}
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"OK\"}]},\"finishReason\":\"STOP\"}]}\n\n")
		case "/v1/models/gemini-2.5-pro:generateContent":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"candidates":[{"content":{"role":"model","parts":[{"text":"OK"}]},"finishReason":"STOP"}]}`)
		default:
			t.Errorf("unexpected URL %s", r.URL.RequestURI())
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	s := &Server{}

	t.Run("models", func(t *testing.T) {
		// Bare URL without /v1beta should auto-append /v1beta and filter to generateContent models.
		payload, _ := json.Marshal(map[string]any{
			"provider": "gemini",
			"base_url": upstream.URL,
			"api_key":  "AIza-test-key",
		})
		w := httptest.NewRecorder()
		s.pgListModels(w, httptest.NewRequest(http.MethodPost, "/api/llm/models", strings.NewReader(string(payload))))
		var got struct {
			OK     bool     `json:"ok"`
			Models []string `json:"models"`
			Error  string   `json:"error"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || w.Code != 200 || !got.OK {
			t.Fatalf("response=%d %s err=%v", w.Code, w.Body, err)
		}
		if strings.Join(got.Models, ",") != "gemini-2.5-pro,gemini-2.5-flash" {
			t.Fatalf("models=%v, want [gemini-2.5-pro gemini-2.5-flash]", got.Models)
		}
	})

	t.Run("connection_streaming", func(t *testing.T) {
		payload, _ := json.Marshal(map[string]any{
			"provider": "gemini",
			"model":    "gemini-2.5-pro",
			"base_url": upstream.URL + "/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse",
			"api_key":  "AIza-test-key",
		})
		w := httptest.NewRecorder()
		s.testLLM(w, httptest.NewRequest(http.MethodPost, "/api/llm/test", strings.NewReader(string(payload))))
		var got struct {
			OK    bool   `json:"ok"`
			Reply string `json:"reply"`
			Error string `json:"error"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || w.Code != 200 || !got.OK {
			t.Fatalf("response=%d %s err=%v", w.Code, w.Body, err)
		}
		if strings.TrimSpace(got.Reply) != "OK" {
			t.Fatalf("reply=%q", got.Reply)
		}
	})

	t.Run("connection_non_streaming_v1", func(t *testing.T) {
		streaming := false
		payload, _ := json.Marshal(map[string]any{
			"provider":  "gemini",
			"model":     "gemini-2.5-pro",
			"base_url":  upstream.URL + "/v1",
			"api_key":   "AIza-test-key",
			"streaming": streaming,
		})
		w := httptest.NewRecorder()
		s.testLLM(w, httptest.NewRequest(http.MethodPost, "/api/llm/test", strings.NewReader(string(payload))))
		var got struct {
			OK    bool   `json:"ok"`
			Reply string `json:"reply"`
			Error string `json:"error"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || w.Code != 200 || !got.OK {
			t.Fatalf("response=%d %s err=%v", w.Code, w.Body, err)
		}
		if strings.TrimSpace(got.Reply) != "OK" {
			t.Fatalf("reply=%q", got.Reply)
		}
	})
}
