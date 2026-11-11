package server

import (
	"archive/zip"
	"container/heap"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const maxTaskFiles = 2000

type taskFileEntry struct {
	wsEntry
	Symlink     bool   `json:"symlink"`
	IntentID    int64  `json:"intent_id,omitempty"`
	IntentTitle string `json:"intent_title,omitempty"`
	IntentState string `json:"intent_state,omitempty"`
}

type taskFileListing struct {
	Path      string          `json:"path"`
	Entries   []taskFileEntry `json:"entries"`
	Total     int             `json:"total"`
	Size      int64           `json:"size"`
	Truncated bool            `json:"truncated"`
	Missing   bool            `json:"missing"`
}

// Reject nonportable paths as well as traversal, rather than silently cleaning
// them. All actual filesystem access goes through os.Root, including traversal.
func taskFilePath(raw string) (string, error) {
	if raw == "" {
		return ".", nil
	}
	if !fs.ValidPath(raw) || strings.ContainsAny(raw, "\\:\x00") || !filepath.IsLocal(raw) {
		return "", errors.New("invalid path")
	}
	return raw, nil
}

func taskFileError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		writeErr(w, 404, "taskFiles.unavailable")
	case errors.Is(err, fs.ErrPermission):
		writeErr(w, 403, "taskFiles.denied")
	default:
		writeErr(w, 400, "taskFiles.invalidPath")
	}
}

// Open the task root through its parent so a task-root symlink cannot escape
// the workspace. Never hold a task operation lock while reading or streaming.
func (s *Server) openTaskFiles(w http.ResponseWriter, r *http.Request) (*os.Root, *Task, string, bool) {
	id := r.PathValue("id")
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil || n <= 0 || strconv.FormatInt(n, 10) != id {
		writeErr(w, 404, "taskFiles.unavailable")
		return nil, nil, "", false
	}
	t, ok := s.m.Task(id)
	if !ok {
		writeErr(w, 404, "taskFiles.unavailable")
		return nil, nil, "", false
	}
	rel, err := taskFilePath(r.URL.Query().Get("path"))
	if err != nil {
		taskFileError(w, err)
		return nil, nil, "", false
	}
	base, err := os.OpenRoot(s.m.dir)
	if err != nil {
		taskFileError(w, err)
		return nil, nil, "", false
	}
	defer base.Close()
	name := "tasks/" + id
	info, err := base.Lstat(name)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, t, rel, true
	}
	if err != nil {
		taskFileError(w, err)
		return nil, nil, "", false
	}
	if info.Mode()&os.ModeSymlink != 0 {
		taskFileError(w, fs.ErrPermission)
		return nil, nil, "", false
	}
	root, err := base.OpenRoot(name)
	if err != nil {
		taskFileError(w, err)
		return nil, nil, "", false
	}
	return root, t, rel, true
}

func newTaskFileEntry(name string, info fs.FileInfo) taskFileEntry {
	return taskFileEntry{wsEntry: wsEntry{Name: path.Base(name), Path: name, Dir: info.IsDir(), Size: info.Size(), MTime: info.ModTime().UnixMilli()}, Symlink: info.Mode()&os.ModeSymlink != 0}
}

