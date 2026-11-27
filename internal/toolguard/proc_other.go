//go:build !linux && !darwin && !freebsd && !openbsd && !netbsd

package toolguard

func watchdogAvailable() bool { return false }

func readProcessTreeMemory(_, _, _ int) (int64, []int, bool) {
	return 0, nil, false
}
