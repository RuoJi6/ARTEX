package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

var ErrFindingCaseConflict = errors.New("漏洞组已变更，请重新读取证据后再操作")

type FindingCase struct {
	ID             int64     `json:"id,string"`
	TaskID         *int64    `json:"task_id,string"`
	Title          string    `json:"title"`
	Reason         string    `json:"reason"`
	Severity       string    `json:"severity"`
	SeverityReason string    `json:"severity_reason"`
	Report         string    `json:"report,omitempty"`
	Version        int64     `json:"version"`
	ReportVersion  int64     `json:"report_version"`
	Active         bool      `json:"active"`
	Count          int       `json:"count"`
	Critical       int       `json:"critical"`
	High           int       `json:"high"`
	Medium         int       `json:"medium"`
	Low            int       `json:"low"`
	CreatedAt      time.Time `json:"created_at"`
}
type FindingCaseEvent struct {
	ID         int64           `json:"id,string"`
	Action     string          `json:"action"`
	Actor      string          `json:"actor"`
	Reason     string          `json:"reason"`
	FindingIDs json.RawMessage `json:"finding_ids"`
	CreatedAt  time.Time       `json:"created_at"`
}
type FindingCaseSuggestion struct {
	ID         int64    `json:"id,string"`
	TaskID     int64    `json:"task_id,string"`
	LeftID     int64    `json:"left_id,string"`
	RightID    int64    `json:"right_id,string"`
	Title      string   `json:"title"`
	Reason     string   `json:"reason"`
	State      string   `json:"state"`
	FindingIDs []string `json:"finding_ids"`
}
type FindingCaseRow struct {
	Case       *FindingCase `json:"case,omitempty"`
	FindingID  int64        `json:"finding_id,string,omitempty"`
	MatchedIDs []int64      `json:"matched_ids"`
}

const caseColumns = `c.id,c.task_id,c.title,c.reason,c.severity,c.severity_reason,c.report,c.version,c.report_version,c.active,c.created_at`

