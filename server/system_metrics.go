package server

import (
	"encoding/json"
	"net/http"
	"time"
)

type metricValue struct {
	UsedBytes  uint64  `json:"used_bytes"`
	TotalBytes uint64  `json:"total_bytes"`
	Percent    float64 `json:"percent"`
}

type systemMetricsResponse struct {
	Scope     string      `json:"scope"`
	Supported bool        `json:"supported"`
	Timestamp time.Time   `json:"timestamp"`
	CPU       metricValue `json:"cpu"`
	Memory    metricValue `json:"memory"`
	Disk      metricValue `json:"disk"`
	DataDisk  metricValue `json:"data_disk"`
	Container bool        `json:"container_metrics"`
}

func (s *Server) systemMetrics(w http.ResponseWriter, r *http.Request) {
	out := systemMetricsSnapshot(s)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}
