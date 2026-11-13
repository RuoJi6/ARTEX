// Package envx resolves branded environment variables with a legacy fallback.
package envx

import (
	"log"
	"os"
	"sync"
)

var warned sync.Map

// Get reads MYSTERYSECURITYTEAM_<suffix>. An explicitly empty new variable also
// takes precedence. Legacy values are never included in deprecation logs.
func Get(suffix string) string {
	if value, ok := os.LookupEnv("MYSTERYSECURITYTEAM_" + suffix); ok {
		return value
	}
	legacy := "ARTEX_" + suffix
	if value, ok := os.LookupEnv(legacy); ok {
		if _, loaded := warned.LoadOrStore(legacy, true); !loaded {
			log.Printf("[config] %s is deprecated; use MYSTERYSECURITYTEAM_%s", legacy, suffix)
		}
		return value
	}
	return ""
}
