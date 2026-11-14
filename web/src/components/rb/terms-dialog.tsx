"use client";

import { useEffect, useRef, useState } from "react";

import { Alert02Icon, Cancel01Icon, ShieldIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import {
  buttonMd,
  cx,
  frame,
  frameHead,
  frameTitle,
  ghostButton,
  iconButtonMd,
  metaText,
  overlayFade,
  overlayShadow,
  primaryButton,
  ruleTop,
  text3,
  typeBodySm,
} from "./tokens";

const _EXIT_MS = 140;

interface TermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAgree: () => void;
}

const SECTIONS: { key: string; danger?: boolean }[] = [
  { key: "licenseTitle" },
  { key: "scopeTitle" },
  { key: "prohibitedTitle", danger: true },
  { key: "ipTitle" },
  { key: "privacyTitle" },
  { key: "complianceTitle" },
  { key: "disclaimerTitle" },
  { key: "changesTitle" },
];

const PROHIBITED = ["noNetworkAttacks", "noRealPentesting", "noCrime", "noTampering", "noIllegalUse"];

/**
 * Terms-of-use modal (React Bits Pro dialog pattern) with the app's existing
 * accept-gate semantics: the reader must scroll to the bottom (or the content
 * fits without scrolling) before "Agree" unlocks.
 */
export function TermsDialog({ open, onOpenChange, onAgree }: TermsDialogProps) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Reset on open and handle content that fits without scrolling.
    setReadToEnd(false);
    const el = bodyRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setReadToEnd(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label="Close terms"
        onClick={() => onOpenChange(false)}
        {...overlayFade(reduce)}
        className="absolute inset-0 cursor-default bg-rb-overlay"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
        className={cx(
          frame,
          overlayShadow,
          "relative z-10 flex max-h-[min(85dvh,44rem)] w-full max-w-2xl flex-col",
          shown ? "opacity-100" : "opacity-0",
        )}
      >
        <div className={cx(frameHead, "gap-3 px-5 py-4")}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--rb-r-sm,6px)] bg-rb-soft text-rb-fg">
            <HugeiconsIcon icon={ShieldIcon} size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="terms-title" className={cx(frameTitle, "text-[15px]")}>
              {t("terms.title")}
            </h2>
            <p className={cx(metaText, "mt-0.5")}>{t("terms.version")}</p>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => onOpenChange(false)}
            className={cx(ghostButton, iconButtonMd)}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <div
          ref={bodyRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd(true);
          }}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 text-[13px]/[20px] text-rb-fg/80"
        >
          <p className="rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-subtle p-3 text-rb-fg/80">
            {t("terms.introduction")}
            <span className="font-medium text-rb-fg"> {t("terms.acceptance")}</span>
          </p>

          {SECTIONS.map((section, index) => (
            <section key={section.key} className="space-y-1.5">
              <h4
                className={cx(
                  "flex items-center gap-2 font-[450] text-rb-fg",
                  section.danger && "text-red-600 dark:text-red-400",
                )}
              >
                <span
                  className={cx(
                    "flex size-5 items-center justify-center rounded-[var(--rb-r-xs,4px)] font-semibold text-[11px] tabular-nums",
                    section.danger ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-rb-soft text-rb-muted",
                  )}
                >
                  {index + 1}
                </span>
                {section.danger && <HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={1.8} aria-hidden="true" />}
                {t(`terms.${section.key}`)}
              </h4>
              {section.danger ? (
                <ul className="ml-7 list-decimal space-y-1.5 rounded-[var(--rb-r-sm,6px)] border border-red-500/20 bg-red-500/5 p-3 pl-8 marker:text-red-500/70">
                  {PROHIBITED.map((key) => (
                    <li key={key}>{t(`terms.${key}`)}</li>
                  ))}
                </ul>
              ) : (
                <p className="pl-7">
                  {t(`terms.${section.key.replace("Title", "")}`)}
                  {section.key === "complianceTitle" && (
                    <span className="font-medium text-rb-fg"> {t("terms.responsibility")}</span>
                  )}
                </p>
              )}
            </section>
          ))}
        </div>

        <div
          className={cx(
            ruleTop,
            "flex flex-col items-stretch gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <p className={cx(typeBodySm, text3)}>{readToEnd ? t("terms.readAll") : t("terms.scrollToEnd")}</p>
          <button
            type="button"
            disabled={!readToEnd}
            onClick={() => {
              onAgree();
              onOpenChange(false);
            }}
            className={cx(primaryButton, buttonMd, "sm:w-auto")}
          >
            {t("terms.agreeAll")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
