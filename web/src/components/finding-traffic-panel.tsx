"use client";

import { useLocaleFormatting } from "@/i18n/formatting";

import * as React from "react";

import { useRouter } from "next/navigation";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { headersFromReqHead, requestFromEvidence } from "@/components/repeater/repeater-http";
import { seedFromEvidence } from "@/components/repeater/repeater-store";
import { TrafficEvidenceViewer } from "@/components/traffic-evidence-viewer";
import { TrafficPickerDialog } from "@/components/traffic-picker-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { FindingTraffic, FindingTrafficBinding, TrafficEvidenceRole } from "@/lib/types";

const ROLE_VALUES: TrafficEvidenceRole[] = ["baseline", "proof", "verification", "supporting"];

export function FindingTrafficPanel({
  findingId,
  contextTask,
  readOnly,
  onChanged,
}: {
  findingId: string;
  contextTask?: string;
  readOnly?: boolean;
  onChanged: () => void;
}) {
  const format = useLocaleFormatting();
  const ui = useTranslations();
  const t = useTranslations("findings");
  const [data, setData] = React.useState<FindingTraffic | null>(null);
  const [error, setError] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const router = useRouter();
  const [repeaterBusy, setRepeaterBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<FindingTrafficBinding | null>(null);
  const [role, setRole] = React.useState<TrafficEvidenceRole>("supporting");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry token intentionally refreshes this request.
  React.useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api
      .findingTraffic(findingId, contextTask)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [findingId, contextTask, reload]);

  async function mutate(action: () => Promise<FindingTraffic>) {
    setBusy(true);
    try {
      setData(await action());
      setEditing(null);
      onChanged();
      toast.success(t("traffic.updated"));
    } catch (e) {
      toast.error((e as Error).message);
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: number) {
    if (!data) return;
    const ids = data.bindings.map((b) => b.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void mutate(() => api.orderFindingTraffic(findingId, ids, data.version, contextTask));
  }

  async function seedRepeater(bindingId: string) {
    setRepeaterBusy(true);
    try {
      const detail = await api.findingTrafficDetail(findingId, bindingId, contextTask);
      if (detail.request.binary) toast.info(ui("core.traffic.binaryRequest"));
      else if (detail.request.truncated) toast.info(ui("core.traffic.truncatedRequest"));
      seedFromEvidence(
        requestFromEvidence(
          {
            method: detail.binding.snapshot.method || "GET",
            url: detail.binding.snapshot.url || "",
            headersText: headersFromReqHead(detail.binding.snapshot.req_head),
            body: detail.request.binary ? "" : detail.request.content || "",
          },
          detail.binding.snapshot.req_head,
        ),
        { findingId, bindingId },
      );
      router.push("/function/repeater");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRepeaterBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{data ? ui("core.traffic.linkedTrafficCount", { count: data.bindings.length }) : ui("core.traffic.linkedTraffic")}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  seedFromEvidence({ method: "GET", url: "", headersText: "", body: "" });
                  router.push("/function/repeater");
                }}
              >
                {ui("core.traffic.openRepeater")}</Button>
              {!readOnly ? (
                <Button variant="outline" size="sm" disabled={!data || busy} onClick={() => setAdding(true)}>
                  <PlusIcon data-icon="inline-start" />
                  {ui("settings.intelligence.binding")}</Button>
              ) : (
                <Badge variant="outline">{ui("findings.traffic.inherited")}</Badge>
              )}
            </div>
          </div>
          <CardDescription>{t("traffic.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                <Button variant="link" onClick={() => setReload((n) => n + 1)}>
                  {t("traffic.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {!data ? (
            <Skeleton className="h-28 w-full" />
          ) : data.bindings.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t("traffic.empty")}</EmptyTitle>
                <EmptyDescription>{t("traffic.emptyHint")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            data.bindings.map((b, index) => (
              <div key={b.id} className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {index + 1}. {t(`traffic.role.${b.role}`)}
                  </Badge>
                  <Badge variant="secondary">
                    {b.snapshot.method} · {b.snapshot.status}
                  </Badge>
                  <span className="text-muted-foreground text-xs">{ui("core.traffic.evidenceNumber")}{b.id}</span>
                </div>
                <Button
                  variant="link"
                  className="h-auto justify-start whitespace-normal p-0 text-left"
                  onClick={() => setPreview(b.id)}
                >
                  <span className="break-all font-mono text-xs">{b.snapshot.url}</span>
                </Button>
                {b.note ? <p className="whitespace-pre-wrap text-sm">{b.note}</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">
                    {format.dateTime(new Date(b.snapshot.captured_at * 1000), "timestamp")}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPreview(b.id)}>
                      {t("traffic.viewRaw")}
                    </Button>
                    <Button variant="outline" size="sm" disabled={repeaterBusy} onClick={() => void seedRepeater(b.id)}>
                      {ui("core.traffic.sendRepeater")}</Button>
                    {!readOnly ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setEditing(b);
                            setRole(b.role);
                            setNote(b.note);
                          }}
                        >
                          {t("traffic.editNote")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("traffic.moveUp", { id: b.id })}
                          disabled={busy || index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("traffic.moveDown", { id: b.id })}
                          disabled={busy || index === data.bindings.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void mutate(() => api.removeFindingTraffic(findingId, b.id, data.version, contextTask))
                          }
                        >
                          {t("traffic.unbind")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      {adding && data ? (
        <TrafficPickerDialog
          findingId={findingId}
          contextTask={contextTask}
          bound={data.bindings}
          onClose={() => setAdding(false)}
          onBound={() => {
            setReload((n) => n + 1);
            onChanged();
          }}
        />
      ) : null}
      <TrafficEvidenceViewer
        findingId={findingId}
        bindingId={preview}
        contextTask={contextTask}
        onClose={() => setPreview(null)}
      />
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("traffic.editTitle")}</DialogTitle>
            <DialogDescription>{t("traffic.editDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="evidence-role">{t("traffic.roleLabel")}</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as TrafficEvidenceRole)}>
                <SelectTrigger id="evidence-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ROLE_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`traffic.role.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="evidence-note">{t("traffic.noteLabel")}</FieldLabel>
              <Textarea id="evidence-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={busy || !editing || !data}
              onClick={() => {
                if (editing && data)
                  void mutate(() =>
                    api.editFindingTraffic(findingId, editing.id, data.version, { role, note }, contextTask),
                  );
              }}
            >
              {t("traffic.saveNote")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
