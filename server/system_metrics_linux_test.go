//go:build linux

package server

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCgroupEffectiveLimit(t *testing.T) {
	root := t.TempDir()
	parent := filepath.Join(root, "container")
	leaf := filepath.Join(parent, "app")
	if err := os.MkdirAll(leaf, 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(dir, name, value string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(value), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(leaf, "memory.max", "max\n")
	write(parent, "memory.max", "1073741824\n")
	write(root, "memory.max", "2147483648\n")
	write(leaf, "pids.max", "48\n")
	write(parent, "pids.max", "64\n")
	d := controllerDirs{root: root, leaf: leaf, v2: true}
	if got := cgroupLimit(d, "memory.max", "memory.limit_in_bytes"); got != 1<<30 {
		t.Fatalf("expected parent's memory limit, got %d", got)
	}
	if got := cgroupLimit(d, "pids.max", "pids.max"); got != 48 {
		t.Fatalf("expected the smaller leaf PID limit, got %d", got)
	}
	write(leaf, "memory.limit_in_bytes", "9223372036854771712\n")
	d.v2 = false
	if got := cgroupLimit(d, "memory.max", "memory.limit_in_bytes"); got != 0 {
		t.Fatalf("v1 unlimited sentinel reported as a bound: %d", got)
	}
}
