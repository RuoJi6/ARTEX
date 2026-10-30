package agent

// cold-digest §4/§5/§7: the Compactor ties the pure algorithms (coldgraph.go)
// to the store (db/digest.go) and the LLM. It runs in two modes:
//
//	maintain — cheap, synchronous, once per planner round: bump round_no,
//	           recompute hot/cold, stamp/clear cold_since_round (§2.3). This is
//	           the bookkeeping the planner does anyway; it never calls the LLM.
//	minor/major — background, off the planner hot path (§7): group cold nodes
//	           and compress each ≥2 block into a digest via the LLM. minor folds
//	           only the not-yet-covered cold set (tiered append); major re-derives
//	           the whole grouping from source and merges fragments (§5.1/§5.2),
//	           reusing bodies whose signature is unchanged (§5.3).
//
// Concurrency: one compaction per task at a time (mutex), ≥cooldown between runs.
// The final graph, input and version check shares a serializable transaction with
// the digest write; conflicting writes abort the digest for a later retry.

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/transcript"
)

// Compactor performs background cold-node compaction for many explorations.
type Compactor struct {
	prov     llm.Provider
	model    string
	params   coldParams
	n, m     int           // minor / major thresholds (§7 N=20, M=8)
	cooldown time.Duration // min gap between compactions per task (§7 60s)
	maxDur   time.Duration // hard cap on one background compaction

	mu      sync.Mutex
	running map[int64]bool
	lastRun map[int64]time.Time
}

// NewCompactor builds a compactor. prov/model are used for the §4 body LLM call
// (same model the agent runs on, per §4). A nil Compactor is a safe no-op.
func NewCompactor(prov llm.Provider, model string) *Compactor {
	return &Compactor{
		prov:     prov,
		model:    model,
		params:   defaultColdParams(),
		n:        20,
		m:        8,
		cooldown: 60 * time.Second,
		maxDur:   5 * time.Minute,
		running:  map[int64]bool{},
		lastRun:  map[int64]time.Time{},
	}
}

// OnPlannerRound is the single entry the planner calls each wake-up. It bumps the
// round, maintains the cold stamps synchronously, then (if a threshold is hit and
// no compaction is running / cooling down) launches a background compaction that
// outlives this planner round.
func (c *Compactor) OnPlannerRound(ctx context.Context, ts *db.ExplorationStore) {
	if c == nil || c.prov == nil || ts == nil {
		return
	}
	round, uncompressed, activeDigests, err := c.maintain(ts)
	if err != nil {
		log.Printf("[compaction] maintain exp=%d: %v", ts.ID(), err)
		return
	}
	needMinor := uncompressed >= c.n
	needMajor := activeDigests >= c.m
	if !needMinor && !needMajor {
		return
	}
	if !c.tryStart(ts.ID()) {
		return // already running, or within cooldown —派生态最终一致，下轮再压
	}
	go func() {
		defer c.finish(ts.ID())
		bg, cancel := context.WithTimeout(context.WithoutCancel(ctx), c.maxDur)
		defer cancel()
		// 压缩是裸 provider 调用（compress 里直接 prov.Complete），不经过 agentcore
		// 的会话循环，所以 ctx 上没有 session id；按 session-id 头做提示缓存/粘性
		// 路由的网关（opencode zen 缺 x-opencode-session 直接 400）就收不到该头。
		// 这里补一个按探索稳定的 id：同一探索的所有压缩请求共享它，既能带上头，
		// 也让 llmrec 能把这次调用的 token 归因回该探索（此前记不到）。
		bg = transcript.WithSessionID(bg, fmt.Sprintf("exp%d-compactor", ts.ID()))
		if needMajor {
			c.major(bg, ts)
		} else {
			c.minor(bg, ts)
		}
	}()
	_ = round
}

