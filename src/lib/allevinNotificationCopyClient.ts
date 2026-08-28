"use client";

import {
   notificationCopyCacheKey,
   validateNotificationBody,
   type NotificationCopyContext,
} from "./allevinNotificationCopy";

const COPY_CACHE_KEY = "allevin-notification-copy-cache-v3";
const CACHE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 220;
const DIAGNOSTICS_KEY = "allevin-language-diagnostics-mkxv-1";

interface CopyCacheEntry {
   body: string;
   createdAt: number;
   source: "llm";
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
               if (!value || value.source !== "llm" || typeof value.body !== "string") return false;
               return now - Number(value.createdAt || 0) <= CACHE_MAX_AGE;
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
   const cached = readCache().entries[notificationCopyCacheKey(context)];
   if (cached?.source !== "llm") return null;
   return validateNotificationBody(cached.body, context);
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

   const generated = new Map<string, { body: string; source: "llm"; reason?: string }>();
   const requestChunk = async (chunk: NotificationCopyContext[], chunkIndex: number) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
         const controller = new AbortController();
         const timeout = window.setTimeout(() => controller.abort(), 25_000);
         try {
            const response = await fetch("/api/allevin/notifications/copy", {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ contexts: chunk, recentBodies: cache.recentBodies.slice(-12), variationNonce: `${randomNonce()}-${chunkIndex}-${attempt}` }),
               cache: "no-store",
               signal: controller.signal,
            });
            if (response.ok) {
               const payload = (await response.json()) as { copies?: Array<{ id?: unknown; body?: unknown; source?: unknown; reason?: unknown }> };
               for (const copy of Array.isArray(payload.copies) ? payload.copies : []) {
                  const context = chunk.find((candidate) => candidate.id === copy.id);
                  if (!context || copy.source !== "llm") continue;
                  const body = validateNotificationBody(copy.body, context);
                  if (body) generated.set(context.id, {
                     body,
                     source: "llm",
                     reason: typeof copy.reason === "string" ? copy.reason.slice(0, 80) : undefined,
                  });
               }
            }
         } catch {
            // A second attempt below handles a brief provider or network miss.
         } finally {
            window.clearTimeout(timeout);
         }
         if (chunk.every((context) => generated.has(context.id))) return;
      }
   };

   if (missing.length) {
      // Jobs arrive ordered by due time. The nearest eight are completed first
      // so a reminder created five minutes away never waits behind the entire
      // 48-hour plan. Remaining small batches can then prepare concurrently.
      const chunks = Array.from({ length: Math.ceil(missing.length / 8) }, (_, index) => missing.slice(index * 8, index * 8 + 8));
      await requestChunk(chunks[0], 0);
      await Promise.all(chunks.slice(1).map((chunk, index) => requestChunk(chunk, index + 1)));
   }

   const now = Date.now();
   for (const context of missing) {
      const copy = generated.get(context.id);
      if (!copy) continue;
      result.set(context.id, copy.body);
      cache.entries[notificationCopyCacheKey(context)] = { body: copy.body, createdAt: now, source: "llm", reason: copy.reason };
      cache.recentBodies = [...cache.recentBodies.filter((candidate) => candidate !== copy.body), copy.body].slice(-18);
   }
   cache.entries = Object.fromEntries(
      Object.entries(cache.entries)
         .sort((left, right) => right[1].createdAt - left[1].createdAt)
         .slice(0, CACHE_LIMIT),
   );
   saveCache(cache);
   recordDiagnostics(missing.map((context) => {
      const copy = generated.get(context.id);
      return { id: context.id, source: copy?.source || "missing", reason: copy?.reason || (copy ? undefined : "client-or-timeout") };
   }));
   return result;
}
