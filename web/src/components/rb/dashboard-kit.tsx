/**
 * Dashboard building blocks composed from React Bits Pro blocks
 * (dashboard-1 metric strip, monitoring-1 status tones, analytics-1
 * sparklines, agent-activity-1 rows, list-1 ruled rows). All styling comes
 * from ./tokens so the panels follow the app theme.
 */
import type { ReactNode } from "react";

import { ArrowDownRight01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  chartBar,
  chartGrid,
  chartInk,
  chartZero,
  cx,
  frame,
  frameHead,
  frameTitle,
  itemMeta,
  itemRow,
  itemRowInteractive,
  runningArc,
  statusFail,
  statusOk,
  statusWarn,
  text1,
  text3,
  typeBodySm,
  typeCaption,
  typeHeadingSm,
} from "./tokens";

export type Tone = "ok" | "warn" | "fail" | "run" | "idle";

const TONE_DOT: Record<Tone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
  run: "bg-blue-500",
  idle: "bg-rb-muted/50",
};

const _TONE_TEXT: Record<Tone, string> = {
  ok: statusOk,
  warn: statusWarn,
  fail: statusFail,
  run: "text-blue-600 dark:text-blue-400",
  idle: text3,
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span aria-hidden="true" className={cx("inline-block size-2 shrink-0 rounded-full", TONE_DOT[tone], className)} />
  );
}

