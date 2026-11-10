"use client";

import { useMemo } from "react";

import { useTranslation } from "react-i18next";

// Keep react-i18next's reactive t for rendering (including React Compiler caches).
// Lifecycle callbacks can use liveT without refetching editable settings on a
// language change; it reads the current language when each callback runs.
export function useLiveTranslation() {
  const translation = useTranslation();
  const { i18n } = translation;
  const liveT = useMemo(() => i18n.t.bind(i18n), [i18n]);
  return { ...translation, liveT };
}
