package server

// egress_probe_test.go —— 出口探测的离线测试。
// 所有服务都由 httptest 在本地起，不访问真实外网——否则 CI 会因网络抖动随机失败。

import (
	"context"
	"encoding/pem"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// fakeIPServer 起一个假的 IP 回显服务。用文档专用网段，避免与真实地址混淆。
func fakeIPServer(ip string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ip":"` + ip + `"}`))
	}))
}

// TestProbeEgress 覆盖 probeEgress 的输入/响应形态：成功、非法协议、死代理、坏响应、回落。
// 每条用例自带服务端与断言，失败时 t.Run 的名字直接指出是哪一条。
func TestProbeEgress(t *testing.T) {
	okSrv := fakeIPServer("203.0.113.7")
	defer okSrv.Close()
	htmlSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("<html><body>access denied</body></html>"))
	}))
	defer htmlSrv.Close()
	deniedSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusForbidden)
	}))
	defer deniedSrv.Close()
	fallbackSrv := fakeIPServer("203.0.113.42")
	defer fallbackSrv.Close()
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Host {
		case strings.TrimPrefix(okSrv.URL, "http://"):
			_, _ = w.Write([]byte(`{"ip":"203.0.113.7"}`))
		case strings.TrimPrefix(htmlSrv.URL, "http://"):
			_, _ = w.Write([]byte("<html><body>access denied</body></html>"))
		case strings.TrimPrefix(deniedSrv.URL, "http://"):
			http.Error(w, "nope", http.StatusForbidden)
		case strings.TrimPrefix(fallbackSrv.URL, "http://"):
			_, _ = w.Write([]byte(`{"ip":"203.0.113.42"}`))
		default:
			http.Error(w, "unknown target", http.StatusBadGateway)
		}
	}))
	defer proxy.Close()

	cases := []struct {
		name    string
		proxy   string
		probes  []string
		timeout time.Duration
		check   func(t *testing.T, res egressProbeResult)
	}{
		{
			name: "经代理拿到 IP", proxy: proxy.URL, probes: []string{okSrv.URL}, timeout: 5 * time.Second,
			check: func(t *testing.T, res egressProbeResult) {
				if !res.OK || res.ExitIP != "203.0.113.7" || res.Via != "http" {
					t.Fatalf("得到 %+v，期望成功且 via=http、IP=203.0.113.7", res)
				}
			},
		},
		{
			// 用耗时断言确认它没有真的去连网络。
			name: "非法协议在本地就被拒", proxy: "ftp://127.0.0.1:21", probes: nil, timeout: time.Second,
			check: func(t *testing.T, res egressProbeResult) {
				if res.OK || res.Error == "" {
					t.Fatalf("非法协议应失败并带回原因，得到 %+v", res)
				}
				if res.LatencyMS > 500 {
					t.Fatalf("格式校验应在本地完成，耗时 %dms 偏大", res.LatencyMS)
				}
				// nil slice 会序列化成 JSON null，前端按数组处理会崩。
				if res.Probes == nil {
					t.Fatal("probes 不应为 nil（序列化后是 null）")
				}
			},
		},
		{
			// 本次贡献的核心回归：格式合法但端口没开，必须能识别出来。
			name: "死代理带回原因", proxy: "socks5://127.0.0.1:1",
			probes: []string{"http://example.invalid"}, timeout: 2 * time.Second,
			check: func(t *testing.T, res egressProbeResult) {
				if res.OK {
					t.Fatal("死代理不该成功")
				}
				if len(res.Probes) == 0 || res.Probes[0].Error == "" {
					t.Fatalf("应至少尝试一次并带回原因，得到 %+v", res.Probes)
				}
			},
		},
		{
			name: "HTML 不被当成 IP", proxy: proxy.URL, probes: []string{htmlSrv.URL}, timeout: 5 * time.Second,
			check: func(t *testing.T, res egressProbeResult) {
				if res.OK {
					t.Fatalf("反爬页/错误页不该被当成 IP，实际 exit_ip=%q", res.ExitIP)
				}
			},
		},
		{
			name: "第一个地址失败自动换下一个", proxy: proxy.URL,
			probes: []string{deniedSrv.URL, fallbackSrv.URL}, timeout: 5 * time.Second,
			check: func(t *testing.T, res egressProbeResult) {
				if !res.OK || res.ExitIP != "203.0.113.42" {
					t.Fatalf("应回落到第二个地址并成功，得到 %+v", res)
				}
				if len(res.Probes) != 2 {
					t.Fatalf("应记录两次尝试，实际 %d 次", len(res.Probes))
				}
			},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			c.check(t, probeEgress(context.Background(), c.proxy, "", c.probes, c.timeout))
		})
	}
}

