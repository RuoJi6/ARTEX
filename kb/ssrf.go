package kb

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"syscall"
	"time"
)

// 外部知识库的 base_url 是管理员配置的、服务端会 POST 过去的目标，因此必须做拨号期
// SSRF 守卫：挡住环回 / 链路本地（含云元数据 169.254.169.254）这类敏感地址，同时放行
// RFC1918 私网——内网 Dify 是知识库的合法部署位置。逻辑与 notify 的守卫同源（见
// notify/http.go），但刻意不 import notify：知识库是独立子系统，不应因通知包改行为而
// 受影响；保留 ARTEX_KB_ALLOW_LOCAL 逃生口。

const allowLocalEnv = "ARTEX_KB_ALLOW_LOCAL"

func allowLocalTargets() bool {
	v := strings.TrimSpace(os.Getenv(allowLocalEnv))
	return v == "1" || strings.EqualFold(v, "true")
}

func isBlockedDialIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	// IPv4-mapped IPv6（::ffff:127.0.0.1）要还原成 IPv4 再判，否则绕过检查。
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	}
	return ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast()
}

func blockKBDial(_, address string, _ syscall.RawConn) error {
	if allowLocalTargets() {
		return nil
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return fmt.Errorf("kb: 无法解析目标地址 %q", host)
	}
	if isBlockedDialIP(ip) {
		return fmt.Errorf("kb: 拒绝连接到本机/链路本地地址 %s（如确需连接本机知识库，设置 %s=1）", ip, allowLocalEnv)
	}
	return nil
}

// kbHTTPClient 返回知识库共用的 HTTP 客户端：默认 Transport 基础上加拨号守卫、关闭跨主机
// 重定向（凭据在 Authorization 头，不能跟随跳转外泄）。超时由调用方（各后端）决定。
func kbHTTPClient(timeout time.Duration) *http.Client {
	t, ok := http.DefaultTransport.(*http.Transport)
	var transport *http.Transport
	if ok {
		transport = t.Clone()
	} else {
		transport = &http.Transport{}
	}
	transport.DialContext = (&net.Dialer{Timeout: 10 * time.Second, Control: blockKBDial}).DialContext
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("kb: 重定向次数过多")
			}
			if len(via) > 0 && req.URL.Host != via[0].URL.Host {
				return fmt.Errorf("kb: 拒绝跨主机重定向（%s → %s）", via[0].URL.Host, req.URL.Host)
			}
			return nil
		},
	}
}
