// ========================================
// ALLEVIN MK VI Internal Recommender
// Purpose:
// Recommend the best internal ALLEVIN destination
// based on project content, current context, and user intent.
//
// MK VI keeps ALLEVIN internal-first:
// Projects hold the work, Canvas shapes the active work,
// Project Materials preserve references, Calendar holds time,
// and Cognition/AIDock provide guidance.
// ========================================

export type IntegrationDestination = "projects" | "materials" | "calendar" | "canvas" | "cognition";

export type IntegrationObjectType = "canvas-draft" | "project-material" | "project-summary" | "calendar-block" | "guidance-note";

export type IntegrationSource = "canvas" | "research" | "task" | "project" | "projects" | "materials" | "calendar" | "cognition" | "aidock" | "system" | "manual";

export type RecommenderMode = "balanced" | "planning" | "research" | "creative" | "deep-focus" | "calm";

export type RecommendationConfidence = "low" | "medium" | "high";

export type RecommendationRisk = "low" | "medium" | "high";

export interface IntegrationRecommendationInput {
   title?: string;

   body?: string;

   source: IntegrationSource;

   workflowMode?: RecommenderMode;

   currentEnvironment?: string;

   focusMode?: string;

   workflowId?: string;

   originBoardItemId?: string;
}

export interface IntegrationRecommendation {
   destination: IntegrationDestination;

   objectType: IntegrationObjectType;

   confidence: RecommendationConfidence;

   risk: RecommendationRisk;

   reason: string;

   suggestedNextStep: string;
}

// ========================================
// Helpers
// ========================================

function normalizeText(value?: string) {
   return value?.toLowerCase().trim() || "";
}

function getCombinedText(input: { title?: string; body?: string; recommendedNextAction?: string; latestMovement?: string }) {
   return `${input.title ?? ""}\n${input.body ?? ""}\n${input.recommendedNextAction ?? ""}\n${input.latestMovement ?? ""}`.toLowerCase();
}

function includesAny(text: string, terms: string[]) {
   return terms.some((term) => text.includes(term));
}

function countMatches(text: string, terms: string[]) {
   return terms.reduce((count, term) => {
      return text.includes(term) ? count + 1 : count;
   }, 0);
}

function getWordCount(text: string) {
   return text.trim().split(/\s+/).filter(Boolean).length;
}

function getRiskLevel(input: { title?: string; body?: string; currentEnvironment?: string; focusMode?: string }) {
   const environment = normalizeText(input.currentEnvironment);
   const focusMode = normalizeText(input.focusMode);
   const text = getCombinedText(input);
   const wordCount = getWordCount(text);

   if (environment === "calm" || environment === "recovery") {
      return "low";
   }

   if (focusMode === "deep" || environment === "deep-focus") {
      return wordCount > 250 ? "medium" : "low";
   }

   if (wordCount > 900) {
      return "medium";
   }

   return "low";
}

function makeRecommendation({ destination, objectType, confidence, risk, reason, suggestedNextStep }: IntegrationRecommendation): IntegrationRecommendation {
   return {
      destination,
      objectType,
      confidence,
      risk,
      reason,
      suggestedNextStep,
   };
}

// ========================================
// Signal Detection
// ========================================

function getScheduleScore(text: string) {
   return countMatches(text, ["schedule", "calendar", "meeting", "appointment", "deadline", "due date", "tomorrow", "today", "next week", "this week", "reminder", "block time", "time block", "30 minute", "30 minutes", "1 hour"]);
}

function getActionScore(text: string) {
   return countMatches(text, ["task", "to do", "todo", "action item", "next step", "fix", "complete", "finish", "build", "implement", "implementation", "update", "review", "send", "create", "resolve", "patch", "test"]);
}

function getMaterialScore(text: string) {
   return countMatches(text, ["research", "source:", "evidence:", "citation", "reference", "feedback", "note", "notes", "document", "image", "screenshot", "pdf", "file", "material", "insight:", "confidence:"]);
}

function getCanvasScore(text: string) {
   return countMatches(text, ["draft", "write", "revise", "edit", "outline", "section", "paragraph", "develop", "continue", "shape", "rewrite", "summary", "brief", "proposal", "report"]);
}

