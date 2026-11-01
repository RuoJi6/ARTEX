package server

import (
	"encoding/json"
	"strings"
	"testing"
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
