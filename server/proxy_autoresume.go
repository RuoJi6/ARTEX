package server

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Autumn-27/artex/agent"
)

const (
	settingProxyReconnectMax      = "proxy_reconnect_max_attempts"
	settingProxyReconnectInterval = "proxy_reconnect_interval_seconds"
	defaultProxyReconnectMax      = 5
	defaultProxyReconnectInterval = 30

	// proxyConfirmProbeTimeout bounds the confirmation probe. It runs off the
	// model path, so a short budget beats exhaustive coverage.
	proxyConfirmProbeTimeout = 5 * time.Second
	// proxyProbeResultTTL reuses one confirmation result for a short window: an
	// error burst used to spawn one probe per error, saturating the very proxy
	// whose health it was measuring.
	proxyProbeResultTTL = 3 * time.Second
	// proxyPauseCooldown is the minimum gap between two proxy-pause batches, so
	// one outage cannot re-pause every task over and over.
	proxyPauseCooldown = 60 * time.Second
)

// isProxyFailure is used for LLM/planner errors, where the error has no trusted
// indication that it came from the global target proxy. Keep this deliberately
// narrow: generic EOF/reset/refused errors belong to the model_error retry path.
func isProxyFailure(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	for _, part := range []string{"proxyconnect", "proxy connection", "proxy error", "proxy handshake", "socks handshake", "failed to connect to proxy", "connect to proxy"} {
		if strings.Contains(s, part) {
			return true
		}
	}
	return false
}

// proxyUnreachable reports whether err proves the CONFIGURED upstream proxy
// itself could not be reached (or rejected our credentials).
//
// It deliberately excludes target-side failures. A SOCKS5 reply such as
// "connection refused" / "host unreachable" is emitted BY the proxy about the
// TARGET: it proves the proxy is alive and forwarding. Reading those as a proxy
// fault is what paused every task whenever a target merely closed a connection.
//
// The decision walks the error chain instead of matching arbitrary text because
// tool output ("bash: unexpected EOF", a scanner's "socks4://..." line) used to
// satisfy the old substring list and trigger a global pause.
func proxyUnreachable(err error, proxyRaw string) bool {
	if err == nil {
		return false
	}
	proxyAddr := proxyHostPort(proxyRaw)
	for e := err; e != nil; e = errors.Unwrap(e) {
		opErr, ok := e.(*net.OpError)
		if !ok {
			continue
		}
		switch {
		case opErr.Op == "dial":
			// A plain TCP dial to the proxy endpoint itself failed.
			if sameHostPort(opErr.Addr, proxyAddr) {
				return true
			}
		case strings.HasPrefix(opErr.Op, "socks"):
			// x/net's SOCKS5 dialer wraps BOTH "could not reach the proxy" and
			// "the proxy answered with a failure code" in the same Op. Only the
			// inner dial to the proxy address is evidence of a proxy fault; a
			// reply code is evidence of the opposite.
			var inner *net.OpError
			if errors.As(opErr.Err, &inner) && inner.Op == "dial" && sameHostPort(inner.Addr, proxyAddr) {
				return true
			}
		}
	}
	msg := strings.ToLower(err.Error())
	// net/http emits "proxyconnect tcp:" only when a CONNECT through a proxy
	// failed, so the marker itself is proxy-specific evidence.
	if strings.Contains(msg, "proxyconnect") {
		return true
	}
	// 407 means the proxy answered and rejected us: proxy-side, not target-side.
	return strings.Contains(msg, "proxy authentication required")
}

// proxyHostPort extracts host:port from a proxy URL ("" when unparseable).
func proxyHostPort(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Host
}

// sameHostPort compares a dialed address with the configured proxy endpoint.
func sameHostPort(addr net.Addr, hostPort string) bool {
	if addr == nil || hostPort == "" {
		return false
	}
	return strings.EqualFold(addr.String(), hostPort)
}

type proxyReconnectSupervisor struct {
	mu   sync.Mutex
	wake chan struct{}
}

type proxyReconnectGuard struct {
	generation   uint64
	attempt      int
	checkAttempt bool
}

func (s *Server) snapshotProxyReconnectGuards(checkAttempt bool) map[string]proxyReconnectGuard {
	return s.snapshotProxyReconnectGuardsWithExhausted(checkAttempt, false)
}

