// ========================================
// ALLEVIN MK XV — Kin LLM Client
// Browser-safe helper. The API key remains server-side.
// ========================================

import type { KinLLMRequest, KinLLMResponse } from "@/lib/allevinLLMTypes";
import { ALLEVIN_BUILD } from "@/lib/allevinBuild";

const LANGUAGE_DIAGNOSTICS_KEY = "allevin-language-diagnostics-mkxv-1";

export type LanguageDiagnostic = {
   at: number;
   area: string;
   mode: string;
   source: "llm" | "provider" | "network" | "validation" | "safety";
   reason?: string;
};

function clean(value: unknown, limit = 6000) {
   return String(value ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
      .slice(0, limit);
}

function sanitizeRequest(request: KinLLMRequest): KinLLMRequest {
   const responseModes = ["state-ack", "grounded", "clarify", "mutation-ack"] as const;
   return {
      mode: "kin-life",
      responseMode: responseModes.includes(request.responseMode as (typeof responseModes)[number])
         ? request.responseMode
         : "normal",
      stateReceipt: clean(request.stateReceipt, 3000) || undefined,
      candidateTitle: clean(request.candidateTitle, 180) || undefined,
      recentReplies: Array.isArray(request.recentReplies)
         ? request.recentReplies.slice(-12).map((reply) => clean(reply, 1000)).filter(Boolean)
         : [],
      variationNonce: clean(request.variationNonce, 120) || undefined,
      rejectedReply: clean(request.rejectedReply, 1000) || undefined,
      input: clean(request.input, 6000),
      nowIso: clean(request.nowIso, 80),
      timezoneOffsetMinutes: Number.isFinite(request.timezoneOffsetMinutes) ? request.timezoneOffsetMinutes : 0,
      displayName: clean(request.displayName, 80) || undefined,
      assistantContext: clean(request.assistantContext, 12000) || undefined,
      voiceStyle: request.voiceStyle === "balanced" || request.voiceStyle === "calm" ? request.voiceStyle : "direct",
      lifeItems: Array.isArray(request.lifeItems) ? request.lifeItems.slice(0, 120) : [],
      conversation: Array.isArray(request.conversation)
         ? request.conversation
              .slice(-12)
              .map((message) => ({ role: message.role === "user" ? ("user" as const) : ("assistant" as const), content: clean(message.content, 3000) }))
              .filter((message) => message.content)
         : [],
   };
}

function appendLanguageDiagnostic(entry: LanguageDiagnostic) {
   if (typeof window === "undefined") return;
   try {
      const parsed = JSON.parse(window.localStorage.getItem(LANGUAGE_DIAGNOSTICS_KEY) || "[]") as unknown;
      const previous = Array.isArray(parsed) ? parsed.slice(-80) : [];
      window.localStorage.setItem(
         LANGUAGE_DIAGNOSTICS_KEY,
         JSON.stringify([...previous, entry].slice(-100)),
      );
   } catch {
      // Diagnostics must never interfere with conversation.
   }
}

function recordLanguageDiagnostic(
   request: KinLLMRequest,
   source: LanguageDiagnostic["source"],
   reason?: string,
) {
   appendLanguageDiagnostic({
      at: Date.now(),
      area: "chat-language",
      mode: request.responseMode || "normal",
      source,
      reason: clean(reason, 160) || undefined,
   });
}

/**
 * The provider may answer successfully while the browser rejects wording that
 * does not preserve deterministic schedule truth. Record that separately so
 * Settings never mislabels a validation failure as a missing API connection.
 */
export function recordLanguageValidationFailure(mode: KinLLMRequest["responseMode"], reason: string) {
   appendLanguageDiagnostic({
      at: Date.now(),
      area: "chat-language",
      mode: mode || "normal",
      source: "validation",
      reason: clean(reason, 160) || undefined,
   });
}

export function readLatestLanguageDiagnostic(): LanguageDiagnostic | null {
   if (typeof window === "undefined") return null;
   try {
      const parsed = JSON.parse(window.localStorage.getItem(LANGUAGE_DIAGNOSTICS_KEY) || "[]") as unknown;
      if (!Array.isArray(parsed)) return null;
      const latest = parsed.at(-1);
      if (!latest || typeof latest !== "object") return null;
      const value = latest as Partial<LanguageDiagnostic>;
      if (typeof value.at !== "number" || typeof value.source !== "string") return null;
      return value as LanguageDiagnostic;
   } catch {
      return null;
   }
}

export async function requestKinLLM(request: KinLLMRequest): Promise<KinLLMResponse> {
   const fallback: KinLLMResponse = { ok: true, reply: "", actions: [], usedFallback: true };

   try {
      const response = await fetch(`/api/allevin/llm?client=${encodeURIComponent(ALLEVIN_BUILD.languageProtocol)}`, {
         method: "POST",
         cache: "no-store",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(sanitizeRequest(request)),
      });
      if (!response.ok) {
         recordLanguageDiagnostic(request, "network", `http-${response.status}`);
         return fallback;
      }
      const parsed = (await response.json()) as Partial<KinLLMResponse>;
      const result = {
         ok: parsed.ok !== false,
         reply: clean(parsed.reply, 8000),
         actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 8) : [],
         usedFallback: parsed.usedFallback === true,
         canonicalTitle: clean(parsed.canonicalTitle, 180) || undefined,
         error: clean(parsed.error, 240) || undefined,
      };
      recordLanguageDiagnostic(request, result.usedFallback ? "provider" : "llm", result.error);
      return result;
   } catch {
      recordLanguageDiagnostic(request, "network", "client-or-network");
      return fallback;
   }
}
