"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { area, curveMonotoneX, line } from "d3-shape";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  MoreHorizontalIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const insetBody = "bg-rb-canvas";
const tileFill = "bg-rb-soft";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const rowsRuled = "divide-y divide-rb-line";
const typeHeadingXs = "text-[16px]/[20px] font-[450] tracking-[-0.015em]";
const typeLabel = "text-[14px]/[16px] font-[450]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";
const panel =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-subtle text-rb-fg dark:bg-rb-popover";
const panelBody =
  "mx-1 mb-1 flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-canvas [&:has(+*)]:mb-0 dark:border-rb-line dark:bg-rb-canvas";
const segmentedTrack =
  "inline-flex w-fit max-w-full items-stretch gap-0.5 rounded-[var(--rb-r-sm,6px)] bg-rb-soft p-0.5 dark:bg-rb-soft";
const segmentedMd = "h-8";
const segment =
  "relative inline-flex min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap [&_svg]:shrink-0 rounded-[var(--rb-r-xs,4px)] px-3 text-[14px]/[16px] font-[450] text-rb-fg/80 select-none transition-[background-color,color,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-aria-checked:bg-rb-soft hover:not-aria-checked:text-rb-fg active:not-aria-checked:bg-rb-soft aria-checked:bg-rb-canvas aria-checked:text-rb-fg aria-checked:shadow-rb-sm disabled:cursor-not-allowed disabled:text-rb-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:text-rb-fg/80 dark:hover:not-aria-checked:bg-rb-soft dark:hover:not-aria-checked:text-rb-fg dark:active:not-aria-checked:bg-rb-soft dark:aria-checked:bg-rb-muted/60 dark:aria-checked:text-rb-fg dark:aria-checked:shadow-[0_0_0_1px_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.3)] dark:disabled:text-rb-muted/60";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const ghostButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg hover:not-disabled:bg-rb-soft active:bg-rb-soft aria-pressed:bg-rb-soft disabled:text-rb-muted/60 dark:text-rb-fg dark:hover:not-disabled:bg-rb-soft dark:active:bg-rb-soft dark:aria-pressed:bg-rb-soft dark:disabled:text-rb-muted/60";
const iconButtonXs = "size-6 rounded-[var(--rb-r-sm,6px)]";
const iconButtonMd = "size-8 rounded-[var(--rb-r-sm,6px)]";
const statusWord =
  "inline-flex items-start gap-1.5 text-[14px]/[16px] font-[450] tabular-nums";
const statusWordSm =
  "inline-flex items-start gap-1 text-[13px]/[18px] font-[450] tabular-nums";
const statusRunning = "text-rb-fg";
const statusOk = "text-rb-fg/80";
const statusWarn = "text-[oklch(49%_0.1_68)] dark:text-[oklch(80%_0.13_68)]";
const statusFail = "text-[oklch(51%_0.18_26)] dark:text-[oklch(76%_0.14_26)]";
const arcLine = "flex h-lh shrink-0 items-center";
const runningArc =
  "inline-block size-2.5 shrink-0 rounded-full border border-current border-t-transparent animate-spin motion-reduce:animate-none";
const statGrid =
  "grid grid-cols-2 overflow-hidden [&>:last-child:nth-child(odd)]:col-span-full *:-mt-px *:-ml-px *:border-t *:border-l *:border-rb-line @md:grid-flow-col @md:grid-cols-none @md:auto-cols-fr @md:[&>:last-child:nth-child(odd)]:col-auto dark:*:border-rb-line";
const statCell = "flex min-w-0 flex-col gap-2 px-4 py-3";
const statLabel =
  "text-[14px]/[16px] font-[450] text-rb-fg/80";
const statValueSm =
  "flex min-w-0 flex-wrap items-baseline gap-x-1 text-[20px]/[24px] font-[450] tabular-nums text-rb-fg";
const statDelta =
  "inline-flex min-w-0 flex-wrap items-baseline gap-x-1 text-[12px]/[16px] font-[450] tabular-nums [&>svg]:self-center text-rb-fg/80";
