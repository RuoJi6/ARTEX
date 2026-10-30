package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWorkerCompactContextSettingsRoundTrip(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer m.Close()
	old, existed, err := m.pg.GetSetting(settingWorkerCompactContext)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if existed {
			_ = m.pg.SetSetting(settingWorkerCompactContext, old)
		} else {
			_, _ = m.pg.Exec("DELETE FROM settings WHERE key=$1", settingWorkerCompactContext)
		}
	})
	if _, err := m.pg.Exec("DELETE FROM settings WHERE key=$1", settingWorkerCompactContext); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := New(ctx, m, t.TempDir(), t.TempDir(), t.TempDir())

	request := func(method, body string) map[string]any {
		t.Helper()
		res := httptest.NewRecorder()
		req := httptest.NewRequest(method, "/api/settings", strings.NewReader(body))
		if method == http.MethodGet {
			s.getSettings(res, req)
		} else {
			s.putSettings(res, req)
		}
		if res.Code != http.StatusOK {
			t.Fatalf("%s settings status=%d body=%s", method, res.Code, res.Body.String())
		}
		var payload map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
			t.Fatal(err)
		}
		return payload
	}

	if got := request(http.MethodGet, "")[settingWorkerCompactContext]; got != false {
		t.Fatalf("default worker_compact_context=%v, want false", got)
	}
	if got := request(http.MethodPut, `{"worker_compact_context":true}`)[settingWorkerCompactContext]; got != true {
		t.Fatalf("enabled worker_compact_context=%v, want true", got)
	}
	if !m.WorkerCompactContextEnabled() || request(http.MethodGet, "")[settingWorkerCompactContext] != true {
		t.Fatal("enabled value was not persisted")
	}
	if got := request(http.MethodPut, `{"worker_compact_context":false}`)[settingWorkerCompactContext]; got != false {
		t.Fatalf("disabled worker_compact_context=%v, want false", got)
	}
	if m.WorkerCompactContextEnabled() {
		t.Fatal("disabled value was not persisted")
	}
}
