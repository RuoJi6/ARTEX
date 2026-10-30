package server

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/evidence"
	"github.com/Autumn-27/artex/report"
)

type exportedScreenshot struct {
	ReportPath  string `json:"report_path"`
	ArchivePath string `json:"archive_path"`
	SourcePath  string `json:"-"`
	CapturedAt  string `json:"captured_at"`
}

var screenshotMarkdownLink = regexp.MustCompile(`!\[([^\]]*)\]\(([^)\s]+)\)`)

func writeFindingsEvidenceZip(out io.Writer, findings []*db.DBFinding, stage string, now time.Time, workspaceDir string) error {
	zw := zip.NewWriter(out)
	if err := writeFindingsZipEntries(zw, findings, stage, now, workspaceDir); err != nil {
		zw.Close()
		return err
	}
	return zw.Close()
}

func writeFindingsZipEntries(zw *zip.Writer, findings []*db.DBFinding, stage string, now time.Time, workspaceDir string) error {
	store := evidence.New(nil, nil, stage) // private export copy; not subject to GC
	used := map[string]int{}
	evidencePaths := map[string]bool{}
	for _, f := range findings {
		base := report.FindingFilename(f)
		name := base
		if n := used[base]; n > 0 {
			name = fmt.Sprintf("%s-%d.md", strings.TrimSuffix(base, ".md"), n+1)
		}
		used[base]++
		reportText, screenshots, err := prepareFindingExportReport(report.SingleFindingMarkdown(f, now), f.ID, workspaceDir)
		if err != nil {
			return err
		}
		w, err := zw.Create(name)
		if err != nil {
			return err
		}
		if _, err = io.WriteString(w, reportText); err != nil {
			return err
		}
		for _, screenshot := range screenshots {
			if err := copyZipFile(zw, screenshot.ArchivePath, screenshot.SourcePath); err != nil {
				return err
			}
		}
		if len(screenshots) > 0 {
			manifestPath := fmt.Sprintf("screenshots/%d/manifest.json", f.ID)
			w, err := zw.Create(manifestPath)
			if err != nil {
				return err
			}
			if err := json.NewEncoder(w).Encode(map[string]any{"finding_id": f.ID, "screenshots": screenshots}); err != nil {
				return err
			}
		}
		for _, b := range f.TrafficBindings {
			prefix := fmt.Sprintf("evidence/%d/%d/", f.ID, b.ID)
			if evidencePaths[prefix] {
				continue
			}
			evidencePaths[prefix] = true
			w, err := zw.Create(prefix + "manifest.json")
			if err != nil {
				return err
			}
			if err = json.NewEncoder(w).Encode(b); err != nil {
				return err
			}
			for _, side := range []string{"request", "response"} {
				if err := func() error {
					body, _, err := store.OpenBody(b.Snapshot, side)
					if err != nil {
						return err
					}
					defer body.Close()
					w, err := zw.Create(prefix + side + ".http")
					if err != nil {
						return err
					}
					head := b.Snapshot.ReqHead
					if side == "response" {
						head = b.Snapshot.RespHead
					}
					if _, err = io.WriteString(w, strings.TrimRight(head, "\r\n")+"\n\n"); err != nil {
						return err
					}
					if _, err = io.Copy(w, body); err != nil {
						return err
					}
					if _, err = body.Seek(0, io.SeekStart); err != nil {
						return err
					}
					w, err = zw.Create(prefix + side + ".bin")
					if err != nil {
						return err
					}
					_, err = io.Copy(w, body)
					return err
				}(); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func buildFindingsEvidenceZip(path string, findings []*db.DBFinding, stage string, now time.Time, workspaceDir string) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	writeErr := writeFindingsEvidenceZip(f, findings, stage, now, workspaceDir)
	syncErr := f.Sync()
	closeErr := f.Close()
	if err := errors.Join(writeErr, syncErr, closeErr); err != nil {
		return err
	}
	// Re-read every compressed entry to validate the finished ZIP, including CRCs,
	// before the caller starts an HTTP download response.
	archive, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer archive.Close()
	for _, entry := range archive.File {
		r, err := entry.Open()
		if err != nil {
			return err
		}
		_, readErr := io.Copy(io.Discard, r)
		if err := errors.Join(readErr, r.Close()); err != nil {
			return err
		}
	}
	return nil
}

func copyZipFile(zw *zip.Writer, archivePath, sourcePath string) error {
	in, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := zw.Create(archivePath)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	return err
}

func prepareFindingExportReport(markdown string, findingID int64, workspaceDir string) (string, []exportedScreenshot, error) {
	var out strings.Builder
	var screenshots []exportedScreenshot
	seen := map[string]bool{}
	last := 0
	for _, match := range screenshotMarkdownLink.FindAllStringSubmatchIndex(markdown, -1) {
		out.WriteString(markdown[last:match[0]])
		raw := markdown[match[4]:match[5]]
		source, ok := resolveExportScreenshot(workspaceDir, raw)
		if !ok {
			out.WriteString(markdown[match[0]:match[1]])
			last = match[1]
			continue
		}
		archivePath := filepath.ToSlash(fmt.Sprintf("screenshots/%d/%s", findingID, filepath.Base(source)))
		if !seen[archivePath] {
			info, statErr := os.Stat(source)
			if statErr != nil {
				return "", nil, statErr
			}
			screenshots = append(screenshots, exportedScreenshot{ReportPath: raw, ArchivePath: archivePath, SourcePath: source, CapturedAt: info.ModTime().Format("2006-01-02 15:04:05")})
			seen[archivePath] = true
		}
		// Preserve the original alt text and only replace the image URL.
		out.WriteString(markdown[match[0]:match[4]])
		out.WriteString(archivePath)
		out.WriteString(markdown[match[5]:match[1]])
		last = match[1]
	}
	out.WriteString(markdown[last:])
	return out.String(), screenshots, nil
}

func resolveExportScreenshot(workspaceDir, raw string) (string, bool) {
	value := strings.TrimSpace(raw)
	value = strings.TrimPrefix(value, "workspace://")
	value = strings.TrimPrefix(value, "file://")
	if value == "" {
		return "", false
	}
	if filepath.IsAbs(value) {
		candidate := filepath.Clean(value)
		base := filepath.Clean(workspaceDir)
		if candidate != base && !strings.HasPrefix(candidate, base+string(os.PathSeparator)) {
			return "", false
		}
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, true
		}
		return "", false
	}
	rel := filepath.Clean(strings.TrimPrefix(value, "/"))
	const prefix = "findings" + string(os.PathSeparator) + "screenshots" + string(os.PathSeparator)
	if rel == "." || !strings.HasPrefix(rel, prefix) || strings.Contains(rel, ".."+string(os.PathSeparator)) {
		return "", false
	}
	matches, err := filepath.Glob(filepath.Join(filepath.Clean(workspaceDir), "sessions", "*", rel))
	if err != nil || len(matches) == 0 {
		return "", false
	}
	var newest string
	var newestTime int64
	for _, candidate := range matches {
		info, statErr := os.Stat(candidate)
		if statErr != nil || info.IsDir() {
			continue
		}
		if newest == "" || info.ModTime().UnixNano() > newestTime {
			newest, newestTime = candidate, info.ModTime().UnixNano()
		}
	}
	return newest, newest != ""
}
