import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "next-intl";

import { checkMessages, translationDrift } from "./check-messages.mjs";

const read = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

test("Chinese and English catalogs have matching keys and valid ICU messages", () => {
  assert.deepEqual(checkMessages(read("zh-CN"), read("en")), []);
});

test("validation rejects missing keys, empty values, invalid ICU and argument mismatches", () => {
  assert.match(checkMessages({ a: "A" }, {})[0], /Missing key/);
  assert.throws(() => checkMessages({ a: "A" }, { a: " " }), /Empty message/);
  assert.match(checkMessages({ a: "A" }, { a: "{broken" })[0], /Invalid ICU/);
  assert.match(checkMessages({ a: "{count, number}" }, { a: "{count}" })[0], /Placeholder mismatch/);
  assert.match(checkMessages({ a: "<b>{name}</b>" }, { a: "<strong>{name}</strong>" })[0], /Placeholder mismatch/);
  assert.match(checkMessages(
    { a: "{count, plural, other {{name}}}" },
    { a: "{count, plural, other {{value}}}" },
  )[0], /Placeholder mismatch/);
  assert.deepEqual(checkMessages(
    { a: "{count, plural, other {#}}" },
    { a: "{count, plural, one {# item} other {# items}}" },
  ), []);
});

test("interpolated backend details remain literal, including ICU and markup characters", () => {
  const error = "Original error: {name} <payload>";
  for (const locale of ["zh-CN", "en"]) {
    const t = createTranslator({ locale, messages: read(locale) });
    assert.ok(t("password.failed", { error }).endsWith(error));
    assert.ok(t.rich("password.description", { b: (text) => `[${text}]` }).includes("[ARTEX]"));
  }
});

test("changed Chinese text with unchanged English is reported for review", () => {
  assert.deepEqual(translationDrift({ a: "Old" }, { a: "English" }, { a: "New" }, { a: "English" }), ["a"]);
  assert.deepEqual(translationDrift({ a: "Old" }, { a: "English" }, { a: "New" }, { a: "Updated" }), []);
});
