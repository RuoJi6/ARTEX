"use client";

import { useCallback, useEffect, useState } from "react";

import { ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";

export function BasicAuthCard({ hidden = false }: { hidden?: boolean }) {
  const t = useTranslations("settings.basicAuth");
  const [enabled, setEnabled] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ key: "loadFailed" | "saveFailed"; detail: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const settings = await api.basicAuthSettings();
      setEnabled(settings.enabled);
      setUsername(settings.username);
      setPasswordSet(settings.password_set);
      setLoaded(true);
    } catch (e) {
      setError({ key: "loadFailed", detail: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const settings = await api.setBasicAuthSettings({ enabled, username: username.trim(), password });
      setEnabled(settings.enabled);
      setUsername(settings.username);
      setPasswordSet(settings.password_set);
      setPassword("");
      toast.success(t(settings.enabled ? "enabled" : "disabled"));
    } catch (e) {
      setError({ key: "saveFailed", detail: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={`${hidden ? "hidden" : ""} mb-4 break-inside-avoid md:mb-6`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4" />
          HTTP Basic Auth
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <form onSubmit={save}>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="basic-auth-enabled">{t("enable")}</FieldLabel>
              <Switch
                id="basic-auth-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={!loaded || saving}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="basic-auth-username">{t("username")}</FieldLabel>
              <Input
                id="basic-auth-username"
                autoComplete="off"
                value={username}
                required={enabled}
                disabled={!loaded || saving}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("usernamePlaceholder")}
              />
              <FieldDescription>{t("usernameHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="basic-auth-password">{t("password")}</FieldLabel>
              <Input
                id="basic-auth-password"
                type="password"
                autoComplete="new-password"
                value={password}
                required={enabled && !passwordSet}
                disabled={!loaded || saving}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t(passwordSet ? "passwordSet" : "passwordPlaceholder")}
              />
              <FieldDescription>{t("passwordHint")}</FieldDescription>
            </Field>
            <FieldDescription>{t("saveHint")}</FieldDescription>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {t(error.key, { error: error.detail })}
              </p>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-4 gap-2">
          <Button type="submit" disabled={!loaded || saving}>
            {t(saving ? "saving" : "save")}
          </Button>
          {!loaded && error ? (
            <Button type="button" variant="outline" onClick={load}>
              {t("reload")}
            </Button>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  );
}
