"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Download04Icon,
  LayoutThreeColumnIcon,
  Search01Icon,
  SearchRemoveIcon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const greyFrame = "bg-rb-subtle";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const rowsRuled = "divide-y divide-rb-line";
const typeHeadingXs = "text-[16px]/[20px] font-[450] tracking-[-0.015em]";
const typeBody = "text-[14px]/[20px] font-normal";
const typeLabel = "text-[14px]/[16px] font-[450]";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const buttonSm =
  "h-7 gap-1.5 rounded-[var(--rb-r-sm,6px)] px-3 text-[14px]/[16px] font-[450]";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const inputBox =
  "relative flex w-full min-w-0 cursor-text items-center rounded-[var(--rb-r-sm,6px)] data-concentric:rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-canvas text-[14px]/[16px] font-[450] text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input focus-within:border-[var(--rb-accent,oklch(20.5%_0_0))] focus-within:ring-3 focus-within:ring-rb-line has-[[aria-invalid=true]]:border-[oklch(60%_0.236_26)] has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-rb-line has-[input:disabled]:text-rb-muted/60 has-[input:disabled]:shadow-none has-[input[readonly]]:cursor-default has-[input[readonly]]:border-transparent has-[input[readonly]]:bg-rb-soft has-[input[readonly]]:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input dark:focus-within:border-[var(--rb-accent,oklch(100%_0_0))] dark:focus-within:ring-rb-line dark:has-[[aria-invalid=true]]:border-[oklch(65.2%_0.219_26)] dark:has-[input:disabled]:border-rb-line dark:has-[input:disabled]:text-rb-muted/60 dark:has-[input[readonly]]:bg-rb-soft";
const fieldSm = "h-7";
const inputControlSm =
  "h-full w-full min-w-0 flex-1 bg-transparent px-2 outline-none [[data-affix]+&]:ps-2 [&:has(+[data-affix])]:pe-2 placeholder:text-rb-muted disabled:cursor-not-allowed disabled:placeholder:text-rb-muted/60 dark:placeholder:text-rb-muted dark:disabled:placeholder:text-rb-muted/60 dark:[color-scheme:dark]";
const inputAffix =
  "flex shrink-0 items-center gap-2 text-[14px]/[16px] text-rb-muted select-none first:ps-3 last:pe-3 has-[button]:first:ps-1 has-[button]:last:pe-1";
const statusWord =
  "inline-flex items-start gap-1.5 text-[14px]/[16px] font-[450] tabular-nums";
const statusWordSm =
  "inline-flex items-start gap-1 text-[13px]/[18px] font-[450] tabular-nums";
const statusIdle = "text-rb-muted";
const statusOk = "text-rb-fg/80";
const statusWarn = "text-[oklch(49%_0.1_68)] dark:text-[oklch(80%_0.13_68)]";
const chip =
  "relative inline-flex h-7 max-w-full min-w-0 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-popover px-2.5 text-[14px]/[16px] font-[450] text-rb-fg select-none shadow-rb-sm transition-[background-color,border-color,color,scale,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 hover:not-disabled:border-rb-input aria-pressed:border-rb-input aria-pressed:bg-rb-soft aria-expanded:border-rb-input disabled:cursor-not-allowed disabled:text-rb-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:not-disabled:border-rb-input dark:aria-pressed:border-rb-input dark:aria-pressed:bg-rb-soft dark:aria-expanded:border-rb-input dark:disabled:text-rb-muted/60";
const truncateFade =
  "block min-w-0 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]";
const frame =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover text-rb-fg";
const itemRow =
  "relative flex min-h-10 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-rb-fg transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] has-[[data-description]]:min-h-14";
const itemMeta =
  "shrink-0 text-[13px]/[18px] tabular-nums text-rb-muted";
const emptyTitle =
  "text-[16px]/[20px] font-[450] tracking-[-0.015em] text-rb-fg";
const emptyDescription =
  "max-w-[48ch] text-[13px]/[18px] text-rb-fg/80";
const menuPopup =
  "min-w-48 max-w-[min(480px,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover p-1 text-rb-fg outline-none shadow-rb-overlay";
