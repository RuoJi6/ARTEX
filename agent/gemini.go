package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"iter"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Autumn-27/norma/llm"
)

// FormatGemini selects the native Google Gemini generateContent REST API
// (POST /{version}/models/{model}:streamGenerateContent?alt=sse and
// POST /{version}/models/{model}:generateContent).
const FormatGemini llm.Format = "gemini"

const (
	defaultGeminiBaseURL      = "https://generativelanguage.googleapis.com/v1beta"
	defaultGeminiModel        = "gemini-2.5-pro"
	syntheticGeminiCallPrefix = "gemini_call_"

	geminiDefaultConnectRetries = 3
	geminiDefaultEmptyRetries   = 2
	geminiSigCacheMax           = 2048
)

// NormalizeGeminiBaseURL strips a pasted Gemini endpoint suffix
// (/models/{model}:generateContent, /models/{model}:streamGenerateContent?alt=sse,
// or /models) back to the API base URL. Empty stays empty so callers can decide
// whether to apply defaultGeminiBaseURL.
func NormalizeGeminiBaseURL(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if idx := strings.Index(s, "/models/"); idx >= 0 {
		s = s[:idx]
	} else {
		// Strip query string when user pasted ".../models?pageSize=..." or ".../models?key=...".
		noQuery := s
		if q := strings.IndexByte(noQuery, '?'); q >= 0 {
			noQuery = noQuery[:q]
		}
		trimmed := strings.TrimRight(noQuery, "/")
		if strings.HasSuffix(trimmed, "/models") {
			s = strings.TrimSuffix(trimmed, "/models")
		}
	}
	return strings.TrimRight(s, "/")
}

// GeminiBaseWithVersion normalizes raw, applies the official Google AI Studio
// default when empty, and appends "/v1beta" when the URL has no explicit API
// version segment (/v1, /v1beta, /v1alpha, /v1beta1).
func GeminiBaseWithVersion(raw string) string {
	base := NormalizeGeminiBaseURL(raw)
	if base == "" {
		return defaultGeminiBaseURL
	}
	if hasGeminiAPIVersion(base) {
		return base
	}
	return base + "/v1beta"
}

func hasGeminiAPIVersion(base string) bool {
	u, err := url.Parse(base)
	if err != nil {
		return false
	}
	p := strings.TrimRight(u.Path, "/")
	if p == "" {
		return false
	}
	seg := p
	if i := strings.LastIndexByte(p, '/'); i >= 0 {
		seg = p[i+1:]
	}
	switch strings.ToLower(seg) {
	case "v1", "v1beta", "v1alpha", "v1beta1":
		return true
	}
	return false
}

func isGeminiV1(base string) bool {
	u, err := url.Parse(base)
	if err != nil {
		return false
	}
	p := strings.TrimRight(u.Path, "/")
	seg := p
	if i := strings.LastIndexByte(p, '/'); i >= 0 {
		seg = p[i+1:]
	}
	return strings.EqualFold(seg, "v1")
}

// geminiProvider implements llm.Provider against the native Google Gemini
// generateContent REST API, translating between norma's Anthropic-shaped
// content-block model and Gemini's contents/parts/functionDeclarations format.
type geminiProvider struct {
	cfg     Config
	client  *http.Client
	baseURL string
	model   string
	v1      bool

	callSeq atomic.Uint64

	sigMu    sync.Mutex
	sigCache map[string]string
	sigOrder []string
}

func newGeminiProvider(cfg Config, client *http.Client) (*geminiProvider, error) {
	baseURL := GeminiBaseWithVersion(cfg.BaseURL)
	model := strings.TrimPrefix(strings.TrimSpace(cfg.Model), "models/")
	if model == "" {
		model = defaultGeminiModel
	}
	return &geminiProvider{
		cfg:      cfg,
		client:   client,
		baseURL:  baseURL,
		model:    model,
		v1:       isGeminiV1(baseURL),
		sigCache: make(map[string]string),
	}, nil
}

func (p *geminiProvider) endpointURL(stream bool) string {
	u := p.baseURL + "/models/" + url.PathEscape(p.model)
	if stream {
		return u + ":streamGenerateContent?alt=sse"
	}
	return u + ":generateContent"
}

func (p *geminiProvider) nextCallID() string {
	return fmt.Sprintf("%s%d", syntheticGeminiCallPrefix, p.callSeq.Add(1))
}

