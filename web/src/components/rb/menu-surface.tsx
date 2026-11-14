"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cx, menuPopup, overlayFade } from "./tokens";

interface MenuSurfaceProps {
  open: boolean;
  onClose: () => void;
  label: string;
  align?: "left" | "right";
  width?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Dropdown surface used by the React Bits Pro app shell menus: fade-in popover
 * with outside-pointer dismissal, Escape-to-close and arrow-key roving focus
 * over [role="menuitem"] children — same behaviour contract as the vendored
 * blocks (navbar-6 / app-sidebar-1).
 */
export function MenuSurface({
  open,
  onClose,
  label,
  align = "right",
  width = "w-[240px]",
  className,
  children,
}: MenuSurfaceProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const doc = node?.ownerDocument ?? document;
    const onPointerDown = (event: Event) => {
      if (!node?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(node?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (items.length === 0) return;
      const index = items.indexOf(doc.activeElement as HTMLElement);
      if (event.key === "ArrowDown") {
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
      doc.removeEventListener("pointerdown", onPointerDown);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="menu"
          aria-label={label}
          {...overlayFade(reduce)}
          className={cx(
            menuPopup,
            "absolute top-full z-30 mt-1.5 origin-top-right",
            align === "right" ? "right-0" : "left-0",
            width,
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
