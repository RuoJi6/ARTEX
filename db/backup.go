package db

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

// BackupTable describes one table's columns, in the order its COPY data uses,
// and how many rows the data holds.
type BackupTable struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Rows    int64    `json:"rows"`
}

// RestoreTable is one table's COPY text-format data to load during a restore.
type RestoreTable struct {
	BackupTable
	Open func() (io.ReadCloser, error)
}

// PathPrefixMove rewrites absolute paths recorded under an old data directory
// (task_archives.archive_path) so they point at the restoring instance's one.
// Separators are carried separately so a Windows backup lands on Linux intact.
type PathPrefixMove struct{ From, FromSeparator, To, ToSeparator string }

// backupSkippedTables are neither exported nor replaced: server_logs is this
// process's own runtime log ring, not data worth migrating.
var backupSkippedTables = map[string]bool{"server_logs": true}

// tableColumnsSQL lists every ordinary table of the application schema with its
// writable columns. Generated columns cannot be COPY'd in, so they are left out.
const tableColumnsSQL = `
SELECT c.relname::text, array_agg(a.attname::text ORDER BY a.attnum)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
WHERE n.nspname = current_schema() AND c.relkind = 'r'
GROUP BY c.relname
ORDER BY c.relname`

func ident(name string) string { return pgx.Identifier{name}.Sanitize() }

func columnList(columns []string) string {
	quoted := make([]string, len(columns))
	for i, column := range columns {
		quoted[i] = ident(column)
	}
	return strings.Join(quoted, ", ")
}

// withPgx runs fn on one pooled connection's native pgx handle; COPY is only
// reachable through it.
func (d *DB) withPgx(ctx context.Context, fn func(*pgx.Conn) error) error {
	conn, err := d.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	return conn.Raw(func(driverConn any) error {
		native, ok := driverConn.(*stdlib.Conn)
		if !ok {
			return fmt.Errorf("unexpected driver connection %T", driverConn)
		}
		return fn(native.Conn())
	})
}