func scanCase(row interface{ Scan(...any) error }) (*FindingCase, error) {
	c := new(FindingCase)
	err := row.Scan(&c.ID, &c.TaskID, &c.Title, &c.Reason, &c.Severity, &c.SeverityReason, &c.Report, &c.Version, &c.ReportVersion, &c.Active, &c.CreatedAt)
	return c, err
}
func (d *DB) GetFindingCase(id int64) (*FindingCase, error) {
	c, err := scanCase(d.QueryRow(`SELECT `+caseColumns+` FROM finding_cases c WHERE id=$1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	err = d.QueryRow(`SELECT count(*),count(*) FILTER(WHERE severity='critical'),count(*) FILTER(WHERE severity='high'),count(*) FILTER(WHERE severity='medium'),count(*) FILTER(WHERE severity='low') FROM findings f JOIN finding_case_members m ON m.finding_id=f.id WHERE m.case_id=$1`, id).Scan(&c.Count, &c.Critical, &c.High, &c.Medium, &c.Low)
	return c, err
}
func (d *DB) FindingCaseID(id int64) (int64, error) {
	var cid int64
	err := d.QueryRow(`SELECT case_id FROM finding_case_members WHERE finding_id=$1`, id).Scan(&cid)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return cid, err
}
func (d *DB) FindingCaseMembers(id int64, page, size int) ([]*DBFinding, int, error) {
	var count int
	if err := d.QueryRow(`SELECT count(*) FROM finding_case_members WHERE case_id=$1`, id).Scan(&count); err != nil {
		return nil, 0, err
	}
	rows, err := d.Query(`SELECT `+findingSelectCols+` FROM findings f LEFT JOIN tasks t ON t.id=f.task_id JOIN finding_case_members m ON m.finding_id=f.id WHERE m.case_id=$1 ORDER BY f.id LIMIT $2 OFFSET $3`, id, size, (page-1)*size)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	fs, err := scanFindings(rows)
	return fs, count, err
}
func (d *DB) FindingCaseEvents(id int64) ([]FindingCaseEvent, error) {
	rows, err := d.Query(`SELECT id,action,actor,reason,finding_ids,created_at FROM finding_case_events WHERE case_id=$1 ORDER BY id DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FindingCaseEvent{}
	for rows.Next() {
		var e FindingCaseEvent
		if err := rows.Scan(&e.ID, &e.Action, &e.Actor, &e.Reason, &e.FindingIDs, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
func (d *DB) ListFindingCases(filter FindingFilter, page, size int) ([]FindingCaseRow, int, error) {
	var err error
	filter, err = d.applyAssetScope(filter)
	if err != nil {
		return nil, 0, err
	}
	where, args := filter.where()
	base := `WITH matched AS (SELECT f.id,f.severity,f.created_at,COALESCE(m.case_id,0) cid FROM findings f LEFT JOIN tasks t ON t.id=f.task_id LEFT JOIN finding_case_members m ON m.finding_id=f.id` + where + `), entities AS (SELECT CASE WHEN cid>0 THEN 'c:'||cid ELSE 'f:'||id END key,MAX(cid) cid,MIN(id) fid,jsonb_agg(id ORDER BY id) matched_ids,MAX(created_at) created,MAX(CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END) severity_rank FROM matched GROUP BY key)`
	var total int
	if err := d.QueryRow(base+` SELECT count(*) FROM entities`, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	order := `e.created ` + filter.timeOrder() + `,e.fid DESC`
	if filter.Sort == "severity" {
		order = `e.severity_rank DESC,` + order
	}
	args = append(args, size, (page-1)*size)
	rows, err := d.Query(base+fmt.Sprintf(` SELECT e.cid,e.fid,e.matched_ids FROM entities e ORDER BY %s LIMIT $%d OFFSET $%d`, order, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	out := []FindingCaseRow{}
	groups := []int64{}
	for rows.Next() {
		var cid, fid int64
		var raw []byte
		if err := rows.Scan(&cid, &fid, &raw); err != nil {
			rows.Close()
			return nil, 0, err
		}
		r := FindingCaseRow{FindingID: fid}
		if err := json.Unmarshal(raw, &r.MatchedIDs); err != nil {
			rows.Close()
			return nil, 0, err
		}
		out = append(out, r)
		groups = append(groups, cid)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, 0, err
	}
	for i, cid := range groups {
		if cid > 0 {
			c, err := scanCase(d.QueryRow(`SELECT `+strings.Replace(caseColumns, "c.report,", "''::text,", 1)+` FROM finding_cases c WHERE id=$1`, cid))
			if err != nil {
				return nil, 0, err
			}
			if err := d.QueryRow(`SELECT count(*),count(*) FILTER(WHERE severity='critical'),count(*) FILTER(WHERE severity='high'),count(*) FILTER(WHERE severity='medium'),count(*) FILTER(WHERE severity='low') FROM findings f JOIN finding_case_members m ON m.finding_id=f.id WHERE m.case_id=$1`, cid).Scan(&c.Count, &c.Critical, &c.High, &c.Medium, &c.Low); err != nil {
				return nil, 0, err
			}
			out[i].Case = c
			out[i].FindingID = 0
		}
	}
	return out, total, nil
}

func sortedFindingIDs(ids []int64) ([]int64, error) {
	set := map[int64]bool{}
	out := []int64{}
	for _, id := range ids {
		if id <= 0 {
			return nil, errors.New("无效漏洞编号")
		}
		if !set[id] {
			set[id] = true
			out = append(out, id)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	if len(out) < 2 {
		return nil, errors.New("至少需要两条漏洞记录")
	}
	return out, nil
}
func lockCaseTask(tx *sql.Tx, taskID int64) error {
	if taskID <= 0 {
		return errors.New("归并需要仍存在的同一任务")
	}
	if _, err := tx.Exec(`SELECT pg_advisory_xact_lock($1)`, int64(5100000000000000)+taskID); err != nil {
		return err
	}
	var id int64
	return tx.QueryRow(`SELECT id FROM tasks WHERE id=$1 FOR UPDATE`, taskID).Scan(&id)
}
func (d *DB) MergeFindingCase(ctx context.Context, taskID int64, ids []int64, title, reason, actor string) (int64, error) {
	return d.mergeFindingCase(ctx, taskID, ids, title, reason, actor, 0, nil)
}
func (d *DB) mergeFindingCase(ctx context.Context, taskID int64, ids []int64, title, reason, actor string, suggestionID int64, dropped []int64) (int64, error) {
	ids, err := sortedFindingIDs(ids)
	if err != nil {
		return 0, err
	}
	if strings.TrimSpace(title) == "" || strings.TrimSpace(reason) == "" {
		return 0, errors.New("必须提供漏洞名称及基于证据的归并理由")
	}
	keptIDs := append([]int64(nil), ids...)
	var cid int64
	err = d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		if err := lockCaseTask(tx, taskID); err != nil {
			return err
		}
		if suggestionID > 0 {
			var state string
			if err := tx.QueryRow(`SELECT state FROM finding_case_suggestions WHERE id=$1 FOR UPDATE`, suggestionID).Scan(&state); err != nil {
				return err
			}
			if state != "pending" {
				return ErrFindingCaseConflict
			}
		}
		groupSet := map[int64]bool{}
		for _, id := range ids {
			var tid sql.NullInt64
			var group int64
			if err := tx.QueryRow(`SELECT f.task_id,COALESCE(m.case_id,0) FROM findings f LEFT JOIN finding_case_members m ON m.finding_id=f.id WHERE f.id=$1`, id).Scan(&tid, &group); err != nil {
				return err
			}
			if !tid.Valid || tid.Int64 != taskID {
				return errors.New("只能归并同一任务的漏洞")
			}
			if group > 0 {
				groupSet[group] = true
			}
		}
		groups := []int64{}
		for g := range groupSet {
			groups = append(groups, g)
		}
		sort.Slice(groups, func(i, j int) bool { return groups[i] < groups[j] })
		all := map[int64]bool{}
		for _, id := range ids {
			all[id] = true
		}
		for _, g := range groups {
			rows, err := tx.Query(`SELECT finding_id FROM finding_case_members WHERE case_id=$1`, g)
			if err != nil {
				return err
			}
			for rows.Next() {
				var id int64
				if err := rows.Scan(&id); err != nil {
					rows.Close()
					return err
				}
				all[id] = true
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				return err
			}
		}
		ids = ids[:0]
		for id := range all {
			ids = append(ids, id)
		}
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		raw, _ := json.Marshal(ids)
		var blocked bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM finding_case_blocks WHERE left_id IN(SELECT value::bigint FROM jsonb_array_elements_text($1::jsonb)) AND right_id IN(SELECT value::bigint FROM jsonb_array_elements_text($1::jsonb)))`, string(raw)).Scan(&blocked); err != nil {
			return err
		}
		if blocked {
			return errors.New("人工已否决或撤销这些记录的归并")
		}
		if len(groups) > 0 {
			cid = groups[0]
		} else {
			if err := tx.QueryRow(`INSERT INTO finding_cases(task_id,origin_task_id,title,reason) VALUES($1,$1,$2,$3) RETURNING id`, taskID, title, reason).Scan(&cid); err != nil {
				return err
			}
		}
		var changed int64
		for _, id := range ids {
			res, err := tx.Exec(`INSERT INTO finding_case_members(finding_id,case_id) VALUES($1,$2) ON CONFLICT(finding_id) DO UPDATE SET case_id=EXCLUDED.case_id WHERE finding_case_members.case_id<>EXCLUDED.case_id`, id, cid)
			if err != nil {
				return err
			}
			n, _ := res.RowsAffected()
			changed += n
		}
		for _, g := range groups {
			if g != cid {
				if _, err := tx.Exec(`UPDATE finding_cases SET active=false,version=version+1 WHERE id=$1`, g); err != nil {
					return err
				}
			}
		}
		if changed > 0 {
			if _, err := tx.Exec(`UPDATE finding_cases SET version=version+1 WHERE id=$1`, cid); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO finding_case_events(case_id,action,actor,reason,finding_ids) VALUES($1,'merge',$2,$3,$4)`, cid, actor, reason, string(raw)); err != nil {
				return err
			}
		}
		for _, excluded := range dropped {
			if all[excluded] {
				return fmt.Errorf("排除的记录 #%d 已与所选记录在同一文件夹，请先移出该文件夹后再确认", excluded)
			}
			for _, kept := range keptIDs {
				if _, err := tx.Exec(`INSERT INTO finding_case_blocks(left_id,right_id,reason)
                    VALUES(LEAST($1::bigint,$2::bigint),GREATEST($1::bigint,$2::bigint),'人工确认分组时排除')
                    ON CONFLICT DO NOTHING`, excluded, kept); err != nil {
					return err
				}
			}
		}
		if suggestionID > 0 {
			if _, err := tx.Exec(`UPDATE finding_case_suggestions SET state='accepted' WHERE id=$1 AND state='pending'`, suggestionID); err != nil {
				return err
			}
		}
		return sweepFindingCaseSuggestions(tx, taskID)
	})
	return cid, err
}

// sweepFindingCaseSuggestions reconciles pending cards after a merge or veto.
// Cross-task member rows are ignored so a malformed legacy row cannot leak into
// a task's suggestions.
func sweepFindingCaseSuggestions(tx *sql.Tx, taskID int64) error {
	if _, err := tx.Exec(`UPDATE finding_case_suggestions s SET state='accepted'
        WHERE s.task_id=$1 AND s.state='pending'
          AND (SELECT count(*) FROM finding_case_suggestion_members sm
               WHERE sm.suggestion_id=s.id
                 AND EXISTS (SELECT 1 FROM findings f WHERE f.id=sm.finding_id AND f.task_id=s.task_id)) >= 2
          AND (SELECT count(*) FROM finding_case_suggestion_members sm
               JOIN findings f ON f.id=sm.finding_id AND f.task_id=s.task_id
               JOIN finding_case_members cm ON cm.finding_id=sm.finding_id
               JOIN finding_cases c ON c.id=cm.case_id AND c.active
               WHERE sm.suggestion_id=s.id) >= 2
          AND (SELECT count(DISTINCT cm.case_id) FROM finding_case_suggestion_members sm
               JOIN findings f ON f.id=sm.finding_id AND f.task_id=s.task_id
               JOIN finding_case_members cm ON cm.finding_id=sm.finding_id
               JOIN finding_cases c ON c.id=cm.case_id AND c.active
               WHERE sm.suggestion_id=s.id) = 1
          AND NOT EXISTS (SELECT 1 FROM finding_case_suggestion_members sm
                          JOIN findings f ON f.id=sm.finding_id AND f.task_id=s.task_id
                          LEFT JOIN finding_case_members cm ON cm.finding_id=sm.finding_id
                          LEFT JOIN finding_cases c ON c.id=cm.case_id AND c.active
                          WHERE sm.suggestion_id=s.id AND c.id IS NULL)`, taskID); err != nil {
		return err
	}
	_, err := tx.Exec(`UPDATE finding_case_suggestions s SET state='obsolete'
        WHERE s.task_id=$1 AND s.state='pending' AND (
          (SELECT count(*) FROM finding_case_suggestion_members sm
           JOIN findings f ON f.id=sm.finding_id AND f.task_id=s.task_id
           WHERE sm.suggestion_id=s.id) < 2
          OR EXISTS (SELECT 1
                    FROM finding_case_suggestion_members a
                    JOIN finding_case_suggestion_members b
                      ON b.suggestion_id=a.suggestion_id AND a.finding_id < b.finding_id
                    JOIN findings fa ON fa.id=a.finding_id AND fa.task_id=s.task_id
                    JOIN findings fb ON fb.id=b.finding_id AND fb.task_id=s.task_id
                    JOIN finding_case_blocks bl ON bl.left_id=a.finding_id AND bl.right_id=b.finding_id
                    WHERE a.suggestion_id=s.id))`, taskID)
	return err
}
func (d *DB) RemoveFindingCaseMember(ctx context.Context, cid, fid int64, reason string) error {
	c, err := d.GetFindingCase(cid)
	if err != nil {
		return err
	}
	if c == nil {
		return errors.New("归并组不存在")
	}
	return d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		var origin int64
		if err := tx.QueryRow(`SELECT origin_task_id FROM finding_cases WHERE id=$1`, cid).Scan(&origin); err != nil {
			return err
		}
		if _, err := tx.Exec(`SELECT pg_advisory_xact_lock($1)`, int64(5100000000000000)+origin); err != nil {
			return err
		}
		// Deleting a task retains its findings and folder history.
		var live int64
		if err := tx.QueryRow(`SELECT id FROM tasks WHERE id=$1 FOR UPDATE`, origin).Scan(&live); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		var current int64
		if err := tx.QueryRow(`SELECT case_id FROM finding_case_members WHERE finding_id=$1`, fid).Scan(&current); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				var removed bool
				// A repeated removal, or a last member released by dissolution, is idempotent.
				err = tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM finding_case_events WHERE case_id=$1 AND finding_ids @> jsonb_build_array($2::bigint))`, cid, fid).Scan(&removed)
				if err == nil && removed {
					return nil
				}
			}
			return err
		}
		if current != cid {
			return ErrFindingCaseConflict
		}
		if _, err := tx.Exec(`INSERT INTO finding_case_blocks(left_id,right_id,reason) SELECT LEAST($1,finding_id),GREATEST($1,finding_id),$3 FROM finding_case_members WHERE case_id=$2 AND finding_id<>$1 ON CONFLICT DO NOTHING`, fid, cid, reason); err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO finding_case_events(case_id,action,actor,reason,finding_ids) VALUES($1,'detach','human',$2,jsonb_build_array($3::bigint))`, cid, reason, fid); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM finding_case_members WHERE case_id=$1 AND finding_id=$2`, cid, fid); err != nil {
			return err
		}
		return sweepFindingCaseSuggestions(tx, origin)
	})
}
func (d *DB) UpdateFindingCaseReport(ctx context.Context, cid, version int64, title, report, severity, reason string) error {
	if !ValidSeverity(severity) || strings.TrimSpace(report) == "" || strings.TrimSpace(reason) == "" || strings.TrimSpace(title) == "" {
		return errors.New("完整报告、名称、有效等级和评级依据必填")
	}
	return d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		c, err := scanCase(tx.QueryRow(`SELECT `+caseColumns+` FROM finding_cases c WHERE id=$1 FOR UPDATE`, cid))
		if err != nil {
			return err
		}
		if !c.Active || c.Version != version {
			return ErrFindingCaseConflict
		}
		if c.Title == title && c.Report == report && c.Severity == severity && c.SeverityReason == reason && c.ReportVersion == version {
			return nil
		}
		_, err = tx.Exec(`UPDATE finding_cases SET title=$2,report=$3,severity=$4,severity_reason=$5,report_version=$6 WHERE id=$1`, cid, title, report, severity, reason, version)
		if err != nil {
			return err
		}
		_, err = tx.Exec(`INSERT INTO finding_case_events(case_id,action,actor,reason) VALUES($1,'report_updated','reporter',$2)`, cid, "统一报告已更新；评级依据："+reason)
		return err
	})
}

type suggestionQuery interface {
	Query(string, ...any) (*sql.Rows, error)
}

// suggestionMembers reads only surviving members in the suggestion's task. The
// anchor fallback keeps rows created by older binaries resolvable if a database
// was upgraded before the idempotent backfill ran.
func suggestionMembers(q suggestionQuery, suggestionID, taskID int64) ([]int64, error) {
	rows, err := q.Query(`SELECT sm.finding_id
        FROM finding_case_suggestion_members sm
        JOIN findings f ON f.id=sm.finding_id AND f.task_id=$2
        WHERE sm.suggestion_id=$1 ORDER BY sm.finding_id`, suggestionID, taskID)
	if err != nil {
		return nil, err
	}
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if len(ids) > 0 {
		return ids, nil
	}
	rows, err = q.Query(`SELECT x.finding_id FROM (
            SELECT s.left_id AS finding_id FROM finding_case_suggestions s WHERE s.id=$1
            UNION SELECT s.right_id FROM finding_case_suggestions s WHERE s.id=$1
        ) x JOIN findings f ON f.id=x.finding_id AND f.task_id=$2 ORDER BY x.finding_id`, suggestionID, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// SuggestFindingCase stores a pending group of 2..20 same-task findings. It
// refreshes an exact group, reuses a pending superset, and supersedes strict
// subsets while holding the task advisory lock.
func (d *DB) SuggestFindingCase(ctx context.Context, taskID int64, findingIDs []int64, title, reason string) (int64, error) {
	if strings.TrimSpace(title) == "" || strings.TrimSpace(reason) == "" {
		return 0, errors.New("建议需要名称和具体证据理由")
	}
	if len(findingIDs) > 20 {
		return 0, errors.New("疑似重复分组最多20条记录")
	}
	seen := make(map[int64]bool, len(findingIDs))
	for _, fid := range findingIDs {
		if seen[fid] {
			return 0, errors.New("疑似重复分组中的记录编号必须唯一")
		}
		seen[fid] = true
	}
	ids, err := sortedFindingIDs(findingIDs)
	if err != nil {
		return 0, err
	}
	var suggestionID int64
	err = d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		if err := lockCaseTask(tx, taskID); err != nil {
			return err
		}
		caseIDs := map[int64]bool{}
		sameActiveCase := true
		var firstCase int64
		for _, fid := range ids {
			var tid sql.NullInt64
			var cid int64
			if err := tx.QueryRow(`SELECT f.task_id,COALESCE(CASE WHEN c.active THEN m.case_id ELSE 0 END,0)
				FROM findings f LEFT JOIN finding_case_members m ON m.finding_id=f.id
                LEFT JOIN finding_cases c ON c.id=m.case_id WHERE f.id=$1`, fid).Scan(&tid, &cid); err != nil {
				return err
			}
			if !tid.Valid || tid.Int64 != taskID {
				return errors.New("只能建议同一任务的归并")
			}
			if cid == 0 {
				sameActiveCase = false
			} else if firstCase == 0 {
				firstCase = cid
				caseIDs[cid] = true
			} else if firstCase != cid {
				sameActiveCase = false
			}
		}
		if sameActiveCase && firstCase > 0 && len(caseIDs) == 1 {
			return errors.New("已在同一文件夹")
		}

		raw, _ := json.Marshal(ids)
		rows, err := tx.Query(`SELECT left_id,right_id FROM finding_case_blocks
            WHERE left_id IN (SELECT value::bigint FROM jsonb_array_elements_text($1::jsonb))
              AND right_id IN (SELECT value::bigint FROM jsonb_array_elements_text($1::jsonb))
            ORDER BY left_id,right_id`, string(raw))
		if err != nil {
			return err
		}
		blocked := []string{}
		for rows.Next() {
			var left, right int64
			if err := rows.Scan(&left, &right); err != nil {
				rows.Close()
				return err
			}
			blocked = append(blocked, fmt.Sprintf("#%d/#%d", left, right))
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if len(blocked) > 0 {
			return fmt.Errorf("人工已否决这些记录的归并：%s；请去掉其中一方后重新提交", strings.Join(blocked, "、"))
		}

		type pendingGroup struct {
			id      int64
			members []int64
			title   string
			reason  string
		}
		rows, err = tx.Query(`SELECT id,title,reason FROM finding_case_suggestions
            WHERE task_id=$1 AND state='pending' ORDER BY id`, taskID)
		if err != nil {
			return err
		}
		groups := []pendingGroup{}
		for rows.Next() {
			var g pendingGroup
			if err := rows.Scan(&g.id, &g.title, &g.reason); err != nil {
				rows.Close()
				return err
			}
			groups = append(groups, g)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for i := range groups {
			groups[i].members, err = suggestionMembers(tx, groups[i].id, taskID)
			if err != nil {
				return err
			}
		}
		want := map[int64]bool{}
		for _, fid := range ids {
			want[fid] = true
		}
		contains := func(group []int64, set map[int64]bool) bool {
			for _, fid := range group {
				if !set[fid] {
					return false
				}
			}
			return true
		}
		exact, superset := int64(0), int64(0)
		supersede := []int64{}
		for _, g := range groups {
			gm := map[int64]bool{}
			for _, fid := range g.members {
				gm[fid] = true
			}
			switch {
			case len(g.members) == len(ids) && contains(ids, gm) && contains(g.members, want):
				if exact == 0 {
					exact = g.id
				} else {
					supersede = append(supersede, g.id)
				}
			case len(g.members) > len(ids) && contains(ids, gm):
				if superset == 0 {
					superset = g.id
				}
			case len(g.members) < len(ids) && contains(g.members, want):
				supersede = append(supersede, g.id)
			}
		}
		for _, sid := range supersede {
			if _, err := tx.Exec(`UPDATE finding_case_suggestions SET state='superseded' WHERE id=$1 AND state='pending'`, sid); err != nil {
				return err
			}
		}
		if exact > 0 {
			suggestionID = exact
			_, err = tx.Exec(`UPDATE finding_case_suggestions SET title=$2,reason=$3 WHERE id=$1`, exact, title, reason)
			return err
		}
		if superset > 0 {
			suggestionID = superset
			return nil
		}
		if err := tx.QueryRow(`INSERT INTO finding_case_suggestions(task_id,left_id,right_id,title,reason)
            VALUES($1,$2,$3,$4,$5) RETURNING id`, taskID, ids[0], ids[1], title, reason).Scan(&suggestionID); err != nil {
			return err
		}
		for _, fid := range ids {
			if _, err := tx.Exec(`INSERT INTO finding_case_suggestion_members(suggestion_id,finding_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, suggestionID, fid); err != nil {
				return err
			}
		}
		return nil
	})
	return suggestionID, err
}

