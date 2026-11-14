package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTargetHTTPIdentityOverrides(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	for _, route := range []string{"custom", "repeater"} {
		for _, tc := range []struct {
			name, env, want string
			headers         map[string]string
		}{
			{name: "default"},
			{name: "environment", env: "Captured-UA/1.0", want: "Captured-UA/1.0"},
			{name: "override", env: "Environment-UA/1.0", want: "Explicit-UA/1.0", headers: map[string]string{"user-agent": "Explicit-UA/1.0"}},
			{name: "explicit-empty", env: "Environment-UA/1.0", headers: map[string]string{"User-Agent": ""}},
		} {
			t.Run(route+"/"+tc.name, func(t *testing.T) {
				t.Setenv("ARTEX_HTTP_USER_AGENT", tc.env)
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if got := r.UserAgent(); tc.name == "default" && !strings.HasPrefix(got, "Mozilla/5.0 ") {
						t.Errorf("random UA missing: %q", got)
					} else if tc.name != "default" && got != tc.want {
						t.Errorf("User-Agent = %q, want %q", got, tc.want)
					}
					if _, present := r.Header["User-Agent"]; tc.name == "explicit-empty" && present {
						t.Error("empty User-Agent present on wire")
					}
					w.Write([]byte("ok"))
				}))
				defer server.Close()
				payload := map[string]any{"url": server.URL, "headers": tc.headers, "use_recording_proxy": false}
				if route == "custom" {
					raw, _ := json.Marshal(payload)
					result, err := (&Server{}).runHTTPTool(context.Background(), raw, nil, nil)
					if err != nil || result.IsError {
						t.Fatalf("custom tool: %v %+v", err, result)
					}
				} else {
					status, result, body := repeaterTestSend(t, &Server{}, payload)
					if status != http.StatusOK || result.Status != http.StatusOK {
						t.Fatalf("repeater: %d %s", status, body)
					}
				}
			})
		}
	}
}
