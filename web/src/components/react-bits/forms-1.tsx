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
  Building03Icon,
  Calendar01Icon,
  Cancel01Icon,
  Clock01Icon,
  FloppyDiskIcon,
  HashtagIcon,
  HelpCircleIcon,
  UndoIcon,
  Tick02Icon,
  UnfoldMoreIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const tileFill = "bg-rb-soft";
const cornerSm = "rounded-[var(--rb-r-sm,6px)]";
const dropEdge =
  "border border-dashed border-rb-input";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const ruleBottom = "border-b border-rb-line";
const ruleTop = "border-t border-rb-line";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeLabelSm = "text-[12px]/[16px] font-[450] tabular-nums";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const primaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_94%,black))] text-[var(--rb-accent-fg,oklch(100%_0_0))] shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.22),0_2px_5px_-2px_rgb(0_0_0/0.3)] hover:not-disabled:brightness-110 active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] disabled:opacity-40 disabled:shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_94%,black))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.66),0_2px_5px_-2px_rgb(0_0_0/0.9)] dark:active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] dark:disabled:shadow-none";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const buttonSm =
  "h-7 gap-1.5 rounded-[var(--rb-r-sm,6px)] px-3 text-[14px]/[16px] font-[450]";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const inputBox =
  "relative flex w-full min-w-0 cursor-text items-center rounded-[var(--rb-r-sm,6px)] data-concentric:rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-canvas text-[14px]/[16px] font-[450] text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input focus-within:border-[var(--rb-accent,oklch(20.5%_0_0))] focus-within:ring-3 focus-within:ring-rb-line has-[[aria-invalid=true]]:border-[oklch(60%_0.236_26)] has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-rb-line has-[input:disabled]:text-rb-muted/60 has-[input:disabled]:shadow-none has-[input[readonly]]:cursor-default has-[input[readonly]]:border-transparent has-[input[readonly]]:bg-rb-soft has-[input[readonly]]:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input dark:focus-within:border-[var(--rb-accent,oklch(100%_0_0))] dark:focus-within:ring-rb-line dark:has-[[aria-invalid=true]]:border-[oklch(65.2%_0.219_26)] dark:has-[input:disabled]:border-rb-line dark:has-[input:disabled]:text-rb-muted/60 dark:has-[input[readonly]]:bg-rb-soft";
const fieldMdGrow = "min-h-8";
const fieldMd = "h-8";
const inputControl =
  "h-full w-full min-w-0 flex-1 bg-transparent px-3 outline-none [[data-affix]+&]:ps-2 [&:has(+[data-affix])]:pe-2 placeholder:text-rb-muted disabled:cursor-not-allowed disabled:placeholder:text-rb-muted/60 dark:placeholder:text-rb-muted dark:disabled:placeholder:text-rb-muted/60 dark:[color-scheme:dark]";
const inputControlSm =
  "h-full w-full min-w-0 flex-1 bg-transparent px-2 outline-none [[data-affix]+&]:ps-2 [&:has(+[data-affix])]:pe-2 placeholder:text-rb-muted disabled:cursor-not-allowed disabled:placeholder:text-rb-muted/60 dark:placeholder:text-rb-muted dark:disabled:placeholder:text-rb-muted/60 dark:[color-scheme:dark]";
const inputAffix =
  "flex shrink-0 items-center gap-2 text-[14px]/[16px] text-rb-muted select-none first:ps-3 last:pe-3 has-[button]:first:ps-1 has-[button]:last:pe-1";
const fieldLabel =
  "flex w-fit items-center gap-2 text-[14px]/[16px] font-[450] text-rb-fg";
const fieldDescription =
  "max-w-[60ch] text-[13px]/[18px] text-rb-fg/80";
