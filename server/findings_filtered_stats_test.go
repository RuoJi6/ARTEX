package server

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestFindingStatsFiltersHTTP(t *testing.T) {
	s, recorded, request := trafficEvidenceServer(t)
	finding, err := s.m.pg.GetFinding(recorded.FindingID)
	if err != nil || finding == nil {
		t.Fatal("missing fixture finding", err)
	}
	filter := fmt.Sprintf("task_id=%d&severity=low&status=pending&vulnclass=TEST&q=bound&from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z", *finding.TaskID)
	for _, suffix := range []string{"", "&page=2&limit=1"} {
		r := request("GET", "/api/exploration/findings/stats?"+filter+suffix, "")
		var st db.FindingStats
		if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &st) != nil || st.Total != 1 || st.Low != 1 || st.High != 0 || st.Distinct == nil || st.Distinct.Total != 1 {
			t.Fatalf("status=%d stats=%s", r.Code, r.Body)
		}
	}
	r := request("GET", "/api/exploration/findings/stats?"+filter+"&asset_scope=__none__", "")
	if r.Code != 200 {
		t.Fatal(r.Code, r.Body)
	}
	r = request("GET", fmt.Sprintf("/api/exploration/findings/stats?task_id=%d&severity=high", *finding.TaskID), "")
	var st db.FindingStats
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &st) != nil || st.Total != 0 || st.Distinct.Total != 0 {
		t.Fatalf("empty filtered stats=%s", r.Body)
	}
	if len(st.Tasks) == 0 || len(st.VulnClasses) == 0 {
		t.Fatal("empty result removed filter choices")
	}
}
