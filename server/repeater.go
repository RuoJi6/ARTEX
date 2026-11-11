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
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/Autumn-27/artex/internal/httpidentity"
)

const (
	repeaterMaxBody        = 2 << 20 // 2 MiB, for both the JSON request and response preview
	repeaterDefaultTimeout = 30_000
	repeaterMinTimeout     = 1_000
	repeaterMaxTimeout     = 120_000
	repeaterAllowLocalEnv  = "ARTEX_REPEATER_ALLOW_LOCAL"
)

var repeaterHopByHop = map[string]struct{}{
	"Connection": {}, "Keep-Alive": {}, "Proxy-Connection": {}, "Transfer-Encoding": {},
	"Te": {}, "Trailer": {}, "Upgrade": {}, "Content-Length": {}, "Proxy-Authorization": {},
}

type repeaterSendRequest struct {
	HTTPVersion        string            `json:"http_version"`
	Method             *string           `json:"method"`
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
	var in repeaterSendRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, repeaterMaxBody))
	if err := dec.Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "请求体无效")
		return
	}
	// Reject a second JSON value (or oversized trailing data) instead of silently
	// accepting bytes beyond the documented 2 MiB request limit.
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		writeErr(w, http.StatusBadRequest, "请求体无效")
		return
	}

	method := http.MethodGet
	if in.Method != nil {
		method = strings.ToUpper(strings.TrimSpace(*in.Method))
	}
	if method == "" {
		writeErr(w, http.StatusBadRequest, "HTTP 方法不能为空")
		return
	}
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch,
		http.MethodDelete, http.MethodHead, http.MethodOptions:
	default:
		writeErr(w, http.StatusBadRequest, "不支持的 HTTP 方法")
		return
	}

	switch in.HTTPVersion {
	case "", "HTTP/1.1", "HTTP/2.0":
	default:
		writeErr(w, http.StatusBadRequest, "当前支持 HTTP/1.1 和 HTTP/2.0")
		return
	}

	rawURL := strings.TrimSpace(in.URL)
	if rawURL == "" {
		writeErr(w, http.StatusBadRequest, "url 必填")
		return
	}
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" || u.Hostname() == "" ||
		!strings.EqualFold(u.Scheme, "http") && !strings.EqualFold(u.Scheme, "https") {
		writeErr(w, http.StatusBadRequest, "仅支持绝对 http/https URL")
		return
	}
	// This check is needed even when a proxy is used: the proxy must remain usable
	// for normal targets, while obvious literal metadata/loopback URLs stay blocked.
	if err := repeaterCheckURL(u); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	timeoutMs := in.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = repeaterDefaultTimeout
	}
	if timeoutMs < repeaterMinTimeout {
		timeoutMs = repeaterMinTimeout
	}
	if timeoutMs > repeaterMaxTimeout {
		timeoutMs = repeaterMaxTimeout
	}
	useRecordingProxy := true
	if in.UseRecordingProxy != nil {
		useRecordingProxy = *in.UseRecordingProxy
	}

	var body io.Reader
	if in.Body != "" && method != http.MethodHead {
		body = strings.NewReader(in.Body)
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, u.String(), body)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "构造请求失败")
		return
	}
	httpidentity.Apply(req)
	for key, value := range in.Headers {
		name := strings.TrimSpace(key)
		if name == "" {
			continue
		}
		if _, blocked := repeaterHopByHop[http.CanonicalHeaderKey(name)]; blocked {
			continue
		}
		if strings.EqualFold(name, "Host") {
			// Host is a special Request field, but retaining it in Header too makes
			// the editor semantics explicit; net/http uses req.Host on the wire.
			req.Host = strings.TrimSpace(value)
			req.Header.Set("Host", strings.TrimSpace(value))
			continue
		}
		req.Header.Set(name, value)
	}

	transport := s.repeaterTransport(useRecordingProxy, in.InsecureSkipVerify)
	if in.HTTPVersion != "" {
		tr := transport.(*http.Transport)
		// Keep TLS ALPN consistent with the explicit protocol, even when an
		// inherited transport previously advertised h2.
		if tr.TLSClientConfig == nil {
			tr.TLSClientConfig = &tls.Config{}
		} else {
			tr.TLSClientConfig = tr.TLSClientConfig.Clone()
		}
		tr.TLSClientConfig.NextProtos = []string{"http/1.1"}
		if in.HTTPVersion == "HTTP/2.0" {
			tr.TLSClientConfig.NextProtos = []string{"h2"}
		}
		tr.ForceAttemptHTTP2 = in.HTTPVersion == "HTTP/2.0"
		tr.Protocols = new(http.Protocols)
		tr.Protocols.SetHTTP1(in.HTTPVersion == "HTTP/1.1")
		tr.Protocols.SetHTTP2(in.HTTPVersion == "HTTP/2.0")
		tr.Protocols.SetUnencryptedHTTP2(in.HTTPVersion == "HTTP/2.0" && strings.EqualFold(u.Scheme, "http"))
	}

	client := &http.Client{
		Timeout:   time.Duration(timeoutMs) * time.Millisecond,
		Transport: transport,
		CheckRedirect: func(next *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return errors.New("重定向次数过多")
			}
			if err := repeaterCheckURL(next.URL); err != nil {
				return err
			}
			if len(via) > 0 && !strings.EqualFold(next.URL.Host, via[0].URL.Host) {
				return fmt.Errorf("拒绝跨主机重定向（%s → %s）", via[0].URL.Host, next.URL.Host)
			}
			return nil
		},
	}
	// Each send owns its transport. Registered before Body.Close so idle
	// connections are released after the response body, including on errors.
	defer client.CloseIdleConnections()

	started := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, repeaterSendResponse{
			Headers: map[string][]string{}, URL: u.String(),
			ElapsedMs: time.Since(started).Milliseconds(), Error: repeaterRedactError(err),
		})
		return
	}
	defer resp.Body.Close()

	out := repeaterSendResponse{
		Status: resp.StatusCode, StatusText: resp.Status, Proto: resp.Proto,
		Headers: resp.Header.Clone(), URL: resp.Request.URL.String(),
	}
	if method != http.MethodHead {
		// Read one byte beyond the cap so truncation is exact. The MVP keeps the
		// preview as UTF-8 text; invalid bytes are replaced instead of base64.
		data, readErr := io.ReadAll(io.LimitReader(resp.Body, repeaterMaxBody+1))
		if len(data) > repeaterMaxBody {
			out.BodyTruncated = true
			data = data[:repeaterMaxBody]
		}
		out.Body = repeaterBodyText(data)
		out.BodyBytes = len(data)
		if readErr != nil && !errors.Is(readErr, io.EOF) {
			out.Error = "读取响应失败: " + readErr.Error()
		}
	}
	out.ElapsedMs = time.Since(started).Milliseconds()
	writeJSON(w, http.StatusOK, out)
}

