"use client";
import * as React from "react";

import { useSearchParams } from "next/navigation";

import {
  DownloadIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  HardDriveIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { WorkspaceEntry, WorkspaceFile } from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
function fmtTime(ms: number, ui: UITranslate): string {
  return new Date(ms).toLocaleString(ui("screen.91610255157661"), {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type EditState = {
  file: WorkspaceFile;
  content: string;
  dirty: boolean;
  saving: boolean;
};

function WorkspaceInner() {
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get("path") ?? "";
  const { ui, liveUI } = useUITranslation();

  const [path, setPath] = React.useState("");
  const [entries, setEntries] = React.useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [edit, setEdit] = React.useState<EditState | null>(null);
  const [mkdirOpen, setMkdirOpen] = React.useState(false);
  const [mkdirName, setMkdirName] = React.useState("");
  const uploadRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(
    (p: string) => {
      setLoading(true);
      api
        .workspaceList(p)
        .then((r) => {
          setEntries(r.entries);
          setPath(r.path);
        })
        .catch((e) => toast.error(liveUI("screen.d9861c29979739", { v0: (e as Error).message })))
        .finally(() => setLoading(false));
    },
    [liveUI],
  );

  React.useEffect(() => {
    let alive = true;
    // A path may identify a file or a directory. Directory listing wins;
    // otherwise open the file and show its containing directory.
    void api
      .workspaceList(requestedPath)
      .then((result) => {
        if (!alive) return;
        setEntries(result.entries);
        setPath(result.path);
        setLoading(false);
      })
      .catch(async () => {
        if (!alive) return;
        load(requestedPath.split("/").slice(0, -1).join("/"));
        try {
          const file = await api.workspaceRead(requestedPath);
          if (alive) setEdit({ file, content: file.content ?? "", dirty: false, saving: false });
        } catch (error) {
          if (alive) toast.error((error as Error).message);
        }
      });
    return () => {
      alive = false;
    };
  }, [load, requestedPath]);

  const crumbs = React.useMemo(() => {
    const parts = path ? path.split("/") : [];
    const acc: { name: string; path: string }[] = [{ name: ui("screen.6fed7e86016823"), path: "" }];
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      acc.push({ name: part, path: cur });
    }
    return acc;
  }, [path, ui]);

  const openFile = (e: WorkspaceEntry) => {
    api
      .workspaceRead(e.path)
      .then((f) => setEdit({ file: f, content: f.content ?? "", dirty: false, saving: false }))
      .catch((err) => toast.error(ui("screen.076ee27586c9a7", { v0: (err as Error).message })));
  };

  const saveFile = () => {
    if (!edit) return;
    setEdit({ ...edit, saving: true });
    api
      .workspaceWrite(edit.file.path, edit.content)
      .then(() => {
        toast.success(ui("screen.1bd91a7d0c53c9"));
        setEdit((cur) => (cur ? { ...cur, dirty: false, saving: false } : cur));
        load(path);
      })
      .catch((err) => {
        toast.error(ui("screen.20e1b0f2590bc7", { v0: (err as Error).message }));
        setEdit((cur) => (cur ? { ...cur, saving: false } : cur));
      });
  };

  const del = (e: WorkspaceEntry) => {
    if (
      !window.confirm(
        ui("screen.3a786999516d49", {
          v0: e.dir ? ui("screen.52daa71ebc3105") : ui("screen.39932f24fe11a6"),
          v1: e.name,
          v2: e.dir ? ui("screen.ae5d8ac7afd3cb") : "",
        }),
      )
    )
      return;
    api
      .workspaceDelete(e.path)
      .then(() => {
        toast.success(ui("screen.077a6d37719a0e"));
        load(path);
      })
      .catch((err) => toast.error(ui("screen.77dcc9d08e857c", { v0: (err as Error).message })));
  };

  const doUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    api
      .workspaceUpload(path, Array.from(files))
      .then((r) => {
        toast.success(ui("screen.dc75e034e98100", { v0: r.uploaded }));
        load(path);
      })
      .catch((err) => toast.error(ui("screen.a6794c150f204c", { v0: (err as Error).message })))
      .finally(() => {
        if (uploadRef.current) uploadRef.current.value = "";
      });
  };

  const doMkdir = () => {
    const name = mkdirName.trim();
    if (!name) return;
    const target = path ? `${path}/${name}` : name;
    api
      .workspaceMkdir(target)
      .then(() => {
        toast.success(ui("screen.c28d7343946db1"));
        setMkdirOpen(false);
        setMkdirName("");
        load(path);
      })
      .catch((err) => toast.error(ui("screen.12a4969260f84f", { v0: (err as Error).message })));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 头部：面包屑 + 操作 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1 text-sm">
          <HardDriveIcon className="text-muted-foreground mr-1 size-4 shrink-0" />
          {crumbs.map((c, i) => (
            <React.Fragment key={c.path}>
              {i > 0 && <span className="text-muted-foreground">/</span>}
              <button
                type="button"
                onClick={() => load(c.path)}
                className={cn(
                  "max-w-[160px] truncate rounded px-1.5 py-0.5 hover:bg-accent",
                  i === crumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {c.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMkdirOpen(true)}>
            <FolderPlusIcon /> {ui("screen.84244abc71de03")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => uploadRef.current?.click()}>
            <UploadIcon /> {ui("screen.9e07e3c0532d49")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => load(path)}
            title={ui("screen.aee88743413144")}
          >
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
          </Button>
          <input ref={uploadRef} type="file" multiple className="hidden" onChange={(e) => doUpload(e.target.files)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ui("screen.d44e9b3d3b31d3")}</TableHead>
                <TableHead className="w-28 text-right">{ui("screen.50db7447b966f5")}</TableHead>
                <TableHead className="w-40">{ui("screen.257bbcc44c839d")}</TableHead>
                <TableHead className="w-24 text-right">{ui("screen.ed31fbb483ee1b")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground py-10 text-center text-sm">
                    {loading ? ui("screen.4927a53bcc886a") : ui("screen.3ea0e6e41518ea")}
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => (
                <TableRow key={e.path}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => (e.dir ? load(e.path) : openFile(e))}
                      className="flex items-center gap-2 text-left hover:underline"
                    >
                      {e.dir ? (
                        <FolderIcon className="size-4 shrink-0 text-blue-500" />
                      ) : (
                        <FileIcon className="text-muted-foreground size-4 shrink-0" />
                      )}
                      <span className="truncate font-mono text-sm">{e.name}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right font-mono text-xs">
                    {e.dir ? "—" : fmtSize(e.size)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{fmtTime(e.mtime, ui)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {!e.dir && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title={ui("screen.4673a230616561")}
                          onClick={() =>
                            api
                              .workspaceDownload(e.path)
                              .catch((err) => toast.error(ui("screen.0c40112af71437", { v0: (err as Error).message })))
                          }
                        >
                          <DownloadIcon className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive size-7"
                        title={ui("screen.2f9daa828907b9")}
                        onClick={() => del(e)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 文件查看 / 编辑 */}
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          {edit && (
            <>
              <SheetHeader className="border-b p-4">
                <SheetTitle className="flex items-center gap-2 truncate font-mono text-sm">
                  <FileIcon className="size-4 shrink-0" />
                  <span className="truncate" title={edit.file.path}>
                    {edit.file.path}
                  </span>
                </SheetTitle>
                <span className="text-muted-foreground text-xs">{fmtSize(edit.file.size)}</span>
              </SheetHeader>

              {edit.file.binary || edit.file.too_large ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    {edit.file.too_large ? ui("screen.15678c48f7988d") : ui("screen.c54a32ff99392f")}
                  </p>
                  <Button variant="outline" onClick={() => api.workspaceDownload(edit.file.path)}>
                    <DownloadIcon /> {ui("screen.3926d1bb98be84")}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="min-h-0 flex-1 p-3">
                    <Textarea
                      value={edit.content}
                      onChange={(ev) => setEdit({ ...edit, content: ev.target.value, dirty: true })}
                      spellCheck={false}
                      className="h-full min-h-[50vh] resize-none font-mono text-xs leading-relaxed"
                    />
                  </div>
                  <SheetFooter className="flex-row items-center justify-between border-t p-3">
                    <span className="text-muted-foreground text-xs">
                      {edit.dirty ? ui("screen.5e531ad8243728") : ui("screen.04062edb583b7c")}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => api.workspaceDownload(edit.file.path)}>
                        <DownloadIcon /> {ui("screen.4673a230616561")}
                      </Button>
                      <Button onClick={saveFile} disabled={!edit.dirty || edit.saving}>
                        <SaveIcon /> {edit.saving ? ui("screen.ff509c9ba052a2") : ui("screen.a3030bf8f16dc6")}
                      </Button>
                    </div>
                  </SheetFooter>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 新建文件夹 */}
      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{ui("screen.84244abc71de03")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={mkdirName}
            onChange={(e) => setMkdirName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doMkdir()}
            placeholder={ui("screen.bacf701908d8cf")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMkdirOpen(false)}>
              {ui("screen.2cd0f3be8738a8")}
            </Button>
            <Button onClick={doMkdir} disabled={!mkdirName.trim()}>
              {ui("screen.cde2cd071d25bb")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <React.Suspense fallback={null}>
      <WorkspaceInner />
    </React.Suspense>
  );
}
