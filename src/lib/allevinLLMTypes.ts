// ========================================
// ALLEVIN MK XII — Kin LLM Contract
// Small transport boundary between the client and the server-only AI provider.
// ========================================

import type { KinAction, LifeSnapshotItem } from "@/lib/lifeTypes";

export interface KinLLMConversationMessage {
   role: "user" | "assistant";
   content: string;
}

export interface KinLLMRequest {
   mode: "kin-life";
   /**
    * normal = the model may propose life-state actions.
    * state-ack = deterministic client code already changed state; the model is
    * only allowed to phrase a natural acknowledgement from that recorded truth.
    */
   responseMode?: "normal" | "state-ack" | "grounded" | "clarify" | "mutation-ack";
   /** Machine-readable-ish summary of a deterministic mutation. Never treated
    * as free-form authority over the actual state snapshot. */
   stateReceipt?: string;
   /** Deterministic title candidate. The model may only improve concise display
    * wording/capitalization; the client validates semantic overlap. */
   candidateTitle?: string;
   /** Recent assistant language is supplied only to avoid repetitive phrasing,
    * never as schedule authority. */
   recentReplies?: string[];
   variationNonce?: string;
   input: string;
   nowIso: string;
   timezoneOffsetMinutes: number;
   displayName?: string;
   assistantContext?: string;
   voiceStyle?: "direct" | "balanced" | "calm";
   lifeItems: LifeSnapshotItem[];
   conversation: KinLLMConversationMessage[];
}

export interface KinLLMResponse {
   ok: boolean;
   reply: string;
   actions: KinAction[];
   usedFallback: boolean;
   canonicalTitle?: string;
   error?: string;
}
