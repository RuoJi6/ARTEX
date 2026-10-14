package kb

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeSearcher struct {
	hits []Hit
	err  error
}

func (f *fakeSearcher) Search(_ context.Context, _ string, _ int) ([]Hit, error) {
	return f.hits, f.err
}

func TestRegistrySearchSomeTagsSources(t *testing.T) {
	r := NewRegistry()
	r.Add("cve", &fakeSearcher{hits: []Hit{{Title: "a"}}})
	r.Add("internal", &fakeSearcher{hits: []Hit{{Title: "b"}}})
	hits, err := r.SearchSome(context.Background(), "q", 5, nil)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(hits) != 2 || hits[0].Source != "cve" || hits[1].Source != "internal" {
		t.Fatalf("sources not tagged: %+v", hits)
	}
}

func TestRegistrySearchSomeOnlyFilter(t *testing.T) {
	r := NewRegistry()
	r.Add("cve", &fakeSearcher{hits: []Hit{{Title: "a"}}})
	r.Add("internal", &fakeSearcher{hits: []Hit{{Title: "b"}}})
	hits, err := r.SearchSome(context.Background(), "q", 5, []string{"internal"})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(hits) != 1 || hits[0].Source != "internal" {
		t.Fatalf("only filter failed: %+v", hits)
	}
}

func TestRegistryDegradesSingleSourceFailure(t *testing.T) {
	r := NewRegistry()
	r.Add("down", &fakeSearcher{err: errors.New("boom")})
	r.Add("ok", &fakeSearcher{hits: []Hit{{Title: "good"}}})
	hits, err := r.SearchSome(context.Background(), "q", 5, nil)
	if err != nil {
		t.Fatalf("single failure should degrade, got err: %v", err)
	}
	if len(hits) != 1 {
		t.Fatalf("want 1 hit, got %d", len(hits))
	}
}

func TestRegistryAllFailedIsError(t *testing.T) {
	r := NewRegistry()
	r.Add("down", &fakeSearcher{err: errors.New("boom")})
	_, err := r.SearchSome(context.Background(), "q", 5, nil)
	if err == nil {
		t.Fatal("want error when all sources fail")
	}
	if errors.Is(err, ErrNoHit) {
		t.Fatal("all-failed must not be ErrNoHit")
	}
}

func TestRegistryNoHitsIsErrNoHit(t *testing.T) {
	r := NewRegistry()
	r.Add("empty", &fakeSearcher{})
	_, err := r.SearchSome(context.Background(), "q", 5, nil)
	if !errors.Is(err, ErrNoHit) {
		t.Fatalf("want ErrNoHit, got %v", err)
	}
}

func TestDifySearch(t *testing.T) {
	t.Setenv(allowLocalEnv, "1") // 测试走 127.0.0.1，需放行环回
	const respJSON = `{"query":{"content":"jwt"},"records":[
		{"segment":{"id":"s1","content":"jwt bypass","document":{"name":"doc1"}},"score":0.9},
		{"segment":{"id":"s2","content":"low","document":{"name":"doc2"}},"score":0.1}
	]}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/datasets/ds1/retrieve" {
			http.NotFound(w, r)
			return
		}
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Errorf("auth header = %q", got)
		}
		_, _ = w.Write([]byte(respJSON))
	}))
	defer srv.Close()

	s, err := Build("dify", map[string]any{
		"base_url": srv.URL, "api_key": "secret", "dataset_id": "ds1", "min_score": 0.5,
	})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	hits, err := s.Search(context.Background(), "jwt", 5)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(hits) != 1 {
		t.Fatalf("min_score should filter low score, got %d hits", len(hits))
	}
	if hits[0].Content != "jwt bypass" {
		t.Fatalf("unexpected content: %q", hits[0].Content)
	}
}

func TestDifyMissingConfig(t *testing.T) {
	if _, err := Build("dify", map[string]any{"base_url": "http://x"}); err == nil {
		t.Fatal("want error for missing api_key/dataset_id")
	}
}

func TestBuildUnknownType(t *testing.T) {
	if _, err := Build("nonexistent", nil); err == nil {
		t.Fatal("want error for unknown type")
	}
}
