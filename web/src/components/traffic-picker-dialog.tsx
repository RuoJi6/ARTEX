"use client";
import * as React from "react";

import { toast } from "sonner";

import { CapturedTrafficViewer } from "@/components/traffic-evidence-viewer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { FindingTrafficBinding, TrafficResp } from "@/lib/types";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

export function TrafficPickerDialog({
  findingId,
  contextTask,
  bound,
  onClose,
  onBound,
}: {
  findingId: string;
  contextTask?: string;
  bound: FindingTrafficBinding[];
  onClose: () => void;
  onBound: () => void;
}) {
  const { ui } = useUITranslation();

  const [host, setHost] = React.useState("");
  const [method, setMethod] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [data, setData] = React.useState<TrafficResp | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [preview, setPreview] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const alreadyBound = new Set(bound.map((b) => b.snapshot.source_traffic_id));
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api
        .traffic(page, 25, host, method === "all" ? "" : method, query)
        .then((d) => {
          if (active) setData(d);
        })
        .catch((e: Error) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, host, method, query]);

  const rows = data?.exchanges ?? [];
  const selectable = rows.filter((e) => !alreadyBound.has(e.id));
  function toggle(id: string, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.bindFindingTraffic(
        findingId,
        [...selected].map((traffic_id) => ({ traffic_id })),
        contextTask,
      );
      toast.success(ui("screen.f48eac37dfd261", { v0: selected.size }));
      onBound();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{ui("screen.1d0dd2ccf47064")}</DialogTitle>
            <DialogDescription>{ui("screen.a6fdb2e564dfe8")}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="flex flex-col gap-3 sm:flex-row">
            <Field>
              <FieldLabel htmlFor="evidence-host">{ui("screen.31b163188551bf")}</FieldLabel>
              <Input
                id="evidence-host"
                value={host}
                placeholder={ui("screen.9de86a249f6972")}
                onChange={(e) => {
                  setHost(e.target.value);
                  setPage(0);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="evidence-method">{ui("screen.cf206666a6a53a")}</FieldLabel>
              <Select
                value={method}
                onValueChange={(v) => {
                  setMethod(v);
                  setPage(0);
                }}
              >
                <SelectTrigger id="evidence-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">{ui("screen.470f9e522dbc29")}</SelectItem>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="evidence-query">{ui("screen.1f7f0db90f932d")}</FieldLabel>
              <Input
                id="evidence-query"
                value={query}
                placeholder={ui("screen.027e46dc0fadc9")}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </Field>
          </FieldGroup>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="max-h-[45vh] overflow-auto rounded-md border" aria-busy={loading}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      aria-label={ui("screen.cdb7c4afc7b53a")}
                      disabled={loading || busy || selectable.length === 0}
                      checked={selectable.length > 0 && selectable.every((e) => selected.has(e.id))}
                      onCheckedChange={(checked) =>
                        setSelected((previous) => {
                          const next = new Set(previous);
                          for (const e of selectable) {
                            if (checked === true) next.add(e.id);
                            else next.delete(e.id);
                          }
                          return next;
                        })
                      }
                    />
                  </TableHead>
                  <TableHead>{ui("screen.eea931d9f29e2a")}</TableHead>
                  <TableHead>{ui("screen.8b6ff498515bcc")}</TableHead>
                  <TableHead>{ui("screen.06f7d73412128f")}</TableHead>
                  <TableHead>{ui("screen.ed31fbb483ee1b")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={ui("screen.be085904b7f30c", { v0: e.id })}
                        checked={selected.has(e.id) || alreadyBound.has(e.id)}
                        disabled={busy || loading || alreadyBound.has(e.id)}
                        onCheckedChange={(checked) => toggle(e.id, checked === true)}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">
                        {e.method} {e.url}
                      </span>
                      {alreadyBound.has(e.id) ? <Badge variant="secondary">{ui("screen.f70c0007f30ff7")}</Badge> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(e.ts).toLocaleString(ui("screen.91610255157661"))}
                    </TableCell>
                    <TableCell>{e.status}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setPreview(e.id)}>
                        {ui("screen.13d61fea9f1749")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center">
                      {loading ? ui("screen.4927a53bcc886a") : ui("screen.be35d64613edd0")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              {ui("screen.7ecf1cde648680")}
              {selected.size} {ui("screen.8ed2941e967dd6")}
              {data?.total ?? 0} {ui("screen.f004f1d84cf962")}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                {ui("screen.c9b9ae7a61444a")}
              </Button>
              <span className="text-xs">
                {ui("screen.af50a0fe2a50a3")}
                {page + 1} {ui("screen.d24d3c99460c7e")}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || (page + 1) * 25 >= (data?.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                {ui("screen.8a8542f6964852")}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={onClose}>
              {ui("screen.2cd0f3be8738a8")}
            </Button>
            <Button disabled={busy || selected.size === 0} onClick={() => void save()}>
              {busy ? ui("screen.ff509c9ba052a2") : ui("screen.d1486d5dffa3b0", { v0: selected.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CapturedTrafficViewer id={preview} onClose={() => setPreview(null)} />
    </>
  );
}