const menuItem =
  "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 py-1.5 text-left text-[14px]/[16px] font-[450] text-rb-fg outline-none select-none [&_svg]:shrink-0 [&_svg]:text-rb-fg/80 hover:bg-rb-soft focus-visible:bg-rb-soft data-[highlighted]:bg-rb-soft aria-selected:bg-rb-soft aria-disabled:cursor-not-allowed aria-disabled:text-rb-muted/60 dark:text-rb-fg dark:[&_svg]:text-rb-fg/80 dark:hover:bg-rb-soft dark:focus-visible:bg-rb-soft dark:data-[highlighted]:bg-rb-soft dark:aria-selected:bg-rb-soft dark:aria-disabled:text-rb-muted/60";
const menuItemCheckable = "ps-8";
const menuIndicator =
  "pointer-events-none absolute start-2 flex size-4 items-center justify-center";
const overlayEnter =
  "transition-opacity duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)] starting:opacity-0 motion-reduce:transition-none";
const paginationInfo =
  "text-[13px]/[18px] tabular-nums text-rb-muted";
const table =
  "w-full border-separate border-spacing-0 text-left text-[14px]/[20px]";
const tableHead =
  "h-8 border-b border-rb-line px-3 text-left align-middle text-[12px]/[16px] font-normal tabular-nums whitespace-nowrap text-rb-muted first:ps-4 last:pe-4 dark:border-rb-line";
const tableRow =
  "group transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-aria-selected:bg-rb-soft aria-selected:bg-rb-soft dark:hover:not-aria-selected:bg-rb-soft dark:aria-selected:bg-rb-soft";
const tableCell =
  "h-10 border-b border-rb-line px-3 align-middle whitespace-nowrap text-rb-fg group-last:border-b-0 first:ps-4 last:pe-4 dark:border-rb-line";
const numericCell = "text-right tabular-nums";
const sortButton =
  "-mx-1.5 inline-flex h-7 min-w-0 cursor-pointer items-center gap-1 rounded-[var(--rb-r-sm,6px)] px-1.5 hover:bg-rb-soft hover:text-rb-fg data-sorted:text-rb-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:hover:bg-rb-soft dark:hover:text-rb-fg dark:data-sorted:text-rb-fg";
const fadeStartOnTray =
  "bg-linear-to-r from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] dark:from-rb-popover";
const fadeEndOnTray =
  "bg-linear-to-l from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] dark:from-rb-popover";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";

const gutter = "sm:first:ps-6 sm:last:pe-6";

type Account = {
  name: string;
  owner: string;
  plan: "Enterprise" | "Scale" | "Growth";
  status: "Active" | "Needs review" | "Paused";
  region: "North America" | "EMEA" | "APAC" | "LATAM";
  mrr: number;
  renewalOn: string;
};

const accounts: Account[] = [
  {
    name: "Sable Ridge Energy",
    owner: "Mina Kapoor",
    plan: "Enterprise",
    status: "Needs review",
    region: "EMEA",
    mrr: 18420,
    renewalOn: "2025-08-12",
  },
  {
    name: "North Pier Robotics",
    owner: "Tomasz Nowak",
    plan: "Scale",
    status: "Active",
    region: "North America",
    mrr: 9860,
    renewalOn: "2025-09-03",
  },
  {
    name: "Longleaf Clinical Research Network International",
    owner: "Ari Chen",
    plan: "Enterprise",
    status: "Active",
    region: "APAC",
    mrr: 22190,
    renewalOn: "2025-09-19",
  },
  {
    name: "Cobalt Field Labs",
    owner: "Rhea Flores",
    plan: "Growth",
    status: "Paused",
    region: "North America",
    mrr: 4210,
    renewalOn: "2025-10-01",
  },
  {
    name: "Kite Harbor Logistics",
    owner: "Devon Okafor",
    plan: "Scale",
    status: "Active",
    region: "LATAM",
    mrr: 7540,
    renewalOn: "2025-10-08",
  },
  {
    name: "Mossbank Archive Trust",
    owner: "Lena Ortiz",
    plan: "Growth",
    status: "Needs review",
    region: "EMEA",
    mrr: 3980,
    renewalOn: "2025-10-22",
  },
  {
    name: "Vantage Grid Systems",
    owner: "Priya Rao",
    plan: "Enterprise",
    status: "Active",
    region: "North America",
    mrr: 26740,
    renewalOn: "2025-11-04",
  },
  {
    name: "Harbor & Vale Freight",
    owner: "Marcus Lund",
    plan: "Scale",
    status: "Active",
    region: "EMEA",
    mrr: 11230,
    renewalOn: "2025-11-11",
  },
  {
    name: "Tidewater Instruments",
    owner: "Sofia Martins",
    plan: "Growth",
    status: "Active",
    region: "APAC",
    mrr: 5620,
    renewalOn: "2025-11-18",
  },
  {
    name: "Redwood Payments",
    owner: "Jun Park",
    plan: "Enterprise",
    status: "Needs review",
    region: "North America",
    mrr: 19870,
    renewalOn: "2025-11-29",
  },
];

