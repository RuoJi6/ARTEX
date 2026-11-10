"use client";
import * as React from "react";

import { WrapTextIcon } from "lucide-react";

import { LiveClock } from "@/app/(main)/_components/live-clock";
import { CopyButton } from "@/components/copy-button";
import { PacketCodeEditor } from "@/components/packet-code-editor";
import { useUITranslation } from "@/i18n/use-ui-translation";
import { cn } from "@/lib/utils";

export function RepeaterTextPane({
  id,
  label,
  value,
  onChange,
  disabled,
  toolbar,
  panelClassName,
  showClock = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  syntaxHighlight?: boolean;
  toolbar?: React.ReactNode;
  panelClassName?: string;
  showClock?: boolean;
}) {
  const { ui } = useUITranslation();

  const [wrapLines, setWrapLines] = React.useState(true);
  const lines = React.useMemo(() => value.split(/\r\n|\r|\n/).length, [value]);
  return (
    <section
      className={cn(
        "flex min-h-[280px] min-w-0 flex-1 flex-col gap-2 rounded-md border bg-background p-2 xl:min-h-0",
        panelClassName,
      )}
    >
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="font-medium text-xs">
          {label}
        </label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {lines} {ui("screen.4cc7b00050cb1c")}
        </span>
        {showClock ? <LiveClock className="ml-auto" /> : null}
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[10px] text-muted-foreground hover:bg-muted"
          onClick={() => setWrapLines((value) => !value)}
          title={wrapLines ? ui("screen.b2f7084b4a3d1d") : ui("screen.19464947dbc9fc")}
          aria-label={wrapLines ? ui("screen.b2f7084b4a3d1d") : ui("screen.19464947dbc9fc")}
        >
          <WrapTextIcon className="size-3" />
          {wrapLines ? ui("screen.bd609a8e2d40f3") : ui("screen.5e4313a9aef15b")}
        </button>
        {toolbar}
        <CopyButton
          text={value}
          label={ui("screen.c3fae971f4051a", { v0: label })}
          className={showClock ? "ml-0" : "ml-auto"}
        />
      </div>
      <div className="group relative flex min-h-0 flex-1 overflow-hidden rounded border border-input focus-within:border-ring">
        <PacketCodeEditor
          value={value}
          onChange={onChange}
          readOnly={!onChange || disabled}
          wrapLines={wrapLines}
          ariaLabel={label}
        />
      </div>
    </section>
  );
}
