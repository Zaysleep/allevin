// ========================================
// ALLEVIN MK V Project Memory Foundation
// Build 2: Smarter Context Generator
// Purpose: shared utility for clean project identity,
// persistence, dedupe, merge behavior, and smarter
// Focus / Useful Context / Next Step handoffs
// across ALLEVIN modules.
// ========================================

import type { AllevinDestination, AllevinPriority, AllevinProject, AllevinProjectEvent, AllevinProjectStage, AllevinProjectStatus, AllevinSource } from "@/lib/allevinTypes";

export const ALLEVIN_PROJECT_MEMORY_STORAGE_KEY = "allevin-mkii-project-memory";

// ========================================
// MK V Build 6 — Project Memory Sanitization
// Memory is shared across modules, so this layer treats every stored field as untrusted.
// ========================================

const PROJECT_MEMORY_SANITIZE_LIMITS = {
   title: 120,
   body: 100000,
   summary: 1500,
   nextAction: 1000,
   movement: 300,
   id: 180,
} as const;

function limitProjectMemoryTextLength(value: string, maxLength: number) {
   if (value.length <= maxLength) {
      return value;
   }

   return value.slice(0, maxLength).trim();
}

function stripUnsafeProjectMemoryMarkup(value?: string) {
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

function sanitizeProjectMemoryText(value?: string, maxLength: number = PROJECT_MEMORY_SANITIZE_LIMITS.body) {
   return limitProjectMemoryTextLength(
      stripUnsafeProjectMemoryMarkup(value)
         .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
         .replace(/\u2028|\u2029/g, "\n")
         .replace(/\r/g, "\n")
         .trim(),
      maxLength,
   );
}

function sanitizeProjectMemoryTitle(value?: string) {
   return sanitizeProjectMemoryText(value, PROJECT_MEMORY_SANITIZE_LIMITS.title).replace(/\n+/g, " ").trim();
}

function sanitizeProjectMemoryBody(value?: string) {
   return sanitizeProjectMemoryText(value, PROJECT_MEMORY_SANITIZE_LIMITS.body);
}

function sanitizeProjectMemorySummary(value?: string) {
   return sanitizeProjectMemoryText(value, PROJECT_MEMORY_SANITIZE_LIMITS.summary);
}

function sanitizeProjectMemoryNextAction(value?: string) {
   return sanitizeProjectMemoryText(value, PROJECT_MEMORY_SANITIZE_LIMITS.nextAction);
}

function sanitizeProjectMemoryMovement(value?: string) {
   return sanitizeProjectMemoryText(value, PROJECT_MEMORY_SANITIZE_LIMITS.movement).replace(/\n+/g, " ").trim();
}

function sanitizeProjectMemoryId(value?: string) {
   return sanitizeProjectMemoryText(value, PROJECT_MEMORY_SANITIZE_LIMITS.id)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .trim();
}

function isValidProjectMemoryTimestamp(value?: number) {
   return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export interface ProjectMemoryInput {
   title?: string;
   body?: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   workflowId?: string;
   originBoardItemId?: string;
   source?: AllevinSource;
   destination?: AllevinDestination;
   stage?: AllevinProjectStage;
   status?: AllevinProjectStatus;
   priority?: AllevinPriority;
   recommendedNextAction?: string;
   latestMovement?: string;
}

export interface ProjectContextSections {
   focus: string;
   usefulContext: string;
   nextStep: string;
}

interface ProjectSignalProfile {
   projectType: "project" | "draft" | "task" | "research" | "calendar" | "export" | "planning" | "general";
   intent: string;
   confidence: number;
   hasLatestEdit: boolean;
   hasBoardContext: boolean;
   hasTaskContext: boolean;
   hasCalendarContext: boolean;
   hasExportContext: boolean;
   needsReview: boolean;
   needsAction: boolean;
   needsExport: boolean;
}

export function compactText(value?: string) {
   return sanitizeProjectMemoryText(value).replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

export function cleanText(value?: string) {
   return sanitizeProjectMemoryBody(value).replace(/\r/g, "").trim();
}

export function escapeRegex(value: string) {
   return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripRepeatedProjectPrefixes(value?: string) {
   let cleanValue = compactText(value);
   if (!cleanValue) return "";

   const prefixes = [
      "continue active thread",
      "continue active workflow",
      "continue active project",
      "continue most active workflow",
      "continue most active",
      "active allevin thread",
      "active thread",
      "active workflow",
      "thread memory continuation",
      "thread",
      "resume in canvas",
      "resume project",
      "resume",
      "create a task from",
      "make a task from",
      "task generated from canvas",
      "task created",
      "task routed to board",
      "task sent to board",
      "task from",
      "task",
      "project",
      "canvas updated",
      "canvas title",
      "canvas",
      "source title",
      "title",
      "follow up",
      "follow-up",
      "follow-up task",
      "workflow review",
      "workflow signal",
      "content sent to canvas",
      "active thread prepared for canvas",
   ];

   let changed = true;
   while (changed) {
      changed = false;
      for (const prefix of prefixes) {
         const pattern = new RegExp(`^${escapeRegex(prefix)}\\s*:?\\s*`, "i");
         const nextValue = cleanValue.replace(pattern, "").trim();
         if (nextValue !== cleanValue) {
            cleanValue = nextValue;
            changed = true;
         }
      }
   }

   return cleanValue.replace(/\s+/g, " ").trim();
}

export function cleanProjectTitle(value?: string) {
   const cleaned = stripRepeatedProjectPrefixes(value);
   if (!cleaned) return "";

   const lower = cleaned.toLowerCase();
   const weakTitles = [
      "task created",
      "task sent to board",
      "task routed to board",
      "task generated from canvas",
      "canvas task created",
      "project work item",
      "untitled task",
      "untitled project",
      "workflow review",
      "workflow signal",
      "content sent to canvas",
      "active thread prepared for canvas",
      "thread deleted",
      "thread paused",
      "thread restored",
      "thread recovery reset",
      "snapshot saved",
      "snapshot version saved",
      "approved",
      "canceled",
   ];

   if (weakTitles.some((title) => lower === title || lower.startsWith(`${title}:`) || lower.includes(title))) {
      return "";
   }

   return sanitizeProjectMemoryTitle(cleaned);
}

export function normalizeProjectKey(value?: string) {
   return cleanProjectTitle(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96);
}

export function createStableWorkflowId(title?: string, existingWorkflowId?: string) {
   const safeExistingWorkflowId = sanitizeProjectMemoryId(existingWorkflowId);

   if (safeExistingWorkflowId && !safeExistingWorkflowId.startsWith("unthreaded-")) return safeExistingWorkflowId;
   const key = normalizeProjectKey(title);
   if (key) return `project-${key}`;
   return crypto.randomUUID();
}

export function getProjectIdentity(input: ProjectMemoryInput) {
   const title = cleanProjectTitle(input.sourceTitle || input.title) || cleanProjectTitle(input.title) || "Untitled Project";
   const projectKey = normalizeProjectKey(title) || crypto.randomUUID();
   const workflowId = createStableWorkflowId(title, input.workflowId);

   return { title, cleanTitle: title, projectKey, workflowId };
}

export function isWeakProjectRecord(project?: Partial<AllevinProject>) {
   if (!project) return true;
   const title = cleanProjectTitle(project.title || project.sourceTitle);
   const body = compactText(project.body || project.sourceContent || project.workingSummary);
   if (!title) return true;
   if (!body || body.length < 8) return true;
   return false;
}

export function getStageForDestination(destination?: AllevinDestination): AllevinProjectStage {
   switch (destination) {
      case "canvas":
         return "drafting";
      case "task":
         return "tasking";
      case "board":
         return "tracking";
      case "notes":
         return "preserved";
      case "integrations":
      case "google-docs":
         return "exporting";
      default:
         return "unknown";
   }
}

export function getSuggestedDestinationForStage(stage?: AllevinProjectStage): AllevinDestination {
   switch (stage) {
      case "drafting":
         return "task";
      case "tasking":
         return "board";
      case "tracking":
         return "canvas";
      case "reviewing":
         return "integrations";
      case "exporting":
      case "exported":
         return "google-docs";
      default:
         return "canvas";
   }
}

function getDestinationLabel(destination?: AllevinDestination) {
   switch (destination) {
      case "canvas":
         return "Canvas";
      case "task":
         return "Tasks";
      case "board":
         return "Project Board";
      case "thread-recovery":
         return "Thread Recovery";
      case "calendar":
         return "Calendar";
      case "notes":
         return "Notes";
      case "integrations":
         return "Integrations";
      case "google-docs":
         return "Google Docs";
      default:
         return "System";
   }
}

function getStageLabel(stage?: AllevinProjectStage) {
   switch (stage) {
      case "idea":
         return "Idea";
      case "drafting":
         return "Drafting";
      case "tasking":
         return "Tasking";
      case "tracking":
         return "Tracking";
      case "reviewing":
         return "Reviewing";
      case "preserved":
         return "Preserved";
      case "exporting":
         return "Exporting";
      case "exported":
         return "Exported";
      case "completed":
         return "Completed";
      case "paused":
         return "Paused";
      default:
         return "Unknown";
   }
}

function getSourceLabel(source?: AllevinSource) {
   switch (source) {
      case "canvas":
         return "Canvas";
      case "task":
         return "Tasks";
      case "board":
         return "Project Board";
      case "thread-recovery":
         return "Thread Recovery";
      case "calendar":
         return "Calendar";
      case "integration":
      case "google-docs":
         return "Integrations";
      case "research":
         return "Research";
      case "notes":
         return "Notes";
      case "manual":
         return "Manual entry";
      default:
         return "System";
   }
}

function getFirstSentence(value?: string, limit = 220) {
   const text = compactText(value);
   if (!text) return "";

   const sentenceMatch = text.match(/^(.+?[.!?])\s/);
   const sentence = sentenceMatch?.[1] || text;

   if (sentence.length <= limit) return sentence;
   return `${sentence.slice(0, limit).trim()}...`;
}

function getSectionAfterLabel(text: string, label: string) {
   const source = cleanText(text);
   if (!source) return "";

   const pattern = new RegExp(
      `(?:^|\\n)\\s*${escapeRegex(label)}\\s*:?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:focus|useful context|next step|primary content|current working view|working summary|title|description|priority|lane|current board status|source|workflow metadata)\\s*:?\\s*\\n|$)`,
      "i",
   );
   const match = source.match(pattern);

   return cleanText(match?.[1]);
}

function stripStructuredLabels(value?: string) {
   const text = cleanText(value);
   if (!text) return "";

   const focus = getSectionAfterLabel(text, "Focus");
   if (focus) return focus;

   const primary = getSectionAfterLabel(text, "Primary Content");
   if (primary) return primary;

   return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => {
         const lower = line.toLowerCase();
         return !["focus:", "useful context:", "next step:", "primary content:", "current working view:", "working summary:", "workflow metadata:", "title:", "description:", "priority:", "lane:", "current board status:", "source:"].includes(lower);
      })
      .join("\n")
      .trim();
}

function getBestProjectContent(input: ProjectMemoryInput) {
   const candidates = [input.sourceContent, input.body, input.workingSummary]
      .map((candidate) => stripStructuredLabels(candidate))
      .map((candidate) => cleanText(candidate))
      .filter(Boolean);

   return candidates[0] || getProjectIdentity(input).title;
}

function buildSignalProfile(input: ProjectMemoryInput, content: string, stage: AllevinProjectStage, destination: AllevinDestination): ProjectSignalProfile {
   const combined = `${input.title || ""} ${input.sourceTitle || ""} ${input.body || ""} ${input.sourceContent || ""} ${input.workingSummary || ""} ${input.latestMovement || ""}`.toLowerCase();

   const hasLatestEdit = combined.includes("updated") || combined.includes("edited") || combined.includes("latest") || combined.includes("changed") || combined.includes("revised");
   const hasBoardContext = destination === "board" || stage === "tracking" || combined.includes("board") || combined.includes("in progress") || combined.includes("backlog") || combined.includes("review") || combined.includes("done");
   const hasTaskContext = destination === "task" || stage === "tasking" || combined.includes("task") || combined.includes("action") || combined.includes("todo") || combined.includes("next step");
   const hasCalendarContext = input.source === "calendar" || destination === "calendar" || combined.includes("calendar") || combined.includes("meeting") || combined.includes("event");
   const hasExportContext = destination === "integrations" || destination === "google-docs" || stage === "exporting" || combined.includes("export") || combined.includes("google docs");
   const needsReview = combined.includes("review") || stage === "reviewing" || destination === "integrations" || destination === "google-docs";
   const needsAction = hasTaskContext || stage === "drafting";
   const needsExport = hasExportContext || combined.includes("final") || combined.includes("ready to export");

   let projectType: ProjectSignalProfile["projectType"] = "general";
   if (hasCalendarContext) projectType = "calendar";
   else if (hasExportContext) projectType = "export";
   else if (combined.includes("research") || combined.includes("study") || combined.includes("evidence")) projectType = "research";
   else if (combined.includes("plan") || combined.includes("roadmap") || combined.includes("schedule")) projectType = "planning";
   else if (hasTaskContext) projectType = "task";
   else if (stage === "drafting" || destination === "canvas") projectType = "draft";
   else if (hasBoardContext) projectType = "project";

   const intent = getFirstSentence(content, 160) || "Continue the current project.";

   let confidence = 65;
   if (content.length > 120) confidence += 10;
   if (hasLatestEdit) confidence += 5;
   if (hasBoardContext || hasTaskContext || hasExportContext || hasCalendarContext) confidence += 5;
   if (input.workflowId) confidence += 5;

   return {
      projectType,
      intent,
      confidence: Math.min(95, confidence),
      hasLatestEdit,
      hasBoardContext,
      hasTaskContext,
      hasCalendarContext,
      hasExportContext,
      needsReview,
      needsAction,
      needsExport,
   };
}

export function getDefaultNextAction(stage?: AllevinProjectStage, destination?: AllevinDestination) {
   if (destination === "canvas" || stage === "drafting") return "Review the latest content, make any needed edits, then send it to Tasks when it is ready for action.";
   if (destination === "task" || stage === "tasking") return "Review the task and send it to the Board when it is ready to track.";
   if (destination === "board" || stage === "tracking") return "Move the project forward on the Board, or send it back to Canvas if it needs more development.";
   if (destination === "integrations" || destination === "google-docs" || stage === "exporting") return "Review the export preview, then create the final document when ready.";
   return "Choose the next useful move: continue in Canvas, create a Task, track on Board, or prepare an Export.";
}

function buildSmarterNextStep(input: ProjectMemoryInput, profile: ProjectSignalProfile, stage: AllevinProjectStage, destination: AllevinDestination) {
   const cleanRecommendedNextAction = sanitizeProjectMemoryNextAction(input.recommendedNextAction);

   if (cleanRecommendedNextAction) {
      return cleanRecommendedNextAction;
   }

   if (profile.hasCalendarContext) {
      return "Review the event context, save any important notes, then create a follow-up task or send the event into Canvas if it needs planning.";
   }

   if (profile.needsExport || destination === "integrations" || destination === "google-docs") {
      return "Review the export preview, clean the final wording, then create the Google Doc when the output is ready.";
   }

   if (stage === "tracking" || destination === "board") {
      if (profile.needsReview) {
         return "Review the latest Board update, confirm what changed, then either move it to Done or send it back to Canvas for refinement.";
      }

      return "Use the Board to move this project forward. If the content needs development, send it back to Canvas; if the next action is clear, move it toward Review.";
   }

   if (stage === "tasking" || destination === "task") {
      return "Turn this into one clear next action, then send it to the Board when it is ready to track.";
   }

   if (stage === "drafting" || destination === "canvas") {
      return "Refine the current draft in Canvas, then send it to Tasks when the next action is clear.";
   }

   if (stage === "preserved" || destination === "notes") {
      return "Keep this preserved as context. Reopen it in Canvas if it needs development or create a Task if it needs action.";
   }

   return getDefaultNextAction(stage, destination);
}

function buildSmarterUsefulContext(input: ProjectMemoryInput, profile: ProjectSignalProfile, stage: AllevinProjectStage, destination: AllevinDestination) {
   const identity = getProjectIdentity(input);
   const movement = input.latestMovement || `${getSourceLabel(input.source)} → ${getDestinationLabel(destination)}`;
   const contextLines = [`Project: ${identity.title}`, `Current stage: ${getStageLabel(stage)}`, `Current location: ${getDestinationLabel(destination)}`, `Priority: ${input.priority || "medium"}`, `Latest movement: ${movement}`];

   if (profile.hasLatestEdit) {
      contextLines.push("Recent update: ALLEVIN detected newer edited content and is treating it as the latest project version.");
   }

   if (profile.hasBoardContext) {
      contextLines.push("Board context: This work is being tracked as a project item, so lane/status matters for the next move.");
   }

   if (profile.hasTaskContext) {
      contextLines.push("Task context: This work has action-oriented content and can become a clear next step.");
   }

   if (profile.hasCalendarContext) {
      contextLines.push("Calendar context: This came from schedule/event context and may need notes or a follow-up task.");
   }

   if (profile.hasExportContext) {
      contextLines.push("Export context: This work is close to an output stage and should be reviewed before creating a document.");
   }

   contextLines.push(`Context confidence: ${profile.confidence}%`);

   return contextLines.join("\n");
}

export function buildProjectContextSections(input: ProjectMemoryInput): ProjectContextSections {
   const identity = getProjectIdentity(input);
   const mainContent = getBestProjectContent(input);
   const stage = input.stage || getStageForDestination(input.destination);
   const destination = input.destination || getSuggestedDestinationForStage(stage);
   const profile = buildSignalProfile(input, mainContent, stage, destination);

   const focusTitle = identity.title !== "Untitled Project" ? `${identity.title}: ` : "";
   const focus = `${focusTitle}${profile.intent}`.trim();

   return {
      focus: focus || mainContent,
      usefulContext: buildSmarterUsefulContext(input, profile, stage, destination),
      nextStep: buildSmarterNextStep(input, profile, stage, destination),
   };
}

export function buildStructuredHandoffBody(input: ProjectMemoryInput) {
   const sections = buildProjectContextSections(input);
   return sanitizeProjectMemoryBody([`Focus:\n${sections.focus}`, `Useful Context:\n${sections.usefulContext}`, `Next Step:\n${sections.nextStep}`].join("\n\n"));
}

export function readProjectMemory(): AllevinProject[] {
   if (typeof window === "undefined") return [];
   const stored = localStorage.getItem(ALLEVIN_PROJECT_MEMORY_STORAGE_KEY);
   if (!stored) return [];

   try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];

      return parsed
         .filter((project) => project && typeof project.workflowId === "string" && typeof project.title === "string")
         .map((project) => ({
            ...project,
            id: sanitizeProjectMemoryId(project.id || project.workflowId) || crypto.randomUUID(),
            workflowId: sanitizeProjectMemoryId(project.workflowId) || crypto.randomUUID(),
            title: cleanProjectTitle(project.title) || sanitizeProjectMemoryTitle(project.title),
            cleanTitle: cleanProjectTitle(project.cleanTitle || project.title) || sanitizeProjectMemoryTitle(project.title),
            projectKey: sanitizeProjectMemoryId(project.projectKey) || normalizeProjectKey(project.title) || sanitizeProjectMemoryId(project.workflowId),
            body: sanitizeProjectMemoryBody(project.body),
            sourceTitle: sanitizeProjectMemoryTitle(project.sourceTitle || project.title),
            sourceContent: sanitizeProjectMemoryBody(project.sourceContent),
            workingSummary: sanitizeProjectMemorySummary(project.workingSummary),
            latestSummary: sanitizeProjectMemorySummary(project.latestSummary),
            latestMovement: sanitizeProjectMemoryMovement(project.latestMovement),
            recommendedNextAction: sanitizeProjectMemoryNextAction(project.recommendedNextAction),
            history: Array.isArray(project.history)
               ? project.history
                    .filter((event: any) => event && typeof event.id === "string")
                    .map((event: any) => ({
                       ...event,
                       id: sanitizeProjectMemoryId(event.id) || crypto.randomUUID(),
                       title: sanitizeProjectMemoryTitle(event.title),
                       summary: sanitizeProjectMemorySummary(event.summary),
                       workflowId: sanitizeProjectMemoryId(event.workflowId),
                       originBoardItemId: sanitizeProjectMemoryId(event.originBoardItemId),
                       createdAt: isValidProjectMemoryTimestamp(event.createdAt) ? event.createdAt : Date.now(),
                    }))
                    .slice(0, 50)
               : [],
            signalCount: typeof project.signalCount === "number" ? project.signalCount : 1,
            confidence: typeof project.confidence === "number" ? Math.max(0, Math.min(100, project.confidence)) : 60,
            createdAt: isValidProjectMemoryTimestamp(project.createdAt) ? project.createdAt : Date.now(),
            updatedAt: isValidProjectMemoryTimestamp(project.updatedAt) ? project.updatedAt : Date.now(),
         }))
         .filter((project) => !isWeakProjectRecord(project));
   } catch {
      localStorage.removeItem(ALLEVIN_PROJECT_MEMORY_STORAGE_KEY);
      return [];
   }
}

export function saveProjectMemory(projects: AllevinProject[]) {
   if (typeof window === "undefined") return;
   localStorage.setItem(
      ALLEVIN_PROJECT_MEMORY_STORAGE_KEY,
      JSON.stringify(
         dedupeProjects(projects)
            .filter((project) => !isWeakProjectRecord(project))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 100),
      ),
   );
}

