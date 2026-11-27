package toolguard

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	actool "github.com/Autumn-27/norma/tool"
)

func TestBashForeground(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX shell syntax")
	}
	tc := &actool.ToolContext{WorkingDir: t.TempDir(), Env: []string{"ARTEX_TEST_MARKER=from-session"}}
	res, _ := NewBash().Call(context.Background(), []byte(`{"command":"printf '%s %s' \"$ARTEX_TEST_MARKER\" \"$PWD\""}`), tc)
	cwd, err := filepath.EvalSymlinks(tc.WorkingDir)
	if err != nil {
		t.Fatal(err)
	}
	if res.IsError || res.Flatten() != "from-session "+cwd {
		t.Fatalf("cwd/env not passed: %s", res.Flatten())
	}
	res, _ = NewBash().Call(context.Background(), []byte(`{"command":"sleep 10", "timeout_ms":100}`), tc)
	if !res.IsError || !strings.Contains(res.Flatten(), "timed out") {
		t.Fatalf("missing timeout: %s", res.Flatten())
	}
}

func TestBashBackground(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX shell syntax")
	}
	t.Setenv("AGENT_CORE_DISABLE_BACKGROUND_TASKS", "")
	t.Setenv(EnvToolMemoryLimitMB, "0")
	t.Setenv(EnvToolPidsLimit, "0")
	mgr, err := actool.NewManager("artex-toolguard-" + filepath.Base(filepath.Dir(t.TempDir())))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(mgr.Cleanup)
	tc := &actool.ToolContext{Tasks: mgr, WorkingDir: t.TempDir(), Env: []string{"ARTEX_TEST_MARKER=background-session"}}
	invoke := func(command string, timeoutMS int) string {
		t.Helper()
		in, _ := json.Marshal(map[string]any{"command": command, "run_in_background": true, "timeout_ms": timeoutMS})
		res, err := NewBash().Call(context.Background(), in, tc)
		if err != nil || res.IsError {
			t.Fatalf("start background command: %s %v", res.Flatten(), err)
		}
		tasks := mgr.List()
		return tasks[len(tasks)-1].ID
	}
	id := invoke(`printf '%s\n' "$ARTEX_TEST_MARKER"; sleep 10`, 500)
	info, done := mgr.Wait(context.Background(), id, 5*time.Second)
	out, err := mgr.Output(id, 1024)
	if !done || info.Status != actool.TaskFailed || err != nil || !strings.Contains(out, "background-session") || !strings.Contains(out, "timed out") {
		t.Fatalf("background timeout not surfaced: %+v, output %q, error %v", info, out, err)
	}

	id = invoke(`touch ready; sleep 2; touch survived`, 5000)
	waitUntil := time.Now().Add(3 * time.Second)
	for {
		if _, err := os.Stat(filepath.Join(tc.WorkingDir, "ready")); err == nil {
			break
		}
		if time.Now().After(waitUntil) {
			t.Fatal("background command did not start")
		}
		time.Sleep(20 * time.Millisecond)
	}
	mgr.Kill(id)
	if info, done := mgr.Wait(context.Background(), id, 5*time.Second); !done || info.Status != actool.TaskKilled {
		t.Fatalf("TaskStop did not stop helper: %+v", info)
	}
	// A stopped shell would otherwise write this file after its sleep.
	time.Sleep(2200 * time.Millisecond)
	if _, err := os.Stat(filepath.Join(tc.WorkingDir, "survived")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("TaskStop left the inner shell running: stat = %v", err)
	}
}

func TestBashBackgroundMemory(t *testing.T) {
	if !watchdogAvailable() {
		t.Skip("requires a process memory watchdog")
	}
	t.Setenv("AGENT_CORE_DISABLE_BACKGROUND_TASKS", "")
	t.Setenv(EnvToolMemoryLimitMB, "16")
	t.Setenv(EnvToolPidsLimit, "0")
	mgr, err := actool.NewManager("artex-toolguard-memory-" + filepath.Base(filepath.Dir(t.TempDir())))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(mgr.Cleanup)
	tc := &actool.ToolContext{Tasks: mgr, WorkingDir: t.TempDir(), Env: []string{"ARTEX_TEST_GUARD_CHILD=memory", "ARTEX_TEST_EXECUTABLE=" + os.Args[0]}}
	res, err := NewBash().Call(context.Background(), []byte(`{"command":"\"$ARTEX_TEST_EXECUTABLE\" -test.run='^TestGuardChild$'", "run_in_background":true, "timeout_ms":5000}`), tc)
	if err != nil || res.IsError {
		t.Fatalf("start background command: %s %v", res.Flatten(), err)
	}
	info, done := mgr.Wait(context.Background(), mgr.List()[0].ID, 7*time.Second)
	out, err := mgr.Output(info.ID, 1024)
	if !done || info.Status != actool.TaskFailed || err != nil || !strings.Contains(out, "memory limit exceeded") {
		t.Fatalf("background memory limit not surfaced: %+v, output %q, error %v", info, out, err)
	}
}
