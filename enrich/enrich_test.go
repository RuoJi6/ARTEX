package enrich

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
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
				if got := r.UserAgent(); ua == "" && !strings.HasPrefix(got, "Mozilla/5.0 ") {
					t.Errorf("random UA missing: %q", got)
				} else if ua != "" && got != ua {
					t.Errorf("User-Agent = %q, want %q", got, ua)
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
