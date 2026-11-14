"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Activity01Icon,
  ArrowDown01Icon,
  BlocksIcon,
  Cancel01Icon,
  ChartColumnIcon,
  CheckmarkSquare02Icon,
  CreditCardIcon,
  LifebuoyIcon,
  DashboardSpeed01Icon,
  FolderKanbanIcon,
  GridViewIcon,
  InboxIcon,
  Logout03Icon,
  Menu01Icon,
  BellIcon,
  Settings01Icon,
  SidebarLeftIcon,
  UsersIcon,
} from "@hugeicons/core-free-icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

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

const canvas = "bg-rb-canvas";
const backdrop = "bg-rb-overlay";
const text1 = "text-rb-fg";
const text3 = "text-rb-muted";
const ruleTop = "border-t border-rb-line";
const overlayShadow =
  "shadow-rb-overlay";
const typeLabel = "text-[14px]/[16px] font-[450]";
const typeCaption = "text-[12px]/[16px] font-normal tabular-nums";
const brandMark =
  "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--rb-r-sm,6px)] bg-[var(--rb-accent,oklch(20.5%_0_0))] text-[var(--rb-accent-fg,oklch(100%_0_0))] select-none dark:bg-[var(--rb-accent,oklch(100%_0_0))] dark:text-[var(--rb-accent-fg,oklch(20.5%_0_0))]";
const ghostButton =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg hover:not-disabled:bg-rb-soft active:bg-rb-soft aria-pressed:bg-rb-soft disabled:text-rb-muted/60 dark:text-rb-fg dark:hover:not-disabled:bg-rb-soft dark:active:bg-rb-soft dark:aria-pressed:bg-rb-soft dark:disabled:text-rb-muted/60";
const ghostButtonMuted =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,outline-color,scale,filter] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] active:duration-[60ms] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] bg-transparent text-rb-fg/80 hover:not-disabled:bg-rb-soft hover:not-disabled:text-rb-fg active:bg-rb-soft aria-expanded:bg-rb-soft aria-expanded:text-rb-fg disabled:text-rb-muted/60 dark:text-rb-fg/80 dark:hover:not-disabled:bg-rb-soft dark:hover:not-disabled:text-rb-fg dark:active:bg-rb-soft dark:aria-expanded:bg-rb-soft dark:aria-expanded:text-rb-fg dark:disabled:text-rb-muted/60";
const buttonLg =
  "h-11 gap-2 rounded-[var(--rb-r-sm,6px)] px-5 text-[16px]/[20px] font-[450] tracking-[-0.01em]";
const iconButtonMd = "size-8 rounded-[var(--rb-r-sm,6px)]";
const avatar =
  "relative inline-flex size-8 shrink-0 overflow-hidden rounded-full select-none";
const avatarFallback =
  "flex size-full items-center justify-center rounded-[inherit] border border-rb-line bg-rb-popover text-[12px]/[16px] font-[450] tabular-nums text-rb-fg";
const menuPopup =
  "min-w-48 max-w-[min(480px,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--rb-r-lg,10px)] border border-rb-line bg-rb-popover p-1 text-rb-fg outline-none shadow-rb-overlay";
const menuItem =
  "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 py-1.5 text-left text-[14px]/[16px] font-[450] text-rb-fg outline-none select-none [&_svg]:shrink-0 [&_svg]:text-rb-fg/80 hover:bg-rb-soft focus-visible:bg-rb-soft data-[highlighted]:bg-rb-soft aria-selected:bg-rb-soft aria-disabled:cursor-not-allowed aria-disabled:text-rb-muted/60 dark:text-rb-fg dark:[&_svg]:text-rb-fg/80 dark:hover:bg-rb-soft dark:focus-visible:bg-rb-soft dark:data-[highlighted]:bg-rb-soft dark:aria-selected:bg-rb-soft dark:aria-disabled:text-rb-muted/60";
const overlayEnter =
  "transition-opacity duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)] starting:opacity-0 motion-reduce:transition-none";
const sidebarSurface =
  "border-r border-rb-line bg-rb-canvas dark:border-rb-line dark:bg-rb-popover";
