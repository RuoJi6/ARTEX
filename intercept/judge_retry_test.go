package intercept

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

func retryTestInterceptor(t *testing.T, settings map[string]string) *Interceptor {
	t.Helper()
	d, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	if _, err := d.Exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`); err != nil {
		t.Fatal(err)
	}
	for key, value := range settings {
		if _, err := d.Exec(`INSERT INTO settings(key,value) VALUES (?,?)`, key, value); err != nil {
			t.Fatal(err)
		}
	}
	return New(&db.DB{DB: d})
}

func TestJudgeRetryConfigDefaultsAndBounds(t *testing.T) {
	for _, tc := range []struct {
		name            string
		settings        map[string]string
		count, interval int
	}{
		{"legacy", nil, 0, 1000},
		{"configured", map[string]string{settingJudgeRetryCount: "3", settingJudgeRetryIntervalMS: "25"}, 3, 25},
		{"immediate", map[string]string{settingJudgeRetryCount: "1", settingJudgeRetryIntervalMS: "0"}, 1, 0},
		{"malformed", map[string]string{settingJudgeRetryCount: "bad", settingJudgeRetryIntervalMS: "bad"}, 0, 1000},
		{"negative", map[string]string{settingJudgeRetryCount: "-1", settingJudgeRetryIntervalMS: "-1"}, 0, 0},
		{"excessive", map[string]string{settingJudgeRetryCount: "999", settingJudgeRetryIntervalMS: "999999999"}, 20, 3600000},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := retryTestInterceptor(t, tc.settings).GetJudgeConfig()
			if cfg.RetryCount != tc.count || cfg.RetryIntervalMS != tc.interval {
				t.Fatalf("config=%+v", cfg)
			}
		})
	}
}

func TestJudgeRetriesBeforeApplyingFailurePolicy(t *testing.T) {
	for _, tc := range []struct {
		name, failAction, verdict string
		failures, wantCalls       int
		wantAction                string
		wantFallback              bool
	}{
		{"recover", "deny", "allow", 2, 3, "allow", false},
		{"valid_deny_is_final", "allow", "deny", 0, 1, "deny", false},
		{"valid_ask_is_final", "allow", "ask", 0, 1, "ask", false},
		{"exhaust_allow", "allow", "allow", 9, 3, "allow", true},
		{"exhaust_ask", "ask", "allow", 9, 3, "ask", true},
		{"exhaust_deny", "deny", "allow", 9, 3, "deny", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			i := retryTestInterceptor(t, map[string]string{
				settingJudgeEnabled: "true", settingJudgeRetryCount: "2", settingJudgeRetryIntervalMS: "0", settingJudgeFailAction: tc.failAction,
			})
			calls := 0
			var first ReviewInput
			i.SetReviewer(func(ctx context.Context, id int64, prompt string, input ReviewInput) (Decision, error) {
				calls++
				if ctx.Err() != nil || prompt == "" {
					t.Fatal("invalid request context")
				}
				if calls == 1 {
					first = input
				} else if !reflect.DeepEqual(input, first) {
					t.Fatal("review input changed on retry")
				}
				out := Decision{Action: tc.verdict, ProfileID: 42, Message: "review result"}
				if calls <= tc.failures {
					return out, errors.New("temporary model failure")
				}
				return out, nil
			})
			got, ok := i.Judge(t.Context(), "Bash", json.RawMessage(`{"command":"echo ok"}`))
			if !ok || calls != tc.wantCalls || got.Action != tc.wantAction || got.ModelFallback != tc.wantFallback || got.ProfileID != 42 {
				t.Fatalf("calls=%d decision=%+v ok=%v", calls, got, ok)
			}
			if got.RuleID != 0 || len(got.ModelInput) == 0 || got.ModelInputDigest == "" || got.ConfigDigest == "" {
				t.Fatalf("missing audit data: %+v", got)
			}
			if got.Action == "ask" && (!got.TimeoutEnabled || got.TimeoutSeconds != 300 || got.TimeoutAction != "deny") {
				t.Fatal("human approval timeout lost")
			}
			if tc.wantFallback && !strings.Contains(got.Message, "temporary model failure") {
				t.Fatal("last failure lost")
			}
		})
	}
}

func TestJudgeRetriesInvalidVerdict(t *testing.T) {
	for _, invalid := range []string{"", "invalid"} {
		calls := 0
		out, err := reviewWithRetry(t.Context(), JudgeConfig{RetryCount: 1}, func(context.Context, int64, string, ReviewInput) (Decision, error) {
			calls++
			if calls == 1 {
				return Decision{Action: invalid}, nil
			}
			return Decision{Action: "deny"}, nil
		}, ReviewInput{})
		if err != nil || out.Action != "deny" || calls != 2 {
			t.Fatalf("calls=%d out=%+v err=%v", calls, out, err)
		}
	}
}

func TestJudgeLegacyConfigDoesNotRetry(t *testing.T) {
	i := retryTestInterceptor(t, map[string]string{settingJudgeEnabled: "true", settingJudgeFailAction: "deny"})
	calls := 0
	i.SetReviewer(func(context.Context, int64, string, ReviewInput) (Decision, error) {
		calls++
		return Decision{}, errors.New("failed")
	})
	got, _ := i.Judge(t.Context(), "Bash", json.RawMessage(`{"command":"echo ok"}`))
	if calls != 1 || got.Action != "deny" || !got.ModelFallback {
		t.Fatalf("calls=%d out=%+v", calls, got)
	}
}

func TestJudgeRetryTimeoutGetsFreshContext(t *testing.T) {
	calls := 0
	var previous context.Context
	out, err := reviewWithRetry(t.Context(), JudgeConfig{RetryCount: 1, TimeoutSeconds: 1}, func(ctx context.Context, _ int64, _ string, _ ReviewInput) (Decision, error) {
		calls++
		if calls == 1 {
			previous = ctx
			<-ctx.Done()
			return Decision{}, ctx.Err()
		}
		if previous.Err() != context.DeadlineExceeded || ctx.Err() != nil {
			t.Fatal("retry reused expired context")
		}
		if deadline, ok := ctx.Deadline(); !ok || time.Until(deadline) < 500*time.Millisecond {
			t.Fatal("retry has no fresh timeout")
		}
		return Decision{Action: "allow"}, nil
	}, ReviewInput{})
	if calls != 2 || err != nil || out.Action != "allow" {
		t.Fatalf("calls=%d out=%+v err=%v", calls, out, err)
	}
	if previous.Err() == nil {
		t.Fatal("attempt context was not released")
	}
}

func TestJudgeRetryCancellationInterruptsWait(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	started := make(chan struct{})
	done := make(chan error, 1)
	calls := 0
	go func() {
		_, err := reviewWithRetry(ctx, JudgeConfig{RetryCount: 20, RetryIntervalMS: 3600000}, func(context.Context, int64, string, ReviewInput) (Decision, error) {
			calls++
			close(started)
			return Decision{}, errors.New("failed")
		}, ReviewInput{})
		done <- err
	}()
	<-started
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) || calls != 1 {
			t.Fatalf("calls=%d err=%v", calls, err)
		}
	case <-time.After(time.Second):
		t.Fatal("cancellation did not interrupt retry wait")
	}
}

func TestJudgeRetryDoesNotCallCanceledOrDisabledReviewer(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	_, err := reviewWithRetry(ctx, JudgeConfig{RetryCount: 2}, func(context.Context, int64, string, ReviewInput) (Decision, error) {
		t.Fatal("called after cancellation")
		return Decision{}, nil
	}, ReviewInput{})
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	i := retryTestInterceptor(t, nil)
	i.SetReviewer(func(context.Context, int64, string, ReviewInput) (Decision, error) {
		t.Fatal("called disabled reviewer")
		return Decision{}, nil
	})
	if _, ok := i.Judge(t.Context(), "Bash", json.RawMessage(`{}`)); ok {
		t.Fatal("disabled judge returned verdict")
	}
}

func TestJudgeRetryWaitsBetweenFailures(t *testing.T) {
	var first time.Time
	calls := 0
	_, err := reviewWithRetry(t.Context(), JudgeConfig{RetryCount: 1, RetryIntervalMS: 20}, func(context.Context, int64, string, ReviewInput) (Decision, error) {
		calls++
		if calls == 1 {
			first = time.Now()
			return Decision{}, errors.New("failed")
		}
		if time.Since(first) < 20*time.Millisecond {
			t.Fatal("retry skipped configured interval")
		}
		return Decision{Action: "allow"}, nil
	}, ReviewInput{})
	if err != nil || calls != 2 {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}

func TestJudgeInvalidArgumentsDoNotCallReviewer(t *testing.T) {
	i := retryTestInterceptor(t, map[string]string{settingJudgeEnabled: "true", settingJudgeRetryCount: "2"})
	i.SetReviewer(func(context.Context, int64, string, ReviewInput) (Decision, error) {
		t.Fatal("invalid input must go straight to human review")
		return Decision{}, nil
	})
	got, ok := i.Judge(t.Context(), "Bash", json.RawMessage(`{broken`))
	if !ok || got.Action != "ask" || !got.ModelFallback {
		t.Fatalf("out=%+v ok=%v", got, ok)
	}
}

func TestJudgeRejectsInvalidRetryBeforeWritingSettings(t *testing.T) {
	for _, cfg := range []JudgeConfig{{RetryCount: -1}, {RetryCount: 21}, {RetryIntervalMS: -1}, {RetryIntervalMS: 3600001}} {
		if err := New(nil).SetJudgeConfig(cfg); err == nil {
			t.Fatalf("accepted invalid retry: %+v", cfg)
		}
	}
}