// TestProbeEgressThroughProxy 验证请求**确实经过了代理**，并顺带确认 via / via_label 一起填好。
//
// 断言的是"代理收到了请求"，不是"结果对不对"：如果忘了设 Transport.Proxy，
// 探测照样成功（直连拿到 IP），形成"看起来走了代理其实没走"的假象。
// 这里的假代理不转发，直接回一个 IP——明文 HTTP 走代理时 Go 会把绝对 URI 发给它。
func TestProbeEgressThroughProxy(t *testing.T) {
	var proxied int32
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&proxied, 1)
		_, _ = w.Write([]byte(`{"ip":"198.51.100.9"}`))
	}))
	defer proxy.Close()

	res := probeEgress(context.Background(), proxy.URL, "", []string{"http://example.invalid/ip"}, 5*time.Second)
	if !res.OK {
		t.Fatalf("经代理探测应成功: %s / %+v", res.Error, res.Probes)
	}
	if atomic.LoadInt32(&proxied) == 0 {
		t.Fatal("代理没有收到任何请求 —— 说明 Transport 没走代理")
	}
	if res.ExitIP != "198.51.100.9" {
		t.Fatalf("出口 IP = %q，期望代理返回的 198.51.100.9", res.ExitIP)
	}
	if res.Via != "http" || res.ViaLabel != "HTTP 代理" {
		t.Fatalf("via/via_label 不正确：%q / %q", res.Via, res.ViaLabel)
	}
}

