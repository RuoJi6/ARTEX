"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const ruleBottom = "border-b border-rb-line";
const rowsRuled = "divide-y divide-rb-line";
const typeHeadingSm = "text-[20px]/[24px] font-[450] tracking-[-0.015em]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const typeCodeSm = "font-mono text-[12px]/[16px] tabular-nums";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const ghostButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg hover:not-disabled:bg-rb-soft active:bg-rb-soft aria-pressed:bg-rb-soft disabled:text-rb-muted/60 dark:text-rb-fg dark:hover:not-disabled:bg-rb-soft dark:active:bg-rb-soft dark:aria-pressed:bg-rb-soft dark:disabled:text-rb-muted/60";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const iconButtonSm = "size-7 rounded-[var(--rb-r-sm,6px)]";
const frame =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover text-rb-fg";
const frameTitle =
  "min-w-0 truncate text-[14px]/[16px] font-[450] text-rb-fg";
const itemRow =
  "relative flex min-h-10 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-rb-fg transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] has-[[data-description]]:min-h-14";
const statGroup =
  "@container rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover";
const statGrid =
  "grid grid-cols-2 overflow-hidden [&>:last-child:nth-child(odd)]:col-span-full *:-mt-px *:-ml-px *:border-t *:border-l *:border-rb-line @md:grid-flow-col @md:grid-cols-none @md:auto-cols-fr @md:[&>:last-child:nth-child(odd)]:col-auto dark:*:border-rb-line";
const statCell = "flex min-w-0 flex-col gap-2 px-4 py-3";
const statLabel =
  "text-[14px]/[16px] font-[450] text-rb-fg/80";
const statValue =
  "flex min-w-0 flex-wrap items-baseline gap-x-1 text-[32px]/[36px] font-[450] tabular-nums text-rb-fg";
const statDelta =
  "inline-flex min-w-0 flex-wrap items-baseline gap-x-1 text-[12px]/[16px] font-[450] tabular-nums [&>svg]:self-center text-rb-fg/80";
const emptyTitle =
  "text-[16px]/[20px] font-[450] tracking-[-0.015em] text-rb-fg";
const emptyDescription =
  "max-w-[48ch] text-[13px]/[18px] text-rb-fg/80";
const skeleton =
  "rounded-[var(--rb-r-sm,6px)] bg-rb-soft";
const progressTrack =
  "relative block h-1 w-full overflow-hidden bg-rb-soft";
const progressFill =
  "block h-full bg-rb-fg transition-[width] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none dark:bg-rb-fg";
const menuPopup =
  "min-w-48 max-w-[min(480px,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover p-1 text-rb-fg outline-none shadow-rb-overlay";
const menuItem =
  "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 py-1.5 text-left text-[14px]/[16px] font-[450] text-rb-fg outline-none select-none [&_svg]:shrink-0 [&_svg]:text-rb-fg/80 hover:bg-rb-soft focus-visible:bg-rb-soft data-[highlighted]:bg-rb-soft aria-selected:bg-rb-soft aria-disabled:cursor-not-allowed aria-disabled:text-rb-muted/60 dark:text-rb-fg dark:[&_svg]:text-rb-fg/80 dark:hover:bg-rb-soft dark:focus-visible:bg-rb-soft dark:data-[highlighted]:bg-rb-soft dark:aria-selected:bg-rb-soft dark:aria-disabled:text-rb-muted/60";
const overlayEnter =
  "transition-opacity duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)] starting:opacity-0 motion-reduce:transition-none";
const chartInk = "stroke-rb-fg";
const chartBar = "fill-rb-fg";
const fadeTop =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";

const TILES = [
  {
    label: "Active users",
    value: "8,472",
    delta: "+3.2%",
    positive: true,
    spark: [40, 44, 42, 48, 52, 50, 58, 62],
  },
  {
    label: "Sessions",
    value: "21,908",
    delta: "+5.1%",
    positive: true,
    spark: [60, 62, 66, 64, 70, 74, 78, 83],
  },
  {
    label: "Avg. session",
    value: "4m 12s",
    delta: "−1.4%",
    positive: false,
    spark: [55, 54, 56, 52, 51, 50, 49, 47],
  },
  {
    label: "Bounce rate",
    value: "38.6%",
    delta: "+0.9 pp",
    positive: false,
    spark: [30, 31, 33, 32, 34, 35, 37, 39],
  },
];

const SESSIONS = [
  520, 486, 543, 610, 588, 640, 705, 672, 718, 690, 748, 760, 795, 812,
];

const PAGES = [
  { path: "/", views: "48,210" },
  { path: "/pricing", views: "22,984" },
  { path: "/docs/quickstart", views: "18,663" },
  { path: "/changelog", views: "9,120" },
  { path: "/blog/series-b", views: "6,845" },
];

