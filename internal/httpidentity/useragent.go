// Package httpidentity defines the explicit identity for target-facing HTTP requests.
package httpidentity

import (
	"crypto/rand"
	"io"
	"math/big"
	"net/http"
	"os"
	"strings"
)

// Keep these valid browser UA samples in sync with the standalone Python
// templates. Select whole samples rather than inventing incompatible versions.
var userAgents = [...]string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
	"Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
}

// UserAgent returns the configured printable ASCII value, or a random browser
// sample when unset, empty or malformed. Call once per logical request and reuse
// the selected value for redirects and retries.
func UserAgent() string {
	value := strings.Trim(os.Getenv("ARTEX_HTTP_USER_AGENT"), " ")
	for _, c := range value {
		if c < 32 || c > 126 {
			return randomUserAgent(rand.Reader)
		}
	}
	if value != "" {
		return value
	}
	return randomUserAgent(rand.Reader)
}

func randomUserAgent(source io.Reader) string {
	index, err := rand.Int(source, big.NewInt(int64(len(userAgents))))
	if err != nil {
		return userAgents[0] // Keep a valid nonempty UA if system entropy fails.
	}
	return userAgents[index.Int64()]
}

// Apply selects an identity for this request; net/http preserves it on redirects.
func Apply(req *http.Request) {
	req.Header.Set("User-Agent", UserAgent())
}
