// ========================================
// ALLEVIN MK V OpenAI Response Client
// Purpose:
// Frontend-safe helper for requesting controlled LLM improvements
// from the server route at /api/allevin/llm.
//
// Notes:
// - The OpenAI API key stays server-side.
// - The MK V context packet can be passed through to the route.
// - If the route fails, ALLEVIN falls back to safe local guidance.
// - User/project/calendar/context text is sanitized before request/return.
// ========================================

import type { AllevinLLMRequest, AllevinLLMResponse, AllevinStructuredSections } from "@/lib/allevinLLMTypes";

// ========================================
// MK V Context Packet Types
// Kept local so this client can support Build 6
// without forcing a full shared type refactor yet.
// ========================================

export type AllevinContextPacket = {
   version?: string;

   userIntent?: {
      rawPrompt?: string;
      normalizedPrompt?: string;
      intentType?: string;
   };

   currentProject?: {
      title?: string;
      type?: string;
      location?: string;
      status?: string;
      priority?: string;
      body?: string;
      canvasContent?: string;
      latestProjectNote?: string;
      recommendedNextAction?: string;
   };

   projects?: {
      count?: number;
      titles?: string[];
      latestTitle?: string;
   };

   calendar?: {
      hasUpcomingEvents?: boolean;
      nextEventSummary?: string;
      todaySummary?: string;
   };

   cognition?: {
      state?: string;
      label?: string;
      mood?: string;
      momentum?: string;
      suggestion?: string;
      adapts?: string;
   };

   responseRules?: {
      tone?: string;
      format?: string;
      avoid?: string[];
   };
};

export type AllevinLLMRequestWithContext = AllevinLLMRequest & {
   contextPacket?: AllevinContextPacket;
};

// ========================================
// MK V Build 6 — LLM Client Sanitization
// Purpose:
// The LLM client is an AI boundary. Sanitize
// context before sending and sanitize responses
// before returning to ALLEVIN.
// ========================================

const LLM_CLIENT_SANITIZE_LIMITS = {
   prompt: 8000,
   title: 120,
   body: 100000,
   summary: 1500,
   nextStep: 1000,
   smallText: 300,
   responseText: 4000,
   contextTitles: 20,
} as const;

function limitLLMClientTextLength(value: string, maxLength: number) {
   if (value.length <= maxLength) {
      return value;
   }

   return value.slice(0, maxLength).trim();
}

function stripUnsafeLLMClientMarkup(value?: string) {
   let clean = value || "";

   clean = clean.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
   clean = clean.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
   clean = clean.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "");
   clean = clean.replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "");
   clean = clean.replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "");
   clean = clean.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
   clean = clean.replace(/javascript\s*:/gi, "");
   clean = clean.replace(/data\s*:\s*text\/html/gi, "");
   clean = clean.replace(/<[^>]+>/g, "");

   return clean;
}

function sanitizeLLMClientText(value?: string, maxLength = LLM_CLIENT_SANITIZE_LIMITS.responseText) {
   return limitLLMClientTextLength(
      stripUnsafeLLMClientMarkup(value)
         .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
         .replace(/\u2028|\u2029/g, "\n")
         .replace(/\r/g, "\n")
         .trim(),
      maxLength,
   );
}

function sanitizeLLMTitle(value?: string) {
   return sanitizeLLMClientText(value, LLM_CLIENT_SANITIZE_LIMITS.title).replace(/\n+/g, " ").trim();
}

function sanitizeLLMBody(value?: string) {
   return sanitizeLLMClientText(value, LLM_CLIENT_SANITIZE_LIMITS.body);
}

function sanitizeLLMSummary(value?: string) {
   return sanitizeLLMClientText(value, LLM_CLIENT_SANITIZE_LIMITS.summary);
}

function sanitizeLLMNextStep(value?: string) {
   return sanitizeLLMClientText(value, LLM_CLIENT_SANITIZE_LIMITS.nextStep);
}

function sanitizeLLMSmallText(value?: string) {
   return sanitizeLLMClientText(value, LLM_CLIENT_SANITIZE_LIMITS.smallText).replace(/\n+/g, " ").trim();
}

function sanitizeLLMStringArray(values?: string[], maxItems = LLM_CLIENT_SANITIZE_LIMITS.contextTitles) {
   return Array.isArray(values)
      ? values
           .map((value) => sanitizeLLMTitle(value))
           .filter(Boolean)
           .slice(0, maxItems)
      : [];
}

function clampLLMConfidence(value?: number, fallback = 60) {
   return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
}