// maintain bumps round_no, recomputes hot/cold over the whole graph, and applies
// the cold_since_round stamp/clear ops (§2.3). Returns the new round plus the
// counts that drive the trigger: how many eligible-cold nodes are not yet covered
// (minor) and how many active digests exist (major).
func (c *Compactor) maintain(ts *db.ExplorationStore) (round int64, uncompressed, activeDigests int, err error) {
	round, err = ts.BumpRound()
	if err != nil {
		return
	}
	g, _, err := loadColdGraph(ts)
	if err != nil {
		return
	}
	stamps, err := ts.ColdStamps()
	if err != nil {
		return
	}
	hot := g.hotSet()
	structCold := g.structuralCold(hot)
	ops := computeStampOps(structCold, stamps, round)
	if err = ts.ApplyStampOps(toDBStampOps(ops)); err != nil {
		return
	}
	applyStampsInPlace(stamps, ops)
	elig := g.eligibleCold(structCold, stamps, round, c.params)
	covered, err := ts.CoveredMembers()
	if err != nil {
		return
	}
	for id := range elig {
		if _, ok := covered[id]; !ok {
			uncompressed++
		}
	}
	ad, err := ts.ActiveDigests()
	if err != nil {
		return
	}
	activeDigests = len(ad)
	return
}

// minor folds the not-yet-covered eligible-cold set into new digest segments
// (tiered append, §5). Existing digests are untouched.
func (c *Compactor) minor(ctx context.Context, ts *db.ExplorationStore) {
	round, err := ts.RoundNo()
	if err != nil {
		return
	}
	g, nodeByID, err := loadColdGraph(ts)
	if err != nil {
		return
	}
	stamps, err := ts.ColdStamps()
	if err != nil {
		return
	}
	cvers, err := ts.ContentVersions()
	if err != nil {
		return
	}
	covered, err := ts.CoveredMembers()
	if err != nil {
		return
	}
	hot := g.hotSet()
	elig := g.eligibleCold(g.structuralCold(hot), stamps, round, c.params)
	uncompressed := map[int64]bool{}
	for id := range elig {
		if _, ok := covered[id]; !ok {
			uncompressed[id] = true
		}
	}
	blocks := g.group(uncompressed, c.params)
	if len(blocks) == 0 {
		return // this batch has no ≥2 connected/shared-parent block — nothing to fold (§7)
	}
	for _, b := range blocks {
		c.foldBlock(ctx, ts, g, b, nodeByID, cvers, c.generationFor(b, nil))
	}
	// A minor may have pushed the segment count over M → merge in the same run.
	if ad, e := ts.ActiveDigests(); e == nil && len(ad) >= c.m {
		c.major(ctx, ts)
	}
}

// major re-derives the whole grouping from source over ALL eligible-cold nodes
// (§5.1 回源重压), then reconciles against the active digests by signature:
// unchanged blocks keep their digest (no LLM), stale digests are superseded, and
// new/changed blocks are compressed afresh. This is where tiered fragments of one
// direction merge and where "later became connected" blocks unify (§5.2).
func (c *Compactor) major(ctx context.Context, ts *db.ExplorationStore) {
	round, err := ts.RoundNo()
	if err != nil {
		return
	}
	g, nodeByID, err := loadColdGraph(ts)
	if err != nil {
		return
	}
	stamps, err := ts.ColdStamps()
	if err != nil {
		return
	}
	cvers, err := ts.ContentVersions()
	if err != nil {
		return
	}
	active, err := ts.ActiveDigests()
	if err != nil {
		return
	}
	hot := g.hotSet()
	elig := g.eligibleCold(g.structuralCold(hot), stamps, round, c.params)
	blocks := g.group(elig, c.params)

	bySig := map[string]*db.Node{}
	for _, d := range active {
		sig, _ := digestSigGen(d)
		bySig[sig] = d
	}
	desired := map[string]bool{}
	var toCreate []block
	for _, b := range blocks {
		sig := blockSignature(b, cvers)
		desired[sig] = true
		if _, ok := bySig[sig]; ok {
			continue // unchanged → reuse the existing digest, skip LLM (§5.3)
		}
		toCreate = append(toCreate, b)
	}
	// Supersede stale digests FIRST (atomic drop of their covers edges) so a member
	// is never covered by both an old and a new digest (§5.1 one-member-one-digest).
	var stale []int64
	for _, d := range active {
		sig, _ := digestSigGen(d)
		if !desired[sig] {
			stale = append(stale, d.ID)
		}
	}
	if err := ts.SupersedeDigests(stale); err != nil {
		log.Printf("[compaction] supersede exp=%d: %v", ts.ID(), err)
	}
	for _, b := range toCreate {
		c.foldBlock(ctx, ts, g, b, nodeByID, cvers, c.generationFor(b, active))
	}
}

