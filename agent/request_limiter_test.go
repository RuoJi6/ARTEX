package agent

import (
	"context"
	"errors"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"github.com/Autumn-27/norma/llm"
)

func TestRequestLimiterRollingWindows(t *testing.T) {
	for _, tc := range []struct {
		name     string
		rps, rpm float64
		capacity int
		window   time.Duration
	}{
		{"second", 10, 0, 10, time.Second},
		{"minute_45", 0, 45, 45, time.Minute},
		{"fractional_second", .5, 0, 1, 2 * time.Second},
		{"fractional_minute", 0, .5, 1, 2 * time.Minute},
	} {
		t.Run(tc.name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				l := &RequestLimiter{}
				if err := l.configure(tc.rps, tc.rpm); err != nil {
					t.Fatal(err)
				}
				start := time.Now()
				for i := 0; i < tc.capacity; i++ {
					if err := l.wait(context.Background()); err != nil {
						t.Fatal(err)
					}
				}
				ctx, cancel := context.WithTimeout(context.Background(), tc.window-time.Nanosecond)
				defer cancel()
				if err := l.wait(ctx); !errors.Is(err, context.DeadlineExceeded) {
					t.Fatalf("extra attempt before window expired: %v", err)
				}
				if err := l.wait(context.Background()); err != nil {
					t.Fatal(err)
				}
				if elapsed := time.Since(start); elapsed != tc.window {
					t.Fatalf("next attempt at %s, want %s; cancelled wait must not consume quota", elapsed, tc.window)
				}
			})
		})
	}
}

func TestRequestLimiterBothWindowsAndConcurrentCallers(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		l := &RequestLimiter{}
		if err := l.configure(3, 5); err != nil {
			t.Fatal(err)
		}
		var mu sync.Mutex
		var sent []time.Time
		var wg sync.WaitGroup
		start := time.Now()
		for i := 0; i < 12; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if err := l.wait(context.Background()); err != nil {
					t.Error(err)
					return
				}
				mu.Lock()
				sent = append(sent, time.Now())
				mu.Unlock()
			}()
		}
		wg.Wait()
		if elapsed := time.Since(start); elapsed != 2*time.Minute {
			t.Fatalf("12 requests under 3/s and 5/min took %s, want 2m", elapsed)
		}
		assertRollingRequestCounts(t, sent, time.Second, 3)
		assertRollingRequestCounts(t, sent, time.Minute, 5)
	})
}

func assertRollingRequestCounts(t *testing.T, sent []time.Time, window time.Duration, limit int) {
	t.Helper()
	for _, end := range sent {
		count := 0
		for _, ts := range sent {
			if ts.After(end.Add(-window)) && !ts.After(end) {
				count++
			}
		}
		if count > limit {
			t.Fatalf("%d attempts in rolling %s, limit %d", count, window, limit)
		}
	}
}

func TestRequestLimiterReconfiguration(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		l := &RequestLimiter{}
		if err := l.configure(0, 5); err != nil {
			t.Fatal(err)
		}
		for i := 0; i < 5; i++ {
			if err := l.wait(context.Background()); err != nil {
				t.Fatal(err)
			}
		}
		start := time.Now()
		if err := l.configure(0, 2); err != nil {
			t.Fatal(err)
		}
		done := make(chan error, 1)
		go func() { done <- l.wait(context.Background()) }()
		synctest.Wait()
		select {
		case err := <-done:
			t.Fatalf("lowering limit reset history: %v", err)
		default:
		}
		// A change must wake waiting requests rather than leave them sleeping
		// until the old minute window expires.
		if err := l.configure(0, 6); err != nil {
			t.Fatal(err)
		}
		if err := <-done; err != nil {
			t.Fatal(err)
		}
		if time.Since(start) != 0 {
			t.Fatal("waiter did not wake on limit increase")
		}
		if err := l.configure(0, 2); err != nil {
			t.Fatal(err)
		}
		if err := l.wait(context.Background()); err != nil {
			t.Fatal(err)
		}
		if time.Since(start) != time.Minute {
			t.Fatal("lower limit did not retain previous attempts")
		}
	})
}