const statDescription =
  "text-[13px]/[18px] text-rb-muted";
const itemRow =
  "relative flex min-h-10 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-rb-fg transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] has-[[data-description]]:min-h-14";
const itemContent = "flex min-w-0 flex-1 flex-col gap-0.5";
const itemTitle =
  "flex max-w-full min-w-0 items-baseline gap-2 text-[14px]/[16px] font-[450] text-rb-fg";
const chartGrid = "stroke-rb-soft";
const chartInk = "stroke-rb-fg";
const chartArea = "fill-rb-soft";
const chartCrosshair = "stroke-rb-fg";
const chartPoint =
  "fill-rb-fg stroke-rb-canvas stroke-2";
const fadeTop =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";

const metaText = cx(typeBodySm, text3);
const tickText = cx(typeCaption, text3);

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const wave = (seed: number, i: number) =>
  Math.sin(i * 0.7 + seed) * 0.5 + Math.sin(i * 0.23 + seed * 2.1) * 0.34;

const series = (seed: number, base: number, drift: number, count: number) =>
  Array.from({ length: count }, (_, i) =>
    Math.round(base * (1 + drift * (i / (count - 1)) + wave(seed, i) * 0.09)),
  );

const RANGES = ["1h", "24h", "7d"] as const;
type Range = (typeof RANGES)[number];

const POINTS: Record<Range, number> = { "1h": 12, "24h": 24, "7d": 28 };
const TICKS: Record<Range, string[]> = {
  "1h": ["09:00", "09:15", "09:30", "09:45", "10:00"],
  "24h": ["04:00", "08:00", "12:00", "16:00", "20:00"],
  "7d": ["Mon", "Wed", "Thu", "Sat", "Sun"],
};
const SINCE: Record<Range, string> = {
  "1h": "vs previous hour",
  "24h": "vs previous day",
  "7d": "vs previous week",
};

const KPIS = [
  { id: "req", label: "Requests", base: 1_284_000, drift: 0.151, unit: "" },
  { id: "err", label: "Error rate", base: 42, drift: -0.02, unit: "%" },
  { id: "p95", label: "p95 latency", base: 318, drift: 0.004, unit: "ms" },
  { id: "sat", label: "Saturation", base: 61, drift: 0.037, unit: "%" },
] as const;

const INCIDENTS = [
  {
    id: "i1",
    title: "Checkout API timeouts",
    severity: "Critical",
    tone: "danger" as const,
    service: "payments-edge",
    at: "09:12",
    body: "The charge endpoint exceeded its 8s budget on six consecutive calls, holding four orders at authorisation.",
  },
  {
    id: "i2",
    title: "Retry storm contained",
    severity: "Major",
    tone: "warning" as const,
    service: "invoice-worker",
    at: "08:47",
    body: "Backoff was applied after a vendor 503 spike, capping retries and draining the queued backlog.",
  },
  {
    id: "i3",
    title: "Search index degraded",
    severity: "Minor",
    tone: "resolved" as const,
    service: "search-api",
    at: "08:05",
    body: "Read latency on the embeddings index rose to 1.9s, slowing lookups for eleven minutes before recovering.",
  },
];

const SEVERITY_TONE: Record<"danger" | "warning" | "resolved", string> = {
  danger: statusFail,
  warning: statusWarn,
  resolved: statusOk,
};

