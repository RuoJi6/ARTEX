"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tick02Icon,
  UnfoldMoreIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const greyFrame = "bg-rb-subtle";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const rowsRuled = "divide-y divide-rb-line";
const typeHeadingSm = "text-[20px]/[24px] font-[450] tracking-[-0.015em]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeLabel = "text-[14px]/[16px] font-[450]";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const primaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_94%,black))] text-[var(--rb-accent-fg,oklch(100%_0_0))] shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.22),0_2px_5px_-2px_rgb(0_0_0/0.3)] hover:not-disabled:brightness-110 active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] disabled:opacity-40 disabled:shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_94%,black))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.66),0_2px_5px_-2px_rgb(0_0_0/0.9)] dark:active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] dark:disabled:shadow-none";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const buttonLg =
  "h-11 gap-2 rounded-[var(--rb-r-sm,6px)] px-5 text-[16px]/[20px] font-[450] tracking-[-0.01em]";
const inputBox =
  "relative flex w-full min-w-0 cursor-text items-center rounded-[var(--rb-r-sm,6px)] data-concentric:rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-canvas text-[14px]/[16px] font-[450] text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input focus-within:border-[var(--rb-accent,oklch(20.5%_0_0))] focus-within:ring-3 focus-within:ring-rb-line has-[[aria-invalid=true]]:border-[oklch(60%_0.236_26)] has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-rb-line has-[input:disabled]:text-rb-muted/60 has-[input:disabled]:shadow-none has-[input[readonly]]:cursor-default has-[input[readonly]]:border-transparent has-[input[readonly]]:bg-rb-soft has-[input[readonly]]:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input dark:focus-within:border-[var(--rb-accent,oklch(100%_0_0))] dark:focus-within:ring-rb-line dark:has-[[aria-invalid=true]]:border-[oklch(65.2%_0.219_26)] dark:has-[input:disabled]:border-rb-line dark:has-[input:disabled]:text-rb-muted/60 dark:has-[input[readonly]]:bg-rb-soft";
const fieldMd = "h-8";
const inputControl =
  "h-full w-full min-w-0 flex-1 bg-transparent px-3 outline-none [[data-affix]+&]:ps-2 [&:has(+[data-affix])]:pe-2 placeholder:text-rb-muted disabled:cursor-not-allowed disabled:placeholder:text-rb-muted/60 dark:placeholder:text-rb-muted dark:disabled:placeholder:text-rb-muted/60 dark:[color-scheme:dark]";
const fieldLabel =
  "flex w-fit items-center gap-2 text-[14px]/[16px] font-[450] text-rb-fg";
const fieldDescription =
  "max-w-[60ch] text-[13px]/[18px] text-rb-fg/80";
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
const avatar =
  "relative inline-flex size-8 shrink-0 overflow-hidden rounded-full select-none";
const avatarFallback =
  "flex size-full items-center justify-center rounded-[inherit] border border-rb-line bg-rb-popover text-[12px]/[16px] font-[450] tabular-nums text-rb-fg";
const frame =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover text-rb-fg";
const emptyValue = "text-rb-muted";
const menuPopup =
  "min-w-48 max-w-[min(480px,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover p-1 text-rb-fg outline-none shadow-rb-overlay";
const menuItem =
  "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 py-1.5 text-left text-[14px]/[16px] font-[450] text-rb-fg outline-none select-none [&_svg]:shrink-0 [&_svg]:text-rb-fg/80 hover:bg-rb-soft focus-visible:bg-rb-soft data-[highlighted]:bg-rb-soft aria-selected:bg-rb-soft aria-disabled:cursor-not-allowed aria-disabled:text-rb-muted/60 dark:text-rb-fg dark:[&_svg]:text-rb-fg/80 dark:hover:bg-rb-soft dark:focus-visible:bg-rb-soft dark:data-[highlighted]:bg-rb-soft dark:aria-selected:bg-rb-soft dark:aria-disabled:text-rb-muted/60";
const fadeTop =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";

function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setEdges({
      start: scrollTop > 1,
      end: scrollTop + clientHeight < scrollHeight - 1,
    });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const RO = el.ownerDocument.defaultView?.ResizeObserver;
    const ro = RO ? new RO(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [update]);
  return { ref, edges, onScroll: update };
}

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

