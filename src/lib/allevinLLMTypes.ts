// ========================================
// ALLEVIN MK VIII LLM Types
// Shared contract for AIDock, client, and server.
// Project Guidance remains authoritative.
// ========================================

export type AllevinLLMMode = "summarize" | "next-step" | "clean-handoff" | "calendar-to-task" | "aidock-guidance" | "general-knowledge" | "tool-guidance" | "material-summary" | "material-interpretation" | "project-guidance";
export type AllevinLLMSource = "working-notes" | "task" | "project" | "projects" | "materials" | "calendar" | "aidock" | "weather" | "tools" | "system" | "canvas";
export type AllevinLLMPriority = "low" | "medium" | "high";
export type AllevinLLMResponseStyle = "direct" | "conversational" | "editorial" | "detailed";
export type AllevinLLMMaterialType = "Note" | "Document" | "Image" | "Research" | "Feedback" | "Reference";
export type AllevinLLMMaterialKind = "note" | "document" | "image" | "research" | "feedback" | "reference" | "text" | "metadata" | "unknown";

export const ALLEVIN_LLM_MODES: AllevinLLMMode[] = ["summarize", "next-step", "clean-handoff", "calendar-to-task", "aidock-guidance", "general-knowledge", "tool-guidance", "material-summary", "material-interpretation", "project-guidance"];
export const ALLEVIN_LLM_SOURCES: AllevinLLMSource[] = ["working-notes", "task", "project", "projects", "materials", "calendar", "aidock", "weather", "tools", "system", "canvas"];
export const ALLEVIN_LLM_PRIORITIES: AllevinLLMPriority[] = ["low", "medium", "high"];
export const ALLEVIN_LLM_RESPONSE_STYLES: AllevinLLMResponseStyle[] = ["direct", "conversational", "editorial", "detailed"];
export const ALLEVIN_LLM_MATERIAL_TYPES: AllevinLLMMaterialType[] = ["Note", "Document", "Image", "Research", "Feedback", "Reference"];
export const ALLEVIN_LLM_MATERIAL_KINDS: AllevinLLMMaterialKind[] = ["note", "document", "image", "research", "feedback", "reference", "text", "metadata", "unknown"];

export function isAllevinLLMMode(value?: string): value is AllevinLLMMode {
   return ALLEVIN_LLM_MODES.includes(value as AllevinLLMMode);
}
export function isAllevinLLMSource(value?: string): value is AllevinLLMSource {
   return ALLEVIN_LLM_SOURCES.includes(value as AllevinLLMSource);
}
export function isAllevinLLMPriority(value?: string): value is AllevinLLMPriority {
   return ALLEVIN_LLM_PRIORITIES.includes(value as AllevinLLMPriority);
}
export function isAllevinLLMResponseStyle(value?: string): value is AllevinLLMResponseStyle {
   return ALLEVIN_LLM_RESPONSE_STYLES.includes(value as AllevinLLMResponseStyle);
}
export function isAllevinLLMMaterialType(value?: string): value is AllevinLLMMaterialType {
   return ALLEVIN_LLM_MATERIAL_TYPES.includes(value as AllevinLLMMaterialType);
}
export function isAllevinLLMMaterialKind(value?: string): value is AllevinLLMMaterialKind {
   return ALLEVIN_LLM_MATERIAL_KINDS.includes(value as AllevinLLMMaterialKind);
}

export interface AllevinProjectEvidenceContext {
   sourceType?: string;
   sourceId?: string;
   quote?: string;
}
export interface AllevinProjectDecisionContext {
   statement?: string;
   status?: "confirmed" | "unresolved" | "assumed";
   evidence?: AllevinProjectEvidenceContext[];
   affects?: string[];
}
export interface AllevinProjectOptionContext {
   name?: string;
   advantages?: string[];
   disadvantages?: string[];
   dependencies?: string[];
   risks?: string[];
   fitWithGoal?: string;
   evidence?: AllevinProjectEvidenceContext[];
}
export interface AllevinProjectTensionContext {
   sideA?: string;
   sideB?: string;
   consequence?: string;
   decisionNeeded?: string;
   evidence?: AllevinProjectEvidenceContext[];
}
export interface AllevinActiveMilestoneContext {
   id?: string;
   title?: string;
   goal?: string;
   whyItMatters?: string;
   startingPrompt?: string;
   workingContent?: string;
   decisions?: string[];
   openQuestions?: string[];
   completionEvidence?: string[];
   status?: string;
}

