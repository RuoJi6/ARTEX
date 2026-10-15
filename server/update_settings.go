package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/Autumn-27/artex/selfupdate"
)

const updateSettingsKey = "update.network"

type updateSettings struct {
	Proxy string `json:"proxy"`
}

func (cfg *updateSettings) validate() error {
	cfg.Proxy = strings.TrimSpace(cfg.Proxy)
	if _, err := selfupdate.ParseProxy(cfg.Proxy); err != nil {
		return err
	}
	return nil
}

func (s *Server) loadUpdateSettings() (updateSettings, error) {
	cfg := updateSettings{}
	raw, ok, err := s.m.pg.GetSetting(updateSettingsKey)
	if err != nil {
		return cfg, fmt.Errorf("读取更新网络设置失败: %w", err)
	}
	if ok {
		if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
			return cfg, fmt.Errorf("更新网络设置格式无效")
		}
	}
	if err := cfg.validate(); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func (s *Server) getUpdateSettings(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.loadUpdateSettings()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, cfg)
}

func (s *Server) putUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var cfg updateSettings
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&cfg); err != nil {
		writeErr(w, 400, "更新网络设置格式无效")
		return
	}
	if err := cfg.validate(); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if err := s.m.pg.SetSettingContext(r.Context(), updateSettingsKey, string(raw)); err != nil {
		writeErr(w, 500, "保存更新网络设置失败")
		return
	}
	writeJSON(w, 200, cfg)
}

// Capture one effective proxy for both release discovery and all asset downloads.
// A different proxy bypasses cached success/error results from the previous route.
func (s *Server) updateClient() (*http.Client, string, error) {
	cfg, err := s.loadUpdateSettings()
	if err != nil {
		return nil, "", err
	}
	client, err := selfupdate.NewClient(cfg.Proxy)
	return client, cfg.Proxy, err
}
