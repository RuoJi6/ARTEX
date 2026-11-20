package server

import (
	"archive/tar"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	pgdb "github.com/Autumn-27/artex/db"
	"github.com/klauspost/compress/zstd"
)

// 一键备份 / 恢复（迁移数据）。
//
// 备份包是 tar.zst，结构：
//
//	db/<table>.copy   PostgreSQL 各表的 COPY 文本数据（大表按分片追加 .000001…）
//	files/<rel>       数据目录（任务工作区、会话、流量、证据、归档包、MITM CA…）
//	skills/<name>/…   skill 目录
//	manifest.json     最后写入：表结构、分片与行数、来源数据目录、顶层条目清单
//
// 恢复分两步：上传时只解包到 <data>/.restore-pending 并对照当前 schema 校验，
// 然后请求重启；真正的替换在下次启动、任何组件打开数据之前由 ApplyPendingRestore
// 完成——运行中的 Agent、流量代理和 SQLite 索引都还没碰数据目录，替换才安全。
// 数据库在一个事务内整体替换，失败则保持原数据不动。

const (
	backupFormat        = 1
	backupManifestName  = "manifest.json"
	backupPendingDir    = ".restore-pending"
	backupUploadPrefix  = ".restore-upload-"
	backupPreviousDir   = ".restore-previous"
	backupFailedDir     = ".restore-failed"
	backupDBDoneMarker  = ".db-restored"
	backupRestoreIDFile = ".restore-id"
	backupMaxFiles      = 20_000_000
	backupTrafficIndex  = "traffic/_index" // live SQLite; exported via SnapshotIndex
)

// backupCopyChunkBytes bounds each streamed DB COPY tar entry so large tables
// flush compressed bytes to the client without disk spooling or proxy timeouts.
var backupCopyChunkBytes = 8 << 20

// backupSkipped lists data-dir paths (slash form, relative) that hold transient
// staging state rather than data. Top-level dot entries are skipped as well.
var backupSkipped = map[string]bool{
	"traffic/_delete_staging":  true,
	"archives/tasks/.staging":  true,
	"archives/tasks/.restore":  true,
	"evidence/.staging":        true,
	"traffic/_index/.snapshot": true,
}

type backupTableEntry struct {
	pgdb.BackupTable
	Parts int `json:"parts,omitempty"`
}

type backupManifest struct {
	Format    int                `json:"format"`
	Version   string             `json:"version"`
	CreatedAt time.Time          `json:"created_at"`
	DataDir   string             `json:"data_dir"`
	Separator string             `json:"separator"`
	Tables    []backupTableEntry `json:"tables"`
	Entries   []string           `json:"entries"`
	Skills    []string           `json:"skills"`
}

// backupMu serializes export and restore staging: two concurrent restores
// would race on the pending directory, and an export racing a restore upload
// is never what the operator meant.
var backupMu sync.Mutex

// BackupRestoreResult is the outcome of the boot-time restore, reported to the
// UI after the restart that applied it.
type BackupRestoreResult struct {
	ID      string    `json:"id,omitempty"`
	Applied bool      `json:"applied"`
	Error   string    `json:"error,omitempty"`
	At      time.Time `json:"at"`
	Source  string    `json:"source_version,omitempty"`
	Created time.Time `json:"backup_created_at,omitempty"`
}

var (
	bootRestoreMu sync.Mutex
	bootRestore   *BackupRestoreResult
)

// SetBootRestoreResult is called once by main with ApplyPendingRestore's result.
func SetBootRestoreResult(result *BackupRestoreResult) {
	bootRestoreMu.Lock()
	defer bootRestoreMu.Unlock()
	bootRestore = result
}

func bootRestoreResult() *BackupRestoreResult {
	bootRestoreMu.Lock()
	defer bootRestoreMu.Unlock()
	return bootRestore
}

// GET /api/system/backup/status
func (s *Server) backupStatus(w http.ResponseWriter, r *http.Request) {
	_, err := os.Stat(filepath.Join(s.m.dir, backupPendingDir))
	writeJSON(w, 200, map[string]any{"pending": err == nil, "last_restore": bootRestoreResult()})
}

