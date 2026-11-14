"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MinusSignIcon,
  SquareIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const typeHeadingXs = "text-[16px]/[20px] font-[450] tracking-[-0.015em]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const statusWord =
  "inline-flex items-start gap-1.5 text-[14px]/[16px] font-[450] tabular-nums";
const statusIdle = "text-rb-muted";
const statusRunning = "text-rb-fg";
const arcLine = "flex h-lh shrink-0 items-center";
const runningArc =
  "inline-block size-2.5 shrink-0 rounded-full border border-current border-t-transparent animate-spin motion-reduce:animate-none";
const panel =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-subtle text-rb-fg dark:bg-rb-popover";
const panelBody =
  "mx-1 mb-1 flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-canvas [&:has(+*)]:mb-0 dark:border-rb-line dark:bg-rb-canvas";
const itemMeta =
  "shrink-0 text-[13px]/[18px] tabular-nums text-rb-muted";
const stepGlyph = "flex size-4 shrink-0 items-center justify-center";
const fadeTop =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";

const metaText = cx(typeBodySm, text3);

type StepState = "done" | "running" | "queued";

type Step = {
  label: string;
  state: StepState;
  seconds?: number;
};

const STEPS: Step[] = [
  { label: "Loaded October general ledger", state: "done", seconds: 0.4 },
  { label: "Pulled bank statement export", state: "done", seconds: 1.3 },
  { label: "Normalised 1,284 transactions", state: "done", seconds: 2.1 },
  { label: "Split multi-currency lines", state: "done", seconds: 1.7 },
  { label: "Matched transactions to ledger", state: "done", seconds: 3.6 },
  { label: "Flagged 12 unmatched entries", state: "done", seconds: 0.8 },
  { label: "Grouped duplicates by reference", state: "done", seconds: 0.5 },
  { label: "Reconciling flagged entries", state: "running" },
  { label: "Resolve foreign-exchange rounding", state: "queued" },
  { label: "Post adjustments to the ledger", state: "queued" },
  { label: "Generate the reconciliation report", state: "queued" },
  { label: "Archive the reconciliation run", state: "queued" },
  { label: "Notify the finance team", state: "queued" },
];

const DONE_SECONDS = STEPS.reduce((sum, s) => sum + (s.seconds ?? 0), 0);

function fmt(seconds: number) {
  return `${seconds.toFixed(1)}s`;
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

export default function AgentActivity1() {
  const {
    ref: feedRef,
    edges: feedEdges,
    onScroll: onFeedScroll,
  } = useScrollFade<HTMLDivElement>();
  const [stepElapsed, setStepElapsed] = useState(0);
  const [stopped, setStopped] = useState(false);
  const startedRef = useRef<number | null>(null);

  useEffect(() => {
    if (stopped) return;
    const started = startedRef.current ?? performance.now();
    startedRef.current = started;
    const id = setInterval(() => {
      setStepElapsed((performance.now() - started) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, [stopped]);

  const totalElapsed = DONE_SECONDS + stepElapsed;

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[560px] w-full flex-col gap-3 overflow-hidden p-4 sm:gap-4 sm:p-6",
      )}
    >
      <header className="flex shrink-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className={cx(typeHeadingXs, "truncate")}>
            Reconcile October invoices
          </h2>
          <div className="mt-0.5 flex items-center gap-3">
            <span
              aria-live="polite"
              className={cx(statusWord, stopped ? statusIdle : statusRunning)}
            >
              {!stopped && (
                <span className={arcLine}>
                  <span aria-hidden="true" className={runningArc} />
                </span>
              )}
              {stopped ? "Stopped" : "Running"}
            </span>
            <span className={cx(metaText, "tabular-nums")}>
              {fmt(totalElapsed)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setStopped(true)}
          disabled={stopped}
          className={cx(secondaryButton, buttonMd)}
        >
          <HugeiconsIcon
            icon={SquareIcon}
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          Stop
        </button>
      </header>

      <div className={cx(panel, "min-h-0 flex-1")}>
        <div className={cx(panelBody, "relative mt-1 min-h-0 flex-1")}>
          <div
            ref={feedRef}
            onScroll={onFeedScroll}
            className="h-full overflow-y-auto overscroll-contain py-1"
          >
            <ol>
              {STEPS.map((step, i) => {
                const running = step.state === "running" && !stopped;
                const cancelled = step.state === "running" && stopped;
                return (
                  <li key={i} className="flex h-9 items-center gap-3 px-3">
                    <span className={stepGlyph}>
                      {step.state === "done" ? (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          size={12}
                          strokeWidth={1.8}
                          aria-hidden="true"
                          className={text3}
                        />
                      ) : running ? (
                        <span
                          aria-hidden="true"
                          className={cx(runningArc, text2)}
                        />
                      ) : cancelled ? (
                        <HugeiconsIcon
                          icon={MinusSignIcon}
                          size={12}
                          strokeWidth={1.8}
                          aria-hidden="true"
                          className={text3}
                        />
                      ) : null}
                    </span>
                    <span
                      className={cx(
                        typeBodySm,
                        "min-w-0 flex-1 truncate",
                        step.state === "done" && text2,
                        running && text1,
                        (cancelled || step.state === "queued") && text3,
                      )}
                    >
                      {step.label}
                    </span>
                    <span className={cx(itemMeta, "w-16 text-right")}>
                      {step.state === "done"
                        ? fmt(step.seconds ?? 0)
                        : running
                          ? fmt(stepElapsed)
                          : cancelled
                            ? "Stopped"
                            : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div
            aria-hidden="true"
            className={cx(
              fadeTop,
              "pointer-events-none absolute inset-x-0 top-0 h-8",
              feedEdges.start ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            aria-hidden="true"
            className={cx(
              fadeBottom,
              "pointer-events-none absolute inset-x-0 bottom-0 h-8",
              feedEdges.end ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      </div>
    </div>
  );
}
