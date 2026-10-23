package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const SettingTaskIntelligence = "task_intelligence_enabled"

var ErrIntelligenceInvalid = errors.New("invalid intelligence")
var ErrIntelligenceNotFound = errors.New("intelligence not found")

type IntelligenceInput struct {
	Kind       string  `json:"kind"`
	Title      string  `json:"title"`
	Content    string  `json:"content"`
	Evidence   string  `json:"evidence"`
	Confidence string  `json:"confidence"`
	Status     string  `json:"status"`
	AssetIDs   []int64 `json:"asset_ids"`
}
type Intelligence struct {
	IntelligenceInput
	ID            int64               `json:"id"`
	TaskID        int64               `json:"task_id"`
	NodeID        *int64              `json:"node_id,omitempty"`
	Worker        string              `json:"worker"`
	CreatedAt     time.Time           `json:"created_at"`
	UpdatedAt     time.Time           `json:"updated_at"`
	Inherited     bool                `json:"inherited"`
	SourceSession string              `json:"source_session,omitempty"`
	Credentials   *CredentialAnalysis `json:"credentials,omitempty"`
}
type IntelligenceFilter struct {
	TaskID  int64
	AssetID int64
	Kind    string
	Status  string
	Query   string
	Limit   int
	Offset  int
}
type IntelligencePage struct {
	Items                    []*Intelligence `json:"items"`
	Total                    int             `json:"total"`
	Counts                   map[string]int  `json:"counts"`
	Enabled                  bool            `json:"enabled"`
	CredentialAgentEnabled   bool            `json:"credential_agent_enabled"`
	CredentialTrafficBinding bool            `json:"credential_traffic_binding"`
}

