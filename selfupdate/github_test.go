package selfupdate

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type releaseTransport func(*http.Request) (*http.Response, error)

func (f releaseTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestFetchLatestUsesForkRelease(t *testing.T) {
	client := &http.Client{Transport: releaseTransport(func(r *http.Request) (*http.Response, error) {
		if got := r.URL.String(); got != "https://api.github.com/repos/RuoJi6/ARTEX/releases/latest" {
			t.Fatalf("unexpected update source: %s", got)
		}
		if r.Method != http.MethodGet || r.Header.Get("Accept") != "application/vnd.github+json" {
			t.Fatalf("invalid GitHub request: %s %v", r.Method, r.Header)
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{
			"tag_name":"v0.3.16",
			"assets":[
				{"name":"artex-0.3.16-linux-arm64.zip","browser_download_url":"https://github.com/RuoJi6/ARTEX/releases/download/v0.3.16/artex-0.3.16-linux-arm64.zip"},
				{"name":"SHA256SUMS","browser_download_url":"https://github.com/RuoJi6/ARTEX/releases/download/v0.3.16/SHA256SUMS"}
			]
		}`))}, nil
	})}
	rel, err := FetchLatest(context.Background(), client)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{AssetName(rel.TagName, "linux", "arm64"), sumsAsset} {
		asset, ok := rel.FindAsset(name)
		if !ok {
			t.Fatalf("missing release asset %s", name)
		}
		body, err := get(context.Background(), &http.Client{Transport: releaseTransport(func(r *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader("asset"))}, nil
		})}, asset.URL)
		if err != nil {
			t.Fatalf("fork asset URL rejected: %v", err)
		}
		body.Close()
	}
}

func TestFetchLatestMissingRelease(t *testing.T) {
	client := &http.Client{Transport: releaseTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader("{}"))}, nil
	})}
	_, err := FetchLatest(context.Background(), client)
	if err == nil || !strings.Contains(err.Error(), "RuoJi6/ARTEX") || !strings.Contains(err.Error(), "不可访问或尚未发布") {
		t.Fatalf("unexpected missing-release error: %v", err)
	}
}

func TestUpdateUserAgent(t *testing.T) {
	for _, tc := range []struct{ env, want string }{
		{"", ""},
		{"Captured-UA/1.0", "Captured-UA/1.0"},
	} {
		t.Run(tc.env, func(t *testing.T) {
			t.Setenv("ARTEX_HTTP_USER_AGENT", tc.env)
			calls := 0
			client := &http.Client{Transport: releaseTransport(func(req *http.Request) (*http.Response, error) {
				calls++
				if got := req.UserAgent(); tc.want == "" && !strings.HasPrefix(got, "Mozilla/5.0 ") {
					t.Errorf("random UA missing: %q", got)
				} else if tc.want != "" && got != tc.want {
					t.Errorf("User-Agent = %q, want %q", got, tc.want)
				}
				body := `{"tag_name":"v0.3.17"}`
				return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body))}, nil
			})}
			if _, err := FetchLatest(context.Background(), client); err != nil {
				t.Fatal(err)
			}
			for _, name := range []string{"SHA256SUMS", "artex.zip"} {
				body, err := get(context.Background(), client, "https://github.com/RuoJi6/ARTEX/releases/download/v0.3.17/"+name)
				if err != nil {
					t.Fatal(err)
				}
				body.Close()
			}
			if calls != 3 {
				t.Fatalf("calls = %d, want 3", calls)
			}
		})
	}
}
