package agent

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/llmrec"
	"github.com/Autumn-27/norma/llm"
)

func TestConfigFromGeminiAndBaseURLNormalization(t *testing.T) {
	cases := []struct {
		in   string
		norm string
		ver  string
	}{
		{"", "", "https://generativelanguage.googleapis.com/v1beta"},
		{"https://generativelanguage.googleapis.com", "https://generativelanguage.googleapis.com", "https://generativelanguage.googleapis.com/v1beta"},
		{"https://generativelanguage.googleapis.com/v1beta/", "https://generativelanguage.googleapis.com/v1beta", "https://generativelanguage.googleapis.com/v1beta"},
		{"https://generativelanguage.googleapis.com/v1", "https://generativelanguage.googleapis.com/v1", "https://generativelanguage.googleapis.com/v1"},
		{"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", "https://generativelanguage.googleapis.com/v1beta", "https://generativelanguage.googleapis.com/v1beta"},
		{"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse", "https://generativelanguage.googleapis.com/v1beta", "https://generativelanguage.googleapis.com/v1beta"},
		{"https://proxy.example/gemini/models?pageSize=50", "https://proxy.example/gemini", "https://proxy.example/gemini/v1beta"},
		{"https://proxy.example/v1alpha", "https://proxy.example/v1alpha", "https://proxy.example/v1alpha"},
	}
	for _, tc := range cases {
		if got := NormalizeGeminiBaseURL(tc.in); got != tc.norm {
			t.Errorf("NormalizeGeminiBaseURL(%q) = %q, want %q", tc.in, got, tc.norm)
		}
		if got := GeminiBaseWithVersion(tc.in); got != tc.ver {
			t.Errorf("GeminiBaseWithVersion(%q) = %q, want %q", tc.in, got, tc.ver)
		}
	}

	c := ConfigFrom("gemini", "", "https://gw.example/v1beta/models/gemini-2.5-pro:generateContent", "AIza-test", "")
	if c.Format != FormatGemini {
		t.Fatalf("format=%v, want FormatGemini", c.Format)
	}
	if c.Model != defaultGeminiModel {
		t.Fatalf("model=%q, want %q", c.Model, defaultGeminiModel)
	}
	if c.BaseURL != "https://gw.example/v1beta" {
		t.Fatalf("base_url=%q", c.BaseURL)
	}
	if c.Provider() != "gemini" {
		t.Fatalf("Provider()=%q", c.Provider())
	}
	if !c.Stream {
		t.Fatal("Stream should default true")
	}
	if _, err := c.NewProvider(); err != nil {
		t.Fatalf("NewProvider: %v", err)
	}
}