func ValidIntelligenceStatus(kind, status string) bool {
	switch kind {
	case "credential":
		return status == "unverified" || status == "verified" || status == "invalid"
	case "lead":
		return status == "pending" || status == "in_progress" || status == "dismissed" || status == "converted"
	case "sensitive_data":
		return status == "suspected" || status == "confirmed" || status == "dismissed"
	}
	return false
}
func NormalizeIntelligence(in IntelligenceInput) (IntelligenceInput, error) {
	in.Kind = strings.TrimSpace(in.Kind)
	in.Title = strings.TrimSpace(in.Title)
	in.Content = strings.TrimSpace(in.Content)
	in.Evidence = strings.TrimSpace(in.Evidence)
	if in.Title == "" || in.Content == "" || in.Evidence == "" {
		return in, fmt.Errorf("%w: title/content/evidence 不能为空", ErrIntelligenceInvalid)
	}
	if utf8.RuneCountInString(in.Title) > 200 || len(in.Content) > 32768 || len(in.Evidence) > 8192 || len(in.AssetIDs) > 100 {
		return in, fmt.Errorf("%w: 情报内容过长或关联资产过多", ErrIntelligenceInvalid)
	}
	if in.Confidence != "observed" && in.Confidence != "inferred" {
		return in, fmt.Errorf("%w: confidence 必须为 observed/inferred", ErrIntelligenceInvalid)
	}
	if in.Status == "" {
		switch in.Kind {
		case "credential":
			in.Status = "unverified"
		case "lead":
			in.Status = "pending"
		case "sensitive_data":
			in.Status = "suspected"
		}
	}
	if !ValidIntelligenceStatus(in.Kind, in.Status) {
		return in, fmt.Errorf("%w: 类别或状态无效", ErrIntelligenceInvalid)
	}
	if in.Confidence == "inferred" && (in.Status == "verified" || in.Status == "confirmed") {
		return in, fmt.Errorf("%w: 推测不能标记为验证成功", ErrIntelligenceInvalid)
	}
	seen := map[int64]bool{}
	ids := []int64{}
	for _, id := range in.AssetIDs {
		if id <= 0 {
			return in, fmt.Errorf("%w: asset_ids 必须为正整数", ErrIntelligenceInvalid)
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	in.AssetIDs = ids
	return in, nil
}
func intelligenceFingerprint(in IntelligenceInput) string {
	content := in.Content
	var v any
	if json.Unmarshal([]byte(content), &v) == nil {
		b, _ := json.Marshal(v)
		content = string(b)
	}
	ids := make([]int64, 0, len(in.AssetIDs))
	seen := map[int64]bool{}
	for _, id := range in.AssetIDs {
		if !seen[id] {
			ids = append(ids, id)
			seen[id] = true
		}
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	b, _ := json.Marshal([]any{content, ids})
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

const intelligenceCols = `id,task_id,node_id,kind,title,content,evidence,confidence,status,asset_ids,worker,created_at,updated_at,credential_analysis`

// Resolve provenance from the graph, never from a worker's display number.
// A fact with ambiguous/missing parents deliberately has no exact session link.
const intelligenceSourceSession = `, COALESCE(
 (SELECT 'intent:' || n.id::text FROM exploration_nodes n WHERE n.id=i.node_id AND n.exploration_id=t.exploration_id AND n.kind='intent'),
 (SELECT 'intent:' || min(n.id)::text FROM exploration_edges e JOIN exploration_nodes n ON n.id=e.src_id AND n.kind='intent'
  WHERE e.dst_id=i.node_id AND e.rel='yields' AND e.exploration_id=t.exploration_id AND n.exploration_id=t.exploration_id HAVING count(*)=1),
 CASE WHEN i.worker='planner' THEN 'plan' ELSE '' END)`

func scanIntelligence(row interface{ Scan(...any) error }, withSource ...bool) (*Intelligence, error) {
	item := &Intelligence{}
	var assets, credentials []byte
	dest := []any{&item.ID, &item.TaskID, &item.NodeID, &item.Kind, &item.Title, &item.Content, &item.Evidence, &item.Confidence, &item.Status, &assets, &item.Worker, &item.CreatedAt, &item.UpdatedAt, &credentials}
	if len(withSource) > 0 && withSource[0] {
		dest = append(dest, &item.SourceSession)
	}
	err := row.Scan(dest...)
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(assets, &item.AssetIDs); err != nil {
		return nil, err
	}
	if len(credentials) > 0 && string(credentials) != "null" {
		if err = json.Unmarshal(credentials, &item.Credentials); err != nil {
			return nil, err
		}
	}
	return item, nil
}

// Task and source node are supplied by the host, never chosen by the model.
// The row lock serializes writes with deletion/archive, preventing orphaned writes.
func (d *DB) RecordIntelligence(ctx context.Context, taskID, nodeID int64, worker string, input IntelligenceInput) (*Intelligence, error) {
	in, err := NormalizeIntelligence(input)
	if err != nil {
		return nil, err
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var found int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM tasks WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, taskID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrIntelligenceNotFound
	}
	if err != nil {
		return nil, err
	}
	var node *int64
	if nodeID > 0 {
		err = tx.QueryRowContext(ctx, `SELECT n.id FROM exploration_nodes n JOIN tasks t ON t.exploration_id=n.exploration_id WHERE t.id=$1 AND n.id=$2`, taskID, nodeID).Scan(&found)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: 来源节点不属于当前任务", ErrIntelligenceInvalid)
		}
		if err != nil {
			return nil, err
		}
		node = &nodeID
	}
	if len(in.AssetIDs) > 0 {
		var count int
		if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM assets WHERE id=ANY($1::bigint[])`, in.AssetIDs).Scan(&count); err != nil {
			return nil, err
		}
		if count != len(in.AssetIDs) {
			return nil, fmt.Errorf("%w: 关联资产不存在", ErrIntelligenceInvalid)
		}
	}
	assets, _ := json.Marshal(in.AssetIDs)
	item, err := scanIntelligence(tx.QueryRowContext(ctx, `INSERT INTO task_intelligence(task_id,node_id,kind,title,content,evidence,confidence,status,asset_ids,worker,fingerprint)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
 ON CONFLICT(task_id,kind,fingerprint) DO UPDATE SET updated_at=now(),
 evidence=CASE WHEN task_intelligence.confidence='inferred' AND EXCLUDED.confidence='observed' OR task_intelligence.status IN ('unverified','suspected','pending') AND EXCLUDED.status NOT IN ('unverified','suspected','pending') THEN EXCLUDED.evidence ELSE task_intelligence.evidence END,
 confidence=CASE WHEN task_intelligence.confidence='observed' THEN 'observed' ELSE EXCLUDED.confidence END,
 status=CASE WHEN task_intelligence.status IN ('unverified','suspected','pending') THEN EXCLUDED.status ELSE task_intelligence.status END
 RETURNING `+intelligenceCols, taskID, node, in.Kind, in.Title, in.Content, in.Evidence, in.Confidence, in.Status, string(assets), worker, intelligenceFingerprint(in)))
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return item, nil
}

// Direct task inheritance is explicit; shared asset membership alone grants no task provenance.
func intelligenceScope() string {
	return ` FROM task_intelligence i JOIN tasks t ON t.id=i.task_id AND t.deleted_at IS NULL WHERE
 ($1::bigint=0 OR i.task_id=$1 OR EXISTS(SELECT 1 FROM task_relations r WHERE r.task_id=$1 AND r.source_task_id=i.task_id))
 AND ($2::bigint=0 OR i.asset_ids @> jsonb_build_array($2::bigint))`
}
func (d *DB) ListIntelligence(ctx context.Context, f IntelligenceFilter) (*IntelligencePage, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 25
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	page := &IntelligencePage{Items: []*Intelligence{}, Counts: map[string]int{"credential": 0, "lead": 0, "sensitive_data": 0}, Enabled: d.GetBool(SettingTaskIntelligence, false)}
	page.CredentialAgentEnabled = d.GetBool(SettingCredentialAgent, false)
	page.CredentialTrafficBinding = page.CredentialAgentEnabled && d.GetBool(SettingCredentialTraffic, false)
	scope := intelligenceScope()
	args := []any{f.TaskID, f.AssetID}
	rows, err := d.QueryContext(ctx, `SELECT kind,count(*)`+scope+` GROUP BY kind`, args...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var k string
		var n int
		if err = rows.Scan(&k, &n); err != nil {
			rows.Close()
			return nil, err
		}
		page.Counts[k] = n
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	// Search titles, content, evidence, and reporters; return the recorded content directly in each row.
	where := scope + ` AND ($3='' OR kind=$3) AND ($4='' OR i.status=$4) AND ($5='' OR i.title ILIKE '%'||$5||'%' OR i.content ILIKE '%'||$5||'%' OR i.evidence ILIKE '%'||$5||'%' OR i.worker ILIKE '%'||$5||'%')`
	args = append(args, f.Kind, f.Status, f.Query)
	if err = d.QueryRowContext(ctx, `SELECT count(*)`+where, args...).Scan(&page.Total); err != nil {
		return nil, err
	}
	args = append(args, f.Limit, f.Offset)
	cols := `i.id,i.task_id,i.node_id,i.kind,i.title,i.content,i.evidence,i.confidence,i.status,i.asset_ids,i.worker,i.created_at,i.updated_at,i.credential_analysis`
	rows, err = d.QueryContext(ctx, `SELECT `+cols+intelligenceSourceSession+where+` ORDER BY i.id DESC LIMIT $6 OFFSET $7`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		item, e := scanIntelligence(rows, true)
		if e != nil {
			return nil, e
		}
		item.Inherited = f.TaskID > 0 && item.TaskID != f.TaskID
		page.Items = append(page.Items, item)
	}
	return page, rows.Err()
}
func (d *DB) GetIntelligence(ctx context.Context, id int64) (*Intelligence, error) {
	item, err := scanIntelligence(d.QueryRowContext(ctx, `SELECT i.id,i.task_id,i.node_id,i.kind,i.title,i.content,i.evidence,i.confidence,i.status,i.asset_ids,i.worker,i.created_at,i.updated_at,i.credential_analysis`+intelligenceSourceSession+` FROM task_intelligence i JOIN tasks t ON t.id=i.task_id AND t.deleted_at IS NULL WHERE i.id=$1`, id), true)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrIntelligenceNotFound
	}
	return item, err
}
func (d *DB) UpdateIntelligenceStatus(ctx context.Context, taskID, id int64, status string) error {
	item, err := d.GetIntelligence(ctx, id)
	if err != nil {
		return err
	}
	if item.TaskID != taskID {
		return ErrIntelligenceNotFound
	}
	if !ValidIntelligenceStatus(item.Kind, status) {
		return fmt.Errorf("%w: 状态无效", ErrIntelligenceInvalid)
	}
	result, err := d.ExecContext(ctx, `UPDATE task_intelligence SET status=$3,updated_at=now() WHERE id=$1 AND task_id=$2 AND EXISTS(SELECT 1 FROM tasks WHERE tasks.id=$2 AND deleted_at IS NULL)`, id, taskID, status)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return ErrIntelligenceNotFound
	}
	return nil
}