// GET|HEAD /api/system/backup/export streams the backup package. Errors after
// the first byte abort the connection so a partial file never looks complete.
func (s *Server) backupExport(w http.ResponseWriter, r *http.Request) {
	if s.pg(w) == nil {
		return
	}
	if !backupMu.TryLock() {
		w.Header().Set("X-Artex-Error-Code", "backup_busy")
		writeProductError(w, 409, "backup_busy", "已有备份或恢复正在进行", nil)
		return
	}
	defer backupMu.Unlock()
	active, err := s.m.pg.CountActiveTasks(r.Context())
	if err != nil {
		log.Printf("[backup] 检查运行中任务失败：%v", err)
		writeProductError(w, 500, "data_unavailable", "检查运行中任务失败", nil)
		return
	}
	if active > 0 {
		w.Header().Set("X-Artex-Error-Code", "backup_active_tasks")
		writeProductError(w, 409, "backup_active_tasks", "存在未暂停的运行中或排队中任务，请先暂停或等待任务完成后再下载备份", map[string]any{"count": active})
		return
	}
	name := "artex-backup-" + time.Now().Format("20060102-150405") + ".tar.zst"
	w.Header().Set("Content-Type", "application/zstd")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	setFileDisposition(w, "attachment", name)
	if r.Method == http.MethodHead {
		return
	}
	started := time.Now()
	if err := s.writeBackup(r.Context(), w); err != nil {
		log.Printf("[backup] 导出失败：%v", err)
		panic(http.ErrAbortHandler)
	}
	log.Printf("[backup] 已导出备份 %s（%s）", name, time.Since(started).Round(time.Millisecond))
}

