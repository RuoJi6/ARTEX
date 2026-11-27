"use client";

import * as React from "react";

import { CheckCircle2Icon, DownloadIcon, PlugZapIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localizedError } from "@/i18n/errors";
import { useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";

type FofaConfig = Awaited<ReturnType<typeof api.fofaConfig>>;

const SELECT_CLASS = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

export default function FofaSyncPage() {
  const { ui } = useUITranslation();

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="font-semibold text-xl">{ui("fofa.title")}</h1>
        <p className="text-muted-foreground text-sm">{ui("fofa.subtitle")}</p>
      </div>
      <FofaPanel />
    </div>
  );
}

function FofaPanel() {
  const { ui } = useUITranslation();
  const { t } = useTranslation();
  const [cfg, setCfg] = React.useState<FofaConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .fofaConfig()
      .then(setCfg)
      .catch((e) => toast.error(ui("fofa.loadFailed", { message: localizedError(e, t) })))
      .finally(() => setLoading(false));
  }, [ui, t]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <FofaConfigCard cfg={cfg} loading={loading} onChanged={load} />
      {cfg?.valid ? (
        <FofaWorkbench />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">{ui("fofa.needConfig")}</CardContent>
        </Card>
      )}
    </div>
  );
}

function FofaConfigCard({
  cfg,
  loading,
  onChanged,
}: {
  readonly cfg: FofaConfig | null;
  readonly loading: boolean;
  readonly onChanged: () => void;
}) {
  const { ui } = useUITranslation();
  const { t } = useTranslation();
  const [endpoint, setEndpoint] = React.useState("official");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [quota, setQuota] = React.useState<string | null>(null);

  const presets = cfg?.presets ?? [];
  const needEmail = !!presets.find((p) => p.id === endpoint)?.email;

  React.useEffect(() => {
    if (!cfg) return;
    setEndpoint(cfg.endpoint || "official");
    setBaseUrl(cfg.base_url || "");
    setEmail(cfg.email || "");
  }, [cfg]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.fofaSaveConfig({
        endpoint,
        base_url: endpoint === "custom" ? baseUrl.trim() : undefined,
        email: needEmail ? email.trim() : undefined,
        api_key: apiKey.trim() || undefined,
      });
      toast.success(r.valid ? ui("fofa.saved") : ui("fofa.savedIncomplete"));
      setApiKey("");
      setQuota(null);
      onChanged();
    } catch (e) {
      toast.error(ui("fofa.saveFailed", { message: localizedError(e, t) }));
    } finally {
      setBusy(false);
    }
  };

  const checkQuota = async () => {
    setBusy(true);
    setQuota(null);
    try {
      const { info } = await api.fofaQuota();
      if (!info || info.error === true) {
        setQuota(info?.message ? String(info.message) : ui("fofa.quotaAbnormal"));
        return;
      }
      const parts: string[] = [];
      if (info.remain_api_query != null) parts.push(ui("fofa.quotaQueryLeft", { count: info.remain_api_query }));
      if (info.remain_api_data != null) parts.push(ui("fofa.quotaDataLeft", { count: info.remain_api_data }));
      if (info.expiration) parts.push(ui("fofa.quotaExpiration", { value: info.expiration }));
      if (info.username) parts.push(`${info.username}${info.isvip ? ` (VIP${info.vip_level ?? ""})` : ""}`);
      setQuota(parts.length > 0 ? parts.join("  ·  ") : JSON.stringify(info));
    } catch (e) {
      toast.error(ui("fofa.quotaFailed", { message: localizedError(e, t) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlugZapIcon className="size-4" /> {ui("fofa.datasource")}
          {loading ? (
            <Badge variant="secondary">{ui("fofa.checking")}</Badge>
          ) : cfg?.valid ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">
              <CheckCircle2Icon className="mr-1 size-3" /> {ui("fofa.configured")}
            </Badge>
          ) : (
            <Badge variant="outline">{ui("fofa.notConfigured")}</Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onChanged} disabled={loading}>
          <RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} /> {ui("fofa.refresh")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fofa-endpoint">{ui("fofa.endpoint")}</Label>
            <select
              id="fofa-endpoint"
              className={SELECT_CLASS}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            >
              {(presets.length > 0 ? presets : [{ id: "official", label: "fofa.info", base_url: "", email: true }]).map(
                (p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ),
              )}
            </select>
          </div>
          {endpoint === "custom" && (
            <div className="space-y-1.5">
              <Label htmlFor="fofa-base-url">{ui("fofa.baseUrl")}</Label>
              <Input
                id="fofa-base-url"
                placeholder="https://your-proxy.example.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          )}
          {needEmail && (
            <div className="space-y-1.5">
              <Label htmlFor="fofa-email">{ui("fofa.email")}</Label>
              <Input
                id="fofa-email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="fofa-key">{cfg?.key_set ? ui("fofa.apiKeySet") : ui("fofa.apiKey")}</Label>
            <Input
              id="fofa-key"
              type="password"
              placeholder="FOFA Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={busy}>
            {ui("fofa.save")}
          </Button>
          <Button variant="outline" onClick={checkQuota} disabled={busy || !cfg?.valid}>
            {ui("fofa.quota")}
          </Button>
          {quota && <span className="text-muted-foreground font-mono text-xs">{quota}</span>}
        </div>
        <p className="text-muted-foreground text-xs">{ui("fofa.billing")}</p>
      </CardContent>
    </Card>
  );
}

function FofaWorkbench() {
  const { ui } = useUITranslation();
  const { t } = useTranslation();
  const [query, setQuery] = React.useState('domain="example.com"');
  const [size, setSize] = React.useState(1000);
  const [companyName, setCompanyName] = React.useState("");
  const [createCompany, setCreateCompany] = React.useState(true);
  const [preview, setPreview] = React.useState<{ match_size: number; sample: string[][] } | null>(null);
  const [busy, setBusy] = React.useState<"none" | "preview" | "import">("none");
  const [result, setResult] = React.useState<Awaited<ReturnType<typeof api.fofaImport>> | null>(null);

  const doPreview = async () => {
    if (!query.trim()) {
      toast.error(ui("fofa.queryRequired"));
      return;
    }
    setBusy("preview");
    setPreview(null);
    try {
      const r = await api.fofaPreview(query.trim());
      setPreview(r);
      const m = query.match(/domain="([^"]+)"/);
      if (m && !companyName) setCompanyName(m[1]);
      toast.success(ui("fofa.previewOk", { count: r.match_size }));
    } catch (e) {
      toast.error(ui("fofa.previewFailed", { message: localizedError(e, t) }));
    } finally {
      setBusy("none");
    }
  };

  const doImport = async () => {
    if (!query.trim()) {
      toast.error(ui("fofa.queryRequired"));
      return;
    }
    setBusy("import");
    setResult(null);
    try {
      const r = await api.fofaImport({
        query: query.trim(),
        size,
        company_name: companyName.trim() || undefined,
        create_company: createCompany,
      });
      setResult(r);
      toast.success(ui("fofa.imported", { ip: r.synced?.ip ?? 0, port: r.synced?.port ?? 0 }));
    } catch (e) {
      toast.error(ui("fofa.importFailed", { message: localizedError(e, t) }));
    } finally {
      setBusy("none");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{ui("fofa.workbench")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="fofa-query">{ui("fofa.query")}</Label>
            <Input
              id="fofa-query"
              placeholder='domain="example.com"'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doPreview()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fofa-size">{ui("fofa.sizeLimit")}</Label>
            <select
              id="fofa-size"
              className="border-input bg-background h-9 w-32 rounded-md border px-3 text-sm"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              {[100, 500, 1000, 5000, 10000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fofa-company">{ui("fofa.company")}</Label>
            <Input
              id="fofa-company"
              placeholder={ui("fofa.companyPlaceholder")}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2 pb-0.5">
            <label htmlFor="fofa-create-company" className="flex items-center gap-1.5 text-sm">
              <Checkbox
                id="fofa-create-company"
                checked={createCompany}
                onCheckedChange={(c) => setCreateCompany(!!c)}
              />
              {ui("fofa.createCompany")}
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={doPreview} disabled={busy !== "none"}>
            <SearchIcon className={busy === "preview" ? "size-4 animate-pulse" : "size-4"} /> {ui("fofa.preview")}
          </Button>
          <Button onClick={doImport} disabled={busy !== "none"}>
            <DownloadIcon className={busy === "import" ? "size-4 animate-pulse" : "size-4"} /> {ui("fofa.import")}
          </Button>
        </div>
        {preview && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <p>
              {ui("fofa.matchTotal")} <b>{preview.match_size}</b>
              {preview.match_size > size && (
                <span className="text-amber-600 dark:text-amber-500">{ui("fofa.truncated", { size })}</span>
              )}
            </p>
            {preview.sample?.length > 0 && (
              <pre className="text-muted-foreground overflow-x-auto font-mono text-xs">
                {JSON.stringify(preview.sample[0])}
              </pre>
            )}
          </div>
        )}
        {result && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex flex-wrap gap-3">
              {Object.entries(result.synced ?? {}).map(([k, v]) => (
                <Badge key={k} variant="secondary">
                  {k === "ip" ? ui("fofa.ip") : k === "port" ? ui("fofa.port") : k}: {v}
                </Badge>
              ))}
            </div>
            {result.companies && result.companies.length > 0 && (
              <p className="text-muted-foreground">
                {ui("fofa.companies")}
                {result.companies.join(" / ")}
              </p>
            )}
            {result.warnings?.map((wm) => (
              <p key={wm} className="text-muted-foreground text-xs">
                {wm}
              </p>
            ))}
            {result.errors && result.errors.length > 0 && (
              <ul className="list-inside list-disc text-destructive">
                {result.errors.slice(0, 10).map((em) => (
                  <li key={em}>{em}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
