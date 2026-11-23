import type { Edge, ExploreKind, TaskNode } from "./types";

export const relLabel: Record<string, string> = {
  spawns: "派生",
  derived_from: "意图链",
  yields: "产出",
  proves: "证明",
};

// The task root is an origin fact (kind='fact', state='origin'); render it as "起点".
export function viewKind(n: TaskNode): ExploreKind {
  return n.type === "fact" && n.state === "origin" ? "begin" : n.type;
}

const summaryFields: Record<ExploreKind, string[]> = {
  task: ["summary", "description"],
  begin: ["summary", "description"],
  goal: ["text"],
  hint: [],
  intent: ["summary"],
  fact: ["summary"],
  finding: ["name", "summary"],
  digest: ["body"],
};

export function nodeSummary(n: TaskNode): string {
  const raw = n.payload ?? "";
  const fields = summaryFields[viewKind(n)] ?? [];
  if (fields.length && raw.trim()) {
    try {
      const obj: unknown = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        for (const f of fields) {
          const v = (obj as Record<string, unknown>)[f];
          if (typeof v === "string" && v.trim()) return v;
        }
      }
    } catch {
      /* 非 JSON：原样显示 */
    }
  }
  return raw;
}

// collapseDigestGraph contracts each active digest's covered members into the
// digest super-node: the members are dropped from the rendered set and every
// edge touching a member is rewired onto its digest (member→member internal
// edges collapse to a self-loop and are dropped; the resulting edges are
// deduped by src+rel+dst). covers edges are structural and never drawn.
// Superseded digests (no covers edges) are dropped entirely. A graph with no
// active digest passes through unchanged. The full node list is kept by the
// caller so the detail drawer can still resolve a folded member by id.
export function collapseDigestGraph(nodes: TaskNode[], edges: Edge[]): { viewNodes: TaskNode[]; viewEdges: Edge[] } {
  const activeDigests = new Set(nodes.filter((n) => n.type === "digest" && n.state === "active").map((n) => n.id));
  const memberToDigest = new Map<string, string>();
  for (const e of edges) {
    if (e.rel === "covers" && activeDigests.has(e.src)) memberToDigest.set(e.dst, e.src);
  }
  const viewNodes = nodes.filter((n) => (n.type === "digest" ? n.state === "active" : !memberToDigest.has(n.id)));
  const remap = (id: string) => memberToDigest.get(id) ?? id;
  const seen = new Set<string>();
  const rewired: Edge[] = [];
  // src+dst of every rewired yields edge, so the inverse derived_from can be dropped.
  const produced = new Set<string>();
  for (const e of edges) {
    if (e.rel === "covers") continue;
    const src = remap(e.src);
    const dst = remap(e.dst);
    if (src === dst) continue;
    const key = `${src}\0${e.rel}\0${dst}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.rel === "yields") produced.add(`${src} ${dst}`);
    rewired.push(src === e.src && dst === e.dst ? e : { ...e, src, dst });
  }
  // yields(A→B) and derived_from(B→A) are inverse relations: a finding is
  // yielded by one intent but derived_from other intents, so the raw graph has
  // no 2-cycle. Folding those distinct intents into one digest collapses both
  // onto the digest↔member pair, leaving a redundant reverse edge the layered
  // layout draws as an overlapping back-edge. Drop each derived_from whose
  // reverse yields exists, keeping the production direction (→member).
  const viewEdges = rewired.filter((e) => !(e.rel === "derived_from" && produced.has(`${e.dst} ${e.src}`)));
  return { viewNodes, viewEdges };
}
