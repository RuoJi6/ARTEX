"use client";

import { enUS, zhCN } from "react-day-picker/locale";
import { useFormatter, useLocale } from "next-intl";

export const formats = {
  dateTime: {
    shortDate: { year: "numeric", month: "short", day: "numeric" },
    clock: { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false },
    timestamp: {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    },
  },
  number: {
    count: { maximumFractionDigits: 0 },
    compact: { notation: "compact", maximumFractionDigits: 1 },
  },
} as const;

export function useLocaleFormatting() {
  const formatter = useFormatter();
  const locale = useLocale();
  return { ...formatter, calendarLocale: locale === "en" ? enUS : zhCN };
}

export function useDateTime() {
  const formatter = useFormatter();
  return (value: string | number | Date | undefined | null, fallback = "—") => {
    if (value == null || value === "") return fallback;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : formatter.dateTime(date, "timestamp");
  };
}
