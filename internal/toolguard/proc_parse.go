package toolguard

import (
	"bytes"
	"strconv"
	"strings"
)

type procEntry struct {
	pid  int
	ppid int
	pgrp int
}

// collectTreePIDs returns every PID belonging to rootPID's process group or
// descending from rootPID (or from any member of that process group).
func collectTreePIDs(rootPID, groupID, excludePID int, entries []procEntry) []int {
	if rootPID <= 0 {
		return nil
	}
	children := make(map[int][]int, len(entries))
	seen := map[int]bool{rootPID: true}
	queue := []int{rootPID}
	for _, e := range entries {
		if e.pid <= 0 {
			continue
		}
		children[e.ppid] = append(children[e.ppid], e.pid)
		if e.pgrp == groupID && e.pid != excludePID && !seen[e.pid] {
			seen[e.pid] = true
			queue = append(queue, e.pid)
		}
	}
	for i := 0; i < len(queue); i++ {
		cur := queue[i]
		for _, ch := range children[cur] {
			if !seen[ch] {
				seen[ch] = true
				queue = append(queue, ch)
			}
		}
	}
	return queue
}

// parseProcStat parses Linux /proc/<pid>/stat, returning (ppid, pgrp, ok).
// The process name inside parentheses may contain spaces or ')', so we locate
// the last ')' before splitting the trailing fields.
func parseProcStat(data []byte) (ppid, pgrp int, ok bool) {
	idx := bytes.LastIndexByte(data, ')')
	if idx < 0 || idx+2 >= len(data) {
		return 0, 0, false
	}
	fields := strings.Fields(string(data[idx+1:]))
	// fields[0] = state, fields[1] = ppid, fields[2] = pgrp
	if len(fields) < 3 {
		return 0, 0, false
	}
	pp, err1 := strconv.Atoi(fields[1])
	pg, err2 := strconv.Atoi(fields[2])
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return pp, pg, true
}

// parseProcStatusBytes parses Linux /proc/<pid>/status and returns
// (VmRSS + VmSwap) in bytes.
func parseProcStatusBytes(data []byte) (int64, bool) {
	var rssKB, swapKB int64
	var sawRSS bool
	for _, line := range strings.Split(string(data), "\n") {
		switch {
		case strings.HasPrefix(line, "VmRSS:"):
			if v, ok := parseKBField(line); ok {
				rssKB = v
				sawRSS = true
			}
		case strings.HasPrefix(line, "VmSwap:"):
			if v, ok := parseKBField(line); ok {
				swapKB = v
			}
		}
	}
	if !sawRSS {
		return 0, false
	}
	return (rssKB + swapKB) * 1024, true
}

func parseKBField(line string) (int64, bool) {
	f := strings.Fields(line)
	if len(f) < 2 {
		return 0, false
	}
	n, err := strconv.ParseInt(f[1], 10, 64)
	if err != nil || n < 0 {
		return 0, false
	}
	return n, true
}

// parseCgroupMemoryEventsOOM reports whether a Linux cgroup v2 memory.events
// payload shows any kernel OOM kill event.
func parseCgroupMemoryEventsOOM(data []byte) bool {
	for _, line := range strings.Split(string(data), "\n") {
		f := strings.Fields(line)
		if len(f) == 2 && f[0] == "oom_kill" {
			if n, err := strconv.ParseInt(f[1], 10, 64); err == nil && n > 0 {
				return true
			}
		}
	}
	return false
}