func TestFromEnvGemini(t *testing.T) {
	t.Setenv("ARTEX_LLM_PROVIDER", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("GEMINI_API_KEY", "AIza-env-key")
	t.Setenv("GOOGLE_API_KEY", "")
	t.Setenv("ARTEX_LLM_MODEL", "")
	t.Setenv("ARTEX_LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent")

	c, ok := FromEnv()
	if !ok {
		t.Fatal("FromEnv returned ok=false")
	}
	if c.Format != FormatGemini || c.Provider() != "gemini" || c.APIKey != "AIza-env-key" {
		t.Fatalf("unexpected config: %+v", c)
	}
	if c.BaseURL != "https://generativelanguage.googleapis.com/v1beta" {
		t.Fatalf("BaseURL=%q", c.BaseURL)
	}
}

func TestGeminiStreamThinkingToolCallsAndReplay(t *testing.T) {
	var requests []string
	var paths []string
	turn := 0

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-goog-api-key") != "AIza-secret" {
			t.Errorf("missing x-goog-api-key header: %q", r.Header.Get("x-goog-api-key"))
		}
		b, _ := io.ReadAll(r.Body)
		requests = append(requests, string(b))
		paths = append(paths, r.URL.RequestURI())
		turn++

		w.Header().Set("content-type", "text/event-stream")
		if turn == 1 {
			// Turn 1: thought delta + functionCall carrying thoughtSignature (no wire id)
			sse := strings.Join([]string{
				`data: {"candidates":[{"content":{"role":"model","parts":[{"text":"checking host","thought":true}]}}],"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":0,"thoughtsTokenCount":12,"cachedContentTokenCount":40}}`,
				``,
				`data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"bash","args":{"command":"id"}},"thoughtSignature":"sig-turn-1"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":8,"thoughtsTokenCount":12,"cachedContentTokenCount":40}}`,
				``,
			}, "\n")
			_, _ = io.WriteString(w, sse)
			return
		}
		// Turn 2: final text reply
		sse := strings.Join([]string{
			`data: {"candidates":[{"content":{"role":"model","parts":[{"text":"uid=0(root)"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":150,"candidatesTokenCount":5,"thoughtsTokenCount":0}}`,
			``,
		}, "\n")
		_, _ = io.WriteString(w, sse)
	}))
	defer srv.Close()

	cfg := ConfigFrom("gemini", "models/gemini-2.5-pro", srv.URL, "AIza-secret", "")
	cfg.ThinkingType = "enabled"
	cfg.ReasoningEffort = "medium"
	prov, err := cfg.NewProvider()
	if err != nil {
		t.Fatalf("NewProvider: %v", err)
	}

	req1 := llm.CompletionRequest{
		System:   []string{"sys part 1", "sys part 2"},
		Messages: []llm.Message{llm.UserText("who am i?")},
		Tools: []llm.ToolSchema{{
			Name:        "bash",
			Description: "run shell",
			InputSchema: map[string]any{
				"$schema":              "https://json-schema.org/draft/2020-12/schema",
				"type":                 "object",
				"additionalProperties": false,
				"properties": map[string]any{
					"command": map[string]any{"type": "string", "description": "cmd", "format": "uri"},
				},
				"required": []string{"command", "nonexistent"},
			},
		}, {
			Name:        "noop",
			Description: "no params",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
		}},
		MaxTokens: 2048,
	}

	ctx, capt := llmrec.NewCapture(context.Background())
	acc := llm.NewAccumulator()
	for ev, err := range prov.Stream(ctx, req1) {
		if err != nil {
			t.Fatalf("turn 1 stream: %v", err)
		}
		acc.Add(ev)
	}
	if paths[0] != "/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse" {
		t.Fatalf("turn 1 path=%q", paths[0])
	}
	if capt.RawRequest() != requests[0] {
		t.Fatalf("llmrec capture mismatch:\ngot:  %s\nwant: %s", capt.RawRequest(), requests[0])
	}
	if acc.StopReason != "tool_use" {
		t.Fatalf("turn 1 stop=%q, want tool_use", acc.StopReason)
	}
	if acc.Usage.InputTokens != 100 || acc.Usage.OutputTokens != 20 || acc.Usage.CacheReadTokens != 40 {
		t.Fatalf("turn 1 usage=%+v, want in=100 out=20 cache=40", acc.Usage)
	}

	msg1 := acc.Message()
	uses := msg1.ToolUses()
	if len(uses) != 1 || uses[0].Name != "bash" || string(uses[0].Input) != `{"command":"id"}` {
		t.Fatalf("unexpected tool uses: %+v", uses)
	}
	if !strings.HasPrefix(uses[0].ID, syntheticGeminiCallPrefix) {
		t.Fatalf("expected synthetic id, got %q", uses[0].ID)
	}

	// Verify turn 1 wire body: systemInstruction, sanitized tools, thinkingBudget for 2.5
	var wire1 map[string]any
	if err := json.Unmarshal([]byte(requests[0]), &wire1); err != nil {
		t.Fatal(err)
	}
	gc := wire1["generationConfig"].(map[string]any)
	if gc["maxOutputTokens"].(float64) != 2048 {
		t.Fatalf("maxOutputTokens=%v", gc["maxOutputTokens"])
	}
	tc := gc["thinkingConfig"].(map[string]any)
	if tc["includeThoughts"] != true || tc["thinkingBudget"].(float64) != 8192 {
		t.Fatalf("thinkingConfig=%v", tc)
	}
	tools := wire1["tools"].([]any)[0].(map[string]any)["functionDeclarations"].([]any)
	bashDecl := tools[0].(map[string]any)
	bashParams := bashDecl["parameters"].(map[string]any)
	if _, bad := bashParams["additionalProperties"]; bad {
		t.Fatal("additionalProperties was not stripped")
	}
	if _, bad := bashParams["$schema"]; bad {
		t.Fatal("$schema was not stripped")
	}
	cmdProp := bashParams["properties"].(map[string]any)["command"].(map[string]any)
	if _, bad := cmdProp["format"]; bad {
		t.Fatal("unsupported string format 'uri' was not stripped")
	}
	if reqFields := bashParams["required"].([]any); len(reqFields) != 1 || reqFields[0] != "command" {
		t.Fatalf("required=%v, want [command]", reqFields)
	}
	noopDecl := tools[1].(map[string]any)
	if _, hasParams := noopDecl["parameters"]; hasParams {
		t.Fatalf("zero-arg tool should omit parameters, got %v", noopDecl["parameters"])
	}

	// Turn 2: rebuild a fresh provider (simulating restart / transcript resume) and
	// verify thoughtSignature is still replayed via BlockThinking.Signature and
	// functionResponse carries the matched tool name "bash".
	prov2, err := cfg.NewProvider()
	if err != nil {
		t.Fatalf("NewProvider 2: %v", err)
	}
	req2 := llm.CompletionRequest{
		System: req1.System,
		Messages: []llm.Message{
			llm.UserText("who am i?"),
			msg1,
			{Role: llm.RoleUser, Content: []llm.ContentBlock{
				llm.ToolResultText(uses[0].ID, "uid=0(root)", false),
			}},
		},
	}
	acc2 := llm.NewAccumulator()
	for ev, err := range prov2.Stream(context.Background(), req2) {
		if err != nil {
			t.Fatalf("turn 2 stream: %v", err)
		}
		acc2.Add(ev)
	}
	if acc2.StopReason != "end_turn" || acc2.Message().Text() != "uid=0(root)" {
		t.Fatalf("turn 2 stop=%q text=%q", acc2.StopReason, acc2.Message().Text())
	}

	var wire2 geminiReq
	if err := json.Unmarshal([]byte(requests[1]), &wire2); err != nil {
		t.Fatal(err)
	}
	if len(wire2.Contents) != 3 {
		t.Fatalf("contents len=%d, want 3", len(wire2.Contents))
	}
	modelPart := wire2.Contents[1].Parts[0]
	if modelPart.FunctionCall == nil || modelPart.FunctionCall.Name != "bash" || modelPart.ThoughtSignature != "sig-turn-1" {
		t.Fatalf("model turn functionCall mismatch: %+v", modelPart)
	}
	if modelPart.FunctionCall.ID != "" {
		t.Fatalf("synthetic ID should not be sent on wire, got %q", modelPart.FunctionCall.ID)
	}
	userRespPart := wire2.Contents[2].Parts[0]
	if userRespPart.FunctionResponse == nil || userRespPart.FunctionResponse.Name != "bash" || userRespPart.FunctionResponse.Response["output"] != "uid=0(root)" {
		t.Fatalf("functionResponse mismatch: %+v", userRespPart)
	}
}

