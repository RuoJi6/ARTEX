package server

import (
	"testing"
	"time"
)

// loginLimiter 的契约：窗口内失败累计到上限即锁定该 IP（allow=false），
// 成功登录清零计数，锁定随时间过期，不同 IP 互不影响。
func TestLoginLimiterLocksAfterMaxFails(t *testing.T) {
	l := newLoginLimiter()
	ip := "203.0.113.9"
	for i := 0; i < loginMaxFails; i++ {
		if !l.allow(ip) {
			t.Fatalf("第 %d 次失败前不应被锁", i+1)
		}
		l.fail(ip)
	}
	if l.allow(ip) {
		t.Fatalf("%d 次失败后应被锁定", loginMaxFails)
	}
	// 锁定期内重复 allow 应持续拒绝。
	if l.allow(ip) {
		t.Fatal("锁定期内重复 allow 应仍为拒绝")
	}
	// 其他 IP 不受影响
	if !l.allow("198.51.100.7") {
		t.Fatal("无关 IP 不应被连带锁定")
	}
}

func TestLoginLimiterSuccessClearsCounter(t *testing.T) {
	l := newLoginLimiter()
	ip := "203.0.113.9"
	for i := 0; i < loginMaxFails-1; i++ {
		l.fail(ip)
	}
	l.success(ip)
	l.fail(ip) // 计数已清零，这次是窗口内第 1 次
	if !l.allow(ip) {
		t.Fatal("成功清零后单次失败不应触发锁定")
	}
}

func TestLoginLimiterWindowExpiry(t *testing.T) {
	l := newLoginLimiter()
	ip := "203.0.113.9"
	// 直接构造过期条目：窗口起点拨回过去，锁定早已结束。
	old := loginWindow + loginLockout + time.Minute
	l.entries[ip] = &loginEntry{fails: loginMaxFails, windowStart: time.Now().Add(-old), lockedUntil: time.Now().Add(-old)}
	if !l.allow(ip) {
		t.Fatal("窗口与锁定期均已过期，应重新放行")
	}
}

// rotateJWTKey 的契约：换新密钥（内存+磁盘），旧密钥签发的 token 立即失效，
// 新密钥签发的有效。keyDir 为空时报错而不是 panic（测试环境容错）。
func TestRotateJWTKeyInvalidatesOldTokens(t *testing.T) {
	dir := t.TempDir()
	oldKey, err := generateJWTKey()
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{jwtKey: oldKey, keyDir: dir}

	oldTok, err := signJWT(oldKey)
	if err != nil {
		t.Fatal(err)
	}
	if !verifyJWT(oldTok, s.jwtKeyBytes()) {
		t.Fatal("前置条件：旧 token 在轮换前应有效")
	}

	newKey, err := s.rotateJWTKey()
	if err != nil {
		t.Fatal(err)
	}
	if string(newKey) == string(oldKey) {
		t.Fatal("轮换必须产生不同的密钥")
	}
	if verifyJWT(oldTok, s.jwtKeyBytes()) {
		t.Fatal("轮换后旧 token 必须失效")
	}
	if got := s.jwtKeyBytes(); string(got) != string(newKey) {
		t.Fatal("内存中的密钥应已替换")
	}
	newTok, err := signJWT(newKey)
	if err != nil {
		t.Fatal(err)
	}
	if !verifyJWT(newTok, s.jwtKeyBytes()) {
		t.Fatal("新密钥签发的 token 应有效")
	}
	// 磁盘文件确实是新密钥：loadOrCreateJWTKey 读回的值必须等于新密钥，
	// 这样重启后轮换效果保持。
	persisted, err := loadOrCreateJWTKey(dir, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if string(persisted) != string(newKey) {
		t.Fatal("磁盘上的 jwt.key 应已替换为新密钥")
	}
}

// keyDir 未配置（单测直构 Server）时轮换应报错而不是 panic。
func TestRotateJWTKeyWithoutKeyDir(t *testing.T) {
	s := &Server{}
	if _, err := s.rotateJWTKey(); err == nil {
		t.Fatal("keyDir 为空时应返回错误")
	}
}
