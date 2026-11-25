package agent

import (
	"context"
	actool "github.com/Autumn-27/norma/tool"
)

type findingReviewKey struct{}

// Historical consolidation has a narrower capability set than new reporting.
func WithFindingCaseReview(ctx context.Context) context.Context {
	return context.WithValue(ctx, findingReviewKey{}, true)
}
func isFindingCaseReview(ctx context.Context) bool {
	v, _ := ctx.Value(findingReviewKey{}).(bool)
	return v
}

func historicalFindingCaseTools(tools []actool.CoreTool) []actool.CoreTool {
	allowed := map[string]bool{}
	for _, name := range []string{"search_finding_duplicates", "get_finding_record", "merge_finding_records", "get_finding_case", "update_finding_case_report", "complete_finding_case_review", "get_finding_traffic", "traffic_search", "traffic_get", "traffic_blob", "get_task_node_detail", "list_task_findings", "get_task_graph", "list_task_worker_traces", "get_task_worker_trace", "Read"} {
		allowed[name] = true
	}
	out := make([]actool.CoreTool, 0, len(tools))
	for _, tool := range tools {
		if allowed[tool.Name()] {
			out = append(out, tool)
		}
	}
	return out
}

// This guidance is appended to the runtime prompt, including editable old prompts.
// Never reintroduce unbound tools or recreate a deleted Reporter.
func findingCaseWorkflow(key string, tools []actool.CoreTool) ([]actool.CoreTool, string) {
	if key != "reporter" {
		return tools, ""
	}
	has := map[string]bool{}
	for _, t := range tools {
		has[t.Name()] = true
	}
	if !has["search_finding_duplicates"] || !has["merge_finding_records"] || !has["get_finding_case"] || !has["update_finding_case_report"] {
		return tools, ""
	}
	return tools, `

【同一漏洞的多次上报整理】保留本次独立报告，不覆盖其他原报告。默认报告完成即停止的旧指引在此扩展：先保存本次报告，然后 search_finding_duplicates(finding_id=独立记录ID) 分页读取同任务候选摘要（按 score 排序；strong=同漏洞类型且资产重叠，优先核对；weak=未同时具备同漏洞类型和资产重叠，结合 hit_reasons 核对，仅作参考），按需 get_finding_record 查看证据。仅凭漏洞类型、标题、令牌、登录入口相似或高中低等级不能归并；须核对目标、接口、参数、权限边界、根因及实际验证证据。只能处理同一任务，尊重已撤销/否决的 finding_case_blocks。
【判断准则】由 AI 直接做出最终判断并完成合并，不再提交待人工选择或确认的建议。须核对端点/路由、处理器或后端组件、易受影响参数、权限边界、缺失检查与实际验证证据：若证据足以判定属于同一实际缺陷/根因，直接调用 merge_finding_records(task_id,finding_ids,title,reason) 完成归并；若证据表明属于不同代码路径/不同缺陷，或缺少足以确认同一根因的依据，则保持 independent（不得仅凭漏洞类型、资产、标题、令牌或登录入口相似就强行归并）。不得重复上报、删除记录或重新探测目标。自动整理历史记录时只能处理本次范围内的记录，不能加入范围外记录（既有组成员可作为报告上下文）。
归并成功或已有case_id时，get_finding_case 记录实际version，分页读取全部成员，按需 get_finding_record、get_finding_traffic 读取原报告、PoC及已保存流量。根因明确时归并不被统一报告阻塞，应随后尽力用 update_finding_case_report 保存统一报告；如果本次无法完成，文件夹显示“统一报告待更新”，由后续 reporter 运行或人工补齐。统一报告在保存时仍须包含有内容的概述、影响、前置条件、复现步骤、证据、PoC、根因分析、修复建议章节，不得半篇截断；评级及 severity_reason 必须基于已验证影响，不能直接取成员最高等级。集中给出前置条件、完整执行顺序、输入输出如何衔接、可运行的完整脚本及命令，不把必要步骤分散到原报告；缺失条件、未验证步骤如实标明。版本冲突重新读取材料并生成，不能仅换version重试。各成员仍有独立报告、评级和证据。工具被关闭时不绕过配置。`
}

const historicalFindingReviewGuidance = `

【历史整理模式，优先于旧报告撰写及自动绑流量指引】本次由 AI 自动判断并完成已存在上报的合并。原始报告即使为空或待更新，也只记录缺失情况，绝不调用 update_finding_report、report_finding、bind_finding_traffic，不修改原始标题、评级、状态、证据或报告，不执行 Bash、写文件或重新探测目标。
先逐条 get_finding_record 读取本次范围内的记录，已有原报告直接作为判断材料复用，不重复撰写。只在本次范围内检查同一实际缺陷，可按需读取已存在的证据。证据明确指向同一端点/路由、处理器或后端组件、参数或缺失检查等共同根因时，直接调用 merge_finding_records 完成归并；结构化证据显示属于不同代码路径或缺少足够根因依据时，保持 independent（仅类型、资产、标题、令牌或登录入口相似不足以归并）。不再提交待人工选择或确认的合并建议，必须遵守同一任务限制和已撤销/否决的归并屏蔽。
历史模式禁止调用 update_finding_report、report_finding、bind_finding_traffic，不修改原始标题、评级、状态、证据或报告，不执行 Bash、写文件或重新探测目标。已有或新建文件夹应读取全部成员并尽力用 update_finding_case_report 写入完整、最新的统一报告；归并不因报告暂缺而阻塞，未完成时文件夹显示“统一报告待更新”，可由后续运行或人工补齐。统一报告是单独的材料，不覆盖原报告。最后必须调用 complete_finding_case_review，为每条待判断 finding_id 提交 verdict（仅 independent 或 merged）、reason 和 root_cause_evidence，并提供总结。根因证据应说明具体相同/不同的检查及证据来源。服务端验收通过后才可宣布完成。历史整理只能处理本次范围，不能加入范围外记录。工具不可用或验收失败时如实报告，不能只用自然语言声称完成。`
