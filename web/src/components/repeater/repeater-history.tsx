"use client";
import { Button } from "@/components/ui/button";
import { useUITranslation } from "@/i18n/use-ui-translation";

import type { RepeaterTab } from "./repeater-state";
import { useRepeaterStore } from "./repeater-store";

export function RepeaterHistory({ tab }: { tab?: RepeaterTab }) {
  const { ui } = useUITranslation();

  const updateTab = useRepeaterStore((state) => state.updateTab);
  const busy = useRepeaterStore((state) => (tab ? state.inflight[tab.id] !== undefined : false));
  return (
    <section
      aria-label={ui("screen.5898c0975d279b")}
      className="flex min-h-20 flex-1 flex-col gap-2 overflow-hidden border-t pt-3"
    >
      <div className="flex items-center justify-between px-1 text-muted-foreground text-xs">
        <h3 className="font-medium">{ui("screen.5898c0975d279b")}</h3>
        <span>
          {tab?.history.length ?? 0} {ui("screen.f004f1d84cf962")}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {!tab?.history.length ? (
          <p className="px-1 text-muted-foreground text-xs">{ui("screen.dcae0dc68f8c0f")}</p>
        ) : (
          tab.history.map((entry) => (
            <Button
              key={entry.id}
              variant="ghost"
              disabled={busy}
              className="h-auto w-full shrink-0 flex-col items-start gap-1 px-2 py-2 text-left"
              onClick={() =>
                updateTab(tab.id, {
                  method: entry.method,
                  url: entry.url,
                  headersText: entry.headersText,
                  body: entry.body,
                  rawRequest: entry.rawRequest,
                  targetOrigin: entry.targetOrigin,
                  useProxy: entry.useProxy,
                  insecure: entry.insecure,
                  response: entry.response,
                })
              }
              title={entry.url}
            >
              <span className="flex w-full items-center justify-between gap-2 font-mono text-xs">
                <span>
                  {entry.method} {entry.response.status || "ERR"}
                </span>
                <time className="text-muted-foreground" dateTime={entry.at}>
                  {new Date(entry.at).toLocaleTimeString(ui("screen.91610255157661"), { hour12: false })}
                </time>
              </span>
              <span className="w-full truncate text-muted-foreground text-xs">{entry.url}</span>
            </Button>
          ))
        )}
      </div>
    </section>
  );
}
