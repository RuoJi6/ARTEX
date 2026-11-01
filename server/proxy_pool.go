package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Autumn-27/artex/traffic"
)

const (
	settingProxyPool             = "proxy_pool_entries"
	settingProxyPoolActive       = "proxy_pool_active_id"
	settingProxyRotateTimed      = "proxy_rotate_timed_enabled"
	settingProxyRotateInterval   = "proxy_rotate_interval_seconds"
	settingProxyRotateFailure    = "proxy_rotate_on_failure"
	settingProxyRotateStrategy   = "proxy_rotate_strategy"
	settingProxyHealthThreshold  = "proxy_health_fail_threshold"
	settingProxyHealthCooldown   = "proxy_health_cooldown_seconds"
	settingProxyHealthInterval   = "proxy_health_check_interval_seconds"
	defaultProxyRotateInterval   = 30
	minProxyRotateInterval       = 3
	defaultProxyHealthThreshold  = 3
	defaultProxyHealthCooldown   = 60
	defaultProxyHealthInterval   = 30
	proxyPoolProbeTimeout        = 10 * time.Second
	proxyPoolMaxProbeConcurrency = 4
)

// ProxyPoolEntry is the public shape. URL is always masked in API responses.
type ProxyPoolEntry struct {
	ID                  string    `json:"id"`
	URL                 string    `json:"url"`
	Name                string    `json:"name,omitempty"`
	Remark              string    `json:"remark,omitempty"`
	Enabled             bool      `json:"enabled"`
	EgressIP            string    `json:"egress_ip,omitempty"`
	LatencyMS           int64     `json:"latency_ms,omitempty"`
	LastError           string    `json:"last_error,omitempty"`
	LastCheckedAt       time.Time `json:"last_checked_at,omitempty"`
	ConsecutiveFailures int       `json:"consecutive_failures"`
	Health              string    `json:"health"`
}

type proxyPoolEntry struct {
	ProxyPoolEntry
	RawURL string `json:"raw_url"`
}

type ProxySwitchLog struct {
	At     time.Time `json:"at"`
	From   string    `json:"from"`
	To     string    `json:"to"`
	Reason string    `json:"reason"`
}

type proxyPoolPersist struct {
	Entries []proxyPoolEntry `json:"entries"`
	Active  string           `json:"active"`
}

type ProxyImportError struct {
	Line  int    `json:"line"`
	Input string `json:"input"`
	Error string `json:"error"`
}

// ParseProxyBatch accepts one proxy URL per line. Optional name and remark may
// follow as URL|name|remark. Duplicates are reported once and skipped.
func ParseProxyBatch(raw string) ([]ProxyPoolEntry, []ProxyImportError) {
	var out []ProxyPoolEntry
	var errs []ProxyImportError
	seen := map[string]bool{}
	for n, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "|", 3)
		rawURL := strings.TrimSpace(parts[0])
		u, err := traffic.ValidateProxyURL(rawURL)
		if err != nil {
			errs = append(errs, ProxyImportError{Line: n + 1, Input: maskSecrets(line), Error: maskSecrets(err.Error())})
			continue
		}
		key := proxyURLKey(u)
		if seen[key] {
			errs = append(errs, ProxyImportError{Line: n + 1, Input: maskSecrets(line), Error: "重复代理，已跳过"})
			continue
		}
		seen[key] = true
		name, remark := "", ""
		if len(parts) > 1 {
			name = strings.TrimSpace(parts[1])
		}
		if len(parts) > 2 {
			remark = strings.TrimSpace(parts[2])
		}
		out = append(out, ProxyPoolEntry{ID: fmt.Sprintf("proxy-%d-%d", time.Now().UnixNano(), n+1), URL: rawURL, Name: name, Remark: remark, Enabled: true, Health: "unhealthy-cooling"})
	}
	return out, errs
}

func proxyURLKey(u *url.URL) string {
	if u == nil {
		return ""
	}
	v := *u
	v.Host = strings.ToLower(v.Host)
	v.Scheme = strings.ToLower(v.Scheme)
	return v.String()
}