func queryTables(ctx context.Context, tx pgx.Tx) ([]BackupTable, error) {
	rows, err := tx.Query(ctx, tableColumnsSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tables []BackupTable
	for rows.Next() {
		var table BackupTable
		if err := rows.Scan(&table.Name, &table.Columns); err != nil {
			return nil, err
		}
		if !backupSkippedTables[table.Name] {
			tables = append(tables, table)
		}
	}
	return tables, rows.Err()
}

// CountActiveTasks returns how many non-deleted, non-terminal tasks are not
// paused (running, created/unpaused, or queued). Exporting while any exist
// would race with live disk writes and put active tasks into the backup.
func (d *DB) CountActiveTasks(ctx context.Context) (int, error) {
	var count int
	err := d.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM tasks
WHERE deleted_at IS NULL
  AND paused = false
  AND status NOT IN ('done', 'failed', 'timeout')`).Scan(&count)
	return count, err
}

// DumpTables exports every application table from a single read-only
// REPEATABLE READ snapshot, so rows written while the dump runs never produce a
// backup whose tables disagree with each other. emit is called once per table
// with a function that writes the table's COPY text data and returns its row
// count; emit records the count itself.
func (d *DB) DumpTables(ctx context.Context, emit func(BackupTable, func(io.Writer) (int64, error)) error) error {
	return d.withPgx(ctx, func(conn *pgx.Conn) error {
		tx, err := conn.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx) //nolint:errcheck // read-only; nothing to keep
		tables, err := queryTables(ctx, tx)
		if err != nil {
			return err
		}
		for _, table := range tables {
			statement := fmt.Sprintf("COPY %s (%s) TO STDOUT", ident(table.Name), columnList(table.Columns))
			copyTo := func(w io.Writer) (int64, error) {
				tag, err := tx.Conn().PgConn().CopyTo(ctx, w, statement)
				return tag.RowsAffected(), err
			}
			if err := emit(table, copyTo); err != nil {
				return fmt.Errorf("备份表 %s: %w", table.Name, err)
			}
		}
		return nil
	})
}

// CheckRestoreTables reports whether every table and column of a backup exists
// in the current schema. A backup taken by a newer ARTEX may carry columns this
// build does not know; loading it would fail halfway, so it is refused upfront.
func (d *DB) CheckRestoreTables(ctx context.Context, tables []BackupTable) error {
	return d.withPgx(ctx, func(conn *pgx.Conn) error {
		tx, err := conn.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx) //nolint:errcheck // read-only
		current, err := queryTables(ctx, tx)
		if err != nil {
			return err
		}
		return checkRestoreTables(current, tables)
	})
}

func checkRestoreTables(current, tables []BackupTable) error {
	known := make(map[string]map[string]bool, len(current))
	for _, table := range current {
		columns := make(map[string]bool, len(table.Columns))
		for _, column := range table.Columns {
			columns[column] = true
		}
		known[table.Name] = columns
	}
	seen := make(map[string]bool, len(tables))
	for _, table := range tables {
		if seen[table.Name] {
			return fmt.Errorf("备份中表 %s 重复", table.Name)
		}
		seen[table.Name] = true
		columns, ok := known[table.Name]
		if !ok {
			return fmt.Errorf("备份包含当前版本不存在的表 %s（备份可能来自更新的 ARTEX 版本）", table.Name)
		}
		for _, column := range table.Columns {
			if !columns[column] {
				return fmt.Errorf("备份表 %s 含当前版本不存在的列 %s（备份可能来自更新的 ARTEX 版本）", table.Name, column)
			}
		}
	}
	return nil
}

type foreignKey struct{ table, name, definition string }

// RestoreTables replaces the contents of every application table with the given
// data in one transaction: either the whole backup lands or nothing changes.
// Tables of the current schema that the backup does not carry end up empty;
// columns it does not carry take their defaults.
//
// Foreign keys are dropped for the load and re-added afterwards (which
// re-validates them), and user triggers are disabled so derived rows such as
// task_asset_links come from the backup instead of being regenerated on insert.
// Both only need table ownership, unlike session_replication_role, which needs
// superuser. Serial sequences are moved past the restored ids.
func (d *DB) RestoreTables(ctx context.Context, tables []RestoreTable, move PathPrefixMove) error {
	return d.withPgx(ctx, func(conn *pgx.Conn) error {
		tx, err := conn.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx) //nolint:errcheck // no-op once committed
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, schemaMigrationLockKey); err != nil {
			return fmt.Errorf("coordinate with schema migration: %w", err)
		}
		current, err := queryTables(ctx, tx)
		if err != nil {
			return err
		}
		backup := make([]BackupTable, len(tables))
		for i, table := range tables {
			backup[i] = table.BackupTable
		}
		if err := checkRestoreTables(current, backup); err != nil {
			return err
		}
		names := make([]string, len(current))
		for i, table := range current {
			names[i] = ident(table.Name)
		}

		keys, err := listForeignKeys(ctx, tx)
		if err != nil {
			return err
		}
		for _, key := range keys {
			if _, err := tx.Exec(ctx, fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT %s", key.table, ident(key.name))); err != nil {
				return fmt.Errorf("暂时移除外键 %s: %w", key.name, err)
			}
		}
		for _, name := range names {
			if _, err := tx.Exec(ctx, "ALTER TABLE "+name+" DISABLE TRIGGER USER"); err != nil {
				return fmt.Errorf("暂停触发器 %s: %w", name, err)
			}
		}
		if len(names) > 0 {
			if _, err := tx.Exec(ctx, "TRUNCATE "+strings.Join(names, ", ")); err != nil {
				return fmt.Errorf("清空当前数据: %w", err)
			}
		}
		for _, table := range tables {
			if err := copyIn(ctx, tx, table); err != nil {
				return fmt.Errorf("恢复表 %s: %w", table.Name, err)
			}
		}
		if move.From != "" && (move.From != move.To || move.FromSeparator != move.ToSeparator) {
			// Runs while triggers are still off so updated_at keeps the backup's value.
			from := strings.TrimSuffix(move.From, move.FromSeparator) + move.FromSeparator
			to := strings.TrimSuffix(move.To, move.ToSeparator) + move.ToSeparator
			if _, err := tx.Exec(ctx, `
UPDATE task_archives SET archive_path = $2 || replace(substr(archive_path, length($1) + 1), $3, $4)
WHERE left(archive_path, length($1)) = $1`, from, to, move.FromSeparator, move.ToSeparator); err != nil {
				return fmt.Errorf("改写归档包路径: %w", err)
			}
		}
		// Any non-terminal task that was not paused when backed up (for example,
		// from an older backup) is forced into a manual pause so restoring onto a
		// new host never resumes scanning targets on its own.
		if _, err := tx.Exec(ctx, `
UPDATE tasks
SET paused = true,
    pause_reason = CASE WHEN COALESCE(pause_reason, '') = '' THEN 'paused_by_user' ELSE pause_reason END,
    queued = false,
    queued_at = NULL,
    schedule_paused = false,
    schedule_manual_until = NULL,
    active_run_seconds = active_run_seconds + CASE WHEN run_segment_started_at IS NOT NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - run_segment_started_at)))::bigint) ELSE 0 END,
    run_segment_started_at = NULL
