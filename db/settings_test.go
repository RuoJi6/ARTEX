package db

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestSetSettingsAtomic(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v)", err)
	}
	defer d.Close()
	prefix := fmt.Sprintf("test.atomic_settings.%d", time.Now().UnixNano())
	defer func() { _, _ = d.Exec(`DELETE FROM settings WHERE key LIKE $1`, prefix+".%") }()
	values := map[string]string{prefix + ".worker_pools": "[]", prefix + ".workers": "3"}
	if err := d.SetSettingsAtomic(context.Background(), values); err != nil {
		t.Fatal(err)
	}
	for key, want := range values {
		got, ok, err := d.GetSetting(key)
		if err != nil || !ok || got != want {
			t.Fatalf("key %q: value=%q ok=%v err=%v, want %q", key, got, ok, err, want)
		}
	}
}
