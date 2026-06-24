"use client";

import { useEffect, useRef, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import {
   RotateCcw,
   GitBranch,
   Target,
   Brain,
   ListChecks,
   FileText,
   Clock3,
   MapPin,
   Activity,
   Sparkles,
   Trash2,
   ChevronDown,
   Send,
   ShieldCheck,
   History,
   Layers3,
   Eye,
   Archive,
   Undo2,
   PauseCircle,
   StickyNote,
   Save,
   WandSparkles,
   CopyCheck,
} from "lucide-react";

import { getActiveThreadMemoryV2, updateThreadMemoryFromWorkflowEvents, clearThreadMemory, type ThreadMemoryObject, type ThreadMemoryState } from "@/components/MemoryEngine";

import { useWorkspace, type WorkspaceSystemStatus } from "@/components/WorkspaceContext";

import { readProjectMemory, upsertProjectMemory, deleteProjectMemory, cleanProjectTitle as cleanMemoryProjectTitle } from "@/lib/allevinProjectMemory";

// ========================================
// Thread Recovery Panel MK II Finale
// Purpose:
// Calm recovery layer for returning to previous work.
// Helps users scan recent work, select a thread,
// prepare a resume/task/export action, and review
// it through Workflow Control.
// ========================================

const ARCHIVED_THREADS_STORAGE_KEY = "allevin-thread-recovery-archived";

const DELETED_THREADS_STORAGE_KEY = "allevin-thread-recovery-deleted";

const DELETED_THREAD_KEYS_STORAGE_KEY = "allevin-thread-recovery-deleted-keys";

const DELETED_CALENDAR_EVENTS_STORAGE_KEY = "allevin-calendar-deleted-events";

const DELETED_CALENDAR_EVENT_KEYS_STORAGE_KEY = "allevin-calendar-deleted-keys";

const THREAD_SNAPSHOTS_STORAGE_KEY = "allevin-thread-recovery-snapshot-history";

const THREAD_MEMORY_STORAGE_KEY = "allevin-thread-memory-v2";

const WORKFLOW_TIMELINE_STORAGE_KEY = "allevin-global-workflow-timeline";

const CANVAS_STORAGE_KEY = "allevin-adaptive-work-canvas";

// ========================================
// Types
// ========================================

interface ThreadSnapshotVersion {
   id: string;

   threadId: string;

   title: string;

   snapshot: string;

   createdAt: number;

   updatedAt: number;
}

interface WorkflowTimelineEvent {
   id?: string;

   title?: string;

   summary?: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;

   workflowId?: string;

   originBoardItemId?: string;

   source?: string;

   destination?: string;

   createdAt?: number;
}

// ========================================
// Initial State
// ========================================

function getInitialThreadMemory(): ThreadMemoryState {
   return {
      hasActiveThread: false,

      threads: [],

      title: "No active thread detected",

      cleanSourceContent: "",

      workingSummary: "ALLEVIN has not detected a persistent thread yet. Move work through Canvas, Tasks, Board, Notes, or Integrations to establish one.",

      currentStage: "unknown",

      status: "unknown",

      lastKnownLocation: "unknown",

      signalCount: 0,

      latestMovement: "No movement detected",

      confidence: 40,

      recommendedNextAction: "Start by drafting in Canvas or creating one Task so ALLEVIN can begin tracking a thread.",

      suggestedDestination: "canvas",

      operatingState: "Baseline Observation",

      cognitiveLoad: "Stable",

      updatedAt: Date.now(),
   };
}

// ========================================
// Storage Helpers
// ========================================

function compactText(value?: string) {
   return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeProjectTitle(value?: string) {
   let cleanValue = compactText(value);

   if (!cleanValue) {
      return "";
   }

   const titleLabelMatch = cleanValue.match(/^title:\s*(.+)$/i);

   if (titleLabelMatch?.[1]) {
      cleanValue = compactText(titleLabelMatch[1]);
   }

   const prefixes = [
      /^continue\s+active\s+thread\s*:\s*/i,
      /^continue\s+active\s+workflow\s*:\s*/i,
      /^continue\s+active\s+project\s*:\s*/i,
      /^continue\s+most\s+active\s+workflow\s*:\s*/i,
      /^active\s+allevin\s+thread\s*:\s*/i,
      /^active\s+thread\s*:\s*/i,
      /^active\s+workflow\s*:\s*/i,
      /^thread\s+memory\s+continuation\s*:\s*/i,
      /^thread\s*:\s*/i,
      /^resume\s+in\s+canvas\s*:\s*/i,
      /^resume\s*:\s*/i,
      /^canvas\s+updated\s*:\s*/i,
      /^canvas\s*:\s*/i,
      /^task\s*:\s*/i,
      /^create\s+task\s*:\s*/i,
      /^follow\s*up\s*:\s*/i,
      /^project\s*:\s*/i,
      /^source\s+title\s*:\s*/i,
   ];

   let changed = true;

   while (changed) {
      changed = false;

      for (const prefix of prefixes) {
         if (prefix.test(cleanValue)) {
            cleanValue = compactText(cleanValue.replace(prefix, ""));

            changed = true;
         }
      }
   }

   return cleanValue;
}

function getNormalizedTitleKey(value?: string) {
   const cleanTitle = normalizeProjectTitle(value).toLowerCase();

   return cleanTitle.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function isMeaningfulTitleForDedupe(value?: string) {
   const cleanTitle = normalizeProjectTitle(value);

   if (!cleanTitle) {
      return false;
   }

   const lower = cleanTitle.toLowerCase();

   if (lower.length < 4) {
      return false;
   }

   const weakFragments = ["workflow", "thread recovery", "task created", "task routed", "task sent", "internal notes", "internal note", "snapshot", "recovery reset", "board item", "project work item", "untitled"];

   return !weakFragments.some((fragment) => lower.includes(fragment));
}

function getCleanThreadTitle(thread?: ThreadMemoryObject) {
   return normalizeProjectTitle(thread?.title) || normalizeProjectTitle(thread?.latestEvent?.sourceTitle) || normalizeProjectTitle(thread?.latestEvent?.title) || "Recovered Work";
}

function getThreadContentScore(thread: ThreadMemoryObject) {
   const content = compactText(thread.cleanSourceContent || thread.workingSummary || thread.latestVisibleState || "");

   if (!content) {
      return 0;
   }

   if (content.length > 400) {
      return 30;
   }

   if (content.length > 180) {
      return 22;
   }

   if (content.length > 60) {
      return 14;
   }

   return 6;
}

function getThreadDedupRank(thread: ThreadMemoryObject) {
   let score = 0;

   score += thread.updatedAt || 0;

   score += (thread.signalCount || 0) * 1000;

   score += (thread.confidence || 0) * 100;

   score += getThreadContentScore(thread) * 100;

   if (thread.status === "active") {
      score += 5000;
   }

   if (thread.currentStage === "drafting" || thread.currentStage === "tasking" || thread.currentStage === "tracking") {
      score += 2500;
   }

   return score;
}

function dedupeThreadsByCleanTitle(threads: ThreadMemoryObject[]) {
   const byWorkflowId = new Map<string, ThreadMemoryObject>();

   threads
      .filter((thread) => thread?.workflowId)
      .forEach((thread) => {
         const existing = byWorkflowId.get(thread.workflowId);

         if (!existing || getThreadDedupRank(thread) > getThreadDedupRank(existing)) {
            byWorkflowId.set(thread.workflowId, thread);
         }
      });

   const byCleanTitle = new Map<string, ThreadMemoryObject>();

   Array.from(byWorkflowId.values()).forEach((thread) => {
      const cleanTitle = getCleanThreadTitle(thread);

      const titleKey = isMeaningfulTitleForDedupe(cleanTitle) ? getNormalizedTitleKey(cleanTitle) : thread.workflowId;

      const existing = byCleanTitle.get(titleKey);

      const normalizedThread = {
         ...thread,

         title: cleanTitle,

         sourceTitle: cleanTitle,
      } as ThreadMemoryObject;

      if (!existing || getThreadDedupRank(normalizedThread) > getThreadDedupRank(existing)) {
         byCleanTitle.set(titleKey, normalizedThread);
      }
   });

   return Array.from(byCleanTitle.values());
}

function getStoredArchivedThreadIds() {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(ARCHIVED_THREADS_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
   } catch {
      localStorage.removeItem(ARCHIVED_THREADS_STORAGE_KEY);

      return [];
   }
}

function saveStoredArchivedThreadIds(threadIds: string[]) {
   if (typeof window === "undefined") {
      return;
   }

   const cleanIds = Array.from(new Set(threadIds.filter(Boolean)));

   localStorage.setItem(ARCHIVED_THREADS_STORAGE_KEY, JSON.stringify(cleanIds));
}

function getStoredDeletedThreadIds() {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(DELETED_THREADS_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
   } catch {
      localStorage.removeItem(DELETED_THREADS_STORAGE_KEY);

      return [];
   }
}

function saveStoredDeletedThreadIds(threadIds: string[]) {
   if (typeof window === "undefined") {
      return;
   }

   const cleanIds = Array.from(new Set(threadIds.filter(Boolean)));

   localStorage.setItem(DELETED_THREADS_STORAGE_KEY, JSON.stringify(cleanIds));
}

function getStoredDeletedThreadKeys() {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(DELETED_THREAD_KEYS_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
   } catch {
      localStorage.removeItem(DELETED_THREAD_KEYS_STORAGE_KEY);

      return [];
   }
}

function saveStoredDeletedThreadKeys(threadKeys: string[]) {
   if (typeof window === "undefined") {
      return;
   }

   const cleanKeys = Array.from(new Set(threadKeys.filter(Boolean)));

   localStorage.setItem(DELETED_THREAD_KEYS_STORAGE_KEY, JSON.stringify(cleanKeys));
}

function getWorkflowSignalDeleteKeys(detail?: Partial<WorkflowTimelineEvent> & { title?: string; sourceTitle?: string }) {
   const titleKey = getNormalizedTitleKey(detail?.sourceTitle || detail?.title);

   return [detail?.workflowId ? `workflow:${detail.workflowId}` : "", detail?.originBoardItemId ? `origin:${detail.originBoardItemId}` : "", titleKey ? `title:${titleKey}` : ""].filter(Boolean);
}

function clearDeletedTombstonesForWorkflowSignal(detail?: Partial<WorkflowTimelineEvent> & { title?: string; sourceTitle?: string }) {
   if (typeof window === "undefined" || !detail) {
      return;
   }

   const titleKey = getNormalizedTitleKey(detail.sourceTitle || detail.title);

   const idsToClear = [detail.workflowId, detail.originBoardItemId, titleKey].filter(Boolean) as string[];

   const keysToClear = getWorkflowSignalDeleteKeys(detail);

   if (!idsToClear.length && !keysToClear.length) {
      return;
   }

   const nextDeletedIds = getStoredDeletedThreadIds().filter((threadId) => !idsToClear.includes(threadId));

   const nextDeletedKeys = getStoredDeletedThreadKeys().filter((key) => !keysToClear.includes(key));

   saveStoredDeletedThreadIds(nextDeletedIds);

   saveStoredDeletedThreadKeys(nextDeletedKeys);

   pruneOldWorkflowTimelineForReusedTitle(detail);
}

function clearDeletedTombstonesFromEvent(event?: Event) {
   const customEvent = event as CustomEvent<Partial<WorkflowTimelineEvent> & { title?: string; sourceTitle?: string }>;

   if (isCleanupWorkflowSignal(customEvent?.detail)) {
      return;
   }

   clearDeletedTombstonesForWorkflowSignal(customEvent?.detail);
}

function isCleanupWorkflowSignal(detail?: Partial<WorkflowTimelineEvent> & { title?: string; sourceTitle?: string }) {
   const searchable = compactText(`${detail?.title || ""} ${detail?.summary || ""} ${detail?.sourceTitle || ""}`).toLowerCase();

   if (!searchable) {
      return false;
   }

   const cleanupSignals = [
      "thread deleted",
      "deleted this thread",
      "deleted thread",
      "recovery reset",
      "recovery cleared",
      "thread paused",
      "thread restored",
      "snapshot saved",
      "snapshot version",
      "delete canceled",
      "canceled:",
      "approved:",
      "internal allevin note saved",
      "internal note saved",
      "note saved",
      "saved to internal notes",
   ];

   return cleanupSignals.some((signal) => searchable.includes(signal));
}

function removeStoredWorkflowTimelineForThread(thread?: ThreadMemoryObject) {
   if (typeof window === "undefined" || !thread) {
      return;
   }

   const workflowId = thread.workflowId;
   const originBoardItemId = thread.originBoardItemId;
   const titleKey = getNormalizedTitleKey(getCleanThreadTitle(thread));

   if (!workflowId && !originBoardItemId && !titleKey) {
      return;
   }

   const remainingEvents = getStoredWorkflowTimeline().filter((event) => {
      const eventTitleKey = getNormalizedTitleKey(event.sourceTitle || event.title);

      if (workflowId && event.workflowId === workflowId) {
         return false;
      }

      if (originBoardItemId && event.originBoardItemId === originBoardItemId) {
         return false;
      }

      // Title cleanup is intentionally allowed here because the user explicitly
      // deleted/reset the visible thread. This prevents old title-derived signals
      // from repopulating Recovery after deletion.
      if (titleKey && eventTitleKey === titleKey) {
         return false;
      }

      return true;
   });

   localStorage.setItem(WORKFLOW_TIMELINE_STORAGE_KEY, JSON.stringify(remainingEvents));
}

function pruneOldWorkflowTimelineForReusedTitle(detail?: Partial<WorkflowTimelineEvent> & { title?: string; sourceTitle?: string }) {
   if (typeof window === "undefined" || !detail || isCleanupWorkflowSignal(detail)) {
      return;
   }

   const titleKey = getNormalizedTitleKey(detail.sourceTitle || detail.title);

   if (!titleKey) {
      return;
   }

   const currentCreatedAt = typeof detail.createdAt === "number" ? detail.createdAt : Date.now();

   const currentWorkflowId = detail.workflowId;
   const currentOriginBoardItemId = detail.originBoardItemId;

   const timeline = getStoredWorkflowTimeline();

   const prunedTimeline = timeline.filter((event) => {
      const eventTitleKey = getNormalizedTitleKey(event.sourceTitle || event.title);

      if (eventTitleKey !== titleKey) {
         return true;
      }

      const eventCreatedAt = typeof event.createdAt === "number" ? event.createdAt : 0;

      const isCurrentSignal =
         (currentWorkflowId && event.workflowId === currentWorkflowId && Math.abs(eventCreatedAt - currentCreatedAt) < 15000) ||
         (currentOriginBoardItemId && event.originBoardItemId === currentOriginBoardItemId && Math.abs(eventCreatedAt - currentCreatedAt) < 15000) ||
         Math.abs(eventCreatedAt - currentCreatedAt) < 15000;

      // Keep the new/current signal window, but remove older same-title history
      // so reused titles do not inherit 20, 40, or 60 old signals.
      return isCurrentSignal;
   });

   localStorage.setItem(WORKFLOW_TIMELINE_STORAGE_KEY, JSON.stringify(prunedTimeline));
}

function getThreadDeleteKeys(thread?: ThreadMemoryObject) {
   if (!thread) {
      return [];
   }

   const titleKey = getNormalizedTitleKey(getCleanThreadTitle(thread));

   const keys = [thread.workflowId ? `workflow:${thread.workflowId}` : "", thread.originBoardItemId ? `origin:${thread.originBoardItemId}` : "", titleKey ? `title:${titleKey}` : ""];

   return Array.from(new Set(keys.filter(Boolean)));
}

function readDeletedCalendarStorageValues(key: string) {
   if (typeof window === "undefined") {
      return [];
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

function isThreadLikeDeletedCalendarItem(thread: { id?: string; workflowId?: string; originBoardItemId?: string; title?: string; workingSummary?: string; latestMovement?: string }) {
   const deletedIds = readDeletedCalendarStorageValues(DELETED_CALENDAR_EVENTS_STORAGE_KEY);

   const deletedKeys = readDeletedCalendarStorageValues(DELETED_CALENDAR_EVENT_KEYS_STORAGE_KEY);

   if (!deletedIds.length && !deletedKeys.length) {
      return false;
   }

   const cleanTitle = typeof getCleanThreadTitle === "function" ? getCleanThreadTitle(thread as ThreadMemoryObject) : thread.title || "";

   const titleKey = getNormalizedTitleKey(cleanTitle || thread.title);

   const candidateIds = [thread.id, thread.workflowId, thread.originBoardItemId].filter(Boolean) as string[];

   if (candidateIds.some((id) => deletedIds.includes(id))) {
      return true;
   }

   const candidateKeys = [thread.id ? `event:${thread.id}` : "", thread.workflowId ? `workflow:${thread.workflowId}` : "", thread.originBoardItemId ? `origin:${thread.originBoardItemId}` : "", titleKey ? `title:${titleKey}` : ""].filter(Boolean);

   if (candidateKeys.some((key) => deletedKeys.includes(key))) {
      return true;
   }

   const searchable = compactText(`${thread.title || ""} ${thread.workingSummary || ""} ${thread.latestMovement || ""}`).toLowerCase();

   return deletedKeys.some((key) => key.startsWith("title:") && searchable.includes(key.replace("title:", "").replace(/-/g, " ")));
}

function isThreadDeletedByKeys(thread: ThreadMemoryObject, deletedIds: string[], deletedKeys: string[]) {
   if (isThreadLikeDeletedCalendarItem(thread)) {
      return true;
   }

   if (thread.workflowId && deletedIds.includes(thread.workflowId)) {
      return true;
   }

   const workflowKey = thread.workflowId ? `workflow:${thread.workflowId}` : "";

   const originKey = thread.originBoardItemId ? `origin:${thread.originBoardItemId}` : "";

   if (workflowKey && deletedKeys.includes(workflowKey)) {
      return true;
   }

   if (originKey && deletedKeys.includes(originKey)) {
      return true;
   }

   const titleKey = getNormalizedTitleKey(getCleanThreadTitle(thread));

   if (titleKey && deletedKeys.includes(`title:${titleKey}`)) {
      return true;
   }

   return false;
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

function saveStoredThreadSnapshots(snapshots: ThreadSnapshotVersion[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(
      THREAD_SNAPSHOTS_STORAGE_KEY,
      JSON.stringify(
         snapshots
            .filter((snapshot) => snapshot.threadId && snapshot.snapshot.trim())
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 100),
      ),
   );
}

function getStoredWorkflowTimeline(): WorkflowTimelineEvent[] {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(WORKFLOW_TIMELINE_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return [];
      }

      return parsed
         .filter((event) => event && typeof event === "object")
         .map((event) => ({
            id: typeof event.id === "string" ? event.id : crypto.randomUUID(),

            title: typeof event.title === "string" ? event.title : "Workflow movement",

            summary: typeof event.summary === "string" ? event.summary : "",

            sourceTitle: typeof event.sourceTitle === "string" ? event.sourceTitle : undefined,

            sourceContent: typeof event.sourceContent === "string" ? event.sourceContent : undefined,

            workingSummary: typeof event.workingSummary === "string" ? event.workingSummary : undefined,

            cleanSourceContent: typeof event.cleanSourceContent === "string" ? event.cleanSourceContent : undefined,

            workflowId: typeof event.workflowId === "string" ? event.workflowId : undefined,

            originBoardItemId: typeof event.originBoardItemId === "string" ? event.originBoardItemId : undefined,

            source: typeof event.source === "string" ? event.source : undefined,

            destination: typeof event.destination === "string" ? event.destination : undefined,

            createdAt: typeof event.createdAt === "number" ? event.createdAt : Date.now(),
         }))
         .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
   } catch {
      localStorage.removeItem(WORKFLOW_TIMELINE_STORAGE_KEY);

      return [];
   }
}

function getStageFromTimelineDestination(destination?: string): ThreadMemoryState["currentStage"] {
   switch (destination) {
      case "canvas":
         return "drafting";

      case "task":
         return "tasking";

      case "board":
         return "tracking";

      case "notes":
         return "preserved";

      case "notes":
      case "integrations":
      case "integration":
         return "exporting";

      default:
         return "unknown";
   }
}

function getLocationFromTimelineDestination(destination?: string): ThreadMemoryState["lastKnownLocation"] {
   switch (destination) {
      case "canvas":
         return "canvas";

      case "task":
         return "task";

      case "board":
         return "board";

      case "notes":
         return "notes";

      case "notes":
      case "integrations":
      case "integration":
         return "integrations";

      default:
         return "system";
   }
}

function getSuggestedDestinationFromTimeline(destination?: string): ThreadMemoryState["suggestedDestination"] {
   switch (destination) {
      case "task":
         return "board";

      case "board":
         return "canvas";

      case "notes":
      case "integrations":
      case "integration":
         return "integrations";

      default:
         return "canvas";
   }
}

function getTimelineThreadKey(event: WorkflowTimelineEvent) {
   const cleanTitleKey = getNormalizedTitleKey(event.sourceTitle || event.title);

   return event.workflowId || event.originBoardItemId || cleanTitleKey || crypto.randomUUID();
}

function getBestTimelineTitle(event: WorkflowTimelineEvent) {
   return normalizeProjectTitle(event.sourceTitle) || normalizeProjectTitle(event.title) || "Recovered Work";
}

function getBestTimelineContent(event: WorkflowTimelineEvent) {
   return compactText(event.cleanSourceContent) || compactText(event.sourceContent) || compactText(event.workingSummary) || compactText(event.summary) || compactText(event.sourceTitle) || compactText(event.title) || "Recovered workflow context.";
}

function isNoteOnlyTimelineEvent(event: WorkflowTimelineEvent) {
   const searchable = compactText(`${event.title || ""} ${event.summary || ""} ${event.source || ""} ${event.destination || ""}`).toLowerCase();

   return (
      searchable.includes("internal allevin note saved") ||
      searchable.includes("internal note saved") ||
      searchable.includes("note saved") ||
      searchable.includes("saved to internal notes") ||
      searchable.includes("calendar event deleted") ||
      searchable.includes("event deleted")
   );
}

function getTimelineBackfillThreads() {
   const deletedIds = readStringArrayStorageSafe(DELETED_THREADS_STORAGE_KEY);

   const deletedKeys = readStringArrayStorageSafe(DELETED_THREAD_KEYS_STORAGE_KEY);

   const timelineEvents = getStoredWorkflowTimeline().filter((event) => {
      if (isNoteOnlyTimelineEvent(event)) {
         return false;
      }

      const threadLike = {
         workflowId: event.workflowId,
         originBoardItemId: event.originBoardItemId,
         title: getBestTimelineTitle(event),
      } as ThreadMemoryObject;

      return !isThreadDeletedByKeys(threadLike, deletedIds, deletedKeys) && !isThreadLikeDeletedCalendarItem(threadLike);
   });

   const grouped = new Map<string, WorkflowTimelineEvent[]>();

   timelineEvents.forEach((event) => {
      const key = getTimelineThreadKey(event);

      const current = grouped.get(key) || [];

      grouped.set(key, [...current, event]);
   });

   return Array.from(grouped.entries())
      .map(([key, events]) => {
         const sortedEvents = [...events].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 8);

         const latestEvent = sortedEvents[0];

         const bestEvent = sortedEvents.find((event) => compactText(event.sourceTitle) && compactText(event.sourceContent || event.cleanSourceContent || event.workingSummary || event.summary).length >= 12) || latestEvent;

         const title = getBestTimelineTitle(bestEvent);

         const cleanSourceContent = getBestTimelineContent(bestEvent);

         return {
            workflowId: latestEvent.workflowId || key,

            originBoardItemId: latestEvent.originBoardItemId || key,

            title,

            cleanSourceContent,

            workingSummary: compactText(bestEvent.workingSummary) || compactText(bestEvent.summary) || cleanSourceContent,

            currentStage: getStageFromTimelineDestination(latestEvent.destination),

            status: "active",

            lastKnownLocation: getLocationFromTimelineDestination(latestEvent.destination),

            signalCount: getDisplaySignalCount(sortedEvents.length),

            latestMovement: `${latestEvent.source || "system"} → ${latestEvent.destination || "system"}`,

            confidence: Math.min(95, 55 + sortedEvents.length * 8),

            recommendedNextAction: "Review this recovered work, then prepare a resume, task, or export action if you want to continue.",

            suggestedDestination: getSuggestedDestinationFromTimeline(latestEvent.destination),

            operatingState: "Recovered From Workflow Timeline",

            cognitiveLoad: "Stable",

            updatedAt: latestEvent.createdAt || Date.now(),
         } as ThreadMemoryObject;
      })
      .filter((thread) => !isWeakRecoveryThread(thread));
}

// ========================================
// MK II Project Memory Backfill
// ========================================

function getThreadStageFromProjectStage(stage?: string): ThreadMemoryState["currentStage"] {
   switch (stage) {
      case "drafting":
      case "tasking":
      case "tracking":
      case "reviewing":
      case "preserved":
      case "exporting":
      case "exported":
      case "completed":
      case "paused":
         return stage as ThreadMemoryState["currentStage"];

      default:
         return "unknown";
   }
}

function getThreadStatusFromProjectStatus(status?: string): ThreadMemoryState["status"] {
   switch (status) {
      case "active":
      case "ready":
      case "preserved":
      case "exported":
      case "completed":
      case "paused":
         return status as ThreadMemoryState["status"];

      case "archived":
         return "paused";

      default:
         return "unknown";
   }
}

function getThreadLocationFromProjectDestination(destination?: string): ThreadMemoryState["lastKnownLocation"] {
   switch (destination) {
      case "canvas":
         return "canvas";

      case "task":
         return "task";

      case "board":
         return "board";

      case "notes":
         return "notes";

      case "integrations":
      case "notes":
         return "integrations";

      case "system":
      case "thread-recovery":
      case "calendar":
         return "system";

      default:
         return "unknown";
   }
}

function getThreadSuggestedDestinationFromProject(destination?: string): ThreadMemoryState["suggestedDestination"] {
   switch (destination) {
      case "canvas":
         return "canvas";

      case "task":
         return "task";

      case "board":
         return "board";

      case "notes":
         return "notes";

      case "integrations":
      case "notes":
         return "integrations";

      default:
         return "canvas";
   }
}

function readStringArrayStorageSafe(key: string) {
   if (typeof window === "undefined") {
      return [] as string[];
   }

   const stored = localStorage.getItem(key);

   if (!stored) {
      return [] as string[];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
   } catch {
      localStorage.removeItem(key);

      return [] as string[];
   }
}

function getCurrentCanvasRecoveryThread() {
   if (typeof window === "undefined") {
      return null;
   }

   const stored = localStorage.getItem(CANVAS_STORAGE_KEY);

   if (!stored) {
      return null;
   }

   try {
      const parsed = JSON.parse(stored) as {
         title?: string;
         sourceTitle?: string;
         content?: string;
         sourceContent?: string;
         workingSummary?: string;
         workflowId?: string;
         originBoardItemId?: string;
         updatedAt?: number;
      };

      const title = normalizeProjectTitle(parsed.sourceTitle || parsed.title);

      const cleanSourceContent = compactText(parsed.content || parsed.sourceContent || parsed.workingSummary);

      if (!title || !cleanSourceContent || cleanSourceContent.length < 12) {
         return null;
      }

      return {
         workflowId: parsed.workflowId || getStableWorkflowIdFromTitle(title) || parsed.originBoardItemId || `canvas-${Date.now()}`,

         originBoardItemId: parsed.originBoardItemId || parsed.workflowId || getStableWorkflowIdFromTitle(title),

         title,

         sourceTitle: title,

         cleanSourceContent,

         workingSummary: compactText(parsed.workingSummary) || cleanSourceContent,

         currentStage: "drafting",

         status: "active",

         lastKnownLocation: "canvas",

         signalCount: 8,

         latestMovement: "Canvas is the current working surface.",

         confidence: 100,

         recommendedNextAction: "Continue developing the thread in Canvas, then convert the next concrete action into a Task.",

         suggestedDestination: "task",

         operatingState: "Live Canvas State",

         cognitiveLoad: "Stable",

         // Force Recovery to prefer the current visible Canvas state
         // over older Thread Memory or Project Memory with the same workflow ID.
         updatedAt: Math.max(Number(parsed.updatedAt || 0), Date.now()),
      } as ThreadMemoryObject;
   } catch {
      return null;
   }
}

function getProjectMemoryThreads() {
   const deletedIds = readStringArrayStorageSafe(DELETED_THREADS_STORAGE_KEY);

   const deletedKeys = readStringArrayStorageSafe(DELETED_THREAD_KEYS_STORAGE_KEY);

   return readProjectMemory()
      .filter((project) => {
         const title = cleanMemoryProjectTitle(project.cleanTitle || project.title || project.sourceTitle) || project.title || "Recovered Work";

         const threadLike = {
            workflowId: project.workflowId,
            originBoardItemId: project.originBoardItemId,
            title,
         } as ThreadMemoryObject;

         return !isThreadDeletedByKeys(threadLike, deletedIds, deletedKeys);
      })
      .map((project) => {
         const title = cleanMemoryProjectTitle(project.cleanTitle || project.title || project.sourceTitle) || project.title || "Recovered Work";

         const cleanSourceContent = compactText(project.sourceContent) || compactText(project.body) || compactText(project.workingSummary) || title;

         return {
            workflowId: project.workflowId,

            originBoardItemId: project.originBoardItemId,

            title,

            sourceTitle: title,

            cleanSourceContent,

            workingSummary: compactText(project.workingSummary) || compactText(project.latestSummary) || cleanSourceContent,

            currentStage: getThreadStageFromProjectStage(project.stage),

            status: getThreadStatusFromProjectStatus(project.status),

            lastKnownLocation: getThreadLocationFromProjectDestination(project.lastKnownLocation),

            signalCount: getDisplaySignalCount(project.signalCount || Math.max(1, project.history?.length || 1)),

            latestMovement: project.latestMovement || `project memory → ${project.lastKnownLocation || "system"}`,

            confidence: project.confidence || 75,

            recommendedNextAction: project.recommendedNextAction || "Review this recovered project and choose the next useful action.",

            suggestedDestination: getThreadSuggestedDestinationFromProject(project.suggestedDestination),

            operatingState: "MK II Project Memory",

            cognitiveLoad: "Stable",

            updatedAt: project.updatedAt || Date.now(),
         } as ThreadMemoryObject;
      })
      .filter((thread) => !isWeakRecoveryThread(thread));
}

// ========================================
// Thread Filtering
// ========================================

function isWeakRecoveryThread(thread?: ThreadMemoryObject) {
   if (!thread) return true;

   const title = compactText(thread.title).toLowerCase();

   const source = compactText(thread.cleanSourceContent || thread.workingSummary || "").toLowerCase();

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
      "internal notes export confirmed",
      "internal notes live export completed",
      "internal note saved",
      "internal allevin note saved",
      "saved to internal notes",
      "note saved",
      "temporary delete test",
      "task deleted",
      "next action removed",
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
      "internal note saved",
      "internal allevin note saved",
      "note saved",
      "saved to internal notes",
      "thread paused",
      "thread restored",
      "snapshot saved",
      "snapshot version",
      "recovery reset",
      "task deleted",
      "next action removed",
   ];

   if (weakTitles.includes(title)) return true;

   if (weakFragments.some((fragment) => title.includes(fragment))) {
      return true;
   }

   const noteOnlySignals = ["internal allevin note saved", "internal note saved", "note saved", "saved to internal notes"];

   if (noteOnlySignals.some((signal) => source.includes(signal))) {
      return true;
   }

   if (!source || source.length < 12) {
      return true;
   }

   return false;
}

function sortThreadsNewestFirst(threads: ThreadMemoryObject[]) {
   return [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
}

function sortSnapshotsNewestFirst(snapshots: ThreadSnapshotVersion[]) {
   return [...snapshots].sort((a, b) => b.updatedAt - a.updatedAt);
}

function getDisplaySignalCount(value?: number) {
   const count = typeof value === "number" && Number.isFinite(value) ? value : 0;

   return Math.max(0, Math.min(count, 8));
}

function getMergedUniqueThreads(memory: ThreadMemoryState) {
   const currentCanvasThread = getCurrentCanvasRecoveryThread();

   const mergedThreads = [...(currentCanvasThread ? [currentCanvasThread] : []), ...(memory.activeThread ? [memory.activeThread] : []), ...memory.threads, ...getProjectMemoryThreads(), ...getTimelineBackfillThreads()];

   return dedupeThreadsByCleanTitle(mergedThreads.filter((thread) => thread?.workflowId));
}

function getCleanThreadsFromMemory(memory: ThreadMemoryState) {
   return sortThreadsNewestFirst(getMergedUniqueThreads(memory).filter((thread) => !isWeakRecoveryThread(thread)));
}

// ========================================
// Component
// ========================================

export default function ThreadRecoveryPanel() {
   const workspace = useWorkspace();

   const [mounted, setMounted] = useState(false);

   const [threadMemory, setThreadMemory] = useState<ThreadMemoryState>(getInitialThreadMemory);

   const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

   const [archivedThreadIds, setArchivedThreadIds] = useState<string[]>([]);

   const [deletedThreadIds, setDeletedThreadIds] = useState<string[]>([]);

   const [deletedThreadKeys, setDeletedThreadKeys] = useState<string[]>([]);

   const [pendingDeleteThreadId, setPendingDeleteThreadId] = useState<string | null>(null);

   const [threadSnapshots, setThreadSnapshots] = useState<ThreadSnapshotVersion[]>([]);

   const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

   const [snapshotDraft, setSnapshotDraft] = useState("");

   const [activeThreadsOpen, setActiveThreadsOpen] = useState(true);

   const [recentThreadsOpen, setRecentThreadsOpen] = useState(true);

   const [archivedThreadsOpen, setArchivedThreadsOpen] = useState(false);

   const [snapshotOpen, setSnapshotOpen] = useState(false);

   const [snapshotHistoryOpen, setSnapshotHistoryOpen] = useState(false);

   const [detailsOpen, setDetailsOpen] = useState(false);

   const [notice, setNotice] = useState("");

   const refreshTimerRef = useRef<number | null>(null);

   const syncingRef = useRef(false);

   const manualSelectionRef = useRef(false);

   // ========================================
   // Filtered Threads
   // ========================================

   function isArchivedThread(thread?: ThreadMemoryObject) {
      if (!thread?.workflowId) {
         return false;
      }

      return archivedThreadIds.includes(thread.workflowId);
   }

   function isDeletedThread(thread?: ThreadMemoryObject) {
      if (!thread?.workflowId) {
         return false;
      }

      return isThreadDeletedByKeys(thread, deletedThreadIds, deletedThreadKeys);
   }

   function getCleanThreads(memory = threadMemory) {
      return getCleanThreadsFromMemory(memory).filter((thread) => !isDeletedThread(thread));
   }

   function getRecoverableThreads(memory = threadMemory) {
      return getCleanThreads(memory).filter((thread) => !isArchivedThread(thread));
   }

   function getArchivedThreads(memory = threadMemory) {
      return getCleanThreads(memory).filter((thread) => isArchivedThread(thread));
   }

   function getActiveWorkThreads(memory = threadMemory) {
      const activeThreadId = memory.activeThread?.workflowId;

      return getRecoverableThreads(memory).filter((thread) => {
         if (activeThreadId && thread.workflowId === activeThreadId) {
            return true;
         }

         return thread.status === "active" || thread.status === "ready" || thread.currentStage === "drafting" || thread.currentStage === "tasking" || thread.currentStage === "tracking" || thread.currentStage === "reviewing";
      });
   }

   function getRecentWorkThreads(memory = threadMemory) {
      const activeIds = new Set(getActiveWorkThreads(memory).map((thread) => thread.workflowId));

      return getRecoverableThreads(memory).filter((thread) => !activeIds.has(thread.workflowId));
   }

   function getMostRecentThread(threads: ThreadMemoryObject[]) {
      return sortThreadsNewestFirst(threads)[0];
   }

   function getSelectedThread() {
      const recoverableThreads = getRecoverableThreads();

      if (!selectedThreadId) {
         return getMostRecentThread(recoverableThreads) || undefined;
      }

      return recoverableThreads.find((thread) => thread.workflowId === selectedThreadId) || getMostRecentThread(recoverableThreads) || undefined;
   }

   const recoverableThreads = getRecoverableThreads();

   const activeWorkThreads = getActiveWorkThreads();

   const recentWorkThreads = getRecentWorkThreads();

   const archivedThreads = getArchivedThreads();

   const selectedThread = getSelectedThread();

   const hasRecoverableThread = Boolean(selectedThread);

   // ========================================
   // Snapshot Helpers
   // ========================================

   function getSnapshotsForThreadId(threadId?: string) {
      if (!threadId) {
         return [];
      }

      return sortSnapshotsNewestFirst(threadSnapshots.filter((snapshot) => snapshot.threadId === threadId));
   }

   function getSnapshotsForThread(thread = selectedThread) {
      return getSnapshotsForThreadId(thread?.workflowId);
   }

   function getLatestSnapshotForThread(thread = selectedThread) {
      return getSnapshotsForThread(thread)[0];
   }

   function getSelectedSnapshotForThread(thread = selectedThread) {
      const snapshots = getSnapshotsForThread(thread);

      if (!snapshots.length) {
         return undefined;
      }

      if (selectedSnapshotId) {
         const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId);

         if (selectedSnapshot) {
            return selectedSnapshot;
         }
      }

      return snapshots[0];
   }

   function getSnapshotText(thread = selectedThread) {
      const snapshot = getSelectedSnapshotForThread(thread);

      return snapshot?.snapshot || "";
   }

   function setDraftFromLatestSnapshot(thread?: ThreadMemoryObject) {
      const latestSnapshot = getLatestSnapshotForThread(thread);

      setSelectedSnapshotId(latestSnapshot?.id || null);

      setSnapshotDraft(latestSnapshot?.snapshot || "");
   }

   function getSnapshotCount(thread?: ThreadMemoryObject) {
      return getSnapshotsForThread(thread).length;
   }

   // ========================================
   // Selection Helpers
   // ========================================

   function selectThread(threadId: string) {
      manualSelectionRef.current = true;

      setSelectedThreadId(threadId);

      const thread = getCleanThreads().find((candidate) => candidate.workflowId === threadId);

      setDraftFromLatestSnapshot(thread);

      syncRecoveryWorkspaceStatus("recovery-available");

      showNotice("Thread selected");
   }

   function selectNewestThread() {
      const mostRecentThread = getMostRecentThread(recoverableThreads);

      manualSelectionRef.current = false;

      setSelectedThreadId(mostRecentThread?.workflowId || null);

      setDraftFromLatestSnapshot(mostRecentThread);

      syncRecoveryWorkspaceStatus("recovery-available");

      showNotice("Latest thread selected");
   }

   function selectNextAvailableThread(nextArchivedIds: string[], nextDeletedIds = deletedThreadIds, nextDeletedKeys = deletedThreadKeys) {
      const nextRecoverableThreads = getCleanThreads().filter((thread) => !nextArchivedIds.includes(thread.workflowId) && !isThreadDeletedByKeys(thread, nextDeletedIds, nextDeletedKeys));

      const mostRecentThread = getMostRecentThread(nextRecoverableThreads);

      manualSelectionRef.current = false;

      setSelectedThreadId(mostRecentThread?.workflowId || null);

      setDraftFromLatestSnapshot(mostRecentThread);
   }

   // ========================================
   // Safe Thread Scan Recent Work
   // ========================================

   function readThreadMemory({
      sync = false,
      delay = 0,
      noticeMessage,
      forceNewest = false,
   }: {
      sync?: boolean;

      delay?: number;

      noticeMessage?: string;

      forceNewest?: boolean;
   } = {}) {
      if (typeof window === "undefined") {
         return;
      }

      if (refreshTimerRef.current) {
         window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
         if (syncingRef.current) {
            return;
         }

         syncingRef.current = true;

         try {
            if (sync) {
               updateThreadMemoryFromWorkflowEvents();
            }

            const nextThreadMemory = getActiveThreadMemoryV2();

            const nextArchivedIds = getStoredArchivedThreadIds();

            const nextDeletedIds = getStoredDeletedThreadIds();

            const nextDeletedKeys = getStoredDeletedThreadKeys();

            const nextSnapshots = getStoredThreadSnapshots();

            const nextCleanThreads = getCleanThreadsFromMemory(nextThreadMemory).filter((thread) => !isThreadDeletedByKeys(thread, nextDeletedIds, nextDeletedKeys));

            const nextRecoverableThreads = nextCleanThreads.filter((thread) => !nextArchivedIds.includes(thread.workflowId));

            setArchivedThreadIds(nextArchivedIds);

            setDeletedThreadIds(nextDeletedIds);

            setDeletedThreadKeys(nextDeletedKeys);

            setThreadSnapshots(nextSnapshots);

            setThreadMemory(nextThreadMemory);

            setSelectedThreadId((currentSelectedId) => {
               const mostRecentThread = getMostRecentThread(nextRecoverableThreads);

               const selectedStillExists = nextRecoverableThreads.some((thread) => thread.workflowId === currentSelectedId);

               function updateSnapshotSelection(threadId: string | null) {
                  if (!threadId) {
                     setSelectedSnapshotId(null);

                     setSnapshotDraft("");

                     return;
                  }

                  const snapshotsForThread = sortSnapshotsNewestFirst(nextSnapshots.filter((snapshot) => snapshot.threadId === threadId));

                  const latestSnapshot = snapshotsForThread[0];

                  setSelectedSnapshotId(latestSnapshot?.id || null);

                  setSnapshotDraft(latestSnapshot?.snapshot || "");
               }

               if (forceNewest) {
                  manualSelectionRef.current = false;

                  const nextSelectedId = mostRecentThread?.workflowId || null;

                  updateSnapshotSelection(nextSelectedId);

                  return nextSelectedId;
               }

               if (manualSelectionRef.current && currentSelectedId && selectedStillExists) {
                  updateSnapshotSelection(currentSelectedId);

                  return currentSelectedId;
               }

               const nextSelectedId = mostRecentThread?.workflowId || null;

               updateSnapshotSelection(nextSelectedId);

               return nextSelectedId;
            });

            if (noticeMessage) {
               showNotice(noticeMessage);
            }
         } finally {
            window.setTimeout(() => {
               syncingRef.current = false;
            }, 100);
         }
      }, delay);
   }

   // ========================================
   // Mount
   // ========================================

   useEffect(() => {
      setMounted(true);

      syncRecoveryWorkspaceStatus("recovery-available");

      setArchivedThreadIds(getStoredArchivedThreadIds());

      setDeletedThreadIds(getStoredDeletedThreadIds());

      setDeletedThreadKeys(getStoredDeletedThreadKeys());

      setThreadSnapshots(getStoredThreadSnapshots());

      readThreadMemory({
         sync: true,

         delay: 250,

         forceNewest: true,
      });

      return () => {
         if (refreshTimerRef.current) {
            window.clearTimeout(refreshTimerRef.current);
         }
      };
   }, []);

   // ========================================
   // Refresh Listeners
   // ========================================

   useEffect(() => {
      function refreshThreadRecovery(event?: Event) {
         clearDeletedTombstonesFromEvent(event);

         readThreadMemory({
            sync: false,

            delay: 250,
         });
      }

      function refreshThreadRecoveryWithSync(event?: Event) {
         clearDeletedTombstonesFromEvent(event);

         readThreadMemory({
            sync: true,

            delay: 350,
         });
      }

      function refreshThreadRecoveryAfterTaskDelete() {
         setDeletedThreadIds(getStoredDeletedThreadIds());

         setDeletedThreadKeys(getStoredDeletedThreadKeys());

         readThreadMemory({
            sync: true,

            delay: 150,

            forceNewest: true,
         });
      }

      window.addEventListener("allevin-log-workflow-event", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-send-to-canvas", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-send-to-task", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-send-to-board", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-prepare-integration", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-request-workflow-action", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-workflow-control-update", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-workflow-control-approve-action", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-command-workflow-action", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-memory-update", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-project-memory-update", refreshThreadRecoveryWithSync);

      window.addEventListener("allevin-task-deleted-from-memory", refreshThreadRecoveryAfterTaskDelete);

      window.addEventListener("storage", refreshThreadRecovery);

      return () => {
         window.removeEventListener("allevin-log-workflow-event", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-send-to-canvas", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-send-to-task", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-send-to-board", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-prepare-integration", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-request-workflow-action", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-workflow-control-update", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-workflow-control-approve-action", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-command-workflow-action", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-memory-update", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-project-memory-update", refreshThreadRecoveryWithSync);

         window.removeEventListener("allevin-task-deleted-from-memory", refreshThreadRecoveryAfterTaskDelete);

         window.removeEventListener("storage", refreshThreadRecovery);
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

   function syncRecoveryWorkspaceStatus(status: WorkspaceSystemStatus = "recovery-available") {
      workspace.setSystemStatus(status);

      workspace.registerWorkspaceActivity(status);
   }

   function refreshPanel() {
      syncRecoveryWorkspaceStatus("recovery-available");

      readThreadMemory({
         sync: true,

         delay: 0,

         noticeMessage: "Recent work scanned",

         forceNewest: false,
      });
   }

   function refreshPanelToNewest() {
      syncRecoveryWorkspaceStatus("recovery-available");

      readThreadMemory({
         sync: true,

         delay: 0,

         noticeMessage: "Latest thread selected",

         forceNewest: true,
      });
   }

   function resetRecoveryLayer() {
      if (refreshTimerRef.current) {
         window.clearTimeout(refreshTimerRef.current);
      }

      // MK II behavior:
      // Reset should clear the visible Recovery list, not just refresh it.
      // Recovery can rebuild from MemoryEngine, Project Memory, and Workflow Timeline,
      // so we create tombstones for every currently visible thread before clearing
      // the recovery layer. This prevents the same projects from reappearing after reset.
      const visibleThreadsForReset = getCleanThreads();

      const resetDeletedIds = Array.from(new Set([...deletedThreadIds, ...visibleThreadsForReset.map((thread) => thread.workflowId).filter(Boolean)]));

      const resetDeletedKeys = Array.from(new Set([...deletedThreadKeys, ...visibleThreadsForReset.flatMap((thread) => getThreadDeleteKeys(thread))]));

      visibleThreadsForReset.forEach((thread) => {
         deleteProjectMemory({
            workflowId: thread.workflowId,
            originBoardItemId: thread.originBoardItemId,
            title: getThreadTitle(thread),
         });

         removeStoredWorkflowTimelineForThread(thread);
      });

      clearThreadMemory();

      localStorage.removeItem(THREAD_MEMORY_STORAGE_KEY);

      localStorage.removeItem(ARCHIVED_THREADS_STORAGE_KEY);

      // Keep and expand deleted-thread tombstones so reset behaves like
      // "clear this recovery list" instead of "refresh and bring everything back."
      saveStoredDeletedThreadIds(resetDeletedIds);

      saveStoredDeletedThreadKeys(resetDeletedKeys);

      localStorage.removeItem(THREAD_SNAPSHOTS_STORAGE_KEY);

      setArchivedThreadIds([]);

      setDeletedThreadIds(resetDeletedIds);

      setDeletedThreadKeys(resetDeletedKeys);

      setPendingDeleteThreadId(null);

      setThreadSnapshots([]);

      setSelectedSnapshotId(null);

      setSnapshotDraft("");

      manualSelectionRef.current = false;

      syncingRef.current = false;

      setSelectedThreadId(null);

      setThreadMemory(getInitialThreadMemory());

      syncRecoveryWorkspaceStatus("recovery-available");

      showNotice("Recovery Cleared");

      window.dispatchEvent(new Event("allevin-memory-update"));
   }

   function getWorkflowId(thread = selectedThread) {
      return thread?.workflowId;
   }

   function getOriginBoardItemId(thread = selectedThread) {
      return thread?.originBoardItemId;
   }

   function getThreadTitle(thread = selectedThread) {
      return getCleanThreadTitle(thread) || normalizeProjectTitle(threadMemory.title) || threadMemory.title;
   }

   function getThreadSourceContent(thread?: ThreadMemoryObject) {
      const targetThread = thread || selectedThread;

      return targetThread?.cleanSourceContent || targetThread?.workingSummary || targetThread?.title || "No recoverable source content found.";
   }

   function getThreadWorkingSummary(thread = selectedThread) {
      return thread?.workingSummary || threadMemory.workingSummary || getThreadSourceContent(thread);
   }

   function getThreadRecommendedMove(thread = selectedThread) {
      return thread?.recommendedNextAction || threadMemory.recommendedNextAction;
   }

   function getThreadStage(thread = selectedThread) {
      return thread?.currentStage || threadMemory.currentStage;
   }

   function getThreadStatus(thread = selectedThread) {
      return thread?.status || threadMemory.status;
   }

   function getThreadLocation(thread = selectedThread) {
      return thread?.lastKnownLocation || threadMemory.lastKnownLocation;
   }

   function getThreadSignals(thread = selectedThread) {
      return getDisplaySignalCount(thread?.signalCount || threadMemory.signalCount);
   }

   function getThreadConfidence(thread = selectedThread) {
      return thread?.confidence || threadMemory.confidence;
   }

   function getThreadLatestMovement(thread = selectedThread) {
      return thread?.latestMovement || threadMemory.latestMovement;
   }

   function getThreadOperatingState(thread = selectedThread) {
      return thread?.operatingState || threadMemory.operatingState;
   }

   function getThreadCognitiveLoad(thread = selectedThread) {
      return thread?.cognitiveLoad || threadMemory.cognitiveLoad;
   }

   function getThreadUpdatedAt(thread = selectedThread) {
      return thread?.updatedAt || threadMemory.updatedAt;
   }

   function getThreadSuggestedDestination(thread = selectedThread) {
      return thread?.suggestedDestination || threadMemory.suggestedDestination;
   }

   function getStageLabel(stage: ThreadMemoryState["currentStage"]) {
      switch (stage) {
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

   function getStatusLabel(status: ThreadMemoryState["status"]) {
      switch (status) {
         case "active":
            return "Active";

         case "ready":
            return "Ready";

         case "preserved":
            return "Preserved";

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

   function getLocationLabel(location: ThreadMemoryState["lastKnownLocation"]) {
      switch (location) {
         case "canvas":
            return "Canvas";

         case "task":
            return "Task Vault";

         case "board":
            return "Project Board";

         case "notes":
            return "Notes Vault";

         case "integrations":
            return "Integrations";

         case "system":
            return "System";

         default:
            return "Unknown";
      }
   }

   function getSuggestedDestinationLabel(destination: ThreadMemoryState["suggestedDestination"]) {
      switch (destination) {
         case "canvas":
            return "Canvas";

         case "task":
            return "Task Vault";

         case "board":
            return "Project Board";

         case "notes":
            return "Notes Vault";

         case "integrations":
            return "Integrations";

         default:
            return "Standby";
      }
   }

   function getTimeLabel(timestamp?: number) {
      if (!timestamp) {
         return "Unknown";
      }

      return new Date(timestamp).toLocaleString([], {
         month: "short",

         day: "numeric",

         hour: "numeric",

         minute: "2-digit",
      });
   }

   function buildAutoSnapshot(thread = selectedThread) {
      if (!thread) {
         return "";
      }

      return `
Thread Snapshot

Thread:
${getThreadTitle(thread)}

What this thread is about:
${getThreadSourceContent(thread)}

Last meaningful progress:
Latest movement was ${getThreadLatestMovement(thread)}.

Current state:
Stage is ${getStageLabel(getThreadStage(thread))}. Status is ${getStatusLabel(getThreadStatus(thread))}. Last known location is ${getLocationLabel(getThreadLocation(thread))}.

Next recommended action:
${getThreadRecommendedMove(thread)}

Export-ready summary:
${getThreadSourceContent(thread)}
      `.trim();
   }

   function saveSnapshotVersionForThread(thread = selectedThread, value = snapshotDraft) {
      if (!thread?.workflowId) {
         showNotice("No thread");

         return;
      }

      const cleanSnapshot = value.trim();

      if (!cleanSnapshot) {
         showNotice("No snapshot");

         return;
      }

      const newSnapshot: ThreadSnapshotVersion = {
         id: crypto.randomUUID(),

         threadId: thread.workflowId,

         title: getThreadTitle(thread),

         snapshot: cleanSnapshot,

         createdAt: Date.now(),

         updatedAt: Date.now(),
      };

      const nextSnapshots = sortSnapshotsNewestFirst([newSnapshot, ...threadSnapshots]).slice(0, 100);

      saveStoredThreadSnapshots(nextSnapshots);

      setThreadSnapshots(nextSnapshots);

      setSelectedSnapshotId(newSnapshot.id);

      setSnapshotDraft(cleanSnapshot);

      logRecoveryEvent("Thread snapshot version saved", `Thread Recovery saved a snapshot version for: ${getThreadTitle(thread)}`, thread);

      showNotice("Snapshot Version Saved");
   }

   function autoGenerateSnapshot(thread = selectedThread) {
      if (!thread) {
         showNotice("No thread");

         return;
      }

      const generatedSnapshot = buildAutoSnapshot(thread);

      setSnapshotDraft(generatedSnapshot);

      showNotice("Snapshot Generated");
   }

   function selectSnapshotVersion(snapshot: ThreadSnapshotVersion) {
      setSelectedSnapshotId(snapshot.id);

      setSnapshotDraft(snapshot.snapshot);

      showNotice("Snapshot Selected");
   }

   function duplicateSnapshotVersion(snapshot: ThreadSnapshotVersion) {
      const duplicate: ThreadSnapshotVersion = {
         id: crypto.randomUUID(),

         threadId: snapshot.threadId,

         title: snapshot.title,

         snapshot: snapshot.snapshot,

         createdAt: Date.now(),

         updatedAt: Date.now(),
      };

      const nextSnapshots = sortSnapshotsNewestFirst([duplicate, ...threadSnapshots]).slice(0, 100);

      saveStoredThreadSnapshots(nextSnapshots);

      setThreadSnapshots(nextSnapshots);

      setSelectedSnapshotId(duplicate.id);

      setSnapshotDraft(duplicate.snapshot);

      showNotice("Snapshot Duplicated");
   }

   function deleteSnapshotVersion(snapshotId: string) {
      const nextSnapshots = threadSnapshots.filter((snapshot) => snapshot.id !== snapshotId);

      saveStoredThreadSnapshots(nextSnapshots);

      setThreadSnapshots(nextSnapshots);

      if (selectedSnapshotId === snapshotId) {
         const nextLatestSnapshot = sortSnapshotsNewestFirst(nextSnapshots.filter((snapshot) => snapshot.threadId === selectedThread?.workflowId))[0];

         setSelectedSnapshotId(nextLatestSnapshot?.id || null);

         setSnapshotDraft(nextLatestSnapshot?.snapshot || "");
      }

      showNotice("Snapshot Deleted");
   }

   function clearAllSnapshotsForThread(thread = selectedThread) {
      if (!thread?.workflowId) {
         showNotice("No thread");

         return;
      }

      const nextSnapshots = threadSnapshots.filter((snapshot) => snapshot.threadId !== thread.workflowId);

      saveStoredThreadSnapshots(nextSnapshots);

      setThreadSnapshots(nextSnapshots);

      setSelectedSnapshotId(null);

      setSnapshotDraft("");

      showNotice("Thread Snapshots Cleared");
   }

   function getExportBodyForThread(thread = selectedThread) {
      const snapshot = getSnapshotText(thread);

      if (snapshot.trim()) {
         return snapshot.trim();
      }

      return getThreadSourceContent(thread);
   }

   function logRecoveryEvent(title: string, summary: string, thread = selectedThread) {
      window.dispatchEvent(
         new CustomEvent("allevin-log-workflow-event", {
            detail: {
               id: crypto.randomUUID(),

               type: "insight",

               source: "system",

               destination: "system",

               title,

               summary,

               sourceTitle: getThreadTitle(thread),

               sourceContent: getThreadSourceContent(thread),

               workingSummary: getThreadWorkingSummary(thread),

               cleanSourceContent: getThreadSourceContent(thread),

               workflowId: getWorkflowId(thread),

               originBoardItemId: getOriginBoardItemId(thread),

               createdAt: Date.now(),
            },
         }),
      );

      readThreadMemory({
         sync: true,

         delay: 350,
      });
   }

   // ========================================
   // Thread Archive / Pause Actions
   // ========================================

   function pauseThread(thread = selectedThread) {
      if (!thread?.workflowId) {
         showNotice("No thread");

         return;
      }

      const nextArchivedIds = Array.from(new Set([...archivedThreadIds, thread.workflowId]));

      saveStoredArchivedThreadIds(nextArchivedIds);

      setArchivedThreadIds(nextArchivedIds);

      selectNextAvailableThread(nextArchivedIds);

      logRecoveryEvent("Thread paused", `Thread Recovery paused this thread: ${getThreadTitle(thread)}`, thread);

      syncRecoveryWorkspaceStatus("recovery-available");

      showNotice("Thread Paused");
   }

   function deleteThread(thread = selectedThread) {
      if (!thread?.workflowId) {
         showNotice("No thread");

         return;
      }

      if (pendingDeleteThreadId !== thread.workflowId) {
         setPendingDeleteThreadId(thread.workflowId);

         showNotice("Confirm delete");

         return;
      }

      const nextDeletedIds = Array.from(new Set([...deletedThreadIds, thread.workflowId]));

      const nextDeletedKeys = Array.from(new Set([...deletedThreadKeys, ...getThreadDeleteKeys(thread)]));

      const nextArchivedIds = archivedThreadIds.filter((threadId) => threadId !== thread.workflowId);

      const nextSnapshots = threadSnapshots.filter((snapshot) => snapshot.threadId !== thread.workflowId);

      saveStoredDeletedThreadIds(nextDeletedIds);

      saveStoredDeletedThreadKeys(nextDeletedKeys);

      saveStoredArchivedThreadIds(nextArchivedIds);

      saveStoredThreadSnapshots(nextSnapshots);

      deleteProjectMemory({
         workflowId: thread.workflowId,
         originBoardItemId: thread.originBoardItemId,
         title: getThreadTitle(thread),
      });

      removeStoredWorkflowTimelineForThread(thread);

      setDeletedThreadIds(nextDeletedIds);

      setDeletedThreadKeys(nextDeletedKeys);

      setArchivedThreadIds(nextArchivedIds);

      setThreadSnapshots(nextSnapshots);

      setPendingDeleteThreadId(null);

      if (selectedThreadId === thread.workflowId) {
         setSelectedSnapshotId(null);

         setSnapshotDraft("");

         selectNextAvailableThread(nextArchivedIds, nextDeletedIds, nextDeletedKeys);
      }

      // Do not log the deletion as a new recovery signal.
      // The tombstone/storage update is enough, and it prevents
      // "Thread deleted" from becoming the newest recoverable item.
      window.dispatchEvent(new Event("allevin-project-memory-update"));

      window.dispatchEvent(new Event("allevin-memory-update"));

      syncRecoveryWorkspaceStatus("recovery-available");

      showNotice("Thread Deleted");
   }

   function cancelDeleteThread() {
      setPendingDeleteThreadId(null);

      showNotice("Delete canceled");
   }

   function restoreThread(thread: ThreadMemoryObject) {
      if (!thread.workflowId) {
         showNotice("No thread");

         return;
      }

      const nextArchivedIds = archivedThreadIds.filter((threadId) => threadId !== thread.workflowId);

      saveStoredArchivedThreadIds(nextArchivedIds);

      setArchivedThreadIds(nextArchivedIds);

      manualSelectionRef.current = true;

      setSelectedThreadId(thread.workflowId);

      setDraftFromLatestSnapshot(thread);

      logRecoveryEvent("Thread restored", `Thread Recovery restored this thread: ${getThreadTitle(thread)}`, thread);

      syncRecoveryWorkspaceStatus("recovery-available");

      showNotice("Thread Restored");
   }

   function clearArchivedThreads() {
      saveStoredArchivedThreadIds([]);

      setArchivedThreadIds([]);

      showNotice("Archive Cleared");
   }

   // ========================================
   // Main Thread Actions
   // ========================================

   function resumeThreadInCanvas(thread = selectedThread) {
      if (!thread) {
         showNotice("No thread");

         return;
      }

      const snapshot = getSnapshotText(thread);

      const resumeTitle = getThreadTitle(thread);

      const resumeBody = `
Focus:
${snapshot || getThreadSourceContent(thread)}

Next Step:
${getThreadRecommendedMove(thread)}
      `.trim();

      upsertProjectMemory({
         title: resumeTitle,
         body: resumeBody,
         sourceTitle: resumeTitle,
         sourceContent: snapshot || getThreadSourceContent(thread),
         workingSummary: getThreadWorkingSummary(thread),
         workflowId: getWorkflowId(thread),
         originBoardItemId: getOriginBoardItemId(thread),
         source: "thread-recovery",
         destination: "canvas",
         stage: "drafting",
         status: "active",
         priority: "medium",
         recommendedNextAction: getThreadRecommendedMove(thread),
         latestMovement: "thread-recovery → canvas",
      });

      window.dispatchEvent(
         new CustomEvent("allevin-request-workflow-action", {
            detail: {
               actionType: "send-to-canvas",

               source: "thread-recovery",

               destination: "canvas",

               title: resumeTitle,

               body: resumeBody,

               reason: "Thread Recovery prepared this work to resume in Canvas. Nothing has moved yet. Approve the pending action to open it in Canvas, cancel to stop, or edit it in Workflow Control.",

               workflowId: getWorkflowId(thread),

               originBoardItemId: getOriginBoardItemId(thread),

               metadata: {
                  sourceTitle: resumeTitle,

                  sourceContent: snapshot || getThreadSourceContent(thread),

                  workingSummary: getThreadWorkingSummary(thread),

                  cleanSourceContent: snapshot || getThreadSourceContent(thread),

                  threadStage: getStageLabel(getThreadStage(thread)),

                  threadStatus: getStatusLabel(getThreadStatus(thread)),

                  threadLocation: getLocationLabel(getThreadLocation(thread)),
               },

               createdAt: Date.now(),
            },
         }),
      );

      syncRecoveryWorkspaceStatus("awaiting-approval");

      showNotice("Resume prepared for review");
   }

   function createFocusTask(thread = selectedThread) {
      if (!thread) {
         showNotice("No thread");

         return;
      }

      const snapshot = getSnapshotText(thread);

      const taskTitle = getThreadTitle(thread);

      const taskDescription = `
ALLEVIN Thread Recovery Focus Prepare Task

Thread:
${getThreadTitle(thread)}

Selected Snapshot:
${snapshot || "No snapshot selected."}

Clean Source:
${getThreadSourceContent(thread)}

Stage:
${getStageLabel(getThreadStage(thread))}

Status:
${getStatusLabel(getThreadStatus(thread))}

Last Known Location:
${getLocationLabel(getThreadLocation(thread))}

Recommended Next Step:
${getThreadRecommendedMove(thread)}
      `.trim();

      upsertProjectMemory({
         title: taskTitle,
         body: taskDescription,
         sourceTitle: taskTitle,
         sourceContent: snapshot || getThreadSourceContent(thread),
         workingSummary: getThreadWorkingSummary(thread),
         workflowId: getWorkflowId(thread),
         originBoardItemId: getOriginBoardItemId(thread),
         source: "thread-recovery",
         destination: "task",
         stage: "tasking",
         status: "active",
         priority: "medium",
         recommendedNextAction: getThreadRecommendedMove(thread),
         latestMovement: "thread-recovery → task",
      });

      window.dispatchEvent(
         new CustomEvent("allevin-request-workflow-action", {
            detail: {
               actionType: "send-to-task",

               source: "thread-recovery",

               destination: "task",

               title: taskTitle,

               body: taskDescription,

               reason: "Thread Recovery prepared this work as a follow-up task. Nothing has moved yet. Approve the pending action to create it in Task Vault, cancel to stop, or edit it in Workflow Control.",

               workflowId: getWorkflowId(thread),

               originBoardItemId: getOriginBoardItemId(thread),

               priority: "medium",

               metadata: {
                  sourceTitle: getThreadTitle(thread),

                  sourceContent: snapshot || getThreadSourceContent(thread),

                  workingSummary: getThreadWorkingSummary(thread),

                  cleanSourceContent: snapshot || getThreadSourceContent(thread),

                  threadStage: getStageLabel(getThreadStage(thread)),

                  threadStatus: getStatusLabel(getThreadStatus(thread)),

                  threadLocation: getLocationLabel(getThreadLocation(thread)),
               },

               createdAt: Date.now(),
            },
         }),
      );

      syncRecoveryWorkspaceStatus("awaiting-approval");

      showNotice("Task prepared for review");
   }

   function prepareExport(thread = selectedThread) {
      if (!thread) {
         showNotice("No thread");

         return;
      }

      const exportTitle = getThreadTitle(thread);

      const exportBody = getExportBodyForThread(thread);

      upsertProjectMemory({
         title: exportTitle,
         body: exportBody,
         sourceTitle: exportTitle,
         sourceContent: exportBody,
         workingSummary: getThreadWorkingSummary(thread),
         workflowId: getWorkflowId(thread),
         originBoardItemId: getOriginBoardItemId(thread),
         source: "thread-recovery",
         destination: "notes",
         stage: "exporting",
         status: "active",
         priority: "medium",
         recommendedNextAction: "Review the internal output preview, then save the final note when ready.",
         latestMovement: "thread-recovery → notes",
      });

      window.dispatchEvent(
         new CustomEvent("allevin-request-workflow-action", {
            detail: {
               actionType: "prepare-integration",

               source: "thread-recovery",

               destination: "notes",

               integrationDestination: "notes",

               objectType: "project-summary",

               title: exportTitle,

               body: exportBody,

               reason: "Thread Recovery prepared this work for Internal Notes. Nothing has moved yet. Approve the pending action to send it to Integrations, cancel to stop, or edit it in Workflow Control.",

               workflowId: getWorkflowId(thread),

               originBoardItemId: getOriginBoardItemId(thread),

               metadata: {
                  sourceTitle: exportTitle,

                  sourceContent: exportBody,

                  workingSummary: getThreadWorkingSummary(thread),

                  cleanSourceContent: exportBody,

                  threadStage: getStageLabel(getThreadStage(thread)),

                  threadStatus: getStatusLabel(getThreadStatus(thread)),

                  threadLocation: getLocationLabel(getThreadLocation(thread)),
               },

               createdAt: Date.now(),
            },
         }),
      );

      syncRecoveryWorkspaceStatus("awaiting-approval");

      showNotice("Internal output prepared for review");
   }

   function clearRecoveryMemory() {
      resetRecoveryLayer();
   }

   // ========================================
   // Render Helpers
   // ========================================

   function renderThreadCard(thread: ThreadMemoryObject, paused = false) {
      const selected = thread.workflowId === selectedThread?.workflowId;

      const snapshotCount = getSnapshotCount(thread);

      const latestSnapshot = getLatestSnapshotForThread(thread);

      return (
         <div
            key={thread.workflowId}
            className={`
               rounded-2xl
               border
               p-4
               transition-colors

               ${
                  selected && !paused
                     ? `
                        border-[var(--color-primary)]
                        bg-[rgba(48,92,222,0.08)]
                     `
                     : `
                        border-[var(--border-subtle)]
                        bg-[var(--color-bg)]
                     `
               }
            `}
         >
            <div className="mb-2 flex items-center justify-between gap-3">
               <p className="truncate text-sm font-medium">{thread.title}</p>

               <div className="flex items-center gap-2">
                  {snapshotCount > 0 && (
                     <span className="rounded-xl bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]">
                        {snapshotCount} Snapshot{snapshotCount === 1 ? "" : "s"}
                     </span>
                  )}

                  {paused && <span className="rounded-xl bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]">Paused</span>}

                  {selected && !paused && <span className="rounded-xl bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-primary)]">Selected</span>}
               </div>
            </div>

            <p className="line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">{latestSnapshot?.snapshot || getThreadSourceContent(thread)}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
               <span className="rounded-xl bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]">{getStageLabel(thread.currentStage)}</span>

               <span className="rounded-xl bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]">{getLocationLabel(thread.lastKnownLocation)}</span>

               <span className="rounded-xl bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]">
                  {getDisplaySignalCount(thread.signalCount)} signal{getDisplaySignalCount(thread.signalCount) === 1 ? "" : "s"}
               </span>
            </div>

            {!paused ? (
               <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-6">
                  <button onClick={() => selectThread(thread.workflowId)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                     <Eye size={13} />
                     Select
                  </button>

                  <button onClick={() => resumeThreadInCanvas(thread)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                     <Send size={13} />
                     Resume
                  </button>

                  <button onClick={() => createFocusTask(thread)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                     <ListChecks size={13} />
                     Task
                  </button>

                  <button onClick={() => prepareExport(thread)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                     <FileText size={13} />
                     Export
                  </button>

                  <button onClick={() => pauseThread(thread)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                     <PauseCircle size={13} />
                     Pause
                  </button>

                  {pendingDeleteThreadId === thread.workflowId ? (
                     <button onClick={() => deleteThread(thread)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-[var(--color-bg)]">
                        <Trash2 size={13} />
                        Confirm
                     </button>
                  ) : (
                     <button onClick={() => deleteThread(thread)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                        <Trash2 size={13} />
                        Delete
                     </button>
                  )}
               </div>
            ) : (
               <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-3">
                  <button onClick={() => restoreThread(thread)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                     <Undo2 size={13} />
                     Restore
                  </button>

                  <button onClick={() => prepareExport(thread)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                     <FileText size={13} />
                     Export
                  </button>

                  {pendingDeleteThreadId === thread.workflowId ? (
                     <button onClick={() => deleteThread(thread)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-[var(--color-bg)]">
                        <Trash2 size={13} />
                        Confirm
                     </button>
                  ) : (
                     <button onClick={() => deleteThread(thread)} className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]">
                        <Trash2 size={13} />
                        Delete
                     </button>
                  )}
               </div>
            )}
         </div>
      );
   }

   // ========================================
   // Render
   // ========================================

   if (!mounted) return null;

   return (
      <motion.section
         id="thread-recovery"
         layout
         initial={{ opacity: 0, y: 10 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: 0.35 }}
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
               <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-bg)]">
                  <GitBranch size={24} />
               </div>

               <div>
                  <p className="text-sm text-[var(--color-text-secondary)]">ALLEVIN MK II recovery layer</p>

                  <h2 className="mt-1 text-3xl">Thread Recovery</h2>

                  <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">
                     Pick up where you left off. Select recent work, choose what you want to do next, and approve the action before ALLEVIN moves anything. Recovery stays calm, readable, and easy to review.
                  </p>
               </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
               {notice && <div className="rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">{notice}</div>}

               <button onClick={refreshPanelToNewest} className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]">
                  <RotateCcw size={16} />
                  Latest
               </button>

               <button onClick={refreshPanel} className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]">
                  <RotateCcw size={16} />
                  Scan Work
               </button>

               <button onClick={resetRecoveryLayer} className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]">
                  <Trash2 size={16} />
                  Reset
               </button>
            </div>
         </div>

         {/* Recovery Guide */}

         <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Step 1</p>

               <p className="mt-2 text-sm font-medium">Scan recent work</p>

               <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">Refresh the work ALLEVIN remembers.</p>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Step 2</p>

               <p className="mt-2 text-sm font-medium">Select the thread</p>

               <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">Pick the project you want to continue.</p>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Step 3</p>

               <p className="mt-2 text-sm font-medium">Prepare, then approve</p>

               <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">Resume, Task, and Export appear in Workflow Control for review.</p>
            </div>
         </div>

         {/* Recovery Lists */}

         {!hasRecoverableThread && archivedThreads.length === 0 ? (
            <div className="rounded-2xl bg-[var(--color-bg)] p-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
               No recoverable thread is active yet. Start in Canvas, send the work to Tasks, then move it through the Board so ALLEVIN has something meaningful to recover later.
            </div>
         ) : (
            <div className="space-y-5">
               {/* Active Work */}

               <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
                  <button onClick={() => setActiveThreadsOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left">
                     <div className="flex items-center gap-3">
                        <Sparkles size={18} />

                        <div>
                           <p className="font-medium">Work I’m On</p>

                           <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Work that looks active or ready to continue.</p>
                        </div>
                     </div>

                     <div className="flex items-center gap-2">
                        <span className="rounded-xl bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]">{activeWorkThreads.length}</span>

                        <ChevronDown size={18} className={`transition-transform duration-200 ${activeThreadsOpen ? "rotate-180" : ""}`} />
                     </div>
                  </button>

                  <AnimatePresence initial={false}>
                     {activeThreadsOpen && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                           {activeWorkThreads.length === 0 ? (
                              <div className="mt-4 rounded-2xl bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text-secondary)]">No current working thread is active yet. Create or move work through Canvas, Tasks, or Board, then scan again.</div>
                           ) : (
                              <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">{activeWorkThreads.slice(0, 8).map((thread) => renderThreadCard(thread))}</div>
                           )}
                        </motion.div>
                     )}
                  </AnimatePresence>
               </div>

               {/* Recent Threads */}

               <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
                  <button onClick={() => setRecentThreadsOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left">
                     <div className="flex items-center gap-3">
                        <History size={18} />

                        <div>
                           <p className="font-medium">Recent Threads</p>

                           <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Older work ALLEVIN can help you resume, task, or export.</p>
                        </div>
                     </div>

                     <div className="flex items-center gap-2">
                        <span className="rounded-xl bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]">{recentWorkThreads.length}</span>

                        <ChevronDown size={18} className={`transition-transform duration-200 ${recentThreadsOpen ? "rotate-180" : ""}`} />
                     </div>
                  </button>

                  <AnimatePresence initial={false}>
                     {recentThreadsOpen && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                           {recentWorkThreads.length === 0 ? (
                              <div className="mt-4 rounded-2xl bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text-secondary)]">No older recent threads yet. Current work appears in Work I’m On, and paused work appears in Paused Threads.</div>
                           ) : (
                              <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">{recentWorkThreads.slice(0, 8).map((thread) => renderThreadCard(thread))}</div>
                           )}
                        </motion.div>
                     )}
                  </AnimatePresence>
               </div>

               {/* Paused Threads */}

               <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
                  <button onClick={() => setArchivedThreadsOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left">
                     <div className="flex items-center gap-3">
                        <Archive size={18} />

                        <div>
                           <p className="font-medium">Paused Threads</p>

                           <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Work you paused and saved for later.</p>
                        </div>
                     </div>

                     <div className="flex items-center gap-2">
                        <span className="rounded-xl bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]">{archivedThreads.length}</span>

                        <ChevronDown size={18} className={`transition-transform duration-200 ${archivedThreadsOpen ? "rotate-180" : ""}`} />
                     </div>
                  </button>

                  <AnimatePresence initial={false}>
                     {archivedThreadsOpen && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                           {archivedThreads.length === 0 ? (
                              <div className="mt-4 rounded-2xl bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text-secondary)]">No paused threads yet.</div>
                           ) : (
                              <div className="mt-4 space-y-3">
                                 <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{archivedThreads.slice(0, 8).map((thread) => renderThreadCard(thread, true))}</div>

                                 <button
                                    onClick={clearArchivedThreads}
                                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]"
                                 >
                                    <Trash2 size={15} />
                                    Clear Pause List
                                 </button>
                              </div>
                           )}
                        </motion.div>
                     )}
                  </AnimatePresence>
               </div>

               {/* Selected Recovery Area */}

               {hasRecoverableThread && (
                  <>
                     {/* Selected Thread Summary */}

                     <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
                        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                           <div className="min-w-0">
                              <p className="text-sm text-[var(--color-text-secondary)]">Selected Thread</p>

                              <h3 className="mt-1 truncate text-2xl">{getThreadTitle()}</h3>

                              <p className="mt-2 line-clamp-3 text-sm leading-7 text-[var(--color-text-secondary)]">{getThreadSourceContent()}</p>
                           </div>

                           <div className="shrink-0 rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">{getLocationLabel(getThreadLocation())}</div>
                        </div>

                        <div className="mb-4 rounded-2xl bg-[var(--color-bg)] p-4">
                           <div className="mb-2 flex items-center gap-2">
                              <Target size={16} />

                              <p className="text-sm font-medium">Recommended next step</p>
                           </div>

                           <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{getThreadRecommendedMove()}</p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
                           <button onClick={() => resumeThreadInCanvas()} className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-medium text-[var(--color-cream)] transition-opacity hover:opacity-90">
                              <Send size={16} />
                              Resume in Canvas
                           </button>

                           <button onClick={() => createFocusTask()} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]">
                              <ListChecks size={16} />
                              Create Task
                           </button>

                           <button onClick={() => prepareExport()} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]">
                              <FileText size={16} />
                              Prepare Internal Output
                           </button>

                           <button onClick={() => pauseThread()} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]">
                              <PauseCircle size={16} />
                              Pause
                           </button>

                           {pendingDeleteThreadId === selectedThread?.workflowId ? (
                              <button onClick={() => deleteThread()} className="flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
                                 <Trash2 size={16} />
                                 Confirm Delete
                              </button>
                           ) : (
                              <button onClick={() => deleteThread()} className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]">
                                 <Trash2 size={16} />
                                 Delete
                              </button>
                           )}
                        </div>

                        {pendingDeleteThreadId === selectedThread?.workflowId && (
                           <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700 xl:flex-row xl:items-center xl:justify-between">
                              <span>Delete removes this thread from Recovery and clears its snapshots. Pause only hides it for later.</span>

                              <button onClick={cancelDeleteThread} className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100">
                                 Cancel
                              </button>
                           </div>
                        )}
                     </div>

                     {/* Recovery Status */}

                     <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Stage</p>

                           <p className="mt-2 text-sm font-medium">{getStageLabel(getThreadStage())}</p>
                        </div>

                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Status</p>

                           <p className="mt-2 text-sm font-medium">{getStatusLabel(getThreadStatus())}</p>
                        </div>

                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Location</p>

                           <p className="mt-2 text-sm font-medium">{getLocationLabel(getThreadLocation())}</p>
                        </div>

                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Signals</p>

                           <p className="mt-2 text-sm font-medium">{getThreadSignals()}</p>
                        </div>

                        <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                           <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Confidence</p>

                           <p className="mt-2 text-sm font-medium">{getThreadConfidence()}%</p>
                        </div>
                     </div>

                     {/* Snapshot Editor */}

                     <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
                        <button onClick={() => setSnapshotOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left">
                           <div className="flex items-center gap-3">
                              <StickyNote size={18} />

                              <div>
                                 <p className="font-medium">Optional Snapshot</p>

                                 <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Save a checkpoint note when you want this thread to resume from a specific version.</p>
                              </div>
                           </div>

                           <ChevronDown size={18} className={`transition-transform duration-200 ${snapshotOpen ? "rotate-180" : ""}`} />
                        </button>

                        <AnimatePresence initial={false}>
                           {snapshotOpen && (
                              <motion.div
                                 initial={{ opacity: 0, height: 0 }}
                                 animate={{
                                    opacity: 1,
                                    height: "auto",
                                 }}
                                 exit={{ opacity: 0, height: 0 }}
                                 transition={{ duration: 0.2 }}
                                 className="overflow-hidden"
                              >
                                 <div className="mt-4 space-y-4">
                                    <textarea
                                       value={snapshotDraft}
                                       onChange={(event) => setSnapshotDraft(event.target.value)}
                                       placeholder="Write a thread snapshot, pause reason, checkpoint note, or export-ready summary..."
                                       className="
                                                   min-h-[220px]
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
                                                   placeholder:text-[var(--color-text-secondary)]
                                                "
                                    />

                                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
                                       <button
                                          onClick={() => autoGenerateSnapshot()}
                                          className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]"
                                       >
                                          <WandSparkles size={15} />
                                          Auto Snapshot
                                       </button>

                                       <button
                                          onClick={() => saveSnapshotVersionForThread()}
                                          className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-medium text-[var(--color-cream)] transition-opacity hover:opacity-90"
                                       >
                                          <Save size={15} />
                                          Save Version
                                       </button>

                                       <button
                                          onClick={() => clearAllSnapshotsForThread()}
                                          className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]"
                                       >
                                          <Trash2 size={15} />
                                          Clear Versions
                                       </button>

                                       <button
                                          onClick={() => setSnapshotDraft("")}
                                          className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]"
                                       >
                                          <StickyNote size={15} />
                                          Empty Draft
                                       </button>
                                    </div>
                                 </div>
                              </motion.div>
                           )}
                        </AnimatePresence>
                     </div>

                     {/* Snapshot History */}

                     <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
                        <button onClick={() => setSnapshotHistoryOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left">
                           <div className="flex items-center gap-3">
                              <CopyCheck size={18} />

                              <div>
                                 <p className="font-medium">Saved Snapshots</p>

                                 <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Previous checkpoint versions for this thread.</p>
                              </div>
                           </div>

                           <div className="flex items-center gap-2">
                              <span className="rounded-xl bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]">{getSnapshotsForThread().length}</span>

                              <ChevronDown size={18} className={`transition-transform duration-200 ${snapshotHistoryOpen ? "rotate-180" : ""}`} />
                           </div>
                        </button>

                        <AnimatePresence initial={false}>
                           {snapshotHistoryOpen && (
                              <motion.div
                                 initial={{ opacity: 0, height: 0 }}
                                 animate={{
                                    opacity: 1,
                                    height: "auto",
                                 }}
                                 exit={{ opacity: 0, height: 0 }}
                                 transition={{ duration: 0.2 }}
                                 className="overflow-hidden"
                              >
                                 {getSnapshotsForThread().length === 0 ? (
                                    <div className="mt-4 rounded-2xl bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text-secondary)]">No saved snapshot versions yet.</div>
                                 ) : (
                                    <div className="mt-4 space-y-3">
                                       {getSnapshotsForThread()
                                          .slice(0, 8)
                                          .map((snapshot, index) => {
                                             const selected = snapshot.id === selectedSnapshotId;

                                             return (
                                                <div
                                                   key={snapshot.id}
                                                   className={`
                                                               rounded-2xl
                                                               border
                                                               p-4

                                                               ${
                                                                  selected
                                                                     ? `
                                                                        border-[var(--color-primary)]
                                                                        bg-[rgba(48,92,222,0.08)]
                                                                     `
                                                                     : `
                                                                        border-[var(--border-subtle)]
                                                                        bg-[var(--color-bg)]
                                                                     `
                                                               }
                                                            `}
                                                >
                                                   <div className="mb-2 flex items-center justify-between gap-3">
                                                      <p className="text-sm font-medium">Snapshot Version {getSnapshotsForThread().length - index}</p>

                                                      <div className="flex items-center gap-2">
                                                         {selected && <span className="rounded-xl bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-primary)]">Selected</span>}

                                                         <span className="rounded-xl bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]">{getTimeLabel(snapshot.updatedAt)}</span>
                                                      </div>
                                                   </div>

                                                   <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-[var(--color-text-secondary)]">{snapshot.snapshot}</p>

                                                   <div className="mt-4 grid grid-cols-1 gap-2 xl:grid-cols-3">
                                                      <button
                                                         onClick={() => selectSnapshotVersion(snapshot)}
                                                         className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]"
                                                      >
                                                         <Eye size={13} />
                                                         Select
                                                      </button>

                                                      <button
                                                         onClick={() => duplicateSnapshotVersion(snapshot)}
                                                         className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]"
                                                      >
                                                         <CopyCheck size={13} />
                                                         Duplicate
                                                      </button>

                                                      <button
                                                         onClick={() => deleteSnapshotVersion(snapshot.id)}
                                                         className="flex items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]"
                                                      >
                                                         <Trash2 size={13} />
                                                         Delete
                                                      </button>
                                                   </div>
                                                </div>
                                             );
                                          })}
                                    </div>
                                 )}
                              </motion.div>
                           )}
                        </AnimatePresence>
                     </div>

                     {/* Source */}

                     <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
                        <div className="mb-3 flex items-center gap-3">
                           <Brain size={18} />

                           <p className="font-medium">What ALLEVIN Recovered</p>
                        </div>

                        <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-text-secondary)]">{getThreadSourceContent()}</p>
                     </div>

                     {/* Guidance */}

                     <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
                           <div className="mb-3 flex items-center gap-3">
                              <Target size={18} />

                              <p className="font-medium">Recommended Next Step</p>
                           </div>

                           <p className="text-sm leading-7 text-[var(--color-text-secondary)]">{getThreadRecommendedMove()}</p>
                        </div>

                        <div className="rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
                           <div className="mb-3 flex items-center gap-3">
                              <MapPin size={18} />

                              <p className="font-medium">Suggested Next Place</p>
                           </div>

                           <p className="text-sm leading-7 text-[var(--color-text-secondary)]">{getSuggestedDestinationLabel(getThreadSuggestedDestination())}</p>
                        </div>
                     </div>

                     {/* Approval Reminder */}

                     <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-5">
                        <div className="mb-3 flex items-center gap-3">
                           <ShieldCheck size={18} />

                           <p className="font-medium">Actions Ready for Review</p>
                        </div>

                        <p className="text-sm leading-7 text-[var(--color-text-secondary)]">These buttons prepare the next move. ALLEVIN will not move anything until you approve it in the MK II Assistant Dock or Workflow Control.</p>
                     </div>

                     {/* Details */}

                     <button onClick={() => setDetailsOpen((current) => !current)} className="flex w-full items-center justify-between rounded-2xl bg-[var(--color-bg)] p-4 text-left transition-colors hover:bg-white">
                        <div className="flex items-center gap-3">
                           <ShieldCheck size={18} />

                           <div>
                              <p className="font-medium">Recovery Details</p>

                              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Optional system details for deeper review. Most users can leave this closed.</p>
                           </div>
                        </div>

                        <ChevronDown size={18} className={`transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`} />
                     </button>

                     <AnimatePresence initial={false}>
                        {detailsOpen && (
                           <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{
                                 opacity: 1,
                                 height: "auto",
                              }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                           >
                              <div className="mb-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-4">
                                 <div className="mb-2 flex items-center gap-2">
                                    <ShieldCheck size={16} />

                                    <p className="text-sm font-medium">Advanced recovery controls</p>
                                 </div>

                                 <p className="text-sm leading-6 text-[var(--color-text-secondary)]">Most users can leave this alone. Use Reset Recovery only when you want to clear the recovery layer for a clean test.</p>

                                 <button onClick={resetRecoveryLayer} className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg)]">
                                    <Trash2 size={15} />
                                    Reset Recovery
                                 </button>
                              </div>

                              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                 <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                    <div className="mb-2 flex items-center gap-2">
                                       <Activity size={16} />

                                       <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Latest Movement</p>
                                    </div>

                                    <p className="text-sm font-medium">{getThreadLatestMovement()}</p>
                                 </div>

                                 <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                    <div className="mb-2 flex items-center gap-2">
                                       <Clock3 size={16} />

                                       <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Updated</p>
                                    </div>

                                    <p className="text-sm font-medium">{getTimeLabel(getThreadUpdatedAt())}</p>
                                 </div>

                                 <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                    <div className="mb-2 flex items-center gap-2">
                                       <Layers3 size={16} />

                                       <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Operating State</p>
                                    </div>

                                    <p className="text-sm font-medium">{getThreadOperatingState()}</p>
                                 </div>

                                 <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                    <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Cognitive Load</p>

                                    <p className="mt-2 text-sm font-medium">{getThreadCognitiveLoad()}</p>
                                 </div>

                                 {getWorkflowId() && (
                                    <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                       <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Thread ID</p>

                                       <p className="mt-2 break-all text-xs text-[var(--color-text-secondary)]">{getWorkflowId()}</p>
                                    </div>
                                 )}

                                 {getOriginBoardItemId() && (
                                    <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                                       <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Board ID</p>

                                       <p className="mt-2 break-all text-xs text-[var(--color-text-secondary)]">{getOriginBoardItemId()}</p>
                                    </div>
                                 )}
                              </div>
                           </motion.div>
                        )}
                     </AnimatePresence>
                  </>
               )}
            </div>
         )}
      </motion.section>
   );
}