func proxyURLKeyRaw(raw string) string {
	u, err := traffic.ValidateProxyURL(raw)
	if err != nil {
		return strings.ToLower(strings.TrimSpace(raw))
	}
	return proxyURLKey(u)
}

type proxyPoolState struct {
	mu         sync.Mutex
	entries    []proxyPoolEntry
	active     string
	logs       []ProxySwitchLog
	lastTimed  time.Time
	lastHealth time.Time
}

func (m *Manager) initProxyPool() {
	m.proxyPool = &proxyPoolState{}
	if raw, ok, _ := m.pg.GetSetting(settingProxyPool); ok && strings.TrimSpace(raw) != "" {
		var p proxyPoolPersist
		if json.Unmarshal([]byte(raw), &p) == nil {
			m.proxyPool.entries, m.proxyPool.active = p.Entries, p.Active
		}
	}
	if m.proxyPool.active == "" {
		if v, ok, _ := m.pg.GetSetting(settingProxyPoolActive); ok {
			m.proxyPool.active = strings.TrimSpace(v)
		}
	}
	if len(m.proxyPool.entries) == 0 && strings.TrimSpace(m.globalProxy) != "" {
		m.proxyPool.entries = []proxyPoolEntry{{ProxyPoolEntry: ProxyPoolEntry{ID: "proxy-legacy", URL: maskSecrets(m.globalProxy), Enabled: true, Health: "healthy"}, RawURL: m.globalProxy}}
		m.proxyPool.active = "proxy-legacy"
		_ = m.persistProxyPoolLocked()
	}
	if m.proxyPool.active != "" {
		for _, e := range m.proxyPool.entries {
			if e.ID == m.proxyPool.active {
				m.globalProxy = e.RawURL
				break
			}
		}
	}
	m.proxyPoolConfigured.Store(len(m.proxyPool.entries) > 0)
}

func (m *Manager) persistProxyPoolLocked() error {
	if m.pg == nil {
		return nil
	}
	b, err := json.Marshal(proxyPoolPersist{Entries: m.proxyPool.entries, Active: m.proxyPool.active})
	if err != nil {
		return err
	}
	return m.pg.SetSetting(settingProxyPool, string(b))
}

func (m *Manager) ProxyPoolSnapshot() ([]ProxyPoolEntry, string, []ProxySwitchLog) {
	if m.proxyPool == nil {
		return nil, "", nil
	}
	m.proxyPool.mu.Lock()
	defer m.proxyPool.mu.Unlock()
	entries := make([]ProxyPoolEntry, 0, len(m.proxyPool.entries))
	for _, e := range m.proxyPool.entries {
		p := e.ProxyPoolEntry
		p.URL = maskSecrets(e.RawURL)
		p.LastError = maskSecrets(p.LastError)
		if !p.Enabled {
			p.Health = "disabled"
		}
		entries = append(entries, p)
	}
	logs := append([]ProxySwitchLog(nil), m.proxyPool.logs...)
	for i := range logs {
		logs[i].From, logs[i].To = maskSecrets(logs[i].From), maskSecrets(logs[i].To)
	}
	return entries, m.proxyPool.active, logs
}

func (m *Manager) ActiveProxy() string { return m.GlobalProxy() }

func (m *Manager) proxyPoolEntries() []proxyPoolEntry {
	if m.proxyPool == nil {
		return nil
	}
	m.proxyPool.mu.Lock()
	defer m.proxyPool.mu.Unlock()
	return append([]proxyPoolEntry(nil), m.proxyPool.entries...)
}

func (m *Manager) setProxyPoolEntries(entries []proxyPoolEntry, active string) error {
	if m.proxyPool == nil {
		m.proxyPool = &proxyPoolState{}
	}
	m.proxyPool.mu.Lock()
	defer m.proxyPool.mu.Unlock()
	m.proxyPool.entries, m.proxyPool.active = entries, active
	m.proxyPoolConfigured.Store(len(entries) > 0)
	if err := m.persistProxyPoolLocked(); err != nil {
		return err
	}
	if active == "" {
		for _, e := range entries {
			if e.Enabled && e.Health == "healthy" {
				return m.applyActiveProxyLocked(e.ID, "reconnect")
			}
		}
		return nil
	}
	for _, e := range entries {
		if e.ID == active && e.Enabled && e.Health == "healthy" {
			return m.applyActiveProxyLocked(active, "manual")
		}
	}
	return nil
}

