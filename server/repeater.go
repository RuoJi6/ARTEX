package server

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"syscall"
	"time"
)

// Repeater is a Burp-like request/response playground for findings verification.
// It intentionally reuses the same egress proxy plumbing as custom HTTP tools
// (recording proxy / global proxy) so manual verification sees the same path as
// agent traffic.

const (
	repeaterAllowLocalEnv  = "ARTEX_REPEATER_ALLOW_LOCAL"
	repeaterMaxBody        = 2 << 20 // 2 MiB
	repeaterMaxReqBody     = 2 << 20
	repeaterDefaultTimeout = 30_000
	repeaterMinTimeout     = 1_000
	repeaterMaxTimeout     = 120_000
)

var repeaterHopByHop = map[string]bool{
	"Connection":          true,
	"Keep-Alive":          true,
	"Proxy-Connection":    true,
	"Transfer-Encoding":   true,
	"Te":                  true,
	"Trailer":             true,
	"Upgrade":             true,
	"Content-Length":      true, // let Go compute from body
	"Proxy-Authorization": true,
}

type repeaterSendRequest struct {
	Method             string            `json:"method"`
	URL                string            `json:"url"`
	Headers            map[string]string `json:"headers"`
	Body               string            `json:"body"`
	TimeoutMs          int               `json:"timeout_ms"`
	InsecureSkipVerify bool              `json:"insecure_skip_verify"`
	UseRecordingProxy  *bool             `json:"use_recording_proxy"`
}

type repeaterSendResponse struct {
	Status        int                 `json:"status"`
	StatusText    string              `json:"status_text"`
	Proto         string              `json:"proto"`
	Headers       map[string][]string `json:"headers"`
	Body          string              `json:"body"`
	BodyTruncated bool                `json:"body_truncated"`
	BodyBytes     int                 `json:"body_bytes"`
	ElapsedMs     int64               `json:"elapsed_ms"`
	URL           string              `json:"url"`
	Error         string              `json:"error,omitempty"`
}

func (s *Server) registerRepeater(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/repeater/send", s.sendRepeater)
}

func (s *Server) sendRepeater(w http.ResponseWriter, r *http.Request) {
	var req repeaterSendRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, repeaterMaxReqBody)).Decode(&req); err != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = http.MethodGet
	}
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch,
		http.MethodDelete, http.MethodHead, http.MethodOptions:
	default:
		writeErr(w, 400, "不支持的 HTTP 方法")
		return
	}
	rawURL := strings.TrimSpace(req.URL)
	if rawURL == "" {
		writeErr(w, 400, "url 必填")
		return
	}
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme == "" || u.Host == "" {
		writeErr(w, 400, "url 非法")
		return
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		writeErr(w, 400, "仅支持 http/https")
		return
	}
	if err := repeaterRejectSensitiveURL(u); err != nil {
		writeErr(w, 400, err.Error())
		return
	}

	timeoutMs := req.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = repeaterDefaultTimeout
	}
	if timeoutMs < repeaterMinTimeout {
		timeoutMs = repeaterMinTimeout
	}
	if timeoutMs > repeaterMaxTimeout {
		timeoutMs = repeaterMaxTimeout
	}

	useProxy := true
	if req.UseRecordingProxy != nil {
		useProxy = *req.UseRecordingProxy
	}

	var bodyReader io.Reader
	if req.Body != "" && method != http.MethodHead {
		bodyReader = strings.NewReader(req.Body)
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(ctx, method, u.String(), bodyReader)
	if err != nil {
		writeErr(w, 400, "构造请求失败: "+err.Error())
		return
	}
	for k, v := range req.Headers {
		name := strings.TrimSpace(k)
		if name == "" {
			continue
		}
		if repeaterHopByHop[http.CanonicalHeaderKey(name)] {
			continue
		}
		if strings.EqualFold(name, "Host") {
			httpReq.Host = strings.TrimSpace(v)
			continue
		}
		httpReq.Header.Set(name, v)
	}

	client := &http.Client{
		Timeout:   time.Duration(timeoutMs) * time.Millisecond,
		Transport: s.repeaterTransport(useProxy, req.InsecureSkipVerify),
		CheckRedirect: func(next *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return errors.New("重定向次数过多")
			}
			if len(via) > 0 && next.URL.Host != via[0].URL.Host {
				return fmt.Errorf("拒绝跨主机重定向（%s → %s）", via[0].URL.Host, next.URL.Host)
			}
			return nil
		},
	}

	started := time.Now()
	resp, err := client.Do(httpReq)
	elapsed := time.Since(started).Milliseconds()
	if err != nil {
		writeJSON(w, 200, repeaterSendResponse{
			ElapsedMs: elapsed,
			URL:       u.String(),
			Headers:   map[string][]string{},
			Error:     repeaterRedactErr(err),
		})
		return
	}
	defer resp.Body.Close()

	limited := io.LimitReader(resp.Body, repeaterMaxBody+1)
	raw, readErr := io.ReadAll(limited)
	truncated := false
	if len(raw) > repeaterMaxBody {
		raw = raw[:repeaterMaxBody]
		truncated = true
	}
	bodyStr := string(bytes.ToValidUTF8(raw, []byte("�")))
	out := repeaterSendResponse{
		Status:        resp.StatusCode,
		StatusText:    resp.Status,
		Proto:         resp.Proto,
		Headers:       resp.Header.Clone(),
		Body:          bodyStr,
		BodyTruncated: truncated,
		BodyBytes:     len(raw),
		ElapsedMs:     elapsed,
		URL:           resp.Request.URL.String(),
	}
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		out.Error = "读取响应失败: " + readErr.Error()
	}
	writeJSON(w, 200, out)
}

