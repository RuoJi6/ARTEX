package server

import "time"

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

// noResultRemaining excludes pauses, queue time and closed schedule windows by
// using the same active execution segments as the task runtime display.
func noResultRemaining(seconds int, state taskLifecycleState, now int64) time.Duration {
	runtime := taskRunSeconds(state.ActiveRunSeconds, state.RunSegmentStartedAt, now, state.Status, state.Paused, state.Queued)
	elapsed := max(int64(0), runtime-state.NoResultBaseSeconds)
	remaining := max(int64(0), int64(seconds)-elapsed)
	return time.Duration(remaining) * time.Second
}
