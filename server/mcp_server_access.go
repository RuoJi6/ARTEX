package server

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"

	"github.com/Autumn-27/artex/db"
)

// 来源白名单：限制「谁」能连 /mcp。它在令牌校验之前生效，是令牌之外的第二道条件——
// 来源地址不在白名单内的请求，即使带着有效令牌也会被拒绝。
//
// 来源地址默认取 TCP 对端地址。部署在反向代理之后时对端永远是代理，这时需要把代理
// 地址登记为「可信代理」，才会改用 X-Forwarded-For 里的地址；不登记就读这个头等于
// 让任何人自报来源，白名单形同虚设。

// maxMCPAccessEntries bounds each list so one request cannot scan an unbounded set.
const maxMCPAccessEntries = 200

// mcpAccessConfig is stored as JSON under db.SettingMCPServerAccess.
type mcpAccessConfig struct {
	// AllowedIPs: IPs or CIDRs allowed to call /mcp. Empty = any source.
	AllowedIPs []string `json:"allowed_ips"`
	// TrustedProxies: reverse proxies whose X-Forwarded-For is believed.
	TrustedProxies []string `json:"trusted_proxies"`
}

// mcpAccess is the parsed form used per request.
type mcpAccess struct {
	allowed []netip.Prefix
	proxies []netip.Prefix
}

// parseMCPAccessList validates IP/CIDR entries and returns them canonicalised
// (deduplicated, input order kept) together with their parsed prefixes.
func parseMCPAccessList(entries []string) ([]string, []netip.Prefix, error) {
	out := make([]string, 0, len(entries))
	prefixes := make([]netip.Prefix, 0, len(entries))
	seen := map[netip.Prefix]bool{}
	for _, raw := range entries {
		entry := strings.TrimSpace(raw)
		if entry == "" {
			continue
		}
		var prefix netip.Prefix
		if strings.Contains(entry, "/") {
			parsed, err := netip.ParsePrefix(entry)
			if err != nil {
				return nil, nil, fmt.Errorf("%q 不是有效的 IP 或 CIDR", entry)
			}
			prefix = netip.PrefixFrom(parsed.Addr().Unmap(), parsed.Bits()).Masked()
			if parsed.Addr().Is4In6() {
				// ::ffff:a.b.c.d/N carries the IPv4 length offset by 96 bits.
				if parsed.Bits() < 96 {
					return nil, nil, fmt.Errorf("%q 不是有效的 IP 或 CIDR", entry)
				}
				prefix = netip.PrefixFrom(parsed.Addr().Unmap(), parsed.Bits()-96).Masked()
			}
		} else {
			addr, err := netip.ParseAddr(entry)
			if err != nil {
				return nil, nil, fmt.Errorf("%q 不是有效的 IP 或 CIDR", entry)
			}
			addr = addr.Unmap().WithZone("")
			prefix = netip.PrefixFrom(addr, addr.BitLen())
		}
		if !prefix.IsValid() {
			return nil, nil, fmt.Errorf("%q 不是有效的 IP 或 CIDR", entry)
		}
		if seen[prefix] {
			continue
		}
		seen[prefix] = true
		prefixes = append(prefixes, prefix)
		if prefix.IsSingleIP() {
			out = append(out, prefix.Addr().String())
		} else {
			out = append(out, prefix.String())
		}
	}
	if len(out) > maxMCPAccessEntries {
		return nil, nil, fmt.Errorf("最多 %d 条", maxMCPAccessEntries)
	}
	return out, prefixes, nil
}

// normalizeMCPAccessConfig validates a configuration and returns its canonical form.
func normalizeMCPAccessConfig(cfg mcpAccessConfig) (mcpAccessConfig, mcpAccess, error) {
	allowed, allowedPrefixes, err := parseMCPAccessList(cfg.AllowedIPs)
	if err != nil {
		return cfg, mcpAccess{}, fmt.Errorf("来源白名单：%w", err)
	}
	proxies, proxyPrefixes, err := parseMCPAccessList(cfg.TrustedProxies)
	if err != nil {
		return cfg, mcpAccess{}, fmt.Errorf("可信代理：%w", err)
	}
	return mcpAccessConfig{AllowedIPs: allowed, TrustedProxies: proxies},
		mcpAccess{allowed: allowedPrefixes, proxies: proxyPrefixes}, nil
}

// loadMCPAccess reads the stored configuration. An unreadable or corrupt
// configuration is an error: callers must refuse the request rather than fall
// back to "no restriction".
func loadMCPAccess(store interface {
	GetSetting(string) (string, bool, error)
}) (mcpAccessConfig, mcpAccess, error) {
	raw, ok, err := store.GetSetting(db.SettingMCPServerAccess)
	if err != nil {
		return mcpAccessConfig{}, mcpAccess{}, err
	}
	var cfg mcpAccessConfig
	if ok && strings.TrimSpace(raw) != "" {
		if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
			return mcpAccessConfig{}, mcpAccess{}, fmt.Errorf("invalid MCP access configuration")
		}
	}
	return normalizeMCPAccessConfig(cfg)
}

func mcpPrefixesContain(prefixes []netip.Prefix, addr netip.Addr) bool {
	for _, prefix := range prefixes {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

func parseMCPAddr(raw string) (netip.Addr, bool) {
	addr, err := netip.ParseAddr(strings.TrimSpace(raw))
	if err != nil {
		return netip.Addr{}, false
	}
	return addr.Unmap().WithZone(""), true
}

// clientAddr resolves the address the request came from. The TCP peer is used
// unless it is a trusted proxy; then X-Forwarded-For is walked from the right,
// skipping further trusted proxies, and the first untrusted hop is the client.
// Entries to the left of that hop are client-supplied and never consulted.
func (a mcpAccess) clientAddr(r *http.Request) (netip.Addr, bool) {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	client, ok := parseMCPAddr(host)
	if !ok {
		return netip.Addr{}, false
	}
	if !mcpPrefixesContain(a.proxies, client) {
		return client, true
	}
	hops := strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		hop, ok := parseMCPAddr(hops[i])
		if !ok {
			// A malformed hop ends the trusted chain; keep the last address we believed.
			break
		}
		client = hop
		if !mcpPrefixesContain(a.proxies, hop) {
			break
		}
	}
	return client, true
}

// permits reports whether the source may call /mcp.
func (a mcpAccess) permits(addr netip.Addr, known bool) bool {
	if len(a.allowed) == 0 {
		return true
	}
	return known && mcpPrefixesContain(a.allowed, addr)
}