func (s *Server) taskFilesList(w http.ResponseWriter, r *http.Request) {
	root, t, rel, ok := s.openTaskFiles(w, r)
	if !ok {
		return
	}
	out := taskFileListing{Path: rel, Entries: []taskFileEntry{}}
	if rel == "." {
		out.Path = ""
	}
	if root == nil {
		if rel != "." {
			taskFileError(w, fs.ErrNotExist)
			return
		}
		out.Missing = true
		writeJSON(w, 200, out)
		return
	}
	defer root.Close()
	dir, err := root.Open(rel)
	if err != nil {
		taskFileError(w, err)
		return
	}
	defer dir.Close()
	entries, err := dir.ReadDir(-1)
	if err != nil {
		taskFileError(w, err)
		return
	}
	for _, e := range entries {
		info, err := e.Info()
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			taskFileError(w, err)
			return
		}
		entry := newTaskFileEntry(path.Join(rel, e.Name()), info)
		if rel == "." && entry.Dir && strings.HasPrefix(e.Name(), "i") && t.Store != nil {
			id, err := strconv.ParseInt(strings.TrimPrefix(e.Name(), "i"), 10, 64)
			if err == nil {
				node, err := t.Store.GetNode(id)
				if err != nil {
					writeErr(w, 500, "taskFiles.failed")
					return
				}
				if node != nil && node.Kind == "intent" {
					var payload map[string]any
					_ = json.Unmarshal(node.Payload, &payload)
					entry.IntentID, entry.IntentState = id, node.State
					entry.IntentTitle, _ = payload["summary"].(string)
					if entry.IntentTitle == "" {
						entry.IntentTitle, _ = payload["title"].(string)
					}
					if entry.IntentTitle == "" {
						entry.IntentTitle = rawString(node.Payload)
					}
				}
			}
		}
		out.Entries = append(out.Entries, entry)
	}
	sort.Slice(out.Entries, func(i, j int) bool {
		a, b := out.Entries[i], out.Entries[j]
		if a.Dir != b.Dir {
			return a.Dir
		}
		return a.Name < b.Name
	})
	writeJSON(w, 200, out)
}

// A bounded min-heap retains the newest entries over the ENTIRE scan, with a
// deterministic path tie-breaker. Counts and bytes always describe all files.
type recentTaskFiles []taskFileEntry

func newerTaskFile(a, b taskFileEntry) bool {
	return a.MTime > b.MTime || (a.MTime == b.MTime && a.Path < b.Path)
}
func (h recentTaskFiles) Len() int           { return len(h) }
func (h recentTaskFiles) Less(i, j int) bool { return newerTaskFile(h[j], h[i]) }
func (h recentTaskFiles) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *recentTaskFiles) Push(x any)        { *h = append(*h, x.(taskFileEntry)) }
func (h *recentTaskFiles) Pop() any {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[:n-1]
	return x
}

func scanTaskFiles(r *http.Request, root *os.Root) (taskFileListing, error) {
	out := taskFileListing{Entries: []taskFileEntry{}}
	h := recentTaskFiles{}
	err := fs.WalkDir(root.FS(), ".", func(name string, d fs.DirEntry, err error) error {
		if r.Context().Err() != nil {
			return r.Context().Err()
		}
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		entry := newTaskFileEntry(name, info)
		out.Total++
		out.Size += info.Size()
		if len(h) < maxTaskFiles {
			heap.Push(&h, entry)
		} else if newerTaskFile(entry, h[0]) {
			h[0] = entry
			heap.Fix(&h, 0)
		}
		return nil
	})
	sort.Slice(h, func(i, j int) bool { return newerTaskFile(h[i], h[j]) })
	out.Entries = append(out.Entries, h...)
	out.Truncated = out.Total > maxTaskFiles
	return out, err
}

func (s *Server) taskFilesAll(w http.ResponseWriter, r *http.Request) {
	root, _, _, ok := s.openTaskFiles(w, r)
	if !ok {
		return
	}
	if root == nil {
		writeJSON(w, 200, taskFileListing{Entries: []taskFileEntry{}, Missing: true})
		return
	}
	defer root.Close()
	out, err := scanTaskFiles(r, root)
	if err != nil {
		taskFileError(w, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) taskFilesServe(w http.ResponseWriter, r *http.Request) {
	root, _, rel, ok := s.openTaskFiles(w, r)
	if !ok {
		return
	}
	if root == nil {
		taskFileError(w, fs.ErrNotExist)
		return
	}
	defer root.Close()
	// Inspect before opening to avoid blocking on FIFOs and other special files.
	info, err := root.Stat(rel)
	if err != nil {
		taskFileError(w, err)
		return
	}
	if !info.Mode().IsRegular() {
		writeErr(w, 400, "taskFiles.notFile")
		return
	}
	f, err := root.Open(rel)
	if err != nil {
		taskFileError(w, err)
		return
	}
	defer f.Close()
	info, err = f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		writeErr(w, 400, "taskFiles.notFile")
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	switch path.Base(r.URL.Path) {
	case "read":
		writeTextFile(w, rel, f, info.Size())
	case "preview":
		types := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}
		want := types[strings.ToLower(path.Ext(rel))]
		buf := make([]byte, 512)
		n, err := f.Read(buf)
		if err != nil && err != io.EOF {
			taskFileError(w, err)
			return
		}
		if want == "" || http.DetectContentType(buf[:n]) != want {
			writeErr(w, 415, "taskFiles.notImage")
			return
		}
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			taskFileError(w, err)
			return
		}
		w.Header().Set("Content-Type", want)
		setFileDisposition(w, "inline", path.Base(rel))
		http.ServeContent(w, r, path.Base(rel), info.ModTime(), f)
	case "download":
		w.Header().Set("Content-Type", "application/octet-stream")
		setFileDisposition(w, "attachment", path.Base(rel))
		http.ServeContent(w, r, path.Base(rel), info.ModTime(), f)
	}
}

