package db

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"
)

const SettingCredentialAgent = "credential_agent_enabled"
const SettingCredentialTraffic = "credential_traffic_binding"
const CredentialAgentKey = "credential_processor"

type CredentialAccount struct {
	Label    string `json:"label,omitempty"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	Token    string `json:"token,omitempty"`
	Cookie   string `json:"cookie,omitempty"`
	Endpoint string `json:"endpoint,omitempty"`
	Protocol string `json:"protocol,omitempty"`
}

// These are verified references and bounded excerpts, not full packet snapshots.
// The original capture can be opened while it remains in the traffic store.
type CredentialTraffic struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Method   string `json:"method"`
	Status   int    `json:"status"`
	Side     string `json:"side"`
	Excerpt  string `json:"excerpt"`
	Accounts []int  `json:"accounts"`
}
type CredentialAnalysis struct {
	ConversationID int64               `json:"conversation_id,omitempty"`
	ForceExtract   bool                `json:"force_extract,omitempty"`
	TrafficNote    string              `json:"traffic_note,omitempty"`
	State          string              `json:"state"`
	Lease          string              `json:"lease,omitempty"`
	LeaseUntil     time.Time           `json:"lease_until,omitempty"`
	SourceHash     string              `json:"source_hash,omitempty"`
	Method         string              `json:"method,omitempty"`
	Accounts       []CredentialAccount `json:"accounts"`
	Traffic        []CredentialTraffic `json:"traffic"`
	TrafficState   string              `json:"traffic_state"`
	Note           string              `json:"note,omitempty"`
	Error          string              `json:"error,omitempty"`
	Model          string              `json:"model,omitempty"`
	InputTokens    int                 `json:"input_tokens"`
	OutputTokens   int                 `json:"output_tokens"`
	ProcessedAt    *time.Time          `json:"processed_at,omitempty"`
}

func CredentialSourceHash(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

// The dependent switch and its parent are committed atomically. Turning the
// parent off also clears binding, so re-enabling never silently enables binding.
func (d *DB) SetCredentialAgentSettings(ctx context.Context, enabled, binding *bool) error {
	return d.SetIntelligenceSettings(ctx, nil, enabled, binding)
}
func (d *DB) SetIntelligenceSettings(ctx context.Context, recording, enabled, binding *bool) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(7337741006)`); err != nil {
		return err
	}
	record, on, bind := false, false, false
	var value string
	err = tx.QueryRowContext(ctx, `SELECT value FROM settings WHERE key=$1`, SettingTaskIntelligence).Scan(&value)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	record = value == "true" || value == "1"
	if recording != nil {
		record = *recording
	}
	value = ""
	err = tx.QueryRowContext(ctx, `SELECT value FROM settings WHERE key=$1`, SettingCredentialAgent).Scan(&value)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	on = value == "true" || value == "1"
	value = ""
	err = tx.QueryRowContext(ctx, `SELECT value FROM settings WHERE key=$1`, SettingCredentialTraffic).Scan(&value)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	bind = value == "true" || value == "1"
	if enabled != nil {
		on = *enabled
	}
	if binding != nil {
		bind = *binding
	}
	if !record {
		if enabled != nil && *enabled {
			return fmt.Errorf("%w: 请先开启 Agent 自动记录，再开启 Agent 开关", ErrIntelligenceInvalid)
		}
		if binding != nil && *binding {
			return fmt.Errorf("%w: 请依次开启 Agent 自动记录和 Agent 开关", ErrIntelligenceInvalid)
		}
		on = false
		bind = false
	}
	if !on {
		if binding != nil && *binding {
			return fmt.Errorf("%w: 请先开启 Agent 开关，再启用绑定流量", ErrIntelligenceInvalid)
		}
		bind = false
	}
	for key, val := range map[string]bool{SettingTaskIntelligence: record, SettingCredentialAgent: on, SettingCredentialTraffic: bind} {
		if _, err = tx.ExecContext(ctx, `INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`, key, strconv.FormatBool(val)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// One durable lease per record, shared by all application processes. Errors do
// not retry every tick; explicit retry queues the record again. Expired leases
// recover interrupted runs after restart. No task lock is held during LLM I/O.
func (d *DB) ClaimCredentialJob(ctx context.Context, bind bool, taskID int64) (*Intelligence, error) {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var id int64
	err = tx.QueryRowContext(ctx, `SELECT i.id FROM task_intelligence i JOIN tasks t ON t.id=i.task_id
 WHERE i.kind='credential' AND EXISTS(SELECT 1 FROM settings WHERE key='credential_agent_enabled' AND value IN ('true','1')) AND EXISTS(SELECT 1 FROM settings WHERE key='task_intelligence_enabled' AND value IN ('true','1')) AND ($2::bigint=0 OR i.task_id=$2) AND t.deleted_at IS NULL AND t.archived_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM task_archives a WHERE a.task_id=t.id AND a.state IN ('archive_queued','archiving','restore_queued','restoring','delete_queued','deleting'))
 AND (i.credential_analysis IS NULL OR i.credential_analysis->>'state'='queued'
 OR (i.credential_analysis->>'state'='processing' AND (i.credential_analysis->>'lease_until')::timestamptz < now())
 OR ($1 AND i.credential_analysis->>'state'='ready' AND i.credential_analysis->>'traffic_state'='off'))
 ORDER BY i.id FOR UPDATE OF i SKIP LOCKED LIMIT 1`, bind, taskID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	token := make([]byte, 16)
	if _, err = rand.Read(token); err != nil {
		return nil, err
	}
	patch, _ := json.Marshal(map[string]any{"state": "processing", "lease": hex.EncodeToString(token), "lease_until": time.Now().UTC().Add(3 * time.Minute)})
	if _, err = tx.ExecContext(ctx, `UPDATE task_intelligence SET credential_analysis=COALESCE(credential_analysis,'{}'::jsonb)||$2::jsonb WHERE id=$1`, id, string(patch)); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetIntelligence(ctx, id)
}
func (d *DB) FinishCredentialJob(ctx context.Context, item *Intelligence, result CredentialAnalysis) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Serialize completion with both settings toggles. A disabled feature cannot
	// publish a newly derived result or newly matched traffic after switching off.
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(7337741006)`); err != nil {
		return err
	}
	var enabled, binding bool
	if err = tx.QueryRowContext(ctx, `SELECT (EXISTS(SELECT 1 FROM settings WHERE key=$1 AND value IN ('true','1')) AND EXISTS(SELECT 1 FROM settings WHERE key='task_intelligence_enabled' AND value IN ('true','1'))),EXISTS(SELECT 1 FROM settings WHERE key=$2 AND value IN ('true','1'))`, SettingCredentialAgent, SettingCredentialTraffic).Scan(&enabled, &binding); err != nil {
		return err
	}
	if !enabled {
		_, err = tx.ExecContext(ctx, `UPDATE task_intelligence SET credential_analysis=credential_analysis||'{"state":"queued"}'::jsonb WHERE id=$1 AND credential_analysis->>'lease'=$2`, item.ID, item.Credentials.Lease)
		if err != nil {
			return err
		}
		return tx.Commit()
	}
	if !binding {
		result.Traffic = item.Credentials.Traffic
		result.TrafficState = "off"
		result.TrafficNote = ""
	}
	result.Lease = ""
	result.LeaseUntil = time.Time{}
	now := time.Now().UTC()
	result.ProcessedAt = &now
	raw, err := json.Marshal(result)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE task_intelligence i SET credential_analysis=$3::jsonb
 WHERE i.id=$1 AND i.credential_analysis->>'lease'=$2
 AND EXISTS(SELECT 1 FROM tasks t WHERE t.id=i.task_id AND t.deleted_at IS NULL AND t.archived_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM task_archives a WHERE a.task_id=i.task_id AND a.state IN ('archive_queued','archiving','restore_queued','restoring','delete_queued','deleting'))`, item.ID, item.Credentials.Lease, string(raw))
	if err != nil {
		return err
	}
	return tx.Commit()
}
func (d *DB) RetryCredentialJob(ctx context.Context, taskID, id int64) error {
	result, err := d.ExecContext(ctx, `UPDATE task_intelligence i SET credential_analysis=COALESCE(credential_analysis,'{}'::jsonb)||'{"state":"queued","error":"","force_extract":true}'::jsonb
 WHERE id=$1 AND task_id=$2 AND kind='credential'
 AND COALESCE(credential_analysis->>'state','')<>'processing'
 AND EXISTS(SELECT 1 FROM tasks t WHERE t.id=i.task_id AND t.deleted_at IS NULL AND t.archived_at IS NULL)`, id, taskID)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return ErrIntelligenceNotFound
	}
	return nil
}