// foldBlock regenerates the body if members or their versions change during
// compression. It commits only when the body and final block describe the same
// stable snapshot; a continuously changing block is left for a later run.
func (c *Compactor) foldBlock(ctx context.Context, ts *db.ExplorationStore, g *coldGraph, b block, nodeByID map[int64]*db.Node, cvers map[int64]int, generation int) {
	currentGraph, current, currentNodes, currentVersions := g, b, nodeByID, cvers
	for attempt := 0; attempt < 2; attempt++ {
		body, err := c.compress(ctx, currentGraph, current, currentNodes)
		if err != nil {
			log.Printf("[compaction] compress exp=%d block=%v: %v", ts.ID(), current.Members, err)
			return
		}
		fresh, freshNodes, err := loadColdGraph(ts)
		if err != nil {
			return
		}
		freshVersions, err := ts.ContentVersions()
		if err != nil {
			return
		}
		freshHot := fresh.hotSet()
		members := make([]int64, 0, len(current.Members))
		for _, mID := range current.Members {
			if !freshHot[mID] {
				members = append(members, mID)
			}
		}
		if len(members) < c.params.K {
			return
		}
		final := block{Members: members, Anchors: current.Anchors}
		signature := blockSignature(final, freshVersions)
		if signature == blockSignature(current, currentVersions) {
			payload := digestPayload(body, final, freshNodes, generation, signature)
			input := buildCompressionInput(currentGraph, current, currentNodes)
			if _, err := addLineageDigestChecked(ctx, ts, payload, final, signature, input); err != nil {
				log.Printf("[compaction] add digest exp=%d: %v", ts.ID(), err)
			}
			return
		}
		currentGraph, current, currentNodes, currentVersions = fresh, final, freshNodes, freshVersions
	}
	log.Printf("[compaction] skip unstable block exp=%d members=%v", ts.ID(), current.Members)
}

func lineageDigestSnapshotCheck(ts *db.ExplorationStore, b block, signature, input string) db.LineageDigestCheck {
	return func(tx *sql.Tx) error {
		g, nodes, err := loadColdGraphTx(ts, tx)
		if err != nil {
			return err
		}
		hot := g.hotSet()
		for _, id := range b.Members {
			if hot[id] {
				return db.ErrLineageDigestSnapshotChanged
			}
		}
		versions, err := ts.ContentVersionsTx(tx)
		if err != nil {
			return err
		}
		if blockSignature(b, versions) != signature || buildCompressionInput(g, b, nodes) != input {
			return db.ErrLineageDigestSnapshotChanged
		}
		return nil
	}
}

func addLineageDigestChecked(ctx context.Context, ts *db.ExplorationStore, payload map[string]any, b block, signature, input string) (int64, error) {
	return ts.AddLineageDigestChecked(ctx, payload, b.Members, lineageDigestSnapshotCheck(ts, b, signature, input))
}

// generationFor computes a digest's重摘代次 (§1): 1 for a fresh fold; for a major
// merge, max(generation) over the active digests that overlap this block's
// members, +1.
func (c *Compactor) generationFor(b block, active []*db.Node) int {
	if len(active) == 0 {
		return 1
	}
	memberSet := make(map[int64]bool, len(b.Members))
	for _, m := range b.Members {
		memberSet[m] = true
	}
	best := 0
	for _, d := range active {
		_, gen := digestSigGen(d)
		for _, m := range digestMemberIDs(d) {
			if memberSet[m] {
				if gen > best {
					best = gen
				}
				break
			}
		}
	}
	return best + 1
}

// tryStart acquires the per-task compaction lock, honoring the cooldown.
func (c *Compactor) tryStart(expID int64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.running[expID] {
		return false
	}
	if t, ok := c.lastRun[expID]; ok && time.Since(t) < c.cooldown {
		return false
	}
	c.running[expID] = true
	return true
}

func (c *Compactor) finish(expID int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.running[expID] = false
	c.lastRun[expID] = time.Now()
}

// --- helpers: db ↔ coldgraph ---

// loadColdGraph reads the exploration's nodes + edges and builds the cold-graph
// view plus an id→node index (for summaries/payload during compression).
func loadColdGraph(ts *db.ExplorationStore) (*coldGraph, map[int64]*db.Node, error) {
	g, nodes, _, err := loadColdGraphParts(ts)
	return g, nodes, err
}

