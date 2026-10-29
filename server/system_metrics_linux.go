//go:build linux

package server

import (
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func systemMetricsSnapshot(s *Server) systemMetricsResponse {
	use, limit, cpuOK := cgroupCPU()
	cpuPct := 0.0
	if cpuOK {
		now := time.Now()
		s.metricsMu.Lock()
		if !s.lastCPUAt.IsZero() && use >= s.lastCPUUse && limit > 0 {
			elapsed := now.Sub(s.lastCPUAt).Seconds()
			if elapsed > 0 { cpuPct = float64(use-s.lastCPUUse) / 1e6 / elapsed / limit * 100 }
		}
		s.lastCPUUse, s.lastCPUAt = use, now
		s.metricsMu.Unlock()
	}
	memUsed, memTotal, memOK := cgroupMemory()
	root, data := diskMetric("/"), diskMetric(s.dataDir)
	if data.TotalBytes == 0 { data = root }
	return systemMetricsResponse{Scope: "container", Supported: true, Timestamp: time.Now().UTC(), Container: cpuOK || memOK,
		CPU: metricValue{Percent: clampPercent(cpuPct)}, Memory: metricValue{UsedBytes: memUsed, TotalBytes: memTotal, Percent: percent(memUsed, memTotal)}, Disk: root, DataDisk: data}
}

func cgroupCPU() (uint64, float64, bool) {
	for _, dir := range []string{"/sys/fs/cgroup", "/sys/fs/cgroup/cpu"} {
		b, err := os.ReadFile(filepath.Join(dir, "cpu.stat")); if err != nil { continue }
		var use uint64
		for _, line := range strings.Split(string(b), "\n") { f := strings.Fields(line); if len(f) == 2 && f[0] == "usage_usec" { use, _ = strconv.ParseUint(f[1], 10, 64) } }
		limit := float64(runtime.NumCPU())
		if q, err := os.ReadFile(filepath.Join(dir, "cpu.max")); err == nil { f := strings.Fields(string(q)); if len(f) == 2 && f[0] != "max" { quota, _ := strconv.ParseFloat(f[0], 64); period, _ := strconv.ParseFloat(f[1], 64); if period > 0 { limit = quota / period } } }
		if use > 0 { return use, limit, true }
	}
	return 0, 0, false
}

func cgroupMemory() (uint64, uint64, bool) {
	for _, dir := range []string{"/sys/fs/cgroup", "/sys/fs/cgroup/memory"} {
		cur, ce := readUint(filepath.Join(dir, "memory.current")); max, me := readUint(filepath.Join(dir, "memory.max"))
		if ce == nil && me == nil { return cur, max, max > 0 }
		if ce == nil { if b, err := os.ReadFile(filepath.Join(dir, "memory.max")); err == nil && strings.TrimSpace(string(b)) == "max" { return cur, hostMemoryTotal(), true } }
		cur, ce = readUint(filepath.Join(dir, "memory.usage_in_bytes")); max, me = readUint(filepath.Join(dir, "memory.limit_in_bytes"))
		if ce == nil && me == nil && max < ^uint64(0)/2 { return cur, max, true }
	}
	return 0, 0, false
}

func hostMemoryTotal() uint64 { b, err := os.ReadFile("/proc/meminfo"); if err != nil { return 0 }; for _, line := range strings.Split(string(b), "\n") { f := strings.Fields(line); if len(f) >= 2 && f[0] == "MemTotal:" { n, _ := strconv.ParseUint(f[1], 10, 64); return n * 1024 } }; return 0 }
func readUint(path string) (uint64, error) { b, err := os.ReadFile(path); if err != nil { return 0, err }; return strconv.ParseUint(strings.TrimSpace(string(b)), 10, 64) }
func diskMetric(path string) metricValue { var st syscall.Statfs_t; if path == "" || syscall.Statfs(path, &st) != nil { return metricValue{} }; total, free := st.Blocks*uint64(st.Bsize), st.Bavail*uint64(st.Bsize); used := total-free; return metricValue{UsedBytes: used, TotalBytes: total, Percent: percent(used, total)} }
func percent(used, total uint64) float64 { if total == 0 { return 0 }; return clampPercent(float64(used)/float64(total)*100) }
func clampPercent(v float64) float64 { if v < 0 { return 0 }; if v > 100 { return 100 }; return v }