func (s *Server) writeBackup(ctx context.Context, out io.Writer) error {
	encoder, err := zstd.NewWriter(out, zstd.WithEncoderLevel(zstd.SpeedDefault), zstd.WithEncoderCRC(true))
	if err != nil {
		return err
	}
	flusher, _ := out.(http.Flusher)
	tw := tar.NewWriter(encoder)
	manifest := backupManifest{
		Format: backupFormat, Version: BuildVersion, CreatedAt: time.Now().UTC(),
		DataDir: s.m.dir, Separator: string(filepath.Separator), Entries: []string{}, Skills: []string{},
	}
	chunkMax := backupCopyChunkBytes
	if chunkMax <= 0 {
		chunkMax = 8 << 20
	}
	var copyBuf []byte
	err = s.m.pg.DumpTables(ctx, func(table pgdb.BackupTable, copyTo func(io.Writer) (int64, error)) error {
		cw := copyChunkWriter{
			tw:       tw,
			encoder:  encoder,
			flusher:  flusher,
			table:    table.Name,
			modTime:  manifest.CreatedAt,
			buf:      copyBuf[:0],
			chunkMax: chunkMax,
		}
		rows, copyErr := copyTo(&cw)
		if copyErr != nil {
			return copyErr
		}
		parts, err := cw.finish()
		if err != nil {
			return err
		}
		copyBuf = cw.buf[:0]
		table.Rows = rows
		entry := backupTableEntry{BackupTable: table}
		if parts > 1 {
			entry.Parts = parts
		}
		manifest.Tables = append(manifest.Tables, entry)
		return nil
	})
	if err != nil {
		return err
	}
	snapshot := ""
	if tr := s.m.Traffic(); tr != nil {
		spool, err := os.MkdirTemp(s.m.dir, ".backup-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(spool)
		snapshot = filepath.Join(spool, "index.sqlite")
		if err := tr.SnapshotIndex(snapshot); err != nil {
			return fmt.Errorf("快照流量索引: %w", err)
		}
		if err := addBackupFile(tw, snapshot, "files/"+backupTrafficIndex+"/index.sqlite"); err != nil {
			return err
		}
		if err := encoder.Flush(); err != nil {
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}
	}
	err = walkBackupTree(s.m.dir, func(relative string, info fs.FileInfo) (bool, error) {
		if !strings.Contains(relative, "/") {
			if strings.HasPrefix(relative, ".") {
				return false, nil
			}
			manifest.Entries = append(manifest.Entries, relative)
		}
		if backupSkipped[relative] || (snapshot != "" && relative == backupTrafficIndex) {
			return false, nil
		}
		return true, addBackupEntry(tw, filepath.Join(s.m.dir, filepath.FromSlash(relative)), "files/"+relative, info)
	})
	if err != nil {
		return err
	}
	if s.skillDir != "" {
		err = walkBackupTree(s.skillDir, func(relative string, info fs.FileInfo) (bool, error) {
			if strings.HasPrefix(relative, ".") {
				return false, nil
			}
			if !strings.Contains(relative, "/") {
				if !info.IsDir() {
					return false, nil
				}
				manifest.Skills = append(manifest.Skills, relative)
			}
			return true, addBackupEntry(tw, filepath.Join(s.skillDir, filepath.FromSlash(relative)), "skills/"+relative, info)
		})
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	raw, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	if err := tw.WriteHeader(&tar.Header{Name: backupManifestName, Mode: archiveFileMode, Size: int64(len(raw)), ModTime: manifest.CreatedAt, Typeflag: tar.TypeReg}); err != nil {
		return err
	}
	if _, err := tw.Write(raw); err != nil {
		return err
	}
	if err := tw.Close(); err != nil {
		return err
	}
	return encoder.Close()
}

func backupTableCopyPath(table string, part int) string {
	if part == 0 {
		return "db/" + table + ".copy"
	}
	return fmt.Sprintf("db/%s.copy.%06d", table, part)
}

func backupTablesOnly(entries []backupTableEntry) []pgdb.BackupTable {
	tables := make([]pgdb.BackupTable, len(entries))
	for i, entry := range entries {
		tables[i] = entry.BackupTable
	}
	return tables
}

type copyChunkWriter struct {
	tw       *tar.Writer
	encoder  *zstd.Encoder
	flusher  http.Flusher
	table    string
	modTime  time.Time
	buf      []byte
	chunkMax int
	parts    int
}

func (w *copyChunkWriter) Write(p []byte) (int, error) {
	total := len(p)
	for len(p) > 0 {
		space := w.chunkMax - len(w.buf)
		n := min(space, len(p))
		w.buf = append(w.buf, p[:n]...)
		p = p[n:]
		if len(w.buf) == w.chunkMax {
			if err := w.flushChunk(); err != nil {
				return total - len(p), err
			}
		}
	}
	return total, nil
}

func (w *copyChunkWriter) finish() (int, error) {
	if len(w.buf) > 0 || w.parts == 0 {
		if err := w.flushChunk(); err != nil {
			return w.parts, err
		}
	}
	return w.parts, nil
}

func (w *copyChunkWriter) flushChunk() error {
	header := &tar.Header{
		Name:     backupTableCopyPath(w.table, w.parts),
		Mode:     archiveFileMode,
		Size:     int64(len(w.buf)),
		ModTime:  w.modTime,
		Typeflag: tar.TypeReg,
	}
	if err := w.tw.WriteHeader(header); err != nil {
		return err
	}
	if len(w.buf) > 0 {
		if _, err := w.tw.Write(w.buf); err != nil {
			return err
		}
	}
	w.buf = w.buf[:0]
	w.parts++
	if err := w.encoder.Flush(); err != nil {
		return err
	}
	if w.flusher != nil {
		w.flusher.Flush()
	}
	return nil
}

// walkBackupTree visits root's descendants in lexical order with slash-form
// relative paths. visit returns false to skip an entry (and its subtree).
// Symlinks are skipped: the package format only carries files and directories.
func walkBackupTree(root string, visit func(relative string, info fs.FileInfo) (bool, error)) error {
	return filepath.WalkDir(root, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if current != root && errors.Is(walkErr, fs.ErrNotExist) {
				return nil // removed while walking (an agent cleaned up)
			}
			return walkErr
		}
		relative, err := filepath.Rel(root, current)
		if err != nil || relative == "." {
			return err
		}
		if entry.Type()&fs.ModeSymlink != 0 {
			log.Printf("[backup] 跳过符号链接：%s", current)
			return nil
		}
		info, err := entry.Info()
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if !info.IsDir() && !info.Mode().IsRegular() {
			return nil
		}
		keep, err := visit(filepath.ToSlash(relative), info)
		if err != nil {
			return err
		}
		if !keep && info.IsDir() {
			return filepath.SkipDir
		}
		return nil
	})
}