export function Panel({
  title,
  hint,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx(frame, "min-w-0", className)}>
      <header className={cx(frameHead, "gap-3")}>
        <h2 className={cx(frameTitle, "min-w-0 truncate")}>{title}</h2>
        {hint && <span className={cx(typeCaption, text3, "shrink-0")}>{hint}</span>}
        {actions && <div className="ms-auto flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
      <div className={cx("min-w-0 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeading({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <h1 className={cx(typeHeadingSm, text1, "min-w-0 truncate")}>{title}</h1>
      {actions && <div className="ms-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
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
      aria-hidden="true"
      className="@min-[13rem]:block hidden h-8 w-16 shrink-0"
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

export interface MetricItem {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: string;
  deltaPositive?: boolean;
  hint?: string;
  spark?: number[];
}

export function MetricStrip({ metrics }: { metrics: MetricItem[] }) {
  return (
    <div className="@container rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover">
      <div className="grid @md:auto-cols-fr @md:grid-flow-col @md:grid-cols-none grid-cols-2 overflow-hidden *:-mt-px *:-ml-px *:border-rb-line *:border-t *:border-l">
        {metrics.map((metric) => (
          <div key={metric.label} className="@container flex min-w-0 flex-col gap-2 px-4 py-3">
            <p className="flex items-center gap-1.5 font-[450] text-[14px]/[16px] text-rb-fg/80">
              <span className="truncate">{metric.label}</span>
            </p>
            <div className="mt-auto flex items-end justify-between gap-3">
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-1 font-[450] text-[32px]/[36px] text-rb-fg tabular-nums">
                <span className="truncate">{metric.value}</span>
                {metric.unit && <span className="text-[14px]/[16px] text-rb-muted">{metric.unit}</span>}
              </p>
              {metric.spark && metric.spark.length > 1 && <Sparkline values={metric.spark} />}
            </div>
            {(metric.delta || metric.hint) && (
              <p className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1 font-[450] text-[12px]/[16px] text-rb-fg/80 tabular-nums [&>svg]:self-center">
                {metric.delta && (
                  <>
                    <HugeiconsIcon
                      icon={metric.deltaPositive === false ? ArrowDownRight01Icon : ArrowUpRight01Icon}
                      size={12}
                      strokeWidth={1.8}
                      aria-hidden="true"
                      className={metric.deltaPositive === false ? statusFail : statusOk}
                    />
                    {metric.delta}
                  </>
                )}
                {metric.hint && <span className="text-rb-muted">{metric.hint}</span>}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarRow({
  label,
  value,
  max,
  display,
  tone,
}: {
  label: ReactNode;
  value: number;
  max: number;
  display?: ReactNode;
  tone?: Tone;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex min-w-0 items-center gap-3 py-1.5">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {tone && <StatusDot tone={tone} />}
        <span className="truncate text-[13px]/[18px] text-rb-fg/80">{label}</span>
      </span>
      <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-rb-soft sm:w-40">
        <span
          className={cx(
            "block h-full rounded-full transition-[width] duration-[300ms] ease-out",
            tone === "fail"
              ? "bg-red-500"
              : tone === "warn"
                ? "bg-amber-500"
                : tone === "ok"
                  ? "bg-emerald-500"
                  : "bg-rb-fg",
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-12 shrink-0 text-right font-[450] text-[13px]/[18px] text-rb-fg tabular-nums">
        {display ?? value}
      </span>
    </div>
  );
}

export function KVRow({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: Tone }) {
  return (
    <div className="flex min-w-0 items-center gap-3 py-1.5">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px]/[18px] text-rb-fg/80">
        {tone && <StatusDot tone={tone} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-[450] text-[13px]/[18px] text-rb-fg tabular-nums">{value}</span>
    </div>
  );
}

export interface ActivityItem {
  id: string;
  label: ReactNode;
  detail?: ReactNode;
  at?: ReactNode;
  state: "run" | "done" | "fail" | "pending";
}

/** Agent activity stream (agent-activity-1 pattern) with live step status. */
export function ActivityStream({ items, empty }: { items: ActivityItem[]; empty?: ReactNode }) {
  if (items.length === 0) {
    return <p className={cx(typeBodySm, text3, "py-6 text-center")}>{empty ?? "—"}</p>;
  }
  return (
    <ul className="divide-y divide-rb-line">
      {items.map((item) => (
        <li key={item.id}>
          <div className={cx(itemRow, "items-start gap-2.5 px-1 py-2.5")}>
            <span className="mt-1 flex size-4 shrink-0 items-center justify-center">
              {item.state === "run" ? (
                <span aria-hidden="true" className={runningArc} />
              ) : (
                <StatusDot tone={item.state === "fail" ? "fail" : item.state === "done" ? "ok" : "idle"} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px]/[18px] text-rb-fg">{item.label}</span>
              {item.detail && <span className={cx(typeCaption, text3, "mt-0.5 block truncate")}>{item.detail}</span>}
            </span>
            {item.at && <span className={cx(itemMeta, "shrink-0")}>{item.at}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RowLink({
  href,
  title,
  meta,
  tone,
  leading,
}: {
  href: string;
  title: ReactNode;
  meta?: ReactNode;
  tone?: Tone;
  leading?: ReactNode;
}) {
  return (
    <a
      href={href}
      className={cx(itemRow, itemRowInteractive, "items-center gap-2.5 rounded-[var(--rb-r-sm,6px)] px-2 py-2")}
    >
      {tone && <StatusDot tone={tone} />}
      {leading}
      <span className="min-w-0 flex-1 truncate text-[13px]/[18px] text-rb-fg">{title}</span>
      {meta && <span className={cx(itemMeta, "shrink-0")}>{meta}</span>}
    </a>
  );
}

/** Vertical column chart (dashboard-1 pattern) for simple series. */
export function ColumnChart({
  values,
  labels,
  height = 160,
  tone,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  tone?: Tone;
}) {
  const max = Math.max(...values, 1);
  const barClass =
    tone === "fail"
      ? "fill-red-500"
      : tone === "warn"
        ? "fill-amber-500"
        : tone === "ok"
          ? "fill-emerald-500"
          : chartBar;
  return (
    <div className="min-w-0">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {values.map((value, i) => (
          <div
            key={i}
            className="flex min-w-0 flex-1 items-end justify-center"
            style={{ height: `${(value / max) * 100}%` }}
          >
            <svg aria-hidden="true" className="block h-full w-full min-w-0 max-w-[48px]">
              <rect width="100%" height="100%" rx="2" className={barClass} />
            </svg>
          </div>
        ))}
      </div>
      {labels && (
        <div className="mt-2 flex gap-1.5">
          {labels.map((label, i) => (
            <span key={i} className={cx(typeCaption, text3, "min-w-0 flex-1 truncate text-center")}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal area/line chart with grid lines (monitoring-1 pattern, d3-free). */
export function TrendChart({
  values,
  labels,
  height = 140,
  yTicks = 3,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  yTicks?: number;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = span * 0.15;
  const lo = min - pad;
  const hi = max + pad;
  const toY = (v: number) => height - 6 - ((v - lo) / (hi - lo)) * (height - 12);
  const points = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * 100},${toY(v).toFixed(2)}`).join(" ");

  return (
    <div className="min-w-0">
      <div className="relative" style={{ height }}>
        <svg
          aria-hidden="true"
          preserveAspectRatio="none"
          viewBox={`0 0 100 ${height}`}
          className="absolute inset-0 h-full w-full"
        >
          {Array.from({ length: yTicks }, (_, i) => {
            const y = (i / (yTicks - 1)) * (height - 12) + 6;
            return (
              <line
                key={i}
                x1="0"
                x2="100"
                y1={y}
                y2={y}
                vectorEffect="non-scaling-stroke"
                shapeRendering="crispEdges"
                className={i === yTicks - 1 ? chartZero : chartGrid}
                strokeWidth={1}
              />
            );
          })}
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
      </div>
      {labels && (
        <div className="mt-2 flex justify-between">
          {labels.map((label, i) => (
            <span key={i} className={cx(typeCaption, text3, "truncate")}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Radial gauge ring (monitoring-1 pattern). */
export function GaugeRing({
  value,
  label,
  sub,
  size = 84,
  tone,
}: {
  value: number;
  label: ReactNode;
  sub?: ReactNode;
  size?: number;
  tone?: Tone;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const stroke =
    tone === "fail"
      ? "stroke-red-500"
      : tone === "warn"
        ? "stroke-amber-500"
        : tone === "ok"
          ? "stroke-emerald-500"
          : "stroke-rb-fg";
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} className="stroke-rb-soft" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (pct / 100) * c}
            className={cx(stroke, "transition-[stroke-dashoffset] duration-[400ms] ease-out")}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-[450] text-[15px]/[18px] text-rb-fg tabular-nums">
          {Math.round(pct)}%
        </span>
      </div>
      <span className="font-[450] text-[13px]/[16px] text-rb-fg">{label}</span>
      {sub && <span className={cx(typeCaption, text3)}>{sub}</span>}
    </div>
  );
}

/** Stacked severity bar: segments rendered proportionally with a legend. */
export function StackedBar({ segments }: { segments: { label: string; value: number; tone: Tone }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div className="min-w-0">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-rb-soft">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <span
              key={segment.label}
              className={cx(
                "block h-full",
                segment.tone === "fail"
                  ? "bg-red-500"
                  : segment.tone === "warn"
                    ? "bg-amber-500"
                    : segment.tone === "ok"
                      ? "bg-emerald-500"
                      : "bg-rb-fg",
              )}
              style={{ width: `${total > 0 ? (segment.value / total) * 100 : 0}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-1.5 text-[12px]/[16px] text-rb-muted">
            <StatusDot tone={segment.tone} />
            {segment.label}
            <span className="font-[450] text-rb-fg tabular-nums">{segment.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