function sanitizeContextPacket(contextPacket?: AllevinContextPacket): AllevinContextPacket | undefined {
   if (!contextPacket) {
      return undefined;
   }

   return {
      version: sanitizeLLMSmallText(contextPacket.version || "mkv"),

      userIntent: {
         rawPrompt: sanitizeLLMClientText(contextPacket.userIntent?.rawPrompt, LLM_CLIENT_SANITIZE_LIMITS.prompt),
         normalizedPrompt: sanitizeLLMClientText(contextPacket.userIntent?.normalizedPrompt, LLM_CLIENT_SANITIZE_LIMITS.prompt),
         intentType: sanitizeLLMSmallText(contextPacket.userIntent?.intentType),
      },

      currentProject: {
         title: sanitizeLLMTitle(contextPacket.currentProject?.title),
         type: sanitizeLLMSmallText(contextPacket.currentProject?.type),
         location: sanitizeLLMSmallText(contextPacket.currentProject?.location),
         status: sanitizeLLMSmallText(contextPacket.currentProject?.status),
         priority: sanitizeLLMSmallText(contextPacket.currentProject?.priority),
         body: sanitizeLLMBody(contextPacket.currentProject?.body),
         canvasContent: sanitizeLLMBody(contextPacket.currentProject?.canvasContent),
         latestProjectNote: sanitizeLLMSummary(contextPacket.currentProject?.latestProjectNote),
         recommendedNextAction: sanitizeLLMNextStep(contextPacket.currentProject?.recommendedNextAction),
      },

      projects: {
         count: typeof contextPacket.projects?.count === "number" && Number.isFinite(contextPacket.projects.count) ? Math.max(0, contextPacket.projects.count) : 0,
         titles: sanitizeLLMStringArray(contextPacket.projects?.titles),
         latestTitle: sanitizeLLMTitle(contextPacket.projects?.latestTitle),
      },

      calendar: {
         hasUpcomingEvents: contextPacket.calendar?.hasUpcomingEvents === true,
         nextEventSummary: sanitizeLLMSummary(contextPacket.calendar?.nextEventSummary),
         todaySummary: sanitizeLLMSummary(contextPacket.calendar?.todaySummary),
      },

      cognition: {
         state: sanitizeLLMSmallText(contextPacket.cognition?.state),
         label: sanitizeLLMSmallText(contextPacket.cognition?.label),
         mood: sanitizeLLMSmallText(contextPacket.cognition?.mood),
         momentum: sanitizeLLMSmallText(contextPacket.cognition?.momentum),
         suggestion: sanitizeLLMNextStep(contextPacket.cognition?.suggestion),
         adapts: sanitizeLLMSmallText(contextPacket.cognition?.adapts),
      },

      responseRules: {
         tone: sanitizeLLMSmallText(contextPacket.responseRules?.tone),
         format: sanitizeLLMSmallText(contextPacket.responseRules?.format),
         avoid: sanitizeLLMStringArray(contextPacket.responseRules?.avoid, 12),
      },
   };
}

function sanitizeLLMRequest(request: AllevinLLMRequestWithContext): AllevinLLMRequestWithContext {
   return {
      ...request,
      title: sanitizeLLMTitle(request.title),
      rawContent: sanitizeLLMBody(request.rawContent),
      focus: sanitizeLLMSummary(request.focus),
      usefulContext: sanitizeLLMSummary(request.usefulContext),
      nextStep: sanitizeLLMNextStep(request.nextStep),
      source: sanitizeLLMSmallText(request.source),
      projectStage: sanitizeLLMSmallText(request.projectStage),
      currentLocation: sanitizeLLMSmallText(request.currentLocation),
      priority: sanitizeLLMSmallText(request.priority),
      contextPacket: sanitizeContextPacket(request.contextPacket),
   };
}

function sanitizeLLMResponse(response: AllevinLLMResponse, fallbackRequest?: AllevinLLMRequestWithContext): AllevinLLMResponse {
   return {
      ...response,
      ok: response.ok === true,
      mode: response.mode || fallbackRequest?.mode,
      source: sanitizeLLMSmallText(response.source || fallbackRequest?.source),
      title: sanitizeLLMTitle(response.title || fallbackRequest?.title || "ALLEVIN Project"),
      focus: sanitizeLLMSummary(response.focus),
      usefulContext: sanitizeLLMSummary(response.usefulContext),
      nextStep: sanitizeLLMNextStep(response.nextStep),
      summary: sanitizeLLMSummary(response.summary || response.focus),
      confidence: clampLLMConfidence(response.confidence, response.usedFallback ? 55 : 72),
      usedFallback: response.usedFallback === true,
      error: response.error ? "LLM request fell back safely." : undefined,
   };
}

function cleanText(value?: string) {
   return sanitizeLLMClientText(value, LLM_CLIENT_SANITIZE_LIMITS.body);
}

function compactText(value?: string) {
   return cleanText(value).replace(/\s+/g, " ").trim();
}

function extractSection(text: string, label: string) {
   const safeLabel = sanitizeLLMSmallText(label);

   const pattern = new RegExp(`(?:^|\\n)\\s*${safeLabel}\\s*:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:Focus|Useful Context|Next Step|Summary|Title)\\s*:|$)`, "i");

   const match = text.match(pattern);

   return cleanText(match?.[1]);
}

