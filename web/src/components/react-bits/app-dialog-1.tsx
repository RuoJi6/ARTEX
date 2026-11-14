"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const backdrop = "bg-rb-overlay";
const text1 = "text-rb-fg";
const text3 = "text-rb-muted";
const typeLabel = "text-[14px]/[16px] font-[450]";
const rowsRuled = "divide-y divide-rb-line";
const primaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_94%,black))] text-[var(--rb-accent-fg,oklch(100%_0_0))] shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.22),0_2px_5px_-2px_rgb(0_0_0/0.3)] hover:not-disabled:brightness-110 active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] disabled:opacity-40 disabled:shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_94%,black))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.66),0_2px_5px_-2px_rgb(0_0_0/0.9)] dark:active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] dark:disabled:shadow-none";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const ghostButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg hover:not-disabled:bg-rb-soft active:bg-rb-soft aria-pressed:bg-rb-soft disabled:text-rb-muted/60 dark:text-rb-fg dark:hover:not-disabled:bg-rb-soft dark:active:bg-rb-soft dark:aria-pressed:bg-rb-soft dark:disabled:text-rb-muted/60";
const buttonSm =
  "h-7 gap-1.5 rounded-[var(--rb-r-sm,6px)] px-3 text-[14px]/[16px] font-[450]";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const iconButtonSm = "size-7 rounded-[var(--rb-r-sm,6px)]";
const itemRow =
  "relative flex min-h-10 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-rb-fg transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] has-[[data-description]]:min-h-14";
const dataListLabel =
  "min-w-0 text-[14px]/[16px] font-[450] text-rb-muted";
const dataListValue =
  "flex min-w-0 flex-wrap items-center gap-2 text-[14px]/[20px] text-rb-fg [overflow-wrap:anywhere]";
const toast =
  "pointer-events-auto grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-3 overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover py-3 ps-4 pe-2 text-rb-fg shadow-rb-overlay";
const toastTitle = "text-[14px]/[16px] font-[450]";
const toastDescription =
  "mt-0.5 text-[13px]/[18px] text-rb-fg/80";
const overlayEnter =
  "transition-opacity duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)] starting:opacity-0 motion-reduce:transition-none";
const dialogShell =
  "flex max-h-[calc(100%-4rem)] flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-subtle text-rb-fg outline-none shadow-rb-overlay dark:bg-rb-popover";
const dialogCard =
  "mx-1 mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-canvas [&:last-child]:mb-1 dark:border-rb-line dark:bg-rb-canvas";
const dialogHeader =
  "relative flex flex-col gap-1.5 px-5 pt-5 pb-5 has-[button]:pe-14 [&:has(+*)]:pb-0";
const dialogTitle =
  "text-[16px]/[20px] font-[450] tracking-[-0.015em] text-rb-fg";
const dialogDescription =
  "text-[14px]/[20px] text-rb-fg/80";
const dialogBody = "flex min-w-0 flex-col gap-4 p-5 pt-6";
const dialogFoot =
  "flex min-h-11 flex-wrap items-center justify-end gap-2 px-4 py-2 pe-2";
const fadeTop =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";

const EASE: [number, number, number, number] = [0.2, 0, 0, 1];

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const CHANGES = [
  { label: "Plan", from: "Team", to: "Scale" },
  { label: "Seats", from: "24", to: "40" },
  { label: "Monthly total", from: "$1,440.00", to: "$2,600.00" },
  { label: "Support", from: "Business hours", to: "24/7 priority" },
  { label: "Audit log retention", from: "30 days", to: "1 year" },
];

function getFocusable(container: HTMLElement | null) {
  return Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
}

function useDialogFocus(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(open);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const doc = panel?.ownerDocument ?? document;

    (getFocusable(panel)[0] ?? panel)?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable(panel);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = doc.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    doc.addEventListener("keydown", onKeyDown);
    return () => doc.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (wasOpenRef.current && !open)
      triggerRef.current?.focus({ preventScroll: true });
    wasOpenRef.current = open;
  }, [open]);

  return { panelRef, triggerRef };
}