// repeaterBodyText keeps the response preview as text for the MVP. Invalid
// UTF-8 and NUL bytes are replaced so a binary response cannot inject control
// characters into the JSON/UI raw view; the original bytes are not base64
// encoded and the preview remains bounded by repeaterMaxBody.
func repeaterBodyText(data []byte) string {
	text := string(bytes.ToValidUTF8(data, []byte("�")))
	return strings.ReplaceAll(text, "\x00", "�")
}

func (s *Server) repeaterTransport(useRecordingProxy, insecure bool) http.RoundTripper {
	var transport *http.Transport
	proxied := false
	if useRecordingProxy && s != nil && s.m != nil {
		transport = s.httpProxyTransport(httpExec{UseRecordingProxy: true})
		proxied = transport != nil
	}
	if transport == nil && s != nil && s.m != nil && strings.TrimSpace(s.m.GlobalProxy()) != "" {
		transport = s.httpProxyTransport(httpExec{Proxy: s.m.GlobalProxy()})
		proxied = transport != nil
	}
	if transport == nil {
		if base, ok := http.DefaultTransport.(*http.Transport); ok {
			transport = base.Clone()
		} else {
			transport = &http.Transport{}
		}
		// "Direct" means direct even if the process inherited HTTP_PROXY. The
		// configured recording/global proxy paths are handled above explicitly.
		transport.Proxy = nil
	}
	transport = transport.Clone()
	// Keep response bytes faithful and make body_bytes match what was received;
	// transparent gzip decompression would otherwise obscure both values.
	transport.DisableCompression = true
	// Use the request's timeout_ms budget instead of inherited phase deadlines.
	transport.TLSHandshakeTimeout = 0
	transport.ExpectContinueTimeout = 0
	if !proxied {
		// Clear a custom TLS dialer before installing the guarded dialer; when
		// DialTLSContext is set, net/http bypasses DialContext entirely.
		transport.DialTLSContext = nil
		transport.DialTLS = nil
		transport.Dial = nil
		// Let the request context enforce timeout_ms for the entire dial.
		transport.DialContext = (&net.Dialer{
			KeepAlive: 30 * time.Second,
			Control:   repeaterBlockSensitiveDial,
		}).DialContext
	}
	if insecure {
		cfg := &tls.Config{InsecureSkipVerify: true} //nolint:gosec // explicit user option for pentest targets
		if transport.TLSClientConfig != nil {
			cfg = transport.TLSClientConfig.Clone()
			cfg.InsecureSkipVerify = true
		}
		transport.TLSClientConfig = cfg
	}
	return transport
}

