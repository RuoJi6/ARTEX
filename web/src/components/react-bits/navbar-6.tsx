"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  BellIcon,
  Cancel01Icon,
  CommandIcon,
  HelpCircleIcon,
  Logout03Icon,
  Search01Icon,
  Settings01Icon,
  SquareIcon,
  Tick02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const EASE: [number, number, number, number] = [0.2, 0, 0, 1];

const overlayFade = (reduce: boolean | null) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.12, ease: EASE } },
  transition: { duration: reduce ? 0 : 0.16, ease: EASE },
});

const canvas = "bg-rb-canvas";
const cornerSm = "rounded-[var(--rb-r-sm,6px)]";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const typeHeadingXs = "text-[16px]/[20px] font-[450] tracking-[-0.015em]";
const typeLabel = "text-[14px]/[16px] font-[450]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const topBar =
  "border-b border-rb-line bg-rb-canvas dark:border-rb-line dark:bg-rb-popover";
const ruleTop = "border-t border-rb-line";
const rowsRuled = "divide-y divide-rb-line";
const overlayShadow =
  "shadow-rb-overlay";
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";
const focusRingInset =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";
const primaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_94%,black))] text-[var(--rb-accent-fg,oklch(100%_0_0))] shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.22),0_2px_5px_-2px_rgb(0_0_0/0.3)] hover:not-disabled:brightness-110 active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] disabled:opacity-40 disabled:shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_94%,black))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.66),0_2px_5px_-2px_rgb(0_0_0/0.9)] dark:active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] dark:disabled:shadow-none";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const ghostButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg hover:not-disabled:bg-rb-soft active:bg-rb-soft aria-pressed:bg-rb-soft disabled:text-rb-muted/60 dark:text-rb-fg dark:hover:not-disabled:bg-rb-soft dark:active:bg-rb-soft dark:aria-pressed:bg-rb-soft dark:disabled:text-rb-muted/60";
const buttonXs =
  "h-6 gap-1 rounded-[var(--rb-r-sm,6px)] px-2 text-[12px]/[16px] font-[450] tabular-nums";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const iconButtonMd = "size-8 rounded-[var(--rb-r-sm,6px)]";
const inputBox =
  "relative flex w-full min-w-0 cursor-text items-center rounded-[var(--rb-r-sm,6px)] data-concentric:rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-canvas text-[14px]/[16px] font-[450] text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input focus-within:border-[var(--rb-accent,oklch(20.5%_0_0))] focus-within:ring-3 focus-within:ring-rb-line has-[[aria-invalid=true]]:border-[oklch(60%_0.236_26)] has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-rb-line has-[input:disabled]:text-rb-muted/60 has-[input:disabled]:shadow-none has-[input[readonly]]:cursor-default has-[input[readonly]]:border-transparent has-[input[readonly]]:bg-rb-soft has-[input[readonly]]:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-focus-within:not-has-[[aria-invalid=true]]:not-has-[input:disabled]:border-rb-input dark:focus-within:border-[var(--rb-accent,oklch(100%_0_0))] dark:focus-within:ring-rb-line dark:has-[[aria-invalid=true]]:border-[oklch(65.2%_0.219_26)] dark:has-[input:disabled]:border-rb-line dark:has-[input:disabled]:text-rb-muted/60 dark:has-[input[readonly]]:bg-rb-soft";
const fieldMd = "h-8";
const inputControl =
  "h-full w-full min-w-0 flex-1 bg-transparent px-3 outline-none [[data-affix]+&]:ps-2 [&:has(+[data-affix])]:pe-2 placeholder:text-rb-muted disabled:cursor-not-allowed disabled:placeholder:text-rb-muted/60 dark:placeholder:text-rb-muted dark:disabled:placeholder:text-rb-muted/60 dark:[color-scheme:dark]";
const inputAffix =
  "flex shrink-0 items-center gap-2 text-[14px]/[16px] text-rb-muted select-none first:ps-3 last:pe-3 has-[button]:first:ps-1 has-[button]:last:pe-1";
