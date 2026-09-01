"use client";

const STORAGE_KEY = "allevin-conversation-draft-mkxx-1";
const MAX_AGE_MS = 30 * 60_000;

export interface PendingConversationDraft {
   prompt: string;
   createdAt: number;
}

export function stageConversationDraft(prompt: string) {
   if (typeof window === "undefined") return;
   window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ prompt, createdAt: Date.now() }));
}

export function readConversationDraft(): PendingConversationDraft | null {
   if (typeof window === "undefined") return null;
   try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as PendingConversationDraft | null;
      if (!parsed || typeof parsed.prompt !== "string" || !parsed.prompt.trim() || Date.now() - Number(parsed.createdAt || 0) > MAX_AGE_MS) {
         window.localStorage.removeItem(STORAGE_KEY);
         return null;
      }
      return { prompt: parsed.prompt.trim().slice(0, 1000), createdAt: Number(parsed.createdAt) };
   } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
   }
}

export function clearConversationDraft() {
   if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
}
