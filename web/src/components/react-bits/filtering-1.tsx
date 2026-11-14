"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  SlidersHorizontalIcon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const text1 = "text-rb-fg";
const text3 = "text-rb-muted";
const textOnField = "text-rb-fg dark:text-rb-fg";
const textInverse = "text-white dark:text-rb-fg";
const controlEdge = "border border-rb-line";
const rowsRuled = "divide-y divide-rb-line";
const typeHeadingSm = "text-[20px]/[24px] font-[450] tracking-[-0.015em]";
const typeLabel = "text-[14px]/[16px] font-[450]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const primaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_94%,black))] text-[var(--rb-accent-fg,oklch(100%_0_0))] shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.22),0_2px_5px_-2px_rgb(0_0_0/0.3)] hover:not-disabled:brightness-110 active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] disabled:opacity-40 disabled:shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_94%,black))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.66),0_2px_5px_-2px_rgb(0_0_0/0.9)] dark:active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] dark:disabled:shadow-none";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const ghostButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg hover:not-disabled:bg-rb-soft active:bg-rb-soft aria-pressed:bg-rb-soft disabled:text-rb-muted/60 dark:text-rb-fg dark:hover:not-disabled:bg-rb-soft dark:active:bg-rb-soft dark:aria-pressed:bg-rb-soft dark:disabled:text-rb-muted/60";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const iconButtonMd = "size-8 rounded-[var(--rb-r-sm,6px)]";
const selectTrigger =
  "inline-flex h-8 w-fit min-w-40 cursor-pointer items-center justify-between gap-2 rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-canvas px-3 text-left text-[14px]/[16px] font-[450] whitespace-nowrap text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] outline-none select-none transition-[border-color,box-shadow] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-disabled:not-aria-invalid:border-rb-input focus-visible:border-[var(--rb-accent,oklch(20.5%_0_0))] focus-visible:ring-3 focus-visible:ring-rb-line aria-expanded:border-[var(--rb-accent,oklch(20.5%_0_0))] aria-expanded:ring-3 aria-expanded:ring-rb-line aria-invalid:border-[oklch(60%_0.236_26)] disabled:cursor-not-allowed disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:not-aria-invalid:border-rb-input dark:focus-visible:border-[var(--rb-accent,oklch(100%_0_0))] dark:focus-visible:ring-rb-line dark:aria-expanded:border-[var(--rb-accent,oklch(100%_0_0))] dark:aria-expanded:ring-rb-line dark:aria-invalid:border-[oklch(65.2%_0.219_26)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const selectPlaceholder = "text-rb-muted";
const selectCaret = "shrink-0 text-rb-fg/80";
const checkboxBox =
  "relative inline-flex size-4 shrink-0 items-center justify-center";
const checkbox =
  "peer size-4 shrink-0 cursor-pointer appearance-none rounded-[var(--rb-r-xs,4px)] border border-rb-input bg-rb-canvas shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[background-color,border-color,box-shadow,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-checked:not-disabled:border-rb-line active:not-checked:bg-rb-soft checked:border-transparent checked:bg-[var(--rb-accent,oklch(20.5%_0_0))] indeterminate:border-transparent indeterminate:bg-[var(--rb-accent,oklch(20.5%_0_0))] aria-invalid:border-[oklch(60%_0.236_26)] disabled:cursor-not-allowed disabled:border-rb-input disabled:shadow-none disabled:checked:bg-rb-fg/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:border-rb-input dark:bg-rb-popover dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-checked:not-disabled:border-rb-line dark:active:not-checked:bg-rb-soft dark:checked:bg-[var(--rb-accent,oklch(100%_0_0))] dark:indeterminate:bg-[var(--rb-accent,oklch(100%_0_0))] dark:aria-invalid:border-[oklch(65.2%_0.219_26)] dark:disabled:border-rb-input dark:disabled:checked:bg-rb-fg/40";
