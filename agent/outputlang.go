package agent

import (
	"context"
	"strings"
)

// Output language for LLM agents. A task is either "zh" (the default: the prompts
// are Chinese and so is what the agents write) or "en". The prompts stay Chinese in
// both cases; for "en" a directive is appended to the system prompt, which tells the
// model to write all natural-language output in English. This leaves the prompts,
// including user-edited ones stored in the database, untouched.

// NormalizeOutputLang returns "en" for an English request and "zh" otherwise.
func NormalizeOutputLang(lang string) string {
	if strings.EqualFold(strings.TrimSpace(lang), "en") {
		return "en"
	}
	return "zh"
}

// OutputLangDirective is the system-prompt tail for lang: empty for "zh", the English
// directive for "en". Callers append it as the last part of an agent's system prompt
// so it takes precedence over the Chinese instructions above it.
func OutputLangDirective(lang string) string {
	if NormalizeOutputLang(lang) != "en" {
		return ""
	}
	return englishOutputDirective
}

const englishOutputDirective = `

━━ Output language (this overrides every instruction above that asks for Chinese) ━━
Write all natural-language output in English. That covers your reasoning notes, plans, todo items, goal and constraint text, findings, evidence and fact summaries, asset notes, reports, and final summaries, even where the instructions above say to write in Chinese. Quoted target content (page text, command output, error messages) stays exactly as observed. Keep JSON keys, tool and parameter names, enum values, field names, commands, URLs and file paths exactly as specified; do not translate them.`

type outputLangKey struct{}

// WithOutputLang records the task's output language on ctx for code paths that take
// a context but no agent struct (goal decomposition).
func WithOutputLang(ctx context.Context, lang string) context.Context {
	return context.WithValue(ctx, outputLangKey{}, NormalizeOutputLang(lang))
}

func outputLangFrom(ctx context.Context) string {
	if v, ok := ctx.Value(outputLangKey{}).(string); ok {
		return v
	}
	return "zh"
}