export function createProjectEvent(input: { type: AllevinProjectEvent["type"]; title: string; summary: string; source?: AllevinSource; destination?: AllevinDestination; workflowId?: string; originBoardItemId?: string }): AllevinProjectEvent {
   return {
      id: crypto.randomUUID(),
      type: input.type,
      title: cleanProjectTitle(input.title) || sanitizeProjectMemoryTitle(input.title),
      summary: sanitizeProjectMemorySummary(input.summary),
      source: input.source || "system",
      destination: input.destination,
      workflowId: sanitizeProjectMemoryId(input.workflowId),
      originBoardItemId: sanitizeProjectMemoryId(input.originBoardItemId),
      createdAt: Date.now(),
   };
}

export function createProjectFromInput(input: ProjectMemoryInput): AllevinProject {
   const identity = getProjectIdentity(input);
   const now = Date.now();
   const destination = input.destination || "canvas";
   const stage = input.stage || getStageForDestination(destination);
   const body = getBestProjectContent(input);
   const context = buildProjectContextSections({ ...input, title: identity.title, sourceContent: body, destination, stage });
   const recommendedNextAction = input.recommendedNextAction || context.nextStep;
   const latestMovement = input.latestMovement || `${getSourceLabel(input.source)} → ${getDestinationLabel(destination)}`;
   const profile = buildSignalProfile(input, body, stage, destination);

   return {
      id: identity.workflowId,
      workflowId: identity.workflowId,
      projectKey: identity.projectKey,
      title: sanitizeProjectMemoryTitle(identity.title),
      cleanTitle: sanitizeProjectMemoryTitle(identity.cleanTitle),
      body: sanitizeProjectMemoryBody(body),
      sourceTitle: sanitizeProjectMemoryTitle(identity.title),
      sourceContent: sanitizeProjectMemoryBody(body),
      workingSummary: sanitizeProjectMemorySummary(input.workingSummary) || sanitizeProjectMemorySummary(body),
      latestSummary: sanitizeProjectMemorySummary(context.focus),
      stage,
      status: input.status || "active",
      priority: input.priority || "medium",
      lastKnownLocation: destination,
      suggestedDestination: getSuggestedDestinationForStage(stage),
      signalCount: 1,
      confidence: profile.confidence,
      latestMovement: sanitizeProjectMemoryMovement(latestMovement),
      recommendedNextAction: sanitizeProjectMemoryNextAction(recommendedNextAction),
      originBoardItemId: sanitizeProjectMemoryId(input.originBoardItemId),
      createdAt: now,
      updatedAt: now,
      history: [
         createProjectEvent({
            type: "created",
            title: identity.title,
            summary: `Project memory created from ${getSourceLabel(input.source)}.`,
            source: input.source || "system",
            destination,
            workflowId: identity.workflowId,
            originBoardItemId: input.originBoardItemId,
         }),
      ],
   };
}

