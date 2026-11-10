"use client";
import * as React from "react";

import { useRouter } from "next/navigation";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react";
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
import { type UITranslate, useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { FindingTraffic, FindingTrafficBinding, TrafficEvidenceRole } from "@/lib/types";

const ROLES = (ui: UITranslate): Record<TrafficEvidenceRole, string> => ({
  baseline: ui("screen.14a438753ba86e"),
  proof: ui("screen.aafa576d00d6a8"),
  verification: ui("screen.5932424b6eabc6"),
  supporting: ui("screen.e648416509faf7"),
});

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
  const { ui } = useUITranslation();

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
      toast.success(ui("screen.fb1d74d3ebcbd3"));
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
      if (detail.request.binary) toast.info(ui("screen.eb861990fec8a3"));
      else if (detail.request.truncated) toast.info(ui("screen.428e2bfcf2ec39"));
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
            <CardTitle>
              {ui("screen.a7c31507efd1ff")}
              {data ? `(${data.bindings.length})` : ""}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  seedFromEvidence({ method: "GET", url: "", headersText: "", body: "" });
                  router.push("/function/repeater");
                }}
              >
                {ui("screen.0abca1e1e89934")}
              </Button>
              {!readOnly ? (
                <Button variant="outline" size="sm" disabled={!data || busy} onClick={() => setAdding(true)}>
                  <PlusIcon data-icon="inline-start" />
                  {ui("screen.1d0dd2ccf47064")}
                </Button>
              ) : (
                <Badge variant="outline">{ui("screen.c94d859ecbaa9b")}</Badge>
              )}
            </div>
          </div>
          <CardDescription>{ui("screen.876d94e5120d72")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                <Button variant="link" onClick={() => setReload((n) => n + 1)}>
                  {ui("screen.b8784c8dd5636f")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {!data ? (
            <Skeleton className="h-28 w-full" />
          ) : data.bindings.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{ui("screen.7c5d92ffe8638b")}</EmptyTitle>
                <EmptyDescription>{ui("screen.d99e38fd85204a")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            data.bindings.map((b, index) => (
              <div key={b.id} className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {index + 1}. {ROLES(ui)[b.role]}
                  </Badge>
                  <Badge variant="secondary">
                    {b.snapshot.method} · {b.snapshot.status}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {ui("screen.970888a77651f9")}
                    {b.id}
                  </span>
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
                    {new Date(b.snapshot.captured_at * 1000).toLocaleString(ui("screen.91610255157661"))}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPreview(b.id)}>
                      {ui("screen.5229abe810988c")}
                    </Button>
                    <Button variant="outline" size="sm" disabled={repeaterBusy} onClick={() => void seedRepeater(b.id)}>
                      {ui("screen.f69052b85f5594")}
                    </Button>
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
                          {ui("screen.ed222ef443a962")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={ui("screen.49463fb3792017", { v0: b.id })}
                          disabled={busy || index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={ui("screen.b066558718adfb", { v0: b.id })}
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
                          {ui("screen.fb3f6cc3047de5")}
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
            <DialogTitle>{ui("screen.c44583d51ef2aa")}</DialogTitle>
            <DialogDescription>{ui("screen.e7017eabe89907")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="evidence-role">{ui("screen.05b36669c4ad9a")}</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as TrafficEvidenceRole)}>
                <SelectTrigger id="evidence-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(ROLES(ui)).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="evidence-note">{ui("screen.e53e178d0cdf9e")}</FieldLabel>
              <Textarea id="evidence-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>
              {ui("screen.2cd0f3be8738a8")}
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
              {ui("screen.46625fcd2a1095")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
