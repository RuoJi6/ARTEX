// Package toolguard enforces per-command memory, timeout, PID, and output bounds
// for agent Bash commands and custom command/script tools.
package toolguard

import (
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	EnvToolMemoryLimitMB = "ARTEX_TOOL_MEMORY_LIMIT_MB"
	EnvToolTimeoutS      = "ARTEX_TOOL_TIMEOUT_S"
	EnvToolPidsLimit     = "ARTEX_TOOL_PIDS_LIMIT"
	EnvToolCgroupParent  = "ARTEX_TOOL_CGROUP_PARENT"

	DefaultToolMemoryLimitMB = 2048
	DefaultToolTimeoutS      = 120
	DefaultMaxToolTimeoutS   = 600
	DefaultToolPidsLimit     = 256
	DefaultPollInterval      = 200 * time.Millisecond
	DefaultGrace             = 1 * time.Second
	DefaultMaxOutputBytes    = 50 << 20 // 50 MiB, matching norma's background task cap
)

// Config controls per-command resource guards.
type Config struct {
	MemoryLimitMB  int           // 0 disables per-command memory guard
	Timeout        time.Duration // default command timeout
	MaxTimeout     time.Duration // upper bound for per-call timeout_ms
	PidsLimit      int           // 0 disables per-command cgroup pids.max
	PollInterval   time.Duration // RSS watchdog poll cadence
	Grace          time.Duration // sustained over-limit duration before kill (spikes >=1.25x kill immediately)
	MaxOutputBytes int           // hard cap on captured combined stdout+stderr
}

// FromEnv reads the active guard configuration from environment variables,
// falling back to safe defaults on unset or invalid values.
func FromEnv() Config {
	memMB := parseNonNegLimit(os.Getenv(EnvToolMemoryLimitMB), DefaultToolMemoryLimitMB)
	timeoutS := parsePositiveInt(os.Getenv(EnvToolTimeoutS), DefaultToolTimeoutS)
	if int64(memMB) > math.MaxInt64/(1<<20) {
		memMB = DefaultToolMemoryLimitMB
	}
	if int64(timeoutS) > math.MaxInt64/int64(time.Second) {
		timeoutS = DefaultToolTimeoutS
	}
	pids := parseNonNegLimit(os.Getenv(EnvToolPidsLimit), DefaultToolPidsLimit)

	maxTimeoutS := DefaultMaxToolTimeoutS
	if timeoutS > maxTimeoutS {
		maxTimeoutS = timeoutS
	}
	return Config{
		MemoryLimitMB:  memMB,
		Timeout:        time.Duration(timeoutS) * time.Second,
		MaxTimeout:     time.Duration(maxTimeoutS) * time.Second,
		PidsLimit:      pids,
		PollInterval:   DefaultPollInterval,
		Grace:          DefaultGrace,
		MaxOutputBytes: DefaultMaxOutputBytes,
	}
}

func (c Config) withDefaults() Config {
	if c.Timeout <= 0 {
		c.Timeout = DefaultToolTimeoutS * time.Second
	}
	if c.MaxTimeout < c.Timeout {
		c.MaxTimeout = c.Timeout
	}
	if c.MaxTimeout < DefaultMaxToolTimeoutS*time.Second {
		c.MaxTimeout = DefaultMaxToolTimeoutS * time.Second
	}
	if c.PollInterval <= 0 {
		c.PollInterval = DefaultPollInterval
	}
	if c.Grace < 0 {
		c.Grace = 0
	}
	if c.MaxOutputBytes <= 0 {
		c.MaxOutputBytes = DefaultMaxOutputBytes
	}
	return c
}

// MemoryLimitBytes returns the configured per-command memory cap in bytes,
// or 0 when disabled.
func (c Config) MemoryLimitBytes() int64 {
	if c.MemoryLimitMB <= 0 || int64(c.MemoryLimitMB) > math.MaxInt64/(1<<20) {
		return 0
	}
	return int64(c.MemoryLimitMB) * 1024 * 1024
}

// ResolveTimeout computes the effective timeout for a Bash invocation given an
// optional model-supplied timeout_ms.
func (c Config) ResolveTimeout(requestedMS int) time.Duration {
	c = c.withDefaults()
	if requestedMS <= 0 {
		return c.Timeout
	}
	if int64(requestedMS) > int64(c.MaxTimeout/time.Millisecond) {
		return c.MaxTimeout
	}
	return time.Duration(requestedMS) * time.Millisecond
}

// RSSWatchdogAvailable reports whether sampled per-command memory enforcement is enabled.
func (c Config) RSSWatchdogAvailable() bool { return c.MemoryLimitBytes() > 0 && watchdogAvailable() }

// Summary formats the active resource limits for startup logs.
func (c Config) Summary() string {
	c = c.withDefaults()
	mem := "disabled"
	if c.MemoryLimitMB > 0 {
		mem = fmt.Sprintf("%dMiB", c.MemoryLimitMB)
	}
	pids := "disabled"
	if c.PidsLimit > 0 {
		pids = strconv.Itoa(c.PidsLimit)
	}
	return fmt.Sprintf("memory=%s timeout=%ds pids=%s (cgroup_v2=%t, rss_watchdog=%t)",
		mem, int(c.Timeout/time.Second), pids, CgroupV2Available(), c.RSSWatchdogAvailable())
}

func parseNonNegLimit(raw string, def int) int {
	v := strings.ToLower(strings.TrimSpace(raw))
	if v == "" {
		return def
	}
	switch v {
	case "0", "off", "false", "disabled", "none":
		return 0
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return def
	}
	return n
}

func parsePositiveInt(raw string, def int) int {
	v := strings.TrimSpace(raw)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}
