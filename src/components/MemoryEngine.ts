import { parseProjectDocument, readProjectMemory, type ParsedProjectDocument } from "@/lib/allevinProjectMemory";

import { buildProjectIntelligencePacket, getEmptyProjectIntelligencePacket, type ProjectIntelligencePacket, type ProjectMaterialInput } from "@/lib/projectIntelligenceEngine";

// ========================================
// Memory Engine
// Purpose:
// Persistent project memory system
// with temporal weighting, cognitive load,
// project context awareness,
// source-aware active project selection,
// and legacy thread-memory compatibility.
// ========================================

export interface MemoryEntry {
   id: string;

   message: string;

   timestamp: number;

   focusMode: string;

   workspace: string;
}

// ========================================
// Cognitive Profile
// ========================================

export interface CognitiveProfile {
   profile: string;

   confidence: number;

   recommendation: string;
}

// ========================================
// Behavioral Prediction
// ========================================

export interface BehavioralPrediction {
   predictedState: string;

   confidence: number;

   recommendation: string;
}

// ========================================
// Cognitive Load
// ========================================

export interface CognitiveLoadState {
   state: string;

   intensity: number;

   recentInteractions: number;
}

// ========================================
// MK VII Session / Welcome Summary
// Purpose:
// Lightweight system memory read for the
// welcome layer, AIDock, and calm status UI.
// ========================================

export interface AllevinSessionSummary {
   hasActiveThread: boolean;

   activeThreadTitle: string;

   activeThreadStage: ThreadMemoryStage | "unknown";

   activeThreadStatus: ThreadMemoryStatus | "unknown";

   activeThreadLocation: ThreadMemoryLocation | "unknown";

   activeThreadSignals: number;

   pendingApprovalCount: number;

   upcomingCalendarCount: number;

   calendarNoteCount: number;

   recentMemoryCount: number;

   cognitiveLoadState: string;

   cognitiveLoadIntensity: number;

   predictedState: string;

   predictedConfidence: number;

   recommendedNextAction: string;

   systemStatusLabel: string;

   welcomeLine: string;

   approvalReminder: string;

   updatedAt: number;
}

// ========================================
// Workflow Timeline Event
// Matches ALLEVIN Workflow Intel storage shape.
// ========================================

export interface WorkflowTimelineEvent {
   id: string;

   type?: string;

   source?: string;

   destination?: string;

   title: string;

   summary: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   cleanSourceContent?: string;

   workflowId?: string;

   originBoardItemId?: string;

   priority?: string;

   lane?: string;

   createdAt: number;
}

// ========================================
// Active Thread Awareness V1
// ========================================

export interface ActiveThreadState {
   hasActiveThread: boolean;

   workflowId?: string;

   originBoardItemId?: string;

   title: string;

   summary: string;

   signalCount: number;

   latestMovement: string;

   latestSource?: string;

   latestDestination?: string;

   latestEvent?: WorkflowTimelineEvent;

   confidence: number;

   recommendedNextAction: string;

   suggestedDestination: "canvas" | "task" | "board" | "notes" | "integrations" | "none";

   operatingState: string;

   cognitiveLoad: string;

   updatedAt: number;
}

// ========================================
// Thread Memory V2
// ========================================

export type ThreadMemoryLocation = "canvas" | "task" | "board" | "notes" | "integrations" | "system" | "unknown";

export type ThreadMemoryStage = "drafting" | "tasking" | "tracking" | "reviewing" | "preserved" | "exporting" | "exported" | "completed" | "paused" | "unknown";

export type ThreadMemoryStatus = "active" | "ready" | "preserved" | "exported" | "completed" | "paused" | "unknown";

export interface ThreadMovementEntry {
   id: string;

   source: string;

   destination: string;

   title: string;

   summary: string;

   createdAt: number;
}

export interface ThreadMemoryObject {
   id: string;

   workflowId: string;

   originBoardItemId?: string;

   title: string;

   cleanSourceContent: string;

   workingSummary: string;

   latestVisibleState: string;

   currentStage: ThreadMemoryStage;

   status: ThreadMemoryStatus;

   lastKnownLocation: ThreadMemoryLocation;

   signalCount: number;

   movementHistory: ThreadMovementEntry[];

   latestMovement: string;

   latestEvent?: WorkflowTimelineEvent;

   confidence: number;

   recommendedNextAction: string;

   suggestedDestination: "canvas" | "task" | "board" | "notes" | "integrations" | "none";

   operatingState: string;

   cognitiveLoad: string;

   createdAt: number;

   updatedAt: number;
}

export interface ThreadMemoryState {
   hasActiveThread: boolean;

   activeThread?: ThreadMemoryObject;

   threads: ThreadMemoryObject[];

   title: string;

   cleanSourceContent: string;

   workingSummary: string;

   currentStage: ThreadMemoryStage;

   status: ThreadMemoryStatus;

   lastKnownLocation: ThreadMemoryLocation;

   signalCount: number;

   latestMovement: string;

   confidence: number;

   recommendedNextAction: string;

   suggestedDestination: "canvas" | "task" | "board" | "notes" | "integrations" | "none";

   operatingState: string;

   cognitiveLoad: string;

   updatedAt: number;
}

export type SourceAwareProjectSource = "canvas" | "projects" | "materials" | "thread-memory" | "calendar" | "timeline";

export interface SourceAwareActiveProject {
   source: SourceAwareProjectSource;

   title: string;

   body: string;

   summary: string;

   workflowId?: string;

   originBoardItemId?: string;

   lastKnownLocation: ThreadMemoryLocation;

   currentStage: ThreadMemoryStage;

   status: ThreadMemoryStatus;

   recommendedNextAction: string;

   score: number;

   reason: string;

   updatedAt: number;

   // MK VII Project Awareness:
   // Preserve the saved roadmap and current Canvas as separate signals.
   projectBody?: string;

   projectDocument?: ParsedProjectDocument;

   projectUpdatedAt?: number;

   canvasContent?: string;

   canvasUpdatedAt?: number;
}

export interface ActiveProjectAwareness {
   hasActiveProject: boolean;

   source: SourceAwareProjectSource | "none";

   title: string;

   projectBody: string;

   projectDocument: ParsedProjectDocument;

   canvasContent: string;

   canvasUpdatedAt: number;

   projectUpdatedAt: number;

   workflowId?: string;

   originBoardItemId?: string;

   lastKnownLocation: ThreadMemoryLocation;

   currentStage: ThreadMemoryStage;

   status: ThreadMemoryStatus;

   latestMovement: string;

   recommendedNextAction: string;

   updatedAt: number;

   projectIntelligence: ProjectIntelligencePacket;
}

// ========================================
// Storage Keys
// ========================================

const STORAGE_KEY = "allevin-memory";

const WORKFLOW_TIMELINE_STORAGE_KEY = "allevin-global-workflow-timeline";

const THREAD_MEMORY_V2_STORAGE_KEY = "allevin-thread-memory-v2";

const WORKFLOW_CONTROL_PENDING_ACTIONS_KEY = "allevin-workflow-control-pending-actions";

const CALENDAR_EVENTS_STORAGE_KEY = "allevin-calendar-events-mki";

const CALENDAR_NOTES_STORAGE_KEY = "allevin-calendar-notes-mki";

const DELETED_CALENDAR_EVENTS_STORAGE_KEY = "allevin-calendar-deleted-events";

const DELETED_CALENDAR_EVENT_KEYS_STORAGE_KEY = "allevin-calendar-deleted-keys";

const DELETED_THREADS_STORAGE_KEY = "allevin-thread-recovery-deleted";

const DELETED_THREAD_KEYS_STORAGE_KEY = "allevin-thread-recovery-deleted-keys";

const DELETED_PROJECTS_STORAGE_KEY = "allevin-project-deleted";

const DELETED_PROJECT_KEYS_STORAGE_KEY = "allevin-project-deleted-keys";

const CANVAS_STORAGE_KEY = "allevin-adaptive-work-canvas";

const PROJECT_LIBRARY_STORAGE_KEY = "allevin-project-library";

const PROJECT_MATERIALS_STORAGE_KEY = "allevin-project-materials-mkvi";

// ========================================
// MK VII — Memory Engine Sanitization
// MemoryEngine reads Canvas, Projects, Calendar, and Materials sources. Every stored field is treated as untrusted.
// ========================================

const MEMORY_ENGINE_SANITIZE_LIMITS = {
   title: 120,
   body: 100000,
   summary: 1500,
   recommendation: 1000,
   movement: 300,
   id: 180,
   memoryMessage: 4000,
   smallText: 300,
} as const;

function limitMemoryEngineTextLength(value: string, maxLength: number) {
   if (value.length <= maxLength) {
      return value;
   }

   return value.slice(0, maxLength).trim();
}

function stripUnsafeMemoryEngineMarkup(value?: string) {
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

function sanitizeMemoryEngineText(value?: string, maxLength: number = MEMORY_ENGINE_SANITIZE_LIMITS.body) {
   return limitMemoryEngineTextLength(
      stripUnsafeMemoryEngineMarkup(value)
         .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
         .replace(/\u2028|\u2029/g, "\n")
         .replace(/\r/g, "\n")
         .trim(),
      maxLength,
   );
}

function sanitizeMemoryEngineTitle(value?: string) {
   return sanitizeMemoryEngineText(value, MEMORY_ENGINE_SANITIZE_LIMITS.title).replace(/\n+/g, " ").trim();
}

function sanitizeMemoryEngineSummary(value?: string) {
   return sanitizeMemoryEngineText(value, MEMORY_ENGINE_SANITIZE_LIMITS.summary);
}

function sanitizeMemoryEngineRecommendation(value?: string) {
   return sanitizeMemoryEngineText(value, MEMORY_ENGINE_SANITIZE_LIMITS.recommendation);
}

function sanitizeMemoryEngineMovement(value?: string) {
   return sanitizeMemoryEngineText(value, MEMORY_ENGINE_SANITIZE_LIMITS.movement).replace(/\n+/g, " ").trim();
}

function sanitizeMemoryEngineId(value?: string) {
   return sanitizeMemoryEngineText(value, MEMORY_ENGINE_SANITIZE_LIMITS.id)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .trim();
}

function isValidMemoryEngineTimestamp(value?: number) {
   return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clampMemoryEngineConfidence(value?: number, fallback = 60) {
   return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
}

function sanitizeMemoryEntry(entry: Partial<MemoryEntry>): MemoryEntry | null {
   const message = sanitizeMemoryEngineText(entry.message, MEMORY_ENGINE_SANITIZE_LIMITS.memoryMessage);

   if (!message) {
      return null;
   }

   return {
      id: sanitizeMemoryEngineId(entry.id) || crypto.randomUUID(),
      message,
      timestamp: isValidMemoryEngineTimestamp(entry.timestamp) ? Number(entry.timestamp) : Date.now(),
      focusMode: sanitizeMemoryEngineText(entry.focusMode, MEMORY_ENGINE_SANITIZE_LIMITS.smallText) || "balanced",
      workspace: sanitizeMemoryEngineText(entry.workspace, MEMORY_ENGINE_SANITIZE_LIMITS.smallText) || "workspace",
   };
}

function sanitizeWorkflowTimelineEvent(event: Partial<WorkflowTimelineEvent>): WorkflowTimelineEvent | null {
   const id = sanitizeMemoryEngineId(event.id) || crypto.randomUUID();

   const title = sanitizeMemoryEngineTitle(getCanonicalProjectTitle(event.title) || event.title);

   const summary = sanitizeMemoryEngineSummary(event.summary || event.sourceContent || event.workingSummary || title);

   const createdAt = isValidMemoryEngineTimestamp(event.createdAt) ? Number(event.createdAt) : Date.now();

   if (!title && !summary) {
      return null;
   }

   return {
      id,
      type: sanitizeMemoryEngineText(event.type, MEMORY_ENGINE_SANITIZE_LIMITS.smallText),
      source: sanitizeMemoryEngineText(event.source, MEMORY_ENGINE_SANITIZE_LIMITS.smallText),
      destination: sanitizeMemoryEngineText(event.destination, MEMORY_ENGINE_SANITIZE_LIMITS.smallText),
      title: title || "Workflow event",
      summary: summary || title || "Workflow event",
      sourceTitle: sanitizeMemoryEngineTitle(getCanonicalProjectTitle(event.sourceTitle) || event.sourceTitle),
      sourceContent: sanitizeMemoryEngineText(event.sourceContent, MEMORY_ENGINE_SANITIZE_LIMITS.body),
      workingSummary: sanitizeMemoryEngineSummary(event.workingSummary),
      cleanSourceContent: sanitizeMemoryEngineText(event.cleanSourceContent, MEMORY_ENGINE_SANITIZE_LIMITS.body),
      workflowId: sanitizeMemoryEngineId(event.workflowId),
      originBoardItemId: sanitizeMemoryEngineId(event.originBoardItemId),
      priority: sanitizeMemoryEngineText(event.priority, MEMORY_ENGINE_SANITIZE_LIMITS.smallText),
      lane: sanitizeMemoryEngineText(event.lane, MEMORY_ENGINE_SANITIZE_LIMITS.smallText),
      createdAt,
   };
}

function sanitizeThreadMovementEntry(movement: Partial<ThreadMovementEntry>): ThreadMovementEntry {
   return {
      id: sanitizeMemoryEngineId(movement.id) || crypto.randomUUID(),
      source: sanitizeMemoryEngineText(movement.source, MEMORY_ENGINE_SANITIZE_LIMITS.smallText) || "system",
      destination: sanitizeMemoryEngineText(movement.destination, MEMORY_ENGINE_SANITIZE_LIMITS.smallText) || "system",
      title: sanitizeMemoryEngineTitle(getCanonicalProjectTitle(movement.title) || movement.title) || "Thread movement",
      summary: sanitizeMemoryEngineSummary(movement.summary),
      createdAt: isValidMemoryEngineTimestamp(movement.createdAt) ? Number(movement.createdAt) : Date.now(),
   };
}

// ========================================
// Notify Live Systems
// ========================================

function notifyMemoryUpdate() {
   if (typeof window === "undefined") {
      return;
   }

   window.dispatchEvent(new CustomEvent("allevin-memory-update"));
}

function readArrayStorage<T = any>(key: string): T[] {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(key);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed : [];
   } catch {
      localStorage.removeItem(key);

      return [];
   }
}

function getRecentMemoryWindow(limit = 8) {
   return getMemory().slice(-limit);
}

function getNormalizedCalendarTitleKey(value?: string) {
   return compactText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
}

function readStringArrayStorageSafe(key: string) {
   if (typeof window === "undefined") {
      return [] as string[];
   }

   const stored = localStorage.getItem(key);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed)
         ? parsed
              .filter((item) => typeof item === "string")
              .map((item) => sanitizeMemoryEngineText(item, MEMORY_ENGINE_SANITIZE_LIMITS.smallText))
              .filter(Boolean)
         : [];
   } catch {
      localStorage.removeItem(key);

      return [];
   }
}

