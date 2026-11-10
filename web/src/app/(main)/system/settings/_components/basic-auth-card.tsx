"use client";

import { useCallback, useEffect, useState } from "react";

import { ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { localizedError } from "@/i18n/errors";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { api } from "@/lib/api";

export function BasicAuthCard() {
  const { t } = useLiveTranslation();
  const [enabled, setEnabled] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ key: string; cause: unknown } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const settings = await api.basicAuthSettings();
      setEnabled(settings.enabled);
      setUsername(settings.username);
      setPasswordSet(settings.password_set);
      setLoaded(true);
    } catch (e) {
      setError({ key: "settings.readFailed", cause: e });
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
      toast.success(settings.enabled ? t("settings.basicAuthEnabled") : t("settings.basicAuthDisabled"));
    } catch (e) {
      setError({ key: "settings.saveFailed", cause: e });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-4 break-inside-avoid md:mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4" />
          HTTP Basic Auth
        </CardTitle>
        <CardDescription>{t("settings.basicAuthHelp")}</CardDescription>
      </CardHeader>
      <form onSubmit={save}>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="basic-auth-enabled">{t("settings.enableBasicAuth")}</FieldLabel>
              <Switch
                id="basic-auth-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={!loaded || saving}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="basic-auth-username">{t("settings.basicAuthUsername")}</FieldLabel>
              <Input
                id="basic-auth-username"
                autoComplete="off"
                value={username}
                required={enabled}
                disabled={!loaded || saving}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("settings.basicAuthUsernamePlaceholder")}
              />
              <FieldDescription>{t("settings.basicAuthUsernameHelp")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="basic-auth-password">{t("settings.basicAuthPassword")}</FieldLabel>
              <Input
                id="basic-auth-password"
                type="password"
                autoComplete="new-password"
                value={password}
                required={enabled && !passwordSet}
                disabled={!loaded || saving}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={passwordSet ? t("settings.keepPassword") : t("settings.basicAuthPasswordPlaceholder")}
              />
              <FieldDescription>{t("settings.basicAuthPasswordHelp")}</FieldDescription>
            </Field>
            <FieldDescription>{t("settings.basicAuthSessionHelp")}</FieldDescription>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {t(error.key, { message: localizedError(error.cause, t) })}
              </p>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-4 gap-2">
          <Button type="submit" disabled={!loaded || saving}>
            {saving ? t("settings.saving") : t("settings.saveBasicAuth")}
          </Button>
          {!loaded && error ? (
            <Button type="button" variant="outline" onClick={load}>
              {t("settings.reload")}
            </Button>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  );
}