const DEVICES = [
  { label: "Desktop", pct: 62 },
  { label: "Mobile", pct: 31 },
  { label: "Tablet", pct: 7 },
];

const FUNNEL = [
  { label: "Visited", value: "21,908" },
  { label: "Signed up", value: "3,914" },
  { label: "Activated", value: "2,180" },
  { label: "Subscribed", value: "1,024" },
];

const REFRESH_MS = 900;

const isDown = (delta: string) => /^[−-]/.test(delta);

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 92 - ((v - min) / span) * 84;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      className="hidden h-8 w-16 shrink-0 @min-[13rem]:block"
    >
      <polyline
        points={points}
        fill="none"
        vectorEffect="non-scaling-stroke"
        className={chartInk}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Bar({ className }: { className: string }) {
  return <span className={cx(skeleton, "block h-3", className)} />;
}

function WidgetMenu({
  title,
  onRefresh,
  onHide,
}: {
  title: string;
  onRefresh: () => void;
  onHide: () => void;
}) {
  const items = [
    { label: "Refresh data", run: onRefresh },
    { label: "Hide widget", run: onHide },
  ];
  const [open, setOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const doc = rootRef.current?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    doc.addEventListener("pointerdown", onPointerDown);
    return () => doc.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.focus({ preventScroll: true });
  }, [open]);

  const openMenu = (index: number, withTransition: boolean) => {
    setActive(index);
    setAnimate(withTransition);
    setOpen(true);
  };

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const choose = (index: number) => {
    close();
    items[index].run();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(0, false);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(items.length - 1, false);
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
        setActive((i) => (i + 1) % items.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(items.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${title} options`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu(0, true))}
        onKeyDown={onTriggerKeyDown}
        className={cx(ghostButton, iconButtonSm)}
      >
        <HugeiconsIcon
          icon={MoreHorizontalIcon}
          size={16}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${title} options`}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className={cx(
            menuPopup,
            animate && overlayEnter,
            "absolute right-0 top-full z-30 mt-1.5 w-[160px] min-w-[160px]",
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-highlighted={index === active ? "" : undefined}
              onClick={() => choose(index)}
              onPointerMove={() => setActive(index)}
              className={menuItem}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Widget({
  id,
  title,
  className,
  refreshing,
  skeleton,
  onRefresh,
  onHide,
  children,
}: {
  id: string;
  title: string;
  className?: string;
  refreshing: boolean;
  skeleton: ReactNode;
  onRefresh: (id: string) => void;
  onHide: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <section className={cx(frame, "p-4", className)} aria-busy={refreshing}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={frameTitle}>{title}</h2>
        <WidgetMenu
          title={title}
          onRefresh={() => onRefresh(id)}
          onHide={() => onHide(id)}
        />
      </div>
      {refreshing ? <div aria-hidden>{skeleton}</div> : children}
    </section>
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

export default function Dashboard3() {
  const {
    ref: bodyRef,
    edges: bodyEdges,
    onScroll: onBodyScroll,
  } = useScrollFade<HTMLDivElement>();
  const [hidden, setHidden] = useState<string[]>([]);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const maxSession = Math.max(...SESSIONS);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const refresh = (id: string) => {
    window.clearTimeout(timerRef.current);
    setRefreshingId(id);
    timerRef.current = window.setTimeout(
      () => setRefreshingId(null),
      REFRESH_MS,
    );
  };

  const hide = (id: string) => setHidden((prev) => [...prev, id]);

  const widget = (id: string) => ({
    id,
    refreshing: refreshingId === id,
    onRefresh: refresh,
    onHide: hide,
  });

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[720px] w-full flex-col overflow-hidden",
      )}
    >
      <header
        className={cx(
          ruleBottom,
          "flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:px-6",
        )}
      >
        <h1 className={cx(typeHeadingSm, text1, "truncate")}>Web analytics</h1>
        {hidden.length > 0 ? (
          <button
            type="button"
            onClick={() => setHidden([])}
            className={cx(secondaryButton, buttonMd)}
          >
            Show {hidden.length} hidden
          </button>
        ) : (
          <span className={cx(typeBodySm, text3, "shrink-0")}>
            Updated 2 min ago
          </span>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={bodyRef}
          onScroll={onBodyScroll}
          className="h-full overflow-y-auto p-4 sm:p-6"
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className={cx(statGroup, "col-span-full")}>
              <div className={statGrid}>
                {TILES.map((t) => {
                  const down = isDown(t.delta);
                  return (
                    <div key={t.label} className={cx(statCell, "@container")}>
                      <p className={cx(statLabel, "text-pretty")}>{t.label}</p>
                      <div className="mt-auto flex items-end justify-between gap-3">
                        <p className={cx(statValue, "truncate")}>{t.value}</p>
                        <Sparkline values={t.spark} />
                      </div>
                      <p className={cx(statDelta, "truncate")}>
                        <HugeiconsIcon
                          icon={
                            down ? ArrowDownRight01Icon : ArrowUpRight01Icon
                          }
                          size={12}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        <span className="sr-only">{down ? "Down" : "Up"}</span>
                        {t.delta}
                        <span className={text3}>vs. last week</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {!hidden.includes("sessions") && (
              <Widget
                {...widget("sessions")}
                title="Sessions, last 14 days"
                className="col-span-2 flex flex-col"
                skeleton={
                  <>
                    <div className={cx(skeleton, "mt-4 h-40")} />
                    <div className="mt-2 flex justify-between">
                      <Bar className="w-10" />
                      <Bar className="w-10" />
                    </div>
                  </>
                }
              >
                <div className="mt-4 flex h-40 items-end gap-1.5">
                  {SESSIONS.map((v, i) => (
                    <svg
                      key={i}
                      aria-hidden="true"
                      className="block min-w-0 flex-1"
                      style={{ height: `${(v / maxSession) * 100}%` }}
                    >
                      <rect width="100%" height="100%" className={chartBar} />
                    </svg>
                  ))}
                </div>
                <div
                  className={cx(
                    typeCaption,
                    text3,
                    "mt-2 flex justify-between",
                  )}
                >
                  <span>Mar 1</span>
                  <span>Mar 14</span>
                </div>
              </Widget>
            )}

            {!hidden.includes("pages") && (
              <Widget
                {...widget("pages")}
                title="Top pages"
                className="col-span-2"
                skeleton={
                  <div className="mt-3 flex flex-col gap-1.5">
                    {PAGES.map((p) => (
                      <div key={p.path} className={cx(skeleton, "h-9")} />
                    ))}
                  </div>
                }
              >
                <ul className={cx(rowsRuled, "mt-3 flex flex-col")}>
                  {PAGES.map((p) => (
                    <li
                      key={p.path}
                      className={cx(itemRow, "min-h-[36px] justify-between")}
                    >
                      <span
                        className={cx(
                          typeCodeSm,
                          text2,
                          "min-w-0 flex-1 truncate",
                        )}
                      >
                        {p.path}
                      </span>
                      <span
                        className={cx(
                          typeBodySm,
                          text1,
                          "shrink-0 tabular-nums",
                        )}
                      >
                        {p.views}
                      </span>
                    </li>
                  ))}
                </ul>
              </Widget>
            )}

            {!hidden.includes("devices") && (
              <Widget
                {...widget("devices")}
                title="Devices"
                className="col-span-2"
                skeleton={
                  <div className="mt-3 space-y-3">
                    {DEVICES.map((d) => (
                      <div key={d.label}>
                        <div className="flex items-center justify-between">
                          <Bar className="w-16" />
                          <Bar className="w-8" />
                        </div>
                        <div className={cx(skeleton, "mt-1.5 h-1.5")} />
                      </div>
                    ))}
                  </div>
                }
              >
                <ul className="mt-3 space-y-3">
                  {DEVICES.map((d) => (
                    <li key={d.label}>
                      <div
                        className={cx(
                          typeBodySm,
                          "flex items-center justify-between",
                        )}
                      >
                        <span className={text2}>{d.label}</span>
                        <span className={cx(text1, "tabular-nums")}>
                          {d.pct}%
                        </span>
                      </div>
                      <div className={cx(progressTrack, "mt-1.5 h-1.5")}>
                        <div
                          className={progressFill}
                          style={{ width: `${d.pct}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Widget>
            )}

            {!hidden.includes("funnel") && (
              <Widget
                {...widget("funnel")}
                title="Signup funnel"
                className="col-span-2"
                skeleton={
                  <div className="mt-3 space-y-3">
                    {FUNNEL.map((f) => (
                      <div
                        key={f.label}
                        className="flex items-center justify-between"
                      >
                        <Bar className="w-24" />
                        <Bar className="w-14" />
                      </div>
                    ))}
                  </div>
                }
              >
                <ul className="mt-3 space-y-3">
                  {FUNNEL.map((f, i) => (
                    <li
                      key={f.label}
                      className="flex items-center justify-between gap-3"
                    >
                      <span
                        className={cx(
                          typeBodySm,
                          text2,
                          "inline-flex items-center gap-2",
                        )}
                      >
                        <span className={cx(text3, "w-4 tabular-nums")}>
                          {i + 1}
                        </span>
                        {f.label}
                      </span>
                      <span className={cx(typeBodySm, text1, "tabular-nums")}>
                        {f.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </Widget>
            )}

            {hidden.length === 4 && (
              <div className="col-span-full flex flex-col items-center justify-center px-6 py-12 text-center">
                <p className={emptyTitle}>All widgets hidden</p>
                <p className={cx(emptyDescription, "mt-1 max-w-xs")}>
                  Restore them from the button in the header to see traffic,
                  pages, devices and funnel again.
                </p>
              </div>
            )}
          </div>
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
  );
}
