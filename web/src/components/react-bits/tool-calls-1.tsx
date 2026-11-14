"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown02Icon,
  ArrowRight01Icon,
  SquareIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const rowsRuled = "divide-y divide-rb-line";
const typeHeadingXs = "text-[16px]/[20px] font-[450] tracking-[-0.015em]";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const typeCodeSm = "font-mono text-[12px]/[16px] tabular-nums";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const panel =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-subtle text-rb-fg dark:bg-rb-popover";
const panelBody =
  "mx-1 mb-1 flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-canvas [&:has(+*)]:mb-0 dark:border-rb-line dark:bg-rb-canvas";
const statusWordSm =
  "inline-flex items-start gap-1 text-[13px]/[18px] font-[450] tabular-nums";
const statusRunning = "text-rb-fg";
const statusOk = "text-rb-fg/80";
const statusFail = "text-[oklch(51%_0.18_26)] dark:text-[oklch(76%_0.14_26)]";
const arcLine = "flex h-lh shrink-0 items-center";
const runningArc =
  "inline-block size-2.5 shrink-0 rounded-full border border-current border-t-transparent animate-spin motion-reduce:animate-none";
const disclosureCaret =
  "shrink-0 text-rb-muted transition-transform duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none group-aria-expanded:rotate-90";
const toolRow =
  "group -mx-2 flex min-h-8 max-w-[calc(100%+16px)] min-w-0 cursor-pointer items-center gap-2 self-start rounded-[var(--rb-r-sm,6px)] px-2 text-left text-[13px]/[18px] text-rb-fg/80 transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-rb-soft active:bg-rb-soft dark:hover:bg-rb-soft dark:active:bg-rb-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";
const stepGlyph = "flex size-4 shrink-0 items-center justify-center";
const toolDetail =
  "min-w-[6ch] truncate text-rb-fg";
const toolEnd =
  "ms-auto flex shrink-0 items-center gap-2 whitespace-nowrap tabular-nums text-rb-muted";
const toolWell =
  "flex min-w-0 flex-col gap-3 rounded-[var(--rb-r-sm,6px)] bg-rb-soft px-3 py-2 dark:bg-rb-soft";
const codeText = "min-w-0 flex-1 whitespace-pre";
const fadeTop =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";

const pageTitle = cx(typeHeadingXs, text1);
const captionText = cx(typeCaption, text3);
const jsonText = cx(typeCodeSm, text2, codeText);

const EASE: [number, number, number, number] = [0.2, 0, 0, 1];

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

type Status = "streaming" | "running" | "done" | "failed";

type ToolCall = {
  id: string;
  name: string;
  status: Status;
  input?: string;
  output?: string;
  startedAt?: string;
  duration?: string;
};

const STREAMING_INPUT = `{
  "workspace": "northstar-prod",
  "query": "open incidents touching checkout latency",
  "include": ["timeline", "owners", "recent_deploys"],
  "window": "last 24h",
  "limit": 5
}`;

const DONE_RESULT = `{
  "incidents": [
    {
      "id": "INC-2487",
      "service": "checkout-api",
      "owner": "Payments Platform",
      "status": "mitigated",
      "startedAt": "10:42 UTC",
      "summary": "p95 latency rose after retry backoff was lowered"
    },
    {
      "id": "INC-2485",
      "service": "cart-sync",
      "owner": "Storefront Reliability",
      "status": "watching",
      "summary": "queue depth normalized after a worker pool resize"
    }
  ],
  "count": 2
}`;

const SETTLED: ToolCall[] = [
  {
    id: "call_a1",
    name: "read_file",
    status: "done",
    duration: "38ms",
    startedAt: "14:08:22.041",
    input: `{ "path": "services/payments/retry.ts" }`,
    output: `120 lines; exported withRetry, isRetryable, RetryError`,
  },
  {
    id: "call_a2",
    name: "grep",
    status: "done",
    duration: "112ms",
    startedAt: "14:08:24.900",
    input: `{ "pattern": "RETRY_BACKOFF_MS", "path": "services" }`,
    output: `3 matches across 2 files`,
  },
  {
    id: "call_a3",
    name: "list_dir",
    status: "done",
    duration: "12ms",
    startedAt: "14:08:25.204",
    input: `{ "path": "services/checkout" }`,
    output: `9 entries; latency.ts, handler.ts, __tests__/`,
  },
  {
    id: "call_a4",
    name: "read_file",
    status: "done",
    duration: "41ms",
    startedAt: "14:08:25.660",
    input: `{ "path": "services/checkout/latency.ts" }`,
    output: `88 lines; p95 timer wraps the retry path`,
  },
  {
    id: "call_a5",
    name: "run_tests",
    status: "failed",
    duration: "2.30s",
    startedAt: "14:08:26.010",
    input: `{ "suite": "checkout", "grep": "retry" }`,
    output: `1 failing; backoff ceiling exceeded under sustained load`,
  },
  {
    id: "call_a6",
    name: "read_deploys",
    status: "done",
    duration: "88ms",
    startedAt: "14:08:28.400",
    input: `{ "service": "checkout-api", "window": "24h" }`,
    output: `2 deploys; retry backoff lowered at 10:31 UTC`,
  },
  {
    id: "call_a7",
    name: "git_blame",
    status: "done",
    duration: "64ms",
    startedAt: "14:08:29.020",
    input: `{ "path": "services/payments/retry.ts", "line": 88 }`,
    output: `changed by a.rivera in 4f2c1de; "tune backoff"`,
  },
  {
    id: "call_a8",
    name: "fetch_dashboard",
    status: "done",
    duration: "210ms",
    startedAt: "14:08:29.310",
    input: `{ "panel": "p95-latency", "service": "checkout-api" }`,
    output: `p95 780ms → 1.42s starting 10:42 UTC`,
  },
  {
    id: "call_a9",
    name: "read_config",
    status: "done",
    duration: "22ms",
    startedAt: "14:08:29.410",
    input: `{ "path": "services/payments/retry.config.json" }`,
    output: `backoff ceiling 800ms; maxRetries 4`,
  },
  {
    id: "call_a10",
    name: "query_logs",
    status: "done",
    duration: "173ms",
    startedAt: "14:08:29.490",
    input: `{ "service": "checkout-api", "level": "error", "window": "1h" }`,
    output: `41 errors; 38 RetryError, 3 timeouts`,
  },
  {
    id: "call_a11",
    name: "list_owners",
    status: "running",
    startedAt: "14:08:29.610",
    input: `{ "service": "checkout-api" }`,
  },
];