func (m *Manager) applyActiveProxyLocked(id, reason string) error {
	var next string
	for _, e := range m.proxyPool.entries {
		if e.ID == id && e.Enabled && e.Health == "healthy" {
			next = e.RawURL
			break
		}
	}
	if id == "" {
		next = ""
	}
	if id != "" && next == "" {
		return errors.New("代理未启用或不健康")
	}
	m.mu.RLock()
	from := m.globalProxy
	m.mu.RUnlock()
	if m.traffic != nil {
		if err := m.traffic.SetUpstreamProxy(next); err != nil {
			return err
		}
	}
	m.mu.Lock()
	m.globalProxy = next
	m.mu.Unlock()
	m.proxyPool.active = id
	if m.pg != nil {
		_ = m.pg.SetSetting(settingGlobalProxy, next)
		_ = m.pg.SetSetting(settingProxyPoolActive, id)
	}
	if from != next {
		m.proxyPool.logs = append(m.proxyPool.logs, ProxySwitchLog{At: time.Now(), From: maskSecrets(from), To: maskSecrets(next), Reason: reason})
		if len(m.proxyPool.logs) > 20 {
			m.proxyPool.logs = m.proxyPool.logs[len(m.proxyPool.logs)-20:]
		}
	}
	// Browser MCP reads the current capture/upstream route on each reconciliation.
	if m.pg != nil {
		m.syncBrowserMCPProxy()
	}
	return m.persistProxyPoolLocked()
}

func (m *Manager) selectHealthyLocked(exclude string) string {
	strategy := "sequential"
	if m.pg != nil {
		if v, ok, _ := m.pg.GetSetting(settingProxyRotateStrategy); ok && v == "random" {
			strategy = v
		}
	}
	pool := make([]string, 0)
	for _, e := range m.proxyPool.entries {
		if e.Enabled && e.Health == "healthy" && e.ID != exclude {
			pool = append(pool, e.ID)
		}
	}
	if len(pool) == 0 && exclude != "" {
		for _, e := range m.proxyPool.entries {
			if e.Enabled && e.Health == "healthy" {
				pool = append(pool, e.ID)
			}
		}
	}
	if len(pool) == 0 {
		return ""
	}
	if strategy == "random" {
		return pool[rand.Intn(len(pool))]
	}
	start := 0
	for i, e := range m.proxyPool.entries {
		if e.ID == exclude {
			start = i + 1
			break
		}
	}
	for n := 0; n < len(m.proxyPool.entries); n++ {
		e := m.proxyPool.entries[(start+n)%len(m.proxyPool.entries)]
		if e.Enabled && e.Health == "healthy" && e.ID != exclude {
			return e.ID
		}
	}
	return pool[0]
}

func (m *Manager) rotateProxy(reason string) bool {
	if m.proxyPool == nil {
		return false
	}
	m.proxyPool.mu.Lock()
	defer m.proxyPool.mu.Unlock()
	id := m.selectHealthyLocked(m.proxyPool.active)
	if id == "" || id == m.proxyPool.active {
		return false
	}
	return m.applyActiveProxyLocked(id, reason) == nil
}

func (m *Manager) markProxyProbe(id string, res egressProbeResult) {
	if m.proxyPool == nil {
		return
	}
	m.proxyPool.mu.Lock()
	defer m.proxyPool.mu.Unlock()
	m.markProxyProbeLocked(id, res)
}

