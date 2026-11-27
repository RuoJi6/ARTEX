package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

func TestEnsureBrowserMCPArgs(t *testing.T) {
	got := ensureBrowserMCPArgs([]string{"@playwright/mcp", "--headless"}, true)
	want := []string{"@playwright/mcp", "--headless", "--browser", "chromium", "--no-sandbox", "--ignore-https-errors", "--isolated"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ensureBrowserMCPArgs(default) = %v, want %v", got, want)
	}

	// Idempotent on second call.
	if again := ensureBrowserMCPArgs(got, true); !reflect.DeepEqual(again, want) {
		t.Fatalf("ensureBrowserMCPArgs not idempotent: %v", again)
	}

	// Strips --user-data-dir when adding --isolated and respects explicit --browser.
	custom := ensureBrowserMCPArgs([]string{"@playwright/mcp", "--browser", "firefox", "--user-data-dir", "/tmp/p", "--user-data-dir=/tmp/q"}, true)
	for _, arg := range custom {
		if strings.HasPrefix(arg, "--user-data-dir") || arg == "/tmp/p" {
			t.Fatalf("stale user-data-dir remained: %v", custom)
		}
		if arg == "chromium" {
			t.Fatalf("explicit --browser firefox was overwritten: %v", custom)
		}
	}
	if !contains(custom, "--isolated") || !contains(custom, "--ignore-https-errors") || !contains(custom, "--no-sandbox") {
		t.Fatalf("missing required flags: %v", custom)
	}
}

func TestResolveStdioMCPCommand(t *testing.T) {
	orig := lookPath
	t.Cleanup(func() { lookPath = orig })

	lookPath = func(file string) (string, error) {
		if file == "playwright-mcp" {
			return "/usr/local/bin/playwright-mcp", nil
		}
		return "", errors.New("not found")
	}
	cmd, args := resolveStdioMCPCommand("npx", []string{"-y", "@playwright/mcp", "--browser", "chromium", "--headless"})
	if cmd != "/usr/local/bin/playwright-mcp" || !reflect.DeepEqual(args, []string{"--browser", "chromium", "--headless"}) {
		t.Fatalf("container path: got (%q, %v)", cmd, args)
	}

	lookPath = func(string) (string, error) { return "", errors.New("not found") }
	cmd, args = resolveStdioMCPCommand("npx", []string{"@playwright/mcp", "--browser", "chromium"})
	if cmd != "npx" || !reflect.DeepEqual(args, []string{"-y", "@playwright/mcp", "--browser", "chromium"}) {
		t.Fatalf("npx fallback: got (%q, %v)", cmd, args)
	}

	// Unrelated npx packages and non-npx commands pass through unchanged.
	cmd, args = resolveStdioMCPCommand("npx", []string{"some-other-mcp", "--flag"})
	if cmd != "npx" || !reflect.DeepEqual(args, []string{"some-other-mcp", "--flag"}) {
		t.Fatalf("other npx package modified: got (%q, %v)", cmd, args)
	}
}

func TestStdioMCPClientUsesWorkingDirectoryAndCapturesStderr(t *testing.T) {
	workDir := t.TempDir()
	script := filepath.Join(t.TempDir(), "fake-mcp.sh")
	body := `#!/bin/sh
while IFS= read -r line; do
  case "$line" in
    *'"method":"initialize"'*)
      printf '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"fake","version":"1"}}}\n'
      ;;
    *'"method":"tools/list"'*)
      printf '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"browser_take_screenshot","description":"save shot","inputSchema":{"type":"object"}}]}}\n'
      ;;
    *'"method":"tools/call"'*)
      mkdir -p findings/screenshots
      printf 'png-bytes' > findings/screenshots/finding-7-step-1.png
      printf '{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"saved in %s"}]}}\n' "$(pwd)"
      ;;
  esac
done
`
	if err := os.WriteFile(script, []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cl, err := newStdioMCPClient(ctx, "browser", workDir, script, nil)
	if err != nil {
		t.Fatalf("newStdioMCPClient: %v", err)
	}
	defer cl.Close()

	tools, err := cl.Tools(ctx)
	if err != nil || len(tools) != 1 || tools[0].Name() != "mcp__browser__browser_take_screenshot" {
		t.Fatalf("tools = %v, err = %v", tools, err)
	}
	res, err := tools[0].Call(ctx, json.RawMessage(`{"filename":"findings/screenshots/finding-7-step-1.png"}`), nil)
	if err != nil || res.IsError {
		t.Fatalf("tool call failed: res=%+v err=%v", res, err)
	}
	shotPath := filepath.Join(workDir, "findings", "screenshots", "finding-7-step-1.png")
	data, err := os.ReadFile(shotPath)
	if err != nil || string(data) != "png-bytes" {
		t.Fatalf("screenshot not written in workDir (%s): data=%q err=%v", shotPath, string(data), err)
	}

	// Verify stderr is surfaced when a stdio MCP crashes before handshake.
	failScript := filepath.Join(t.TempDir(), "fail-mcp.sh")
	if err := os.WriteFile(failScript, []byte("#!/bin/sh\necho 'boom: chrome missing' >&2\nexit 1\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := newStdioMCPClient(ctx, "browser", workDir, failScript, nil); err == nil || !strings.Contains(err.Error(), "boom: chrome missing") {
		t.Fatalf("expected stderr in error, got: %v", err)
	}
}

func TestDefaultEnabledSettingsAndScreenshotTimestampHeader(t *testing.T) {
	s, _, request := trafficEvidenceServer(t)
	pg := s.m.pg

	keys := []string{
		settingBrowserScreenshot,
		settingScreenshotTimestamp,
		settingAgentTrafficBinding,
		db.SettingTaskIntelligence,
	}
	for _, k := range keys {
		if _, err := pg.Exec(`DELETE FROM settings WHERE key=$1`, k); err != nil {
			t.Fatal(err)
		}
		key := k
		t.Cleanup(func() { _, _ = pg.Exec(`DELETE FROM settings WHERE key=$1`, key) })
	}

	payload := s.settingsPayload()
	for _, k := range keys {
		if payload[k] != true {
			t.Fatalf("expected %s to default to true, got %v", k, payload[k])
		}
	}

	// With task_intelligence_enabled unset (default true), enabling credential_agent_enabled must succeed.
	t.Cleanup(func() {
		_, _ = pg.Exec(`DELETE FROM settings WHERE key IN ($1,$2,$3)`, db.SettingTaskIntelligence, db.SettingCredentialAgent, db.SettingCredentialTraffic)
	})
	if r := request("PUT", "/api/settings", `{"credential_agent_enabled":true}`); r.Code != 200 {
		t.Fatalf("enabling credential_agent_enabled under default task_intelligence_enabled failed: %d %s", r.Code, r.Body.String())
	}

	// Archived screenshot under tasks/<id>/findings/screenshots/ previews with timestamp header by default.
	shot := filepath.Join(s.m.dir, "tasks", "99", "findings", "screenshots", "finding-99-step-1.png")
	if err := os.MkdirAll(filepath.Dir(shot), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(shot, []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, 0o644); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/workspace/preview?path=findings/screenshots/finding-99-step-1.png", nil)
	s.wsPreview(rec, req)
	if rec.Code != 200 {
		t.Fatalf("wsPreview status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("X-Report-Screenshot-Timestamp") == "" {
		t.Fatal("expected X-Report-Screenshot-Timestamp header when setting is unset (default true)")
	}
}
