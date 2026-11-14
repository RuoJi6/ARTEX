"use client";

import * as React from "react";

import { useTranslation } from "react-i18next";

import { cx } from "@/components/rb/tokens";

function formatClock(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function LiveClock({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <time
      role="timer"
      className={cx(
        "hidden rounded-[var(--rb-r-sm,6px)] border border-rb-line bg-rb-subtle px-2 py-1 font-mono text-[11px] text-rb-muted tabular-nums sm:inline-flex",
        className,
      )}
      dateTime={now?.toISOString()}
      aria-label={t("clock.current")}
      title={t("clock.local")}
    >
      {now ? formatClock(now) : "---- -- -- --:--:--"}
    </time>
  );
}