func (m *Manager) markProxyProbeLocked(id string, res egressProbeResult) {
	for i := range m.proxyPool.entries {
		e := &m.proxyPool.entries[i]
		if e.ID != id {
			continue
		}
		e.LastCheckedAt, e.LatencyMS, e.EgressIP = time.Now(), res.LatencyMS, res.ExitIP
		if res.OK {
			e.ConsecutiveFailures, e.LastError, e.Health = 0, "", "healthy"
		} else {
			e.ConsecutiveFailures++
			e.LastError = maskSecrets(res.Error)
			threshold := proxyIntSetting(m.pg, settingProxyHealthThreshold, defaultProxyHealthThreshold)
			if e.ConsecutiveFailures >= threshold {
				e.Health = "unhealthy-cooling"
			}
		}
		_ = m.persistProxyPoolLocked()
		return
	}
}

func proxyIntSetting(pg interface {
	GetSetting(string) (string, bool, error)
}, key string, def int) int {
	if pg == nil {
		return def
	}
	if v, ok, _ := pg.GetSetting(key); ok {
		var n int
		if _, err := fmt.Sscanf(strings.TrimSpace(v), "%d", &n); err == nil && n > 0 {
			return n
		}
	}
	return def
}

func (m *Manager) proxyHealthConfig() (threshold int, cooldown, interval time.Duration) {
	if m.pg == nil {
		return defaultProxyHealthThreshold, defaultProxyHealthCooldown * time.Second, defaultProxyHealthInterval * time.Second
	}
	return proxyIntSetting(m.pg, settingProxyHealthThreshold, defaultProxyHealthThreshold), time.Duration(proxyIntSetting(m.pg, settingProxyHealthCooldown, defaultProxyHealthCooldown)) * time.Second, time.Duration(proxyIntSetting(m.pg, settingProxyHealthInterval, defaultProxyHealthInterval)) * time.Second
}

func (m *Manager) SetProxyPoolSettings(timed bool, interval int, onFailure bool, strategy string, threshold, cooldown, healthInterval int) error {
	if interval < minProxyRotateInterval {
		return fmt.Errorf("定时轮换间隔不能小于 %d 秒", minProxyRotateInterval)
	}
	if strategy != "sequential" && strategy != "random" {
		return errors.New("proxy_rotate_strategy 必须是 sequential 或 random")
	}
	if threshold < 1 || cooldown < 1 || healthInterval < 1 {
		return errors.New("健康检查参数必须大于 0")
	}
	return m.pg.SetSettingsAtomic(context.Background(), map[string]string{settingProxyRotateTimed: fmt.Sprint(timed), settingProxyRotateInterval: fmt.Sprint(interval), settingProxyRotateFailure: fmt.Sprint(onFailure), settingProxyRotateStrategy: strategy, settingProxyHealthThreshold: fmt.Sprint(threshold), settingProxyHealthCooldown: fmt.Sprint(cooldown), settingProxyHealthInterval: fmt.Sprint(healthInterval)})
}

func (m *Manager) proxyRotateConfig() (bool, time.Duration, bool, string) {
	if m.pg == nil {
		return false, defaultProxyRotateInterval * time.Second, false, "sequential"
	}
	return m.pg.GetBool(settingProxyRotateTimed, false), time.Duration(proxyIntSetting(m.pg, settingProxyRotateInterval, defaultProxyRotateInterval)) * time.Second, m.pg.GetBool(settingProxyRotateFailure, false), func() string {
		v, ok, _ := m.pg.GetSetting(settingProxyRotateStrategy)
		if ok && v == "random" {
			return v
		}
		return "sequential"
	}()
}

func (s *Server) runProxyPoolSupervisor(ctx context.Context) {
	for {
		_, rotateInterval, _, _ := s.m.proxyRotateConfig()
		_, _, healthInterval := s.m.proxyHealthConfig()
		if rotateInterval <= 0 {
			rotateInterval = defaultProxyRotateInterval * time.Second
		}
		if healthInterval <= 0 {
			healthInterval = defaultProxyHealthInterval * time.Second
		}
		d := healthInterval
		if timed, _, _, _ := s.m.proxyRotateConfig(); timed && rotateInterval < d {
			d = rotateInterval
		}
		if d <= 0 {
			d = time.Second
		}
		t := time.NewTimer(d)
		select {
		case <-ctx.Done():
			if !t.Stop() {
				select {
				case <-t.C:
				default:
				}
			}
			return
		case <-t.C:
			s.proxyPoolTick()
		case <-s.proxyPoolWake:
			if !t.Stop() {
				select {
				case <-t.C:
				default:
				}
			}
			s.proxyPoolTick()
		}
	}
}

