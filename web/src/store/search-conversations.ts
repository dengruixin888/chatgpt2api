"use client";

import localforage from "localforage";

import type { SearchResult } from "@/app/debug/components/types";

export type SearchTurnStatus = "loading" | "success" | "error";

export type SearchTurn = {
  id: string;
  prompt: string;
  sentPrompt: string;
  result: SearchResult | null;
  error: string;
  elapsedMs: number;
  status: SearchTurnStatus;
};

export type SearchConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: SearchTurn[];
};

const searchConversationStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "search_conversations",
});

const conversationsKey = "items";

function normalizeTurn(turn: SearchTurn & Record<string, unknown>): SearchTurn {
  return {
    id: String(turn.id || `${Date.now()}`),
    prompt: String(turn.prompt || ""),
    sentPrompt: String(turn.sentPrompt || ""),
    result: turn.result && typeof turn.result === "object" ? (turn.result as SearchResult) : null,
    error:
      turn.status === "loading"
        ? "搜索已中断，请重新发起。"
        : typeof turn.error === "string"
          ? turn.error
          : "",
    elapsedMs: Number(turn.elapsedMs || 0),
    status: turn.status === "success" || turn.status === "error" ? turn.status : "error",
  };
}

function normalizeConversation(conversation: SearchConversation & Record<string, unknown>): SearchConversation {
  const turns = Array.isArray(conversation.turns)
    ? conversation.turns.map((turn) => normalizeTurn(turn as SearchTurn & Record<string, unknown>))
    : [];
  const createdAt = String(conversation.createdAt || new Date().toISOString());
  const updatedAt = String(conversation.updatedAt || turns.at(-1)?.id || createdAt);
  return {
    id: String(conversation.id || `${Date.now()}`),
    title: String(conversation.title || turns[0]?.prompt || "新搜索对话"),
    createdAt,
    updatedAt,
    turns,
  };
}

function sortConversations(conversations: SearchConversation[]) {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listSearchConversations(): Promise<SearchConversation[]> {
  const items = (await searchConversationStorage.getItem<SearchConversation[]>(conversationsKey)) || [];
  return sortConversations(items.map((item) => normalizeConversation(item as SearchConversation & Record<string, unknown>)));
}

export async function saveSearchConversations(conversations: SearchConversation[]): Promise<void> {
  await searchConversationStorage.setItem(
    conversationsKey,
    sortConversations(conversations.map((conversation) => normalizeConversation(conversation as SearchConversation & Record<string, unknown>))),
  );
}
