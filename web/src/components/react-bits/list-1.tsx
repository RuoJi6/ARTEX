"use client";

import { useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowDownRight01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Money01Icon,
  PackageDeliveredIcon,
  Undo03Icon,
  UndoIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const hoverFill = "hover:bg-rb-soft";
const selectedFill = "bg-rb-soft";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const typeHeadingXs = "text-[16px]/[20px] font-[450] tracking-[-0.015em]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const rowsRuled = "divide-y divide-rb-line";
const transition =
  "transition-[color,background-color,border-color,box-shadow,outline-color,opacity,scale] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:duration-[60ms]";
const iconButtonMd = "size-8 rounded-[var(--rb-r-sm,6px)]";
const segmentedTrack =
  "inline-flex w-fit max-w-full items-stretch gap-0.5 rounded-[var(--rb-r-sm,6px)] bg-rb-soft p-0.5 dark:bg-rb-soft";
const segmentedMd = "h-8";
const segment =
  "relative inline-flex min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap [&_svg]:shrink-0 rounded-[var(--rb-r-xs,4px)] px-3 text-[14px]/[16px] font-[450] text-rb-fg/80 select-none transition-[background-color,color,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-aria-checked:bg-rb-soft hover:not-aria-checked:text-rb-fg active:not-aria-checked:bg-rb-soft aria-checked:bg-rb-canvas aria-checked:text-rb-fg aria-checked:shadow-rb-sm disabled:cursor-not-allowed disabled:text-rb-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:text-rb-fg/80 dark:hover:not-aria-checked:bg-rb-soft dark:hover:not-aria-checked:text-rb-fg dark:active:not-aria-checked:bg-rb-soft dark:aria-checked:bg-rb-muted/60 dark:aria-checked:text-rb-fg dark:aria-checked:shadow-[0_0_0_1px_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.3)] dark:disabled:text-rb-muted/60";
const statValueSm =
  "flex min-w-0 flex-wrap items-baseline gap-x-1 text-[20px]/[24px] font-[450] tabular-nums text-rb-fg";
const statDelta =
  "inline-flex min-w-0 flex-wrap items-baseline gap-x-1 text-[12px]/[16px] font-[450] tabular-nums [&>svg]:self-center text-rb-fg/80";
const frame =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover text-rb-fg";
const cornerSm = "rounded-[var(--rb-r-sm,6px)]";
const itemRow =
  "relative flex min-h-10 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-rb-fg transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] has-[[data-description]]:min-h-14";
const itemMedia =
  "flex size-8 shrink-0 items-center justify-center text-rb-fg/80";
const itemContent = "flex min-w-0 flex-1 flex-col gap-0.5";
const itemDescription =
  "line-clamp-2 text-[13px]/[18px] text-rb-fg/80";
const disclosureCaret =
  "shrink-0 text-rb-muted transition-transform duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none group-aria-expanded:rotate-90";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";

type Range = "7d" | "28d" | "qtd";

type Metric = {
  id: string;
  label: string;
  icon: IconSvgElement;
  caption: string;
  by: Record<Range, { value: string; delta: number }>;
};

const RANGES: { id: Range; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "28d", label: "28 days" },
  { id: "qtd", label: "Quarter" },
];