func TestRequestLimiterDisabledAndCancelled(t *testing.T) {
	l := &RequestLimiter{}
	if err := l.configure(0, 0); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 100; i++ {
		if err := l.wait(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := l.wait(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v", err)
	}
	if len(l.sent) != 100 {
		t.Fatal("cancelled request consumed quota")
	}
	for _, rate := range []float64{math.NaN(), math.Inf(1), math.Inf(-1), math.SmallestNonzeroFloat64} {
		if err := l.configure(rate, 0); err == nil {
			t.Errorf("accepted invalid rate %v", rate)
		}
	}
}

// Exercise the actual Norma retry loops for all formats and both completion
// modes. In-memory HTTP responses let synctest advance a full minute instantly.
func TestProviderRateLimitCountsHTTPRetries(t *testing.T) {
	for _, format := range []string{"openai", "anthropic", "openai-responses"} {
		for _, streaming := range []bool{false, true} {
			mode := "complete"
			if streaming {
				mode = "stream"
			}
			t.Run(format+"/"+mode, func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					var sent []time.Time
					client := &http.Client{Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
						sent = append(sent, time.Now())
						return &http.Response{StatusCode: 500, Header: make(http.Header),
							Body: io.NopCloser(strings.NewReader(`{"error":{"message":"temporary error"}}`))}, nil
					})}
					cfg := ConfigFrom(format, "test-model", "http://example.invalid", "test-key", "")
					cfg.RatePerSecond, cfg.RatePerMinute = 1, 2
					cfg.Retry.ConnectInterval = time.Millisecond
					prov, err := cfg.newProvider(client, &RequestLimiter{})
					if err != nil {
						t.Fatal(err)
					}
					start := time.Now()
					req := llm.CompletionRequest{Messages: []llm.Message{llm.UserText("ping")}}
					if streaming {
						for _, streamErr := range prov.Stream(context.Background(), req) {
							err = streamErr
						}
					} else {
						_, _, _, err = prov.Complete(context.Background(), req)
					}
					if err == nil {
						t.Fatal("expected upstream 500")
					}
					if len(sent) != 4 {
						t.Fatalf("HTTP attempts=%d, want initial+3 retries", len(sent))
					}
					assertRollingRequestCounts(t, sent, time.Second, 1)
					assertRollingRequestCounts(t, sent, time.Minute, 2)
					if elapsed := time.Since(start); elapsed != time.Minute+time.Second {
						t.Fatalf("retry attempts took %s, want 1m1s", elapsed)
					}
				})
			})
		}
	}
}

func TestProviderRebuildPreservesRateLimit(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		l := &RequestLimiter{}
		var sent []time.Time
		cfg := ConfigFrom("openai", "test-model", "http://example.invalid", "test-key", "")
		cfg.RatePerMinute = 1
		cfg.Retry.ConnectAttempts = -1
		for i := 0; i < 2; i++ {
			client := &http.Client{Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
				sent = append(sent, time.Now())
				return &http.Response{StatusCode: 500, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("error"))}, nil
			})}
			prov, err := cfg.newProvider(client, l)
			if err != nil {
				t.Fatal(err)
			}
			prov.Complete(context.Background(), llm.CompletionRequest{Messages: []llm.Message{llm.UserText("ping")}})
		}
		if len(sent) != 2 || sent[1].Sub(sent[0]) != time.Minute {
			t.Fatalf("provider rebuild reset quota: %v", sent)
		}
	})
}

func TestProviderRateLimitSuccessfulRequests(t *testing.T) {
	for _, tc := range []struct {
		name     string
		rps, rpm float64
		calls    int
		window   time.Duration
		limit    int
	}{
		{"minute_45_requests_60", 0, 45, 60, time.Minute, 45},
		{"second_10_requests_15", 10, 0, 15, time.Second, 10},
	} {
		t.Run(tc.name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				var sent []time.Time
				client := &http.Client{Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
					sent = append(sent, time.Now())
					return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(
						`{"choices":[{"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}]}`))}, nil
				})}
				cfg := ConfigFrom("openai", "test-model", "http://example.invalid", "test-key", "")
				cfg.RatePerSecond, cfg.RatePerMinute = tc.rps, tc.rpm
				prov, err := cfg.newProvider(client, &RequestLimiter{})
				if err != nil {
					t.Fatal(err)
				}
				start := time.Now()
				for i := 0; i < tc.calls; i++ {
					_, _, _, err := prov.Complete(context.Background(), llm.CompletionRequest{Messages: []llm.Message{llm.UserText("ping")}})
					if err != nil {
						t.Fatal(err)
					}
				}
				if len(sent) != tc.calls || time.Since(start) != tc.window {
					t.Fatalf("sent %d attempts in %s, want %d in %s", len(sent), time.Since(start), tc.calls, tc.window)
				}
				assertRollingRequestCounts(t, sent, tc.window, tc.limit)
			})
		})
	}
}

