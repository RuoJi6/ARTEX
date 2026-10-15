package selfupdate

import (
	"crypto/tls"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProxyValidation(t *testing.T) {
	for _, raw := range []string{"", "  ", "http://127.0.0.1:7897", "https://user:secret@proxy.example:443", "socks5://localhost:1080", "socks5h://[::1]:1080"} {
		if _, err := NewClient(raw); err != nil {
			t.Errorf("valid proxy rejected: %v", err)
		}
	}
	for _, raw := range []string{"127.0.0.1:7897", "ftp://proxy", "http://", "http://:7897", "http://proxy:0", "http://proxy:65536", "http://proxy:", "http://proxy/path", "http://proxy?x=1", "http://proxy#fragment", "http://user:secret@proxy:bad"} {
		if _, err := NewClient(raw); err == nil {
			t.Error("invalid proxy accepted")
		} else if strings.Contains(err.Error(), "secret") {
			t.Fatal("proxy validation leaked password")
		}
	}
}

func TestDirectClientIgnoresEnvironmentProxy(t *testing.T) {
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:1")
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:1")
	c, err := NewClient("")
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseIdleConnections()
	transport := c.Transport.(*http.Transport)
	if transport.Proxy != nil {
		t.Fatal("direct client must not consult environment proxies")
	}
	if transport.TLSClientConfig != nil && transport.TLSClientConfig.InsecureSkipVerify {
		t.Fatal("TLS verification disabled")
	}
}

// Exercise real HTTP CONNECT routing for metadata, checksum and archive requests.
// The proxy returns a sentinel error; none of these requests may fall back direct.
func TestUpdateRequestsUseProxy(t *testing.T) {
	var hosts []string
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodConnect {
			t.Errorf("expected CONNECT, got %s", r.Method)
		}
		hosts = append(hosts, r.Host)
		http.Error(w, "test proxy refuses tunnel", http.StatusBadGateway)
	}))
	defer proxy.Close()
	c, err := NewClient(proxy.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseIdleConnections()
	if _, err := FetchLatest(t.Context(), c); err == nil {
		t.Fatal("expected proxy error")
	}
	for _, name := range []string{"SHA256SUMS", "artex-0.3.21-linux-arm64.zip"} {
		if _, err := get(t.Context(), c, "https://github.com/"+Repo+"/releases/download/v0.3.21/"+name); err == nil {
			t.Fatal("expected proxy error")
		}
	}
	if len(hosts) != 3 || hosts[0] != "api.github.com:443" || hosts[1] != "github.com:443" || hosts[2] != "github.com:443" {
		t.Fatalf("unexpected proxy requests: %v", hosts)
	}
}

func TestClientRejectsUnsafeRedirect(t *testing.T) {
	target := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://example.com/untrusted", http.StatusFound)
	}))
	defer target.Close()
	c, _ := NewClient("")
	defer c.CloseIdleConnections()
	c.Transport.(*http.Transport).TLSClientConfig = &tls.Config{RootCAs: target.Client().Transport.(*http.Transport).TLSClientConfig.RootCAs}
	resp, err := c.Get(target.URL)
	if resp != nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
	if err == nil || !strings.Contains(err.Error(), "拒绝非 GitHub") {
		t.Fatalf("unsafe redirect accepted: %v", err)
	}
}
