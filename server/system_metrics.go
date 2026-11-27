package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Autumn-27/artex/internal/toolguard"
)

type metricValue struct {
	UsedBytes  uint64  `json:"used_bytes"`
	TotalBytes uint64  `json:"total_bytes"`
	Percent    float64 `json:"percent"`
}

type resourceLimitsInfo struct {
	ContainerMemoryLimitBytes uint64 `json:"container_memory_limit_bytes"`
	ContainerMemoryBounded    bool   `json:"container_memory_bounded"`
	ContainerPidsLimit        uint64 `json:"container_pids_limit"`
	ToolMemoryLimitMB         int    `json:"tool_memory_limit_mb"`
	ToolTimeoutSeconds        int    `json:"tool_timeout_seconds"`
	ToolPidsLimit             int    `json:"tool_pids_limit"`
	ToolCgroupAvailable       bool   `json:"tool_cgroup_available"`
	ToolRSSWatchdogAvailable  bool   `json:"tool_rss_watchdog_available"`
}

type systemMetricsResponse struct {
	Scope     string             `json:"scope"`
	Supported bool               `json:"supported"`
	Timestamp time.Time          `json:"timestamp"`
	CPU       metricValue        `json:"cpu"`
	Memory    metricValue        `json:"memory"`
	Disk      metricValue        `json:"disk"`
	DataDisk  metricValue        `json:"data_disk"`
	Container bool               `json:"container_metrics"`
	Limits    resourceLimitsInfo `json:"limits"`
}

func toolResourceLimits() resourceLimitsInfo {
	cfg := toolguard.FromEnv()
	return resourceLimitsInfo{
		ToolMemoryLimitMB:        cfg.MemoryLimitMB,
		ToolTimeoutSeconds:       int(cfg.Timeout / time.Second),
		ToolPidsLimit:            cfg.PidsLimit,
		ToolCgroupAvailable:      toolguard.CgroupV2Available(),
		ToolRSSWatchdogAvailable: cfg.RSSWatchdogAvailable(),
	}
}

func (s *Server) systemMetrics(w http.ResponseWriter, r *http.Request) {
	out := systemMetricsSnapshot(s)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}
