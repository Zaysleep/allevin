"use client";

import { useEffect, useRef, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { ShieldCheck, CheckCircle2, XCircle, Pencil, Trash2, Send, FileText, ListChecks, LayoutDashboard, CalendarDays, ChevronDown, Clock3, Sparkles, Search, WandSparkles } from "lucide-react";

import { getActiveThreadMemoryV2, updateThreadMemoryFromWorkflowEvents, type ThreadMemoryObject, type ThreadMemoryState } from "@/components/MemoryEngine";

import { useWorkspace } from "@/components/WorkspaceContext";

// ========================================
// ALLEVIN Workflow Action Confirmation MK II Finale
// Purpose:
// Clear approval center before major routing.
// MK II Focus:
// Keep users in control with simple, readable prepared actions and live workspace status.
// ALLEVIN prepares actions first, then waits for approval.
// ========================================

type WorkflowActionType = "send-to-canvas" | "send-to-task" | "send-to-board" | "send-to-calendar" | "prepare-integration" | "save-internal-note" | "custom";

type WorkflowDestination = "canvas" | "task" | "board" | "calendar" | "notes" | "integration" | "system";

type WorkflowActionSource = "canvas" | "task" | "board" | "thread-recovery" | "integration" | "system" | "manual";

interface WorkflowActionPayload {
   id?: string;

   actionType: WorkflowActionType;

   source: WorkflowActionSource;

   destination: WorkflowDestination;

   title: string;

   body: string;

   reason?: string;

   workflowId?: string;

   originBoardItemId?: string;

   priority?: "low" | "medium" | "high";

   objectType?: "canvas-draft" | "research-note" | "project-summary" | "task-action" | "workflow-review" | "calendar-event";

   integrationDestination?: "notes" | "notes" | "calendar" | "tasks" | "internal storage";

   originalEventName?: string;

   metadata?: Record<string, unknown>;

   createdAt?: number;
}

interface PendingWorkflowAction extends WorkflowActionPayload {
   id: string;

   createdAt: number;

   status: "pending" | "editing";
}

interface ThreadSnapshotVersion {
   id: string;

   threadId: string;

   title: string;

   snapshot: string;

   createdAt: number;

   updatedAt: number;
}

type ParsedCommandAction = "resume" | "task" | "export" | "unknown";

interface CommandMatchResult {
   action: ParsedCommandAction;

   thread?: ThreadMemoryObject;

   query: string;

   confidence: number;

   reason: string;
}

// ========================================
// Storage Keys
// ========================================

const THREAD_SNAPSHOTS_STORAGE_KEY = "allevin-thread-recovery-snapshot-history";

const WORKFLOW_CONTROL_PENDING_STORAGE_KEY = "allevin-workflow-control-pending-actions";

const WORKFLOW_CONTROL_UPDATE_EVENT = "allevin-workflow-control-update";

const WORKFLOW_CONTROL_REQUEST_STATE_EVENT = "allevin-workflow-control-request-state";

const WORKFLOW_CONTROL_APPROVE_EVENT = "allevin-workflow-control-approve-action";

const CALENDAR_EVENTS_STORAGE_KEY = "allevin-calendar-events-mki";

const CALENDAR_EVENTS_UPDATED_EVENT = "allevin-calendar-events-updated";

function getDefaultCalendarStartTime() {
   const date = new Date();
   date.setDate(date.getDate() + 1);
   date.setHours(11, 0, 0, 0);
   return date.getTime();
}

function getCalendarEndTime(startTime: number, metadata?: Record<string, unknown>) {
   const metadataEndTime = typeof metadata?.endTime === "number" ? metadata.endTime : typeof metadata?.calendarEventEndTime === "number" ? metadata.calendarEventEndTime : undefined;
   return metadataEndTime && metadataEndTime > startTime ? metadataEndTime : startTime + 45 * 60000;
}

function getStoredCalendarEvents(): any[] {
   if (typeof window === "undefined") return [];

   const stored = localStorage.getItem(CALENDAR_EVENTS_STORAGE_KEY);

   if (!stored) return [];

   try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
   } catch {
      localStorage.removeItem(CALENDAR_EVENTS_STORAGE_KEY);
      return [];
   }
}

function saveCalendarEventFromApprovedAction(action: PendingWorkflowAction, detail: ReturnType<typeof buildApprovedEventDetail>) {
   if (typeof window === "undefined") return;

   const metadata = action.metadata || {};
   const startTime = typeof metadata.startTime === "number" ? metadata.startTime : typeof metadata.calendarEventStartTime === "number" ? metadata.calendarEventStartTime : getDefaultCalendarStartTime();
   const endTime = getCalendarEndTime(startTime, metadata);
   const title = action.title || "ALLEVIN Calendar Event";
   const workflowId =
      action.workflowId ||
      `calendar-${title
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, "-")
         .replace(/^-+|-+$/g, "")
         .slice(0, 80)}`;

   const nextEvent = {
      id: crypto.randomUUID(),
      title,
      startTime,
      endTime,
      location: typeof metadata.location === "string" ? metadata.location : "ALLEVIN Calendar",
      description: action.body || "Calendar event created from ALLEVIN workflow context.",
      source: "local",
      status: "upcoming",
      createdAt: Date.now(),
      sourceTitle: detail.sourceTitle || title,
      sourceContent: detail.sourceContent || action.body,
      workingSummary: detail.workingSummary || action.body,
      workflowId,
      originBoardItemId: action.originBoardItemId || workflowId,
      priority: action.priority || "medium",
      projectStage: "scheduled",
      latestMovement: "Workflow Control → Calendar",
      recommendedNextAction: "Use this scheduled block to review the project, capture notes, or create a follow-up task.",
   };

   const filteredEvents = getStoredCalendarEvents().filter((event) => {
      const sameWorkflow = workflowId && event.workflowId === workflowId;
      const sameTitle = typeof event.title === "string" && event.title.toLowerCase() === title.toLowerCase();
      return !(sameWorkflow || sameTitle);
   });

   const nextEvents = [nextEvent, ...filteredEvents].sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0)).slice(0, 80);

   localStorage.setItem(CALENDAR_EVENTS_STORAGE_KEY, JSON.stringify(nextEvents));

   window.dispatchEvent(
      new CustomEvent(CALENDAR_EVENTS_UPDATED_EVENT, {
         detail: { event: nextEvent, events: nextEvents },
      }),
   );
}