func (s *Server) proxyPoolTick() {
	if s == nil {
		return
	}
	s.proxyPoolTickMu.Lock()
	defer s.proxyPoolTickMu.Unlock()
	s.proxyPoolTickLocked(false)
}

func (s *Server) proxyPoolTickLocked(forceHealth bool) {
	if s.m == nil || s.m.proxyPool == nil {
		return
	}
	now := time.Now()
	timed, rotateInterval, _, _ := s.m.proxyRotateConfig()
	if timed {
		s.m.proxyPool.mu.Lock()
		due := s.m.proxyPool.lastTimed.IsZero() || now.Sub(s.m.proxyPool.lastTimed) >= rotateInterval
		if due {
			s.m.proxyPool.lastTimed = now
		}
		s.m.proxyPool.mu.Unlock()
		if due {
			_ = s.m.rotateProxy("timed")
		}
	}
	threshold, cooldown, healthInterval := s.m.proxyHealthConfig()
	s.m.proxyPool.mu.Lock()
	healthDue := s.m.proxyPool.lastHealth.IsZero() || now.Sub(s.m.proxyPool.lastHealth) >= healthInterval
	if healthDue {
		s.m.proxyPool.lastHealth = now
	}
	s.m.proxyPool.mu.Unlock()
	if !healthDue && !forceHealth {
		s.reconcileProxyPoolAfterProbe()
		return
	}
	entries := s.m.proxyPoolEntries()
	sem := s.proxyPoolProbeSem
	if sem == nil {
		sem = make(chan struct{}, proxyPoolMaxProbeConcurrency)
	}
	var wg sync.WaitGroup
	for _, e := range entries {
		if !e.Enabled {
			continue
		}
		if !forceHealth && e.Health == "unhealthy-cooling" && e.ConsecutiveFailures >= threshold && !e.LastCheckedAt.IsZero() && now.Sub(e.LastCheckedAt) < cooldown {
			continue
		}
		e := e
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
			case <-s.ctx.Done():
				return
			}
			defer func() { <-sem }()
			res := s.runProxyProbe(s.ctx, e.RawURL, "", defaultEgressProbes, proxyPoolProbeTimeout)
			s.m.markProxyProbe(e.ID, res)
		}()
	}
	wg.Wait()
	s.reconcileProxyPoolAfterProbe()
}

func (s *Server) reconcileProxyPoolAfterProbe() {
	entries := s.m.proxyPoolEntries()
	activeID := s.m.proxyPoolActiveID()
	activeHealthy := false
	for _, e := range entries {
		if e.ID == activeID && e.Enabled && e.Health == "healthy" {
			activeHealthy = true
			break
		}
	}
	if activeHealthy {
		s.proxyReconnectSuccess()
		return
	}
	s.m.proxyPool.mu.Lock()
	id := s.m.selectHealthyLocked(activeID)
	var err error
	if id != "" {
		err = s.m.applyActiveProxyLocked(id, "reconnect")
	}
	s.m.proxyPool.mu.Unlock()
	if err == nil && id != "" {
		s.proxyReconnectSuccess()
		return
	}
	if err != nil {
		s.pauseAllProxyTasks(err)
		return
	}
	if id == "" && (activeID != "" || strings.TrimSpace(s.m.GlobalProxy()) != "") {
		s.pauseAllProxyTasks(errors.New("代理池暂无健康成员"))
	}
}

func (m *Manager) activateProxyID(id, reason string) error {
	if m.proxyPool == nil {
		return errors.New("代理池未初始化")
	}
	m.proxyPool.mu.Lock()
	defer m.proxyPool.mu.Unlock()
	if err := m.applyActiveProxyLocked(id, reason); err != nil {
		return err
	}
	return nil
}