const STREAMING_CALL: ToolCall = {
  id: "call_live",
  name: "search_incidents",
  status: "streaming",
  startedAt: "14:08:30.118",
};

const LIVE_DURATION = "1.46s";

const CATCH_UP_MS = 180;
const FLOOR_CPS = 45;

function lastWordBoundary(source: string, cut: number) {
  if (cut >= source.length) return source.length;
  const i = source.lastIndexOf(" ", cut);
  return i === -1 ? 0 : i;
}

function useSmoothedText(): {
  text: string;
  done: boolean;
  push: (chunk: string) => void;
  end: () => void;
  reset: () => void;
} {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const targetRef = useRef("");
  const shownRef = useRef(0);
  const endedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;

      const target = targetRef.current;
      const behind = target.length - shownRef.current;

      if (behind > 0) {
        shownRef.current = reduceMotion
          ? target.length
          : Math.min(
              target.length,
              shownRef.current +
                behind * (1 - Math.exp(-dt / CATCH_UP_MS)) +
                (FLOOR_CPS * dt) / 1000,
            );

        const cut = Math.floor(shownRef.current);
        const finished = endedRef.current && cut >= target.length;
        const safe = finished ? target.length : lastWordBoundary(target, cut);
        setText(target.slice(0, safe));
        if (finished) setDone(true);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  return {
    text,
    done,
    push: useCallback((chunk: string) => {
      targetRef.current += chunk;
    }, []),
    end: useCallback(() => {
      endedRef.current = true;
    }, []),
    reset: useCallback(() => {
      targetRef.current = "";
      shownRef.current = 0;
      endedRef.current = false;
      setText("");
      setDone(false);
    }, []),
  };
}

function useStickToBottom(scrollRef: RefObject<HTMLDivElement | null>) {
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const sync = () => {
      const overflowing = el.scrollHeight - el.clientHeight > 1;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = !overflowing || distance < 24;
      stickRef.current = atBottom;
      setShowJump(overflowing && !atBottom);
    };

    const onIntent = (e: WheelEvent | TouchEvent) => {
      const up = "deltaY" in e ? e.deltaY < 0 : true;
      if (!up) return;
      if (el.scrollHeight - el.clientHeight > 1 && el.scrollTop > 0) {
        stickRef.current = false;
      }
    };

    const observer = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
      sync();
    });
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    el.addEventListener("wheel", onIntent, { passive: true });
    el.addEventListener("touchmove", onIntent, { passive: true });
    el.addEventListener("scroll", sync, { passive: true });

    el.scrollTop = el.scrollHeight;
    sync();
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onIntent);
      el.removeEventListener("touchmove", onIntent);
      el.removeEventListener("scroll", sync);
    };
  }, [scrollRef]);

  const jump = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowJump(false);
    el.scrollTop = el.scrollHeight;
  }, [scrollRef]);

  return { showJump, jump };
}

const STATUS_WORD: Record<Status, string> = {
  streaming: "Streaming",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

const STATUS_TONE: Record<Status, string> = {
  streaming: statusRunning,
  running: statusRunning,
  done: statusOk,
  failed: statusFail,
};

const isActive = (s: Status) => s === "streaming" || s === "running";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt className={text3}>{label}</dt>
      <dd className={text2}>{value}</dd>
    </div>
  );
}

