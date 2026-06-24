"use client";

import { useEffect, useMemo, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { Boxes, CheckCircle2, FileText, NotebookPen, Send, Sparkles, XCircle, CalendarDays, ListChecks, ChevronDown, FolderKanban, Flag, RotateCw } from "lucide-react";

import { useWorkspace } from "@/components/WorkspaceContext";

import { upsertProjectMemory, deleteProjectMemory } from "@/lib/allevinProjectMemory";

import { requestAllevinLLM } from "@/lib/allevinLLMClient";

import { rememberDeletedProjectMemorySignal } from "@/components/MemoryEngine";

// ========================================
// ALLEVIN Projects Workspace
// Purpose:
// Saved-work hub for ALLEVIN MK III.
// No outside document routes.
// Work stays inside ALLEVIN: Projects, Tasks,
// Calendar, and Canvas.
// ========================================

const STORAGE_KEY = "allevin-internal-output-hub";

const PROJECT_LIBRARY_STORAGE_KEY = "allevin-project-library";

const DELETED_PROJECTS_STORAGE_KEY = "allevin-project-deleted";

const DELETED_PROJECT_KEYS_STORAGE_KEY = "allevin-project-deleted-keys";

const DELETED_THREADS_STORAGE_KEY = "allevin-thread-recovery-deleted";

const DELETED_THREAD_KEYS_STORAGE_KEY = "allevin-thread-recovery-deleted-keys";

const WORKFLOW_TIMELINE_STORAGE_KEY = "allevin-global-workflow-timeline";

const THREAD_MEMORY_V2_STORAGE_KEY = "allevin-thread-memory-v2";

const CANVAS_STORAGE_KEY = "allevin-adaptive-work-canvas";

const PROJECT_TRACKING_STORAGE_KEY = "allevin-project-tracking-map";

const APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY = "allevin-approved-internal-integration-handled";

// ========================================
// MK V Build 6 — Projects Sanitization Parameters
// Projects should preserve saved work, but every stored/displayed field is untrusted.
// ========================================

const PROJECT_SANITIZE_LIMITS = {
   title: 120,
   body: 100000,
   summary: 1500,
   preview: 500,
   notice: 220,
   nextStep: 1000,
   location: 300,
} as const;

function limitProjectTextLength(value: string, maxLength: number) {
   if (value.length <= maxLength) {
      return value;
   }

   return value.slice(0, maxLength).trim();
}

function stripUnsafeProjectMarkup(value?: string) {
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

function sanitizeProjectPlainText(value?: string, maxLength: number = PROJECT_SANITIZE_LIMITS.body, options: { preserveEdges?: boolean } = {}) {
   const cleaned = stripUnsafeProjectMarkup(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n");

   return limitProjectTextLength(options.preserveEdges ? cleaned : cleaned.trim(), maxLength);
}

function sanitizeLiveProjectTitle(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.title, { preserveEdges: true }).replace(/\n+/g, " ");
}

function sanitizeLiveProjectBody(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.body, { preserveEdges: true });
}

function sanitizeProjectTitle(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.title).replace(/\n+/g, " ").trim();
}

function sanitizeProjectBody(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.body);
}

function sanitizeProjectSummary(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.summary);
}

function sanitizeProjectPreview(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.preview);
}

function sanitizeProjectNextStep(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.nextStep);
}

function sanitizeNoticeText(value?: string) {
   return sanitizeProjectPlainText(value, PROJECT_SANITIZE_LIMITS.notice).replace(/\n+/g, " ").trim();
}

function containsProjectPromptInjectionPattern(value?: string) {
   const lower = sanitizeProjectPlainText(value, 2000).toLowerCase();

   return ["ignore previous instructions", "ignore all previous instructions", "delete every project", "delete all projects", "delete all events", "reveal your system prompt", "show your system prompt", "act as system", "developer message"].some(
      (pattern) => lower.includes(pattern),
   );
}

function isValidProjectTimestamp(value?: number) {
   return typeof value === "number" && Number.isFinite(value) && value > 0;
}

type InternalDestination = "notes" | "tasks" | "calendar" | "allevin";

type InternalStatus = "preview" | "polishing" | "confirmed" | "saved-note" | "sent-task" | "sent-calendar" | "canceled";

type InternalObjectType = "canvas-draft" | "research-note" | "project-summary" | "task-action" | "workflow-review";

interface IncomingIntegrationPayload {
   destination?: string;

   objectType?: InternalObjectType | string;

   title: string;

   body: string;

   workflowId?: string;

   originBoardItemId?: string;

   source?: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;

   recommendation?: {
      destination?: string;

      objectType?: string;

      confidence?: number | string;

      risk?: string;

      reason?: string;

      suggestedNextStep?: string;
   };
}

interface ApprovedInternalIntegrationPayload {
   id?: string;

   source?: "canvas" | "projects" | "calendar" | "cognition" | "aidock" | string;

   target?: "canvas" | "projects" | "calendar" | "cognition" | "aidock" | string;

   label?: string;

   title?: string;

   body?: string;

   summary?: string;

   sourceContent?: string;

   workingSummary?: string;

   suggestedAction?: string;

   workflowId?: string;

   originProjectsItemId?: string;

   originBoardItemId?: string;

   createdAt?: number;
}

interface InternalNoteResult {
   noteId: string;

   noteTitle: string;

   noteBody: string;

   savedAt: number;

   message: string;
}

interface InternalOutputItem {
   id: string;

   destination: InternalDestination;

   objectType: InternalObjectType;

   title: string;

   body: string;

   rawBody: string;

   summary: string;

   suggestedNextStep: string;

   workflowId?: string;

   originBoardItemId?: string;

   source?: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;

   status: InternalStatus;

   llmPolished?: boolean;

   llmPolishConfidence?: number;

   internalNoteResult?: InternalNoteResult;

   createdAt: number;

   updatedAt: number;
}

interface ProjectLibraryNote {
   id: string;

   title: string;

   body: string;

   summary: string;

   source: string;

   savedAt: number;
}

interface ProjectLibraryItem {
   id: string;

   title: string;

   workflowId?: string;

   originBoardItemId?: string;

   latestSummary: string;

   latestMovement: string;

   notes: ProjectLibraryNote[];

   createdAt: number;

   updatedAt: number;
}

type ProjectTrackingStatus = "idea" | "active" | "check" | "done";

interface ProjectTrackingMeta {
   status: ProjectTrackingStatus;

   priority: "low" | "medium" | "high";

   nextStep: string;

   calendarTaskTitle: string;

   calendarTaskDate: string;

   calendarTaskTime: string;

   calendarTaskDurationMinutes: number;

   updatedAt: number;
}

function cleanText(value?: string) {
   return sanitizeProjectPlainText(value).replace(/\r/g, "").trim();
}

function compactText(value?: string) {
   return cleanText(value).replace(/\s+/g, " ").trim();
}

function getNow() {
   return Date.now();
}

function getReadableProjectDate(value?: number) {
   if (!value) {
      return "Recently updated";
   }

   try {
      return new Intl.DateTimeFormat(undefined, {
         month: "short",
         day: "numeric",
      }).format(new Date(value));
   } catch {
      return "Recently updated";
   }
}

function pickRandomItem(values: string[]) {
   return values[Math.floor(Math.random() * values.length)];
}

function getProjectTrackingMap() {
   if (typeof window === "undefined") {
      return {} as Record<string, ProjectTrackingMeta>;
   }

   try {
      const stored = localStorage.getItem(PROJECT_TRACKING_STORAGE_KEY);

      const parsed = stored ? JSON.parse(stored) : {};

      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, ProjectTrackingMeta>) : {};
   } catch {
      return {};
   }
}

function saveProjectTrackingMap(map: Record<string, ProjectTrackingMeta>) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(PROJECT_TRACKING_STORAGE_KEY, JSON.stringify(map));
}

function inferProjectTrackingStatus(project: ProjectLibraryItem): ProjectTrackingStatus {
   const lower = compactText(`${project.latestMovement} ${project.latestSummary} ${project.notes[0]?.body || ""}`).toLowerCase();

   if (["done", "completed", "finished", "marked complete"].some((signal) => lower.includes(signal))) {
      return "done";
   }

   if (["review", "check", "verify", "ready"].some((signal) => lower.includes(signal))) {
      return "check";
   }

   if (["next steps", "need to", "task", "update", "create", "clean", "pick", "set", "decide", "prepare"].some((signal) => lower.includes(signal))) {
      return "active";
   }

   return "idea";
}

function getDefaultProjectTracking(project: ProjectLibraryItem): ProjectTrackingMeta {
   return {
      status: inferProjectTrackingStatus(project),
      priority: "medium",
      nextStep: getProjectTypeInsight(project).nextMove,
      calendarTaskTitle: "",
      calendarTaskDate: "",
      calendarTaskTime: "",
      calendarTaskDurationMinutes: 60,
      updatedAt: project.updatedAt || getNow(),
   };
}

function getProjectMemoryStageFromTrackingStatus(status: ProjectTrackingStatus) {
   switch (status) {
      case "idea":
         return "idea";

      case "active":
         return "tracking";

      case "check":
         return "reviewing";

      case "done":
         return "completed";

      default:
         return "unknown";
   }
}

function getProjectMemoryStatusFromTrackingStatus(status: ProjectTrackingStatus) {
   switch (status) {
      case "done":
         return "completed";

      case "check":
         return "ready";

      case "idea":
      case "active":
      default:
         return "active";
   }
}

function getProjectStatusLabel(status: ProjectTrackingStatus) {
   switch (status) {
      case "idea":
         return "Drafting";
      case "active":
         return "In Progress";
      case "check":
         return "Check";
      case "done":
         return "Done";
      default:
         return "Drafting";
   }
}

