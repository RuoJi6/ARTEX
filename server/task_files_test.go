package server

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// These tests need no database: the task registry and a temporary run directory
// exercise the same filesystem handlers used by the authenticated production mux.
func taskFilesFixture(t *testing.T) (*Server, string, func(string, string, string) *httptest.ResponseRecorder) {
	t.Helper()
	base := t.TempDir()
	m := &Manager{dir: base, tasks: map[string]*Task{"313": {ID: "313"}}}
	s := &Server{m: m}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/tasks/{id}/files", s.taskFilesList)
	mux.HandleFunc("GET /api/tasks/{id}/files/all", s.taskFilesAll)
	for _, action := range []string{"read", "download", "preview"} {
		mux.HandleFunc("GET /api/tasks/{id}/files/"+action, s.taskFilesServe)
	}
	mux.HandleFunc("GET /api/tasks/{id}/files/archive", s.taskFilesArchive)
	run := filepath.Join(base, "tasks", "313")
	request := func(id, action, path string) *httptest.ResponseRecorder {
		t.Helper()
		target := "/api/tasks/" + id + "/files"
		if action != "" {
			target += "/" + action
		}
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest("GET", target+"?path="+url.QueryEscape(path), nil))
		return rec
	}
	return s, run, request
}
func taskFileWrite(t *testing.T, base, name string, data []byte) {
	t.Helper()
	p := filepath.Join(base, name)
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, data, 0644); err != nil {
		t.Fatal(err)
	}
}
func taskFileListingResult(t *testing.T, rec *httptest.ResponseRecorder) taskFileListing {
	t.Helper()
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var result taskFileListing
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}
func TestTaskFilesValidationAndMissing(t *testing.T) {
	_, run, get := taskFilesFixture(t)
	for _, id := range []string{"abc", "-1", "0", "0313", "99999999999999999999", "314"} {
		if r := get(id, "", ""); r.Code != 404 {
			t.Errorf("%s status %d", id, r.Code)
		}
	}
	for _, action := range []string{"", "all"} {
		got := taskFileListingResult(t, get("313", action, ""))
		if !got.Missing || got.Total != 0 || len(got.Entries) != 0 {
			t.Fatalf("missing: %+v", got)
		}
	}
	if r := get("313", "read", "missing"); r.Code != 404 {
		t.Fatal(r.Code)
	}
	taskFileWrite(t, run, "ok.txt", []byte("safe"))
	for _, path := range []string{"../secret", "a/../../secret", "/etc/passwd", "C:/secret", `..\secret`, "a//b", "a/../ok.txt", "a\x00b"} {
		for _, action := range []string{"", "all", "read", "download", "preview", "archive"} {
			if r := get("313", action, path); r.Code != 400 {
				t.Errorf("%s %q status %d", action, path, r.Code)
			}
		}
	}
	for _, action := range []string{"", "read", "download", "archive"} {
		if r := get("313", action, "missing"); r.Code != 404 {
			t.Errorf("%s missing %d", action, r.Code)
		}
	}
	if err := os.RemoveAll(run); err != nil {
		t.Fatal(err)
	}
	if r := get("313", "download", "ok.txt"); r.Code != 404 {
		t.Fatal(r.Code)
	}
}
func TestTaskFilesSymlinkIsolationAndZip(t *testing.T) {
	s, run, get := taskFilesFixture(t)
	taskFileWrite(t, run, "nested/hello.txt", []byte("hello"))
	taskFileWrite(t, run, ".hidden", []byte("hidden"))
	taskFileWrite(t, run, `..\unsafe.txt`, []byte("unsafe ZIP name"))
	outside := t.TempDir()
	taskFileWrite(t, outside, "secret.txt", []byte("SECRET"))
	for name, target := range map[string]string{"escape.txt": filepath.Join(outside, "secret.txt"), "escape-dir": outside, "inside": "nested/hello.txt"} {
		if err := os.Symlink(target, filepath.Join(run, name)); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"escape.txt", "escape-dir/secret.txt"} {
		for _, action := range []string{"read", "download", "preview", "archive"} {
			if r := get("313", action, name); r.Code == 200 {
				t.Errorf("escaped %s %s", action, name)
			}
		}
	}
	if r := get("313", "", "escape-dir"); r.Code == 200 {
		t.Fatal("directory escape")
	}
	listing := taskFileListingResult(t, get("313", "", ""))
	links := 0
	for _, e := range listing.Entries {
		if e.Symlink {
			links++
		}
	}
	if links != 3 {
		t.Fatalf("links=%d", links)
	}
	if r := get("313", "read", "inside"); r.Code != 200 || !strings.Contains(r.Body.String(), "hello") {
		t.Fatalf("internal link %d %s", r.Code, r.Body.String())
	}
	all := taskFileListingResult(t, get("313", "all", ""))
	if all.Total != 3 || all.Size != 26 {
		t.Fatalf("all: %+v", all)
	}
	for _, dir := range []string{"", "nested"} {
		rec := get("313", "archive", dir)
		if rec.Code != 200 || rec.Header().Get("Content-Type") != "application/zip" {
			t.Fatal(rec.Code)
		}
		zr, err := zip.NewReader(bytes.NewReader(rec.Body.Bytes()), int64(rec.Body.Len()))
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, entry := range zr.File {
			if strings.Contains(entry.Name, "escape") || entry.Name == "inside" || strings.Contains(entry.Name, "\\") {
				t.Fatalf("zipped link %s", entry.Name)
			}
			if strings.HasSuffix(entry.Name, "hello.txt") {
				f, err := entry.Open()
				if err != nil {
					t.Fatal(err)
				}
				data, err := io.ReadAll(f)
				f.Close()
				if err != nil || string(data) != "hello" {
					t.Fatalf("ZIP contents %q %v", data, err)
				}
				found = true
			}
		}
		if !found {
			t.Fatal("missing file in zip")
		}
	}
	// A symlink used as the task root must not be followed either.
	s.m.tasks["314"] = &Task{ID: "314"}
	if err := os.Symlink(outside, filepath.Join(filepath.Dir(run), "314")); err != nil {
		t.Fatal(err)
	}
	if r := get("314", "read", "secret.txt"); r.Code == 200 {
		t.Fatal("task root escaped")
	}
}
func TestTaskFilesTextAndPreview(t *testing.T) {
	_, run, get := taskFilesFixture(t)
	cases := []struct {
		name          string
		data          []byte
		binary, large bool
	}{
		{"empty", nil, false, false}, {"utf8", []byte("文本\n"), false, false},
		{"nul", []byte{'a', 0}, true, false}, {"invalid", []byte{0xff}, true, false},
		{"boundary", bytes.Repeat([]byte{'a'}, maxWorkspaceRead), false, false},
		{"large", bytes.Repeat([]byte{'a'}, maxWorkspaceRead+1), true, true},
	}
	for _, tc := range cases {
		taskFileWrite(t, run, tc.name, tc.data)
		var got struct {
			Binary  bool   `json:"binary"`
			Large   bool   `json:"too_large"`
			Content string `json:"content"`
		}
		rec := get("313", "read", tc.name)
		if rec.Code != 200 {
			t.Fatal(rec.Code)
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		if got.Binary != tc.binary || got.Large != tc.large || (!tc.binary && got.Content != string(tc.data)) {
			t.Fatalf("%s flags %v/%v", tc.name, got.Binary, got.Large)
		}
	}
	// Content and extension must agree; HTML/SVG never render inline.
	for _, name := range []string{"x.html", "x.svg", "spoof.png"} {
		taskFileWrite(t, run, name, []byte("<html>unsafe</html>"))
		if r := get("313", "preview", name); r.Code != 415 {
			t.Fatalf("%s %d", name, r.Code)
		}
	}
	var imageData bytes.Buffer
	if err := png.Encode(&imageData, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	taskFileWrite(t, run, "image.png", imageData.Bytes())
	rec := get("313", "preview", "image.png")
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "image/png" || rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("preview %d %v", rec.Code, rec.Header())
	}
	rec = get("313", "download", "spoof.png")
	if rec.Code != 200 || !strings.HasPrefix(rec.Header().Get("Content-Disposition"), "attachment;") || rec.Header().Get("Content-Type") != "application/octet-stream" {
		t.Fatalf("download %d %v", rec.Code, rec.Header())
	}
	// Simulate growth after the stat: the shared reader must still cap allocation.
	rec = httptest.NewRecorder()
	writeTextFile(rec, "growing", bytes.NewReader(bytes.Repeat([]byte{'a'}, maxWorkspaceRead+100)), 1)
	if !strings.Contains(rec.Body.String(), `"too_large":true`) {
		t.Fatal("growing file not capped")
	}
}
func TestTaskFilesRecentTruncation(t *testing.T) {
	_, run, get := taskFilesFixture(t)
	stamp := time.Unix(1700000000, 0)
	for i := 0; i < 2005; i++ {
		name := fmt.Sprintf("%04d.txt", i)
		taskFileWrite(t, run, name, []byte("x"))
		tm := stamp.Add(time.Duration(i) * time.Second)
		if err := os.Chtimes(filepath.Join(run, name), tm, tm); err != nil {
			t.Fatal(err)
		}
	}
	all := taskFileListingResult(t, get("313", "all", ""))
	if !all.Truncated || all.Total != 2005 || all.Size != 2005 || len(all.Entries) != 2000 {
		t.Fatalf("counts: total=%d entries=%d truncated=%v", all.Total, len(all.Entries), all.Truncated)
	}
	if all.Entries[0].Name != "2004.txt" || all.Entries[1999].Name != "0005.txt" {
		t.Fatal("truncated before sorting")
	}
	for i := 1; i < len(all.Entries); i++ {
		if newerTaskFile(all.Entries[i], all.Entries[i-1]) {
			t.Fatal("not sorted")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	root, err := os.OpenRoot(run)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if _, err := scanTaskFiles(httptest.NewRequest("GET", "/", nil).WithContext(ctx), root); err == nil {
		t.Fatal("ignored cancellation")
	}
}

func TestTaskFilesAuthAndHead(t *testing.T) {
	s, run, _ := taskFilesFixture(t)
	s.jwtKey = []byte("task-files-test-signing-key")
	taskFileWrite(t, run, "readme.txt", []byte("read only"))
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/tasks/{id}/files", s.taskFilesList)
	mux.HandleFunc("GET /api/tasks/{id}/files/all", s.taskFilesAll)
	for _, action := range []string{"read", "download", "preview"} {
		mux.HandleFunc("GET /api/tasks/{id}/files/"+action, s.taskFilesServe)
	}
	mux.HandleFunc("GET /api/tasks/{id}/files/archive", s.taskFilesArchive)
	handler := s.requireAuth(mux)
	for _, action := range []string{"", "/all", "/read", "/download", "/preview", "/archive"} {
		req := httptest.NewRequest("GET", "/api/tasks/313/files"+action+"?path=readme.txt", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != 401 {
			t.Fatalf("unauthenticated %s: %d", action, rec.Code)
		}
	}
	token, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	for _, action := range []string{"archive", "download"} {
		path := "readme.txt"
		if action == "archive" {
			path = ""
		}
		req := httptest.NewRequest("HEAD", "/api/tasks/313/files/"+action+"?path="+path, nil)
		req.AddCookie(&http.Cookie{Name: "artex_token", Value: token})
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != 200 || rec.Body.Len() != 0 {
			t.Fatalf("HEAD %s %d body=%d", action, rec.Code, rec.Body.Len())
		}
	}
}

// Opt-in, strictly read-only smoke check against an existing run directory.
func TestTaskFilesRealDirectory(t *testing.T) {
	base := os.Getenv("ARTEX_TASK_FILES_TEST_DIR")
	if base == "" {
		t.Skip("set ARTEX_TASK_FILES_TEST_DIR to read an existing task 313 directory")
	}
	m := &Manager{dir: base, tasks: map[string]*Task{"313": {ID: "313"}}}
	s := &Server{m: m}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/tasks/{id}/files", s.taskFilesList)
	mux.HandleFunc("GET /api/tasks/{id}/files/all", s.taskFilesAll)
	mux.HandleFunc("GET /api/tasks/{id}/files/read", s.taskFilesServe)
	mux.HandleFunc("GET /api/tasks/{id}/files/download", s.taskFilesServe)
	mux.HandleFunc("GET /api/tasks/{id}/files/preview", s.taskFilesServe)
	mux.HandleFunc("GET /api/tasks/{id}/files/archive", s.taskFilesArchive)
	get := func(action, path string) *httptest.ResponseRecorder {
		target := "/api/tasks/313/files"
		if action != "" {
			target += "/" + action
		}
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest("GET", target+"?path="+url.QueryEscape(path), nil))
		return rec
	}
	root := taskFileListingResult(t, get("", ""))
	all := taskFileListingResult(t, get("all", ""))
	if len(root.Entries) == 0 || all.Total == 0 {
		t.Fatal("real directory is empty")
	}
	textChecked, imageChecked := false, false
	for _, entry := range all.Entries {
		if !textChecked && strings.HasSuffix(entry.Path, ".txt") {
			if rec := get("read", entry.Path); rec.Code != 200 {
				t.Fatal("real text preview", rec.Code)
			}
			rec := get("download", entry.Path)
			data, err := os.ReadFile(filepath.Join(base, "tasks", "313", entry.Path))
			if err != nil {
				t.Fatal(err)
			}
			if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), data) {
				t.Fatal("real download mismatch")
			}
			textChecked = true
		}
		if !imageChecked && strings.HasSuffix(entry.Path, ".jpg") {
			if rec := get("preview", entry.Path); rec.Code == 200 {
				imageChecked = true
			}
		}
	}
	rec := get("archive", "")
	if rec.Code != 200 {
		t.Fatal("real zip", rec.Code)
	}
	zr, err := zip.NewReader(bytes.NewReader(rec.Body.Bytes()), int64(rec.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, file := range zr.File {
		if file.FileInfo().IsDir() {
			continue
		}
		f, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		_, err = io.Copy(io.Discard, f)
		f.Close()
		if err != nil {
			t.Fatal(err)
		}
		count++
	}
	if count != all.Total || !textChecked {
		t.Fatalf("real smoke: zip=%d total=%d text=%v", count, all.Total, textChecked)
	}
	t.Logf("read-only task 313: root entries=%d files=%d bytes=%d zip files=%d text/download=%v valid JPEG=%v", len(root.Entries), all.Total, all.Size, count, textChecked, imageChecked)
}

func TestTaskFilesIntentMetadata(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("isolated PostgreSQL required: %v", err)
	}
	defer m.Close()
	task, err := m.CreateTask("task files metadata", "", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	numericID, _ := strconv.ParseInt(task.ID, 10, 64)
	defer m.pg.DeleteTask(numericID)
	id, err := task.Store.AddIntent(map[string]any{"summary": "Readable intent title"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	run := filepath.Join(m.dir, "tasks", task.ID)
	taskFileWrite(t, run, fmt.Sprintf("i%d/output.txt", id), []byte("result"))
	req := httptest.NewRequest("GET", "/api/tasks/"+task.ID+"/files", nil)
	req.SetPathValue("id", task.ID)
	rec := httptest.NewRecorder()
	(&Server{m: m}).taskFilesList(rec, req)
	listing := taskFileListingResult(t, rec)
	if len(listing.Entries) != 1 || listing.Entries[0].IntentID != id || listing.Entries[0].IntentTitle != "Readable intent title" || listing.Entries[0].IntentState != "open" {
		t.Fatalf("intent metadata: %+v", listing.Entries)
	}
}
