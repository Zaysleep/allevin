"use client";

import type { KinAction } from "@/lib/lifeTypes";

const STORAGE_KEY = "allevin-pending-change-mkxx-1";
const MAX_AGE_MS = 30 * 60_000;

export type PendingAssistantChange =
   | { kind: "actions"; prompt: string; reply: string; actions: KinAction[]; createdAt: number }
   | { kind: "adaptation"; prompt: string; createdAt: number };

export type PendingAssistantChangeInput =
   | { kind: "actions"; prompt: string; reply: string; actions: KinAction[] }
   | { kind: "adaptation"; prompt: string };

export function stagePendingAssistantChange(change: PendingAssistantChangeInput) {
   if (typeof window === "undefined") return;
   window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...change, createdAt: Date.now() }));
}

export function readPendingAssistantChange(): PendingAssistantChange | null {
   if (typeof window === "undefined") return null;
   try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as PendingAssistantChange | null;
      if (!parsed || Date.now() - parsed.createdAt > MAX_AGE_MS) {
         window.localStorage.removeItem(STORAGE_KEY);
         return null;
      }
      if (parsed.kind !== "actions" && parsed.kind !== "adaptation") return null;
      return parsed;
   } catch {
      return null;
   }
}

export function clearPendingAssistantChange() {
   if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
}

export function isPendingConfirmation(prompt: string) {
   return /^(?:yes|yep|yeah|do it|just (?:the )?next|(?:the )?next (?:one|alert|reminder)|only (?:the )?next(?: one| alert| reminder)?|make (?:it|that|the change)|apply (?:it|that)|add it anyway|add anyway|save it anyway|go ahead|confirm)[.!?]?$/i.test(prompt.trim());
}

export function isPendingDecline(prompt: string) {
   return /^(?:no|nope|cancel|leave it|never mind|nevermind|don'?t|do not)[.!?]?$/i.test(prompt.trim());
}
