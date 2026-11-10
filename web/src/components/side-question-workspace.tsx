"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { ArrowUpIcon, MessageCircleQuestionIcon, SquareIcon, Trash2Icon, XIcon } from "lucide-react";

import { Markdown } from "@/components/markdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SideQuestions } from "@/hooks/use-side-questions";
import { localizedError } from "@/i18n/errors";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import { cn } from "@/lib/utils";

type ComposerLayout = "inline" | "stacked";
type SuggestedQuestion = string | { label: string; question: string };

export function SideQuestionButton({ side, label }: { side: SideQuestions; label?: string }) {
  const { t: translate } = useLiveTranslation();
  const displayLabel = label ?? translate("chatUI.sideQuestion");
  if (!side.enabled) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => side.setOpen(true)} title={`/btw ${displayLabel}`}>
      <MessageCircleQuestionIcon data-icon="inline-start" />
      {displayLabel}
    </Button>
  );
}

function SidePanel({
  side,
  label,
  composerLayout,
  suggestions,
  placeholder,
  noSnapshotHint,
  emptyDescription,
}: {
  side: SideQuestions;
  label: string;
  composerLayout: ComposerLayout;
  suggestions?: SuggestedQuestion[];
  placeholder?: string;
  noSnapshotHint?: string;
  emptyDescription?: string;
}) {
  const { t: translate, i18n } = useLiveTranslation();
  const preparationLabels = {
    preparing: translate("chatUI.preparing"),
    summarizing_history: translate("chatUI.summarizingHistory"),
    compressing_snapshot: translate("chatUI.compressingSnapshot"),
    retrying: translate("chatUI.retrying"),
    answering: translate("chatUI.answering"),
  };

  const inlineComposer = composerLayout === "inline";
  const [confirm, setConfirm] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const tail = side.items.at(-1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: New cumulative text scrolls only readers who remain at the bottom.
  useEffect(() => {
    if (pinned.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [tail?.answer, tail?.id]);
  const status = {
    running: translate("chatUI.status.running"),
    completed: translate("chatUI.status.completed"),
    failed: translate("chatUI.status.failed"),
    cancelled: translate("chatUI.status.cancelled"),
    interrupted: translate("chatUI.status.interrupted"),
  };
  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label={translate("chatUI.panel")}>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {translate("chatUI.sideQuestion")} <span className="text-muted-foreground">/btw</span>
          </p>
          <p className="truncate text-muted-foreground text-xs">{label}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setConfirm(true)}
          disabled={!side.items.length || side.busy}
          aria-label={translate("chatUI.clearLabel")}
        >
          <Trash2Icon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => side.setOpen(false)}
          aria-label={translate("chatUI.closePanel")}
        >
          <XIcon />
        </Button>
      </div>
      <div className="border-b px-3 py-2 text-muted-foreground text-xs">
        {side.snapshot?.available ? (
          <>
            <p>{side.snapshot.model.model}</p>
            <p>
              {translate("chatUI.contextUpdated", {
                date: new Date(side.snapshot.captured_at).toLocaleString(i18n.resolvedLanguage),
              })}
            </p>
          </>
        ) : (
          (noSnapshotHint ?? translate("chatUI.noSnapshot"))
        )}
      </div>
      <div
        ref={viewport}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        {side.nextCursor > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void side.load(side.nextCursor)}>
            {translate("chatUI.loadEarlier")}
          </Button>
        )}
        {side.loading && <Skeleton className="h-16 w-full" />}
        {!side.loading && side.items.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{translate("chatUI.askAnytime")}</EmptyTitle>
              <EmptyDescription>{emptyDescription ?? translate("chatUI.description")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <div className="flex flex-col gap-5">
          {side.items.map((item) => (
            <article key={item.id} className="flex min-w-0 flex-col gap-2">
              <div className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{item.question}</div>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <Badge variant="secondary">{status[item.status]}</Badge>
                <span className="truncate">{item.model.model}</span>
                <time
                  dateTime={item.snapshot_at}
                  title={new Date(item.snapshot_at).toLocaleString(i18n.resolvedLanguage)}
                >
                  {translate("chatUI.contextTime", {
                    time: new Date(item.snapshot_at).toLocaleTimeString(i18n.resolvedLanguage),
                  })}
                </time>
              </div>
              {item.context?.estimated_input_tokens != null && (
                <p className="text-muted-foreground text-xs">
                  {translate("chatUI.recentExchanges", { count: item.context.recent_exchanges })}
                  {item.context.history_summarized && translate("chatUI.historySummary")}
                  {item.context.snapshot_summarized && translate("chatUI.snapshotSummary")}
                </p>
              )}
              {item.answer && <Markdown text={item.answer} />}
              {!item.answer && item.status === "running" && (
                <p role="status" className="text-muted-foreground text-sm">
                  {preparationLabels[item.context?.phase ?? "answering"]}
                </p>
              )}
              {item.error && (
                <Alert variant="destructive">
                  <AlertDescription>{localizedError(item.error, translate)}</AlertDescription>
                </Alert>
              )}
            </article>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t p-3">
        {(side.error || side.snapshotError || side.snapshot?.reason) && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>
              {localizedError(side.error || side.snapshotError || side.snapshot?.reason || "", translate)}
            </AlertDescription>
          </Alert>
        )}
        <InputGroup className={inlineComposer ? "min-h-10" : "min-h-9"}>
          <InputGroupTextarea
            rows={1}
            className={cn("overflow-y-auto", inlineComposer ? "max-h-40 min-h-0" : "max-h-36 min-h-9")}
            aria-label={translate("chatUI.questionLabel")}
            placeholder={placeholder ?? translate("chatUI.questionPlaceholder")}
            value={side.draft}
            maxLength={4000}
            disabled={side.busy}
            onChange={(event) => side.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void side.ask(side.draft);
              }
            }}
          />
          <InputGroupAddon align={inlineComposer ? "inline-end" : "block-end"}>
            {!inlineComposer && <span className="text-muted-foreground text-xs">{translate("chatUI.noTools")}</span>}
            {side.running ? (
              <InputGroupButton
                className="ml-auto"
                variant="destructive"
                size="icon-xs"
                onClick={() => void side.stop()}
                aria-label={translate("chatUI.stopSide")}
              >
                <SquareIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                className="ml-auto"
                variant="default"
                size="icon-xs"
                onClick={() => void side.ask(side.draft)}
                disabled={side.busy || !side.draft.trim() || !side.snapshot?.available}
                aria-label={translate("chatUI.sendSide")}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
        {suggestions?.length ? (
          <fieldset className="mt-2 flex flex-wrap gap-1.5" aria-label={translate("chatUI.suggestions")}>
            {suggestions.map((suggestion) => {
              const { label, question } =
                typeof suggestion === "string" ? { label: suggestion, question: suggestion } : suggestion;
              return (
                <Button
                  key={question}
                  variant="outline"
                  size="sm"
                  className="h-auto whitespace-normal text-left text-xs"
                  disabled={side.busy || !side.snapshot?.available}
                  onClick={() => void side.ask(question)}
                >
                  {label}
                </Button>
              );
            })}
          </fieldset>
        ) : null}
      </div>
      {inlineComposer && (
        <div className="shrink-0 truncate px-3 pt-0.5 pb-1 text-muted-foreground text-xs">
          {translate("chatUI.noTools")}
        </div>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate("chatUI.clearTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{translate("chatUI.clearDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translate("chatUI.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void side.clear()}>{translate("chatUI.clearHistory")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function SideQuestionWorkspace({
  side,
  label,
  children,
  mode = "split",
  composerLayout = "stacked",
  suggestions,
  placeholder,
  noSnapshotHint,
  emptyDescription,
  className,
  mainClassName,
}: {
  side: SideQuestions;
  label: string;
  children: ReactNode;
  mode?: "split" | "floating";
  composerLayout?: ComposerLayout;
  suggestions?: SuggestedQuestion[];
  placeholder?: string;
  noSnapshotHint?: string;
  emptyDescription?: string;
  className?: string;
  mainClassName?: string;
}) {
  const { t: translate } = useLiveTranslation();
  const mobile = useIsMobile();
  const desktopSideOpen = side.open && side.enabled && !mobile;
  const floatingSideOpen = desktopSideOpen && mode === "floating";
  return (
    <>
      {floatingSideOpen ? (
        <>
          <div className={cn("min-h-0 min-w-0 flex-1", className, mainClassName)}>{children}</div>
          <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-end px-4 pb-4 sm:px-6">
            <div className="pointer-events-auto h-[calc(100svh-6rem)] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-background shadow-2xl">
              <SidePanel
                side={side}
                label={label}
                composerLayout={composerLayout}
                suggestions={suggestions}
                placeholder={placeholder}
                noSnapshotHint={noSnapshotHint}
                emptyDescription={emptyDescription}
              />
            </div>
          </div>
        </>
      ) : desktopSideOpen ? (
        <ResizablePanelGroup orientation="horizontal" className={cn("min-h-0 min-w-0 flex-1", className)}>
          <ResizablePanel
            id="main-conversation"
            minSize="35%"
            className={cn("flex min-h-0 min-w-0 flex-col", mainClassName)}
          >
            {children}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="side-question" defaultSize="38%" minSize="280px" maxSize="65%">
            <SidePanel
              side={side}
              label={label}
              composerLayout={composerLayout}
              suggestions={suggestions}
              placeholder={placeholder}
              noSnapshotHint={noSnapshotHint}
              emptyDescription={emptyDescription}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col", className, mainClassName)}>{children}</div>
      )}
      <Drawer open={mobile && side.open && side.enabled} onOpenChange={side.setOpen}>
        <DrawerContent className="h-[85svh]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{translate("chatUI.sideQuestion")}</DrawerTitle>
            <DrawerDescription>{translate("chatUI.drawerDescription", { label })}</DrawerDescription>
          </DrawerHeader>
          <SidePanel
            side={side}
            label={label}
            composerLayout={composerLayout}
            suggestions={suggestions}
            placeholder={placeholder}
            noSnapshotHint={noSnapshotHint}
            emptyDescription={emptyDescription}
          />
        </DrawerContent>
      </Drawer>
    </>
  );
}