func (d *DB) FindingCaseSuggestions(taskID int64) ([]FindingCaseSuggestion, error) {
	rows, err := d.Query(`SELECT id,task_id,left_id,right_id,title,reason,state
        FROM finding_case_suggestions WHERE state='pending' AND ($1::bigint=0 OR task_id=$1) ORDER BY id DESC`, taskID)
	if err != nil {
		return nil, err
	}
	items := []FindingCaseSuggestion{}
	for rows.Next() {
		var s FindingCaseSuggestion
		if err := rows.Scan(&s.ID, &s.TaskID, &s.LeftID, &s.RightID, &s.Title, &s.Reason, &s.State); err != nil {
			rows.Close()
			return nil, err
		}
		items = append(items, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	out := []FindingCaseSuggestion{}
	for _, s := range items {
		ids, err := suggestionMembers(d, s.ID, s.TaskID)
		if err != nil {
			return nil, err
		}
		if len(ids) < 2 {
			continue
		}
		s.LeftID, s.RightID = ids[0], ids[1]
		for _, fid := range ids {
			s.FindingIDs = append(s.FindingIDs, strconv.FormatInt(fid, 10))
		}
		out = append(out, s)
	}
	return out, nil
}

func (d *DB) ResolveFindingCaseSuggestion(ctx context.Context, id int64, accept bool, exclude []int64) (int64, error) {
	var s FindingCaseSuggestion
	if err := d.QueryRow(`SELECT task_id,title,reason,state FROM finding_case_suggestions WHERE id=$1`, id).Scan(&s.TaskID, &s.Title, &s.Reason, &s.State); err != nil {
		return 0, err
	}
	if s.State != "pending" {
		return 0, ErrFindingCaseConflict
	}
	members, err := suggestionMembers(d, id, s.TaskID)
	if err != nil {
		return 0, err
	}
	if len(members) < 2 {
		return 0, errors.New("疑似重复分组成员不足")
	}
	memberSet := map[int64]bool{}
	for _, fid := range members {
		memberSet[fid] = true
	}
	excludeSet := map[int64]bool{}
	for _, fid := range exclude {
		if !memberSet[fid] {
			return 0, fmt.Errorf("排除记录 #%d 不属于该分组", fid)
		}
		excludeSet[fid] = true
	}
	kept := []int64{}
	for _, fid := range members {
		if !excludeSet[fid] {
			kept = append(kept, fid)
		}
	}
	if accept {
		if len(kept) < 2 {
			return 0, errors.New("至少保留两条记录")
		}
		return d.mergeFindingCase(ctx, s.TaskID, kept, s.Title, s.Reason, "human", id, exclude)
	}
	if len(exclude) > 0 {
		return 0, errors.New("否决分组时不能排除记录")
	}
	return 0, d.WithEvidenceTx(ctx, func(tx *sql.Tx) error {
		if err := lockCaseTask(tx, s.TaskID); err != nil {
			return err
		}
		var state string
		if err := tx.QueryRow(`SELECT state FROM finding_case_suggestions WHERE id=$1 FOR UPDATE`, id).Scan(&state); err != nil {
			return err
		}
		if state != "pending" {
			return ErrFindingCaseConflict
		}
		members, err := suggestionMembers(tx, id, s.TaskID)
		if err != nil {
			return err
		}
		for i := 0; i < len(members); i++ {
			for j := i + 1; j < len(members); j++ {
				var leftCase, rightCase sql.NullInt64
				if err := tx.QueryRow(`SELECT m.case_id FROM finding_case_members m JOIN finding_cases c ON c.id=m.case_id AND c.active WHERE m.finding_id=$1`, members[i]).Scan(&leftCase); err != nil && !errors.Is(err, sql.ErrNoRows) {
					return err
				}
				if err := tx.QueryRow(`SELECT m.case_id FROM finding_case_members m JOIN finding_cases c ON c.id=m.case_id AND c.active WHERE m.finding_id=$1`, members[j]).Scan(&rightCase); err != nil && !errors.Is(err, sql.ErrNoRows) {
					return err
				}
				if leftCase.Valid && rightCase.Valid && leftCase.Int64 == rightCase.Int64 {
					continue
				}
				if _, err := tx.Exec(`INSERT INTO finding_case_blocks(left_id,right_id,reason)
                    VALUES(LEAST($1::bigint,$2::bigint),GREATEST($1::bigint,$2::bigint),'人工否决') ON CONFLICT DO NOTHING`, members[i], members[j]); err != nil {
					return err
				}
			}
		}
		if _, err := tx.Exec(`UPDATE finding_case_suggestions SET state='rejected' WHERE id=$1`, id); err != nil {
			return err
		}
		return sweepFindingCaseSuggestions(tx, s.TaskID)
	})
}

type FindingDistinctStats struct {
	Total      int `json:"total"`
	Reports    int `json:"reports"`
	Critical   int `json:"critical"`
	High       int `json:"high"`
	Medium     int `json:"medium"`
	Low        int `json:"low"`
	Unassessed int `json:"unassessed"`
}

func (d *DB) DistinctFindingStats(taskID string) (*FindingDistinctStats, error) {
	filter := FindingFilter{TaskID: taskID}
	where, args := filter.where()
	s := new(FindingDistinctStats)
	err := d.QueryRow(`WITH observations AS (SELECT f.id,f.severity,COALESCE(m.case_id,0) cid FROM findings f LEFT JOIN tasks t ON t.id=f.task_id LEFT JOIN finding_case_members m ON m.finding_id=f.id`+where+`), defects AS (SELECT severity FROM observations WHERE cid=0 UNION ALL SELECT c.severity FROM finding_cases c WHERE c.id IN(SELECT cid FROM observations WHERE cid>0)) SELECT count(*),(SELECT count(*) FROM observations),count(*) FILTER(WHERE severity='critical'),count(*) FILTER(WHERE severity='high'),count(*) FILTER(WHERE severity='medium'),count(*) FILTER(WHERE severity='low'),count(*) FILTER(WHERE severity='') FROM defects`, args...).Scan(&s.Total, &s.Reports, &s.Critical, &s.High, &s.Medium, &s.Low, &s.Unassessed)
	return s, err
}

// Compact candidate pages exclude PoC/report bodies and do not treat severity as identity.
func (d *DB) FindingCaseCandidates(fid int64, page, size int, scope ...[]int64) ([]map[string]any, int, int, error) {
	f, err := d.FindingCaseSummary(fid)
	if err != nil {
		return nil, 0, 0, err
	}
	if f == nil || f.TaskID == nil {
		return nil, 0, 0, errors.New("漏洞任务不可用")
	}
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}
	assets, _ := json.Marshal(f.AssetIDs)
	if f.AssetIDs == nil {
		assets = []byte("[]")
	}
	// Type/asset/name only retrieve candidates; the Reporter must still prove the root cause.
	where := ` WHERE f.task_id=$1 AND f.id<>$2 AND NOT EXISTS(SELECT 1 FROM finding_case_blocks b WHERE b.left_id=LEAST(f.id,$2::bigint) AND b.right_id=GREATEST(f.id,$2::bigint))
      AND ((trim($3::text)<>'' AND lower(f.vulnclass)=lower($3)) OR (trim($4::text)<>'' AND lower(f.name)=lower($4))
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NULLIF(f.asset_ids,'null'::jsonb),'[]'::jsonb)) a WHERE a.value IN(SELECT value FROM jsonb_array_elements($5::jsonb))))`
	args := []any{*f.TaskID, fid, f.VulnClass, f.Name, string(assets)}
	if len(scope) > 0 {
		raw, err := json.Marshal(scope[0])
		if err != nil {
			return nil, 0, 0, err
		}
		where += ` AND f.id IN (SELECT jsonb_array_elements_text($6::jsonb)::bigint)`
		args = append(args, string(raw))
	}
	classHit := `(trim(f.vulnclass)<>'' AND lower(f.vulnclass)=lower($3))`
	assetHit := `EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NULLIF(f.asset_ids,'null'::jsonb),'[]'::jsonb)) a WHERE a.value IN (SELECT value FROM jsonb_array_elements($5::jsonb)))`
	nameHit := `(trim(f.name)<>'' AND lower(f.name)=lower($4))`
	scoreExpr := fmt.Sprintf(`(CASE WHEN %s THEN 2 ELSE 0 END + CASE WHEN %s THEN 2 ELSE 0 END + CASE WHEN %s THEN 1 ELSE 0 END + CASE WHEN (%s AND %s) THEN 3 ELSE 0 END)`, classHit, assetHit, nameHit, classHit, assetHit)
	strongExpr := fmt.Sprintf(`(%s AND %s)`, classHit, assetHit)
	base := `WITH candidates AS (SELECT f.id,f.name,f.vulnclass,f.severity,left(f.summary,400) AS summary,f.asset_ids,
        COALESCE(m.case_id,0) AS case_id,
        ` + scoreExpr + ` AS score,
        ` + strongExpr + ` AS strong,
        ARRAY_REMOVE(ARRAY[
            CASE WHEN ` + classHit + ` THEN '同漏洞类型' END,
            CASE WHEN ` + assetHit + ` THEN '资产重叠' END,
            CASE WHEN ` + nameHit + ` THEN '同名称' END
        ]::text[], NULL) AS hit_reasons
        FROM findings f LEFT JOIN finding_case_members m ON m.finding_id=f.id` + where + `)`
	var total, strongTotal int
	if err := d.QueryRow(base+` SELECT count(*),count(*) FILTER(WHERE strong) FROM candidates`, args...).Scan(&total, &strongTotal); err != nil {
		return nil, 0, 0, err
	}
	args = append(args, size, (page-1)*size)
	rows, err := d.Query(base+fmt.Sprintf(` SELECT id,name,vulnclass,severity,summary,asset_ids,case_id,score,strong,to_json(hit_reasons)
        FROM candidates ORDER BY score DESC,id DESC LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, 0, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, cid, score int64
		var name, class, severity, summary string
		var assetIDs json.RawMessage
		var strong bool
		var hitReasonsRaw json.RawMessage
		if err := rows.Scan(&id, &name, &class, &severity, &summary, &assetIDs, &cid, &score, &strong, &hitReasonsRaw); err != nil {
			return nil, 0, 0, err
		}
		var hitReasons []string
		if err := json.Unmarshal(hitReasonsRaw, &hitReasons); err != nil {
			return nil, 0, 0, err
		}
		tier := "weak"
		if strong {
			tier = "strong"
		}
		out = append(out, map[string]any{"finding_id": strconv.FormatInt(id, 10), "name": name, "vulnclass": class, "severity": severity, "summary": summary, "asset_ids": assetIDs, "case_id": strconv.FormatInt(cid, 10), "score": int(score), "hit_reasons": hitReasons, "tier": tier})
	}
	return out, total, strongTotal, rows.Err()
}

// Batch task-list counters avoid an additional database round trip per task.
func (d *DB) DistinctFindingStatsByTask() (map[string]*FindingDistinctStats, error) {
	rows, err := d.Query(`WITH observations AS (
        SELECT f.task_id,CASE WHEN m.case_id IS NULL THEN 'f:'||f.id ELSE 'c:'||m.case_id END entity,
        CASE WHEN m.case_id IS NULL THEN f.severity ELSE c.severity END severity
        FROM findings f LEFT JOIN finding_case_members m ON m.finding_id=f.id LEFT JOIN finding_cases c ON c.id=m.case_id WHERE f.task_id IS NOT NULL)
        SELECT task_id,count(DISTINCT entity),count(*),
          count(DISTINCT entity) FILTER(WHERE severity='critical'),count(DISTINCT entity) FILTER(WHERE severity='high'),
          count(DISTINCT entity) FILTER(WHERE severity='medium'),count(DISTINCT entity) FILTER(WHERE severity='low'),
          count(DISTINCT entity) FILTER(WHERE severity='') FROM observations GROUP BY task_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]*FindingDistinctStats{}
	for rows.Next() {
		var id int64
		s := new(FindingDistinctStats)
		if err := rows.Scan(&id, &s.Total, &s.Reports, &s.Critical, &s.High, &s.Medium, &s.Low, &s.Unassessed); err != nil {
			return nil, err
		}
		out[strconv.FormatInt(id, 10)] = s
	}
	return out, rows.Err()
}

// Folder rows and candidate searches omit PoC bodies. The original table can
// request evidence for ungrouped rows without fetching report bodies.
func (d *DB) FindingCaseSummary(id int64, originalRow ...bool) (*DBFinding, error) {
	cols := strings.Replace(findingSelectCols, "f.evidence,", "''::text,", 1)
	if len(originalRow) > 0 && originalRow[0] {
		cols = findingSelectCols
	}
	rows, err := d.Query(`SELECT `+cols+` FROM findings f LEFT JOIN tasks t ON t.id=f.task_id WHERE f.id=$1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	fs, err := scanFindings(rows)
	if err != nil || len(fs) == 0 {
		return nil, err
	}
	return fs[0], nil
}

// FindingCaseListContext contains bounded metadata for collapsed folder rows.
// Reports and member evidence are still fetched only when opened.
type FindingCaseListContext struct {
	TaskName        string
	TaskDescription string
	AssetIDs        []int64
	AssetCount      int
	LastFoundAt     time.Time
}

func (d *DB) FindingCaseListContexts(ids []int64) (map[int64]FindingCaseListContext, error) {
	result := map[int64]FindingCaseListContext{}
	if len(ids) == 0 {
		return result, nil
	}
	raw, err := json.Marshal(ids)
	if err != nil {
		return nil, err
	}
	rows, err := d.Query(`SELECT c.id,COALESCE(t.name,''),COALESCE(t.description,''),
    COALESCE((SELECT MAX(f.created_at) FROM finding_case_members m JOIN findings f ON f.id=m.finding_id WHERE m.case_id=c.id),c.created_at),
    COALESCE((SELECT jsonb_agg(v.id ORDER BY v.id) FROM (
        SELECT DISTINCT a.id FROM finding_case_members m JOIN findings f ON f.id=m.finding_id
        CROSS JOIN LATERAL jsonb_array_elements_text(f.asset_ids) e(v) JOIN assets a ON a.id=e.v::bigint
        WHERE m.case_id=c.id ORDER BY a.id LIMIT 4) v),'[]'::jsonb),
    (SELECT COUNT(DISTINCT a.id) FROM finding_case_members m JOIN findings f ON f.id=m.finding_id
        CROSS JOIN LATERAL jsonb_array_elements_text(f.asset_ids) e(v) JOIN assets a ON a.id=e.v::bigint WHERE m.case_id=c.id)
    FROM finding_cases c LEFT JOIN tasks t ON t.id=c.task_id
    WHERE c.id IN (SELECT jsonb_array_elements_text($1::jsonb)::bigint)`, string(raw))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var c FindingCaseListContext
		var assets []byte
		if err := rows.Scan(&id, &c.TaskName, &c.TaskDescription, &c.LastFoundAt, &assets, &c.AssetCount); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(assets, &c.AssetIDs); err != nil {
			return nil, err
		}
		result[id] = c
	}
	return result, rows.Err()
}
func (d *DB) MatchingFindingReportCount(filter FindingFilter) (int, error) {
	filter, err := d.applyAssetScope(filter)
	if err != nil {
		return 0, err
	}
	where, args := filter.where()
	var n int
	err = d.QueryRow(`SELECT COUNT(*) FROM findings f LEFT JOIN tasks t ON t.id=f.task_id`+where, args...).Scan(&n)
	return n, err
}