function removeMemoryEngineStorageValues(key: string, values: string[]) {
   if (typeof window === "undefined" || !values.length) {
      return;
   }

   const valueSet = new Set(values.filter(Boolean));

   const nextValues = readStringArrayStorageSafe(key).filter((value) => !valueSet.has(value));

   if (nextValues.length) {
      localStorage.setItem(key, JSON.stringify(nextValues));
   } else {
      localStorage.removeItem(key);
   }
}

// MK VII — Live Canvas revival
// A real project visibly open in Canvas is the current source of truth.
// Clear stale deletion tombstones so a recreated project can immediately
// rebuild its canonical project context and Project Intelligence Packet.
function clearDeletedProjectMemorySignal(value: { id?: string; workflowId?: string; originBoardItemId?: string; title?: string; sourceTitle?: string }) {
   if (typeof window === "undefined") {
      return;
   }

   const titleKey = getNormalizedProjectTitleKey(value.sourceTitle || value.title);

   const ids = [value.id, value.workflowId, value.originBoardItemId].filter(Boolean) as string[];

   const keys = [
      value.id ? `event:${value.id}` : "",
      value.id ? `thread:${value.id}` : "",
      value.id ? `project:${value.id}` : "",
      value.workflowId ? `workflow:${value.workflowId}` : "",
      value.originBoardItemId ? `origin:${value.originBoardItemId}` : "",
      titleKey ? `title:${titleKey}` : "",
   ].filter(Boolean);

   removeMemoryEngineStorageValues(DELETED_THREADS_STORAGE_KEY, ids);
   removeMemoryEngineStorageValues(DELETED_PROJECTS_STORAGE_KEY, ids);
   removeMemoryEngineStorageValues(DELETED_CALENDAR_EVENTS_STORAGE_KEY, ids);
   removeMemoryEngineStorageValues(DELETED_THREAD_KEYS_STORAGE_KEY, keys);
   removeMemoryEngineStorageValues(DELETED_PROJECT_KEYS_STORAGE_KEY, keys);
   removeMemoryEngineStorageValues(DELETED_CALENDAR_EVENT_KEYS_STORAGE_KEY, keys);
}

function isDeletedCalendarLike(value: { id?: string; workflowId?: string; originBoardItemId?: string; title?: string; sourceTitle?: string; summary?: string; latestMovement?: string }) {
   const deletedIds = readStringArrayStorageSafe(DELETED_CALENDAR_EVENTS_STORAGE_KEY);

   const deletedKeys = readStringArrayStorageSafe(DELETED_CALENDAR_EVENT_KEYS_STORAGE_KEY);

   const titleKey = getNormalizedCalendarTitleKey(value.sourceTitle || value.title);

   const candidateIds = [value.id, value.workflowId, value.originBoardItemId].filter(Boolean) as string[];

   if (candidateIds.some((id) => deletedIds.includes(id))) {
      return true;
   }

   const candidateKeys = [value.id ? `event:${value.id}` : "", value.workflowId ? `workflow:${value.workflowId}` : "", value.originBoardItemId ? `origin:${value.originBoardItemId}` : "", titleKey ? `title:${titleKey}` : ""].filter(Boolean);

   if (candidateKeys.some((key) => deletedKeys.includes(key))) {
      return true;
   }

   const searchable = compactText(`${value.title || ""} ${value.sourceTitle || ""} ${value.summary || ""} ${value.latestMovement || ""}`).toLowerCase();

   if (!searchable) {
      return false;
   }

   return deletedKeys.some((key) => key.startsWith("title:") && searchable.includes(key.replace("title:", "").replace(/-/g, " ")));
}

function getNormalizedProjectTitleKey(value?: string) {
   return compactText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
}

function getDeletedProjectIds() {
   return [...readStringArrayStorageSafe(DELETED_THREADS_STORAGE_KEY), ...readStringArrayStorageSafe(DELETED_PROJECTS_STORAGE_KEY)];
}

function getDeletedProjectKeys() {
   return [...readStringArrayStorageSafe(DELETED_THREAD_KEYS_STORAGE_KEY), ...readStringArrayStorageSafe(DELETED_PROJECT_KEYS_STORAGE_KEY)];
}

function isGenericResetProjectTitle(value?: string) {
   const key = getNormalizedProjectTitleKey(value);

   const genericKeys = new Set([
      "new-project",
      "project",
      "untitled-project",
      "current-project",
      "active-project",
      "project-memory",
      "current-work",
      "active-work",
      "no-current-work",
      "no-current-work-selected",
      "no-active-project-detected",
      "unknown",
      "untitled",
   ]);

   return genericKeys.has(key);
}

function isDeletedProjectLike(value: { id?: string; workflowId?: string; originBoardItemId?: string; title?: string; sourceTitle?: string; summary?: string; latestMovement?: string }) {
   if (isGenericResetProjectTitle(value.sourceTitle || value.title)) {
      return true;
   }

   if (isDeletedCalendarLike(value)) {
      return true;
   }

   const deletedIds = getDeletedProjectIds();

   const deletedKeys = getDeletedProjectKeys();

   const titleKey = getNormalizedProjectTitleKey(value.sourceTitle || value.title);

   const candidateIds = [value.id, value.workflowId, value.originBoardItemId].filter(Boolean) as string[];

   if (candidateIds.some((id) => deletedIds.includes(id))) {
      return true;
   }

   const candidateKeys = [
      value.id ? `event:${value.id}` : "",
      value.id ? `thread:${value.id}` : "",
      value.id ? `project:${value.id}` : "",
      value.workflowId ? `workflow:${value.workflowId}` : "",
      value.originBoardItemId ? `origin:${value.originBoardItemId}` : "",
      titleKey ? `title:${titleKey}` : "",
   ].filter(Boolean);

   if (candidateKeys.some((key) => deletedKeys.includes(key))) {
      return true;
   }

   const searchable = compactText(`${value.title || ""} ${value.sourceTitle || ""} ${value.summary || ""} ${value.latestMovement || ""}`).toLowerCase();

   if (!searchable) {
      return false;
   }

   return deletedKeys.some((key) => key.startsWith("title:") && searchable.includes(key.replace("title:", "").replace(/-/g, " ")));
}

function isDeletedProjectThread(thread: ThreadMemoryObject) {
   return isDeletedProjectLike({
      id: thread.id,
      workflowId: thread.workflowId,
      originBoardItemId: thread.originBoardItemId,
      title: thread.title,
      sourceTitle: thread.title,
      summary: thread.workingSummary || thread.cleanSourceContent,
      latestMovement: thread.latestMovement,
   });
}

function isDeletedProjectTimelineEvent(event: WorkflowTimelineEvent) {
   return isDeletedProjectLike({
      id: event.id,
      workflowId: event.workflowId,
      originBoardItemId: event.originBoardItemId,
      title: event.title,
      sourceTitle: event.sourceTitle,
      summary: event.summary || event.sourceContent || event.workingSummary,
   });
}

function isDeletedCalendarThread(thread: ThreadMemoryObject) {
   return isDeletedCalendarLike({
      id: thread.id,
      workflowId: thread.workflowId,
      originBoardItemId: thread.originBoardItemId,
      title: thread.title,
      sourceTitle: thread.title,
      summary: thread.workingSummary,
      latestMovement: thread.latestMovement,
   });
}

function isDeletedCalendarTimelineEvent(event: WorkflowTimelineEvent) {
   return isDeletedCalendarLike({
      id: event.id,
      workflowId: event.workflowId,
      originBoardItemId: event.originBoardItemId,
      title: event.title,
      sourceTitle: event.sourceTitle,
      summary: event.summary,
   });
}

export function rememberDeletedProjectMemorySignal(value: { id?: string; workflowId?: string; originBoardItemId?: string; title?: string; sourceTitle?: string }) {
   if (typeof window === "undefined") {
      return;
   }

   const titleKey = getNormalizedProjectTitleKey(value.sourceTitle || value.title);

   const ids = [value.id, value.workflowId, value.originBoardItemId].filter(Boolean) as string[];

   const keys = [
      value.id ? `project:${value.id}` : "",
      value.id ? `thread:${value.id}` : "",
      value.workflowId ? `workflow:${value.workflowId}` : "",
      value.originBoardItemId ? `origin:${value.originBoardItemId}` : "",
      titleKey ? `title:${titleKey}` : "",
   ].filter(Boolean);

   if (ids.length) {
      localStorage.setItem(DELETED_PROJECTS_STORAGE_KEY, JSON.stringify(Array.from(new Set([...readStringArrayStorageSafe(DELETED_PROJECTS_STORAGE_KEY), ...ids]))));
   }

   if (keys.length) {
      localStorage.setItem(DELETED_PROJECT_KEYS_STORAGE_KEY, JSON.stringify(Array.from(new Set([...readStringArrayStorageSafe(DELETED_PROJECT_KEYS_STORAGE_KEY), ...keys]))));
   }

   notifyMemoryUpdate();
}

// ========================================
// Save Memory
// ========================================

export function saveMemory(entry: MemoryEntry) {
   if (typeof window === "undefined") {
      return;
   }

   const safeEntry = sanitizeMemoryEntry(entry);

   if (!safeEntry) {
      return;
   }

   const existing = getMemory();

   // Keep local memory useful and lightweight.
   // Thread Memory V2 remains the stronger long-term project memory layer.
   const updated = [...existing, safeEntry].slice(-250);

   localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

   notifyMemoryUpdate();
}

// ========================================
// Get Memory
// ========================================

export function getMemory(): MemoryEntry[] {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? (parsed.map((entry) => sanitizeMemoryEntry(entry)).filter(Boolean) as MemoryEntry[]) : [];
   } catch {
      localStorage.removeItem(STORAGE_KEY);

      return [];
   }
}

// ========================================
// Clear Memory
// ========================================

export function clearMemory() {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.removeItem(STORAGE_KEY);

   notifyMemoryUpdate();
}

// ========================================
// Get Workflow Timeline Events
// Purpose:
// Reads Workflow Intel events without coupling
// MemoryEngine directly to the component.
// ========================================

export function getWorkflowTimelineEvents(): WorkflowTimelineEvent[] {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(WORKFLOW_TIMELINE_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored) as WorkflowTimelineEvent[];

      return parsed
         .map((event) => sanitizeWorkflowTimelineEvent(event))
         .filter((event): event is WorkflowTimelineEvent => Boolean(event))
         .filter((event) => event.id && event.createdAt && !isDeletedProjectTimelineEvent(event))
         .sort((a, b) => b.createdAt - a.createdAt);
   } catch {
      localStorage.removeItem(WORKFLOW_TIMELINE_STORAGE_KEY);

      return [];
   }
}

// ========================================
// Temporal Weight
// Purpose:
// Recent memories carry more influence
// ========================================

export function getTemporalWeight(timestamp: number) {
   const now = Date.now();

   const ageInMinutes = (now - timestamp) / 1000 / 60;

   if (ageInMinutes < 1) {
      return 1.5;
   }

   if (ageInMinutes < 5) {
      return 1.25;
   }

   if (ageInMinutes < 15) {
      return 1;
   }

   if (ageInMinutes < 30) {
      return 0.7;
   }

   return 0.4;
}

// ========================================
// Message Category Detection
// Purpose:
// Detects actual workflow categories from text,
// not just stored focus modes.
// ========================================

function getMessageCategories(message: string) {
   const lower = message.toLowerCase();

   const categories = new Set<string>();

   if (
      lower.includes("focus") ||
      lower.includes("deep") ||
      lower.includes("deep work") ||
      lower.includes("concentration") ||
      lower.includes("coding") ||
      lower.includes("build") ||
      lower.includes("implement") ||
      lower.includes("lock in") ||
      lower.includes("study mode") ||
      lower.includes("heads down")
   ) {
      categories.add("focus");
   }

   if (
      lower.includes("stress") ||
      lower.includes("stressed") ||
      lower.includes("burnout") ||
      lower.includes("overwhelmed") ||
      lower.includes("urgent") ||
      lower.includes("exhausted") ||
      lower.includes("too much") ||
      lower.includes("scattered") ||
      lower.includes("fragmented")
   ) {
      categories.add("overload");
   }

   if (lower.includes("calm") || lower.includes("relax") || lower.includes("recovery") || lower.includes("slow down") || lower.includes("low pressure") || lower.includes("quiet")) {
      categories.add("recovery");
   }

   if (lower.includes("research") || lower.includes("study") || lower.includes("analyze") || lower.includes("compare") || lower.includes("investigate")) {
      categories.add("research");
   }

   if (lower.includes("plan") || lower.includes("organize") || lower.includes("roadmap") || lower.includes("schedule") || lower.includes("tasks") || lower.includes("next step") || lower.includes("workflow control")) {
      categories.add("planning");
   }

   if (lower.includes("design") || lower.includes("brainstorm") || lower.includes("ideas") || lower.includes("creative") || lower.includes("concept") || lower.includes("personality") || lower.includes("welcome")) {
      categories.add("creative");
   }

   return categories;
}

// ========================================
// Context Switching Detection
// Purpose:
// Detects real workflow fragmentation.
// Focus-only repetition should NOT count.
// ========================================