func repeaterAllowLocal() bool {
	v := strings.TrimSpace(os.Getenv(repeaterAllowLocalEnv))
	return v == "1" || strings.EqualFold(v, "true")
}

func repeaterCheckURL(u *url.URL) error {
	if repeaterAllowLocal() {
		return nil
	}
	host := strings.TrimSuffix(strings.TrimSpace(u.Hostname()), ".")
	// URL.Hostname may retain an IPv6 zone (for example fe80::1%eth0); the
	// zone is not part of the address classification.
	if zone := strings.IndexByte(host, '%'); zone >= 0 {
		host = host[:zone]
	}
	ip := net.ParseIP(host)
	if ip == nil && repeaterLooksNumericHost(host) {
		var ok bool
		ip, ok = repeaterParseLegacyIPv4(host)
		if !ok {
			return fmt.Errorf("拒绝无法解析的数字主机地址 %q", host)
		}
	}
	if strings.EqualFold(host, "localhost") || (ip != nil && repeaterIsBlockedDialIP(ip)) {
		return fmt.Errorf("拒绝访问本机/链路本地地址（如确需访问本机服务，设置 %s=1）", repeaterAllowLocalEnv)
	}
	return nil
}

// repeaterLooksNumericHost identifies the legacy numeric spellings accepted by
// common proxy/resolver implementations (decimal, octal, hexadecimal and
// dotted inet_aton forms). A numeric-looking value that fails to parse is
// rejected instead of being handed to a proxy for its own interpretation.
func repeaterLooksNumericHost(host string) bool {
	if host == "" || host[0] < '0' || host[0] > '9' {
		return false
	}
	for i := 0; i < len(host); i++ {
		c := host[i]
		switch {
		case c == '.':
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f', c >= 'A' && c <= 'F':
		case c == 'x' || c == 'X':
		default:
			return false
		}
	}
	return true
}

// repeaterParseLegacyIPv4 follows inet_aton's 1-, 2-, 3- and 4-part IPv4
// notation. Parts with a leading zero are octal and parts with 0x are hex.
func repeaterParseLegacyIPv4(host string) (net.IP, bool) {
	parts := strings.Split(host, ".")
	if len(parts) < 1 || len(parts) > 4 {
		return nil, false
	}
	values := make([]uint64, len(parts))
	for i, part := range parts {
		if part == "" {
			return nil, false
		}
		base := 10
		digits := part
		if len(digits) > 2 && digits[0] == '0' && (digits[1] == 'x' || digits[1] == 'X') {
			base, digits = 16, digits[2:]
		} else if len(digits) > 1 && digits[0] == '0' {
			base = 8
		}
		if digits == "" {
			return nil, false
		}
		value, err := strconv.ParseUint(digits, base, 32)
		if err != nil {
			return nil, false
		}
		values[i] = value
	}
	var value uint64
	switch len(values) {
	case 1:
		value = values[0]
	case 2:
		if values[0] > 0xff || values[1] > 0xffffff {
			return nil, false
		}
		value = values[0]<<24 | values[1]
	case 3:
		if values[0] > 0xff || values[1] > 0xff || values[2] > 0xffff {
			return nil, false
		}
		value = values[0]<<24 | values[1]<<16 | values[2]
	case 4:
		for _, part := range values {
			if part > 0xff {
				return nil, false
			}
		}
		value = values[0]<<24 | values[1]<<16 | values[2]<<8 | values[3]
	}
	if value > 0xffffffff {
		return nil, false
	}
	return net.IPv4(byte(value>>24), byte(value>>16), byte(value>>8), byte(value)), true
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

func repeaterRedactError(err error) string {
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		host := ""
		if parsed, parseErr := url.Parse(urlErr.URL); parseErr == nil {
			host = parsed.Host
		}
		if urlErr.Err != nil {
			return fmt.Sprintf("%s %s: %s", urlErr.Op, host, urlErr.Err)
		}
		return fmt.Sprintf("%s %s: 未知错误", urlErr.Op, host)
	}
	return err.Error()
}
