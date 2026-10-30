package server

import (
	"net/http"
	"strconv"

	"github.com/Autumn-27/artex/agent"
)

func (s *Server) plannerOverviewPreview(w http.ResponseWriter, r *http.Request) {
	taskID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || taskID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid task id")
		return
	}
	t, ok := s.m.Task(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, "task not found")
		return
	}
	tsx := agent.NewToolSet(t.Store, "planner")
	as := s.m.Assets()
	if as != nil {
		tsx.SetAssetStore(as, as.Companies())
	}
	tsx.SetTaskID(taskID)
	tsx.SetCoverageEnabled(as == nil || as.CoverageEnabled(taskID))
	if origin, _ := t.Store.OriginFactID(); origin > 0 {
		tsx.SetOwnerNode(origin)
	}
	compact, full, err := tsx.PlannerOverviewPreview()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	compactBytes, fullBytes := len(compact), len(full)
	reduction := 0.0
	if fullBytes > 0 {
		reduction = float64(fullBytes-compactBytes) * 100 / float64(fullBytes)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"task_id":        t.ID,
		"compact":        compact,
		"full":           full,
		"compact_bytes":  compactBytes,
		"full_bytes":     fullBytes,
		"reduction_pct":  reduction,
		"converter_mode": s.m.PlannerCompactOverviewEnabled(),
	})
}