function getContextSwitchingState(recent: MemoryEntry[]) {
   const categoryCounts: Record<string, number> = {
      focus: 0,

      overload: 0,

      recovery: 0,

      research: 0,

      planning: 0,

      creative: 0,
   };

   recent.forEach((entry) => {
      const categories = getMessageCategories(entry.message);

      categories.forEach((category) => {
         categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      });
   });

   const activeCategories = Object.entries(categoryCounts)
      .filter(([, count]) => count > 0)
      .map(([category]) => category);

   const totalSignals = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);

   const dominantCount = Math.max(...Object.values(categoryCounts));

   const focusDominant = categoryCounts.focus >= 2 && categoryCounts.overload === 0 && categoryCounts.recovery <= 1;

   const recoveryDominant = categoryCounts.overload >= 2 || categoryCounts.recovery >= 3;

   const trueContextSwitching = activeCategories.length >= 3 && dominantCount < totalSignals - 1 && !focusDominant && !recoveryDominant;

   return {
      categoryCounts,

      activeCategories,

      trueContextSwitching,
   };
}

// ========================================
// Cognitive Load State
// Purpose:
// Converts recent behavioral memory into
// cognitive load intensity
// ========================================

export function getCognitiveLoadState(): CognitiveLoadState {
   const memory = getMemory();

   if (memory.length === 0) {
      return {
         state: "Stable",

         intensity: 0,

         recentInteractions: 0,
      };
   }

   const recent = memory.slice(-6);

   const { categoryCounts, trueContextSwitching } = getContextSwitchingState(recent);

   let intensity = 0;

   intensity += categoryCounts.overload * 26;

   intensity += categoryCounts.recovery * 12;

   intensity += categoryCounts.focus * 10;

   intensity += categoryCounts.planning * 6;

   intensity += categoryCounts.creative * 6;

   intensity += categoryCounts.research * 6;

   intensity += recent.length * 3;

   if (trueContextSwitching) {
      intensity += 22;
   }

   intensity = Math.min(100, Math.max(0, intensity));

   if (intensity >= 82 || categoryCounts.overload >= 4 || trueContextSwitching) {
      return {
         state: "Critical",

         intensity,

         recentInteractions: recent.length,
      };
   }

   if (intensity >= 56 || categoryCounts.overload >= 2) {
      return {
         state: "Elevated",

         intensity,

         recentInteractions: recent.length,
      };
   }

   return {
      state: "Stable",

      intensity,

      recentInteractions: recent.length,
   };
}

// ========================================
// Legacy Compatibility Alias
// ========================================

export const getCognitiveLoad = getCognitiveLoadState;

// ========================================
// Behavioral Prediction
// ========================================

export function getBehavioralPrediction(): BehavioralPrediction {
   const memory = getMemory();

   if (memory.length === 0) {
      return {
         predictedState: "Baseline Observation",

         confidence: 50,

         recommendation: "Waiting for more project activity.",
      };
   }

   const recent = memory.slice(-12);

   let recovery = 0;

   let focus = 0;

   let creative = 0;

   let planning = 0;

   let research = 0;

   let switching = 0;

   recent.forEach((entry) => {
      const weighted = getTemporalWeight(entry.timestamp);

      const categories = getMessageCategories(entry.message);

      if (categories.has("overload")) {
         recovery += weighted * 1.25;
      }

      if (categories.has("recovery")) {
         recovery += weighted;
      }

      if (categories.has("focus")) {
         focus += weighted;
      }

      if (categories.has("creative")) {
         creative += weighted;
      }

      if (categories.has("planning")) {
         planning += weighted;
      }

      if (categories.has("research")) {
         research += weighted;
      }
   });

   const { trueContextSwitching } = getContextSwitchingState(recent.slice(-6));

   if (trueContextSwitching) {
      switching += 3;
   }

   const states = [
      {
         state: "Recovery Window",

         value: recovery,

         recommendation: "Keep guidance lighter and focus on one project step at a time.",
      },

      {
         state: "Focused Execution",

         value: focus,

         recommendation: "Prioritize the current project and keep guidance focused.",
      },

      {
         state: "Creative Exploration",

         value: creative,

         recommendation: "Support idea-shaping in Canvas without over-structuring the project.",
      },

      {
         state: "Planning Sequence",

         value: planning,

         recommendation: "Organize project actions and surface a clear next move.",
      },

      {
         state: "Research Analysis",

         value: research,

         recommendation: "Surface project materials and support reference-based guidance.",
      },

      {
         state: "Cognitive Fragmentation Risk",

         value: switching,

         recommendation: "Reduce context switching and keep related project actions together.",
      },
   ];

   const dominant = states.sort((a, b) => b.value - a.value)[0];

   if (dominant.value === 0) {
      return {
         predictedState: "Baseline Observation",

         confidence: 50,

         recommendation: "Waiting for more project activity.",
      };
   }

   return {
      predictedState: dominant.state,

      confidence: Math.min(98, Math.floor(65 + dominant.value * 12)),

      recommendation: dominant.recommendation,
   };
}

// ========================================
// Cognitive Profile
// ========================================

export function getCognitiveProfile(): CognitiveProfile {
   const memory = getMemory();

   if (memory.length === 0) {
      return {
         profile: "Baseline Observer",

         confidence: 50,

         recommendation: "Not enough project activity yet.",
      };
   }

   const recent = memory.slice(-16);

   let recoveryScore = 0;

   let focusScore = 0;

   let creativeScore = 0;

   let planningScore = 0;

   let researchScore = 0;

   let switchingScore = 0;

   recent.forEach((entry) => {
      const weight = getTemporalWeight(entry.timestamp);

      const categories = getMessageCategories(entry.message);

      if (categories.has("overload")) {
         recoveryScore += weight * 1.25;
      }

      if (categories.has("recovery")) {
         recoveryScore += weight;
      }

      if (categories.has("focus")) {
         focusScore += weight;
      }

      if (categories.has("creative")) {
         creativeScore += weight;
      }

      if (categories.has("planning")) {
         planningScore += weight;
      }

      if (categories.has("research")) {
         researchScore += weight;
      }

      if (categories.size >= 2) {
         switchingScore += weight * 0.5;
      }
   });

   const { trueContextSwitching } = getContextSwitchingState(recent.slice(-8));

   if (trueContextSwitching) {
      switchingScore += 3;
   }

   const profileScores = [
      {
         profile: "Recovery-Oriented Thinker",

         score: recoveryScore,

         recommendation: "Use softer project guidance and smaller next steps.",
      },

      {
         profile: "Deep Focus Operator",

         score: focusScore,

         recommendation: "Short, focused project guidance will work best here.",
      },

      {
         profile: "Creative Systems Thinker",

         score: creativeScore,

         recommendation: "Use Canvas for open idea-shaping before saving structure.",
      },

      {
         profile: "Planning-Oriented Operator",

         score: planningScore,

         recommendation: "Use structured next actions and clear project order.",
      },

      {
         profile: "Research-Oriented Analyst",

         score: researchScore,

         recommendation: "Use project materials and references to support the work.",
      },

      {
         profile: "Rapid Context Switcher",

         score: switchingScore,

         recommendation: "Group related project work and avoid unnecessary page switching.",
      },
   ];

   const dominant = profileScores.sort((a, b) => b.score - a.score)[0];

   if (dominant.score === 0) {
      return {
         profile: "Baseline Observer",

         confidence: 50,

         recommendation: "Not enough project activity yet.",
      };
   }

   return {
      profile: dominant.profile,

      confidence: Math.min(98, Math.round(60 + dominant.score * 6)),

      recommendation: dominant.recommendation,
   };
}

// ========================================
// Shared Text Helpers
// ========================================

function normalizeText(value?: string) {
   return sanitizeMemoryEngineText(value, MEMORY_ENGINE_SANITIZE_LIMITS.summary).toLowerCase().trim();
}

function cleanText(value?: string) {
   return sanitizeMemoryEngineText(value).replace(/\r/g, "").trim();
}

function compactText(value?: string) {
   return cleanText(value).replace(/\s+/g, " ").trim();
}