const WORKFLOW_CONTROL_CANCEL_EVENT = "allevin-workflow-control-cancel-action";

// ========================================
// Helpers
// ========================================

function getActionId() {
   return crypto.randomUUID();
}

function getInitialAction(payload: WorkflowActionPayload): PendingWorkflowAction {
   return {
      ...payload,

      id: payload.id || getActionId(),

      createdAt: payload.createdAt || Date.now(),

      status: "pending",
   };
}

function sanitizePendingAction(action: any): PendingWorkflowAction | null {
   if (!action || typeof action !== "object") {
      return null;
   }

   if (typeof action.actionType !== "string" || typeof action.destination !== "string" || typeof action.title !== "string") {
      return null;
   }

   return {
      ...action,

      id: typeof action.id === "string" ? action.id : getActionId(),

      title: action.title,

      body: typeof action.body === "string" ? action.body : "",

      createdAt: typeof action.createdAt === "number" ? action.createdAt : Date.now(),

      status: action.status === "editing" ? "editing" : "pending",
   };
}

function getStoredPendingActions(): PendingWorkflowAction[] {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(WORKFLOW_CONTROL_PENDING_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return [];
      }

      return parsed.map(sanitizePendingAction).filter(Boolean).slice(0, 20) as PendingWorkflowAction[];
   } catch {
      localStorage.removeItem(WORKFLOW_CONTROL_PENDING_STORAGE_KEY);

      return [];
   }
}