function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    const view = el?.ownerDocument.defaultView;
    if (!el || !view?.ResizeObserver) return;
    const observer = new view.ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize({ width: box.width, height: box.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
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

const format = (id: string, value: number) => {
  if (id === "req") return `${(value / 1000).toFixed(1)}k`;
  if (id === "err") return `${(value / 100).toFixed(2)}%`;
  if (id === "p95") return `${value}ms`;
  return `${value}%`;
};

function Throughput({
  data,
  ticks,
  active,
  onActiveChange,
}: {
  data: number[];
  ticks: string[];
  active: number | null;
  onActiveChange: (i: number | null) => void;
}) {
  const [ref, size] = useMeasure<HTMLDivElement>();

  const height = size.height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = (max - min || 1) * 0.25;

  const x = useCallback(
    (i: number) => (i / (data.length - 1)) * Math.max(size.width - 2, 1) + 1,
    [data.length, size.width],
  );
  const y = useCallback(
    (v: number) =>
      height - 4 - ((v - min + pad) / (max - min + pad * 2)) * (height - 12),
    [height, max, min, pad],
  );

  const linePath =
    line<number>()
      .x((_, i) => x(i))
      .y((v) => y(v))
      .curve(curveMonotoneX)(data) ?? "";

  const areaPath =
    area<number>()
      .x((_, i) => x(i))
      .y0(height)
      .y1((v) => y(v))
      .curve(curveMonotoneX)(data) ?? "";

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const step = rect.width / (data.length - 1);
    onActiveChange(
      clamp(Math.round((clientX - rect.left) / step), 0, data.length - 1),
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        role="img"
        aria-label={`Request throughput, ${data.length} points`}
        tabIndex={0}
        onPointerMove={(e) => move(e.clientX)}
        onPointerLeave={() => onActiveChange(null)}
        onBlur={() => onActiveChange(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const from = active ?? data.length - 1;
            onActiveChange(
              clamp(
                from + (e.key === "ArrowLeft" ? -1 : 1),
                0,
                data.length - 1,
              ),
            );
          }
          if (e.key === "Escape") onActiveChange(null);
        }}
        style={{ touchAction: "pan-y" }}
        className={cx(
          focusRing,
          "relative min-h-[180px] flex-1 cursor-crosshair",
        )}
      >
        {size.width > 0 && size.height > 0 && (
          <svg
            width={size.width}
            height={height}
            className="absolute inset-0 overflow-visible"
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={0}
                x2={size.width}
                y1={height * f}
                y2={height * f}
                className={chartGrid}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
            ))}

            <path d={areaPath} className={chartArea} />
            <path
              d={linePath}
              fill="none"
              className={chartInk}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {active !== null && (
              <>
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={0}
                  y2={height}
                  className={chartCrosshair}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <rect
                  x={x(active) - 4}
                  y={y(data[active]) - 4}
                  width={8}
                  height={8}
                  className={chartPoint}
                />
              </>
            )}
          </svg>
        )}
      </div>
      <div className={cx(tickText, "mt-2 flex justify-between")}>
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}

