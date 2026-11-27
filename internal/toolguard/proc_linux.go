//go:build linux

package toolguard

import (
	"os"
	"path/filepath"
	"strconv"
)

func watchdogAvailable() bool { return true }

// readProcessTreeMemory samples the command's descendants and group, excluding
// the guard helper itself for background commands.
func readProcessTreeMemory(rootPID, groupID, excludePID int) (int64, []int, bool) {
	if rootPID <= 0 {
		return 0, nil, false
	}
	dirs, err := os.ReadDir("/proc")
	if err != nil {
		return 0, nil, false
	}
	entries := make([]procEntry, 0, len(dirs))
	rootAlive := false
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(d.Name())
		if err != nil || pid <= 0 {
			continue
		}
		statBytes, err := os.ReadFile(filepath.Join("/proc", d.Name(), "stat"))
		if err != nil {
			continue
		}
		ppid, pgrp, ok := parseProcStat(statBytes)
		if !ok {
			continue
		}
		if pid == rootPID || (pgrp == groupID && pid != excludePID) {
			rootAlive = true
		}
		entries = append(entries, procEntry{pid: pid, ppid: ppid, pgrp: pgrp})
	}
	if !rootAlive {
		return 0, nil, false
	}
	pids := collectTreePIDs(rootPID, groupID, excludePID, entries)
	var total int64
	var anyRead bool
	for _, pid := range pids {
		pidStr := strconv.Itoa(pid)
		if b, err := os.ReadFile(filepath.Join("/proc", pidStr, "status")); err == nil {
			if n, ok := parseProcStatusBytes(b); ok {
				total += n
				anyRead = true
			}
		}
	}
	return total, pids, anyRead
}
