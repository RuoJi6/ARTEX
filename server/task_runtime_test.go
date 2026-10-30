package server

import "testing"

func TestTaskRunSecondsRunningSegmentAccumulates(t *testing.T) {
	if got := taskRunSeconds(12, 100, 145, "running", false, false); got != 57 {
		t.Fatalf("running duration = %d, want 57", got)
	}
}

func TestTaskRunSecondsPausedDoesNotGrow(t *testing.T) {
	if got := taskRunSeconds(57, 100, 1000, "paused", true, false); got != 57 {
		t.Fatalf("paused duration = %d, want 57", got)
	}
	if got := taskRunSeconds(57, 100, 1000, "running", false, true); got != 57 {
		t.Fatalf("queued duration = %d, want 57", got)
	}
}

func TestTaskRunSecondsResumeContinuesFromPriorTotal(t *testing.T) {
	active, segment := finalizeTaskRunSeconds(12, 100, 145)
	if active != 57 || segment != 0 {
		t.Fatalf("finalized segment = (%d,%d), want (57,0)", active, segment)
	}
	if got := taskRunSeconds(active, 200, 230, "running", false, false); got != 87 {
		t.Fatalf("resumed duration = %d, want 87", got)
	}
}

func TestTaskRunSecondsTerminalFinalizesSegment(t *testing.T) {
	active, segment := finalizeTaskRunSeconds(20, 500, 560)
	if active != 80 || segment != 0 {
		t.Fatalf("terminal finalization = (%d,%d), want (80,0)", active, segment)
	}
}