func TestProviderRateLimitCountsEmptyResponseRetries(t *testing.T) {
	for _, streaming := range []bool{false, true} {
		name := "complete"
		if streaming {
			name = "stream"
		}
		t.Run(name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				var sent []time.Time
				client := &http.Client{Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
					sent = append(sent, time.Now())
					body := `{"choices":[{"message":{"role":"assistant","content":""},"finish_reason":"stop"}]}`
					if streaming {
						body = "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n"
					}
					return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
				})}
				cfg := ConfigFrom("openai", "test-model", "http://example.invalid", "test-key", "")
				cfg.RatePerMinute = 1
				cfg.Retry.EmptyInterval = time.Millisecond
				prov, err := cfg.newProvider(client, &RequestLimiter{})
				if err != nil {
					t.Fatal(err)
				}
				req := llm.CompletionRequest{Messages: []llm.Message{llm.UserText("ping")}}
				if streaming {
					for range prov.Stream(context.Background(), req) {
					}
				} else {
					prov.Complete(context.Background(), req)
				}
				if len(sent) != 3 {
					t.Fatalf("attempts=%d, want initial + 2 empty retries", len(sent))
				}
				assertRollingRequestCounts(t, sent, time.Minute, 1)
			})
		})
	}
}

func TestRequestLimiterUsesRollingHistory(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		l := &RequestLimiter{}
		if err := l.configure(3, 0); err != nil {
			t.Fatal(err)
		}
		start := time.Now()
		for i := 0; i < 2; i++ {
			if err := l.wait(context.Background()); err != nil {
				t.Fatal(err)
			}
		}
		time.Sleep(750 * time.Millisecond)
		if err := l.wait(context.Background()); err != nil {
			t.Fatal(err)
		}
		time.Sleep(350 * time.Millisecond)
		for i := 0; i < 2; i++ {
			if err := l.wait(context.Background()); err != nil {
				t.Fatal(err)
			}
		}
		// Only the two t=0 attempts expired. The one at t=.75 still counts.
		if err := l.wait(context.Background()); err != nil {
			t.Fatal(err)
		}
		if time.Since(start) != 1750*time.Millisecond {
			t.Fatal("window reset lost an unexpired attempt")
		}
	})
}

func TestRateLimitedTransportCancellationDoesNotSend(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		l := &RequestLimiter{}
		if err := l.configure(0, 1); err != nil {
			t.Fatal(err)
		}
		calls := 0
		tr := rateLimitedTransport{limiter: l, base: roundTripperFunc(func(*http.Request) (*http.Response, error) {
			calls++
			return &http.Response{StatusCode: 200, Body: http.NoBody}, nil
		})}
		req, err := http.NewRequest("POST", "http://example.invalid", nil)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := tr.RoundTrip(req); err != nil {
			t.Fatal(err)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := tr.RoundTrip(req.WithContext(ctx)); !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("got %v", err)
		}
		if calls != 1 {
			t.Fatalf("cancelled waiter sent HTTP request: %d", calls)
		}
	})
}

func TestProviderRateLimitPublicFactory(t *testing.T) {
	for _, format := range []string{"openai", "anthropic", "openai-responses"} {
		for _, streaming := range []bool{false, true} {
			mode := "complete"
			if streaming {
				mode = "stream"
			}
			t.Run(format+"/"+mode, func(t *testing.T) {
				var requests atomic.Int32
				upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					requests.Add(1)
					w.WriteHeader(http.StatusInternalServerError)
					io.WriteString(w, `{"error":{"message":"temporary error"}}`)
				}))
				defer upstream.Close()
				cfg := ConfigFrom(format, "test-model", upstream.URL, "test-key", "")
				cfg.RatePerSecond, cfg.RatePerMinute = 1, 1
				cfg.Retry.ConnectAttempts = -1
				limiter := &RequestLimiter{}
				req := llm.CompletionRequest{Messages: []llm.Message{llm.UserText("ping")}}
				for i := 0; i < 2; i++ {
					// A new public provider factory call must keep the old quota.
					prov, err := cfg.NewProviderWithLimiter(limiter)
					if err != nil {
						t.Fatal(err)
					}
					ctx := context.Background()
					if i == 1 {
						var cancel context.CancelFunc
						ctx, cancel = context.WithTimeout(ctx, 50*time.Millisecond)
						defer cancel()
					}
					if streaming {
						for _, streamErr := range prov.Stream(ctx, req) {
							err = streamErr
						}
					} else {
						_, _, _, err = prov.Complete(ctx, req)
					}
					if err == nil {
						t.Fatal("expected upstream error or quota wait cancellation")
					}
					if i == 1 && !errors.Is(err, context.DeadlineExceeded) {
						t.Fatalf("got %v, want quota wait deadline", err)
					}
				}
				if got := requests.Load(); got != 1 {
					t.Fatalf("provider rebuild sent %d HTTP requests under 1/min", got)
				}
			})
		}
	}
}
