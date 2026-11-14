"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { ArrowDown01Icon, ArrowUp01Icon, CornerDownLeftIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { NavGroup } from "@/navigation/sidebar/sidebar-items";

import { navIcon } from "./nav-icons";
import {
  buttonMd,
  cx,
  ghostButton,
  menuItem,
  secondaryButton,
  text3,
  transition,
  typeBodySm,
  typeCaption,
} from "./tokens";

const backdrop = "bg-rb-overlay";
const kbd =
  "inline-flex min-h-5 min-w-5 w-fit items-center justify-center gap-1 rounded-[var(--rb-r-xs,4px)] border border-rb-line bg-rb-popover px-1 font-mono text-[12px]/[16px] tabular-nums text-rb-fg/80 select-none";
const itemContent = "flex min-w-0 flex-1 flex-col gap-0.5";
const detailText = cx(typeBodySm, text3);
const menuLabel = "px-2 pt-2 pb-1 text-[12px]/[16px] font-normal tabular-nums text-rb-muted";
const dialogShell =
  "flex max-h-[calc(100%-4rem)] flex-col overflow-hidden rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-subtle text-rb-fg outline-none shadow-rb-overlay dark:bg-rb-popover";
const dialogCard =
  "mx-1 mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-canvas [&:last-child]:mb-1 dark:bg-rb-canvas";
const commandSearch =
  "flex min-h-10 shrink-0 items-center gap-2 border-b border-rb-line ps-4 pe-2 text-rb-muted has-[input:focus-visible]:border-transparent has-[input:focus-visible]:shadow-[inset_0_0_0_1px_var(--rb-accent,oklch(20.5%_0_0))]";
const commandInput =
  "h-full min-w-0 flex-1 bg-transparent text-[14px]/[16px] font-[450] text-rb-fg outline-none placeholder:text-rb-muted";
const emptyTitle = "text-[16px]/[20px] font-[450] tracking-[-0.015em] text-rb-fg";
const emptyDescription = "max-w-[48ch] text-[13px]/[18px] text-rb-fg/80";
const fadeTop =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]";
const fadeBottom =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]";

const EXIT_MS = 140;
const FADE_PX = 32;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export interface PaletteAction {
  id: string;
  title: string;
  detail?: string;
  icon: IconSvgElement;
  shortcut?: string;
  run: () => void;
}

export interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroup[];
  actions: PaletteAction[];
}

interface Command {
  id: string;
  title: string;
  detail?: string;
  group: string;
  icon: IconSvgElement;
  shortcut?: string;
  url?: string;
  run?: () => void;
}

