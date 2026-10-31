package jev

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/intercept"
)

func TestBuildRequestMapsReviewInputAndChoiceCriteria(t *testing.T) {
	req, err := BuildRequest(intercept.ReviewInput{Version: 5, Tool: "Bash", Arguments: json.RawMessage(`{"cmd":"ls"}`)}, "policy text", "jev-test")
	if err != nil {
		t.Fatal(err)
	}
	if req.Model != "jev-test" || req.Questions["decision"].Type != "choice" {
		t.Fatalf("unexpected request: %#v", req)
	}
	b, _ := json.Marshal(req.State)
	if !strings.Contains(string(b), "Bash") || !strings.Contains(string(b), "policy text") {
		t.Fatalf("state did not include review and policy: %s", b)
	}
	if len(b) > maxStateBytes+2000 {
		t.Fatalf("state exceeded bound: %d", len(b))
	}
}

func TestBuildRequestBoundsLargeEvidence(t *testing.T) {
	args := json.RawMessage(`{"payload":"` + strings.Repeat("x", 50000) + `"}`)
	req, err := BuildRequest(intercept.ReviewInput{Version: 5, Tool: "Bash", Arguments: args}, strings.Repeat("policy ", 3000), "")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(req.State)
	if len(b) > maxStateBytes+500 {
		t.Fatalf("bounded state size=%d", len(b))
	}
	if !strings.Contains(string(b), `"truncated":true`) {
		t.Fatalf("large evidence was not marked truncated: %s", b[:min(len(b), 200)])
	}
}

func TestDecisionFromResponseLowConfidenceForcesAsk(t *testing.T) {
	d, err := DecisionFromResponse(Response{Answers: map[string]Answer{
		"decision": {Choice: "allow", Confidence: 0.3, Probabilities: map[string]float64{"allow": 0.8, "ask": 0.1, "deny": 0.1}},
	}}, 0.55, 42)
	if err != nil {
		t.Fatal(err)
	}
	if d.Action != "ask" || d.ProfileID != 42 || !strings.Contains(d.Message, "置信度") {
		t.Fatalf("unexpected decision: %#v", d)
	}
}

func TestDecisionFromResponseRejectsMissingOrInvalidAnswer(t *testing.T) {
	for _, resp := range []Response{
		{Answers: map[string]Answer{}},
		{Answers: map[string]Answer{"decision": {Choice: "maybe", Confidence: 1}}},
	} {
		if _, err := DecisionFromResponse(resp, 0.55, 1); err == nil {
			t.Fatalf("expected invalid response error for %#v", resp)
		}
	}
}

func TestSystemOneReviewAndConnectionTest(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/systemone" {
			t.Errorf("path=%s", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		var req Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode: %v", err)
		}
		if req.Questions["decision"].Criteria["deny"] == "" {
			t.Error("missing deny criterion")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"answers":{"decision":{"type":"choice","choice":"deny","confidence":0.91,"probabilities":{"allow":0.02,"ask":0.07,"deny":0.91}}}}`))
	}))
	defer srv.Close()
	c := Config{BaseURL: srv.URL, APIKey: "secret", Model: "jev-latest", Client: srv.Client()}
	d, err := c.Review(context.Background(), intercept.ReviewInput{Version: 5, Tool: "Write", Arguments: json.RawMessage(`{}`)}, "policy", 0.55, 9)
	if err != nil || d.Action != "deny" {
		t.Fatalf("review decision=%#v err=%v", d, err)
	}
	if gotAuth != "Bearer secret" {
		t.Fatalf("auth=%q", gotAuth)
	}
	if _, _, err := c.TestConnection(context.Background()); err != nil {
		t.Fatalf("connection test: %v", err)
	}
}
