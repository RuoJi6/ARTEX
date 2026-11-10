"use client";
import * as React from "react";

import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { Finding, FindingsPage } from "@/lib/types";

export function LinkTrafficDialog({
  trafficIds,
  onClose,
  onBound,
}: {
  trafficIds: string[];
  onClose: () => void;
  onBound: () => void;
}) {
  const { ui } = useUITranslation();

  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<FindingsPage | null>(null);
  const [selected, setSelected] = React.useState<Finding | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api
        .findingsPage({ page, pageSize: 20, query })
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
  }, [query, page]);
  async function save() {
    if (!selected?.finding_id) return;
    setBusy(true);
    setError("");
    try {
      await api.bindFindingTraffic(
        selected.finding_id,
        trafficIds.map((traffic_id) => ({ traffic_id })),
      );
      toast.success(ui("screen.183020f5fa4d3a", { v0: trafficIds.length, v1: selected.finding_id }));
      onBound();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ui("screen.ab5bc41d5f9382")}</DialogTitle>
          <DialogDescription>
            {ui("screen.e305ee7bd591fb")}
            {trafficIds.length} {ui("screen.d95a8e2256293c")}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="link-finding-query">{ui("screen.a22ab222d53d8a")}</FieldLabel>
            <Input
              id="link-finding-query"
              placeholder={ui("screen.ea638f066222c2")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </Field>
        </FieldGroup>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex max-h-[40vh] flex-col gap-2 overflow-auto" aria-busy={loading}>
          {(data?.items ?? []).map((f) => (
            <Button
              key={f.finding_id ?? f.id}
              variant={selected?.finding_id === f.finding_id ? "secondary" : "outline"}
              className="h-auto justify-start p-3 text-left whitespace-normal"
              aria-pressed={selected?.finding_id === f.finding_id}
              disabled={busy || !f.finding_id || f.inherited}
              onClick={() => setSelected(f)}
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span>
                  #{f.finding_id ?? f.id} · {f.name || f.vulnclass}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{f.summary}</span>
              </span>
            </Button>
          ))}
          {!data?.items.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {loading ? ui("screen.4927a53bcc886a") : ui("screen.94d173e977ae14")}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>
            {ui("screen.c9b9ae7a61444a")}
          </Button>
          <span className="text-xs">
            {ui("screen.af50a0fe2a50a3")}
            {page} {ui("screen.edf75360e0ef6a")}
            {data?.total ?? 0} {ui("screen.f004f1d84cf962")}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page * 20 >= (data?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
          >
            {ui("screen.8a8542f6964852")}
          </Button>
        </div>
        <p className="text-sm">
          {selected
            ? ui("screen.7705a5c746fb41", { v0: selected.finding_id, v1: selected.name || selected.vulnclass })
            : ui("screen.7caaf780458dd1")}
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {ui("screen.2cd0f3be8738a8")}
          </Button>
          <Button disabled={busy || !selected} onClick={() => void save()}>
            {busy ? ui("screen.ff509c9ba052a2") : ui("screen.09b3921a4f98ce")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
