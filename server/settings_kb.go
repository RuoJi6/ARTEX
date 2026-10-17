package server

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

// 外部知识库(kb.sources)的配置 API。配置形态是 JSON 数组，每个元素含 name/type 及后端
// 专属字段(dify: base_url/api_key/dataset_id/timeout/min_score)。api_key 是唯一的共享
// 密钥字段：读取时恒为空、只回显 api_key_set；写入时留空 = 不改动旧 key（与 basic-auth
// 密码"留空表示不修改"同规则）。

// kbSourceDTO 是知识源的读写视图。Fields 承载除 name/type/api_key/enabled 外的所有后端
// 字段，用 map 而非强类型是为了让后续新增后端(不用改 DTO)。enabled 用指针：nil = 未指定
// （读时恒非 nil，写时若省略则保留原值），避免旧配置/旧客户端缺失该字段时被误判为禁用。
type kbSourceDTO struct {
	Name      string         `json:"name"`
	Type      string         `json:"type"`
	Enabled   *bool          `json:"enabled,omitempty"` // 读时恒为 true/false；写时 nil = 不修改
	APIKey    string         `json:"api_key,omitempty"` // 写时填；读时恒为空
	APIKeySet bool           `json:"api_key_set"`       // 读时告知是否已设置
	Fields    map[string]any `json:"fields"`            // 后端其余字段
}

// kbSourcesRaw 解析 kb.sources 配置。未设/空返回 nil 切片（不是错误）。
func (m *Manager) kbSourcesRaw() ([]map[string]any, error) {
	raw, ok, err := m.pg.GetSetting(settingKBSources)
	if err != nil {
		return nil, err
	}
	if !ok || strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var srcs []map[string]any
	if err := json.Unmarshal([]byte(raw), &srcs); err != nil {
		return nil, err
	}
	return srcs, nil
}

func kbSourcePublicDTO(src map[string]any) kbSourceDTO {
	name, _ := src["name"].(string)
	typ, _ := src["type"].(string)
	apiKey, _ := src["api_key"].(string)
	enabled := true // 默认启用；兼容旧配置里缺失 enabled 字段
	if v, ok := src["enabled"].(bool); ok {
		enabled = v
	}
	fields := make(map[string]any, len(src))
	for k, v := range src {
		switch k {
		case "name", "type", "api_key", "enabled":
			continue
		default:
			fields[k] = v
		}
	}
	return kbSourceDTO{Name: name, Type: typ, Enabled: &enabled, APIKeySet: apiKey != "", Fields: fields}
}

func (s *Server) getKBSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	srcs, err := s.m.kbSourcesRaw()
	if err != nil {
		writeErr(w, 503, "读取知识库配置失败")
		return
	}
	out := make([]kbSourceDTO, 0, len(srcs))
	for _, src := range srcs {
		out = append(out, kbSourcePublicDTO(src))
	}
	writeJSON(w, 200, map[string]any{"sources": out})
}

func (s *Server) saveKBSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Sources []kbSourceDTO `json:"sources"`
	}
	if err := decode(r, &req); err != nil {
		writeErr(w, 400, "请求格式错误")
		return
	}
	// 现有配置的 api_key，用于"留空 = 不修改"的合并。
	existing, err := s.m.kbSourcesRaw()
	if err != nil {
		writeErr(w, 503, "读取现有知识库配置失败")
		return
	}
	oldKey := map[string]string{}
	for _, src := range existing {
		if name, _ := src["name"].(string); name != "" {
			if k, _ := src["api_key"].(string); k != "" {
				oldKey[name] = k
			}
		}
	}

	out := make([]map[string]any, 0, len(req.Sources))
	for _, src := range req.Sources {
		src.Name = strings.TrimSpace(src.Name)
		src.Type = strings.TrimSpace(src.Type)
		if src.Name == "" || src.Type == "" {
			writeErr(w, 400, "每个知识源都需要 name 和 type")
			return
		}
		apiKey := src.APIKey
		if apiKey == "" {
			apiKey = oldKey[src.Name] // 未重填 → 复用旧 key
		}
		m := make(map[string]any, len(src.Fields)+4)
		for k, v := range src.Fields {
			m[k] = v
		}
		m["name"] = src.Name
		m["type"] = src.Type
		if src.Enabled != nil {
			m["enabled"] = *src.Enabled
		}
		if apiKey != "" {
			m["api_key"] = apiKey
		}
		out = append(out, m)
	}

	data, err := json.Marshal(out)
	if err != nil {
		writeErr(w, 500, "序列化知识库配置失败")
		return
	}
	if err := s.m.pg.SetSetting(settingKBSources, string(data)); err != nil {
		writeErr(w, 503, "保存知识库配置失败")
		return
	}
	if err := s.m.reloadKB(); err != nil {
		// 配置已落库但 reload 失败（如某源解析错）——不让整个保存返回失败，因为库已更新。
		log.Printf("[kb] reload 失败: %v", err)
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]any{"ok": true, "sources": req.Sources})
}