export function mergeProject(existing: AllevinProject, input: ProjectMemoryInput): AllevinProject {
   const identity = getProjectIdentity({ ...input, title: input.title || existing.title, sourceTitle: input.sourceTitle || existing.sourceTitle, workflowId: input.workflowId || existing.workflowId });
   const destination = input.destination || existing.lastKnownLocation || "system";
   const stage = input.stage || getStageForDestination(destination) || existing.stage;
   const nextBody = getBestProjectContent(input);
   const body = nextBody || existing.body || existing.sourceContent || existing.workingSummary || identity.title;
   const context = buildProjectContextSections({ ...input, title: identity.title, sourceTitle: identity.title, sourceContent: body, body, destination, stage, priority: input.priority || existing.priority });
   const latestMovement = input.latestMovement || `${getSourceLabel(input.source)} → ${getDestinationLabel(destination)}`;
   const recommendedNextAction = input.recommendedNextAction || context.nextStep;
   const profile = buildSignalProfile(input, body, stage, destination);
   const event = createProjectEvent({
      type: "updated",
      title: identity.title,
      summary: `Project memory updated from ${getSourceLabel(input.source)}. ${context.focus}`,
      source: input.source || "system",
      destination,
      workflowId: identity.workflowId,
      originBoardItemId: input.originBoardItemId || existing.originBoardItemId,
   });

   return {
      ...existing,
      workflowId: identity.workflowId,
      projectKey: identity.projectKey,
      title: sanitizeProjectMemoryTitle(identity.title),
      cleanTitle: sanitizeProjectMemoryTitle(identity.cleanTitle),
      body: sanitizeProjectMemoryBody(body),
      sourceTitle: sanitizeProjectMemoryTitle(identity.title),
      sourceContent: sanitizeProjectMemoryBody(body),
      workingSummary: sanitizeProjectMemorySummary(input.workingSummary) || sanitizeProjectMemorySummary(body),
      latestSummary: sanitizeProjectMemorySummary(context.focus),
      stage,
      status: input.status || existing.status || "active",
      priority: input.priority || existing.priority || "medium",
      lastKnownLocation: destination,
      suggestedDestination: getSuggestedDestinationForStage(stage),
      signalCount: (existing.signalCount || 0) + 1,
      confidence: Math.min(95, Math.max(existing.confidence || 65, profile.confidence)),
      latestMovement: sanitizeProjectMemoryMovement(latestMovement),
      recommendedNextAction: sanitizeProjectMemoryNextAction(recommendedNextAction),
      originBoardItemId: sanitizeProjectMemoryId(input.originBoardItemId || existing.originBoardItemId),
      updatedAt: Date.now(),
      history: [event, ...(existing.history || [])].slice(0, 50),
   };
}

