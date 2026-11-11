package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Autumn-27/norma/agentcore"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/permission"
)

type fetchFixtureProvider struct {
	autoTitleProvider
	t     *testing.T
	url   string
	calls int
}

func (p *fetchFixtureProvider) Complete(_ context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	p.calls++
	if p.calls == 1 {
		counts := map[string]int{}
		for _, tool := range req.Tools {
			counts[tool.Name]++
		}
		if counts["WebFetch"] != 1 || counts["Read"] != 1 || counts["Bash"] != 1 {
			p.t.Errorf("session tool registration = %v", counts)
		}
		input, _ := json.Marshal(map[string]string{"url": p.url})
		return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{{Type: llm.BlockToolUse, ID: "fetch-fixture", Name: "WebFetch", Input: input}}}, "tool_use", llm.Usage{}, nil
	}
	return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{llm.TextBlock("finished")}}, "end_turn", llm.Usage{}, nil
}

func TestAgentSessionUsesConfiguredWebFetch(t *testing.T) {
	for _, ua := range []string{"", "Captured-UA/1.0"} {
		t.Run(ua, func(t *testing.T) {
			t.Setenv("ARTEX_HTTP_USER_AGENT", ua)
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.UserAgent() != ua {
					t.Errorf("session sent User-Agent %q, want %q", r.UserAgent(), ua)
				}
				w.Write([]byte("fixture"))
			}))
			defer server.Close()
			provider := &fetchFixtureProvider{t: t, url: server.URL}
			session := newAgentSession(agentcore.Options{
				Provider: provider, NonStreaming: true, EnableWebFetch: true,
				PermissionMode: permission.ModeBypass, MaxTurns: 3,
			})
			defer session.Close()
			for _, err := range session.Prompt(t.Context(), "fetch local fixture") {
				if err != nil {
					t.Fatal(err)
				}
			}
			if calls != 1 {
				t.Fatalf("WebFetch calls = %d, want 1", calls)
			}
		})
	}
}