func (s *Server) snapshotProxyReconnectGuardsWithExhausted(checkAttempt, includeExhausted bool) map[string]proxyReconnectGuard {
	guards := make(map[string]proxyReconnectGuard)
	if s == nil || s.m == nil {
		return guards
	}
	for _, t := range s.m.List() {
		st := t.lifecycleSnapshot()
		if st.PauseReason != "paused_by_proxy" {
			continue
		}
		if st.ReconnectExhausted && !includeExhausted {
			continue
		}
		guards[t.ID] = proxyReconnectGuard{
			generation:   st.ReconnectGeneration,
			attempt:      st.ReconnectAttempt,
			checkAttempt: checkAttempt,
		}
	}
	return guards
}

func proxyReconnectGuardMatches(st taskLifecycleState, guard proxyReconnectGuard) bool {
	return st.PauseReason == "paused_by_proxy" && st.ReconnectGeneration == guard.generation &&
		(!guard.checkAttempt || st.ReconnectAttempt == guard.attempt)
}

func (s *Server) ensureProxySupervisor() {
	s.proxyReconnect.mu.Lock()
	if s.proxyReconnect.wake == nil {
		s.proxyReconnect.wake = make(chan struct{}, 1)
		go s.runProxyReconnect(s.ctx)
	}
	s.proxyReconnect.mu.Unlock()
}

func (s *Server) signalProxySupervisor() {
	s.ensureProxySupervisor()
	select {
	case s.proxyReconnect.wake <- struct{}{}:
	default:
	}
}

func (s *Server) proxyReconnectConfig() (int, time.Duration) {
	max := defaultProxyReconnectMax
	interval := defaultProxyReconnectInterval
	if s == nil || s.m == nil || s.m.pg == nil {
		return max, time.Duration(interval) * time.Second
	}
	if v, ok, _ := s.m.pg.GetSetting(settingProxyReconnectMax); ok {
		if n, err := fmt.Sscanf(strings.TrimSpace(v), "%d", &max); err != nil || n != 1 || max <= 0 {
			max = defaultProxyReconnectMax
		}
	}
	if v, ok, _ := s.m.pg.GetSetting(settingProxyReconnectInterval); ok {
		if n, err := fmt.Sscanf(strings.TrimSpace(v), "%d", &interval); err != nil || n != 1 || interval <= 0 {
			interval = defaultProxyReconnectInterval
		}
	}
	return max, time.Duration(interval) * time.Second
}

func (s *Server) runProxyProbe(ctx context.Context, proxyRaw, caPEMPath string, probes []string, timeout time.Duration) egressProbeResult {
	if s != nil && s.proxyProbe != nil {
		return s.proxyProbe(ctx, proxyRaw, caPEMPath, probes, timeout)
	}
	return probeEgress(ctx, proxyRaw, caPEMPath, probes, timeout)
}

// confirmProxyUnavailable probes the saved global proxy, coalescing bursts.
//
// Exactly one probe runs at a time and its result is shared with every caller
// that arrives meanwhile (and reused for proxyProbeResultTTL afterwards). Before
// this gate every upstream error started its own 10s probe, so a burst saturated
// the very proxy whose health it was measuring and then read the saturation as
// an outage.
func (s *Server) confirmProxyUnavailable(proxyRaw string) egressProbeResult {
	if s == nil || s.m == nil {
		return egressProbeResult{OK: true}
	}
	s.proxyGateMu.Lock()
	if ch := s.proxyGateWait; ch != nil {
		s.proxyGateMu.Unlock()
		<-ch
		s.proxyGateMu.Lock()
		res := s.proxyGateResult
		s.proxyGateMu.Unlock()
		return res
	}
	if s.proxyGateFor == proxyRaw && !s.proxyGateAt.IsZero() && time.Since(s.proxyGateAt) < proxyProbeResultTTL {
		res := s.proxyGateResult
		s.proxyGateMu.Unlock()
		return res
	}
	ch := make(chan struct{})
	s.proxyGateWait = ch
	s.proxyGateMu.Unlock()

	var res egressProbeResult
	func() {
		defer func() {
			if r := recover(); r != nil {
				// A probe panic must never be read as "proxy is down": that
				// would pause every task on a bug in the probe itself.
				res = egressProbeResult{OK: true, Error: fmt.Sprint("probe panic: ", r)}
			}
			s.proxyGateMu.Lock()
			s.proxyGateResult = res
			s.proxyGateFor = proxyRaw
			s.proxyGateAt = time.Now()
			s.proxyGateWait = nil
			close(ch)
			s.proxyGateMu.Unlock()
		}()
		res = s.runProxyProbe(s.ctx, proxyRaw, "", s.m.egressProbes(), proxyConfirmProbeTimeout)
	}()
	return res
}

