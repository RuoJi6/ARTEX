package server

import "testing"

func TestOutputLanguageForLocale(t *testing.T) {
	cases := map[string]string{
		"en": "en", "en-US": "en", "EN-gb": "en", " en ": "en",
		"zh-CN": "zh", "zh": "zh", "": "zh", "fr-FR": "zh",
	}
	for in, want := range cases {
		if got := outputLanguageForLocale(in); got != want {
			t.Errorf("outputLanguageForLocale(%q) = %q, want %q", in, got, want)
		}
	}
}