function matches(command: Command, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${command.title} ${command.detail ?? ""} ${command.group}`.toLowerCase().includes(q);
}

export function SearchPalette({ open, onOpenChange, groups, actions }: SearchPaletteProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [edges, setEdges] = useState({ start: false, end: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const listboxId = `${uid}-listbox`;

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = groups.flatMap((group) =>
      group.items.map((item) => {
        const link = item as { url?: string };
        return {
          id: `nav-${item.id}`,
          title: item.title,
          detail: group.label,
          group: group.label ?? "",
          icon: navIcon(item.id),
          url: link.url,
        };
      }),
    );
    const acts: Command[] = actions.map((action) => ({
      id: `action-${action.id}`,
      title: action.title,
      detail: action.detail,
      group: t("nav.features"),
      icon: action.icon,
      shortcut: action.shortcut,
      run: action.run,
    }));
    return [...acts, ...nav];
  }, [groups, actions, t]);

  const filtered = useMemo(() => commands.filter((command) => matches(command, query)), [commands, query]);
  const activeCommand = filtered[activeIndex];
  const activeId = activeCommand ? `${uid}-${activeCommand.id}` : undefined;

  const close = useCallback(() => {
    setShown(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onOpenChange(false);
      setQuery("");
      setActiveIndex(0);
    }, EXIT_MS);
  }, [onOpenChange]);

  useEffect(() => {
    if (open) {
      clearTimeout(timerRef.current);
      setQuery("");
      setActiveIndex(0);
      const frame = requestAnimationFrame(() => {
        setShown(true);
        inputRef.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    return undefined;
  }, [open]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // ⌘K / Ctrl+K toggles the palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else onOpenChange(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close, onOpenChange]);

  const run = useCallback(
    (command: Command) => {
      if (command.url) router.push(command.url);
      else command.run?.();
      close();
    },
    [router, close],
  );

  const move = (delta: number) => {
    setActiveIndex((i) => {
      const count = filtered.length;
      if (count === 0) return 0;
      return (i + delta + count) % count;
    });
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(Math.max(filtered.length - 1, 0));
        break;
      case "Enter":
        if (!activeCommand) break;
        event.preventDefault();
        run(activeCommand);
        break;
    }
  };

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const focused = root.ownerDocument.activeElement;
    if (event.shiftKey && focused === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && focused === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  // Keep the active row in view while arrowing through the list.
  useEffect(() => {
    const scroller = listRef.current;
    const row = scroller?.querySelector<HTMLElement>('[data-active="true"]');
    if (!scroller || !row) return;
    const listBox = scroller.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    if (rowBox.top < listBox.top + FADE_PX) {
      const next = scroller.scrollTop - (listBox.top + FADE_PX - rowBox.top);
      scroller.scrollTop = next < FADE_PX ? 0 : next;
    } else if (rowBox.bottom > listBox.bottom - FADE_PX) {
      const end = scroller.scrollHeight - scroller.clientHeight;
      const next = scroller.scrollTop + (rowBox.bottom - listBox.bottom + FADE_PX);
      scroller.scrollTop = next > end - FADE_PX ? end : next;
    }
  }, []);

  if (!open) return null;

  const groupOrder: string[] = [];
  for (const command of filtered) {
    if (!groupOrder.includes(command.group)) groupOrder.push(command.group);
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close menu"
        onClick={close}
        className={cx(backdrop, "absolute inset-0 cursor-default", shown ? "opacity-100" : cx(transition, "opacity-0"))}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        onKeyDown={onDialogKeyDown}
        className={cx(
          dialogShell,
          "absolute top-[12%] left-1/2 max-h-[min(76%,calc(100%-4rem))] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2",
          shown ? "opacity-100" : cx(transition, "opacity-0"),
        )}
      >
        <h2 id={`${uid}-title`} className="sr-only">
          {t("search.placeholder")}
        </h2>

        <div className={dialogCard}>
          <div className={cx(commandSearch, "h-12")}>
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
            <label htmlFor={`${uid}-input`} className="sr-only">
              {t("search.placeholder")}
            </label>
            <input
              ref={inputRef}
              id={`${uid}-input`}
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder={t("search.placeholder")}
              className={commandInput}
            />
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              ref={listRef}
              onScroll={(event) => {
                const el = event.currentTarget;
                setEdges({
                  start: el.scrollTop > 1,
                  end: Math.ceil(el.scrollTop + el.clientHeight) < el.scrollHeight - 1,
                });
              }}
              className="min-h-0 flex-1 overflow-y-auto p-2"
            >
              {filtered.length > 0 ? (
                <div id={listboxId} role="listbox" aria-label="Commands">
                  {groupOrder.map((group) => {
                    const rows = filtered.filter((c) => c.group === group);
                    if (rows.length === 0) return null;
                    const groupId = `${uid}-${group}`;
                    return (
                      // biome-ignore lint/a11y/useSemanticElements: listbox group pattern from the React Bits command menu block.
                      <div key={group} role="group" aria-labelledby={groupId} className="mb-1 last:mb-0">
                        <p id={groupId} className={menuLabel}>
                          {group}
                        </p>
                        {rows.map((command) => {
                          const index = filtered.indexOf(command);
                          const selected = index === activeIndex;
                          return (
                            <button
                              key={command.id}
                              id={`${uid}-${command.id}`}
                              role="option"
                              aria-selected={selected}
                              data-active={selected}
                              data-highlighted={selected || undefined}
                              type="button"
                              tabIndex={-1}
                              onPointerMove={() => setActiveIndex(index)}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setActiveIndex(index);
                                run(command);
                              }}
                              className={cx(menuItem, "min-h-11")}
                            >
                              <HugeiconsIcon icon={command.icon} size={16} strokeWidth={1.8} aria-hidden="true" />
                              <span className={itemContent}>
                                <span className="truncate">{command.title}</span>
                                {command.detail && <span className={cx(detailText, "truncate")}>{command.detail}</span>}
                              </span>
                              {command.shortcut && <kbd className={kbd}>{command.shortcut}</kbd>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center px-2.5 py-10 text-center">
                  <p className={emptyTitle}>{t("search.empty")}</p>
                  <p className={cx(emptyDescription, "mt-1 max-w-xs text-balance")}>{t("search.placeholder")}</p>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setQuery("");
                      setActiveIndex(0);
                      inputRef.current?.focus({ preventScroll: true });
                    }}
                    className={cx(secondaryButton, buttonMd, "mt-4")}
                  >
                    {t("common.retry")}
                  </button>
                </div>
              )}
            </div>
            <div
              aria-hidden="true"
              className={cx(
                fadeTop,
                "pointer-events-none absolute inset-x-0 top-0 h-8",
                edges.start ? "opacity-100" : "opacity-0",
              )}
            />
            <div
              aria-hidden="true"
              className={cx(
                fadeBottom,
                "pointer-events-none absolute inset-x-0 bottom-0 h-8",
                edges.end ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
        </div>

        <div className={cx(typeCaption, text3, "flex h-10 shrink-0 items-center gap-4 px-5")}>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <kbd className={kbd}>
              <HugeiconsIcon icon={ArrowUp01Icon} size={10} strokeWidth={2} aria-hidden="true" />
            </kbd>
            <kbd className={kbd}>
              <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} aria-hidden="true" />
            </kbd>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className={kbd}>
              <HugeiconsIcon icon={CornerDownLeftIcon} size={12} strokeWidth={1.8} aria-hidden="true" />
            </kbd>
          </span>
          <span className="ml-auto shrink-0 tabular-nums">
            {filtered.length} {filtered.length === 1 ? "result" : "results"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Trigger button rendered in the navbar (kept beside the palette for cohesion). */
export function SearchTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onClick} className={cx(ghostButton, buttonMd, "gap-2 text-rb-muted")}>
      <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.8} aria-hidden="true" />
      <span className="hidden sm:inline">{t("common.search")}</span>
      <kbd className={cx(kbd, "ml-1 hidden sm:inline-flex")}>⌘K</kbd>
    </button>
  );
}
