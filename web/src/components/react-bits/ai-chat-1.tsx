"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowDown02Icon,
  ArrowRight01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  Copy01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const typeHeadingXs = "text-[16px]/[20px] font-[450] tracking-[-0.015em]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
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
const badge =
  "inline-flex h-5 min-w-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-[var(--rb-r-xs,4px)] px-1.5 text-[12px]/[16px] font-[450] tabular-nums";
const badgeNeutral =
  "bg-rb-soft text-rb-fg";
const chip =
  "relative inline-flex h-7 max-w-full min-w-0 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-popover px-2.5 text-[14px]/[16px] font-[450] text-rb-fg select-none shadow-rb-sm transition-[background-color,border-color,color,scale,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 hover:not-disabled:border-rb-input aria-pressed:border-rb-input aria-pressed:bg-rb-soft aria-expanded:border-rb-input disabled:cursor-not-allowed disabled:text-rb-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:not-disabled:border-rb-input dark:aria-pressed:border-rb-input dark:aria-pressed:bg-rb-soft dark:aria-expanded:border-rb-input dark:disabled:text-rb-muted/60";
const chipRemove =
  "-me-1.5 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--rb-r-xs,4px)] text-rb-fg/80 hover:bg-rb-soft hover:text-rb-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:bg-rb-soft dark:hover:text-rb-fg";
const disclosureRow =
  "group -mx-2 flex min-h-8 max-w-[calc(100%+16px)] min-w-0 cursor-pointer items-center gap-2 self-start rounded-[var(--rb-r-sm,6px)] px-2 text-left text-[13px]/[18px] text-rb-fg/80 transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-rb-soft active:bg-rb-soft dark:hover:bg-rb-soft dark:active:bg-rb-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";
const disclosureCaret =
  "shrink-0 text-rb-muted transition-transform duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none group-aria-expanded:rotate-90";
const userBubble =
  "w-fit max-w-full rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover px-3.5 py-2 text-[14px]/[20px] whitespace-pre-wrap text-rb-fg [overflow-wrap:anywhere]";
const prose =
  "flex min-w-0 flex-col gap-3 text-[14px]/[20px] text-rb-fg [overflow-wrap:anywhere]";
const turnFooter =
  "-ms-2 flex min-h-8 min-w-0 items-center gap-0.5 text-[13px]/[18px] text-rb-fg/80 [@media(pointer:fine)]:*:data-reveal:opacity-0 [@media(pointer:fine)]:group-hover:*:data-reveal:opacity-100 *:data-reveal:focus-visible:opacity-100 *:data-reveal:transition-opacity";
const toolRow =
  "group -mx-2 flex min-h-8 max-w-[calc(100%+16px)] min-w-0 cursor-pointer items-center gap-2 self-start rounded-[var(--rb-r-sm,6px)] px-2 text-left text-[13px]/[18px] text-rb-fg/80 transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-rb-soft active:bg-rb-soft dark:hover:bg-rb-soft dark:active:bg-rb-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";
const stepGlyph = "flex size-4 shrink-0 items-center justify-center";
const toolLabel = "shrink-0 text-rb-fg/80";
const toolEnd =
  "ms-auto flex shrink-0 items-center gap-2 whitespace-nowrap tabular-nums text-rb-muted";
const toolWell =
  "flex min-w-0 flex-col gap-3 rounded-[var(--rb-r-sm,6px)] bg-rb-soft px-3 py-2 dark:bg-rb-soft";
const toolOutput =
  "min-w-0 overflow-x-auto font-mono text-[12px]/[16px] whitespace-pre-wrap text-rb-fg/80 [overflow-wrap:anywhere]";
const composer =
  "relative flex w-full min-w-0 flex-col rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-focus-within:border-rb-input focus-within:border-[var(--rb-accent,oklch(20.5%_0_0))] focus-within:ring-3 focus-within:ring-rb-line dark:border-rb-line dark:bg-rb-popover dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-focus-within:border-rb-input dark:focus-within:border-[var(--rb-accent,oklch(100%_0_0))] dark:focus-within:ring-rb-line";
const composerInput =
  "max-h-40 min-h-5 min-w-0 flex-auto resize-none bg-transparent px-1.5 py-1 field-sizing-content text-[14px]/[20px] text-rb-fg outline-none placeholder:text-rb-muted dark:placeholder:text-rb-muted";
const fadeTop =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";

const metaText = cx(typeBodySm, text3);

type Source = { id: string; title: string };