const ZONES = [
  { value: "lisbon", label: "Lisbon (GMT+0)", short: "Lisbon" },
  { value: "berlin", label: "Berlin (GMT+1)", short: "Berlin" },
  { value: "new-york", label: "New York (GMT−5)", short: "New York" },
  { value: "singapore", label: "Singapore (GMT+8)", short: "Singapore" },
];

export default function Onboarding1() {
  const {
    ref: bodyRef,
    edges: bodyEdges,
    onScroll: onBodyScroll,
  } = useScrollFade<HTMLFormElement>();
  const [name, setName] = useState("Sam Rivera");
  const [title, setTitle] = useState("Product Engineer");
  const [zone, setZone] = useState("berlin");
  const [updates, setUpdates] = useState(true);

  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "-";

  const zoneShort = ZONES.find((z) => z.value === zone)?.short;

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[640px] w-full overflow-hidden",
      )}
    >
      <div className="relative flex min-w-0 flex-1 flex-col lg:max-w-[46%]">
        <form
          ref={bodyRef}
          onScroll={onBodyScroll}
          onSubmit={(e) => e.preventDefault()}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 sm:p-10"
        >
          <h2 className={typeHeadingSm}>Set up your profile</h2>
          <p className={cx(typeBodySm, text3, "mt-1.5")}>
            Add the details teammates will see across the workspace.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <span aria-hidden="true" className={cx(avatar, "size-14")}>
              <span className={avatarFallback}>
                <HugeiconsIcon
                  icon={UserIcon}
                  size={24}
                  strokeWidth={1.8}
                  className={text3}
                />
              </span>
            </span>
            <div className="min-w-0">
              <button type="button" className={cx(secondaryButton, buttonMd)}>
                Upload photo
              </button>
              <p className={cx(fieldDescription, "mt-2")}>
                PNG or JPG, at least 400 × 400 px, up to 10 MB.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="ob1-name" className={fieldLabel}>
                Full name
                <span aria-hidden="true" className={text3}>
                  *
                </span>
              </label>
              <div className={cx(inputBox, fieldMd)}>
                <input
                  id="ob1-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className={inputControl}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="ob1-title" className={fieldLabel}>
                Job title
              </label>
              <div className={cx(inputBox, fieldMd)}>
                <input
                  id="ob1-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What you do"
                  className={inputControl}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="ob1-zone" className={fieldLabel}>
                Timezone
              </label>
              <Select
                id="ob1-zone"
                value={zone}
                onChange={setZone}
                options={ZONES}
                placeholder="Select a timezone"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <span className={checkboxBox}>
                <input
                  type="checkbox"
                  checked={updates}
                  onChange={(e) => setUpdates(e.target.checked)}
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
              <span className={cx(typeBodySm, text2)}>
                Send me product updates and workspace tips.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={name.trim() === ""}
            className={cx(primaryButton, buttonLg, "mt-8 w-full")}
          >
            Continue
          </button>
        </form>
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

      <aside
        className={cx(
          greyFrame,
          "hidden min-w-0 flex-1 items-center justify-center p-10 lg:flex",
        )}
      >
        <div className="w-full max-w-[320px]">
          <p className={cx(typeCaption, text3)}>Directory preview</p>

          <div className={cx(frame, rowsRuled, "mt-2")}>
            <div className="flex items-center gap-3 p-4">
              <span aria-hidden="true" className={cx(avatar, "size-10")}>
                <span className={avatarFallback}>{initials}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx(typeLabel, "truncate")}>
                  {name.trim() || "Your name"}
                </p>
                <p className={cx(typeBodySm, text3, "mt-0.5 truncate")}>
                  {title.trim() || "Job title"}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-1">
              <div className="px-4 py-3">
                <dt className={cx(typeCaption, text3, "truncate")}>Timezone</dt>
                <dd className={cx(typeBodySm, "mt-0.5 truncate")}>
                  {zoneShort ?? <span className={emptyValue}>None</span>}
                </dd>
              </div>
              <div className="px-4 py-3">
                <dt className={cx(typeCaption, text3, "truncate")}>Updates</dt>
                <dd className={cx(typeBodySm, "mt-0.5 truncate")}>
                  {updates ? "Subscribed" : "Off"}
                </dd>
              </div>
            </dl>
          </div>

          <p className={cx(typeBodySm, text3, "mt-3")}>
            This is how teammates will see you. You can change any of it later
            from your account settings.
          </p>
        </div>
      </aside>
    </div>
  );
}
