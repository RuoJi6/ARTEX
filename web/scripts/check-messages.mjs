import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

export function flatten(value, prefix = "", result = {}) {
  if (typeof value === "string") {
    if (!value.trim()) throw new Error(`Empty message: ${prefix}`);
    result[prefix] = value;
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, result);
    }
  } else {
    throw new Error(`Invalid message: ${prefix}`);
  }
  return result;
}

function argumentsOf(message) {
  const args = new Set();
  function walk(elements) {
    for (const element of elements) {
      if (element.type !== TYPE.literal && element.type !== TYPE.pound) {
        args.add(`${element.type}:${element.value}`);
      }
      if (element.options) {
        for (const option of Object.values(element.options)) walk(option.value);
      }
      if (element.children) walk(element.children);
    }
  }
  walk(parse(message));
  return [...args].sort().join(",");
}

export function checkMessages(chinese, english) {
  const zh = flatten(chinese);
  const en = flatten(english);
  const errors = [];
  for (const key of new Set([...Object.keys(zh), ...Object.keys(en)])) {
    if (!(key in zh) || !(key in en)) {
      errors.push(`Missing key: ${key} (${key in zh ? "en" : "zh-CN"})`);
      continue;
    }
    try {
      if (argumentsOf(zh[key]) !== argumentsOf(en[key])) errors.push(`Placeholder mismatch: ${key}`);
    } catch (error) {
      errors.push(`Invalid ICU message: ${key}: ${error.message}`);
    }
  }
  return errors;
}

export function translationDrift(previousChinese, previousEnglish, chinese, english) {
  const previousZh = flatten(previousChinese);
  const previousEn = flatten(previousEnglish);
  const zh = flatten(chinese);
  const en = flatten(english);
  return Object.keys(previousZh).filter((key) => key in zh && key in en
    && previousZh[key] !== zh[key] && previousEn[key] === en[key]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const errors = checkMessages(read("zh-CN"), read("en"));
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Catalogs OK: ${Object.keys(flatten(read("en"))).length} messages`);
  }
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--base") throw new Error("Usage: check-messages.mjs [--base <commit>]");
    const git = (...params) => execFileSync("git", params, { encoding: "utf8" });
    const base = git("rev-parse", "--verify", "--end-of-options", `${args[1]}^{commit}`).trim();
    const readPrevious = (locale) => JSON.parse(git("show", `${base}:web/messages/${locale}.json`));
    const drift = translationDrift(readPrevious("zh-CN"), readPrevious("en"), read("zh-CN"), read("en"));
    if (drift.length) console.warn(`Review changed Chinese with unchanged English:\n${drift.join("\n")}`);
    else console.log(`No unchanged-English drift candidates against ${base}`);
  }
}
