package agent

import "strings"

// OutputLanguage resolves the instance setting when a runtime prompt is built.
// Stored prompt bodies and version history are never changed by this policy.
var OutputLanguage func() string

const englishOutputDirective = `Output language: English.
Write all generated natural-language output in English, including progress messages,
replies, titles, delegated task descriptions, objectives (set_goals text), intent
summaries (add_intent summary), fact summaries/details (record_fact summary/detail),
findings, reports, and tool arguments containing these texts. This also applies
when instructions, prior context, or source material are Chinese. This instruction
supersedes conflicting language preferences only; all task, scope, evidence, and
safety rules still apply.
When instructions prescribe Chinese Markdown headings or labels, use English
equivalents, e.g. 概述 -> Overview, 复现步骤 -> Reproduction steps, 步骤 1 ->
Step 1, 根因分析 -> Root cause analysis, 修复建议 -> Remediation.
Preserve tool names, JSON keys, enum values, identifiers, commands, code, payloads,
URLs, paths, and quoted evidence exactly. Do not translate or rewrite raw requests,
responses, logs, credentials, or user-supplied values.`

func withOutputLanguage(prompt string) string {
	if prompt == "" || OutputLanguage == nil || OutputLanguage() != "en" {
		return prompt
	}
	return prompt + "\n\n" + englishOutputDirective
}

// OutputLanguageSystem applies the current policy to a copied system prompt.
// Side questions can replay snapshots captured before a language change.
func OutputLanguageSystem(system []string) []string {
	out := make([]string, 0, len(system)+1)
	for _, part := range system {
		if part != englishOutputDirective {
			out = append(out, strings.ReplaceAll(part, "\n\n"+englishOutputDirective, ""))
		}
	}
	if OutputLanguage != nil && OutputLanguage() == "en" {
		out = append(out, englishOutputDirective)
	}
	return out
}