function getNextStatus(status: ProjectTrackingStatus): ProjectTrackingStatus {
   if (status === "idea") return "active";
   if (status === "active") return "check";
   if (status === "check") return "done";

   return "done";
}

function getTrackingGuidance(status: ProjectTrackingStatus) {
   if (status === "idea") {
      return "Shape this in Canvas until the next step is obvious.";
   }

   if (status === "active") {
      return "Keep the next action clear and move it to Check when it is ready.";
   }

   if (status === "check") {
      return "Review the latest version, save useful notes, or mark it done.";
   }

   return "This is marked done. Reopen it only if more work appears.";
}

function getGeneratedProjectsLine(action: "saved" | "opened" | "tasked" | "scheduled" | "deleted" | "polished" | "added") {
   const actionMap = {
      saved: ["Saved to Projects", "Project saved", "Saved safely", "Filed in Projects", "Project tucked away"],
      opened: ["Opened in Canvas", "Back in Canvas", "Project reopened", "Returned to Canvas", "Canvas has it now"],
      tasked: ["Task created", "Sent to Tasks", "Next action created", "Task ready", "That thought has a job now"],
      scheduled: ["Scheduled in Calendar", "Time added", "Calendar has it", "Time scheduled", "Time has entered the chat"],
      deleted: ["Project deleted", "Project retired", "Removed from Projects", "Project cleared", "No resurrection scheduled"],
      polished: ["Polished", "Cleaned up", "Refined", "Tuned up", "Made clearer"],
      added: ["Project added", "Draft added", "Added to Projects", "Project draft ready", "Added to Projects"],
   } as const;

   const tails = [
      "No chaos detected.",
      "Clean and simple.",
      "Future you has been considered.",
      "Very responsible of us.",
      "The workspace approves.",
      "I’ll keep it ready.",
      "Efficient. Almost suspicious.",
      "That should keep things moving.",
      "Neatly handled.",
      "A tidy little win.",
   ];

   return `${pickRandomItem([...actionMap[action]])}. ${pickRandomItem(tails)}`;
}

function getProjectSuggestionHistory() {
   const historyKey = "allevin-project-suggestion-history-map";

   if (typeof window === "undefined") {
      return {} as Record<string, string[]>;
   }

   try {
      const stored = localStorage.getItem(historyKey);

      const parsed = stored ? JSON.parse(stored) : {};

      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string[]>) : {};
   } catch {
      return {};
   }
}

function saveProjectSuggestionHistory(history: Record<string, string[]>) {
   if (typeof window === "undefined") {
      return;
   }

   try {
      localStorage.setItem("allevin-project-suggestion-history-map", JSON.stringify(history));
   } catch {
      // Suggestions should never break Projects.
   }
}

function getProjectTypeInsight(project: ProjectLibraryItem) {
   const body = compactText(`${project.title} ${project.latestSummary} ${project.notes[0]?.body || ""}`).toLowerCase();

   if (["patio", "backyard", "furniture", "plants", "lights", "budget", "shopping", "clean"].some((signal) => body.includes(signal))) {
      return {
         type: "home project",
         canvasIdea: "Add a simple budget, shopping list, and first cleanup step to Canvas",
         nextMove: "make one task for the first physical step",
      };
   }

   if (["user", "ux", "accessibility", "prototype", "wireframe", "usability", "screen reader", "flow"].some((signal) => body.includes(signal))) {
      return {
         type: "UX project",
         canvasIdea: "add the target user, main pain point, and success criteria to Canvas",
         nextMove: "make one task for the first testable design step",
      };
   }

   if (["server", "network", "active directory", "device", "computer", "update", "ticket", "documentation", "account"].some((signal) => body.includes(signal))) {
      return {
         type: "IT project",
         canvasIdea: "separate the work into inventory, access checks, updates, and documentation",
         nextMove: "make one task for the first system check",
      };
   }

   if (["research", "paper", "source", "thesis", "assignment", "outline", "study"].some((signal) => body.includes(signal))) {
      return {
         type: "research project",
         canvasIdea: "add a research question, source list, and rough outline to Canvas",
         nextMove: "make one task for finding or reviewing the next source",
      };
   }

   if (["post", "caption", "campaign", "audience", "flyer", "content", "instagram", "social"].some((signal) => body.includes(signal))) {
      return {
         type: "content project",
         canvasIdea: "add the audience, message, needed assets, and posting timeline to Canvas",
         nextMove: "make one task for the first asset or caption",
      };
   }

   if (["launch", "client", "pricing", "service", "offer", "outreach", "website"].some((signal) => body.includes(signal))) {
      return {
         type: "launch project",
         canvasIdea: "add the offer, target customer, price, and launch checklist to Canvas",
         nextMove: "make one task for the first launch step",
      };
   }

   if (["lesson", "students", "activity", "objective", "assessment", "class"].some((signal) => body.includes(signal))) {
      return {
         type: "lesson project",
         canvasIdea: "add the learning objective, activity, materials, and assessment plan to Canvas",
         nextMove: "make one task for the first lesson material",
      };
   }

   if (["build", "bug", "component", "state", "api", "deploy", "test", "code"].some((signal) => body.includes(signal))) {
      return {
         type: "development project",
         canvasIdea: "add expected behavior, edge cases, and a short test checklist to Canvas",
         nextMove: "make one task for the first implementation or test step",
      };
   }

   return {
      type: "project",
      canvasIdea: "add the goal, missing details, and success criteria to Canvas",
      nextMove: "make one clear task from the strongest next step",
   };
}

function getGeneratedProjectSuggestion(project: ProjectLibraryItem) {
   const insight = getProjectTypeInsight(project);

   const body = compactText(`${project.latestSummary} ${project.notes[0]?.body || ""}`);

   const lower = body.toLowerCase();

   const hasActionLanguage = ["need to", "next step", "task", "update", "test", "create", "finish", "review", "build", "decide", "clean", "pick", "set"].some((signal) => lower.includes(signal));

   const openings = [
      `This looks like a ${insight.type}.`,
      `${project.title} has a clear ${insight.type} shape.`,
      `I’d treat ${project.title} like a ${insight.type}.`,
      `The useful pattern here is ${insight.type} work.`,
      `${project.title} is ready for a little structure.`,
      `This one has enough direction to move forward cleanly.`,
      `I see a practical next move in ${project.title}.`,
      `This project has enough signal to avoid wandering around dramatically.`,
      `The project is behaving. Rare, but appreciated.`,
      `There’s a clean path here, and no gremlin committee is required.`,
   ];

   const canvasIdeas = [
      `I’d ${insight.canvasIdea}.`,
      `A useful Canvas addition would be to ${insight.canvasIdea}.`,
      `Add a quick section for this: ${insight.canvasIdea}.`,
      `Canvas would benefit from one extra note: ${insight.canvasIdea}.`,
      `Before moving too far, ${insight.canvasIdea}.`,
      `I’d tighten the notes by adding this: ${insight.canvasIdea}.`,
   ];

   const actionMoves = [
      `Then ${insight.nextMove}.`,
      `After that, ${insight.nextMove}.`,
      `Once that is clear, ${insight.nextMove}.`,
      `The next practical move is to ${insight.nextMove}.`,
      `Then give it momentum: ${insight.nextMove}.`,
      `That should make the next step easier to track: ${insight.nextMove}.`,
   ];

   const softerMoves = [
      `Keep it in Canvas a little longer so the main idea stays clear.`,
      `Continue shaping the notes before turning it into too many tasks.`,
      `Add one missing detail first, then decide what deserves a task.`,
      `The next move is not bigger; it is clearer.`,
      `Give the project one clean pass before sending more work downstream.`,
      `A small structure pass should make this easier to continue.`,
   ];

   const randomPick = (values: string[]) => values[Math.floor(Math.random() * values.length)];

   const candidate = hasActionLanguage ? `${randomPick(openings)} ${randomPick(canvasIdeas)} ${randomPick(actionMoves)}` : `${randomPick(openings)} ${randomPick(canvasIdeas)} ${randomPick(softerMoves)}`;

   const history = getProjectSuggestionHistory();

   const projectKey = project.id || project.title;

   const previous = history[projectKey] || [];

   if (!previous.includes(candidate)) {
      const nextHistory = {
         ...history,
         [projectKey]: [candidate, ...previous].slice(0, 30),
      };

      saveProjectSuggestionHistory(nextHistory);

      return candidate;
   }

   const remix = `${randomPick(openings)} ${randomPick(canvasIdeas)} ${randomPick(hasActionLanguage ? actionMoves : softerMoves)}`;

   saveProjectSuggestionHistory({
      ...history,
      [projectKey]: [remix, ...previous].slice(0, 30),
   });

   return remix;
}

function normalizeInternalDestination(destination?: string): InternalDestination {
   const lower = (destination || "").toLowerCase();

   if (lower.includes("task")) {
      return "tasks";
   }

   if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("event")) {
      return "calendar";
   }

   // Former outside-document routes now stay internal.
   if (lower.includes("doc") || lower.includes("output") || lower.includes("export")) {
      return "notes";
   }

   if (lower.includes("note")) {
      return "notes";
   }

   return "notes";
}

function normalizeObjectType(value?: string): InternalObjectType {
   if (value === "canvas-draft" || value === "research-note" || value === "project-summary" || value === "task-action" || value === "workflow-review") {
      return value;
   }

   return "project-summary";
}

function getSummaryFromBody(body?: string) {
   const lines = cleanText(body)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.endsWith(":"));

   return compactText(lines[0] || body || "Added inside ALLEVIN.");
}

function getSuggestedNextStep(destination: InternalDestination) {
   if (destination === "tasks") {
      return "Create a task when this is ready for action.";
   }

   if (destination === "calendar") {
      return "Schedule this when it needs time on the calendar.";
   }

   if (destination === "notes") {
      return "Save this to Projects.";
   }

   return "Choose where this belongs inside ALLEVIN.";
}

