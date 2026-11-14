package db

import (
	"crypto/rand"
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

// SettingMCPServerEnabled gates the /mcp endpoint. Off by default: creating a
// task starts real testing against a target, so exposure is an explicit choice.
const SettingMCPServerEnabled = "mcp_server_enabled"

// SettingMCPServerAccess holds the /mcp source allowlist and trusted proxies as JSON.
const SettingMCPServerAccess = "mcp_server_access"

// API token scopes. A tool is callable only when the token carries its scope.
const (
	APIScopeRead        = "read"
	APIScopeTaskCreate  = "task:create"
	APIScopeTaskControl = "task:control"
)

const (
	// APITokenPrefix makes a leaked token recognisable to secret scanners.
	APITokenPrefix       = "artex_mcp_"
	MaxAPITokenNameRunes = 80
	MaxAPITokenCompanies = 50
	MaxAPITokenLimit     = 10000
	// mcpAuditKeep bounds the audit table; older rows are trimmed on insert.
	mcpAuditKeep = 20000
)

var (
	ErrAPITokenInvalid  = errors.New("invalid api token")
	ErrAPITokenNotFound = errors.New("api token not found")
)

// APIToken is a long-lived, revocable credential for external MCP clients.
// The plaintext is never stored and never serialised.
type APIToken struct {
	ID              int64      `json:"id"`
	Name            string     `json:"name"`
	Prefix          string     `json:"token_prefix"`
	Scopes          []string   `json:"scopes"`
	CompanyIDs      []int64    `json:"company_ids"`
	MaxActiveTasks  int        `json:"max_active_tasks"`
	MaxTasksPerHour int        `json:"max_tasks_per_hour"`
	ExpiresAt       *time.Time `json:"expires_at"`
	LastUsedAt      *time.Time `json:"last_used_at"`
	RevokedAt       *time.Time `json:"revoked_at"`
	CreatedAt       time.Time  `json:"created_at"`
}

// Usable reports whether the token may authenticate at the given time.
func (t *APIToken) Usable(now time.Time) bool {
	return t != nil && t.RevokedAt == nil && (t.ExpiresAt == nil || now.Before(*t.ExpiresAt))
}

// HasScope reports whether the token carries scope.
func (t *APIToken) HasScope(scope string) bool {
	if t == nil {
		return false
	}
	for _, s := range t.Scopes {
		if s == scope {
			return true
		}
	}
	return false
}

// APITokenInput is the caller-supplied part of a new token.
type APITokenInput struct {
	Name            string
	Scopes          []string
	CompanyIDs      []int64
	MaxActiveTasks  int
	MaxTasksPerHour int
	ExpiresAt       *time.Time
}

// NormalizeAPITokenInput validates and canonicalises a token definition.
func NormalizeAPITokenInput(in APITokenInput) (APITokenInput, error) {
	in.Name = strings.Join(strings.Fields(in.Name), " ")
	if in.Name == "" {
		return in, fmt.Errorf("%w: 名称不能为空", ErrAPITokenInvalid)
	}
	if utf8.RuneCountInString(in.Name) > MaxAPITokenNameRunes {
		return in, fmt.Errorf("%w: 名称最多 %d 个字符", ErrAPITokenInvalid, MaxAPITokenNameRunes)
	}
	seen := map[string]bool{}
	scopes := make([]string, 0, len(in.Scopes))
	for _, s := range in.Scopes {
		s = strings.TrimSpace(s)
		if s != APIScopeRead && s != APIScopeTaskCreate && s != APIScopeTaskControl {
			return in, fmt.Errorf("%w: 未知的权限范围 %q", ErrAPITokenInvalid, s)
		}
		if !seen[s] {
			seen[s] = true
			scopes = append(scopes, s)
		}
	}
	if len(scopes) == 0 {
		return in, fmt.Errorf("%w: 至少选择一个权限范围", ErrAPITokenInvalid)
	}
	sort.Strings(scopes)
	in.Scopes = scopes
	seenCompany := map[int64]bool{}
	companies := make([]int64, 0, len(in.CompanyIDs))
	for _, id := range in.CompanyIDs {
		if id <= 0 {
			return in, fmt.Errorf("%w: 企业 id 无效", ErrAPITokenInvalid)
		}
		if !seenCompany[id] {
			seenCompany[id] = true
			companies = append(companies, id)
		}
	}
	if len(companies) > MaxAPITokenCompanies {
		return in, fmt.Errorf("%w: 最多限定 %d 个企业", ErrAPITokenInvalid, MaxAPITokenCompanies)
	}
	sort.Slice(companies, func(i, j int) bool { return companies[i] < companies[j] })
	in.CompanyIDs = companies
	if in.MaxActiveTasks < 0 || in.MaxActiveTasks > MaxAPITokenLimit ||
		in.MaxTasksPerHour < 0 || in.MaxTasksPerHour > MaxAPITokenLimit {
		return in, fmt.Errorf("%w: 限额必须在 0 到 %d 之间", ErrAPITokenInvalid, MaxAPITokenLimit)
	}
	if in.ExpiresAt != nil && !in.ExpiresAt.After(time.Now()) {
		return in, fmt.Errorf("%w: 过期时间必须晚于当前时间", ErrAPITokenInvalid)
	}
	return in, nil
}

// HashAPIToken returns the storage hash of a plaintext token.
func HashAPIToken(plaintext string) string {
	sum := sha256.Sum256([]byte(plaintext))
	return hex.EncodeToString(sum[:])
}

// NewAPITokenPlaintext generates a fresh random token.
func NewAPITokenPlaintext() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return APITokenPrefix + hex.EncodeToString(buf), nil
}

