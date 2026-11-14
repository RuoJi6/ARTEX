"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp02Icon,
  Attachment01Icon,
  BookOpen01Icon,
  Cancel01Icon,
  File02Icon,
  Mic01Icon,
  SourceCodeIcon,
  FlaskConicalIcon,
  Tick02Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const text1 = "text-rb-fg";
const text3 = "text-rb-muted";
const typeLabel = "text-[14px]/[16px] font-[450]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeCodeSm = "font-mono text-[12px]/[16px] tabular-nums";
const transition =
  "transition-[color,background-color,border-color,box-shadow,outline-color,opacity,scale] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:duration-[60ms]";
const primaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_94%,black))] text-[var(--rb-accent-fg,oklch(100%_0_0))] shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.22),0_2px_5px_-2px_rgb(0_0_0/0.3)] hover:not-disabled:brightness-110 active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] disabled:opacity-40 disabled:shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_94%,black))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.66),0_2px_5px_-2px_rgb(0_0_0/0.9)] dark:active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] dark:disabled:shadow-none";
const ghostButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg hover:not-disabled:bg-rb-soft active:bg-rb-soft aria-pressed:bg-rb-soft disabled:text-rb-muted/60 dark:text-rb-fg dark:hover:not-disabled:bg-rb-soft dark:active:bg-rb-soft dark:aria-pressed:bg-rb-soft dark:disabled:text-rb-muted/60";
const ghostButtonMuted =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg/80 hover:not-disabled:bg-rb-soft hover:not-disabled:text-rb-fg active:bg-rb-soft aria-expanded:bg-rb-soft aria-expanded:text-rb-fg disabled:text-rb-muted/60 dark:text-rb-fg/80 dark:hover:not-disabled:bg-rb-soft dark:hover:not-disabled:text-rb-fg dark:active:bg-rb-soft dark:aria-expanded:bg-rb-soft dark:aria-expanded:text-rb-fg dark:disabled:text-rb-muted/60";
const buttonXs =
  "h-6 gap-1 rounded-[var(--rb-r-sm,6px)] px-2 text-[12px]/[16px] font-[450] tabular-nums";
const iconButtonSm = "size-7 rounded-[var(--rb-r-sm,6px)]";
const chip =
  "relative inline-flex h-7 max-w-full min-w-0 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-popover px-2.5 text-[14px]/[16px] font-[450] text-rb-fg select-none shadow-rb-sm transition-[background-color,border-color,color,scale,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 hover:not-disabled:border-rb-input aria-pressed:border-rb-input aria-pressed:bg-rb-soft aria-expanded:border-rb-input disabled:cursor-not-allowed disabled:text-rb-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:not-disabled:border-rb-input dark:aria-pressed:border-rb-input dark:aria-pressed:bg-rb-soft dark:aria-expanded:border-rb-input dark:disabled:text-rb-muted/60";
const chipRemove =
  "-me-1.5 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--rb-r-xs,4px)] text-rb-fg/80 hover:bg-rb-soft hover:text-rb-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:bg-rb-soft dark:hover:text-rb-fg";
const menuPopup =
  "min-w-48 max-w-[min(480px,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover p-1 text-rb-fg outline-none shadow-rb-overlay";
const menuItem =
  "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 py-1.5 text-left text-[14px]/[16px] font-[450] text-rb-fg outline-none select-none [&_svg]:shrink-0 [&_svg]:text-rb-fg/80 hover:bg-rb-soft focus-visible:bg-rb-soft data-[highlighted]:bg-rb-soft aria-selected:bg-rb-soft aria-disabled:cursor-not-allowed aria-disabled:text-rb-muted/60 dark:text-rb-fg dark:[&_svg]:text-rb-fg/80 dark:hover:bg-rb-soft dark:focus-visible:bg-rb-soft dark:data-[highlighted]:bg-rb-soft dark:aria-selected:bg-rb-soft dark:aria-disabled:text-rb-muted/60";
const levelTrack =
  "relative h-12 w-full cursor-pointer touch-none rounded-full bg-rb-soft inset-ring inset-ring-rb-fg/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:bg-rb-soft /8";
const levelClip =
  "pointer-events-none absolute inset-x-2 top-1/2 h-8 -translate-y-1/2 overflow-hidden rounded-full";
const levelFill =
  "absolute inset-0 rounded-full bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_94%,black))] shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black)] dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_94%,black))] dark:shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black)]";
