//go:build !linux

package server

import "time"

func systemMetricsSnapshot(_ *Server) systemMetricsResponse {
	return systemMetricsResponse{Scope: "unsupported", Supported: false, Timestamp: time.Now().UTC()}
}
