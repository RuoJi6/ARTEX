package httpidentity

import (
	"net/http"
	"net/http/httptest"
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
				if got := r.Header.Get("User-Agent"); got != tc.want {
					t.Errorf("User-Agent = %q, want %q", got, tc.want)
				}
				if _, present := r.Header["User-Agent"]; tc.want == "" && present {
					t.Error("empty User-Agent must be absent on the wire")
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
