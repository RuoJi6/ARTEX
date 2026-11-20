"use client";

import * as React from "react";

import { ArchiveRestoreIcon, DatabaseBackupIcon, DownloadIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { localizedError } from "@/i18n/errors";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { api, type BackupStatus } from "@/lib/api";

/** 恢复要先完成数据库整体替换和文件换装，再走一次正常启动；数据量大时比升级慢得多。 */
const RESTORE_TIMEOUT_MS = 15 * 60_000;

export function BackupCard() {
  const { t, liveT } = useLiveTranslation();
  const [status, setStatus] = React.useState<BackupStatus | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [restarting, setRestarting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    api
      .backupStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const download = async () => {
    try {
      await api.downloadBackup();
      toast.success(t("settings.backup.downloadStarted"));
    } catch (e) {
      toast.error(t("settings.backup.downloadFailedPrefix") + localizedError(e, t));
    }
  };

  // 重启期间接口连不上是预期的；以"返回本次上传对应的 restore_id 结果"为准判断新进程已就绪。
  const waitForRestore = React.useCallback(
    async (restoreId: string) => {
      setRestarting(true);
      const deadline = Date.now() + RESTORE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const tick = Promise.withResolvers<void>();
        setTimeout(tick.resolve, 3000);
        await tick.promise;
        try {
          const next = await api.backupStatus();
          if (next.last_restore?.id === restoreId) {
            window.location.reload();
            return;
          }
        } catch {
          // 继续轮询。
        }
      }
      setRestarting(false);
      toast.error(liveT("settings.backup.restoreTimeout"));
    },
    [liveT],
  );

  const restore = async () => {
    if (!file) return;
    const selected = file;
    setFile(null);
    setUploading(true);
    try {
      const res = await api.restoreBackup(selected);
      setUploading(false);
      await waitForRestore(res.restore_id);
    } catch (e) {
      setUploading(false);
      toast.error(t("settings.backup.restoreFailedPrefix") + localizedError(e, t));
    }
  };

  const busy = uploading || restarting;
  const last = status?.last_restore;

  return (
    <Card className="mb-4 break-inside-avoid md:mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseBackupIcon className="size-4" />
          {t("settings.backup.title")}
        </CardTitle>
        <CardDescription>{t("settings.backup.help")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {last?.applied ? (
          <p className="text-xs text-muted-foreground">
            {t("settings.backup.lastRestoreOk", {
              time: new Date(last.at).toLocaleString(),
              version: last.source_version || "-",
            })}
          </p>
        ) : null}
        {last && !last.applied && last.error ? (
          <p role="alert" className="text-xs text-destructive">
            {t("settings.backup.lastRestoreFailed", { message: last.error })}
          </p>
        ) : null}
        {status?.pending && !busy ? (
          <p className="text-xs text-muted-foreground">{t("settings.backup.pending")}</p>
        ) : null}

        {busy ? (
          <div className="space-y-1.5">
            <Progress value={100} className="animate-pulse" />
            <p className="text-xs text-muted-foreground">
              {restarting ? t("settings.backup.restarting") : t("settings.backup.uploading")}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={download} disabled={busy}>
            <DownloadIcon className="size-4" />
            {t("settings.backup.download")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            <ArchiveRestoreIcon className="size-4" />
            {t("settings.backup.restore")}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".zst,.tar.zst"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>

        <p className="text-xs text-muted-foreground">{t("settings.backup.note")}</p>
      </CardContent>

      <AlertDialog open={file !== null} onOpenChange={(open) => (open ? null : setFile(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.backup.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.backup.confirmBody", { name: file?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.backup.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={restore}>
              {t("settings.backup.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
