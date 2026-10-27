package db

import (
	"database/sql"
	"encoding/json"
	"reflect"
	"testing"
)

func TestFindingReproductionAndTrafficStepIndex(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()
	repro := json.RawMessage(`{"entry_point":"POST /upload.php","steps":[{"request":"POST /upload.php HTTP/1.1","expected":"201","proves":"upload accepted"}]}`)
	fid, err := d.AddFinding(0, 0, "upload", "upload", SeverityHigh, "summary", "poc", "test", nil, repro)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteFinding(fid)
	f, err := d.GetFinding(fid)
	if err != nil {
		t.Fatalf("reproduction round trip: %#v, %v", f, err)
	}
	var wantRepro, gotRepro map[string]any
	if err := json.Unmarshal(repro, &wantRepro); err != nil {
		t.Fatalf("unmarshal input reproduction: %v", err)
	}
	if err := json.Unmarshal(f.Reproduction, &gotRepro); err != nil {
		t.Fatalf("unmarshal round-trip reproduction: %v", err)
	}
	if !reflect.DeepEqual(gotRepro, wantRepro) {
		t.Fatalf("reproduction round trip: got %#v, want %#v", gotRepro, wantRepro)
	}
	snapshot := TrafficEvidenceSnapshot{SourceTrafficID: "source-1", CapturedAt: 1, URL: "https://example.test/upload.php", Method: "POST", Status: 201, ReqHash: "req", RespHash: "resp"}
	snapshot.ID = TrafficSnapshotID(snapshot)
	prepared := []PreparedTrafficEvidence{{Ref: TrafficRef{TrafficID: "source-1", StepIndex: 2, Role: "proof"}, Snapshot: snapshot}}
	if err := d.WithEvidenceTx(t.Context(), func(tx *sql.Tx) error {
		if err := InsertEvidenceSnapshotTx(tx, snapshot); err != nil {
			return err
		}
		return AddFindingTrafficTx(tx, fid, prepared)
	}); err != nil {
		t.Fatal(err)
	}
	traffic, err := d.GetFindingTraffic(t.Context(), fid)
	if err != nil || len(traffic.Bindings) != 1 || traffic.Bindings[0].StepIndex != 2 {
		t.Fatalf("step binding round trip: %#v, %v", traffic, err)
	}
	zero := 0
	if err := d.EditFindingTrafficStep(t.Context(), fid, traffic.Bindings[0].ID, traffic.Version, nil, nil, &zero, false, nil); err != nil {
		t.Fatal(err)
	}
	traffic, err = d.GetFindingTraffic(t.Context(), fid)
	if err != nil || traffic.Bindings[0].StepIndex != 0 {
		t.Fatalf("step edit: %#v, %v", traffic, err)
	}
	if err := d.EditFindingTraffic(t.Context(), fid, traffic.Bindings[0].ID, traffic.Version, nil, nil, true, nil); err != nil {
		t.Fatal(err)
	}
}

func TestFindingWithoutReproductionLoadsNull(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	defer d.Close()
	fid, err := d.AddFinding(0, 0, "legacy", "legacy", SeverityLow, "summary", "evidence", "test", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteFinding(fid)
	f, err := d.GetFinding(fid)
	if err != nil {
		t.Fatal(err)
	}
	if f.Reproduction != nil {
		t.Fatalf("legacy reproduction = %s, want nil", f.Reproduction)
	}
}
