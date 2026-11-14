"use client";

import { useCallback, useEffect, useState } from "react";

import { CopyIcon, PlugZapIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { localizedError } from "@/i18n/errors";
import { useDateLocale } from "@/i18n/use-date-locale";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import {
  api,
  type McpServerAuditEntry,
  type McpServerScope,
  type McpServerSettings,
  type McpServerToken,
} from "@/lib/api";
import type { Company } from "@/lib/types";

// API scope value -> translation key suffix. Scope values contain ":", which
// i18next reads as a namespace separator, so they cannot be used as keys.
const SCOPES: { value: McpServerScope; key: string }[] = [
  { value: "read", key: "read" },
  { value: "task:create", key: "taskCreate" },
  { value: "task:control", key: "taskControl" },
];

type TokenStatus = "active" | "revoked" | "expired";

function tokenStatus(token: McpServerToken): TokenStatus {
  if (token.revoked_at) return "revoked";
  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
}

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale, { hour12: false });
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // navigator.clipboard is unavailable on plain-HTTP LAN origins.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }
}

const emptyForm = {
  name: "",
  scopes: ["read"] as McpServerScope[],
  companyIds: [] as number[],
  days: "0",
  maxActive: "0",
  maxHourly: "0",
};

export function McpServerCard() {
  const { t } = useLiveTranslation();
  const { locale } = useDateLocale();
  const [settings, setSettings] = useState<McpServerSettings | null>(null);
  const [tokens, setTokens] = useState<McpServerToken[]>([]);
  const [audit, setAudit] = useState<McpServerAuditEntry[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ action: "revoke" | "delete"; token: McpServerToken } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextSettings, nextTokens, nextAudit] = await Promise.all([
        api.mcpServerSettings(),
        api.mcpServerTokens(),
        api.mcpServerAudit(),
      ]);
      setSettings(nextSettings);
      setTokens(nextTokens);
      setAudit(nextAudit);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const endpoint = typeof window === "undefined" || !settings ? "" : `${window.location.origin}${settings.path}`;

  const copy = async (text: string) => {
    await copyText(text);
    toast.success(t("settings.mcpServer.copied"));
  };

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      setSettings(await api.setMcpServerEnabled(enabled));
      toast.success(enabled ? t("settings.mcpServer.enabled") : t("settings.mcpServer.disabled"));
    } catch (e) {
      toast.error(t("settings.saveFailed", { message: localizedError(e, t) }));
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setForm(emptyForm);
    setCreateError(null);
    setCreateOpen(true);
    api
      .companies()
      .then(setCompanies)
      .catch(() => setCompanies([]));
  };

  const toggleIn = <T,>(list: T[], value: T, on: boolean) => (on ? [...list, value] : list.filter((v) => v !== value));

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const result = await api.createMcpServerToken({
        name: form.name.trim(),
        scopes: form.scopes,
        company_ids: form.companyIds,
        expires_in_days: Number.parseInt(form.days, 10) || 0,
        max_active_tasks: Number.parseInt(form.maxActive, 10) || 0,
        max_tasks_per_hour: Number.parseInt(form.maxHourly, 10) || 0,
      });
      setCreateOpen(false);
      setCreatedToken(result.token);
      void load();
    } catch (e) {
      setCreateError(e);
    } finally {
      setCreating(false);
    }
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    const { action, token } = confirm;
    setConfirm(null);
    try {
      if (action === "revoke") {
        await api.revokeMcpServerToken(token.id);
        toast.success(t("settings.mcpServer.revoked"));
      } else {
        await api.deleteMcpServerToken(token.id);
        toast.success(t("settings.mcpServer.deleted"));
      }
      void load();
    } catch (e) {
      toast.error(t("settings.saveFailed", { message: localizedError(e, t) }));
    }
  };

  const limit = (n: number) => (n > 0 ? String(n) : t("settings.mcpServer.unlimited"));

  return (
    <Card className="mb-4 break-inside-avoid md:mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlugZapIcon className="size-4" />
          {t("settings.mcpServer.title")}
        </CardTitle>
        <CardDescription>{t("settings.mcpServer.help")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="mcp-server-enabled">{t("settings.mcpServer.enable")}</FieldLabel>
            <Switch
              id="mcp-server-enabled"
              checked={settings?.enabled ?? false}
              onCheckedChange={toggle}
              disabled={!settings || saving}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="mcp-server-endpoint">{t("settings.mcpServer.endpoint")}</FieldLabel>
            <div className="flex gap-2">
              <Input id="mcp-server-endpoint" readOnly value={endpoint} className="font-mono text-xs" />
              <Button type="button" variant="outline" disabled={!endpoint} onClick={() => copy(endpoint)}>
                <CopyIcon />
                {t("settings.mcpServer.copy")}
              </Button>
            </div>
            <FieldDescription>{t("settings.mcpServer.endpointHelp")}</FieldDescription>
            <FieldDescription className="text-foreground">{t("settings.mcpServer.noBasicAuth")}</FieldDescription>
            {settings?.basic_auth_enabled ? (
              <FieldDescription>{t("settings.mcpServer.basicAuthOn")}</FieldDescription>
            ) : null}
          </Field>

          {error ? (
            <div className="flex items-center gap-2">
              <p role="alert" className="text-destructive text-sm">
                {t("settings.readFailed", { message: localizedError(error, t) })}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={load}>
                {t("settings.reload")}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">{t("settings.mcpServer.tokens")}</span>
              <Button type="button" size="sm" disabled={!settings} onClick={openCreate}>
                <PlusIcon />
                {t("settings.mcpServer.newToken")}
              </Button>
            </div>
            {tokens.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("settings.mcpServer.noTokens")}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {tokens.map((token) => {
                  const status = tokenStatus(token);
                  return (
                    <li key={token.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-sm">{token.name}</span>
                          <Badge variant={status === "active" ? "secondary" : "destructive"}>
                            {t(`settings.mcpServer.status.${status}`)}
                          </Badge>
                          <code className="text-muted-foreground text-xs">{token.token_prefix}…</code>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {SCOPES.filter((scope) => token.scopes.includes(scope.value)).map((scope) => (
                            <Badge key={scope.value} variant="outline">
                              {t(`settings.mcpServer.scope.${scope.key}`)}
                            </Badge>
                          ))}
                          <Badge variant="outline">
                            {token.company_ids.length === 0
                              ? t("settings.mcpServer.allCompanies")
                              : t("settings.mcpServer.companyCount", { n: token.company_ids.length })}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {token.last_used_at
                            ? t("settings.mcpServer.lastUsed", { time: formatTime(token.last_used_at, locale) })
                            : t("settings.mcpServer.neverUsed")}
                          {" · "}
                          {token.expires_at
                            ? t("settings.mcpServer.expires", { time: formatTime(token.expires_at, locale) })
                            : t("settings.mcpServer.neverExpires")}
                        </p>
                        {token.scopes.includes("task:create") ? (
                          <p className="text-muted-foreground text-xs">
                            {t("settings.mcpServer.limits", {
                              active: limit(token.max_active_tasks),
                              hourly: limit(token.max_tasks_per_hour),
                            })}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirm({ action: status === "active" ? "revoke" : "delete", token })}
                      >
                        {status === "active" ? t("settings.mcpServer.revoke") : t("settings.mcpServer.delete")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-medium text-sm">{t("settings.mcpServer.audit")}</span>
                <p className="text-muted-foreground text-xs">{t("settings.mcpServer.auditHelp")}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={load}>
                <RefreshCwIcon />
                {t("settings.mcpServer.refresh")}
              </Button>
            </div>
            {audit.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("settings.mcpServer.noAudit")}</p>
            ) : (
              <ul className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border">
                {audit.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1 p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={entry.ok ? "secondary" : "destructive"}>
                        {entry.ok ? t("settings.mcpServer.auditOk") : t("settings.mcpServer.auditFailed")}
                      </Badge>
                      <code className="font-medium">{entry.tool}</code>
                      <span className="text-muted-foreground">{entry.token_name}</span>
                      <span className="text-muted-foreground">{formatTime(entry.created_at, locale)}</span>
                      <span className="text-muted-foreground">{entry.remote_addr}</span>
                    </div>
                    <code className="break-all text-muted-foreground">{entry.args}</code>
                    {entry.ok ? null : <span className="break-all text-destructive">{entry.result}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FieldGroup>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={create} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("settings.mcpServer.createTitle")}</DialogTitle>
              <DialogDescription>{t("settings.mcpServer.createHelp")}</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="mcp-token-name">{t("settings.mcpServer.name")}</FieldLabel>
                <Input
                  id="mcp-token-name"
                  required
                  maxLength={80}
                  value={form.name}
                  placeholder={t("settings.mcpServer.namePlaceholder")}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel>{t("settings.mcpServer.scopes")}</FieldLabel>
                {SCOPES.map((scope) => (
                  <label
                    key={scope.value}
                    htmlFor={`mcp-scope-${scope.key}`}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Checkbox
                      id={`mcp-scope-${scope.key}`}
                      className="mt-0.5"
                      checked={form.scopes.includes(scope.value)}
                      onCheckedChange={(on) =>
                        setForm({ ...form, scopes: toggleIn(form.scopes, scope.value, on === true) })
                      }
                    />
                    <span>
                      {t(`settings.mcpServer.scope.${scope.key}`)}
                      <span className="block text-muted-foreground text-xs">
                        {t(`settings.mcpServer.scopeHelp.${scope.key}`)}
                      </span>
                    </span>
                  </label>
                ))}
              </Field>
              <Field>
                <FieldLabel>{t("settings.mcpServer.companies")}</FieldLabel>
                {companies.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("settings.mcpServer.noCompanies")}</p>
                ) : (
                  <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-lg border p-2">
                    {companies.map((company) => (
                      <label
                        key={company.id}
                        htmlFor={`mcp-company-${company.id}`}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          id={`mcp-company-${company.id}`}
                          checked={form.companyIds.includes(company.id)}
                          onCheckedChange={(on) =>
                            setForm({ ...form, companyIds: toggleIn(form.companyIds, company.id, on === true) })
                          }
                        />
                        <span className="truncate">{company.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <FieldDescription>{t("settings.mcpServer.companiesHelp")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="mcp-token-days">{t("settings.mcpServer.expiry")}</FieldLabel>
                <Input
                  id="mcp-token-days"
                  type="number"
                  min={0}
                  max={3650}
                  value={form.days}
                  onChange={(e) => setForm({ ...form, days: e.target.value })}
                />
                <FieldDescription>{t("settings.mcpServer.expiryHelp")}</FieldDescription>
              </Field>
              {form.scopes.includes("task:create") ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="mcp-token-active">{t("settings.mcpServer.maxActive")}</FieldLabel>
                    <Input
                      id="mcp-token-active"
                      type="number"
                      min={0}
                      max={10000}
                      value={form.maxActive}
                      onChange={(e) => setForm({ ...form, maxActive: e.target.value })}
                    />
                    <FieldDescription>{t("settings.mcpServer.maxActiveHelp")}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="mcp-token-hourly">{t("settings.mcpServer.maxHourly")}</FieldLabel>
                    <Input
                      id="mcp-token-hourly"
                      type="number"
                      min={0}
                      max={10000}
                      value={form.maxHourly}
                      onChange={(e) => setForm({ ...form, maxHourly: e.target.value })}
                    />
                    <FieldDescription>{t("settings.mcpServer.maxHourlyHelp")}</FieldDescription>
                  </Field>
                </>
              ) : null}
              {createError ? (
                <p role="alert" className="text-destructive text-sm">
                  {t("settings.saveFailed", { message: localizedError(createError, t) })}
                </p>
              ) : null}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                {t("settings.mcpServer.cancel")}
              </Button>
              <Button type="submit" disabled={creating || form.scopes.length === 0}>
                {creating ? t("settings.mcpServer.creating") : t("settings.mcpServer.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createdToken !== null} onOpenChange={(open) => (open ? null : setCreatedToken(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.mcpServer.createdTitle")}</DialogTitle>
            <DialogDescription>{t("settings.mcpServer.createdHelp")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={createdToken ?? ""} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={() => copy(createdToken ?? "")}>
              <CopyIcon />
              {t("settings.mcpServer.copy")}
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setCreatedToken(null)}>
              {t("settings.mcpServer.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => (open ? null : setConfirm(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "delete" ? t("settings.mcpServer.delete") : t("settings.mcpServer.revoke")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm
                ? t(
                    confirm.action === "delete"
                      ? "settings.mcpServer.deleteConfirm"
                      : "settings.mcpServer.revokeConfirm",
                    { name: confirm.token.name },
                  )
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.mcpServer.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirmed}>
              {confirm?.action === "delete" ? t("settings.mcpServer.delete") : t("settings.mcpServer.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
