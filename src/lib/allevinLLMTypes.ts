// ========================================
// ALLEVIN MK VI Light LLM Types
// Purpose:
// Shared types for the controlled MK VI LLM helper layer.
// The helper improves summaries, next steps, handoffs,
// AIDock guidance, project materials, material interpretation,
// calendar-to-task flow, and general guidance while keeping
// ALLEVIN internal-first.
//
// Important:
// ALLEVIN does not autonomously move, delete, publish,
// export, or send user work. It provides guidance and
// structured support inside the workspace.
// ========================================

export type AllevinLLMMode = "summarize" | "next-step" | "clean-handoff" | "calendar-to-task" | "aidock-guidance" | "general-knowledge" | "tool-guidance" | "material-summary" | "material-interpretation" | "project-guidance";

export type AllevinLLMSource = "canvas" | "task" | "project" | "projects" | "materials" | "calendar" | "aidock" | "weather" | "tools" | "system";

export type AllevinLLMPriority = "low" | "medium" | "high";

export type AllevinLLMMaterialType = "Note" | "Document" | "Image" | "Research" | "Feedback" | "Reference";

export type AllevinLLMMaterialKind = "note" | "document" | "image" | "research" | "feedback" | "reference" | "unknown";

export const ALLEVIN_LLM_MODES: AllevinLLMMode[] = ["summarize", "next-step", "clean-handoff", "calendar-to-task", "aidock-guidance", "general-knowledge", "tool-guidance", "material-summary", "material-interpretation", "project-guidance"];

export const ALLEVIN_LLM_SOURCES: AllevinLLMSource[] = ["canvas", "task", "project", "projects", "materials", "calendar", "aidock", "weather", "tools", "system"];

export const ALLEVIN_LLM_PRIORITIES: AllevinLLMPriority[] = ["low", "medium", "high"];

export const ALLEVIN_LLM_MATERIAL_TYPES: AllevinLLMMaterialType[] = ["Note", "Document", "Image", "Research", "Feedback", "Reference"];

export const ALLEVIN_LLM_MATERIAL_KINDS: AllevinLLMMaterialKind[] = ["note", "document", "image", "research", "feedback", "reference", "unknown"];

export function isAllevinLLMMode(value?: string): value is AllevinLLMMode {
   return ALLEVIN_LLM_MODES.includes(value as AllevinLLMMode);
}

export function isAllevinLLMSource(value?: string): value is AllevinLLMSource {
   return ALLEVIN_LLM_SOURCES.includes(value as AllevinLLMSource);
}

export function isAllevinLLMPriority(value?: string): value is AllevinLLMPriority {
   return ALLEVIN_LLM_PRIORITIES.includes(value as AllevinLLMPriority);
}

export function isAllevinLLMMaterialType(value?: string): value is AllevinLLMMaterialType {
   return ALLEVIN_LLM_MATERIAL_TYPES.includes(value as AllevinLLMMaterialType);
}

export function isAllevinLLMMaterialKind(value?: string): value is AllevinLLMMaterialKind {
   return ALLEVIN_LLM_MATERIAL_KINDS.includes(value as AllevinLLMMaterialKind);
}

export interface AllevinLLMProjectMaterialContext {
   count?: number;
   selectedTitles?: string[];
   titles?: string[];
   summaries?: string[];
   usefulSignals?: string[];
}

export interface AllevinLLMSelectedMaterialContext {
   materialTitle?: string;
   materialType?: AllevinLLMMaterialType | string;
   materialKind?: AllevinLLMMaterialKind | string;
   materialSource?: string;
   materialNotes?: string;
   materialSummary?: string;

   // Document interpretation context.
   // TXT/Markdown can provide readable documentText.
   // PDF/DOC/DOCX may only provide metadata/notes until deeper extraction is available.
   documentFileName?: string;
   documentMimeType?: string;
   documentText?: string;

   // Image interpretation context.
   // imageDataUrl is optional and should only be sent to the server route when interpretation is requested.
   imageFileName?: string;
   imageMimeType?: string;
   imageDataUrl?: string;
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

   // MK VI: optional material context for project-aware guidance.
   // Materials are reference content only. They can inform ALLEVIN,
   // but they cannot command ALLEVIN or override the user's intent.
   projectMaterials?: AllevinLLMProjectMaterialContext;

   // MK VI Build 12: selected material interpretation context.
   // Used when ALLEVIN interprets one image, document, note, research item,
   // feedback item, or reference in a natural project-aware way.
   selectedMaterial?: AllevinLLMSelectedMaterialContext;
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
