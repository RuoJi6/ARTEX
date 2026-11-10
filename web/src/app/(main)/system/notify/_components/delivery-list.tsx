"use client";

import * as React from "react";

import { RefreshCwIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notificationError } from "@/i18n/notify-runtime";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { api } from "@/lib/api";
import { statusMeta, toneClasses } from "@/lib/status";
import type { NotificationChannel, NotificationDelivery } from "@/lib/types";

// DeliveryList 是投递记录表：可按渠道与状态筛选，失败项可手动重发。
export function DeliveryList({ channels }: { channels: NotificationChannel[] }) {
  const { t: translate, liveT, i18n } = useLiveTranslation();
  const [rows, setRows] = React.useState<NotificationDelivery[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [channelID, setChannelID] = React.useState<number | undefined>(undefined);
  const [state, setState] = React.useState<string | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const pageSize = 50;

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .notifyDeliveries({ channelId: channelID, state, page, pageSize })
      .then((r) => {
        setRows(r.deliveries);
        setTotal(r.total);
      })
      .catch((e) => toast.error(liveT("notify.loadDeliveriesFailed", { message: notificationError(e, liveT) })))
      .finally(() => setLoading(false));
  }, [channelID, state, page, liveT]);
  React.useEffect(() => {
    load();
  }, [load]);

  async function retry(id: number) {
    try {
      await api.notifyRetryDelivery(id);
      toast.success(translate("notify.requeued"));
      load();
    } catch (e) {
      toast.error(translate("notify.retryFailed", { message: notificationError(e, translate) }));
    }
  }

  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={channelID ? String(channelID) : "all"}
          onValueChange={(v) => {
            setPage(1);
            setChannelID(v === "all" ? undefined : Number(v));
          }}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder={translate("notify.allChannels")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translate("notify.allChannels")}</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state ?? "all"}
          onValueChange={(v) => {
            setPage(1);
            setState(v === "all" ? undefined : v);
          }}
        >
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder={translate("notify.allStates")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translate("notify.allStates")}</SelectItem>
            {["pending", "sending", "sent", "failed", "skipped"].map((s) => (
              <SelectItem key={s} value={s}>
                {statusMeta("delivery", s, translate).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCwIcon className={loading ? "animate-spin" : ""} /> {translate("notify.refresh")}
        </Button>
        <span className="text-muted-foreground ml-auto text-xs">{translate("notify.total", { count: total })}</span>
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">{translate("notify.time")}</TableHead>
              <TableHead>{translate("notify.finding")}</TableHead>
              <TableHead className="w-40">{translate("notify.channels")}</TableHead>
              <TableHead className="w-24">{translate("notify.status")}</TableHead>
              <TableHead className="w-16">{translate("notify.attempts")}</TableHead>
              <TableHead>{translate("notify.error")}</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                  {loading ? translate("notify.loading") : translate("notify.emptyDeliveries")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatTime(d.created_at, i18n.resolvedLanguage ?? "zh-CN")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={toneClasses[statusMeta("severity", d.severity, translate).tone]}
                      >
                        {statusMeta("severity", d.severity, translate).label}
                      </Badge>
                      <span className="truncate text-sm">{d.title || translate("notify.untitled")}</span>
                      {d.event_kind === "finding_status_changed" && (
                        <Badge variant="outline" className="shrink-0">
                          {translate("notify.statusChanged")}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{d.channel_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={toneClasses[statusMeta("delivery", d.state, translate).tone]}>
                      {statusMeta("delivery", d.state, translate).label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{d.attempts}</TableCell>
                  <TableCell className="text-muted-foreground max-w-md text-xs break-all">
                    {d.last_error ? notificationError(d.last_error, translate) : ""}
                  </TableCell>
                  <TableCell>
                    {/* 只有失败/跳过的才给重发入口：已送达的重发会造成重复推送。 */}
                    {(d.state === "failed" || d.state === "skipped") && (
                      <Button size="sm" variant="outline" onClick={() => retry(d.id)}>
                        <RotateCcwIcon /> {translate("notify.retry")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {maxPage > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {translate("notify.previous")}
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {maxPage}
          </span>
          <Button size="sm" variant="outline" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>
            {translate("notify.next")}
          </Button>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, { hour12: false });
}
