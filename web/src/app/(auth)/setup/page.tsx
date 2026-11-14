"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { useTranslation } from "react-i18next";

import { AuthCard } from "@/components/rb/auth-card";
import { LanguageMenu } from "@/components/rb/language-menu";
import { TermsDialog } from "@/components/rb/terms-dialog";
import { localizedError } from "@/i18n/errors";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";

export default function SetupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  // 查不到初始化状态时不能默认当成"未初始化"——那样会把初始化表单摆给一个
  // 其实已经设过密码的实例，用户照着填就会覆盖掉原密码。此时关闭入口。
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    api
      .authStatus()
      .then(({ initialized }) => {
        if (initialized) router.replace("/login");
      })
      .catch((err) => {
        setError(err);
        setUnavailable(true);
      })
      .finally(() => setChecking(false));
  }, [router]);

  async function handleSubmit() {
    if (password !== confirm) {
      setError("auth.passwordMismatch");
      return;
    }
    if (password.length < 8) {
      setError("auth.passwordMin");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { token } = await api.initPassword(password);
      auth.setToken(token);
      router.replace("/function/tasks");
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  if (checking) return null;

  const errorText = error ? localizedError(error, t) : "";

  return (
    <div className="grid min-h-dvh bg-rb-canvas text-rb-fg lg:grid-cols-[2fr_3fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-primary p-12 text-center text-primary-foreground lg:flex">
        <div className="absolute size-80 rounded-full border border-primary-foreground/10" />
        <div className="absolute size-60 rounded-full border border-primary-foreground/15" />
        <div className="absolute size-40 rounded-full border border-primary-foreground/20" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="ARTEX" width={160} height={160} className="relative brightness-0 invert" />
        <h1 className="relative mt-8 font-[450] text-2xl tracking-[-0.015em]">ARTEX</h1>
        <p className="relative mt-2 max-w-xs text-primary-foreground/70 text-sm leading-relaxed">
          {t("meta.description")}
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute top-4 right-4">
          <LanguageMenu />
        </div>
        {unavailable ? (
          <div className="w-full max-w-[400px] space-y-5 text-center">
            <h2 className="font-[450] text-xl tracking-[-0.015em]">{t("auth.statusUnknown")}</h2>
            <p className="text-rb-muted text-sm leading-relaxed">{t("auth.setupUnavailable")}</p>
            {errorText && <p className="text-red-600 text-sm dark:text-red-400">{errorText}</p>}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mx-auto flex h-8 items-center rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-canvas px-4 font-[450] text-[14px]/[16px] text-rb-fg shadow-rb-sm transition-[background-color] hover:bg-rb-soft"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : (
          <AuthCard
            username="ARTEX"
            mode="setup"
            password={password}
            confirmPassword={confirm}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirm}
            agreed={agreed}
            onAgreedChange={setAgreed}
            onOpenTerms={() => setTermsOpen(true)}
            error={errorText}
            loading={loading}
            disabled={!confirm}
            onSubmit={handleSubmit}
          />
        )}
      </div>

      <TermsDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        onAgree={() => {
          setAgreed(true);
        }}
      />
    </div>
  );
}
