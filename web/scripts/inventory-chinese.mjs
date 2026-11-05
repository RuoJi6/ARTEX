import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const han = /\p{Script=Han}/u;

export function inventory(source, file) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const candidates = [];
  function visit(node) {
    if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const text = node.text.trim().replace(/\s+/g, " ");
      if (han.test(text)) {
        const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
        candidates.push({ file, line: line + 1, kind: ts.SyntaxKind[node.kind], text });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return candidates;
}

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
  });
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--base")) {
    throw new Error("Usage: node scripts/inventory-chinese.mjs [--base <commit>]");
  }
  const current = filesIn(resolve(root, "web/src")).sort().flatMap((path) =>
    inventory(readFileSync(path, "utf8"), relative(root, path)));
  let baseline = [];
  if (args.length) {
    const sha = git("rev-parse", "--verify", "--end-of-options", `${args[1]}^{commit}`).trim();
    baseline = git("ls-tree", "-r", "--name-only", "-z", sha, "--", "web/src")
      .split("\0").filter((path) => /\.[cm]?[jt]sx?$/.test(path))
      .flatMap((path) => inventory(git("show", `${sha}:${path}`), path));
  }
  // Count occurrences so a new copy of an existing literal is still reported.
  const identity = ({ file, kind, text }) => JSON.stringify([file, kind, text]);
  const counts = new Map();
  for (const item of baseline) counts.set(identity(item), (counts.get(identity(item)) ?? 0) + 1);
  const added = current.filter((item) => {
    const key = identity(item);
    const remaining = counts.get(key) ?? 0;
    if (remaining) counts.set(key, remaining - 1);
    return remaining === 0;
  });
  console.log(JSON.stringify({ baseline: args[1] ?? null, total: current.length, candidates: added }, null, 2));
}
