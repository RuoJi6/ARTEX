// Known backend error messages are stored in Chinese in the Go handlers. When the
// interface is English, translate exact known templates at the API boundary.
// Unknown text and interpolated details (driver errors, names, paths) stay verbatim.
import en from "../../messages/en.json";
import zh from "../../messages/zh-CN.json";

type Rule = { re: RegExp; names: string[]; english: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let rules: Rule[] | undefined;
function compile(): Rule[] {
  const english = en.apiErrors as Record<string, string>;
  return Object.entries(zh.apiErrors as Record<string, string>).map(([key, chinese]) => {
    const names: string[] = [];
    const pattern = chinese.split(/(\{\w+\})/).map((part) => {
      const arg = /^\{(\w+)\}$/.exec(part);
      if (!arg) return escape(part);
      names.push(arg[1]);
      return arg[1] === "detail" ? "([\\s\\S]*)" : "([\\s\\S]+?)";
    }).join("");
    return { re: new RegExp(`^${pattern}$`), names, english: english[key] };
  });
}

export function localizeApiError(message: string, locale: string): string {
  if (locale !== "en") return message;
  rules ??= compile();
  for (const { re, names, english } of rules) {
    const match = re.exec(message);
    if (match) return names.reduce((text, name, i) => text.replace(`{${name}}`, match[i + 1]), english);
  }
  return message;
}
