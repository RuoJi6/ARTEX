package httpidentity

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

func TestApplyOnWire(t *testing.T) {
	for _, tc := range []struct{ name, value, want string }{
		{"empty", "", ""},
		{"configured", " Captured-UA/1.0 ", "Captured-UA/1.0"},
		{"whitespace", "   ", ""},
		{"injection", "ok\r\nX-Injected: yes", ""},
		{"non-ascii", "客户端", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("ARTEX_HTTP_USER_AGENT", tc.value)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				got := r.UserAgent()
				if tc.want == "" && !slices.Contains(userAgents[:], got) {
					t.Errorf("default User-Agent is not a browser sample: %q", got)
				} else if tc.want != "" && got != tc.want {
					t.Errorf("User-Agent = %q, want %q", got, tc.want)
				}
				if r.Header.Get("X-Injected") != "" {
					t.Error("header injection")
				}
			}))
			defer server.Close()
			req, err := http.NewRequest(http.MethodGet, server.URL, nil)
			if err != nil {
				t.Fatal(err)
			}
			Apply(req)
			resp, err := server.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
		})
	}
}

func TestRandomUserAgentSelection(t *testing.T) {
	// Exercise every choice deterministically without a statistical/flaky test.
	for index, want := range userAgents {
		if got := randomUserAgent(bytes.NewReader([]byte{byte(index)})); got != want {
			t.Errorf("choice %d = %q, want %q", index, got, want)
		}
	}
	if got := randomUserAgent(bytes.NewReader(nil)); got != userAgents[0] {
		t.Errorf("entropy failure fallback = %q", got)
	}
}
