import catalog from "./screen-catalog.json";
import type { UITranslate } from "./use-ui-translation";

// Translate only product-authored messages at explicit UI boundaries. Never run
// this over reports, prompts, request bodies, user names or arbitrary AI output.
const fixedKeys = new Map(Object.entries(catalog).map(([key, pair]) => [pair[0], key]));

export function translateFixedUIText(text: string, ui: UITranslate): string {
  const key = fixedKeys.get(text);
  if (key) return ui(key);
  const limit = /^最多 (\d+) 个字符$/.exec(text);
  if (limit) return ui("screen.scopeCharacterLimit", { count: Number(limit[1]) });
  return text;
}

export function repeaterGroupLabel(group: { id: string; name: string }, ui: UITranslate): string {
  return group.id === "default" && group.name === "默认" ? translateFixedUIText(group.name, ui) : group.name;
}
