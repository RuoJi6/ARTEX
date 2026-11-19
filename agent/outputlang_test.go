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
