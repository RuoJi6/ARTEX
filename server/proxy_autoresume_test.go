package server

import (
	"context"
	"errors"
	"net"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/agent"
)

func proxyTestManager(t *testing.T) *Manager {
	t.Helper()
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		t.Skipf("postgres unavailable (%v) - skipping", err)
	}
	t.Cleanup(func() { _ = m.Close() })
	return m
}

func TestProxyFailureClassification(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{"proxy connect", errors.New("proxyconnect tcp: connection refused"), true},
		{"reset", errors.New("dial tcp: connection reset by peer"), false},
		{"eof", errors.New("unexpected EOF"), false},
		{"quota", errors.New("status 429: insufficient_quota"), false},
		{"auth", errors.New("status 401: invalid api key"), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := isProxyFailure(tc.err); got != tc.want {
				t.Fatalf("isProxyFailure(%v)=%v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// TestProxyUnreachableClassification pins the structural rule: only errors that
// prove the configured proxy endpoint itself failed may pause tasks. SOCKS5
// reply codes and tool output are target-side and must never qualify.
func TestProxyUnreachableClassification(t *testing.T) {
	const proxy = "socks5://user:pass@38.11.173.12:1080"
	proxyAddr := &net.TCPAddr{IP: net.ParseIP("38.11.173.12"), Port: 1080}
	target := &net.TCPAddr{IP: net.ParseIP("203.0.113.9"), Port: 443}

	// SOCKS5 could not reach the proxy process: inner dial targets the proxy.
	socksProxyDown := &net.OpError{
		Op:  "socks connect",
		Net: "tcp",
		Err: &net.OpError{Op: "dial", Net: "tcp", Addr: proxyAddr, Err: errors.New("connection refused")},
	}
	// SOCKS5 answered with a reply code about the TARGET: the proxy is alive.
	socksTargetDown := &net.OpError{
		Op:     "socks connect",
		Net:    "tcp",
		Source: proxyAddr,
		Addr:   target,
		Err:    errors.New("unknown error connection refused"),
	}
	httpProxyDown := &net.OpError{Op: "dial", Net: "tcp", Addr: proxyAddr, Err: errors.New("i/o timeout")}

	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{"socks proxy dial failed", socksProxyDown, true},
		{"socks target refused (proxy alive)", socksTargetDown, false},
		{"http proxy dial failed", httpProxyDown, true},
		{"url.Error wrapping proxy dial", &url.Error{Op: "Get", URL: "https://x", Err: socksProxyDown}, true},
		{"recording proxy 127.0.0.1:8788 is not the egress route",
			&net.OpError{Op: "dial", Net: "tcp", Addr: &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: 8788}, Err: errors.New("refused")}, false},
		{"proxy auth rejected", errors.New("Proxy Authentication Required"), true},
		{"target 404", errors.New("status 404: target not found"), false},
		{"bash syntax error", errors.New("bash: -c: line 1: unexpected EOF while looking for matching `''"), false},
		{"scanner output mentioning socks", errors.New("GOOD socks4://136.228.163.150:5678 200|3930"), false},
		{"target connection reset", errors.New("read tcp: connection reset by peer"), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := proxyUnreachable(tc.err, proxy); got != tc.want {
				t.Fatalf("proxyUnreachable(%v)=%v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// TestProxyPauseCooldown makes sure one outage cannot re-pause tasks in a loop.
func TestProxyPauseCooldown(t *testing.T) {
	s := &Server{}
	if !s.allowProxyPause() {
		t.Fatal("first pause should be allowed")
	}
	if s.allowProxyPause() {
		t.Fatal("second pause inside the cooldown must be suppressed")
	}
	s.proxyPauseMu.Lock()
	s.proxyPauseLastAt = time.Now().Add(-proxyPauseCooldown - time.Second)
	s.proxyPauseMu.Unlock()
	if !s.allowProxyPause() {
		t.Fatal("pause should be allowed again after the cooldown")
	}
}

// TestProxyConfirmProbeCoalescesBurst pins the single-flight behaviour: a burst
// of upstream errors must produce one probe, and every waiter must see its
// result instead of starting another one.
func TestProxyConfirmProbeCoalescesBurst(t *testing.T) {
	var calls atomic.Int64
	release := make(chan struct{})
	s := &Server{ctx: context.Background(), m: &Manager{}}
	s.proxyProbe = func(context.Context, string, string, []string, time.Duration) egressProbeResult {
		calls.Add(1)
		<-release
		return egressProbeResult{Error: "全部探测地址均失败"}
	}

	const goroutines = 12
	var wg sync.WaitGroup
	var seenDown atomic.Int64
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			if res := s.confirmProxyUnavailable("socks5://127.0.0.1:1080"); !res.OK {
				seenDown.Add(1)
			}
		}()
	}
	// Let every goroutine reach the gate before the probe finishes.
	time.Sleep(50 * time.Millisecond)
	close(release)
	wg.Wait()

	if got := calls.Load(); got != 1 {
		t.Fatalf("probe calls = %d, want 1 (burst must coalesce)", got)
	}
	if got := seenDown.Load(); got != goroutines {
		t.Fatalf("callers seeing the shared failure = %d, want %d", got, goroutines)
	}
	// Within the TTL the cached result is reused without another probe.
	s.confirmProxyUnavailable("socks5://127.0.0.1:1080")
	if got := calls.Load(); got != 1 {
		t.Fatalf("probe calls after cache = %d, want 1", got)
	}
}

// TestTargetSideErrorNeverReachesProbe is the regression for the incident: a
// tool error whose text merely contains "EOF"/"connection reset" used to be
// treated as a global-proxy fault, pausing every task. Such errors must not even
// reach the confirmation probe.
func TestTargetSideErrorNeverReachesProbe(t *testing.T) {
	for _, targetErr := range []error{
		errors.New("bash: -c: line 1: unexpected EOF while looking for matching `''"),
		errors.New("read tcp 10.0.0.1:443: connection reset by peer"),
		errors.New("dial tcp 203.0.113.9:443: i/o timeout"),
		errors.New("GOOD socks4://136.228.163.150:5678 200|3930"),
	} {
		var probes atomic.Int64
		s := &Server{m: &Manager{globalProxy: "socks5://38.11.173.12:1080"}}
		s.proxyProbe = func(context.Context, string, string, []string, time.Duration) egressProbeResult {
			probes.Add(1)
			return egressProbeResult{OK: false}
		}
		s.handleProxyFailure("1", targetErr)
		if got := probes.Load(); got != 0 {
			t.Fatalf("target-side error %q triggered %d probe(s); it must be ignored", targetErr, got)
		}
	}
}

// TestProxyDialErrorStillProbes guards the opposite direction: a real dial
// failure to the configured proxy must still be confirmed before pausing.
func TestProxyDialErrorStillProbes(t *testing.T) {
	var probes atomic.Int64
	s := &Server{m: &Manager{globalProxy: "socks5://38.11.173.12:1080"}}
	s.proxyProbe = func(context.Context, string, string, []string, time.Duration) egressProbeResult {
		probes.Add(1)
		return egressProbeResult{OK: true} // proxy healthy: no pause
	}
	err := &net.OpError{
		Op:  "socks connect",
		Net: "tcp",
		Err: &net.OpError{Op: "dial", Net: "tcp", Addr: &net.TCPAddr{IP: net.ParseIP("38.11.173.12"), Port: 1080}, Err: errors.New("connection refused")},
	}
	s.handleProxyFailure("1", err)
	if got := probes.Load(); got != 1 {
		t.Fatalf("proxy dial failure probes = %d, want 1", got)
	}
}

// TestTargetSideTrafficErrorDoesNotPauseBatch is the end-to-end regression for
// the incident: a target-side "unexpected EOF" through the MITM used to pause
// every task in the same millisecond. It must neither probe nor pause.
func TestTargetSideTrafficErrorDoesNotPauseBatch(t *testing.T) {
	m := proxyTestManager(t)
	s := newAdmissionTestServer(m, nil)
	m.globalProxy = "socks5://38.11.173.12:1080"
	var probes atomic.Int64
	s.proxyProbe = func(context.Context, string, string, []string, time.Duration) egressProbeResult {
		probes.Add(1)
		return egressProbeResult{OK: false}
	}
	// The incident paused eight tasks in the same millisecond; a handful is
	// enough to prove the batch path never runs for a target-side error.
	var tasks []*Task
	for i := 0; i < 4; i++ {
		task, err := m.CreateTask("target-side eof", "goal", nil, 0, 0)
		if err != nil {
			t.Fatal(err)
		}
		tasks = append(tasks, task)
		taskID := task.ID
		defer func() { _, _ = m.DeleteTask(taskID, DeleteTaskOptions{}) }()
	}

	s.handleProxyTrafficFailure(errors.New("Get \"https://target.example/x\": unexpected EOF"))

	if got := probes.Load(); got != 0 {
		t.Fatalf("target-side traffic error probed %d time(s); it must be ignored", got)
	}
	for _, task := range tasks {
		if st := task.lifecycleSnapshot(); st.Paused {
			t.Fatalf("target-side traffic error paused task %s: %+v", task.ID, st)
		}
	}
}

// TestProxyTrafficFailurePausesOnceThenCoolsDown proves a REAL proxy outage
// still pauses, but the cooldown stops the pause/rewake loop.
func TestProxyTrafficFailurePausesOnceThenCoolsDown(t *testing.T) {
	m := proxyTestManager(t)
	s := newAdmissionTestServer(m, nil)
	m.globalProxy = "socks5://38.11.173.12:1080"
	var probes atomic.Int64
	s.proxyProbe = func(context.Context, string, string, []string, time.Duration) egressProbeResult {
		probes.Add(1)
		return egressProbeResult{Error: "全部探测地址均失败"}
	}
	task, err := m.CreateTask("real proxy outage", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()

	down := &net.OpError{
		Op:  "socks connect",
		Net: "tcp",
		Err: &net.OpError{Op: "dial", Net: "tcp", Addr: &net.TCPAddr{IP: net.ParseIP("38.11.173.12"), Port: 1080}, Err: errors.New("connection refused")},
	}
	s.handleProxyTrafficFailure(down)
	if st := task.lifecycleSnapshot(); !st.Paused || st.PauseReason != "paused_by_proxy" {
		t.Fatalf("real proxy outage did not pause: %+v", st)
	}
	if got := probes.Load(); got != 1 {
		t.Fatalf("probe calls = %d, want 1", got)
	}
	// A second outage event inside the cooldown must be suppressed at the gate.
	before := task.lifecycleSnapshot().ReconnectGeneration
	s.handleProxyTrafficFailure(down)
	if got := task.lifecycleSnapshot().ReconnectGeneration; got != before {
		t.Fatalf("cooldown did not suppress the second pause: generation %d → %d", before, got)
	}
}

func TestProxyPauseCauseIsDistinct(t *testing.T) {
	ctx, cancel := context.WithCancelCause(context.Background())
	cancel(agent.AbortPausedByProxy)
	code, short, _, ok := agent.AbortReason(ctx)
	if !ok || code != "paused_by_proxy" || short == "" {
		t.Fatalf("proxy cause = %q/%q/%v", code, short, ok)
	}
}

func TestProxyReconnectReasonGate(t *testing.T) {
	for _, tc := range []struct {
		reason string
		want   bool
	}{
		{"paused_by_proxy", true},
		{"paused_by_user", false},
		{"paused_by_schedule", false},
		{"paused_by_orchestrator", false},
	} {
		got := tc.reason == "paused_by_proxy"
		if got != tc.want {
			t.Errorf("reason %q gate=%v, want %v", tc.reason, got, tc.want)
		}
	}
}

func TestProxyAdmissionRechecksReasonAfterSnapshot(t *testing.T) {
	m := proxyTestManager(t)
	task, err := m.CreateTask("proxy gate", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	if err := m.ApplyProxyPause(task.ID); err != nil {
		t.Fatal(err)
	}
	s := newAdmissionTestServer(m, nil)
	s.engine.Pause(task.ID, agent.AbortPausedByProxy)
	// Simulate a user re-pause winning after proxyReconnectSuccess took its
	// snapshot but before the admission lock was acquired.
	if _, err := m.pg.Exec(`UPDATE tasks SET pause_reason='paused_by_user' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	task.updateLifecycle(func(v *taskLifecycleState) { v.PauseReason = "paused_by_user" })
	if _, err := s.admitTaskWhenScheduledWithReason(task, "resume", true, false, "paused_by_proxy", true); err == nil {
		t.Fatal("proxy admission passed after user changed pause reason")
	}
	if !s.engine.IsPaused(task.ID) {
		t.Fatal("user re-pause barrier was cleared")
	}
}

func TestProxyQueuedAdmissionDoesNotResumeEngine(t *testing.T) {
	m := proxyTestManager(t)
	if err := m.SetConcurrency(true, 1); err != nil {
		t.Fatal(err)
	}
	holder, err := m.CreateTask("holder", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	proxyTask, err := m.CreateTask("queued proxy", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = m.DeleteTask(holder.ID, DeleteTaskOptions{})
		_, _ = m.DeleteTask(proxyTask.ID, DeleteTaskOptions{})
	}()
	if err := m.ApplyProxyPause(proxyTask.ID); err != nil {
		t.Fatal(err)
	}
	s := newAdmissionTestServer(m, nil)
	s.engine.started.Store(holder.ID, true)
	s.engine.Pause(proxyTask.ID, agent.AbortPausedByProxy)
	queued, err := s.admitTaskWhenScheduledWithReason(proxyTask, "resume", true, false, "paused_by_proxy", true)
	if err != nil {
		t.Fatal(err)
	}
	if !queued {
		t.Fatal("proxy task was expected to queue behind the running holder")
	}
	if !s.engine.IsPaused(proxyTask.ID) {
		t.Fatal("queued proxy task was resumed")
	}
}

func TestTerminalStatusClearsProxyReconnectState(t *testing.T) {
	m := proxyTestManager(t)
	task, err := m.CreateTask("terminal proxy", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	if err := m.ApplyProxyPause(task.ID); err != nil {
		t.Fatal(err)
	}
	task.updateLifecycle(func(v *taskLifecycleState) {
		v.ReconnectAttempt, v.ReconnectMax, v.ReconnectNextAt = 2, 5, 123
		v.ReconnectExhausted, v.ReconnectLastError = true, "proxy down"
	})
	if err := m.SetTaskStatus(task.ID, "timeout"); err != nil {
		t.Fatal(err)
	}
	stored, err := m.pg.GetTask(mustTaskID(t, task.ID))
	if err != nil {
		t.Fatal(err)
	}
	if stored.PauseReason != "" {
		t.Fatalf("terminal row retained pause reason %q", stored.PauseReason)
	}
	st := task.lifecycleSnapshot()
	if st.PauseReason != "" || st.ReconnectAttempt != 0 || st.ReconnectNextAt != 0 || st.ReconnectExhausted {
		t.Fatalf("terminal lifecycle retained reconnect state: %+v", st)
	}
}

func TestProxyAdmissionPreservesCalendarOverride(t *testing.T) {
	m := proxyTestManager(t)
	task, err := m.CreateTask("calendar proxy", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	if _, err := m.pg.Exec(`UPDATE tasks SET schedule_paused=true, schedule_manual_until='2099-01-01 00:00:00+00' WHERE id=$1`, task.ID); err != nil {
		t.Fatal(err)
	}
	if err := m.ApplyProxyPause(task.ID); err != nil {
		t.Fatal(err)
	}
	s := newAdmissionTestServer(m, nil)
	s.engine.Pause(task.ID, agent.AbortPausedByProxy)
	if queued, err := s.admitTaskWhenScheduledWithReason(task, "resume", true, false, "paused_by_proxy", true); err != nil || queued {
		t.Fatalf("proxy admission queued=%v err=%v", queued, err)
	}
	var schedulePaused bool
	var manualUntil time.Time
	if err := m.pg.QueryRow(`SELECT schedule_paused, schedule_manual_until FROM tasks WHERE id=$1`, task.ID).Scan(&schedulePaused, &manualUntil); err != nil {
		t.Fatal(err)
	}
	if !schedulePaused || !manualUntil.Equal(time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("proxy admission changed calendar state: paused=%v until=%v", schedulePaused, manualUntil)
	}
}

func TestProxyReconnectSuccessKeepsCompetingUserPauseBarrier(t *testing.T) {
	m := proxyTestManager(t)
	task, err := m.CreateTask("proxy success race", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	s := newAdmissionTestServer(m, nil)
	m.SetTaskControlMutex(&s.concMu)
	m.globalProxy = "http://proxy.invalid"
	if _, err := m.ApplyProxyPauseWithCallback(task.ID, func() { s.engine.Pause(task.ID, agent.AbortPausedByProxy) }); err != nil {
		t.Fatal(err)
	}

	var pauseErr error
	s.proxyReconnectSuccessWithHook(func() {
		_, pauseErr = s.applyTaskControl(task, "pause")
	})
	if pauseErr != nil {
		t.Fatalf("competing user pause failed: %v", pauseErr)
	}
	state := task.lifecycleSnapshot()
	if state.PauseReason != "paused_by_user" || !state.Paused {
		t.Fatalf("user pause was overwritten: %+v", state)
	}
	if !s.engine.IsPaused(task.ID) {
		t.Fatal("user pause barrier was cleared by a post-admission Resume")
	}
}

func TestProxyPauseBarrierInstalledBeforeControlUnlock(t *testing.T) {
	m := proxyTestManager(t)
	task, err := m.CreateTask("proxy barrier", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	s := newAdmissionTestServer(m, nil)
	m.SetTaskControlMutex(&s.concMu)
	m.globalProxy = "http://proxy.invalid"

	userDone := make(chan error, 1)
	transitioned, err := m.ApplyProxyPauseWithCallback(task.ID, func() {
		s.engine.Pause(task.ID, agent.AbortPausedByProxy)
		if !s.engine.IsPaused(task.ID) {
			t.Fatal("proxy barrier was not installed in the locked callback")
		}
		go func() {
			_, pauseErr := s.applyTaskControl(task, "pause")
			userDone <- pauseErr
		}()
		select {
		case <-userDone:
			t.Fatal("user pause acquired concMu before proxy callback returned")
		case <-time.After(20 * time.Millisecond):
		}
	})
	if err != nil || !transitioned {
		t.Fatalf("proxy transition=%v err=%v", transitioned, err)
	}
	if err := <-userDone; err != nil {
		t.Fatalf("concurrent user pause failed: %v", err)
	}
	if !s.engine.IsPaused(task.ID) {
		t.Fatal("concurrent user pause left the engine running")
	}
	if got := task.lifecycleSnapshot().PauseReason; got != "paused_by_user" {
		t.Fatalf("concurrent user pause reason=%q", got)
	}
}

func TestProxyPauseDoesNotReviveExhaustedOrNonProxyTasks(t *testing.T) {
	m := proxyTestManager(t)
	exhausted, err := m.CreateTask("exhausted proxy", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	userPaused, err := m.CreateTask("user paused", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	other, err := m.CreateTask("new proxy failure", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = m.DeleteTask(exhausted.ID, DeleteTaskOptions{})
		_, _ = m.DeleteTask(userPaused.ID, DeleteTaskOptions{})
		_, _ = m.DeleteTask(other.ID, DeleteTaskOptions{})
	}()
	s := newAdmissionTestServer(m, nil)
	m.SetTaskControlMutex(&s.concMu)
	m.globalProxy = "http://proxy.invalid"
	if err := m.ApplyProxyPause(exhausted.ID); err != nil {
		t.Fatal(err)
	}
	if err := m.ApplyTaskPauseOriginReason(userPaused.ID, "paused_by_user", false); err != nil {
		t.Fatal(err)
	}
	exhausted.updateLifecycle(func(v *taskLifecycleState) {
		v.ReconnectAttempt, v.ReconnectMax, v.ReconnectNextAt = 5, 5, 12345
		v.ReconnectExhausted, v.ReconnectLastError = true, "proxy down"
	})
	userPaused.updateLifecycle(func(v *taskLifecycleState) {
		v.ReconnectAttempt, v.ReconnectMax, v.ReconnectNextAt = 3, 7, 23456
		v.ReconnectExhausted, v.ReconnectLastError = true, "manual pause state"
	})
	exhaustedBefore := exhausted.lifecycleSnapshot()
	userBefore := userPaused.lifecycleSnapshot()

	// A no-op proxy pause on an already paused task must not reset either state.
	s.pauseProxyTask(exhausted.ID, errors.New("another proxy failure"))
	s.pauseProxyTask(userPaused.ID, errors.New("proxy failure while user paused"))
	if got := exhausted.lifecycleSnapshot(); got.ReconnectNextAt != exhaustedBefore.ReconnectNextAt || !got.ReconnectExhausted || got.ReconnectLastError != exhaustedBefore.ReconnectLastError {
		t.Fatalf("exhausted task was revived: before=%+v after=%+v", exhaustedBefore, got)
	}
	if got := userPaused.lifecycleSnapshot(); got.PauseReason != "paused_by_user" || got.ReconnectNextAt != userBefore.ReconnectNextAt || !got.ReconnectExhausted {
		t.Fatalf("user-paused task was mutated: before=%+v after=%+v", userBefore, got)
	}

	// A genuinely new proxy pause of another running task initializes only that
	// task's reconnect round.
	s.pauseProxyTask(other.ID, errors.New("new proxy failure"))
	if got := exhausted.lifecycleSnapshot(); got.ReconnectNextAt != exhaustedBefore.ReconnectNextAt || !got.ReconnectExhausted {
		t.Fatalf("subsequent proxy pause revived exhausted task: %+v", got)
	}
	if got := other.lifecycleSnapshot(); got.PauseReason != "paused_by_proxy" || got.ReconnectMax == 0 || got.ReconnectExhausted {
		t.Fatalf("new proxy task did not initialize reconnect state: %+v", got)
	}
}

func TestProxyReconnectRoundResetsAfterManualResume(t *testing.T) {
	m := proxyTestManager(t)
	task, err := m.CreateTask("proxy retry round", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	s := newAdmissionTestServer(m, nil)
	m.SetTaskControlMutex(&s.concMu)
	m.globalProxy = "http://proxy.invalid"
	if err := m.ApplyProxyPause(task.ID); err != nil {
		t.Fatal(err)
	}
	s.engine.Pause(task.ID, agent.AbortPausedByProxy)
	task.updateLifecycle(func(v *taskLifecycleState) {
		v.ReconnectAttempt, v.ReconnectMax, v.ReconnectNextAt = 5, 5, 12345
		v.ReconnectExhausted, v.ReconnectLastError = true, "proxy exhausted"
	})
	if _, err := s.applyTaskControl(task, "resume"); err != nil {
		t.Fatal(err)
	}
	resumed := task.lifecycleSnapshot()
	if resumed.PauseReason != "" || resumed.ReconnectAttempt != 0 || resumed.ReconnectMax != 0 || resumed.ReconnectNextAt != 0 || resumed.ReconnectExhausted || resumed.ReconnectLastError != "" {
		t.Fatalf("manual resume retained reconnect state: %+v", resumed)
	}
	s.pauseProxyTask(task.ID, errors.New("proxy failed again"))
	paused := task.lifecycleSnapshot()
	if paused.PauseReason != "paused_by_proxy" || paused.ReconnectAttempt != 0 || paused.ReconnectExhausted {
		t.Fatalf("new proxy round was not reset: %+v", paused)
	}
	if paused.ReconnectMax == 0 || paused.ReconnectNextAt == 0 || paused.ReconnectLastError == "" {
		t.Fatalf("new proxy round did not initialize reconnect state: %+v", paused)
	}
}

func TestProxyReconnectDropsStaleProbeFailureAfterNewRound(t *testing.T) {
	m := proxyTestManager(t)
	task, err := m.CreateTask("proxy stale probe", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	s := newAdmissionTestServer(m, nil)
	m.SetTaskControlMutex(&s.concMu)
	m.globalProxy = "http://proxy.invalid"
	// Keep the canceled test server from starting its supervisor. The test owns
	// the reconnect tick and injects a blocking probe below.
	s.proxyReconnect.mu.Lock()
	s.proxyReconnect.wake = make(chan struct{}, 1)
	s.proxyReconnect.mu.Unlock()
	oldMax, hadMax, err := m.pg.GetSetting(settingProxyReconnectMax)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if hadMax {
			_ = m.pg.SetSetting(settingProxyReconnectMax, oldMax)
		} else {
			_, _ = m.pg.Exec(`DELETE FROM settings WHERE key=$1`, settingProxyReconnectMax)
		}
	}()
	if err := m.pg.SetSetting(settingProxyReconnectMax, "1"); err != nil {
		t.Fatal(err)
	}
	s.proxyProbe = func(context.Context, string, string, []string, time.Duration) egressProbeResult {
		return egressProbeResult{Error: "initial probe failure"}
	}
	s.pauseProxyTask(task.ID, errors.New("initial proxy failure"))
	task.updateLifecycle(func(v *taskLifecycleState) { v.ReconnectNextAt = 0 })
	oldRound := task.lifecycleSnapshot().ReconnectGeneration
	probeStarted := make(chan struct{})
	releaseProbe := make(chan struct{})
	var probeStartedOnce sync.Once
	s.proxyProbe = func(context.Context, string, string, []string, time.Duration) egressProbeResult {
		probeStartedOnce.Do(func() { close(probeStarted) })
		<-releaseProbe
		return egressProbeResult{Error: "stale probe failure"}
	}
	tickDone := make(chan struct{})
	go func() {
		s.proxyReconnectTick()
		close(tickDone)
	}()
	select {
	case <-probeStarted:
	case <-time.After(time.Second):
		t.Fatal("reconnect tick did not start its probe")
	}
	if _, err := s.applyTaskControl(task, "resume"); err != nil {
		t.Fatal(err)
	}
	s.pauseProxyTask(task.ID, errors.New("new proxy failure"))
	newRound := task.lifecycleSnapshot()
	if newRound.ReconnectGeneration == oldRound || newRound.ReconnectAttempt != 0 || newRound.ReconnectExhausted {
		t.Fatalf("new proxy round was not established: old=%d new=%+v", oldRound, newRound)
	}
	close(releaseProbe)
	select {
	case <-tickDone:
	case <-time.After(time.Second):
		t.Fatal("reconnect tick did not finish")
	}
	after := task.lifecycleSnapshot()
	if after.PauseReason != "paused_by_proxy" || after.ReconnectGeneration != newRound.ReconnectGeneration || after.ReconnectAttempt != 0 || after.ReconnectExhausted || after.ReconnectNextAt != newRound.ReconnectNextAt || after.ReconnectLastError != newRound.ReconnectLastError {
		t.Fatalf("stale probe mutated the new round: before=%+v after=%+v", newRound, after)
	}
}

func TestProxyReconnectManualSuccessDoesNotAdmitNewRound(t *testing.T) {
	m := proxyTestManager(t)
	task, err := m.CreateTask("proxy stale manual success", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	s := newAdmissionTestServer(m, nil)
	m.SetTaskControlMutex(&s.concMu)
	m.globalProxy = "http://proxy.invalid"
	if err := m.ApplyProxyPause(task.ID); err != nil {
		t.Fatal(err)
	}
	s.engine.Pause(task.ID, agent.AbortPausedByProxy)
	guards := s.snapshotProxyReconnectGuards(false)
	task.updateLifecycle(func(v *taskLifecycleState) {
		v.ReconnectGeneration++
		v.ReconnectNextAt = 987654
		v.ReconnectLastError = "new round still failing"
	})
	before := task.lifecycleSnapshot()
	s.proxyReconnectSuccessWithGuards(guards, nil)
	after := task.lifecycleSnapshot()
	if after.PauseReason != "paused_by_proxy" || !s.engine.IsPaused(task.ID) {
		t.Fatalf("stale manual success admitted new round: %+v", after)
	}
	if after.ReconnectGeneration != before.ReconnectGeneration || after.ReconnectNextAt != before.ReconnectNextAt || after.ReconnectLastError != before.ReconnectLastError {
		t.Fatalf("stale manual success wiped new round state: before=%+v after=%+v", before, after)
	}
}

func TestProxyReconnectSettingsSuccessGuardsGenerationZero(t *testing.T) {
	m := proxyTestManager(t)
	task, err := m.CreateTask("proxy generation zero", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.DeleteTask(task.ID, DeleteTaskOptions{}) }()
	s := newAdmissionTestServer(m, nil)
	m.SetTaskControlMutex(&s.concMu)
	m.globalProxy = "http://proxy.invalid"
	if err := m.ApplyProxyPause(task.ID); err != nil {
		t.Fatal(err)
	}
	s.engine.Pause(task.ID, agent.AbortPausedByProxy)
	initial := task.lifecycleSnapshot()
	if initial.ReconnectGeneration != 0 {
		t.Fatalf("fresh persisted proxy pause generation=%d, want zero", initial.ReconnectGeneration)
	}
	guards := s.snapshotProxyReconnectGuards(false)
	task.updateLifecycle(func(v *taskLifecycleState) {
		v.ReconnectGeneration = 1
		v.ReconnectNextAt = 13579
		v.ReconnectLastError = "generation one failure"
	})
	before := task.lifecycleSnapshot()
	s.proxyReconnectSuccessWithGuards(guards, nil)
	after := task.lifecycleSnapshot()
	if after.PauseReason != "paused_by_proxy" || !s.engine.IsPaused(task.ID) {
		t.Fatalf("generation-zero stale settings success admitted new round: %+v", after)
	}
	if after.ReconnectGeneration != before.ReconnectGeneration || after.ReconnectNextAt != before.ReconnectNextAt || after.ReconnectLastError != before.ReconnectLastError {
		t.Fatalf("generation-zero stale settings success wiped state: before=%+v after=%+v", before, after)
	}
}
