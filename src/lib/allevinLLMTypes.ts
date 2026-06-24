// ========================================
// ALLEVIN MK V Light LLM Types
// Purpose:
// Shared types for the controlled MK V LLM helper layer.
// The helper improves summaries, next steps, handoffs, exports,
// AIDock guidance, and general knowledge responses,
// but does not autonomously move work across ALLEVIN.
// ========================================

export type AllevinLLMMode = "summarize" | "next-step" | "clean-handoff" | "export-polish" | "calendar-to-task" | "aidock-guidance" | "general-knowledge" | "tool-guidance";

export type AllevinLLMSource = "canvas" | "task" | "board" | "recovery" | "calendar" | "export" | "aidock" | "weather" | "tools" | "system";

export type AllevinLLMPriority = "low" | "medium" | "high";

export const ALLEVIN_LLM_MODES: AllevinLLMMode[] = ["summarize", "next-step", "clean-handoff", "export-polish", "calendar-to-task", "aidock-guidance", "general-knowledge", "tool-guidance"];

export const ALLEVIN_LLM_SOURCES: AllevinLLMSource[] = ["canvas", "task", "board", "recovery", "calendar", "export", "aidock", "weather", "tools", "system"];

export const ALLEVIN_LLM_PRIORITIES: AllevinLLMPriority[] = ["low", "medium", "high"];

export function isAllevinLLMMode(value?: string): value is AllevinLLMMode {
   return ALLEVIN_LLM_MODES.includes(value as AllevinLLMMode);
}

export function isAllevinLLMSource(value?: string): value is AllevinLLMSource {
   return ALLEVIN_LLM_SOURCES.includes(value as AllevinLLMSource);
}

export function isAllevinLLMPriority(value?: string): value is AllevinLLMPriority {
   return ALLEVIN_LLM_PRIORITIES.includes(value as AllevinLLMPriority);
}

export interface AllevinLLMRequest {
   mode: AllevinLLMMode;
   source: AllevinLLMSource;
   title?: string;
   focus?: string;
   usefulContext?: string;
   nextStep?: string;
   rawContent?: string;
   userInstruction?: string;
   projectStage?: string;
   currentLocation?: string;
   priority?: AllevinLLMPriority;
   maxWords?: number;
}

export interface AllevinLLMResponse {
   ok: boolean;
   mode: AllevinLLMMode;
   source: AllevinLLMSource;
   title: string;
   focus: string;
   usefulContext: string;
   nextStep: string;
   summary: string;
   confidence: number;
   usedFallback: boolean;
   error?: string;
}

export interface AllevinStructuredSections {
   title: string;
   focus: string;
   usefulContext: string;
   nextStep: string;
}