// Each directory gets a nested root; symlinks are skipped and every file is
// opened through the root. Entries are copied directly into the ZIP stream.
func writeTaskFilesZip(r *http.Request, zw *zip.Writer, root *os.Root, prefix string) error {
	d, err := root.Open(".")
	if err != nil {
		return err
	}
	defer d.Close()
	for {
		entries, err := d.ReadDir(128)
		if err != nil && err != io.EOF {
			return err
		}
		for _, e := range entries {
			if err := r.Context().Err(); err != nil {
				return err
			}
			info, err := root.Lstat(e.Name())
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			if err != nil {
				return err
			}
			if info.Mode()&os.ModeSymlink != 0 {
				continue
			}
			name := path.Join(prefix, e.Name())
			// ZIP names must remain relative and portable when extracted on
			// Windows too, even if the producer ran on a Unix filesystem.
			if _, err := taskFilePath(name); err != nil {
				continue
			}
			if info.IsDir() {
				sub, err := root.OpenRoot(e.Name())
				if err != nil {
					return err
				}
				_, err = zw.Create(name + "/")
				if err == nil {
					err = writeTaskFilesZip(r, zw, sub, name)
				}
				sub.Close()
				if err != nil {
					return err
				}
			} else if info.Mode().IsRegular() {
				f, err := root.Open(e.Name())
				if err != nil {
					return err
				}
				header, err := zip.FileInfoHeader(info)
				if err == nil {
					header.Name, header.Method = name, zip.Deflate
					var out io.Writer
					out, err = zw.CreateHeader(header)
					if err == nil {
						_, err = io.Copy(out, f)
					}
				}
				f.Close()
				if err != nil {
					return err
				}
			}
		}
		if err == io.EOF {
			return nil
		}
	}
}

func (s *Server) taskFilesArchive(w http.ResponseWriter, r *http.Request) {
	root, t, rel, ok := s.openTaskFiles(w, r)
	if !ok {
		return
	}
	if root == nil {
		taskFileError(w, fs.ErrNotExist)
		return
	}
	defer root.Close()
	info, err := root.Lstat(rel)
	if err != nil {
		taskFileError(w, err)
		return
	}
	if !info.IsDir() {
		writeErr(w, 400, "taskFiles.notDirectory")
		return
	}
	sub, err := root.OpenRoot(rel)
	if err != nil {
		taskFileError(w, err)
		return
	}
	defer sub.Close()
	name := path.Base(rel)
	if rel == "." {
		name = fmt.Sprintf("task-%s", t.ID)
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	setFileDisposition(w, "attachment", name+".zip")
	if r.Method == http.MethodHead {
		return
	}
	zw := zip.NewWriter(w)
	if err := writeTaskFilesZip(r, zw, sub, ""); err != nil {
		// Never finalize a partial ZIP as a successful download.
		panic(http.ErrAbortHandler)
	}
	if err := zw.Close(); err != nil {
		panic(http.ErrAbortHandler)
	}
}
