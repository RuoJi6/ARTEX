package traffic

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	mproxy "github.com/lqqyt2423/go-mitmproxy/proxy"
)

func TestProxyPreservesUserAgent(t *testing.T) {
	for _, ua := range []string{"", "Captured-UA/1.0"} {
		t.Run(ua, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if got := r.UserAgent(); got != ua {
					t.Errorf("forwarded User-Agent = %q, want %q", got, ua)
				}
				if _, present := r.Header["User-Agent"]; ua == "" && present {
					t.Error("proxy reintroduced a User-Agent")
				}
			}))
			defer server.Close()
			u, _ := url.Parse(server.URL)
			flow := &mproxy.Flow{Request: &mproxy.Request{URL: u, Header: make(http.Header)}}
			if ua != "" {
				flow.Request.Header.Set("User-Agent", ua)
			}
			(&sink{}).Requestheaders(flow)
			// go-mitmproxy rebuilds the outbound request by adding every value.
			req, _ := http.NewRequest(http.MethodGet, server.URL, nil)
			for key, values := range flow.Request.Header {
				for _, value := range values {
					req.Header.Add(key, value)
				}
			}
			resp, err := server.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if ua == "" && strings.Contains(requestHeaderLines(flow.Request), "User-Agent:") {
				t.Error("recording contains a synthetic header that was not sent")
			}
		})
	}
}
