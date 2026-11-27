//go:build linux

package toolguard

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

var (
	cgProbeOnce     sync.Once
	cgParentDir     string
	cgControllers   map[string]bool
	cgAttachBlocked atomic.Bool
	cgScopeCounter  atomic.Uint64
)

// CgroupV2Available reports whether the process can create per-command Linux
// cgroup v2 directories with the memory controller enabled.
func CgroupV2Available() bool {
	probeCgroupV2()
	return cgParentDir != "" && !cgAttachBlocked.Load()
}

func probeCgroupV2() {
	cgProbeOnce.Do(func() {
		candidates := candidateCgroupParents()
		for _, dir := range candidates {
			ctrls := readSubtreeControllers(dir)
			if !ctrls["memory"] && !ctrls["pids"] {
				continue
			}
			probeDir := filepath.Join(dir, fmt.Sprintf("artex-probe-%d-%d", os.Getpid(), cgScopeCounter.Add(1)))
			if err := os.Mkdir(probeDir, 0o755); err != nil {
				continue
			}
			control := "pids.max"
			if ctrls["memory"] {
				control = "memory.max"
			}
			err := os.WriteFile(filepath.Join(probeDir, control), []byte("max"), 0)
			_ = os.Remove(probeDir)
			if err == nil {
				cgParentDir = dir
				cgControllers = ctrls
				return
			}
		}
	})
}

func candidateCgroupParents() []string {
	b, err := os.ReadFile("/proc/self/cgroup")
	if err != nil {
		return nil
	}
	var rel string
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "0::") {
			rel = strings.TrimSpace(strings.TrimPrefix(line, "0::"))
			break
		}
	}
	if rel == "" {
		return nil
	}
	const cgRoot = "/sys/fs/cgroup"
	selfDir := filepath.Join(cgRoot, rel)
	within := func(parent, child string) bool {
		rel, err := filepath.Rel(parent, child)
		return err == nil && rel != ".." && !strings.HasPrefix(rel, "../")
	}
	if !within(cgRoot, selfDir) {
		return nil
	}
	// Never silently place a child in a sibling cgroup: this could escape
	// the service/container's existing memory and PID limits. For delegated
	// services an operator may explicitly select the enclosing subtree.
	if parent := os.Getenv(EnvToolCgroupParent); parent != "" {
		parent = filepath.Clean(parent)
		if within(cgRoot, parent) && within(parent, selfDir) {
			return []string{parent}
		}
	}
	return []string{selfDir}
}

func readSubtreeControllers(dir string) map[string]bool {
	b, err := os.ReadFile(filepath.Join(dir, "cgroup.subtree_control"))
	if err != nil {
		return nil
	}
	m := map[string]bool{}
	for _, f := range strings.Fields(string(b)) {
		m[f] = true
	}
	return m
}

type cgroupScope struct {
	dir    string
	fd     int
	active bool
}

func newCgroupScope(limitBytes int64, pidsLimit int) *cgroupScope {
	if limitBytes <= 0 && pidsLimit <= 0 {
		return nil
	}
	if !CgroupV2Available() || (limitBytes > 0 && !cgControllers["memory"]) ||
		(limitBytes <= 0 && !cgControllers["pids"]) {
		return nil
	}
	dir := filepath.Join(cgParentDir, fmt.Sprintf("artex-cmd-%d-%d", os.Getpid(), cgScopeCounter.Add(1)))
	if err := os.Mkdir(dir, 0o755); err != nil {
		return nil
	}
	if limitBytes > 0 {
		if err := os.WriteFile(filepath.Join(dir, "memory.max"), []byte(strconv.FormatInt(limitBytes, 10)), 0o644); err != nil {
			_ = os.Remove(dir)
			return nil
		}
		// Best effort on kernels without swap accounting. Group-wide OOM
		// termination avoids leaving sibling workers running after a kill.
		_ = os.WriteFile(filepath.Join(dir, "memory.oom.group"), []byte("1"), 0)
		_ = os.WriteFile(filepath.Join(dir, "memory.swap.max"), []byte("0"), 0)
	}
	if pidsLimit > 0 && cgControllers["pids"] {
		_ = os.WriteFile(filepath.Join(dir, "pids.max"), []byte(strconv.Itoa(pidsLimit)), 0)
	}
	scope := openCgroupScope(dir)
	if scope == nil {
		_ = os.Remove(dir)
	}
	return scope
}

func openCgroupScope(dir string) *cgroupScope {
	if dir == "" {
		return nil
	}
	fd, err := syscall.Open(dir, syscall.O_RDONLY|syscall.O_DIRECTORY|syscall.O_CLOEXEC, 0)
	if err != nil {
		return nil
	}
	return &cgroupScope{dir: dir, fd: fd}
}

func startCommand(cmd *exec.Cmd, scope *cgroupScope) (*exec.Cmd, error) {
	if scope == nil {
		return cmd, cmd.Start()
	}
	// Start is single-use even on failure. Copy the unstarted command and
	// syscall attributes so a failed clone3 can fall back to normal exec.
	isolated := *cmd
	var attr syscall.SysProcAttr
	if cmd.SysProcAttr != nil {
		attr = *cmd.SysProcAttr
	}
	attr.UseCgroupFD, attr.CgroupFD = true, scope.fd
	isolated.SysProcAttr = &attr
	err := isolated.Start()
	if err == nil {
		scope.active = true
		return &isolated, nil
	}
	for _, unavailable := range []error{syscall.ENOSYS, syscall.EINVAL, syscall.EPERM, syscall.EACCES, syscall.EBUSY, syscall.EOPNOTSUPP} {
		if errors.Is(err, unavailable) {
			cmdErr := cmd.Start()
			if cmdErr == nil {
				cgAttachBlocked.Store(true)
			}
			return cmd, cmdErr
		}
	}
	return &isolated, err
}

func (s *cgroupScope) CloseFD() {
	if s == nil || s.fd < 0 {
		return
	}
	_ = syscall.Close(s.fd)
	s.fd = -1
}

func (s *cgroupScope) Kill() {
	if s == nil || s.dir == "" {
		return
	}
	// Linux >= 5.14: atomic cgroup kill.
	if err := os.WriteFile(filepath.Join(s.dir, "cgroup.kill"), []byte("1"), 0); err == nil {
		return
	}
	// Fallback for older kernels: SIGKILL every PID in cgroup.procs.
	if b, err := os.ReadFile(filepath.Join(s.dir, "cgroup.procs")); err == nil {
		for _, f := range strings.Fields(string(b)) {
			if pid, err := strconv.Atoi(f); err == nil && pid > 0 {
				_ = syscall.Kill(pid, syscall.SIGKILL)
			}
		}
	}
}

func (s *cgroupScope) OOMKilled() bool {
	if s == nil || s.dir == "" {
		return false
	}
	b, err := os.ReadFile(filepath.Join(s.dir, "memory.events"))
	if err != nil {
		return false
	}
	return parseCgroupMemoryEventsOOM(b)
}

func (s *cgroupScope) Cleanup() {
	if s == nil {
		return
	}
	s.CloseFD()
	if s.dir == "" {
		return
	}
	s.Kill()
	for i := range 4 {
		if err := os.Remove(s.dir); err == nil || os.IsNotExist(err) {
			return
		}
		time.Sleep(time.Duration(i+1) * 15 * time.Millisecond)
	}
}