func (p *geminiProvider) rememberSignature(callID, sig string) {
	if callID == "" || sig == "" {
		return
	}
	p.sigMu.Lock()
	defer p.sigMu.Unlock()
	if _, exists := p.sigCache[callID]; !exists {
		if len(p.sigOrder) >= geminiSigCacheMax {
			evict := p.sigOrder[0]
			p.sigOrder = p.sigOrder[1:]
			delete(p.sigCache, evict)
		}
		p.sigOrder = append(p.sigOrder, callID)
	}
	p.sigCache[callID] = sig
}

func (p *geminiProvider) lookupSignature(callID string) string {
	if callID == "" {
		return ""
	}
	p.sigMu.Lock()
	defer p.sigMu.Unlock()
	return p.sigCache[callID]
}

// ---- wire request types ----

type geminiReq struct {
	SystemInstruction *geminiContent   `json:"systemInstruction,omitempty"`
	Contents          []geminiContent  `json:"contents"`
	Tools             []geminiTool     `json:"tools,omitempty"`
	GenerationConfig  *geminiGenConfig `json:"generationConfig,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text             string                  `json:"text,omitempty"`
	Thought          bool                    `json:"thought,omitempty"`
	ThoughtSignature string                  `json:"thoughtSignature,omitempty"`
	FunctionCall     *geminiFunctionCall     `json:"functionCall,omitempty"`
	FunctionResponse *geminiFunctionResponse `json:"functionResponse,omitempty"`
}

type geminiFunctionCall struct {
	ID   string         `json:"id,omitempty"`
	Name string         `json:"name"`
	Args map[string]any `json:"args,omitempty"`
}

type geminiFunctionResponse struct {
	ID       string         `json:"id,omitempty"`
	Name     string         `json:"name"`
	Response map[string]any `json:"response"`
}

type geminiTool struct {
	FunctionDeclarations []geminiFuncDecl `json:"functionDeclarations"`
}

type geminiFuncDecl struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Parameters  map[string]any `json:"parameters,omitempty"`
}

type geminiGenConfig struct {
	MaxOutputTokens int                   `json:"maxOutputTokens,omitempty"`
	Temperature     *float64              `json:"temperature,omitempty"`
	StopSequences   []string              `json:"stopSequences,omitempty"`
	ThinkingConfig  *geminiThinkingConfig `json:"thinkingConfig,omitempty"`
}

type geminiThinkingConfig struct {
	IncludeThoughts *bool  `json:"includeThoughts,omitempty"`
	ThinkingBudget  *int   `json:"thinkingBudget,omitempty"`
	ThinkingLevel   string `json:"thinkingLevel,omitempty"`
}

func (p *geminiProvider) buildBody(req llm.CompletionRequest) ([]byte, error) {
	body := geminiReq{
		Contents: p.toGeminiContents(req.Messages),
	}
	if sys := joinGeminiSystem(req.System); sys != "" {
		body.SystemInstruction = &geminiContent{
			Parts: []geminiPart{{Text: sys}},
		}
	}
	if len(req.Tools) > 0 {
		decls := make([]geminiFuncDecl, 0, len(req.Tools))
		for _, t := range req.Tools {
			decls = append(decls, geminiFuncDecl{
				Name:        t.Name,
				Description: t.Description,
				Parameters:  sanitizeGeminiTopSchema(t.InputSchema),
			})
		}
		body.Tools = []geminiTool{{FunctionDeclarations: decls}}
	}

	var gc geminiGenConfig
	hasGC := false
	if req.MaxTokens > 0 {
		gc.MaxOutputTokens = req.MaxTokens
		hasGC = true
	}
	if req.Temperature != nil {
		gc.Temperature = req.Temperature
		hasGC = true
	}
	if len(req.Stop) > 0 {
		gc.StopSequences = req.Stop
		hasGC = true
	}
	if tc := p.buildThinkingConfig(req.Thinking); tc != nil {
		gc.ThinkingConfig = tc
		hasGC = true
	}
	if hasGC {
		body.GenerationConfig = &gc
	}
	return json.Marshal(body)
}

func (p *geminiProvider) buildThinkingConfig(reqThinking string) *geminiThinkingConfig {
	// Per-request "disabled" (compaction summary / intercept judge) suppresses
	// thinking config so Gemini 2.0 (no thinkingConfig) and Gemini 2.5/3 Pro
	// (rejects thinkingBudget=0) both succeed cleanly.
	if reqThinking == "disabled" {
		return nil
	}
	thinkingType := p.cfg.ThinkingType
	if reqThinking != "" {
		thinkingType = reqThinking
	}
	if thinkingType == "disabled" {
		zero := 0
		return &geminiThinkingConfig{ThinkingBudget: &zero}
	}
	effort := strings.ToLower(strings.TrimSpace(p.cfg.ReasoningEffort))
	if thinkingType == "" && effort == "" {
		return nil
	}
	tc := &geminiThinkingConfig{}
	if thinkingType == "enabled" {
		t := true
		tc.IncludeThoughts = &t
	}
	if effort != "" {
		if isGemini25Model(p.model) {
			if budget, ok := gemini25EffortBudget(effort); ok {
				tc.ThinkingBudget = &budget
			}
		} else {
			if level := gemini3EffortLevel(effort); level != "" {
				tc.ThinkingLevel = level
			}
		}
	}
	if tc.IncludeThoughts == nil && tc.ThinkingBudget == nil && tc.ThinkingLevel == "" {
		return nil
	}
	return tc
}

func isGemini25Model(model string) bool {
	return strings.Contains(strings.ToLower(model), "gemini-2.5")
}

func gemini25EffortBudget(effort string) (int, bool) {
	switch effort {
	case "low":
		return 1024, true
	case "medium":
		return 8192, true
	case "high":
		return 16384, true
	case "xhigh", "max":
		return 24576, true
	default:
		return 0, false
	}
}

func gemini3EffortLevel(effort string) string {
	switch effort {
	case "low":
		return "low"
	case "medium":
		return "medium"
	case "high", "xhigh", "max":
		return "high"
	default:
		return ""
	}
}

func joinGeminiSystem(segs []string) string {
	parts := make([]string, 0, len(segs))
	for _, s := range segs {
		if s = strings.TrimSpace(s); s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, "\n\n")
}

func (p *geminiProvider) wireCallID(id string) string {
	if id == "" || p.v1 || strings.HasPrefix(id, syntheticGeminiCallPrefix) {
		return ""
	}
	return id
}

func (p *geminiProvider) toGeminiContents(rawMsgs []llm.Message) []geminiContent {
	msgs := llm.MessagesForAPI(rawMsgs)

	// Map tool_use ID -> tool Name so every functionResponse carries the exact
	// matching function name required by Gemini.
	toolNames := make(map[string]string)
	for _, m := range msgs {
		for _, b := range m.Content {
			if b.Type == llm.BlockToolUse && b.ID != "" && b.Name != "" {
				toolNames[b.ID] = b.Name
			}
		}
	}

	out := make([]geminiContent, 0, len(msgs))
	for _, m := range msgs {
		var role string
		var parts []geminiPart

		switch m.Role {
		case llm.RoleAssistant:
			role = "model"
			var turnSig string
			for _, b := range m.Content {
				if b.Type == llm.BlockThinking && b.Signature != "" {
					turnSig = b.Signature
				}
			}
			firstCall := true
			hasCall := false
			for _, b := range m.Content {
				switch b.Type {
				case llm.BlockText:
					if b.Text != "" {
						parts = append(parts, geminiPart{Text: b.Text})
					}
				case llm.BlockToolUse:
					sig := p.lookupSignature(b.ID)
					if sig == "" && firstCall && turnSig != "" {
						sig = turnSig
					}
					firstCall = false
					hasCall = true
					parts = append(parts, geminiPart{
						ThoughtSignature: sig,
						FunctionCall: &geminiFunctionCall{
							ID:   p.wireCallID(b.ID),
							Name: b.Name,
							Args: decodeGeminiArgs(b.Input),
						},
					})
				}
			}
			if !hasCall && turnSig != "" && len(parts) > 0 {
				parts[len(parts)-1].ThoughtSignature = turnSig
			}
		case llm.RoleUser:
			role = "user"
			var fnResps []geminiPart
			var textParts []geminiPart
			for _, b := range m.Content {
				switch b.Type {
				case llm.BlockToolResult:
					name := toolNames[b.ToolUseID]
					if name == "" {
						continue
					}
					txt := flattenGeminiText(b.Content)
					payload := map[string]any{"output": txt}
					if b.IsError {
						payload = map[string]any{"error": txt}
					}
					fnResps = append(fnResps, geminiPart{
						FunctionResponse: &geminiFunctionResponse{
							ID:       p.wireCallID(b.ToolUseID),
							Name:     name,
							Response: payload,
						},
					})
				case llm.BlockText:
					if b.Text != "" {
						textParts = append(textParts, geminiPart{Text: b.Text})
					}
				}
			}
			parts = append(fnResps, textParts...)
		default:
			continue
		}

		if len(parts) == 0 {
			continue
		}
		if n := len(out); n > 0 && out[n-1].Role == role {
			out[n-1].Parts = append(out[n-1].Parts, parts...)
			continue
		}
		out = append(out, geminiContent{Role: role, Parts: parts})
	}
	return out
}

func flattenGeminiText(blocks []llm.ContentBlock) string {
	var sb strings.Builder
	for _, b := range blocks {
		if b.Type == llm.BlockText {
			sb.WriteString(b.Text)
		}
	}
	return sb.String()
}

func decodeGeminiArgs(raw json.RawMessage) map[string]any {
	if len(bytes.TrimSpace(raw)) == 0 {
		return map[string]any{}
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil || m == nil {
		return map[string]any{}
	}
	return m
}

func marshalGeminiArgs(args map[string]any) string {
	if len(args) == 0 {
		return "{}"
	}
	b, err := json.Marshal(args)
	if err != nil || len(b) == 0 {
		return "{}"
	}
	return string(b)
}

// ---- JSON Schema -> Gemini Schema sanitization ----

// sanitizeGeminiTopSchema prepares a tool's InputSchema for Gemini's
// FunctionDeclaration.parameters (OpenAPI 3.0 Schema subset). Tools with no
// parameters return nil so the parameters field is omitted (Gemini rejects
// OBJECT schemas with an empty properties map).
func sanitizeGeminiTopSchema(schema map[string]any) map[string]any {
	if len(schema) == 0 {
		return nil
	}
	clean := sanitizeGeminiSchema(schema)
	if len(clean) == 0 {
		return nil
	}
	if typ, _ := clean["type"].(string); strings.EqualFold(typ, "object") {
		props, _ := clean["properties"].(map[string]any)
		if len(props) == 0 {
			return nil
		}
	}
	return clean
}

func sanitizeGeminiSchema(schema map[string]any) map[string]any {
	if len(schema) == 0 {
		return nil
	}
	// Collapse Pydantic/Zod-style nullable anyOf/oneOf: [{"type":"X"}, {"type":"null"}].
	for _, unionKey := range []string{"anyOf", "oneOf"} {
		if rawList, ok := schema[unionKey].([]any); ok && len(rawList) > 0 {
			var nonNull []map[string]any
			hasNull := false
			for _, item := range rawList {
				sub, ok := item.(map[string]any)
				if !ok {
					continue
				}
				if t, _ := sub["type"].(string); strings.EqualFold(t, "null") {
					hasNull = true
					continue
				}
				nonNull = append(nonNull, sub)
			}
			if hasNull && len(nonNull) == 1 {
				merged := make(map[string]any, len(nonNull[0])+2)
				for k, v := range nonNull[0] {
					merged[k] = v
				}
				if desc, ok := schema["description"]; ok && merged["description"] == nil {
					merged["description"] = desc
				}
				merged["nullable"] = true
				return sanitizeGeminiSchema(merged)
			}
		}
	}

	out := make(map[string]any, len(schema))
	var schemaType string

	switch t := schema["type"].(type) {
	case string:
		schemaType = strings.ToLower(strings.TrimSpace(t))
		if schemaType != "" && schemaType != "null" {
			out["type"] = schemaType
		}
	case []any:
		for _, elem := range t {
			s, ok := elem.(string)
			if !ok {
				continue
			}
			s = strings.ToLower(strings.TrimSpace(s))
			if s == "null" {
				out["nullable"] = true
			} else if schemaType == "" && s != "" {
				schemaType = s
				out["type"] = s
			}
		}
	case []string:
		for _, s := range t {
			s = strings.ToLower(strings.TrimSpace(s))
			if s == "null" {
				out["nullable"] = true
			} else if schemaType == "" && s != "" {
				schemaType = s
				out["type"] = s
			}
		}
	}

	if desc, ok := schema["description"].(string); ok && desc != "" {
		out["description"] = desc
	}
	if nullable, ok := schema["nullable"].(bool); ok && nullable {
		out["nullable"] = true
	}

	if constVal, ok := schema["const"]; ok {
		if s, ok := constVal.(string); ok {
			out["enum"] = []string{s}
			if schemaType == "" {
				schemaType = "string"
				out["type"] = "string"
			}
		}
	} else if rawEnum, ok := schema["enum"]; ok {
		if enumStrs := toStringSlice(rawEnum); len(enumStrs) > 0 {
			out["enum"] = enumStrs
			if schemaType == "" {
				schemaType = "string"
				out["type"] = "string"
			}
		}
	}

	if format, ok := schema["format"].(string); ok && isGeminiAllowedFormat(schemaType, format) {
		out["format"] = format
	}

	if rawProps, ok := schema["properties"].(map[string]any); ok && len(rawProps) > 0 {
		props := make(map[string]any, len(rawProps))
		for k, v := range rawProps {
			if sub, ok := v.(map[string]any); ok {
				if cleanSub := sanitizeGeminiSchema(sub); len(cleanSub) > 0 {
					props[k] = cleanSub
				}
			}
		}
		if len(props) > 0 {
			out["properties"] = props
			if schemaType == "" {
				schemaType = "object"
				out["type"] = "object"
			}
		}
	}

	if rawReq, ok := schema["required"]; ok {
		if props, ok := out["properties"].(map[string]any); ok && len(props) > 0 {
			reqList := toStringSlice(rawReq)
			kept := make([]string, 0, len(reqList))
			for _, name := range reqList {
				if _, exists := props[name]; exists {
					kept = append(kept, name)
				}
			}
			if len(kept) > 0 {
				out["required"] = kept
			}
		}
	}

	if rawItems, ok := schema["items"].(map[string]any); ok {
		if cleanItems := sanitizeGeminiSchema(rawItems); len(cleanItems) > 0 {
			out["items"] = cleanItems
			if schemaType == "" {
				schemaType = "array"
				out["type"] = "array"
			}
		}
	}
	if schemaType == "array" && out["items"] == nil {
		out["items"] = map[string]any{"type": "string"}
	}

	// Preserve numeric/length bounds supported by Gemini Schema.
	for _, k := range []string{"minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "minProperties", "maxProperties"} {
		if v, ok := schema[k]; ok {
			out[k] = v
		}
	}

	// Handle non-nullable anyOf / oneOf.
	for _, unionKey := range []string{"anyOf", "oneOf"} {
		if rawList, ok := schema[unionKey].([]any); ok && len(rawList) > 0 && out["type"] == nil {
			cleaned := make([]any, 0, len(rawList))
			for _, item := range rawList {
				if sub, ok := item.(map[string]any); ok {
					if cs := sanitizeGeminiSchema(sub); len(cs) > 0 {
						cleaned = append(cleaned, cs)
					}
				}
			}
			if len(cleaned) > 0 {
				out["anyOf"] = cleaned
			}
			break
		}
	}

	if len(out) == 0 {
		return map[string]any{"type": "string"}
	}
	return out
}

func isGeminiAllowedFormat(schemaType, format string) bool {
	switch schemaType {
	case "string":
		return format == "enum" || format == "date-time"
	case "number":
		return format == "float" || format == "double"
	case "integer":
		return format == "int32" || format == "int64"
	}
	return false
}

func toStringSlice(v any) []string {
	switch list := v.(type) {
	case []string:
		return list
	case []any:
		out := make([]string, 0, len(list))
		for _, elem := range list {
			if s, ok := elem.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

// ---- wire response types ----

type geminiResp struct {
	Candidates []struct {
		Content struct {
			Role  string       `json:"role"`
			Parts []geminiPart `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
	PromptFeedback *struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback"`
	UsageMetadata *geminiUsage `json:"usageMetadata"`
	Error         *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error"`
}