function buildInternalOutputFromPayload(payload: IncomingIntegrationPayload): InternalOutputItem {
   const destination = normalizeInternalDestination(payload.destination || payload.recommendation?.destination);

   const body = sanitizeProjectBody(payload.body || payload.workingSummary || payload.sourceContent || payload.cleanSourceContent);

   const title = sanitizeProjectTitle(payload.sourceTitle || payload.title) || "ALLEVIN Projects";

   return {
      id: crypto.randomUUID(),

      destination,

      objectType: normalizeObjectType(payload.objectType || payload.recommendation?.objectType),

      title,

      body: body || title,

      rawBody: body || title,

      summary: sanitizeProjectSummary(getSummaryFromBody(body || title)),

      suggestedNextStep: sanitizeProjectNextStep(payload.recommendation?.suggestedNextStep) || getSuggestedNextStep(destination),

      workflowId: payload.workflowId,

      originBoardItemId: payload.originBoardItemId,

      source: payload.source,

      sourceTitle: sanitizeProjectTitle(payload.sourceTitle || title),

      sourceContent: sanitizeProjectBody(payload.sourceContent || payload.cleanSourceContent || body),

      workingSummary: sanitizeProjectSummary(payload.workingSummary || body),

      cleanSourceContent: sanitizeProjectBody(payload.cleanSourceContent || payload.sourceContent || body),

      status: "preview",

      createdAt: getNow(),

      updatedAt: getNow(),
   };
}

function cleanProjectTitle(value?: string) {
   let title = compactText(value);

   if (!title) {
      return "";
   }

   const removablePrefixes = ["internal allevin note saved for", "internal note saved for", "note saved for", "saved note for", "project", "title", "source title"];

   let changed = true;

   while (changed) {
      changed = false;

      for (const prefix of removablePrefixes) {
         const regex = new RegExp(`^${prefix}\\s*:?\\s*`, "i");

         if (regex.test(title)) {
            title = title.replace(regex, "").trim();

            changed = true;
         }
      }
   }

   return sanitizeProjectTitle(title || "Untitled project");
}

function getProjectLibraryKey({
   workflowId,
   originBoardItemId,
   title,
}: {
   workflowId?: string;

   originBoardItemId?: string;

   title?: string;
}) {
   if (workflowId) {
      return `workflow:${workflowId}`;
   }

   if (originBoardItemId) {
      return `origin:${originBoardItemId}`;
   }

   const cleanTitle = cleanProjectTitle(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

   return `title:${cleanTitle || "untitled-project"}`;
}

function readStringArrayStorage(key: string) {
   if (typeof window === "undefined") {
      return [] as string[];
   }

   const stored = localStorage.getItem(key);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
   } catch {
      localStorage.removeItem(key);

      return [];
   }
}

