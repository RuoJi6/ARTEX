package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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

// The web client sends X-Artex-Locale on every /api call, so CORS preflight must
// allow it or split frontend/backend deploys break.
func TestCORSAllowsLocaleHeader(t *testing.T) {
	r := httptest.NewRequest(http.MethodOptions, "http://127.0.0.1:8787/api/tasks", nil)
	r.Header.Set("Origin", "http://127.0.0.1:3000")
	r.Header.Set("Access-Control-Request-Method", "POST")
	r.Header.Set("Access-Control-Request-Headers", "content-type,x-artex-locale")
	w := httptest.NewRecorder()
	cors(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("preflight reached handler") })).ServeHTTP(w, r)
	allowed := strings.ToLower(w.Header().Get("Access-Control-Allow-Headers"))
	if w.Code != http.StatusNoContent || !strings.Contains(allowed, "x-artex-locale") {
		t.Fatalf("preflight code=%d allow-headers=%q", w.Code, allowed)
	}
}