WHERE deleted_at IS NULL
  AND paused = false
  AND status NOT IN ('done', 'failed', 'timeout')`); err != nil {
			return fmt.Errorf("暂停恢复后的未完成任务: %w", err)
		}
		for _, key := range keys {
			if _, err := tx.Exec(ctx, fmt.Sprintf("ALTER TABLE %s ADD CONSTRAINT %s %s", key.table, ident(key.name), key.definition)); err != nil {
				return fmt.Errorf("恢复外键 %s: %w", key.name, err)
			}
		}
		for _, name := range names {
			if _, err := tx.Exec(ctx, "ALTER TABLE "+name+" ENABLE TRIGGER USER"); err != nil {
				return fmt.Errorf("恢复触发器 %s: %w", name, err)
			}
		}
		if err := resetSequences(ctx, tx); err != nil {
			return err
		}
		return tx.Commit(ctx)
	})
}

func listForeignKeys(ctx context.Context, tx pgx.Tx) ([]foreignKey, error) {
	rows, err := tx.Query(ctx, `
SELECT conrelid::regclass::text, conname::text, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f' AND connamespace = current_schema()::regnamespace
ORDER BY 1, 2`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []foreignKey
	for rows.Next() {
		var key foreignKey
		if err := rows.Scan(&key.table, &key.name, &key.definition); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

func copyIn(ctx context.Context, tx pgx.Tx, table RestoreTable) error {
	data, err := table.Open()
	if err != nil {
		return err
	}
	defer data.Close()
	statement := fmt.Sprintf("COPY %s (%s) FROM STDIN", ident(table.Name), columnList(table.Columns))
	tag, err := tx.Conn().PgConn().CopyFrom(ctx, data, statement)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != table.Rows {
		return fmt.Errorf("写入 %d 行，备份清单记录 %d 行", tag.RowsAffected(), table.Rows)
	}
	return nil
}

// resetSequences moves every column-owned sequence past the restored maximum;
// otherwise the next insert would collide with a restored primary key.
func resetSequences(ctx context.Context, tx pgx.Tx) error {
	rows, err := tx.Query(ctx, `
SELECT c.relname::text, a.attname::text, s.seq
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
CROSS JOIN LATERAL (SELECT pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq) s
WHERE n.nspname = current_schema() AND c.relkind = 'r' AND s.seq IS NOT NULL`)
	if err != nil {
		return err
	}
	type serial struct{ table, column, sequence string }
	var serials []serial
	for rows.Next() {
		var item serial
		if err := rows.Scan(&item.table, &item.column, &item.sequence); err != nil {
			rows.Close()
			return err
		}
		serials = append(serials, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, item := range serials {
		statement := fmt.Sprintf("SELECT setval($1, COALESCE((SELECT max(%s) FROM %s), 0) + 1, false)", ident(item.column), ident(item.table))
		if _, err := tx.Exec(ctx, statement, item.sequence); err != nil {
			return fmt.Errorf("重置序列 %s: %w", item.sequence, err)
		}
	}
	return nil
}
