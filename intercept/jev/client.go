package jev

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Autumn-27/artex/intercept"
)

const (
	DefaultBaseURL = "https://api.typesafe.ai"
	DefaultModel   = "jev-latest"
	maxStateBytes  = 24000
)

// Config contains only the System One connection settings. Jev is deliberately
// not represented as an agent/llm.Provider format.
type Config struct {
	BaseURL string
	APIKey  string
	Model   string
	Client  *http.Client
}

type Request struct {
	Model     string                    `json:"model"`
	State     any                       `json:"state"`
	Questions map[string]ChoiceQuestion `json:"questions"`
}

type ChoiceQuestion struct {
	Type         string            `json:"type"`
	Instructions string            `json:"instructions"`
	Criteria     map[string]string `json:"criteria"`
}

type Response struct {
	Answers map[string]Answer `json:"answers"`
	Usage   map[string]any    `json:"usage,omitempty"`
}

type Answer struct {
	Type          string             `json:"type"`
	Choice        string             `json:"choice"`
	Confidence    float64            `json:"confidence"`
	Probabilities map[string]float64 `json:"probabilities"`
}

func (c Config) endpoint() (string, error) {
	base := strings.TrimSpace(c.BaseURL)
	if base == "" {
		base = DefaultBaseURL
	}
	base = strings.TrimRight(base, "/")
	if strings.HasSuffix(base, "/v1/systemone") {
		return base, nil
	}
	if strings.HasSuffix(base, "/v1") {
		return base + "/systemone", nil
	}
	u, err := url.Parse(base)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("System One Base URL 无效")
	}
	return base + "/v1/systemone", nil
}

func BuildRequest(input intercept.ReviewInput, prompt, model string) (Request, error) {
	if strings.TrimSpace(model) == "" {
		model = DefaultModel
	}
	policy := strings.TrimSpace(prompt)
	if policy == "" {
		policy = "根据工具调用、参数、工作目录和脚本快照，选择 allow、ask 或 deny。"
	}
	if len(policy) > 6000 {
		policy = policy[:6000] + "…"
	}
	// System One accepts structured state. Keep policy and review evidence in one
	// bounded object; the model receives no requirement to emit free-form JSON.
	policy = "判定政策（仅作为选择依据；直接回答 choice，不要输出 JSON 或自由文本解释）：\n" + policy
	state := map[string]any{"review_input": input, "policy": policy}
	b, err := json.Marshal(state)
	if err != nil {
		return Request{}, err
	}
	if len(b) > maxStateBytes {
		// Arguments can be supplied by an untrusted tool. Preserve valid JSON while
		// bounding the request by replacing the evidence with a clipped JSON string.
		trimmed := string(b)
		if len(trimmed) > 16000 {
			trimmed = trimmed[:16000]
		}
		state = map[string]any{
			"review_input_json": trimmed,
			"policy":            policy,
			"truncated":         true,
		}
	}
	return Request{
		Model: model,
		State: state,
		Questions: map[string]ChoiceQuestion{
			"decision": {
				Type:         "choice",
				Instructions: "Choose the action for this tool call. Apply the supplied policy and evidence.",
				Criteria: map[string]string{
					"allow": "Safe to execute without human review",
					"ask":   "Needs human approval before executing",
					"deny":  "Must be blocked",
				},
			},
		},
	}, nil
}

func (c Config) Do(ctx context.Context, req Request) (Response, error) {
	endpoint, err := c.endpoint()
	if err != nil {
		return Response{}, err
	}
	body, err := json.Marshal(req)
	if err != nil {
		return Response{}, err
	}
	hc := c.Client
	if hc == nil {
		hc = http.DefaultClient
	}
	hreq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return Response{}, err
	}
	hreq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(c.APIKey))
	hreq.Header.Set("Content-Type", "application/json")
	resp, err := hc.Do(hreq)
	if err != nil {
		return Response{}, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return Response{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Response{}, fmt.Errorf("System One HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	var out Response
	if err := json.Unmarshal(raw, &out); err != nil {
		return Response{}, fmt.Errorf("System One 响应无效: %w", err)
	}
	return out, nil
}

func DecisionFromResponse(resp Response, threshold float64, profileID int64) (intercept.Decision, error) {
	if threshold <= 0 || threshold > 1 {
		threshold = 0.55
	}
	a, ok := resp.Answers["decision"]
	if !ok {
		return intercept.Decision{ProfileID: profileID}, fmt.Errorf("System One 缺少 decision 答案")
	}
	choice := strings.ToLower(strings.TrimSpace(a.Choice))
	if choice != "allow" && choice != "ask" && choice != "deny" {
		return intercept.Decision{ProfileID: profileID}, fmt.Errorf("System One 返回了无效裁决 %q", a.Choice)
	}
	if a.Confidence < threshold {
		choice = "ask"
	}
	return intercept.Decision{
		Action:    choice,
		ProfileID: profileID,
		Message:   FormatMessage(choice, a.Confidence, a.Probabilities),
	}, nil
}

func FormatMessage(choice string, confidence float64, probabilities map[string]float64) string {
	parts := make([]string, 0, 3)
	for _, k := range []string{"allow", "ask", "deny"} {
		if p, ok := probabilities[k]; ok {
			parts = append(parts, fmt.Sprintf("%s %.0f%%", k, p*100))
		}
	}
	if len(parts) == 0 {
		return fmt.Sprintf("Jev / System One 判定：%s（置信度 %.0f%%）", choice, confidence*100)
	}
	return fmt.Sprintf("Jev / System One 判定：%s（置信度 %.0f%%；概率 %s）", choice, confidence*100, strings.Join(parts, "，"))
}

func (c Config) Review(ctx context.Context, input intercept.ReviewInput, prompt string, threshold float64, profileID int64) (intercept.Decision, error) {
	req, err := BuildRequest(input, prompt, c.Model)
	if err != nil {
		return intercept.Decision{ProfileID: profileID}, err
	}
	resp, err := c.Do(ctx, req)
	if err != nil {
		return intercept.Decision{ProfileID: profileID}, err
	}
	return DecisionFromResponse(resp, threshold, profileID)
}

func (c Config) TestConnection(ctx context.Context) (time.Duration, string, error) {
	start := time.Now()
	req, err := BuildRequest(intercept.ReviewInput{Version: 5, Tool: "connection_test", Arguments: json.RawMessage(`{}`)}, "Reply with the safest choice for this harmless connection test.", c.Model)
	if err != nil {
		return 0, "", err
	}
	resp, err := c.Do(ctx, req)
	if err != nil {
		return 0, "", err
	}
	a, err := DecisionFromResponse(resp, 0, 0)
	if err != nil {
		return 0, "", err
	}
	return time.Since(start), a.Message, nil
}