export function getProjectMatchKey(project: Partial<AllevinProject> | ProjectMemoryInput) {
   if ("projectKey" in project && project.projectKey) return `key:${project.projectKey}`;
   if (project.workflowId) return `workflow:${project.workflowId}`;
   if (project.originBoardItemId) return `board:${project.originBoardItemId}`;
   const key = normalizeProjectKey(project.sourceTitle || project.title);
   return key ? `title:${key}` : "";
}

export function dedupeProjects(projects: AllevinProject[]) {
   const map = new Map<string, AllevinProject>();

   for (const project of projects) {
      const key = getProjectMatchKey(project) || project.id;
      const existing = map.get(key);

      if (!existing) {
         map.set(key, project);
         continue;
      }

      const newer = project.updatedAt >= existing.updatedAt ? project : existing;
      const older = project.updatedAt >= existing.updatedAt ? existing : project;
      const mergedBody = sanitizeProjectMemoryBody(newer.body || newer.sourceContent || newer.workingSummary || older.body || older.sourceContent || older.workingSummary);
      const context = buildProjectContextSections({
         title: newer.title || older.title,
         sourceTitle: newer.sourceTitle || older.sourceTitle,
         sourceContent: mergedBody,
         workingSummary: newer.workingSummary || older.workingSummary,
         source: "system",
         destination: newer.lastKnownLocation || older.lastKnownLocation,
         stage: newer.stage || older.stage,
         priority: newer.priority || older.priority,
         latestMovement: newer.latestMovement || older.latestMovement,
      });

      map.set(key, {
         ...older,
         ...newer,
         body: sanitizeProjectMemoryBody(mergedBody),
         sourceContent: sanitizeProjectMemoryBody(mergedBody || newer.sourceContent || older.sourceContent),
         workingSummary: sanitizeProjectMemorySummary(newer.workingSummary || mergedBody || older.workingSummary),
         latestSummary: sanitizeProjectMemorySummary(context.focus),
         recommendedNextAction: sanitizeProjectMemoryNextAction(newer.recommendedNextAction || context.nextStep),
         history: [...(newer.history || []), ...(older.history || [])].slice(0, 50),
         createdAt: Math.min(older.createdAt || Date.now(), newer.createdAt || Date.now()),
         updatedAt: Math.max(older.updatedAt || 0, newer.updatedAt || 0),
      });
   }

   return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertProjectMemory(input: ProjectMemoryInput) {
   const currentProjects = readProjectMemory();
   const inputKey = getProjectMatchKey(input);
   const identity = getProjectIdentity(input);

   const existing = currentProjects.find((project) => {
      if (input.workflowId && project.workflowId === input.workflowId) return true;
      if (input.originBoardItemId && project.originBoardItemId === input.originBoardItemId) return true;
      if (inputKey && getProjectMatchKey(project) === inputKey) return true;
      return project.projectKey === identity.projectKey;
   });

   const nextProject = existing ? mergeProject(existing, input) : createProjectFromInput(input);
   const nextProjects = dedupeProjects([nextProject, ...currentProjects.filter((project) => project.workflowId !== nextProject.workflowId)]);

   saveProjectMemory(nextProjects);

   if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("allevin-project-memory-update", { detail: { project: nextProject, projects: nextProjects, updatedAt: Date.now() } }));
   }

   return nextProject;
}

export function getLatestProjectMemory() {
   return readProjectMemory()[0];
}

export function findProjectMemoryByTitle(title?: string) {
   const key = normalizeProjectKey(title);
   if (!key) return undefined;
   return readProjectMemory().find((project) => project.projectKey === key || normalizeProjectKey(project.title) === key || normalizeProjectKey(project.sourceTitle) === key);
}

export function deleteProjectMemory(input: { workflowId?: string; title?: string; originBoardItemId?: string }) {
   const key = normalizeProjectKey(input.title);
   const nextProjects = readProjectMemory().filter((project) => {
      if (input.workflowId && project.workflowId === input.workflowId) return false;
      if (input.originBoardItemId && project.originBoardItemId === input.originBoardItemId) return false;
      if (key && project.projectKey === key) return false;
      return true;
   });

   saveProjectMemory(nextProjects);

   if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("allevin-project-memory-update", { detail: { projects: nextProjects, updatedAt: Date.now() } }));
   }

   return nextProjects;
}
