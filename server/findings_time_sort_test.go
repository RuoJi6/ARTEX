package server

import (
	"net/url"
	"testing"
)

func TestFindingFilterTimeDirection(t *testing.T) {
	for _, direction := range []string{"", "asc", "desc"} {
		q := url.Values{"task_id": {"9"}, "sort": {"time"}, "time_direction": {direction}, "severity": {"high"}, "q": {"keyword"}}
		f := findingFilterFromQuery(q)
		if f.Sort != "time" || f.TimeDirection != direction || f.TaskID != "9" || f.Severity != "high" || f.Query != "keyword" {
			t.Fatalf("filter lost sorting or search state: %+v", f)
		}
	}
}
