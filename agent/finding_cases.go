package agent

import actool "github.com/Autumn-27/norma/tool"

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

【同一漏洞的多次上报整理】保留本次独立报告，不覆盖其他原报告。默认报告完成即停止的旧指引在此扩展：先保存本次报告，然后 search_finding_duplicates(finding_id=独立记录ID) 分页读取同任务候选摘要，按需 get_finding_record 查看证据。仅凭漏洞类型/标题相似或高中低等级不能归并；须核对目标、接口、参数、权限边界、根因及实际验证证据。明确同一缺陷时 merge_finding_records(task_id,finding_ids,title,reason)，不确定时 suggest_finding_merge 留待人工确认，不能强行归并。不重复上报、不删除记录、不重新探测目标。人工选择整理时只能判断所选记录，不能加入未选记录（既有组成员可作为报告上下文）。
归并成功或已有case_id时，get_finding_case 记录实际version，分页读取全部成员，按需get_finding_record、get_finding_traffic读取原报告、PoC及已保存流量。update_finding_case_report保存完整统一报告和基于已验证影响的severity及severity_reason；不能直接取成员最高等级。集中给出前置条件、完整执行顺序、输入输出如何衔接、可运行的完整脚本及命令，不把必要步骤分散到原报告；缺失条件、未验证步骤如实标明。版本冲突重新读取材料并生成，不能仅换version重试。各成员仍有独立报告、评级和证据。没有明确重复则保留独立记录。工具被关闭时不绕过配置。`
}