type geminiUsage struct {
	PromptTokenCount        int `json:"promptTokenCount"`
	CandidatesTokenCount    int `json:"candidatesTokenCount"`
	ThoughtsTokenCount      int `json:"thoughtsTokenCount"`
	CachedContentTokenCount int `json:"cachedContentTokenCount"`
}

func (u geminiUsage) norm() llm.Usage {
	return llm.Usage{
		InputTokens:     u.PromptTokenCount,
		OutputTokens:    u.CandidatesTokenCount + u.ThoughtsTokenCount,
		CacheReadTokens: u.CachedContentTokenCount,
	}
}

func mapGeminiFinish(reason string, hasToolCall bool) string {
	switch reason {
	case "MAX_TOKENS":
		return "max_tokens"
	case "STOP", "":
		if hasToolCall {
			return "tool_use"
		}
		return "end_turn"
	default:
		if hasToolCall {
			return "tool_use"
		}
		return "end_turn"
	}
}

func isGeminiEmptyRetryable(stopReason string) bool {
	return stopReason == "end_turn" || stopReason == ""
}

// ---- HTTP + retry ----

func (p *geminiProvider) doRequest(ctx context.Context, endpoint string, body []byte, accept string) (*http.Response, error) {
	retries := geminiConnectRetries(p.cfg.Retry.ConnectAttempts)
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("content-type", "application/json")
		req.Header.Set("x-goog-api-key", p.cfg.APIKey)
		req.Header.Set("accept", accept)

		resp, err := p.client.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			return resp, nil
		}

		retryable := false
		switch {
		case err != nil:
			retryable = ctx.Err() == nil
		case isGeminiRetryableStatus(resp.StatusCode):
			retryable = true
		}
		if attempt >= retries || !retryable {
			if err != nil {
				return nil, err
			}
			data, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("gemini: status %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
		}
		if resp != nil {
			resp.Body.Close()
		}
		if !geminiBackoffSleep(ctx, geminiRetryDelay(attempt, p.cfg.Retry.ConnectInterval)) {
			return nil, ctx.Err()
		}
	}
}