function saveStoredPendingActions(actions: PendingWorkflowAction[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(WORKFLOW_CONTROL_PENDING_STORAGE_KEY, JSON.stringify(actions.slice(0, 20)));
}

function broadcastPendingActions(actions: PendingWorkflowAction[]) {
   if (typeof window === "undefined") {
      return;
   }

   window.dispatchEvent(
      new CustomEvent(WORKFLOW_CONTROL_UPDATE_EVENT, {
         detail: {
            pendingActions: actions,

            count: actions.length,

            updatedAt: Date.now(),
         },
      }),
   );
}

function compactText(value?: string) {
   return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value?: string) {
   return compactText(value).toLowerCase();
}

function getDestinationLabel(destination: WorkflowDestination) {
   switch (destination) {
      case "canvas":
         return "Canvas";

      case "task":
         return "Tasks";

      case "board":
         return "Board";

      case "calendar":
         return "Calendar";

      case "notes":
         return "Internal Notes";

      case "integration":
         return "Integrations";

      default:
         return "System";
   }
}

function getSourceLabel(source: WorkflowActionSource) {
   switch (source) {
      case "canvas":
         return "Canvas";

      case "task":
         return "Tasks";

      case "board":
         return "Board";

      case "thread-recovery":
         return "Thread Recovery";

      case "integration":
         return "Integrations";

      case "manual":
         return "Manual Command";

      default:
         return "System";
   }
}

function getActionLabel(actionType: WorkflowActionType) {
   switch (actionType) {
      case "send-to-canvas":
         return "Resume in Canvas";

      case "send-to-task":
         return "Create Task";

      case "send-to-board":
         return "Send to Board";

      case "send-to-calendar":
         return "Prepare Calendar";

      case "prepare-integration":
         return "Prepare Export";

      case "save-internal-note":
         return "Save Internal Note";

      default:
         return "Workflow Action";
   }
}

function getPreparedActionDescription(action: PendingWorkflowAction) {
   switch (action.actionType) {
      case "send-to-canvas":
         return "ALLEVIN prepared this work to open in Canvas after you approve.";

      case "send-to-task":
         return "ALLEVIN prepared this work as a task after you approve.";

      case "send-to-board":
         return "ALLEVIN prepared this work to move to the Project Board after you approve.";

      case "send-to-calendar":
         return "ALLEVIN prepared this work as a Calendar event after you approve.";

      case "prepare-integration":
         return "ALLEVIN prepared this work for export after you approve.";

      case "save-internal-note":
         return "ALLEVIN prepared a Internal Note creation action after you approve.";

      default:
         return "ALLEVIN prepared a workflow action and is waiting for your approval.";
   }
}

function getApprovalOutcome(action: PendingWorkflowAction) {
   switch (action.actionType) {
      case "send-to-canvas":
         return "Approve opens this in Canvas.";

      case "send-to-task":
         return "Approve creates this in Tasks.";

      case "send-to-board":
         return "Approve sends this to Project Board.";

      case "send-to-calendar":
         return "Approve creates this in Calendar.";

      case "prepare-integration":
         return "Approve sends this to Integrations for export review.";

      case "save-internal-note":
         return "Approve saves this inside ALLEVIN.";

      default:
         return "Approve runs the prepared action.";
   }
}

function getActionPlainLanguage(action: PendingWorkflowAction) {
   return `${getActionLabel(action.actionType)} from ${getSourceLabel(action.source)} to ${getDestinationLabel(action.destination)}`;
}

function getActionIcon(actionType: WorkflowActionType) {
   switch (actionType) {
      case "send-to-task":
         return ListChecks;

      case "send-to-board":
         return LayoutDashboard;

      case "send-to-calendar":
         return CalendarDays;

      case "prepare-integration":
      case "save-internal-note":
         return FileText;

      case "send-to-canvas":
      default:
         return Send;
   }
}

function getTimeLabel(timestamp: number) {
   return new Date(timestamp).toLocaleString([], {
      month: "short",

      day: "numeric",

      hour: "numeric",

      minute: "2-digit",
   });
}

function buildApprovedEventDetail(action: PendingWorkflowAction) {
   return {
      title: action.title,

      body: action.body,

      description: action.body,

      sourceTitle: typeof action.metadata?.sourceTitle === "string" ? action.metadata.sourceTitle : action.title,

      sourceContent: typeof action.metadata?.sourceContent === "string" ? action.metadata.sourceContent : action.body,

      workingSummary: typeof action.metadata?.workingSummary === "string" ? action.metadata.workingSummary : action.body,

      cleanSourceContent: typeof action.metadata?.cleanSourceContent === "string" ? action.metadata.cleanSourceContent : action.body,

      workflowId: action.workflowId,

      originBoardItemId: action.originBoardItemId,

      priority: action.priority || "medium",

      source: action.source,

      destination: action.integrationDestination || action.destination,

      objectType: action.objectType || "project-summary",

      metadata: action.metadata,
   };
}

function getDispatchEventName(action: PendingWorkflowAction) {
   if (action.originalEventName) {
      return action.originalEventName;
   }

   switch (action.actionType) {
      case "send-to-canvas":
         return "allevin-send-to-canvas";

      case "send-to-task":
         return "allevin-send-to-task";

      case "send-to-board":
         return "allevin-send-to-board";

      case "send-to-calendar":
         return "allevin-send-to-calendar";

      case "prepare-integration":
      case "save-internal-note":
         return "allevin-prepare-integration";

      default:
         return "allevin-log-workflow-event";
   }
}

function getStoredThreadSnapshots(): ThreadSnapshotVersion[] {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(THREAD_SNAPSHOTS_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return [];
      }

      return parsed
         .filter((snapshot) => snapshot && typeof snapshot.threadId === "string" && typeof snapshot.snapshot === "string")
         .map((snapshot) => {
            const createdAt = typeof snapshot.createdAt === "number" ? snapshot.createdAt : typeof snapshot.updatedAt === "number" ? snapshot.updatedAt : Date.now();

            const updatedAt = typeof snapshot.updatedAt === "number" ? snapshot.updatedAt : createdAt;

            return {
               id: typeof snapshot.id === "string" ? snapshot.id : crypto.randomUUID(),

               threadId: snapshot.threadId,

               title: typeof snapshot.title === "string" ? snapshot.title : "Thread Snapshot",

               snapshot: snapshot.snapshot,

               createdAt,

               updatedAt,
            };
         });
   } catch {
      localStorage.removeItem(THREAD_SNAPSHOTS_STORAGE_KEY);

      return [];
   }
}

