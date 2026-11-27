package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// InterceptRule is one row of intercept_rules.
type InterceptRule struct {
	ID             int64     `json:"id"`
	Name           string    `json:"name"`
	Enabled        bool      `json:"enabled"`
	Priority       int       `json:"priority"`
	MatchTarget    string    `json:"match_target"`
	MatchType      string    `json:"match_type"`
	Pattern        string    `json:"pattern"`
	Action         string    `json:"action"`
	Message        string    `json:"message"`
	TimeoutEnabled bool      `json:"timeout_enabled"`
	TimeoutSeconds int       `json:"timeout_seconds"`
	TimeoutAction  string    `json:"timeout_action"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// InterceptPending is one row of intercept_pending.
type InterceptPending struct {
	ID             int64           `json:"id"`
	RuleID         *int64          `json:"rule_id"`
	ConversationID *int64          `json:"conversation_id"`
	TaskID         *string         `json:"task_id"`
	AgentName      string          `json:"agent_name"`
	ToolName       string          `json:"tool_name"`
	ToolInput      json.RawMessage `json:"tool_input"`
	Status         string          `json:"status"`
	DecisionSource string          `json:"decision_source"`
	Reason         string          `json:"reason"` // 规则 message 或模型判定理由(前缀 [模型])
	DecidedAt      *time.Time      `json:"decided_at"`
	CreatedAt      time.Time       `json:"created_at"`
}

const interceptRuleCols = `id, name, enabled, priority, match_target, match_type, pattern, action, message, timeout_enabled, timeout_seconds, timeout_action, created_at, updated_at`

func scanInterceptRule(row interface{ Scan(...any) error }) (InterceptRule, error) {
	var r InterceptRule
	err := row.Scan(&r.ID, &r.Name, &r.Enabled, &r.Priority,
		&r.MatchTarget, &r.MatchType, &r.Pattern, &r.Action, &r.Message,
		&r.TimeoutEnabled, &r.TimeoutSeconds, &r.TimeoutAction,
		&r.CreatedAt, &r.UpdatedAt)
	return r, err
}

// ListInterceptRules returns all rules ordered by priority DESC then id.
func (d *DB) ListInterceptRules() ([]InterceptRule, error) {
	rows, err := d.Query(`SELECT ` + interceptRuleCols + ` FROM intercept_rules ORDER BY priority DESC, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []InterceptRule
	for rows.Next() {
		r, err := scanInterceptRule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// CreateInterceptRule inserts a new rule.
func (d *DB) CreateInterceptRule(name, matchTarget, matchType, pattern, action, message string, priority int, enabled bool, timeoutEnabled bool, timeoutSeconds int, timeoutAction string) (InterceptRule, error) {
	row := d.QueryRow(`
INSERT INTO intercept_rules(name, enabled, priority, match_target, match_type, pattern, action, message, timeout_enabled, timeout_seconds, timeout_action)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING `+interceptRuleCols,
		name, enabled, priority, matchTarget, matchType, pattern, action, message, timeoutEnabled, timeoutSeconds, timeoutAction)
	return scanInterceptRule(row)
}

// UpdateInterceptRule replaces all editable fields of an existing rule.
func (d *DB) UpdateInterceptRule(id int64, name, matchTarget, matchType, pattern, action, message string, priority int, enabled bool, timeoutEnabled bool, timeoutSeconds int, timeoutAction string) (InterceptRule, error) {
	row := d.QueryRow(`
UPDATE intercept_rules
   SET name=$2, enabled=$3, priority=$4, match_target=$5,
       match_type=$6, pattern=$7, action=$8, message=$9,
       timeout_enabled=$10, timeout_seconds=$11, timeout_action=$12
WHERE id=$1
RETURNING `+interceptRuleCols,
		id, name, enabled, priority, matchTarget, matchType, pattern, action, message, timeoutEnabled, timeoutSeconds, timeoutAction)
	return scanInterceptRule(row)
}

// DeleteInterceptRule removes a rule.
func (d *DB) DeleteInterceptRule(id int64) error {
	_, err := d.Exec(`DELETE FROM intercept_rules WHERE id=$1`, id)
	return err
}

// ToggleInterceptRule flips the enabled state of a rule.
func (d *DB) ToggleInterceptRule(id int64, enabled bool) error {
	_, err := d.Exec(`UPDATE intercept_rules SET enabled=$2 WHERE id=$1`, id, enabled)
	return err
}

// CreateInterceptPending inserts a pending approval record and returns its ID.
// convID == 0 → conversation_id stored as NULL (background task).
// taskID == "" → task_id stored as NULL.
func (d *DB) CreateInterceptPending(ruleID, convID int64, taskID, agentName, toolName string, input []byte, reason string, audits ...*InterceptAudit) (int64, error) {
	raw := json.RawMessage(input)
	if len(raw) == 0 {
		raw = json.RawMessage("{}")
	}
	var convIDPtr *int64
	if convID != 0 {
		convIDPtr = &convID
	}
	var taskIDPtr *string
	if taskID != "" {
		taskIDPtr = &taskID
	}
	// ruleID == 0 → NULL: the LLM fallback judge has no owning rule.
	var ruleIDPtr *int64
	if ruleID != 0 {
		ruleIDPtr = &ruleID
	}
	var id int64
	err := d.QueryRow(`
INSERT INTO intercept_pending(rule_id, conversation_id, task_id, agent_name, tool_name, tool_input, reason, decision_source, audit)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
		ruleIDPtr, convIDPtr, taskIDPtr, agentName, toolName, raw, reason, interceptSource(ruleID, reason), firstAudit(audits)).Scan(&id)
	return id, err
}

// DecideInterceptPending updates a pending record's status (allowed/denied/timeout).
func (d *DB) DecideInterceptPending(id int64, status string) error {
	_, err := d.Exec(`UPDATE intercept_pending SET status=$2, decided_at=NOW() WHERE id=$1`, id, status)
	return err
}

// CreateDecidedIntercept inserts an intercept_pending row ALREADY in a final state
// (status = 'allowed' | 'denied'), decided_at stamped now. Used to log allow/deny
// rule matches for observability — they don't block and need no user action, so unlike
// CreateInterceptPending (which starts 'pending') this records the outcome directly.
func (d *DB) CreateDecidedIntercept(ruleID, convID int64, taskID, agentName, toolName string, input []byte, status, reason string, audits ...*InterceptAudit) (int64, error) {
	raw := json.RawMessage(input)
	if len(raw) == 0 {
		raw = json.RawMessage("{}")
	}
	var convIDPtr *int64
	if convID != 0 {
		convIDPtr = &convID
	}
	var taskIDPtr *string
	if taskID != "" {
		taskIDPtr = &taskID
	}
	// ruleID == 0 → NULL: the LLM fallback judge has no owning rule.
	var ruleIDPtr *int64
	if ruleID != 0 {
		ruleIDPtr = &ruleID
	}
	var id int64
	err := d.QueryRow(`
INSERT INTO intercept_pending(rule_id, conversation_id, task_id, agent_name, tool_name, tool_input, status, reason, decided_at, decision_source, audit)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10) RETURNING id`,
		ruleIDPtr, convIDPtr, taskIDPtr, agentName, toolName, raw, status, reason, interceptSource(ruleID, reason), firstAudit(audits)).Scan(&id)
	return id, err
}

const interceptPendingCols = `id, rule_id, conversation_id, task_id, agent_name, tool_name, tool_input, status, reason, decided_at, created_at, decision_source`

func scanInterceptPending(s interface{ Scan(...any) error }, p *InterceptPending) error {
	return s.Scan(&p.ID, &p.RuleID, &p.ConversationID, &p.TaskID, &p.AgentName,
		&p.ToolName, &p.ToolInput, &p.Status, &p.Reason, &p.DecidedAt, &p.CreatedAt, &p.DecisionSource)
}

// ListPendingIntercepts returns all unresolved approval requests, newest first.
func (d *DB) ListPendingIntercepts() ([]InterceptPending, error) {
	rows, err := d.Query(`SELECT ` + interceptPendingCols + ` FROM intercept_pending WHERE status='pending' ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []InterceptPending
	for rows.Next() {
		var p InterceptPending
		if err := scanInterceptPending(rows, &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListPendingInterceptsByTask returns unresolved approval requests for one task,
// newest first.
func (d *DB) ListPendingInterceptsByTask(taskID string) ([]InterceptPending, error) {
	rows, err := d.Query(`SELECT `+interceptPendingCols+` FROM intercept_pending WHERE status='pending' AND task_id=$1 ORDER BY created_at DESC`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []InterceptPending
	for rows.Next() {
		var p InterceptPending
		if err := scanInterceptPending(rows, &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// InterceptPendingSummary is a lightweight snapshot of unresolved approval
// requests without loading tool_input JSONB or historical rows.
type InterceptPendingSummary struct {
	Count      int      `json:"count"`
	AgentNames []string `json:"agent_names,omitempty"`
}

// CountPendingIntercepts returns the number of unresolved approval requests.
func (d *DB) CountPendingIntercepts() (int, error) {
	var count int
	if err := d.QueryRow(`SELECT COUNT(*) FROM intercept_pending WHERE status='pending'`).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

// TaskPendingInterceptSummary returns the pending count and distinct agent names
// awaiting approval for one task.
func (d *DB) TaskPendingInterceptSummary(taskID string) (InterceptPendingSummary, error) {
	rows, err := d.Query(`SELECT agent_name, COUNT(*) FROM intercept_pending WHERE status='pending' AND task_id=$1 GROUP BY agent_name ORDER BY agent_name`, taskID)
	if err != nil {
		return InterceptPendingSummary{}, err
	}
	defer rows.Close()
	out := InterceptPendingSummary{AgentNames: []string{}}
	for rows.Next() {
		var agent string
		var n int
		if err := rows.Scan(&agent, &n); err != nil {
			return InterceptPendingSummary{}, err
		}
		out.Count += n
		if agent != "" {
			out.AgentNames = append(out.AgentNames, agent)
		}
	}
	return out, rows.Err()
}

// GetInterceptPending returns one pending record (nil if absent).
func (d *DB) GetInterceptPending(id int64) (*InterceptPending, error) {
	var p InterceptPending
	err := scanInterceptPending(
		d.QueryRow(`SELECT `+interceptPendingCols+` FROM intercept_pending WHERE id=$1`, id),
		&p,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &p, err
}

// InterceptApprovalRow is intercept_pending enriched with conversation and rule info.
type InterceptApprovalRow struct {
	InterceptPending
	ConvTitle    string `json:"conv_title"`
	ConvAgentKey string `json:"conv_agent_key"`
	RuleName     string `json:"rule_name"`
}

func scanInterceptApprovalRow(rows interface{ Scan(...any) error }, r *InterceptApprovalRow) error {
	return rows.Scan(
		&r.ID, &r.RuleID, &r.ConversationID, &r.TaskID, &r.AgentName,
		&r.ToolName, &r.ToolInput, &r.Status, &r.Reason, &r.DecidedAt, &r.CreatedAt,
		&r.DecisionSource, &r.ConvTitle, &r.ConvAgentKey, &r.RuleName,
	)
}

// Keep legacy rows without decision_source consistent with their displayed source.
const approvalDecisionSource = `CASE
 WHEN ip.audit->>'decision_reason' LIKE '人工允许%' OR ip.audit->>'decision_reason' LIKE '人工拒绝%' THEN 'manual'
 ELSE COALESCE(NULLIF(ip.decision_source,''), CASE
   WHEN ip.rule_id IS NOT NULL THEN 'rule'
   WHEN ip.reason LIKE '[模型]%' THEN 'model' ELSE 'unknown' END)
 END`

const approvalRowColumns = `ip.id, ip.rule_id, ip.conversation_id, ip.task_id, ip.agent_name,
       ip.tool_name, ip.tool_input, ip.status, ip.reason, ip.decided_at, ip.created_at, ` + approvalDecisionSource + `,
       COALESCE(c.title,'') AS conv_title,
       COALESCE(c.agent_key,'') AS conv_agent_key,
       COALESCE(ir.name,'') AS rule_name`

const approvalRowJoins = `
FROM intercept_pending ip
LEFT JOIN conversations c ON c.id = ip.conversation_id
LEFT JOIN intercept_rules ir ON ir.id = ip.rule_id`

const approvalRowSearchJoins = approvalRowJoins + `
LEFT JOIN tasks t ON t.id::text = ip.task_id`

const approvalRowSelect = `SELECT ` + approvalRowColumns + approvalRowJoins
const approvalRowSearchSelect = `SELECT ` + approvalRowColumns + approvalRowSearchJoins
const approvalRowSelectWithAudit = `SELECT ` + approvalRowColumns + `, ip.audit` + approvalRowJoins

func interceptSource(ruleID int64, reason string) string {
	if ruleID != 0 {
		return "rule"
	}
	if strings.HasPrefix(reason, "[模型]") {
		return "model"
	}
	return "unknown"
}

func firstAudit(audits []*InterceptAudit) any {
	if len(audits) == 0 || audits[0] == nil {
		return nil
	}
	raw, err := json.Marshal(audits[0])
	if err != nil {
		return nil
	}
	return raw
}

// ListAllIntercepts returns up to limit intercept_pending rows (newest first)
// joined with conversation and rule info.
func (d *DB) ListAllIntercepts(limit int) ([]InterceptApprovalRow, error) {
	rows, err := d.Query(approvalRowSelect+` ORDER BY ip.created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []InterceptApprovalRow
	for rows.Next() {
		var r InterceptApprovalRow
		if err := scanInterceptApprovalRow(rows, &r); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// InterceptApprovalFilter combines status, decision-source and literal substring search.
// Empty fields include all values.
type InterceptApprovalFilter struct {
	Status         string
	DecisionSource string
	Search         string
	CreatedFrom    string // inclusive UTC calendar date, YYYY-MM-DD
	CreatedTo      string // inclusive UTC calendar date, YYYY-MM-DD
}

// InterceptApprovalPage is one 1-based page of approval history.
// When TotalApproximate is true, Total is either a PostgreSQL table-size
// estimate (unfiltered large table) or a lower bound (TotalCapped == true)
// rather than an exact full-table count.
type InterceptApprovalPage struct {
	Items            []InterceptApprovalRow
	Total            int
	TotalApproximate bool
	TotalCapped      bool
	HasMore          bool
}

// interceptExactCountCap bounds exact COUNT(*) scans so large tables never
// trigger unbounded full scans on every poll. Tests may override it.
var interceptExactCountCap = 10000

// ListAllInterceptsPage returns one 1-based page and matching count metadata.
func (d *DB) ListAllInterceptsPage(page, size int, filter InterceptApprovalFilter) (InterceptApprovalPage, error) {
	return d.listInterceptsPage("", page, size, filter)
}

// ListTaskIntercepts returns all intercept_pending rows for a specific task (newest first).
func (d *DB) ListTaskIntercepts(taskID string) ([]InterceptApprovalRow, error) {
	return d.ListTaskInterceptsLimit(taskID, 0)
}

// ListTaskInterceptsLimit returns up to limit intercept_pending rows for a
// specific task (newest first). limit <= 0 returns all rows.
func (d *DB) ListTaskInterceptsLimit(taskID string, limit int) ([]InterceptApprovalRow, error) {
	q := approvalRowSelect + ` WHERE ip.task_id=$1 ORDER BY ip.created_at DESC, ip.id DESC`
	args := []any{taskID}
	if limit > 0 {
		q += ` LIMIT $2`
		args = append(args, limit)
	}
	rows, err := d.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []InterceptApprovalRow
	for rows.Next() {
		var r InterceptApprovalRow
		if err := scanInterceptApprovalRow(rows, &r); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListTaskInterceptsPage is the paginated variant of ListTaskIntercepts.
func (d *DB) ListTaskInterceptsPage(taskID string, page, size int, filter InterceptApprovalFilter) (InterceptApprovalPage, error) {
	return d.listInterceptsPage(taskID, page, size, filter)
}

// estimateInterceptTableRows reads PostgreSQL's live row estimate for
// intercept_pending without scanning the table.
func (d *DB) estimateInterceptTableRows() (int64, error) {
	var relTuples, liveTuples, deadTuples int64
	err := d.QueryRow(`
		SELECT
			CASE WHEN c.reltuples >= 0 THEN c.reltuples::bigint ELSE -1 END,
			pg_stat_get_live_tuples(c.oid),
			pg_stat_get_dead_tuples(c.oid)
		FROM pg_class c
		WHERE c.oid = 'intercept_pending'::regclass`).Scan(&relTuples, &liveTuples, &deadTuples)
	if err != nil {
		return 0, err
	}
	if liveTuples > 0 {
		return liveTuples, nil
	}
	if liveTuples == 0 && deadTuples > 0 {
		return 0, nil
	}
	if relTuples > 0 {
		return relTuples, nil
	}
	return 0, nil
}

func (d *DB) listInterceptsPage(taskID string, page, size int, filter InterceptApprovalFilter) (InterceptApprovalPage, error) {
	if page < 1 {
		page = 1
	}
	if size <= 0 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	offset := (page - 1) * size

	conditions := []string{}
	args := []any{}
	add := func(column, value string) {
		if value != "" {
			args = append(args, value)
			conditions = append(conditions, column+"=$"+fmt.Sprint(len(args)))
		}
	}
	add("ip.task_id", taskID)
	add("ip.status", filter.Status)
	add(approvalDecisionSource, filter.DecisionSource)
	if filter.CreatedFrom != "" {
		args = append(args, filter.CreatedFrom)
		conditions = append(conditions, "ip.created_at >= $"+fmt.Sprint(len(args))+"::date")
	}
	if filter.CreatedTo != "" {
		args = append(args, filter.CreatedTo)
		conditions = append(conditions, "ip.created_at < ($"+fmt.Sprint(len(args))+"::date + INTERVAL '1 day')")
	}
	search := strings.TrimSpace(filter.Search)
	hasTextSearch := false
	if strings.HasPrefix(search, "#") {
		id, err := strconv.ParseInt(strings.TrimPrefix(search, "#"), 10, 64)
		if err != nil || id <= 0 {
			return InterceptApprovalPage{}, fmt.Errorf("审批编号必须为 # 后接正整数")
		}
		add("ip.id", strconv.FormatInt(id, 10))
	} else if search != "" {
		hasTextSearch = true
		// Treat SQL LIKE metacharacters literally, including URL percent escapes.
		pattern := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(search)
		args = append(args, "%"+pattern+"%")
		like := "$" + fmt.Sprint(len(args))
		conditions = append(conditions, `(
      ip.id::text ILIKE `+like+`
      OR ip.conversation_id::text ILIKE `+like+`
      OR COALESCE(ip.task_id, '') ILIKE `+like+`
      OR COALESCE(ip.agent_name, '') ILIKE `+like+`
      OR COALESCE(ip.tool_name, '') ILIKE `+like+`
      OR COALESCE(ip.tool_input::text, '') ILIKE `+like+`
      OR COALESCE(ip.reason, '') ILIKE `+like+`
      OR COALESCE(ip.audit::text, '') ILIKE `+like+`
      OR COALESCE(c.title, '') ILIKE `+like+`
      OR COALESCE(c.agent_key, '') ILIKE `+like+`
      OR COALESCE(t.name, '') ILIKE `+like+`
      OR COALESCE(t.description, '') ILIKE `+like+`
      OR COALESCE(t.goal, '') ILIKE `+like+`
      OR COALESCE(ir.name, '') ILIKE `+like+`
    )`)
	}
	where := ""
	if len(conditions) > 0 {
		where = " WHERE " + strings.Join(conditions, " AND ")
	}

	selectClause := approvalRowSelect
	if hasTextSearch {
		selectClause = approvalRowSearchSelect
	}
	limitArg := len(args) + 1
	offsetArg := limitArg + 1
	dataQ := selectClause + where +
		" ORDER BY ip.created_at DESC, ip.id DESC LIMIT $" + fmt.Sprint(limitArg) +
		" OFFSET $" + fmt.Sprint(offsetArg)
	dataArgs := make([]any, 0, len(args)+2)
	dataArgs = append(dataArgs, args...)
	dataArgs = append(dataArgs, size+1, offset)
	rows, err := d.Query(dataQ, dataArgs...)
	if err != nil {
		return InterceptApprovalPage{}, err
	}
	defer rows.Close()
	out := []InterceptApprovalRow{}
	for rows.Next() {
		var r InterceptApprovalRow
		if err := scanInterceptApprovalRow(rows, &r); err != nil {
			return InterceptApprovalPage{}, err
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return InterceptApprovalPage{}, err
	}

	hasMore := len(out) > size
	if hasMore {
		out = out[:size]
	}
	// Fast path: when we already hit the end of the result set on a non-empty
	// page (or page 1), the exact total is known without a separate COUNT query.
	if !hasMore && (len(out) > 0 || offset == 0) {
		return InterceptApprovalPage{
			Items:   out,
			Total:   offset + len(out),
			HasMore: false,
		}, nil
	}

	capLimit := interceptExactCountCap
	if capLimit < offset+size {
		capLimit = offset + size
	}
	// For large unfiltered global queries, use PostgreSQL's catalog estimate
	// instead of scanning the entire intercept_pending table.
	if len(conditions) == 0 {
		if est, estErr := d.estimateInterceptTableRows(); estErr == nil && est > int64(capLimit) {
			total := int(est)
			if hasMore && total <= offset+len(out) {
				total = offset + len(out) + 1
			}
			return InterceptApprovalPage{
				Items:            out,
				Total:            total,
				TotalApproximate: true,
				HasMore:          hasMore,
			}, nil
		}
	}

	countFrom := "FROM intercept_pending ip"
	if hasTextSearch {
		countFrom = approvalRowSearchJoins
	}
	capArg := len(args) + 1
	countArgs := make([]any, 0, len(args)+1)
	countArgs = append(countArgs, args...)
	countArgs = append(countArgs, capLimit+1)
	var counted int
	countQ := "SELECT COUNT(*) FROM (SELECT 1 " + countFrom + where + " LIMIT $" + fmt.Sprint(capArg) + ") s"
	if err := d.QueryRow(countQ, countArgs...).Scan(&counted); err != nil {
		return InterceptApprovalPage{}, err
	}
	if counted > capLimit {
		return InterceptApprovalPage{
			Items:            out,
			Total:            capLimit,
			TotalApproximate: true,
			TotalCapped:      true,
			HasMore:          hasMore,
		}, nil
	}
	return InterceptApprovalPage{
		Items:   out,
		Total:   counted,
		HasMore: hasMore,
	}, nil
}