func TestGeminiCompleteAndThoughtSignatureCacheWithoutThoughtText(t *testing.T) {
	var seen []geminiReq
	turn := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body geminiReq
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request: %v", err)
		}
		seen = append(seen, body)
		turn++
		w.Header().Set("content-type", "application/json")
		if turn == 1 {
			// Gemini 3 style: functionCall carries wire id + thoughtSignature, NO thought text part.
			_, _ = io.WriteString(w, `{"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"id":"fc_99","name":"lookup","args":{"k":"v"}},"thoughtSignature":"enc-sig-99"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":50,"candidatesTokenCount":10}}`)
			return
		}
		_, _ = io.WriteString(w, `{"candidates":[{"content":{"role":"model","parts":[{"text":"done"}]},"finishReason":"MAX_TOKENS"}],"usageMetadata":{"promptTokenCount":80,"candidatesTokenCount":15}}`)
	}))
	defer srv.Close()

	cfg := ConfigFrom("gemini", "gemini-3-pro", srv.URL, "AIza-test", "")
	cfg.ReasoningEffort = "high"
	prov, err := cfg.NewProvider()
	if err != nil {
		t.Fatal(err)
	}

	msg1, stop1, usage1, err := prov.Complete(context.Background(), llm.CompletionRequest{
		Messages: []llm.Message{llm.UserText("run")},
	})
	if err != nil {
		t.Fatalf("Complete 1: %v", err)
	}
	if stop1 != "tool_use" || usage1.InputTokens != 50 || usage1.OutputTokens != 10 {
		t.Fatalf("stop=%q usage=%+v", stop1, usage1)
	}
	if seen[0].GenerationConfig == nil || seen[0].GenerationConfig.ThinkingConfig == nil || seen[0].GenerationConfig.ThinkingConfig.ThinkingLevel != "high" {
		t.Fatalf("expected thinkingLevel=high for gemini-3, got %+v", seen[0].GenerationConfig)
	}

	msg2, stop2, _, err := prov.Complete(context.Background(), llm.CompletionRequest{
		Messages: []llm.Message{
			llm.UserText("run"),
			msg1,
			{Role: llm.RoleUser, Content: []llm.ContentBlock{llm.ToolResultText("fc_99", "err text", true)}},
		},
		Thinking: "disabled", // compaction / judge override must suppress thinkingConfig
	})
	if err != nil {
		t.Fatalf("Complete 2: %v", err)
	}
	if stop2 != "max_tokens" || msg2.Text() != "done" {
		t.Fatalf("stop=%q text=%q", stop2, msg2.Text())
	}
	if seen[1].GenerationConfig != nil && seen[1].GenerationConfig.ThinkingConfig != nil {
		t.Fatalf("Thinking=disabled override must suppress thinkingConfig, got %+v", seen[1].GenerationConfig.ThinkingConfig)
	}
	fcPart := seen[1].Contents[1].Parts[0]
	if fcPart.ThoughtSignature != "enc-sig-99" || fcPart.FunctionCall.ID != "fc_99" {
		t.Fatalf("expected cached thoughtSignature and wire ID replayed, got %+v", fcPart)
	}
	frPart := seen[1].Contents[2].Parts[0]
	if frPart.FunctionResponse.ID != "fc_99" || frPart.FunctionResponse.Response["error"] != "err text" {
		t.Fatalf("expected error functionResponse with matching ID, got %+v", frPart)
	}
}

