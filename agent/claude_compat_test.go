package agent

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/Autumn-27/norma/llm"
)

func TestClaudeCompatFor(t *testing.T) {
	cases := []struct {
		model, effort string
		want          claudeCompat
	}{
		// Rejects both at every effort.
		{"claude-opus-5-5", "", claudeCompat{true, true}},
		{"claude-opus-5-5", "low", claudeCompat{true, true}},
		{"claude-sonnet-5-5", "high", claudeCompat{true, true}},
		{"claude-fable-5-2", "", claudeCompat{true, true}},
		{"claude-mythos-5-1", "", claudeCompat{true, true}},
		{"CLAUDE-OPUS-5-5", "", claudeCompat{true, true}},
		{"claude-mythos-preview", "", claudeCompat{true, true}},
		{"claude-mythos", "", claudeCompat{true, true}},
		{"claude-opus-5-5-thinking", "", claudeCompat{true, true}},
		// Gateway spellings.
		{"anthropic/claude-opus-5-5", "", claudeCompat{true, true}},
		{"claude-opus-5.5", "", claudeCompat{true, true}},
		{"anthropic/claude-opus-4.7", "", claudeCompat{false, true}},
		{"claude-sonnet-5-5[1m]", "", claudeCompat{true, true}},
		{"claude-opus-5[1m]", "max", claudeCompat{true, true}},
		// Platform prefixes/suffixes.
		{"anthropic.claude-opus-5-5", "", claudeCompat{true, true}},
		{"us.anthropic.claude-sonnet-5-5-v1:0", "", claudeCompat{true, true}},
		// Disabled thinking only rejected at xhigh/max.
		{"claude-opus-5", "high", claudeCompat{false, true}},
		{"claude-opus-5", "xhigh", claudeCompat{true, true}},
		{"claude-opus-5", "max", claudeCompat{true, true}},
		{"claude-haiku-5-5", "", claudeCompat{false, true}},
		{"claude-haiku-5-5", "max", claudeCompat{true, true}},
		// Sampling removed, disabled thinking still accepted.
		{"claude-opus-4-8", "max", claudeCompat{false, true}},
		{"claude-opus-4-7", "", claudeCompat{false, true}},
		{"claude-sonnet-5", "", claudeCompat{false, true}},
		// Untouched: older Claude models.
		{"claude-opus-4-6", "", claudeCompat{}},
		{"claude-sonnet-4-6", "", claudeCompat{}},
		{"claude-haiku-4-5", "", claudeCompat{}},
		{"claude-haiku-4-5-20251001", "", claudeCompat{}},
		{"claude-opus-4-20250514", "", claudeCompat{}},
		{"claude-opus-4-5@20251101", "", claudeCompat{}},
		{"claude-3-5-sonnet-20241022", "", claudeCompat{}},
		// Untouched: non-Claude models and unknown names.
		{"gpt-5", "", claudeCompat{}},
		{"glm-4.6", "", claudeCompat{}},
		{"deepseek-chat", "", claudeCompat{}},
		{"claude-unknown-9", "", claudeCompat{}},
		{"", "", claudeCompat{}},
	}
	for _, tc := range cases {
		if got := claudeCompatFor(tc.model, tc.effort); got != tc.want {
			t.Errorf("claudeCompatFor(%q, %q) = %+v, want %+v", tc.model, tc.effort, got, tc.want)
		}
	}
}

func TestClaudeCompatApplyDoesNotMutateCaller(t *testing.T) {
	temp := 0.0
	req := llm.CompletionRequest{Thinking: "disabled", Temperature: &temp}
	out := claudeCompat{true, true}.apply(req)
	if out.Thinking != "" || out.Temperature != nil {
		t.Fatalf("apply left fields: %+v", out)
	}
	if req.Thinking != "disabled" || req.Temperature == nil {
		t.Fatalf("apply mutated the caller's request: %+v", req)
	}
	// Explicit "enabled" is a caller decision and is never rewritten.
	if got := (claudeCompat{true, true}).apply(llm.CompletionRequest{Thinking: "enabled"}); got.Thinking != "enabled" {
		t.Fatalf("enabled rewritten to %q", got.Thinking)
	}
}