// allowProxyPause applies a global cooldown so a single outage cannot pause
// every task again every few seconds.
func (s *Server) allowProxyPause() bool {
	if s == nil {
		return false
	}
	s.proxyPauseMu.Lock()
	defer s.proxyPauseMu.Unlock()
	now := time.Now()
	if !s.proxyPauseLastAt.IsZero() && now.Sub(s.proxyPauseLastAt) < proxyPauseCooldown {
		return false
	}
	s.proxyPauseLastAt = now
	return true
}

func (s *Server) handleProxyFailure(taskID string, cause error) {
	proxyRaw := strings.TrimSpace(s.m.GlobalProxy())
	if proxyRaw == "" {
		return
	}
	if s.handleProxyPoolFailure(cause) {
		return
	}
	// isProxyFailure is the narrow LLM-error marker; proxyUnreachable is the
	// structural check for real dial/CONNECT failures.
	if !isProxyFailure(cause) && !proxyUnreachable(cause, proxyRaw) {
		return
	}
	if res := s.confirmProxyUnavailable(proxyRaw); res.OK {
		return
	}
	if !s.allowProxyPause() {
		log.Printf("[proxy] pause suppressed by cooldown")
		return
	}
	s.pauseProxyTask(taskID, cause)
}

func (s *Server) pauseProxyTask(taskID string, cause error) {
	if strings.TrimSpace(s.m.GlobalProxy()) == "" {
		return
	}
	max, interval := s.proxyReconnectConfig()
	now := time.Now().Add(interval).Unix()
	lastError := truncateProxyError(cause)
	transitioned, err := s.m.ApplyProxyPauseWithCallback(taskID, func() {
		if s.engine != nil {
			s.engine.Pause(taskID, agent.AbortPausedByProxy)
		}
		if t, ok := s.m.Task(taskID); ok {
			t.updateLifecycle(func(st *taskLifecycleState) {
				// A successful admission clears the prior round's counters. This
				// transition starts a fresh round, so make that reset atomic with
				// the persisted proxy pause and install a new generation.
				st.ReconnectGeneration++
				st.ReconnectAttempt = 0
				st.ReconnectMax = max
				st.ReconnectNextAt = now
				st.ReconnectExhausted = false
				st.ReconnectLastError = lastError
			})
		}
	})
	if err != nil {
		log.Printf("[proxy] pause task %s: %v", taskID, err)
		return
	}
	if !transitioned {
		// A no-op means the task was already paused (possibly by a user,
		// schedule, or an exhausted proxy attempt). Preserve its reason and
		// reconnect state exactly as-is.
		return
	}
	// A proxy pause stops the planner/workers but deliberately leaves the Main
	// Agent conversation alive: it is the human operator's interface, and most of
	// its tools (graph_overview / list_facts / file reads) never touch the egress
	// proxy. Killing the turn here was what made a proxy blip look like "the
	// session stopped working" (the turn is never replayed on resume).
	s.ensureProxySupervisor()
	s.signalProxySupervisor()
}

func (s *Server) handleProxyTrafficFailure(cause error) {
	proxyRaw := strings.TrimSpace(s.m.GlobalProxy())
	if s.handleProxyPoolFailure(cause) {
		return
	}
	if proxyRaw == "" || !proxyUnreachable(cause, proxyRaw) {
		return
	}
	// Confirm the saved global proxy itself before pausing. MITM RequestError can
	// also represent a target-side failure, and those must not pause a task.
	if res := s.confirmProxyUnavailable(proxyRaw); res.OK {
		return
	}
	if !s.allowProxyPause() {
		log.Printf("[proxy] pause suppressed by cooldown")
		return
	}
	for _, t := range s.m.List() {
		st := t.lifecycleSnapshot()
		if isTerminalStatus(st.Status) || st.Paused || s.engine.IsDeleting(t.ID) {
			continue
		}
		s.pauseProxyTask(t.ID, cause)
	}
}

func (s *Server) handleProxyToolFailure(ctx context.Context, cause error) {
	proxyRaw := strings.TrimSpace(s.m.GlobalProxy())
	if s.handleProxyPoolFailure(cause) {
		return
	}
	if proxyRaw == "" || !proxyUnreachable(cause, proxyRaw) {
		return
	}
	info := agent.RunInfoFrom(ctx)
	if info.TaskID <= 0 {
		return
	}
	if res := s.confirmProxyUnavailable(proxyRaw); res.OK {
		return
	}
	if !s.allowProxyPause() {
		log.Printf("[proxy] pause suppressed by cooldown")
		return
	}
	s.pauseProxyTask(fmt.Sprint(info.TaskID), cause)
}

