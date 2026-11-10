package server

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProductErrorPreservesLegacyMessage(t *testing.T) {
	w := httptest.NewRecorder()
	writeProductError(w, 400, "password_too_short", "密码长度至少 8 位", map[string]any{"min": 8})
	var payload struct {
		Error  string         `json:"error"`
		Code   string         `json:"code"`
		Params map[string]int `json:"params"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if w.Code != 400 || payload.Error != "密码长度至少 8 位" || payload.Code != "password_too_short" || payload.Params["min"] != 8 {
		t.Fatalf("unexpected localized error: %d %+v", w.Code, payload)
	}
}

func TestPasswordValidationCodes(t *testing.T) {
	for _, item := range []struct {
		password, code, param string
		value                 int
	}{
		{"短密码", "password_too_short", "min", 8},
		{"这是一个超过七十二字节上限的密码这是一个超过七十二字节上限的密码", "password_too_long", "max", 72},
	} {
		if validatePassword(item.password) == "" {
			t.Fatalf("expected invalid password for %s", item.code)
		}
		code, params := passwordValidationCode(item.password)
		if code != item.code || params[item.param] != item.value {
			t.Fatalf("code=%s params=%v", code, params)
		}
	}
}

func TestBasicAuthErrorsIncludeTranslationCodes(t *testing.T) {
	s, _ := basicAuthTestServer(t)
	for _, tc := range []struct{ body, code string }{
		{`not-json`, "invalid_request"},
		{`{"enabled":true}`, "basic_auth_username_invalid"},
		{`{"username":"bad:name"}`, "basic_auth_username_invalid"},
		{`{"username":"entry","password":"short"}`, "password_too_short"},
		{`{"enabled":true,"username":"entry"}`, "basic_auth_password_required"},
	} {
		w := saveBasicAuthForTest(s, tc.body)
		var payload struct {
			Error string `json:"error"`
			Code  string `json:"code"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
			t.Fatal(err)
		}
		if w.Code != 400 || payload.Code != tc.code || payload.Error == "" {
			t.Fatalf("body=%s status=%d payload=%+v", tc.body, w.Code, payload)
		}
	}
}

func TestEgressWarningDetailsPreserveLegacyTextAndMaskCredentials(t *testing.T) {
	rep := egressReport{Configured: "http://new-proxy:8080"}
	legacy := egressWarnings(rep, true, "http://user:secret@old-proxy:8080")
	details := egressWarningDetails(rep, true, "http://user:secret@old-proxy:8080")
	if len(legacy) != len(details) || len(details) != 1 || details[0].Code != "pending_change" {
		t.Fatalf("legacy=%v details=%+v", legacy, details)
	}
	for i, notice := range details {
		if notice.Message != legacy[i] {
			t.Fatalf("legacy message changed: %+v", notice)
		}
		data, err := json.Marshal(notice)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(data), "secret") {
			t.Fatal("proxy credentials exposed in localized warning")
		}
	}
}
