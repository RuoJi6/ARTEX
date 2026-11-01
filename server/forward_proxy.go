package server

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"golang.org/x/net/proxy"
)

// dynamicForwardProxy is a credential-free, stable local proxy. Each request
// resolves the current upstream, so pool switches do not rebuild agents or MCP.
type dynamicForwardProxy struct {
	ln      net.Listener
	addr    string
	current func() string
	direct  func() bool
	server  *http.Server
	once    sync.Once
}

func newDynamicForwardProxy(current func() string) (*dynamicForwardProxy, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	p := &dynamicForwardProxy{ln: ln, addr: "http://" + ln.Addr().String(), current: current, direct: func() bool { return true }}
	p.server = &http.Server{Handler: http.HandlerFunc(p.serveHTTP)}
	go p.server.Serve(ln)
	return p, nil
}

func (p *dynamicForwardProxy) Addr() string {
	if p == nil {
		return ""
	}
	return p.addr
}
func (p *dynamicForwardProxy) Close() error {
	if p == nil {
		return nil
	}
	p.once.Do(func() { _ = p.server.Close() })
	return nil
}

func (p *dynamicForwardProxy) serveHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		p.serveConnect(w, r)
		return
	}
	up := strings.TrimSpace(p.current())
	if up == "" && p.direct != nil && !p.direct() {
		http.Error(w, "proxy unavailable", 502)
		return
	}
	tr := &http.Transport{Proxy: nil}
	if up != "" {
		u, err := url.Parse(up)
		if err != nil {
			http.Error(w, "proxy unavailable", 502)
			return
		}
		if strings.HasPrefix(strings.ToLower(u.Scheme), "socks5") {
			d, err := socksDialer(u)
			if err != nil {
				http.Error(w, "proxy unavailable", 502)
				return
			}
			tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) { return d.Dial(network, addr) }
		} else {
			tr.Proxy = http.ProxyURL(u)
		}
	}
	tr.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	defer tr.CloseIdleConnections()
	rr := r.Clone(r.Context())
	if rr.URL.IsAbs() == false {
		rr.URL.Scheme = "http"
		rr.URL.Host = r.Host
	}
	rr.RequestURI = ""
	for k := range rr.Header {
		if strings.EqualFold(k, "Proxy-Authorization") {
			rr.Header.Del(k)
		}
	}
	resp, err := tr.RoundTrip(rr)
	if err != nil {
		http.Error(w, "proxy unavailable", 502)
		return
	}
	defer resp.Body.Close()
	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (p *dynamicForwardProxy) serveConnect(w http.ResponseWriter, r *http.Request) {
	up := strings.TrimSpace(p.current())
	if up == "" && p.direct != nil && !p.direct() {
		http.Error(w, "proxy unavailable", 502)
		return
	}
	target := r.Host
	var conn net.Conn
	var err error
	if up == "" {
		conn, err = (&net.Dialer{}).DialContext(r.Context(), "tcp", target)
	} else {
		u, e := url.Parse(up)
		if e != nil {
			err = e
		} else if strings.HasPrefix(strings.ToLower(u.Scheme), "socks5") {
			d, e := socksDialer(u)
			if e != nil {
				err = e
			} else {
				conn, err = d.Dial("tcp", target)
			}
		} else {
			conn, err = dialHTTPConnect(r.Context(), u, target)
		}
	}
	if err != nil {
		http.Error(w, "proxy unavailable", 502)
		return
	}
	defer conn.Close()
	h, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "proxy unavailable", 500)
		return
	}
	client, rw, err := h.Hijack()
	if err != nil {
		return
	}
	defer client.Close()
	_, _ = rw.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n")
	_ = rw.Flush()
	go io.Copy(conn, client)
	_, _ = io.Copy(client, conn)
}

func socksDialer(u *url.URL) (proxy.Dialer, error) {
	var auth *proxy.Auth
	if u.User != nil {
		pw, _ := u.User.Password()
		auth = &proxy.Auth{User: u.User.Username(), Password: pw}
	}
	return proxy.SOCKS5("tcp", u.Host, auth, &net.Dialer{})
}

func dialHTTPConnect(ctx context.Context, u *url.URL, target string) (net.Conn, error) {
	d := &net.Dialer{}
	addr := u.Host
	if !strings.Contains(addr, ":") {
		addr += ":80"
	}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(u.Scheme, "https") {
		conn = tls.Client(conn, &tls.Config{ServerName: u.Hostname(), MinVersion: tls.VersionTLS12})
		if err := conn.(*tls.Conn).HandshakeContext(ctx); err != nil {
			_ = conn.Close()
			return nil, err
		}
	}
	br := bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn))
	fmt.Fprintf(br, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n", target, target)
	if u.User != nil {
		req := &http.Request{Header: http.Header{}}
		req.SetBasicAuth(u.User.Username(), func() string { p, _ := u.User.Password(); return p }())
		fmt.Fprintf(br, "Proxy-Authorization: %s\r\n", req.Header.Get("Proxy-Authorization"))
	}
	fmt.Fprint(br, "\r\n")
	if err := br.Flush(); err != nil {
		_ = conn.Close()
		return nil, err
	}
	resp, err := http.ReadResponse(br.Reader, &http.Request{Method: http.MethodConnect})
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	if resp.StatusCode/100 != 2 {
		_ = conn.Close()
		return nil, fmt.Errorf("upstream CONNECT: %s", resp.Status)
	}
	return conn, nil
}