func geminiConnectRetries(n int) int {
	if n == 0 {
		return geminiDefaultConnectRetries
	}
	if n < 0 {
		return 0
	}
	return n
}

func geminiEmptyRetries(n int) int {
	if n == 0 {
		return geminiDefaultEmptyRetries
	}
	if n < 0 {
		return 0
	}
	return n
}

func isGeminiRetryableStatus(code int) bool {
	switch code {
	case http.StatusRequestTimeout, // 408
		http.StatusTooManyRequests,     // 429
		http.StatusInternalServerError, // 500
		http.StatusBadGateway,          // 502
		http.StatusServiceUnavailable,  // 503
		http.StatusGatewayTimeout:      // 504
		return true
	}
	return false
}

func geminiRetryDelay(attempt int, fixed time.Duration) time.Duration {
	if fixed > 0 {
		return fixed
	}
	d := 500 * time.Millisecond * (1 << attempt)
	if d > 8*time.Second {
		d = 8 * time.Second
	}
	return d
}

func geminiBackoffSleep(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		return ctx.Err() == nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// ---- streaming ----

func (p *geminiProvider) Stream(ctx context.Context, req llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return func(yield func(llm.StreamEvent, error) bool) {
		body, err := p.buildBody(req)
		if err != nil {
			yield(llm.StreamEvent{}, err)
			return
		}
		endpoint := p.endpointURL(true)
		maxEmpty := geminiEmptyRetries(p.cfg.Retry.EmptyAttempts)

		for attempt := 0; ; attempt++ {
			resp, err := p.doRequest(ctx, endpoint, body, "text/event-stream")
			if err != nil {
				yield(llm.StreamEvent{}, err)
				return
			}

			scan := newGeminiSSEScanner(resp.Body)
			var usage llm.Usage
			var rawFinish, blockReason string
			hasToolCall := false
			emitted := false
			consumerStopped := false
			var streamErr error

			for {
				data, serr := scan.next()
				if serr == io.EOF {
					break
				}
				if serr != nil {
					streamErr = serr
					break
				}
				data = strings.TrimSpace(data)
				if data == "" || data == "[DONE]" {
					continue
				}
				var chunk geminiResp
				if err := json.Unmarshal([]byte(data), &chunk); err != nil {
					continue // tolerate keepalives
				}
				if chunk.Error != nil && (chunk.Error.Message != "" || chunk.Error.Code != 0) {
					streamErr = fmt.Errorf("gemini: %s", chunk.Error.Message)
					break
				}
				if chunk.UsageMetadata != nil {
					usage = chunk.UsageMetadata.norm()
				}
				if len(chunk.Candidates) == 0 {
					if chunk.PromptFeedback != nil && chunk.PromptFeedback.BlockReason != "" {
						blockReason = chunk.PromptFeedback.BlockReason
					}
					continue
				}
				cand := chunk.Candidates[0]
				if cand.FinishReason != "" {
					rawFinish = cand.FinishReason
				}
				for _, part := range cand.Content.Parts {
					switch {
					case part.Thought:
						if part.Text != "" {
							emitted = true
							if !yield(llm.StreamEvent{Type: llm.SEThinkingDelta, Text: part.Text}, nil) {
								consumerStopped = true
								break
							}
						}
						if part.ThoughtSignature != "" {
							if !yield(llm.StreamEvent{Type: llm.SEThinkingSignature, Text: part.ThoughtSignature}, nil) {
								consumerStopped = true
								break
							}
						}
					case part.FunctionCall != nil:
						callID := part.FunctionCall.ID
						if callID == "" {
							callID = p.nextCallID()
						}
						if part.ThoughtSignature != "" {
							p.rememberSignature(callID, part.ThoughtSignature)
							if !yield(llm.StreamEvent{Type: llm.SEThinkingSignature, Text: part.ThoughtSignature}, nil) {
								consumerStopped = true
								break
							}
						}
						emitted = true
						hasToolCall = true
						if !yield(llm.StreamEvent{
							Type:     llm.SEToolUseStart,
							ToolID:   callID,
							ToolName: part.FunctionCall.Name,
						}, nil) {
							consumerStopped = true
							break
						}
						if !yield(llm.StreamEvent{
							Type: llm.SEToolInputJSON,
							Text: marshalGeminiArgs(part.FunctionCall.Args),
						}, nil) {
							consumerStopped = true
							break
						}
					default:
						if part.ThoughtSignature != "" {
							if !yield(llm.StreamEvent{Type: llm.SEThinkingSignature, Text: part.ThoughtSignature}, nil) {
								consumerStopped = true
								break
							}
						}
						if part.Text != "" {
							emitted = true
							if !yield(llm.StreamEvent{Type: llm.SETextDelta, Text: part.Text}, nil) {
								consumerStopped = true
								break
							}
						}
					}
					if consumerStopped {
						break
					}
				}
				if consumerStopped {
					break
				}
			}
			resp.Body.Close()

			if consumerStopped {
				return
			}
			if streamErr != nil {
				yield(llm.StreamEvent{}, streamErr)
				return
			}
			if !emitted && blockReason != "" {
				yield(llm.StreamEvent{}, fmt.Errorf("gemini: prompt blocked (%s)", blockReason))
				return
			}
			if !emitted && rawFinish == "MALFORMED_FUNCTION_CALL" {
				yield(llm.StreamEvent{}, fmt.Errorf("gemini: malformed function call"))
				return
			}
			stopReason := mapGeminiFinish(rawFinish, hasToolCall)
			if !emitted && isGeminiEmptyRetryable(stopReason) && attempt < maxEmpty {
				if !geminiBackoffSleep(ctx, geminiRetryDelay(attempt, p.cfg.Retry.EmptyInterval)) {
					yield(llm.StreamEvent{}, ctx.Err())
					return
				}
				continue
			}
			if !yield(llm.StreamEvent{Type: llm.SEMessageDelta, StopReason: stopReason, Usage: usage}, nil) {
				return
			}
			yield(llm.StreamEvent{Type: llm.SEMessageStop}, nil)
			return
		}
	}
}

// ---- non-streaming ----

func (p *geminiProvider) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	body, err := p.buildBody(req)
	if err != nil {
		return llm.Message{}, "", llm.Usage{}, err
	}
	endpoint := p.endpointURL(false)
	maxEmpty := geminiEmptyRetries(p.cfg.Retry.EmptyAttempts)

	for attempt := 0; ; attempt++ {
		resp, err := p.doRequest(ctx, endpoint, body, "application/json")
		if err != nil {
			return llm.Message{}, "", llm.Usage{}, err
		}
		raw, rerr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if rerr != nil {
			return llm.Message{}, "", llm.Usage{}, rerr
		}
		msg, stop, usage, perr := p.parseResponse(raw)
		if perr != nil {
			return llm.Message{}, "", llm.Usage{}, perr
		}
		if len(msg.Content) == 0 && isGeminiEmptyRetryable(stop) && attempt < maxEmpty {
			if !geminiBackoffSleep(ctx, geminiRetryDelay(attempt, p.cfg.Retry.EmptyInterval)) {
				return llm.Message{}, "", llm.Usage{}, ctx.Err()
			}
			continue
		}
		return msg, stop, usage, nil
	}
}

