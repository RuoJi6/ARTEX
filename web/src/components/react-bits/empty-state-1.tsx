"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowRight02Icon,
  DatabaseIcon,
  Plug01Icon,
  FileSpreadsheetIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const insetBody = "bg-rb-canvas";
const cornerSm = "rounded-[var(--rb-r-sm,6px)]";
const hoverFill = "hover:bg-rb-soft";
const pressedFill = "active:bg-rb-soft";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const typeHeadingSm = "text-[20px]/[24px] font-[450] tracking-[-0.015em]";
const typeLabel = "text-[14px]/[16px] font-[450]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const focusRingInset =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))]";
const transition =
  "transition-[color,background-color,border-color,box-shadow,outline-color,opacity,scale] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:duration-[60ms]";
const panel =
  "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-subtle text-rb-fg dark:bg-rb-popover";
const panelBody =
  "mx-1 mb-1 flex min-w-0 flex-col overflow-hidden rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-canvas [&:has(+*)]:mb-0 dark:border-rb-line dark:bg-rb-canvas";
const skeleton =
  "rounded-[var(--rb-r-sm,6px)] bg-rb-soft";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";
const emptyDescription =
  "max-w-[48ch] text-[13px]/[18px] text-rb-fg/80";
const primaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_94%,black))] text-[var(--rb-accent-fg,oklch(100%_0_0))] shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.22),0_2px_5px_-2px_rgb(0_0_0/0.3)] hover:not-disabled:brightness-110 active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(20.5%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] disabled:opacity-40 disabled:shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_84%,white),color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_94%,black))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))] dark:shadow-[inset_0_2px_0_-1px_rgb(255_255_255/0.2),inset_0_-2px_0_-1px_rgb(0_0_0/0.3),inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),0_1px_1px_rgb(0_0_0/0.66),0_2px_5px_-2px_rgb(0_0_0/0.9)] dark:active:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--rb-accent,oklch(100%_0_0))_88%,black),inset_0_1px_2px_rgb(0_0_0/0.42)] dark:disabled:shadow-none";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";

const STARTERS: {
  icon: IconSvgElement;
  title: string;
  body: string;
  meta: string;
}[] = [
  {
    icon: Plug01Icon,
    title: "Connect a warehouse",
    body: "Postgres, BigQuery or Snowflake. Read-only credentials are enough.",
    meta: "About 2 minutes",
  },
  {
    icon: FileSpreadsheetIcon,
    title: "Upload a spreadsheet",
    body: "Drop in a CSV and we will infer the column types for you.",
    meta: "No setup",
  },
  {
    icon: DatabaseIcon,
    title: "Load the sample dataset",
    body: "A fictional storefront with 18 months of orders to explore.",
    meta: "Instant",
  },
];

const GHOST_ROWS = [
  [72, 40, 28],
  [56, 52, 36],
  [64, 34, 44],
  [48, 46, 30],
];

export default function EmptyState1() {
  return (
    <div
      className={cx(
        canvas,
        text1,
        "flex h-full min-h-[640px] w-full flex-col overflow-y-auto p-4 sm:p-6",
      )}
    >
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center-safe">
        <div className="relative">
          <div
            aria-hidden
            className={cx(panel, "pointer-events-none select-none pt-1")}
          >
            <div className={cx(panelBody, "space-y-1 p-1")}>
              {GHOST_ROWS.map((row, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2.5"
                  style={{ opacity: 1 - i * 0.22 }}
                >
                  <span className={cx(skeleton, "h-5 w-5 shrink-0")} />
                  {row.map((w, j) => (
                    <span
                      key={j}
                      className={cx(skeleton, "h-2")}
                      style={{ width: `${w}px` }}
                    />
                  ))}
                  <span className={cx(skeleton, "ml-auto h-2 w-10")} />
                </div>
              ))}
            </div>
          </div>
          <div
            aria-hidden
            className={cx(
              fadeBottom,
              "pointer-events-none absolute inset-x-0 bottom-0 h-24",
            )}
          />
        </div>

        <div className="mt-6 text-center">
          <h2 className={cx(typeHeadingSm, text1)}>
            Nothing in this workspace yet
          </h2>
          <p className={cx(emptyDescription, "mx-auto mt-2 text-balance")}>
            Point Northwind at a source and the first charts build themselves.
            You can change or remove a source at any time.
          </p>
        </div>

        <div className={cx(panel, "mt-5 shrink-0")}>
          <ul className="grid gap-1 p-1 sm:grid-cols-3">
            {STARTERS.map(({ icon, title, body, meta }) => (
              <li key={title} className={cx(insetBody, cornerSm)}>
                <button
                  type="button"
                  className={cx(
                    hoverFill,
                    pressedFill,
                    transition,
                    focusRingInset,
                    cornerSm,
                    "group flex h-full w-full cursor-pointer flex-col items-start p-4 text-left",
                  )}
                >
                  <HugeiconsIcon
                    icon={icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className={cx(text2, "block")}
                  />
                  <span
                    className={cx(
                      typeLabel,
                      text1,
                      "mt-3 flex items-center gap-1",
                    )}
                  >
                    {title}
                    <HugeiconsIcon
                      icon={ArrowRight02Icon}
                      size={12}
                      strokeWidth={1.8}
                      aria-hidden="true"
                      className={cx(
                        transition,
                        "opacity-0 group-hover:opacity-100",
                      )}
                    />
                  </span>
                  <span
                    className={cx(typeBodySm, text2, "mt-1 block text-pretty")}
                  >
                    {body}
                  </span>
                  <span
                    className={cx(typeCaption, text3, "mt-auto block pt-2")}
                  >
                    {meta}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            className={cx(primaryButton, buttonMd, "w-full sm:w-auto")}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            Add a source
          </button>
          <button
            type="button"
            className={cx(secondaryButton, buttonMd, "w-full sm:w-auto")}
          >
            Read the setup guide
          </button>
        </div>
      </div>
    </div>
  );
}