const checkboxMark =
  "pointer-events-none absolute text-[var(--rb-accent-fg,oklch(100%_0_0))] opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100 dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]";
const sliderTrack =
  "relative h-1 w-full grow rounded-[var(--rb-r-sm,6px)] bg-rb-soft";
const sliderRange =
  "absolute inset-y-0 rounded-[var(--rb-r-sm,6px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] dark:bg-[var(--rb-accent,oklch(100%_0_0))]";
const sliderThumb =
  "absolute top-1/2 block size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[var(--rb-r-sm,6px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] shadow-[0_0_0_2px_var(--color-rb-canvas)] active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:bg-[var(--rb-accent,oklch(100%_0_0))] ";
const chip =
  "relative inline-flex h-7 max-w-full min-w-0 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-popover px-2.5 text-[14px]/[16px] font-[450] text-rb-fg select-none shadow-rb-sm transition-[background-color,border-color,color,scale,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 hover:not-disabled:border-rb-input aria-pressed:border-rb-input aria-pressed:bg-rb-soft aria-expanded:border-rb-input disabled:cursor-not-allowed disabled:text-rb-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:not-disabled:border-rb-input dark:aria-pressed:border-rb-input dark:aria-pressed:bg-rb-soft dark:aria-expanded:border-rb-input dark:disabled:text-rb-muted/60";
const chipRemove =
  "-me-1.5 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--rb-r-xs,4px)] text-rb-fg/80 hover:bg-rb-soft hover:text-rb-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:bg-rb-soft dark:hover:text-rb-fg";
const frame =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover text-rb-fg";
const frameTitle =
  "min-w-0 truncate text-[14px]/[16px] font-[450] text-rb-fg";
const emptyTitle =
  "text-[16px]/[20px] font-[450] tracking-[-0.015em] text-rb-fg";
const emptyDescription =
  "max-w-[48ch] text-[13px]/[18px] text-rb-fg/80";
const menuPopup =
  "min-w-48 max-w-[min(480px,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover p-1 text-rb-fg outline-none shadow-rb-overlay";
const menuItem =
  "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 py-1.5 text-left text-[14px]/[16px] font-[450] text-rb-fg outline-none select-none [&_svg]:shrink-0 [&_svg]:text-rb-fg/80 hover:bg-rb-soft focus-visible:bg-rb-soft data-[highlighted]:bg-rb-soft aria-selected:bg-rb-soft aria-disabled:cursor-not-allowed aria-disabled:text-rb-muted/60 dark:text-rb-fg dark:[&_svg]:text-rb-fg/80 dark:hover:bg-rb-soft dark:focus-visible:bg-rb-soft dark:data-[highlighted]:bg-rb-soft dark:aria-selected:bg-rb-soft dark:aria-disabled:text-rb-muted/60";
const navItem =
  "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 text-left text-[14px]/[16px] font-[450] text-rb-fg/80 transition-[background-color,color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] [&_svg]:shrink-0 hover:bg-rb-soft hover:text-rb-fg aria-[current=page]:bg-rb-soft aria-[current=page]:text-rb-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:text-rb-fg/80 dark:hover:bg-rb-soft dark:hover:text-rb-fg dark:aria-[current=page]:bg-rb-soft dark:aria-[current=page]:text-rb-fg";
const navCount =
  "ms-auto text-[12px]/[16px] font-[450] tabular-nums text-rb-muted";
const clearFilters =
  "inline-flex h-7 cursor-pointer items-center rounded-[var(--rb-r-sm,6px)] px-2 text-[14px]/[16px] font-[450] text-rb-fg/80 decoration-1 underline-offset-4 hover:text-rb-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:text-rb-fg";
const chartSwatch = "inline-block size-2 shrink-0";
const cornerXs = "rounded-[var(--rb-r-xs,4px)]";
const cornerSm = "rounded-[var(--rb-r-sm,6px)]";

const metaText = cx(typeBodySm, text3);
const captionText = cx(typeCaption, text3);

