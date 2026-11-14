"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { area, curveMonotoneX, line } from "d3-shape";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Activity01Icon,
  ArrowDownRight01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Timer01Icon,
  UserAdd01Icon,
  UsersIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const text1 = "text-rb-fg";
const text3 = "text-rb-muted";
const typeHeadingXs = "text-[16px]/[20px] font-[450] tracking-[-0.015em]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const panel =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-subtle text-rb-fg dark:bg-rb-popover";
const panelBody =
  "mx-1 mb-1 flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-canvas [&:has(+*)]:mb-0 dark:border-rb-line dark:bg-rb-canvas";
const rowsRuled = "divide-y divide-rb-line";
const segmentedTrack =
  "inline-flex w-fit max-w-full items-stretch gap-0.5 rounded-[var(--rb-r-sm,6px)] bg-rb-soft p-0.5 dark:bg-rb-soft";
const segmentedMd = "h-8";
const segment =
  "relative inline-flex min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap [&_svg]:shrink-0 rounded-[var(--rb-r-xs,4px)] px-3 text-[14px]/[16px] font-[450] text-rb-fg/80 select-none transition-[background-color,color,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-aria-checked:bg-rb-soft hover:not-aria-checked:text-rb-fg active:not-aria-checked:bg-rb-soft aria-checked:bg-rb-canvas aria-checked:text-rb-fg aria-checked:shadow-rb-sm disabled:cursor-not-allowed disabled:text-rb-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:text-rb-fg/80 dark:hover:not-aria-checked:bg-rb-soft dark:hover:not-aria-checked:text-rb-fg dark:active:not-aria-checked:bg-rb-soft dark:aria-checked:bg-rb-muted/60 dark:aria-checked:text-rb-fg dark:aria-checked:shadow-[0_0_0_1px_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.3)] dark:disabled:text-rb-muted/60";
const statCell = "flex min-w-0 flex-col gap-2 px-4 py-3";
const cornerSm = "rounded-[var(--rb-r-sm,6px)]";
const statLabel =
  "text-[14px]/[16px] font-[450] text-rb-fg/80";
const statValueSm =
  "flex min-w-0 flex-wrap items-baseline gap-x-1 text-[20px]/[24px] font-[450] tabular-nums text-rb-fg";
const statDelta =
  "inline-flex min-w-0 flex-wrap items-baseline gap-x-1 text-[12px]/[16px] font-[450] tabular-nums [&>svg]:self-center text-rb-fg/80";
const chartInk = "stroke-rb-fg";
const chartArea = "fill-rb-soft";
const chartPoint =
  "fill-rb-fg stroke-rb-canvas stroke-2";
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";
const linkButton =
  "inline-flex min-h-6 items-center gap-1 rounded-[var(--rb-r-sm,6px)] text-[14px]/[16px] font-[450] text-rb-fg decoration-1 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const grouped = (n: number) => n.toLocaleString("en-US");

const wave = (seed: number, i: number) =>
  Math.sin(i * 0.9 + seed) * 0.5 + Math.sin(i * 0.31 + seed * 1.7) * 0.32;

function series(seed: number, base: number, drift: number, count: number) {
  return Array.from({ length: count }, (_, i) =>
    Math.round(base * (1 + drift * (i / (count - 1)) + wave(seed, i) * 0.06)),
  );
}

const RANGES = ["Week", "Month", "Quarter"] as const;
type Range = (typeof RANGES)[number];

const POINTS: Record<Range, number> = { Week: 7, Month: 30, Quarter: 13 };
const UNIT: Record<Range, string> = {
  Week: "day",
  Month: "day",
  Quarter: "week",
};

type Metric = {
  id: string;
  label: string;
  icon: IconSvgElement;
  base: number;
  drift: number;
  seed: number;
};

const METRICS: Metric[] = [
  {
    id: "active",
    label: "Active teams",
    icon: UsersIcon,
    base: 8420,
    drift: 0.041,
    seed: 1.2,
  },
  {
    id: "invited",
    label: "Seats invited",
    icon: UserAdd01Icon,
    base: 1245,
    drift: -0.018,
    seed: 3.4,
  },
  {
    id: "sessions",
    label: "Sessions",
    icon: Activity01Icon,
    base: 64_800,
    drift: 0.027,
    seed: 5.1,
  },
  {
    id: "duration",
    label: "Median session",
    icon: Timer01Icon,
    base: 412,
    drift: 0.004,
    seed: 7.9,
  },
];

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

function moveChoice(
  e: React.KeyboardEvent<HTMLDivElement>,
  count: number,
  index: number,
  select: (next: number) => void,
) {
  const next =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? (index + 1) % count
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? (index - 1 + count) % count
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? count - 1
            : -1;
  if (next < 0) return;
  e.preventDefault();
  select(next);
  e.currentTarget
    .querySelectorAll<HTMLElement>('[role="radio"]')
    [next]?.focus();
}

function Delta({ value }: { value: number }) {
  return (
    <>
      <span>
        <HugeiconsIcon
          icon={
            value > 0
              ? ArrowUpRight01Icon
              : value < 0
                ? ArrowDownRight01Icon
                : ArrowRight01Icon
          }
          size={12}
          strokeWidth={1.8}
          aria-hidden="true"
          className="inline-block align-middle"
        />
      </span>
      <span className="sr-only">
        {value > 0 ? "Up" : value < 0 ? "Down" : "No change"}
      </span>
      {Math.abs(value).toFixed(1)}%
    </>
  );
}

