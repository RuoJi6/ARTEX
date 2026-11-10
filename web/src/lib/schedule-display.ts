import type { TFunction } from "i18next";

import { scheduleRuntimeText } from "@/i18n/schedule-runtime";

import type { TaskSchedule } from "./types";

export function scheduleDisplay(translate: TFunction, locale: string) {
  const weekdays = Array.from({ length: 7 }, (_, index) => translate(`schedule.weekday.${index + 1}`));
  const formatTime = (value?: string) => (value ? new Date(value).toLocaleString(locale) : "—");
  const formatDateValue = (value?: string) => {
    if (!value) return translate("schedule.notSet");
    // Format date-only values without UTC conversion (which can change the day).
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return value;
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(
      new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  };
  const formatClock = (value?: string) => (value ? value.slice(0, 5) : translate("schedule.notSet"));
  const periodLabel = (item: TaskSchedule) => {
    if (item.schedule_type === "once") {
      return item.end_date
        ? translate("schedule.onceRange", { from: formatDateValue(item.run_date), to: formatDateValue(item.end_date) })
        : translate("schedule.onceDate", { date: formatDateValue(item.run_date) });
    }
    const selected = item.weekdays.map((day) => weekdays[day - 1]).filter(Boolean);
    return translate("schedule.weeklyDays", {
      days: selected.length ? new Intl.ListFormat(locale).format(selected) : translate("schedule.noWeekdays"),
    });
  };
  const startLabel = (item: TaskSchedule) =>
    item.schedule_type === "once"
      ? `${formatDateValue(item.run_date)} ${formatClock(item.start_time)}`
      : formatClock(item.start_time);
  const endLabel = (item: TaskSchedule) => {
    if (item.schedule_type === "once" && item.end_date)
      return `${formatDateValue(item.end_date)} ${item.end_time ? formatClock(item.end_time) : "24:00"}`;
    if (!item.end_time) return translate("schedule.continuous");
    return translate("schedule.endClock", {
      time: formatClock(item.end_time),
      nextDay: formatClock(item.end_time) <= formatClock(item.start_time) ? translate("schedule.nextDay") : "",
    });
  };
  const windowLabel = (item: TaskSchedule) => {
    const start = startLabel(item);
    return item.end_time || (item.schedule_type === "once" && item.end_date)
      ? translate("schedule.windowRange", { start, end: endLabel(item) })
      : translate("schedule.continuousFrom", { start });
  };
  const timezoneLabel = (item: TaskSchedule) =>
    item.timezone_mode === "beijing"
      ? translate("schedule.beijing")
      : item.timezone
        ? translate("schedule.systemTimezoneWithName", { timezone: item.timezone })
        : translate("schedule.systemTimezone");
  const nextWindowLabel = (value?: string, timezone?: string) => {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: timezone && timezone !== "Local" ? timezone : undefined,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value));
    } catch {
      return formatTime(value);
    }
  };
  const statusText = (item: TaskSchedule) =>
    translate(`schedule.status.${item.status}`, { defaultValue: translate("schedule.unknownStatus") });
  const historyActionText = (action: string) =>
    translate(`schedule.history.${action}`, { defaultValue: translate("schedule.statusChanged") });
  const scheduleErrorText = (value?: string) => scheduleRuntimeText(value ?? "", translate);
  return {
    weekdays,
    formatTime,
    formatDateValue,
    periodLabel,
    windowLabel,
    startLabel,
    endLabel,
    timezoneLabel,
    nextWindowLabel,
    statusText,
    historyActionText,
    scheduleErrorText,
  };
}
