package intercept

import (
	"context"
	"fmt"
	"time"
)

const (
	MaxJudgeRetryCount          = 20
	MaxJudgeRetryIntervalMS     = 3600_000
	defaultJudgeRetryIntervalMS = 1000
)

// ValidateRetry rejects invalid settings before any judge configuration is saved.
func (c JudgeConfig) ValidateRetry() error {
	if c.RetryCount < 0 || c.RetryCount > MaxJudgeRetryCount {
		return fmt.Errorf("retry_count 必须在 0 到 %d 之间", MaxJudgeRetryCount)
	}
	if c.RetryIntervalMS < 0 || c.RetryIntervalMS > MaxJudgeRetryIntervalMS {
		return fmt.Errorf("retry_interval_ms 必须在 0 到 %d 之间", MaxJudgeRetryIntervalMS)
	}
	return nil
}

// reviewWithRetry retries failed classifications, including invalid verdicts.
// The captured input stays identical across attempts. A valid deny/ask verdict
// is final, and parent cancellation interrupts both requests and the retry wait.
// Provider-level connection/empty-response retries still run within each attempt.
func reviewWithRetry(ctx context.Context, cfg JudgeConfig, rv Reviewer, input ReviewInput) (out Decision, err error) {
	for attempt := 0; attempt <= cfg.RetryCount; attempt++ {
		if ctx.Err() != nil {
			return out, ctx.Err()
		}
		if attempt > 0 && cfg.RetryIntervalMS > 0 {
			timer := time.NewTimer(time.Duration(cfg.RetryIntervalMS) * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return out, ctx.Err()
			case <-timer.C:
			}
		}
		if ctx.Err() != nil {
			return out, ctx.Err()
		}
		attemptCtx := ctx
		cancel := func() {}
		if cfg.TimeoutSeconds > 0 {
			attemptCtx, cancel = context.WithTimeout(ctx, time.Duration(cfg.TimeoutSeconds)*time.Second)
		}
		out, err = rv(attemptCtx, cfg.ProfileID, cfg.Prompt, input)
		if attemptCtx.Err() != nil {
			err = attemptCtx.Err()
		}
		cancel()
		if err == nil {
			switch out.Action {
			case "allow", "ask", "deny":
				return out, nil
			default:
				err = fmt.Errorf("模型输出无法解析")
			}
		}
	}
	return out, err
}