func truncateProxyError(err error) string {
	if err == nil {
		return ""
	}
	s := maskSecrets(err.Error())
	if len(s) > 240 {
		return s[:240] + "…"
	}
	return s
}

func (s *Server) runProxyReconnect(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.proxyReconnectTick()
		case <-s.proxyReconnect.wake:
			s.proxyReconnectTick()
		}
	}
}

func (s *Server) proxyReconnectTick() {
	if strings.TrimSpace(s.m.GlobalProxy()) == "" {
		// Clearing the runtime route is a successful direct transition. Reuse the
		// generation gate so only eligible, non-exhausted proxy pauses resume.
		s.proxyReconnectSuccess()
		return
	}
	if s.m.proxyPool != nil && len(s.m.proxyPoolEntries()) > 0 {
		// A pool tick may confirm the active route or switch to another available
		// member. If it cannot confirm either, retain the original #106 per-task
		// attempt/backoff/exhaustion loop (especially for a one-member legacy
		// pool).
		outcome := s.proxyPoolTick()
		if outcome.confirmed || outcome.switched {
			return
		}
	}
	now := time.Now().Unix()
	max, interval := s.proxyReconnectConfig()
	for _, t := range s.m.List() {
		st := t.lifecycleSnapshot()
		if isTerminalStatus(st.Status) {
			t.updateLifecycle(func(v *taskLifecycleState) {
				if v.PauseReason == "paused_by_proxy" {
					v.PauseReason = ""
				}
				v.ReconnectAttempt, v.ReconnectMax, v.ReconnectNextAt = 0, 0, 0
				v.ReconnectExhausted, v.ReconnectLastError = false, ""
			})
			continue
		}
		if st.PauseReason != "paused_by_proxy" || st.ReconnectExhausted || (st.ReconnectNextAt > 0 && st.ReconnectNextAt > now) {
			continue
		}
		attempt := st.ReconnectAttempt + 1
		round := st.ReconnectGeneration
		claimed := false
		t.updateLifecycle(func(v *taskLifecycleState) {
			if v.PauseReason != "paused_by_proxy" || v.ReconnectGeneration != round || v.ReconnectAttempt != st.ReconnectAttempt {
				return
			}
			v.ReconnectAttempt = attempt
			v.ReconnectMax = max
			v.ReconnectNextAt = 0
			claimed = true
		})
		if !claimed {
			continue
		}
		res := s.runProxyProbe(context.Background(), s.m.GlobalProxy(), "", s.m.egressProbes(), 10*time.Second)
		if res.OK {
			s.proxyReconnectSuccessWithGuards(map[string]proxyReconnectGuard{
				t.ID: {generation: round, attempt: attempt, checkAttempt: true},
			}, nil)
			return
		}
		err := res.Error
		exhausted := attempt >= max
		next := time.Now().Add(interval).Unix()
		t.updateLifecycle(func(v *taskLifecycleState) {
			if v.PauseReason != "paused_by_proxy" || v.ReconnectGeneration != round || v.ReconnectAttempt != attempt {
				return
			}
			v.ReconnectNextAt = next
			v.ReconnectExhausted = exhausted
			v.ReconnectLastError = err
		})
		log.Printf("[proxy] reconnect attempt %d/%d failed: %s", attempt, max, err)
	}
}

func (s *Server) proxyReconnectSuccess() {
	s.proxyReconnectSuccessWithGuards(s.snapshotProxyReconnectGuards(false), nil)
}

func (s *Server) proxyReconnectSuccessFor(taskID string, generation uint64, attempt int) {
	s.proxyReconnectSuccessWithGuards(map[string]proxyReconnectGuard{
		taskID: {generation: generation, attempt: attempt, checkAttempt: true},
	}, nil)
}

// proxyReconnectSuccessWithHook is kept small and private so tests can
// deterministically place a competing pause immediately after admission has
// released concMu. Production callers use proxyReconnectSuccess without a
// hook.
func (s *Server) proxyReconnectSuccessWithHook(afterAdmission func()) {
	s.proxyReconnectSuccessWithGuards(s.snapshotProxyReconnectGuards(false), afterAdmission)
}

