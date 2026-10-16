package server

import "testing"

func TestProfileRequestLimiterSurvivesCacheInvalidation(t *testing.T) {
	s := &Server{}
	limiter := s.requestLimiterForProfile(1)
	if limiter == s.requestLimiterForProfile(2) || limiter == s.requestLimiterForProfile(0) {
		t.Fatal("different profiles must have independent quotas")
	}
	s.invalidateProfileAgents()
	if got := s.requestLimiterForProfile(1); got != limiter {
		t.Fatal("clearing providers reset the profile's rate limiter")
	}
}
