package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/traffic"
)

func TestParseProxyBatchValidationAndDedup(t *testing.T) {
	entries, errs := ParseProxyBatch("http://user:pass@127.0.0.1:8080|one\nhttp://user:pass@127.0.0.1:8080\nftp://bad:1\n# comment\n")
	if len(entries) != 1 || len(errs) != 2 {
		t.Fatalf("entries=%d errs=%d", len(entries), len(errs))
	}
	if entries[0].URL == "" || !strings.Contains(entries[0].URL, "pass") {
		t.Fatalf("parser lost stored credential")
	}
}

func TestProxyPoolSnapshotMasksCredentialsAndDisabledHealth(t *testing.T) {
	m := &Manager{proxyPool: &proxyPoolState{entries: []proxyPoolEntry{{ProxyPoolEntry: ProxyPoolEntry{ID: "1", Enabled: false, Health: "healthy"}, RawURL: "http://user:secret@host:8080"}}, logs: []ProxySwitchLog{{From: "http://user:secret@host:8080", To: "http://user:secret2@host:8081", Reason: "timed"}}}}
	entries, _, logs := m.ProxyPoolSnapshot()
	if strings.Contains(entries[0].URL, "secret") || entries[0].Health != "disabled" {
		t.Fatalf("entry leaked or wrong state: %+v", entries[0])
	}
	if strings.Contains(logs[0].From, "secret") || strings.Contains(logs[0].To, "secret2") {
		t.Fatalf("switch log leaked credentials: %+v", logs[0])
	}
}

func TestProxyPoolSequentialSkipsUnhealthyAndDisabled(t *testing.T) {
	m := &Manager{proxyPool: &proxyPoolState{active: "a", entries: []proxyPoolEntry{
		{ProxyPoolEntry: ProxyPoolEntry{ID: "a", Enabled: true, Health: "healthy"}},
		{ProxyPoolEntry: ProxyPoolEntry{ID: "b", Enabled: false, Health: "healthy"}},
		{ProxyPoolEntry: ProxyPoolEntry{ID: "c", Enabled: true, Health: "unhealthy-cooling"}},
		{ProxyPoolEntry: ProxyPoolEntry{ID: "d", Enabled: true, Health: "healthy"}},
	}}}
	if got := m.selectHealthyLocked("a"); got != "d" {
		t.Fatalf("selected %q", got)
	}
}

func TestProxyPoolIntervalLowerBound(t *testing.T) {
	if minProxyRotateInterval >= 5 {
		t.Fatalf("bound must allow the documented 5s setting")
	}
	if minProxyRotateInterval != 3 {
		t.Fatalf("bound=%d, rationale expects 3s", minProxyRotateInterval)
	}
}

func TestProxyPoolPersistenceKeepsRawURL(t *testing.T) {
	b, err := json.Marshal(proxyPoolPersist{Entries: []proxyPoolEntry{{ProxyPoolEntry: ProxyPoolEntry{ID: "1", URL: "http://***@host:1"}, RawURL: "http://user:pass@host:1"}}})
	if err != nil || !strings.Contains(string(b), "raw_url") || !strings.Contains(string(b), "pass") {
		t.Fatalf("bad persistence encoding: %s", b)
	}
}

func TestProxyPoolURLKeyNormalizesHostCase(t *testing.T) {
	a, _ := traffic.ValidateProxyURL("http://user:pass@HOST:8080")
	b, _ := traffic.ValidateProxyURL("http://user:pass@host:8080")
	if proxyURLKey(a) != proxyURLKey(b) {
		t.Fatalf("keys differ: %q %q", proxyURLKey(a), proxyURLKey(b))
	}
}

func TestMergeMaskedProxyURLPreservesOnlyPassword(t *testing.T) {
	got, err := mergeMaskedProxyURL("http://newuser:***@NEW.example:9090", "http://old:secret@old.example:8080")
	if err != nil {
		t.Fatal(err)
	}
	if got != "http://newuser:secret@NEW.example:9090" {
		t.Fatalf("got %q", got)
	}
}

func TestMergeMaskedProxyURLErrorIsMasked(t *testing.T) {
	_, err := mergeMaskedProxyURL("http://user:secret@", "")
	if err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatalf("unmasked error: %v", err)
	}
}

func TestDynamicForwardProxyUsesCurrentUpstream(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("ok")) }))
	defer target.Close()
	up := ""
	fp, err := newDynamicForwardProxy(func() string { return up })
	if err != nil {
		t.Fatal(err)
	}
	defer fp.Close()
	pu, _ := url.Parse(fp.Addr())
	c := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(pu)}}
	resp, err := c.Get(target.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
}
