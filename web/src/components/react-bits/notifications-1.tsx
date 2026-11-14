"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  AtIcon,
  Cancel01Icon,
  GitPullRequestIcon,
  Message01Icon,
  BellIcon,
  SecurityCheckIcon,
  Tick02Icon,
  TickDouble02Icon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const canvas = "bg-rb-canvas";
const text1 = "text-rb-fg";
const text2 = "text-rb-fg/80";
const text3 = "text-rb-muted";
const ruleBottom = "border-b border-rb-line";
const hoverFill = "hover:bg-rb-soft";
const cornerSm = "rounded-[var(--rb-r-sm,6px)]";
const emphasis = "font-medium";
const typeHeadingXs = "text-[16px]/[20px] font-[450] tracking-[-0.015em]";
const typeBodySm = "text-[13px]/[18px] font-normal";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const typeLabelSm = "text-[12px]/[16px] font-[450] tabular-nums";
const secondaryButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] border border-rb-line bg-rb-canvas text-rb-fg shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] hover:not-disabled:border-rb-input hover:not-disabled:bg-linear-to-b hover:not-disabled:from-rb-soft hover:not-disabled:to-rb-soft active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] disabled:border-rb-line disabled:text-rb-muted/60 disabled:shadow-none dark:border-rb-line dark:bg-rb-popover dark:text-rb-fg dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)] dark:hover:not-disabled:border-rb-input dark:hover:not-disabled:from-rb-soft dark:hover:not-disabled:to-rb-soft dark:active:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] dark:disabled:border-rb-line dark:disabled:text-rb-muted/60";
const ghostButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg hover:not-disabled:bg-rb-soft active:bg-rb-soft aria-pressed:bg-rb-soft disabled:text-rb-muted/60 dark:text-rb-fg dark:hover:not-disabled:bg-rb-soft dark:active:bg-rb-soft dark:aria-pressed:bg-rb-soft dark:disabled:text-rb-muted/60";
const buttonMd =
  "h-8 gap-2 rounded-[var(--rb-r-sm,6px)] px-4 text-[14px]/[16px] font-[450]";
const iconButtonSm = "size-7 rounded-[var(--rb-r-sm,6px)]";
const segmentedTrack =
  "inline-flex w-fit max-w-full items-stretch gap-0.5 rounded-[var(--rb-r-sm,6px)] bg-rb-soft p-0.5 dark:bg-rb-soft";
const segmentedMd = "h-8";
const segment =
  "relative inline-flex min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap [&_svg]:shrink-0 rounded-[var(--rb-r-xs,4px)] px-3 text-[14px]/[16px] font-[450] text-rb-fg/80 select-none transition-[background-color,color,outline-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:not-aria-checked:bg-rb-soft hover:not-aria-checked:text-rb-fg active:not-aria-checked:bg-rb-soft aria-checked:bg-rb-canvas aria-checked:text-rb-fg aria-checked:shadow-rb-sm disabled:cursor-not-allowed disabled:text-rb-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:text-rb-fg/80 dark:hover:not-aria-checked:bg-rb-soft dark:hover:not-aria-checked:text-rb-fg dark:active:not-aria-checked:bg-rb-soft dark:aria-checked:bg-rb-muted/60 dark:aria-checked:text-rb-fg dark:aria-checked:shadow-[0_0_0_1px_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.3)] dark:disabled:text-rb-muted/60";
const badge =
  "inline-flex h-5 min-w-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-[var(--rb-r-xs,4px)] px-1.5 text-[12px]/[16px] font-[450] tabular-nums";
const badgeNeutral =
  "bg-rb-soft text-rb-fg";
const itemRow =
  "relative flex min-h-10 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-rb-fg transition-[background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] has-[[data-description]]:min-h-14";
const itemMedia =
  "flex size-8 shrink-0 items-center justify-center text-rb-fg/80";
const itemContent = "flex min-w-0 flex-1 flex-col gap-0.5";
const itemDescription =
  "line-clamp-2 text-[13px]/[18px] text-rb-fg/80";
const itemMeta =
  "shrink-0 text-[13px]/[18px] tabular-nums text-rb-muted";
const emptyTitle =
  "text-[16px]/[20px] font-[450] tracking-[-0.015em] text-rb-fg";
const emptyDescription =
  "max-w-[48ch] text-[13px]/[18px] text-rb-fg/80";
const fadeTop =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] ";

const pageTitle = cx(typeHeadingXs, text1);
const detailText = cx(typeBodySm, text2);
const captionText = cx(typeCaption, text3);
const countText = cx(typeLabelSm, text3);
const nameUnread = cx(emphasis, text1);

