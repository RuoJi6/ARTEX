"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ArrowDown01Icon, Cancel01Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { NavGroup, NavSubItem } from "@/navigation/sidebar/sidebar-items";

import { OPEN_MOBILE_NAV_EVENT } from "./mobile-nav-button";
import { navIcon } from "./nav-icons";
import {
  avatar,
  avatarFallback,
  brandMark,
  buttonLg,
  canvas,
  cx,
  fadeBottomOnTray,
  fadeTopOnTray,
  ghostButton,
  ghostButtonMuted,
  iconButtonMd,
  menuItem,
  menuPopup,
  navGroupLabel,
  navItem,
  overlayEnter,
  overlayFade,
  overlayShadow,
  ruleTop,
  sidebarSurface,
  text1,
  text3,
  truncateFade,
  typeCaption,
  typeLabel,
} from "./tokens";

export interface AccountMenuItem {
  id: string;
  label: string;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  onSelect: () => void;
  danger?: boolean;
}

interface SidebarBodyProps {
  collapsed: boolean;
  groups: NavGroup[];
  pathname: string;
  user: { name: string; username: string; role: string };
  accountMenu: AccountMenuItem[];
  onToggleCollapse?: () => void;
  onClose?: () => void;
  onNavigate?: () => void;
}

function isActive(pathname: string, url: string) {
  if (url === "/dashboard") return pathname === "/dashboard";
  return pathname === url || pathname.startsWith(`${url}/`);
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

function SidebarBody({
  collapsed,
  groups,
  pathname,
  user,
  accountMenu,
  onToggleCollapse,
  onClose,
  onNavigate,
}: SidebarBodyProps) {
  const [userOpen, setUserOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const { ref: navRef, edges: navEdges, onScroll: onNavScroll } = useScrollFade<HTMLElement>();
  const footerRef = useRef<HTMLDivElement>(null);
  const userTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setUserOpen(false);
    setShown(false);
    if (restoreFocus) userTriggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!userOpen) return;
    const node = footerRef.current;
    const doc = node?.ownerDocument ?? document;
    const frame = requestAnimationFrame(() => setShown(true));

    const onPointerDown = (event: Event) => {
      if (!node?.contains(event.target as Node)) closeMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      if (items.length === 0) return;
      const index = items.indexOf(doc.activeElement as HTMLElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        items[index < 0 || index === items.length - 1 ? 0 : index + 1]?.focus({ preventScroll: true });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[index <= 0 ? items.length - 1 : index - 1]?.focus({ preventScroll: true });
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
  }, [userOpen, closeMenu]);

  const initials = (user.name || user.username || "A").slice(0, 2).toUpperCase();

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 pr-2 pl-4">
        <span className={cx(brandMark, "size-8", typeLabel)}>A</span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className={cx(typeLabel, text1, "truncate")}>ARTEX</p>
            <p className={cx(typeCaption, text3, "truncate")}>{user.role}</p>
          </div>
        )}
        {onClose && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className={cx(ghostButton, iconButtonMd)}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <nav ref={navRef} onScroll={onNavScroll} aria-label="Primary" className="h-full overflow-y-auto px-2 pb-3">
          <div className={cx(collapsed && "space-y-4")}>
            {groups.map((group) => (
              <div key={group.id}>
                {!collapsed && group.label && <p className={navGroupLabel}>{group.label}</p>}
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const subItems = (item as { subItems?: NavSubItem[] }).subItems;
                    if (subItems?.length) {
                      return (
                        <li key={item.id}>
                          {!collapsed && <p className={cx(navGroupLabel, "pt-2 pb-0.5")}>{item.title}</p>}
                          <ul className="space-y-0.5">
                            {subItems.map((sub) => (
                              <li key={sub.id}>
                                <Link
                                  href={sub.url}
                                  aria-current={isActive(pathname, sub.url) ? "page" : undefined}
                                  title={collapsed ? sub.title : undefined}
                                  onClick={onNavigate}
                                  className={cx(navItem, collapsed && "justify-center", "pl-6")}
                                >
                                  <HugeiconsIcon
                                    icon={navIcon(sub.id)}
                                    size={16}
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                  />
                                  {!collapsed && <span className={cx(truncateFade, "flex-1")}>{sub.title}</span>}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    }
                    const link = item as { url: string };
                    return (
                      <li key={item.id}>
                        <Link
                          href={link.url}
                          aria-current={isActive(pathname, link.url) ? "page" : undefined}
                          title={collapsed ? item.title : undefined}
                          onClick={onNavigate}
                          className={cx(navItem, collapsed && "justify-center")}
                        >
                          <HugeiconsIcon icon={navIcon(item.id)} size={16} strokeWidth={1.8} aria-hidden="true" />
                          {!collapsed && <span className={cx(truncateFade, "flex-1")}>{item.title}</span>}
                        </Link>
                      </li>
                    );
                  })}
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

      <div ref={footerRef} className={cx(ruleTop, "relative shrink-0 space-y-1 p-2")}>
        {onToggleCollapse && (
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : undefined}
            onClick={onToggleCollapse}
            className={cx(navItem, collapsed && "justify-center")}
          >
            <HugeiconsIcon icon={SidebarLeftIcon} size={16} strokeWidth={1.8} aria-hidden="true" />
            {!collapsed && (
              <span className="min-w-0 flex-1 truncate text-left">{collapsed ? "Expand" : "Collapse"}</span>
            )}
          </button>
        )}

        <button
          ref={userTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={userOpen}
          onClick={() => (userOpen ? closeMenu(false) : setUserOpen(true))}
          className={cx(ghostButtonMuted, buttonLg, "w-full gap-2.5 ps-2 pe-2 text-left")}
        >
          <span className={avatar}>
            <span className={avatarFallback}>{initials}</span>
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className={cx(typeLabel, text1, "block truncate")}>{user.name || user.username}</span>
                <span className={cx(typeCaption, text3, "block truncate")}>{user.username}</span>
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
            {accountMenu.map(({ id, label, icon, onSelect, danger }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu(true);
                  onSelect();
                }}
                className={cx(menuItem, danger && "text-red-600 dark:text-red-400")}
              >
                <HugeiconsIcon icon={icon} size={16} strokeWidth={1.8} aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

interface AppSidebarProps {
  groups: NavGroup[];
  user: { name: string; username: string; role: string };
  accountMenu: AccountMenuItem[];
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function AppSidebar({
  groups,
  user,
  accountMenu,
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
}: AppSidebarProps) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [_drawerShown, setDrawerShown] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);

  // Pages with their own header (task/findings detail) open the drawer through a
  // window event — they have no access to the shell's state.
  useEffect(() => {
    const onOpenNav = () => onMobileOpenChange(true);
    window.addEventListener(OPEN_MOBILE_NAV_EVENT, onOpenNav);
    return () => window.removeEventListener(OPEN_MOBILE_NAV_EVENT, onOpenNav);
  }, [onMobileOpenChange]);

  // Route changes close the mobile drawer.
  useEffect(() => {
    if (mobileOpen) onMobileOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileOpen, onMobileOpenChange]);

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
    getFocusable()[0]?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onMobileOpenChange(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileOpen, onMobileOpenChange]);

  const closeMobile = useCallback(() => {
    onMobileOpenChange(false);
  }, [onMobileOpenChange]);

  return (
    <>
      <aside
        className={cx(
          sidebarSurface,
          "hidden shrink-0 flex-col transition-[width] duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)] lg:flex",
          collapsed ? "w-14" : "w-64",
        )}
      >
        <SidebarBody
          collapsed={collapsed}
          groups={groups}
          pathname={pathname}
          user={user}
          accountMenu={accountMenu}
          onToggleCollapse={() => onCollapsedChange(!collapsed)}
        />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="lg:hidden">
            <motion.button
              type="button"
              aria-label="Close navigation overlay"
              onClick={closeMobile}
              tabIndex={-1}
              {...overlayFade(reduce)}
              className={cx(canvas, "fixed inset-0 z-30 cursor-pointer bg-rb-overlay")}
            />
            <motion.aside
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
              className={cx(
                sidebarSurface,
                overlayShadow,
                "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85%] flex-col",
              )}
            >
              <SidebarBody
                collapsed={false}
                groups={groups}
                pathname={pathname}
                user={user}
                accountMenu={accountMenu}
                onClose={closeMobile}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
