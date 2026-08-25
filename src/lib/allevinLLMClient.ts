// ========================================
// ALLEVIN MK XII — Kin LLM Client
// Browser-safe helper. The API key remains server-side.
// ========================================

import type { KinLLMRequest, KinLLMResponse } from "@/lib/allevinLLMTypes";

function clean(value: unknown, limit = 6000) {
   return String(value ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
      .slice(0, limit);
}

function sanitizeRequest(request: KinLLMRequest): KinLLMRequest {
   return {
      mode: "kin-life",
      responseMode: request.responseMode === "state-ack" ? "state-ack" : "normal",
      stateReceipt: clean(request.stateReceipt, 3000) || undefined,
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

export async function requestKinLLM(request: KinLLMRequest): Promise<KinLLMResponse> {
   const fallback: KinLLMResponse = { ok: true, reply: "", actions: [], usedFallback: true };

   try {
      const response = await fetch("/api/allevin/llm", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(sanitizeRequest(request)),
      });
      if (!response.ok) return fallback;
      const parsed = (await response.json()) as Partial<KinLLMResponse>;
      return {
         ok: parsed.ok !== false,
         reply: clean(parsed.reply, 8000),
         actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 8) : [],
         usedFallback: parsed.usedFallback === true,
         error: clean(parsed.error, 240) || undefined,
      };
   } catch {
      return fallback;
   }
}
