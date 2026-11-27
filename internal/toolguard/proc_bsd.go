//go:build darwin || freebsd || openbsd || netbsd

package toolguard

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

func watchdogAvailable() bool { return true }

// readProcessTreeMemory samples the command's descendants and group, excluding
// the guard helper itself for background commands.
func readProcessTreeMemory(rootPID, groupID, excludePID int) (int64, []int, bool) {
	if rootPID <= 0 {
		return 0, nil, false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "/bin/ps", "-axo", "pid=,ppid=,pgid=,rss=").Output()
	if err != nil {
		return 0, nil, false
	}
	var entries []procEntry
	byPID := make(map[int]int64, 64)
	rootAlive := false
	for _, line := range strings.Split(string(out), "\n") {
		f := strings.Fields(line)
		if len(f) < 4 {
			continue
		}
		pid, e1 := strconv.Atoi(f[0])
		ppid, e2 := strconv.Atoi(f[1])
		pgrp, e3 := strconv.Atoi(f[2])
		rssKB, e4 := strconv.ParseInt(f[3], 10, 64)
		if e1 != nil || e2 != nil || e3 != nil || e4 != nil || pid <= 0 {
			continue
		}
		if pid == rootPID || (pgrp == groupID && pid != excludePID) {
			rootAlive = true
		}
		rssBytes := rssKB * 1024
		entries = append(entries, procEntry{pid: pid, ppid: ppid, pgrp: pgrp})
		byPID[pid] = rssBytes
	}
	if !rootAlive {
		return 0, nil, false
	}
	pids := collectTreePIDs(rootPID, groupID, excludePID, entries)
	var total int64
	for _, pid := range pids {
		total += byPID[pid]
	}
	return total, pids, true
}