const selectTrigger =
  "inline-flex h-8 w-fit min-w-40 cursor-pointer items-center justify-between gap-2 rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-canvas px-3 text-left text-[14px]/[16px] font-[450] whitespace-nowrap text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] outline-none select-none transition-[border-color,box-shadow] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-disabled:not-aria-invalid:border-rb-input focus-visible:border-[var(--rb-accent,oklch(20.5%_0_0))] focus-visible:ring-3 focus-visible:ring-rb-line aria-expanded:border-[var(--rb-accent,oklch(20.5%_0_0))] aria-expanded:ring-3 aria-expanded:ring-rb-line aria-invalid:border-[oklch(60%_0.236_26)] disabled:cursor-not-allowed disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:not-aria-invalid:border-rb-input dark:focus-visible:border-[var(--rb-accent,oklch(100%_0_0))] dark:focus-visible:ring-rb-line dark:aria-expanded:border-[var(--rb-accent,oklch(100%_0_0))] dark:aria-expanded:ring-rb-line dark:aria-invalid:border-[oklch(65.2%_0.219_26)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const selectPlaceholder = "text-rb-muted";
const selectCaret = "shrink-0 text-rb-fg/80";
const switchTrack =
  "group relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-rb-canvas p-0.5 inset-ring inset-ring-rb-fg/50 shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[background-color,box-shadow,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:aria-[checked=false]:not-disabled:inset-ring-rb-fg active:aria-[checked=false]:bg-rb-soft aria-checked:bg-[var(--rb-accent,oklch(20.5%_0_0))] aria-checked:inset-ring-transparent disabled:cursor-not-allowed disabled:inset-ring-rb-fg/40 disabled:shadow-none disabled:aria-checked:bg-rb-fg/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:bg-rb-popover /50 dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:aria-[checked=false]:not-disabled:inset-ring-rb-fg dark:active:aria-[checked=false]:bg-rb-soft dark:aria-checked:bg-[var(--rb-accent,oklch(100%_0_0))] dark:disabled:inset-ring-rb-input dark:disabled:aria-checked:bg-rb-fg/40";
const switchThumb =
  "pointer-events-none block size-4 rounded-full bg-rb-soft0 transition-[translate,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none group-aria-checked:translate-x-4 group-aria-checked:bg-[var(--rb-accent-fg,oklch(100%_0_0))] group-disabled:bg-rb-fg/40 dark:bg-rb-soft0 dark:group-aria-checked:bg-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:group-disabled:bg-rb-fg/40";
const chipXs =
  "relative inline-flex h-6 max-w-full min-w-0 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-popover px-2 text-[12px]/[16px] font-[450] tabular-nums text-rb-fg select-none shadow-rb-sm transition-[background-color,border-color,color,scale,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 hover:not-disabled:border-rb-input aria-pressed:border-rb-input aria-pressed:bg-rb-soft aria-expanded:border-rb-input disabled:cursor-not-allowed disabled:text-rb-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:not-disabled:border-rb-input dark:aria-pressed:border-rb-input dark:aria-pressed:bg-rb-soft dark:aria-expanded:border-rb-input dark:disabled:text-rb-muted/60";
const chipRemoveXs =
  "-me-1 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[var(--rb-r-xs,4px)] text-rb-fg/80 hover:bg-rb-soft hover:text-rb-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:bg-rb-soft dark:hover:text-rb-fg";
const frame =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover text-rb-fg";
const frameTitle =
  "min-w-0 truncate text-[14px]/[16px] font-[450] text-rb-fg";
const frameMeta =
  "shrink-0 text-[14px]/[16px] font-[450] tabular-nums text-rb-muted";
const frameDescription =
  "text-[13px]/[18px] text-rb-fg/80";
const progressTrack =
  "relative block h-1 w-full overflow-hidden bg-rb-soft";
const progressFill =
  "block h-full bg-rb-fg transition-[width] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none dark:bg-rb-fg";
const menuPopup =
  "min-w-48 max-w-[min(480px,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover p-1 text-rb-fg outline-none shadow-rb-overlay";