const kbd =
  "inline-flex min-h-5 min-w-5 w-fit items-center justify-center gap-1 rounded-[var(--rb-r-xs,4px)] border border-rb-line bg-rb-popover px-1 font-mono text-[12px]/[16px] tabular-nums text-rb-fg/80 select-none";
const badge =
  "inline-flex h-5 min-w-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-[var(--rb-r-xs,4px)] px-1.5 text-[12px]/[16px] font-[450] tabular-nums";
const badgeOutline =
  "border border-rb-line bg-rb-popover text-rb-fg";
const avatar =
  "relative inline-flex size-8 shrink-0 overflow-hidden rounded-full select-none";
const avatarFallback =
  "flex size-full items-center justify-center rounded-[inherit] border border-rb-line bg-rb-popover text-[12px]/[16px] font-[450] tabular-nums text-rb-fg";
const brandMark =
  "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--rb-r-sm,6px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] text-[var(--rb-accent-fg,oklch(100%_0_0))] select-none dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]";
const menuPopup =
  "min-w-48 max-w-[min(480px,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover p-1 text-rb-fg outline-none shadow-rb-overlay";
const menuItem =
  "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 py-1.5 text-left text-[14px]/[16px] font-[450] text-rb-fg outline-none select-none [&_svg]:shrink-0 [&_svg]:text-rb-fg/80 hover:bg-rb-soft focus-visible:bg-rb-soft data-[highlighted]:bg-rb-soft aria-selected:bg-rb-soft aria-disabled:cursor-not-allowed aria-disabled:text-rb-muted/60 dark:text-rb-fg dark:[&_svg]:text-rb-fg/80 dark:hover:bg-rb-soft dark:focus-visible:bg-rb-soft dark:data-[highlighted]:bg-rb-soft dark:aria-selected:bg-rb-soft dark:aria-disabled:text-rb-muted/60";
const menuLabel =
  "px-2 pt-2 pb-1 text-[12px]/[16px] font-normal tabular-nums text-rb-muted";
const menuSeparator = "-mx-1 my-1 h-px bg-rb-soft";
const emptyDescription =
  "max-w-[48ch] text-[13px]/[18px] text-rb-fg/80";
const frame =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover text-rb-fg";
const frameHead =
  "flex min-h-10 min-w-0 shrink-0 items-center gap-2 border-b border-rb-line px-4 has-[button]:pe-2 dark:border-rb-line";
const frameTitle =
  "min-w-0 truncate text-[14px]/[16px] font-[450] text-rb-fg";
const itemRow =
  "relative flex min-h-10 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-rb-fg transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] has-[[data-description]]:min-h-14";
const itemRowSm =
  "relative flex min-h-8 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-left text-rb-fg transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]";
const itemRowInteractive =
  "cursor-pointer hover:bg-rb-soft active:bg-rb-soft";
const itemMeta =
  "shrink-0 text-[13px]/[18px] tabular-nums text-rb-muted";

const fadeTopOnPaper =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] dark:from-rb-popover";
const fadeBottomOnPaper =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] dark:from-rb-popover";

const dropdownFrame = cx(frame, overlayShadow);
const countBadge = cx(
  badge,
  badgeOutline,
  "pointer-events-none absolute -top-0.5 -right-0.5 h-[16px] min-w-[16px] px-[4px]",
);

const NOTICES = [
  {
    id: "n1",
    who: "Nadia V.",
    text: "requested review on Billing retry policy",
    at: "4m",
  },
  {
    id: "n2",
    who: "Deploy bot",
    text: "shipped web-app 24.6.1 to production",
    at: "26m",
  },
  {
    id: "n3",
    who: "Marcus S.",
    text: "left three comments on Checkout copy",
    at: "1h",
  },
  {
    id: "n4",
    who: "Harbor Coffee",
    text: "upgraded to the Scale plan",
    at: "3h",
  },
];

const RESULTS = [
  "Billing retry policy",
  "Checkout drop-off study",
  "Q3 pricing experiment",
  "Webhook signing keys",
];

