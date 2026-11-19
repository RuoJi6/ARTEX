package server

import "strings"

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