func addBackupFile(tw *tar.Writer, path, name string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	return addBackupEntry(tw, path, name, info)
}

func addBackupEntry(tw *tar.Writer, path, name string, info fs.FileInfo) error {
	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	header.Name = name
	header.Uname, header.Gname = "", ""
	if info.IsDir() {
		header.Name += "/"
		return tw.WriteHeader(header)
	}
	input, err := os.Open(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil // removed between listing and opening
	}
	if err != nil {
		return err
	}
	defer input.Close()
	if err := tw.WriteHeader(header); err != nil {
		return err
	}
	// Exactly the stat'ed size: a file still being appended to is cut at that
	// point instead of overflowing its tar entry.
	if _, err := io.CopyN(tw, input, header.Size); err != nil {
		return fmt.Errorf("读取 %s: %w", path, err)
	}
	return nil
}

// POST /api/system/backup/restore — body is the raw .tar.zst package.
func (s *Server) backupRestore(w http.ResponseWriter, r *http.Request) {
	if s.pg(w) == nil {
		return
	}
	if _, running := updHub.snapshot(); running {
		writeProductError(w, 409, "backup_update_running", "更新正在进行中，无法恢复备份", nil)
		return
	}
	if !backupMu.TryLock() {
		writeProductError(w, 409, "backup_busy", "已有备份或恢复正在进行", nil)
		return
	}
	defer backupMu.Unlock()
	manifest, restoreID, err := s.stageBackupUpload(r.Context(), r.Body)
	if err != nil {
		log.Printf("[backup] 恢复包校验失败：%v", err)
		writeProductError(w, 400, "backup_invalid", "备份包无效："+err.Error(), map[string]any{"message": err.Error()})
		return
	}
	log.Printf("[backup] 已接收备份（版本 %s，创建于 %s），即将重启以完成恢复", manifest.Version, manifest.CreatedAt.Format(time.RFC3339))
	writeJSON(w, 202, map[string]any{"ok": true, "restore_id": restoreID, "version": manifest.Version, "created_at": manifest.CreatedAt})
	go func() {
		time.Sleep(500 * time.Millisecond)
		requestRestart()
	}()
}