func (s *Server) handleProxyPoolFailure(cause error) bool {
	if s == nil || s.m == nil || s.m.proxyPool == nil || !isGlobalProxyDialFailure(cause) {
		return false
	}
	cur := strings.TrimSpace(s.m.GlobalProxy())
	if cur == "" {
		return false
	}
	res := s.runProxyProbe(s.ctx, cur, "", defaultEgressProbes, proxyPoolProbeTimeout)
	if res.OK {
		return false
	}
	_, _, onFailure, _ := s.m.proxyRotateConfig()
	s.proxyPoolTickMu.Lock()
	defer s.proxyPoolTickMu.Unlock()
	s.m.proxyPool.mu.Lock()
	defer s.m.proxyPool.mu.Unlock()
	if s.m.GlobalProxy() != cur {
		return false
	}
	active := s.m.proxyPool.active
	for _, e := range s.m.proxyPool.entries {
		if e.ID == active && e.RawURL == cur {
			s.m.markProxyProbeLocked(e.ID, res)
			break
		}
	}
	if onFailure {
		if id := s.m.selectHealthyLocked(active); id != "" && id != active {
			if err := s.m.applyActiveProxyLocked(id, "failure"); err == nil {
				return true
			}
		}
	}
	select {
	case s.proxyPoolWake <- struct{}{}:
	default:
	}
	return false
}

func (s *Server) pauseAllProxyTasks(cause error) {
	for _, t := range s.m.List() {
		st := t.lifecycleSnapshot()
		if isTerminalStatus(st.Status) || st.Paused || s.engine.IsDeleting(t.ID) {
			continue
		}
		s.pauseProxyTask(t.ID, cause)
	}
}

func (s *Server) getProxyPool(w http.ResponseWriter, r *http.Request) {
	entries, active, logs := s.m.ProxyPoolSnapshot()
	timed, interval, onFailure, strategy := s.m.proxyRotateConfig()
	threshold, cooldown, healthInterval := s.m.proxyHealthConfig()
	writeJSON(w, 200, map[string]any{"entries": entries, "active_id": active, "active_proxy": maskSecrets(s.m.GlobalProxy()), "switch_log": logs, "timed_enabled": timed, "interval_seconds": int(interval / time.Second), "on_failure": onFailure, "strategy": strategy, "health_fail_threshold": threshold, "health_cooldown_seconds": int(cooldown / time.Second), "health_check_interval_seconds": int(healthInterval / time.Second)})
}

