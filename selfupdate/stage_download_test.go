package selfupdate

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"strings"
	"testing"
)

func TestStageDownloadAndVerify(t *testing.T) {
	requireUnix(t)
	var archive bytes.Buffer
	zw := zip.NewWriter(&archive)
	f, err := zw.Create("artex")
	if err != nil {
		t.Fatal(err)
	}
	f.Write([]byte("#!/bin/sh\necho new-version\nexit 0\n"))
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	for _, corrupt := range []bool{false, true} {
		t.Run(fmt.Sprintf("corrupt=%v", corrupt), func(t *testing.T) {
			p := testPaths(t)
			fakeBin(t, p.Current, "old-version", 0)
			name := AssetName("v0.3.21", runtime.GOOS, runtime.GOARCH)
			rel := &Release{TagName: "v0.3.21", Assets: []Asset{
				{Name: name, URL: "https://github.com/" + name, Size: int64(archive.Len())},
				{Name: sumsAsset, URL: "https://github.com/SHA256SUMS"},
			}}
			sum := fmt.Sprintf("%x", sha256.Sum256(archive.Bytes()))
			if corrupt {
				sum = strings.Repeat("0", 64)
			}
			client := &http.Client{Transport: releaseTransport(func(r *http.Request) (*http.Response, error) {
				body := archive.Bytes()
				if strings.HasSuffix(r.URL.Path, sumsAsset) {
					body = []byte(sum + "  " + name + "\n")
				}
				return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(body))}, nil
			})}
			var phases []Phase
			err := stageAt(t.Context(), client, rel, "0.3.20", func(p Phase, _ int, _ string) { phases = append(phases, p) }, p)
			if !strings.Contains(readAll(t, p.Current), "old-version") {
				t.Fatal("running binary changed before bootstrap")
			}
			if corrupt {
				if err == nil || !strings.Contains(err.Error(), "SHA256") {
					t.Fatalf("corrupt archive accepted: %v", err)
				}
				if _, err := os.Stat(p.New); !os.IsNotExist(err) {
					t.Fatal("corrupt binary staged")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if len(phases) == 0 || phases[len(phases)-1] != PhaseStaged {
				t.Fatalf("phases: %v", phases)
			}
			if !strings.Contains(readAll(t, p.New), "new-version") {
				t.Fatal("new binary not staged")
			}
			if m, ok := readMarker(p.Marker); !ok || m.From != "0.3.20" || m.To != "0.3.21" {
				t.Fatalf("invalid rollback marker: %+v", m)
			}
		})
	}
}
