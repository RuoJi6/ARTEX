package server

// taskRunSeconds computes displayed active runtime from persisted segment data.
// Segment timestamps are unix seconds; a zero start means no active segment.
func taskRunSeconds(active, segmentStarted, now int64, status string, paused, queued bool) int64 {
	if active < 0 {
		active = 0
	}
	if status == "running" && !paused && !queued && segmentStarted > 0 && now > segmentStarted {
		return active + now - segmentStarted
	}
	return active
}

// finalizeTaskRunSeconds mirrors the database transition for deterministic unit
// tests and callers that need to reason about a segment without a live database.
func finalizeTaskRunSeconds(active, segmentStarted, now int64) (int64, int64) {
	if active < 0 {
		active = 0
	}
	if segmentStarted > 0 && now > segmentStarted {
		active += now - segmentStarted
	}
	return active, 0
}
