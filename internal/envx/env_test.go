package envx

import (
	"os"
	"testing"
)

func TestGetPrecedence(t *testing.T) {
	const suffix = "ENVX_TEST"
	const current = "MYSTERYSECURITYTEAM_" + suffix
	t.Setenv(current, "placeholder")
	os.Unsetenv(current)
	t.Setenv("ARTEX_"+suffix, "legacy")
	if got := Get(suffix); got != "legacy" {
		t.Fatalf("legacy fallback = %q", got)
	}
	t.Setenv(current, "new")
	if got := Get(suffix); got != "new" {
		t.Fatalf("new value = %q", got)
	}
	t.Setenv(current, "")
	if got := Get(suffix); got != "" {
		t.Fatalf("explicit empty must override legacy: %q", got)
	}
}
