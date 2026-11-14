"use client";

import { type FormEvent, useId, useState } from "react";

import { AlertCircleIcon, Loading03Icon, Tick02Icon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import {
  avatarFallback,
  avatarSquare,
  buttonMd,
  checkbox,
  checkboxBox,
  checkboxMark,
  cx,
  fieldError,
  fieldLabel,
  fieldMd,
  frame,
  ghostButton,
  iconButtonXs,
  inputAffix,
  inputBox,
  inputControl,
  pendingRing,
  primaryButton,
  proseLink,
  text1,
  text2,
  text3,
  typeBody,
  typeBodySm,
  typeCaption,
  typeHeadingSm,
} from "./tokens";

interface AuthCardProps {
  username: string;
  mode: "login" | "setup";
  password: string;
  confirmPassword?: string;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange?: (value: string) => void;
  agreed: boolean;
  onAgreedChange: (value: boolean) => void;
  onOpenTerms: () => void;
  error: string;
  loading: boolean;
  disabled?: boolean;
  onSubmit: () => void;
}

/**
 * Sign-in / first-run setup card (React Bits Pro `authentication-1` pattern)
 * wired to the app's auth API: fixed operator username, password with reveal
 * toggle, terms acceptance gate and localized error line.
 */
export function AuthCard({
  username,
  mode,
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
  agreed,
  onAgreedChange,
  onOpenTerms,
  error,
  loading,
  disabled = false,
  onSubmit,
}: AuthCardProps) {
  const { t } = useTranslation();
  const passwordId = useId();
  const confirmId = useId();
  const errorId = useId();
  const [reveal, setReveal] = useState(false);
  const [revealConfirm, setRevealConfirm] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (loading || disabled) return;
    onSubmit();
  };

  return (
    <div className={cx(frame, "w-full max-w-[400px] shrink-0 p-6 sm:p-7")}>
      <div className="flex flex-col items-center text-center">
        <div className={cx(avatarSquare, "size-9")}>
          <span className={avatarFallback}>A</span>
        </div>
        <h1 className={cx(typeHeadingSm, text1, "mt-4")}>
          {mode === "login" ? t("auth.login") : t("auth.initPassword")}
        </h1>
        <p className={cx(typeBody, text3, "mt-1")}>{mode === "login" ? t("auth.welcome") : t("auth.setupWelcome")}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <div className="flex flex-col gap-2">
          <span className={fieldLabel}>{t("auth.username")}</span>
          <div className={cx(inputBox, fieldMd)}>
            <input
              readOnly
              value={username}
              aria-label={t("auth.username")}
              className={cx(inputControl, "cursor-default")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={passwordId} className={fieldLabel}>
            {t("auth.password")}
          </label>
          <div className={cx(inputBox, fieldMd)}>
            <input
              id={passwordId}
              type={reveal ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder={mode === "login" ? t("auth.enterPassword") : t("auth.minPlaceholder")}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={inputControl}
            />
            <span data-affix className={inputAffix}>
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide password" : "Show password"}
                className={cx(ghostButton, iconButtonXs)}
              >
                <HugeiconsIcon
                  icon={reveal ? ViewOffSlashIcon : ViewIcon}
                  size={14}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </button>
            </span>
          </div>
        </div>

        {mode === "setup" && (
          <div className="flex flex-col gap-2">
            <label htmlFor={confirmId} className={fieldLabel}>
              {t("auth.confirmPassword")}
            </label>
            <div className={cx(inputBox, fieldMd)}>
              <input
                id={confirmId}
                type={revealConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword ?? ""}
                onChange={(e) => onConfirmPasswordChange?.(e.target.value)}
                placeholder={t("auth.reenterPassword")}
                aria-invalid={!!error}
                className={inputControl}
              />
              <span data-affix className={inputAffix}>
                <button
                  type="button"
                  onClick={() => setRevealConfirm((v) => !v)}
                  aria-label={revealConfirm ? "Hide password" : "Show password"}
                  className={cx(ghostButton, iconButtonXs)}
                >
                  <HugeiconsIcon
                    icon={revealConfirm ? ViewOffSlashIcon : ViewIcon}
                    size={14}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </button>
              </span>
            </div>
          </div>
        )}

        <label className={cx(typeBodySm, text2, "flex cursor-pointer items-start gap-2")}>
          <span className={cx(checkboxBox, "mt-0.5")}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => onAgreedChange(e.target.checked)}
              className={checkbox}
            />
            <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.5} aria-hidden="true" className={checkboxMark} />
          </span>
          <span className="leading-relaxed">
            {t("auth.agreePrefix")}
            <button type="button" onClick={onOpenTerms} className={cx(proseLink, "mx-0.5")}>
              {t("auth.termsLink")}
            </button>
          </span>
        </label>

        {error && (
          <p id={errorId} className={fieldError}>
            <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
            {t(error, { defaultValue: error })}
          </p>
        )}

        <button
          type="submit"
          // biome-ignore lint/nursery/useNullishCoalescing: independent boolean flags, not a nullish default.
          disabled={loading || disabled || !password}
          className={cx(primaryButton, buttonMd, "w-full")}
        >
          {loading && (
            <HugeiconsIcon
              icon={Loading03Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
              className={pendingRing}
            />
          )}
          {loading
            ? mode === "login"
              ? t("auth.signingIn")
              : t("auth.saving")
            : mode === "login"
              ? t("auth.login")
              : t("auth.setupAndLogin")}
        </button>
      </form>

      <p className={cx(typeCaption, text3, "mt-5 text-center")}>
        {t("account.usernameFixed")} {username}
      </p>
    </div>
  );
}

/** Auth footer note under the card. */
export function AuthFooterNote({ children }: { children: React.ReactNode }) {
  return <p className={cx(typeBodySm, text3, "mt-5 max-w-[400px] text-center")}>{children}</p>;
}
