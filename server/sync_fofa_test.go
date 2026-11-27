package server

import "testing"

func TestHostDomain(t *testing.T) {
	cases := []struct{ in, want string }{
		{"https://a.b.c:8443", "a.b.c"},
		{"http://x.y/path?q=1", "x.y"},
		{"a.b.c", "a.b.c"},
		{"A.B.C:80", "a.b.c"},
		{"1.2.3.4", ""},
		{"1.2.3.4:80", ""},
		{"", ""},
		{"localhost", ""},
	}
	for _, c := range cases {
		if got := hostDomain(c.in); got != c.want {
			t.Fatalf("hostDomain(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestAtoiSafe(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"8443", 8443},
		{" 22 ", 22},
		{"0", 0},
		{"", 0},
		{"abc", 0},
		{"-1", 0},
		{"65535", 65535},
		{"65536", 0}, // 越界视为无效
		{"999999", 0},
	}
	for _, c := range cases {
		if got := atoiSafe(c.in); got != c.want {
			t.Fatalf("atoiSafe(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestFofaQueryRootDomain(t *testing.T) {
	cases := []struct{ in, want string }{
		{`domain="example.com"`, "example.com"},
		{`domain="a.com" && port="443"`, "a.com"},
		{`ip="1.2.3.4"`, ""},
		{``, ""},
	}
	for _, c := range cases {
		if got := fofaQueryRootDomain(c.in); got != c.want {
			t.Fatalf("fofaQueryRootDomain(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestFofaConfigValid(t *testing.T) {
	official := fofaConfig{Endpoint: "official", APIKey: "k", Email: "e@example.com"}
	if !official.valid() || official.baseURL() != fofaOfficialEndpoint {
		t.Fatal("官方端点带 key+email 应有效，且 baseURL 固定为 fofa.info")
	}
	officialNoEmail := fofaConfig{Endpoint: "official", APIKey: "k"}
	if officialNoEmail.valid() {
		t.Fatal("官方端点缺 email 应无效")
	}
	proxy := fofaConfig{Endpoint: "fofoapi", APIKey: "k"}
	if !proxy.valid() || proxy.baseURL() != fofaProxyEndpoint {
		t.Fatal("第三方代理只需要 key")
	}
	custom := fofaConfig{Endpoint: "custom", APIKey: "k", BaseURL: "https://proxy.example.com/"}
	if !custom.valid() || custom.baseURL() != "https://proxy.example.com" {
		t.Fatal("自定义端点应去掉尾部斜杠")
	}
	customNoURL := fofaConfig{Endpoint: "custom", APIKey: "k"}
	if customNoURL.valid() {
		t.Fatal("自定义端点缺 base_url 应无效")
	}
	noKey := fofaConfig{Endpoint: "official", Email: "e@example.com"}
	if noKey.valid() {
		t.Fatal("缺 key 应无效")
	}
}
