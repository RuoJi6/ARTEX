package enrich

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Stop after receiving the probe so this request regression needs no database.
func TestProbeUserAgent(t *testing.T) {
	for _, ua := range []string{"", "Captured-UA/1.0"} {
		t.Run(ua, func(t *testing.T) {
			t.Setenv("ARTEX_HTTP_USER_AGENT", ua)
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if got := r.UserAgent(); got != ua {
					t.Errorf("User-Agent = %q, want %q", got, ua)
				}
				if _, present := r.Header["User-Agent"]; ua == "" && present {
					t.Error("empty User-Agent present on wire")
				}
				http.Redirect(w, r, "/stop", http.StatusFound)
			}))
			defer server.Close()
			client := buildClient(nil)
			client.CheckRedirect = func(*http.Request, []*http.Request) error {
				return errors.New("probe captured")
			}
			e := &Engine{client: client}
			e.doHTTP(1, server.URL)
			if calls != 1 {
				t.Fatalf("probe calls = %d, want 1", calls)
			}
		})
	}
}