const METRICS: Metric[] = [
  {
    id: "fulfilled",
    label: "Orders fulfilled",
    icon: PackageDeliveredIcon,
    caption: "Picked, packed and handed to a carrier",
    by: {
      "7d": { value: "1,284", delta: 6.4 },
      "28d": { value: "5,109", delta: 11.2 },
      qtd: { value: "14,730", delta: 18.9 },
    },
  },
  {
    id: "net",
    label: "Net revenue",
    icon: Money01Icon,
    caption: "Gross receipts less discounts and refunds",
    by: {
      "7d": { value: "$92.4k", delta: 3.1 },
      "28d": { value: "$374.8k", delta: 7.8 },
      qtd: { value: "$1.09M", delta: 12.4 },
    },
  },
  {
    id: "basket",
    label: "Average basket",
    icon: UndoIcon,
    caption: "Net revenue divided by fulfilled orders",
    by: {
      "7d": { value: "$71.96", delta: -2.9 },
      "28d": { value: "$73.36", delta: -1.4 },
      qtd: { value: "$74.02", delta: 0.6 },
    },
  },
  {
    id: "returns",
    label: "Return rate",
    icon: Undo03Icon,
    caption: "Units sent back within the 30 day window",
    by: {
      "7d": { value: "4.1%", delta: -0.8 },
      "28d": { value: "4.6%", delta: 0.5 },
      qtd: { value: "5.2%", delta: 1.7 },
    },
  },
];

const signed = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`;

const onRadioKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
  const step =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -1
        : 0;
  if (!step && e.key !== "Home" && e.key !== "End") return;
  const radios = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role=\"radio\"]:not(:disabled)',
    ),
  );
  const from = radios.indexOf(e.target as HTMLButtonElement);
  if (from < 0) return;
  e.preventDefault();
  const to =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? radios.length - 1
        : (from + step + radios.length) % radios.length;
  radios[to].focus();
  radios[to].click();
};

export default function List1() {
  const [range, setRange] = useState<Range>("28d");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div
      className={cx(
        canvas,
        text1,
        "flex h-full min-h-[560px] w-full flex-col justify-center-safe overflow-y-auto p-8 sm:p-10",
      )}
    >
      <div className="mx-auto w-full max-w-[720px] shrink-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div>
            <h2 className={cx(typeHeadingXs, text1)}>Store performance</h2>
            <p className={cx(typeBodySm, text3, "mt-0.5")}>
              Compared with the preceding period
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Reporting range"
            onKeyDown={onRadioKeys}
            className={cx(segmentedTrack, segmentedMd)}
          >
            {RANGES.map((r) => {
              const on = r.id === range;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setRange(r.id)}
                  className={segment}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={cx(frame, rowsRuled, "shrink-0 p-2")}>
          {METRICS.map((m) => {
            const { value, delta } = m.by[range];
            const open = openId === m.id;

            return (
              <div
                key={m.id}
                className={cx(
                  "group/row relative",
                  cornerSm,
                  transition,
                  open ? selectedFill : hoverFill,
                )}
              >
                <div className={cx(itemRow, "h-16 px-3")}>
                  <span className={cx(itemMedia, "size-10")}>
                    <HugeiconsIcon
                      icon={m.icon}
                      size={18}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </span>

                  <div className={itemContent}>
                    <div className="flex items-baseline gap-2">
                      <span className={statValueSm}>{value}</span>
                      <span className={statDelta}>
                        <HugeiconsIcon
                          icon={
                            delta > 0
                              ? ArrowUpRight01Icon
                              : delta < 0
                                ? ArrowDownRight01Icon
                                : ArrowRight01Icon
                          }
                          size={12}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        <span className="sr-only">
                          {delta > 0 ? "Up" : delta < 0 ? "Down" : "No change"}
                        </span>
                        {signed(delta)}
                      </span>
                    </div>
                    <p data-description className={itemDescription}>
                      {m.label}
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={`${open ? "Hide" : "Show"} how ${m.label.toLowerCase()} is measured`}
                    onClick={() => setOpenId(open ? null : m.id)}
                    className={cx(secondaryButton, iconButtonMd, "group")}
                  >
                    <HugeiconsIcon
                      icon={ArrowUpRight01Icon}
                      size={16}
                      strokeWidth={1.8}
                      aria-hidden="true"
                      className={disclosureCaret}
                    />
                  </button>
                </div>

                <div
                  className={cx(
                    "grid pr-3 pl-16",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div hidden={!open} className="overflow-hidden">
                    <p className={cx(typeBodySm, text2, "pb-3")}>{m.caption}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