const EASE: [number, number, number, number] = [0.2, 0, 0, 1];

const TABS = ["All", "Unread", "Mentions"] as const;
type Tab = (typeof TABS)[number];

type Kind = "mention" | "comment" | "review" | "member" | "security";

const ICONS: Record<Kind, IconSvgElement> = {
  mention: AtIcon,
  comment: Message01Icon,
  review: GitPullRequestIcon,
  member: UserAdd01Icon,
  security: SecurityCheckIcon,
};

type Item = {
  id: string;
  kind: Kind;
  actor: string;
  action: string;
  target: string;
  detail?: string;
  time: string;
  group: "Today" | "Yesterday" | "Earlier";
  unread: boolean;
};

const SEED: Item[] = [
  {
    id: "n1",
    kind: "mention",
    actor: "Ana Reyes",
    action: "mentioned you in",
    target: "Q3 rollout plan",
    detail:
      "Can you confirm the migration window before we lock the schedule with Northwind?",
    time: "12m",
    group: "Today",
    unread: true,
  },
  {
    id: "n2",
    kind: "review",
    actor: "Wei Chen",
    action: "requested review on",
    target: "Billing usage meter",
    detail: "14 files changed across the metering service and the invoice job.",
    time: "48m",
    group: "Today",
    unread: true,
  },
  {
    id: "n3",
    kind: "comment",
    actor: "Marco Silva",
    action: "replied in",
    target: "Onboarding checklist",
    detail: "Moved the workspace step ahead of the invite step. Looks cleaner.",
    time: "2h",
    group: "Today",
    unread: true,
  },
  {
    id: "n4",
    kind: "member",
    actor: "Priya Nandakumar",
    action: "joined",
    target: "Cedar Labs",
    detail: "Invited by you as an editor.",
    time: "5h",
    group: "Today",
    unread: false,
  },
  {
    id: "n5",
    kind: "security",
    actor: "Halcyon",
    action: "signed in from a new device on",
    target: "macOS, Lisbon",
    detail: "If this was not you, revoke the session and rotate your keys.",
    time: "Yesterday",
    group: "Yesterday",
    unread: true,
  },
  {
    id: "n6",
    kind: "mention",
    actor: "Sofia Alvarez",
    action: "mentioned you in",
    target: "Retention teardown",
    detail:
      "Pulled your cohort chart into the summary. Shout if that is stale.",
    time: "Yesterday",
    group: "Yesterday",
    unread: false,
  },
  {
    id: "n7",
    kind: "comment",
    actor: "Marco Silva",
    action: "resolved your comment in",
    target: "Meridian import",
    time: "2d",
    group: "Earlier",
    unread: false,
  },
  {
    id: "n8",
    kind: "review",
    actor: "Ana Reyes",
    action: "approved",
    target: "Sidebar density pass",
    time: "3d",
    group: "Earlier",
    unread: false,
  },
];

const GROUPS = ["Today", "Yesterday", "Earlier"] as const;

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

function useScrollFade<T extends HTMLElement>(key: string) {
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
  }, [update, key]);
  return { ref, edges, onScroll: update };
}

function Name({
  unread,
  children,
}: {
  unread: boolean;
  children: React.ReactNode;
}) {
  return unread ? (
    <strong className={nameUnread}>{children}</strong>
  ) : (
    <span className={text1}>{children}</span>
  );
}