function getSnapshotsForThread(threadId?: string) {
   if (!threadId) {
      return [];
   }

   return getStoredThreadSnapshots()
      .filter((snapshot) => snapshot.threadId === threadId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
}

function getLatestSnapshotText(thread?: ThreadMemoryObject) {
   const latestSnapshot = getSnapshotsForThread(thread?.workflowId)[0];

   return latestSnapshot?.snapshot || "";
}

function getThreadSourceContent(thread?: ThreadMemoryObject) {
   return thread?.cleanSourceContent || thread?.workingSummary || thread?.title || "No recoverable source content found.";
}

function getThreadWorkingSummary(thread?: ThreadMemoryObject) {
   return thread?.workingSummary || getThreadSourceContent(thread);
}

function getThreadRecommendedMove(thread?: ThreadMemoryObject) {
   return thread?.recommendedNextAction || "Review this recovered project and choose the next useful action.";
}

function getThreadTitle(thread?: ThreadMemoryObject) {
   return thread?.title || "Untitled ALLEVIN Thread";
}

function getMergedUniqueThreads(memory: ThreadMemoryState) {
   const mergedThreads = [...(memory.activeThread ? [memory.activeThread] : []), ...memory.threads];

   return Array.from(new Map(mergedThreads.filter((thread) => thread?.workflowId).map((thread) => [thread.workflowId, thread])).values());
}

function isWeakRecoveryThread(thread?: ThreadMemoryObject) {
   if (!thread) return true;

   const title = normalizeText(thread.title);

   const source = normalizeText(thread.cleanSourceContent || thread.workingSummary || "");

   if (!title) return true;

   const weakTitles = [
      "active allevin thread",
      "active thread",
      "task created",
      "task generated from canvas",
      "task routed to board",
      "task sent to board",
      "workflow signal",
      "workflow review",
      "workflow review prepared",
      "project work item",
      "board item completed",
      "content sent to canvas",
      "canvas handoff detected",
      "active thread prepared for canvas",
      "thread resumed in canvas",
      "thread recovery task created",
      "thread prepared for export",
      "thread paused",
      "thread restored",
      "thread snapshot saved",
      "thread snapshot version saved",
      "thread snapshot version selected",
      "thread recovery reset",
      "approved: resume in canvas",
      "approved: create task",
      "approved: prepare export",
      "canceled: resume in canvas",
      "canceled: create task",
      "canceled: prepare export",
      "internal notes export confirmed",
      "internal notes live export completed",
      "internal note saved",
   ];

   const weakFragments = [
      "task created",
      "task routed",
      "task generated",
      "workflow signal",
      "workflow review",
      "prepared for canvas",
      "sent to canvas",
      "sent to board",
      "internal notes export",
      "internal note",
      "thread paused",
      "thread restored",
      "snapshot saved",
      "snapshot version",
      "recovery reset",
      "approved:",
      "canceled:",
   ];

   if (weakTitles.includes(title)) return true;

   if (weakFragments.some((fragment) => title.includes(fragment))) {
      return true;
   }

   if (!source || source.length < 12) {
      return true;
   }

   return false;
}

function getSearchableThreads() {
   updateThreadMemoryFromWorkflowEvents();

   const memory = getActiveThreadMemoryV2();

   return getMergedUniqueThreads(memory)
      .filter((thread) => !isWeakRecoveryThread(thread))
      .sort((a, b) => b.updatedAt - a.updatedAt);
}

function detectCommandAction(command: string): ParsedCommandAction {
   const cleanCommand = normalizeText(command);

   if (cleanCommand.includes("export") || cleanCommand.includes("internal note") || cleanCommand.includes("internal notes") || cleanCommand.includes("save to notes") || cleanCommand.includes("send to notes")) {
      return "export";
   }

   if (cleanCommand.includes("task") || cleanCommand.includes("todo") || cleanCommand.includes("to-do") || cleanCommand.includes("action item") || cleanCommand.includes("create action")) {
      return "task";
   }

   if (cleanCommand.includes("resume") || cleanCommand.includes("continue") || cleanCommand.includes("open") || cleanCommand.includes("pull") || cleanCommand.includes("canvas") || cleanCommand.includes("bring up")) {
      return "resume";
   }

   return "unknown";
}

function getCommandSearchQuery(command: string) {
   return normalizeText(command)
      .replace(/\b(export|send|to|resume|continue|open|pull|bring|up|canvas|task|todo|to-do|create|action|item|from|the|latest|newest|project|thread|notes|note)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function scoreThreadMatch(thread: ThreadMemoryObject, query: string) {
   const cleanQuery = normalizeText(query);

   if (!cleanQuery) {
      return 0;
   }

   const title = normalizeText(thread.title);

   const source = normalizeText(`${thread.cleanSourceContent || ""} ${thread.workingSummary || ""}`);

   const latestSnapshot = normalizeText(getLatestSnapshotText(thread));

   const haystack = `${title} ${source} ${latestSnapshot}`;

   let score = 0;

   if (title === cleanQuery) score += 100;

   if (title.includes(cleanQuery)) score += 70;

   if (haystack.includes(cleanQuery)) score += 45;

   const queryTerms = cleanQuery
      .split(" ")
      .map((term) => term.trim())
      .filter((term) => term.length >= 3);

   for (const term of queryTerms) {
      if (title.includes(term)) score += 12;

      if (source.includes(term)) score += 6;

      if (latestSnapshot.includes(term)) score += 8;
   }

   return score;
}

function findBestThreadMatch(command: string): CommandMatchResult {
   const action = detectCommandAction(command);

   const query = getCommandSearchQuery(command);

   const threads = getSearchableThreads();

   const rankedThreads = threads
      .map((thread) => ({
         thread,

         score: scoreThreadMatch(thread, query),
      }))
      .sort((a, b) => b.score - a.score);

   const bestMatch = rankedThreads[0];

   if (!threads.length) {
      return {
         action,

         query,

         confidence: 0,

         reason: "No recoverable threads were found. Create or recover a thread first.",
      };
   }

   if (!bestMatch || bestMatch.score <= 0) {
      return {
         action,

         query,

         confidence: 20,

         reason: "No strong project match was found. Try using a clearer project title or keyword.",
      };
   }

   return {
      action,

      thread: bestMatch.thread,

      query,

      confidence: Math.min(95, Math.max(35, bestMatch.score)),

      reason: `Matched "${getThreadTitle(bestMatch.thread)}" from Thread Memory.`,
   };
}

function buildWorkflowActionFromCommand(command: string): {
   action?: WorkflowActionPayload;

   result: CommandMatchResult;
} {
   const result = findBestThreadMatch(command);

   const thread = result.thread;

   if (!thread) {
      return { result };
   }

   if (result.action === "unknown") {
      return {
         result: {
            ...result,

            reason: "I found a matching thread, but I could not tell whether you wanted to resume, task, or export it.",
         },
      };
   }

   const latestSnapshot = getLatestSnapshotText(thread);

   const cleanSource = latestSnapshot || getThreadSourceContent(thread);

   const threadTitle = getThreadTitle(thread);

   const sharedMetadata = {
      sourceTitle: threadTitle,

      sourceContent: cleanSource,

      workingSummary: getThreadWorkingSummary(thread),

      cleanSourceContent: cleanSource,

      command,

      commandQuery: result.query,

      commandConfidence: result.confidence,
   };

   if (result.action === "export") {
      return {
         result,

         action: {
            actionType: "prepare-integration",

            source: "manual",

            destination: "integration",

            integrationDestination: "notes",

            objectType: "project-summary",

            title: threadTitle,

            body: cleanSource,

            reason: `Command matched this thread for Internal Notes. ${result.reason}`,

            workflowId: thread.workflowId,

            originBoardItemId: thread.originBoardItemId,

            metadata: sharedMetadata,

            createdAt: Date.now(),
         },
      };
   }

   if (result.action === "task") {
      const taskBody = `
ALLEVIN Command Task

Thread:
${threadTitle}

Selected Context:
${cleanSource}

Recommended Move:
${getThreadRecommendedMove(thread)}
      `.trim();

      return {
         result,

         action: {
            actionType: "send-to-task",

            source: "manual",

            destination: "task",

            objectType: "task-action",

            title: threadTitle,

            body: taskBody,

            reason: `Command matched this thread for task creation. ${result.reason}`,

            workflowId: thread.workflowId,

            originBoardItemId: thread.originBoardItemId,

            priority: "medium",

            metadata: sharedMetadata,

            createdAt: Date.now(),
         },
      };
   }

   const resumeBody = `
Focus:
${cleanSource}

Next Step:
${getThreadRecommendedMove(thread)}
   `.trim();

   return {
      result,

      action: {
         actionType: "send-to-canvas",

         source: "manual",

         destination: "canvas",

         objectType: "canvas-draft",

         title: threadTitle,

         body: resumeBody,

         reason: `Command matched this thread to resume in Canvas. ${result.reason}`,

         workflowId: thread.workflowId,

         originBoardItemId: thread.originBoardItemId,

         metadata: sharedMetadata,

         createdAt: Date.now(),
      },
   };
}

// ========================================
// Component
// ========================================

export default function WorkflowActionConfirmation() {
   const workspace = useWorkspace();

   const [mounted, setMounted] = useState(false);

   const [pendingActions, setPendingActions] = useState<PendingWorkflowAction[]>([]);

   const pendingActionsRef = useRef<PendingWorkflowAction[]>([]);

   const [panelOpen, setPanelOpen] = useState(true);

   const [commandInput, setCommandInput] = useState("");

   const [commandOpen, setCommandOpen] = useState(false);

   const [commandResult, setCommandResult] = useState("");

   const [notice, setNotice] = useState("");

   // ========================================
   // Mount / Listener
   // ========================================

   useEffect(() => {
      setMounted(true);

      const storedActions = getStoredPendingActions();

      pendingActionsRef.current = storedActions;

      setPendingActions(storedActions);

      window.setTimeout(() => {
         broadcastPendingActions(storedActions);

         syncWorkflowControlStatus(storedActions.length);
      }, 0);

      function handleWorkflowActionRequest(event: Event) {
         const customEvent = event as CustomEvent<WorkflowActionPayload>;

         if (!customEvent.detail) {
            return;
         }

         addPendingAction(customEvent.detail);
      }

      function handleWorkflowCommand(event: Event) {
         const customEvent = event as CustomEvent<{
            command?: string;
         }>;

         const command = customEvent.detail?.command || "";

         if (!command.trim()) {
            return;
         }

         queueCommandAction(command);
      }

      function handleWorkflowControlRequestState() {
         broadcastPendingActions(pendingActionsRef.current);
      }

      function handleWorkflowControlApprove(event: Event) {
         const customEvent = event as CustomEvent<{
            actionId?: string;
         }>;

         const actionId = customEvent.detail?.actionId;

         const action = pendingActionsRef.current.find((candidate) => candidate.id === actionId);

         if (!action) {
            showNotice("Action not found");

            return;
         }

         approveAction(action);
      }

      function handleWorkflowControlCancel(event: Event) {
         const customEvent = event as CustomEvent<{
            actionId?: string;
         }>;

         const actionId = customEvent.detail?.actionId;

         const action = pendingActionsRef.current.find((candidate) => candidate.id === actionId);

         if (!action) {
            showNotice("Action not found");

            return;
         }

         cancelAction(action);
      }

      window.addEventListener("allevin-request-workflow-action", handleWorkflowActionRequest);

      window.addEventListener("allevin-command-workflow-action", handleWorkflowCommand);

      window.addEventListener(WORKFLOW_CONTROL_REQUEST_STATE_EVENT, handleWorkflowControlRequestState);

      window.addEventListener(WORKFLOW_CONTROL_APPROVE_EVENT, handleWorkflowControlApprove);

      window.addEventListener(WORKFLOW_CONTROL_CANCEL_EVENT, handleWorkflowControlCancel);

      return () => {
         window.removeEventListener("allevin-request-workflow-action", handleWorkflowActionRequest);

         window.removeEventListener("allevin-command-workflow-action", handleWorkflowCommand);

         window.removeEventListener(WORKFLOW_CONTROL_REQUEST_STATE_EVENT, handleWorkflowControlRequestState);

         window.removeEventListener(WORKFLOW_CONTROL_APPROVE_EVENT, handleWorkflowControlApprove);

         window.removeEventListener(WORKFLOW_CONTROL_CANCEL_EVENT, handleWorkflowControlCancel);
      };
   }, []);

   // ========================================
   // Helpers
   // ========================================

   function showNotice(message: string) {
      setNotice(message);

      window.setTimeout(() => {
         setNotice("");
      }, 1400);
   }

   function syncWorkflowControlStatus(actionCount: number) {
      if (actionCount > 0) {
         workspace.setSystemStatus("awaiting-approval");

         workspace.registerWorkspaceActivity("awaiting-approval");

         return;
      }

      workspace.setSystemStatus("workspace-stable");

      workspace.registerWorkspaceActivity("workspace-stable");
   }

   function commitPendingActions(nextActionsOrUpdater: PendingWorkflowAction[] | ((currentActions: PendingWorkflowAction[]) => PendingWorkflowAction[])) {
      setPendingActions((currentActions) => {
         const nextActions = typeof nextActionsOrUpdater === "function" ? nextActionsOrUpdater(currentActions) : nextActionsOrUpdater;

         const cleanActions = nextActions.slice(0, 20);

         pendingActionsRef.current = cleanActions;

         saveStoredPendingActions(cleanActions);

         broadcastPendingActions(cleanActions);

         syncWorkflowControlStatus(cleanActions.length);

         return cleanActions;
      });
   }

   function addPendingAction(payload: WorkflowActionPayload) {
      const action = getInitialAction(payload);

      commitPendingActions((currentActions) => [action, ...currentActions]);

      setPanelOpen(true);

      showNotice("Action prepared for approval");
   }

   function queueCommandAction(command = commandInput) {
      const cleanCommand = command.trim();

      if (!cleanCommand) {
         setCommandResult("Type a command first.");

         return;
      }

      const { action, result } = buildWorkflowActionFromCommand(cleanCommand);

      if (!action) {
         setCommandResult(result.reason);

         showNotice("No action queued");

         return;
      }

      addPendingAction(action);

      setCommandResult(`Prepared for approval: ${getActionLabel(action.actionType)} → "${action.title}" (${result.confidence}% match). Nothing has moved yet. Approve below or from AIDock to continue.`);

      setCommandInput("");
   }

   function updateAction(actionId: string, updates: Partial<PendingWorkflowAction>) {
      commitPendingActions((currentActions) =>
         currentActions.map((action) =>
            action.id === actionId
               ? {
                    ...action,

                    ...updates,
                 }
               : action,
         ),
      );
   }

   function removeAction(actionId: string) {
      commitPendingActions((currentActions) => currentActions.filter((action) => action.id !== actionId));
   }

   function clearAllActions() {
      commitPendingActions([]);

      showNotice("Queue cleared");
   }

   function approveAction(action: PendingWorkflowAction) {
      const eventName = getDispatchEventName(action);

      const detail = buildApprovedEventDetail(action);

      if (action.actionType === "send-to-calendar") {
         saveCalendarEventFromApprovedAction(action, detail);
      }

      window.dispatchEvent(
         new CustomEvent(eventName, {
            detail: {
               ...detail,

               skipCalendarStorageCreate: action.actionType === "send-to-calendar",
            },
         }),
      );

      window.dispatchEvent(
         new CustomEvent("allevin-log-workflow-event", {
            detail: {
               id: crypto.randomUUID(),

               type: "decision",

               source: "system",

               destination: action.destination,

               title: `Approved: ${getActionLabel(action.actionType)}`,

               summary: `Workflow Control approved ${getActionLabel(action.actionType)} for ${action.title}.`,

               sourceTitle: action.title,

               sourceContent: action.body,

               workingSummary: action.body,

               cleanSourceContent: action.body,

               workflowId: action.workflowId,

               originBoardItemId: action.originBoardItemId,

               createdAt: Date.now(),
            },
         }),
      );

      removeAction(action.id);

      showNotice("Approved. ALLEVIN is running the action.");
   }

   function cancelAction(action: PendingWorkflowAction) {
      window.dispatchEvent(
         new CustomEvent("allevin-log-workflow-event", {
            detail: {
               id: crypto.randomUUID(),

               type: "decision",

               source: "system",

               destination: "system",

               title: `Canceled: ${getActionLabel(action.actionType)}`,

               summary: `Workflow Control canceled ${getActionLabel(action.actionType)} for ${action.title}.`,

               sourceTitle: action.title,

               sourceContent: action.body,

               workingSummary: action.body,

               cleanSourceContent: action.body,

               workflowId: action.workflowId,

               originBoardItemId: action.originBoardItemId,

               createdAt: Date.now(),
            },
         }),
      );

      removeAction(action.id);

      showNotice("Action canceled. Nothing moved.");
   }

   if (!mounted) {
      return null;
   }

   return (
      <motion.section
         id="workflow-control"
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
            rounded-[32px]
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            p-6
            shadow-[var(--shadow-soft)]
         "
      >
         {/* Header */}

         <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
               <div
                  className="
                     flex
                     h-14
                     w-14
                     shrink-0
                     items-center
                     justify-center
                     rounded-2xl
                     bg-[var(--color-bg)]
                  "
               >
                  <ShieldCheck size={24} />
               </div>

               <div>
                  <p className="text-sm text-[var(--color-text-secondary)]">ALLEVIN MK II approval center</p>

                  <h2 className="mt-1 text-3xl">Workflow Control</h2>

                  <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">Review what ALLEVIN prepared before anything moves. Approve to continue, edit to adjust, or cancel to stop.</p>
               </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
               {notice && <div className="rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">{notice}</div>}

               <button
                  onClick={clearAllActions}
                  className="
                     flex
                     items-center
                     gap-2
                     rounded-2xl
                     border
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
                  <Trash2 size={16} />
                  Clear Queue
               </button>
            </div>
         </div>

         {/* Command Intake */}

         <div className="mb-5 rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
            <button onClick={() => setCommandOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left">
               <div className="flex items-center gap-3">
                  <WandSparkles size={18} />

                  <div>
                     <p className="font-medium">Prepare with a Command</p>

                     <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Ask ALLEVIN to resume, create a task, or prepare an export. The action will wait for approval first.</p>
                  </div>
               </div>

               <ChevronDown size={18} className={`transition-transform duration-200 ${commandOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence initial={false}>
               {commandOpen && (
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
                        <div className="flex flex-col gap-3 xl:flex-row">
                           <div className="relative flex-1">
                              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" size={16} />

                              <input
                                 value={commandInput}
                                 onChange={(event) => setCommandInput(event.target.value)}
                                 onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                       queueCommandAction();
                                    }
                                 }}
                                 placeholder="Example: resume my latest project"
                                 className="
                                    w-full
                                    rounded-2xl
                                    border
                                    border-[var(--border-subtle)]
                                    bg-[var(--color-bg)]
                                    py-4
                                    pl-11
                                    pr-4
                                    text-sm
                                    outline-none
                                 "
                              />
                           </div>

                           <button
                              onClick={() => queueCommandAction()}
                              className="
                                 flex
                                 items-center
                                 justify-center
                                 gap-2
                                 rounded-2xl
                                 bg-[var(--color-primary)]
                                 px-5
                                 py-4
                                 text-sm
                                 font-medium
                                 text-[var(--color-cream)]
                                 transition-opacity
                                 hover:opacity-90
                              "
                           >
                              <WandSparkles size={16} />
                              Prepare Action
                           </button>
                        </div>

                        {commandResult && <div className="rounded-2xl bg-[var(--color-bg)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">{commandResult}</div>}
                     </div>
                  </motion.div>
               )}
            </AnimatePresence>
         </div>

         {/* Approval Guide */}

         <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Step 1</p>

               <p className="mt-2 text-sm font-medium">Review the prepared action</p>

               <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">Check what ALLEVIN prepared and where it will go.</p>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Step 2</p>

               <p className="mt-2 text-sm font-medium">Choose approve, edit, or cancel</p>

               <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">Approve runs it, Edit lets you adjust, and Cancel stops it.</p>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Step 3</p>

               <p className="mt-2 text-sm font-medium">Stay in control</p>

               <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">Nothing moves until you approve. AIDock mirrors this same approval queue.</p>
            </div>
         </div>

         {/* Toggle */}

         <button
            onClick={() => setPanelOpen((current) => !current)}
            className="
               mb-5
               flex
               w-full
               items-center
               justify-between
               rounded-2xl
               bg-[var(--color-bg)]
               p-4
               text-left
               transition-colors
               hover:bg-white
            "
         >
            <div className="flex items-center gap-3">
               <Sparkles size={18} />

               <div>
                  <p className="font-medium">Ready for Approval</p>

                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                     {pendingActions.length === 0 ? "No prepared actions waiting for approval." : `${pendingActions.length} prepared action${pendingActions.length === 1 ? "" : "s"} waiting for approval.`}
                  </p>
               </div>
            </div>

            <ChevronDown
               size={18}
               className={`
                  transition-transform
                  duration-200

                  ${panelOpen ? "rotate-180" : ""}
               `}
            />
         </button>

         {/* Pending Queue */}

         <AnimatePresence initial={false}>
            {panelOpen && (
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
                  {pendingActions.length === 0 ? (
                     <div className="rounded-2xl bg-[var(--color-bg)] p-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                        No actions are waiting for approval. When ALLEVIN prepares a resume, task, board move, or export, it will appear here first.
                     </div>
                  ) : (
                     <div className="space-y-4">
                        {pendingActions.map((action) => {
                           const ActionIcon = getActionIcon(action.actionType);

                           const isEditing = action.status === "editing";

                           return (
                              <motion.div
                                 key={action.id}
                                 layout
                                 initial={{
                                    opacity: 0,

                                    y: 8,
                                 }}
                                 animate={{
                                    opacity: 1,

                                    y: 0,
                                 }}
                                 exit={{
                                    opacity: 0,

                                    y: -8,
                                 }}
                                 className="
                                    rounded-3xl
                                    border
                                    border-[var(--border-subtle)]
                                    bg-white
                                    p-5
                                 "
                              >
                                 <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="flex items-start gap-3">
                                       <div
                                          className="
                                             flex
                                             h-11
                                             w-11
                                             shrink-0
                                             items-center
                                             justify-center
                                             rounded-2xl
                                             bg-[var(--color-bg)]
                                          "
                                       >
                                          <ActionIcon size={18} />
                                       </div>

                                       <div>
                                          <p className="font-medium">{getActionLabel(action.actionType)}</p>

                                          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{getActionPlainLanguage(action)}</p>

                                          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Ready for your approval.</p>
                                       </div>
                                    </div>

                                    <div className="flex items-center gap-2 rounded-xl bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]">
                                       <Clock3 size={13} />
                                       {getTimeLabel(action.createdAt)}
                                    </div>
                                 </div>

                                 <div className="mb-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-4">
                                    <div className="mb-2 flex items-center gap-2">
                                       <ShieldCheck size={15} />

                                       <p className="text-sm font-medium">What will happen</p>
                                    </div>

                                    <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{getPreparedActionDescription(action)} Nothing has moved yet.</p>

                                    <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-3">
                                       <div className="rounded-xl bg-white p-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                                          <span className="font-medium text-[var(--color-text-primary)]">Approve:</span> {getApprovalOutcome(action)}
                                       </div>

                                       <div className="rounded-xl bg-white p-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                                          <span className="font-medium text-[var(--color-text-primary)]">Edit:</span> adjust the title, preview, or reason first.
                                       </div>

                                       <div className="rounded-xl bg-white p-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                                          <span className="font-medium text-[var(--color-text-primary)]">Cancel:</span> stop this action and leave the work where it is.
                                       </div>
                                    </div>
                                 </div>

                                 {isEditing ? (
                                    <div className="space-y-3">
                                       <input
                                          value={action.title}
                                          onChange={(event) =>
                                             updateAction(action.id, {
                                                title: event.target.value,
                                             })
                                          }
                                          className="
                                             w-full
                                             rounded-2xl
                                             border
                                             border-[var(--border-subtle)]
                                             bg-[var(--color-bg)]
                                             p-4
                                             text-sm
                                             font-medium
                                             outline-none
                                          "
                                          placeholder="Action title"
                                       />

                                       <textarea
                                          value={action.body}
                                          onChange={(event) =>
                                             updateAction(action.id, {
                                                body: event.target.value,
                                             })
                                          }
                                          className="
                                             min-h-[180px]
                                             w-full
                                             resize-none
                                             rounded-2xl
                                             border
                                             border-[var(--border-subtle)]
                                             bg-[var(--color-bg)]
                                             p-4
                                             text-sm
                                             leading-7
                                             outline-none
                                          "
                                          placeholder="Action body"
                                       />

                                       <textarea
                                          value={action.reason || ""}
                                          onChange={(event) =>
                                             updateAction(action.id, {
                                                reason: event.target.value,
                                             })
                                          }
                                          className="
                                             min-h-[90px]
                                             w-full
                                             resize-none
                                             rounded-2xl
                                             border
                                             border-[var(--border-subtle)]
                                             bg-[var(--color-bg)]
                                             p-4
                                             text-sm
                                             leading-7
                                             outline-none
                                          "
                                          placeholder="Reason for this action"
                                       />
                                    </div>
                                 ) : (
                                    <div className="space-y-4">
                                       <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                          <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Title</p>

                                          <p className="mt-2 text-sm font-medium">{action.title || "Untitled Action"}</p>
                                       </div>

                                       <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                          <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Preview</p>

                                          <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-7 text-[var(--color-text-secondary)]">{action.body || "No content provided."}</p>
                                       </div>

                                       {action.reason && (
                                          <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                             <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Why ALLEVIN prepared this</p>

                                             <p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">{action.reason}</p>
                                          </div>
                                       )}
                                    </div>
                                 )}

                                 <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
                                    <button
                                       onClick={() => approveAction(action)}
                                       className="
                                          flex
                                          items-center
                                          justify-center
                                          gap-2
                                          rounded-2xl
                                          bg-[var(--color-primary)]
                                          px-4
                                          py-3
                                          text-sm
                                          font-medium
                                          text-[var(--color-cream)]
                                          transition-opacity
                                          hover:opacity-90
                                       "
                                    >
                                       <CheckCircle2 size={16} />
                                       Approve
                                    </button>

                                    <button
                                       onClick={() =>
                                          updateAction(action.id, {
                                             status: isEditing ? "pending" : "editing",
                                          })
                                       }
                                       className="
                                          flex
                                          items-center
                                          justify-center
                                          gap-2
                                          rounded-2xl
                                          border
                                          border-[var(--border-subtle)]
                                          bg-white
                                          px-4
                                          py-3
                                          text-sm
                                          font-medium
                                          transition-colors
                                          hover:bg-[var(--color-bg)]
                                       "
                                    >
                                       <Pencil size={16} />
                                       {isEditing ? "Done Editing" : "Edit"}
                                    </button>

                                    <button
                                       onClick={() => cancelAction(action)}
                                       className="
                                          flex
                                          items-center
                                          justify-center
                                          gap-2
                                          rounded-2xl
                                          border
                                          border-[var(--border-subtle)]
                                          bg-white
                                          px-4
                                          py-3
                                          text-sm
                                          font-medium
                                          transition-colors
                                          hover:bg-[var(--color-bg)]
                                       "
                                    >
                                       <XCircle size={16} />
                                       Cancel
                                    </button>
                                 </div>
                              </motion.div>
                           );
                        })}
                     </div>
                  )}
               </motion.div>
            )}
         </AnimatePresence>
      </motion.section>
   );
}
