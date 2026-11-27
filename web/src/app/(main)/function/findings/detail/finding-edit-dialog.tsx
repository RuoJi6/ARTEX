"use client";
import * as React from "react";

import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { taskError } from "@/i18n/task-runtime";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import { statusMeta } from "@/lib/status";
import { type Finding, type FindingStatus, MAX_FINDING_REMARK_RUNES, type Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const FINDING_STATUSES: FindingStatus[] = [
  "pending",
  "in_progress",
  "confirmed",
  "resolved",
  "fixed",
  "false_positive",
  "ignored",
  "duplicate",
  "risk_accepted",
];

type FindingDraft = {
  name: string;
  vulnclass: string;
  severity: Severity;
  status: FindingStatus;
  summary: string;
  evidence: string;
  report: string;
  remark: string;
};

function draftFromFinding(f: Finding): FindingDraft {
  return {
    name: f.name ?? "",
    vulnclass: f.vulnclass,
    severity: f.severity,
    status: f.status,
    summary: f.summary,
    evidence: f.evidence,
    report: f.report ?? "",
    remark: f.remark ?? "",
  };
}

export function FindingEditDialog({
  finding,
  open,
  onOpenChange,
  onSaved,
}: {
  finding: Finding;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: Finding) => void;
}) {
  const { ui, liveUI } = useUITranslation();
  const { t, liveT } = useLiveTranslation();
  const [draft, setDraft] = React.useState<FindingDraft>(() => draftFromFinding(finding));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDraft(draftFromFinding(finding));
    }
  }, [open, finding]);

  const trimmedRemark = draft.remark.trim();
  const remarkRunes = Array.from(trimmedRemark).length;
  const remarkTooLong = remarkRunes > MAX_FINDING_REMARK_RUNES;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || remarkTooLong) return;

    const patchPayload: Parameters<typeof api.updateFinding>[1] = {};
    const nextName = draft.name.trim();
    const nextVulnClass = draft.vulnclass.trim();
    const nextSummary = draft.summary.trim();
    const nextEvidence = draft.evidence.trim() ? draft.evidence : "";
    const nextReport = draft.report.trim() ? draft.report : "";

    if (nextName !== (finding.name ?? "").trim()) patchPayload.name = nextName;
    if (nextVulnClass !== finding.vulnclass.trim()) patchPayload.vulnclass = nextVulnClass;
    if (draft.severity !== finding.severity) patchPayload.severity = draft.severity;
    if (draft.status !== finding.status) patchPayload.status = draft.status;
    if (nextSummary !== finding.summary.trim()) patchPayload.summary = nextSummary;
    if (nextEvidence !== finding.evidence) patchPayload.evidence = nextEvidence;
    if (nextReport !== (finding.report ?? "")) patchPayload.report = nextReport;
    if (trimmedRemark !== (finding.remark ?? "").trim()) patchPayload.remark = trimmedRemark;

    if (Object.keys(patchPayload).length === 0) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateFinding(finding.id, patchPayload);
      onSaved(updated);
      toast.success(liveUI("findingDetail.findingSaved"));
      onOpenChange(false);
    } catch (err) {
      toast.error(liveUI("screen.20e1b0f2590bc7", { v0: taskError(err, liveT) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{ui("findingDetail.editTitle")}</DialogTitle>
          <DialogDescription>{ui("findingDetail.editDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="finding-edit-name">{ui("findingDetail.nameLabel")}</Label>
              <Input
                id="finding-edit-name"
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft((cur) => ({ ...cur, name: e.target.value }))}
                placeholder={ui("screen.e4ca1c94d239bd")}
                disabled={saving}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="finding-edit-vulnclass">{ui("screen.5600494fad709b")}</Label>
                <Input
                  id="finding-edit-vulnclass"
                  value={draft.vulnclass}
                  onChange={(e) => setDraft((cur) => ({ ...cur, vulnclass: e.target.value }))}
                  placeholder={ui("screen.18f8e077cc27a6")}
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{ui("screen.2e21284b7229e6")}</Label>
                <Select
                  value={draft.severity}
                  onValueChange={(v) => setDraft((cur) => ({ ...cur, severity: v as Severity }))}
                  disabled={saving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {SEVERITIES.map((sv) => (
                        <SelectItem key={sv} value={sv}>
                          {statusMeta("severity", sv, t).label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{ui("screen.d5e74de3449e74")}</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft((cur) => ({ ...cur, status: v as FindingStatus }))}
                  disabled={saving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {FINDING_STATUSES.map((st) => (
                        <SelectItem key={st} value={st}>
                          {statusMeta("finding", st, t).label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="finding-edit-remark">{ui("findingDetail.remark")}</Label>
                <span
                  className={cn("text-xs tabular-nums", remarkTooLong ? "text-destructive" : "text-muted-foreground")}
                >
                  {remarkRunes} / {MAX_FINDING_REMARK_RUNES}
                </span>
              </div>
              <Textarea
                id="finding-edit-remark"
                rows={3}
                value={draft.remark}
                onChange={(e) => setDraft((cur) => ({ ...cur, remark: e.target.value }))}
                placeholder={ui("findingDetail.remarkPlaceholder")}
                aria-invalid={remarkTooLong}
                disabled={saving}
              />
              {remarkTooLong ? (
                <p role="alert" className="text-destructive text-xs">
                  {ui("findingDetail.remarkTooLong", { max: MAX_FINDING_REMARK_RUNES })}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="finding-edit-summary">{ui("screen.21c04b2eeeb431")}</Label>
              <Textarea
                id="finding-edit-summary"
                rows={3}
                value={draft.summary}
                onChange={(e) => setDraft((cur) => ({ ...cur, summary: e.target.value }))}
                placeholder={ui("findingDetail.summaryPlaceholder")}
                disabled={saving}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="finding-edit-evidence">{ui("screen.c13ed981c63391")}</Label>
              <Textarea
                id="finding-edit-evidence"
                rows={4}
                className="font-mono text-xs"
                value={draft.evidence}
                onChange={(e) => setDraft((cur) => ({ ...cur, evidence: e.target.value }))}
                placeholder={ui("findingDetail.evidencePlaceholder")}
                disabled={saving}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="finding-edit-report">{ui("screen.566e5ab4ab0638")}</Label>
              <Textarea
                id="finding-edit-report"
                rows={6}
                className="font-mono text-xs"
                value={draft.report}
                onChange={(e) => setDraft((cur) => ({ ...cur, report: e.target.value }))}
                placeholder={ui("findingDetail.reportPlaceholder")}
                disabled={saving}
              />
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 border-t px-6 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {ui("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving || remarkTooLong}>
              {saving ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
              {saving ? ui("screen.ff509c9ba052a2") : ui("screen.a3030bf8f16dc6")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