// TestProbeEgressTrustsCustomCA 模拟"经 MITM"的关键路径：
// 不传 CA 必须失败（证明信任这一步是必需的），传了才成功。
func TestProbeEgressTrustsCustomCA(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"ip":"192.0.2.5"}`))
	}))
	defer srv.Close()

	caPath := filepath.Join(t.TempDir(), "ca.pem")
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srv.Certificate().Raw})
	if err := os.WriteFile(caPath, pemBytes, 0o600); err != nil {
		t.Fatal(err)
	}

	if res := probeEgress(context.Background(), "", "", []string{srv.URL}, 5*time.Second); res.OK {
		t.Fatal("不信任自签 CA 时不该成功")
	}
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodConnect {
			http.Error(w, "CONNECT required", http.StatusMethodNotAllowed)
			return
		}
		upstream, err := net.Dial("tcp", r.Host)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		client, rw, err := http.NewResponseController(w).Hijack()
		if err != nil {
			_ = upstream.Close()
			return
		}
		_, _ = fmt.Fprint(rw, "HTTP/1.1 200 Connection Established\r\n\r\n")
		_ = rw.Flush()
		go func() {
			_, _ = io.Copy(upstream, client)
			_ = upstream.Close()
		}()
		_, _ = io.Copy(client, upstream)
		_ = client.Close()
	}))
	defer proxy.Close()
	res := probeEgress(context.Background(), proxy.URL, caPath, []string{srv.URL}, 5*time.Second)
	if !res.OK || res.ExitIP != "192.0.2.5" {
		t.Fatalf("信任 CA 后应拿到 IP，得到 %+v / %+v", res.Error, res.Probes)
	}
}

// TestJudgeEgress 验证"整体通过"的判定口径：配了代理以 ② 为准，② 被跳过才看 ①。
func TestJudgeEgress(t *testing.T) {
	ok := egressProbeResult{OK: true, ExitIP: "1.2.3.4"}
	bad := egressProbeResult{OK: false, Error: "x"}

	cases := []struct {
		name string
		rep  egressReport
		want bool
	}{
		{"没配代理：只有 ① 直连", egressReport{Checks: []egressCheck{
			{Key: "direct", Result: ok}, {Key: "global", Skipped: true},
		}}, true},
		{"配了代理且通", egressReport{Checks: []egressCheck{
			{Key: "direct", Result: ok}, {Key: "global", Result: ok},
		}}, true},
		// 关键口径：直连通、代理不通，整体必须不通过，否则会显示绿灯。
		{"直连通但代理不通", egressReport{Checks: []egressCheck{
			{Key: "direct", Result: ok}, {Key: "global", Result: bad},
		}}, false},
		{"代理通、直连不通", egressReport{Checks: []egressCheck{
			{Key: "direct", Result: bad}, {Key: "global", Result: ok},
		}}, true},
		{"两行都失败", egressReport{Checks: []egressCheck{
			{Key: "direct", Result: bad}, {Key: "global", Result: bad},
		}}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := judgeEgress(c.rep); got != c.want {
				t.Fatalf("got %v want %v", got, c.want)
			}
		})
	}
}

// TestEgressWarnings 覆盖五条提醒的触发与"不该触发"。
// 每条用例声明"必须出现"和"必须不出现"的子串，正反两面一起锁。
func TestEgressWarnings(t *testing.T) {
	okChecks := []egressCheck{
		{Key: "direct", Result: egressProbeResult{OK: true, ExitIP: "9.9.9.9"}},
		{Key: "global", Result: egressProbeResult{OK: true, ExitIP: "8.8.8.8"}},
	}
	sameIP := []egressCheck{
		{Key: "direct", Result: egressProbeResult{OK: true, ExitIP: "9.9.9.9"}},
		{Key: "global", Result: egressProbeResult{OK: true, ExitIP: "9.9.9.9"}},
	}
	proxyDown := []egressCheck{
		{Key: "direct", Result: egressProbeResult{OK: true, ExitIP: "9.9.9.9"}},
		{Key: "global", Result: egressProbeResult{OK: false, Error: "connection refused"}},
	}

	cases := []struct {
		name    string
		rep     egressReport
		pending bool
		saved   string
		want    string // 必须出现的子串（空 = 不检查）
		wantNot string // 必须不出现的子串
	}{
		{"W2 关捕获 + socks5", egressReport{Capture: false, Configured: "socks5://1.2.3.4:1080", Checks: okChecks},
			false, "socks5://1.2.3.4:1080", "python urllib", ""},
		{"W2 不误报：已保存走的是 http", egressReport{Capture: false, Configured: "socks5://1.2.3.4:1080", Checks: okChecks},
			true, "http://1.2.3.4:8080", "", "python urllib"},
		{"W2 不漏报：已保存才是 socks5", egressReport{Capture: false, Configured: "http://1.2.3.4:8080", Checks: okChecks},
			true, "socks5://1.2.3.4:1080", "python urllib", ""},
		{"W2 ② 没通时不提", egressReport{Capture: false, Configured: "socks5://1.2.3.4:1080", Checks: proxyDown},
			false, "socks5://1.2.3.4:1080", "", "python urllib"},
		{"W3 两行 IP 相同", egressReport{Configured: "http://1.2.3.4:8080", Checks: sameIP},
			false, "", "出口 IP 相同", ""},
		{"W3 不误报：IP 不同", egressReport{Configured: "http://1.2.3.4:8080", Checks: okChecks},
			false, "", "", "出口 IP 相同"},
		{"W4 捕获开 + 无代理", egressReport{Capture: true, Configured: ""},
			false, "", "直连", ""},
		{"W4 不误报：已保存还有代理", egressReport{Capture: true, Configured: ""},
			true, "http://1.2.3.4:8080", "", "全局代理为空"},
		{"W1 表单值未保存", egressReport{Capture: false, Configured: "socks5://1.2.3.4:1080"},
			true, "", "尚未保存", ""},
		{"W5 回环 127.0.0.1", egressReport{Configured: "http://127.0.0.1:7897"},
			false, "", "回环地址", ""},
		{"W5 回环 localhost", egressReport{Configured: "socks5://localhost:1080"},
			false, "", "回环地址", ""},
		{"W5 不误报：局域网地址", egressReport{Configured: "http://192.168.1.5:8080"},
			false, "", "", "回环地址"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := egressWarnings(c.rep, c.pending, c.saved)
			if c.want != "" && !hasSubstr(w, c.want) {
				t.Fatalf("应包含 %q，实际 %v", c.want, w)
			}
			if c.wantNot != "" && hasSubstr(w, c.wantNot) {
				t.Fatalf("不该包含 %q，实际 %v", c.wantNot, w)
			}
		})
	}
}

// TestSchemeLabel 保证界面不会出现"经 http"这种看不懂的片段。
func TestSchemeLabel(t *testing.T) {
	cases := map[string]string{
		"http":    "HTTP 代理",
		"HTTPS":   "HTTPS 代理", // 大小写不敏感
		"socks5":  "SOCKS5 代理",
		"socks5h": "SOCKS5 代理",
		"socks4":  "SOCKS4 代理", // 未知协议兜底：至少可读
	}
	for in, want := range cases {
		if got := schemeLabel(in); got != want {
			t.Errorf("schemeLabel(%q)=%q，期望 %q", in, got, want)
		}
	}
}

// TestEgressTarget 锁住核心决策：② 这一行到底发往哪里。
// 第三种（捕获开 + 未保存）最容易写错——想当然地走 MITM 会测出旧代理。
func TestEgressTarget(t *testing.T) {
	const (
		cfg  = "http://10.0.0.9:8080"
		mitm = "http://127.0.0.1:8788"
		ca   = "/app/data/traffic/_ca/mitmproxy-ca-cert.pem"
	)

	cases := []struct {
		name      string
		cfg       string
		capture   bool
		pending   bool
		agentPrxy string
		wantAddr  string
		wantCA    string
		wantViaM  bool
	}{
		{"捕获关：直连表单值", cfg, false, false, mitm, cfg, "", false},
		{"捕获关 + 未保存：仍直连表单值", cfg, false, true, mitm, cfg, "", false},
		{"捕获开 + 已保存：走 MITM 并带 CA", cfg, true, false, mitm, mitm, ca, true},
		{"捕获开 + 未保存：跳过 MITM", cfg, true, true, mitm, cfg, "", false},
		{"空代理：不发请求", "", true, false, mitm, "", "", false},
		// 边界：捕获开着但拿不到 MITM 地址时，退回表单值，不能返回空地址。
		{"捕获开但拿不到 MITM 地址", cfg, true, false, "", cfg, "", false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			addr, gotCA, viaM := egressTarget(c.cfg, c.capture, c.pending, c.agentPrxy, ca)
			if addr != c.wantAddr || gotCA != c.wantCA || viaM != c.wantViaM {
				t.Fatalf("得到 (addr=%q ca=%q viaMITM=%v)，期望 (%q %q %v)",
					addr, gotCA, viaM, c.wantAddr, c.wantCA, c.wantViaM)
			}
		})
	}
}

// TestBuildProbeTransport 覆盖 Transport 的三条不变量：
// 直连不读环境变量、CA 文件不存在要报错、CA 内容非法也要报错。
func TestBuildProbeTransport(t *testing.T) {
	// 不能靠 t.Setenv 后发请求来测：ProxyFromEnvironment 在进程内只初始化一次，
	// 前一个用例跑过之后环境变量就不生效了，测出来是假绿。这里直接断言 Proxy 为 nil。
	t.Run("直连不读 HTTP_PROXY", func(t *testing.T) {
		t.Setenv("HTTP_PROXY", "http://127.0.0.1:9")
		t.Setenv("HTTPS_PROXY", "http://127.0.0.1:9")
		tr, err := buildProbeTransport(nil, "")
		if err != nil {
			t.Fatalf("空 CA 不该报错：%v", err)
		}
		if tr.Proxy != nil {
			t.Fatal("直连的 Transport 不该设置 Proxy，否则会读到 HTTP_PROXY")
		}
	})

	t.Run("CA 文件不存在", func(t *testing.T) {
		if _, err := buildProbeTransport(nil, "/nonexistent/ca.pem"); err == nil {
			t.Fatal("应返回错误，而不是静默降级成会报 x509 的 Transport")
		}
	})

	t.Run("CA 内容不是 PEM", func(t *testing.T) {
		bad := filepath.Join(t.TempDir(), "bad.pem")
		if err := os.WriteFile(bad, []byte("not a pem"), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := buildProbeTransport(nil, bad); err == nil {
			t.Fatal("应返回错误")
		}
	})
}

// hasSubstr 判断警告列表里是否有某条包含指定子串。
func hasSubstr(list []string, sub string) bool {
	for _, s := range list {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

// TestValidateProbeURL 锁住 probe_url 的放行边界：私网放行、本机与链路本地拒绝。
func TestValidateProbeURL(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1") // probe_url 不得受 repeater 的 escape hatch 影响

	ok := []string{
		"http://192.168.132.130:19000/", // 自定义探测服务的主用途
		"https://api.ipify.org?format=json",
		"http://10.0.0.5:8080/",
		"https://172.16.10.20/",
		"http://example.com/",
	}
	for _, raw := range ok {
		if _, err := validateProbeURL(raw); err != nil {
			t.Fatalf("%s 应该放行，却报 %v", raw, err)
		}
	}

	bad := map[string]string{
		"ftp://example.com/":             "只支持 http / https",
		"file:///etc/passwd":             "只支持 http / https",
		"/relative/path":                 "只支持 http / https",
		"http:///nohost":                 "缺少主机名",
		"http://127.0.0.1:8080/":         "拒绝访问本机",
		"http://localhost:8080/":         "拒绝访问本机",
		"http://169.254.169.254/latest/": "拒绝访问本机",
		"http://[::1]:8080/":             "拒绝访问本机",
	}
	for raw, want := range bad {
		_, err := validateProbeURL(raw)
		if err == nil {
			t.Fatalf("%s 应该被拒绝", raw)
		}
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("%s 的报错应包含 %q，实际 %v", raw, want, err)
		}
	}
}

// TestProbeCheckRedirect 确认重定向逐跳校验：跨主机、本机和过多跳数都断。
func TestProbeCheckRedirect(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "")

	via := []*http.Request{httptest.NewRequest(http.MethodGet, "https://api.ipify.org", nil)}
	if err := probeCheckRedirect(httptest.NewRequest(http.MethodGet, "https://api.ipify.org/ip", nil), via); err != nil {
		t.Fatalf("同主机重定向应放行，实际 %v", err)
	}
	if err := probeCheckRedirect(httptest.NewRequest(http.MethodGet, "https://ifconfig.me/ip", nil), via); err == nil {
		t.Fatal("跨公网主机的重定向必须拒绝")
	}
	if err := probeCheckRedirect(httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8787/api/settings", nil), via); err == nil {
		t.Fatal("重定向到本机必须拒绝")
	}
	if err := probeCheckRedirect(httptest.NewRequest(http.MethodGet, "https://api.ipify.org", nil),
		[]*http.Request{via[0], via[0], via[0]}); err == nil {
		t.Fatal("超过 3 跳必须拒绝")
	}

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"ip":"203.0.113.9"}`))
	}))
	defer target.Close()
	redirector := httptest.NewServer(http.RedirectHandler(target.URL, http.StatusFound))
	defer redirector.Close()
	_, err := (&http.Client{CheckRedirect: probeCheckRedirect}).Get(redirector.URL)
	if err == nil || !strings.Contains(err.Error(), "拒绝跨主机重定向") {
		t.Fatalf("httptest 跨主机 302 应失败，得到 %v", err)
	}
}