function saveStringArrayStorage(key: string, values: string[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(key, JSON.stringify(Array.from(new Set(values.filter(Boolean)))));
}

function getDeletedProjectTitleKey(title?: string) {
   return cleanProjectTitle(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

function getProjectDeleteKeys(project: ProjectLibraryItem) {
   const titleKey = getDeletedProjectTitleKey(project.title);

   return [
      project.id ? `project:${project.id}` : "",
      project.id ? `thread:${project.id}` : "",
      project.workflowId ? `workflow:${project.workflowId}` : "",
      project.originBoardItemId ? `origin:${project.originBoardItemId}` : "",
      titleKey ? `title:${titleKey}` : "",
   ].filter(Boolean);
}

function rememberDeletedProject(project: ProjectLibraryItem) {
   if (typeof window === "undefined") {
      return;
   }

   const ids = [project.id, project.workflowId, project.originBoardItemId].filter(Boolean) as string[];

   const keys = getProjectDeleteKeys(project);

   saveStringArrayStorage(DELETED_PROJECTS_STORAGE_KEY, [...readStringArrayStorage(DELETED_PROJECTS_STORAGE_KEY), ...ids]);

   saveStringArrayStorage(DELETED_PROJECT_KEYS_STORAGE_KEY, [...readStringArrayStorage(DELETED_PROJECT_KEYS_STORAGE_KEY), ...keys]);

   saveStringArrayStorage(DELETED_THREADS_STORAGE_KEY, [...readStringArrayStorage(DELETED_THREADS_STORAGE_KEY), ...ids]);

   saveStringArrayStorage(DELETED_THREAD_KEYS_STORAGE_KEY, [...readStringArrayStorage(DELETED_THREAD_KEYS_STORAGE_KEY), ...keys]);

   rememberDeletedProjectMemorySignal({
      id: project.id,
      workflowId: project.workflowId,
      originBoardItemId: project.originBoardItemId,
      title: project.title,
      sourceTitle: project.title,
   });
}

function itemMatchesDeletedProject(item: any, project: ProjectLibraryItem) {
   const titleKey = getDeletedProjectTitleKey(project.title);

   const itemTitleKey = getDeletedProjectTitleKey(item?.sourceTitle || item?.title);

   const projectIds = [project.id, project.workflowId, project.originBoardItemId].filter(Boolean);

   const itemIds = [item?.id, item?.workflowId, item?.originBoardItemId].filter(Boolean);

   if (projectIds.some((id) => itemIds.includes(id))) {
      return true;
   }

   return Boolean(titleKey && itemTitleKey && titleKey === itemTitleKey);
}

function pruneDeletedProjectFromStorage(project: ProjectLibraryItem) {
   if (typeof window === "undefined") {
      return;
   }

   try {
      const storedTimeline = localStorage.getItem(WORKFLOW_TIMELINE_STORAGE_KEY);

      if (storedTimeline) {
         const parsedTimeline = JSON.parse(storedTimeline);

         if (Array.isArray(parsedTimeline)) {
            localStorage.setItem(WORKFLOW_TIMELINE_STORAGE_KEY, JSON.stringify(parsedTimeline.filter((event) => !itemMatchesDeletedProject(event, project))));
         }
      }
   } catch {
      // Keep deletion safe if timeline storage is malformed.
   }

   try {
      const storedThreadMemory = localStorage.getItem(THREAD_MEMORY_V2_STORAGE_KEY);

      if (storedThreadMemory) {
         const parsedThreadMemory = JSON.parse(storedThreadMemory);

         if (Array.isArray(parsedThreadMemory)) {
            localStorage.setItem(THREAD_MEMORY_V2_STORAGE_KEY, JSON.stringify(parsedThreadMemory.filter((thread) => !itemMatchesDeletedProject(thread, project))));
         }
      }
   } catch {
      // Keep deletion safe if thread memory storage is malformed.
   }

   try {
      const storedCanvas = localStorage.getItem(CANVAS_STORAGE_KEY);

      if (storedCanvas) {
         const parsedCanvas = JSON.parse(storedCanvas);

         if (itemMatchesDeletedProject(parsedCanvas, project)) {
            localStorage.removeItem(CANVAS_STORAGE_KEY);
         }
      }
   } catch {
      // Keep deletion safe if Canvas storage is malformed.
   }
}

function readProjectLibrary() {
   if (typeof window === "undefined") {
      return [] as ProjectLibraryItem[];
   }

   const stored = localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return [];
      }

      return parsed
         .filter((project) => project && typeof project.id === "string")
         .map((project) => ({
            ...project,
            title: sanitizeProjectTitle(project.title),
            latestSummary: sanitizeProjectSummary(project.latestSummary),
            latestMovement: sanitizeProjectPlainText(project.latestMovement, 300),
            workflowId: typeof project.workflowId === "string" ? project.workflowId : undefined,
            originBoardItemId: typeof project.originBoardItemId === "string" ? project.originBoardItemId : undefined,
            notes: Array.isArray(project.notes)
               ? project.notes
                    .filter((note: any) => note && typeof note.id === "string")
                    .map((note: any) => ({
                       ...note,
                       title: sanitizeProjectTitle(note.title),
                       body: sanitizeProjectBody(note.body),
                       summary: sanitizeProjectSummary(note.summary),
                       source: sanitizeProjectPlainText(note.source || "Projects", 80),
                       savedAt: isValidProjectTimestamp(note.savedAt) ? note.savedAt : getNow(),
                    }))
                    .slice(0, 30)
               : [],
            createdAt: isValidProjectTimestamp(project.createdAt) ? project.createdAt : getNow(),
            updatedAt: isValidProjectTimestamp(project.updatedAt) ? project.updatedAt : getNow(),
         }));
   } catch {
      localStorage.removeItem(PROJECT_LIBRARY_STORAGE_KEY);

      return [];
   }
}

function getExistingProjectLibraryItemByTitle(title?: string) {
   const titleKey = getDeletedProjectTitleKey(title);

   if (!titleKey) {
      return undefined;
   }

   return readProjectLibrary().find((project) => getDeletedProjectTitleKey(project.title) === titleKey);
}

function getExistingProjectBodyByTitle(title?: string) {
   const existing = getExistingProjectLibraryItemByTitle(title);

   const existingBody = sanitizeProjectBody(existing?.notes?.[0]?.body || existing?.notes?.[0]?.summary || existing?.latestSummary || "");

   if (existingBody && !existingBody.toLowerCase().startsWith("calendar event:")) {
      return existingBody;
   }

   return "";
}

function mergeProjectBodyWithCalendarUpdate(existingBody?: string, incomingBody?: string) {
   const cleanExistingBody = sanitizeProjectBody(existingBody);

   const cleanIncomingBody = sanitizeProjectBody(incomingBody);

   if (!cleanExistingBody) {
      return cleanIncomingBody;
   }

   if (!cleanIncomingBody) {
      return cleanExistingBody;
   }

   if (cleanExistingBody.includes(cleanIncomingBody)) {
      return cleanExistingBody;
   }

   if (cleanIncomingBody.includes(cleanExistingBody)) {
      return cleanIncomingBody;
   }

   return sanitizeProjectBody(`${cleanExistingBody}\n\nCalendar Update:\n${cleanIncomingBody}`);
}

function isCalendarProjectUpdate(item: InternalOutputItem) {
   const body = compactText(item.body || item.sourceContent || item.workingSummary || item.summary).toLowerCase();

   return item.source === "calendar-integration" || body.startsWith("calendar event:") || body.includes("calendar note:");
}

function saveProjectDirectly(item: InternalOutputItem) {
   const cleanTitle = sanitizeProjectTitle(cleanProjectTitle(item.sourceTitle || item.title) || "Untitled project");

   const incomingBody = sanitizeProjectBody(item.body || item.sourceContent || item.workingSummary || item.summary || cleanTitle);

   const existingBody = isCalendarProjectUpdate(item) ? getExistingProjectBodyByTitle(cleanTitle) : "";

   const body = isCalendarProjectUpdate(item) ? mergeProjectBodyWithCalendarUpdate(existingBody, incomingBody) : incomingBody;

   const summary = sanitizeProjectSummary(item.summary || getSummaryFromBody(body) || body || cleanTitle);

   const noteId =
      item.workflowId ||
      item.originBoardItemId ||
      `note-${cleanTitle
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, "-")
         .replace(/^-+|-+$/g, "")}` ||
      item.id ||
      crypto.randomUUID();

   upsertProjectMemory({
      title: cleanTitle,
      body,
      sourceTitle: cleanTitle,
      sourceContent: sanitizeProjectBody(item.sourceContent || body),
      workingSummary: sanitizeProjectSummary(item.workingSummary || summary || body),
      workflowId: item.workflowId,
      originBoardItemId: item.originBoardItemId,
      source: "notes",
      destination: "integrations",
      stage: "preserved",
      status: "active",
      priority: "medium",
      latestMovement: "Saved to Projects",
      recommendedNextAction: sanitizeProjectNextStep("Continue this project in Canvas or turn the clearest next step into a task."),
   });

   upsertProjectLibraryNote({
      title: cleanTitle,
      body,
      summary,
      workflowId: item.workflowId,
      originBoardItemId: item.originBoardItemId,
      noteId,
   });

   window.dispatchEvent(
      new CustomEvent("allevin-project-note-saved", {
         detail: {
            title: cleanTitle,
            workflowId: item.workflowId,
            originBoardItemId: item.originBoardItemId,
            noteId,
            savedAt: getNow(),
         },
      }),
   );

   return cleanTitle;
}

function saveProjectLibrary(items: ProjectLibraryItem[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(items.slice(0, 80)));

   window.dispatchEvent(new CustomEvent("allevin-project-library-update"));
}

function chooseLongestProjectDocument(...values: Array<string | undefined>) {
   const candidates = values
      .map((value) => cleanText(value))
      .filter(Boolean)
      .filter((value) => !value.toLowerCase().startsWith("notes\n"));

   if (!candidates.length) {
      return "";
   }

   return candidates.sort((a, b) => b.length - a.length)[0];
}

function upsertProjectLibraryNote({
   title,
   body,
   summary,
   workflowId,
   originBoardItemId,
   noteId,
}: {
   title: string;

   body: string;

   summary: string;

   workflowId?: string;

   originBoardItemId?: string;

   noteId: string;
}) {
   const cleanTitle = sanitizeProjectTitle(cleanProjectTitle(title));

   const key = getProjectLibraryKey({
      workflowId,

      originBoardItemId,

      title: cleanTitle,
   });

   const current = readProjectLibrary();

   const titleKey = getDeletedProjectTitleKey(cleanTitle);

   const existing = current.find((project) => project.id === key) || current.find((project) => getDeletedProjectTitleKey(project.title) === titleKey);

   const note: ProjectLibraryNote = {
      id: noteId,

      title: cleanTitle,

      body: sanitizeProjectBody(body),

      summary: sanitizeProjectSummary(summary),

      source: "Projects",

      savedAt: getNow(),
   };

   const nextProject: ProjectLibraryItem = existing
      ? {
           ...existing,

           title: cleanTitle || existing.title,

           workflowId: workflowId || existing.workflowId,

           originBoardItemId: originBoardItemId || existing.originBoardItemId,

           latestSummary: sanitizeProjectSummary(chooseLongestProjectDocument(body, existing.notes?.[0]?.body, summary, existing.latestSummary)),

           latestMovement: "Saved to Projects",

           notes: [note, ...existing.notes.filter((existingNote: ProjectLibraryNote) => existingNote.id !== note.id && cleanProjectTitle(existingNote.title) !== cleanTitle)].slice(0, 30),

           updatedAt: getNow(),
        }
      : {
           id: key,

           title: cleanTitle,

           workflowId,

           originBoardItemId,

           latestSummary: sanitizeProjectSummary(chooseLongestProjectDocument(body, summary)),

           latestMovement: "Saved to Projects",

           notes: [note],

           createdAt: getNow(),

           updatedAt: getNow(),
        };

   saveProjectLibrary([nextProject, ...current.filter((project) => project.id !== nextProject.id)].sort((a, b) => b.updatedAt - a.updatedAt));
}

function readStoredOutputs() {
   if (typeof window === "undefined") {
      return [] as InternalOutputItem[];
   }

   const stored = localStorage.getItem(STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return [];
      }

      return parsed.map((item: any) => ({
         id: typeof item.id === "string" ? item.id : crypto.randomUUID(),

         destination: normalizeInternalDestination(item.destination),

         objectType: normalizeObjectType(item.objectType),

         title: sanitizeProjectTitle(item.title) || "ALLEVIN Projects",

         body: sanitizeProjectBody(item.body || item.rawBody || item.summary) || "Added inside ALLEVIN.",

         rawBody: sanitizeProjectBody(item.rawBody || item.body || item.summary) || "Added inside ALLEVIN.",

         summary: sanitizeProjectSummary(item.summary || getSummaryFromBody(item.body)),

         suggestedNextStep: sanitizeProjectNextStep(item.suggestedNextStep) || getSuggestedNextStep(normalizeInternalDestination(item.destination)),

         workflowId: typeof item.workflowId === "string" ? item.workflowId : undefined,

         originBoardItemId: typeof item.originBoardItemId === "string" ? item.originBoardItemId : undefined,

         source: typeof item.source === "string" ? item.source : undefined,

         sourceTitle: typeof item.sourceTitle === "string" ? sanitizeProjectTitle(item.sourceTitle) : undefined,

         sourceContent: typeof item.sourceContent === "string" ? sanitizeProjectBody(item.sourceContent) : undefined,

         workingSummary: typeof item.workingSummary === "string" ? sanitizeProjectSummary(item.workingSummary) : undefined,

         cleanSourceContent: typeof item.cleanSourceContent === "string" ? sanitizeProjectBody(item.cleanSourceContent) : undefined,

         status: item.status === "polishing" || item.status === "confirmed" || item.status === "saved-note" || item.status === "sent-task" || item.status === "sent-calendar" || item.status === "canceled" ? item.status : "preview",

         llmPolished: Boolean(item.llmPolished),

         llmPolishConfidence: typeof item.llmPolishConfidence === "number" ? item.llmPolishConfidence : undefined,

         internalNoteResult: item.internalNoteResult,

         createdAt: typeof item.createdAt === "number" ? item.createdAt : getNow(),

         updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : getNow(),
      }));
   } catch {
      localStorage.removeItem(STORAGE_KEY);

      return [];
   }
}

