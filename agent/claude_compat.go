package agent

import (
	"context"
	"iter"
	"strconv"
	"strings"

	"github.com/Autumn-27/artex/llmrec"
	"github.com/Autumn-27/norma/llm"
)

// The recorder must see the request as sent, not as the caller built it.
var _ llmrec.WireAdjuster = compatProvider{}

// Newer Claude models reject two request fields that ARTEX's helper calls send:
//
//   - "thinking":{"type":"disabled"} — sent by compaction, side-question
//     summaries, credential extraction, intercept review and auto titles.
//     Opus 5.5, Sonnet 5.5 and the Fable/Mythos models return HTTP 400 for it at
//     every effort level; Opus 5 and Haiku 5.5 accept it only at effort "high"
//     or lower.
//   - "temperature" (and other sampling knobs) — sent by intercept review.
//     Removed on Opus 4.7+, Sonnet 5+, Haiku 5.5 and Fable/Mythos.
//
// Those calls are fire-and-forget helpers, so a 400 there silently breaks the
// feature (most visibly: compaction, which ends long tasks). claudeCompat drops
// the offending fields for models known to reject them and leaves every other
// model — older Claude models, OpenAI models, Anthropic-compatible gateways
// serving non-Claude models — byte-for-byte unchanged.
type claudeCompat struct {
	// dropDisabledThinking turns a "disabled" thinking override into "" so the
	// request inherits the profile's thinking mode (normally omitted, which these
	// models run as adaptive thinking).
	dropDisabledThinking bool
	// dropTemperature clears CompletionRequest.Temperature.
	dropTemperature bool
}

func (c claudeCompat) active() bool { return c.dropDisabledThinking || c.dropTemperature }

// claudeModel is a parsed "claude-<family>-<major>[-<minor>]" model id.
type claudeModel struct {
	family       string // opus / sonnet / haiku / fable / mythos
	major, minor int
}

// parseClaudeModel extracts the family and version from a model id. It accepts
// platform prefixes and suffixes ("anthropic.claude-opus-5-5",
// "claude-opus-4-5@20251101", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
// and rejects the legacy "claude-3-5-sonnet" ordering, which predates every
// restriction handled here.
func parseClaudeModel(model string) (claudeModel, bool) {
	s := strings.ToLower(strings.TrimSpace(model))
	i := strings.Index(s, "claude-")
	if i < 0 {
		return claudeModel{}, false
	}
	s = s[i+len("claude-"):]
	// Drop Vertex "@date", Bedrock ":0" and context suffixes like "[1m]"; accept
	// gateway spellings with a dotted version ("claude-opus-4.7").
	if j := strings.IndexAny(s, "@:["); j >= 0 {
		s = s[:j]
	}
	s = strings.ReplaceAll(s, ".", "-")
	parts := strings.Split(s, "-")
	m := claudeModel{family: parts[0]}
	switch m.family {
	case "fable", "mythos":
		// Every release of these families rejects both fields, so the version
		// (if any — e.g. "claude-mythos-preview") does not matter.
		return m, true
	case "opus", "sonnet", "haiku":
	default:
		return claudeModel{}, false
	}
	if len(parts) < 2 {
		return claudeModel{}, false
	}
	major, err := strconv.Atoi(parts[1])
	if err != nil || len(parts[1]) > 2 {
		return claudeModel{}, false
	}
	m.major = major
	// A third short numeric part is the minor version; a long one is a snapshot
	// date ("claude-opus-4-20250514" is Opus 4.0).
	if len(parts) > 2 && len(parts[2]) <= 2 {
		if minor, err := strconv.Atoi(parts[2]); err == nil {
			m.minor = minor
		}
	}
	return m, true
}

// atLeast reports whether the model version is >= major.minor.
func (m claudeModel) atLeast(major, minor int) bool {
	return m.major > major || (m.major == major && m.minor >= minor)
}

// claudeCompatFor decides which fields to drop for a model at the profile's
// configured reasoning effort. Unknown or non-Claude models get the zero value.
func claudeCompatFor(model, effort string) claudeCompat {
	m, ok := parseClaudeModel(model)
	if !ok {
		return claudeCompat{}
	}
	highEffort := false
	switch strings.ToLower(strings.TrimSpace(effort)) {
	case "xhigh", "max":
		highEffort = true
	}
	var c claudeCompat
	switch m.family {
	case "fable", "mythos":
		c.dropDisabledThinking = true
		c.dropTemperature = true
	case "opus":
		c.dropTemperature = m.atLeast(4, 7)
		c.dropDisabledThinking = m.atLeast(5, 5) || (m.atLeast(5, 0) && highEffort)
	case "sonnet":
		c.dropTemperature = m.atLeast(5, 0)
		c.dropDisabledThinking = m.atLeast(5, 5)
	case "haiku":
		c.dropTemperature = m.atLeast(5, 5)
		c.dropDisabledThinking = m.atLeast(5, 5) && highEffort
	}
	return c
}

// apply returns req with the incompatible fields removed. req is a value copy;
// only top-level fields are reassigned, so the caller's slices are untouched.
func (c claudeCompat) apply(req llm.CompletionRequest) llm.CompletionRequest {
	if c.dropDisabledThinking && strings.EqualFold(strings.TrimSpace(req.Thinking), "disabled") {
		req.Thinking = ""
	}
	if c.dropTemperature {
		req.Temperature = nil
	}
	return req
}

// compatProvider applies claudeCompat to every request before the wire.
type compatProvider struct {
	inner  llm.Provider
	compat claudeCompat
}

func (p compatProvider) Stream(ctx context.Context, req llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return p.inner.Stream(ctx, p.compat.apply(req))
}

func (p compatProvider) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	return p.inner.Complete(ctx, p.compat.apply(req))
}

// WireRequest and WireThinkingType implement llmrec.WireAdjuster, so the LLM
// record ledger shows what was actually sent rather than the caller's request.
func (p compatProvider) WireRequest(req llm.CompletionRequest) llm.CompletionRequest {
	return p.compat.apply(req)
}

func (p compatProvider) WireThinkingType(profile string) string {
	if p.compat.dropDisabledThinking && strings.EqualFold(strings.TrimSpace(profile), "disabled") {
		return ""
	}
	return profile
}

// withClaudeCompat wraps prov only when the model needs it, so providers for
// every other model keep their concrete type and behavior.
func withClaudeCompat(prov llm.Provider, c claudeCompat) llm.Provider {
	if !c.active() {
		return prov
	}
	return compatProvider{inner: prov, compat: c}
}
