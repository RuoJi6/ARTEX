"use client";

import { useMemo, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  CreditCardIcon,
  RepeatIcon,
  UsersIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const cornerXs = "rounded-[var(--rb-r-xs,4px)]";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const typeLabel = "text-[14px]/[16px] font-[450]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const segmentedTrack =
  "inline-flex w-fit max-w-full items-stretch gap-0.5 rounded-[var(--rb-r-sm,6px)] bg-rb-soft p-0.5 dark:bg-rb-soft";
const segmentedMd = "h-8";
const segment =
  "relative inline-flex min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap [&_svg]:shrink-0 rounded-[var(--rb-r-xs,4px)] px-3 text-[14px]/[16px] font-[450] text-rb-fg/80 select-none transition-[background-color,color,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-aria-checked:bg-rb-soft hover:not-aria-checked:text-rb-fg active:not-aria-checked:bg-rb-soft aria-checked:bg-rb-canvas aria-checked:text-rb-fg aria-checked:shadow-rb-sm disabled:cursor-not-allowed disabled:text-rb-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:text-rb-fg/80 dark:hover:not-aria-checked:bg-rb-soft dark:hover:not-aria-checked:text-rb-fg dark:active:not-aria-checked:bg-rb-soft dark:aria-checked:bg-rb-muted/60 dark:aria-checked:text-rb-fg dark:aria-checked:shadow-[0_0_0_1px_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.3)] dark:disabled:text-rb-muted/60";
const statGroup =
  "@container rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover";
const statGrid =
  "grid grid-cols-2 overflow-hidden [&>:last-child:nth-child(odd)]:col-span-full *:-mt-px *:-ml-px *:border-t *:border-l *:border-rb-line @md:grid-flow-col @md:grid-cols-none @md:auto-cols-fr @md:[&>:last-child:nth-child(odd)]:col-auto dark:*:border-rb-line";
const statCell = "flex min-w-0 flex-col gap-2 px-4 py-3";
const statLabel =
  "text-[14px]/[16px] font-[450] text-rb-fg/80";
const statValueSm =
  "flex min-w-0 flex-wrap items-baseline gap-x-1 text-[20px]/[24px] font-[450] tabular-nums text-rb-fg";
const statDelta =
  "inline-flex min-w-0 flex-wrap items-baseline gap-x-1 text-[12px]/[16px] font-[450] tabular-nums [&>svg]:self-center text-rb-fg/80";
const progressTrack =
  "relative block h-1 w-full overflow-hidden bg-rb-soft";
const progressFill =
  "block h-full bg-rb-fg transition-[width] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none dark:bg-rb-fg";

const RANGES = ["7d", "30d", "90d"] as const;
type Range = (typeof RANGES)[number];

type Metric = {
  id: string;
  label: string;
  icon: IconSvgElement;
  values: Record<Range, { value: string; delta: number; series: number[] }>;
};

const METRICS: Metric[] = [
  {
    id: "balance",
    label: "Available balance",
    icon: Wallet01Icon,
    values: {
      "7d": {
        value: "18,420",
        delta: 3.2,
        series: [42, 55, 48, 61, 58, 72, 80],
      },
      "30d": {
        value: "74,910",
        delta: 8.6,
        series: [30, 44, 39, 52, 66, 61, 78],
      },
      "90d": {
        value: "213,540",
        delta: 12.4,
        series: [22, 31, 45, 40, 58, 70, 88],
      },
    },
  },
  {
    id: "spend",
    label: "Card spend",
    icon: CreditCardIcon,
    values: {
      "7d": {
        value: "4,180",
        delta: -1.8,
        series: [70, 62, 66, 51, 55, 44, 40],
      },
      "30d": {
        value: "16,240",
        delta: -5.4,
        series: [82, 74, 68, 60, 57, 49, 41],
      },
      "90d": {
        value: "51,880",
        delta: 2.1,
        series: [48, 52, 46, 58, 55, 63, 67],
      },
    },
  },
  {
    id: "recurring",
    label: "Recurring revenue",
    icon: RepeatIcon,
    values: {
      "7d": {
        value: "9,760",
        delta: 1.1,
        series: [58, 60, 59, 63, 65, 64, 68],
      },
      "30d": {
        value: "38,900",
        delta: 4.7,
        series: [40, 46, 51, 55, 60, 66, 72],
      },
      "90d": {
        value: "112,300",
        delta: 9.9,
        series: [28, 36, 44, 49, 61, 68, 84],
      },
    },
  },
  {
    id: "payers",
    label: "Active payers",
    icon: UsersIcon,
    values: {
      "7d": {
        value: "1,284",
        delta: 0.6,
        series: [61, 59, 63, 62, 66, 65, 69],
      },
      "30d": {
        value: "1,342",
        delta: -2.3,
        series: [76, 71, 69, 64, 61, 58, 54],
      },
      "90d": {
        value: "1,410",
        delta: 6.8,
        series: [34, 41, 48, 52, 59, 67, 74],
      },
    },
  },
];

export default function Card6() {
  const [range, setRange] = useState<Range>("30d");

  const total = useMemo(
    () =>
      METRICS.reduce(
        (sum, metric) => sum + metric.values[range].delta,
        0,
      ).toFixed(1),
    [range],
  );

  return (
    <div
      className={cx(
        canvas,
        text1,
        "flex h-full min-h-[480px] w-full flex-col justify-center-safe overflow-y-auto p-6 sm:p-8",
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-3">
        <p className={cx(typeLabel, text1, "min-w-0 flex-1 truncate")}>
          Accounts overview
        </p>
        <div
          role="radiogroup"
          aria-label="Date range"
          className={cx(segmentedTrack, segmentedMd, "shrink-0")}
        >
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === range}
              onClick={() => setRange(option)}
              className={segment}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className={cx(statGroup, "mt-4 shrink-0")}>
        <div className={statGrid}>
          {METRICS.map((metric) => {
            const data = metric.values[range];
            const up = data.delta >= 0;
            const peak = Math.max(...data.series);

            return (
              <div key={metric.id} className={statCell}>
                <p className={cx(statLabel, "flex items-start gap-2")}>
                  <span className="flex h-lh shrink-0 items-center">
                    <HugeiconsIcon
                      icon={metric.icon}
                      size={16}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="min-w-0 text-pretty">{metric.label}</span>
                </p>

                <p className={cx(statValueSm, "mt-auto")}>{data.value}</p>

                <p className={statDelta}>
                  <HugeiconsIcon
                    icon={up ? ArrowUpRight01Icon : ArrowDownRight01Icon}
                    size={12}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className="shrink-0"
                  />
                  <span className="sr-only">{up ? "Up" : "Down"}</span>
                  {up ? "+" : ""}
                  {data.delta}%
                  <span className={text3}>vs previous {range}</span>
                </p>

                <div
                  aria-hidden="true"
                  className="mt-1 flex h-10 items-end gap-1"
                >
                  {data.series.map((point, i) => (
                    <span
                      key={i}
                      style={{ height: `${Math.round((point / peak) * 100)}%` }}
                      className={cx(
                        i === data.series.length - 1
                          ? progressFill
                          : progressTrack,
                        cornerXs,
                        "min-h-[2px] flex-1",
                      )}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className={cx(typeBodySm, text2, "mt-3 shrink-0 tabular-nums")}>
        Net movement across all four accounts over the last {range}: {total}%.
      </p>
    </div>
  );
}
