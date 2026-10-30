package server

import (
	"encoding/json"
	"net/http/httptest"
	"runtime"
	"testing"
)

func TestSystemMetricsReturnsContainerAndDiskValues(t *testing.T) {
	s := &Server{dataDir: t.TempDir()}
	r := httptest.NewRequest("GET", "/api/system/metrics", nil)
	w := httptest.NewRecorder()
	s.systemMetrics(w, r)
	if w.Code != 200 {
		t.Fatalf("status=%d, want 200", w.Code)
	}
	var got systemMetricsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got.Scope == "" || got.Timestamp.IsZero() {
		t.Fatalf("unexpected response metadata: %+v", got)
	}
	if runtime.GOOS != "linux" {
		if got.Supported || got.Scope != "unsupported" {
			t.Fatalf("unsupported platform returned metrics: %+v", got)
		}
		return
	}
	if got.Disk.TotalBytes == 0 || got.DataDisk.TotalBytes == 0 {
		t.Fatalf("disk metrics missing: %+v", got)
	}
}
