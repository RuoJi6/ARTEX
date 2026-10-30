package server

import (
	"encoding/json"
	"fmt"
	"github.com/Autumn-27/artex/db"
	"strings"
	"testing"
)

func TestIntelligenceHTTPSettingsAndScope(t *testing.T) {
	s, initial, request := trafficEvidenceServer(t)
	f, err := s.m.pg.GetFinding(initial.FindingID)
	if err != nil {
		t.Fatal(err)
	}
	taskID := *f.TaskID
	if s.settingsPayload()[db.SettingTaskIntelligence] != false {
		t.Fatal("default must be off")
	}
	if s.settingsPayload()[db.SettingTaskAutoTitle] != false || s.settingsPayload()[db.SettingChatAutoTitle] != false {
		t.Fatal("auto title settings must default to off")
	}
	if r := request("PUT", "/api/settings", `{"task_auto_title_enabled":true,"chat_auto_title_enabled":true}`); r.Code != 200 {
		t.Fatal(r.Code, r.Body)
	}
	if !s.m.pg.GetBool(db.SettingTaskAutoTitle, false) || !s.m.pg.GetBool(db.SettingChatAutoTitle, false) {
		t.Fatal("auto title settings were not persisted")
	}
	defer s.m.pg.SetBool(db.SettingTaskAutoTitle, false)
	defer s.m.pg.SetBool(db.SettingChatAutoTitle, false)
	if r := request("PUT", "/api/settings", `{"task_intelligence_enabled":true}`); r.Code != 200 {
		t.Fatal(r.Code, r.Body)
	}
	defer s.m.pg.SetBool(db.SettingTaskIntelligence, false)
	if !s.m.pg.GetBool(db.SettingTaskIntelligence, false) {
		t.Fatal("setting not persisted")
	}
	in := db.IntelligenceInput{Kind: "credential", Title: "test credential", Content: "local-api-fixture-secret", Evidence: "local fixture evidence", Confidence: "observed"}
	item, err := s.m.pg.RecordIntelligence(t.Context(), taskID, 0, "qa", in)
	if err != nil {
		t.Fatal(err)
	}
	base := fmt.Sprintf("/api/tasks/%d/intelligence", taskID)
	r := request("GET", base, "")
	if r.Code != 200 || !strings.Contains(r.Body.String(), in.Content) || !strings.Contains(r.Body.String(), in.Evidence) {
		t.Fatalf("list omitted content or evidence: %d %s", r.Code, r.Body)
	}
	r = request("GET", fmt.Sprintf("%s/%d", base, item.ID), "")
	if r.Code != 200 || !strings.Contains(r.Body.String(), in.Content) {
		t.Fatal("detail content missing", r.Code, r.Body)
	}
	if r = request("PATCH", fmt.Sprintf("%s/%d", base, item.ID), `{"status":"verified"}`); r.Code != 200 {
		t.Fatal(r.Code, r.Body)
	}
	other, err := s.m.pg.CreateTask("unrelated intel API", "test", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer s.m.pg.DeleteTask(other.ID)
	for _, method := range []string{"GET", "PATCH"} {
		r = request(method, fmt.Sprintf("/api/tasks/%d/intelligence/%d", other.ID, item.ID), `{"status":"invalid"}`)
		if r.Code != 404 {
			t.Fatal("cross task access", method, r.Code, r.Body)
		}
	}
	if _, err = s.m.pg.Exec(`INSERT INTO task_relations(task_id,source_task_id) VALUES($1,$2)`, other.ID, taskID); err != nil {
		t.Fatal(err)
	}
	r = request("GET", fmt.Sprintf("/api/tasks/%d/intelligence/%d", other.ID, item.ID), "")
	if r.Code != 200 {
		t.Fatal(r.Code, r.Body)
	}
	var got db.Intelligence
	if err = json.Unmarshal(r.Body.Bytes(), &got); err != nil || !got.Inherited {
		t.Fatal("missing inherited marker")
	}
	if r = request("PATCH", fmt.Sprintf("/api/tasks/%d/intelligence/%d", other.ID, item.ID), `{"status":"invalid"}`); r.Code != 404 {
		t.Fatal("inherited mutation accepted")
	}
	if r = request("PUT", "/api/settings", `{"task_intelligence_enabled":false}`); r.Code != 200 {
		t.Fatal(r.Code, r.Body)
	}
	if r = request("GET", base, ""); r.Code != 200 || !strings.Contains(r.Body.String(), `"total":1`) {
		t.Fatal("disable hid saved records")
	}
}
