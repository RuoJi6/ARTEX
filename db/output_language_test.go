package db

import "testing"

func TestNormalizeOutputLanguage(t *testing.T) {
	cases := map[string]string{"en": "en", "EN": "en", "zh": "zh", "": "zh", "en-US": "zh", "ja": "zh"}
	for in, want := range cases {
		if got := NormalizeOutputLanguage(in); got != want {
			t.Errorf("NormalizeOutputLanguage(%q) = %q, want %q", in, got, want)
		}
	}
}