const navItem =
  "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--rb-r-sm,6px)] px-2 text-left text-[14px]/[16px] font-[450] text-rb-fg/80 transition-[background-color,color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] [&_svg]:shrink-0 hover:bg-rb-soft hover:text-rb-fg aria-[current=page]:bg-rb-soft aria-[current=page]:text-rb-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rb-accent,oklch(20.5%_0_0))] dark:focus-visible:outline-[var(--rb-accent,oklch(100%_0_0))] dark:text-rb-fg/80 dark:hover:bg-rb-soft dark:hover:text-rb-fg dark:aria-[current=page]:bg-rb-soft dark:aria-[current=page]:text-rb-fg";
const navCount =
  "ms-auto text-[12px]/[16px] font-[450] tabular-nums text-rb-muted";
const navGroupLabel =
  "px-2 pt-4 pb-1 text-[12px]/[16px] font-normal tabular-nums text-rb-muted";
const truncateFade =
  "block min-w-0 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]";
const fadeTopOnTray =
  "bg-linear-to-b from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] dark:from-rb-popover";
const fadeBottomOnTray =
  "bg-linear-to-t from-rb-canvas to-transparent transition-opacity duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] dark:from-rb-popover";

const groups: {
  label: string;
  items: {
    label: string;
    icon: IconSvgElement;
    badge?: string;
    current?: boolean;
  }[];
}[] = [
  {
    label: "Workspace",
    items: [
      {
        label: "Command center",
        icon: GridViewIcon,
        badge: "8",
        current: true,
      },
      { label: "Inbox", icon: InboxIcon, badge: "12" },
      { label: "Approvals", icon: CheckmarkSquare02Icon, badge: "5" },
      { label: "Automations", icon: BlocksIcon },
      { label: "Projects", icon: FolderKanbanIcon },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Performance", icon: DashboardSpeed01Icon },
      { label: "Usage", icon: ChartColumnIcon },
      { label: "Activity log", icon: Activity01Icon },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Members", icon: UsersIcon },
      { label: "Billing", icon: CreditCardIcon },
      { label: "Settings", icon: Settings01Icon },
    ],
  },
];

const accountMenu: { label: string; icon: IconSvgElement }[] = [
  { label: "Account settings", icon: Settings01Icon },
  { label: "Notifications", icon: BellIcon },
  { label: "Help center", icon: LifebuoyIcon },
  { label: "Sign out", icon: Logout03Icon },
];