function useScrollFade<T extends HTMLElement>(open: boolean) {
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
    if (!open) return;
    update();
    const el = ref.current;
    const view = el?.ownerDocument.defaultView;
    if (!el || !view?.ResizeObserver) return;
    const observer = new view.ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, update]);
  return { ref, edges, onScroll: update };
}

export default function Navbar6() {
  const reduce = useReducedMotion();
  const [menu, setMenu] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [read, setRead] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    ref: listRef,
    edges: listEdges,
    onScroll: onListScroll,
  } = useScrollFade<HTMLUListElement>(menu === "bell");

  useEffect(() => {
    if (!menu) return;
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.("[data-menu-root]")) setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    doc.addEventListener("pointerdown", onPointerDown);
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      doc.removeEventListener("pointerdown", onPointerDown);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const open = (id: string) => {
    setMenu((m) => (m === id ? null : id));
  };

  const unread = NOTICES.filter((n) => !read.includes(n.id));
  const matches = RESULTS.filter((r) =>
    r.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div
      ref={rootRef}
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[480px] w-full flex-col overflow-hidden",
      )}
    >
      <header
        className={cx(
          topBar,
          "relative z-20 flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4",
        )}
      >
        <a
          href="#"
          className={cx(focusRing, "inline-flex shrink-0 items-center gap-2")}
        >
          <span aria-hidden="true" className={cx(brandMark, "size-7")}>
            <HugeiconsIcon icon={SquareIcon} size={14} strokeWidth={1.8} />
          </span>
          <span className={cx(typeLabel, "hidden sm:block")}>Northwind</span>
        </a>

        <div
          className={cx(
            "relative mx-auto w-full max-w-[420px]",
            searchOpen ? "block" : "hidden sm:block",
          )}
          data-menu-root
        >
          <label htmlFor="navbar-6-search" className="sr-only">
            Search Northwind
          </label>
          <div className={cx(inputBox, fieldMd)}>
            <span data-affix className={inputAffix}>
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>
            <input
              id="navbar-6-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                setMenu("search");
              }}
              placeholder="Search projects, docs and people…"
              className={inputControl}
            />
            <span data-affix className={cx(inputAffix, "max-md:hidden")}>
              <kbd className={kbd}>
                <HugeiconsIcon
                  icon={CommandIcon}
                  size={12}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                K
              </kbd>
            </span>
          </div>

          <AnimatePresence>
            {menu === "search" && (
              <motion.div
                {...overlayFade(reduce)}
                className={cx(
                  menuPopup,
                  "absolute top-full right-0 left-0 z-30 mt-1.5 origin-top",
                )}
              >
                <p className={menuLabel}>{query ? "Results" : "Recent"}</p>
                {matches.length === 0 ? (
                  <p
                    className={cx(emptyDescription, "px-2.5 py-3 text-center")}
                  >
                    Nothing matches “{query}”.
                  </p>
                ) : (
                  matches.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setQuery(r);
                        setMenu(null);
                      }}
                      className={menuItem}
                    >
                      <HugeiconsIcon
                        icon={Search01Icon}
                        size={14}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{r}</span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={searchOpen ? "Close search" : "Open search"}
            onClick={() => setSearchOpen((s) => !s)}
            className={cx(ghostButton, iconButtonMd, "sm:hidden")}
          >
            <HugeiconsIcon
              icon={searchOpen ? Cancel01Icon : Search01Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            className={cx(primaryButton, buttonMd, "max-sm:hidden")}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            New
          </button>

          <button
            type="button"
            aria-label="Help"
            className={cx(ghostButton, iconButtonMd, "max-md:hidden")}
          >
            <HugeiconsIcon
              icon={HelpCircleIcon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>

          <div className="relative" data-menu-root>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menu === "bell"}
              aria-label={`Notifications, ${unread.length} unread`}
              onClick={() => open("bell")}
              className={cx(ghostButton, iconButtonMd)}
            >
              <HugeiconsIcon
                icon={BellIcon}
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              {unread.length > 0 && (
                <span aria-hidden="true" className={countBadge}>
                  {unread.length}
                </span>
              )}
            </button>
            <AnimatePresence>
              {menu === "bell" && (
                <motion.div
                  {...overlayFade(reduce)}
                  className="absolute top-full right-0 z-30 mt-1.5 w-[300px] origin-top-right"
                >
                  <div className={dropdownFrame}>
                    <div className={cx(frameHead, "justify-between")}>
                      <p className={frameTitle}>Notifications</p>
                      <button
                        type="button"
                        onClick={() => setRead(NOTICES.map((n) => n.id))}
                        className={cx(secondaryButton, buttonXs)}
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="relative">
                      <ul
                        ref={listRef}
                        onScroll={onListScroll}
                        className={cx(
                          rowsRuled,
                          "max-h-[240px] overflow-y-auto py-1",
                        )}
                      >
                        {NOTICES.map((n) => {
                          const isRead = read.includes(n.id);
                          return (
                            <li key={n.id} className="px-2 py-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setRead((r) =>
                                    r.includes(n.id) ? r : [...r, n.id],
                                  )
                                }
                                className={cx(
                                  itemRowSm,
                                  itemRowInteractive,
                                  cornerSm,
                                  focusRingInset,
                                  "px-2",
                                )}
                              >
                                <span className="min-w-0 flex-1">
                                  <span
                                    className={cx(
                                      typeBodySm,
                                      isRead ? text3 : text2,
                                      "block",
                                    )}
                                  >
                                    {!isRead && (
                                      <span className="sr-only">Unread: </span>
                                    )}
                                    <span className={cx(!isRead && text1)}>
                                      {n.who}
                                    </span>{" "}
                                    {n.text}
                                  </span>
                                  <span
                                    className={cx(
                                      typeCaption,
                                      text3,
                                      "mt-0.5 block",
                                    )}
                                  >
                                    {n.at} ago
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <div
                        aria-hidden="true"
                        className={cx(
                          fadeTopOnPaper,
                          "pointer-events-none absolute inset-x-0 top-0 h-8",
                          listEdges.start ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div
                        aria-hidden="true"
                        className={cx(
                          fadeBottomOnPaper,
                          "pointer-events-none absolute inset-x-0 bottom-0 h-8",
                          listEdges.end ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </div>
                    {unread.length === 0 && (
                      <p
                        className={cx(
                          ruleTop,
                          typeBodySm,
                          text3,
                          "flex items-center justify-center gap-1.5 px-3 py-2",
                        )}
                      >
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          size={14}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        You are all caught up
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative" data-menu-root>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menu === "account"}
              aria-label="Account menu"
              onClick={() => open("account")}
              className={cx(avatar, focusRing, "cursor-pointer")}
            >
              <span className={avatarFallback}>EM</span>
            </button>
            <AnimatePresence>
              {menu === "account" && (
                <motion.div
                  {...overlayFade(reduce)}
                  role="menu"
                  className={cx(
                    menuPopup,
                    "absolute top-full right-0 z-30 mt-1.5 w-[210px] origin-top-right",
                  )}
                >
                  <div className="px-2 py-2">
                    <p className={cx(typeLabel, "truncate")}>Elena Marsh</p>
                    <p className={cx(typeCaption, text3, "truncate")}>
                      Workspace admin
                    </p>
                  </div>
                  <div className={menuSeparator} />
                  <button type="button" role="menuitem" className={menuItem}>
                    <HugeiconsIcon
                      icon={UserIcon}
                      size={14}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    Profile
                  </button>
                  <button type="button" role="menuitem" className={menuItem}>
                    <HugeiconsIcon
                      icon={Settings01Icon}
                      size={14}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    Preferences
                  </button>
                  <button type="button" role="menuitem" className={menuItem}>
                    <HugeiconsIcon
                      icon={Logout03Icon}
                      size={14}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <h2 className={typeHeadingXs}>Today</h2>
        <ul className={cx(frame, rowsRuled, "mt-3")}>
          {NOTICES.map((n) => (
            <li key={n.id} className={cx(itemRow, "justify-between px-4")}>
              <span
                className={cx(typeBodySm, text2, "min-w-0 flex-1 truncate")}
              >
                <span className={text1}>{n.who}</span> {n.text}
              </span>
              <span className={itemMeta}>{n.at} ago</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