type ToolCall = {
  name: string;
  result: string;
  duration: string;
  done: boolean;
};

type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      reasoning?: string;
      tool?: ToolCall;
      text: string;
      sources?: Source[];
    };

const CATCH_UP_MS = 180;
const FLOOR_CPS = 45;

function lastWordBoundary(source: string, cut: number) {
  if (cut >= source.length) return source.length;
  const i = source.lastIndexOf(" ", cut);
  return i === -1 ? 0 : i;
}

function useSmoothedText() {
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

  const push = useCallback((chunk: string) => {
    targetRef.current += chunk;
  }, []);
  const end = useCallback(() => {
    endedRef.current = true;
  }, []);
  const reset = useCallback(() => {
    targetRef.current = "";
    shownRef.current = 0;
    endedRef.current = false;
    setText("");
    setDone(false);
  }, []);

  return { text, done, push, end, reset };
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

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowJump(false);
    el.scrollTop = el.scrollHeight;
  }, [scrollRef]);

  return { showJump, jumpToLatest };
}

const REASONING =
  "The refund total moved with two things last week: a pricing change that " +
  "shipped on the 12th, and a batch of failed renewals that were auto-refunded. " +
  "I checked both before answering.";

const TOOL_RESULT = [
  "reason count amount",
  "Renewal failed 84    $6,240",
  "Downgrade credit 31    $1,905",
  "Duplicate charge 9      $612",
  "Customer request 7      $438",
].join("\n");

const ANSWER_ONE =
  "Refunds rose 38% week over week, from $6,730 to $9,290. Almost all of the " +
  "increase came from failed renewals after the card-retry window was shortened " +
  "on the 12th. Downgrade credits were flat, and duplicate charges stayed in the " +
  "single digits.";

const STREAM_TARGET =
  "By plan, Growth accounted for $5,180 of the refunds and Scale for $3,240, " +
  "with Starter under $900. The renewal failures cluster on Growth annual plans " +
  "billed on the 12th, so retrying those cards a day later would recover most of " +
  "the amount.";

const LIVE_ID = "a2";

const INITIAL_MESSAGES: Message[] = [
  { id: "u1", role: "user", text: "Why did refunds spike last week?" },
  {
    id: "a1",
    role: "assistant",
    reasoning: REASONING,
    tool: {
      name: "Searched 1,284 refunds",
      result: TOOL_RESULT,
      duration: "1.2s",
      done: true,
    },
    text: ANSWER_ONE,
    sources: [
      { id: "1", title: "Billing events" },
      { id: "2", title: "Pricing change, Jun 12" },
    ],
  },
  { id: "u2", role: "user", text: "Break it down by plan tier." },
  { id: LIVE_ID, role: "assistant", text: STREAM_TARGET },
];

function ReasoningRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={disclosureRow}
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
        <span>
          Thought for <span className="tabular-nums">4s</span>
        </span>
      </button>
      {open && (
        <p className={cx(typeBodySm, text2, "mt-2 max-w-prose")}>{text}</p>
      )}
    </div>
  );
}

function ToolRow({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx(toolRow, "w-[calc(100%+16px)]")}
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
        <span className={toolLabel}>{tool.name}</span>
        <span className={cx(text3, "min-w-14")}>
          {tool.done ? "Done" : "Running"}
        </span>
        <span className={toolEnd}>{tool.duration}</span>
      </button>
      {open && (
        <div className={cx(toolWell, "mt-2 max-h-40 overflow-y-auto")}>
          <pre className={toolOutput}>{tool.result}</pre>
        </div>
      )}
    </div>
  );
}

function SourceChips({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cx(typeCaption, text3)}>Sources</span>
      {sources.map((s) => (
        <span key={s.id} className={cx(badge, badgeNeutral, "h-6")}>
          {s.title}
        </span>
      ))}
    </div>
  );
}