const apiTokenCols = `id, name, token_prefix, scopes, company_ids, max_active_tasks,
       max_tasks_per_hour, expires_at, last_used_at, revoked_at, created_at`

func scanAPIToken(row interface{ Scan(...any) error }) (*APIToken, error) {
	var (
		t                         APIToken
		scopes, companies         []byte
		expires, lastUsed, revoke sql.NullTime
	)
	if err := row.Scan(&t.ID, &t.Name, &t.Prefix, &scopes, &companies, &t.MaxActiveTasks,
		&t.MaxTasksPerHour, &expires, &lastUsed, &revoke, &t.CreatedAt); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(scopes, &t.Scopes); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(companies, &t.CompanyIDs); err != nil {
		return nil, err
	}
	if t.Scopes == nil {
		t.Scopes = []string{}
	}
	if t.CompanyIDs == nil {
		t.CompanyIDs = []int64{}
	}
	for _, p := range []struct {
		src sql.NullTime
		dst **time.Time
	}{{expires, &t.ExpiresAt}, {lastUsed, &t.LastUsedAt}, {revoke, &t.RevokedAt}} {
		if p.src.Valid {
			v := p.src.Time
			*p.dst = &v
		}
	}
	return &t, nil
}

// CreateAPIToken stores a new token and returns it with its one-time plaintext.
func (d *DB) CreateAPIToken(in APITokenInput) (*APIToken, string, error) {
	in, err := NormalizeAPITokenInput(in)
	if err != nil {
		return nil, "", err
	}
	plaintext, err := NewAPITokenPlaintext()
	if err != nil {
		return nil, "", err
	}
	scopes, _ := json.Marshal(in.Scopes)
	companies, _ := json.Marshal(in.CompanyIDs)
	var expires any
	if in.ExpiresAt != nil {
		expires = *in.ExpiresAt
	}
	t, err := scanAPIToken(d.QueryRow(`
INSERT INTO api_tokens(name, token_hash, token_prefix, scopes, company_ids, max_active_tasks, max_tasks_per_hour, expires_at)
VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)
RETURNING `+apiTokenCols, in.Name, HashAPIToken(plaintext), plaintext[:len(APITokenPrefix)+6],
		string(scopes), string(companies), in.MaxActiveTasks, in.MaxTasksPerHour, expires))
	if err != nil {
		return nil, "", err
	}
	return t, plaintext, nil
}

