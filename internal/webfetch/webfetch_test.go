package webfetch

import (
	"context"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	actool "github.com/Autumn-27/norma/tool"
)

func callFetch(t *testing.T, tool actool.CoreTool, target string, extract bool) actool.Result {
	t.Helper()
	input, err := json.Marshal(map[string]any{"url": target, "extract": extract})
	if err != nil {
		t.Fatal(err)
	}
	result, err := tool.Call(context.Background(), input, nil)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestIdentityAcrossRoutes(t *testing.T) {
	for _, ua := range []string{"", "Captured-UA/1.0"} {
		for _, route := range []string{"direct", "proxy", "fallback"} {
			t.Run(route+"/"+ua, func(t *testing.T) {
				t.Setenv("ARTEX_HTTP_USER_AGENT", ua)
				var targetCalls, proxyCalls atomic.Int32
				var mu sync.Mutex
				var selected string
				checkUA := func(r *http.Request) {
					mu.Lock()
					defer mu.Unlock()
					got := r.UserAgent()
					if ua == "" && !strings.HasPrefix(got, "Mozilla/5.0 ") {
						t.Errorf("random UA missing: %q", got)
					} else if ua != "" && got != ua {
						t.Errorf("User-Agent = %q, want %q", got, ua)
					}
					if selected != "" && selected != got {
						t.Errorf("redirect/retry UA changed from %q to %q", selected, got)
					}
					selected = got
				}
				target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					targetCalls.Add(1)
					checkUA(r)
					if r.URL.Path == "/start" {
						http.Redirect(w, r, "/page", http.StatusFound)
						return
					}
					w.Header().Set("Content-Type", "text/html")
					fmt.Fprint(w, `<h1>Page</h1><!--keep--><script src="/app.js"></script><form action="/submit"><input name="csrf" type="hidden" value="token"></form>`)
				}))
				defer target.Close()
				proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					proxyCalls.Add(1)
					checkUA(r)
					if route == "fallback" {
						conn, _, err := w.(http.Hijacker).Hijack()
						if err != nil {
							t.Error(err)
							return
						}
						conn.Close() // Deterministic EOF, causing the SDK-compatible retry.
						return
					}
					req := r.Clone(r.Context())
					req.RequestURI = ""
					// A forwarding proxy must preserve absence, like ARTEX's sink.
					if _, present := req.Header["User-Agent"]; !present {
						req.Header.Set("User-Agent", "")
					}
					resp, err := target.Client().Do(req)
					if err != nil {
						t.Error(err)
						w.WriteHeader(http.StatusBadGateway)
						return
					}
					defer resp.Body.Close()
					for key, values := range resp.Header {
						w.Header()[key] = values
					}
					w.WriteHeader(resp.StatusCode)
					io.Copy(w, resp.Body)
				}))
				defer proxy.Close()
				cfg := actool.WebFetchConfig{}
				if route != "direct" {
					cfg.Proxy = proxy.URL
				}
				result := callFetch(t, New(cfg), target.URL+"/start", true)
				for _, want := range []string{"[200 OK]", "# Page", "=== RECON ===", "keep", "/app.js", "csrf(hidden=token)"} {
					if result.IsError || !strings.Contains(result.Flatten(), want) {
						t.Fatalf("missing %q in result: %+v", want, result)
					}
				}
				if targetCalls.Load() != 2 {
					t.Errorf("target calls = %d, want 2", targetCalls.Load())
				}
				if route != "direct" && proxyCalls.Load() == 0 {
					t.Error("configured proxy was bypassed")
				}
			})
		}
	}
}

func TestTLSAndStaticAssetGuard(t *testing.T) {
	t.Setenv("ARTEX_HTTP_USER_AGENT", "Captured-UA/1.0")
	var calls atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.UserAgent() != "Captured-UA/1.0" {
			t.Errorf("User-Agent = %q", r.UserAgent())
		}
		fmt.Fprint(w, "verified")
	}))
	defer server.Close()
	certPath := filepath.Join(t.TempDir(), "ca.pem")
	cert := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw})
	if err := os.WriteFile(certPath, cert, 0600); err != nil {
		t.Fatal(err)
	}
	tool := New(actool.WebFetchConfig{CACert: certPath})
	if result := callFetch(t, tool, server.URL, false); result.IsError || !strings.Contains(result.Flatten(), "verified") {
		t.Fatalf("CA trust lost: %+v", result)
	}
	if result := callFetch(t, tool, server.URL+"/app.js?v=1", false); !result.IsError {
		t.Fatalf("static asset guard lost: %+v", result)
	}
	if calls.Load() != 1 {
		t.Errorf("static asset triggered network request: calls = %d", calls.Load())
	}
}

func TestIdentitySelectedForEachCall(t *testing.T) {
	t.Setenv("ARTEX_HTTP_USER_AGENT", "Before-Tool-Creation")
	tool := New(actool.WebFetchConfig{})
	seen := make(chan string, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.UserAgent()
		fmt.Fprint(w, "ok")
	}))
	defer server.Close()
	for _, want := range []string{"First-Call", "Second-Call"} {
		t.Setenv("ARTEX_HTTP_USER_AGENT", want)
		if result := callFetch(t, tool, server.URL, false); result.IsError {
			t.Fatal(result.Flatten())
		}
		if got := <-seen; got != want {
			t.Fatalf("identity cached across calls: got %q, want %q", got, want)
		}
	}
}

func TestSDKMetadataPreserved(t *testing.T) {
	base := actool.NewWebFetch(actool.WebFetchConfig{})
	local := New(actool.WebFetchConfig{})
	if local.Name() != base.Name() || local.Description() != base.Description() || !reflect.DeepEqual(local.InputSchema(), base.InputSchema()) {
		t.Fatal("SDK tool contract changed")
	}
}