const columns = ["Owner", "Plan", "Region", "Renewal"] as const;
type Column = (typeof columns)[number];

const statusTone: Record<Account["status"], string> = {
  Active: statusOk,
  "Needs review": statusWarn,
  Paused: statusIdle,
};

function StatusCell({
  status,
  small,
}: {
  status: Account["status"];
  small?: boolean;
}) {
  return (
    <span
      className={cx(
        small ? statusWordSm : statusWord,
        statusTone[status],
        "whitespace-nowrap",
      )}
    >
      {status}
    </span>
  );
}

const currency = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const renewalLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

type SortKey = "name" | "mrr" | "renewalOn";

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  const icon = active
    ? sort.dir === "asc"
      ? ArrowUp01Icon
      : ArrowDown01Icon
    : UnfoldMoreIcon;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      className={cx(
        tableHead,
        gutter,
        align === "right" && "text-right",
        className,
      )}
    >
      <button
        type="button"
        data-sorted={active ? "true" : undefined}
        onClick={() => onSort(sortKey)}
        className={cx(
          sortButton,
          "max-w-full",
          align === "right" && "flex-row-reverse",
        )}
      >
        <span className="truncate">{label}</span>
        <HugeiconsIcon
          icon={icon}
          size={12}
          strokeWidth={1.8}
          aria-hidden="true"
          className="shrink-0"
        />
      </button>
    </th>
  );
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

