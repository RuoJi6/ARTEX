"use client";

import { useCallback } from "react";

import { useLiveTranslation } from "./use-live-translation";

export type UITranslate = (key: string, values?: Record<string, unknown>) => string;

// ui follows the render locale; liveUI stays stable for polling and event callbacks.
export function useUITranslation() {
  const { t, liveT, i18n } = useLiveTranslation();
  const ui: UITranslate = useCallback((key, values) => String(t(key, values ?? {})), [t]);
  const liveUI: UITranslate = useCallback((key, values) => String(liveT(key, values ?? {})), [liveT]);
  return { ui, liveUI, i18n };
}
