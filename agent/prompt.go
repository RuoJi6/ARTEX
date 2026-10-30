package agent

import (
	"bytes"
	"text/template"
	"time"
)

// PromptOverride, if set, returns the stored system-prompt template for an agent
// key and whether one exists. The server wires it to the PG agent_prompts table.
// When nil or no override exists, agents use their built-in default prompt — so
// behavior is identical until a user edits a prompt in the UI.
var PromptOverride func(agentKey string) (string, bool)

// OpsecEnabled is wired by the server to the persisted global setting. Keeping
// the block here makes it a code-owned runtime tail: database-edited prompts
// cannot accidentally remove the operational safety guidance.
var OpsecEnabled func() bool

const opsecPromptBlock = `【OPSEC 准则（硬约束，仅次于授权范围和任务操作约束）】

- 先复用已有流量、浏览器会话和已验证证据；能通过 traffic_search/traffic_get 或浏览器完成时，不要重复直接请求。
- 所有目标交互必须经过平台配置的记录代理或浏览器工具，确保请求可追溯。
- 不得使用裸 curl、urllib、requests 等工具的默认请求头直接访问目标。命令行请求必须尽量复用目标已有流量中的 User-Agent、Accept、Referer、Cookie 等请求特征；没有真实依据时不要伪造身份、设备或浏览器指纹。
- 不得使用 -k、--ignore-https-errors、verify=False 等方式绕过证书校验；平台代理 CA 已配置时应正常验证。
- 不得随机轮换 User-Agent、批量并发、快速循环、无节制重试、端口横扫、目录爆破或大规模扫描；遇到限速、验证码、WAF 或异常响应时立即停止当前方向。
- OPSEC 不扩大授权范围；目标、主机、端口、路径或账号不在授权范围内时不得访问。
- 请求和响应是否留痕由平台代理和浏览器负责；不要额外复制完整请求头、Cookie 或响应正文。`

// Prompt-variable structs — fields mirror each agent's catalog (docs §5a) so a
// user template referencing a catalog variable renders; referencing anything else
// fails template execution and falls back to the built-in default.
type PlannerVars struct{ Goal, Scope, AssetSummary, DataDir, Now string }
type WorkerVars struct{ ProxyAddr, WorkerName, DataDir, Now string }
type MainVars struct{ Goal, AssetSummary, FindingsSummary, DataDir, Now string }
type GoalsVars struct{ EngagementDescription, DataDir, Now string }

// nowStr is the server-local wall-clock string exposed as the universal {{.Now}}
// prompt variable. renderSystem runs on every agent turn/round, so this is fresh
// each run — a prompt can subtract it from a fixed start stamp to reason about
// elapsed time (e.g. a timed benchmark's "last N hours" window).
func nowStr() string { return time.Now().Format("2006-01-02 15:04:05 MST") }

// renderSystem returns the rendered system-prompt BODY (段 [A]) for agentKey.
// Precedence: the DB-stored template (if any) over the built-in default template
// (def). BOTH are Go templates now — the built-in default is seeded into the DB
// verbatim, so the two paths render identically until a user edits the prompt.
// Rendering always runs (def used to be pre-substituted plain text; it is now a
// {{.Var}} template like the DB one). On any render error we fall back to the
// default template, then to the raw default string — an agent never starts with a
// half-rendered prompt. Callers append the code-owned tail (trafficTool / 中间产物
// 输出规约) AFTER this, so those can't be edited away via the DB body.
func renderSystem(agentKey, def string, vars any) string {
	tmpl := def
	if PromptOverride != nil {
		if t, ok := PromptOverride(agentKey); ok && t != "" {
			tmpl = t
		}
	}
	if out, err := renderTmpl(tmpl, vars); err == nil {
		if OpsecEnabled != nil && OpsecEnabled() {
			return out + "\n\n" + opsecPromptBlock
		}
		return out
	}
	// DB template broke (e.g. references an out-of-catalog var) → code default.
	if out, err := renderTmpl(def, vars); err == nil {
		if OpsecEnabled != nil && OpsecEnabled() {
			return out + "\n\n" + opsecPromptBlock
		}
		return out
	}
	if OpsecEnabled != nil && OpsecEnabled() {
		return def + "\n\n" + opsecPromptBlock
	}
	return def
}

func renderTmpl(tmpl string, vars any) (string, error) {
	t, err := template.New("p").Option("missingkey=error").Parse(tmpl)
	if err != nil {
		return "", err
	}
	var b bytes.Buffer
	if err := t.Execute(&b, vars); err != nil {
		return "", err
	}
	return b.String(), nil
}