// ListAPITokens returns every token, newest first.
func (d *DB) ListAPITokens() ([]*APIToken, error) {
	rows, err := d.Query(`SELECT ` + apiTokenCols + ` FROM api_tokens ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*APIToken{}
	for rows.Next() {
		t, err := scanAPIToken(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// APITokenByHash looks a token up by the hash of its plaintext. It returns
// (nil, nil) when no such token exists; revocation and expiry are the caller's
// check so the reason can be reported.
func (d *DB) APITokenByHash(hash string) (*APIToken, error) {
	t, err := scanAPIToken(d.QueryRow(`SELECT `+apiTokenCols+` FROM api_tokens WHERE token_hash=$1`, hash))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return t, err
}

// TouchAPIToken records use, at most once a minute per token.
func (d *DB) TouchAPIToken(id int64) error {
	_, err := d.Exec(`
UPDATE api_tokens SET last_used_at = now()
WHERE id=$1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`, id)
	return err
}

// RevokeAPIToken disables a token immediately. Revoking twice is a no-op.
func (d *DB) RevokeAPIToken(id int64) error {
	res, err := d.Exec(`UPDATE api_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrAPITokenNotFound
	}
	return nil
}

// DeleteAPIToken removes a token. Its audit rows are kept.
func (d *DB) DeleteAPIToken(id int64) error {
	res, err := d.Exec(`DELETE FROM api_tokens WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrAPITokenNotFound
	}
	return nil
}

// RecordAPITokenTask notes that a token created a task (quota accounting).
func (d *DB) RecordAPITokenTask(tokenID, taskID int64) error {
	_, err := d.Exec(`INSERT INTO api_token_tasks(token_id, task_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, tokenID, taskID)
	return err
}

// APITokenTaskUsage returns how many tasks the token created in the last hour
// and the ids of every task it ever created (for the active-task count).
func (d *DB) APITokenTaskUsage(tokenID int64) (lastHour int, taskIDs []int64, err error) {
	rows, err := d.Query(`
SELECT task_id, created_at > now() - interval '1 hour' FROM api_token_tasks WHERE token_id=$1`, tokenID)
	if err != nil {
		return 0, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var (
			id     int64
			recent bool
		)
		if err := rows.Scan(&id, &recent); err != nil {
			return 0, nil, err
		}
		taskIDs = append(taskIDs, id)
		if recent {
			lastHour++
		}
	}
	return lastHour, taskIDs, rows.Err()
}

// MCPAuditEntry is one tools/call made through the MCP endpoint.
type MCPAuditEntry struct {
	ID         int64     `json:"id"`
	TokenID    int64     `json:"token_id"`
	TokenName  string    `json:"token_name"`
	Tool       string    `json:"tool"`
	Args       string    `json:"args"`
	OK         bool      `json:"ok"`
	Result     string    `json:"result"`
	RemoteAddr string    `json:"remote_addr"`
	DurationMS int64     `json:"duration_ms"`
	CreatedAt  time.Time `json:"created_at"`
}

// InsertMCPAudit appends an audit row and trims rows beyond the retention bound.
func (d *DB) InsertMCPAudit(e MCPAuditEntry) error {
	var id int64
	if err := d.QueryRow(`
INSERT INTO mcp_audit_log(token_id, token_name, tool, args, ok, result, remote_addr, duration_ms)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
		e.TokenID, e.TokenName, e.Tool, e.Args, e.OK, e.Result, e.RemoteAddr, e.DurationMS).Scan(&id); err != nil {
		return err
	}
	_, err := d.Exec(`DELETE FROM mcp_audit_log WHERE id <= $1`, id-mcpAuditKeep)
	return err
}

// ListMCPAudit returns the newest audit rows, optionally for one token.
func (d *DB) ListMCPAudit(tokenID int64, limit int) ([]MCPAuditEntry, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := d.Query(`
SELECT id, token_id, token_name, tool, args, ok, result, remote_addr, duration_ms, created_at
FROM mcp_audit_log WHERE ($1 = 0 OR token_id = $1) ORDER BY id DESC LIMIT $2`, tokenID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MCPAuditEntry{}
	for rows.Next() {
		var e MCPAuditEntry
		if err := rows.Scan(&e.ID, &e.TokenID, &e.TokenName, &e.Tool, &e.Args, &e.OK, &e.Result, &e.RemoteAddr, &e.DurationMS, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