func (s *Server) importProxyPool(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Text           string  `json:"text"`
		TimedEnabled   *bool   `json:"timed_enabled"`
		Interval       *int    `json:"interval_seconds"`
		OnFailure      *bool   `json:"on_failure"`
		Strategy       *string `json:"strategy"`
		Threshold      *int    `json:"health_fail_threshold"`
		Cooldown       *int    `json:"health_cooldown_seconds"`
		HealthInterval *int    `json:"health_check_interval_seconds"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	parsed, errs := ParseProxyBatch(req.Text)
	entries := s.m.proxyPoolEntries()
	seen := map[string]bool{}
	for _, e := range entries {
		seen[proxyURLKeyRaw(e.RawURL)] = true
	}
	for _, p := range parsed {
		key := proxyURLKeyRaw(p.URL)
		if seen[key] {
			line := 0
			if i := strings.LastIndex(p.ID, "-"); i >= 0 {
				_, _ = fmt.Sscanf(p.ID[i+1:], "%d", &line)
			}
			errs = append(errs, ProxyImportError{Line: line, Input: maskSecrets(p.URL), Error: "重复代理，已跳过"})
			continue
		}
		u, _ := traffic.ValidateProxyURL(p.URL)
		entries = append(entries, proxyPoolEntry{ProxyPoolEntry: p, RawURL: u.String()})
		seen[proxyURLKey(u)] = true
	}
	active := s.m.proxyPoolActiveID()
	if active != "" {
		foundActive := false
		for _, e := range entries {
			if e.ID == active {
				foundActive = true
				break
			}
		}
		if !foundActive {
			active = ""
		}
	}
	if err := s.m.setProxyPoolEntries(entries, active); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if req.Interval != nil || req.TimedEnabled != nil || req.OnFailure != nil || req.Strategy != nil || req.Threshold != nil || req.Cooldown != nil || req.HealthInterval != nil {
		timed, interval, onFailure, strategy := s.m.proxyRotateConfig()
		threshold, cooldown, healthInterval := s.m.proxyHealthConfig()
		if req.TimedEnabled != nil {
			timed = *req.TimedEnabled
		}
		if req.Interval != nil {
			interval = time.Duration(*req.Interval) * time.Second
		}
		if req.OnFailure != nil {
			onFailure = *req.OnFailure
		}
		if req.Strategy != nil {
			strategy = *req.Strategy
		}
		if req.Threshold != nil {
			threshold = *req.Threshold
		}
		if req.Cooldown != nil {
			cooldown = time.Duration(*req.Cooldown) * time.Second
		}
		if req.HealthInterval != nil {
			healthInterval = time.Duration(*req.HealthInterval) * time.Second
		}
		if err := s.m.SetProxyPoolSettings(timed, int(interval/time.Second), onFailure, strategy, threshold, int(cooldown/time.Second), int(healthInterval/time.Second)); err != nil {
			writeErr(w, 400, err.Error())
			return
		}
		select {
		case s.proxyPoolWake <- struct{}{}:
		default:
		}
	}
	entriesOut, activeOut, logs := s.m.ProxyPoolSnapshot()
	writeJSON(w, 200, map[string]any{"entries": entriesOut, "active_id": activeOut, "switch_log": logs, "errors": errs})
}

func (m *Manager) proxyPoolActiveID() string {
	if m.proxyPool == nil {
		return ""
	}
	m.proxyPool.mu.Lock()
	defer m.proxyPool.mu.Unlock()
	return m.proxyPool.active
}

func mergeMaskedProxyURL(raw, old string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	nu, err := traffic.ValidateProxyURL(raw)
	if err != nil {
		return "", fmt.Errorf("%s", maskSecrets(err.Error()))
	}
	if ou, _ := traffic.ValidateProxyURL(old); ou != nil && nu.User != nil {
		pw, _ := nu.User.Password()
		if strings.Contains(pw, "***") || strings.Contains(pw, "******") {
			if oldpw, ok := ou.User.Password(); ok {
				nu.User = url.UserPassword(nu.User.Username(), oldpw)
			} else {
				nu.User = url.User(nu.User.Username())
			}
		}
	}
	return nu.String(), nil
}

func (s *Server) updateProxyPool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		URL     *string `json:"url"`
		Name    *string `json:"name"`
		Remark  *string `json:"remark"`
		Enabled *bool   `json:"enabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if s.m.proxyPool == nil {
		writeErr(w, 404, "代理池为空")
		return
	}
	needPause := false
	s.m.proxyPool.mu.Lock()
	for i := range s.m.proxyPool.entries {
		e := &s.m.proxyPool.entries[i]
		if e.ID != id {
			continue
		}
		oldRaw := e.RawURL
		if req.URL != nil {
			raw, err := mergeMaskedProxyURL(*req.URL, oldRaw)
			if err != nil {
				s.m.proxyPool.mu.Unlock()
				writeErr(w, 400, err.Error())
				return
			}
			e.RawURL, e.URL = raw, maskSecrets(raw)
		}
		if req.Name != nil {
			e.Name = strings.TrimSpace(*req.Name)
		}
		if req.Remark != nil {
			e.Remark = strings.TrimSpace(*req.Remark)
		}
		if req.Enabled != nil {
			e.Enabled = *req.Enabled
			if !e.Enabled {
				e.Health = "disabled"
			} else if e.Health == "disabled" {
				e.Health = "healthy"
			}
		}
		if s.m.proxyPool.active == id {
			if req.URL != nil || req.Enabled != nil {
				if e.Enabled && e.RawURL != "" {
					if err := s.m.applyActiveProxyLocked(id, "manual"); err != nil {
						e.RawURL, e.URL = oldRaw, maskSecrets(oldRaw)
						s.m.proxyPool.mu.Unlock()
						writeErr(w, 400, maskSecrets(err.Error()))
						return
					}
				} else if next := s.m.selectHealthyLocked(id); next != "" {
					if err := s.m.applyActiveProxyLocked(next, "manual"); err != nil {
						s.m.proxyPool.mu.Unlock()
						writeErr(w, 400, maskSecrets(err.Error()))
						return
					}
				} else {
					needPause = true
				}
			}
		}
		if err := s.m.persistProxyPoolLocked(); err != nil {
			s.m.proxyPool.mu.Unlock()
			writeErr(w, 500, err.Error())
			return
		}
		out := e.ProxyPoolEntry
		out.URL = maskSecrets(e.RawURL)
		if !out.Enabled {
			out.Health = "disabled"
		}
		s.m.proxyPool.mu.Unlock()
		if needPause {
			s.pauseAllProxyTasks(errors.New("代理池暂无健康成员"))
		}
		writeJSON(w, 200, map[string]any{"entry": out})
		return
	}
	s.m.proxyPool.mu.Unlock()
	writeErr(w, 404, "代理不存在")
}

