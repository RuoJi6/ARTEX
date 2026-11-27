//go:build windows

package toolguard

import (
	"context"
	"os"
	"os/exec"
	"strconv"
	"time"
)

func setProcessGroup(_ *exec.Cmd) {}

func killProcessGroup(p *os.Process) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = exec.CommandContext(ctx, "taskkill", "/T", "/F", "/PID", strconv.Itoa(p.Pid)).Run()
	_ = p.Kill()
}

func killProcessIDs(_ []int) {}
