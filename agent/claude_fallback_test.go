package agent

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Autumn-27/norma/llm"
)

func TestServerFallbackEligible(t *testing.T) {
	cases := []struct {
		model, base string
		want        bool
	}{
		// Documented models on the first-party API.
		{"claude-opus-5-5", "", true},
		{"claude-opus-5", "https://api.anthropic.com", true},
		{"claude-sonnet-5-5", "https://api.anthropic.com/", true},
		{"claude-fable-5-2", "", true},
		{"claude-fable-5-1", "https://API.anthropic.com", true},
		{" Claude-Opus-5-5 ", "", true},
		// Not documented as accepting fallbacks: never sent.
		{"claude-haiku-5-5", "", false},
		{"claude-sonnet-5", "", false},
		{"claude-opus-4-8", "", false},
		{"claude-mythos-5-2", "", false},
		{"claude-opus-5-5-20260101", "", false},
		// Other platforms and gateways do not support server-side fallback.
		{"claude-opus-5-5", "https://gateway.example.com", false},
		{"claude-opus-5-5", "https://api.anthropic.com.example.com", false},
		{"claude-opus-5-5", "https://bedrock.example/anthropic", false},
		{"claude-opus-5-5", "::not a url", false},
	}
	for _, tc := range cases {
		if got := serverFallbackEligible(llm.FormatAnthropic, tc.model, tc.base); got != tc.want {
			t.Errorf("serverFallbackEligible(anthropic, %q, %q) = %v, want %v", tc.model, tc.base, got, tc.want)
		}
	}
}

// Only the Anthropic Messages format may carry fallbacks, even for an allowlisted
// model on api.anthropic.com.
func TestServerFallbackEligibleRequiresAnthropicFormat(t *testing.T) {
	for _, f := range []llm.Format{llm.FormatOpenAI, llm.FormatOpenAIResponses, ""} {
		if serverFallbackEligible(f, "claude-opus-5-5", "https://api.anthropic.com") {
			t.Errorf("format %q: eligible, want not eligible", f)
		}
	}
}

func TestWithServerFallback(t *testing.T) {
	cases := []struct {
		name, in, want string
		ok             bool
	}{
		{"adds to populated object", `{"model":"m","max_tokens":5}`, `{"model":"m","max_tokens":5,"fallbacks":"default"}`, true},
		{"trailing whitespace trimmed", "{\"a\":1}\n", `{"a":1,"fallbacks":"default"}`, true},
		{"leading whitespace trimmed", " \n\t{\"a\":1}", `{"a":1,"fallbacks":"default"}`, true},
		{"inner whitespace", "{ \"a\":1 \n}", `{"a":1,"fallbacks":"default"}`, true},
		// Regression: the literal "fallbacks" inside message content or a nested
		// object must not suppress the top-level field.
		{"fallbacks in message text", `{"messages":[{"role":"user","content":"set \"fallbacks\": none"}]}`, `{"messages":[{"role":"user","content":"set \"fallbacks\": none"}],"fallbacks":"default"}`, true},
		{"fallbacks as nested key", `{"metadata":{"fallbacks":"x"}}`, `{"metadata":{"fallbacks":"x"},"fallbacks":"default"}`, true},
		{"already set to other value", `{"a":1,"fallbacks":"none"}`, `{"a":1,"fallbacks":"none"}`, false},
		{"empty object", `{}`, `{"fallbacks":"default"}`, true},
		{"already set", `{"fallbacks":"default"}`, `{"fallbacks":"default"}`, false},
		{"not an object", `[1,2]`, `[1,2]`, false},
		{"not json", `{"a":`, `{"a":`, false},
	}
	for _, tc := range cases {
		got, ok := withServerFallback([]byte(tc.in))
		if ok != tc.ok || string(got) != tc.want {
			t.Errorf("%s: got (%s, %v), want (%s, %v)", tc.name, got, ok, tc.want, tc.ok)
		}
		if ok && !json.Valid(got) {
			t.Errorf("%s: produced invalid JSON", tc.name)
		}
	}
}

func TestMergeBetaHeader(t *testing.T) {
	const f = claudeFallbackBeta
	cases := map[string]string{
		"":                          f,
		"prompt-caching-2024-07-31": "prompt-caching-2024-07-31," + f,
		"a, b ":                     "a,b," + f,
		f:                           f,
		"a," + f + ",b":             "a," + f + ",b",
	}
	for in, want := range cases {
		if got := mergeBetaHeader(in, f); got != want {
			t.Errorf("mergeBetaHeader(%q) = %q, want %q", in, got, want)
		}
	}
}

// The transport must add the field and header on the wire, and must not change the
// caller's request object.
func TestClaudeFallbackTransportWireBody(t *testing.T) {
	var gotBody []byte
	var gotBeta string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotBody, _ = io.ReadAll(r.Body)
		gotBeta = r.Header.Get("anthropic-beta")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := &http.Client{Transport: claudeFallbackTransport{base: http.DefaultTransport}}
	orig := []byte(`{"model":"claude-opus-5-5","max_tokens":16}`)
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/v1/messages", bytes.NewReader(orig))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("anthropic-beta", "prompt-caching-2024-07-31")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()

	var m map[string]any
	if err := json.Unmarshal(gotBody, &m); err != nil {
		t.Fatalf("body not JSON: %s", gotBody)
	}
	if m["fallbacks"] != "default" || m["model"] != "claude-opus-5-5" {
		t.Errorf("wire body = %s", gotBody)
	}
	if !strings.Contains(gotBeta, claudeFallbackBeta) || !strings.Contains(gotBeta, "prompt-caching-2024-07-31") {
		t.Errorf("anthropic-beta = %q", gotBeta)
	}
}

// Non-messages paths and non-eligible bodies pass through untouched.
func TestClaudeFallbackTransportPassThrough(t *testing.T) {
	var gotBody []byte
	var gotBeta string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotBody, _ = io.ReadAll(r.Body)
		gotBeta = r.Header.Get("anthropic-beta")
	}))
	defer srv.Close()
	client := &http.Client{Transport: claudeFallbackTransport{base: http.DefaultTransport}}
	body := `{"model":"x"}`
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/v1/messages/count_tokens", strings.NewReader(body))
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if string(gotBody) != body || gotBeta != "" {
		t.Errorf("count_tokens changed: body=%s beta=%q", gotBody, gotBeta)
	}
}

// Every anthropic-beta header line must survive, not only the first one.
func TestClaudeFallbackTransportMergesAllBetaHeaders(t *testing.T) {
	var gotBeta []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotBeta = r.Header.Values("anthropic-beta")
	}))
	defer srv.Close()
	client := &http.Client{Transport: claudeFallbackTransport{base: http.DefaultTransport}}
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/v1/messages", strings.NewReader(`{"model":"claude-opus-5-5"}`))
	req.Header.Add("anthropic-beta", "prompt-caching-2024-07-31")
	req.Header.Add("anthropic-beta", "a, b")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	want := "prompt-caching-2024-07-31,a,b," + claudeFallbackBeta
	if len(gotBeta) != 1 || gotBeta[0] != want {
		t.Errorf("anthropic-beta = %q, want [%q]", gotBeta, want)
	}
}