type SelectOption = { value: string; label: string; hint?: string };

function Select({
  id,
  value,
  onChange,
  options,
  disabled,
  placeholder = "Select…",
  className,
  triggerClassName,
  leading,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  leading?: ReactNode;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [flip, setFlip] = useState(false);
  const [listMax, setListMax] = useState<number>();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const openList = (index?: number) => {
    if (disabled) return;
    const node = rootRef.current;
    const win = node?.ownerDocument.defaultView;
    if (node && win) {
      const r = node.getBoundingClientRect();
      let top = 0;
      let bottom = win.innerHeight;
      for (let el = node.parentElement; el; el = el.parentElement) {
        if (
          /auto|scroll|hidden|clip/.test(win.getComputedStyle(el).overflowY)
        ) {
          const box = el.getBoundingClientRect();
          top = Math.max(top, box.top);
          bottom = Math.min(bottom, box.bottom);
          break;
        }
      }
      const below = bottom - r.bottom;
      const above = r.top - top;
      const needed = Math.min(options.length * 32 + 8, 264);
      const up = below < needed + 8 && above > below;
      const room = (up ? above : below) - 8;
      setFlip(up);
      setListMax(room < needed ? Math.max(room, 40) : undefined);
    }
    setActive(index ?? (selectedIndex >= 0 ? selectedIndex : 0));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const node = rootRef.current;
    const doc = node?.ownerDocument;
    if (!doc) return;
    const onPointer = (e: Event) => {
      if (!node.contains(e.target as Node)) setOpen(false);
    };
    doc.addEventListener("mousedown", onPointer);
    doc.addEventListener("touchstart", onPointer);
    return () => {
      doc.removeEventListener("mousedown", onPointer);
      doc.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
  }, [open, active]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    rootRef.current?.querySelector("button")?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(active);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now();
      const t = typeahead.current;
      t.buffer = now - t.at > 700 ? e.key : t.buffer + e.key;
      t.at = now;
      const hit = options.findIndex((o) =>
        o.label.toLowerCase().startsWith(t.buffer.toLowerCase()),
      );
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
        className={cx(selectTrigger, "w-full min-w-[100%]", triggerClassName)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {leading}
          <span className={cx("truncate", !selected && selectPlaceholder)}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <HugeiconsIcon
          icon={UnfoldMoreIcon}
          size={16}
          strokeWidth={1.8}
          aria-hidden="true"
          className={selectCaret}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          style={{ maxHeight: listMax }}
          className={cx(
            menuPopup,
            "absolute z-30 max-h-[264px] w-full min-w-[100%]",
            flip ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                data-index={i}
                data-highlighted={i === active || undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(i)}
                className={cx(menuItem, "pe-8")}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate">{o.label}</span>
                  {o.hint && (
                    <span className={cx(captionText, "shrink-0")}>
                      {o.hint}
                    </span>
                  )}
                </span>
                {isSelected && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className="pointer-events-none absolute end-2"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  format,
  labels,
}: {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  format: (n: number) => string;
  labels: [string, string];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<0 | 1 | null>(null);

  const snap = (n: number) =>
    Math.min(max, Math.max(min, Math.round(n / step) * step));

  const pct = (n: number) => ((n - min) / (max - min)) * 100;

  const fromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return min;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return min;
    return snap(min + ((clientX - r.left) / r.width) * (max - min));
  };

  const move = (index: 0 | 1, next: number) => {
    const [lo, hi] = value;
    if (index === 0) onChange([Math.min(next, hi), hi]);
    else onChange([lo, Math.max(next, lo)]);
  };

  const thumbProps = (index: 0 | 1) => ({
    role: "slider" as const,
    tabIndex: 0,
    "aria-label": labels[index],
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuenow": value[index],
    "aria-valuetext": format(value[index]),
    style: { left: `${pct(value[index])}%`, touchAction: "none" as const },
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag(index);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (drag !== index) return;
      move(index, fromClientX(e.clientX));
    },
    onLostPointerCapture: () => setDrag(null),
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDrag(null);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      const page = Math.max(step, Math.round((max - min) / 10));
      const current = value[index];
      let next: number | null = null;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = current - step;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp")
        next = current + step;
      else if (e.key === "PageDown") next = current - page;
      else if (e.key === "PageUp") next = current + page;
      else if (e.key === "Home") next = min;
      else if (e.key === "End") next = max;
      if (next === null) return;
      e.preventDefault();
      move(index, snap(next));
    },
    className: sliderThumb,
  });

  return (
    <div
      ref={trackRef}
      onPointerDown={(e) => {
        const next = fromClientX(e.clientX);
        move(
          Math.abs(next - value[0]) <= Math.abs(next - value[1]) ? 0 : 1,
          next,
        );
      }}
      className="relative flex h-4 w-full cursor-pointer touch-none items-center select-none"
    >
      <div className={sliderTrack}>
        <span
          className={sliderRange}
          style={{
            left: `${pct(value[0])}%`,
            width: `${pct(value[1]) - pct(value[0])}%`,
          }}
        />
        <div {...thumbProps(0)} />
        <div {...thumbProps(1)} />
      </div>
    </div>
  );
}

type Piece = {
  id: string;
  name: string;
  category: string;
  price: number;
  glaze: string;
  size: string;
  maker: string;
};

const CATEGORIES = [
  { value: "dinnerware", label: "Dinnerware" },
  { value: "drinkware", label: "Drinkware" },
  { value: "vases", label: "Vases" },
  { value: "planters", label: "Planters" },
  { value: "serveware", label: "Serveware" },
];

const GLAZES = [
  { value: "chalk", label: "Chalk", hex: "#ece5d8", light: true },
  { value: "sand", label: "Sand", hex: "#c9b193", light: true },
  { value: "moss", label: "Moss", hex: "#5a6647", light: false },
  { value: "slate", label: "Slate", hex: "#3b4b5a", light: false },
  { value: "clay", label: "Clay", hex: "#a05a41", light: false },
  { value: "ink", label: "Ink", hex: "#2a2724", light: false },
];

const SIZES = [
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
];

const MAKERS = [
  { value: "kilnhouse", label: "Kilnhouse" },
  { value: "muro", label: "Muro Studio" },
  { value: "terra", label: "Terra & Ash" },
  { value: "nine", label: "Nine Fields" },
];

const PIECES: Piece[] = [
  {
    id: "p1",
    name: "Ridge dinner plate",
    category: "dinnerware",
    price: 38,
    glaze: "chalk",
    size: "l",
    maker: "kilnhouse",
  },
  {
    id: "p2",
    name: "Ridge side plate",
    category: "dinnerware",
    price: 26,
    glaze: "chalk",
    size: "m",
    maker: "kilnhouse",
  },
  {
    id: "p3",
    name: "Coil cereal bowl",
    category: "dinnerware",
    price: 32,
    glaze: "sand",
    size: "m",
    maker: "muro",
  },
  {
    id: "p4",
    name: "Ember pasta bowl",
    category: "dinnerware",
    price: 44,
    glaze: "clay",
    size: "l",
    maker: "terra",
  },
  {
    id: "p5",
    name: "Halo charger plate",
    category: "dinnerware",
    price: 52,
    glaze: "ink",
    size: "l",
    maker: "nine",
  },
  {
    id: "p6",
    name: "Tuck mug",
    category: "drinkware",
    price: 28,
    glaze: "moss",
    size: "s",
    maker: "kilnhouse",
  },
  {
    id: "p7",
    name: "Stack tumbler",
    category: "drinkware",
    price: 22,
    glaze: "slate",
    size: "s",
    maker: "muro",
  },
  {
    id: "p8",
    name: "Pour carafe",
    category: "drinkware",
    price: 68,
    glaze: "chalk",
    size: "l",
    maker: "terra",
  },
  {
    id: "p9",
    name: "Field cup",
    category: "drinkware",
    price: 19,
    glaze: "sand",
    size: "s",
    maker: "nine",
  },
  {
    id: "p10",
    name: "Bell teapot",
    category: "drinkware",
    price: 94,
    glaze: "ink",
    size: "l",
    maker: "kilnhouse",
  },
  {
    id: "p11",
    name: "Column vase",
    category: "vases",
    price: 76,
    glaze: "slate",
    size: "l",
    maker: "muro",
  },
  {
    id: "p12",
    name: "Pebble bud vase",
    category: "vases",
    price: 34,
    glaze: "chalk",
    size: "s",
    maker: "terra",
  },
  {
    id: "p13",
    name: "Fold vase",
    category: "vases",
    price: 58,
    glaze: "clay",
    size: "m",
    maker: "nine",
  },
  {
    id: "p14",
    name: "Basin planter",
    category: "planters",
    price: 62,
    glaze: "sand",
    size: "l",
    maker: "kilnhouse",
  },
  {
    id: "p15",
    name: "Rim planter",
    category: "planters",
    price: 41,
    glaze: "moss",
    size: "m",
    maker: "muro",
  },
  {
    id: "p16",
    name: "Trace wall planter",
    category: "planters",
    price: 29,
    glaze: "ink",
    size: "s",
    maker: "terra",
  },
  {
    id: "p17",
    name: "Crest platter",
    category: "serveware",
    price: 88,
    glaze: "chalk",
    size: "l",
    maker: "nine",
  },
  {
    id: "p18",
    name: "Ladle serving bowl",
    category: "serveware",
    price: 54,
    glaze: "moss",
    size: "m",
    maker: "kilnhouse",
  },
];

const PRICE_MIN = 0;
const PRICE_MAX: number = 100;
const money = (n: number) => `$${n}`;

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "low", label: "Price: low to high" },
  { value: "high", label: "Price: high to low" },
  { value: "name", label: "Alphabetical" },
];

type Facets = {
  category: string[];
  glaze: string[];
  size: string[];
  maker: string[];
  price: [number, number];
};

const EMPTY: Facets = {
  category: [],
  glaze: [],
  size: [],
  maker: [],
  price: [PRICE_MIN, PRICE_MAX],
};

const matches = (piece: Piece, f: Facets, exclude?: keyof Facets) => {
  if (
    exclude !== "category" &&
    f.category.length &&
    !f.category.includes(piece.category)
  )
    return false;
  if (exclude !== "glaze" && f.glaze.length && !f.glaze.includes(piece.glaze))
    return false;
  if (exclude !== "size" && f.size.length && !f.size.includes(piece.size))
    return false;
  if (exclude !== "maker" && f.maker.length && !f.maker.includes(piece.maker))
    return false;
  if (
    exclude !== "price" &&
    (piece.price < f.price[0] || piece.price > f.price[1])
  )
    return false;
  return true;
};

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="py-5 first:pt-0">
      <h3 className={cx(typeLabel, "mb-3")}>{label}</h3>
      {children}
    </section>
  );
}