function getContextTitle(request: AllevinLLMRequestWithContext) {
   return sanitizeLLMTitle(request.contextPacket?.currentProject?.title || request.title || "ALLEVIN Project");
}

function getContextProjectType(request: AllevinLLMRequestWithContext) {
   return sanitizeLLMSmallText(request.contextPacket?.currentProject?.type || request.projectStage || "general project");
}

function getContextLocation(request: AllevinLLMRequestWithContext) {
   return sanitizeLLMSmallText(request.contextPacket?.currentProject?.location || request.currentLocation || "workspace");
}

function getContextNextStep(request: AllevinLLMRequestWithContext) {
   return sanitizeLLMNextStep(request.contextPacket?.currentProject?.recommendedNextAction || request.nextStep || "Choose the next useful action.");
}

export function parseStructuredHandoff(value?: string): AllevinStructuredSections {
   const text = cleanText(value);

   const title = extractSection(text, "Title");

   const focus = extractSection(text, "Focus");

   const usefulContext = extractSection(text, "Useful Context");

   const nextStep = extractSection(text, "Next Step");

   return {
      title,
      focus,
      usefulContext,
      nextStep,
   };
}

export function buildStructuredHandoff(sections: Partial<AllevinStructuredSections>) {
   const focus = sanitizeLLMSummary(sections.focus);

   const usefulContext = sanitizeLLMSummary(sections.usefulContext);

   const nextStep = sanitizeLLMNextStep(sections.nextStep);

   return sanitizeLLMBody([`Focus:\n${focus || "Review the current work."}`, `Useful Context:\n${usefulContext || "No additional context provided."}`, `Next Step:\n${nextStep || "Choose the next useful action."}`].join("\n\n"));
}

export function buildLLMFallbackResponse(request: AllevinLLMRequestWithContext, error?: string): AllevinLLMResponse {
   const safeRequest = sanitizeLLMRequest(request);

   const parsed = parseStructuredHandoff(safeRequest.rawContent);

   const title = getContextTitle(safeRequest);

   const focus = sanitizeLLMSummary(safeRequest.focus || parsed.focus || safeRequest.contextPacket?.currentProject?.body || safeRequest.rawContent || "Review the current project content.");

   const usefulContext = sanitizeLLMSummary(
      safeRequest.usefulContext ||
         parsed.usefulContext ||
         [
            `Source: ${safeRequest.source}`,
            `Project type: ${getContextProjectType(safeRequest)}`,
            `Location: ${getContextLocation(safeRequest)}`,
            safeRequest.priority ? `Priority: ${safeRequest.priority}` : "",
            safeRequest.contextPacket?.cognition?.label ? `Cognition: ${safeRequest.contextPacket.cognition.label}` : "",
            safeRequest.contextPacket?.calendar?.nextEventSummary ? `Next calendar item: ${safeRequest.contextPacket.calendar.nextEventSummary}` : "",
         ]
            .filter(Boolean)
            .join("\n"),
   );

   const nextStep = getContextNextStep(safeRequest);

   return sanitizeLLMResponse(
      {
         ok: !error,
         mode: safeRequest.mode,
         source: safeRequest.source,
         title,
         focus,
         usefulContext,
         nextStep,
         summary: focus.length > 220 ? `${focus.slice(0, 220).trim()}...` : focus,
         confidence: error ? 55 : 72,
         usedFallback: Boolean(error),
         error: error ? "LLM request fell back safely." : undefined,
      },
      safeRequest,
   );
}

export async function requestAllevinLLM(request: AllevinLLMRequestWithContext): Promise<AllevinLLMResponse> {
   const safeRequest = sanitizeLLMRequest(request);

   try {
      const response = await fetch("/api/allevin/llm", {
         method: "POST",
         headers: {
            "Content-Type": "application/json",
         },
         body: JSON.stringify(safeRequest),
      });

      const data = (await response.json()) as AllevinLLMResponse;

      if (!response.ok || !data?.ok) {
         return buildLLMFallbackResponse(safeRequest, "LLM route unavailable");
      }

      return sanitizeLLMResponse(data, safeRequest);
   } catch {
      return buildLLMFallbackResponse(safeRequest, "LLM request failed");
   }
}

export async function improveHandoffWithLLM(request: Omit<AllevinLLMRequestWithContext, "mode">) {
   return requestAllevinLLM({
      ...request,
      mode: "clean-handoff",
   });
}

export async function summarizeWithLLM(request: Omit<AllevinLLMRequestWithContext, "mode">) {
   return requestAllevinLLM({
      ...request,
      mode: "summarize",
   });
}

export async function suggestNextStepWithLLM(request: Omit<AllevinLLMRequestWithContext, "mode">) {
   return requestAllevinLLM({
      ...request,
      mode: "next-step",
   });
}

export async function polishExportWithLLM(request: Omit<AllevinLLMRequestWithContext, "mode">) {
   return requestAllevinLLM({
      ...request,
      mode: "export-polish",
   });
}