function getProjectScore(text: string) {
   return countMatches(text, ["project", "roadmap", "milestone", "progress", "status", "next action", "goal", "plan", "planning", "organize", "structure", "priority"]);
}

function hasStructuredResearchBlock(text: string) {
   const labels = ["question:", "source:", "evidence:", "insight:", "confidence:"];

   return countMatches(text, labels) >= 3;
}

function hasStrongActionSignal(text: string) {
   return includesAny(text, ["fix", "build", "implement", "implementation", "update", "complete", "finish", "patch", "resolve", "test", "next step", "action item"]);
}

function hasStrongMaterialSignal(text: string) {
   return hasStructuredResearchBlock(text) || includesAny(text, ["source:", "evidence:", "reference", "feedback", "screenshot", "image", "pdf", "document", "uploaded", "project material"]);
}

function hasStrongCanvasSignal(text: string) {
   return includesAny(text, ["draft", "write", "revise", "rewrite", "outline", "continue in canvas", "work in canvas", "shape this"]);
}

// ========================================
// Project / Material Recommender
// ========================================

export function recommendIntegrationDestination(input: IntegrationRecommendationInput): IntegrationRecommendation {
   const text = getCombinedText(input);
   const source = input.source;
   const workflowMode = input.workflowMode ?? "balanced";
   const risk = getRiskLevel(input);
   const wordCount = getWordCount(text);

   const scheduleScore = getScheduleScore(text);
   const actionScore = getActionScore(text);
   const materialScore = getMaterialScore(text);
   const canvasScore = getCanvasScore(text);
   const projectScore = getProjectScore(text);

   if (scheduleScore > 0) {
      return makeRecommendation({
         destination: "calendar",
         objectType: "calendar-block",
         confidence: "high",
         risk,
         reason: "This content includes scheduling, deadline, meeting, reminder, or time-block language. Calendar is the best internal reference for time-based work.",
         suggestedNextStep: "Prepare a calendar block only if this project needs protected time or a reminder.",
      });
   }

   if (source === "materials" || source === "research" || hasStrongMaterialSignal(text) || materialScore >= 3) {
      return makeRecommendation({
         destination: "materials",
         objectType: "project-material",
         confidence: source === "materials" || hasStrongMaterialSignal(text) ? "high" : "medium",
         risk: "low",
         reason: "This looks like supporting context, research, feedback, or reference content. Project Materials is the best place to keep it available without cluttering Canvas.",
         suggestedNextStep: "Save it as a project material, then reference it from Canvas when it helps the active work.",
      });
   }

   if (source === "canvas" || hasStrongCanvasSignal(text) || canvasScore >= 3 || wordCount > 140) {
      return makeRecommendation({
         destination: "canvas",
         objectType: "canvas-draft",
         confidence: source === "canvas" || hasStrongCanvasSignal(text) ? "high" : "medium",
         risk,
         reason: "This content is active work that needs shaping, drafting, or refinement. Canvas is the best place to continue developing it.",
         suggestedNextStep: "Continue in Canvas, use selected project materials as references, and save the cleaner version back to the project when ready.",
      });
   }

   if (workflowMode === "planning" || projectScore >= 2 || actionScore >= 2 || hasStrongActionSignal(text)) {
      return makeRecommendation({
         destination: "projects",
         objectType: "project-summary",
         confidence: hasStrongActionSignal(text) || projectScore >= 3 ? "high" : "medium",
         risk,
         reason: "This content is about organizing the project, clarifying next actions, or updating project direction. Projects is the best home base for it.",
         suggestedNextStep: "Save the update under the project, then schedule the next focused block only if it needs time on the calendar.",
      });
   }

   if (workflowMode === "creative") {
      return makeRecommendation({
         destination: "materials",
         objectType: "project-material",
         confidence: "medium",
         risk: "low",
         reason: "Creative work often starts as loose concepts or references. Project Materials keeps the idea available without forcing it into the active Canvas draft too early.",
         suggestedNextStep: "Save the idea as a material, then pull it into Canvas once the direction is clearer.",
      });
   }

   if (workflowMode === "deep-focus") {
      return makeRecommendation({
         destination: "canvas",
         objectType: "canvas-draft",
         confidence: "medium",
         risk,
         reason: "Deep focus works best with one visible surface. Canvas keeps the next move clear and avoids scattering the work.",
         suggestedNextStep: "Keep working in Canvas and make one useful update before adding more structure.",
      });
   }

   return makeRecommendation({
      destination: "projects",
      objectType: "project-summary",
      confidence: "medium",
      risk,
      reason: "This is general project context. Projects is the safest internal home base because it keeps the work connected to Canvas, Materials, and Calendar.",
      suggestedNextStep: "Save it to the project, then decide whether it should become active Canvas work, a material, or a calendar block.",
   });
}

