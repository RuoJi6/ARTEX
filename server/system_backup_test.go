package server

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	pgdb "github.com/Autumn-27/artex/db"
)

// scratchDSN points the configured server at a fresh database that is dropped
// when the test ends, so restores never truncate the shared development DB.
func scratchDSN(t *testing.T, base, name string) string {
	t.Helper()
	u, err := url.Parse(base)
	if err != nil {
		t.Skipf("unparseable DSN: %v", err)
	}
	u.Path = "/" + name
	admin := *u
	admin.Path = "/postgres"
	t.Cleanup(func() {
		conn, err := sql.Open("pgx", admin.String())
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = conn.Exec(`DROP DATABASE IF EXISTS "` + name + `" WITH (FORCE)`)
	})
	return u.String()
}

func writeTestFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestBackupExportRestoreRoundTrip(t *testing.T) {
	base, _, err := pgdb.DSN()
	if err != nil {
		t.Skipf("no database config (%v)", err)
	}
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	sourceDSN := scratchDSN(t, base, "artex_backup_src_"+suffix)
	targetDSN := scratchDSN(t, base, "artex_backup_dst_"+suffix)

	sourceDir, sourceSkills := t.TempDir(), t.TempDir()
	t.Setenv("ARTEX_PG_DSN", sourceDSN)
	source, err := NewManager(sourceDir, "127.0.0.1:0")
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	task, err := source.pg.CreateTask("backup source", "migrate me", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := source.pg.SetSetting("backup.marker", "from-source"); err != nil {
		t.Fatal(err)
	}
	archivePath := filepath.Join(sourceDir, "archives", "tasks", "task-1.tar.zst")
	if _, err := source.pg.Exec(`INSERT INTO task_archives(task_id, state, archive_path) VALUES ($1, 'ready', $2)`, task.ID, archivePath); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(sourceDir, "tasks", fmt.Sprint(task.ID), "note.txt"), "task workspace")
	writeTestFile(t, archivePath, "archive package")
	writeTestFile(t, filepath.Join(sourceDir, ".restore-failed", "junk"), "never exported")
	writeTestFile(t, filepath.Join(sourceSkills, "custom-skill", "SKILL.md"), "---\nname: custom-skill\n---\n")
	writeTestFile(t, filepath.Join(sourceSkills, "shipped", "SKILL.md"), "old copy")

	exporter := &Server{m: source, skillDir: sourceSkills}
	exported := httptest.NewRecorder()
	exporter.backupExport(exported, httptest.NewRequest("GET", "/api/system/backup/export", nil))
	source.Close()
	if exported.Code != 200 || exported.Body.Len() == 0 {
		t.Fatalf("export status=%d size=%d", exported.Code, exported.Body.Len())
	}

	targetDir, targetSkills := t.TempDir(), t.TempDir()
	t.Setenv("ARTEX_PG_DSN", targetDSN)
	target, err := NewManager(targetDir, "")
	if err != nil {
		t.Fatal(err)
	}
	if err := target.pg.SetSetting("backup.stale", "replaced"); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(targetDir, "tasks", "999", "old.txt"), "stale workspace")
	writeTestFile(t, filepath.Join(targetSkills, "shipped", "SKILL.md"), "new copy")

	restorer := &Server{m: target, skillDir: targetSkills}
	upload := httptest.NewRecorder()
	restorer.backupRestore(upload, httptest.NewRequest("POST", "/api/system/backup/restore", bytes.NewReader(exported.Body.Bytes())))
	target.Close()
	if upload.Code != 202 {
		t.Fatalf("restore upload status=%d body=%s", upload.Code, upload.Body.String())
	}

	result := ApplyPendingRestore(targetDir, targetSkills)
	if result == nil || !result.Applied {
		t.Fatalf("restore not applied: %+v", result)
	}
	if again := ApplyPendingRestore(targetDir, targetSkills); again != nil {
		t.Fatalf("pending restore applied twice: %+v", again)
	}

	restored, err := pgdb.Open(targetDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	if got, err := restored.GetTask(task.ID); err != nil || got == nil || got.Goal != "migrate me" {
		t.Fatalf("restored task=%+v err=%v", got, err)
	}
	if value, ok, _ := restored.GetSetting("backup.marker"); !ok || value != "from-source" {
		t.Fatalf("restored setting=%q ok=%v", value, ok)
	}
	if _, ok, _ := restored.GetSetting("backup.stale"); ok {
		t.Fatal("target-only setting survived the restore")
	}
	var restoredArchivePath string
	if err := restored.QueryRow(`SELECT archive_path FROM task_archives WHERE task_id=$1`, task.ID).Scan(&restoredArchivePath); err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(targetDir, "archives", "tasks", "task-1.tar.zst"); restoredArchivePath != want {
		t.Fatalf("archive path=%q want %q", restoredArchivePath, want)
	}
	next, err := restored.CreateTask("after restore", "fresh id", nil, 0, 0)
	if err != nil {
		t.Fatalf("insert after restore (sequence not reset?): %v", err)
	}
	if next.ID <= task.ID {
		t.Fatalf("new task id %d does not follow restored id %d", next.ID, task.ID)
	}

	for path, want := range map[string]string{
		filepath.Join(targetDir, "tasks", fmt.Sprint(task.ID), "note.txt"): "task workspace",
		filepath.Join(targetDir, "archives", "tasks", "task-1.tar.zst"):    "archive package",
		filepath.Join(targetSkills, "custom-skill", "SKILL.md"):            "---\nname: custom-skill\n---\n",
		filepath.Join(targetSkills, "shipped", "SKILL.md"):                 "new copy",
	} {
		if got, err := os.ReadFile(path); err != nil || string(got) != want {
			t.Fatalf("%s = %q, %v; want %q", path, got, err, want)
		}
	}
	if _, err := os.Stat(filepath.Join(targetDir, "traffic", "_index", "index.sqlite")); err != nil {
		t.Fatalf("traffic index snapshot not restored: %v", err)
	}
	for _, gone := range []string{
		filepath.Join(targetDir, "tasks", "999"),
		filepath.Join(targetDir, ".restore-failed"),
		filepath.Join(targetDir, backupPendingDir),
		filepath.Join(targetDir, backupPreviousDir),
	} {
		if _, err := os.Stat(gone); !os.IsNotExist(err) {
			t.Fatalf("%s should not exist after restore: %v", gone, err)
		}
	}

	// A load that fails midway must leave the database exactly as it was.
	broken := []pgdb.RestoreTable{{
		BackupTable: pgdb.BackupTable{Name: "settings", Columns: []string{"key", "value"}, Rows: 2},
		Open:        func() (io.ReadCloser, error) { return io.NopCloser(strings.NewReader("only\tone\n")), nil },
	}}
	if err := restored.RestoreTables(context.Background(), broken, pgdb.PathPrefixMove{}); err == nil {
		t.Fatal("row-count mismatch was accepted")
	}
	if got, err := restored.GetTask(task.ID); err != nil || got == nil {
		t.Fatalf("failed restore lost data: task=%+v err=%v", got, err)
	}
}

func TestBackupRestoreRejectsForeignPackage(t *testing.T) {
	if _, _, err := pgdb.DSN(); err != nil {
		t.Skipf("no database config (%v)", err)
	}
	dataDir := t.TempDir()
	m, err := NewManager(dataDir, "")
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer m.Close()
	s := &Server{m: m}
	w := httptest.NewRecorder()
	s.backupRestore(w, httptest.NewRequest("POST", "/api/system/backup/restore", strings.NewReader("not a backup")))
	if w.Code != 400 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if _, err := os.Stat(filepath.Join(dataDir, backupPendingDir)); !os.IsNotExist(err) {
		t.Fatalf("invalid upload left a pending restore: %v", err)
	}
	entries, _ := os.ReadDir(dataDir)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), backupUploadPrefix) {
			t.Fatalf("invalid upload left staging dir %s", entry.Name())
		}
	}
}
