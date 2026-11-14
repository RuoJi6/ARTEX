package agent

import (
	"github.com/Autumn-27/artex/internal/webfetch"
	"github.com/Autumn-27/norma/agentcore"
	actool "github.com/Autumn-27/norma/tool"
)

// newAgentSession installs the configurable WebFetch before the SDK builds the
// registry, so every agent role gets one tool and the same proxy/TLS settings.
func newAgentSession(opts agentcore.Options) *agentcore.Session {
	if opts.EnableWebFetch {
		opts.EnableWebFetch = false
		if opts.Tools == nil {
			opts.Tools = actool.DefaultTools()
		}
		opts.Tools = append(opts.Tools, webfetch.New(actool.WebFetchConfig{
			Proxy:       opts.WebFetchProxy,
			CACert:      opts.WebFetchCACert,
			InsecureTLS: opts.WebFetchInsecureTLS,
		}))
	}
	return agentcore.NewSession(opts)
}