func loadColdGraphParts(ts *db.ExplorationStore) (*coldGraph, map[int64]*db.Node, []db.Edge, error) {
	// Compaction must see the WHOLE graph, not the default row caps — pass a very
	// high limit so the LIMIT clause is effectively unbounded for real task sizes.
	const allRows = 1 << 30
	nodes, err := ts.Nodes(allRows)
	if err != nil {
		return nil, nil, nil, err
	}
	edges, err := ts.Edges(allRows)
	if err != nil {
		return nil, nil, nil, err
	}
	return buildColdGraph(nodes, edges), indexColdNodes(nodes), edges, nil
}

func loadColdGraphTx(ts *db.ExplorationStore, tx *sql.Tx) (*coldGraph, map[int64]*db.Node, error) {
	nodes, edges, err := ts.ReadGraphTx(tx)
	if err != nil {
		return nil, nil, err
	}
	return buildColdGraph(nodes, edges), indexColdNodes(nodes), nil
}

func indexColdNodes(nodes []*db.Node) map[int64]*db.Node {
	byID := make(map[int64]*db.Node, len(nodes))
	for _, n := range nodes {
		byID[n.ID] = n
	}
	return byID
}

func buildColdGraph(nodes []*db.Node, edges []db.Edge) *coldGraph {
	cgNodes := make([]cgNode, 0, len(nodes))
	for _, n := range nodes {
		cgNodes = append(cgNodes, cgNode{ID: n.ID, Kind: n.Kind, State: n.State})
	}
	cgEdges := make([]cgEdge, 0, len(edges))
	for _, e := range edges {
		cgEdges = append(cgEdges, cgEdge{From: e.From, Rel: e.Rel, To: e.To})
	}
	return newColdGraph(cgNodes, cgEdges)
}

func toDBStampOps(ops []stampOp) []db.StampOp {
	out := make([]db.StampOp, len(ops))
	for i, o := range ops {
		out[i] = db.StampOp{ID: o.ID, Set: o.Set, Round: o.Round}
	}
	return out
}

// applyStampsInPlace folds the just-applied ops into the in-memory stamp map so
// eligibility can be computed immediately without a re-read.
func applyStampsInPlace(stamps map[int64]*int64, ops []stampOp) {
	for _, o := range ops {
		if o.Set {
			r := o.Round
			stamps[o.ID] = &r
		} else {
			stamps[o.ID] = nil
		}
	}
}

// --- helpers: digest payload ---

// digestPayload builds the digest node payload (cold-digest §1): the body, the
// member ids split by kind (restore cache; source of truth is the covers edges),
// the anchor ids, the generation, and the change-detection signature.
func digestPayload(body string, b block, nodeByID map[int64]*db.Node, generation int, signature string) map[string]any {
	var facts, intents []int64
	for _, m := range b.Members {
		if n := nodeByID[m]; n != nil && n.Kind == db.KindIntent {
			intents = append(intents, m)
		} else {
			facts = append(facts, m)
		}
	}
	return map[string]any{
		"body":       body,
		"member_ids": map[string]any{"facts": facts, "intents": intents},
		"anchor_ids": b.Anchors,
		"generation": generation,
		"signature":  signature,
	}
}

func digestSigGen(n *db.Node) (string, int) {
	var p struct {
		Signature  string `json:"signature"`
		Generation int    `json:"generation"`
	}
	_ = json.Unmarshal(n.Payload, &p)
	return p.Signature, p.Generation
}

func digestMemberIDs(n *db.Node) []int64 {
	var p struct {
		MemberIDs struct {
			Facts   []int64 `json:"facts"`
			Intents []int64 `json:"intents"`
		} `json:"member_ids"`
	}
	_ = json.Unmarshal(n.Payload, &p)
	return append(append([]int64{}, p.MemberIDs.Facts...), p.MemberIDs.Intents...)
}

// --- helpers: compression input + LLM (§4) ---

func nodeSummary(n *db.Node) string {
	if n == nil {
		return ""
	}
	var p map[string]any
	if json.Unmarshal(n.Payload, &p) == nil {
		if s, ok := p["summary"].(string); ok {
			return s
		}
		if t, ok := p["text"].(string); ok {
			return t
		}
	}
	return ""
}

func nodeConfidence(n *db.Node) string {
	if n == nil {
		return ""
	}
	var p map[string]any
	if json.Unmarshal(n.Payload, &p) == nil {
		if c, ok := p["confidence"].(string); ok {
			return c
		}
	}
	return ""
}

