package kb

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
)

// SearchDescription 是 knowledge_search 工具的代码默认描述，会随 seed 写入 tools 表
// （first-insert only）。改描述要像 traffic 一样用迁移 flag 或 RefreshToolDefaults
// 推送到老库，否则已播种的库不会更新。
const SearchDescription = "在外部漏洞知识库做语义检索，返回与当前场景最相关的知识片段【仅供参考，非结论】。结果带 source（知识源名）与 score；score 低或内容泛泛的片段可信度低。任何检索结论都必须用真实命令/响应验证后，才能 record_fact / report_finding。"

const (
	maxContentRunes = 800 // 每条命中片段截断上限，防检索结果撑爆上下文
	maxTopK         = 10
)

// Tools 基于一个 Registry 构建 knowledge_search 工具。reg 为 nil 时工具仍可构建（供
// SeedToolMetas 播种目录用，只读 Name/Desc/Schema、从不调用 Run），运行时调用会返回
// "知识库未启用"。
func Tools(reg *Registry) []actool.CoreTool {
	allow := func(context.Context, json.RawMessage, permission.Context) permission.Decision {
		return permission.Allowed()
	}
	ro := func(json.RawMessage) bool { return true }
	conc := func(json.RawMessage) bool { return true }

	search := actool.Build(actool.Spec{
		Name:        "knowledge_search",
		Description: SearchDescription,
		Schema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"q":       map[string]any{"type": "string", "description": "检索问题/技术场景，如 'jwt alg=none 绕过'、'SSRF 到内网 redis'"},
				"top_k":   map[string]any{"type": "integer", "description": "返回条数，默认 5，最大 10"},
				"sources": map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "可选，指定要检索的知识源名（如 ['cve']）；留空 = 全部源"},
			},
			"required": []any{"q"},
		},
		ReadOnly:    ro,
		Concurrent:  conc,
		Permissions: allow,
		Run: func(ctx context.Context, in json.RawMessage, _ *actool.ToolContext) (actool.Result, error) {
			var a struct {
				Q       string   `json:"q"`
				TopK    int      `json:"top_k"`
				Sources []string `json:"sources"`
			}
			_ = json.Unmarshal(in, &a)
			if strings.TrimSpace(a.Q) == "" {
				return actool.Errorf("q 不能为空"), nil
			}
			if a.TopK <= 0 || a.TopK > maxTopK {
				a.TopK = defaultTopK
			}
			if reg == nil {
				return actool.Errorf("知识库未启用"), nil
			}
			hits, err := reg.SearchSome(ctx, a.Q, a.TopK, a.Sources)
			switch {
			case errors.Is(err, ErrNoHit):
				return actool.Text("无匹配知识。"), nil
			case err != nil:
				// 降级语义：知识库不可用 ≠ 库中无答案，明确告知并引导继续探测，避免 agent 把
				// "检索失败"误读成"知识库里没有"而放弃这条线索。
				return actool.Errorf("知识库暂不可用（%v）。跳过外部知识，继续基于实际探测推进。", err), nil
			}
			for i := range hits {
				if r := []rune(hits[i].Content); len(r) > maxContentRunes {
					hits[i].Content = string(r[:maxContentRunes]) + " …"
				}
			}
			b, _ := json.Marshal(hits)
			return actool.Text(string(b)), nil
		},
	})
	return []actool.CoreTool{search}
}

// SeedToolMetas 供 server.wireTools 播种工具目录：只取 Name/Desc/Schema，运行时不调用
// Run（与 traffic.SeedToolMetas 同构）。目录表只存"模型看到的说明与入参默认值"，handler
// 永远在代码里。
func SeedToolMetas() []actool.CoreTool { return Tools(nil) }