// End to end through the real provider factory: the body on the wire must not
// carry thinking "disabled" or temperature for a model that rejects them, and
// must keep both for a model that accepts them.
func TestClaudeCompatWireBody(t *testing.T) {
	const sse = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{}}}\n\n" +
		"event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{}}\n\n" +
		"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
	var (
		mu   sync.Mutex
		body map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		mu.Lock()
		body = nil
		_ = json.Unmarshal(raw, &body)
		mu.Unlock()
		w.Header().Set("content-type", "text/event-stream")
		_, _ = io.WriteString(w, sse)
	}))
	defer srv.Close()

	send := func(t *testing.T, model, profileThinking string, effort ...string) map[string]any {
		t.Helper()
		cfg := ConfigFrom("anthropic", model, srv.URL, "test-key", "")
		cfg.ThinkingType = profileThinking
		if len(effort) > 0 {
			cfg.ReasoningEffort = effort[0]
		}
		prov, err := cfg.NewProvider()
		if err != nil {
			t.Fatalf("NewProvider: %v", err)
		}
		temp := 0.0
		req := llm.CompletionRequest{
			Messages:    []llm.Message{llm.UserText("hi")},
			MaxTokens:   16,
			Temperature: &temp,
			Thinking:    "disabled",
		}
		for _, err := range prov.Stream(context.Background(), req) {
			if err != nil {
				t.Fatalf("stream: %v", err)
			}
		}
		mu.Lock()
		defer mu.Unlock()
		if body["model"] != model {
			t.Fatalf("server saw model %v, want %q (request not captured?)", body["model"], model)
		}
		return body
	}

	t.Run("opus-5-5 drops both", func(t *testing.T) {
		b := send(t, "claude-opus-5-5", "")
		if _, ok := b["thinking"]; ok {
			t.Errorf("thinking sent: %v", b["thinking"])
		}
		if _, ok := b["temperature"]; ok {
			t.Errorf("temperature sent: %v", b["temperature"])
		}
	})
	t.Run("opus-5-5 profile disabled is dropped too", func(t *testing.T) {
		b := send(t, "claude-opus-5-5", "disabled")
		if _, ok := b["thinking"]; ok {
			t.Errorf("thinking sent: %v", b["thinking"])
		}
	})
	t.Run("opus-4-8 keeps disabled thinking, drops temperature", func(t *testing.T) {
		b := send(t, "claude-opus-4-8", "")
		th, _ := b["thinking"].(map[string]any)
		if th["type"] != "disabled" {
			t.Errorf("thinking = %v, want disabled", b["thinking"])
		}
		if _, ok := b["temperature"]; ok {
			t.Errorf("temperature sent: %v", b["temperature"])
		}
	})
	t.Run("opus-4-8 keeps profile-level disabled", func(t *testing.T) {
		b := send(t, "claude-opus-4-8", "disabled")
		th, _ := b["thinking"].(map[string]any)
		if th["type"] != "disabled" {
			t.Errorf("thinking = %v, want disabled", b["thinking"])
		}
	})
	t.Run("opus-5 uses the profile effort", func(t *testing.T) {
		if b := send(t, "claude-opus-5", "", "xhigh"); b["thinking"] != nil {
			t.Errorf("xhigh: thinking sent: %v", b["thinking"])
		}
		b := send(t, "claude-opus-5", "", "high")
		if th, _ := b["thinking"].(map[string]any); th["type"] != "disabled" {
			t.Errorf("high: thinking = %v, want disabled", b["thinking"])
		}
	})
	t.Run("haiku-4-5 untouched", func(t *testing.T) {
		b := send(t, "claude-haiku-4-5", "")
		th, _ := b["thinking"].(map[string]any)
		if th["type"] != "disabled" {
			t.Errorf("thinking = %v, want disabled", b["thinking"])
		}
		if b["temperature"] != 0.0 {
			t.Errorf("temperature = %v, want 0", b["temperature"])
		}
	})
}
