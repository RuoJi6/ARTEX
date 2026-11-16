package server

import (
	"crypto/rand"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	jwtKeyFilename = "jwt.key"
	authPassKey    = "auth.password_hash"
	jwtTTL         = 7 * 24 * time.Hour
	keyChars       = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

	// 下限与 setup 页的前端校验一致——校验只放在前端等于没放，直接打 API 就能
	// 绕过。上限是 bcrypt 的硬限制：超过 72 字节 GenerateFromPassword 会返回
	// ErrPasswordTooLong，提前挡掉好过让用户收到一句含义不明的「密码加密失败」。
	minPasswordRunes = 8
	maxPasswordBytes = 72
)

// errDataSourceUnavailable 是密码相关读操作失败时统一的回复。这些 handler 绝不能
// 把"读不到"当成"没有设置"：authInit 曾因此在数据库报错时放行，让未认证请求覆盖
// 掉已有的管理员密码。
const errDataSourceUnavailable = "数据源暂时不可用，请稍后重试"

// validatePassword 返回空串表示通过，否则返回可直接展示给用户的中文原因。
func validatePassword(pw string) string {
	if utf8.RuneCountInString(pw) < minPasswordRunes {
		return fmt.Sprintf("密码长度至少 %d 位", minPasswordRunes)
	}
	if len(pw) > maxPasswordBytes {
		return fmt.Sprintf("密码长度不能超过 %d 字节", maxPasswordBytes)
	}
	return ""
}

// loadOrCreateJWTKey reads the 32-byte signing key from keyDir/jwt.key. keyDir is
// the project base dir (next to the executable), NOT the browsable workspace root
// (dataDir) — the signing key must never be listable/downloadable via the file
// manager. Legacy installs kept it at dataDir/jwt.key; if present there and not yet
// at the new location, it is migrated (key preserved, so sessions stay valid) and
// the old file removed so it disappears from the workspace. On first run a random
// key is generated and persisted.
func loadOrCreateJWTKey(keyDir, dataDir string) ([]byte, error) {
	path := filepath.Join(keyDir, jwtKeyFilename)
	// one-time migration out of the old in-workspace location.
	if legacy := filepath.Join(dataDir, jwtKeyFilename); legacy != path {
		if _, err := os.Stat(path); os.IsNotExist(err) {
			if data, rerr := os.ReadFile(legacy); rerr == nil {
				if werr := os.WriteFile(path, data, 0o600); werr == nil {
					_ = os.Remove(legacy)
					log.Printf("[auth] JWT key 已从 %s 迁移到 %s（移出可浏览工作区）", legacy, path)
				}
			}
		}
	}
	if data, err := os.ReadFile(path); err == nil && len(strings.TrimSpace(string(data))) >= 32 {
		return []byte(strings.TrimSpace(string(data))), nil
	}
	buf, err := generateJWTKey()
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, buf, 0600); err != nil {
		return nil, fmt.Errorf("write jwt key: %w", err)
	}
	log.Printf("[auth] 新 JWT key 已写入 %s", path)
	return buf, nil
}

// generateJWTKey produces a fresh 32-char random signing key.
func generateJWTKey() ([]byte, error) {
	buf := make([]byte, 32)
	for i := range buf {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(keyChars))))
		if err != nil {
			return nil, fmt.Errorf("generate jwt key: %w", err)
		}
		buf[i] = keyChars[n.Int64()]
	}
	return buf, nil
}

// signJWT issues a 7-day HS256 token for user ARTEX.
func signJWT(key []byte) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   "ARTEX",
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(jwtTTL)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}).SignedString(key)
}

// verifyJWT returns true when tokenStr is a valid, non-expired HS256 token.
func verifyJWT(tokenStr string, key []byte) bool {
	t, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return key, nil
	})
	return err == nil && t.Valid
}

// rotateJWTKey replaces the JWT signing key in memory and on disk (tmp+rename,
// atomic). Every token signed with the old key — including any token stolen
// before the password change — stops validating immediately. Returns the new
// key so the caller can mint a fresh token for the operator who just proved
// knowledge of the new password. keyDir empty (tests) → error, no rotation.
func (s *Server) rotateJWTKey() ([]byte, error) {
	if s.keyDir == "" {
		return nil, fmt.Errorf("jwt key directory not configured")
	}
	key, err := generateJWTKey()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(s.keyDir, jwtKeyFilename)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, key, 0o600); err != nil {
		return nil, fmt.Errorf("write rotated jwt key: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return nil, fmt.Errorf("install rotated jwt key: %w", err)
	}
	s.keyMu.Lock()
	s.jwtKey = key
	s.keyMu.Unlock()
	return key, nil
}

// jwtKeyBytes snapshots the signing key under the read lock (rotation swaps it).
func (s *Server) jwtKeyBytes() []byte {
	s.keyMu.RLock()
	defer s.keyMu.RUnlock()
	return s.jwtKey
}

