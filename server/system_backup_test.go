package server

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	pgdb "github.com/Autumn-27/artex/db"
	"io"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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

	// Exporting while an active (non-terminal, non-paused) task exists must be refused.
	for _, method := range []string{"HEAD", "GET"} {
		blocked := httptest.NewRecorder()
		exporter.backupExport(blocked, httptest.NewRequest(method, "/api/system/backup/export", nil))
		if blocked.Code != 409 || blocked.Header().Get("X-Artex-Error-Code") != "backup_active_tasks" {
			t.Fatalf("%s with active task: status=%d header=%q body=%s", method, blocked.Code, blocked.Header().Get("X-Artex-Error-Code"), blocked.Body.String())
		}
	}
	if _, err := source.pg.Exec(`UPDATE tasks SET paused=true, pause_reason='paused_by_user' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}

	// Force small chunk size so multi-part COPY streaming is exercised end-to-end.
	prevChunk := backupCopyChunkBytes
	backupCopyChunkBytes = 128
	t.Cleanup(func() { backupCopyChunkBytes = prevChunk })

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
	if upload.Code != 202 {
		target.Close()
		t.Fatalf("restore upload status=%d body=%s", upload.Code, upload.Body.String())
	}
	var uploadResp struct {
		RestoreID string `json:"restore_id"`
	}
	if err := json.Unmarshal(upload.Body.Bytes(), &uploadResp); err != nil || uploadResp.RestoreID == "" {
		target.Close()
		t.Fatalf("missing restore_id in 202 response: %s (err=%v)", upload.Body.String(), err)
	}

	// A failed subsequent upload must leave the already-staged pending backup intact.
	badUpload := httptest.NewRecorder()
	restorer.backupRestore(badUpload, httptest.NewRequest("POST", "/api/system/backup/restore", strings.NewReader("corrupt")))
	if badUpload.Code != 400 {
		target.Close()
		t.Fatalf("corrupt upload status=%d body=%s", badUpload.Code, badUpload.Body.String())
	}
	if rawID, err := os.ReadFile(filepath.Join(targetDir, backupPendingDir, backupRestoreIDFile)); err != nil || strings.TrimSpace(string(rawID)) != uploadResp.RestoreID {
		target.Close()
		t.Fatalf("corrupt upload clobbered pending restore_id: got=%q err=%v want=%q", string(rawID), err, uploadResp.RestoreID)
	}

	// Uploading a second valid backup atomically replaces pending without leaving -old dirs.
	upload2 := httptest.NewRecorder()
	restorer.backupRestore(upload2, httptest.NewRequest("POST", "/api/system/backup/restore", bytes.NewReader(exported.Body.Bytes())))
	target.Close()
	if upload2.Code != 202 {
		t.Fatalf("second upload status=%d body=%s", upload2.Code, upload2.Body.String())
	}
	var uploadResp2 struct {
		RestoreID string `json:"restore_id"`
	}
	if err := json.Unmarshal(upload2.Body.Bytes(), &uploadResp2); err != nil || uploadResp2.RestoreID == "" || uploadResp2.RestoreID == uploadResp.RestoreID {
		t.Fatalf("unexpected second restore_id: %s (first=%q err=%v)", upload2.Body.String(), uploadResp.RestoreID, err)
	}
	if entries, err := os.ReadDir(targetDir); err == nil {
		for _, entry := range entries {
			if strings.HasPrefix(entry.Name(), backupUploadPrefix) {
				t.Fatalf("staging left upload/old dir behind: %s", entry.Name())
			}
		}
	}

	result, err := ApplyPendingRestore(targetDir, targetSkills)
	if err != nil || result == nil || !result.Applied || result.ID != uploadResp2.RestoreID {
		t.Fatalf("restore not applied: result=%+v err=%v wantID=%q", result, err, uploadResp2.RestoreID)
	}
	if again, err := ApplyPendingRestore(targetDir, targetSkills); err != nil || again != nil {
		t.Fatalf("pending restore applied twice: result=%+v err=%v", again, err)
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

func TestBackupRestoreWindowsPathsAndPausesUnpausedTasks(t *testing.T) {
	base, _, err := pgdb.DSN()
	if err != nil {
		t.Skipf("no database config (%v)", err)
	}
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	srcDSN := scratchDSN(t, base, "artex_backup_win_src_"+suffix)
	dstDSN := scratchDSN(t, base, "artex_backup_win_dst_"+suffix)

	src, err := pgdb.Open(srcDSN)
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer src.Close()
	activeTask, err := src.CreateTask("active", "running goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := src.Exec(`UPDATE tasks SET status='running', paused=false, queued=true, schedule_paused=true WHERE id=$1`, activeTask.ID); err != nil {
		t.Fatal(err)
	}
	doneTask, err := src.CreateTask("done", "finished goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := src.Exec(`UPDATE tasks SET status='done', paused=false WHERE id=$1`, doneTask.ID); err != nil {
		t.Fatal(err)
	}
	otherTask, err := src.CreateTask("other", "linux path goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := src.Exec(`UPDATE tasks SET status='done', paused=false WHERE id=$1`, otherTask.ID); err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		id   int64
		path string
	}{
		{activeTask.ID, `C:\artex\data\archives\tasks\win-1.tar.zst`},
		{doneTask.ID, `C:\artex\data-old\archives\tasks\prefix-collision.tar.zst`},
		{otherTask.ID, `/app/data/archives/tasks/already-linux.tar.zst`},
	} {
		if _, err := src.Exec(`INSERT INTO task_archives(task_id, state, archive_path) VALUES ($1, 'ready', $2)`, row.id, row.path); err != nil {
			t.Fatal(err)
		}
	}

	var dumped []pgdb.RestoreTable
	err = src.DumpTables(context.Background(), func(table pgdb.BackupTable, copyTo func(io.Writer) (int64, error)) error {
		var buf bytes.Buffer
		rows, err := copyTo(&buf)
		if err != nil {
			return err
		}
		table.Rows = rows
		raw := buf.Bytes()
		dumped = append(dumped, pgdb.RestoreTable{
			BackupTable: table,
			Open:        func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(raw)), nil },
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	dst, err := pgdb.Open(dstDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer dst.Close()
	move := pgdb.PathPrefixMove{From: `C:\artex\data`, FromSeparator: `\`, To: `/app/data`, ToSeparator: `/`}
	if err := dst.RestoreTables(context.Background(), dumped, move); err != nil {
		t.Fatal(err)
	}

	var paused, queued, schedulePaused bool
	var pauseReason string
	if err := dst.QueryRow(`SELECT paused, pause_reason, queued, schedule_paused FROM tasks WHERE id=$1`, activeTask.ID).
		Scan(&paused, &pauseReason, &queued, &schedulePaused); err != nil {
		t.Fatal(err)
	}
	if !paused || pauseReason != "paused_by_user" || queued || schedulePaused {
		t.Fatalf("restored active task not safely paused: paused=%v reason=%q queued=%v schedule_paused=%v", paused, pauseReason, queued, schedulePaused)
	}
	if err := dst.QueryRow(`SELECT paused FROM tasks WHERE id=$1`, doneTask.ID).Scan(&paused); err != nil {
		t.Fatal(err)
	}
	if paused {
		t.Fatal("terminal done task should not be flipped to paused")
	}
	for id, want := range map[int64]string{
		activeTask.ID: `/app/data/archives/tasks/win-1.tar.zst`,
		doneTask.ID:   `C:\artex\data-old\archives\tasks\prefix-collision.tar.zst`,
		otherTask.ID:  `/app/data/archives/tasks/already-linux.tar.zst`,
	} {
		var got string
		if err := dst.QueryRow(`SELECT archive_path FROM task_archives WHERE task_id=$1`, id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("task %d archive_path = %q, want %q", id, got, want)
		}
	}
}

func TestApplyPendingRestoreFailsFastOnFileInstallError(t *testing.T) {
	dataDir := t.TempDir()
	pending := filepath.Join(dataDir, backupPendingDir)
	writeTestFile(t, filepath.Join(pending, backupDBDoneMarker), `{"at":"2026-11-20T00:00:00Z"}`)
	writeTestFile(t, filepath.Join(pending, backupRestoreIDFile), "rid-file-fail")
	writeTestFile(t, filepath.Join(pending, "db", "settings.copy"), "")
	writeTestFile(t, filepath.Join(pending, "files", "tasks", "1", "note.txt"), "restored note")
	writeTestFile(t, filepath.Join(pending, "skills", "custom-skill", "SKILL.md"), "skill body")
	manifest := backupManifest{
		Format:    backupFormat,
		Version:   "v0.3.30",
		CreatedAt: time.Now().UTC(),
		Tables:    []backupTableEntry{{BackupTable: pgdb.BackupTable{Name: "settings", Columns: []string{"key", "value"}}}},
		Entries:   []string{"tasks"},
		Skills:    []string{"custom-skill"},
	}
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(pending, backupManifestName), string(raw))

	// A regular file where skillDir should be forces installBackupFiles to fail after DB commit.
	blockingSkillPath := filepath.Join(t.TempDir(), "not-a-dir")
	writeTestFile(t, blockingSkillPath, "blocker")

	res, err := ApplyPendingRestore(dataDir, blockingSkillPath)
	if err == nil {
		t.Fatalf("expected error on file install failure, got result=%+v", res)
	}
	if res == nil || res.Applied || res.ID != "rid-file-fail" {
		t.Fatalf("unexpected failure result: %+v", res)
	}
	if _, statErr := os.Stat(pending); statErr != nil {
		t.Fatalf("pending dir must stay for retry on next boot: %v", statErr)
	}

	// Once the blocker is fixed, the next boot resumes and finishes cleanly.
	realSkillDir := t.TempDir()
	res, err = ApplyPendingRestore(dataDir, realSkillDir)
	if err != nil || res == nil || !res.Applied || res.ID != "rid-file-fail" {
		t.Fatalf("resume after file install failure failed: result=%+v err=%v", res, err)
	}
	if got, err := os.ReadFile(filepath.Join(dataDir, "tasks", "1", "note.txt")); err != nil || string(got) != "restored note" {
		t.Fatalf("tasks note=%q err=%v", got, err)
	}
	if got, err := os.ReadFile(filepath.Join(realSkillDir, "custom-skill", "SKILL.md")); err != nil || string(got) != "skill body" {
		t.Fatalf("skill=%q err=%v", got, err)
	}
	if _, statErr := os.Stat(pending); !os.IsNotExist(statErr) {
		t.Fatalf("pending dir should be removed after completion: %v", statErr)
	}
}
