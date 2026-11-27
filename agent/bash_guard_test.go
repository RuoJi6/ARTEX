package agent

import (
	"context"
	"runtime"
	"strings"
	"testing"
)

func TestGuardedBashPreservesDecoratedDefaults(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX shell syntax")
	}
	for _, tool := range guardedDefaultTools() {
		if tool.Name() != "Bash" {
			continue
		}
		decorated := DecorateTool(tool, "custom description", map[string]any{
			"properties": map[string]any{"timeout_ms": map[string]any{"type": "integer", "default": 50}},
		})
		res, err := decorated.Call(context.Background(), []byte(`{"command":"sleep 2"}`), nil)
		if err != nil || !res.IsError || !strings.Contains(res.Flatten(), "timed out") {
			t.Fatalf("expected timeout injected by tool decorator, got %s %v", res.Flatten(), err)
		}
		return
	}
	t.Fatal("Bash not found")
}