// ---------- login rate limiting ----------
//
// loginLimiter throttles password guessing on the unauthenticated auth
// endpoints: per source IP, loginMaxFails attempts inside loginWindow lock the
// IP out for loginLockout. A successful login clears the counter, so only
// failures accumulate. Entries are swept lazily so the map stays bounded.

const (
	loginMaxFails = 5
	loginWindow   = 15 * time.Minute
	loginLockout  = 15 * time.Minute
	loginSweepCap = 4096
)

type loginLimiter struct {
	mu      sync.Mutex
	entries map[string]*loginEntry
}

type loginEntry struct {
	fails       int
	windowStart time.Time
	lockedUntil time.Time
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{entries: map[string]*loginEntry{}}
}

// allow reports whether an attempt from ip may proceed right now.
func (l *loginLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if len(l.entries) > loginSweepCap {
		for k, e := range l.entries {
			if now.After(e.lockedUntil) && now.Sub(e.windowStart) > loginWindow {
				delete(l.entries, k)
			}
		}
	}
	e := l.entries[ip]
	if e == nil {
		return true
	}
	if now.Before(e.lockedUntil) {
		return false
	}
	if now.Sub(e.windowStart) > loginWindow {
		delete(l.entries, ip)
		return true
	}
	return e.fails < loginMaxFails
}

// fail records a failed attempt, starting or incrementing the window and
// locking the IP once the cap is reached.
func (l *loginLimiter) fail(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	e := l.entries[ip]
	if e == nil || now.Sub(e.windowStart) > loginWindow {
		e = &loginEntry{windowStart: now}
		l.entries[ip] = e
	}
	e.fails++
	if e.fails >= loginMaxFails {
		e.lockedUntil = now.Add(loginLockout)
	}
}

// success clears the IP's counter after a successful login.
func (l *loginLimiter) success(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, ip)
}

// clientIP extracts the remote host from RemoteAddr. No reverse proxy sits in
// front of the API in the supported deployment, so this is the real client.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// loginGate blocks the request when its source IP is locked out. Nil-tolerant:
// tests construct Server without a limiter.
func (s *Server) loginGate(w http.ResponseWriter, r *http.Request) bool {
	if s.loginLim == nil {
		return true
	}
	if !s.loginLim.allow(clientIP(r)) {
		writeProductError(w, 429, "too_many_attempts", "失败次数过多，IP 已临时锁定，请 15 分钟后再试", nil)
		return false
	}
	return true
}

// loginFail records a failed attempt (nil-tolerant, see loginGate).
func (s *Server) loginFail(r *http.Request) {
	if s.loginLim != nil {
		s.loginLim.fail(clientIP(r))
	}
}

// loginSuccess clears the attempt counter (nil-tolerant, see loginGate).
func (s *Server) loginSuccess(r *http.Request) {
	if s.loginLim != nil {
		s.loginLim.success(clientIP(r))
	}
}

// extractToken reads the JWT from Authorization: Bearer header,
// artex_token cookie, or ?token= query param (for SSE connections).
func extractToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if c, err := r.Cookie("artex_token"); err == nil && c.Value != "" {
		return c.Value
	}
	return r.URL.Query().Get("token")
}

// requireAuth wraps h with JWT validation.
// /api/auth/*, /api/health and the Basic Auth gate check are exempt.
func (s *Server) requireAuth(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if strings.HasPrefix(p, "/api/auth/") || p == "/api/health" || p == "/api/basic-auth/check" {
			h.ServeHTTP(w, r)
			return
		}
		tok := extractToken(r)
		if tok == "" {
			writeProductError(w, 401, "unauthorized", "未授权", nil)
			return
		}
		if !verifyJWT(tok, s.jwtKeyBytes()) {
			writeProductError(w, 401, "token_expired", "token 无效或已过期", nil)
			return
		}
		h.ServeHTTP(w, r)
	})
}

// GET /api/auth/status — reports whether the admin password has been initialised.
// 读失败必须回 503 而不是 initialized:false：前端在 initialized:false 时会把用户
// 送到 /setup 去设置密码（login/page.tsx），把数据库故障包装成 200 等于把用户往
// 覆盖已有密码的路上推。
func (s *Server) authStatus(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	hash, _, err := pg.GetSetting(authPassKey)
	if err != nil {
		writeProductError(w, 503, "data_unavailable", errDataSourceUnavailable, nil)
		return
	}
	writeJSON(w, 200, map[string]any{"initialized": hash != ""})
}