// ========================================
// MK VI Internal Workflow Recommender Layer
// Purpose:
// Recommend the best internal ALLEVIN move:
// Canvas, Projects, Project Materials, Calendar,
// Cognition, or Standby.
//
// Safety:
// This layer does not move work automatically.
// It only returns guidance that AIDock or another
// visible component can present to the user.
// ========================================

export type WorkflowRecommendationDestination = "canvas" | "projects" | "materials" | "calendar" | "cognition" | "standby";

export type WorkflowRecommendationAction = "continue-in-canvas" | "save-to-projects" | "save-material" | "prepare-calendar" | "review-guidance" | "standby";

export interface WorkflowRecommendationInput {
   title?: string;

   body?: string;

   source?: IntegrationSource | "project" | "projects" | "calendar";

   currentStage?: string;

   currentLocation?: string;

   status?: string;

   latestMovement?: string;

   recommendedNextAction?: string;

   currentEnvironment?: string;

   focusMode?: string;

   signalCount?: number;

   confidence?: number;

   hasPendingApproval?: boolean;

   hasActiveThread?: boolean;

   hasScheduledCalendarEvent?: boolean;

   calendarEventTitle?: string;

   calendarEventTime?: string;
}

export interface WorkflowRecommendation {
   destination: WorkflowRecommendationDestination;

   action: WorkflowRecommendationAction;

   confidence: number;

   risk: RecommendationRisk;

   reason: string;

   suggestedNextStep: string;

   approvalRequired: boolean;

   label: string;
}

