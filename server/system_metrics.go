package server

// Container-level resource metrics. These deliberately read cgroups directly:
// generic host libraries often report the host's capacity from inside Docker.

import (
	"encoding/json"
	"os"
	"net/http"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type metricValue struct {
	UsedBytes  uint64  `json:"used_bytes"`
	TotalBytes uint64  `json:"total_bytes"`
	Percent    float64 `json:"percent"`
}

type systemMetricsResponse struct {
	Scope     string      `json:"scope"`
	Timestamp time.Time   `json:"timestamp"`
	CPU       metricValue `json:"cpu"`
	Memory    metricValue `json:"memory"`
	Disk      metricValue `json:"disk"`
	DataDisk  metricValue `json:"data_disk"`
	Container bool        `json:"container_metrics"`
}

func (s *Server) systemMetrics(w http.ResponseWriter, r *http.Request) {
	cpuUse, cpuLimit, ok := cgroupCPU()
	cpuPct := 0.0
	if ok {
		now := time.Now()
		s.metricsMu.Lock()
		if !s.lastCPUAt.IsZero() && cpuUse >= s.lastCPUUse {
			elapsed := now.Sub(s.lastCPUAt).Seconds()
			if elapsed > 0 {
				cpuPct = float64(cpuUse-s.lastCPUUse) / 1e6 / elapsed / cpuLimit * 100
			}
		}
		s.lastCPUUse, s.lastCPUAt = cpuUse, now
		s.metricsMu.Unlock()
	}
	memUsed, memTotal, memOK := cgroupMemory()
	root := diskMetric("/")
	data := diskMetric(s.dataDir)
	if data.TotalBytes == 0 { data = root }
	containerMetrics := ok || memOK
	scope := "process"
	if containerMetrics {
		scope = "container"
	}
	out := systemMetricsResponse{Scope: scope, Timestamp: time.Now().UTC(), Container: containerMetrics,
		CPU: metricValue{Percent: clampPercent(cpuPct)},
		Memory: metricValue{UsedBytes: memUsed, TotalBytes: memTotal, Percent: percent(memUsed, memTotal)}, Disk: root, DataDisk: data}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
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
		cur, e1 := readUint(filepath.Join(dir, "memory.current")); max, e2 := readUint(filepath.Join(dir, "memory.max"))
		if e1 == nil && e2 == nil { return cur, max, max > 0 }
		if e1 == nil {
			if b, err := os.ReadFile(filepath.Join(dir, "memory.max")); err == nil && strings.TrimSpace(string(b)) == "max" {
				return cur, hostMemoryTotal(), true
			}
		}
		cur, e1 = readUint(filepath.Join(dir, "memory.usage_in_bytes")); max, e2 = readUint(filepath.Join(dir, "memory.limit_in_bytes")); if e1 == nil && e2 == nil && max < ^uint64(0)/2 { return cur, max, true }
	}
	return 0, 0, false
}

func hostMemoryTotal() uint64 {
	b, err := os.ReadFile("/proc/meminfo"); if err != nil { return 0 }
	for _, line := range strings.Split(string(b), "\n") { f := strings.Fields(line); if len(f) >= 2 && f[0] == "MemTotal:" { n, _ := strconv.ParseUint(f[1], 10, 64); return n * 1024 } }
	return 0
}

func readUint(path string) (uint64, error) { b, err := os.ReadFile(path); if err != nil { return 0, err }; return strconv.ParseUint(strings.TrimSpace(string(b)), 10, 64) }

func diskMetric(path string) metricValue { var st syscall.Statfs_t; if path == "" || syscall.Statfs(path, &st) != nil { return metricValue{} }; total := st.Blocks * uint64(st.Bsize); free := st.Bavail * uint64(st.Bsize); used := total - free; return metricValue{UsedBytes: used, TotalBytes: total, Percent: percent(used, total)} }
func percent(used, total uint64) float64 { if total == 0 { return 0 }; return clampPercent(float64(used) / float64(total) * 100) }
func clampPercent(v float64) float64 { if v < 0 { return 0 }; if v > 100 { return 100 }; return v }
