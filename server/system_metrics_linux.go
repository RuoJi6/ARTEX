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
			if elapsed > 0 {
				cpuPct = float64(use-s.lastCPUUse) / 1e6 / elapsed / limit * 100
			}
		}
		s.lastCPUUse, s.lastCPUAt = use, now
		s.metricsMu.Unlock()
	}
	memoryDirs := cgroupControllerDirs("memory")
	memoryLimit := cgroupLimit(memoryDirs, "memory.max", "memory.limit_in_bytes")
	pidsLimit := cgroupLimit(cgroupControllerDirs("pids"), "pids.max", "pids.max")
	memUsed, memOK := cgroupMemoryUsage(memoryDirs)
	memTotal := memoryLimit
	if memOK && memTotal == 0 {
		memTotal = hostMemoryTotal()
	}
	root, data := diskMetric("/"), diskMetric(s.dataDir)
	if data.TotalBytes == 0 {
		data = root
	}
	limits := toolResourceLimits()
	limits.ContainerMemoryLimitBytes = memoryLimit
	limits.ContainerMemoryBounded = memoryLimit > 0
	limits.ContainerPidsLimit = pidsLimit
	return systemMetricsResponse{Scope: "container", Supported: true, Timestamp: time.Now().UTC(), Container: cpuOK || memOK,
		CPU: metricValue{Percent: clampPercent(cpuPct)}, Memory: metricValue{UsedBytes: memUsed, TotalBytes: memTotal, Percent: percent(memUsed, memTotal)}, Disk: root, DataDisk: data,
		Limits: limits}
}

func cgroupCPU() (uint64, float64, bool) {
	for _, dir := range []string{"/sys/fs/cgroup", "/sys/fs/cgroup/cpu"} {
		b, err := os.ReadFile(filepath.Join(dir, "cpu.stat"))
		if err != nil {
			continue
		}
		var use uint64
		for _, line := range strings.Split(string(b), "\n") {
			f := strings.Fields(line)
			if len(f) == 2 && f[0] == "usage_usec" {
				use, _ = strconv.ParseUint(f[1], 10, 64)
			}
		}
		limit := float64(runtime.NumCPU())
		if q, err := os.ReadFile(filepath.Join(dir, "cpu.max")); err == nil {
			f := strings.Fields(string(q))
			if len(f) == 2 && f[0] != "max" {
				quota, _ := strconv.ParseFloat(f[0], 64)
				period, _ := strconv.ParseFloat(f[1], 64)
				if period > 0 {
					limit = quota / period
				}
			}
		}
		if use > 0 {
			return use, limit, true
		}
	}
	return 0, 0, false
}

type controllerDirs struct {
	root string
	leaf string
	v2   bool
}

func cgroupControllerDirs(controller string) controllerDirs {
	const mount = "/sys/fs/cgroup"
	data, _ := os.ReadFile("/proc/self/cgroup")
	for _, line := range strings.Split(string(data), "\n") {
		f := strings.SplitN(line, ":", 3)
		if len(f) != 3 || !strings.HasPrefix(f[2], "/") {
			continue
		}
		if f[0] == "0" && f[1] == "" {
			return controllerDirs{root: mount, leaf: filepath.Join(mount, filepath.Clean(f[2])), v2: true}
		}
		if strings.Contains(","+f[1]+",", ","+controller+",") {
			root := filepath.Join(mount, controller)
			return controllerDirs{root: root, leaf: filepath.Join(root, filepath.Clean(f[2]))}
		}
	}
	return controllerDirs{}
}

func cgroupMemoryUsage(d controllerDirs) (uint64, bool) {
	if d.leaf == "" {
		return 0, false
	}
	name := "memory.usage_in_bytes"
	if d.v2 {
		name = "memory.current"
	}
	n, err := readUint(filepath.Join(d.leaf, name))
	return n, err == nil
}

// The effective bound is the smallest finite limit from leaf to mount root.
func cgroupLimit(d controllerDirs, v2Name, v1Name string) uint64 {
	if d.leaf == "" {
		return 0
	}
	name := v1Name
	if d.v2 {
		name = v2Name
	}
	var limit uint64
	for dir := d.leaf; ; dir = filepath.Dir(dir) {
		n, err := readUint(filepath.Join(dir, name))
		// v1 represents unlimited memory with a large page-aligned sentinel.
		if err == nil && n > 0 && (d.v2 || name != "memory.limit_in_bytes" || n < 1<<62) && (limit == 0 || n < limit) {
			limit = n
		}
		if dir == d.root || dir == filepath.Dir(dir) {
			return limit
		}
	}
}

func hostMemoryTotal() uint64 {
	b, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		if len(f) >= 2 && f[0] == "MemTotal:" {
			n, _ := strconv.ParseUint(f[1], 10, 64)
			return n * 1024
		}
	}
	return 0
}
func readUint(path string) (uint64, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	return strconv.ParseUint(strings.TrimSpace(string(b)), 10, 64)
}
func diskMetric(path string) metricValue {
	var st syscall.Statfs_t
	if path == "" || syscall.Statfs(path, &st) != nil {
		return metricValue{}
	}
	total, free := st.Blocks*uint64(st.Bsize), st.Bavail*uint64(st.Bsize)
	used := total - free
	return metricValue{UsedBytes: used, TotalBytes: total, Percent: percent(used, total)}
}
func percent(used, total uint64) float64 {
	if total == 0 {
		return 0
	}
	return clampPercent(float64(used) / float64(total) * 100)
}
func clampPercent(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}
