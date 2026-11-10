import type { TFunction } from "i18next";

import { localizedError } from "./errors";

// Only recognize messages owned by ARTEX. Provider responses remain verbatim.
const messages: Record<string, string> = {
  渠道类型无效: "notify.runtime.invalidKind",
  缺少渠道名称: "notify.runtime.nameMissing",
  渠道名称不能为空: "notify.runtime.emptyName",
  通知渠道不存在: "notify.runtime.notFound",
  "渠道 id 无效": "notify.runtime.invalidChannelId",
  "投递 id 无效": "notify.runtime.invalidDeliveryId",
  "推送模式无效，可选：realtime / digest": "notify.runtime.invalidMode",
  限流值不能为负: "notify.runtime.negativeRate",
  "通知配置响应不完整，请刷新后重试": "notify.runtime.invalidMeta",
  "演示模式不会发送真实通知，请在实际部署中测试": "notify.runtime.demoTest",
  演示模式中没有对应的通知记录: "notify.runtime.demoRecord",
  "缺少 Webhook 地址": "notify.runtime.webhookRequired",
  "缺少 SMTP 服务器地址": "notify.runtime.smtpRequired",
  "SMTP 端口无效（应为 1-65535）": "notify.runtime.smtpPort",
  缺少发件人地址: "notify.runtime.senderRequired",
  至少需要一个收件人地址: "notify.runtime.recipientRequired",
  "缺少 Bot Token": "notify.runtime.botTokenRequired",
  "缺少 Chat ID": "notify.runtime.chatIdRequired",
  "缺少目标 URL": "notify.runtime.targetRequired",
  "请求体模板渲染结果不是合法 JSON": "notify.runtime.invalidTemplateJson",
  缺少主机名: "notify.runtime.hostRequired",
  重定向次数过多: "notify.runtime.redirectLimit",
};
const prefixes: [string, string][] = [
  ["渠道类型无效，可选：", "notify.runtime.kindOptions"],
  ["Webhook 地址无效: ", "notify.runtime.webhookInvalid"],
  ["API 地址无效: ", "notify.runtime.apiInvalid"],
  ["目标 URL 无效: ", "notify.runtime.targetInvalid"],
  ["请求体模板语法错误: ", "notify.runtime.templateSyntax"],
  ["渲染请求体模板失败: ", "notify.runtime.templateRender"],
  ["请求体不是合法 JSON: ", "notify.runtime.requestJson"],
];
export function notificationError(error: unknown, translate: TFunction): string {
  const value = localizedError(error, translate);
  if (messages[value]) return translate(messages[value]);
  for (const [prefix, key] of prefixes) {
    if (value.startsWith(prefix)) return translate(key, { detail: value.slice(prefix.length) });
  }
  return value;
}