func newBackupRestoreID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err == nil {
		return hex.EncodeToString(raw[:])
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func (s *Server) stageBackupUpload(ctx context.Context, body io.Reader) (*backupManifest, string, error) {
	upload, err := os.MkdirTemp(s.m.dir, backupUploadPrefix)
	if err != nil {
		return nil, "", err
	}
	staged := false
	defer func() {
		if !staged {
			_ = os.RemoveAll(upload)
		}
	}()
	if err := extractTarZst(body, upload, backupMaxFiles); err != nil {
		return nil, "", fmt.Errorf("解包失败: %w", err)
	}
	manifest, err := readBackupManifest(upload)
	if err != nil {
		return nil, "", err
	}
	if err := s.m.pg.CheckRestoreTables(ctx, backupTablesOnly(manifest.Tables)); err != nil {
		return nil, "", err
	}
	restoreID := newBackupRestoreID()
	if err := os.WriteFile(filepath.Join(upload, backupRestoreIDFile), []byte(restoreID), archiveFileMode); err != nil {
		return nil, "", err
	}
	pending := filepath.Join(s.m.dir, backupPendingDir)
	oldPending := upload + "-old"
	hadPending := false
	if _, err := os.Lstat(pending); err == nil {
		if err := os.Rename(pending, oldPending); err != nil {
			return nil, "", err
		}
		hadPending = true
	} else if !errors.Is(err, fs.ErrNotExist) {
		return nil, "", err
	}
	if err := os.Rename(upload, pending); err != nil {
		if hadPending {
			_ = os.Rename(oldPending, pending)
		}
		return nil, "", err
	}
	staged = true
	if hadPending {
		_ = os.RemoveAll(oldPending)
	}
	return manifest, restoreID, nil
}

// readBackupManifest loads and validates the manifest of an extracted package:
// every name it lists must be a single local path element that actually exists,
// so a crafted manifest cannot point the restore outside the package.
func readBackupManifest(root string) (*backupManifest, error) {
	raw, err := os.ReadFile(filepath.Join(root, backupManifestName))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, errors.New("缺少 manifest.json（不是 ARTEX 备份包，或文件不完整）")
	}
	if err != nil {
		return nil, err
	}
	var manifest backupManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return nil, fmt.Errorf("manifest.json 格式错误: %w", err)
	}
	if manifest.Format < 1 || manifest.Format > backupFormat {
		return nil, fmt.Errorf("不支持的备份格式版本 %d（备份可能来自更新的 ARTEX 版本）", manifest.Format)
	}
	if len(manifest.Tables) == 0 {
		return nil, errors.New("备份中没有数据库表")
	}
	for _, table := range manifest.Tables {
		if !singleElement(table.Name) || len(table.Columns) == 0 {
			return nil, fmt.Errorf("备份表名无效: %q", table.Name)
		}
		parts := max(table.Parts, 1)
		if table.Parts < 0 || parts > backupMaxFiles {
			return nil, fmt.Errorf("备份表 %s 分片数无效: %d", table.Name, table.Parts)
		}
		for part := range parts {
			if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(backupTableCopyPath(table.Name, part)))); err != nil {
				return nil, fmt.Errorf("缺少表 %s 的数据", table.Name)
			}
		}
	}
	for _, name := range manifest.Entries {
		if !singleElement(name) || strings.HasPrefix(name, ".") {
			return nil, fmt.Errorf("备份条目名无效: %q", name)
		}
	}
	for _, name := range manifest.Skills {
		if !singleElement(name) || strings.HasPrefix(name, ".") {
			return nil, fmt.Errorf("备份 skill 名无效: %q", name)
		}
	}
	return &manifest, nil
}

