// ========================================
// ALLEVIN MK XV — Kin LLM Client
// Browser-safe helper. The API key remains server-side.
// ========================================

import type { KinLLMRequest, KinLLMResponse } from "@/lib/allevinLLMTypes";

const LANGUAGE_DIAGNOSTICS_KEY = "allevin-language-diagnostics-mkxv-1";

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

function recordLanguageDiagnostic(request: KinLLMRequest, source: "llm" | "safety", reason?: string) {
   if (typeof window === "undefined") return;
   try {
      const parsed = JSON.parse(window.localStorage.getItem(LANGUAGE_DIAGNOSTICS_KEY) || "[]") as unknown;
      const previous = Array.isArray(parsed) ? parsed.slice(-80) : [];
      window.localStorage.setItem(
         LANGUAGE_DIAGNOSTICS_KEY,
         JSON.stringify([
            ...previous,
            {
               at: Date.now(),
               area: "chat-language",
               mode: request.responseMode || "normal",
               source,
               reason: clean(reason, 160) || undefined,
            },
         ].slice(-100)),
      );
   } catch {
      // Diagnostics must never interfere with conversation.
   }
}

export async function requestKinLLM(request: KinLLMRequest): Promise<KinLLMResponse> {
   const fallback: KinLLMResponse = { ok: true, reply: "", actions: [], usedFallback: true };

   try {
      const response = await fetch("/api/allevin/llm", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(sanitizeRequest(request)),
      });
      if (!response.ok) {
         recordLanguageDiagnostic(request, "safety", `http-${response.status}`);
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
      recordLanguageDiagnostic(request, result.usedFallback ? "safety" : "llm", result.error);
      return result;
   } catch {
      recordLanguageDiagnostic(request, "safety", "client-or-network");
      return fallback;
   }
}