// TestProbeEgressBlocksLoopback 确认拨号阶段真的挡住了本机地址（URL 校验之外的兜底，
// 防的是"域名解析后才变成 127.0.0.1"）。
func TestProbeEgressBlocksLoopback(t *testing.T) {
	t.Setenv(repeaterAllowLocalEnv, "1")
	srv := fakeIPServer("203.0.113.7")
	defer srv.Close()

	res := probeEgress(context.Background(), "", "", []string{srv.URL}, 2*time.Second)
	if res.OK {
		t.Fatalf("连 127.0.0.1 应该失败，实际 %+v", res)
	}
	if len(res.Probes) != 1 || !strings.Contains(res.Probes[0].Error, "拒绝访问本机") {
		t.Fatalf("错误应说明是本机地址被拒，实际 %+v", res.Probes)
	}
	if strings.Contains(res.Probes[0].Error, repeaterAllowLocalEnv) {
		t.Fatalf("probe 错误不应提示 repeater local escape hatch，实际 %+v", res.Probes[0])
	}
}

// TestMaskSecrets 确认凭据不会随结果漏到界面上。
func TestMaskSecrets(t *testing.T) {
	cases := map[string]string{
		"http://user:pass@192.168.1.5:8080": "http://***@192.168.1.5:8080",
		"http://192.168.1.5:8080":           "http://192.168.1.5:8080",
		`socks5://u:p@h:1080: dial tcp`:     "socks5://***@h:1080: dial tcp",
	}
	for in, want := range cases {
		if got := maskSecrets(in); got != want {
			t.Fatalf("maskSecrets(%q) = %q，期望 %q", in, got, want)
		}
	}
}