export default function ToolCalls1() {
  const uid = useId();
  const [liveStatus, setLiveStatus] = useState<Status>("streaming");
  const [openId, setOpenId] = useState<string>("call_live");
  const { text, done, push, end } = useSmoothedText();
  const {
    ref: transcriptRef,
    edges: transcriptEdges,
    onScroll: onTranscriptScroll,
  } = useScrollFade<HTMLDivElement>();
  const { showJump, jump } = useStickToBottom(transcriptRef);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      push(STREAMING_INPUT);
      end();
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const feed = () => {
      if (i >= STREAMING_INPUT.length) {
        end();
        return;
      }
      const size = 3 + Math.floor(Math.random() * 8);
      push(STREAMING_INPUT.slice(i, i + size));
      i += size;
      timer = setTimeout(feed, 40 + Math.random() * 90);
    };
    timer = setTimeout(feed, 260);
    return () => clearTimeout(timer);
  }, [push, end, reduceMotion]);

  useEffect(() => {
    if (!done) return;
    const toRunning = setTimeout(() => setLiveStatus("running"), 0);
    const toOutput = setTimeout(() => setLiveStatus("done"), 700);
    return () => {
      clearTimeout(toRunning);
      clearTimeout(toOutput);
    };
  }, [done]);

  const stop = useCallback(() => {
    end();
    setLiveStatus("done");
  }, [end]);

  const live: ToolCall = {
    ...STREAMING_CALL,
    status: liveStatus,
    input: liveStatus === "streaming" ? text : STREAMING_INPUT,
    output: liveStatus === "done" ? DONE_RESULT : undefined,
    duration: liveStatus === "done" ? LIVE_DURATION : undefined,
  };
  const calls: ToolCall[] = [...SETTLED, live];
  const busy = liveStatus !== "done";

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[640px] w-full flex-col overflow-hidden p-4 sm:p-6",
      )}
    >
      <header className="mb-3 flex min-h-8 shrink-0 items-center justify-between gap-3">
        <h2 className={pageTitle}>Tool calls</h2>
        {busy ? (
          <button
            type="button"
            onClick={stop}
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
        ) : (
          <span className={captionText}>{calls.length} calls</span>
        )}
      </header>

      <div className={cx(panel, "min-h-0 flex-1")}>
        <div className={cx(panelBody, "relative mt-1 min-h-0 flex-1")}>
          <div
            ref={transcriptRef}
            onScroll={onTranscriptScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]"
          >
            <div className={rowsRuled}>
              {calls.map((p) => {
                const open = openId === p.id;
                const hasInput = Boolean(p.input);
                const hasOutput = Boolean(p.output);
                const panelId = `${uid}-${p.id}`;
                return (
                  <div key={p.id}>
                    <div className="flex px-3 py-1">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => setOpenId(open ? "" : p.id)}
                        className={cx(toolRow, "flex-1")}
                      >
                        <span className={stepGlyph}>
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            size={12}
                            strokeWidth={1.8}
                            aria-hidden="true"
                            className={disclosureCaret}
                          />
                        </span>
                        <span className={cx(toolDetail, typeCodeSm)}>
                          {p.name}
                        </span>
                        <span className={toolEnd}>
                          <span>{p.duration}</span>
                          <span
                            className={cx(
                              statusWordSm,
                              STATUS_TONE[p.status],
                              "w-24 shrink-0 justify-end",
                            )}
                          >
                            {isActive(p.status) && (
                              <span className={arcLine}>
                                <span
                                  aria-hidden="true"
                                  className={runningArc}
                                />
                              </span>
                            )}
                            {STATUS_WORD[p.status]}
                          </span>
                        </span>
                      </button>
                    </div>

                    {open && (
                      <div id={panelId} className="space-y-3 px-3 pt-1 pb-3">
                        <dl
                          className={cx(
                            typeCaption,
                            "flex flex-wrap gap-x-8 gap-y-1",
                          )}
                        >
                          {p.startedAt && (
                            <Field label="Started" value={p.startedAt} />
                          )}
                          {p.duration && (
                            <Field label="Duration" value={p.duration} />
                          )}
                        </dl>

                        {hasInput && (
                          <div>
                            <p className={cx(captionText, "mb-1.5")}>
                              Arguments
                            </p>
                            <div
                              className={cx(
                                toolWell,
                                "max-h-40 overflow-y-auto",
                              )}
                            >
                              <pre className={jsonText}>{p.input ?? ""}</pre>
                            </div>
                          </div>
                        )}

                        {hasOutput && (
                          <div>
                            <p className={cx(captionText, "mb-1.5")}>Result</p>
                            <div
                              className={cx(
                                toolWell,
                                "max-h-40 overflow-y-auto",
                              )}
                            >
                              <pre className={jsonText}>{p.output}</pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div
            aria-hidden="true"
            className={cx(
              fadeTop,
              "pointer-events-none absolute inset-x-0 top-0 h-8",
              transcriptEdges.start ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            aria-hidden="true"
            className={cx(
              fadeBottom,
              "pointer-events-none absolute inset-x-0 bottom-0 h-8",
              transcriptEdges.end ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      </div>

      {showJump && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16, ease: EASE }}
          className="absolute bottom-5 left-1/2 -translate-x-1/2"
        >
          <button
            type="button"
            onClick={jump}
            className={cx(secondaryButton, buttonMd)}
          >
            <HugeiconsIcon
              icon={ArrowDown02Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            Jump to latest
          </button>
        </motion.div>
      )}
    </div>
  );
}
