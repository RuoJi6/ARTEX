"use client";
import * as React from "react";

import { ArrowUpIcon, BotIcon, HistoryIcon, Loader2Icon, PlusIcon, SquareIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { MentionTextarea } from "@/components/mention-textarea";
import { Transcript } from "@/components/transcript";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUITranslation } from "@/i18n/use-ui-translation";
import { api } from "@/lib/api";
import type { Activity, Conversation } from "@/lib/types";

function mergeActivities(oldItems: Activity[], incoming: Activity[]) {
  const byID = new Map(oldItems.map((item) => [item.seq, item]));
  for (const item of incoming) byID.set(item.seq, item);
  return [...byID.values()].sort((a, b) => a.seq - b.seq);
}

export function FindingAutoChat({
  findingId,
  findingTitle,
  agentKey = "auto",
  agentLabel = "Auto Agent",
  promptPlaceholder,
  modal = false,
  initialConversationId,
  open,
  onOpenChange,
}: {
  findingId: string;
  findingTitle: string;
  agentKey?: string;
  agentLabel?: string;
  promptPlaceholder?: string;
  modal?: boolean;
  initialConversationId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { ui, liveUI } = useUITranslation();

  promptPlaceholder ??= ui("screen.5ff84ba72427fe");

  const [conversation, setConversation] = React.useState<Conversation | null>(null);
  const [messages, setMessages] = React.useState<Activity[]>([]);
  const [input, setInput] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);
  const [manualEmpty, setManualEmpty] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [history, setHistory] = React.useState<Conversation[]>([]);
  const cursor = React.useRef(0);
  const chatViewportRef = React.useRef<HTMLDivElement | null>(null);
  const safeTitle = findingTitle
    .replace(/[[\]\r\n]/g, " ")
    .trim()
    .slice(0, 100);
  const storageKey = `artex.finding.${agentKey}-conversation.${findingId}`;

  const createConversation = React.useCallback(async () => {
    setManualEmpty(false);
    setMessages([]);
    setRunning(false);
    setLoading(true);
    try {
      const created = await api.createConversation(agentKey, `漏洞 #${findingId} · ${safeTitle}`);
      window.localStorage.setItem(storageKey, String(created.id));
      setConversation(created);
    } catch (error) {
      toast.error(liveUI("screen.045d7a6a2ed0ee", { v0: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [agentKey, findingId, safeTitle, storageKey, liveUI]);

  React.useEffect(() => {
    if (!open || conversation || manualEmpty) return;
    if (initialConversationId && initialConversationId > 0) {
      setConversation({
        id: initialConversationId,
        agent_key: agentKey,
        title: `漏洞 #${findingId} · ${safeTitle}`,
        created_at: "",
        updated_at: "",
      });
      return;
    }
    const storedID = agentKey === "auto" ? Number(window.localStorage.getItem(storageKey)) : 0;
    if (Number.isSafeInteger(storedID) && storedID > 0) {
      setConversation({
        id: storedID,
        agent_key: agentKey,
        title: `漏洞 #${findingId} · ${safeTitle}`,
        created_at: "",
        updated_at: "",
      });
      return;
    }
    void createConversation();
  }, [conversation, createConversation, initialConversationId, manualEmpty, open, safeTitle, storageKey]);

  React.useEffect(() => {
    if (!historyOpen && !running) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const items = await api.conversations();
        if (!live) return;
        const prefix = `漏洞 #${findingId} ·`;
        setHistory(items.filter((item) => item.agent_key === agentKey && item.title.startsWith(prefix)));
      } catch {
        if (live && historyOpen) setHistory([]);
      } finally {
        if (live && (historyOpen || running)) timer = setTimeout(() => void load(), 2000);
      }
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [agentKey, findingId, historyOpen, running]);

  React.useEffect(() => {
    if (!open || !conversation) return;
    let live = true;
    cursor.current = 0;
    api
      .conversationHistory(conversation.id, 0, 200)
      .then((page) => {
        if (!live) return;
        setMessages((current) => mergeActivities(current, page.items));
        cursor.current = page.cursor;
        setRunning(page.running);
      })
      .catch((error: Error) => {
        if (error.message.includes("404")) {
          window.localStorage.removeItem(storageKey);
          setConversation(null);
        }
      });
    return () => {
      live = false;
    };
  }, [conversation, open, storageKey]);

  React.useEffect(() => {
    if (!open || !conversation || loading || !messages.length) return;
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    const key = `artex.conversation-scroll.${conversation.id}`;
    const saved = window.sessionStorage.getItem(key);
    requestAnimationFrame(() => {
      if (saved != null) viewport.scrollTop = Number(saved) || 0;
      else viewport.scrollTop = viewport.scrollHeight;
    });
  }, [conversation, loading, messages.length, open]);

  React.useEffect(() => {
    if (!open || !conversation || !running) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const page = await api.conversationMessages(conversation.id, cursor.current);
        if (!live) return;
        if (page.items.length) setMessages((current) => mergeActivities(current, page.items));
        cursor.current = Math.max(cursor.current, page.cursor);
        setRunning(page.running);
        if (page.running) timer = setTimeout(() => void poll(), 1000);
      } catch {
        if (live) timer = setTimeout(() => void poll(), 1500);
      }
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [conversation, open, running]);

  const send = async () => {
    const question = input.trim();
    if (!conversation || !question || sending || running) return;
    setSending(true);
    setInput("");
    const firstQuestion = !messages.some((item) => item.kind === "user");
    const message = firstQuestion ? `@[漏洞#${findingId} ${safeTitle}] ${question}` : question;
    try {
      await api.sendConversationMessage(conversation.id, message);
      setRunning(true);
    } catch (error) {
      setInput(question);
      toast.error(ui("screen.21e2615f9d508d", { v0: (error as Error).message }));
    } finally {
      setSending(false);
    }
  };

  const selectHistory = (item: Conversation) => {
    setManualEmpty(false);
    setMessages([]);
    setRunning(false);
    setConversation(item);
    window.localStorage.setItem(storageKey, String(item.id));
    setHistoryOpen(false);
  };

  const deleteConversation = async () => {
    if (!conversation) return;
    try {
      await api.deleteConversation(conversation.id);
      window.localStorage.removeItem(storageKey);
      setConversation(null);
      setMessages([]);
      setRunning(false);
      setManualEmpty(true);
      setHistory((items) => items.filter((item) => item.id !== conversation.id));
      toast.success(ui("screen.e6aa0f907b26e1"));
    } catch (error) {
      toast.error(ui("screen.7a7e938a8ed82d", { v0: (error as Error).message }));
    }
  };

  const stop = async () => {
    if (!conversation || stopping || !running) return;
    setStopping(true);
    try {
      await api.stopConversation(conversation.id);
    } catch (error) {
      toast.error(ui("screen.8db4fd2d271d4e", { v0: (error as Error).message }));
    } finally {
      setStopping(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={
        modal
          ? "pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          : "pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-end px-4 pb-4 sm:px-6"
      }
    >
      <section
        className={
          modal
            ? "pointer-events-auto flex min-w-0 h-[min(760px,calc(100svh-2rem))] w-[min(760px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
            : "pointer-events-auto flex min-w-0 h-[calc(100svh-6rem)] w-[min(520px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        }
      >
        <header className="flex items-center gap-2 border-b p-3">
          <BotIcon className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-medium">
              {agentLabel}
              {running && (
                <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-600 text-xs">
                  <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
                  {ui("screen.1f0eb99b7ed094")}
                </span>
              )}
            </p>
            <p className="truncate text-muted-foreground text-xs">
              {ui("screen.3fdce31ce96ae8")}
              {findingId} · {safeTitle}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void createConversation()}
            title={ui("screen.e5a8b35e7bbd1b")}
            aria-label={ui("screen.e5a8b35e7bbd1b")}
          >
            <PlusIcon />
          </Button>
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                title={ui("screen.7e730217dea000")}
                aria-label={ui("screen.7e730217dea000")}
              >
                <HistoryIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-2">
              <p className="px-2 py-1 text-muted-foreground text-xs">{ui("screen.11e90b4349d2a1")}</p>
              <div className="max-h-64 overflow-y-auto">
                {history.length ? (
                  history.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`flex w-full flex-col rounded-md px-2 py-2 text-left hover:bg-accent ${item.id === conversation?.id ? "bg-accent" : ""}`}
                      onClick={() => selectHistory(item)}
                    >
                      <span className="flex items-center gap-2 whitespace-normal break-words text-sm leading-5">
                        {item.title}
                        {item.id === conversation?.id && (
                          <span className="shrink-0 text-primary text-xs">{ui("screen.cb62ebd689ee8f")}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 text-muted-foreground text-xs">
                        #{item.id} · {new Date(item.updated_at).toLocaleString(ui("screen.91610255157661"))}
                        {item.running && (
                          <span className="inline-flex items-center gap-1 text-blue-600">
                            <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
                            {ui("screen.1f0eb99b7ed094")}
                          </span>
                        )}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-3 text-muted-foreground text-xs">{ui("screen.070cdd696c4368")}</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void deleteConversation()}
            disabled={!conversation}
            title={ui("screen.30ae3492c13ef0")}
            aria-label={ui("screen.30ae3492c13ef0")}
          >
            <Trash2Icon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label={ui("screen.5b760a73c028f8")}
          >
            <XIcon />
          </Button>
        </header>
        <div
          ref={chatViewportRef}
          onScroll={(event) => {
            if (conversation)
              window.sessionStorage.setItem(
                `artex.conversation-scroll.${conversation.id}`,
                String(event.currentTarget.scrollTop),
              );
          }}
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3"
        >
          <div className="w-full min-w-0 max-w-full">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                <Loader2Icon className="mr-2 size-4 animate-spin" /> {ui("screen.7b74301cba38e3")}
              </div>
            ) : messages.length ? (
              <Transcript
                activity={messages}
                chat
                live={running}
                fetchDetail={(seq) => api.conversationMsgDetail(conversation?.id ?? 0, seq)}
              />
            ) : (
              <p className="py-10 text-center text-muted-foreground text-sm">
                {conversation ? ui("screen.ab9ddfefb38c1e") : ui("screen.cc55502c91c248")}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t p-3">
          <InputGroup>
            <MentionTextarea
              rows={2}
              value={input}
              inputGroup
              onValueChange={setInput}
              disabled={!conversation || loading || sending || running}
              placeholder={promptPlaceholder}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <InputGroupAddon align="block-end">
              <span className="text-muted-foreground text-xs">{ui("screen.9f018c43aed87a")}</span>
              {running ? (
                <InputGroupButton
                  className="ml-auto"
                  variant="destructive"
                  size="icon-xs"
                  onClick={() => void stop()}
                  disabled={stopping}
                  aria-label={ui("screen.27e7bfa3c759bb")}
                >
                  <SquareIcon />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  className="ml-auto"
                  size="icon-xs"
                  onClick={() => void send()}
                  disabled={!input.trim() || sending}
                >
                  <ArrowUpIcon />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
        </div>
      </section>
    </div>
  );
}
