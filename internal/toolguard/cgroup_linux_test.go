//go:build linux

package toolguard

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDelegatedCgroupLimitsAndCleanup(t *testing.T) {
	const limit = 24 << 20
	scope := newCgroupScope(limit, 128)
	if scope == nil {
		t.Skip("no delegated cgroup v2 subtree with the memory controller")
	}
	t.Cleanup(scope.Cleanup)
	if raw, err := os.ReadFile(filepath.Join(scope.dir, "memory.max")); err != nil || strings.TrimSpace(string(raw)) != "25165824" {
		t.Fatalf("memory.max = %q, %v", raw, err)
	}
	if cgControllers["pids"] {
		if raw, err := os.ReadFile(filepath.Join(scope.dir, "pids.max")); err != nil || strings.TrimSpace(string(raw)) != "128" {
			t.Fatalf("pids.max = %q, %v", raw, err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	res := run(ctx, Config{MemoryLimitMB: 24}.withDefaults(), child("memory"), scope, 0, nil)
	if !scope.active {
		t.Skip("the environment blocked atomic cgroup attachment")
	}
	if !res.KilledByCgroup || !res.MemoryKilled || res.TimedOut {
		t.Fatalf("expected kernel OOM kill: %+v", res)
	}
	scope.Cleanup()
	if _, err := os.Stat(scope.dir); !os.IsNotExist(err) {
		t.Fatalf("cgroup remains after cleanup: %v", err)
	}
}
