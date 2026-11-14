"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { useTranslation } from "react-i18next";

import { AuthCard } from "@/components/rb/auth-card";
import { LanguageMenu } from "@/components/rb/language-menu";
import { TermsDialog } from "@/components/rb/terms-dialog";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    // 已登录直接进主界面（静态导出下无 middleware 代劳这层跳转）。
    const token = auth.getToken();
    if (token) {
      // localStorage 可能仍有凭据但 cookie 已丢失。先同步，再发起全新请求，
      // 避免服务端守卫或路由缓存把跳转送回仍处于 checking 状态的登录页。
      auth.setToken(token);
      window.location.replace("/function/tasks");
      return;
    }
    api
      .authStatus()
      .then(({ initialized }) => {
        if (!initialized) router.replace("/setup");
      })
      .catch(() => setError("auth.backendUnavailable"))
      .finally(() => setChecking(false));
  }, [router]);

  async function handleSubmit() {
    if (!agreed) {
      setError("auth.agreementRequired");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { token } = await api.login("ARTEX", password);
      auth.setToken(token);
      window.location.replace("/function/tasks");
    } catch {
      setError("auth.invalidCredentials");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center bg-rb-canvas text-rb-muted">
        {t("auth.checking")}
      </div>
    );
  }

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
        <AuthCard
          username="ARTEX"
          mode="login"
          password={password}
          onPasswordChange={setPassword}
          agreed={agreed}
          onAgreedChange={setAgreed}
          onOpenTerms={() => setTermsOpen(true)}
          error={error}
          loading={loading}
          onSubmit={handleSubmit}
        />
      </div>

      <TermsDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        onAgree={() => {
          setAgreed(true);
          setError("");
        }}
      />
    </div>
  );
}
