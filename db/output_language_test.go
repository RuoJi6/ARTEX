package db

import "testing"

func TestNormalizeOutputLanguage(t *testing.T) {
	cases := map[string]string{"en": "en", "EN": "en", "zh": "zh", "": "zh", "en-US": "zh", "ja": "zh"}
	for in, want := range cases {
		if got := NormalizeOutputLanguage(in); got != want {
			t.Errorf("NormalizeOutputLanguage(%q) = %q, want %q", in, got, want)
		}
	}
}

// CreateTaskWithOptions must return the stored language on the *Task itself: the
// manager caches and launches that struct without re-reading Postgres. Opening via
// Open() alone (no EnsureLLMRecordsTable) also proves the column comes from
// schema.sql.
func TestCreateTaskWithOptionsReturnsOutputLanguage(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	t.Cleanup(func() { _ = d.Close() })
	for in, want := range map[string]string{"en": "en", "": "zh", "fr": "zh"} {
		task, err := d.CreateTaskWithOptions("output language "+want, "goal", TaskCreateOptions{OutputLanguage: in})
		if err != nil {
			t.Fatal(err)
		}
		if task.OutputLanguage != want {
			t.Errorf("CreateTaskWithOptions(%q).OutputLanguage = %q, want %q", in, task.OutputLanguage, want)
		}
		stored, err := d.GetTask(task.ID)
		if err != nil {
			t.Fatal(err)
		}
		if stored.OutputLanguage != want {
			t.Errorf("stored OutputLanguage for %q = %q, want %q", in, stored.OutputLanguage, want)
		}
	}
}
