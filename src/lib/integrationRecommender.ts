// ========================================
// ALLEVIN Integration Recommender
// Purpose:
// Recommend the best external destination
// and export object type based on ALLEVIN
// workflow content, source, and mode.
// ========================================

export type IntegrationDestination = "google-docs" | "notes" | "calendar" | "tasks" | "drive";

export type IntegrationObjectType = "canvas-draft" | "research-note" | "project-summary" | "task-action" | "workflow-review";

export type IntegrationSource = "canvas" | "research" | "task" | "board" | "intel" | "system" | "manual";

export type RecommenderMode = "balanced" | "planning" | "research" | "creative" | "deep-focus" | "recovery";

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

function getCombinedText(input: IntegrationRecommendationInput) {
   return `${input.title ?? ""}\n${input.body ?? ""}`.toLowerCase();
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

function getRiskLevel(input: IntegrationRecommendationInput) {
   const environment = normalizeText(input.currentEnvironment);
   const focusMode = normalizeText(input.focusMode);
   const text = getCombinedText(input);
   const wordCount = getWordCount(text);

   if (environment === "recovery") {
      return "low";
   }

   if (focusMode === "deep" || environment === "deep-focus") {
      return wordCount > 250 ? "medium" : "low";
   }

   if (wordCount > 600) {
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

function getTaskScore(text: string) {
   return countMatches(text, ["task", "to do", "todo", "action item", "next step", "fix", "complete", "finish", "build", "implement", "implementation", "update", "review bug", "send", "create", "resolve", "patch", "test"]);
}

function getResearchScore(text: string) {
   return countMatches(text, ["research", "source:", "evidence:", "citation", "question:", "finding", "insight:", "study", "analyze", "compare", "investigate", "confidence:"]);
}

function getDocumentScore(text: string) {
   return countMatches(text, ["draft", "document", "report", "essay", "paper", "proposal", "summary", "brief", "outline", "write", "section", "introduction", "conclusion", "recommendation", "findings"]);
}

function getProjectScore(text: string) {
   return countMatches(text, ["project", "roadmap", "milestone", "progress", "status", "board", "backlog", "in progress", "completed", "workflow"]);
}

function getReviewScore(text: string) {
   return countMatches(text, ["workflow review", "review event", "recent movement", "what allevin noticed", "active workflow", "main flow", "load signal"]);
}

function hasStructuredResearchBlock(text: string) {
   const labels = ["question:", "source:", "evidence:", "insight:", "confidence:"];

   return countMatches(text, labels) >= 3;
}

function hasStrongTaskAction(text: string) {
   return includesAny(text, ["fix", "build", "implement", "implementation", "update", "complete", "finish", "patch", "resolve"]);
}

function hasStrongDocumentSignal(text: string) {
   return includesAny(text, ["draft", "report", "document", "paper", "proposal"]) && includesAny(text, ["summary", "recommendation", "findings", "conclusion", "section"]);
}

// ========================================
// Main Recommender
// ========================================

export function recommendIntegrationDestination(input: IntegrationRecommendationInput): IntegrationRecommendation {
   const text = getCombinedText(input);

   const source = input.source;

   const workflowMode = input.workflowMode ?? "balanced";

   const risk = getRiskLevel(input);

   const wordCount = getWordCount(text);

   const scheduleScore = getScheduleScore(text);

   const taskScore = getTaskScore(text);

   const researchScore = getResearchScore(text);

   const documentScore = getDocumentScore(text);

   const projectScore = getProjectScore(text);

   const reviewScore = getReviewScore(text);

   // ========================================
   // Explicit Canvas Export Intent
   // ========================================
   // When the user clicks Prepare Export from Canvas, ALLEVIN should not reroute
   // the export preview into Tasks just because the document mentions tasks,
   // actions, or Board movement. Export intent should preserve the document path.
   if (source === "canvas" && hasExplicitDocumentExportIntent(text)) {
      return makeRecommendation({
         destination: "google-docs",

         objectType: "project-summary",

         confidence: "high",

         risk,

         reason: "This Canvas work is being prepared as an export preview. Google Docs is the correct destination even if the content mentions tasks, actions, or Board movement.",

         suggestedNextStep: "Prepare a Google Docs preview, polish the sections, then confirm only when the document is ready.",
      });
   }

   // ========================================
   // Recovery Mode
   // ========================================

   if (input.currentEnvironment === "recovery" || workflowMode === "recovery") {
      if (scheduleScore > 0) {
         return makeRecommendation({
            destination: "calendar",

            objectType: "task-action",

            confidence: "medium",

            risk,

            reason: "Recovery mode is active and this content includes a scheduling signal. A small calendar block may reduce mental load.",

            suggestedNextStep: "Prepare a lightweight calendar preview, then confirm only if this truly needs time on the calendar.",
         });
      }

      return makeRecommendation({
         destination: "notes",

         objectType: hasStructuredResearchBlock(text) ? "research-note" : "canvas-draft",

         confidence: "medium",

         risk,

         reason: "Recovery mode is active. Notes are the lowest-pressure destination for saving context without creating more work.",

         suggestedNextStep: "Save this as a note or wait until you are ready to turn it into a task.",
      });
   }

   // ========================================
   // Strong Schedule Signal
   // ========================================

   if (scheduleScore > 0) {
      return makeRecommendation({
         destination: "calendar",

         objectType: "task-action",

         confidence: "high",

         risk,

         reason: "This content includes time, deadline, meeting, or scheduling language, so Calendar is the strongest destination.",

         suggestedNextStep: "Prepare a calendar preview and confirm the timing before creating a live event later.",
      });
   }

   // ========================================
   // Strong Task Signal
   // Task action should beat broad research language.
   // ========================================

   if (source === "task" || (source !== "canvas" && (hasStrongTaskAction(text) || taskScore >= 3))) {
      return makeRecommendation({
         destination: "tasks",

         objectType: "task-action",

         confidence: hasStrongTaskAction(text) ? "high" : "medium",

         risk,

         reason: "This content contains action-oriented language such as fix, build, update, complete, or implement, so an external task preview is the best match.",

         suggestedNextStep: "Prepare a task preview and confirm if this should become an external action item later.",
      });
   }

   // ========================================
   // Strong Document / Draft Signal
   // Long-form draft/report language should beat broad research language.
   // ========================================

   if (source === "canvas" && (hasStrongDocumentSignal(text) || documentScore >= 3 || wordCount > 120)) {
      return makeRecommendation({
         destination: "google-docs",

         objectType: documentScore >= 3 || hasStrongDocumentSignal(text) ? "canvas-draft" : "project-summary",

         confidence: hasStrongDocumentSignal(text) ? "high" : "medium",

         risk,

         reason: "This Canvas content looks like a draft, report, outline, or longer-form document. Google Docs is the best destination.",

         suggestedNextStep: "Prepare a Google Docs preview and review the formatted export before confirming.",
      });
   }

   // ========================================
   // Structured Research Content
   // Only strong research structure should become Notes.
   // ========================================

   if (source === "research" || hasStructuredResearchBlock(text) || (workflowMode === "research" && researchScore >= 2 && documentScore < 2)) {
      return makeRecommendation({
         destination: "notes",

         objectType: "research-note",

         confidence: source === "research" || hasStructuredResearchBlock(text) ? "high" : "medium",

         risk,

         reason: "This content has a structured research pattern with question, source, evidence, insight, or confidence fields. Notes are best for preserving it for future recall.",

         suggestedNextStep: "Prepare a note preview, then later connect this to Docs if it becomes part of a formal report.",
      });
   }

   // ========================================
   // Workflow Review / Intel Content
   // ========================================

   if (source === "intel" || reviewScore >= 2) {
      return makeRecommendation({
         destination: "notes",

         objectType: "workflow-review",

         confidence: "high",

         risk,

         reason: "This content is a workflow review or system insight. Notes are best for preserving the reflection without turning it into a document yet.",

         suggestedNextStep: "Save the review as a note, or convert it into a task if it requires action.",
      });
   }

   // ========================================
   // Board / Project Summary Content
   // ========================================

   if (source === "board" || projectScore >= 3) {
      return makeRecommendation({
         destination: wordCount > 180 ? "google-docs" : "drive",

         objectType: "project-summary",

         confidence: "medium",

         risk,

         reason: "This content appears connected to project progress. A project summary or stored project artifact is the best fit.",

         suggestedNextStep: "Prepare a project summary preview and confirm whether it should become a document or stored project file.",
      });
   }

   // ========================================
   // Creative Mode
   // ========================================

   if (workflowMode === "creative") {
      return makeRecommendation({
         destination: "notes",

         objectType: "canvas-draft",

         confidence: "medium",

         risk,

         reason: "Creative mode is active. Notes are useful for preserving concepts before they become formal documents or tasks.",

         suggestedNextStep: "Save this as a note first, then develop the strongest idea into a Canvas draft later.",
      });
   }

   // ========================================
   // Planning Mode
   // ========================================

   if (workflowMode === "planning") {
      return makeRecommendation({
         destination: "google-docs",

         objectType: "project-summary",

         confidence: "medium",

         risk,

         reason: "Planning mode is active. A structured project summary is the best export format for this work.",

         suggestedNextStep: "Prepare a project summary preview and confirm if it should become a planning document.",
      });
   }

   // ========================================
   // Light Task Signal
   // ========================================

   if (taskScore >= 2 && source !== "canvas") {
      return makeRecommendation({
         destination: "tasks",

         objectType: "task-action",

         confidence: "medium",

         risk,

         reason: "This content includes several action signals, so an external task preview is a good fit.",

         suggestedNextStep: "Prepare a task preview and confirm if this should become an external action item later.",
      });
   }

   // ========================================
   // Light Document Signal
   // ========================================

   if (documentScore >= 2) {
      return makeRecommendation({
         destination: "google-docs",

         objectType: "canvas-draft",

         confidence: "medium",

         risk,

         reason: "This content has document-like structure, so Google Docs is a strong destination.",

         suggestedNextStep: "Prepare a Google Docs preview and decide whether this should become a formal document.",
      });
   }

   // ========================================
   // Canvas Integration Fallback
   // ========================================
   // If Canvas content reached this point, keep it on the document/export path.
   // The user entered the Integrations recommender from Canvas, so task language
   // inside the document should not override the export destination.
   if (source === "canvas") {
      return makeRecommendation({
         destination: "google-docs",

         objectType: wordCount > 80 || projectScore >= 2 ? "project-summary" : "canvas-draft",

         confidence: "medium",

         risk,

         reason: "This Canvas content is being prepared for an integration/export preview. Google Docs is the safest destination for preserving it as a structured document.",

         suggestedNextStep: "Prepare a Google Docs preview and review the formatted export before confirming.",
      });
   }

   // ========================================
   // Default
   // ========================================

   return makeRecommendation({
      destination: "google-docs",

      objectType: "canvas-draft",

      confidence: "medium",

      risk,

      reason: "This content is general Canvas work. Google Docs is the safest default for preserving a structured draft.",

      suggestedNextStep: "Prepare a Google Docs preview and decide whether this should become a formal document.",
   });
}

// ========================================
// ALLEVIN MK II Build 4.1
// Internal Workflow Recommender Layer
// Purpose:
// Recommend the best internal ALLEVIN move:
// Canvas, Task Vault, Board, Notes, Calendar,
// Integrations, Recovery, or Standby.
//
// Safety:
// This layer does not move work automatically.
// It only returns a recommendation that AIDock,
// Workflow Control, or another component can present
// to the user for approval.
// ========================================

export type WorkflowRecommendationDestination = "canvas" | "tasks" | "board" | "notes" | "calendar" | "integrations" | "recovery" | "standby";

export type WorkflowRecommendationAction = "continue-in-canvas" | "create-task" | "move-to-board" | "save-note" | "prepare-calendar" | "prepare-export" | "recover-thread" | "standby";

export interface WorkflowRecommendationInput {
   title?: string;

   body?: string;

   source?: IntegrationSource | "recovery" | "calendar" | "integrations";

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
   return `${input.title || ""}\n${input.body || ""}\n${input.recommendedNextAction || ""}\n${input.latestMovement || ""}`.toLowerCase();
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

function hasCalendarReviewNoteSignal(input: WorkflowRecommendationInput, text: string) {
   const stage = compactWorkflowText(input.currentStage).toLowerCase();

   const movement = compactWorkflowText(input.latestMovement).toLowerCase();

   const recommendation = compactWorkflowText(input.recommendedNextAction).toLowerCase();

   return (
      stage === "reviewing" ||
      movement.includes("calendar → notes") ||
      movement.includes("calendar -> notes") ||
      movement.includes("recovery memory") ||
      text.includes("calendar review note") ||
      text.includes("saved calendar note") ||
      recommendation.includes("calendar note") ||
      recommendation.includes("follow-up task")
   );
}

function getCalendarReviewNoteRecommendation(input: WorkflowRecommendationInput, text: string, confidenceBump: number, risk: RecommendationRisk) {
   const recommendation = compactWorkflowText(input.recommendedNextAction).toLowerCase();

   if (recommendation.includes("task") || text.includes("follow-up task") || text.includes("create a follow-up task") || text.includes("next action")) {
      return makeWorkflowRecommendation({
         destination: "tasks",

         action: "create-task",

         confidence: 88 + confidenceBump,

         risk,

         reason: "A saved Calendar review note identified a follow-up action. Task Vault is the best next layer because the scheduled review produced actionable work.",

         suggestedNextStep: "Prepare a follow-up Task from the Calendar review note, then move it to the Board when it is ready to track.",

         approvalRequired: true,

         label: "Create Follow-Up Task",
      });
   }

   if (recommendation.includes("board") || text.includes("move the work to the board") || text.includes("move it to the board") || text.includes("track")) {
      return makeWorkflowRecommendation({
         destination: "board",

         action: "move-to-board",

         confidence: 86 + confidenceBump,

         risk,

         reason: "A saved Calendar review note indicates the work is ready for tracking. The Board is the best next layer for status and project movement.",

         suggestedNextStep: "Prepare a Board movement through Workflow Control if the follow-up is ready to track.",

         approvalRequired: true,

         label: "Move to Board",
      });
   }

   return makeWorkflowRecommendation({
      destination: "canvas",

      action: "continue-in-canvas",

      confidence: 84 + confidenceBump,

      risk: "low",

      reason: "A saved Calendar review note is now the latest project context. Canvas is the safest place to continue refining the work before creating a new action.",

      suggestedNextStep: "Continue in Canvas using the Calendar review note as the latest context, then create a follow-up Task when the next action is clear.",

      approvalRequired: true,

      label: "Continue from Calendar Note",
   });
}

function hasWorkflowScheduleSignal(text: string) {
   return includesAny(text, ["schedule", "calendar", "meeting", "appointment", "deadline", "due date", "tomorrow", "today", "next week", "this week", "reminder", "block time", "time block"]);
}

function hasWorkflowTaskSignal(text: string) {
   return includesAny(text, ["fix", "build", "implement", "implementation", "update", "complete", "finish", "patch", "resolve", "action item", "next step", "task", "todo", "to do"]);
}

function hasWorkflowBoardSignal(text: string) {
   return includesAny(text, ["status", "lane", "backlog", "in progress", "review", "tracking", "track", "roadmap", "milestone", "progress", "board"]);
}

function hasWorkflowExportSignal(text: string) {
   return includesAny(text, ["final", "polish", "export", "google doc", "google docs", "document-ready", "ready to share", "report", "summary", "brief", "proposal", "findings"]);
}

function hasExplicitDocumentExportIntent(text: string) {
   return includesAny(text, [
      "prepare export",
      "export preview",
      "google doc",
      "google docs",
      "document-ready",
      "ready to export",
      "final result",
      "export the final result",
      "polished document",
      "project summary",
      "current context",
      "key progress",
      "export notes",
   ]);
}

function hasWorkflowResearchSignal(text: string) {
   return countMatches(text, ["research", "source:", "evidence:", "citation", "question:", "finding", "insight:", "study", "analyze", "compare", "investigate", "confidence:"]) >= 2;
}

function hasWorkflowRecoverySignal(input: WorkflowRecommendationInput, text: string) {
   const environment = normalizeText(input.currentEnvironment);
   const location = normalizeText(input.currentLocation);
   const stage = normalizeText(input.currentStage);
   const source = normalizeText(input.source);

   if (environment === "recovery" || location === "recovery" || source === "recovery" || stage === "paused") {
      return true;
   }

   // Keep recovery intent strict.
   // Phrases like "preserve Recovery memory" should not override a normal
   // Canvas → Task or Task → Board recommendation.
   const explicitRecoveryPhrases = [
      "open recovery",
      "review in recovery",
      "thread recovery",
      "recover thread",
      "recover this thread",
      "recover this project",
      "resume from recovery",
      "resume recovered",
      "where i left off",
      "where did i leave off",
      "continue later",
      "pick up later",
   ];

   return includesAny(text, explicitRecoveryPhrases);
}

export function recommendWorkflowMove(input: WorkflowRecommendationInput): WorkflowRecommendation {
   const text = getWorkflowText(input);

   const title = compactWorkflowText(input.title);

   const body = compactWorkflowText(input.body);

   const wordCount = getWorkflowWordCount(text);

   const risk = getRiskLevel({
      title: input.title,
      body: input.body,
      source: "system",
      currentEnvironment: input.currentEnvironment,
      focusMode: input.focusMode,
   });

   const confidenceBump = getWorkflowConfidenceBump(input);

   const stage = normalizeText(input.currentStage);

   const location = normalizeText(input.currentLocation);

   const status = normalizeText(input.status);

   if (input.hasPendingApproval) {
      return makeWorkflowRecommendation({
         destination: "standby",

         action: "standby",

         confidence: 88,

         risk: "low",

         reason: "A workflow action is already waiting for approval. ALLEVIN should not recommend another movement until the user approves, cancels, or edits the pending action.",

         suggestedNextStep: "Review the pending Workflow Control card before preparing a new movement.",

         approvalRequired: false,

         label: "Review Pending Approval",
      });
   }

   if (!input.hasActiveThread && !title && !body) {
      return makeWorkflowRecommendation({
         destination: "canvas",

         action: "continue-in-canvas",

         confidence: 72,

         risk: "low",

         reason: "No active project thread is strong enough yet. Canvas is the safest place to start because it creates source content for ALLEVIN to track.",

         suggestedNextStep: "Start in Canvas with a short project title and one paragraph of context.",

         approvalRequired: false,

         label: "Start in Canvas",
      });
   }

   if (hasWorkflowRecoverySignal(input, text)) {
      return makeWorkflowRecommendation({
         destination: "recovery",

         action: "recover-thread",

         confidence: 78 + confidenceBump,

         risk: "low",

         reason: "The current state suggests the user is trying to resume or recover work. Recovery is the safest place to inspect the thread before moving it.",

         suggestedNextStep: "Open Recovery, review the latest thread, then prepare Resume, Task, or Export through Workflow Control.",

         approvalRequired: false,

         label: "Review in Recovery",
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

            reason: `A related Calendar event is already scheduled${input.calendarEventTime ? ` for ${input.calendarEventTime}` : ""}. ALLEVIN should not prepare another Calendar action unless the user asks for a new time block.`,

            suggestedNextStep: "Use the scheduled Calendar block to review the work, capture notes, or create a follow-up task after the event.",

            approvalRequired: false,

            label: "Continue with Scheduled Work",
         });
      }

      return makeWorkflowRecommendation({
         destination: "calendar",

         action: "prepare-calendar",

         confidence: 82 + confidenceBump,

         risk,

         reason: "This work includes scheduling or deadline language. Calendar is the best next layer if the work needs time, a reminder, or a meeting follow-up.",

         suggestedNextStep: "Prepare a Calendar action for approval if this needs time on the schedule.",

         approvalRequired: true,

         label: "Prepare Calendar",
      });
   }

   if (location === "canvas" || stage === "drafting") {
      if (hasWorkflowExportSignal(text) && wordCount > 55) {
         return makeWorkflowRecommendation({
            destination: "integrations",

            action: "prepare-export",

            confidence: 78 + confidenceBump,

            risk,

            reason: "The Canvas content looks structured enough for a polished document. Integrations can prepare the export while Workflow Control protects the final action.",

            suggestedNextStep: "Prepare an export preview, polish it, then confirm only when the document is ready.",

            approvalRequired: true,

            label: "Prepare Export",
         });
      }

      if (hasWorkflowTaskSignal(text)) {
         return makeWorkflowRecommendation({
            destination: "tasks",

            action: "create-task",

            confidence: 80 + confidenceBump,

            risk,

            reason: "The current work contains clear action language. Task Vault is the best next move because the idea can become a concrete next action.",

            suggestedNextStep: "Prepare a Task Vault action for approval.",

            approvalRequired: true,

            label: "Create Task",
         });
      }

      if (hasWorkflowBoardSignal(text)) {
         return makeWorkflowRecommendation({
            destination: "board",

            action: "move-to-board",

            confidence: 76 + confidenceBump,

            risk,

            reason: "The work has project tracking language. The Board is the best next layer if the item needs lane/status tracking.",

            suggestedNextStep: "Prepare a Board movement for approval.",

            approvalRequired: true,

            label: "Move to Board",
         });
      }

      return makeWorkflowRecommendation({
         destination: "canvas",

         action: "continue-in-canvas",

         confidence: 70 + confidenceBump,

         risk: "low",

         reason: "The work is still in a development shape. Canvas is the safest place to refine the idea before turning it into a task, board item, or export.",

         suggestedNextStep: "Continue in Canvas until the next concrete action or export shape becomes clear.",

         approvalRequired: false,

         label: "Continue in Canvas",
      });
   }

   if (location === "task" || stage === "tasking") {
      return makeWorkflowRecommendation({
         destination: "board",

         action: "move-to-board",

         confidence: 82 + confidenceBump,

         risk,

         reason: "The work is already action-oriented. The Board is the right next layer when the task needs tracking, status, or project movement.",

         suggestedNextStep: "Prepare a Board movement for approval.",

         approvalRequired: true,

         label: "Move to Board",
      });
   }

   if (location === "board" || stage === "tracking") {
      if (hasWorkflowExportSignal(text) || wordCount > 90) {
         return makeWorkflowRecommendation({
            destination: "integrations",

            action: "prepare-export",

            confidence: 80 + confidenceBump,

            risk,

            reason: "The Board item has enough project substance to become a clean external summary. Integrations is the best next layer for export prep.",

            suggestedNextStep: "Prepare an export preview for approval, then polish before creating the final document.",

            approvalRequired: true,

            label: "Prepare Export",
         });
      }

      return makeWorkflowRecommendation({
         destination: "canvas",

         action: "continue-in-canvas",

         confidence: 76 + confidenceBump,

         risk: "low",

         reason: "The project is being tracked, but it may need more detail before export. Canvas is the best place to continue development.",

         suggestedNextStep: "Resume the Board item in Canvas and refine the latest project content.",

         approvalRequired: true,

         label: "Resume in Canvas",
      });
   }

   if (hasWorkflowResearchSignal(text)) {
      return makeWorkflowRecommendation({
         destination: "notes",

         action: "save-note",

         confidence: 78 + confidenceBump,

         risk: "low",

         reason: "The content looks like research or preserved context. Notes are the safest layer for memory before it becomes a task or formal document.",

         suggestedNextStep: "Prepare a Notes action for approval if this should be preserved.",

         approvalRequired: true,

         label: "Save Note",
      });
   }

   if (wordCount > 120 || hasWorkflowExportSignal(text)) {
      return makeWorkflowRecommendation({
         destination: "integrations",

         action: "prepare-export",

         confidence: 74 + confidenceBump,

         risk,

         reason: "The work has enough length or document structure to become an export preview.",

         suggestedNextStep: "Prepare an export preview, then polish it before finalizing.",

         approvalRequired: true,

         label: "Prepare Export",
      });
   }

   return makeWorkflowRecommendation({
      destination: "canvas",

      action: "continue-in-canvas",

      confidence: 68 + confidenceBump,

      risk: "low",

      reason: "The safest next move is to keep developing the current work in Canvas until the next action, board movement, or export path is clearer.",

      suggestedNextStep: "Continue in Canvas and clarify the next useful action.",

      approvalRequired: false,

      label: "Continue in Canvas",
   });
}
