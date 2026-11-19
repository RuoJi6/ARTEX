package llmrec

import (
	"context"
	"encoding/json"
	"iter"
	"testing"

	"github.com/Autumn-27/norma/llm"
)

// adjustingProvider drops Thinking and Temperature like agent's compat layer.
type adjustingProvider struct{}

func (adjustingProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return func(func(llm.StreamEvent, error) bool) {}
}

func (adjustingProvider) Complete(context.Context, llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	return llm.Message{}, "", llm.Usage{}, nil
}

func (adjustingProvider) WireRequest(req llm.CompletionRequest) llm.CompletionRequest {
	req.Thinking = ""
	req.Temperature = nil
	return req
}

func (adjustingProvider) WireThinkingType(string) string { return "" }

func TestRecorderRecordsWireAdjustedRequest(t *testing.T) {
	r := Wrap(adjustingProvider{}, nil, "claude-opus-5-5", "p", "disabled", "", nil)
	temp := 0.0
	raw := r.serializeRequest(llm.CompletionRequest{
		Messages:    []llm.Message{llm.UserText("hi")},
		Thinking:    "disabled",
		Temperature: &temp,
	})
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		t.Fatalf("unmarshal %q: %v", raw, err)
	}
	if _, ok := m["thinking"]; ok {
		t.Errorf("recorded thinking %v that was never sent", m["thinking"])
	}
	if _, ok := m["temperature"]; ok {
		t.Errorf("recorded temperature %v that was never sent", m["temperature"])
	}
}