// POST /api/auth/init — sets the password for the first time; rejected if already set.
func (s *Server) authInit(w http.ResponseWriter, r *http.Request) {
	// 未初始化实例每次调用都会跑 bcrypt，这个"设置密码前"的窗口同样需要限流。
	if !s.loginGate(w, r) {
		return
	}
	pg := s.pg(w)
	if pg == nil {
		return
	}
	existing, _, err := pg.GetSetting(authPassKey)
	if err != nil {
		writeProductError(w, 503, "data_unavailable", errDataSourceUnavailable, nil)
		return
	}
	if existing != "" {
		writeProductError(w, 403, "password_already_set", "密码已设置", nil)
		return
	}
	s.loginFail(r) // 先计数：成功路径在下面清零
	var req struct {
		Password string `json:"password"`
	}
	if err := decode(r, &req); err != nil || req.Password == "" {
		writeProductError(w, 400, "password_required", "密码不能为空", nil)
		return
	}
	if msg := validatePassword(req.Password); msg != "" {
		code, params := passwordValidationCode(req.Password)
		writeProductError(w, 400, code, msg, params)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeProductError(w, 500, "password_hash_failed", "密码加密失败", nil)
		return
	}
	// 用 INSERT ... ON CONFLICT DO NOTHING 而不是 upsert：上面那次 GetSetting 只是
	// 快速失败路径，真正"仅首次可设"的保证落在主键约束上。bcrypt 要跑几十毫秒，
	// 这期间别的请求完全可能先把密码设好，而读检查本身也可能因故障而失效。
	inserted, err := pg.InsertSettingIfAbsent(authPassKey, string(hash))
	if err != nil {
		writeProductError(w, 500, "save_failed", "保存失败: "+err.Error(), nil)
		return
	}
	if !inserted {
		writeProductError(w, 403, "password_already_set", "密码已设置", nil)
		return
	}
	s.loginSuccess(r)
	tok, err := signJWT(s.jwtKeyBytes())
	if err != nil {
		writeProductError(w, 500, "token_failed", "token 生成失败", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"token": tok})
}

// POST /api/auth/change-password — changes the admin password. Requires a valid
// token (this route is under /api/auth/* which requireAuth exempts, so the token
// is validated here) AND the current password.
func (s *Server) authChangePassword(w http.ResponseWriter, r *http.Request) {
	pg := s.pg(w)
	if pg == nil {
		return
	}
	if !verifyJWT(extractToken(r), s.jwtKeyBytes()) {
		writeProductError(w, 401, "unauthorized", "未授权", nil)
		return
	}
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := decode(r, &req); err != nil {
		writeProductError(w, 400, "invalid_request", "请求格式错误", nil)
		return
	}
	if req.NewPassword == "" {
		writeProductError(w, 400, "new_password_required", "新密码不能为空", nil)
		return
	}
	if msg := validatePassword(req.NewPassword); msg != "" {
		code, params := passwordValidationCode(req.NewPassword)
		writeProductError(w, 400, code, msg, params)
		return
	}
	hash, ok, err := pg.GetSetting(authPassKey)
	if err != nil {
		writeProductError(w, 503, "data_unavailable", errDataSourceUnavailable, nil)
		return
	}
	if !ok || hash == "" {
		writeProductError(w, 403, "password_not_initialized", "密码未初始化，请先设置密码", nil)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.OldPassword)); err != nil {
		writeProductError(w, 401, "current_password_incorrect", "当前密码错误", nil)
		return
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		writeProductError(w, 500, "password_hash_failed", "密码加密失败", nil)
		return
	}
	if err := pg.SetSetting(authPassKey, string(newHash)); err != nil {
		writeProductError(w, 500, "save_failed", "保存失败: "+err.Error(), nil)
		return
	}
	key, rerr := s.rotateJWTKey()
	if rerr != nil {
		// 密码已更新；轮换失败时旧 token 在有效期内仍可用——记日志，下次重启
		// 或再次改密会以磁盘上的密钥为准。
		log.Printf("[auth] 密码已更新，但 JWT key 轮换失败（旧 token 仍有效）: %v", rerr)
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	tok, err := signJWT(key)
	if err != nil {
		writeProductError(w, 500, "token_failed", "token 生成失败", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "token": tok})
}

// POST /api/auth/login — validates username/password and returns a JWT.
func (s *Server) authLogin(w http.ResponseWriter, r *http.Request) {
	if !s.loginGate(w, r) {
		return
	}
	pg := s.pg(w)
	if pg == nil {
		return
	}
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decode(r, &req); err != nil {
		writeProductError(w, 400, "invalid_request", "请求格式错误", nil)
		return
	}
	if req.Username != "ARTEX" {
		s.loginFail(r)
		writeProductError(w, 401, "invalid_credentials", "用户名或密码错误", nil)
		return
	}
	hash, ok, err := pg.GetSetting(authPassKey)
	if err != nil {
		writeProductError(w, 503, "data_unavailable", errDataSourceUnavailable, nil)
		return
	}
	if !ok || hash == "" {
		writeProductError(w, 403, "password_not_initialized", "密码未初始化，请先设置密码", nil)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		s.loginFail(r)
		writeProductError(w, 401, "invalid_credentials", "用户名或密码错误", nil)
		return
	}
	s.loginSuccess(r)
	tok, err := signJWT(s.jwtKeyBytes())
	if err != nil {
		writeProductError(w, 500, "token_failed", "token 生成失败", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"token": tok})
}

func passwordValidationCode(password string) (string, map[string]any) {
	if utf8.RuneCountInString(password) < minPasswordRunes {
		return "password_too_short", map[string]any{"min": minPasswordRunes}
	}
	return "password_too_long", map[string]any{"max": maxPasswordBytes}
}