function normalizeParagraphs(value?: string) {
   return cleanText(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n\n");
}

function getLines(value?: string) {
   return cleanText(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
}

function escapeRegex(value: string) {
   return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLabelSection(body: string, label: string, stopLabels: string[]) {
   const escapedLabel = escapeRegex(label);

   const stopPattern = stopLabels.map(escapeRegex).join("|");

   const regex = new RegExp(`(?:^|\\n)\\s*${escapedLabel}:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:${stopPattern}):|$)`, "i");

   const match = cleanText(body).match(regex);

   return cleanText(match?.[1]);
}

function isStructuralLine(value?: string) {
   const lower = compactText(value).toLowerCase();

   if (!lower) return true;

   const structuralLines = [
      "title:",
      "body:",
      "content:",
      "description:",
      "primary content:",
      "current working view:",
      "working summary:",
      "source title:",
      "source content:",
      "original source content:",
      "canvas title:",
      "canvas context:",
      "focus:",
      "useful context:",
      "next step:",
      "lane:",
      "priority:",
      "movement:",
      "context:",
      "detected:",
      "latest signal:",
      "latest context:",
      "recommended move:",
      "thread guidance:",
      "active thread guidance:",
      "next decision:",
      "workflow metadata:",
      "source:",
      "current board status:",
      "workflow context:",
      "suggested next step:",
      "signals:",
      "latest movement:",
      "operating state:",
      "cognitive load:",
      "suggested destination:",
   ];

   return structuralLines.includes(lower);
}

function isWorkflowMovementText(value?: string) {
   const lower = compactText(value).toLowerCase();

   if (!lower) return true;

   const movementFragments = [
      "project board item sent to canvas",
      "sent to canvas and moved to in progress",
      "project board item imported",
      "project board item updated",
      "project board item sent",
      "project board item deleted",
      "project board item saved",
      "project board routed",
      "task moved from tasks to project board",
      "task sent to board",
      "task routed to board",
      "task added to allevin tasks",
      "task created",
      "task completed",
      "task restored",
      "task deleted",
      "internal notes export confirmed",
      "internal notes live export completed",
      "live internal note created",
      "internal note created",
      "workflow intel prepared",
      "workflow review prepared",
      "latest workflow intel signal",
      "active thread sent to canvas",
      "thread memory v2 continuation sent",
      "focus task created",
      "moved from backlog to in progress",
      "moved from review to completed",
      "moved from",
      "imported from tasks",
      "updated from tasks",
      "saved project item to internal notes",
      "internal note saved",
      "sent project item to canvas",
      "sent project item to canvas and moved",
      "new project board item created",
      "blank project card created",
      "project card created manually",
      "existing project card migrated",
   ];

   return movementFragments.some((fragment) => lower.includes(fragment));
}

function isUsefulThreadContent(value?: string) {
   const clean = compactText(value);

   if (!clean) return false;

   if (clean.length < 25) return false;

   if (isStructuralLine(clean)) return false;

   if (isWorkflowMovementText(clean)) return false;

   return true;
}

function removeInternalThreadSections(value?: string) {
   let cleaned = cleanText(value);

   cleaned = cleaned.replace(/(?:^|\n)\s*Current Working View:\s*[\s\S]*?(?=\n\s*Workflow Context\s*$|\n\s*Workflow Context:|\n\s*Suggested Next Step\s*$|\n\s*Suggested Next Step:|\n\s*ALLEVIN Recommendation:|$)/im, "");

   cleaned = cleaned.replace(/(?:^|\n)\s*Workflow Context\s*[\s\S]*?(?=\n\s*Suggested Next Step\s*$|\n\s*Suggested Next Step:|\n\s*ALLEVIN Recommendation:|$)/im, "");

   cleaned = cleaned.replace(/(?:^|\n)\s*Useful Context:\s*[\s\S]*?(?=\n\s*Next Step:|$)/im, "");

   cleaned = cleaned.replace(/(?:^|\n)\s*Next Step:\s*[\s\S]*$/im, "");

   cleaned = cleaned
      .replace(/^Summary\s*$/gim, "")
      .replace(/^Main Content\s*$/gim, "")
      .replace(/^Suggested Next Step\s*$/gim, "")
      .replace(/^Title:\s*$/gim, "")
      .replace(/^Primary Content:\s*$/gim, "")
      .replace(/^Current Working View:\s*$/gim, "")
      .replace(/^Focus:\s*$/gim, "")
      .replace(/^Useful Context:\s*$/gim, "")
      .replace(/^Next Step:\s*$/gim, "")
      .replace(/^Workflow Context\s*$/gim, "")
      .replace(/^Source:\s*.*$/gim, "")
      .replace(/^Thread ID:\s*.*$/gim, "")
      .replace(/^Board ID:\s*.*$/gim, "")
      .replace(/^Destination:\s*.*$/gim, "")
      .replace(/^Object Type:\s*.*$/gim, "")
      .replace(/^Confidence:\s*.*$/gim, "")
      .replace(/^Risk:\s*.*$/gim, "")
      .replace(/^Reason:\s*.*$/gim, "")
      .replace(/^Signals:\s*.*$/gim, "")
      .replace(/^Latest Movement:\s*.*$/gim, "")
      .replace(/^Operating State:\s*.*$/gim, "")
      .replace(/^Cognitive Load:\s*.*$/gim, "")
      .replace(/^Suggested Destination:\s*.*$/gim, "")
      .replace(/^Recommended Move:\s*$/gim, "")
      .replace(/^ALLEVIN Recommendation:\s*[\s\S]*$/gim, "");

   return normalizeParagraphs(cleaned);
}

function extractCleanThreadContent(value?: string) {
   const text = cleanText(value);

   if (!text) {
      return "";
   }

   const mainContent = getLabelSection(text, "Main Content", ["Current Working View", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   const primaryFromMain = getLabelSection(mainContent, "Primary Content", ["Current Working View", "Focus", "Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   if (isUsefulThreadContent(primaryFromMain)) {
      return normalizeParagraphs(primaryFromMain);
   }

   const primaryContent = getLabelSection(text, "Primary Content", ["Current Working View", "Focus", "Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   if (isUsefulThreadContent(primaryContent)) {
      return normalizeParagraphs(primaryContent);
   }

   const focusFromMain = getLabelSection(mainContent, "Focus", ["Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   const cleanFocusFromMain = removeInternalThreadSections(focusFromMain);

   if (isUsefulThreadContent(cleanFocusFromMain)) {
      return cleanFocusFromMain;
   }

   const focusContent = getLabelSection(text, "Focus", ["Useful Context", "Next Step", "Workflow Context", "Suggested Next Step", "ALLEVIN Recommendation"]);

   const cleanFocusContent = removeInternalThreadSections(focusContent);

   if (isUsefulThreadContent(cleanFocusContent)) {
      return cleanFocusContent;
   }

   const canvasContext = getLabelSection(text, "Canvas Context", ["Workflow Metadata", "Current Working View", "Working Summary", "Workflow Context"]);

   const cleanCanvasContext = removeInternalThreadSections(canvasContext);

   if (isUsefulThreadContent(cleanCanvasContext)) {
      return cleanCanvasContext;
   }

   const sourceContent = getLabelSection(text, "Source Content", ["Working Summary", "Current Working View", "Workflow Metadata", "Workflow Context"]);

   const cleanSourceContent = removeInternalThreadSections(sourceContent);

   if (isUsefulThreadContent(cleanSourceContent)) {
      return cleanSourceContent;
   }

   const lines = getLines(text).filter((line) => {
      const lower = line.toLowerCase();

      return (
         !isStructuralLine(line) &&
         !isWorkflowMovementText(line) &&
         !lower.startsWith("title:") &&
         !lower.startsWith("primary content:") &&
         !lower.startsWith("focus:") &&
         !lower.startsWith("lane:") &&
         !lower.startsWith("priority:") &&
         !lower.startsWith("next step:") &&
         !lower.startsWith("useful context:") &&
         !lower.startsWith("current board status:") &&
         !lower.startsWith("workflow context") &&
         !lower.startsWith("suggested next step")
      );
   });

   const cleanedLines = normalizeParagraphs(lines.join("\n"));

   return isUsefulThreadContent(cleanedLines) ? cleanedLines : "";
}

function truncateText(value: string, limit = 220) {
   const clean = compactText(value);

   return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

function stripProjectTitlePrefixes(value?: string) {
   let cleaned = compactText(value);

   if (!cleaned) {
      return "";
   }

   const prefixPatterns = [
      /^title:\s*/i,
      /^body:\s*/i,
      /^thread:\s*/i,
      /^active thread:\s*/i,
      /^continue active thread:\s*/i,
      /^continue thread:\s*/i,
      /^continue project:\s*/i,
      /^continue active workflow:\s*/i,
      /^resume active thread:\s*/i,
      /^resume thread:\s*/i,
      /^resume project:\s*/i,
      /^resume:\s*/i,
      /^task:\s*/i,
      /^follow up:\s*/i,
      /^follow-up:\s*/i,
      /^project:\s*/i,
      /^canvas:\s*/i,
      /^workflow:\s*/i,
   ];

   let changed = true;

   while (changed) {
      changed = false;

      for (const pattern of prefixPatterns) {
         const next = cleaned.replace(pattern, "").trim();

         if (next !== cleaned) {
            cleaned = next;

            changed = true;
         }
      }
   }

   return cleaned.replace(/\s+/g, " ").trim();
}

export function getCanonicalProjectTitle(value?: string) {
   const cleaned = stripProjectTitlePrefixes(value);

   if (!cleaned) {
      return "";
   }

   return sanitizeMemoryEngineTitle(
      cleaned
         .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
         .replace(/\s+/g, " ")
         .trim(),
   );
}

function getCanonicalProjectKey(value?: string) {
   const title = getCanonicalProjectTitle(value).toLowerCase();

   return title.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getBestEventTitleCandidate(event: WorkflowTimelineEvent) {
   const candidates = [event.sourceTitle, event.title, extractMeaningfulTitleFromSummary(event.summary)]
      .map((candidate) => getCanonicalProjectTitle(candidate))
      .filter(Boolean)
      .filter((candidate) => !isWeakTitle(candidate));

   return candidates[0] || getCanonicalProjectTitle(event.title);
}

function getThreadGroupKey(event: WorkflowTimelineEvent) {
   if (event.workflowId) {
      return event.workflowId;
   }

   if (event.originBoardItemId) {
      return event.originBoardItemId;
   }

   const titleKey = getCanonicalProjectKey(getBestEventTitleCandidate(event));

   if (titleKey) {
      return `title-${titleKey}`;
   }

   return `unthreaded-${event.id}`;
}

// ========================================
// Active Thread Helpers
// ========================================

function cleanCandidateTitle(value?: string) {
   return getCanonicalProjectTitle(value);
}

function isWeakTitle(title?: string) {
   const normalizedTitle = normalizeText(title);

   if (!normalizedTitle) {
      return true;
   }

   const exactWeakTitles = [
      "project work item",
      "project work item task",
      "untitled workflow",
      "untitled export",
      "manual export",
      "active allevin thread",
      "active workflow",
      "workflow signal",
      "workflow review",
      "continue active workflow",
      "continue active allevin thread",
      "continue active thread",
      "continue thread",
      "continue project",
      "resume active thread",
      "resume thread",
      "resume project",
      "continue most active workflow",
      "continue most active",
      "review active workflow",
      "review latest workflow event",
      "review latest event",
      "canvas task created",
      "task sent to board",
      "task routed to board",
      "task generated from canvas",
      "content sent to canvas",
      "canvas handoff detected",
      "active thread prepared for canvas",
      "workflow review prepared",
      "internal notes export confirmed",
      "internal notes live export completed",
      "internal note saved",
      "new project",
      "current project",
      "active project",
      "project",
      "project memory",
   ];

   if (exactWeakTitles.includes(normalizedTitle)) {
      return true;
   }

   const weakTitleFragments = ["project work item", "untitled", "workflow review", "workflow signal", "task routed", "task generated", "handoff detected", "sent to board", "sent to canvas", "prepared for canvas", "internal notes export", "internal note"];

   return weakTitleFragments.some((fragment) => normalizedTitle.includes(fragment));
}

function isStrongTitle(title?: string) {
   const cleanedTitle = cleanCandidateTitle(title);

   if (!cleanedTitle || isWeakTitle(cleanedTitle)) {
      return false;
   }

   if (cleanedTitle.length < 8) {
      return false;
   }

   const lower = cleanedTitle.toLowerCase();

   if (lower.includes("moved from") || lower.includes("was moved") || lower.includes("routed this item") || lower.includes("created a task") || lower.includes("updated an existing")) {
      return false;
   }

   return true;
}

function extractMeaningfulTitleFromSummary(summary?: string) {
   if (!summary) {
      return "";
   }

   const explicitTitle =
      getLabelSection(summary, "Title", ["Primary Content", "Current Working View", "Focus", "Useful Context", "Next Step"]) ||
      getLabelSection(summary, "Thread", ["Signals", "Latest Movement", "Latest Context", "Operating State"]) ||
      getLabelSection(summary, "Active Thread", ["Thread Guidance", "Next Decision"]);

   if (explicitTitle && !isWeakTitle(explicitTitle)) {
      return truncateText(cleanCandidateTitle(explicitTitle), 90);
   }

   const cleanedSummary = summary
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => cleanCandidateTitle(line))
      .filter(Boolean);

   const usefulLine = cleanedSummary.find((line) => {
      const lower = line.toLowerCase();

      if (isWeakTitle(line)) {
         return false;
      }

      if (line.length < 12) {
         return false;
      }

      if (
         lower.includes("moved from") ||
         lower.includes("was moved") ||
         lower.includes("routed this item") ||
         lower.includes("task updated") ||
         lower.includes("task created") ||
         lower.includes("created a new project board item") ||
         lower.includes("project board routed")
      ) {
         return false;
      }

      return true;
   });

   if (!usefulLine) {
      return "";
   }

   const sentence = usefulLine
      .split(". ")
      .map((part) => part.trim())
      .find((part) => part.length >= 12);

   const candidate = sentence || usefulLine;

   return candidate.length > 90 ? `${candidate.slice(0, 90)}...` : candidate;
}

function getEventTitleScore(event: WorkflowTimelineEvent) {
   let score = 0;

   if (isStrongTitle(event.title)) {
      score += 80;
   }

   if (event.source !== "system") {
      score += 12;
   }

   if (event.source === "canvas") {
      score += 12;
   }

   if (event.source === "task") {
      score += 8;
   }

   if (event.destination === "task") {
      score += 8;
   }

   if (event.destination === "board") {
      score += 4;
   }

   if (event.workflowId) {
      score += 4;
   }

   score += getTemporalWeight(event.createdAt) * 6;

   if (isWeakTitle(event.title)) {
      score -= 100;
   }

   return score;
}

function getSummaryTitleScore(event: WorkflowTimelineEvent) {
   const extractedTitle = extractMeaningfulTitleFromSummary(event.summary);

   if (!extractedTitle) {
      return -100;
   }

   let score = 55;

   if (event.source === "canvas") {
      score += 12;
   }

   if (event.destination === "task") {
      score += 10;
   }

   if (event.source !== "system") {
      score += 8;
   }

   score += getTemporalWeight(event.createdAt) * 5;

   return score;
}

function getEventTitleForThread(events: WorkflowTimelineEvent[]) {
   const sortedEvents = [...events].sort((a, b) => b.createdAt - a.createdAt);

   const strongestTitleEvent = sortedEvents.filter((event) => isStrongTitle(event.title)).sort((a, b) => getEventTitleScore(b) - getEventTitleScore(a))[0];

   const strongestSummaryEvent = sortedEvents
      .map((event) => ({
         event,

         extractedTitle: extractMeaningfulTitleFromSummary(event.summary),

         score: getSummaryTitleScore(event),
      }))
      .filter((item) => item.extractedTitle)
      .sort((a, b) => b.score - a.score)[0];

   if (strongestTitleEvent && (!strongestSummaryEvent || getEventTitleScore(strongestTitleEvent) >= strongestSummaryEvent.score)) {
      return cleanCandidateTitle(strongestTitleEvent.title);
   }

   if (strongestSummaryEvent?.extractedTitle) {
      return strongestSummaryEvent.extractedTitle;
   }

   const fallbackEvent = sortedEvents.find((event) => !isWeakTitle(event.title)) || sortedEvents.find((event) => event.source !== "system") || sortedEvents[0];

   const fallbackTitle = cleanCandidateTitle(fallbackEvent?.title);

   if (fallbackTitle && !isWeakTitle(fallbackTitle)) {
      return fallbackTitle;
   }

   return "Active ALLEVIN project";
}

function getMovementLabel(event?: WorkflowTimelineEvent) {
   if (!event) {
      return "No movement detected";
   }

   const source = event.source || "system";

   const destination = event.destination || "system";

   return `${source} → ${destination}`;
}

function getSuggestedDestination(event?: WorkflowTimelineEvent): ActiveThreadState["suggestedDestination"] {
   if (!event) {
      return "none";
   }

   if (event.destination === "canvas") {
      return "task";
   }

   if (event.destination === "task") {
      return "board";
   }

   if (event.destination === "board") {
      return "canvas";
   }

   if (event.destination === "system" && event.title.toLowerCase().includes("internal notes")) {
      return "integrations";
   }

   if (event.title.toLowerCase().includes("note") || event.summary.toLowerCase().includes("note")) {
      return "notes";
   }

   return "canvas";
}

function getRecommendedThreadAction({
   latestEvent,
   signalCount,
   cognitiveLoad,
   prediction,
}: {
   latestEvent?: WorkflowTimelineEvent;

   signalCount: number;

   cognitiveLoad: CognitiveLoadState;

   prediction: BehavioralPrediction;
}) {
   if (!latestEvent) {
      return "Start one clear project by opening Projects or drafting in Canvas.";
   }

   if (cognitiveLoad.state === "Critical") {
      return "Pause expansion. Review the active project and choose one small next step.";
   }

   if (prediction.predictedState === "Recovery Window") {
      return "Keep this project lightweight. Save useful context as a material or choose one low-pressure task.";
   }

   if (prediction.predictedState === "Focused Execution") {
      return "Continue the active project in Canvas and avoid switching to unrelated work.";
   }

   if (latestEvent.title.toLowerCase().includes("internal notes") || latestEvent.summary.toLowerCase().includes("internal note")) {
      return "Project material saved. Review it inside Projects when needed.";
   }

   if (latestEvent.title.toLowerCase().includes("note") || latestEvent.summary.toLowerCase().includes("saved to notes")) {
      return "The project context has been preserved. Review it later in Projects or continue it in Canvas.";
   }

   if (latestEvent.summary.toLowerCase().includes("completed") || latestEvent.summary.toLowerCase().includes("moved from review to completed")) {
      return "This project looks complete. Review the final result, keep the useful materials, or start a new project.";
   }

   if (latestEvent.destination === "canvas") {
      return "Develop this in Canvas, then turn the next concrete step into a task if needed.";
   }

   if (latestEvent.destination === "task") {
      return "Review the task and keep it as a clear next action for the project.";
   }

   if (latestEvent.destination === "board") {
      return "Open Projects and choose whether this should continue in Canvas, become a material, or be marked complete.";
   }

   if (signalCount >= 4) {
      return "This project is active. Review the latest update before adding new branches.";
   }

   return "Continue this project through the next useful ALLEVIN step.";
}

// ========================================
// Active Thread Awareness v1
// Purpose:
// Finds the strongest active workflow thread
// from Workflow Intel and combines it with
// cognitive state for next-action guidance.
// ========================================

export function getActiveThreadAwareness(): ActiveThreadState {
   const events = getWorkflowTimelineEvents();

   const usableEvents = events.filter((event) => !isDeletedProjectTimelineEvent(event));

   const prediction = getBehavioralPrediction();

   const cognitiveLoad = getCognitiveLoadState();

   if (usableEvents.length === 0) {
      return {
         hasActiveThread: false,

         title: "No active project detected",

         summary: "ALLEVIN has not detected an active project yet. Start with Projects or Canvas to give the workspace context.",

         signalCount: 0,

         latestMovement: "No movement detected",

         confidence: 40,

         recommendedNextAction: "Start by creating a project or drafting in Canvas so ALLEVIN can understand what you are working on.",

         suggestedDestination: "canvas",

         operatingState: prediction.predictedState,

         cognitiveLoad: cognitiveLoad.state,

         updatedAt: Date.now(),
      };
   }

   const threadMap = new Map<
      string,
      {
         workflowId: string;

         originBoardItemId?: string;

         events: WorkflowTimelineEvent[];

         latestEvent: WorkflowTimelineEvent;
      }
   >();

   usableEvents.forEach((event) => {
      const workflowId = getThreadGroupKey(event);

      const existing = threadMap.get(workflowId);

      if (!existing) {
         threadMap.set(workflowId, {
            workflowId,

            originBoardItemId: event.originBoardItemId,

            events: [event],

            latestEvent: event,
         });

         return;
      }

      const updatedEvents = [...existing.events, event].sort((a, b) => b.createdAt - a.createdAt);

      threadMap.set(workflowId, {
         ...existing,

         originBoardItemId: existing.originBoardItemId || event.originBoardItemId,

         events: updatedEvents,

         latestEvent: updatedEvents[0],
      });
   });

   const rankedThreads = Array.from(threadMap.values()).sort((a, b) => {
      const aLatest = a.latestEvent.createdAt;

      const bLatest = b.latestEvent.createdAt;

      const aHasStrongTitle = a.events.some((event) => isStrongTitle(event.title) || extractMeaningfulTitleFromSummary(event.summary));

      const bHasStrongTitle = b.events.some((event) => isStrongTitle(event.title) || extractMeaningfulTitleFromSummary(event.summary));

      const aScore = a.events.length * 3 + getTemporalWeight(aLatest) * 5 + (aHasStrongTitle ? 8 : 0);

      const bScore = b.events.length * 3 + getTemporalWeight(bLatest) * 5 + (bHasStrongTitle ? 8 : 0);

      return bScore - aScore;
   });

   const activeThread = rankedThreads[0];

   const signalCount = activeThread.events.length;

   const latestEvent = activeThread.latestEvent;

   const title = getEventTitleForThread(activeThread.events);

   const confidence = Math.min(98, Math.round(55 + signalCount * 8 + getTemporalWeight(latestEvent.createdAt) * 10));

   return {
      hasActiveThread: true,

      workflowId: activeThread.workflowId,

      originBoardItemId: activeThread.originBoardItemId,

      title,

      summary: latestEvent.summary || "ALLEVIN detected this as the current active workflow thread.",

      signalCount,

      latestMovement: getMovementLabel(latestEvent),

      latestSource: latestEvent.source,

      latestDestination: latestEvent.destination,

      latestEvent,

      confidence,

      recommendedNextAction: getRecommendedThreadAction({
         latestEvent,

         signalCount,

         cognitiveLoad,

         prediction,
      }),

      suggestedDestination: getSuggestedDestination(latestEvent),

      operatingState: prediction.predictedState,

      cognitiveLoad: cognitiveLoad.state,

      updatedAt: Date.now(),
   };
}

// ========================================
// Thread Memory V2 Storage
// ========================================

export function getThreadMemory(): ThreadMemoryObject[] {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(THREAD_MEMORY_V2_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored) as ThreadMemoryObject[];

      return dedupeThreadMemoryObjects(parsed.filter((thread) => thread && thread.id && thread.workflowId && !isDeletedProjectThread(thread)));
   } catch {
      localStorage.removeItem(THREAD_MEMORY_V2_STORAGE_KEY);

      return [];
   }
}

function dedupeThreadMemoryObjects(threads: ThreadMemoryObject[]) {
   const threadMap = new Map<string, ThreadMemoryObject>();

   threads
      .filter((thread) => thread && thread.id && thread.workflowId)
      .forEach((thread) => {
         const cleanTitle = sanitizeMemoryEngineTitle(getCanonicalProjectTitle(thread.title) || thread.title);

         const cleanThread: ThreadMemoryObject = {
            ...thread,

            id: sanitizeMemoryEngineId(thread.id) || crypto.randomUUID(),

            workflowId: sanitizeMemoryEngineId(thread.workflowId) || crypto.randomUUID(),

            originBoardItemId: sanitizeMemoryEngineId(thread.originBoardItemId),

            title: cleanTitle || "Active thread",

            cleanSourceContent: sanitizeMemoryEngineText(removeInternalThreadSections(thread.cleanSourceContent), MEMORY_ENGINE_SANITIZE_LIMITS.body),

            workingSummary: sanitizeMemoryEngineSummary(removeInternalThreadSections(thread.workingSummary)),

            latestVisibleState: sanitizeMemoryEngineSummary(removeInternalThreadSections(thread.latestVisibleState)),

            movementHistory: Array.isArray(thread.movementHistory) ? thread.movementHistory.map((movement) => sanitizeThreadMovementEntry(movement)).slice(0, 12) : [],

            latestMovement: sanitizeMemoryEngineMovement(thread.latestMovement),

            confidence: clampMemoryEngineConfidence(thread.confidence),

            recommendedNextAction: sanitizeMemoryEngineRecommendation(thread.recommendedNextAction),

            createdAt: isValidMemoryEngineTimestamp(thread.createdAt) ? thread.createdAt : Date.now(),

            updatedAt: isValidMemoryEngineTimestamp(thread.updatedAt) ? thread.updatedAt : Date.now(),
         };

         const titleKey = getCanonicalProjectKey(cleanThread.title);

         const key = cleanThread.workflowId || cleanThread.originBoardItemId || (titleKey ? `title-${titleKey}` : cleanThread.id);

         const existing = threadMap.get(key);

         const merged = mergeThreadMemoryObject({
            existing,

            generated: cleanThread,
         });

         threadMap.set(key, merged);
      });

   return Array.from(threadMap.values())
      .sort((a, b) => rankThreadMemory(b) - rankThreadMemory(a))
      .slice(0, 25);
}

export function saveThreadMemory(threads: ThreadMemoryObject[]) {
   if (typeof window === "undefined") {
      return;
   }

   const cleanThreads = dedupeThreadMemoryObjects(threads);

   localStorage.setItem(THREAD_MEMORY_V2_STORAGE_KEY, JSON.stringify(cleanThreads));

   notifyMemoryUpdate();
}

export function clearThreadMemory() {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.removeItem(THREAD_MEMORY_V2_STORAGE_KEY);

   notifyMemoryUpdate();
}

// ========================================
// Thread Memory V2 Helpers
// ========================================

function getLocationFromEvent(event?: WorkflowTimelineEvent): ThreadMemoryLocation {
   if (!event) {
      return "unknown";
   }

   const destination = event.destination?.toLowerCase();

   const source = event.source?.toLowerCase();

   const target = destination || source || "";

   if (target.includes("canvas")) {
      return "canvas";
   }

   if (target.includes("task")) {
      return "task";
   }

   if (target.includes("board")) {
      return "board";
   }

   if (target.includes("note")) {
      return "notes";
   }

   if (target.includes("integration") || target.includes("docs") || target.includes("google") || target.includes("export")) {
      return "integrations";
   }

   if (target.includes("system")) {
      return "system";
   }

   return "unknown";
}

function getThreadStageFromEvent(event?: WorkflowTimelineEvent): ThreadMemoryStage {
   if (!event) {
      return "unknown";
   }

   const searchable = `${event.title} ${event.summary} ${event.source} ${event.destination}`.toLowerCase();

   if (searchable.includes("internal notes live export completed") || searchable.includes("live internal note created") || searchable.includes("export completed")) {
      return "exported";
   }

   if (searchable.includes("internal notes export confirmed") || searchable.includes("prepare export") || searchable.includes("prepared export") || searchable.includes("integration")) {
      return "exporting";
   }

   if (searchable.includes("saved to notes") || searchable.includes("note saved") || searchable.includes("preserved in notes")) {
      return "preserved";
   }

   if (searchable.includes("completed") || searchable.includes("moved from review to completed")) {
      return "completed";
   }

   if (event.destination === "canvas" || searchable.includes("sent to canvas") || searchable.includes("canvas")) {
      return "drafting";
   }

   if (event.destination === "task" || searchable.includes("task")) {
      return "tasking";
   }

   if (event.destination === "board" || searchable.includes("project board") || searchable.includes("backlog") || searchable.includes("in progress")) {
      return "tracking";
   }

   if (searchable.includes("review") || searchable.includes("notes")) {
      return "reviewing";
   }

   return "unknown";
}

function getThreadStatusFromStage(stage: ThreadMemoryStage): ThreadMemoryStatus {
   if (stage === "exported") {
      return "exported";
   }

   if (stage === "preserved") {
      return "preserved";
   }

   if (stage === "completed") {
      return "completed";
   }

   if (stage === "paused") {
      return "paused";
   }

   if (stage === "drafting" || stage === "tasking" || stage === "tracking" || stage === "reviewing" || stage === "exporting") {
      return "active";
   }

   return "unknown";
}

function getThreadSuggestedDestination(event?: WorkflowTimelineEvent, stage?: ThreadMemoryStage): ThreadMemoryObject["suggestedDestination"] {
   if (!event) {
      return "canvas";
   }

   if (stage === "exported") {
      return "integrations";
   }

   if (stage === "preserved") {
      return "notes";
   }

   if (stage === "completed") {
      return "none";
   }

   return getSuggestedDestination(event);
}

function getDirectSourceContentFromEvent(event: WorkflowTimelineEvent) {
   const directContent = event.cleanSourceContent || event.sourceContent || event.workingSummary || "";

   const cleanedDirectContent = removeInternalThreadSections(directContent);

   return isUsefulThreadContent(cleanedDirectContent) ? cleanedDirectContent : "";
}

function getBestSummaryContentFromEvent(event: WorkflowTimelineEvent) {
   const summaryContent = extractCleanThreadContent(event.summary);

   return isUsefulThreadContent(summaryContent) ? summaryContent : "";
}

function getBestTitleContentFromEvent(event: WorkflowTimelineEvent) {
   const titleContent = extractCleanThreadContent(event.title);

   return isUsefulThreadContent(titleContent) ? titleContent : "";
}

function getBestCleanContentForThread(events: WorkflowTimelineEvent[]) {
   const sortedEvents = [...events].sort((a, b) => b.createdAt - a.createdAt);

   const contentCandidates = sortedEvents
      .flatMap((event) => {
         const directContent = getDirectSourceContentFromEvent(event);

         const summaryContent = getBestSummaryContentFromEvent(event);

         const titleContent = getBestTitleContentFromEvent(event);

         const candidates = [
            {
               content: directContent,

               sourceType: "direct",
            },
            {
               content: summaryContent,

               sourceType: "summary",
            },
            {
               content: titleContent,

               sourceType: "title",
            },
         ];

         return candidates
            .filter((candidate) => candidate.content)
            .map((candidate) => {
               const content = candidate.content;

               let score = 0;

               if (candidate.sourceType === "direct") {
                  score += 120;
               }

               if (candidate.sourceType === "summary") {
                  score += 45;
               }

               if (candidate.sourceType === "title") {
                  score += 5;
               }

               if (content.length > 25) {
                  score += 25;
               }

               if (content.length > 40) {
                  score += 30;
               }

               if (content.length > 120) {
                  score += 18;
               }

               if (event.source === "canvas") {
                  score += 24;
               }

               if (event.destination === "task") {
                  score += 16;
               }

               if (event.destination === "board") {
                  score += 8;
               }

               if (event.destination === "canvas") {
                  score += 4;
               }

               score += getTemporalWeight(event.createdAt) * 4;

               const lower = content.toLowerCase();

               if (
                  lower.includes("latest movement") ||
                  lower.includes("operating state") ||
                  lower.includes("cognitive load") ||
                  lower.includes("recommended move") ||
                  lower.includes("thread memory v2 continuation") ||
                  lower.includes("allevin mk i signal review") ||
                  lower.includes("allevin mk i focus task")
               ) {
                  score -= 40;
               }

               if (isWorkflowMovementText(content)) {
                  score -= 140;
               }

               if (!content || isStructuralLine(content)) {
                  score -= 120;
               }

               return {
                  content,

                  score,
               };
            });
      })
      .filter((item) => item.content && item.score > 0)
      .sort((a, b) => b.score - a.score);

   return contentCandidates[0]?.content || "";
}

function getWorkingSummaryForThread({
   cleanSourceContent,
   latestEvent,
   title,
}: {
   cleanSourceContent: string;

   latestEvent?: WorkflowTimelineEvent;

   title: string;
}) {
   if (isUsefulThreadContent(cleanSourceContent)) {
      return truncateText(cleanSourceContent, 260);
   }

   if (latestEvent?.summary) {
      const cleanedSummary = extractCleanThreadContent(latestEvent.summary);

      if (isUsefulThreadContent(cleanedSummary)) {
         return truncateText(cleanedSummary, 260);
      }
   }

   return title;
}

function getThreadMemoryRecommendation({
   stage,
   status,
   latestEvent,
   signalCount,
   cognitiveLoad,
   prediction,
}: {
   stage: ThreadMemoryStage;

   status: ThreadMemoryStatus;

   latestEvent?: WorkflowTimelineEvent;

   signalCount: number;

   cognitiveLoad: CognitiveLoadState;

   prediction: BehavioralPrediction;
}) {
   if (status === "exported") {
      return "Review the exported document, save useful context as a project material if needed, or start a new project.";
   }

   if (status === "preserved") {
      return "This project context is saved. Review it in Projects, continue it in Canvas, or mark the related work complete.";
   }

   if (status === "completed") {
      return "This project looks complete. Review the final result or begin a new focused project.";
   }

   if (stage === "exporting") {
      return "Review the project material or export before creating another branch.";
   }

   if (stage === "drafting") {
      return "Continue developing the project in Canvas, then turn the next concrete action into a task if needed.";
   }

   if (stage === "tasking") {
      return "Review the task and keep it as a clear next action for the project.";
   }

   if (stage === "tracking") {
      return "Open Projects and decide whether this should continue in Canvas, become a material, or be completed.";
   }

   if (stage === "reviewing") {
      return "Review the project, preserve useful context as a material, or prepare it for export.";
   }

   return getRecommendedThreadAction({
      latestEvent,

      signalCount,

      cognitiveLoad,

      prediction,
   });
}

function buildMovementHistory(events: WorkflowTimelineEvent[]) {
   return events
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 12)
      .map((event) =>
         sanitizeThreadMovementEntry({
            id: event.id,

            source: event.source || "system",

            destination: event.destination || "system",

            title: getCanonicalProjectTitle(event.title) || event.title,

            summary: event.summary,

            createdAt: event.createdAt,
         }),
      );
}

function mergeThreadMemoryObject({
   existing,
   generated,
}: {
   existing?: ThreadMemoryObject;

   generated: ThreadMemoryObject;
}) {
   if (!existing) {
      return generated;
   }

   const generatedCleanSourceIsUseful = isUsefulThreadContent(generated.cleanSourceContent);

   const existingCleanSourceIsUseful = isUsefulThreadContent(existing.cleanSourceContent);

   const cleanSourceContent = generatedCleanSourceIsUseful
      ? generated.cleanSourceContent
      : existingCleanSourceIsUseful
        ? existing.cleanSourceContent
        : generated.cleanSourceContent || existing.cleanSourceContent || generated.workingSummary || existing.workingSummary;

   const title = getCanonicalProjectTitle(isStrongTitle(generated.title) || !isStrongTitle(existing.title) ? generated.title : existing.title);

   const generatedWorkingSummaryIsUseful = isUsefulThreadContent(generated.workingSummary);

   const existingWorkingSummaryIsUseful = isUsefulThreadContent(existing.workingSummary);

   const workingSummary = generatedWorkingSummaryIsUseful ? generated.workingSummary : existingWorkingSummaryIsUseful ? existing.workingSummary : truncateText(cleanSourceContent, 260);

   const generatedLatestVisibleIsUseful = isUsefulThreadContent(generated.latestVisibleState);

   const existingLatestVisibleIsUseful = isUsefulThreadContent(existing.latestVisibleState);

   const latestVisibleState = generatedLatestVisibleIsUseful ? generated.latestVisibleState : existingLatestVisibleIsUseful ? existing.latestVisibleState : truncateText(cleanSourceContent, 260);

   return {
      ...existing,

      ...generated,

      title: sanitizeMemoryEngineTitle(title),

      cleanSourceContent: sanitizeMemoryEngineText(cleanSourceContent, MEMORY_ENGINE_SANITIZE_LIMITS.body),

      workingSummary: sanitizeMemoryEngineSummary(workingSummary),

      latestVisibleState: sanitizeMemoryEngineSummary(latestVisibleState),

      createdAt: existing.createdAt || generated.createdAt,

      updatedAt: Math.max(existing.updatedAt || 0, generated.updatedAt || 0),
   };
}

function readObjectStorageSafe<T = any>(key: string): T | null {
   if (typeof window === "undefined") {
      return null;
   }

   const stored = localStorage.getItem(key);

   if (!stored) {
      return null;
   }

   try {
      return JSON.parse(stored) as T;
   } catch {
      localStorage.removeItem(key);

      return null;
   }
}

function getSourceAwareTemporalBoost(updatedAt?: number) {
   if (!updatedAt) {
      return 0;
   }

   return getTemporalWeight(updatedAt) * 40;
}

function getCleanCandidateBody(...values: Array<string | undefined>) {
   const candidates = values
      .map((value) => removeInternalThreadSections(value))
      .map((value) => cleanText(value))
      .filter(Boolean)
      .filter((value) => !isWorkflowMovementText(value))
      .sort((a, b) => b.length - a.length);

   return candidates[0] || "";
}

function getProjectDocumentAwarenessScore(value?: string) {
   const body = sanitizeMemoryEngineText(value, MEMORY_ENGINE_SANITIZE_LIMITS.body);

   if (!body) {
      return -1;
   }

   const parsed = parseProjectDocument(body);

   let score = Math.min(body.length / 100, 80);

   if (parsed.projectType) score += 30;
   if (parsed.currentState) score += 35;
   if (parsed.goal) score += 35;
   if (parsed.needsToAdd) score += 20;
   if (parsed.immediateNextStep) score += 45;
   if (parsed.buildOrder.length) score += 45 + Math.min(parsed.buildOrder.length * 4, 24);
   if (parsed.completionCriteria.length) score += 20;
   if (parsed.constraints.length) score += 20;
   if (parsed.implementationPreferences.length) score += 25;

   return score;
}

function getBestSavedProjectDocument(project: any) {
   const notes = Array.isArray(project?.notes) ? project.notes : [];

   const candidates = [project?.latestSummary, project?.body, project?.sourceContent, project?.workingSummary, ...notes.flatMap((note: any) => [note?.body, note?.summary])]
      .map((value) => sanitizeMemoryEngineText(value, MEMORY_ENGINE_SANITIZE_LIMITS.body))
      .filter(Boolean);

   return (
      candidates
         .map((body) => ({
            body,
            score: getProjectDocumentAwarenessScore(body),
         }))
         .sort((a, b) => b.score - a.score || b.body.length - a.body.length)[0]?.body || ""
   );
}

function getSourceAwareProjectLibraryRecords() {
   const records = readArrayStorage<any>(PROJECT_LIBRARY_STORAGE_KEY)
      .filter((project) => project && typeof project.title === "string")
      .map((project) => {
         const notes = Array.isArray(project.notes) ? project.notes : [];

         const latestNote = [...notes].sort((a: any, b: any) => Number(b?.savedAt || 0) - Number(a?.savedAt || 0))[0] || null;

         const title = getCanonicalProjectTitle(project.title);

         const savedBody = getBestSavedProjectDocument(project);

         const canonicalProject = getMatchingCanonicalProjectMemoryForContext({
            title,
            workflowId: project.workflowId,
            originBoardItemId: project.originBoardItemId,
         });

         const body = getBestProjectDocumentCandidate(savedBody, canonicalProject?.body, canonicalProject?.sourceContent, canonicalProject?.workingSummary);

         const updatedAt =
            Math.max(typeof project.updatedAt === "number" ? project.updatedAt : 0, typeof latestNote?.savedAt === "number" ? latestNote.savedAt : 0, typeof canonicalProject?.updatedAt === "number" ? canonicalProject.updatedAt : 0) || Date.now();

         return {
            project,
            canonicalProject,
            latestNote,
            title,
            body,
            updatedAt,
         };
      });

   // A structured project that is visibly present in Projects is live again.
   // Clear stale deletion tombstones before source-aware filtering so a recreated
   // or newly saved project does not disappear as soon as Canvas is cleared.
   records.forEach((record) => {
      const hasLiveProjectShape = isStrongTitle(record.title) && isUsefulThreadContent(record.body);

      if (!hasLiveProjectShape) {
         return;
      }

      clearDeletedProjectMemorySignal({
         id: record.project.id,
         workflowId: record.project.workflowId || record.canonicalProject?.workflowId,
         originBoardItemId: record.project.originBoardItemId || record.canonicalProject?.originBoardItemId,
         title: record.title,
         sourceTitle: record.title,
      });
   });

   // Projects is the user-visible source of truth for saved work. If a record is
   // still present there with a real title and meaningful body, it is active saved
   // project context. A stale deletion tombstone must not hide a project the user
   // can currently see and open.
   return records.filter((record) => {
      const hasLiveProjectShape = isStrongTitle(record.title) && isUsefulThreadContent(record.body);

      if (!hasLiveProjectShape) {
         return false;
      }

      clearDeletedProjectMemorySignal({
         id: record.project.id,
         workflowId: record.project.workflowId || record.canonicalProject?.workflowId,
         originBoardItemId: record.project.originBoardItemId || record.canonicalProject?.originBoardItemId,
         title: record.title,
         sourceTitle: record.title,
      });

      return true;
   });
}

function getMatchingProjectLibraryRecordForContext(input: { title?: string; workflowId?: string; originBoardItemId?: string }) {
   const titleKey = getCanonicalProjectKey(input.title);

   const records = getSourceAwareProjectLibraryRecords();

   return (
      records.find((record) => {
         const project = record.project;

         if (input.workflowId && (project.workflowId === input.workflowId || project.originBoardItemId === input.workflowId || project.id === input.workflowId || project.id === `workflow:${input.workflowId}`)) {
            return true;
         }

         if (input.originBoardItemId && (project.originBoardItemId === input.originBoardItemId || project.workflowId === input.originBoardItemId || project.id === input.originBoardItemId || project.id === `origin:${input.originBoardItemId}`)) {
            return true;
         }

         return Boolean(titleKey && getCanonicalProjectKey(record.title) === titleKey);
      }) || null
   );
}

function getMatchingCanonicalProjectMemoryForContext(input: { title?: string; workflowId?: string; originBoardItemId?: string }) {
   const titleKey = getCanonicalProjectKey(input.title);

   try {
      return (
         readProjectMemory().find((project) => {
            if (input.workflowId && (project.workflowId === input.workflowId || project.originBoardItemId === input.workflowId || project.id === input.workflowId)) {
               return true;
            }

            if (input.originBoardItemId && (project.originBoardItemId === input.originBoardItemId || project.workflowId === input.originBoardItemId || project.id === input.originBoardItemId)) {
               return true;
            }

            return Boolean(titleKey && getCanonicalProjectKey(project.cleanTitle || project.title) === titleKey);
         }) || null
      );
   } catch {
      return null;
   }
}

function getBestProjectDocumentCandidate(...values: Array<string | undefined>) {
   return (
      values
         .map((value) => sanitizeMemoryEngineText(value, MEMORY_ENGINE_SANITIZE_LIMITS.body))
         .filter(Boolean)
         .map((body) => ({
            body,
            score: getProjectDocumentAwarenessScore(body),
         }))
         .sort((a, b) => b.score - a.score || b.body.length - a.body.length)[0]?.body || ""
   );
}

function getEmptyParsedProjectDocument(): ParsedProjectDocument {
   return parseProjectDocument("");
}

function getProjectDocumentRecommendation(parsedDocument: ParsedProjectDocument, fallback: string) {
   return sanitizeMemoryEngineRecommendation(parsedDocument.immediateNextStep || parsedDocument.buildOrder[0] || fallback);
}

function getSourceAwareCanvasCandidate(): SourceAwareActiveProject | null {
   const canvas = readObjectStorageSafe<{
      title?: string;
      sourceTitle?: string;
      content?: string;
      sourceContent?: string;
      workingSummary?: string;
      workflowId?: string;
      originBoardItemId?: string;
      updatedAt?: number;
   }>(CANVAS_STORAGE_KEY);

   if (!canvas) {
      return null;
   }

   const title = getCanonicalProjectTitle(canvas.sourceTitle || canvas.title);

   const body = getCleanCandidateBody(canvas.content, canvas.sourceContent, canvas.workingSummary);

   if (!isStrongTitle(title) && !isUsefulThreadContent(body)) {
      return null;
   }

   clearDeletedProjectMemorySignal({
      workflowId: canvas.workflowId,
      originBoardItemId: canvas.originBoardItemId,
      title,
      sourceTitle: title,
   });

   // A strong, non-empty Canvas project is live work. Do not run it through
   // deletion filtering again after clearing its tombstones; stale title or
   // workflow keys would otherwise hide the same recreated project immediately.
   const updatedAt = typeof canvas.updatedAt === "number" ? canvas.updatedAt : Date.now();

   const matchingProject = getMatchingProjectLibraryRecordForContext({
      title,
      workflowId: canvas.workflowId,
      originBoardItemId: canvas.originBoardItemId,
   });

   const matchingMemoryProject = getMatchingCanonicalProjectMemoryForContext({
      title,
      workflowId: canvas.workflowId,
      originBoardItemId: canvas.originBoardItemId,
   });

   // Canvas can become active before the project is copied into the legacy
   // project-library store. Preserve the structured starter itself as valid
   // project context instead of replacing its explicit next action with a
   // generic "Continue in Canvas" fallback.
   const projectBody = getBestProjectDocumentCandidate(matchingProject?.body, matchingMemoryProject?.body, matchingMemoryProject?.sourceContent, body);

   const projectDocument = parseProjectDocument(projectBody);

   return {
      source: "canvas",
      title: sanitizeMemoryEngineTitle(title || "Canvas work"),
      body: sanitizeMemoryEngineText(body || title || "Canvas work", MEMORY_ENGINE_SANITIZE_LIMITS.body),
      summary: sanitizeMemoryEngineSummary(truncateText(body || title || "Canvas work", 260)),
      workflowId: sanitizeMemoryEngineId(canvas.workflowId),
      originBoardItemId: sanitizeMemoryEngineId(canvas.originBoardItemId),
      lastKnownLocation: "canvas",
      currentStage: "drafting",
      status: "active",
      recommendedNextAction: getProjectDocumentRecommendation(projectDocument, matchingMemoryProject?.recommendedNextAction || "Continue in Canvas. The latest editable version is already open there."),
      score: 1000 + getSourceAwareTemporalBoost(updatedAt) + (isUsefulThreadContent(body) ? 80 : 0) + (isStrongTitle(title) ? 40 : 0),
      reason: "Canvas is the current writing surface, while the saved project document remains available as roadmap context.",
      updatedAt,
      projectBody,
      projectDocument,
      projectUpdatedAt: matchingProject?.updatedAt || 0,
      canvasContent: sanitizeMemoryEngineText(body, MEMORY_ENGINE_SANITIZE_LIMITS.body),
      canvasUpdatedAt: updatedAt,
   };
}

function getSourceAwareProjectLibraryCandidates(): SourceAwareActiveProject[] {
   return getSourceAwareProjectLibraryRecords()
      .map((record) => {
         const { project, canonicalProject, title, body, updatedAt } = record;

         const projectBody = sanitizeMemoryEngineText(getBestProjectDocumentCandidate(body, canonicalProject?.body, canonicalProject?.sourceContent, canonicalProject?.workingSummary) || title, MEMORY_ENGINE_SANITIZE_LIMITS.body);

         const projectDocument = parseProjectDocument(projectBody);

         return {
            source: "projects" as const,
            title: sanitizeMemoryEngineTitle(title),
            body: projectBody,
            summary: sanitizeMemoryEngineSummary(truncateText(body || project.latestSummary || title, 260)),
            workflowId: sanitizeMemoryEngineId(project.workflowId),
            originBoardItemId: sanitizeMemoryEngineId(project.originBoardItemId),
            lastKnownLocation: "integrations" as const,
            currentStage: "preserved" as const,
            status: "preserved" as const,
            recommendedNextAction: getProjectDocumentRecommendation(projectDocument, canonicalProject?.recommendedNextAction || "Open this from Projects when you want to continue the saved work in Canvas."),
            score: 850 + getSourceAwareTemporalBoost(updatedAt) + (isUsefulThreadContent(body) ? 60 : 0) + (isStrongTitle(title) ? 35 : 0),
            reason: "Projects stores the saved roadmap and long-term project context.",
            updatedAt,
            projectBody,
            projectDocument,
            projectUpdatedAt: updatedAt,
         } satisfies SourceAwareActiveProject;
      })
      .filter((candidate) => isStrongTitle(candidate.title) || isUsefulThreadContent(candidate.body));
}

function getProjectMaterialsForMemory() {
   return readArrayStorage<{
      id?: string;
      projectId?: string;
      projectTitle?: string;
      title?: string;
      type?: string;
      source?: string;
      notes?: string;
      summary?: string;
      createdAt?: number;
      updatedAt?: number;
   }>(PROJECT_MATERIALS_STORAGE_KEY)
      .filter((material) => material && (material.title || material.notes || material.summary))
      .map((material) => ({
         id: sanitizeMemoryEngineId(material.id),
         projectId: sanitizeMemoryEngineId(material.projectId),
         projectTitle: sanitizeMemoryEngineTitle(material.projectTitle),
         title: sanitizeMemoryEngineTitle(material.title),
         type: sanitizeMemoryEngineText(material.type, MEMORY_ENGINE_SANITIZE_LIMITS.smallText),
         source: sanitizeMemoryEngineText(material.source, MEMORY_ENGINE_SANITIZE_LIMITS.smallText),
         notes: sanitizeMemoryEngineText(material.notes, MEMORY_ENGINE_SANITIZE_LIMITS.summary),
         summary: sanitizeMemoryEngineSummary(material.summary),
         createdAt: isValidMemoryEngineTimestamp(material.createdAt) ? Number(material.createdAt) : Date.now(),
         updatedAt: isValidMemoryEngineTimestamp(material.updatedAt) ? Number(material.updatedAt) : isValidMemoryEngineTimestamp(material.createdAt) ? Number(material.createdAt) : Date.now(),
      }));
}

function getSourceAwareMaterialCandidates(): SourceAwareActiveProject[] {
   const materialGroups = new Map<
      string,
      {
         title: string;
         projectId?: string;
         workflowId?: string;
         materials: ReturnType<typeof getProjectMaterialsForMemory>;
         updatedAt: number;
      }
   >();

   getProjectMaterialsForMemory().forEach((material) => {
      const projectTitle = sanitizeMemoryEngineTitle(material.projectTitle || material.title);

      const projectKey = material.projectId || getCanonicalProjectKey(projectTitle);

      if (!projectKey || !projectTitle) {
         return;
      }

      const existing = materialGroups.get(projectKey);

      const nextMaterials = [...(existing?.materials || []), material];

      materialGroups.set(projectKey, {
         title: existing?.title || projectTitle,
         projectId: material.projectId,
         workflowId: material.projectId || existing?.workflowId,
         materials: nextMaterials,
         updatedAt: Math.max(existing?.updatedAt || 0, material.updatedAt || 0),
      });
   });

   return Array.from(materialGroups.values())
      .map((group) => {
         const visibleMaterials = group.materials.slice(0, 6);

         const materialLines = visibleMaterials
            .map((material, index) => {
               const label = material.type ? `${material.type}: ` : "";

               const usefulText = material.summary || material.notes || material.title;

               return `${index + 1}. ${label}${material.title || "Project material"}${usefulText ? ` — ${truncateText(usefulText, 180)}` : ""}`;
            })
            .join("\n");

         const body = sanitizeMemoryEngineText(`Project Materials\n\n${materialLines}`, MEMORY_ENGINE_SANITIZE_LIMITS.body);

         return {
            source: "materials" as const,
            title: sanitizeMemoryEngineTitle(group.title),
            body,
            summary: sanitizeMemoryEngineSummary(`${group.materials.length} material${group.materials.length === 1 ? "" : "s"} attached to this project.`),
            workflowId: sanitizeMemoryEngineId(group.workflowId),
            originBoardItemId: sanitizeMemoryEngineId(group.projectId),
            lastKnownLocation: "integrations" as const,
            currentStage: "reviewing" as const,
            status: "active" as const,
            recommendedNextAction: "Use the attached materials as project references while continuing in Canvas.",
            score: 780 + getSourceAwareTemporalBoost(group.updatedAt) + Math.min(group.materials.length, 8) * 18,
            reason: "Project Materials provide reference context for the active project.",
            updatedAt: group.updatedAt || Date.now(),
         } satisfies SourceAwareActiveProject;
      })
      .filter((candidate) => {
         if (!candidate.title && !candidate.body) {
            return false;
         }

         if (
            isDeletedProjectLike({
               workflowId: candidate.workflowId,
               originBoardItemId: candidate.originBoardItemId,
               title: candidate.title,
               summary: candidate.summary,
            })
         ) {
            return false;
         }

         return isStrongTitle(candidate.title) || isUsefulThreadContent(candidate.body);
      });
}

function getSourceAwareThreadCandidates(threads: ThreadMemoryObject[]): SourceAwareActiveProject[] {
   return threads
      .filter((thread) => !isDeletedProjectThread(thread))
      .filter((thread) => isStrongTitle(thread.title) || isUsefulThreadContent(thread.cleanSourceContent) || isUsefulThreadContent(thread.workingSummary))
      .map((thread) => ({
         source: "thread-memory" as const,
         title: sanitizeMemoryEngineTitle(thread.title),
         body: sanitizeMemoryEngineText(getCleanCandidateBody(thread.cleanSourceContent, thread.workingSummary, thread.latestVisibleState) || thread.title, MEMORY_ENGINE_SANITIZE_LIMITS.body),
         summary: sanitizeMemoryEngineSummary(truncateText(thread.workingSummary || thread.cleanSourceContent || thread.title, 260)),
         workflowId: sanitizeMemoryEngineId(thread.workflowId),
         originBoardItemId: sanitizeMemoryEngineId(thread.originBoardItemId),
         lastKnownLocation: thread.lastKnownLocation,
         currentStage: thread.currentStage,
         status: thread.status,
         recommendedNextAction: thread.recommendedNextAction,
         score: 650 + rankThreadMemory(thread),
         reason: "Legacy memory is useful when Canvas, Projects, or Materials do not have a stronger current signal.",
         updatedAt: thread.updatedAt,
      }));
}

function getSourceAwareCalendarCandidates(): SourceAwareActiveProject[] {
   const now = Date.now();

   return readArrayStorage<any>(CALENDAR_EVENTS_STORAGE_KEY)
      .filter((event) => event && typeof event.title === "string")
      .filter((event) => Number(event.endTime || 0) >= now)
      .filter((event) => !isDeletedProjectLike({ id: event.id, workflowId: event.workflowId, originBoardItemId: event.originBoardItemId, title: event.title, summary: event.description || event.body }))
      .map((event) => {
         const startTime = Number(event.startTime || now);

         const hoursUntilStart = Math.max(0, (startTime - now) / 1000 / 60 / 60);

         const title = sanitizeMemoryEngineTitle(getCanonicalProjectTitle(event.sourceTitle || event.title) || event.title);

         const body = sanitizeMemoryEngineText(getCleanCandidateBody(event.description, event.body, event.sourceContent, event.workingSummary) || title, MEMORY_ENGINE_SANITIZE_LIMITS.body);

         const soonBoost = hoursUntilStart <= 12 ? 80 : hoursUntilStart <= 24 ? 35 : 0;

         return {
            source: "calendar" as const,
            title,
            body,
            summary: truncateText(body, 220),
            workflowId: event.workflowId,
            originBoardItemId: event.originBoardItemId,
            lastKnownLocation: "system" as const,
            currentStage: "reviewing" as const,
            status: "active" as const,
            recommendedNextAction: "Check Calendar for the next scheduled item when timing matters.",
            score: 260 + soonBoost + getSourceAwareTemporalBoost(startTime) * 0.25,
            reason: "Calendar is schedule context. It only outranks project work when timing is the main question.",
            updatedAt: startTime,
         } satisfies SourceAwareActiveProject;
      });
}

function getSourceAwareActiveProjectFromThreads(threads: ThreadMemoryObject[] = []) {
   const candidates = [getSourceAwareCanvasCandidate(), ...getSourceAwareProjectLibraryCandidates(), ...getSourceAwareMaterialCandidates(), ...getSourceAwareThreadCandidates(threads), ...getSourceAwareCalendarCandidates()].filter(
      Boolean,
   ) as SourceAwareActiveProject[];

   return candidates.sort((a, b) => b.score - a.score)[0] || null;
}

export function getSourceAwareActiveProject() {
   const existingThreads = getThreadMemory();

   const generatedThreads = buildThreadMemoryFromEvents();

   const threads = dedupeThreadMemoryObjects([...generatedThreads, ...existingThreads]).filter((thread) => !isDeletedProjectThread(thread));

   return getSourceAwareActiveProjectFromThreads(threads);
}

export function getActiveProjectAwareness(): ActiveProjectAwareness {
   const activeProject = getSourceAwareActiveProject();

   if (!activeProject) {
      return {
         hasActiveProject: false,
         source: "none",
         title: "No active project detected",
         projectBody: "",
         projectDocument: getEmptyParsedProjectDocument(),
         canvasContent: "",
         canvasUpdatedAt: 0,
         projectUpdatedAt: 0,
         lastKnownLocation: "unknown",
         currentStage: "unknown",
         status: "unknown",
         latestMovement: "No movement detected",
         recommendedNextAction: "Start by creating a project or drafting in Canvas so ALLEVIN can understand what you are working on.",
         updatedAt: Date.now(),
         projectIntelligence: getEmptyProjectIntelligencePacket(),
      };
   }

   const matchingProject =
      getMatchingProjectLibraryRecordForContext({
         title: activeProject.title,
         workflowId: activeProject.workflowId,
         originBoardItemId: activeProject.originBoardItemId,
      }) || null;

   const projectBody = sanitizeMemoryEngineText(activeProject.projectBody || matchingProject?.body || (activeProject.source === "projects" ? activeProject.body : ""), MEMORY_ENGINE_SANITIZE_LIMITS.body);

   const projectDocument = activeProject.projectDocument || parseProjectDocument(projectBody);

   let canvasContent = sanitizeMemoryEngineText(activeProject.canvasContent || "", MEMORY_ENGINE_SANITIZE_LIMITS.body);

   let canvasUpdatedAt = activeProject.canvasUpdatedAt || 0;

   const canvas = readObjectStorageSafe<{
      title?: string;
      sourceTitle?: string;
      content?: string;
      sourceContent?: string;
      workingSummary?: string;
      workflowId?: string;
      originBoardItemId?: string;
      updatedAt?: number;
   }>(CANVAS_STORAGE_KEY);

   if (canvas) {
      const canvasTitle = getCanonicalProjectTitle(canvas.sourceTitle || canvas.title);

      const activeTitleKey = getCanonicalProjectKey(activeProject.title);

      const canvasTitleKey = getCanonicalProjectKey(canvasTitle);

      const sameWorkflow =
         Boolean(activeProject.workflowId && (canvas.workflowId === activeProject.workflowId || canvas.originBoardItemId === activeProject.workflowId)) ||
         Boolean(activeProject.originBoardItemId && (canvas.originBoardItemId === activeProject.originBoardItemId || canvas.workflowId === activeProject.originBoardItemId));

      const sameTitle = Boolean(activeTitleKey && canvasTitleKey && activeTitleKey === canvasTitleKey);

      if (sameWorkflow || sameTitle || activeProject.source === "canvas") {
         canvasContent = sanitizeMemoryEngineText(getCleanCandidateBody(canvas.content, canvas.sourceContent, canvas.workingSummary), MEMORY_ENGINE_SANITIZE_LIMITS.body);

         canvasUpdatedAt = typeof canvas.updatedAt === "number" ? canvas.updatedAt : canvasUpdatedAt;
      }
   }

   const recommendedNextAction = getProjectDocumentRecommendation(projectDocument, activeProject.recommendedNextAction || "Choose the next useful project action.");

   const projectMaterials = readArrayStorage<ProjectMaterialInput>(PROJECT_MATERIALS_STORAGE_KEY);

   const projectIntelligence = buildProjectIntelligencePacket({
      title: activeProject.title,
      projectDocument,
      projectBody,
      canvasContent,
      materials: projectMaterials,
   });

   return {
      hasActiveProject: true,
      source: activeProject.source,
      title: activeProject.title,
      projectBody,
      projectDocument,
      canvasContent,
      canvasUpdatedAt,
      projectUpdatedAt: activeProject.projectUpdatedAt || matchingProject?.updatedAt || 0,
      workflowId: activeProject.workflowId,
      originBoardItemId: activeProject.originBoardItemId,
      lastKnownLocation: activeProject.lastKnownLocation,
      currentStage: activeProject.currentStage,
      status: activeProject.status,
      latestMovement:
         activeProject.source === "canvas"
            ? "Canvas is current"
            : activeProject.source === "projects"
              ? "Saved project context is current"
              : activeProject.source === "materials"
                ? "Project materials are available"
                : "Source-aware project context selected",
      recommendedNextAction,
      updatedAt: Math.max(activeProject.updatedAt || 0, canvasUpdatedAt || 0, activeProject.projectUpdatedAt || matchingProject?.updatedAt || 0),
      projectIntelligence,
   };
}

export function getProjectIntelligencePacket() {
   return getActiveProjectAwareness().projectIntelligence;
}

function buildThreadMemoryObjectFromSourceAwareCandidate(candidate: SourceAwareActiveProject, fallback?: ThreadMemoryObject): ThreadMemoryObject {
   const workflowId = candidate.workflowId || candidate.originBoardItemId || `source-${candidate.source}-${getCanonicalProjectKey(candidate.title) || "active-project"}`;

   const body = candidate.body || candidate.summary || candidate.title;

   return {
      id: workflowId,
      workflowId,
      originBoardItemId: candidate.originBoardItemId || fallback?.originBoardItemId,
      title: candidate.title,
      cleanSourceContent: body,
      workingSummary: candidate.summary || truncateText(body, 260),
      latestVisibleState: candidate.summary || truncateText(body, 260),
      currentStage: candidate.currentStage,
      status: candidate.status,
      lastKnownLocation: candidate.lastKnownLocation,
      signalCount: fallback?.signalCount || 1,
      movementHistory: fallback?.movementHistory || [],
      latestMovement:
         candidate.source === "canvas" ? "Canvas is current" : candidate.source === "projects" ? "Saved in Projects" : candidate.source === "materials" ? "Project materials available" : fallback?.latestMovement || "Source-aware project selected",
      latestEvent: fallback?.latestEvent,
      confidence: Math.min(98, Math.max(72, Math.round(candidate.score / 12))),
      recommendedNextAction: candidate.recommendedNextAction,
      suggestedDestination: candidate.source === "projects" || candidate.source === "materials" ? "canvas" : candidate.source === "canvas" ? "task" : fallback?.suggestedDestination || "canvas",
      operatingState: "Project-aware guidance",
      cognitiveLoad: fallback?.cognitiveLoad || getCognitiveLoadState().state,
      createdAt: fallback?.createdAt || candidate.updatedAt,
      updatedAt: candidate.updatedAt,
   };
}

function rankThreadMemory(thread: ThreadMemoryObject) {
   let score = 0;

   score += thread.signalCount * 5;

   score += getTemporalWeight(thread.updatedAt) * 12;

   score += isUsefulThreadContent(thread.cleanSourceContent) ? 14 : 0;

   score += isStrongTitle(thread.title) ? 10 : 0;

   if (isWorkflowMovementText(thread.cleanSourceContent)) {
      score -= 20;
   }

   if (thread.status === "active") {
      score += 10;
   }

   if (thread.status === "exported") {
      score += 4;
   }

   if (thread.status === "completed") {
      score -= 12;
   }

   if (thread.status === "paused") {
      score -= 8;
   }

   return score;
}

// ========================================
// Build Thread Memory V2 From Events
// Pure function. Does not write localStorage.
// ========================================

export function buildThreadMemoryFromEvents(events = getWorkflowTimelineEvents()): ThreadMemoryObject[] {
   const usableEvents = events.filter((event) => !isDeletedProjectTimelineEvent(event));

   const prediction = getBehavioralPrediction();

   const cognitiveLoad = getCognitiveLoadState();

   const threadMap = new Map<
      string,
      {
         workflowId: string;

         originBoardItemId?: string;

         events: WorkflowTimelineEvent[];
      }
   >();

   usableEvents.forEach((event) => {
      const workflowId = getThreadGroupKey(event);

      const existing = threadMap.get(workflowId);

      if (!existing) {
         threadMap.set(workflowId, {
            workflowId,

            originBoardItemId: event.originBoardItemId,

            events: [event],
         });

         return;
      }

      threadMap.set(workflowId, {
         ...existing,

         originBoardItemId: existing.originBoardItemId || event.originBoardItemId,

         events: [...existing.events, event],
      });
   });

   return Array.from(threadMap.values())
      .map((threadGroup) => {
         const sortedEvents = [...threadGroup.events].sort((a, b) => b.createdAt - a.createdAt);

         const latestEvent = sortedEvents[0];

         const signalCount = sortedEvents.length;

         const title = getCanonicalProjectTitle(getEventTitleForThread(sortedEvents));

         const cleanSourceContent = getBestCleanContentForThread(sortedEvents);

         const workingSummary = getWorkingSummaryForThread({
            cleanSourceContent,

            latestEvent,

            title,
         });

         const currentStage = getThreadStageFromEvent(latestEvent);

         const status = getThreadStatusFromStage(currentStage);

         const latestMovement = getMovementLabel(latestEvent);

         const lastKnownLocation = getLocationFromEvent(latestEvent);

         const suggestedDestination = getThreadSuggestedDestination(
            latestEvent,

            currentStage,
         );

         const confidence = Math.min(98, Math.round(56 + signalCount * 7 + getTemporalWeight(latestEvent.createdAt) * 10 + (isUsefulThreadContent(cleanSourceContent) ? 10 : 0) + (isStrongTitle(title) ? 6 : 0)));

         const latestEventDirectContent = getDirectSourceContentFromEvent(latestEvent);

         const latestEventCleanSummary = getBestSummaryContentFromEvent(latestEvent);

         const latestVisibleState = isUsefulThreadContent(cleanSourceContent)
            ? cleanSourceContent
            : isUsefulThreadContent(latestEventDirectContent)
              ? latestEventDirectContent
              : isUsefulThreadContent(latestEventCleanSummary)
                ? latestEventCleanSummary
                : workingSummary || title;

         return {
            id: threadGroup.workflowId,

            workflowId: threadGroup.workflowId,

            originBoardItemId: threadGroup.originBoardItemId,

            title,

            cleanSourceContent,

            workingSummary,

            latestVisibleState,

            currentStage,

            status,

            lastKnownLocation,

            signalCount,

            movementHistory: buildMovementHistory(sortedEvents),

            latestMovement,

            latestEvent,

            confidence,

            recommendedNextAction: getThreadMemoryRecommendation({
               stage: currentStage,

               status,

               latestEvent,

               signalCount,

               cognitiveLoad,

               prediction,
            }),

            suggestedDestination,

            operatingState: prediction.predictedState,

            cognitiveLoad: cognitiveLoad.state,

            createdAt: sortedEvents[sortedEvents.length - 1]?.createdAt || Date.now(),

            updatedAt: latestEvent.createdAt || Date.now(),
         } satisfies ThreadMemoryObject;
      })
      .sort((a, b) => rankThreadMemory(b) - rankThreadMemory(a));
}

// ========================================
// Sync Thread Memory V2
// Writes persistent thread objects.
// Use after workflow events are created,
// not during render loops.
// ========================================

export function updateThreadMemoryFromWorkflowEvents() {
   if (typeof window === "undefined") {
      return [];
   }

   const existingThreads = getThreadMemory();

   const generatedThreads = buildThreadMemoryFromEvents();

   const existingMap = new Map(existingThreads.map((thread) => [thread.workflowId, thread]));

   const mergedGeneratedThreads = generatedThreads.map((generated) =>
      mergeThreadMemoryObject({
         existing: existingMap.get(generated.workflowId),

         generated,
      }),
   );

   const generatedIds = new Set(mergedGeneratedThreads.map((thread) => thread.workflowId));

   const preservedExistingThreads = existingThreads.filter((thread) => !generatedIds.has(thread.workflowId));

   const updatedThreads = dedupeThreadMemoryObjects([...mergedGeneratedThreads, ...preservedExistingThreads]).filter((thread) => !isDeletedProjectThread(thread));

   localStorage.setItem(THREAD_MEMORY_V2_STORAGE_KEY, JSON.stringify(updatedThreads));

   notifyMemoryUpdate();

   return updatedThreads;
}

// ========================================
// Active Thread Memory V2
// Pure read resolver.
// Does not write localStorage.
// ========================================

export function getActiveThreadMemoryV2(): ThreadMemoryState {
   const existingThreads = getThreadMemory();

   const generatedThreads = buildThreadMemoryFromEvents();

   const existingMap = new Map(existingThreads.map((thread) => [thread.workflowId, thread]));

   const mergedGeneratedThreads = generatedThreads.map((generated) =>
      mergeThreadMemoryObject({
         existing: existingMap.get(generated.workflowId),

         generated,
      }),
   );

   const generatedIds = new Set(mergedGeneratedThreads.map((thread) => thread.workflowId));

   const preservedExistingThreads = existingThreads.filter((thread) => !generatedIds.has(thread.workflowId));

   const threads = dedupeThreadMemoryObjects([...mergedGeneratedThreads, ...preservedExistingThreads]).filter((thread) => !isDeletedProjectThread(thread));

   const sourceAwareCandidate = getSourceAwareActiveProjectFromThreads(threads);

   const sourceAwareThread = sourceAwareCandidate && sourceAwareCandidate.source !== "thread-memory" ? buildThreadMemoryObjectFromSourceAwareCandidate(sourceAwareCandidate, threads[0]) : null;

   const activeThread = sourceAwareThread || threads[0];

   const visibleThreads = sourceAwareThread ? [sourceAwareThread, ...threads.filter((thread) => thread.workflowId !== sourceAwareThread.workflowId)] : threads;

   const prediction = getBehavioralPrediction();

   const cognitiveLoad = getCognitiveLoadState();

   if (!activeThread) {
      return {
         hasActiveThread: false,

         threads: [],

         title: "No active project detected",

         cleanSourceContent: "",

         workingSummary: "ALLEVIN has not detected saved project context yet. Start with Projects or Canvas to establish one.",

         currentStage: "unknown",

         status: "unknown",

         lastKnownLocation: "unknown",

         signalCount: 0,

         latestMovement: "No movement detected",

         confidence: 40,

         recommendedNextAction: "Start by creating a project or drafting in Canvas so ALLEVIN can understand what you are working on.",

         suggestedDestination: "canvas",

         operatingState: prediction.predictedState,

         cognitiveLoad: cognitiveLoad.state,

         updatedAt: Date.now(),
      };
   }

   return {
      hasActiveThread: true,

      activeThread,

      threads: visibleThreads,

      title: activeThread.title,

      cleanSourceContent: activeThread.cleanSourceContent,

      workingSummary: activeThread.workingSummary,

      currentStage: activeThread.currentStage,

      status: activeThread.status,

      lastKnownLocation: activeThread.lastKnownLocation,

      signalCount: activeThread.signalCount,

      latestMovement: activeThread.latestMovement,

      confidence: activeThread.confidence,

      recommendedNextAction: activeThread.recommendedNextAction,

      suggestedDestination: activeThread.suggestedDestination,

      operatingState: activeThread.operatingState,

      cognitiveLoad: activeThread.cognitiveLoad,

      updatedAt: Date.now(),
   };
}

// ========================================
// MK II Session Summary Helpers
// Purpose:
// Gives welcome cards and AIDock a single,
// safe, lightweight read of ALLEVIN state.
// ========================================

function getPendingApprovalCount() {
   return readArrayStorage(WORKFLOW_CONTROL_PENDING_ACTIONS_KEY).filter((action: any) => action && action.status !== "approved" && action.status !== "canceled").length;
}

function getUpcomingCalendarCount() {
   const now = Date.now();

   return readArrayStorage(CALENDAR_EVENTS_STORAGE_KEY).filter((event: any) => {
      const endTime = Number(event?.endTime || 0);

      return Number.isFinite(endTime) && endTime >= now;
   }).length;
}

function getCalendarNoteCount() {
   return readArrayStorage(CALENDAR_NOTES_STORAGE_KEY).filter((note: any) => note && typeof note.note === "string" && note.note.trim()).length;
}

function getSystemStatusLabelFromSummary({
   pendingApprovalCount,
   upcomingCalendarCount,
   cognitiveLoad,
   activeThread,
}: {
   pendingApprovalCount: number;

   upcomingCalendarCount: number;

   cognitiveLoad: CognitiveLoadState;

   activeThread: ThreadMemoryState;
}) {
   if (pendingApprovalCount > 0) {
      return "Awaiting approval";
   }

   if (cognitiveLoad.state === "Critical") {
      return "Calm guidance ready";
   }

   if (cognitiveLoad.state === "Elevated") {
      return "Calm support ready";
   }

   if (upcomingCalendarCount > 0) {
      return "Schedule ready";
   }

   if (activeThread.hasActiveThread) {
      return "Project context available";
   }

   return "Workspace ready";
}

function getWelcomeLineFromSummary({
   pendingApprovalCount,
   upcomingCalendarCount,
   activeThread,
}: {
   pendingApprovalCount: number;

   upcomingCalendarCount: number;

   activeThread: ThreadMemoryState;
}) {
   if (pendingApprovalCount > 0) {
      return `I found ${pendingApprovalCount} action${pendingApprovalCount === 1 ? "" : "s"} waiting for your approval.`;
   }

   if (activeThread.hasActiveThread) {
      return `I found your active project: ${activeThread.title}.`;
   }

   if (upcomingCalendarCount > 0) {
      return `I found ${upcomingCalendarCount} upcoming calendar item${upcomingCalendarCount === 1 ? "" : "s"} available for schedule context.`;
   }

   return "Your workspace is ready. Start with Projects, continue in Canvas, or ask AIDock for guidance.";
}

export function getAllevinSessionSummary(): AllevinSessionSummary {
   const activeThread = getActiveThreadMemoryV2();

   const cognitiveLoad = getCognitiveLoadState();

   const prediction = getBehavioralPrediction();

   const pendingApprovalCount = getPendingApprovalCount();

   const upcomingCalendarCount = getUpcomingCalendarCount();

   const calendarNoteCount = getCalendarNoteCount();

   const recentMemoryCount = getRecentMemoryWindow(8).length;

   const systemStatusLabel = getSystemStatusLabelFromSummary({
      pendingApprovalCount,

      upcomingCalendarCount,

      cognitiveLoad,

      activeThread,
   });

   const welcomeLine = getWelcomeLineFromSummary({
      pendingApprovalCount,

      upcomingCalendarCount,

      activeThread,
   });

   return {
      hasActiveThread: activeThread.hasActiveThread,

      activeThreadTitle: activeThread.hasActiveThread ? activeThread.title : "No active project detected",

      activeThreadStage: activeThread.currentStage,

      activeThreadStatus: activeThread.status,

      activeThreadLocation: activeThread.lastKnownLocation,

      activeThreadSignals: activeThread.signalCount,

      pendingApprovalCount,

      upcomingCalendarCount,

      calendarNoteCount,

      recentMemoryCount,

      cognitiveLoadState: cognitiveLoad.state,

      cognitiveLoadIntensity: cognitiveLoad.intensity,

      predictedState: prediction.predictedState,

      predictedConfidence: prediction.confidence,

      recommendedNextAction: activeThread.recommendedNextAction,

      systemStatusLabel,

      welcomeLine,

      approvalReminder: "I will ask before changing anything important.",

      updatedAt: Date.now(),
   };
}

export function getAllevinWelcomeSummary() {
   const summary = getAllevinSessionSummary();

   return `${summary.systemStatusLabel}. ${summary.welcomeLine} ${summary.approvalReminder}`;
}

// ========================================
// Active Thread Summary
// Purpose:
// Short text helper for UI cards.
// ========================================

export function getActiveThreadSummary() {
   const activeThread = getActiveThreadAwareness();

   if (!activeThread.hasActiveThread) {
      return "No active project detected yet.";
   }

   return `${activeThread.title} • ${activeThread.signalCount} signal${activeThread.signalCount === 1 ? "" : "s"} • ${activeThread.latestMovement}`;
}

// ========================================
// Thread Memory V2 Summary
// Purpose:
// Short text helper for V2 UI cards.
// ========================================

export function getThreadMemorySummary() {
   const threadMemory = getActiveThreadMemoryV2();

   if (!threadMemory.hasActiveThread) {
      return "No saved project context detected yet.";
   }

   return `${threadMemory.title} • ${threadMemory.currentStage} • ${threadMemory.signalCount} signal${threadMemory.signalCount === 1 ? "" : "s"} • ${threadMemory.latestMovement}`;
}
