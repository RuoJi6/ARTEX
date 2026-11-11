"use client";

import * as React from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PacketCodeEditor } from "@/components/packet-code-editor";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { Task, TaskFileEntry, TaskFileListing, WorkspaceFile } from "@/lib/types";

function fileSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 ** 2).toFixed(1)} MiB`;
}
const isImage = (path: string) => /\.(png|jpe?g|webp|gif)$/i.test(path);

export function FilesTab({ task, active }: { task: Task; active: boolean }) {
  const { ui, liveUI, i18n } = useUITranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get("path") ?? "";
  const [mode, setMode] = React.useState<"tree" | "recent">("tree");
  const [listings, setListings] = React.useState<Record<string, TaskFileEntry[]>>({});
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const [summary, setSummary] = React.useState<TaskFileListing | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [preview, setPreview] = React.useState<{ path: string; file?: WorkspaceFile; error?: string } | null>(null);
  const generation = React.useRef(0);
  const previewGeneration = React.useRef(0);

  const message = React.useCallback(
    (err: unknown) => {
      const raw = (err as Error).message;
      return raw.startsWith("taskFiles.") ? liveUI(raw) : liveUI("taskFiles.failed");
    },
    [liveUI],
  );

  const refresh = React.useCallback(async () => {
    const seq = ++generation.current;
    setLoading(true);
    try {
      const [all, ...dirs] = await Promise.all([
        api.taskFilesAll(task.id),
        ...["", ...expanded].map(async (path) => {
          try {
            return { path, result: await api.taskFiles(task.id, path) };
          } catch (err) {
            if (path === "") throw err;
            return { path, result: null };
          }
        }),
      ]);
      if (generation.current !== seq) return;
      setSummary(all);
      setListings(Object.fromEntries(dirs.filter((d) => d.result).map((d) => [d.path, d.result?.entries ?? []])));
      setError(dirs.some((d) => !d.result) ? liveUI("taskFiles.pathGone") : "");
    } catch (err) {
      if (generation.current === seq) setError(message(err));
    } finally {
      if (generation.current === seq) setLoading(false);
    }
  }, [task.id, expanded, liveUI, message]);

  React.useEffect(() => {
    if (!active) return;
    void refresh();
    return () => {
      generation.current++;
    };
  }, [active, refresh]);

  React.useEffect(() => {
    if (!active || task.status !== "running" || task.paused) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [active, task.status, task.paused, refresh]);

  const openPreview = React.useCallback(
    async (path: string) => {
      const seq = ++previewGeneration.current;
      setPreview({ path });
      if (isImage(path)) return;
      try {
        const file = await api.taskFileRead(task.id, path);
        if (previewGeneration.current === seq) setPreview({ path, file });
      } catch (err) {
        if (previewGeneration.current === seq) setPreview({ path, error: message(err) });
      }
    },
    [task.id, message],
  );

  React.useEffect(() => {
    if (!active || !requestedPath) return;
    let alive = true;
    const parts = requestedPath.split("/");
    const ancestors = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
    void api
      .taskFiles(task.id, requestedPath)
      .then(() => {
        if (alive) setExpanded((prev) => Array.from(new Set([...prev, ...ancestors, requestedPath])));
      })
      .catch(() => {
        if (!alive) return;
        setExpanded((prev) => Array.from(new Set([...prev, ...ancestors])));
        void openPreview(requestedPath);
      });
    return () => {
      alive = false;
    };
  }, [active, task.id, requestedPath, openPreview]);

  const locate = (path: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "files");
    if (path) params.set("path", path);
    else params.delete("path");
    router.replace(`/function/tasks/detail?${params}`, { scroll: false });
  };
  const workspacePath = (path: string) => `tasks/${task.id}${path ? `/${path}` : ""}`;
  const download = (path: string, archive = false) => {
    void api.taskFileDownload(task.id, path, archive).catch((err: unknown) => toast.error(message(err)));
  };
  const name = (entry: TaskFileEntry) => {
    if (entry.intent_id) return ui("taskFiles.intent", { id: entry.intent_id, title: entry.intent_title ?? "" });
    const key: Record<string, string> = {
      uploads: "uploads",
      "cmd-output": "commands",
      "findings/screenshots": "screenshots",
    };
    return key[entry.path] ? ui(`taskFiles.${key[entry.path]}`) : entry.name;
  };
  const rows: { entry: TaskFileEntry; depth: number }[] = [];
  const append = (path: string, depth: number) => {
    for (const entry of listings[path] ?? []) {
      rows.push({ entry, depth });
      if (entry.dir && expanded.includes(entry.path)) append(entry.path, depth + 1);
    }
  };
  if (mode === "tree") append("", 0);
  else for (const entry of summary?.entries ?? []) rows.push({ entry, depth: 0 });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{ui("taskFiles.scope")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={mode === "tree" ? "secondary" : "ghost"} onClick={() => setMode("tree")}>
          {ui("taskFiles.tree")}
        </Button>
        <Button variant={mode === "recent" ? "secondary" : "ghost"} onClick={() => setMode("recent")}>
          {ui("taskFiles.recent")}
        </Button>
        <span className="mr-auto text-muted-foreground text-sm">
          {summary && ui("taskFiles.summary", { count: summary.total, size: fileSize(summary.size) })}
        </span>
        <Button variant="outline" disabled={loading} onClick={() => void refresh()}>
          <RefreshCwIcon />
          {ui("taskFiles.refresh")}
        </Button>
        <Button variant="outline" disabled={summary?.missing ?? true} onClick={() => download("", true)}>
          <DownloadIcon />
          {ui("taskFiles.archiveAll")}
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/function/workspace?path=${encodeURIComponent(workspacePath(""))}`}>
            {ui("taskFiles.workspace")}
          </Link>
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {mode === "recent" && summary?.truncated && (
        <p className="text-muted-foreground text-sm">{ui("taskFiles.truncated")}</p>
      )}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ui("taskFiles.name")}</TableHead>
              <TableHead>{ui("taskFiles.size")}</TableHead>
              <TableHead>{ui("taskFiles.modified")}</TableHead>
              <TableHead>{ui("taskFiles.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                  {loading ? ui("taskFiles.loading") : ui("taskFiles.empty")}
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ entry, depth }) => (
              <TableRow key={entry.path}>
                <TableCell>
                  <div className="flex items-center gap-2" style={{ paddingLeft: depth * 20 }}>
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 text-left hover:underline"
                      disabled={entry.symlink}
                      aria-expanded={entry.dir ? expanded.includes(entry.path) : undefined}
                      onClick={() => {
                        if (entry.dir) {
                          if (expanded.includes(entry.path))
                            setExpanded((prev) =>
                              prev.filter((p) => p !== entry.path && !p.startsWith(`${entry.path}/`)),
                            );
                          else {
                            setExpanded((prev) => [...prev, entry.path]);
                            locate(entry.path);
                          }
                        } else {
                          locate(entry.path);
                        }
                      }}
                    >
                      {entry.dir ? (
                        <>
                          {expanded.includes(entry.path) ? (
                            <ChevronDownIcon className="size-4" />
                          ) : (
                            <ChevronRightIcon className="size-4" />
                          )}
                          <FolderIcon className="size-4 shrink-0" />
                        </>
                      ) : (
                        <FileIcon className="size-4 shrink-0" />
                      )}
                      <span className="max-w-lg truncate" title={entry.path}>
                        {mode === "recent" ? entry.path : name(entry)}
                      </span>
                    </button>
                    {entry.symlink && <span className="text-muted-foreground text-xs">{ui("taskFiles.symlink")}</span>}
                    {entry.intent_state && <StatusBadge domain="intent" value={entry.intent_state} />}
                    {entry.intent_id && (
                      <Link
                        className="whitespace-nowrap text-xs underline"
                        href={`/function/tasks/detail?id=${task.id}&tab=sessions&session=intent:${entry.intent_id}`}
                      >
                        {ui("taskFiles.session")}
                      </Link>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {entry.dir || entry.symlink ? "—" : fileSize(entry.size)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(entry.mtime).toLocaleString(i18n.language)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={entry.symlink}
                      onClick={() => download(entry.path, entry.dir)}
                      title={entry.dir ? ui("taskFiles.archive") : ui("taskFiles.download")}
                      aria-label={entry.dir ? ui("taskFiles.archive") : ui("taskFiles.download")}
                    >
                      <DownloadIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={ui("taskFiles.copy")}
                      aria-label={ui("taskFiles.copy")}
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(workspacePath(entry.path))
                          .then(() => toast.success(ui("taskFiles.copied")))
                          .catch(() => toast.error(ui("taskFiles.copyFailed")));
                      }}
                    >
                      <CopyIcon />
                    </Button>
                    {!entry.symlink && (
                      <Link
                        className="whitespace-nowrap text-xs underline"
                        href={`/function/workspace?path=${encodeURIComponent(workspacePath(entry.path))}`}
                      >
                        {ui("taskFiles.workspace")}
                      </Link>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) {
            previewGeneration.current++;
            setPreview(null);
            locate("");
          }
        }}
      >
        <DialogContent className="flex h-[80vh] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{preview?.path}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => download(preview.path)}>
                {ui("taskFiles.download")}
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/function/workspace?path=${encodeURIComponent(workspacePath(preview.path))}`}>
                  {ui("taskFiles.workspace")}
                </Link>
              </Button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            {preview?.error && <p role="alert">{preview.error}</p>}
            {preview && !preview.error && isImage(preview.path) && (
              // biome-ignore lint/performance/noImgElement: authenticated raster preview
              <img
                src={api.taskFilePreview(task.id, preview.path)}
                alt={preview.path}
                className="mx-auto max-h-full object-contain"
                onError={() => setPreview((prev) => (prev ? { ...prev, error: ui("taskFiles.imageFailed") } : prev))}
              />
            )}
            {preview && !preview.error && !isImage(preview.path) && !preview.file && <p>{ui("taskFiles.loading")}</p>}
            {preview?.file && !preview.error && (preview.file.binary || preview.file.too_large) && (
              <p>{ui(preview.file.too_large ? "taskFiles.tooLarge" : "taskFiles.binary")}</p>
            )}
            {preview?.file && !preview.error && !preview.file.binary && !preview.file.too_large && (
              <PacketCodeEditor value={preview.file.content ?? ""} readOnly ariaLabel={preview.path} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