export default function AiChat1() {
  const reduced = useReducedMotion();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [stopped, setStopped] = useState(false);
  const [value, setValue] = useState("");
  const [runId, setRunId] = useState(0);

  const { text: streamText, done, push, end, reset } = useSmoothedText();
  const {
    ref: transcriptRef,
    edges: transcriptEdges,
    onScroll: onTranscriptScroll,
  } = useScrollFade<HTMLDivElement>();
  const { showJump, jumpToLatest } = useStickToBottom(transcriptRef);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transportRef = useRef<number | null>(null);

  const streaming = !done && !stopped;

  useEffect(() => {
    if (reduced) {
      push(STREAM_TARGET);
      end();
      return;
    }
    const chunks = STREAM_TARGET.match(/\S+\s*/g) ?? [];
    let i = 0;
    transportRef.current = window.setInterval(() => {
      const n = 1 + Math.floor(Math.random() * 3);
      push(chunks.slice(i, i + n).join(""));
      i += n;
      if (i >= chunks.length) {
        end();
        if (transportRef.current) window.clearInterval(transportRef.current);
        transportRef.current = null;
      }
    }, 130);
    return () => {
      if (transportRef.current) window.clearInterval(transportRef.current);
    };
  }, [reduced, push, end, runId]);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSend = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", text: t },
    ]);
    setValue("");
  }, []);

  const handleStop = useCallback(() => {
    if (transportRef.current) {
      window.clearInterval(transportRef.current);
      transportRef.current = null;
    }
    end();
    setStopped(true);
  }, [end]);

  const handleRegenerate = useCallback(() => {
    reset();
    setStopped(false);
    setRunId((n) => n + 1);
  }, [reset]);

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[640px] w-full flex-col overflow-hidden",
      )}
    >
      <header className="shrink-0">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <h1 className={typeHeadingXs}>Revenue assistant</h1>
          <span className={metaText}>Atlas</span>
        </div>
      </header>

      <div className="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={transcriptRef}
            onScroll={onTranscriptScroll}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [overflow-anchor:none]"
          >
            <div className="mt-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6">
              {messages.map((message) => {
                if (message.role === "user") {
                  return (
                    <div key={message.id} className="flex">
                      <div className="ml-auto max-w-[85%]">
                        <div className={userBubble}>{message.text}</div>
                      </div>
                    </div>
                  );
                }

                const live = message.id === LIVE_ID && streaming;
                const settled = message.id === LIVE_ID && !streaming;

                return (
                  <div key={message.id} className="group space-y-3">
                    {message.reasoning && (
                      <ReasoningRow text={message.reasoning} />
                    )}
                    {message.tool && <ToolRow tool={message.tool} />}

                    <p className={cx(prose, "max-w-prose")}>
                      {live ? streamText : message.text}
                    </p>

                    {message.sources && message.sources.length > 0 && (
                      <SourceChips sources={message.sources} />
                    )}

                    {settled && (
                      <div className={turnFooter}>
                        <button
                          type="button"
                          data-reveal
                          onClick={handleRegenerate}
                          className={cx(ghostButton, buttonSm)}
                        >
                          <HugeiconsIcon
                            icon={RefreshIcon}
                            size={16}
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                          Regenerate
                        </button>
                        <button
                          type="button"
                          data-reveal
                          aria-label="Copy reply"
                          className={cx(ghostButton, iconButtonSm)}
                        >
                          <HugeiconsIcon
                            icon={Copy01Icon}
                            size={16}
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                        </button>
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

          {showJump && (
            <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
              <motion.button
                type="button"
                onClick={jumpToLatest}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
                className={cx(secondaryButton, buttonMd)}
              >
                <HugeiconsIcon
                  icon={ArrowDown02Icon}
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                Jump to latest
              </motion.button>
            </div>
          )}
        </div>

        <div className="w-full shrink-0 px-4 pb-4 sm:px-6">
          <div className={cx(composer, "p-2")}>
            <div className="flex flex-wrap gap-1.5 px-1.5 pt-1.5 pb-1">
              <span className={chip}>
                <span className="max-w-40 truncate">refunds-week-24.csv</span>
                <button
                  type="button"
                  aria-label="Remove refunds-week-24.csv"
                  className={chipRemove}
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={12}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </button>
              </span>
            </div>
            <textarea
              ref={textareaRef}
              rows={1}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                autosize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(value);
                }
              }}
              placeholder="Ask anything"
              className={composerInput}
            />
            <div className="flex items-center gap-1 pt-1">
              <button
                type="button"
                aria-label="Add attachment"
                className={cx(ghostButton, iconButtonSm)}
              >
                <HugeiconsIcon
                  icon={Add01Icon}
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </button>
              <div className="ml-auto flex items-center gap-1">
                {streaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    key="stop"
                    aria-label="Stop generating"
                    className={cx(primaryButton, iconButtonSm)}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-[1px] bg-current"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSend(value)}
                    key="send"
                    aria-label="Send"
                    disabled={value.trim().length === 0}
                    className={cx(primaryButton, iconButtonSm)}
                  >
                    <HugeiconsIcon
                      icon={ArrowUp02Icon}
                      size={16}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
