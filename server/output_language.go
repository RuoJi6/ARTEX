package server

import (
	"strings"

	"github.com/Autumn-27/artex/db"
)

// localeHeader carries the web UI's locale (e.g. "en", "zh-CN") on every /api call;
// the frontend's HTTP helper sets it. It decides the language the task's LLM agents
// write in, so an English-interface user gets English output.
const localeHeader = "X-Artex-Locale"

// outputLanguageForLocale maps a UI locale to the output language: English locales
// ("en", "en-US", ...) give "en"; everything else, including an empty header, gives
// "zh", the historical behaviour.
func outputLanguageForLocale(locale string) string {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(locale)), "en") {
		return "en"
	}
	return "zh"
}

// createOutputLanguage picks a new task's output language for POST /api/tasks: an
// explicit output_language in the body wins, and an empty or omitted one falls back
// to the X-Artex-Locale header.
func createOutputLanguage(body, localeHeaderValue string) string {
	if strings.TrimSpace(body) != "" {
		return db.NormalizeOutputLanguage(strings.TrimSpace(body))
	}
	return outputLanguageForLocale(localeHeaderValue)
}

// spawnOutputLanguage picks a spawn_task child's output language: an explicit
// output_language wins, then the parent task's language (so a child of an English
// task stays English), then "zh".
func spawnOutputLanguage(explicit string, parent *Task) string {
	if strings.TrimSpace(explicit) != "" {
		return db.NormalizeOutputLanguage(strings.TrimSpace(explicit))
	}
	if parent != nil {
		return db.NormalizeOutputLanguage(parent.OutputLanguage)
	}
	return "zh"
}

// outputLanguageParam is the spawn_task schema entry for output_language.
func outputLanguageParam() map[string]any {
	return map[string]any{"type": "string", "enum": []string{"zh", "en"},
		"description": "可选：子任务 LLM 智能体的输出语言。zh=中文，en=English；留空则继承父任务(parent_ref)的语言，再回退 zh。用户用英文交流时请传 en"}
}