func TestGeminiTestConnectionAndQuota429(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1beta/models/gemini-2.5-flash:generateContent" {
			w.Header().Set("content-type", "application/json")
			_, _ = io.WriteString(w, `{"candidates":[{"content":{"role":"model","parts":[{"text":"OK"}]},"finishReason":"STOP"}]}`)
			return
		}
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = io.WriteString(w, `{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}`)
	}))
	defer srv.Close()

	// Non-streaming TestConnection
	cfg := ConfigFrom("gemini", "gemini-2.5-flash", srv.URL, "AIza-test", "")
	cfg.Stream = false
	lat, reply, err := TestConnection(context.Background(), cfg)
	if err != nil {
		t.Fatalf("TestConnection: %v", err)
	}
	if lat < 0 || strings.TrimSpace(reply) != "OK" {
		t.Fatalf("lat=%v reply=%q", lat, reply)
	}

	// Quota-exhausted 429 must be normalized to 402 and fail immediately without retries
	quotaCfg := ConfigFrom("gemini", "gemini-2.5-pro", srv.URL, "AIza-test", "")
	quotaCfg.Retry.ConnectInterval = time.Millisecond
	prov, err := quotaCfg.NewProvider()
	if err != nil {
		t.Fatal(err)
	}
	_, _, _, err = prov.Complete(context.Background(), llm.CompletionRequest{Messages: []llm.Message{llm.UserText("hi")}})
	if err == nil || !strings.Contains(err.Error(), "status 402") {
		t.Fatalf("expected 402 normalized quota error, got %v", err)
	}
}

func TestSanitizeGeminiSchemaEdgeCases(t *testing.T) {
	raw := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"nullable_arr": map[string]any{
				"type": []any{"string", "null"},
			},
			"nullable_anyof": map[string]any{
				"description": "opt int",
				"anyOf": []any{
					map[string]any{"type": "integer", "format": "int64"},
					map[string]any{"type": "null"},
				},
			},
			"bare_array": map[string]any{
				"type": "array",
			},
			"const_field": map[string]any{
				"const": "fixed",
			},
		},
	}
	got := sanitizeGeminiTopSchema(raw)
	props := got["properties"].(map[string]any)

	na := props["nullable_arr"].(map[string]any)
	if na["type"] != "string" || na["nullable"] != true {
		t.Fatalf("nullable_arr=%v", na)
	}
	ao := props["nullable_anyof"].(map[string]any)
	if ao["type"] != "integer" || ao["format"] != "int64" || ao["nullable"] != true || ao["description"] != "opt int" {
		t.Fatalf("nullable_anyof=%v", ao)
	}
	ba := props["bare_array"].(map[string]any)
	if items, ok := ba["items"].(map[string]any); !ok || items["type"] != "string" {
		t.Fatalf("bare_array=%v", ba)
	}
	cf := props["const_field"].(map[string]any)
	if cf["type"] != "string" || len(cf["enum"].([]string)) != 1 || cf["enum"].([]string)[0] != "fixed" {
		t.Fatalf("const_field=%v", cf)
	}
}