func (p *geminiProvider) parseResponse(raw []byte) (llm.Message, string, llm.Usage, error) {
	var r geminiResp
	if err := json.Unmarshal(raw, &r); err != nil {
		return llm.Message{}, "", llm.Usage{}, fmt.Errorf("gemini: decode response: %w (body: %s)", err, clipBody(string(raw)))
	}
	if r.Error != nil && (r.Error.Message != "" || r.Error.Code != 0) {
		return llm.Message{}, "", llm.Usage{}, fmt.Errorf("gemini: %s", r.Error.Message)
	}
	var usage llm.Usage
	if r.UsageMetadata != nil {
		usage = r.UsageMetadata.norm()
	}
	if len(r.Candidates) == 0 {
		if r.PromptFeedback != nil && r.PromptFeedback.BlockReason != "" {
			return llm.Message{}, "", usage, fmt.Errorf("gemini: prompt blocked (%s)", r.PromptFeedback.BlockReason)
		}
		return llm.Message{Role: llm.RoleAssistant}, "end_turn", usage, nil
	}

	cand := r.Candidates[0]
	var blocks []llm.ContentBlock
	hasToolCall := false
	lastThinkingIdx := -1

	for _, part := range cand.Content.Parts {
		switch {
		case part.Thought:
			if part.Text != "" {
				blocks = append(blocks, llm.ContentBlock{
					Type:      llm.BlockThinking,
					Thinking:  part.Text,
					Signature: part.ThoughtSignature,
				})
				lastThinkingIdx = len(blocks) - 1
			} else if part.ThoughtSignature != "" && lastThinkingIdx >= 0 {
				blocks[lastThinkingIdx].Signature = part.ThoughtSignature
			}
		case part.FunctionCall != nil:
			callID := part.FunctionCall.ID
			if callID == "" {
				callID = p.nextCallID()
			}
			if part.ThoughtSignature != "" {
				p.rememberSignature(callID, part.ThoughtSignature)
				if lastThinkingIdx >= 0 && blocks[lastThinkingIdx].Signature == "" {
					blocks[lastThinkingIdx].Signature = part.ThoughtSignature
				}
			}
			blocks = append(blocks, llm.ContentBlock{
				Type:  llm.BlockToolUse,
				ID:    callID,
				Name:  part.FunctionCall.Name,
				Input: json.RawMessage(marshalGeminiArgs(part.FunctionCall.Args)),
			})
			hasToolCall = true
		default:
			if part.ThoughtSignature != "" && lastThinkingIdx >= 0 && blocks[lastThinkingIdx].Signature == "" {
				blocks[lastThinkingIdx].Signature = part.ThoughtSignature
			}
			if part.Text != "" {
				blocks = append(blocks, llm.TextBlock(part.Text))
			}
		}
	}

	if len(blocks) == 0 && cand.FinishReason == "MALFORMED_FUNCTION_CALL" {
		return llm.Message{}, "", usage, fmt.Errorf("gemini: malformed function call")
	}
	stop := mapGeminiFinish(cand.FinishReason, hasToolCall)
	return llm.Message{Role: llm.RoleAssistant, Content: blocks}, stop, usage, nil
}

// ---- SSE scanner ----

type geminiSSEScanner struct {
	r *bufio.Reader
}

func newGeminiSSEScanner(body io.Reader) *geminiSSEScanner {
	return &geminiSSEScanner{r: bufio.NewReaderSize(body, 64*1024)}
}

func (s *geminiSSEScanner) next() (string, error) {
	var buf bytes.Buffer
	for {
		line, err := s.r.ReadString('\n')
		if err != nil {
			if err == io.EOF && buf.Len() > 0 {
				return strings.TrimRight(buf.String(), "\n"), nil
			}
			return "", err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if buf.Len() > 0 {
				return strings.TrimRight(buf.String(), "\n"), nil
			}
			continue
		}
		if strings.HasPrefix(line, "data:") {
			d := strings.TrimPrefix(line[len("data:"):], " ")
			buf.WriteString(d)
			buf.WriteByte('\n')
		}
	}
}
