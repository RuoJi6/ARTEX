"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

function formatClock(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function LiveClock({ className }: { className?: string }) {
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
      className={cn(
        "hidden rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground tabular-nums sm:inline-flex",
        className,
      )}
      dateTime={now?.toISOString()}
      aria-label="当前时间"
      title="当前本地时间"
    >
      {now ? formatClock(now) : "---- -- -- --:--:--"}
    </time>
  );
}