func (s *Server) proxyReconnectSuccessWithGuard(expectedID string, expectedGeneration uint64, expectedAttempt int, afterAdmission func()) {
	guards := s.snapshotProxyReconnectGuards(false)
	if expectedID != "" {
		guards = map[string]proxyReconnectGuard{
			expectedID: {generation: expectedGeneration, attempt: expectedAttempt, checkAttempt: true},
		}
	}
	s.proxyReconnectSuccessWithGuards(guards, afterAdmission)
}

func (s *Server) proxyReconnectSuccessWithGuards(guards map[string]proxyReconnectGuard, afterAdmission func()) {
	max, interval := s.proxyReconnectConfig()
	s.scheduleMu.Lock()
	defer s.scheduleMu.Unlock()
	for _, t := range s.m.List() {
		guard, ok := guards[t.ID]
		if !ok {
			continue
		}
		if !proxyReconnectGuardMatches(t.lifecycleSnapshot(), guard) {
			continue
		}
		if s.m.pg != nil {
			inside, scheduleErr := s.proxyResumeInsideSchedule(t.ID, time.Now())
			if scheduleErr != nil {
				log.Printf("[proxy] schedule gate for task %s: %v", t.ID, scheduleErr)
				continue
			}
			if !inside {
				if err := s.m.ConvertProxyPauseToSchedule(t.ID); err != nil {
					log.Printf("[proxy] schedule pause task %s: %v", t.ID, err)
				}
				continue
			}
		}
		var err error
		if s.engine != nil {
			_, err = s.admitTaskWhenScheduledWithGenerationChecked(t, "resume", true, false, "paused_by_proxy", true, guard.generation, true)
			if afterAdmission != nil {
				afterAdmission()
			}
		} else {
			err = s.m.ClearPauseReason(t.ID)
		}
		if err != nil {
			// Admission re-checks the persisted reason under concMu. A user pause,
			// terminal transition, delete, or archive therefore cannot be revived;
			// only keep probing if the proxy pause is still eligible.
			st := t.lifecycleSnapshot()
			if proxyReconnectGuardMatches(st, guard) && !isTerminalStatus(st.Status) {
				t.updateLifecycle(func(v *taskLifecycleState) {
					v.ReconnectMax = max
					v.ReconnectNextAt = time.Now().Add(interval).Unix()
				})
			}
			log.Printf("[proxy] resume task %s: %v", t.ID, err)
			continue
		}
		// The non-queued path's startAdmittedTask already resumes the Engine
		// while concMu is held. Do not Resume again after releasing the lock:
		// a concurrent user/orchestrator pause could have installed a newer
		// barrier in the meantime.
		t.updateLifecycle(func(v *taskLifecycleState) {
			if !proxyReconnectGuardMatches(*v, guard) {
				return
			}
			v.ReconnectAttempt = 0
			v.ReconnectMax = 0
			v.ReconnectNextAt = 0
			v.ReconnectExhausted = false
			v.ReconnectLastError = ""
		})
	}
}

func (s *Server) testTaskProxy(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	t, ok := s.m.Task(id)
	if !ok {
		writeErr(w, 404, "task not found")
		return
	}
	proxy := strings.TrimSpace(s.m.GlobalProxy())
	guards := s.snapshotProxyReconnectGuardsWithExhausted(false, true)
	if proxy == "" {
		writeJSON(w, 200, map[string]any{"ok": true, "direct": true})
		s.proxyReconnectSuccessWithGuards(guards, nil)
		return
	}
	res := s.runProxyProbe(r.Context(), proxy, "", s.m.egressProbes(), 10*time.Second)
	if res.OK {
		s.proxyReconnectSuccessWithGuards(guards, nil)
	}
	if !res.OK && res.Error == "" {
		res.Error = "代理探测失败"
	}
	writeJSON(w, 200, map[string]any{"ok": res.OK, "error": res.Error, "task_id": t.ID})
}

func (s *Server) setProxyReconnectSettings(max, interval *int) error {
	if max != nil {
		if *max < 1 || *max > 1000 {
			return errors.New("proxy reconnect max must be 1..1000")
		}
		if err := s.m.pg.SetSetting(settingProxyReconnectMax, fmt.Sprint(*max)); err != nil {
			return err
		}
	}
	if interval != nil {
		if *interval < 1 || *interval > 86400 {
			return errors.New("proxy reconnect interval must be 1..86400 seconds")
		}
		if err := s.m.pg.SetSetting(settingProxyReconnectInterval, fmt.Sprint(*interval)); err != nil {
			return err
		}
	}
	return nil
}
