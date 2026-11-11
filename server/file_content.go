package server

import (
	"bytes"
	"io"
	"net/http"
	"net/url"
	"unicode/utf8"
)

func setFileDisposition(w http.ResponseWriter, kind, name string) {
	w.Header().Set("Content-Disposition", kind+"; filename=\""+sanitizeFilename(name)+"\"; filename*=UTF-8''"+url.PathEscape(name))
}

// Limit the read itself, not just the preceding stat: running agents may append
// to a file between stat and read.
func writeTextFile(w http.ResponseWriter, path string, r io.Reader, size int64) {
	result := map[string]any{"path": path, "size": size, "binary": false}
	if size > maxWorkspaceRead {
		result["too_large"], result["binary"] = true, true
		writeJSON(w, 200, result)
		return
	}
	data, err := io.ReadAll(io.LimitReader(r, maxWorkspaceRead+1))
	if err != nil {
		writeErr(w, 500, "taskFiles.failed")
		return
	}
	result["size"] = len(data)
	if len(data) > maxWorkspaceRead {
		result["too_large"], result["binary"] = true, true
	} else if bytes.IndexByte(data, 0) >= 0 || !utf8.Valid(data) {
		result["binary"] = true
	} else {
		result["content"] = string(data)
	}
	writeJSON(w, 200, result)
}