export default function Filtering1() {
  const [facets, setFacets] = useState<Facets>(EMPTY);
  const [sort, setSort] = useState("featured");
  const [railOpen, setRailOpen] = useState(false);

  const toggle = (
    key: "category" | "glaze" | "size" | "maker",
    value: string,
  ) =>
    setFacets((f) => ({
      ...f,
      [key]: f[key].includes(value)
        ? f[key].filter((v) => v !== value)
        : [...f[key], value],
    }));

  const results = useMemo(() => {
    const list = PIECES.filter((p) => matches(p, facets));
    if (sort === "low") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "high") return [...list].sort((a, b) => b.price - a.price);
    if (sort === "name")
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [facets, sort]);

  const countFor = (
    key: "category" | "glaze" | "size" | "maker",
    value: string,
  ) => PIECES.filter((p) => matches(p, facets, key) && p[key] === value).length;

  const priceNarrowed =
    facets.price[0] !== PRICE_MIN || facets.price[1] !== PRICE_MAX;

  const chips = [
    ...facets.category.map((v) => ({
      key: `category:${v}`,
      label: CATEGORIES.find((c) => c.value === v)?.label ?? v,
      swatch: undefined as string | undefined,
      clear: () => toggle("category", v),
    })),
    ...facets.glaze.map((v) => ({
      key: `glaze:${v}`,
      label: GLAZES.find((g) => g.value === v)?.label ?? v,
      swatch: GLAZES.find((g) => g.value === v)?.hex,
      clear: () => toggle("glaze", v),
    })),
    ...facets.size.map((v) => ({
      key: `size:${v}`,
      label: SIZES.find((s) => s.value === v)?.label ?? v,
      swatch: undefined,
      clear: () => toggle("size", v),
    })),
    ...facets.maker.map((v) => ({
      key: `maker:${v}`,
      label: MAKERS.find((m) => m.value === v)?.label ?? v,
      swatch: undefined,
      clear: () => toggle("maker", v),
    })),
    ...(priceNarrowed
      ? [
          {
            key: "price",
            label: `${money(facets.price[0])} – ${money(facets.price[1])}`,
            swatch: undefined,
            clear: () =>
              setFacets((f) => ({ ...f, price: [PRICE_MIN, PRICE_MAX] })),
          },
        ]
      : []),
  ];

  const rail = (
    <div className={rowsRuled}>
      <Group label="Category">
        <ul className="-mx-2 space-y-0.5">
          {CATEGORIES.map((c) => {
            const n = countFor("category", c.value);
            const on = facets.category.includes(c.value);
            return (
              <li key={c.value}>
                <label className={cx(navItem, n === 0 && !on && "opacity-40")}>
                  <span className={checkboxBox}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle("category", c.value)}
                      className={checkbox}
                    />
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      size={12}
                      strokeWidth={2.5}
                      aria-hidden="true"
                      className={checkboxMark}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  <span className={cx(navCount, "shrink-0")}>{n}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group label="Price">
        <div className="mb-4 flex min-h-7 items-center justify-between">
          <span className={cx(typeLabel, "tabular-nums")}>
            {money(facets.price[0])} – {money(facets.price[1])}
          </span>
          {priceNarrowed && (
            <button
              type="button"
              onClick={() =>
                setFacets((f) => ({ ...f, price: [PRICE_MIN, PRICE_MAX] }))
              }
              className={clearFilters}
            >
              Reset
            </button>
          )}
        </div>
        <RangeSlider
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={5}
          value={facets.price}
          onChange={(price) => setFacets((f) => ({ ...f, price }))}
          format={money}
          labels={["Minimum price", "Maximum price"]}
        />
      </Group>

      <Group label="Glaze">
        <div className="-mx-1 grid grid-cols-6">
          {GLAZES.map((g) => {
            const on = facets.glaze.includes(g.value);
            const n = countFor("glaze", g.value);
            return (
              <button
                key={g.value}
                type="button"
                aria-pressed={on}
                aria-label={`${g.label}, ${n} pieces`}
                onClick={() => toggle("glaze", g.value)}
                className={cx(
                  ghostButton,
                  iconButtonMd,
                  n === 0 && !on && "opacity-40",
                )}
              >
                <span
                  className={cx(controlEdge, cornerXs, "size-6")}
                  style={{ backgroundColor: g.hex }}
                />
                {on && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className={cx(
                      g.light ? textOnField : textInverse,
                      "absolute",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </Group>

      <Group label="Size">
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => {
            const on = facets.size.includes(s.value);
            const n = countFor("size", s.value);
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggle("size", s.value)}
                className={cx(chip, n === 0 && !on && "opacity-40")}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </Group>

      <Group label="Maker">
        <ul className="-mx-2 space-y-0.5">
          {MAKERS.map((m) => {
            const n = countFor("maker", m.value);
            const on = facets.maker.includes(m.value);
            return (
              <li key={m.value}>
                <label className={cx(navItem, n === 0 && !on && "opacity-40")}>
                  <span className={checkboxBox}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle("maker", m.value)}
                      className={checkbox}
                    />
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      size={12}
                      strokeWidth={2.5}
                      aria-hidden="true"
                      className={checkboxMark}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  <span className={cx(navCount, "shrink-0")}>{n}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </Group>
    </div>
  );

  return (
    <div
      className={cx(
        canvas,
        text1,
        "flex h-full min-h-[940px] w-full flex-col overflow-y-auto p-6 sm:p-8",
      )}
    >
      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={typeHeadingSm}>Stoneware</h2>
            <p className={cx(metaText, "mt-1")}>
              <span className="tabular-nums">{results.length}</span> of{" "}
              <span className="tabular-nums">{PIECES.length}</span> pieces
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={railOpen}
              onClick={() => setRailOpen((v) => !v)}
              className={cx(secondaryButton, buttonMd, "md:hidden")}
            >
              <HugeiconsIcon
                icon={SlidersHorizontalIcon}
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              Filters
              {chips.length > 0 && (
                <span className="tabular-nums">({chips.length})</span>
              )}
            </button>
            <Select
              value={sort}
              onChange={setSort}
              options={SORTS}
              ariaLabel="Sort pieces"
              className="w-[190px]"
            />
          </div>
        </header>

        <div className="mt-6 flex flex-1 flex-col gap-6 md:flex-row md:gap-8">
          <aside
            className={cx(
              "w-full shrink-0 md:block md:w-[240px]",
              railOpen ? "block" : "hidden",
            )}
          >
            {rail}
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {chips.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {chips.map((c) => (
                  <span key={c.key} className={chip}>
                    {c.swatch && (
                      <span
                        className={cx(chartSwatch, controlEdge, "size-[10px]")}
                        style={{ backgroundColor: c.swatch }}
                      />
                    )}
                    {c.label}
                    <button
                      type="button"
                      aria-label={`Remove ${c.label} filter`}
                      onClick={c.clear}
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
                <button
                  type="button"
                  onClick={() => setFacets(EMPTY)}
                  className={clearFilters}
                >
                  Clear all
                </button>
              </div>
            )}

            {results.length === 0 ? (
              <div
                className={cx(
                  frame,
                  "flex-1 items-center justify-center px-6 py-16 text-center",
                )}
              >
                <p className={emptyTitle}>Nothing matches these filters</p>
                <p className={cx(emptyDescription, "mt-1 max-w-[280px]")}>
                  Widen the price range or clear a facet to see more of the
                  collection.
                </p>
                <button
                  type="button"
                  onClick={() => setFacets(EMPTY)}
                  className={cx(primaryButton, buttonMd, "mt-5")}
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {results.map((p) => {
                  const glaze = GLAZES.find((g) => g.value === p.glaze);
                  return (
                    <li key={p.id}>
                      <article className={cx(frame, "cursor-pointer p-1")}>
                        <div
                          className={cx(controlEdge, cornerSm, "aspect-square")}
                          style={{ backgroundColor: glaze?.hex }}
                        />
                        <div className="px-2 pt-2.5 pb-1.5">
                          <p className={frameTitle}>{p.name}</p>
                          <div className="mt-0.5 flex items-baseline justify-between gap-2">
                            <span className={cx(metaText, "truncate")}>
                              {MAKERS.find((m) => m.value === p.maker)?.label}
                            </span>
                            <span
                              className={cx(
                                typeBodySm,
                                "shrink-0 tabular-nums",
                              )}
                            >
                              {money(p.price)}
                            </span>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