function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setEdges({
      start: scrollTop > 1,
      end: Math.ceil(scrollTop + clientHeight) < scrollHeight - 1,
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    const view = el?.ownerDocument.defaultView;
    if (!el || !view?.ResizeObserver) return;
    const observer = new view.ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  return { ref, edges, onScroll: update };
}

export default function AppDialog1() {
  const {
    ref: bodyRef,
    edges: bodyEdges,
    onScroll: onBodyScroll,
  } = useScrollFade<HTMLDivElement>();
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(true);
  const [applied, setApplied] = useState(false);
  const keyboardOpenRef = useRef(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const closeDialog = useCallback(() => setOpen(false), []);
  const { panelRef, triggerRef } = useDialogFocus(open, closeDialog);

  useEffect(() => {
    if (!applied) return;
    const id = setTimeout(() => setApplied(false), 2000);
    return () => clearTimeout(id);
  }, [applied]);

  const openDialog = () => {
    setApplied(false);
    setKeyboardOpen(keyboardOpenRef.current);
    setOpen(true);
  };

  const fade = !prefersReducedMotion && !keyboardOpen;

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[560px] w-full items-center justify-center overflow-hidden p-4 sm:p-6",
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        onPointerDown={() => {
          keyboardOpenRef.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ")
            keyboardOpenRef.current = true;
        }}
        onClick={openDialog}
        className={cx(primaryButton, buttonMd)}
      >
        Change plan
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <>
            <motion.div
              aria-hidden="true"
              className={cx(backdrop, "absolute inset-0 z-40")}
              onClick={closeDialog}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: 0.12, ease: EASE },
              }}
              transition={{ duration: fade ? 0.18 : 0, ease: EASE }}
            />
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="app-dialog-1-title"
                tabIndex={-1}
                className={cx(
                  dialogShell,
                  "pointer-events-auto max-h-full w-full max-w-md",
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: { duration: 0.12, ease: EASE },
                }}
                transition={{ duration: fade ? 0.18 : 0, ease: EASE }}
              >
                <div className={dialogCard}>
                  <header className={cx(dialogHeader, "shrink-0")}>
                    <h2 id="app-dialog-1-title" className={dialogTitle}>
                      Apply plan change
                    </h2>
                    <p className={dialogDescription}>
                      Your workspace moves to the Scale plan at the next renewal
                      on Jul 1. Nothing is charged today.
                    </p>
                    <div className="absolute end-4 top-4 flex">
                      <button
                        type="button"
                        aria-label="Close dialog"
                        onClick={closeDialog}
                        className={cx(ghostButton, iconButtonSm)}
                      >
                        <HugeiconsIcon
                          icon={Cancel01Icon}
                          size={16}
                          strokeWidth={1.8}
                          aria-hidden="true"
                          className="shrink-0"
                        />
                      </button>
                    </div>
                  </header>

                  <div className="relative min-h-0 flex-1">
                    <div
                      ref={bodyRef}
                      onScroll={onBodyScroll}
                      className={cx(dialogBody, "h-full overflow-y-auto")}
                    >
                      <dl className={rowsRuled}>
                        {CHANGES.map((change) => (
                          <div
                            key={change.label}
                            className={cx(itemRow, "justify-between")}
                          >
                            <dt className={cx(dataListLabel, "shrink-0")}>
                              {change.label}
                            </dt>
                            <dd className={cx(dataListValue, "tabular-nums")}>
                              <span
                                className={cx(text3, "truncate line-through")}
                              >
                                {change.from}
                              </span>
                              <span aria-hidden="true" className={text3}>
                                →
                              </span>
                              <span className="sr-only">to</span>
                              <span className={cx(typeLabel, "truncate")}>
                                {change.to}
                              </span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    <div
                      aria-hidden="true"
                      className={cx(
                        fadeTop,
                        "pointer-events-none absolute inset-x-0 top-0 h-8",
                        bodyEdges.start ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div
                      aria-hidden="true"
                      className={cx(
                        fadeBottom,
                        "pointer-events-none absolute inset-x-0 bottom-0 h-8",
                        bodyEdges.end ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </div>
                </div>

                <footer
                  className={cx(
                    dialogFoot,
                    "shrink-0 flex-col-reverse max-sm:ps-2 sm:flex-row",
                  )}
                >
                  <button
                    type="button"
                    onClick={closeDialog}
                    className={cx(
                      secondaryButton,
                      buttonSm,
                      "w-full sm:w-auto",
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setApplied(true);
                      setOpen(false);
                    }}
                    className={cx(primaryButton, buttonSm, "w-full sm:w-auto")}
                  >
                    Apply change
                  </button>
                </footer>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <div
        aria-live="polite"
        className="pointer-events-none absolute bottom-4 left-4 right-4 z-[60] flex flex-col gap-2 sm:left-auto sm:w-full sm:max-w-sm"
      >
        {applied && (
          <div className={cx(toast, overlayEnter)}>
            <div className="min-w-0">
              <p className={toastTitle}>Plan change scheduled</p>
              <p className={toastDescription}>
                Scale takes effect Jul 1. You can undo it until then.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