function useScrollFadeX<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setEdges({
      start: scrollLeft > 1,
      end: Math.ceil(scrollLeft + clientWidth) < scrollWidth - 1,
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

export default function DataTable1() {
  const {
    ref: chipsRef,
    edges: chipsEdges,
    onScroll: onChipsScroll,
  } = useScrollFadeX<HTMLDivElement>();
  const {
    ref: bodyRef,
    edges: bodyEdges,
    onScroll: onBodyScroll,
  } = useScrollFade<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<Account["plan"] | null>(null);
  const [visible, setVisible] = useState<Record<Column, boolean>>({
    Owner: true,
    Plan: true,
    Region: true,
    Renewal: true,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "mrr",
    dir: "desc",
  });
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuShown, setMenuShown] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const raf = requestAnimationFrame(() => setMenuShown(true));
    const doc = triggerRef.current?.ownerDocument;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t))
        return;
      setMenuShown(false);
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setMenuShown(false);
      setMenuOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    doc?.addEventListener("pointerdown", onPointerDown);
    doc?.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      doc?.removeEventListener("pointerdown", onPointerDown);
      doc?.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = (restoreFocus: boolean) => {
    setMenuShown(false);
    setMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = accounts.filter((a) => {
      if (plan && a.plan !== plan) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q)
      );
    });
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "mrr") return (a.mrr - b.mrr) * factor;
      return String(a[sort.key]).localeCompare(String(b[sort.key])) * factor;
    });
  }, [query, plan, sort]);

  const plans: Account["plan"][] = ["Enterprise", "Scale", "Growth"];

  const focusItem = (i: number) =>
    itemRefs.current[(i + columns.length) % columns.length]?.focus({
      preventScroll: true,
    });

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[640px] w-full flex-col overflow-hidden",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header
          className={cx(
            greyFrame,
            "flex h-14 shrink-0 items-center gap-3 px-4 sm:px-6",
          )}
        >
          <h2 className={cx(typeHeadingXs, "min-w-0 flex-1 truncate")}>
            Accounts
          </h2>
          <button
            type="button"
            className={cx(secondaryButton, buttonMd, "max-sm:hidden")}
          >
            <HugeiconsIcon
              icon={Download04Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
              className="shrink-0"
            />
            Export
          </button>
        </header>

        <div
          className={cx(
            greyFrame,
            "flex shrink-0 flex-wrap items-center gap-2 px-4 py-2 sm:h-12 sm:flex-nowrap sm:px-6 sm:py-0",
          )}
        >
          <label className={cx(inputBox, fieldSm, "flex-1 sm:max-w-xs")}>
            <span data-affix className={inputAffix}>
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts"
              className={inputControlSm}
            />
            <span className="sr-only">Search accounts</span>
          </label>

          <div className="relative -mx-4 order-last w-[calc(100%+2rem)] sm:order-none sm:mx-0 sm:w-auto">
            <div
              ref={chipsRef}
              onScroll={onChipsScroll}
              className="flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible sm:px-0"
            >
              <button
                type="button"
                aria-pressed={plan === null}
                onClick={() => setPlan(null)}
                className={chip}
              >
                All plans
              </button>
              {plans.map((p) => {
                const active = plan === p;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPlan(active ? null : p)}
                    className={chip}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <div
              aria-hidden="true"
              className={cx(
                fadeStartOnTray,
                "pointer-events-none absolute inset-y-0 left-0 w-8 sm:hidden",
                chipsEdges.start ? "opacity-100" : "opacity-0",
              )}
            />
            <div
              aria-hidden="true"
              className={cx(
                fadeEndOnTray,
                "pointer-events-none absolute inset-y-0 right-0 w-8 sm:hidden",
                chipsEdges.end ? "opacity-100" : "opacity-0",
              )}
            />
          </div>

          <div
            className="relative ml-auto"
            onKeyDown={(e) => {
              if (!menuOpen) return;
              const active = e.currentTarget.ownerDocument.activeElement;
              const i = itemRefs.current.findIndex((b) => b === active);
              if (e.key === "Tab") closeMenu(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                focusItem(i + 1);
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                focusItem(i < 0 ? columns.length - 1 : i - 1);
              }
              if (e.key === "Home") {
                e.preventDefault();
                focusItem(0);
              }
              if (e.key === "End") {
                e.preventDefault();
                focusItem(columns.length - 1);
              }
            }}
          >
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => {
                if (menuOpen) closeMenu(false);
                else setMenuOpen(true);
              }}
              className={cx(secondaryButton, buttonSm)}
            >
              <HugeiconsIcon
                icon={LayoutThreeColumnIcon}
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
                className="shrink-0"
              />
              <span className="max-sm:sr-only">Columns</span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
                className={cx("shrink-0", menuOpen && "rotate-180")}
              />
            </button>
            {menuOpen && (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Toggle columns"
                className={cx(
                  menuPopup,
                  overlayEnter,
                  "absolute right-0 top-9 z-30 w-48",
                  menuShown ? "opacity-100" : "opacity-0",
                )}
              >
                {columns.map((c, i) => (
                  <button
                    key={c}
                    ref={(n) => {
                      itemRefs.current[i] = n;
                    }}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={visible[c]}
                    onClick={() => setVisible((v) => ({ ...v, [c]: !v[c] }))}
                    className={cx(menuItem, menuItemCheckable)}
                  >
                    <span aria-hidden="true" className={menuIndicator}>
                      {visible[c] && (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          size={16}
                          strokeWidth={1.8}
                        />
                      )}
                    </span>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={bodyRef}
            onScroll={onBodyScroll}
            className="h-full overflow-auto"
          >
            <table className={cx(table, "hidden min-w-[820px] md:table")}>
              <caption className="sr-only">Customer accounts</caption>
              <thead className={cx(canvas, "sticky top-0 z-20")}>
                <tr>
                  <SortHead
                    label="Account"
                    sortKey="name"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  {visible.Owner && (
                    <th scope="col" className={cx(tableHead, gutter)}>
                      Owner
                    </th>
                  )}
                  {visible.Plan && (
                    <th
                      scope="col"
                      className={cx(tableHead, gutter, "w-[110px]")}
                    >
                      Plan
                    </th>
                  )}
                  <th
                    scope="col"
                    className={cx(tableHead, gutter, "w-[140px]")}
                  >
                    Status
                  </th>
                  {visible.Region && (
                    <th
                      scope="col"
                      className={cx(tableHead, gutter, "w-[150px]")}
                    >
                      Region
                    </th>
                  )}
                  <SortHead
                    label="MRR"
                    sortKey="mrr"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="w-[110px]"
                  />
                  {visible.Renewal && (
                    <SortHead
                      label="Renewal"
                      sortKey="renewalOn"
                      sort={sort}
                      onSort={toggleSort}
                      align="right"
                      className="w-[120px]"
                    />
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.name} className={tableRow}>
                    <td className={cx(tableCell, gutter, "max-w-[280px]")}>
                      <span className={cx(typeLabel, truncateFade)}>
                        {a.name}
                      </span>
                    </td>
                    {visible.Owner && (
                      <td className={cx(tableCell, gutter)}>
                        <span className={text2}>{a.owner}</span>
                      </td>
                    )}
                    {visible.Plan && (
                      <td className={cx(tableCell, gutter)}>
                        <span className={text2}>{a.plan}</span>
                      </td>
                    )}
                    <td className={cx(tableCell, gutter)}>
                      <StatusCell status={a.status} />
                    </td>
                    {visible.Region && (
                      <td className={cx(tableCell, gutter)}>
                        <span className={text2}>{a.region}</span>
                      </td>
                    )}
                    <td className={cx(tableCell, numericCell, gutter)}>
                      {currency(a.mrr)}
                    </td>
                    {visible.Renewal && (
                      <td className={cx(tableCell, numericCell, gutter)}>
                        <span className={text2}>
                          {renewalLabel(a.renewalOn)}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-2 p-4 md:hidden">
              {rows.length > 0 && (
                <div className={cx(frame, rowsRuled)}>
                  {rows.map((a) => (
                    <div key={a.name} className={cx(itemRow, "px-4")}>
                      <div className="flex w-full items-center justify-between gap-3">
                        <p className={cx(typeLabel, truncateFade, "flex-1")}>
                          {a.name}
                        </p>
                        <span className={cx(typeBody, numericCell, "shrink-0")}>
                          {currency(a.mrr)}
                        </span>
                      </div>
                      <div className="flex w-full items-center justify-between gap-3">
                        <StatusCell status={a.status} small />
                        <span className={cx(itemMeta, "flex gap-2")}>
                          <span>{a.plan}</span>
                          <span>Renews {renewalLabel(a.renewalOn)}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {rows.length === 0 && (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-16 text-center">
                <span
                  aria-hidden="true"
                  className={cx(
                    text2,
                    "mb-3 flex h-10 w-10 items-center justify-center",
                  )}
                >
                  <HugeiconsIcon
                    icon={SearchRemoveIcon}
                    size={20}
                    strokeWidth={1.8}
                  />
                </span>
                <p className={emptyTitle}>No matching accounts</p>
                <p className={cx(emptyDescription, "mt-1")}>
                  Try a different search, or clear the plan filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPlan(null);
                  }}
                  className={cx(secondaryButton, buttonMd, "mt-4")}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          <div
            aria-hidden="true"
            className={cx(
              fadeBottom,
              "pointer-events-none absolute inset-x-0 bottom-0 h-8",
              bodyEdges.end ? "opacity-100" : "opacity-0",
            )}
          />
        </div>

        <footer
          className={cx(
            greyFrame,
            paginationInfo,
            "flex h-12 shrink-0 items-center px-4 sm:px-6",
          )}
        >
          Showing {rows.length} of {accounts.length} accounts
        </footer>
      </div>
    </div>
  );
}
