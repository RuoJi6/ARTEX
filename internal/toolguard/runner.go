package toolguard

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"time"
)

// RunResult holds the outcome of a guarded subprocess execution.
type RunResult struct {
	Output           string
	OutputTruncated  bool
	ExitCode         int
	TimedOut         bool
	MemoryKilled     bool
	KilledByCgroup   bool
	PeakMemoryBytes  int64
	MemoryLimitBytes int64
	Err              error
}

// Run executes a one-shot subprocess and cleans up its process group when done.
// The caller supplies the deadline, if any. cmd must not have been started.
func Run(ctx context.Context, cfg Config, cmd *exec.Cmd) RunResult {
	cfg = cfg.withDefaults()
	scope := newCgroupScope(cfg.MemoryLimitBytes(), cfg.PidsLimit)
	if scope != nil {
		defer scope.Cleanup()
	}
	return run(ctx, cfg, cmd, scope, 0, nil)
}

// group is zero for foreground commands. A background helper runs its command
// within its own existing process group, so norma's TaskStop can kill both.
func run(ctx context.Context, cfg Config, cmd *exec.Cmd, scope *cgroupScope, group int, stream io.Writer) RunResult {
	res := RunResult{ExitCode: -1, MemoryLimitBytes: cfg.MemoryLimitBytes()}
	if err := ctx.Err(); err != nil {
		res.Err, res.TimedOut = err, errors.Is(err, context.DeadlineExceeded)
		return res
	}
	if group == 0 {
		setProcessGroup(cmd)
	}

	// Own the combined output pipe so Wait observes the direct child exiting,
	// even if a descendant still has stdout/stderr open.
	r, w, err := os.Pipe()
	if err != nil {
		res.Err = err
		return res
	}
	defer r.Close()
	defer w.Close()
	cmd.Stdout, cmd.Stderr = w, w
	cmd.WaitDelay = time.Second // also bounds os/exec's stdin pump, if present
	cmd, err = startCommand(cmd, scope)
	if scope != nil {
		scope.CloseFD()
	}
	if err != nil {
		res.Err = err
		return res
	}
	_ = w.Close()

	capture := newOutputCapture(cfg.MaxOutputBytes, stream)
	drained := make(chan struct{})
	go func() {
		_, _ = io.Copy(capture, r)
		close(drained)
	}()
	waited := make(chan error, 1)
	go func() { waited <- cmd.Wait() }()

	root := cmd.Process.Pid
	groupID := root
	if group != 0 {
		groupID = group
	}
	// When delegated memory.max is active, the kernel enforces the bound and
	// we do not need to walk /proc. Fall back to the sampled watchdog otherwise.
	var samples <-chan time.Time
	if res.MemoryLimitBytes > 0 && (scope == nil || !scope.active) && watchdogAvailable() {
		ticker := time.NewTicker(cfg.PollInterval)
		defer ticker.Stop()
		samples = ticker.C
	}
	kill := func(exited bool) {
		if scope != nil && scope.active {
			scope.Kill()
		}
		if group == 0 {
			if runtime.GOOS == "windows" && exited {
				return
			}
			killProcessGroup(cmd.Process)
		} else if scope == nil || !scope.active {
			// Do not kill the background helper itself: it still needs to
			// print the resource-limit error to the task's output file.
			_, pids, _ := readProcessTreeMemory(root, groupID, group)
			killProcessIDs(pids)
			_ = cmd.Process.Kill()
		}
	}

	var overSince time.Time
wait:
	for {
		select {
		case res.Err = <-waited:
			kill(true) // one-shot commands must not leave workers behind
			break wait
		case <-ctx.Done():
			res.TimedOut = errors.Is(ctx.Err(), context.DeadlineExceeded)
			kill(false)
			<-waited
			res.Err = ctx.Err()
			break wait
		case now := <-samples:
			used, pids, ok := readProcessTreeMemory(root, groupID, group)
			if !ok || used <= res.MemoryLimitBytes {
				overSince = time.Time{}
				continue
			}
			res.PeakMemoryBytes = max(res.PeakMemoryBytes, used)
			if overSince.IsZero() {
				overSince = now
			}
			if used-res.MemoryLimitBytes >= res.MemoryLimitBytes/4 || now.Sub(overSince) >= cfg.Grace {
				res.MemoryKilled = true
				if group == 0 {
					// Include freshly observed descendants that changed process groups.
					killProcessIDs(pids)
				}
				kill(false)
				res.Err = <-waited
				break wait
			}
		}
	}
	res.KilledByCgroup = scope != nil && scope.active && scope.OOMKilled()
	res.MemoryKilled = res.MemoryKilled || res.KilledByCgroup
	if res.MemoryKilled {
		res.TimedOut = false
	}
	res.ExitCode = cmd.ProcessState.ExitCode()

	// Bound drain time even if an untracked process inherited the output pipe.
	drainTimer := time.NewTimer(time.Second)
	defer drainTimer.Stop()
	select {
	case <-drained:
	case <-drainTimer.C:
		_ = r.Close()
		<-drained
	}
	res.Output, res.OutputTruncated = capture.output(), capture.truncated
	return res
}

// FormatMemoryKilled returns a model-actionable termination reason.
func FormatMemoryKilled(peakBytes, limitBytes int64, byCgroup bool) string {
	const mib = 1 << 20
	if byCgroup {
		return fmt.Sprintf("[command killed: memory limit exceeded (cgroup cap %d MiB; reduce memory usage or adjust %s)]", limitBytes/mib, EnvToolMemoryLimitMB)
	}
	return fmt.Sprintf("[command killed: memory limit exceeded (sampled %.1f MiB, limit %d MiB; reduce memory usage or adjust %s)]", float64(peakBytes)/mib, limitBytes/mib, EnvToolMemoryLimitMB)
}
