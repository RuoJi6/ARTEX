package toolguard

import (
	"math"
	"testing"
	"time"
)

func TestConfigFromEnv(t *testing.T) {
	for _, tc := range []struct {
		name, memory, timeout, pids string
		wantMemory, wantPids        int
		wantTime, wantMax           time.Duration
	}{
		{"defaults", "", "", "", 2048, 256, 120 * time.Second, 600 * time.Second},
		{"override", "64", "700", "32", 64, 32, 700 * time.Second, 700 * time.Second},
		{"disabled", "0", "8", "off", 0, 0, 8 * time.Second, 600 * time.Second},
		{"invalid", "-5", "999999999999999999", "abc", 2048, 256, 120 * time.Second, 600 * time.Second},
		{"overflow", "999999999999999999", "0", "-5", 2048, 256, 120 * time.Second, 600 * time.Second},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(EnvToolMemoryLimitMB, tc.memory)
			t.Setenv(EnvToolTimeoutS, tc.timeout)
			t.Setenv(EnvToolPidsLimit, tc.pids)
			c := FromEnv()
			if c.MemoryLimitBytes() != int64(tc.wantMemory)<<20 || c.PidsLimit != tc.wantPids ||
				c.ResolveTimeout(0) != tc.wantTime || c.ResolveTimeout(math.MaxInt) != tc.wantMax ||
				c.ResolveTimeout(125) != 125*time.Millisecond {
				t.Fatalf("unexpected settings: %+v", c)
			}
		})
	}
}
