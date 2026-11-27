//go:build !linux

package toolguard

import "os/exec"

func CgroupV2Available() bool { return false }

type cgroupScope struct {
	dir    string
	active bool
}

func newCgroupScope(_ int64, _ int) *cgroupScope { return nil }
func openCgroupScope(_ string) *cgroupScope      { return nil }
func (*cgroupScope) CloseFD()                    {}
func (*cgroupScope) Kill()                       {}
func (*cgroupScope) OOMKilled() bool             { return false }
func (*cgroupScope) Cleanup()                    {}

func startCommand(cmd *exec.Cmd, _ *cgroupScope) (*exec.Cmd, error) {
	return cmd, cmd.Start()
}
