package toolguard

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	if code, handled := BackgroundHelper(os.Args[1:]); handled {
		os.Exit(code)
	}
	os.Exit(m.Run())
}

func TestGuardChild(t *testing.T) {
	// Use a fixed-size child workload, never a machine-wide stress test.
	switch os.Getenv("ARTEX_TEST_GUARD_CHILD") {
	case "memory":
		b := make([]byte, 48<<20)
		for i := 0; i < len(b); i += os.Getpagesize() {
			b[i] = 1
		}
		fmt.Println("allocated")
		time.Sleep(10 * time.Second)
		runtime.KeepAlive(b)
	case "output":
		fmt.Fprint(os.Stdout, "stdout")
		fmt.Fprint(os.Stderr, "stderr")
		os.Exit(7)
	case "sleep":
		time.Sleep(10 * time.Second)
	}
}

func child(mode string) *exec.Cmd {
	cmd := exec.Command(os.Args[0], "-test.run=^TestGuardChild$")
	cmd.Env = append(os.Environ(), "ARTEX_TEST_GUARD_CHILD="+mode)
	return cmd
}

func TestRunOutputAndExitCode(t *testing.T) {
	res := Run(context.Background(), Config{MaxOutputBytes: 8}, child("output"))
	if res.Output != "stdoutst" || !res.OutputTruncated || res.ExitCode != 7 || res.Err == nil {
		t.Fatalf("unexpected result: %+v", res)
	}
}

func TestRunDoesNotStartCancelledCommand(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	cmd := child("output")
	res := Run(ctx, Config{}, cmd)
	if cmd.Process != nil || !errors.Is(res.Err, context.Canceled) {
		t.Fatalf("unexpected result: %+v", res)
	}
}

func TestRunTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	res := Run(ctx, Config{}, child("sleep"))
	if !res.TimedOut || res.MemoryKilled || !errors.Is(res.Err, context.DeadlineExceeded) {
		t.Fatalf("unexpected result: %+v", res)
	}
}

func TestWatchdogLimitsDescendantMemory(t *testing.T) {
	if !watchdogAvailable() {
		t.Skip("no process memory watchdog on this platform")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.Command("bash", "-c", `"$1" -test.run='^TestGuardChild$' & wait`, "guard-test", os.Args[0])
	cmd.Env = append(os.Environ(), "ARTEX_TEST_GUARD_CHILD=memory")
	cfg := Config{MemoryLimitMB: 16, PollInterval: 30 * time.Millisecond}.withDefaults()
	// Explicitly exercise the fallback even if this host has delegated cgroups.
	res := run(ctx, cfg, cmd, nil, 0, nil)
	if !res.MemoryKilled || res.KilledByCgroup || res.TimedOut || res.PeakMemoryBytes <= 16<<20 {
		t.Fatalf("expected watchdog to terminate the process tree: %+v", res)
	}
}

func TestRunDoesNotLeaveBackgroundChildren(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix process-group cleanup")
	}
	marker := filepath.Join(t.TempDir(), "child-survived")
	cmd := exec.Command("bash", "-c", `(sleep 0.4; touch "$1") & printf done`, "guard-test", marker)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	res := Run(ctx, Config{}, cmd)
	if res.Err != nil || res.Output != "done" {
		t.Fatalf("unexpected result: %+v", res)
	}
	time.Sleep(550 * time.Millisecond)
	if _, err := os.Stat(marker); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("command left descendants running: stat = %v", err)
	}
}

func TestProcParsing(t *testing.T) {
	if pp, pg, ok := parseProcStat([]byte("12 (name with ) inside) S 10 11 7")); !ok || pp != 10 || pg != 11 {
		t.Fatalf("unexpected stat parse: %d %d %t", pp, pg, ok)
	}
	if n, ok := parseProcStatusBytes([]byte("Name:\ttest\nVmRSS:\t400 kB\nVmSwap:\t20 kB\n")); !ok || n != 420*1024 {
		t.Fatalf("unexpected status parse: %d %t", n, ok)
	}
	if got := collectTreePIDs(11, 10, 10, []procEntry{
		{pid: 10, pgrp: 10}, {pid: 11, ppid: 10, pgrp: 10}, {pid: 12, ppid: 11, pgrp: 12},
		{pid: 13, ppid: 1, pgrp: 10}, {pid: 14, ppid: 1, pgrp: 14},
	}); !reflect.DeepEqual(got, []int{11, 13, 12}) {
		t.Fatalf("unexpected group: %v", got)
	}
	if !parseCgroupMemoryEventsOOM([]byte("oom 2\noom_kill 1\n")) || parseCgroupMemoryEventsOOM([]byte("oom 2\noom_kill 0\n")) {
		t.Fatal("only a positive oom_kill counter should be reported")
	}
	if note := FormatMemoryKilled(0, 16<<20, true); !strings.Contains(note, "memory limit exceeded") || !strings.Contains(note, "16 MiB") {
		t.Fatalf("unexpected cgroup error: %q", note)
	}
}
