package server

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/mysterysecurityteam/traffic"
)

func repeaterTestSend(t *testing.T, s *Server, payload any) (int, repeaterSendResponse, string) {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "/api/repeater/send", bytes.NewReader(raw))
	w := httptest.NewRecorder()
	s.sendRepeater(w, r)
	var out repeaterSendResponse
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out, w.Body.String()
}

func TestRepeaterRejectsInvalidInput(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "")
	s := &Server{}
	for _, tc := range []struct {
		name string
		body string
	}{
		{"missing url", `{"method":"GET"}`},
		{"empty method", `{"method":"  ","url":"https://example.test/"}`},
		{"bad scheme", `{"method":"GET","url":"file:///etc/passwd"}`},
		{"gopher", `{"method":"GET","url":"gopher://example.test/1"}`},
		{"unknown method", `{"method":"TRACE","url":"http://example.test/"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/api/repeater/send", strings.NewReader(tc.body))
			w := httptest.NewRecorder()
			s.sendRepeater(w, r)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("status=%d want 400 body=%s", w.Code, w.Body.String())
			}
		})
	}
}

func TestRepeaterBlockedIPs(t *testing.T) {
	for _, raw := range []string{"127.0.0.1", "::1", "169.254.169.254", "0.0.0.0", "224.0.0.1"} {
		if !repeaterIsBlockedDialIP(net.ParseIP(raw)) {
			t.Errorf("expected %s blocked", raw)
		}
	}
	for _, raw := range []string{"8.8.8.8", "10.0.0.1", "192.168.1.20", "172.16.0.5"} {
		if repeaterIsBlockedDialIP(net.ParseIP(raw)) {
			t.Errorf("expected %s allowed", raw)
		}
	}

	t.Setenv(repeaterAllowLocalEnv, "")
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("loopback handler should not be reached")
	}))
	defer srv.Close()
	code, _, body := repeaterTestSend(t, &Server{}, map[string]any{"url": srv.URL, "use_recording_proxy": false})
	if code != http.StatusBadRequest || !strings.Contains(body, "拒绝") {
		t.Fatalf("loopback status=%d body=%s", code, body)
	}
}

func TestRepeaterRejectsLegacyNumericHostsIncludingProxyPath(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "")
	for _, raw := range []string{
		"http://2130706433/", // decimal 127.0.0.1
		"http://0177.0.0.1/", // octal 127.0.0.1
		"http://127.1/",      // two-part inet_aton form
		"http://0x7f000001/", // hexadecimal 127.0.0.1
		"http://9999999999/", // numeric-looking but invalid
	} {
		u, err := url.Parse(raw)
		if err != nil {
			t.Fatal(err)
		}
		if err := repeaterCheckURL(u); err == nil {
			t.Errorf("repeaterCheckURL(%q) allowed a legacy numeric host", raw)
		}
	}

	// The check must run before a configured proxy gets a chance to interpret
	// the legacy spelling and connect to loopback remotely.
	proxy := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("proxy received a blocked numeric target")
	}))
	defer proxy.Close()
	s := &Server{m: &Manager{globalProxy: proxy.URL}}
	code, _, body := repeaterTestSend(t, s, map[string]any{"url": "http://2130706433/"})
	if code != http.StatusBadRequest || !strings.Contains(body, "拒绝") {
		t.Fatalf("proxied legacy host status=%d body=%s", code, body)
	}
}

func TestRepeaterBlockSensitiveDial(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "")
	for _, address := range []string{"127.0.0.1:80", "169.254.169.254:80"} {
		if err := repeaterBlockSensitiveDial("tcp", address, nil); err == nil {
			t.Errorf("repeaterBlockSensitiveDial(%q) allowed blocked address", address)
		}
	}
}

func TestRepeaterTransportBlocksSensitiveDial(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "")
	tr := (&Server{}).repeaterTransport(false, false).(*http.Transport)
	defer tr.CloseIdleConnections()
	if tr.DialContext == nil {
		t.Fatal("direct transport has no guarded DialContext")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	conn, err := tr.DialContext(ctx, "tcp", "127.0.0.1:1")
	if conn != nil {
		conn.Close()
	}
	if err == nil || !strings.Contains(err.Error(), "拒绝访问本机/链路本地地址 127.0.0.1") {
		t.Fatalf("dial should fail at the sensitive-address guard, got %v", err)
	}
}

func TestRepeaterDirectHTTP2(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ProtoMajor != 2 {
			t.Errorf("request protocol=%s, want HTTP/2", r.Proto)
		}
		_, _ = io.WriteString(w, "h2 response")
	}))
	srv.EnableHTTP2 = true
	srv.TLS = &tls.Config{NextProtos: []string{"h2"}}
	srv.StartTLS()
	defer srv.Close()

	code, out, raw := repeaterTestSend(t, &Server{}, map[string]any{
		"url": srv.URL, "use_recording_proxy": false, "insecure_skip_verify": true,
	})
	if code != http.StatusOK || out.Error != "" || out.Status != http.StatusOK || out.Proto != "HTTP/2.0" || out.Body != "h2 response" {
		t.Fatalf("HTTP/2 response status=%d raw=%s", code, raw)
	}
}

func TestRepeaterTLSHandshakeUsesRequestTimeout(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	// Scale down the inherited timeout so a slow handshake can be tested
	// without waiting for the default transport's ten-second deadline.
	base := http.DefaultTransport
	short := base.(*http.Transport).Clone()
	short.TLSHandshakeTimeout = 10 * time.Millisecond
	http.DefaultTransport = short
	defer func() { http.DefaultTransport = base }()
	defer short.CloseIdleConnections()

	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "handshake completed")
	}))
	srv.TLS = &tls.Config{GetConfigForClient: func(*tls.ClientHelloInfo) (*tls.Config, error) {
		time.Sleep(100 * time.Millisecond)
		return nil, nil
	}}
	srv.StartTLS()
	defer srv.Close()

	code, out, raw := repeaterTestSend(t, &Server{}, map[string]any{
		"url": srv.URL, "use_recording_proxy": false, "insecure_skip_verify": true, "timeout_ms": 1000,
	})
	if code != http.StatusOK || out.Error != "" || out.Status != http.StatusOK || out.Body != "handshake completed" {
		t.Fatalf("handshake within request budget failed: status=%d raw=%s", code, raw)
	}
}

func TestRepeaterClosesIdleConnections(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	for _, mode := range []string{"direct", "http2", "global proxy", "recording proxy fallback"} {
		t.Run(mode, func(t *testing.T) {
			closed := make(chan struct{}, 1)
			srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.WriteString(w, "response")
			}))
			srv.Config.ConnState = func(_ net.Conn, state http.ConnState) {
				if state == http.StateClosed {
					closed <- struct{}{}
				}
			}
			if mode == "http2" {
				srv.EnableHTTP2 = true
				srv.StartTLS()
			} else {
				srv.Start()
			}
			defer srv.Close()

			s := &Server{}
			payload := map[string]any{"url": srv.URL, "use_recording_proxy": false, "insecure_skip_verify": true}
			if mode == "global proxy" || mode == "recording proxy fallback" {
				s.m = &Manager{globalProxy: srv.URL}
				payload["url"] = "http://target.example/"
				if mode == "recording proxy fallback" {
					delete(payload, "use_recording_proxy")
				}
			}
			code, out, raw := repeaterTestSend(t, s, payload)
			if code != http.StatusOK || out.Error != "" || out.Status != http.StatusOK || out.Body != "response" {
				t.Fatalf("status=%d raw=%s", code, raw)
			}
			select {
			case <-closed:
			case <-time.After(time.Second):
				t.Fatal("connection still open after sendRepeater returned")
			}
		})
	}
}

func TestRepeaterRoundTripHeadersAndBody(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	var got http.Request
	var gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = *r
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.Header().Set("X-Echo", "ok")
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, "hello")
	}))
	defer srv.Close()

	code, out, body := repeaterTestSend(t, &Server{}, map[string]any{
		"method": "POST", "url": srv.URL, "headers": map[string]string{
			"X-Test": "yes", "Host": "custom.example", "Connection": "keep-alive",
			"Keep-Alive": "timeout=5", "Transfer-Encoding": "chunked", "Content-Length": "99",
		}, "body": "payload", "use_recording_proxy": false,
	})
	if code != http.StatusOK || out.Error != "" {
		t.Fatalf("status=%d out=%+v raw=%s", code, out, body)
	}
	if out.Status != http.StatusCreated || out.Body != "hello" || out.BodyBytes != 5 {
		t.Fatalf("response=%+v", out)
	}
	if out.Headers["X-Echo"][0] != "ok" || got.Method != http.MethodPost || gotBody != "payload" || got.Host != "custom.example" {
		t.Fatalf("request method=%s host=%s body=%q headers=%v", got.Method, got.Host, gotBody, got.Header)
	}
	for _, name := range []string{"Connection", "Keep-Alive", "Transfer-Encoding"} {
		if got.Header.Get(name) != "" {
			t.Errorf("hop-by-hop header %s was forwarded: %q", name, got.Header.Get(name))
		}
	}
	if got.Header.Get("Content-Length") != "7" {
		t.Errorf("content length should match body, got %q", got.Header.Get("Content-Length"))
	}
}

func TestRepeaterTruncatesAndHonoursHEAD(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	large := strings.Repeat("x", repeaterMaxBody+1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			_, _ = io.WriteString(w, "should-not-be-read")
			return
		}
		_, _ = io.WriteString(w, large)
	}))
	defer srv.Close()
	_, out, _ := repeaterTestSend(t, &Server{}, map[string]any{"url": srv.URL, "use_recording_proxy": false})
	if !out.BodyTruncated || out.BodyBytes != repeaterMaxBody || len(out.Body) != repeaterMaxBody {
		t.Fatalf("truncation=%+v", out)
	}
	_, head, _ := repeaterTestSend(t, &Server{}, map[string]any{"method": "HEAD", "url": srv.URL, "use_recording_proxy": false})
	if head.Body != "" || head.BodyBytes != 0 {
		t.Fatalf("HEAD body=%q bytes=%d", head.Body, head.BodyBytes)
	}
}

func TestRepeaterBodyTextReplacesBinaryControls(t *testing.T) {
	if got := repeaterBodyText([]byte{'a', 0, 0xff, 'b'}); got != "a��b" {
		t.Fatalf("body text=%q", got)
	}
}

func TestRepeaterRejectsCrossHostRedirect(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "target") }))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer redirect.Close()
	_, out, _ := repeaterTestSend(t, &Server{}, map[string]any{"url": redirect.URL, "use_recording_proxy": false})
	if out.Status != 0 || !strings.Contains(out.Error, "跨主机") {
		t.Fatalf("redirect response=%+v", out)
	}
}

func TestRepeaterProxyTransportConstruction(t *testing.T) {
	s := &Server{m: &Manager{}}
	for _, scheme := range []string{"http", "https", "socks5", "socks5h"} {
		tr := s.httpProxyTransport(httpExec{Proxy: scheme + "://user:pass@127.0.0.1:1080"})
		if tr == nil || tr.Proxy == nil {
			t.Fatalf("%s proxy transport not configured: %#v", scheme, tr)
		}
		proxyURL, err := tr.Proxy(httptest.NewRequest(http.MethodGet, "https://target.example/", nil))
		if err != nil || proxyURL == nil || proxyURL.Scheme != scheme || proxyURL.Host != "127.0.0.1:1080" {
			t.Fatalf("%s proxy URL = %#v, err=%v", scheme, proxyURL, err)
		}
		if user := proxyURL.User; user == nil || user.Username() != "user" {
			t.Fatalf("%s proxy credentials missing: %v", scheme, proxyURL.User)
		}
		password, ok := proxyURL.User.Password()
		if !ok || password != "pass" {
			t.Fatalf("%s proxy password missing: %q (ok=%v)", scheme, password, ok)
		}
	}

	// With capture disabled, the recording-proxy option must preserve the
	// configured global proxy URL instead of treating it as a host:port.
	s.m.globalProxy = "socks5://user:pass@127.0.0.1:1080"
	tr := s.httpProxyTransport(httpExec{UseRecordingProxy: true})
	if tr == nil || tr.Proxy == nil {
		t.Fatal("global SOCKS5 proxy was not configured")
	}
	proxyURL, err := tr.Proxy(httptest.NewRequest(http.MethodGet, "https://target.example/", nil))
	if err != nil || proxyURL == nil || proxyURL.Scheme != "socks5" {
		t.Fatalf("global proxy URL = %#v, err=%v", proxyURL, err)
	}

	// Capture mode supplies a complete HTTP URL from Traffic.ProxyAddr. The
	// helper must preserve that scheme and host rather than prefixing http:// a
	// second time.
	captured, err := traffic.Open(t.TempDir(), "127.0.0.1:18788")
	if err != nil {
		t.Fatalf("traffic.Open: %v", err)
	}
	defer captured.Close()
	s.m.traffic = captured
	s.m.trafficOn = true
	tr = s.httpProxyTransport(httpExec{UseRecordingProxy: true})
	if tr == nil || tr.Proxy == nil {
		t.Fatal("recording proxy was not configured")
	}
	proxyURL, err = tr.Proxy(httptest.NewRequest(http.MethodGet, "https://target.example/", nil))
	if err != nil || proxyURL == nil || proxyURL.Scheme != "http" || proxyURL.Host != "127.0.0.1:18788" {
		t.Fatalf("recording proxy URL = %#v, err=%v", proxyURL, err)
	}
	caFile := s.m.ProxyCACert()
	if caFile == "" {
		t.Fatal("recording proxy CA path is empty")
	}
	caPEM, err := os.ReadFile(caFile)
	if err != nil {
		t.Fatalf("read recording proxy CA: %v", err)
	}
	wantRoots := x509.NewCertPool()
	if !wantRoots.AppendCertsFromPEM(caPEM) {
		t.Fatal("recording proxy CA is not valid PEM")
	}
	if tr.TLSClientConfig == nil || tr.TLSClientConfig.RootCAs == nil || !tr.TLSClientConfig.RootCAs.Equal(wantRoots) {
		t.Fatal("recording proxy CA was not loaded into transport RootCAs")
	}
	if s.repeaterTransport(true, false).(*http.Transport).ForceAttemptHTTP2 {
		t.Fatal("recording proxy transport must not force HTTP/2")
	}
}

func TestRepeaterRedactProxyCredentials(t *testing.T) {
	for _, scheme := range []string{"http", "https", "socks5", "socks5h"} {
		t.Run(scheme, func(t *testing.T) {
			proxyErr := &url.Error{
				Op: "proxyconnect", URL: scheme + "://proxy-user:proxy-secret@127.0.0.1:1080",
				Err: errors.New("connection refused"),
			}
			for _, err := range []error{proxyErr, fmt.Errorf("send request: %w", proxyErr)} {
				got := repeaterRedactError(err)
				if strings.Contains(got, "proxy-secret") || strings.Contains(got, "proxy-user") {
					t.Fatalf("proxy credentials leaked: %q", got)
				}
				if got != "proxyconnect 127.0.0.1:1080: connection refused" {
					t.Fatalf("unexpected redacted error: %q", got)
				}
			}
		})
	}
}

func TestRepeaterHonorsExplicitHTTPVersion(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, r.Proto)
	}))
	srv.EnableHTTP2 = true
	srv.StartTLS()
	defer srv.Close()
	for _, version := range []string{"HTTP/1.1", "HTTP/2.0"} {
		t.Run(version, func(t *testing.T) {
			code, out, raw := repeaterTestSend(t, &Server{}, map[string]any{
				"method": "GET", "url": srv.URL, "http_version": version,
				"insecure_skip_verify": true, "use_recording_proxy": false,
			})
			if code != http.StatusOK || out.Error != "" || out.Body != version {
				t.Fatalf("version %s: status=%d response=%s", version, code, raw)
			}
		})
	}
	code, _, _ := repeaterTestSend(t, &Server{}, map[string]any{"method": "GET", "url": srv.URL, "http_version": "HTTP/1.0"})
	if code != http.StatusBadRequest {
		t.Fatalf("unsupported version status=%d", code)
	}
}

func TestRepeaterExplicitHTTP2Cleartext(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, r.Proto) }))
	srv.Config.Protocols = new(http.Protocols)
	srv.Config.Protocols.SetUnencryptedHTTP2(true)
	srv.Start()
	defer srv.Close()
	code, out, raw := repeaterTestSend(t, &Server{}, map[string]any{"method": "GET", "url": srv.URL, "http_version": "HTTP/2.0", "use_recording_proxy": false})
	if code != http.StatusOK || out.Error != "" || out.Body != "HTTP/2.0" {
		t.Fatalf("status=%d response=%s", code, raw)
	}
}
