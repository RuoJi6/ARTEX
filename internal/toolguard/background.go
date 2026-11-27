package toolguard

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	actool "github.com/Autumn-27/norma/tool"
)

const (
	backgroundArg     = "--artex-internal-background-tool"
	backgroundExe     = "_ARTEX_BG_EXE"
	backgroundCommand = "_ARTEX_BG_COMMAND"
	backgroundTimeout = "_ARTEX_BG_TIMEOUT"
	backgroundCgroup  = "_ARTEX_BG_CGROUP"
	outputLimitNote   = "\n\n[output truncated at capture limit]"
)

// The SDK's task manager only accepts a shell command, not an exec hook. Its
// shell execs this binary in a lightweight helper mode, keeping the manager's
// task ID, streaming output, notifications, and cancellation semantics.
func runGuardedBashBackground(tc *actool.ToolContext, cfg Config, command string, timeout time.Duration) (actool.Result, error) {
	exe, err := os.Executable()
	if err != nil {
		return actool.Errorf("Error: failed to locate background helper: " + err.Error()), nil
	}
	var dir string
	scope := newCgroupScope(cfg.MemoryLimitBytes(), cfg.PidsLimit)
	if scope != nil {
		dir = scope.dir
		scope.CloseFD()
	}
	env := append([]string{}, tc.Env...)
	// Pass the command as data, not shell syntax in the trampoline.
	env = append(env, backgroundExe+"="+exe, backgroundCommand+"="+command,
		backgroundTimeout+"="+timeout.String(), backgroundCgroup+"="+dir,
		EnvToolMemoryLimitMB+"="+strconv.Itoa(cfg.MemoryLimitMB),
		EnvToolPidsLimit+"="+strconv.Itoa(cfg.PidsLimit))
	trampoline := `exec "$` + backgroundExe + `" ` + backgroundArg
	if runtime.GOOS == "windows" {
		trampoline = `& $env:` + backgroundExe + ` '` + backgroundArg + `'; exit $LASTEXITCODE`
	}
	desc := strings.TrimSpace(strings.ReplaceAll(command, "\n", " "))
	if len(desc) > 60 {
		desc = desc[:57] + "..."
	}
	mgr := tc.Tasks
	t, err := mgr.Spawn(actool.SpawnSpec{
		Command: trampoline, Kind: actool.KindBash, WorkingDir: tc.WorkingDir,
		Description: desc, Env: env,
	})
	if err != nil {
		if scope != nil {
			scope.Cleanup()
		}
		return actool.Errorf("Error: failed to start background command: " + err.Error()), nil
	}
	mgr.Background(t.ID)
	if scope != nil {
		go func(id string) {
			// The helper might be SIGKILLed by TaskStop; its parent therefore
			// owns the scope and cleans it up after the task exits.
			_, done := mgr.Wait(context.Background(), id, timeout)
			if !done {
				_, done = mgr.Wait(context.Background(), id, 5*time.Second)
			}
			if !done {
				mgr.Kill(id)
			}
			scope.Cleanup()
		}(t.ID)
	}
	return actool.Text(fmt.Sprintf(
		"Running in background as %s. Output file: %s\nUse TaskOutput{task_id:%q} or Read to read its output; you are notified when it completes.",
		t.ID, t.OutputPath, t.ID)), nil
}

// BackgroundHelper handles the internal helper invocation before normal app
// startup. The helper uses the task manager's cwd, environment, and output file.
func BackgroundHelper(args []string) (exitCode int, handled bool) {
	if len(args) != 1 || args[0] != backgroundArg {
		return 0, false
	}
	command, dir := os.Getenv(backgroundCommand), os.Getenv(backgroundCgroup)
	timeout, err := time.ParseDuration(os.Getenv(backgroundTimeout))
	for _, name := range []string{backgroundExe, backgroundCommand, backgroundTimeout, backgroundCgroup} {
		_ = os.Unsetenv(name)
	}
	if command == "" || err != nil || timeout <= 0 {
		fmt.Fprintln(os.Stderr, "invalid background tool invocation")
		return 1, true
	}
	cfg := FromEnv()
	cfg.MaxOutputBytes -= 4096 // leave room for the error note below norma's task-file cap
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	shell, flags := platformShellCmd()
	cmd := exec.Command(shell, append(flags, command)...)
	group := os.Getpid()
	if runtime.GOOS == "windows" {
		group = 0 // Windows terminates the process tree by PID, without a Unix group.
	}
	res := run(ctx, cfg, cmd, openCgroupScope(dir), group, os.Stdout)
	if res.OutputTruncated {
		fmt.Fprintln(os.Stderr, outputLimitNote)
	}
	switch {
	case res.MemoryKilled:
		fmt.Fprintln(os.Stderr, FormatMemoryKilled(res.PeakMemoryBytes, res.MemoryLimitBytes, res.KilledByCgroup))
		return 1, true
	case res.TimedOut:
		fmt.Fprintln(os.Stderr, timeoutNote(timeout))
		return 1, true
	case res.ExitCode >= 0:
		return res.ExitCode, true
	default:
		fmt.Fprintf(os.Stderr, "[failed to run: %v]\n", res.Err)
		return 1, true
	}
}