function SidebarBody({
  collapsed,
  onToggleCollapse,
  onClose,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}) {
  const [userOpen, setUserOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const {
    ref: navRef,
    edges: navEdges,
    onScroll: onNavScroll,
  } = useScrollFade<HTMLElement>();
  const footerRef = useRef<HTMLDivElement>(null);
  const userTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = (restoreFocus: boolean) => {
    setUserOpen(false);
    setShown(false);
    if (restoreFocus) userTriggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!userOpen) return;
    const node = footerRef.current;
    const doc = node?.ownerDocument ?? document;
    const frame = requestAnimationFrame(() => setShown(true));

    const onPointerDown = (event: Event) => {
      if (!node?.contains(event.target as Node)) closeMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
          [],
      );
      if (items.length === 0) return;
      const index = items.indexOf(doc.activeElement as HTMLElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        items[index < 0 || index === items.length - 1 ? 0 : index + 1]?.focus({
          preventScroll: true,
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[index <= 0 ? items.length - 1 : index - 1]?.focus({
          preventScroll: true,
        });
      } else if (event.key === "Home") {
        event.preventDefault();
        items[0]?.focus({ preventScroll: true });
      } else if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1]?.focus({ preventScroll: true });
      }
    };

    doc.addEventListener("pointerdown", onPointerDown);
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      doc.removeEventListener("pointerdown", onPointerDown);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [userOpen]);

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 pl-4 pr-2">
        <span className={cx(brandMark, "size-8", typeLabel)}>M</span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className={cx(typeLabel, text1, "truncate")}>Meridian</p>
            <p className={cx(typeCaption, text3, "truncate")}>Operations</p>
          </div>
        )}
        {onClose && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className={cx(ghostButton, iconButtonMd)}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <nav
          ref={navRef}
          onScroll={onNavScroll}
          aria-label="Primary"
          className="h-full overflow-y-auto px-2 pb-3"
        >
          <div className={cx(collapsed && "space-y-4")}>
            {groups.map((group) => (
              <div key={group.label}>
                {!collapsed && <p className={navGroupLabel}>{group.label}</p>}
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.label}>
                      <a
                        href="#command-center"
                        aria-current={item.current ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cx(navItem, collapsed && "justify-center")}
                      >
                        <HugeiconsIcon
                          icon={item.icon}
                          size={16}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        {!collapsed && (
                          <>
                            <span className={cx(truncateFade, "flex-1")}>
                              {item.label}
                            </span>
                            {item.badge && (
                              <span className={navCount}>{item.badge}</span>
                            )}
                          </>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div
          aria-hidden="true"
          className={cx(
            fadeTopOnTray,
            "pointer-events-none absolute inset-x-0 top-0 h-8",
            navEdges.start ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden="true"
          className={cx(
            fadeBottomOnTray,
            "pointer-events-none absolute inset-x-0 bottom-0 h-8",
            navEdges.end ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      <div
        ref={footerRef}
        className={cx(ruleTop, "relative shrink-0 space-y-1 p-2")}
      >
        {onToggleCollapse && (
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : undefined}
            onClick={onToggleCollapse}
            className={cx(navItem, collapsed && "justify-center")}
          >
            <HugeiconsIcon
              icon={SidebarLeftIcon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            {!collapsed && (
              <span className="min-w-0 flex-1 truncate text-left">
                Collapse sidebar
              </span>
            )}
          </button>
        )}

        <button
          ref={userTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={userOpen}
          onClick={() => (userOpen ? closeMenu(false) : setUserOpen(true))}
          className={cx(
            ghostButtonMuted,
            buttonLg,
            "w-full gap-2.5 ps-2 pe-2 text-left",
          )}
        >
          <span className={avatar}>
            <span className={avatarFallback}>IR</span>
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className={cx(typeLabel, text1, "block truncate")}>
                  Iris Renner
                </span>
                <span className={cx(typeCaption, text3, "block truncate")}>
                  Operations lead
                </span>
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
                className={cx(text3, "shrink-0")}
              />
            </>
          )}
        </button>

        {userOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Account"
            className={cx(
              menuPopup,
              overlayEnter,
              "absolute bottom-[calc(100%-0.25rem)] left-2 z-30",
              collapsed ? "w-[224px] max-w-none" : "right-2",
              shown ? "opacity-100" : "opacity-0",
            )}
          >
            {accountMenu.map(({ label, icon }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => closeMenu(true)}
                className={menuItem}
              >
                <HugeiconsIcon
                  icon={icon}
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function AppSidebar1() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [drawerShown, setDrawerShown] = useState(false);
  const shouldFocusRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const view = triggerRef.current?.ownerDocument.defaultView ?? window;
      if (view.matchMedia("(max-width: 1023px)").matches) setMobileOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    const frame = requestAnimationFrame(() => setDrawerShown(true));
    const doc = drawer?.ownerDocument ?? document;
    const getFocusable = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
    if (shouldFocusRef.current) {
      getFocusable()[0]?.focus({ preventScroll: true });
      shouldFocusRef.current = false;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setDrawerShown(false);
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  const closeMobile = () => {
    setMobileOpen(false);
    setDrawerShown(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      className={cx(
        canvas,
        text1,
        "relative flex h-full min-h-[640px] w-full overflow-hidden",
      )}
    >
      <aside
        className={cx(
          sidebarSurface,
          "hidden shrink-0 flex-col lg:flex",
          collapsed ? "w-14" : "w-64",
        )}
      >
        <SidebarBody
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center px-4 lg:hidden">
          <button
            ref={triggerRef}
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => {
              shouldFocusRef.current = true;
              setMobileOpen(true);
            }}
            className={cx(ghostButton, iconButtonMd)}
          >
            <HugeiconsIcon
              icon={Menu01Icon}
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={closeMobile}
            tabIndex={-1}
            className={cx(
              backdrop,
              overlayEnter,
              "absolute inset-0 z-30 cursor-pointer",
              drawerShown ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className={cx(
              sidebarSurface,
              overlayShadow,
              overlayEnter,
              "absolute inset-y-0 left-0 z-40 flex w-72 max-w-[85%] flex-col",
              drawerShown ? "opacity-100" : "opacity-0",
            )}
          >
            <SidebarBody collapsed={false} onClose={closeMobile} />
          </aside>
        </div>
      )}
    </div>
  );
}