func (s *Server) deleteProxyPool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.m.proxyPool == nil {
		writeErr(w, 404, "代理不存在")
		return
	}
	needPause := false
	s.m.proxyPool.mu.Lock()
	found := false
	out := s.m.proxyPool.entries[:0]
	for _, e := range s.m.proxyPool.entries {
		if e.ID == id {
			found = true
			continue
		}
		out = append(out, e)
	}
	if !found {
		s.m.proxyPool.mu.Unlock()
		writeErr(w, 404, "代理不存在")
		return
	}
	s.m.proxyPool.entries = out
	s.m.proxyPoolConfigured.Store(len(out) > 0)
	if s.m.proxyPool.active == id {
		if next := s.m.selectHealthyLocked(id); next != "" {
			if err := s.m.applyActiveProxyLocked(next, "manual"); err != nil {
				s.m.proxyPool.mu.Unlock()
				writeErr(w, 500, maskSecrets(err.Error()))
				return
			}
		} else {
			s.m.proxyPool.active = ""
			needPause = true
		}
	}
	if err := s.m.persistProxyPoolLocked(); err != nil {
		s.m.proxyPool.mu.Unlock()
		writeErr(w, 500, err.Error())
		return
	}
	s.m.proxyPool.mu.Unlock()
	if needPause {
		s.pauseAllProxyTasks(errors.New("代理池暂无健康成员"))
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) activateProxyPool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.m.activateProxyID(id, "manual"); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "active_id": id, "active_proxy": maskSecrets(s.m.GlobalProxy())})
}

func (s *Server) testProxyPoolEntry(w http.ResponseWriter, r *http.Request) {
	s.proxyPoolTickMu.Lock()
	defer s.proxyPoolTickMu.Unlock()
	id := r.PathValue("id")
	for _, e := range s.m.proxyPoolEntries() {
		if e.ID == id {
			res := s.runProxyProbe(r.Context(), e.RawURL, "", defaultEgressProbes, proxyPoolProbeTimeout)
			s.m.markProxyProbe(id, res)
			if res.OK {
				s.reconcileProxyPoolAfterProbe()
			}
			writeJSON(w, 200, map[string]any{"ok": res.OK, "result": res})
			return
		}
	}
	writeErr(w, 404, "代理不存在")
}

func (s *Server) testAllProxyPool(w http.ResponseWriter, r *http.Request) {
	s.proxyPoolTickMu.Lock()
	if s.m != nil && s.m.proxyPool != nil {
		s.m.proxyPool.mu.Lock()
		s.m.proxyPool.lastHealth = time.Time{}
		s.m.proxyPool.mu.Unlock()
	}
	s.proxyPoolTickLocked(true)
	s.proxyPoolTickMu.Unlock()
	entries, active, logs := s.m.ProxyPoolSnapshot()
	writeJSON(w, 200, map[string]any{"entries": entries, "active_id": active, "switch_log": logs})
}