const levelThumb =
  "pointer-events-none absolute top-1/2 left-0 size-6 rounded-full bg-[var(--rb-accent-fg,oklch(100%_0_0))] shadow-rb-sm dark:bg-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:shadow-rb-sm";
const levelMark =
  "pointer-events-none absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-rb-fg/30";
const levelMarkOnFill =
  "pointer-events-none absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-[color-mix(in_oklab,var(--rb-accent-fg,oklch(100%_0_0))_45%,transparent)] dark:bg-[color-mix(in_oklab,var(--rb-accent-fg,oklch(20.5%_0_0))_45%,transparent)]";
const levelGlide =
  "transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none";
const composer =
  "relative flex w-full min-w-0 flex-col rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-focus-within:border-rb-input focus-within:border-[var(--rb-accent,oklch(20.5%_0_0))] focus-within:ring-3 focus-within:ring-rb-line dark:border-rb-line dark:bg-rb-popover dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-focus-within:border-rb-input dark:focus-within:border-[var(--rb-accent,oklch(100%_0_0))] dark:focus-within:ring-rb-line";
const composerInput =
  "max-h-40 min-h-5 min-w-0 flex-auto resize-none bg-transparent px-1.5 py-1 field-sizing-content text-[14px]/[20px] text-rb-fg outline-none placeholder:text-rb-muted dark:placeholder:text-rb-muted";

const metaText = cx(typeBodySm, text3);

const EFFORTS = ["Low", "Medium", "High"];

function EffortGauge({ level }: { level: number }) {
  const fraction = level / (EFFORTS.length - 1);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="h-4.5 w-4.5 shrink-0"
    >
      <path
        d="M5.94 16.5A7 7 0 1 1 18.06 16.5"
        pathLength={100}
        className="stroke-current opacity-30"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M5.94 16.5A7 7 0 1 1 18.06 16.5"
        pathLength={100}
        strokeDasharray={`${Math.max(fraction * 100, 0.01)} 100`}
        className="stroke-current"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="13"
        x2="12"
        y2="7.5"
        className={cx(levelGlide, "origin-[12px_13px] stroke-current")}
        style={{ transform: `rotate(${(fraction - 0.5) * 240}deg)` }}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx="12" cy="13" r="1.25" className="fill-current" />
    </svg>
  );
}

const TRACK_PAD = 8;
const FILL_PX = 32;
const THUMB_PX = 24;
const THUMB_INSET = (FILL_PX - THUMB_PX) / 2;

const EFFORT_EXIT_MS = 120;

const EFFORT_SETTLE_MS = 180;

const MENU_GUTTER = 16;
const MENU_MIN_H = 96;

