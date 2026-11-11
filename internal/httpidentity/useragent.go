// Package httpidentity defines the explicit identity for target-facing HTTP requests.
package httpidentity

import (
	"net/http"
	"os"
	"strings"
)

// UserAgent returns the configured value, or an empty string to omit the header.
// Use printable ASCII for consistent behavior across Go and the Python templates.
// Ignore malformed values rather than allowing header injection.
func UserAgent() string {
	value := strings.Trim(os.Getenv("ARTEX_HTTP_USER_AGENT"), " ")
	for _, c := range value {
		if c < 32 || c > 126 {
			return ""
		}
	}
	return value
}

// Apply must set even an empty value: deleting the header makes net/http send
// its own Go-http-client default instead of omitting User-Agent on the wire.
func Apply(req *http.Request) {
	req.Header.Set("User-Agent", UserAgent())
}

// ApplyRequired keeps a nonempty, generic library identity for services that
// require User-Agent (notably the GitHub API), without an ARTEX identifier.
func ApplyRequired(req *http.Request) {
	value := UserAgent()
	if value == "" {
		value = "Go-http-client/1.1"
	}
	req.Header.Set("User-Agent", value)
}