function compactWorkflowText(value?: string) {
   return (value || "").replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

function clampWorkflowConfidence(value: number) {
   return Math.max(0, Math.min(100, Math.round(value)));
}

function makeWorkflowRecommendation({ destination, action, confidence, risk, reason, suggestedNextStep, approvalRequired, label }: WorkflowRecommendation): WorkflowRecommendation {
   return {
      destination,
      action,
      confidence: clampWorkflowConfidence(confidence),
      risk,
      reason,
      suggestedNextStep,
      approvalRequired,
      label,
   };
}

function getWorkflowText(input: WorkflowRecommendationInput) {
   return getCombinedText(input);
}

function getWorkflowWordCount(text: string) {
   return text.trim().split(/\s+/).filter(Boolean).length;
}

function getWorkflowConfidenceBump(input: WorkflowRecommendationInput) {
   let bump = 0;

   if ((input.signalCount || 0) >= 3) {
      bump += 5;
   }

   if ((input.signalCount || 0) >= 6) {
      bump += 5;
   }

   if ((input.confidence || 0) >= 80) {
      bump += 8;
   }

   return bump;
}

function hasWorkflowScheduleSignal(text: string) {
   return includesAny(text, ["schedule", "calendar", "meeting", "appointment", "deadline", "due date", "tomorrow", "today", "next week", "this week", "reminder", "block time", "time block"]);
}

function hasWorkflowActionSignal(text: string) {
   return includesAny(text, ["fix", "build", "implement", "implementation", "update", "complete", "finish", "patch", "resolve", "action item", "next step", "task", "todo", "to do", "test"]);
}

function hasWorkflowMaterialSignal(text: string) {
   return hasStructuredResearchBlock(text) || includesAny(text, ["research", "source:", "evidence:", "citation", "reference", "feedback", "image", "screenshot", "document", "pdf", "material", "notes from", "project note"]);
}

function hasWorkflowGuidanceSignal(text: string) {
   return includesAny(text, ["confused", "overwhelmed", "where do i start", "what should i do", "help me structure", "organize this", "make sense of", "guidance", "cognition"]);
}

function hasCalendarReviewNoteSignal(input: WorkflowRecommendationInput, text: string) {
   const stage = compactWorkflowText(input.currentStage).toLowerCase();
   const movement = compactWorkflowText(input.latestMovement).toLowerCase();
   const recommendation = compactWorkflowText(input.recommendedNextAction).toLowerCase();

   return stage === "reviewing" || movement.includes("calendar") || text.includes("calendar review note") || text.includes("saved calendar note") || recommendation.includes("calendar note") || recommendation.includes("follow-up");
}

function getCalendarReviewNoteRecommendation(input: WorkflowRecommendationInput, text: string, confidenceBump: number, risk: RecommendationRisk) {
   const recommendation = compactWorkflowText(input.recommendedNextAction).toLowerCase();

   if (recommendation.includes("schedule") || text.includes("time block") || text.includes("calendar")) {
      return makeWorkflowRecommendation({
         destination: "calendar",
         action: "prepare-calendar",
         confidence: 86 + confidenceBump,
         risk,
         reason: "The latest calendar context points to a time-based follow-up. Calendar is the right reference if the work needs protected time.",
         suggestedNextStep: "Prepare a calendar block only if the follow-up needs a specific time window.",
         approvalRequired: true,
         label: "Prepare Calendar",
      });
   }

   if (recommendation.includes("reference") || recommendation.includes("note") || text.includes("saved calendar note")) {
      return makeWorkflowRecommendation({
         destination: "materials",
         action: "save-material",
         confidence: 84 + confidenceBump,
         risk: "low",
         reason: "The calendar note is useful project context. Project Materials can preserve it without cluttering Canvas.",
         suggestedNextStep: "Save the calendar note as a project material, then reference it from Canvas when needed.",
         approvalRequired: true,
         label: "Save as Material",
      });
   }

   return makeWorkflowRecommendation({
      destination: "canvas",
      action: "continue-in-canvas",
      confidence: 84 + confidenceBump,
      risk: "low",
      reason: "The calendar note is now useful context for the active project. Canvas is the safest place to continue shaping the work.",
      suggestedNextStep: "Continue in Canvas using the calendar note as context, then save the update back to the project.",
      approvalRequired: false,
      label: "Continue from Calendar Note",
   });
}

export function recommendWorkflowMove(input: WorkflowRecommendationInput): WorkflowRecommendation {
   const text = getWorkflowText(input);
   const title = compactWorkflowText(input.title);
   const body = compactWorkflowText(input.body);
   const wordCount = getWorkflowWordCount(text);
   const risk = getRiskLevel({
      title: input.title,
      body: input.body,
      currentEnvironment: input.currentEnvironment,
      focusMode: input.focusMode,
   });
   const confidenceBump = getWorkflowConfidenceBump(input);
   const stage = normalizeText(input.currentStage);
   const location = normalizeText(input.currentLocation);
   const source = normalizeText(input.source);

   if (input.hasPendingApproval) {
      return makeWorkflowRecommendation({
         destination: "standby",
         action: "standby",
         confidence: 88,
         risk: "low",
         reason: "A change is already waiting for the user to review. ALLEVIN should not stack another action on top of it.",
         suggestedNextStep: "Review the pending item first, then choose the next move.",
         approvalRequired: false,
         label: "Review Pending Item",
      });
   }

   if (!input.hasActiveThread && !title && !body) {
      return makeWorkflowRecommendation({
         destination: "projects",
         action: "save-to-projects",
         confidence: 72,
         risk: "low",
         reason: "No active project is strong enough yet. Projects is the clearest starting point because it gives the work a home base.",
         suggestedNextStep: "Create or open a project, then use Canvas for the active work.",
         approvalRequired: false,
         label: "Start in Projects",
      });
   }

   if (hasWorkflowGuidanceSignal(text)) {
      return makeWorkflowRecommendation({
         destination: "cognition",
         action: "review-guidance",
         confidence: 80 + confidenceBump,
         risk: "low",
         reason: "The user is asking for structure, clarity, or direction. Guidance is the best first move before changing the workspace.",
         suggestedNextStep: "Give a short structure: what this project is, what matters now, and the next useful move.",
         approvalRequired: false,
         label: "Give Guidance",
      });
   }

   if (hasCalendarReviewNoteSignal(input, text)) {
      return getCalendarReviewNoteRecommendation(input, text, confidenceBump, risk);
   }

   if (hasWorkflowScheduleSignal(text)) {
      if (input.hasScheduledCalendarEvent) {
         return makeWorkflowRecommendation({
            destination: "canvas",
            action: "continue-in-canvas",
            confidence: 84 + confidenceBump,
            risk: "low",
            reason: `A related Calendar event is already scheduled${input.calendarEventTime ? ` for ${input.calendarEventTime}` : ""}. ALLEVIN should avoid creating duplicate schedule blocks.`,
            suggestedNextStep: "Use the scheduled block as a reference, then continue the active work in Canvas.",
            approvalRequired: false,
            label: "Use Scheduled Block",
         });
      }

      return makeWorkflowRecommendation({
         destination: "calendar",
         action: "prepare-calendar",
         confidence: 82 + confidenceBump,
         risk,
         reason: "This work includes scheduling or deadline language. Calendar is the best internal layer if the work needs protected time or a reminder.",
         suggestedNextStep: "Prepare a Calendar block only if this project needs time on the schedule.",
         approvalRequired: true,
         label: "Prepare Calendar",
      });
   }

   if (hasWorkflowMaterialSignal(text) || source === "materials" || source === "research") {
      return makeWorkflowRecommendation({
         destination: "materials",
         action: "save-material",
         confidence: 82 + confidenceBump,
         risk: "low",
         reason: "This looks like reference material, notes, research, feedback, or supporting context. Project Materials keeps it accessible without crowding Canvas.",
         suggestedNextStep: "Save it as a project material and only pull it into Canvas when it directly supports the active work.",
         approvalRequired: true,
         label: "Save Material",
      });
   }

   if (location === "canvas" || stage === "drafting" || source === "canvas") {
      if (hasWorkflowActionSignal(text) && wordCount < 180) {
         return makeWorkflowRecommendation({
            destination: "projects",
            action: "save-to-projects",
            confidence: 80 + confidenceBump,
            risk,
            reason: "The active work contains a clear next action. Projects should hold that action with the rest of the project context.",
            suggestedNextStep: "Save the next action to the project, then schedule it only if it needs protected time.",
            approvalRequired: true,
            label: "Save Next Action",
         });
      }

      return makeWorkflowRecommendation({
         destination: "canvas",
         action: "continue-in-canvas",
         confidence: 72 + confidenceBump,
         risk: "low",
         reason: "The work is still in an active drafting or shaping state. Canvas is the cleanest place to keep developing it.",
         suggestedNextStep: "Continue in Canvas, select any needed references, then save the cleaner update back to the project.",
         approvalRequired: false,
         label: "Continue in Canvas",
      });
   }

   if (location === "project" || location === "projects" || source === "project" || source === "projects") {
      return makeWorkflowRecommendation({
         destination: "canvas",
         action: "continue-in-canvas",
         confidence: 78 + confidenceBump,
         risk: "low",
         reason: "The project already has a home base. Canvas is the best place to shape the next active update.",
         suggestedNextStep: "Open the project in Canvas and work from the latest saved context.",
         approvalRequired: false,
         label: "Open in Canvas",
      });
   }

   if (wordCount > 140) {
      return makeWorkflowRecommendation({
         destination: "canvas",
         action: "continue-in-canvas",
         confidence: 74 + confidenceBump,
         risk,
         reason: "This content has enough substance to benefit from a focused Canvas pass before saving it as a final project update.",
         suggestedNextStep: "Use Canvas to clean up the structure, then save the updated version under the project.",
         approvalRequired: false,
         label: "Shape in Canvas",
      });
   }

   return makeWorkflowRecommendation({
      destination: "projects",
      action: "save-to-projects",
      confidence: 70 + confidenceBump,
      risk: "low",
      reason: "The safest next move is to keep this connected to the project home base until it becomes active Canvas work, a material, or a calendar block.",
      suggestedNextStep: "Save it to the project and keep the next action simple.",
      approvalRequired: false,
      label: "Save to Project",
   });
}