const menuItem =
  "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 py-1.5 text-left text-[14px]/[16px] font-[450] text-rb-fg outline-none select-none [&_svg]:shrink-0 [&_svg]:text-rb-fg/80 hover:bg-rb-soft focus-visible:bg-rb-soft data-[highlighted]:bg-rb-soft aria-selected:bg-rb-soft aria-disabled:cursor-not-allowed aria-disabled:text-rb-muted/60 dark:text-rb-fg dark:[&_svg]:text-rb-fg/80 dark:hover:bg-rb-soft dark:focus-visible:bg-rb-soft dark:data-[highlighted]:bg-rb-soft dark:aria-selected:bg-rb-soft dark:aria-disabled:text-rb-muted/60";

const dateInput =
  "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0";

type SelectOption = { value: string; label: string; hint?: string };

function Select({
  id,
  value,
  defaultValue,
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
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
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
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });

  const current = value ?? uncontrolled;
  const selectedIndex = options.findIndex((o) => o.value === current);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const openList = () => {
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
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const node = rootRef.current;
    if (!node) return;
    const doc = node.ownerDocument;
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
    if (value === undefined) setUncontrolled(option.value);
    onChange?.(option.value);
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
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cx(selectTrigger, "w-full min-w-[100%]", triggerClassName)}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {leading}
          <span className="grid min-w-0 flex-1 text-left">
            {options.map((o) => (
              <span
                key={o.value}
                aria-hidden="true"
                className="invisible col-start-1 row-start-1 truncate"
              >
                {o.label}
              </span>
            ))}
            <span
              className={cx(
                "col-start-1 row-start-1 truncate",
                !selected && selectPlaceholder,
              )}
            >
              {selected ? selected.label : placeholder}
            </span>
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
            const isSelected = o.value === current;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                data-index={i}
                data-highlighted={i === active ? "" : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(i)}
                className={cx(menuItem, "pe-8")}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate">{o.label}</span>
                  {o.hint && (
                    <span className={cx(typeCaption, text3, "shrink-0")}>
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

const CREWS = [
  "Coastal survey team",
  "Estuary monitoring team",
  "Upland transect team",
];

const VISIBILITY = [
  { value: "internal", label: "Institute only" },
  { value: "partners", label: "Institute and partners" },
  { value: "open", label: "Open data portal" },
];

const SUGGESTED = ["Benthic cores", "Water column", "Sediment traps"];

type FormState = {
  title: string;
  station: string;
  vessel: string;
  deployDate: string;
  recoverDate: string;
  window: string;
  crew: string;
  methods: string[];
  visibility: string;
  embargo: boolean;
  photo: string;
};

const INITIAL: FormState = {
  title: "Halcyon Bank autumn sampling",
  station: "HB-14",
  vessel: "RV Silverling",
  deployDate: "2026-09-14",
  recoverDate: "2026-09-27",
  window: "06:30",
  crew: CREWS[0],
  methods: ["Benthic cores", "Water column"],
  visibility: "partners",
  embargo: true,
  photo: "HB",
};

const isFilled = (s: FormState, key: keyof FormState) => {
  const v = s[key];
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "boolean") return true;
  return v.trim().length > 0;
};

const TRACKED: (keyof FormState)[] = [
  "title",
  "station",
  "vessel",
  "deployDate",
  "recoverDate",
  "window",
  "crew",
  "methods",
  "visibility",
  "photo",
];

function Row({
  label,
  htmlFor,
  hint,
  top,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  top?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-4",
        top ? "sm:items-start" : "sm:items-center",
      )}
    >
      <label htmlFor={htmlFor} className={cx(fieldLabel, top && "sm:pt-2")}>
        {label}
        {hint && (
          <span title={hint} className={cx(text3, "inline-flex cursor-help")}>
            <HugeiconsIcon
              icon={HelpCircleIcon}
              size={14}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span className="sr-only">{hint}</span>
          </span>
        )}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function Forms1() {
  const [state, setState] = useState<FormState>(INITIAL);
  const [draft, setDraft] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const dirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(INITIAL),
    [state],
  );

  const filled = TRACKED.filter((k) => isFilled(state, k)).length;
  const percent = Math.round((filled / TRACKED.length) * 100);

  const addMethod = (value: string) => {
    const name = value.trim();
    if (!name || state.methods.includes(name)) return;
    set("methods", [...state.methods, name]);
    setDraft("");
  };

  const removeMethod = (name: string) =>
    set(
      "methods",
      state.methods.filter((m) => m !== name),
    );

  const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addMethod(draft);
    } else if (e.key === "Backspace" && draft === "" && state.methods.length) {
      e.preventDefault();
      removeMethod(state.methods[state.methods.length - 1]);
    }
  };

  const remaining = SUGGESTED.filter((s) => !state.methods.includes(s));

  return (
    <div
      className={cx(
        canvas,
        text1,
        "flex h-full min-h-[840px] w-full flex-col justify-center-safe overflow-y-auto p-8 sm:p-10",
      )}
    >
      <div className="mx-auto w-full max-w-[760px]">
        <div className={frame}>
          <div
            className={cx(
              ruleBottom,
              "flex items-start justify-between gap-4 px-4 py-3",
            )}
          >
            <div className="min-w-0">
              <h2 className={frameTitle}>Survey deployment</h2>
              <p className={cx(frameDescription, "mt-0.5")}>
                Station, vessel and sampling window for the cruise plan.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="w-16">
                <div className={cx(progressTrack, "h-1.5")}>
                  <div
                    style={{ width: `${percent}%` }}
                    className={progressFill}
                  />
                </div>
              </div>
              <span className={frameMeta}>{percent}%</span>
            </div>
          </div>

          <div className="space-y-4 px-4 py-5">
            <Row label="Survey title" htmlFor="f1-title">
              <div className={cx(inputBox, fieldMd)}>
                <input
                  id="f1-title"
                  value={state.title}
                  onChange={(e) => set("title", e.target.value)}
                  className={inputControl}
                />
              </div>
            </Row>

            <Row
              label="Station code"
              htmlFor="f1-station"
              hint="Grid reference from the standing station register."
            >
              <div className={cx(inputBox, fieldMd)}>
                <span data-affix className={inputAffix}>
                  <HugeiconsIcon
                    icon={HashtagIcon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
                <input
                  id="f1-station"
                  value={state.station}
                  onChange={(e) => set("station", e.target.value)}
                  className={cx(inputControl, "tabular-nums")}
                />
              </div>
            </Row>

            <Row label="Vessel" htmlFor="f1-vessel">
              <div className={cx(inputBox, fieldMd)}>
                <span data-affix className={inputAffix}>
                  <HugeiconsIcon
                    icon={Building03Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
                <input
                  id="f1-vessel"
                  value={state.vessel}
                  onChange={(e) => set("vessel", e.target.value)}
                  className={inputControl}
                />
              </div>
            </Row>

            <Row
              label="Deployment"
              htmlFor="f1-deploy"
              hint="First day gear enters the water."
            >
              <div className={cx(inputBox, fieldMd)}>
                <input
                  id="f1-deploy"
                  type="date"
                  value={state.deployDate}
                  onChange={(e) => set("deployDate", e.target.value)}
                  className={cx(inputControl, dateInput, "tabular-nums")}
                />
                <span data-affix className={inputAffix}>
                  <HugeiconsIcon
                    icon={Calendar01Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Row>

            <Row label="Recovery" htmlFor="f1-recover">
              <div className={cx(inputBox, fieldMd)}>
                <input
                  id="f1-recover"
                  type="date"
                  value={state.recoverDate}
                  onChange={(e) => set("recoverDate", e.target.value)}
                  className={cx(inputControl, dateInput, "tabular-nums")}
                />
                <span data-affix className={inputAffix}>
                  <HugeiconsIcon
                    icon={Calendar01Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Row>

            <Row label="Daily start" htmlFor="f1-window">
              <div className={cx(inputBox, fieldMd)}>
                <span data-affix className={inputAffix}>
                  <HugeiconsIcon
                    icon={Clock01Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
                <input
                  id="f1-window"
                  type="time"
                  value={state.window}
                  onChange={(e) => set("window", e.target.value)}
                  className={cx(inputControl, dateInput, "tabular-nums")}
                />
              </div>
            </Row>

            <Row label="Methods" top>
              <div
                onClick={() =>
                  tagInputRef.current?.focus({ preventScroll: true })
                }
                data-concentric
                className={cx(
                  inputBox,
                  fieldMdGrow,
                  "flex-wrap gap-1 px-1 py-0.5",
                )}
              >
                {state.methods.map((m) => (
                  <span key={m} className={chipXs}>
                    {m}
                    <button
                      type="button"
                      onClick={() => removeMethod(m)}
                      aria-label={`Remove ${m}`}
                      className={chipRemoveXs}
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
                <input
                  ref={tagInputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onTagKeyDown}
                  aria-label="Add a sampling method"
                  placeholder={state.methods.length ? "" : "Add a method"}
                  className={cx(inputControlSm, "min-w-24")}
                />
              </div>
              {remaining.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={cx(typeCaption, text3)}>Suggested</span>
                  {remaining.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addMethod(s)}
                      className={chipXs}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </Row>

            <Row label="Lead crew" htmlFor="f1-crew">
              <Select
                id="f1-crew"
                value={state.crew}
                onChange={(v) => set("crew", v)}
                options={CREWS.map((c) => ({ value: c, label: c }))}
              />
            </Row>

            <Row label="Data release" htmlFor="f1-visibility">
              <Select
                id="f1-visibility"
                value={state.visibility}
                onChange={(v) => set("visibility", v)}
                options={VISIBILITY}
              />
            </Row>
            <Row label="Embargo">
              <div className="flex min-h-8 items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={state.embargo}
                  aria-label="Hold results for twelve months"
                  onClick={() => set("embargo", !state.embargo)}
                  className={switchTrack}
                >
                  <span className={switchThumb} />
                </button>
                <span className={fieldDescription}>
                  Hold results for twelve months
                </span>
              </div>
            </Row>

            <Row label="Station photo">
              <div className="flex flex-wrap items-center gap-2">
                {state.photo ? (
                  <>
                    <span
                      className={cx(
                        tileFill,
                        cornerSm,
                        typeLabelSm,
                        text2,
                        "flex h-10 w-10 shrink-0 items-center justify-center",
                      )}
                    >
                      {state.photo}
                    </span>
                    <button
                      type="button"
                      onClick={() => set("photo", "")}
                      className={cx(secondaryButton, buttonMd)}
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className={cx(
                        dropEdge,
                        cornerSm,
                        text3,
                        "flex h-10 w-10 shrink-0 items-center justify-center",
                      )}
                    >
                      <HugeiconsIcon
                        icon={Upload04Icon}
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => set("photo", "HB")}
                      className={cx(secondaryButton, buttonMd)}
                    >
                      <HugeiconsIcon
                        icon={Upload04Icon}
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      Attach photo
                    </button>
                  </>
                )}
              </div>
            </Row>
          </div>

          <div
            className={cx(
              ruleTop,
              "flex flex-col-reverse items-stretch gap-2 px-4 py-3 sm:min-h-11 sm:flex-row sm:items-center sm:justify-between sm:py-2 sm:pe-2",
            )}
          >
            <p className={cx(typeBodySm, text3)}>
              {dirty
                ? "Unsaved changes to the cruise plan."
                : "Cruise plan matches the filed version."}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={!dirty}
                onClick={() => {
                  setState(INITIAL);
                  setDraft("");
                }}
                className={cx(secondaryButton, buttonSm)}
              >
                <HugeiconsIcon
                  icon={UndoIcon}
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                Revert
              </button>
              <button
                type="button"
                disabled={!dirty}
                className={cx(primaryButton, buttonSm)}
              >
                <HugeiconsIcon
                  icon={dirty ? FloppyDiskIcon : Tick02Icon}
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                {dirty ? "Save plan" : "Saved"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
