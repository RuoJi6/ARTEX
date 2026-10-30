package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
)

func TestLineageDigestCardKeepsDecisionFields(t *testing.T) {
	d := testDB(t)
	defer d.Close()
	task, err := d.CreateTask("lineage decision card", "lineage decision card", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	store := d.Exploration(task.ExplorationID)
	done, err := store.AddIntent(map[string]any{"summary": "verify order authorization"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetIntentState(done, "done"); err != nil {
		t.Fatal(err)
	}
	blocked, err := store.AddIntent(map[string]any{"summary": "verify remaining tenants"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetIntentBlockedReason(blocked, "only two tenant fixtures were available"); err != nil {
		t.Fatal(err)
	}
	positive, err := store.AddNode(db.KindFact, map[string]any{"summary": "tenant A order is readable by tenant B", "confidence": "observed"}, 0, "confirmed", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}
	negative, err := store.AddNode(db.KindFact, map[string]any{"summary": "tenant C order was not readable", "confidence": "inferred", "conditions": "tested only with an expired token"}, 0, "confirmed", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}
	for intent, fact := range map[int64]int64{done: positive, blocked: negative} {
		if err := store.Link(intent, db.RelYields, fact); err != nil {
			t.Fatal(err)
		}
	}
	digest, err := store.AddDigest(map[string]any{"body": "简略正文"}, []int64{done, blocked, positive, negative})
	if err != nil {
		t.Fatal(err)
	}
	overview := NewToolSet(store, "").graphOverviewData()
	cards, ok := overview["cold_digests"].([]map[string]any)
	if !ok || len(cards) != 1 {
		t.Fatalf("cold_digests=%+v", overview["cold_digests"])
	}
	card := cards[0]
	if got := card["key_results"].([]map[string]any); len(got) != 2 {
		t.Fatalf("key_results=%+v", got)
	} else if got[1]["confidence"] != "inferred" || got[1]["conditions"] != "tested only with an expired token" {
		t.Fatalf("negative boundary=%+v", got[1])
	}
	if got := card["work"].([]map[string]any); len(got) != 2 || got[0]["state"] != "done" || got[1]["state"] != "blocked" {
		t.Fatalf("work=%+v", got)
	}
	unresolved := card["unresolved"].([]map[string]any)
	if len(unresolved) != 1 || unresolved[0]["reason"] != "only two tenant fixtures were available" {
		t.Fatalf("unresolved=%+v", unresolved)
	}
	refs := card["source_refs"].(map[string][]int64)
	if len(refs["facts"]) != 2 || len(refs["intents"]) != 2 {
		t.Fatalf("source_refs=%+v", refs)
	}
	expanded := callReadJSON(t, NewToolSet(store, "").expandDigest(), fmt.Sprintf(`{"id":%d}`, digest)).(map[string]any)
	if len(expanded["members"].([]any)) != 4 || len(expanded["key_results"].([]any)) != 2 {
		t.Fatalf("expanded=%+v", expanded)
	}
	rendered := plannerOverviewText(overview)
	for _, want := range []string{
		"简略正文", "tenant A order is readable by tenant B", "tenant C order was not readable",
		"conditions=tested only with an expired token", "未完成:", "only two tenant fixtures were available",
	} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("compact Planner view lost %q:\n%s", want, rendered)
		}
	}
}

func TestLineageCompressionInputIncludesDecisionBoundaries(t *testing.T) {
	nodes := map[int64]*db.Node{
		1: {ID: 1, Kind: db.KindIntent, State: "done", Payload: json.RawMessage(`{"summary":"parent"}`)},
		2: {ID: 2, Kind: db.KindIntent, State: "blocked", BlockedReason: "remaining tenant unavailable", Payload: json.RawMessage(`{"summary":"partial work"}`)},
		3: {ID: 3, Kind: db.KindFact, State: "confirmed", Payload: json.RawMessage(`{"summary":"negative result","conditions":"expired token only"}`)},
	}
	g := newColdGraph(
		[]cgNode{{ID: 1, Kind: db.KindIntent, State: "done"}, {ID: 2, Kind: db.KindIntent, State: "blocked"}, {ID: 3, Kind: db.KindFact, State: "confirmed"}},
		[]cgEdge{{From: 2, Rel: db.RelYields, To: 3}},
	)
	input := buildCompressionInput(g, block{Members: []int64{2, 3}, Anchors: []int64{1}}, nodes)
	for _, want := range []string{"remaining tenant unavailable", "expired token only"} {
		if !strings.Contains(input, want) {
			t.Fatalf("input missing %q: %s", want, input)
		}
	}
}

func TestLineageFoldRegeneratesAfterMemberRevival(t *testing.T) {
	d := testDB(t)
	defer d.Close()
	task, err := d.CreateTask("lineage stable fold", "lineage stable fold", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	store := d.Exploration(task.ExplorationID)
	anchor, err := store.AddIntent(map[string]any{"summary": "parent work"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetIntentState(anchor, "done"); err != nil {
		t.Fatal(err)
	}
	var members []int64
	for i := range 3 {
		id, err := store.AddIntent(map[string]any{"summary": fmt.Sprintf("settled child %d", i)}, 1, nil, "planner")
		if err != nil {
			t.Fatal(err)
		}
		if err := store.SetIntentState(id, "done"); err != nil {
			t.Fatal(err)
		}
		if err := store.Link(anchor, db.RelDerivedFrom, id); err != nil {
			t.Fatal(err)
		}
		members = append(members, id)
	}
	g, nodeByID, err := loadColdGraph(store)
	if err != nil {
		t.Fatal(err)
	}
	versions, err := store.ContentVersions()
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	c := NewCompactor(nil, "")
	c.prov = captureUsageProvider{stream: func(_ context.Context, yield func(llm.StreamEvent, error) bool) {
		calls++
		text := "stable members only"
		if calls == 1 {
			text = "stale body including revived member"
			if err := store.SetIntentState(members[0], "open"); err != nil {
				t.Error(err)
				return
			}
		}
		yield(llm.StreamEvent{Type: llm.SETextDelta, Text: text}, nil)
	}}
	c.foldBlock(context.Background(), store, g, block{Members: members, Anchors: []int64{anchor}}, nodeByID, versions, 1)
	if calls != 2 {
		t.Fatalf("calls=%d want regeneration after revival", calls)
	}
	digests, err := store.ActiveDigests()
	if err != nil || len(digests) != 1 {
		t.Fatalf("digests=%+v err=%v", digests, err)
	}
	var payload struct {
		Body string `json:"body"`
	}
	if err := json.Unmarshal(digests[0].Payload, &payload); err != nil || payload.Body != "stable members only" {
		t.Fatalf("body=%q err=%v", payload.Body, err)
	}
	covered, err := store.DigestMembers(digests[0].ID)
	if err != nil || len(covered) != 2 || covered[0] != members[1] || covered[1] != members[2] {
		t.Fatalf("covered=%v err=%v", covered, err)
	}
	latest, _ := store.ContentVersions()
	signature, _ := digestSigGen(digests[0])
	if want := blockSignature(block{Members: covered, Anchors: []int64{anchor}}, latest); signature != want {
		t.Fatalf("signature=%s want %s", signature, want)
	}
}

func TestLineageBlockedReasonBumpsContentVersion(t *testing.T) {
	d := testDB(t)
	defer d.Close()
	task, err := d.CreateTask("lineage blocked versions", "lineage blocked versions", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	store := d.Exploration(task.ExplorationID)
	intent, err := store.AddIntent(map[string]any{"summary": "verify tenant boundary"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	before, err := store.ContentVersions()
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetIntentBlockedReason(intent, "fixture unavailable"); err != nil {
		t.Fatal(err)
	}
	blocked, _ := store.ContentVersions()
	if blocked[intent] <= before[intent] {
		t.Fatalf("blocked version did not increase: before=%d after=%d", before[intent], blocked[intent])
	}
	if _, err := store.ReopenIntentsByBlockedReason("fixture unavailable"); err != nil {
		t.Fatal(err)
	}
	reopened, _ := store.ContentVersions()
	if reopened[intent] <= blocked[intent] {
		t.Fatalf("reopen version did not increase: blocked=%d reopened=%d", blocked[intent], reopened[intent])
	}
}

func lineageCommitFixture(t *testing.T, name string) (*db.ExplorationStore, block, map[string]any, string, string) {
	t.Helper()
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	task, err := d.CreateTask(name, name, nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	store := d.Exploration(task.ExplorationID)
	anchor, err := store.AddIntent(map[string]any{"summary": "parent work"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetIntentState(anchor, "done"); err != nil {
		t.Fatal(err)
	}
	members := make([]int64, 0, 2)
	for i := range 2 {
		id, err := store.AddIntent(map[string]any{"summary": fmt.Sprintf("settled child %d", i)}, 1, nil, "planner")
		if err != nil {
			t.Fatal(err)
		}
		if err := store.SetIntentState(id, "done"); err != nil {
			t.Fatal(err)
		}
		if err := store.Link(anchor, db.RelDerivedFrom, id); err != nil {
			t.Fatal(err)
		}
		members = append(members, id)
	}
	g, nodes, err := loadColdGraph(store)
	if err != nil {
		t.Fatal(err)
	}
	versions, err := store.ContentVersions()
	if err != nil {
		t.Fatal(err)
	}
	b := block{Members: members, Anchors: []int64{anchor}}
	signature := blockSignature(b, versions)
	input := buildCompressionInput(g, b, nodes)
	return store, b, digestPayload("stable body", b, nodes, 1, signature), signature, input
}

func TestLineageDigestCommitSucceedsWithoutConflict(t *testing.T) {
	store, b, payload, signature, input := lineageCommitFixture(t, "lineage commit stable")
	if _, err := addLineageDigestChecked(context.Background(), store, payload, b, signature, input); err != nil {
		t.Fatal(err)
	}
	digests, err := store.ActiveDigests()
	if err != nil || len(digests) != 1 {
		t.Fatalf("digests=%+v err=%v", digests, err)
	}
}

type lineageGraphMutation struct {
	name   string
	mutate func(*db.ExplorationStore, block) error
	retry  bool
}

func lineageGraphMutations() []lineageGraphMutation {
	return []lineageGraphMutation{
		{name: "member state", mutate: func(store *db.ExplorationStore, b block) error {
			return store.SetIntentState(b.Members[0], "open")
		}},
		{name: "member content", retry: true, mutate: func(store *db.ExplorationStore, b block) error {
			return store.SetIntentBlockedReason(b.Members[0], "concurrent boundary change")
		}},
		{name: "lineage revival", mutate: func(store *db.ExplorationStore, b block) error {
			live, err := store.AddIntent(map[string]any{"summary": "live descendant"}, 1, nil, "planner")
			if err != nil {
				return err
			}
			return store.Link(b.Members[0], db.RelDerivedFrom, live)
		}},
	}
}

func TestLineageDigestCommitRejectsStaleSnapshots(t *testing.T) {
	for _, tt := range lineageGraphMutations() {
		t.Run(tt.name, func(t *testing.T) {
			store, b, payload, signature, input := lineageCommitFixture(t, "lineage stale "+tt.name)
			if err := tt.mutate(store, b); err != nil {
				t.Fatal(err)
			}
			if _, err := addLineageDigestChecked(context.Background(), store, payload, b, signature, input); err == nil {
				t.Fatal("stale snapshot was accepted")
			}
			digests, err := store.ActiveDigests()
			if err != nil || len(digests) != 0 {
				t.Fatalf("stale digests=%+v err=%v", digests, err)
			}
			if tt.retry {
				g, nodes, err := loadColdGraph(store)
				if err != nil {
					t.Fatal(err)
				}
				versions, err := store.ContentVersions()
				if err != nil {
					t.Fatal(err)
				}
				retrySignature := blockSignature(b, versions)
				retryInput := buildCompressionInput(g, b, nodes)
				retryPayload := digestPayload("regenerated body", b, nodes, 1, retrySignature)
				if _, err := addLineageDigestChecked(context.Background(), store, retryPayload, b, retrySignature, retryInput); err != nil {
					t.Fatalf("retry after conflict: %v", err)
				}
				digests, err = store.ActiveDigests()
				if err != nil || len(digests) != 1 {
					t.Fatalf("retry digests=%+v err=%v", digests, err)
				}
			}
		})
	}
}

func TestLineageDigestCommitSerializesConcurrentGraphChanges(t *testing.T) {
	for _, tt := range lineageGraphMutations() {
		t.Run(tt.name, func(t *testing.T) {
			store, b, payload, signature, input := lineageCommitFixture(t, "lineage serialized "+tt.name)
			checked := make(chan struct{})
			release := make(chan struct{})
			digestDone := make(chan error, 1)
			go func() {
				_, err := store.AddLineageDigestChecked(context.Background(), payload, b.Members, func(tx *sql.Tx) error {
					if err := lineageDigestSnapshotCheck(store, b, signature, input)(tx); err != nil {
						return err
					}
					close(checked)
					<-release
					return nil
				})
				digestDone <- err
			}()
			select {
			case <-checked:
			case <-time.After(5 * time.Second):
				t.Fatal("digest check did not reach synchronization point")
			}
			attempting := make(chan struct{})
			mutationDone := make(chan error, 1)
			go func() {
				close(attempting)
				mutationDone <- tt.mutate(store, b)
			}()
			<-attempting
			select {
			case err := <-mutationDone:
				t.Fatalf("graph writer finished while final check was paused: %v", err)
			case <-time.After(100 * time.Millisecond):
			}
			close(release)
			select {
			case err := <-digestDone:
				if err != nil {
					t.Fatalf("digest commit: %v", err)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("digest commit did not finish")
			}
			select {
			case err := <-mutationDone:
				if err != nil {
					t.Fatalf("graph writer after digest commit: %v", err)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("graph writer remained blocked after digest commit")
			}
			digests, err := store.ActiveDigests()
			if err != nil || len(digests) != 1 {
				t.Fatalf("serialized digests=%+v err=%v", digests, err)
			}
		})
	}
}