func singleElement(name string) bool {
	return name != "" && filepath.IsLocal(name) && !strings.ContainsAny(name, `/\`)
}

// ApplyPendingRestore installs a backup staged by the restore endpoint. main
// calls it before anything opens the data directory or the database. It returns
// nil when nothing was pending.
//
// Steps are resumable: the database transaction is marked done inside the
// pending directory, and each top-level entry is moved aside and replaced one
// rename at a time, so a crash at any point is finished by the next boot. A
// database failure leaves current data untouched and parks the package in
// .restore-failed for inspection.
func ApplyPendingRestore(dataDir, skillDir string) (*BackupRestoreResult, error) {
	if abs, err := filepath.Abs(dataDir); err == nil {
		dataDir = abs
	}
	pending := filepath.Join(dataDir, backupPendingDir)
	previous := filepath.Join(dataDir, backupPreviousDir)
	if _, err := os.Stat(pending); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			_ = os.RemoveAll(previous) // leftover of a restore that crashed during cleanup
		}
		cleanBackupUploads(dataDir)
		return nil, nil
	}
	cleanBackupUploads(dataDir)
	result := &BackupRestoreResult{At: time.Now()}
	if rawID, err := os.ReadFile(filepath.Join(pending, backupRestoreIDFile)); err == nil {
		result.ID = strings.TrimSpace(string(rawID))
	}
	manifest, err := readBackupManifest(pending)
	if err == nil {
		result.Source, result.Created = manifest.Version, manifest.CreatedAt
		log.Printf("[backup] 开始恢复备份（版本 %s，创建于 %s）", manifest.Version, manifest.CreatedAt.Format(time.RFC3339))
		err = restoreBackupDatabase(pending, dataDir, manifest)
	}
	if err != nil {
		result.Error = err.Error()
		log.Printf("[backup] 恢复失败，当前数据保持不变：%v", err)
		failed := filepath.Join(dataDir, backupFailedDir)
		_ = os.RemoveAll(failed)
		if renameErr := os.Rename(pending, failed); renameErr != nil {
			log.Printf("[backup] 无法移走失败的恢复包，删除之：%v", renameErr)
			_ = os.RemoveAll(pending)
		}
		return result, nil
	}
	if err := installBackupFiles(pending, dataDir, skillDir, manifest); err != nil {
		// The database is already replaced; do not start the engine on half-installed
		// files. Returning an error makes main exit non-zero so the supervisor retries.
		result.Error = "数据库已恢复，但文件替换失败（下次启动会继续）：" + err.Error()
		log.Printf("[backup] %s", result.Error)
		return result, err
	}
	if err := os.RemoveAll(previous); err != nil {
		log.Printf("[backup] 清理旧数据失败：%v", err)
	}
	if err := os.RemoveAll(pending); err != nil {
		result.Error = "恢复已完成，但清理暂存目录失败：" + err.Error()
		log.Printf("[backup] %s", result.Error)
		return result, err
	}
	result.Applied = true
	log.Printf("[backup] 备份恢复完成")
	return result, nil
}

func cleanBackupUploads(dataDir string) {
	entries, _ := os.ReadDir(dataDir)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), backupUploadPrefix) || strings.HasPrefix(entry.Name(), ".backup-") {
			_ = os.RemoveAll(filepath.Join(dataDir, entry.Name()))
		}
	}
}

func restoreBackupDatabase(pending, dataDir string, manifest *backupManifest) error {
	marker := filepath.Join(pending, backupDBDoneMarker)
	if _, err := os.Stat(marker); err == nil {
		return nil
	}
	dsn, _, err := pgdb.DSN()
	if err != nil {
		return err
	}
	pg, err := pgdb.Open(dsn)
	if err != nil {
		return err
	}
	defer pg.Close()
	// Created outside schema.sql; a fresh target database does not have them yet.
	if err := pg.EnsureLLMRecordsTable(); err != nil {
		return err
	}
	if err := pg.EnsureLLMUsageTable(); err != nil {
		return err
	}
	tables := make([]pgdb.RestoreTable, len(manifest.Tables))
	for i, table := range manifest.Tables {
		name, parts := table.Name, max(table.Parts, 1)
		tables[i] = pgdb.RestoreTable{
			BackupTable: table.BackupTable,
			Open:        func() (io.ReadCloser, error) { return openBackupTableParts(pending, name, parts) },
		}
	}
	move := pgdb.PathPrefixMove{From: manifest.DataDir, FromSeparator: manifest.Separator, To: dataDir, ToSeparator: string(filepath.Separator)}
	if err := pg.RestoreTables(context.Background(), tables, move); err != nil {
		return err
	}
	// A machine-specific interpreter path from the old host would break custom
	// tools; dropping it lets startup re-detect the local one.
	if value, ok, _ := pg.GetSetting(settingPythonInterp); ok && strings.TrimSpace(value) != "" {
		if _, err := os.Stat(strings.TrimSpace(value)); err != nil {
			if _, err := pg.Exec(`DELETE FROM settings WHERE key=$1`, settingPythonInterp); err != nil {
				log.Printf("[backup] 清除失效的 python 解释器配置失败：%v", err)
			}
		}
	}
	return writeArchiveJournal(marker, map[string]any{"at": time.Now()})
}

func openBackupTableParts(pending, table string, parts int) (io.ReadCloser, error) {
	if parts <= 1 {
		return os.Open(filepath.Join(pending, filepath.FromSlash(backupTableCopyPath(table, 0))))
	}
	paths := make([]string, parts)
	for i := range parts {
		paths[i] = filepath.Join(pending, filepath.FromSlash(backupTableCopyPath(table, i)))
	}
	return &multiFileReader{paths: paths}, nil
}

type multiFileReader struct {
	paths   []string
	index   int
	current *os.File
}

func (r *multiFileReader) Read(p []byte) (int, error) {
	for {
		if r.current == nil {
			if r.index >= len(r.paths) {
				return 0, io.EOF
			}
			f, err := os.Open(r.paths[r.index])
			if err != nil {
				return 0, err
			}
			r.current = f
			r.index++
		}
		n, err := r.current.Read(p)
		if n > 0 || (err != nil && !errors.Is(err, io.EOF)) {
			if errors.Is(err, io.EOF) {
				_ = r.current.Close()
				r.current = nil
				return n, nil
			}
			return n, err
		}
		if closeErr := r.current.Close(); closeErr != nil {
			r.current = nil
			return 0, closeErr
		}
		r.current = nil
	}
}

func (r *multiFileReader) Close() error {
	if r.current != nil {
		err := r.current.Close()
		r.current = nil
		return err
	}
	return nil
}

func installBackupFiles(pending, dataDir, skillDir string, manifest *backupManifest) error {
	previous := filepath.Join(dataDir, backupPreviousDir)
	if err := os.MkdirAll(previous, archiveDirMode); err != nil {
		return err
	}
	keep := make(map[string]bool, len(manifest.Entries))
	for _, name := range manifest.Entries {
		keep[name] = true
	}
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") || keep[name] {
			continue
		}
		if err := moveAside(filepath.Join(dataDir, name), filepath.Join(previous, name)); err != nil {
			return err
		}
	}
	for _, name := range manifest.Entries {
		source := filepath.Join(pending, "files", name)
		if _, err := os.Lstat(source); errors.Is(err, fs.ErrNotExist) {
			continue // already installed by an interrupted earlier boot
		} else if err != nil {
			return err
		}
		destination := filepath.Join(dataDir, name)
		if _, err := os.Lstat(destination); err == nil {
			if err := moveAside(destination, filepath.Join(previous, name)); err != nil {
				return err
			}
		}
		if err := os.Rename(source, destination); err != nil {
			return err
		}
	}
	if skillDir == "" {
		return nil
	}
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		return err
	}
	// Skills already present here are kept: built-in skills ship with this
	// build and must not be downgraded by an older backup's copy.
	for _, name := range manifest.Skills {
		source := filepath.Join(pending, "skills", name)
		destination := filepath.Join(skillDir, name)
		if _, err := os.Lstat(source); err != nil {
			continue
		}
		if _, err := os.Lstat(destination); err == nil {
			continue
		}
		if err := os.Rename(source, destination); err != nil {
			if err := copyBackupTree(source, destination); err != nil {
				return fmt.Errorf("安装 skill %s: %w", name, err)
			}
		}
	}
	return nil
}

func moveAside(source, destination string) error {
	if _, err := os.Lstat(destination); err == nil {
		if err := os.RemoveAll(destination); err != nil {
			return err
		}
	}
	return os.Rename(source, destination)
}

// copyBackupTree is the fallback when the skill directory sits on another
// filesystem than the data directory (a Docker bind mount), where rename fails.
func copyBackupTree(source, destination string) error {
	temporary := destination + ".restore-tmp"
	_ = os.RemoveAll(temporary)
	err := filepath.WalkDir(source, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, current)
		if err != nil {
			return err
		}
		target := filepath.Join(temporary, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		input, err := os.Open(current)
		if err != nil {
			return err
		}
		defer input.Close()
		output, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, info.Mode().Perm())
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(output, input)
		return errors.Join(copyErr, output.Close())
	})
	if err != nil {
		_ = os.RemoveAll(temporary)
		return err
	}
	return os.Rename(temporary, destination)
}
