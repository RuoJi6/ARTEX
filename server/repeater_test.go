package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestRepeaterIsBlockedDialIP(t *testing.T) {
	blocked := []string{"127.0.0.1", "::1", "169.254.169.254", "169.254.1.1", "0.0.0.0", "224.0.0.1"}
	for _, raw := range blocked {
		if !repeaterIsBlockedDialIP(net.ParseIP(raw)) {
			t.Errorf("expected %s blocked", raw)
		}
	}
	allowed := []string{"8.8.8.8", "10.0.0.1", "192.168.1.1", "172.16.0.5"}
	for _, raw := range allowed {
		if repeaterIsBlockedDialIP(net.ParseIP(raw)) {
			t.Errorf("expected %s allowed", raw)
		}
	}
}

func TestSendRepeaterRejectsBadInput(t *testing.T) {
	s := &Server{}
	cases := []struct {
		name string
		body string
		want int
	}{
		{"missing url", `{"method":"GET"}`, 400},
		{"bad scheme", `{"method":"GET","url":"file:///etc/passwd"}`, 400},
		{"bad method", `{"method":"TRACE","url":"http://example.com"}`, 400},
		{"gopher", `{"method":"GET","url":"gopher://example.com/1"}`, 400},
		{"literal metadata", `{"method":"GET","url":"http://169.254.169.254/latest/meta-data/"}`, 400},
		{"literal loopback", `{"method":"GET","url":"http://127.0.0.1:9/"}`, 400},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/api/repeater/send", strings.NewReader(tc.body))
			w := httptest.NewRecorder()
			s.sendRepeater(w, r)
			if w.Code != tc.want {
				t.Fatalf("status=%d want=%d body=%s", w.Code, tc.want, w.Body.String())
			}
		})
	}
}

func TestSendRepeaterRoundTripWithAllowLocal(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	var sawMethod, sawHeader, sawBody string
	var sawHost string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawMethod = r.Method
		sawHost = r.Host
		sawHeader = r.Header.Get("X-Test")
		b, _ := io.ReadAll(r.Body)
		sawBody = string(b)
		w.Header().Set("X-Echo", "ok")
		w.Header().Set("Content-Type", "text/plain")
		_, _ = io.WriteString(w, "hello-repeater")
	}))
	defer srv.Close()

	s := &Server{m: &Manager{}}
	payload := map[string]any{
		"method":              "POST",
		"url":                 srv.URL + "/echo",
		"headers":             map[string]string{"X-Test": "v1", "Host": strings.TrimPrefix(srv.URL, "http://"), "Connection": "keep-alive", "Content-Length": "9999"},
		"body":                "payload",
		"use_recording_proxy": false,
	}
	raw, _ := json.Marshal(payload)
	r := httptest.NewRequest(http.MethodPost, "/api/repeater/send", bytes.NewReader(raw))
	w := httptest.NewRecorder()
	s.sendRepeater(w, r)
	if w.Code != 200 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var out repeaterSendResponse
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Error != "" {
		t.Fatalf("unexpected error: %s", out.Error)
	}
	if out.Status != 200 || out.Body != "hello-repeater" {
		t.Fatalf("bad response: %+v", out)
	}
	if sawMethod != "POST" || sawHeader != "v1" || sawBody != "payload" {
		t.Fatalf("server saw method=%q header=%q body=%q", sawMethod, sawHeader, sawBody)
	}
	if sawHost == "" {
		t.Fatal("expected Host to be set")
	}
	if out.Headers["X-Echo"] == nil || out.Headers["X-Echo"][0] != "ok" {
		t.Fatalf("missing echo header: %+v", out.Headers)
	}
}

func TestSendRepeaterBlocksLoopbackByDefault(t *testing.T) {
	_ = os.Unsetenv(repeaterAllowLocalEnv)
	t.Setenv(repeaterAllowLocalEnv, "")
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("handler should not be reached")
	}))
	defer srv.Close()

	s := &Server{m: &Manager{}}
	payload := map[string]any{
		"method":              "GET",
		"url":                 srv.URL, // httptest listens on 127.0.0.1
		"use_recording_proxy": false,
	}
	raw, _ := json.Marshal(payload)
	r := httptest.NewRequest(http.MethodPost, "/api/repeater/send", bytes.NewReader(raw))
	w := httptest.NewRecorder()
	s.sendRepeater(w, r)
	// Literal loopback is rejected before dial.
	if w.Code != 400 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "本机") && !strings.Contains(w.Body.String(), "拒绝") {
		t.Fatalf("error should mention block: %s", w.Body.String())
	}
}
