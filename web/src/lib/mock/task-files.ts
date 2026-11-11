import type { TaskFileEntry, TaskFileListing, WorkspaceFile } from "../types";

const contents: Record<string, string> = {
  "notes.md": "# Task artifacts\n\nRead-only task file browser demo.\n",
  "i12/recon.txt": "acme.com\nwww.acme.com\napi.acme.com\n",
  "uploads/scope.txt": "https://www.acme.com\n",
  "cmd-output/scan.log": "[demo] Scan complete: 3 hosts discovered.\n",
};
const screenshot =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const paths = [
  "i12",
  "uploads",
  "cmd-output",
  "findings",
  "findings/screenshots",
  ...Object.keys(contents),
  "findings/screenshots/finding-1-step-1.png",
];
const entries: TaskFileEntry[] = paths.map((path, i) => ({
  path,
  name: path.split("/").pop() ?? path,
  dir: !path.includes("."),
  size: contents[path]?.length ?? 68,
  mtime: Date.parse("2026-11-11T05:00:00Z") - i * 60000,
  symlink: false,
  ...(path === "i12" ? { intent_id: 12, intent_title: "HTTP reconnaissance", intent_state: "done" } : {}),
}));

export function mockTaskFiles(path = "", all = false): TaskFileListing {
  if (!all && path && !entries.some((e) => e.path === path && e.dir)) throw new Error("taskFiles.notDirectory");
  const files = entries.filter((e) => !e.dir);
  return {
    path,
    entries: all
      ? files.toSorted((a, b) => b.mtime - a.mtime)
      : entries.filter((e) => e.path.split("/").slice(0, -1).join("/") === path),
    total: files.length,
    size: files.reduce((n, e) => n + e.size, 0),
    truncated: false,
    missing: false,
  };
}
export function mockTaskFileRead(path: string): WorkspaceFile {
  if (!(path in contents)) throw new Error("taskFiles.unavailable");
  return { path, size: contents[path].length, binary: false, content: contents[path] };
}

// A small valid, stored ZIP keeps demo downloads useful without a dependency.
export function mockTaskFileURL(path: string, action: string): string {
  if (action === "preview" || path.endsWith(".png")) return screenshot;
  if (action !== "archive")
    return URL.createObjectURL(new Blob([contents[path] ?? "Demo file\n"], { type: "text/plain" }));
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let offset = 0;
  const files: [string, Uint8Array][] = Object.entries(contents).map(([name, text]) => [name, encoder.encode(text)]);
  files.push([
    "findings/screenshots/finding-1-step-1.png",
    Uint8Array.from(atob(screenshot.split(",")[1]), (c) => c.charCodeAt(0)),
  ]);
  for (const [fullName, body] of files.filter(([name]) => !path || name.startsWith(`${path}/`))) {
    const name = encoder.encode(path ? fullName.slice(path.length + 1) : fullName);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length);
    const h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true);
    h.setUint32(22, body.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, body.length, true);
    c.setUint32(24, body.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);
    parts.push(header, body);
    offset += header.length + body.length;
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(
    12,
    central.reduce((n, p) => n + p.length, 0),
    true,
  );
  e.setUint32(16, offset, true);
  return URL.createObjectURL(new Blob([...parts, ...central, end] as BlobPart[], { type: "application/zip" }));
}
