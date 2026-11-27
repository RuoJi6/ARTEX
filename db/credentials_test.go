package db

import (
	"encoding/json"
	"testing"
	"time"
)

func TestCredentialSwitchDependencyAndLeases(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	oldRecording := d.GetBool(SettingTaskIntelligence, DefaultTaskIntelligence)
	oldAgent, oldBinding := d.GetBool(SettingCredentialAgent, false), d.GetBool(SettingCredentialTraffic, false)
	defer func() {
		_ = d.SetBool(SettingTaskIntelligence, oldRecording)
		_ = d.SetCredentialAgentSettings(t.Context(), &oldAgent, nil)
		if oldAgent {
			_ = d.SetCredentialAgentSettings(t.Context(), nil, &oldBinding)
		}
	}()
	off, on := false, true
	_ = d.SetIntelligenceSettings(t.Context(), &off, nil, nil)
	if err = d.SetCredentialAgentSettings(t.Context(), &on, nil); err == nil {
		t.Fatal("agent enabled without recording")
	}
	_ = d.SetIntelligenceSettings(t.Context(), &on, nil, nil)
	if err = d.SetCredentialAgentSettings(t.Context(), &off, nil); err != nil {
		t.Fatal(err)
	}
	if err = d.SetCredentialAgentSettings(t.Context(), nil, &on); err == nil {
		t.Fatal("binding allowed without parent")
	}
	if err = d.SetCredentialAgentSettings(t.Context(), &on, &on); err != nil {
		t.Fatal(err)
	}
	if err = d.SetCredentialAgentSettings(t.Context(), &off, nil); err != nil || d.GetBool(SettingCredentialTraffic, true) {
		t.Fatal("parent off did not clear dependent switch", err)
	}
	_ = d.SetCredentialAgentSettings(t.Context(), &on, nil)
	_ = d.SetIntelligenceSettings(t.Context(), &off, nil, nil)
	if d.GetBool(SettingCredentialAgent, true) || d.GetBool(SettingCredentialTraffic, true) {
		t.Fatal("recording off did not cascade")
	}
	_ = d.SetIntelligenceSettings(t.Context(), &on, &on, nil)
	task, err := d.CreateTask("credential queue", "local fixture", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(task.ID)
	in := testIntelligenceInput()
	in.Status = "verified"
	item, err := d.RecordIntelligence(t.Context(), task.ID, 0, "qa", in)
	if err != nil {
		t.Fatal(err)
	}
	first, err := d.ClaimCredentialJob(t.Context(), false, task.ID)
	if err != nil || first == nil || first.ID != item.ID {
		t.Fatalf("claim %+v %v", first, err)
	}
	if duplicate, err := d.ClaimCredentialJob(t.Context(), false, task.ID); err != nil || duplicate != nil {
		t.Fatal("same lease claimed twice", duplicate, err)
	}
	result := CredentialAnalysis{State: "ready", Method: "rules", SourceHash: CredentialSourceHash(in.Content), Accounts: []CredentialAccount{{Username: "qa", Password: "local-fixture-secret"}}, TrafficState: "off"}
	if err = d.FinishCredentialJob(t.Context(), first, result); err != nil {
		t.Fatal(err)
	}
	got, err := d.GetIntelligence(t.Context(), item.ID)
	if err != nil || got.Credentials == nil || got.Credentials.State != "ready" || got.Status != "verified" || got.Content != in.Content {
		t.Fatalf("result: %+v %v", got, err)
	}
	if duplicate, err := d.ClaimCredentialJob(t.Context(), false, task.ID); err != nil || duplicate != nil {
		t.Fatal("ready record reprocessed")
	}
	// Binding can be added later without rerunning extraction. Stale lease writes
	// must not overwrite the newly claimed run.
	second, err := d.ClaimCredentialJob(t.Context(), true, task.ID)
	if err != nil || second == nil {
		t.Fatal("late binding not queued", err)
	}
	stale := result
	stale.State = "error"
	_ = d.FinishCredentialJob(t.Context(), first, stale)
	got, _ = d.GetIntelligence(t.Context(), item.ID)
	if got.Credentials.State != "processing" || got.Credentials.Lease != second.Credentials.Lease {
		t.Fatal("stale completion overwrote newer lease")
	}
	_ = d.SetCredentialAgentSettings(t.Context(), &off, nil)
	if err = d.FinishCredentialJob(t.Context(), second, result); err != nil {
		t.Fatal(err)
	}
	got, _ = d.GetIntelligence(t.Context(), item.ID)
	if got.Credentials.State != "queued" {
		t.Fatal("disabled job published")
	}
	_ = d.SetCredentialAgentSettings(t.Context(), &on, nil)
	third, err := d.ClaimCredentialJob(t.Context(), false, task.ID)
	if err != nil || third == nil {
		t.Fatal("interrupted job not recoverable", err)
	}
	expiry := time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)
	raw, _ := json.Marshal(expiry)
	_, err = d.Exec(`UPDATE task_intelligence SET credential_analysis=jsonb_set(credential_analysis,'{lease_until}',$2::jsonb) WHERE id=$1`, item.ID, string(raw))
	if err != nil {
		t.Fatal(err)
	}
	recovered, err := d.ClaimCredentialJob(t.Context(), false, task.ID)
	if err != nil || recovered == nil || recovered.Credentials.Lease == third.Credentials.Lease {
		t.Fatal("expired lease not recovered", err)
	}
}
