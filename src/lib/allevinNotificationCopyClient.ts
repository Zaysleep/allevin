"use client";

import {
   fallbackNotificationBody,
   notificationCopyCacheKey,
   validateNotificationBody,
   type NotificationCopyContext,
} from "./allevinNotificationCopy";

const COPY_CACHE_KEY = "allevin-notification-copy-cache-v1";
const CACHE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const FALLBACK_CACHE_MAX_AGE = 10 * 60 * 1000;
const CACHE_LIMIT = 220;
const DIAGNOSTICS_KEY = "allevin-language-diagnostics-mkxiv-1";

interface CopyCacheEntry {
   body: string;
   createdAt: number;
   source?: "llm" | "safety" | "fallback";
   reason?: string;
}

interface CopyCache {
   version: 1;
   entries: Record<string, CopyCacheEntry>;
   recentBodies: string[];
}

function emptyCache(): CopyCache {
   return { version: 1, entries: {}, recentBodies: [] };
}

function readCache() {
   if (typeof window === "undefined") return emptyCache();
   try {
      const parsed = JSON.parse(window.localStorage.getItem(COPY_CACHE_KEY) || "null") as Partial<CopyCache> | null;
      if (!parsed || parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== "object") return emptyCache();
      const now = Date.now();
      const entries = Object.fromEntries(
         Object.entries(parsed.entries)
            .filter(([, value]) => {
               if (!value || typeof value.body !== "string") return false;
               const maxAge = value.source === "llm" ? CACHE_MAX_AGE : FALLBACK_CACHE_MAX_AGE;
               return now - Number(value.createdAt || 0) <= maxAge;
            })
            .sort((left, right) => Number(right[1].createdAt || 0) - Number(left[1].createdAt || 0))
            .slice(0, CACHE_LIMIT),
      );
      return {
         version: 1 as const,
         entries,
         recentBodies: Array.isArray(parsed.recentBodies)
            ? parsed.recentBodies.filter((body): body is string => typeof body === "string" && Boolean(body.trim())).slice(-18)
            : [],
      };
   } catch {
      return emptyCache();
   }
}

function saveCache(cache: CopyCache) {
   if (typeof window === "undefined") return;
   try {
      window.localStorage.setItem(COPY_CACHE_KEY, JSON.stringify(cache));
   } catch {
      // Private browsing/storage pressure must not prevent the push plan itself.
   }
}

export function notificationBodyFromCache(context: NotificationCopyContext) {
   const cached = readCache().entries[notificationCopyCacheKey(context)]?.body;
   return validateNotificationBody(cached, context) || fallbackNotificationBody(context);
}

function randomNonce() {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
   return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function recordDiagnostics(entries: Array<{ id: string; source: string; reason?: string }>) {
   if (typeof window === "undefined" || !entries.length) return;
   try {
      const current = JSON.parse(window.localStorage.getItem(DIAGNOSTICS_KEY) || "[]") as unknown;
      const previous = Array.isArray(current) ? current.slice(-80) : [];
      window.localStorage.setItem(
         DIAGNOSTICS_KEY,
         JSON.stringify([...previous, ...entries.map((entry) => ({ ...entry, at: Date.now(), area: "notification-copy" }))].slice(-100)),
      );
   } catch {
      // Diagnostics must never interfere with reminder planning.
   }
}

/**
 * Copy is prepared before jobs enter Redis. Delivery therefore never waits for
 * an LLM. The cache also prevents focus/resume schedule syncs from purchasing
 * new wording for the same occurrence, while a new occurrence gets a new key.
 */
export async function prepareNotificationBodies(contexts: NotificationCopyContext[]) {
   const cache = readCache();
   const result = new Map<string, string>();
   const missing: NotificationCopyContext[] = [];

   for (const context of contexts) {
      const cached = validateNotificationBody(cache.entries[notificationCopyCacheKey(context)]?.body, context);
      if (cached) result.set(context.id, cached);
      else missing.push(context);
   }

   const generated = new Map<string, { body: string; source: "llm" | "safety"; reason?: string }>();
   if (missing.length) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
         const response = await fetch("/api/allevin/notifications/copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contexts: missing.slice(0, 48), recentBodies: cache.recentBodies.slice(-12), variationNonce: randomNonce() }),
            signal: controller.signal,
         });
         if (response.ok) {
            const payload = (await response.json()) as { copies?: Array<{ id?: unknown; body?: unknown; source?: unknown; reason?: unknown }> };
            for (const copy of Array.isArray(payload.copies) ? payload.copies : []) {
               const context = missing.find((candidate) => candidate.id === copy.id);
               if (!context) continue;
               const body = validateNotificationBody(copy.body, context);
               if (body) generated.set(context.id, {
                  body,
                  source: copy.source === "llm" ? "llm" : "safety",
                  reason: typeof copy.reason === "string" ? copy.reason.slice(0, 80) : undefined,
               });
            }
         }
      } catch {
         // A missing/slow provider must never block notification planning.
      } finally {
         window.clearTimeout(timeout);
      }
   }

   const now = Date.now();
   for (const context of missing) {
      const copy = generated.get(context.id);
      const body = copy?.body || fallbackNotificationBody(context);
      result.set(context.id, body);
      cache.entries[notificationCopyCacheKey(context)] = { body, createdAt: now, source: copy?.source || "safety", reason: copy?.reason };
      cache.recentBodies = [...cache.recentBodies.filter((candidate) => candidate !== body), body].slice(-18);
   }
   cache.entries = Object.fromEntries(
      Object.entries(cache.entries)
         .sort((left, right) => right[1].createdAt - left[1].createdAt)
         .slice(0, CACHE_LIMIT),
   );
   saveCache(cache);
   recordDiagnostics(missing.map((context) => {
      const copy = generated.get(context.id);
      return { id: context.id, source: copy?.source || "safety", reason: copy?.reason || (copy ? undefined : "client-or-timeout") };
   }));
   return result;
}
