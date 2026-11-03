"use client";

import { useLocaleFormatting } from "@/i18n/formatting";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { ArrowUpIcon, MessageCircleQuestionIcon, SquareIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

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
import { cn } from "@/lib/utils";

type ComposerLayout = "inline" | "stacked";


export function SideQuestionButton({ side, label }: { side: SideQuestions; label?: string }) {
  const t = useTranslations("sideQuestion");
  const ui = useTranslations();
  if (!side.enabled) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => side.setOpen(true)} title={`/btw ${label ?? ui("sideQuestion.button")}`}>
      <MessageCircleQuestionIcon data-icon="inline-start" />
      {label ?? ui("sideQuestion.button")}
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
  suggestions?: string[];
  placeholder?: string;
  noSnapshotHint?: string;
  emptyDescription?: string;
}) {
  const format = useLocaleFormatting();
  const ui = useTranslations();
  const t = useTranslations("sideQuestion");
  const inlineComposer = composerLayout === "inline";
  const [confirm, setConfirm] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const tail = side.items.at(-1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: New cumulative text scrolls only readers who remain at the bottom.
  useEffect(() => {
    if (pinned.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [tail?.answer, tail?.id]);
  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label={t("panelLabel")}>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {t("title")} <span className="text-muted-foreground">/btw</span>
          </p>
          <p className="truncate text-muted-foreground text-xs">{label}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setConfirm(true)}
          disabled={!side.items.length || side.busy}
          aria-label={t("clearHistory")}
        >
          <Trash2Icon />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => side.setOpen(false)} aria-label={t("closePanel")}>
          <XIcon />
        </Button>
      </div>
      <div className="border-b px-3 py-2 text-muted-foreground text-xs">
        {side.snapshot?.available ? (
          <>
            <p>{side.snapshot.model.model}</p>
            <p>{t("contextUpdatedAt", { time: format.dateTime(new Date(side.snapshot.captured_at), "timestamp")})}</p>
          </>
        ) : (
          noSnapshotHint ?? t("firstRunHint")
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
            {t("loadEarlier")}
          </Button>
        )}
        {side.loading && <Skeleton className="h-16 w-full" />}
        {!side.loading && side.items.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
              <EmptyDescription>{emptyDescription ?? t("emptyDesc")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <div className="flex flex-col gap-5">
          {side.items.map((item) => (
            <article key={item.id} className="flex min-w-0 flex-col gap-2">
              <div className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{item.question}</div>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <Badge variant="secondary">{t.has(`status.${item.status}`) ? t(`status.${item.status}`) : item.status}</Badge>
                <span className="truncate">{item.model.model}</span>
                <time dateTime={item.snapshot_at} title={format.dateTime(new Date(item.snapshot_at), "timestamp")}>
                  {t("contextTime", { time: format.dateTime(new Date(item.snapshot_at), "clock") })}
                </time>
              </div>
              {item.context?.estimated_input_tokens != null && (
                <p className="text-muted-foreground text-xs">
                  {t("recentExchanges", { count: item.context.recent_exchanges})}
                  {item.context.history_summarized && ` · ${t("historySummarized")}`}
                  {item.context.snapshot_summarized && ` · ${t("snapshotSummarized")}`}
                </p>
              )}
              {item.answer && <Markdown text={item.answer} />}
              {!item.answer && item.status === "running" && (
                <p role="status" className="text-muted-foreground text-sm">
                  {t.has(`phase.${item.context?.phase ?? "answering"}`) ? t(`phase.${item.context?.phase ?? "answering"}`) : item.context?.phase}
                </p>
              )}
              {item.error && (
                <Alert variant="destructive">
                  <AlertDescription>{item.error}</AlertDescription>
                </Alert>
              )}
            </article>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t p-3">
        {(side.error || side.snapshotError || side.snapshot?.reason) && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{side.error || side.snapshotError || side.snapshot?.reason}</AlertDescription>
          </Alert>
        )}
        <InputGroup className={inlineComposer ? "min-h-10" : "min-h-9"}>
          <InputGroupTextarea
            rows={1}
            className={cn("overflow-y-auto", inlineComposer ? "max-h-40 min-h-0" : "max-h-36 min-h-9")}
            aria-label={ui("sideQuestion.questionAria")}
            placeholder={placeholder ?? ui("sideQuestion.askPlaceholder")}
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
            {!inlineComposer && <span className="text-muted-foreground text-xs">{t("independentNote")}</span>}
            {side.running ? (
              <InputGroupButton
                className="ml-auto"
                variant="destructive"
                size="icon-xs"
                onClick={() => void side.stop()}
                aria-label={t("stopAnswer")}
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
                aria-label={t("sendQuestion")}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
        {suggestions?.length ? (
          <fieldset className="mt-2 flex flex-wrap gap-1.5" aria-label={ui("core.side.quickQuestions")}>
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                className="h-auto whitespace-normal text-left text-xs"
                disabled={side.busy || !side.snapshot?.available}
                onClick={() => void side.ask(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </fieldset>
        ) : null}
      </div>
      {inlineComposer && (
        <div className="shrink-0 truncate px-3 pt-0.5 pb-1 text-muted-foreground text-xs">{t("independentNote")}</div>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clearConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("clearConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void side.clear()}>{t("clearConfirm")}</AlertDialogAction>
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
  suggestions?: string[];
  placeholder?: string;
  noSnapshotHint?: string;
  emptyDescription?: string;
  className?: string;
  mainClassName?: string;
}) {
  const t = useTranslations("sideQuestion");
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
            <DrawerTitle>{t("title")}</DrawerTitle>
            <DrawerDescription>{t("drawerDesc", { label})}</DrawerDescription>
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
