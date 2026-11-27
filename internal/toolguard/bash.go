package toolguard

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
)

// NewBash keeps the SDK permission floor but runs commands through ARTEX's guard.
func NewBash() actool.CoreTool {
	base := actool.NewBash()
	schema := maps.Clone(base.InputSchema())
	props := maps.Clone(schema["properties"].(map[string]any))
	if _, ok := props["run_in_background"]; ok {
		props["run_in_background"] = map[string]any{"type": "boolean", "description": "Run asynchronously; read output with TaskOutput and stop it with TaskStop. The same memory and time limits apply."}
	}
	props["timeout_ms"] = map[string]any{"type": "integer", "description": "Command timeout in milliseconds (operator-configured default, normally 120000)."}
	schema["properties"] = props
	return actool.Build(actool.Spec{
		Name:        base.Name(),
		Description: base.Description(),
		Prompt:      strings.Replace(base.Prompt(), "A timeout (default 120s, max 600s) applies.", "Commands are terminated at their timeout instead of moving to the background.", 1),
		Schema:      schema,
		ReadOnly:    base.IsReadOnly,
		Concurrent:  base.IsConcurrencySafe,
		Permissions: base.CheckPermissions,
		Run:         runGuardedBash,
	})
}

func runGuardedBash(ctx context.Context, input json.RawMessage, tc *actool.ToolContext) (actool.Result, error) {
	var in struct {
		Command         string `json:"command"`
		TimeoutMS       int    `json:"timeout_ms"`
		RunInBackground bool   `json:"run_in_background"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return actool.Result{}, err
	}
	if strings.TrimSpace(in.Command) == "" {
		return actool.Errorf("Error: command is required"), nil
	}

	// Custom command tools can invoke this handler directly, outside norma's
	// permission pipeline. Always enforce the same catastrophic-command floor.
	if dec := actool.NewBash().CheckPermissions(ctx, input, permission.Context{}); dec.Behavior == permission.Deny {
		return actool.Errorf(dec.Message), nil
	}
	cfg := FromEnv()
	timeout := cfg.ResolveTimeout(in.TimeoutMS)
	if in.RunInBackground && tc != nil && tc.Tasks != nil && !actool.BackgroundTasksDisabled() {
		return runGuardedBashBackground(tc, cfg, in.Command, timeout)
	}

	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	shell, flags := platformShellCmd()
	cmd := exec.Command(shell, append(flags, in.Command)...)
	if tc != nil {
		cmd.Dir = tc.WorkingDir
		if env := mergedEnv(tc.Env); env != nil {
			cmd.Env = env
		}
	}

	res := Run(cctx, cfg, cmd)
	out := actool.Capture(tc, res.Output)
	if res.OutputTruncated {
		out += outputLimitNote
	}
	if res.MemoryKilled {
		if strings.TrimSpace(out) == "" {
			out = "(no output)"
		}
		return actool.Errorf(out + "\n\n" + FormatMemoryKilled(res.PeakMemoryBytes, res.MemoryLimitBytes, res.KilledByCgroup)), nil
	}
	if res.TimedOut {
		return actool.Errorf(out + timeoutNote(timeout)), nil
	}
	if ctx.Err() != nil {
		return actool.Errorf("Error: " + ctx.Err().Error()), nil
	}
	if res.Err != nil {
		if res.ExitCode >= 0 {
			if strings.TrimSpace(out) == "" {
				out = "(no output)"
			}
			return actool.Errorf(fmt.Sprintf("%s\n\n[exit code %d]", out, res.ExitCode)), nil
		}
		return actool.Errorf(fmt.Sprintf("%s\n\n[failed to run: %v]", out, res.Err)), nil
	}
	if strings.TrimSpace(out) == "" {
		out = "(command produced no output)"
	}
	return actool.Text(out), nil
}

func platformShellCmd() (string, []string) {
	if runtime.GOOS == "windows" {
		return "powershell", []string{"-NoProfile", "-NonInteractive", "-Command"}
	}
	return "bash", []string{"-c"}
}

func mergedEnv(extra []string) []string {
	if len(extra) == 0 {
		return nil
	}
	return append(os.Environ(), extra...)
}

func timeoutNote(limit time.Duration) string {
	return fmt.Sprintf("\n\n[command timed out (configured limit %s)]", limit)
}
