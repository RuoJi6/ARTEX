package traffic

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestTrafficIDSearchAndToolReference(t *testing.T) {
	tr, _ := openTraffic(t)
	tr.record(newFlow("id.example", "GET", "/proof", nil, []byte("verified proof")))
	tr.record(newFlow("other.example", "GET", "/other", nil, []byte("other response")))
	rows, _, err := tr.Page(PageQuery{Host: "id.example", RespMin: -1, RespMax: -1}, 0, 10)
	if err != nil || len(rows) != 1 {
		t.Fatalf("rows=%v err=%v", rows, err)
	}
	id := rows[0].ID
	for _, fts := range []bool{true, false} {
		if fts && !tr.fts {
			continue
		}
		previous := tr.fts
		tr.fts = fts
		for _, query := range []string{id, id[len(id)-2:]} {
			found, total, err := tr.Page(PageQuery{Host: "id.example", Query: query, RespMin: -1, RespMax: -1}, 0, 1)
			if err != nil || total != 1 || len(found) != 1 || found[0].ID != id {
				t.Fatalf("fts=%v query=%s rows=%v total=%d err=%v", fts, query, found, total, err)
			}
		}
		tr.fts = previous
	}
	for _, tool := range tr.Tools() {
		if tool.Name() != "traffic_get" {
			continue
		}
		input, _ := json.Marshal(map[string]string{"id": id})
		result, err := tool.Call(context.Background(), input, nil)
		if err != nil || result.IsError || !strings.Contains(result.Flatten(), "verified proof") {
			t.Fatalf("traffic_get result=%s err=%v", result.Flatten(), err)
		}
	}
	// An ID search still respects host and method filters.
	_, total, err := tr.Page(PageQuery{Query: id, Host: "other.example", RespMin: -1, RespMax: -1}, 0, 10)
	if err != nil || total != 0 {
		t.Fatalf("cross-host ID search total=%d err=%v", total, err)
	}
}
