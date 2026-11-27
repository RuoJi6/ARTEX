package agent

import (
	"github.com/Autumn-27/artex/internal/webfetch"
	"github.com/Autumn-27/norma/agentcore"
	actool "github.com/Autumn-27/norma/tool"
)

// newAgentSession installs ARTEX's resource-guarded Bash tool and configurable
// WebFetch before the SDK builds the registry, so every agent role gets the
// same memory/timeout guards and proxy/TLS settings.
func newAgentSession(opts agentcore.Options) *agentcore.Session {
	if opts.Tools == nil {
		opts.Tools = guardedDefaultTools()
	} else if opts.EnableWebFetch {
		opts.Tools = append([]actool.CoreTool{}, opts.Tools...)
	}
	if opts.EnableWebFetch {
		opts.EnableWebFetch = false
		opts.Tools = append(opts.Tools, webfetch.New(actool.WebFetchConfig{
			Proxy:       opts.WebFetchProxy,
			CACert:      opts.WebFetchCACert,
			InsecureTLS: opts.WebFetchInsecureTLS,
		}))
	}
	return agentcore.NewSession(opts)
}
