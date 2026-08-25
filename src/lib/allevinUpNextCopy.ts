import type { AllevinTone } from "@/lib/allevinVoice";
import type { RecommendationCategory } from "@/lib/allevinRecommendations";

export interface UpNextCopyRequest {
   cacheKey: string;
   subject: string;
   category: RecommendationCategory;
   minutes: number;
   timingLabel: string;
   recommendationTitle: string;
   recommendationDetail: string;
   focus?: string;
   voiceStyle: AllevinTone;
}

export interface UpNextCopy {
   title: string;
   detail: string;
}

interface CachedUpNextCopy extends UpNextCopy {
   key: string;
   at: number;
}

const CACHE_KEY = "allevin-up-next-copy-mkxii8-1";

function clean(value: unknown, limit: number) {
   return String(value ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
      .slice(0, limit);
}

function readCache(): CachedUpNextCopy[] {
   if (typeof window === "undefined") return [];
   try {
      const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
         .filter((entry) => entry && typeof entry === "object")
         .map((entry) => ({
            key: clean(entry.key, 320),
            title: clean(entry.title, 120),
            detail: clean(entry.detail, 420),
            at: Number(entry.at) || 0,
         }))
         .filter((entry) => entry.key && entry.title && entry.detail);
   } catch {
      return [];
   }
}

function writeCache(entry: CachedUpNextCopy) {
   if (typeof window === "undefined") return;
   const next = [entry, ...readCache().filter((candidate) => candidate.key !== entry.key)]
      .slice(0, 80);
   window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
}

/**
 * Up Next owns a deterministic recommendation assignment, but the small card
 * beside it is narration. Generate that narration from the exact subject so a
 * generic recommendation lane never turns into irrelevant copy such as
 * "protect the next transition" beside an unrelated task.
 *
 * The result is cached per occurrence + recommendation + voice. The LLM may
 * phrase the card, but it cannot alter the activity or its recommendation lane.
 */
export async function requestUpNextCopy(request: UpNextCopyRequest): Promise<UpNextCopy | null> {
   const cached = readCache().find((entry) => entry.key === request.cacheKey);
   if (cached) return { title: cached.title, detail: cached.detail };

   try {
      const response = await fetch("/api/allevin/up-next", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
            subject: clean(request.subject, 160),
            category: request.category,
            minutes: Math.max(5, Math.min(720, Math.round(request.minutes || 30))),
            timingLabel: clean(request.timingLabel, 120),
            recommendationTitle: clean(request.recommendationTitle, 220),
            recommendationDetail: clean(request.recommendationDetail, 500),
            focus: clean(request.focus, 120) || undefined,
            voiceStyle: request.voiceStyle,
         }),
      });
      if (!response.ok) return null;

      const parsed = (await response.json()) as Partial<UpNextCopy>;
      const title = clean(parsed.title, 120);
      const detail = clean(parsed.detail, 420);
      if (!title || !detail) return null;

      writeCache({ key: request.cacheKey, title, detail, at: Date.now() });
      return { title, detail };
   } catch {
      return null;
   }
}