function saveStoredOutputs(items: InternalOutputItem[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function getDestinationLabel(destination: InternalDestination) {
   switch (destination) {
      case "tasks":
         return "Tasks";

      case "calendar":
         return "Calendar";

      case "notes":
         return "Projects";

      default:
         return "ALLEVIN";
   }
}

function getDestinationIcon(destination: InternalDestination) {
   switch (destination) {
      case "tasks":
         return ListChecks;

      case "calendar":
         return CalendarDays;

      case "notes":
         return NotebookPen;

      default:
         return Boxes;
   }
}

function getOutputStatusLabel(status: InternalStatus) {
   switch (status) {
      case "polishing":
         return "Polishing";

      case "confirmed":
         return "Saved";

      case "saved-note":
         return "Saved to Projects";

      case "sent-task":
         return "Sent to Tasks";

      case "sent-calendar":
         return "Sent to Calendar";

      case "canceled":
         return "Dismissed";

      case "preview":
      default:
         return "Preview";
   }
}

function buildTaskPayload(item: InternalOutputItem) {
   return {
      title: sanitizeProjectTitle(item.title),
      description: sanitizeProjectBody(item.body),
      sourceTitle: sanitizeProjectTitle(item.sourceTitle || item.title),
      sourceContent: sanitizeProjectBody(item.sourceContent || item.body),
      workingSummary: sanitizeProjectSummary(item.workingSummary || item.summary || item.body),
      workflowId: item.workflowId,
      originBoardItemId: item.originBoardItemId,
      priority: "medium" as const,
      source: "projects" as const,
   };
}

function buildCalendarPayload(item: InternalOutputItem) {
   const startTime = Date.now() + 24 * 60 * 60000;

   return {
      title: sanitizeProjectTitle(item.title),
      body: sanitizeProjectBody(item.body),
      description: sanitizeProjectSummary(item.summary || item.body),
      startTime,
      endTime: startTime + 60 * 60000,
      location: "ALLEVIN Calendar",
      sourceTitle: sanitizeProjectTitle(item.sourceTitle || item.title),
      sourceContent: sanitizeProjectBody(item.sourceContent || item.body),
      workingSummary: sanitizeProjectSummary(item.workingSummary || item.summary || item.body),
      workflowId: item.workflowId,
      originBoardItemId: item.originBoardItemId,
      priority: "medium" as const,
      projectStage: "scheduled",
      recommendedNextAction: "Use this scheduled block to check the project and capture any useful notes.",
   };
}

function getHandledApprovedIntegrationIds() {
   if (typeof window === "undefined") {
      return [] as string[];
   }

   try {
      const stored = sessionStorage.getItem(APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY);

      const parsed = stored ? JSON.parse(stored) : [];

      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
   } catch {
      return [];
   }
}

function rememberHandledApprovedIntegrationId(id?: string) {
   if (typeof window === "undefined" || !id) {
      return;
   }

   const current = getHandledApprovedIntegrationIds();

   sessionStorage.setItem(APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY, JSON.stringify([id, ...current.filter((item) => item !== id)].slice(0, 60)));
}

function hasHandledApprovedIntegrationId(id?: string) {
   if (!id) {
      return false;
   }

   return getHandledApprovedIntegrationIds().includes(id);
}

function buildOutputFromApprovedInternalIntegration(payload: ApprovedInternalIntegrationPayload): InternalOutputItem {
   const cleanTitle = sanitizeProjectTitle(payload.title) || "ALLEVIN Project";

   const body = sanitizeProjectBody(payload.body || payload.sourceContent || payload.workingSummary || payload.summary || payload.suggestedAction || cleanTitle);

   const summary = sanitizeProjectSummary(payload.summary || getSummaryFromBody(body) || body || cleanTitle);

   return {
      id: payload.id || crypto.randomUUID(),

      destination: "notes",

      objectType: "project-summary",

      title: cleanTitle,

      body: body || cleanTitle,

      rawBody: body || cleanTitle,

      summary,

      suggestedNextStep: sanitizeProjectNextStep(payload.suggestedAction) || "Continue this project in Canvas or schedule the clearest next action.",

      // For approved Canvas → Projects moves, prefer title-based upsert.
      // Using the event id as workflowId creates duplicate project records.
      workflowId: payload.workflowId,

      originBoardItemId: payload.originBoardItemId || payload.originProjectsItemId,

      source: payload.source === "calendar" && payload.target === "projects" ? "calendar-integration" : "internal-integration",

      sourceTitle: cleanTitle,

      sourceContent: sanitizeProjectBody(payload.sourceContent || body),

      workingSummary: sanitizeProjectSummary(payload.workingSummary || summary),

      cleanSourceContent: sanitizeProjectBody(payload.sourceContent || body),

      status: "preview",

      createdAt: payload.createdAt || getNow(),

      updatedAt: getNow(),
   };
}

export default function IntegrationAdapterLayer() {
   const workspace = useWorkspace();

   const [mounted, setMounted] = useState(false);

   const [outputs, setOutputs] = useState<InternalOutputItem[]>([]);

   const [expandedOutputIds, setExpandedOutputIds] = useState<string[]>([]);

   const [manualTitle, setManualTitle] = useState("");

   const [manualBody, setManualBody] = useState("");

   const [manualBuilderOpen, setManualBuilderOpen] = useState(false);

   const [notice, setNotice] = useState("");

   const [activePolishId, setActivePolishId] = useState<string | null>(null);

   const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

   const [projectLibrary, setProjectLibrary] = useState<ProjectLibraryItem[]>([]);

   const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

   const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);

   const [expandedNotePreviewIds, setExpandedNotePreviewIds] = useState<string[]>([]);

   const [projectSuggestions, setProjectSuggestions] = useState<Record<string, string>>({});

   const [projectTrackingMap, setProjectTrackingMap] = useState<Record<string, ProjectTrackingMeta>>({});

   function getShortPreview(value?: string, limit = 180) {
      const cleanValue = compactText(value);

      if (cleanValue.length <= limit) {
         return cleanValue;
      }

      return `${cleanValue.slice(0, limit).trim()}...`;
   }

   function toggleNotePreview(noteId: string) {
      setExpandedNotePreviewIds((current) => (current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId]));
   }

   function getProjectSuggestion(project: ProjectLibraryItem) {
      const existing = projectSuggestions[project.id];

      if (existing) {
         return existing;
      }

      const generated = getGeneratedProjectSuggestion(project);

      setProjectSuggestions((current) => ({
         ...current,
         [project.id]: generated,
      }));

      return generated;
   }

   function refreshProjectSuggestion(project: ProjectLibraryItem) {
      const generated = getGeneratedProjectSuggestion(project);

      setProjectSuggestions((current) => ({
         ...current,
         [project.id]: generated,
      }));
   }

   function getProjectTracking(project: ProjectLibraryItem) {
      const storedTracking = projectTrackingMap[project.id];

      const fallbackTracking = getDefaultProjectTracking(project);

      return {
         ...fallbackTracking,
         ...storedTracking,
         calendarTaskTitle: storedTracking?.calendarTaskTitle || "",
         calendarTaskDate: storedTracking?.calendarTaskDate || "",
         calendarTaskTime: storedTracking?.calendarTaskTime || "",
         calendarTaskDurationMinutes: Number(storedTracking?.calendarTaskDurationMinutes || fallbackTracking.calendarTaskDurationMinutes || 60),
      };
   }

   function updateProjectTracking(project: ProjectLibraryItem, updates: Partial<ProjectTrackingMeta>) {
      const currentTracking = getProjectTracking(project);

      const nextTracking: ProjectTrackingMeta = {
         ...currentTracking,
         ...updates,
         nextStep: sanitizeProjectNextStep(updates.nextStep ?? currentTracking.nextStep),
         calendarTaskTitle: sanitizeProjectTitle(updates.calendarTaskTitle ?? currentTracking.calendarTaskTitle),
         calendarTaskDate: sanitizeProjectPlainText(updates.calendarTaskDate ?? currentTracking.calendarTaskDate, 40),
         calendarTaskTime: sanitizeProjectPlainText(updates.calendarTaskTime ?? currentTracking.calendarTaskTime, 40),
         calendarTaskDurationMinutes: Math.max(15, Math.min(480, Number(updates.calendarTaskDurationMinutes ?? currentTracking.calendarTaskDurationMinutes ?? 60))),
         updatedAt: getNow(),
      };

      const nextMap = {
         ...projectTrackingMap,
         [project.id]: nextTracking,
      };

      setProjectTrackingMap(nextMap);

      saveProjectTrackingMap(nextMap);

      upsertProjectMemory({
         title: project.title,
         body: buildProjectWorkspaceBody(project),
         sourceTitle: project.title,
         sourceContent: buildProjectWorkspaceBody(project),
         workingSummary: project.latestSummary,
         workflowId: project.workflowId,
         originBoardItemId: project.originBoardItemId,
         source: "notes",
         destination: "integrations",
         stage: getProjectMemoryStageFromTrackingStatus(nextTracking.status),
         status: getProjectMemoryStatusFromTrackingStatus(nextTracking.status),
         priority: nextTracking.priority,
         latestMovement: `Projects → ${getProjectStatusLabel(nextTracking.status)}`,
         recommendedNextAction: nextTracking.nextStep || getTrackingGuidance(nextTracking.status),
      });

      window.dispatchEvent(new CustomEvent("allevin-project-memory-update"));

      showNotice("Project tracking updated");
   }

   function notifyAllevin(message: string, detail?: Record<string, unknown>) {
      const safeMessage = sanitizeNoticeText(message);

      window.dispatchEvent(
         new CustomEvent("allevin-chat-notice", {
            detail: {
               message: safeMessage,
               ...detail,
               createdAt: getNow(),
            },
         }),
      );
   }

   function showNotice(message: string) {
      setNotice(sanitizeNoticeText(message));

      window.setTimeout(() => {
         setNotice("");
      }, 1400);
   }

   function syncIntegrationStatus(status: "integration-ready" | "focused-work-active" | "workspace-stable" = "integration-ready") {
      workspace.setSystemStatus(status);

      workspace.registerWorkspaceActivity(status);
   }

   function logWorkflowEvent({
      title,
      summary,
      workflowId,
      originBoardItemId,
      destination = "system",
   }: {
      title: string;

      summary: string;

      workflowId?: string;

      originBoardItemId?: string;

      destination?: string;
   }) {
      window.setTimeout(() => {
         window.dispatchEvent(
            new CustomEvent("allevin-log-workflow-event", {
               detail: {
                  id: crypto.randomUUID(),

                  type: "insight",

                  source: "integrations",

                  destination,

                  title,

                  summary,

                  workflowId,

                  originBoardItemId,

                  createdAt: getNow(),
               },
            }),
         );
      }, 0);
   }

   function commitOutputs(nextOutputs: InternalOutputItem[] | ((current: InternalOutputItem[]) => InternalOutputItem[])) {
      setOutputs((current) => {
         const resolved = typeof nextOutputs === "function" ? nextOutputs(current) : nextOutputs;

         saveStoredOutputs(resolved);

         syncIntegrationStatus(resolved.some((item) => item.status !== "canceled") ? "integration-ready" : "workspace-stable");

         return resolved;
      });
   }

   useEffect(() => {
      setMounted(true);

      // MK III simplified Projects: no confirmation queue.
      // Old queued drafts are cleared so saved work goes directly into Projects.
      localStorage.removeItem(STORAGE_KEY);

      setOutputs([]);

      setProjectLibrary(readProjectLibrary());

      setProjectTrackingMap(getProjectTrackingMap());

      syncIntegrationStatus("workspace-stable");
   }, []);

   useEffect(() => {
      function refreshProjectLibrary() {
         setProjectLibrary(readProjectLibrary());

         setProjectTrackingMap(getProjectTrackingMap());
      }

      window.addEventListener("allevin-project-library-update", refreshProjectLibrary);

      window.addEventListener("storage", refreshProjectLibrary);

      return () => {
         window.removeEventListener("allevin-project-library-update", refreshProjectLibrary);

         window.removeEventListener("storage", refreshProjectLibrary);
      };
   }, []);

   useEffect(() => {
      function handleAddOutput(event: Event) {
         const customEvent = event as CustomEvent<IncomingIntegrationPayload>;

         if (!customEvent.detail?.title && !customEvent.detail?.body) {
            return;
         }

         const output = buildInternalOutputFromPayload({
            ...customEvent.detail,
            destination: "notes",
            objectType: "project-summary",
         });

         void saveOutputToNotes(output);
      }

      window.addEventListener("allevin-prepare-integration", handleAddOutput);

      return () => {
         window.removeEventListener("allevin-prepare-integration", handleAddOutput);
      };
   }, []);

   useEffect(() => {
      function handleApprovedInternalIntegration(event: Event) {
         const customEvent = event as CustomEvent<ApprovedInternalIntegrationPayload>;

         const detail = customEvent.detail;

         if (!detail || detail.target !== "projects") {
            return;
         }

         if (detail.id && hasHandledApprovedIntegrationId(detail.id)) {
            return;
         }

         if (!detail.title && !detail.body && !detail.summary && !detail.sourceContent) {
            return;
         }

         rememberHandledApprovedIntegrationId(detail.id);

         const output = buildOutputFromApprovedInternalIntegration(detail);

         void saveOutputToNotes(output);

         const titleBasedId = getProjectLibraryKey({
            title: output.title,
         });

         setSelectedProjectId(titleBasedId);

         setProjectLibrary(readProjectLibrary());
      }

      window.addEventListener("allevin-internal-integration-suggestion", handleApprovedInternalIntegration);

      return () => {
         window.removeEventListener("allevin-internal-integration-suggestion", handleApprovedInternalIntegration);
      };
   }, []);

   function createManualOutput() {
      const cleanTitle = sanitizeProjectTitle(manualTitle);

      const cleanBody = sanitizeProjectBody(manualBody);

      if (!cleanTitle && !cleanBody) {
         showNotice("Add a title or body");

         return;
      }

      const output = buildInternalOutputFromPayload({
         title: cleanTitle || "Manual ALLEVIN Output",

         body: cleanBody || cleanTitle,

         destination: "notes",

         objectType: "project-summary",

         source: "manual",
      });

      setManualTitle("");

      setManualBody("");

      void saveOutputToNotes(output);
   }

   async function polishOutput(item: InternalOutputItem) {
      try {
         setActivePolishId(item.id);

         commitOutputs((current) =>
            current.map((output) =>
               output.id === item.id
                  ? {
                       ...output,
                       status: "polishing",
                       updatedAt: getNow(),
                    }
                  : output,
            ),
         );

         showNotice("Polishing with ALLEVIN");

         const response = await requestAllevinLLM({
            mode: "export-polish",
            source: "export",
            title: item.title,
            focus: item.rawBody || item.body,
            usefulContext: `Keep this saved with the project.`,
            nextStep: item.suggestedNextStep,
            rawContent: item.rawBody || item.body,
            projectStage: "project",
            currentLocation: "ALLEVIN Projects",
            priority: "medium",
            maxWords: 240,
            userInstruction: "Polish this project note. Keep it clear, simple, and useful. Preserve the actual project substance.",
         });

         const polished = sanitizeProjectBody(response.focus || response.summary || response.nextStep || item.body);

         commitOutputs((current) =>
            current.map((output) =>
               output.id === item.id
                  ? {
                       ...output,
                       body: polished || output.body,
                       summary: getSummaryFromBody(polished || output.body),
                       status: "preview",
                       llmPolished: true,
                       llmPolishConfidence: response.confidence,
                       updatedAt: getNow(),
                    }
                  : output,
            ),
         );

         showNotice(getGeneratedProjectsLine("polished"));
      } catch {
         commitOutputs((current) =>
            current.map((output) =>
               output.id === item.id
                  ? {
                       ...output,
                       status: "preview",
                       updatedAt: getNow(),
                    }
                  : output,
            ),
         );

         showNotice("Polish failed");
      } finally {
         setActivePolishId(null);
      }
   }

   async function saveOutputToNotes(item: InternalOutputItem) {
      try {
         setActiveNoteId(item.id);

         const cleanTitle = saveProjectDirectly(item);

         // No confirmation queue in MK III Projects.
         // If the item came from an old queue, remove it safely.
         commitOutputs((current) => current.filter((output) => output.id !== item.id));

         setExpandedOutputIds((current) => current.filter((outputId) => outputId !== item.id));

         setProjectLibrary(readProjectLibrary());

         showNotice(getGeneratedProjectsLine("saved"));

         if (item.source !== "internal-integration") {
            notifyAllevin(`Saved "${cleanTitle}" to Projects.`, {
               type: "project-saved",
               title: cleanTitle,
               workflowId: item.workflowId,
               originBoardItemId: item.originBoardItemId,
            });
         }
      } catch {
         showNotice("Save failed");
      } finally {
         setActiveNoteId(null);
      }
   }

   function sendOutputToTasks(item: InternalOutputItem) {
      window.dispatchEvent(
         new CustomEvent("allevin-send-to-task", {
            detail: buildTaskPayload(item),
         }),
      );

      commitOutputs((current) =>
         current.map((output) =>
            output.id === item.id
               ? {
                    ...output,
                    destination: "tasks",
                    status: "sent-task",
                    updatedAt: getNow(),
                 }
               : output,
         ),
      );

      logWorkflowEvent({
         title: "Sent to Tasks",
         summary: `Sent to Tasks: ${item.title}`,
         workflowId: item.workflowId,
         originBoardItemId: item.originBoardItemId,
         destination: "task",
      });

      syncIntegrationStatus("focused-work-active");

      showNotice(getGeneratedProjectsLine("tasked"));

      notifyAllevin(`Sent "${item.title}" to Tasks.`, {
         type: "project-sent-to-tasks",
         title: item.title,
         workflowId: item.workflowId,
         originBoardItemId: item.originBoardItemId,
      });
   }

   function sendOutputToCalendar(item: InternalOutputItem) {
      window.dispatchEvent(
         new CustomEvent("allevin-send-to-calendar", {
            detail: buildCalendarPayload(item),
         }),
      );

      commitOutputs((current) =>
         current.map((output) =>
            output.id === item.id
               ? {
                    ...output,
                    destination: "calendar",
                    status: "sent-calendar",
                    updatedAt: getNow(),
                 }
               : output,
         ),
      );

      logWorkflowEvent({
         title: "Project scheduled",
         summary: `Project scheduled: ${item.title}`,
         workflowId: item.workflowId,
         originBoardItemId: item.originBoardItemId,
         destination: "calendar",
      });

      syncIntegrationStatus("focused-work-active");

      showNotice(getGeneratedProjectsLine("scheduled"));

      notifyAllevin(`Scheduled "${item.title}" in Calendar.`, {
         type: "project-scheduled",
         title: item.title,
         workflowId: item.workflowId,
         originBoardItemId: item.originBoardItemId,
      });
   }

   function confirmOutput(item: InternalOutputItem) {
      if (item.destination === "tasks") {
         sendOutputToTasks(item);

         return;
      }

      if (item.destination === "calendar") {
         sendOutputToCalendar(item);

         return;
      }

      if (item.destination === "notes") {
         void saveOutputToNotes(item);

         return;
      }

      commitOutputs((current) =>
         current.map((output) =>
            output.id === item.id
               ? {
                    ...output,
                    status: "confirmed",
                    updatedAt: getNow(),
                 }
               : output,
         ),
      );

      showNotice("Saved");
   }

   function cancelOutput(id: string) {
      commitOutputs((current) =>
         current.map((output) =>
            output.id === id
               ? {
                    ...output,
                    status: "canceled",
                    updatedAt: getNow(),
                 }
               : output,
         ),
      );

      showNotice("Dismissed");
   }

   function removeOutput(id: string) {
      const next = outputs.filter((output) => output.id !== id);

      commitOutputs(next);

      setExpandedOutputIds((current) => current.filter((outputId) => outputId !== id));

      showNotice("Removed");
   }

   function buildProjectWorkspaceBody(project: ProjectLibraryItem) {
      // Treat Projects like reopening a saved document.
      // The full note body is the source of truth; summaries are only previews.
      const latestFullNote = project.notes[0]?.body;

      const bestDocument = chooseLongestProjectDocument(latestFullNote, project.latestSummary);

      return bestDocument || project.title;
   }

   function continueProjectInCanvas(project: ProjectLibraryItem) {
      const body = buildProjectWorkspaceBody(project);

      window.dispatchEvent(
         new CustomEvent("allevin-send-to-canvas", {
            detail: {
               title: sanitizeProjectTitle(project.title),
               body: sanitizeProjectBody(body),
               source: "project",
               sourceTitle: sanitizeProjectTitle(project.title),
               sourceContent: sanitizeProjectBody(body),
               workingSummary: sanitizeProjectSummary(body),
               cleanSourceContent: sanitizeProjectBody(body),
               workflowId: project.workflowId,
               originBoardItemId: project.originBoardItemId,
            },
         }),
      );

      workspace.setActiveView("focus");

      workspace.setSystemStatus("focused-work-active");

      workspace.registerWorkspaceActivity("focused-work-active");

      window.dispatchEvent(
         new CustomEvent("allevin-open-product-module", {
            detail: {
               moduleId: "canvas",
            },
         }),
      );

      showNotice(getGeneratedProjectsLine("opened"));

      notifyAllevin(`Opened "${project.title}" in Canvas.`, {
         type: "project-opened-canvas",
         title: project.title,
         workflowId: project.workflowId,
         originBoardItemId: project.originBoardItemId,
      });
   }

   function sendProjectToTasks(project: ProjectLibraryItem) {
      const body = buildProjectWorkspaceBody(project);

      window.dispatchEvent(
         new CustomEvent("allevin-send-to-task", {
            detail: {
               title: sanitizeProjectTitle(project.title),
               description: sanitizeProjectBody(body),
               sourceTitle: sanitizeProjectTitle(project.title),
               sourceContent: sanitizeProjectBody(body),
               workingSummary: sanitizeProjectSummary(project.latestSummary || body),
               workflowId: project.workflowId,
               originBoardItemId: project.originBoardItemId,
               priority: "medium",
               source: "projects",
            },
         }),
      );

      workspace.setActiveView("workspace");

      workspace.setSystemStatus("focused-work-active");

      workspace.registerWorkspaceActivity("focused-work-active");

      window.dispatchEvent(
         new CustomEvent("allevin-open-product-module", {
            detail: {
               moduleId: "tasks",
            },
         }),
      );

      showNotice(getGeneratedProjectsLine("tasked"));
   }

   function scheduleProjectTime(project: ProjectLibraryItem) {
      const tracking = getProjectTracking(project);

      const taskTitle = sanitizeProjectTitle(tracking.calendarTaskTitle);

      if (!taskTitle) {
         showNotice("Add a calendar task first");

         return;
      }

      if (!tracking.calendarTaskDate || !tracking.calendarTaskTime) {
         showNotice("Add date and time first");

         return;
      }

      const startTime = new Date(`${tracking.calendarTaskDate}T${tracking.calendarTaskTime}`).getTime();

      if (!Number.isFinite(startTime)) {
         showNotice("Check date and time");

         return;
      }

      const durationMinutes = Math.max(15, Number(tracking.calendarTaskDurationMinutes || 60));

      const calendarDescription = sanitizeProjectSummary(taskTitle);

      window.dispatchEvent(
         new CustomEvent("allevin-send-to-calendar", {
            detail: {
               title: sanitizeProjectTitle(`${project.title}: ${taskTitle}`),
               body: calendarDescription,
               description: calendarDescription,
               startTime,
               endTime: startTime + durationMinutes * 60000,
               location: "ALLEVIN Calendar",
               sourceTitle: sanitizeProjectTitle(project.title),
               sourceContent: sanitizeProjectBody(taskTitle),
               workingSummary: sanitizeProjectSummary(taskTitle),
               workflowId: project.workflowId,
               originBoardItemId: project.originBoardItemId,
               priority: tracking.priority,
               projectStage: "scheduled-task",
               recommendedNextAction: taskTitle,
            },
         }),
      );

      updateProjectTracking(project, {
         nextStep: taskTitle,
         calendarTaskTitle: "",
         calendarTaskDate: "",
         calendarTaskTime: "",
         calendarTaskDurationMinutes: 60,
      });

      workspace.setActiveView("workspace");

      workspace.setSystemStatus("schedule-context-active");

      workspace.registerWorkspaceActivity("schedule-context-active");

      window.dispatchEvent(
         new CustomEvent("allevin-open-product-module", {
            detail: {
               moduleId: "calendar",
            },
         }),
      );

      showNotice(getGeneratedProjectsLine("scheduled"));
   }

   function toggleProjectExpanded(id: string) {
      setExpandedProjectIds((current) => (current.includes(id) ? current.filter((projectId) => projectId !== id) : [...current, id]));
   }

   function deleteProject(project: ProjectLibraryItem) {
      const confirmed = window.confirm(`Delete "${project.title}" from Projects?`);

      if (!confirmed) {
         return;
      }

      rememberDeletedProject(project);

      pruneDeletedProjectFromStorage(project);

      deleteProjectMemory({
         workflowId: project.workflowId,
         originBoardItemId: project.originBoardItemId,
         title: project.title,
      });

      const nextProjects = projectLibrary.filter((item) => item.id !== project.id);

      saveProjectLibrary(nextProjects);

      setProjectLibrary(nextProjects);

      setProjectSuggestions((current) => {
         const nextSuggestions = { ...current };

         delete nextSuggestions[project.id];

         return nextSuggestions;
      });

      setProjectTrackingMap((current) => {
         const nextTracking = { ...current };

         delete nextTracking[project.id];

         saveProjectTrackingMap(nextTracking);

         return nextTracking;
      });

      setExpandedProjectIds((current) => current.filter((projectId) => projectId !== project.id));

      setExpandedNotePreviewIds((current) => current.filter((noteId) => !project.notes.some((note) => note.id === noteId)));

      setSelectedProjectId(nextProjects[0]?.id || null);

      window.dispatchEvent(
         new CustomEvent("allevin-project-deleted", {
            detail: {
               id: project.id,
               title: project.title,
               sourceTitle: project.title,
               workflowId: project.workflowId,
               originBoardItemId: project.originBoardItemId,
               deletedAt: getNow(),
            },
         }),
      );

      window.dispatchEvent(
         new CustomEvent("allevin-project-memory-deleted", {
            detail: {
               id: project.id,
               title: project.title,
               sourceTitle: project.title,
               workflowId: project.workflowId,
               originBoardItemId: project.originBoardItemId,
               deletedAt: getNow(),
            },
         }),
      );

      window.dispatchEvent(new CustomEvent("allevin-memory-update"));

      showNotice(getGeneratedProjectsLine("deleted"));

      notifyAllevin(`Deleted "${project.title}" from Projects.`, {
         type: "project-deleted",
         title: project.title,
         workflowId: project.workflowId,
         originBoardItemId: project.originBoardItemId,
      });
   }

   function toggleExpanded(id: string) {
      setExpandedOutputIds((current) => (current.includes(id) ? current.filter((outputId) => outputId !== id) : [...current, id]));
   }

   if (!mounted) {
      return null;
   }

   return (
      <motion.section
         id="integrations"
         layout
         initial={{
            opacity: 0,
            y: 10,
         }}
         animate={{
            opacity: 1,
            y: 0,
         }}
         transition={{
            duration: 0.35,
         }}
         className="
            rounded-[24px]
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            p-4
            shadow-[var(--shadow-soft)]
            sm:p-5
            lg:rounded-[32px]
            lg:p-6
         "
      >
         <div className="mb-5 flex flex-col gap-4 lg:mb-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
               <h2 className="text-2xl sm:text-3xl">Projects</h2>

               <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">Projects is ALLEVIN’s saved-work hub. Saved Canvas work appears here automatically.</p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap xl:items-center xl:gap-3">
               {notice && <div className="w-full rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-center text-sm font-medium text-[var(--color-text-secondary)] xl:w-auto">{notice}</div>}

               <button
                  onClick={() => setManualBuilderOpen((current) => !current)}
                  className="
                     flex
                     w-full
                     items-center
                     justify-center
                     gap-2
                     rounded-2xl
                     border
                     xl:w-auto
                     border-[var(--border-subtle)]
                     bg-white
                     px-5
                     py-3
                     text-sm
                     font-medium
                     transition-colors
                     hover:bg-[var(--color-bg)]
                  "
               >
                  <ChevronDown size={16} className={`transition-transform ${manualBuilderOpen ? "rotate-180" : ""}`} />
                  Add Project
               </button>
            </div>
         </div>

         <AnimatePresence initial={false}>
            {manualBuilderOpen && (
               <motion.div
                  initial={{
                     opacity: 0,
                     height: 0,
                  }}
                  animate={{
                     opacity: 1,
                     height: "auto",
                  }}
                  exit={{
                     opacity: 0,
                     height: 0,
                  }}
                  transition={{
                     duration: 0.2,
                  }}
                  className="mb-5 overflow-hidden lg:mb-6"
               >
                  <div className="rounded-[24px] border border-[var(--border-subtle)] bg-white p-4 sm:p-5 lg:rounded-3xl">
                     <p className="font-medium">Add Project</p>

                     <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Create a project note or draft inside ALLEVIN.</p>

                     <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                        <input
                           value={manualTitle}
                           onChange={(event) => setManualTitle(sanitizeLiveProjectTitle(event.target.value))}
                           placeholder="Project title"
                           className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                        />

                        <button onClick={createManualOutput} className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-medium text-[var(--color-cream)] transition-opacity hover:opacity-90">
                           <Send size={16} />
                           Add Project
                        </button>
                     </div>

                     <textarea
                        value={manualBody}
                        onChange={(event) => setManualBody(sanitizeLiveProjectBody(event.target.value))}
                        placeholder="Write the project note or draft..."
                        className="mt-3 min-h-[120px] w-full resize-none rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--color-primary)]"
                     />
                  </div>
               </motion.div>
            )}
         </AnimatePresence>

         <div className="mb-6 rounded-[24px] border border-[var(--border-subtle)] bg-white p-4 sm:p-5 lg:rounded-[28px]">
            {projectLibrary.length > 0 ? (
               <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
                  <div className="lg:col-span-4">
                     <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                           <p className="text-sm font-medium">Saved Projects</p>

                           <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                              {projectLibrary.length} project{projectLibrary.length === 1 ? "" : "s"} ready
                           </p>
                        </div>
                     </div>

                     <div className="max-h-none space-y-3 lg:max-h-[680px] lg:overflow-y-auto lg:pr-1">
                        {projectLibrary.map((project, index) => {
                           const selected = selectedProjectId ? selectedProjectId === project.id : projectLibrary[0]?.id === project.id;

                           return (
                              <button
                                 key={project.id}
                                 onClick={() => setSelectedProjectId(project.id)}
                                 className={`
                                    group
                                    relative
                                    w-full
                                    overflow-hidden
                                    rounded-[22px]
                                    border
                                    px-4
                                    py-3
                                    sm:py-4
                                    text-left
                                    transition-all

                                    ${selected ? "border-[var(--color-primary)] bg-[var(--color-bg)] shadow-[var(--shadow-soft)]" : "border-[var(--border-subtle)] bg-white hover:border-[var(--color-primary)] hover:bg-[var(--color-bg)]"}
                                 `}
                              >
                                 {selected && <div className="absolute left-0 top-0 h-full w-1 bg-[var(--color-primary)]" />}

                                 <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                       <div className="flex flex-wrap items-center gap-2">
                                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${selected ? "bg-[var(--color-primary)] text-[var(--color-cream)]" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)]"}`}>
                                             {selected ? "Current" : `Project ${index + 1}`}
                                          </span>
                                       </div>

                                       <p className="mt-3 truncate text-base font-semibold">{project.title}</p>
                                    </div>

                                    <ChevronDown size={16} className={`mt-1 shrink-0 text-[var(--color-text-secondary)] transition-transform ${selected ? "-rotate-90 text-[var(--color-primary)]" : "opacity-50 group-hover:opacity-100"}`} />
                                 </div>

                                 <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--color-text-secondary)]">{getShortPreview(project.latestSummary, 120)}</p>

                                 <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                                    <span className="text-xs text-[var(--color-text-secondary)]">{getReadableProjectDate(project.updatedAt)}</span>

                                    <span className={`text-xs font-medium ${selected ? "text-[var(--color-primary)]" : "text-[var(--color-text-secondary)]"}`}>{selected ? "Open" : "Select"}</span>
                                 </div>
                              </button>
                           );
                        })}
                     </div>
                  </div>

                  <div className="lg:col-span-8">
                     {(() => {
                        const activeProject = projectLibrary.find((project) => project.id === selectedProjectId) || projectLibrary[0];

                        if (!activeProject) {
                           return null;
                        }

                        const expanded = expandedProjectIds.includes(activeProject.id);

                        const projectTracking = getProjectTracking(activeProject);

                        return (
                           <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--color-bg)] p-4 sm:p-5 xl:rounded-[28px] xl:p-6">
                              <div className="mb-5 flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-5 xl:flex-row xl:items-start xl:justify-between">
                                 <div className="min-w-0">
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                       <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-[var(--color-cream)]">Current Project</span>

                                       <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">Updated {getReadableProjectDate(activeProject.updatedAt)}</span>

                                       <label className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                                          <span>Status</span>

                                          <select
                                             value={projectTracking.status}
                                             onChange={(event) =>
                                                updateProjectTracking(activeProject, {
                                                   status: event.target.value as ProjectTrackingStatus,
                                                })
                                             }
                                             className="bg-transparent text-xs font-semibold outline-none"
                                          >
                                             <option value="idea">Drafting</option>
                                             <option value="active">In Progress</option>
                                             <option value="check">Check</option>
                                             <option value="done">Done</option>
                                          </select>
                                       </label>

                                       <span className="rounded-full bg-white px-3 py-1 text-xs font-medium capitalize text-[var(--color-text-secondary)]">{projectTracking.priority} priority</span>
                                    </div>

                                    <h3 className="text-xl leading-tight sm:text-2xl">{activeProject.title}</h3>

                                    <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-text-secondary)]">{expanded ? activeProject.latestSummary : getShortPreview(activeProject.latestSummary, 260)}</p>

                                    {compactText(activeProject.latestSummary).length > 260 && (
                                       <button onClick={() => toggleProjectExpanded(activeProject.id)} className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-surface)]">
                                          {expanded ? "Show less" : "Read more"}
                                       </button>
                                    )}
                                 </div>

                                 <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:min-w-[220px] xl:grid-cols-1">
                                    <button onClick={() => continueProjectInCanvas(activeProject)} className="rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-medium text-[var(--color-cream)] transition-opacity hover:opacity-90">
                                       Continue in Canvas
                                    </button>

                                    <button
                                       onClick={() => deleteProject(activeProject)}
                                       className="rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
                                    >
                                       Delete
                                    </button>
                                 </div>
                              </div>

                              <div className="mb-4 rounded-2xl bg-white p-4">
                                 <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                    <div>
                                       <div className="flex items-center gap-2">
                                          <FolderKanban size={18} />

                                          <p className="font-medium">Project Tracking</p>
                                       </div>

                                       <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Keep priority and calendar task scheduling with the project itself.</p>
                                    </div>
                                 </div>

                                 <div className="grid grid-cols-1 gap-3">
                                    <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                       <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                                          <Flag size={14} />
                                          Priority
                                       </div>

                                       <select
                                          value={projectTracking.priority}
                                          onChange={(event) =>
                                             updateProjectTracking(activeProject, {
                                                priority: event.target.value as ProjectTrackingMeta["priority"],
                                             })
                                          }
                                          className="mt-2 w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm capitalize outline-none focus:border-[var(--color-primary)]"
                                       >
                                          <option value="low">Low</option>
                                          <option value="medium">Medium</option>
                                          <option value="high">High</option>
                                       </select>
                                    </div>
                                 </div>

                                 <div className="mt-3 rounded-2xl bg-[var(--color-bg)] p-4">
                                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                       <div>
                                          <p className="text-sm font-medium">Schedule a task</p>

                                          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">Create one calendar task from this project.</p>
                                       </div>

                                       <button onClick={() => scheduleProjectTime(activeProject)} className="w-full rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-surface)] md:w-auto">
                                          Add to Calendar
                                       </button>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_150px_130px_140px]">
                                       <input
                                          value={projectTracking.calendarTaskTitle}
                                          onChange={(event) =>
                                             updateProjectTracking(activeProject, {
                                                calendarTaskTitle: event.target.value,
                                             })
                                          }
                                          placeholder="Create a calendar task..."
                                          className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                       />

                                       <input
                                          type="date"
                                          value={projectTracking.calendarTaskDate}
                                          onChange={(event) =>
                                             updateProjectTracking(activeProject, {
                                                calendarTaskDate: event.target.value,
                                             })
                                          }
                                          className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                       />

                                       <input
                                          type="time"
                                          value={projectTracking.calendarTaskTime}
                                          onChange={(event) =>
                                             updateProjectTracking(activeProject, {
                                                calendarTaskTime: event.target.value,
                                             })
                                          }
                                          className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                       />

                                       <select
                                          value={projectTracking.calendarTaskDurationMinutes}
                                          onChange={(event) =>
                                             updateProjectTracking(activeProject, {
                                                calendarTaskDurationMinutes: Number(event.target.value),
                                             })
                                          }
                                          className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                                       >
                                          <option value={15}>15 min</option>
                                          <option value={30}>30 min</option>
                                          <option value={45}>45 min</option>
                                          <option value={60}>1 hour</option>
                                          <option value={90}>1.5 hours</option>
                                          <option value={120}>2 hours</option>
                                       </select>
                                    </div>
                                 </div>
                              </div>

                              <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                                 <div className="rounded-2xl bg-white p-4 xl:col-span-3">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                       <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">ALLEVIN Suggestion</p>

                                       <button
                                          onClick={() => refreshProjectSuggestion(activeProject)}
                                          className="rounded-xl bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
                                       >
                                          New idea
                                       </button>
                                    </div>

                                    <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">{getProjectSuggestion(activeProject)}</p>
                                 </div>

                                 <div className="rounded-2xl bg-white p-4 xl:col-span-2">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                       <div>
                                          <p className="font-medium">Latest saved note</p>

                                          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Projects keeps the latest useful update here.</p>
                                       </div>

                                       <button onClick={() => toggleProjectExpanded(activeProject.id)} className="rounded-xl bg-[var(--color-bg)] px-3 py-2 text-sm font-medium">
                                          {expanded ? "Hide" : "Show"}
                                       </button>
                                    </div>

                                    {activeProject.notes[0] && (
                                       <div className="mt-4 rounded-xl bg-[var(--color-bg)] p-4">
                                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Latest Note</p>

                                          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{getShortPreview(activeProject.notes[0].summary || activeProject.notes[0].body, 160)}</p>
                                       </div>
                                    )}
                                 </div>
                              </div>

                              <AnimatePresence initial={false}>
                                 {expanded && (
                                    <motion.div
                                       initial={{
                                          opacity: 0,
                                          height: 0,
                                       }}
                                       animate={{
                                          opacity: 1,
                                          height: "auto",
                                       }}
                                       exit={{
                                          opacity: 0,
                                          height: 0,
                                       }}
                                       transition={{
                                          duration: 0.2,
                                       }}
                                       className="overflow-hidden"
                                    >
                                       <div className="mt-4 space-y-3">
                                          {activeProject.notes.map((note) => (
                                             <div key={note.id} className="rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                   <div className="min-w-0">
                                                      <p className="text-sm font-medium">{note.title}</p>

                                                      <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{expandedNotePreviewIds.includes(note.id) ? note.body || note.summary : getShortPreview(note.summary || note.body, 180)}</p>
                                                   </div>

                                                   {compactText(note.body || note.summary).length > 180 && (
                                                      <button onClick={() => toggleNotePreview(note.id)} className="w-full shrink-0 rounded-xl bg-[var(--color-bg)] px-3 py-2 text-xs font-medium sm:w-auto">
                                                         {expandedNotePreviewIds.includes(note.id) ? "Less" : "Read more"}
                                                      </button>
                                                   )}
                                                </div>
                                             </div>
                                          ))}
                                       </div>
                                    </motion.div>
                                 )}
                              </AnimatePresence>
                           </div>
                        );
                     })()}
                  </div>
               </div>
            ) : (
               <div className="rounded-2xl bg-[var(--color-bg)] p-4 text-sm leading-6 text-[var(--color-text-secondary)] sm:p-5">No projects yet. Save work from Canvas and it will appear here.</div>
            )}
         </div>

         {/* MK III simplified Projects: no confirmation queue. */}
      </motion.section>
   );
}
