"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  History,
  LoaderCircle,
  MessageSquare,
  Plus,
  Search,
  User,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { httpRequest } from "@/lib/request";
import { cn } from "@/lib/utils";
import {
  listSearchConversations,
  saveSearchConversations,
  type SearchConversation,
  type SearchTurn,
} from "@/store/search-conversations";

import type { SearchResult } from "./types";

const ACTIVE_SEARCH_CONVERSATION_KEY = "chatgpt2api:search_active_conversation_id";

const normalizeMarkdown = (text: string) =>
  text
    .replace(/\ue200url\ue202([^\ue202\ue201]*)\ue202([^\ue201]*)\ue201/g, "[$1]($2)")
    .replace(/\ue200cite\ue202[^\ue201]*\ue201/g, "")
    .replace(/\ue200[^\ue201]*\ue201/g, "")
    .replace(/\ue200[^\ue201]*$/g, "")
    .replace(/(?:^|\n)(\d{1,3})\n{2,}(?=\S)/g, "\n\n### $1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const cleanUrl = (url: string) => url.replace(/[\ue200-\ue202].*$/g, "").trim();

const sourceKind = (url: string) => {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  return host.includes("github.com") ? "github" : "web";
};

const sourceHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const compactAnswer = (text: string) => normalizeMarkdown(text).replace(/\s+/g, " ").slice(0, 1800);

const conversationTitle = (prompt: string) => prompt.trim().slice(0, 28) || "新搜索对话";

function buildPromptWithHistory(prompt: string, turns: SearchTurn[]) {
  const history = turns
    .filter((turn) => turn.status === "success" && turn.result?.answer)
    .slice(-4)
    .map((turn, index) =>
      [`第 ${index + 1} 轮用户问题：${turn.prompt}`, `第 ${index + 1} 轮回答摘要：${compactAnswer(turn.result?.answer || "")}`].join("\n"),
    )
    .join("\n\n");

  if (!history) {
    return prompt;
  }

  return [
    "你正在进行一个多轮联网搜索对话。请结合历史上下文理解最新问题，但必须针对最新问题重新使用网页搜索核实。",
    "如果历史信息与最新网页结果冲突，以最新网页结果为准。",
    "",
    "历史对话：",
    history,
    "",
    `最新问题：${prompt}`,
    "",
    "请直接回答最新问题，并在必要时保留来源线索。",
  ].join("\n");
}

function dedupeSources(sources: SearchResult["sources"] = []) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const url = cleanUrl(source.url || "");
    if (!url || seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });
}