export interface AllevinLLMProjectUnderstandingContext {
   goal?: string;
   successState?: string;
   situation?: string;
   momentum?: string;
   currentFocus?: string;
   recommendedMove?: string;
   whyNow?: string;
   whatItUnlocks?: string;
   afterThis?: string;
   watchOuts?: string[];
   openWork?: string[];
   completedWork?: string[];
   decisions?: string[];
   confirmedDecisions?: AllevinProjectDecisionContext[];
   unresolvedDecisions?: AllevinProjectDecisionContext[];
   assumptions?: AllevinProjectDecisionContext[];
   options?: AllevinProjectOptionContext[];
   tensions?: AllevinProjectTensionContext[];
   constraints?: string[];
   successCriteria?: string[];
   unresolvedQuestions?: string[];
   risks?: string[];
   dependencies?: string[];
   evidence?: AllevinProjectEvidenceContext[];
   activeMilestone?: AllevinActiveMilestoneContext;
}

export interface AllevinLLMProjectMaterialContext {
   count?: number;
   selectedTitles?: string[];
   titles?: string[];
   summaries?: string[];
   usefulSignals?: string[];
   selectedMaterialInsights?: string[];
   selectedMaterialNextSteps?: string[];
}
export interface AllevinLLMSelectedMaterialContext {
   materialTitle?: string;
   materialType?: AllevinLLMMaterialType | string;
   materialKind?: AllevinLLMMaterialKind | string;
   materialSource?: string;
   materialNotes?: string;
   materialSummary?: string;
   documentFileName?: string;
   documentMimeType?: string;
   documentText?: string;
   imageFileName?: string;
   imageMimeType?: string;
   imageDataUrl?: string;
}
export interface AllevinLLMConversationContext {
   lastUserPrompt?: string;
   lastAssistantResponse?: string;
   lastRecommendation?: string;
   currentTopic?: string;
   requestedTransformation?: string;
}

export interface AllevinContextPacket {
   version?: string;
   userIntent?: { rawPrompt?: string; normalizedPrompt?: string; intentType?: string };
   currentProject?: {
      title?: string;
      type?: string;
      location?: string;
      status?: string;
      priority?: string;
      body?: string;
      currentState?: string;
      goal?: string;
      needsToAdd?: string;
      immediateNextStep?: string;
      buildOrder?: string[];
      completionCriteria?: string[];
      constraints?: string[];
      implementationPreferences?: string[];
      canvasContent?: string;
      canvasUpdatedAt?: number;
      projectUpdatedAt?: number;
      latestProjectNote?: string;
      recommendedNextAction?: string;
   };
   projects?: { count?: number; titles?: string[]; latestTitle?: string };
   projectMaterials?: {
      count?: number;
      selectedTitles?: string[];
      titles?: string[];
      summaries?: string[];
      usefulSignals?: string[];
      selectedMaterialInsights?: string[];
      selectedMaterialNextSteps?: string[];
      recentMaterialInsights?: string[];
      recentMaterialNextSteps?: string[];
   };
   calendar?: { hasUpcomingEvents?: boolean; nextEventSummary?: string; todaySummary?: string };
   cognition?: { state?: string; label?: string; mood?: string; momentum?: string; suggestion?: string; adapts?: string };
   projectUnderstanding?: AllevinLLMProjectUnderstandingContext;
   conversation?: AllevinLLMConversationContext;
   responseRules?: { tone?: string; format?: string; avoid?: string[]; depth?: string; groundedResponse?: string };
   [key: string]: unknown;
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
   responseStyle?: AllevinLLMResponseStyle;
   groundedResponse?: string;
   conversation?: AllevinLLMConversationContext;
   projectUnderstanding?: AllevinLLMProjectUnderstandingContext;
   projectMaterials?: AllevinLLMProjectMaterialContext;
   selectedMaterial?: AllevinLLMSelectedMaterialContext;
   contextPacket?: AllevinContextPacket;
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
