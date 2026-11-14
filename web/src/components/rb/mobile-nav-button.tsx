"use client";

import { Menu01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cx, ghostButton, iconButtonMd } from "./tokens";

/** Window event the app shell listens for to open the mobile navigation drawer. */
export const OPEN_MOBILE_NAV_EVENT = "artex:open-mobile-nav";

/**
 * Mobile navigation trigger for pages that render their own header (task
 * detail, findings detail) instead of the global shell navbar. Dispatches a
 * window event the shell's sidebar listens for.
 */
export function MobileNavButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Open navigation"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_MOBILE_NAV_EVENT))}
      className={cx(ghostButton, iconButtonMd, className)}
    >
      <HugeiconsIcon icon={Menu01Icon} size={16} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
