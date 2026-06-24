// ========================================
// ALLEVIN MK V OpenAI Response Layer
// Path:
// src/app/api/allevin/llm/route.ts
//
// Purpose:
// Server-only controlled LLM helper.
// Keeps the OpenAI API key out of the browser.
// Uses the MK V internal context packet so ALLEVIN can
// respond with stronger project awareness, natural variation,
// and calm ALLEVIN personality while keeping actions local.
// ========================================

import { NextResponse } from "next/server";

import type { AllevinLLMRequest, AllevinLLMResponse } from "@/lib/allevinLLMTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ========================================
// MK V Context Packet Types
// Kept local so this route does not require
// immediate changes to allevinLLMTypes.ts.
// ========================================

type AllevinContextPacket = {
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

type AllevinLLMRequestWithContext = AllevinLLMRequest & {
   contextPacket?: AllevinContextPacket;
};

// ========================================
// Text Helpers
// ========================================

function cleanText(value?: string) {
   return (value || "").replace(/\r/g, "").trim();
}

function compactText(value?: string) {
   return cleanText(value).replace(/\s+/g, " ").trim();
}

// ========================================
// MK V Build 6 — Server Route Sanitization
// ========================================

const ROUTE_SANITIZE_LIMITS = {
   title: 120,
   body: 100000,
   prompt: 8000,
   context: 5000,
   summary: 1500,
   nextStep: 1000,
   smallText: 300,
   error: 160,
} as const;

function stripUnsafeRouteMarkup(value?: string) {
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

function sanitizeRouteText(value?: string, maxLength: number = ROUTE_SANITIZE_LIMITS.summary) {
   const clean = stripUnsafeRouteMarkup(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

   return clean.length > maxLength ? clean.slice(0, maxLength).trim() : clean;
}

function sanitizeRouteTitle(value?: string) {
   return sanitizeRouteText(value, ROUTE_SANITIZE_LIMITS.title).replace(/\n+/g, " ").trim();
}

function sanitizeRouteBody(value?: string) {
   return sanitizeRouteText(value, ROUTE_SANITIZE_LIMITS.body);
}

function sanitizeRouteSummary(value?: string) {
   return sanitizeRouteText(value, ROUTE_SANITIZE_LIMITS.summary);
}

function sanitizeRouteNextStep(value?: string) {
   return sanitizeRouteText(value, ROUTE_SANITIZE_LIMITS.nextStep);
}

function sanitizeRouteSmallText(value?: string) {
   return sanitizeRouteText(value, ROUTE_SANITIZE_LIMITS.smallText).replace(/\n+/g, " ").trim();
}

function clampRouteConfidence(value: unknown, fallback = 72) {
   return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
}

function sanitizeContextPacket(contextPacket?: AllevinContextPacket): AllevinContextPacket | undefined {
   if (!contextPacket) {
      return undefined;
   }

   return {
      version: sanitizeRouteSmallText(contextPacket.version || "MK V"),
      userIntent: {
         rawPrompt: sanitizeRouteText(contextPacket.userIntent?.rawPrompt, ROUTE_SANITIZE_LIMITS.prompt),
         normalizedPrompt: sanitizeRouteText(contextPacket.userIntent?.normalizedPrompt, ROUTE_SANITIZE_LIMITS.prompt),
         intentType: sanitizeRouteSmallText(contextPacket.userIntent?.intentType),
      },
      currentProject: {
         title: sanitizeRouteTitle(contextPacket.currentProject?.title),
         type: sanitizeRouteSmallText(contextPacket.currentProject?.type),
         location: sanitizeRouteSmallText(contextPacket.currentProject?.location),
         status: sanitizeRouteSmallText(contextPacket.currentProject?.status),
         priority: sanitizeRouteSmallText(contextPacket.currentProject?.priority),
         body: sanitizeRouteBody(contextPacket.currentProject?.body),
         canvasContent: sanitizeRouteBody(contextPacket.currentProject?.canvasContent),
         latestProjectNote: sanitizeRouteSummary(contextPacket.currentProject?.latestProjectNote),
         recommendedNextAction: sanitizeRouteNextStep(contextPacket.currentProject?.recommendedNextAction),
      },
      projects: {
         count: typeof contextPacket.projects?.count === "number" && Number.isFinite(contextPacket.projects.count) ? Math.max(0, contextPacket.projects.count) : 0,
         titles: Array.isArray(contextPacket.projects?.titles)
            ? contextPacket.projects.titles
                 .map((title) => sanitizeRouteTitle(title))
                 .filter(Boolean)
                 .slice(0, 20)
            : [],
         latestTitle: sanitizeRouteTitle(contextPacket.projects?.latestTitle),
      },
      calendar: {
         hasUpcomingEvents: contextPacket.calendar?.hasUpcomingEvents === true,
         nextEventSummary: sanitizeRouteSummary(contextPacket.calendar?.nextEventSummary),
         todaySummary: sanitizeRouteSummary(contextPacket.calendar?.todaySummary),
      },
      cognition: {
         state: sanitizeRouteSmallText(contextPacket.cognition?.state),
         label: sanitizeRouteSmallText(contextPacket.cognition?.label),
         mood: sanitizeRouteSmallText(contextPacket.cognition?.mood),
         momentum: sanitizeRouteSmallText(contextPacket.cognition?.momentum),
         suggestion: sanitizeRouteNextStep(contextPacket.cognition?.suggestion),
         adapts: sanitizeRouteSmallText(contextPacket.cognition?.adapts),
      },
      responseRules: {
         tone: sanitizeRouteSmallText(contextPacket.responseRules?.tone),
         format: sanitizeRouteSmallText(contextPacket.responseRules?.format),
         avoid: Array.isArray(contextPacket.responseRules?.avoid)
            ? contextPacket.responseRules.avoid
                 .map((item) => sanitizeRouteSmallText(item))
                 .filter(Boolean)
                 .slice(0, 12)
            : [],
      },
   };
}

function sanitizePayload(payload: AllevinLLMRequestWithContext): AllevinLLMRequestWithContext {
   return {
      ...payload,
      title: sanitizeRouteTitle(payload.title),
      focus: sanitizeRouteSummary(payload.focus),
      usefulContext: sanitizeRouteSummary(payload.usefulContext),
      nextStep: sanitizeRouteNextStep(payload.nextStep),
      rawContent: sanitizeRouteBody(payload.rawContent),
      userInstruction: sanitizeRouteText(payload.userInstruction, ROUTE_SANITIZE_LIMITS.prompt),
      projectStage: sanitizeRouteSmallText(payload.projectStage),
      currentLocation: sanitizeRouteSmallText(payload.currentLocation),
      priority: payload.priority === "low" || payload.priority === "medium" || payload.priority === "high" ? payload.priority : undefined,
      maxWords: typeof payload.maxWords === "number" && Number.isFinite(payload.maxWords) ? Math.max(40, Math.min(260, payload.maxWords)) : undefined,
      contextPacket: sanitizeContextPacket(payload.contextPacket),
   };
}

function sanitizeLLMResult(result: AllevinLLMResponse): AllevinLLMResponse {
   return {
      ...result,
      title: sanitizeRouteTitle(result.title),
      focus: sanitizeRouteSummary(result.focus),
      usefulContext: sanitizeRouteSummary(result.usefulContext),
      nextStep: sanitizeRouteNextStep(result.nextStep),
      summary: sanitizeRouteSummary(result.summary || result.focus),
      confidence: clampRouteConfidence(result.confidence, result.usedFallback ? 55 : 72),
      error: result.error ? "LLM request fell back safely." : undefined,
   };
}

function limitText(value?: string, max = 6000) {
   const text = cleanText(value);

   if (text.length <= max) {
      return text;
   }

   return `${text.slice(0, max).trim()}\n\n[Content trimmed for MK V OpenAI response layer.]`;
}

function extractSection(text: string, label: string) {
   const pattern = new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:Focus|Useful Context|Next Step|Summary|Title)\\s*:|$)`, "i");

   const match = text.match(pattern);

   return cleanText(match?.[1]);
}

function stringifyContextPacket(contextPacket?: AllevinContextPacket) {
   const safeContextPacket = sanitizeContextPacket(contextPacket);

   if (!safeContextPacket) {
      return "No MK V context packet provided.";
   }

   return JSON.stringify(
      {
         version: safeContextPacket.version || "MK V",
         userIntent: safeContextPacket.userIntent || {},
         currentProject: safeContextPacket.currentProject || {},
         projects: safeContextPacket.projects || {},
         calendar: safeContextPacket.calendar || {},
         cognition: safeContextPacket.cognition || {},
         responseRules: safeContextPacket.responseRules || {},
      },
      null,
      2,
   );
}

function getContextProjectTitle(request: AllevinLLMRequestWithContext) {
   return compactText(request.contextPacket?.currentProject?.title || request.title || "ALLEVIN Project");
}

function getContextProjectType(request: AllevinLLMRequestWithContext) {
   return compactText(request.contextPacket?.currentProject?.type || request.projectStage || "general project");
}

function getContextLocation(request: AllevinLLMRequestWithContext) {
   return compactText(request.contextPacket?.currentProject?.location || request.currentLocation || "unknown");
}

function getContextNextAction(request: AllevinLLMRequestWithContext) {
   return cleanText(request.contextPacket?.currentProject?.recommendedNextAction || request.nextStep || "Choose the next useful move.");
}

// ========================================
// Fallback
// ========================================

function buildFallbackResponse(request: AllevinLLMRequestWithContext, error?: string): AllevinLLMResponse {
   const safeRequest = sanitizePayload(request);

   const raw = sanitizeRouteBody(safeRequest.rawContent);

   const focusFromRaw = extractSection(raw, "Focus");

   const contextFromRaw = extractSection(raw, "Useful Context");

   const nextStepFromRaw = extractSection(raw, "Next Step");

   const title = sanitizeRouteTitle(getContextProjectTitle(safeRequest));

   const focus = sanitizeRouteSummary(safeRequest.focus || focusFromRaw || safeRequest.contextPacket?.currentProject?.body || raw || "Review the current project content.");

   const usefulContext =
      sanitizeRouteSummary(safeRequest.usefulContext || contextFromRaw) ||
      [
         `Source: ${safeRequest.source}`,
         `Project type: ${getContextProjectType(safeRequest)}`,
         `Location: ${getContextLocation(safeRequest)}`,
         safeRequest.priority ? `Priority: ${safeRequest.priority}` : "",
         safeRequest.contextPacket?.cognition?.label ? `Cognition: ${safeRequest.contextPacket.cognition.label}` : "",
         safeRequest.contextPacket?.calendar?.nextEventSummary ? `Next calendar item: ${safeRequest.contextPacket.calendar.nextEventSummary}` : "",
      ]
         .filter(Boolean)
         .join("\n");

   const nextStep = sanitizeRouteNextStep(safeRequest.nextStep || nextStepFromRaw || safeRequest.contextPacket?.currentProject?.recommendedNextAction || "Review the current work and choose the next useful move.");

   return {
      ok: !error,
      mode: safeRequest.mode,
      source: safeRequest.source,
      title,
      focus,
      usefulContext,
      nextStep,
      summary: focus.length > 240 ? `${focus.slice(0, 240).trim()}...` : focus,
      confidence: error ? 55 : 72,
      usedFallback: Boolean(error),
      error: error ? "LLM request fell back safely." : undefined,
   };
}

// ========================================
// Prompting
// ========================================

function getModeInstruction(mode: AllevinLLMRequest["mode"]) {
   switch (mode) {
      case "summarize":
         return "Summarize the current project clearly without adding new facts.";
      case "next-step":
         return "Recommend one clear next step based only on the provided context.";
      case "clean-handoff":
         return "Improve the handoff into clear Focus, Useful Context, and Next Step sections.";
      case "export-polish":
         return "Polish the content while preserving the user's meaning.";
      case "calendar-to-task":
         return "Turn calendar or event context into one clear scheduling/task suggestion.";
      case "aidock-guidance":
         return "Respond as ALLEVIN in a natural, lightly witty, project-aware way using the MK V context packet.";
      case "general-knowledge":
         return "Answer the general question clearly while keeping ALLEVIN's calm, useful tone. Do not invent live or current information.";
      case "tool-guidance":
         return "Explain the tool result or limitation clearly. Never fake unavailable live data.";
      default:
         return "Improve the provided ALLEVIN context clearly and safely.";
   }
}

function getProjectSpecificToneGuide(request: AllevinLLMRequestWithContext) {
   const projectType = getContextProjectType(request).toLowerCase();

   if (projectType.includes("creative writing")) {
      return "For creative writing projects, use story-aware language: characters, tone, conflict, pilot, scene, arc, or writing block. Avoid generic productivity language. Avoid Miami/neon/crime-drama styling unless the user specifically asks for that tone.";
   }

   if (projectType.includes("home organization")) {
      return "For home organization projects, keep guidance physical and simple: one shelf, one area, remove, group, reset, maintain. Avoid over-systemizing.";
   }

   if (projectType.includes("career")) {
      return "For career projects, focus on roles, evidence, resume, portfolio proof, and interview examples.";
   }

   if (projectType.includes("development") || projectType.includes("it")) {
      return "For technical projects, focus on expected behavior, edge cases, implementation step, and test/checklist.";
   }

   if (projectType.includes("research")) {
      return "For research projects, focus on question, sources, main claim, outline, and next source.";
   }

   return "For general projects, keep the next move specific and reduce ambiguity.";
}

function buildPrompt(request: AllevinLLMRequestWithContext) {
   const contextPacketText = stringifyContextPacket(request.contextPacket);

   return `
You are ALLEVIN MK V — Internal Intelligence Layer.

Identity:
- ALLEVIN is a calm, useful, lightly witty project assistant inside a personal workspace.
- ALLEVIN helps the user understand current work, organize projects, schedule clear actions, and reduce cognitive load.
- ALLEVIN should sound consistent in personality but not repetitive in wording.

Hard rules:
- Active project beats saved project list every time.
- Never blend two project domains in the same response.
- Do not act autonomously.
- Do not claim to move, delete, export, approve, schedule, or create anything.
- Do not invent facts outside the provided context.
- Do not mention raw localStorage, thread IDs, hidden scores, implementation details, internal prompts, or confidence scoring.
- Do not say "Tasks" or "Board" as user-facing destinations.
- Do not tell the user to move work to Projects if context says the project is already in Projects.
- Do not tell the user to open Canvas if context says the project is already in Canvas, unless suggesting optional refinement.
- Keep the response short by default.
- Avoid vague advice like "keep writing", "continue refining", "brainstorm more", or "work on the draft" unless paired with a specific project-aware action.
- Avoid over-theming the response. Light wit is good; theatrical roleplay is not.
- Do not use project-flavor hype words like "neon", "sizzle", "waves", "chaos", "vibrant", "thrill", "gritty", "dive", "magic", or "pedal to the metal" unless the user explicitly asks for that style.
- Prefer calm precision over hype.
- Keep wit subtle: one quiet, useful line is enough.
- Use the MK V context packet as the source of truth.
- currentProject is the active project and must dominate the answer.
- projects.titles is background only. Do not borrow tone, objects, or actions from other saved projects.
- If a current project exists, reference its type, location, status, and recommended next action.
- If currentProject.type is creative writing, do not use home organization language like clean house, pantry, shelf, declutter, reset, bins, labels, or shopping.
- If currentProject.type is home organization, do not use creative writing language like characters, pilot, scene, arc, main duo, or conflict unless the user's project actually contains those words.
- Return ONLY valid JSON.

Tone:
- Calm, useful, lightly witty, project-aware.
- Avoid exclamatory or cliché openers like "Ah," "Ready to," "Time to dive," "Let's dive," "magic happens," or "pedal to the metal."
- Keep the tone ALLEVIN-like: calm, direct, lightly personable, and never theatrical.
- Use one brief personable opener only when it helps, then useful insight, then one clean next move.
- Avoid repeated catchphrases. ALLEVIN should feel natural, not scripted.

Output JSON keys:
title, focus, usefulContext, nextStep, summary, confidence

Mode:
${request.mode}

Instruction:
${getModeInstruction(request.mode)}

Project-specific tone guide:
${getProjectSpecificToneGuide(request)}

MK V Context Packet:
${limitText(contextPacketText, 5000)}

Legacy project data:
Title: ${request.title || "Untitled"}
Source: ${request.source}
Stage: ${request.projectStage || "unknown"}
Location: ${request.currentLocation || "unknown"}
Priority: ${request.priority || "medium"}
Max words: ${request.maxWords || 180}

Existing Focus:
${limitText(request.focus, 1800)}

Existing Useful Context:
${limitText(request.usefulContext, 1800)}

Existing Next Step:
${limitText(request.nextStep, 1000)}

Raw Content:
${limitText(request.rawContent, 4000)}

User Instruction:
${limitText(request.userInstruction, 1200)}

Intent handling:
- If userIntent.intentType is "schedule-suggestion" or the user asks what to schedule, include a duration in nextStep.
- If userIntent.intentType is not schedule-related, do not include a duration or scheduling language in nextStep.
- If user asks what matters, explain the key project priority and give one non-scheduled next action.
- Do not use the word "dive" in any response.
- If user asks what to do next, give one immediate work action.

Return a JSON object where:
- focus = one brief witty/personable opener plus one useful project-aware insight. Keep this to 1-2 short sentences.
- usefulContext = a short explanation of the project-aware reasoning, written for the user.
- nextStep = one concrete next move. It must be specific to the project type and must not be generic.
- Only schedule/time-block questions may include a duration or calendar language.
- For non-schedule questions, nextStep must be one concrete work action without "schedule", "time block", or a duration.
- For schedule/time-block questions, nextStep must include a realistic duration and a specific work focus.
- summary = a concise one-line version of the answer.
- confidence = number from 0 to 100.

Quality bar:
Bad nextStep examples:
- "Keep writing in Canvas."
- "Continue refining your draft."
- "Schedule some writing sessions."
- "Brainstorm your ideas."

Good nextStep examples for a creative writing project:
For non-schedule questions:
- "Define the main duo and write one sentence about their dynamic."
- "Choose the pilot's first conflict before outlining the season."
- "Write three tone words and one scene that proves the tone."

For schedule questions only:
- "Schedule 45 minutes to define the main duo and draft one sentence about their dynamic."
- "Schedule 60 minutes to outline the pilot's first conflict and the scene that introduces it."

Good nextStep examples for a home organization project:
- "Pick one shelf, remove expired items, and stop there."
- "Group what remains before buying bins or labels."
- "Choose the first section and give it a 30-minute reset block."
   `.trim();
}

function parseLLMJson(content: string) {
   const trimmed = content.trim();

   try {
      return JSON.parse(trimmed);
   } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);

      if (match) {
         return JSON.parse(match[0]);
      }

      throw new Error("LLM returned non-JSON content.");
   }
}

function clampConfidence(value: unknown) {
   if (typeof value !== "number" || !Number.isFinite(value)) {
      return 80;
   }

   return Math.max(0, Math.min(100, value));
}

// ========================================
// Route
// ========================================

export async function POST(request: Request) {
   let payload: AllevinLLMRequestWithContext;

   try {
      payload = (await request.json()) as AllevinLLMRequestWithContext;
   } catch {
      return NextResponse.json(
         {
            ok: false,
            error: "Invalid JSON request.",
         },
         { status: 400 },
      );
   }

   payload = sanitizePayload(payload);

   if (!payload?.mode || !payload?.source) {
      return NextResponse.json(
         {
            ok: false,
            error: "Missing mode or source.",
         },
         { status: 400 },
      );
   }

   const apiKey = process.env.OPENAI_API_KEY;

   const model = process.env.ALLEVIN_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

   if (!apiKey) {
      return NextResponse.json(buildFallbackResponse(payload, "Missing OPENAI_API_KEY. Using local fallback."), { status: 200 });
   }

   try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
         method: "POST",
         headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
         },
         body: JSON.stringify({
            model,
            temperature: payload.mode === "aidock-guidance" ? 0.42 : 0.35,
            max_tokens: 420,
            response_format: { type: "json_object" },
            messages: [
               {
                  role: "system",
                  content:
                     "You are ALLEVIN MK V's controlled response layer. Return only valid JSON. Never claim to perform actions. Be concise, calm, lightly witty, and strongly project-aware. Avoid vague advice, hype, roleplay, and repeated theme words. Only use schedule language when the user asks what to schedule.",
               },
               {
                  role: "user",
                  content: buildPrompt(payload),
               },
            ],
         }),
      });

      if (!response.ok) {
         await response.text();

         return NextResponse.json(buildFallbackResponse(payload, "LLM provider unavailable."), { status: 200 });
      }

      const data = await response.json();

      const content = data?.choices?.[0]?.message?.content;

      if (!content || typeof content !== "string") {
         return NextResponse.json(buildFallbackResponse(payload, "Missing LLM content."), { status: 200 });
      }

      const parsed = parseLLMJson(content);

      const result: AllevinLLMResponse = sanitizeLLMResult({
         ok: true,
         mode: payload.mode,
         source: payload.source,
         title: sanitizeRouteTitle(parsed.title || getContextProjectTitle(payload)),
         focus: sanitizeRouteSummary(parsed.focus || payload.focus || payload.rawContent || "Review the current project content."),
         usefulContext: sanitizeRouteSummary(parsed.usefulContext || payload.usefulContext || `Source: ${payload.source}`),
         nextStep: sanitizeRouteNextStep(parsed.nextStep || getContextNextAction(payload)),
         summary: sanitizeRouteSummary(parsed.summary || parsed.focus || payload.focus || payload.rawContent || "Project summary unavailable."),
         confidence: clampConfidence(parsed.confidence),
         usedFallback: false,
      });

      return NextResponse.json(result);
   } catch {
      return NextResponse.json(buildFallbackResponse(payload, "LLM request failed safely."), { status: 200 });
   }
}