function EffortSlider({
  level,
  onChange,
}: {
  level: number;
  onChange: (next: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (el) setTravel(Math.max(el.clientWidth - TRACK_PAD * 2 - FILL_PX, 0));
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    const view = el?.ownerDocument.defaultView;
    if (!el || !view?.ResizeObserver) return;
    const observer = new view.ResizeObserver(() =>
      setTravel(Math.max(el.clientWidth - TRACK_PAD * 2 - FILL_PX, 0)),
    );
    observer.observe(el);
    const frame = view.requestAnimationFrame(() => setReady(true));
    return () => {
      view.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const last = EFFORTS.length - 1;
  const offset = (travel * level) / last;

  const pick = (clientX: number) => {
    const el = trackRef.current;
    if (!el || travel <= 0) return;
    const box = el.getBoundingClientRect();
    const fraction = (clientX - box.left - TRACK_PAD - FILL_PX / 2) / travel;
    const next = Math.round(Math.min(Math.max(fraction, 0), 1) * last);
    if (next !== level) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    };
    if (event.key in step) {
      event.preventDefault();
      onChange(Math.min(Math.max(level + step[event.key], 0), last));
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(last);
    }
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Reasoning effort"
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={level}
      aria-valuetext={EFFORTS[level]}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        pick(event.clientX);
      }}
      onPointerMove={(event) => dragging && pick(event.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      className={cx(levelTrack, "max-w-sm")}
    >
      <div className={levelClip}>
        <div
          className={cx(levelFill, ready && levelGlide)}
          style={{ transform: `translateX(${offset - travel}px)` }}
        />
      </div>

      {EFFORTS.map((name, index) => {
        if (index === level) return null;
        return (
          <span
            key={name}
            aria-hidden
            className={index < level ? levelMarkOnFill : levelMark}
            style={{
              left: `${TRACK_PAD + FILL_PX / 2 - 3 + (travel * index) / last}px`,
            }}
          />
        );
      })}

      <div
        aria-hidden
        className={cx(levelThumb, ready && levelGlide)}
        style={{
          left: `${TRACK_PAD + THUMB_INSET}px`,
          transform: `translate(${offset}px, -50%)`,
        }}
      />
    </div>
  );
}

type Option = {
  name: string;
  hint: string;
  icon?: IconSvgElement;
};

const MODELS: Option[] = [
  { name: "Atlas", hint: "Balanced speed and depth" },
  { name: "Atlas Pro", hint: "Deepest reasoning" },
  { name: "Quill", hint: "Fastest, for short tasks" },
];

function Dropdown({
  label,
  options,
  value,
  onChange,
  triggerMaxWidth,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (next: string) => void;
  triggerMaxWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const doc = rootRef.current?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setShown(false);
      }
    };
    doc.addEventListener("pointerdown", onPointerDown);
    return () => doc.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current ?? 0), []);

  const openMenu = (index: number, withAnimation: boolean) => {
    setActive(index);
    setOpen(true);
    if (withAnimation) {
      setShown(false);
      frameRef.current = requestAnimationFrame(() => setShown(true));
    } else {
      setShown(true);
    }
  };

  const close = (restoreFocus = true) => {
    setOpen(false);
    setShown(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const select = (index: number) => {
    onChange(options[index].name);
    close();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(0, false);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(options.length - 1, false);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(active);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className={cx(
            menuPopup,
            transition,
            "absolute bottom-full left-0 z-30 mb-2 w-[256px]",
            shown ? "opacity-100" : "opacity-0",
          )}
        >
          {options.map((item, index) => {
            const selected = item.name === value;
            return (
              <button
                key={item.name}
                type="button"
                role="option"
                aria-selected={selected}
                data-highlighted={index === active || undefined}
                tabIndex={-1}
                onClick={() => select(index)}
                onPointerMove={() => setActive(index)}
                className={cx(menuItem, "gap-2.5 pe-8")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.name}</span>
                  <span className={cx(metaText, "block truncate")}>
                    {item.hint}
                  </span>
                </span>
                {selected && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className="absolute end-2"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value}`}
        onClick={() => (open ? close() : openMenu(0, true))}
        onKeyDown={onTriggerKeyDown}
        className={cx(ghostButtonMuted, buttonXs)}
      >
        <span className={cx("truncate", triggerMaxWidth)}>{value}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={12}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

const COMMANDS: { command: string; label: string; icon: IconSvgElement }[] = [
  {
    command: "/summarize",
    label: "Summarize the thread",
    icon: File02Icon,
  },
  {
    command: "/explain",
    label: "Explain this code",
    icon: SourceCodeIcon,
  },
  {
    command: "/tests",
    label: "Write unit tests",
    icon: FlaskConicalIcon,
  },
  {
    command: "/docs",
    label: "Search the docs",
    icon: BookOpen01Icon,
  },
  {
    command: "/fix",
    label: "Fix the failing build",
    icon: Wrench01Icon,
  },
];

const INITIAL_ATTACHMENTS = [
  { name: "auth-service.ts", size: "12 KB" },
  { name: "billing-invoice-4021.pdf", size: "1.2 MB" },
];

const MAX_COMPOSER_HEIGHT = 200;

export default function PromptInput1() {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState(INITIAL_ATTACHMENTS);
  const [model, setModel] = useState(MODELS[0].name);
  const [dismissed, setDismissed] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [effort, setEffort] = useState(1);
  const [settledEffort, setSettledEffort] = useState(1);
  const [effortOpen, setEffortOpen] = useState(false);
  const [effortShown, setEffortShown] = useState(false);
  const [recording, setRecording] = useState(false);
  const [menuMax, setMenuMax] = useState<number>();
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const effortPanelRef = useRef<HTMLDivElement>(null);
  const effortTriggerRef = useRef<HTMLButtonElement>(null);
  const effortFrame = useRef<number | undefined>(undefined);
  const effortExit = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const effortRestore = useRef(false);
  const listId = useId();
  const sendTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const resize = () => {
      el.style.height = "auto";
      if (el.scrollHeight === 0) return;
      el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
    };

    resize();
    const frame = requestAnimationFrame(resize);
    el.ownerDocument.fonts?.ready.then(resize).catch(() => {});

    let lastWidth = el.clientWidth;
    const view = el.ownerDocument.defaultView;
    if (!view?.ResizeObserver) return () => cancelAnimationFrame(frame);
    const observer = new view.ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      resize();
    });
    observer.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [value]);

  useEffect(() => () => clearTimeout(sendTimer.current), []);

  useEffect(
    () => () => {
      cancelAnimationFrame(effortFrame.current ?? 0);
      clearTimeout(effortExit.current);
    },
    [],
  );

  const openEffort = (animate: boolean) => {
    clearTimeout(effortExit.current);
    setEffortOpen(true);
    if (animate) {
      setEffortShown(false);
      effortFrame.current = requestAnimationFrame(() => setEffortShown(true));
    } else {
      setEffortShown(true);
    }
  };

  const closeEffort = (restoreFocus = true) => {
    cancelAnimationFrame(effortFrame.current ?? 0);
    clearTimeout(effortExit.current);
    effortRestore.current = restoreFocus;
    setEffortShown(false);
    effortExit.current = setTimeout(() => setEffortOpen(false), EFFORT_EXIT_MS);
  };

  useEffect(() => {
    if (effortOpen || !effortRestore.current) return;
    effortRestore.current = false;
    effortTriggerRef.current?.focus({ preventScroll: true });
  }, [effortOpen]);

  useEffect(() => {
    if (effortOpen) return;
    const timer = setTimeout(() => setSettledEffort(effort), EFFORT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [effortOpen, effort]);

  useEffect(() => {
    if (!effortOpen) return;
    const panel = effortPanelRef.current;
    const doc = panel?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent) => {
      const slider = panel?.querySelector('[role="slider"]');
      if (slider?.contains(event.target as Node)) return;
      effortRestore.current = false;
      setEffortShown(false);
      effortExit.current = setTimeout(
        () => setEffortOpen(false),
        EFFORT_EXIT_MS,
      );
    };
    doc.addEventListener("pointerdown", onPointerDown);
    return () => doc.removeEventListener("pointerdown", onPointerDown);
  }, [effortOpen]);

  useEffect(() => {
    if (effortShown) {
      effortPanelRef.current
        ?.querySelector<HTMLElement>('[role="slider"]')
        ?.focus({ preventScroll: true });
    }
  }, [effortShown]);

  const query = value.startsWith("/") ? value.slice(1).toLowerCase() : null;
  const matches = useMemo(() => {
    if (query === null) return [];
    return COMMANDS.filter((c) => c.command.slice(1).startsWith(query));
  }, [query]);
  const menuOpen = matches.length > 0 && !busy && !dismissed;
  const activeCommand = Math.min(commandIndex, Math.max(0, matches.length - 1));

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !busy;

  const runCommand = (command: string) => {
    setValue(`${command} `);
    textareaRef.current?.focus({ preventScroll: true });
  };

  const addAttachment = () => {
    setAttachments((prev) => [
      ...prev,
      {
        name: `reference-${prev.length + 1}.md`,
        size: `${8 + prev.length * 3} KB`,
      },
    ]);
  };

  const submit = () => {
    if (!canSend) return;
    setBusy(true);
    setValue("");
    setAttachments([]);
    sendTimer.current = setTimeout(() => setBusy(false), 1800);
  };

  const cancel = () => {
    clearTimeout(sendTimer.current);
    setBusy(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          setDismissed(true);
          return;
        case "ArrowDown":
          event.preventDefault();
          setCommandIndex((i) => (i + 1) % matches.length);
          return;
        case "ArrowUp":
          event.preventDefault();
          setCommandIndex((i) => (i - 1 + matches.length) % matches.length);
          return;
        case "Home":
          event.preventDefault();
          setCommandIndex(0);
          return;
        case "End":
          event.preventDefault();
          setCommandIndex(matches.length - 1);
          return;
        case "Enter":
        case "Tab":
          event.preventDefault();
          runCommand(matches[activeCommand].command);
          return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const root = rootRef.current;
    const anchor = anchorRef.current;
    if (!root || !anchor) return;
    const space =
      anchor.getBoundingClientRect().top - root.getBoundingClientRect().top;
    setMenuMax(Math.max(space - MENU_GUTTER, MENU_MIN_H));
  }, [menuOpen, matches.length]);

  useEffect(() => {
    if (!menuOpen) return;
    const menu = menuRef.current;
    const option = menu?.children[activeCommand];
    if (!(option instanceof HTMLElement) || !menu) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < menu.scrollTop) menu.scrollTop = top;
    else if (bottom > menu.scrollTop + menu.clientHeight)
      menu.scrollTop = bottom - menu.clientHeight;
  }, [activeCommand, menuOpen]);

  const onChange = (next: string) => {
    setDismissed(false);
    setCommandIndex(0);
    setValue(next);
  };

  return (
    <div
      ref={rootRef}
      className={cx(
        canvas,
        text1,
        "relative flex h-full w-full min-h-[560px] flex-col overflow-hidden",
      )}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <div ref={anchorRef} className="relative w-full">
          {menuOpen && (
            <div
              id={`${listId}-menu`}
              ref={menuRef}
              role="listbox"
              aria-label="Commands"
              style={{ maxHeight: menuMax }}
              className={cx(
                menuPopup,
                "absolute bottom-full left-0 z-30 mb-2 w-[288px]",
              )}
            >
              {matches.map((item, index) => (
                <button
                  key={item.command}
                  id={`${listId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeCommand}
                  tabIndex={-1}
                  onClick={() => runCommand(item.command)}
                  onPointerMove={() => setCommandIndex(index)}
                  className={cx(menuItem, "gap-2.5")}
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={14}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className={cx(typeCodeSm, text3, "shrink-0")}>
                    {item.command}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <div
              inert={effortOpen}
              className={cx(composer, effortOpen && "*:invisible")}
            >
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                  {attachments.map((file) => (
                    <span key={file.name} className={chip}>
                      <HugeiconsIcon
                        icon={Attachment01Icon}
                        size={14}
                        strokeWidth={1.8}
                        aria-hidden="true"
                        className={text3}
                      />
                      <span className="min-w-0 truncate">{file.name}</span>
                      <span className={cx(text3, "shrink-0 tabular-nums")}>
                        {file.size}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        onClick={() =>
                          setAttachments((prev) =>
                            prev.filter((f) => f.name !== file.name),
                          )
                        }
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
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                rows={1}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask anything"
                aria-label="Message"
                role="combobox"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? `${listId}-menu` : undefined}
                aria-activedescendant={
                  menuOpen ? `${listId}-option-${activeCommand}` : undefined
                }
                aria-autocomplete="list"
                className={cx(
                  composerInput,
                  "block max-h-[200px] min-h-[52px] w-full px-4 py-3.5",
                )}
              />

              <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1">
                <button
                  type="button"
                  aria-label="Attach a file"
                  onClick={addAttachment}
                  className={cx(ghostButton, iconButtonSm)}
                >
                  <HugeiconsIcon
                    icon={Attachment01Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </button>

                <Dropdown
                  label="Model"
                  options={MODELS}
                  value={model}
                  onChange={setModel}
                  triggerMaxWidth="max-w-[10rem]"
                />

                {busy ? (
                  <button
                    type="button"
                    onClick={cancel}
                    aria-label="Stop generating"
                    className={cx(primaryButton, iconButtonSm, "ml-auto")}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-[1px] bg-current"
                    />
                  </button>
                ) : (
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      ref={effortTriggerRef}
                      type="button"
                      aria-haspopup="dialog"
                      aria-expanded={effortOpen}
                      aria-label={`Reasoning effort: ${EFFORTS[effort]}`}
                      onClick={(event) =>
                        effortOpen
                          ? closeEffort()
                          : openEffort(event.detail > 0)
                      }
                      className={cx(ghostButton, iconButtonSm)}
                    >
                      <EffortGauge level={settledEffort} />
                    </button>

                    <button
                      type="button"
                      aria-pressed={recording}
                      aria-label={recording ? "Stop recording" : "Record voice"}
                      onClick={() => setRecording((on) => !on)}
                      className={cx(ghostButton, iconButtonSm)}
                    >
                      <HugeiconsIcon
                        icon={Mic01Icon}
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </button>

                    <button
                      type="button"
                      aria-label="Send"
                      disabled={!canSend}
                      onClick={submit}
                      className={cx(primaryButton, iconButtonSm)}
                    >
                      <HugeiconsIcon
                        icon={ArrowUp02Icon}
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {effortOpen && (
              <div
                ref={effortPanelRef}
                role="dialog"
                aria-label="Reasoning effort"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeEffort();
                  }
                }}
                className={cx(
                  transition,
                  "absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-4",
                  effortShown ? "opacity-100" : "opacity-0",
                )}
              >
                <p className={cx(typeLabel, "relative")}>{EFFORTS[effort]}</p>
                <EffortSlider level={effort} onChange={setEffort} />
              </div>
            )}
          </div>

          <p className={cx(metaText, "mt-3 px-1")}>
            {busy
              ? "Working on it…"
              : "Type / to run a command, or drop a file to attach it."}
          </p>
        </div>
      </div>
    </div>
  );
}
