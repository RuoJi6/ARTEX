package selfupdate

import (
	"archive/zip"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestPlatformAssetPrefersNewName(t *testing.T) {
	newName := AssetName("v1.2.3", "linux", "arm64")
	oldName := "artex-1.2.3-linux-arm64.zip"
	r := &Release{TagName: "v1.2.3", Assets: []Asset{{Name: oldName}, {Name: newName}}}
	if a, ok := r.PlatformAsset("linux", "arm64"); !ok || a.Name != newName {
		t.Fatalf("new asset not preferred: %+v %v", a, ok)
	}
	r.Assets = r.Assets[:1]
	if a, ok := r.PlatformAsset("linux", "arm64"); !ok || a.Name != oldName {
		t.Fatalf("legacy fallback failed: %+v %v", a, ok)
	}
	if _, ok := r.PlatformAsset("windows", "amd64"); ok {
		t.Fatal("wrong platform accepted")
	}
}

func TestExtractRenamedAndLegacyBinary(t *testing.T) {
	for _, name := range []string{"mysterysecurityteam", "artex"} {
		t.Run(name, func(t *testing.T) {
			if runtime.GOOS == "windows" {
				name += ".exe"
			}
			dir := t.TempDir()
			archive := filepath.Join(dir, "release.zip")
			f, err := os.Create(archive)
			if err != nil {
				t.Fatal(err)
			}
			zw := zip.NewWriter(f)
			w, err := zw.Create("package/" + name)
			if err != nil {
				t.Fatal(err)
			}
			w.Write([]byte("binary-contents"))
			if err := zw.Close(); err != nil {
				t.Fatal(err)
			}
			if err := f.Close(); err != nil {
				t.Fatal(err)
			}
			dst := filepath.Join(dir, "staged")
			if err := extractBinary(archive, dst); err != nil {
				t.Fatal(err)
			}
			if got := readAll(t, dst); got != "binary-contents" {
				t.Fatalf("binary = %q", got)
			}
		})
	}
}

func TestUpgradeKeepsLegacyExecutableName(t *testing.T) {
	requireUnix(t)
	p := testPaths(t)
	for _, field := range []*string{&p.Current, &p.New, &p.Sum, &p.Old, &p.Marker} {
		*field = strings.Replace(*field, "mysterysecurityteam", "artex", 1)
	}
	fakeBin(t, p.Current, "old-version", 0)
	stage(t, p, "new-version", 0)
	action, _ := applyStaged(p)
	if action != Restart || !strings.Contains(readAll(t, p.Current), "new-version") {
		t.Fatal("legacy executable was not replaced in place")
	}
	if _, err := os.Stat(filepath.Join(p.Dir, "mysterysecurityteam")); !os.IsNotExist(err) {
		t.Fatal("upgrade unexpectedly created a renamed executable")
	}
}