export default function Notifications1() {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>("All");
  const [items, setItems] = useState<Item[]>(SEED);

  const unread = items.filter((i) => i.unread).length;

  const visible = useMemo(
    () =>
      items.filter((i) =>
        tab === "Unread"
          ? i.unread
          : tab === "Mentions"
            ? i.kind === "mention"
            : true,
      ),
    [items, tab],
  );

  const {
    ref: listRef,
    edges: listEdges,
    onScroll: onListScroll,
  } = useScrollFade<HTMLDivElement>(`${tab}-${visible.length}`);

  const grouped = GROUPS.map((g) => ({
    group: g,
    rows: visible.filter((i) => i.group === g),
  })).filter((g) => g.rows.length > 0);

  const toggleRead = (id: string) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, unread: !i.unread } : i)),
    );

  const dismiss = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const markAll = () =>
    setItems((prev) => prev.map((i) => ({ ...i, unread: false })));

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[680px] w-full flex-col overflow-hidden",
      )}
    >
      <header
        className={cx(
          ruleBottom,
          "flex flex-wrap items-center justify-between gap-3 px-5 py-4",
        )}
      >
        <div className="flex items-center gap-2.5">
          <h2 className={pageTitle}>Notifications</h2>
          <AnimatePresence initial={false}>
            {unread > 0 && (
              <motion.span
                key="count"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={
                  reduce
                    ? undefined
                    : { opacity: 0, transition: { duration: 0.12, ease: EASE } }
                }
                transition={{ duration: 0.16, ease: EASE }}
                className={cx(badge, badgeNeutral)}
              >
                {unread}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={markAll}
          disabled={unread === 0}
          className={cx(secondaryButton, buttonMd)}
        >
          <HugeiconsIcon
            icon={TickDouble02Icon}
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          Mark all read
        </button>
      </header>

      <div className="px-5 pt-4">
        <div
          role="radiogroup"
          aria-label="Filter notifications"
          onKeyDown={onRadioKeys}
          className={cx(segmentedTrack, segmentedMd)}
        >
          {TABS.map((t) => {
            const active = t === tab;
            const n =
              t === "Unread"
                ? unread
                : t === "Mentions"
                  ? items.filter((i) => i.kind === "mention").length
                  : items.length;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t)}
                className={segment}
              >
                {t}
                <span className={countText}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onListScroll}
          className="h-full overflow-y-auto px-5 py-4"
        >
          {grouped.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
              <span className="flex h-10 w-10 items-center justify-center">
                <HugeiconsIcon
                  icon={BellIcon}
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className={text2}
                />
              </span>
              <p className={emptyTitle}>Nothing here</p>
              <div className="max-w-[26ch]">
                <p className={emptyDescription}>
                  You are caught up on {tab.toLowerCase()} notifications.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ group, rows }) => (
                <section key={group}>
                  <h3 className={cx(captionText, "px-3 pb-2")}>{group}</h3>
                  <ul className="space-y-1">
                    <AnimatePresence initial={false}>
                      {rows.map((item) => (
                        <motion.li
                          key={item.id}
                          layout={reduce ? false : "position"}
                          initial={false}
                          exit={
                            reduce
                              ? undefined
                              : {
                                  opacity: 0,
                                  transition: { duration: 0.12, ease: EASE },
                                }
                          }
                          transition={{ duration: 0.16, ease: EASE }}
                          className="group/row relative overflow-hidden"
                        >
                          <div
                            className={cx(itemRow, hoverFill, cornerSm, "px-3")}
                          >
                            <span
                              className={cx(
                                itemMedia,
                                "h-[18px] w-[28px]",
                                item.detail && "self-start",
                              )}
                            >
                              <HugeiconsIcon
                                icon={ICONS[item.kind]}
                                size={14}
                                strokeWidth={1.8}
                                aria-hidden="true"
                              />
                            </span>

                            <div className={itemContent}>
                              <p className={detailText}>
                                {item.unread && (
                                  <span className="sr-only">Unread: </span>
                                )}
                                <Name unread={item.unread}>{item.actor}</Name>{" "}
                                {item.action}{" "}
                                <Name unread={item.unread}>{item.target}</Name>
                              </p>
                              {item.detail && (
                                <p data-description className={itemDescription}>
                                  {item.detail}
                                </p>
                              )}
                            </div>

                            <div
                              className={cx(
                                "relative flex min-w-12 shrink-0 justify-end",
                                item.detail && "self-start",
                              )}
                            >
                              <span
                                className={cx(
                                  itemMeta,
                                  "group-focus-within/row:opacity-0 group-hover/row:opacity-0",
                                )}
                              >
                                {item.time}
                              </span>
                              <div className="absolute top-1/2 -right-1.5 flex -translate-y-1/2 items-center gap-1 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => toggleRead(item.id)}
                                  aria-label={
                                    item.unread ? "Mark as read" : "Mark unread"
                                  }
                                  className={cx(ghostButton, iconButtonSm)}
                                >
                                  <HugeiconsIcon
                                    icon={item.unread ? Tick02Icon : BellIcon}
                                    size={16}
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dismiss(item.id)}
                                  aria-label="Dismiss notification"
                                  className={cx(ghostButton, iconButtonSm)}
                                >
                                  <HugeiconsIcon
                                    icon={Cancel01Icon}
                                    size={16}
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                  />
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
        <div
          aria-hidden="true"
          className={cx(
            fadeTop,
            "pointer-events-none absolute inset-x-0 top-0 h-8",
            listEdges.start ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden="true"
          className={cx(
            fadeBottom,
            "pointer-events-none absolute inset-x-0 bottom-0 h-8",
            listEdges.end ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}