// repeaterTransport builds the outbound Transport: recording/global proxy when
// requested. Dial-time SSRF guard is attached only on the DIRECT path — when a
// proxy is configured, DialContext reaches the proxy (often 127.0.0.1 MITM), so
// blocking loopback there would break Repeater entirely. Literal blocked IPs in
// the request URL are still rejected up-front in sendRepeater.
func (s *Server) repeaterTransport(useRecordingProxy, insecure bool) http.RoundTripper {
	var base *http.Transport
	viaProxy := false
	if useRecordingProxy {
		if tr := s.httpProxyTransport(httpExec{UseRecordingProxy: true}); tr != nil {
			base = tr
			viaProxy = true
		}
	}
	if base == nil {
		if gp := strings.TrimSpace(s.m.GlobalProxy()); gp != "" {
			if tr := s.httpProxyTransport(httpExec{Proxy: gp}); tr != nil {
				base = tr
				viaProxy = true
			}
		}
	}
	if base == nil {
		if dt, ok := http.DefaultTransport.(*http.Transport); ok {
			base = dt.Clone()
		} else {
			base = &http.Transport{}
		}
	} else {
		base = base.Clone()
	}
	if !viaProxy {
		base.DialContext = (&net.Dialer{
			Timeout:   15 * time.Second,
			KeepAlive: 30 * time.Second,
			Control:   repeaterBlockSensitiveDial,
		}).DialContext
	}
	if insecure {
		if base.TLSClientConfig == nil {
			base.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // user-opted for pentest targets
		} else {
			cfg := base.TLSClientConfig.Clone()
			cfg.InsecureSkipVerify = true
			base.TLSClientConfig = cfg
		}
	}
	return base
}

// repeaterRejectSensitiveURL blocks literal loopback / link-local / metadata
// addresses in the request URL. Hostname targets are still covered at dial time
// on the direct path (DNS rebinding). When egress goes through a proxy, this
// precheck is the primary SSRF gate for literal IPs.
func repeaterRejectSensitiveURL(u *url.URL) error {
	if repeaterAllowLocal() {
		return nil
	}
	host := u.Hostname()
	ip := net.ParseIP(host)
	if ip == nil {
		return nil
	}
	if repeaterIsBlockedDialIP(ip) {
		return fmt.Errorf("拒绝访问本机/链路本地地址 %s（如确需访问本机服务，设置 %s=1）", ip, repeaterAllowLocalEnv)
	}
	return nil
}

func repeaterAllowLocal() bool {
	v := strings.TrimSpace(os.Getenv(repeaterAllowLocalEnv))
	return v == "1" || strings.EqualFold(v, "true")
}

func repeaterIsBlockedDialIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	}
	return ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast()
}

// repeaterBlockSensitiveDial is the dial-time SSRF guard for Repeater.
// See notify/http.go blockInternalDial for the shared rationale: stop the
// authenticated UI from using ARTEX as a trampoline onto loopback / cloud
// metadata, while still allowing RFC1918 private targets common in pentests.
func repeaterBlockSensitiveDial(_, address string, _ syscall.RawConn) error {
	if repeaterAllowLocal() {
		return nil
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return fmt.Errorf("无法解析目标地址 %q", host)
	}
	if repeaterIsBlockedDialIP(ip) {
		return fmt.Errorf("拒绝访问本机/链路本地地址 %s（如确需访问本机服务，设置 %s=1）", ip, repeaterAllowLocalEnv)
	}
	return nil
}

func repeaterRedactErr(err error) string {
	var uerr *url.Error
	if errors.As(err, &uerr) {
		host := ""
		if u, parseErr := url.Parse(uerr.URL); parseErr == nil {
			host = u.Host
		}
		if uerr.Err != nil {
			return fmt.Sprintf("%s %s: %s", uerr.Op, host, uerr.Err)
		}
		return fmt.Sprintf("%s %s: 未知错误", uerr.Op, host)
	}
	return err.Error()
}
