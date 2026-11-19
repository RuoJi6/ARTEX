package agent

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Server-side refusal fallback for first-party Claude models.
//
// When a model's safety classifier declines a request, the API normally returns
// stop_reason "refusal". With `fallbacks: "default"` (beta
// server-side-fallback-2026-07-01) the API instead re-runs the declined request on
// the model Anthropic recommends for that refusal category, for example cyber
// declines on Claude Opus 5 go to Claude Opus 4.8, and on Claude Sonnet 5.5 to
// Claude Sonnet 5. The field is opt-in, so it is sent only to the models the API
// documents as accepting it, and only to api.anthropic.com. Haiku 5.5 has no
// server-side fallback and must not receive the field; third-party gateways and
// Bedrock/Vertex/Foundry do not support it.

const (
	claudeFallbackBeta    = "server-side-fallback-2026-07-01"
	anthropicMessagesPath = "/v1/messages"
)

// fallbackModels are the model ids the API documents as accepting `fallbacks`.
// Any other id (Haiku, Sonnet 5, Opus 4.8, Mythos, dated or gateway names) is
// left unchanged.
var fallbackModels = map[string]bool{
	"claude-fable-5-2":  true,
	"claude-fable-5-1":  true,
	"claude-opus-5-5":   true,
	"claude-opus-5":     true,
	"claude-sonnet-5-5": true,
}

// serverFallbackEligible reports whether requests for model against baseURL should
// opt into server-side fallbacks. An empty baseURL means the SDK default, which is
// api.anthropic.com.
func serverFallbackEligible(model, baseURL string) bool {
	if !fallbackModels[strings.ToLower(strings.TrimSpace(model))] {
		return false
	}
	b := strings.TrimSpace(baseURL)
	if b == "" {
		return true
	}
	u, err := url.Parse(b)
	if err != nil {
		return false
	}
	return strings.EqualFold(u.Hostname(), "api.anthropic.com")
}

// claudeFallbackTransport adds the fallbacks field and beta header to outgoing
// Messages API requests. It wraps the whole transport chain, so every attempt
// (including norma's establishment retries) carries the field.
type claudeFallbackTransport struct {
	base http.RoundTripper
}

func (t claudeFallbackTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.Method != http.MethodPost || !strings.HasSuffix(req.URL.Path, anthropicMessagesPath) || req.GetBody == nil {
		return t.base.RoundTrip(req)
	}
	rc, err := req.GetBody()
	if err != nil {
		return nil, err
	}
	raw, err := io.ReadAll(rc)
	_ = rc.Close()
	if err != nil {
		return nil, err
	}
	patched, ok := withServerFallback(raw)
	if !ok {
		return t.base.RoundTrip(req)
	}
	if req.Body != nil {
		_ = req.Body.Close()
	}
	out := req.Clone(req.Context())
	out.Body = io.NopCloser(bytes.NewReader(patched))
	out.GetBody = func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(patched)), nil }
	out.ContentLength = int64(len(patched))
	out.Header.Set("anthropic-beta", mergeBetaHeader(out.Header.Get("anthropic-beta"), claudeFallbackBeta))
	return t.base.RoundTrip(out)
}

// withServerFallback inserts `"fallbacks":"default"` into a JSON object body. The
// rest of the bytes are left as they are, so the request is otherwise identical.
// It returns ok=false when the body is not a JSON object or already sets fallbacks.
func withServerFallback(body []byte) ([]byte, bool) {
	trimmed := bytes.TrimRight(body, " \t\r\n")
	if len(trimmed) < 2 || trimmed[0] != '{' || trimmed[len(trimmed)-1] != '}' {
		return body, false
	}
	if !json.Valid(trimmed) || bytes.Contains(trimmed, []byte(`"fallbacks"`)) {
		return body, false
	}
	inner := bytes.TrimRight(trimmed[1:len(trimmed)-1], " \t\r\n")
	sep := ","
	if len(inner) == 0 {
		sep = ""
	}
	var b bytes.Buffer
	b.WriteByte('{')
	b.Write(inner)
	b.WriteString(sep)
	b.WriteString(`"fallbacks":"default"}`)
	out := b.Bytes()
	if !json.Valid(out) {
		return body, false
	}
	return out, true
}

// mergeBetaHeader adds one beta feature to an anthropic-beta header value, keeping
// any features already present and never duplicating the new one.
func mergeBetaHeader(existing, feature string) string {
	var parts []string
	for _, p := range strings.Split(existing, ",") {
		if p = strings.TrimSpace(p); p != "" {
			parts = append(parts, p)
		}
	}
	for _, p := range parts {
		if p == feature {
			return strings.Join(parts, ",")
		}
	}
	return strings.Join(append(parts, feature), ",")
}