function formatConversationTime(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function MarkdownResult({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ className, ...props }) => (
          <a
            className={cn(
              "font-medium text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900 dark:text-blue-300 dark:decoration-blue-700",
              className,
            )}
            target="_blank"
            rel="noreferrer"
            {...props}
          />
        ),
        h1: ({ className, ...props }) => (
          <h1
            className={cn("mt-6 mb-3 text-2xl font-semibold tracking-tight text-stone-950 first:mt-0 dark:text-stone-50", className)}
            {...props}
          />
        ),
        h2: ({ className, ...props }) => (
          <h2
            className={cn(
              "mt-6 mb-3 border-b border-stone-200 pb-2 text-xl font-semibold tracking-tight text-stone-950 first:mt-0 dark:border-white/10 dark:text-stone-50",
              className,
            )}
            {...props}
          />
        ),
        h3: ({ className, ...props }) => (
          <h3
            className={cn(
              "mt-5 mb-2 inline-flex min-w-9 items-center justify-center rounded-full bg-stone-950 px-2.5 py-1 text-sm font-semibold text-white first:mt-0 dark:bg-white dark:text-stone-950",
              className,
            )}
            {...props}
          />
        ),
        p: ({ className, ...props }) => <p className={cn("my-2.5 leading-7 text-stone-800 dark:text-stone-200", className)} {...props} />,
        ul: ({ className, ...props }) => <ul className={cn("my-3 list-disc space-y-1.5 pl-6 leading-7 text-stone-800 dark:text-stone-200", className)} {...props} />,
        ol: ({ className, ...props }) => <ol className={cn("my-3 list-decimal space-y-1.5 pl-6 leading-7 text-stone-800 dark:text-stone-200", className)} {...props} />,
        blockquote: ({ className, ...props }) => (
          <blockquote
            className={cn(
              "my-4 rounded-r-2xl border-l-4 border-stone-300 bg-white/70 py-3 pr-4 pl-5 text-stone-700 dark:border-white/20 dark:bg-white/[0.04] dark:text-stone-300",
              className,
            )}
            {...props}
          />
        ),
        code: ({ className, ...props }) => (
          <code className={cn("rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.9em] text-stone-800 dark:bg-white/10 dark:text-stone-100", className)} {...props} />
        ),
        pre: ({ className, ...props }) => (
          <pre className={cn("my-4 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-950 p-4 text-sm text-stone-50 dark:border-white/10", className)} {...props} />
        ),
        table: ({ className, ...props }) => (
          <div className="my-4 overflow-x-auto rounded-2xl border border-stone-200 dark:border-white/10">
            <table className={cn("w-full border-collapse text-sm", className)} {...props} />
          </div>
        ),
        th: ({ className, ...props }) => (
          <th className={cn("border-b border-stone-200 bg-stone-100 px-3 py-2 text-left font-semibold dark:border-white/10 dark:bg-white/10", className)} {...props} />
        ),
        td: ({ className, ...props }) => <td className={cn("border-b border-stone-100 px-3 py-2 align-top dark:border-white/10", className)} {...props} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function SearchPanel() {
  const [prompt, setPrompt] = useState("");
  const [conversations, setConversations] = useState<SearchConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );
  const turns = selectedConversation?.turns || [];

  useEffect(() => {
    void (async () => {
      const items = await listSearchConversations();
      const storedId = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_SEARCH_CONVERSATION_KEY) : null;
      setConversations(items);
      setSelectedConversationId(storedId && items.some((item) => item.id === storedId) ? storedId : items[0]?.id ?? null);
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!loading || !startedAt) return;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    return () => window.clearInterval(timer);
  }, [loading, startedAt]);

  useEffect(() => {
    if (!hydrated) return;
    void saveSearchConversations(conversations);
  }, [conversations, hydrated]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedConversationId) return;
    window.localStorage.setItem(ACTIVE_SEARCH_CONVERSATION_KEY, selectedConversationId);
  }, [selectedConversationId]);

  useEffect(() => {
    if (selectedConversationId && conversations.some((item) => item.id === selectedConversationId)) {
      return;
    }
    setSelectedConversationId(conversations[0]?.id ?? null);
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!copiedKey) return;
    const timer = window.setTimeout(() => setCopiedKey(""), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  const handleCopy = async (key: string, value: string) => {
    await copyText(value);
    setCopiedKey(key);
  };

  const createConversation = (initialPrompt = "") => {
    const now = new Date().toISOString();
    return {
      id: newId(),
      title: conversationTitle(initialPrompt),
      createdAt: now,
      updatedAt: now,
      turns: [],
    } satisfies SearchConversation;
  };

  const handleNewConversation = () => {
    const next = createConversation();
    setConversations((items) => [next, ...items]);
    setSelectedConversationId(next.id);
    setPrompt("");
    setElapsedMs(0);
  };

  const runSearch = async () => {
    const value = prompt.trim();
    if (!value || loading) return;

    const baseConversation = selectedConversation ?? createConversation(value);
    const conversationId = selectedConversation?.id ?? baseConversation.id;
    const turnId = newId();
    const conversationTurns = selectedConversation?.turns ?? [];
    const sentPrompt = buildPromptWithHistory(value, conversationTurns);
    const pendingTurn: SearchTurn = {
      id: turnId,
      prompt: value,
      sentPrompt,
      result: null,
      error: "",
      elapsedMs: 0,
      status: "loading",
    };
    const start = Date.now();
    const now = new Date(start).toISOString();

    setStartedAt(start);
    setElapsedMs(0);
    setLoading(true);
    setPrompt("");
    setSelectedConversationId(conversationId);
    setConversations((items) => {
      const existing = items.find((item) => item.id === conversationId);
      const target = existing ?? baseConversation;
      const updated: SearchConversation = {
        ...target,
        title: target.turns.length ? target.title : conversationTitle(value),
        updatedAt: now,
        turns: [...target.turns, pendingTurn],
      };
      return [updated, ...items.filter((item) => item.id !== conversationId)];
    });

    try {
      const result = await httpRequest<SearchResult>("/v1/search", { method: "POST", body: { prompt: sentPrompt } });
      setConversations((items) =>
        items.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                updatedAt: new Date().toISOString(),
                turns: conversation.turns.map((turn) =>
                  turn.id === turnId ? { ...turn, result, elapsedMs: Date.now() - start, status: "success" } : turn,
                ),
              }
            : conversation,
        ),
      );
    } catch (err) {
      setConversations((items) =>
        items.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                updatedAt: new Date().toISOString(),
                turns: conversation.turns.map((turn) =>
                  turn.id === turnId
                    ? { ...turn, error: err instanceof Error ? err.message : String(err), elapsedMs: Date.now() - start, status: "error" }
                    : turn,
                ),
              }
            : conversation,
        ),
      );
    } finally {
      setElapsedMs(Date.now() - start);
      setLoading(false);
    }
  };

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-96px)] w-full max-w-7xl flex-col px-2 py-4 sm:px-4">
      <div className="pointer-events-none absolute inset-x-8 top-8 h-52 rounded-full bg-gradient-to-r from-sky-300/20 via-stone-200/10 to-amber-300/20 blur-3xl dark:from-sky-500/10 dark:via-white/5 dark:to-amber-500/10" />

      <div className="relative mb-4 flex flex-wrap items-end justify-between gap-3 rounded-[28px] border border-white/70 bg-white/70 p-5 shadow-[0_24px_70px_rgba(87,72,55,0.12)] backdrop-blur dark:border-white/10 dark:bg-stone-950/55 dark:shadow-black/30">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300">
            <Search className="size-3.5" />
            每一轮都会联网搜索
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-950 dark:text-white sm:text-3xl">搜索对话</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500 dark:text-stone-400">
            支持追问、复制、历史对话切换。后续问题会带上最近几轮摘要，同时重新触发 ChatGPT 网页搜索。
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-200 dark:hover:bg-white/[0.08]"
          disabled={loading}
          onClick={handleNewConversation}
        >
          <Plus className="size-4" />
          新对话
        </button>
      </div>

      <div className="relative grid min-h-0 flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-[240px] flex-col rounded-[28px] border border-white/70 bg-white/55 p-4 shadow-[0_18px_60px_rgba(87,72,55,0.10)] backdrop-blur dark:border-white/10 dark:bg-stone-950/40">
          <div className="mb-3 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
              <History className="size-4" />
              历史对话
            </div>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500 dark:bg-white/10 dark:text-stone-400">{conversations.length}</span>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {conversations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-6 text-sm leading-6 text-stone-500 dark:border-white/10 dark:text-stone-400">
                暂无历史对话。发送第一条搜索问题后，这里会自动保存。
              </div>
            ) : (
              conversations.map((conversation) => {
                const active = conversation.id === selectedConversationId;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left transition",
                      active
                        ? "border-stone-900 bg-stone-950 text-white shadow-lg shadow-stone-900/10 dark:border-white dark:bg-white dark:text-stone-950"
                        : "border-stone-200 bg-white/80 text-stone-800 hover:border-stone-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-200 dark:hover:bg-white/[0.08]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                          active ? "bg-white/15 text-white dark:bg-stone-950/10 dark:text-stone-950" : "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-300",
                        )}
                      >
                        <MessageSquare className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-medium">{conversation.title}</span>
                        <span className={cn("mt-1 block text-xs", active ? "text-white/75 dark:text-stone-700" : "text-stone-500 dark:text-stone-400")}>
                          {conversation.turns.length} 轮 · {formatConversationTime(conversation.updatedAt)}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="flex min-h-0 flex-col rounded-[28px] border border-white/70 bg-white/55 shadow-[0_18px_60px_rgba(87,72,55,0.10)] backdrop-blur dark:border-white/10 dark:bg-stone-950/40">
          <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5 sm:px-5 lg:px-8">
            {turns.length === 0 ? (
              <div className="mx-auto flex min-h-[46vh] max-w-xl flex-col items-center justify-center text-center">
                <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-stone-950 text-white shadow-xl shadow-stone-900/15 dark:bg-white dark:text-stone-950">
                  <Search className="size-6" />
                </div>
                <h2 className="text-xl font-semibold text-stone-950 dark:text-white">输入一个需要联网的问题</h2>
                <p className="mt-3 text-sm leading-7 text-stone-500 dark:text-stone-400">
                  例如查资料、找最新状态、核实设定、继续追问上一轮结论。当前页会自动保留历史对话。
                </p>
              </div>
            ) : null}

            {turns.map((turn, turnIndex) => {
              const sources = dedupeSources(turn.result?.sources || []);
              const isLoadingTurn = turn.status === "loading";
              const answerText = normalizeMarkdown(turn.result?.answer || "");
              return (
                <div key={turn.id} className="space-y-3">
                  <div className="ml-auto flex max-w-3xl items-start justify-end gap-3">
                    <div className="group rounded-[22px] bg-stone-950 px-4 py-3 text-sm leading-7 text-white shadow-lg shadow-stone-900/10 dark:bg-white dark:text-stone-950">
                      <div className="mb-2 flex items-center justify-end">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/85 transition hover:bg-white/15 dark:bg-stone-900/10 dark:text-stone-700"
                          onClick={() => void handleCopy(`prompt:${turn.id}`, turn.prompt)}
                        >
                          {copiedKey === `prompt:${turn.id}` ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                          复制
                        </button>
                      </div>
                      {turn.prompt}
                    </div>
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white dark:bg-white dark:text-stone-950">
                      <User className="size-4" />
                    </div>
                  </div>

                  <div className="flex max-w-5xl items-start gap-3">
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-stone-200">
                      {isLoadingTurn ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
                    </div>
                    <article className="min-w-0 flex-1 rounded-[24px] border border-stone-200/80 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04] sm:p-5">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                          <span className="rounded-full bg-stone-100 px-2.5 py-1 dark:bg-white/10">第 {turnIndex + 1} 轮</span>
                          <span className="rounded-full bg-stone-100 px-2.5 py-1 dark:bg-white/10">
                            {isLoadingTurn ? `搜索中 ${(elapsedMs / 1000).toFixed(1)}s` : `${(turn.elapsedMs / 1000).toFixed(2)}s`}
                          </span>
                          {turn.result?.status ? <span className="rounded-full bg-stone-100 px-2.5 py-1 dark:bg-white/10">{turn.result.status}</span> : null}
                          {sources.length ? <span className="rounded-full bg-stone-100 px-2.5 py-1 dark:bg-white/10">{sources.length} sources</span> : null}
                        </div>
                        {!isLoadingTurn && turn.result ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 transition hover:border-stone-300 hover:text-stone-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300"
                            onClick={() => void handleCopy(`answer:${turn.id}`, answerText)}
                          >
                            {copiedKey === `answer:${turn.id}` ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                            复制回答
                          </button>
                        ) : null}
                      </div>

                      {isLoadingTurn ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-stone-300">
                          <LoaderCircle className="size-4 animate-spin" />
                          正在搜索网页并整理答案...
                        </div>
                      ) : null}

                      {turn.error ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300">{turn.error}</div>
                      ) : null}

                      {turn.result ? (
                        <>
                          <div className="text-[15px]">
                            <MarkdownResult content={answerText} />
                          </div>
                          {sources.length ? (
                            <div className="mt-5 border-t border-stone-200 pt-4 dark:border-white/10">
                              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Sources</div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {sources.slice(0, 8).map((source, index) => {
                                  const url = cleanUrl(source.url || "");
                                  const kind = sourceKind(url);
                                  return (
                                    <a
                                      key={`${url || index}`}
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="group flex gap-3 rounded-2xl border border-stone-200 bg-white/75 p-3 text-xs transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07]"
                                    >
                                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-300">
                                        {kind === "github" ? <img src="/github.svg" alt="" aria-hidden="true" className="size-3.5 dark:invert" /> : <Globe2 className="size-3.5" />}
                                      </span>
                                      <span className="min-w-0">
                                        <span className="line-clamp-2 font-medium leading-5 text-stone-800 group-hover:text-stone-950 dark:text-stone-200 dark:group-hover:text-white">
                                          {source.title || sourceHost(url) || "source"}
                                        </span>
                                        <span className="mt-1 flex items-center gap-1 truncate text-stone-500 dark:text-stone-400">
                                          <ExternalLink className="size-3 shrink-0" />
                                          {sourceHost(url)}
                                        </span>
                                      </span>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </article>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            className="sticky bottom-0 z-10 border-t border-stone-200/80 bg-white/85 p-3 backdrop-blur dark:border-white/10 dark:bg-stone-950/80 sm:p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
          >
            <div className="mx-auto flex max-w-4xl items-end gap-3 rounded-[24px] border border-stone-200 bg-white px-4 py-3 shadow-lg shadow-stone-900/5 dark:border-white/10 dark:bg-white/[0.04]">
              <img src="/openai.svg" alt="" aria-hidden="true" className="mt-2 size-5 shrink-0 opacity-80 dark:invert" />
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void runSearch();
                  }
                }}
                rows={1}
                placeholder={turns.length ? "继续追问，Enter 发送，Shift+Enter 换行" : "输入搜索问题..."}
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
              />
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 dark:bg-white dark:text-stone-950 dark:hover:bg-stone-200 dark:disabled:bg-white/10 dark:disabled:text-stone-600"
              >
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