function formatValue(id: string, value: number) {
  if (id === "duration") {
    const minutes = Math.floor(value / 60);
    return `${minutes}m ${String(value % 60).padStart(2, "0")}s`;
  }
  return grouped(value);
}

type SparkProps = {
  data: number[];
  active: number | null;
  onActiveChange: (index: number | null) => void;
  label: string;
};

function Spark({ data, active, onActiveChange, label }: SparkProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();

  const height = 44;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = (max - min || 1) * 0.18;

  const x = useCallback(
    (i: number) => (i / (data.length - 1)) * Math.max(size.width - 2, 1) + 1,
    [data.length, size.width],
  );
  const y = useCallback(
    (v: number) =>
      height - 3 - ((v - min + pad) / (max - min + pad * 2)) * (height - 6),
    [max, min, pad],
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
    <div
      ref={ref}
      role="img"
      aria-label={`${label} trend, ${data.length} points`}
      tabIndex={0}
      onPointerMove={(e) => move(e.clientX)}
      onPointerLeave={() => onActiveChange(null)}
      onBlur={() => onActiveChange(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const from = active ?? data.length - 1;
          onActiveChange(
            clamp(from + (e.key === "ArrowLeft" ? -1 : 1), 0, data.length - 1),
          );
        }
        if (e.key === "Escape") onActiveChange(null);
      }}
      style={{ touchAction: "pan-y" }}
      className={cx(focusRing, "relative -mx-1 h-11 cursor-crosshair px-1")}
    >
      {size.width > 0 && (
        <svg width={size.width} height={height} className="overflow-visible">
          <path d={areaPath} className={chartArea} />
          <path
            d={linePath}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={chartInk}
          />

          {active !== null && (
            <rect
              x={x(active) - 4}
              y={y(data[active]) - 4}
              width={8}
              height={8}
              className={chartPoint}
            />
          )}
        </svg>
      )}
    </div>
  );
}

export default function Analytics1() {
  const [range, setRange] = useState<Range>("Week");
  const [active, setActive] = useState<Record<string, number | null>>({});

  const data = useMemo(() => {
    const count = POINTS[range];
    return METRICS.map((metric) => ({
      ...metric,
      values: series(metric.seed, metric.base, metric.drift, count),
    }));
  }, [range]);

  const pick = (option: Range) => {
    setRange(option);
    setActive({});
  };

  return (
    <div
      className={cx(
        canvas,
        text1,
        "flex h-full min-h-[480px] w-full flex-col justify-center-safe overflow-y-auto p-6 sm:p-8",
      )}
    >
      <div className={cx(panel, "mx-auto w-full max-w-[1100px] shrink-0")}>
        <div className={cx(panelBody, rowsRuled, "mt-1")}>
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <h2 className={cx(typeHeadingXs, text1)}>Workspace pulse</h2>
              <p className={cx(typeBodySm, text3, "mt-0.5 truncate")}>
                Adoption, invitations and time spent across every workspace.
              </p>
            </div>

            <div
              role="radiogroup"
              aria-label="Range"
              onKeyDown={(e) =>
                moveChoice(e, RANGES.length, RANGES.indexOf(range), (i) =>
                  pick(RANGES[i]),
                )
              }
              className={cx(segmentedTrack, segmentedMd, "shrink-0")}
            >
              {RANGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={option === range}
                  tabIndex={option === range ? 0 : -1}
                  onClick={() => pick(option)}
                  className={segment}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1 p-1 sm:grid-cols-2 lg:grid-cols-4">
            {data.map((metric) => {
              const cursor = active[metric.id] ?? null;
              const latest = metric.values[metric.values.length - 1];
              const first = metric.values[0];
              const shown = cursor === null ? latest : metric.values[cursor];
              const delta = ((latest - first) / first) * 100;

              return (
                <div
                  key={metric.id}
                  className={cx(statCell, cornerSm, "ps-3 pe-3")}
                >
                  <div className={cx(statLabel, "flex items-center gap-2")}>
                    <HugeiconsIcon
                      icon={metric.icon}
                      size={14}
                      strokeWidth={1.8}
                      aria-hidden="true"
                      className={cx(text3, "shrink-0")}
                    />
                    <span className="min-w-0 truncate">{metric.label}</span>
                  </div>

                  <p className={statValueSm}>{formatValue(metric.id, shown)}</p>

                  <p className={cx(statDelta, "truncate")}>
                    {cursor === null ? (
                      <>
                        <Delta value={delta} />
                        <span className={text3}>
                          vs start of {range.toLowerCase()}
                        </span>
                      </>
                    ) : (
                      <span className={text3}>
                        {UNIT[range]} {cursor + 1} of {metric.values.length}
                      </span>
                    )}
                  </p>

                  <Spark
                    data={metric.values}
                    label={metric.label}
                    active={cursor}
                    onActiveChange={(index) =>
                      setActive((prev) => ({ ...prev, [metric.id]: index }))
                    }
                  />
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className={cx(typeBodySm, text3, "flex min-w-0 gap-3")}>
              <span className="truncate">12,845 workspaces tracked</span>
              <span className="truncate">76% active in the last 30 days</span>
            </p>
            <a href="#" className={cx(linkButton, "shrink-0")}>
              Open report
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
