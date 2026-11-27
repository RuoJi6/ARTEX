package agent

import (
	"context"
	"strings"
	"testing"
)

func TestNormalizeOutputLang(t *testing.T) {
	cases := map[string]string{
		"en": "en", "EN": "en", " en ": "en",
		"zh": "zh", "": "zh", "fr": "zh", "en-US": "zh",
	}
	for in, want := range cases {
		if got := NormalizeOutputLang(in); got != want {
			t.Errorf("NormalizeOutputLang(%q) = %q, want %q", in, got, want)
		}
	}
}

// Chinese tasks must get no extra text, so their prompts stay byte-identical.
func TestOutputLangDirectiveZHIsEmpty(t *testing.T) {
	for _, lang := range []string{"", "zh", "fr"} {
		if got := OutputLangDirective(lang); got != "" {
			t.Errorf("OutputLangDirective(%q) = %q, want empty", lang, got)
		}
	}
}

func TestOutputLangDirectiveENOverridesChineseAndKeepsKeys(t *testing.T) {
	got := OutputLangDirective("en")
	for _, want := range []string{"Write all natural-language output in English", "overrides every instruction", "JSON keys", "do not translate"} {
		if !strings.Contains(got, want) {
			t.Errorf("English directive missing %q", want)
		}
	}
}

func TestWithOutputLangRoundTrip(t *testing.T) {
	if got := outputLangFrom(context.Background()); got != "zh" {
		t.Errorf("default = %q, want zh", got)
	}
	ctx := WithOutputLang(context.Background(), "en")
	if got := outputLangFrom(ctx); got != "en" {
		t.Errorf("en = %q", got)
	}
	if got := outputLangFrom(WithOutputLang(context.Background(), "zh")); got != "zh" {
		t.Errorf("zh = %q", got)
	}
}

// Setting the language on an agent must store the normalized value, so an unknown
// value can never switch a task to an unsupported language.
func TestSetOutputLangNormalizes(t *testing.T) {
	p := &Planner{}
	p.SetOutputLang("en")
	if p.outputLang != "en" || OutputLangDirective(p.outputLang) == "" {
		t.Errorf("planner en: %q", p.outputLang)
	}
	p.SetOutputLang("klingon")
	if p.outputLang != "zh" || OutputLangDirective(p.outputLang) != "" {
		t.Errorf("planner unknown: %q", p.outputLang)
	}
	w := &Worker{}
	w.SetOutputLang("en")
	if w.outputLang != "en" {
		t.Errorf("worker: %q", w.outputLang)
	}
	m := &MainAgent{}
	m.SetOutputLang("")
	if m.outputLang != "zh" {
		t.Errorf("mainagent default: %q", m.outputLang)
	}
}

// The English directive must come after every Chinese guidance block that
// deferredSystem appends, so it is the last instruction text in the prompt.
func TestDeferredSystemPutsOutputLangDirectiveLast(t *testing.T) {
	def := DeferredInfo{
		FindingGuidance:      "\n漏洞记录指引",
		CaseGuidance:         "\n案例指引",
		IntelligenceGuidance: "\n情报指引",
		GlobalNames:          []string{"some_tool"},
	}
	sys, _ := deferredSystemWithLang("系统提示", def, "en")
	if len(sys) != 2 {
		t.Fatalf("want text + deferred-tools segments, got %d", len(sys))
	}
	text := sys[0]
	if !strings.HasSuffix(text, englishOutputDirective) {
		t.Fatalf("directive is not the tail of the text segment:\n%s", text)
	}
	d := strings.Index(text, englishOutputDirective)
	for _, g := range []string{def.FindingGuidance, def.CaseGuidance, def.IntelligenceGuidance} {
		if i := strings.Index(text, g); i < 0 || i > d {
			t.Errorf("guidance %q not before the directive", g)
		}
	}
	if strings.Contains(sys[1], "Output language") {
		t.Errorf("directive leaked into the deferred-tools block")
	}
	zh, _ := deferredSystemWithLang("系统提示", def, "zh")
	if strings.Contains(zh[0], englishOutputDirective) {
		t.Errorf("zh task got the English directive")
	}
}

// A Chat turn (how the reporter agent runs) follows the language on its context: a
// plain or zh context keeps the prompt byte-identical, an en one ends with the
// English directive.
func TestChatSystemPromptFollowsContextLanguage(t *testing.T) {
	def := DeferredInfo{FindingGuidance: "\n漏洞记录指引"}
	plain, _ := chatSystemPrompt(context.Background(), "reporter", "/data", "/work", def)
	zh, _ := chatSystemPrompt(WithOutputLang(context.Background(), "zh"), "reporter", "/data", "/work", def)
	en, _ := chatSystemPrompt(WithOutputLang(context.Background(), "en"), "reporter", "/data", "/work", def)
	if strings.Join(plain, "") != strings.Join(zh, "") {
		t.Fatal("zh context changed the chat system prompt")
	}
	if strings.Contains(plain[0], "Output language") {
		t.Fatal("default chat prompt has the English directive")
	}
	if !strings.HasSuffix(en[0], OutputLangDirective("en")) || !strings.HasPrefix(en[0], plain[0]) {
		t.Fatalf("en chat prompt does not end with the directive: %q", en[0])
	}
}