func nodeConditions(n *db.Node) string {
	if n == nil {
		return ""
	}
	var p map[string]any
	if json.Unmarshal(n.Payload, &p) == nil {
		if conditions, ok := p["conditions"].(string); ok {
			return conditions
		}
	}
	return ""
}

// buildCompressionInput renders member summaries, evidence boundaries and
// lineage. Anchors provide context but are not compression members.
func buildCompressionInput(g *coldGraph, b block, nodeByID map[int64]*db.Node) string {
	memberSet := make(map[int64]bool, len(b.Members))
	for _, m := range b.Members {
		memberSet[m] = true
	}
	var sb strings.Builder
	sb.WriteString("【成员节点（要压缩的）】：\n")
	for _, m := range b.Members {
		n := nodeByID[m]
		kind := "fact"
		if n != nil && n.Kind == db.KindIntent {
			kind = "intent"
		}
		state := ""
		if n != nil {
			state = n.State
		}
		line := fmt.Sprintf("- #%d [%s/%s] %s", m, kind, state, nodeSummary(n))
		if conf := nodeConfidence(n); conf != "" {
			line += fmt.Sprintf(" (confidence=%s)", conf)
		}
		if conditions := nodeConditions(n); conditions != "" {
			line += fmt.Sprintf(" (conditions=%s)", conditions)
		}
		if n != nil && n.BlockedReason != "" {
			line += fmt.Sprintf(" (blocked_reason=%s)", n.BlockedReason)
		}
		sb.WriteString(line)
		sb.WriteByte('\n')
	}
	// internal edges among members
	var edgeLines []string
	for _, m := range b.Members {
		for _, to := range g.children[m] {
			if memberSet[to] {
				edgeLines = append(edgeLines, fmt.Sprintf("- #%d 产出/派生→ #%d", m, to))
			}
		}
	}
	if len(edgeLines) > 0 {
		sb.WriteString("\n【成员之间的血缘边（父→子）】：\n")
		sort.Strings(edgeLines)
		sb.WriteString(strings.Join(edgeLines, "\n"))
		sb.WriteByte('\n')
	}
	if len(b.Anchors) > 0 {
		sb.WriteString("\n【共同父 / 上下文锚（不是成员，只用于理解这些结果从哪个意图探出）】：\n")
		for _, a := range b.Anchors {
			n := nodeByID[a]
			state := ""
			if n != nil {
				state = n.State
			}
			fmt.Fprintf(&sb, "- #%d [%s] %s\n", a, state, nodeSummary(n))
		}
	}
	return sb.String()
}

// compress runs the §4 body LLM call on one block. Uses the same model the agent
// runs on; thinking disabled (a pure summarization step).
func (c *Compactor) compress(ctx context.Context, g *coldGraph, b block, nodeByID map[int64]*db.Node) (string, error) {
	req := llm.CompletionRequest{
		System:    []string{compressionSystemPrompt},
		Messages:  []llm.Message{llm.UserText(buildCompressionInput(g, b, nodeByID))},
		MaxTokens: 1500,
		Thinking:  "disabled",
	}
	msg, _, _, err := c.prov.Complete(ctx, req)
	if err != nil {
		return "", err
	}
	body := strings.TrimSpace(msg.Text())
	if body == "" {
		return "", fmt.Errorf("empty body from model")
	}
	return body, nil
}

// compressionSystemPrompt is the §4 body prompt.
const compressionSystemPrompt = `你在压缩一组【彼此关联】的探索节点，产出综合结论(body)，供规划者快速判断这片历史做过什么、发现什么、还有什么不能视为完成。

输入包括节点的 id、类型、summary、state，以及可能存在的 confidence、conditions、blocked_reason 和血缘边。共同父只是上下文，不是压缩成员。系统会另行展示全部 Fact 摘要、Intent 真实状态和来源引用，不要在 body 复制这些清单。

body 只写 2–4 句导航摘要，不分节、不列点：
1. 概括共同方向、最关键的正向发现、否定或冲突，以及最重要的未完成边界；相同主题合并，不逐节点复述。
2. 否定只适用于输入给出的范围和 conditions；observed / inferred 必须区分。blocked、exhausted、stopped 只点明关键状态和原因。
3. 用代表来源 id 支持结论（如“…（#12,#28）”），不要编造事实。
4. 通常 80–220 字，最多 300 字。不要罗列接口、参数、payload、账号、路径或执行步骤；具体事实、状态和完整细节由结构化字段及原节点回源展示。

只输出 body 正文本身。`