export default function Monitoring1() {
  const [range, setRange] = useState<Range>("24h");
  const [active, setActive] = useState<number | null>(null);
  const {
    ref: incidentsRef,
    edges: incidentEdges,
    onScroll: onIncidentsScroll,
  } = useScrollFade<HTMLUListElement>();

  const kpis = useMemo(
    () =>
      KPIS.map((k, i) => ({
        ...k,
        values: series(1.4 + i * 2.3, k.base, k.drift, POINTS[range]),
      })),
    [range],
  );

  const throughput = useMemo(
    () => series(3.7, 1263, 0.124, POINTS[range]),
    [range],
  );

  const total = throughput.reduce((s, v) => s + v, 0);

  return (
    <div
      className={cx(
        canvas,
        text1,
        "flex h-full min-h-[760px] w-full flex-col overflow-hidden p-4 sm:p-6",
      )}
    >
      <div className={cx(panel, "flex min-h-0 flex-1 flex-col gap-1")}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className={cx(typeHeadingXs, "truncate")}>Platform health</h2>
              <span className={cx(statusWord, statusRunning)}>
                <span className={arcLine}>
                  <span aria-hidden="true" className={runningArc} />
                </span>
                Live
              </span>
            </div>
            <p className={cx(metaText, "mt-0.5 truncate")}>
              Traffic, errors and saturation across every production service.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Time range"
              className={cx(segmentedTrack, segmentedMd)}
            >
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={r === range}
                  onClick={() => {
                    setRange(r);
                    setActive(null);
                  }}
                  className={segment}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="Refresh"
              className={cx(secondaryButton, iconButtonMd)}
            >
              <HugeiconsIcon
                icon={RefreshIcon}
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        <div className={cx(panelBody, "@container p-0.75")}>
          <div className={statGrid}>
            {kpis.map((k) => {
              const first = k.values[0];
              const latest = k.values[k.values.length - 1];
              const delta = ((latest - first) / first) * 100;
              const up = delta >= 0;
              return (
                <div key={k.id} className={cx(statCell, "ps-3 pe-3")}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={cx(statLabel, "min-w-0 truncate")}>
                      {k.label}
                    </span>
                    <button
                      type="button"
                      aria-label={`Options for ${k.label}`}
                      className={cx(ghostButton, iconButtonXs, "-mt-1 -mr-1")}
                    >
                      <HugeiconsIcon
                        icon={MoreHorizontalIcon}
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  <div className={statValueSm}>
                    <p>{format(k.id, latest)}</p>
                    <span className={statDelta}>
                      <HugeiconsIcon
                        icon={up ? ArrowUpRight01Icon : ArrowDownRight01Icon}
                        size={12}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      <span className="sr-only">{up ? "Up" : "Down"}</span>
                      {Math.abs(delta).toFixed(1)}%
                    </span>
                  </div>
                  <p className={cx(statDescription, "text-pretty")}>
                    {SINCE[range]}: {format(k.id, first)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className={cx(panelBody, "min-h-0 flex-1")}>
          <div
            className={cx(
              tileFill,
              "grid min-h-0 flex-1 gap-px lg:grid-cols-[1fr_360px]",
            )}
          >
            <div
              className={cx(
                insetBody,
                "flex min-h-[280px] flex-col p-4 lg:min-h-0",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h3 className={typeLabel}>Request throughput</h3>
                  <p className={cx(statValueSm, "mt-1.5")}>
                    {(active === null
                      ? total
                      : throughput[active]
                    ).toLocaleString("en-US")}
                  </p>
                </div>
                <p className={cx(metaText, "shrink-0")}>
                  {active === null
                    ? `total, last ${range}`
                    : `point ${active + 1} of ${throughput.length}`}
                </p>
              </div>
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                <Throughput
                  data={throughput}
                  ticks={TICKS[range]}
                  active={active}
                  onActiveChange={setActive}
                />
              </div>
            </div>

            <div className={cx(insetBody, "flex min-h-0 flex-col")}>
              <div className="px-4 py-3">
                <h3 className={typeLabel}>Incident activity</h3>
              </div>
              <div className="relative min-h-0 flex-1">
                <ul
                  ref={incidentsRef}
                  onScroll={onIncidentsScroll}
                  className={cx(rowsRuled, "h-full overflow-y-auto pb-2")}
                >
                  {INCIDENTS.map((i) => (
                    <li key={i.id} className={cx(itemRow, "px-4")}>
                      <div className={itemContent}>
                        <div className={cx(itemTitle, "flex-wrap")}>
                          <span>{i.title}</span>
                          <span
                            className={cx(statusWordSm, SEVERITY_TONE[i.tone])}
                          >
                            {i.severity}
                          </span>
                        </div>
                        <p
                          className={cx(
                            metaText,
                            "mt-1 flex flex-wrap gap-x-3",
                          )}
                        >
                          <span>{i.service}</span>
                          <span>{i.at}</span>
                        </p>
                        <p className={cx(typeBodySm, text2, "mt-1.5")}>
                          {i.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div
                  aria-hidden="true"
                  className={cx(
                    fadeTop,
                    "pointer-events-none absolute inset-x-0 top-0 h-8",
                    incidentEdges.start ? "opacity-100" : "opacity-0",
                  )}
                />
                <div
                  aria-hidden="true"
                  className={cx(
                    fadeBottom,
                    "pointer-events-none absolute inset-x-0 bottom-0 h-8",
                    incidentEdges.end ? "opacity-100" : "opacity-0",
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
