// ========================================
// ALLEVIN MK XI Unified Project State Authority
// Purpose:
// Give Home, Projects, AIDock, Calendar intelligence, and MemoryEngine one
// canonical active-project read instead of allowing each surface to infer its
// own project from recency, Canvas, materials, or thread history.
//
// MK XI Build 1 rules:
// - An explicit Projects selection is authoritative while that project exists.
// - Project identity is matched by project id first, then normalized title.
// - Canvas, materials, tracking, and Calendar are scoped to that identity.
// - Project Intelligence is derived once from the same scoped inputs.
// - Consumers may read this state freely; only explicit project selection
//   writes change which project is active.
// ========================================

import { parseProjectDocument, readProjectMemory, type ParsedProjectDocument } from "@/lib/allevinProjectMemory";
import { readProjectLeadDecisions, readProjectLeadProgress } from "@/lib/projectLeadMemory";
import { formatMilestoneCheckpoint, formatWorkJournalForIntelligence, readProjectMilestoneWorkJournal, readProjectWorkJournal } from "@/lib/projectWorkJournal";
import {
   buildProjectIntelligencePacket,
   getEmptyProjectIntelligencePacket,
   type ProjectIntelligencePacket,
   type ProjectMaterialInput,
} from "@/lib/projectIntelligenceEngine";

export const ALLEVIN_PROJECT_STATE_STORAGE_KEY = "allevin-project-state-mkxi";
export const ALLEVIN_ACTIVE_PROJECT_SELECTION_STORAGE_KEY = "allevin-active-project-selection-mkviii";
export const ALLEVIN_PROJECT_STATE_UPDATED_EVENT = "allevin-project-state-update";

const PROJECT_LIBRARY_STORAGE_KEY = "allevin-project-library";
const PROJECT_TRACKING_STORAGE_KEY = "allevin-project-tracking-map";
const PROJECT_MATERIALS_STORAGE_KEY = "allevin-project-materials-mkvi";
const CALENDAR_EVENTS_STORAGE_KEY = "allevin-calendar-events-mki";
const CANVAS_STORAGE_KEY = "allevin-adaptive-work-canvas";

const STATE_LIMITS = {
   title: 180,
   id: 220,
   summary: 1800,
   body: 100000,
   small: 500,
} as const;

export interface CanonicalProjectSelection {
   projectId: string;
   title: string;
   updatedAt: number;
}

export interface CanonicalProjectLibraryItem {
   id?: string;
   title?: string;
   workflowId?: string;
   originBoardItemId?: string;
   latestSummary?: string;
   sourceBrief?: string;
   latestMovement?: string;
   notes?: Array<{
      id?: string;
      title?: string;
      body?: string;
      summary?: string;
      source?: string;
      savedAt?: number;
   }>;
   createdAt?: number;
   updatedAt?: number;
}

export interface CanonicalProjectTrackingMilestone {
   id: string;
   title: string;
   status: string;
   completed: boolean;
   completedAt?: number;
   goal: string;
   whyItMatters: string;
   startingPrompt: string;
   workingContent: string;
   decisions: string[];
   openQuestions: string[];
   dependencies: string[];
   completionCriteria: string[];
   completedCriteria: string[];
   order: number;
   createdAt: number;
   updatedAt: number;
}

export interface CanonicalProjectTracking {
   status: string;
   priority: "low" | "medium" | "high" | "unknown";
   nextStep: string;
   // Persisted Projects selection is the milestone authority. Status remains for
   // lifecycle display, while this id prevents consumers from re-inferring focus.
   activeMilestoneId?: string;
   milestones: CanonicalProjectTrackingMilestone[];
   calendarTaskTitle: string;
   calendarTaskDate: string;
   calendarTaskTime: string;
   calendarTaskDurationMinutes: number;
   updatedAt: number;
}

export interface CanonicalProjectCalendarEvent {
   id: string;
   title: string;
   startTime: number;
   endTime: number;
   allDay: boolean;
   description: string;
   sourceTitle: string;
   workflowId: string;
   originProjectsItemId: string;
   recommendedNextAction: string;
   projectStage: string;
}

export interface CanonicalProjectState {
   version: "MK XI";
   hasProject: boolean;
   identity: {
      projectId: string;
      title: string;
      workflowId: string;
      originBoardItemId: string;
      selectionSource: "explicit" | "fallback-library" | "fallback-memory" | "fallback-canvas" | "none";
   };
   project: {
      body: string;
      sourceBrief: string;
      summary: string;
      currentState: string;
      goal: string;
      successState: string;
      projectDocument: ParsedProjectDocument;
      canvasContent: string;
      canvasUpdatedAt: number;
      projectUpdatedAt: number;
      tracking: CanonicalProjectTracking | null;
   };
   activeMilestone: {
      id: string;
      title: string;
      status: string;
      goal: string;
      whyItMatters: string;
      completionCriteria: string[];
      completedCriteria: string[];
      dependencies: string[];
      openQuestions: string[];
   } | null;
   decisions: {
      confirmed: Array<{ id: string; statement: string; affects: string[] }>;
      unresolved: Array<{ id: string; statement: string; affects: string[] }>;
      assumptions: Array<{ id: string; statement: string; affects: string[] }>;
      rejected: Array<{ id: string; statement: string; affects: string[] }>;
      superseded: Array<{ id: string; statement: string; affects: string[] }>;
   };
   dependencies: Array<{ id: string; before: string; after: string; reason: string; state: string }>;
   risks: Array<{ id: string; title: string; consequence: string; mitigation: string; severity: string }>;
   materials: {
      count: number;
      items: Array<{ id: string; title: string; type: string; summary: string; updatedAt: number }>;
   };
   calendar: {
      projectSessions: CanonicalProjectCalendarEvent[];
      upcomingProjectSessions: CanonicalProjectCalendarEvent[];
      passedProjectSessions: CanonicalProjectCalendarEvent[];
      nextProjectSession: CanonicalProjectCalendarEvent | null;
   };
   recommendation: {
      nextMove: string;
      whyNow: string;
      whatItUnlocks: string;
      afterThis: string;
   };
   openQuestions: string[];
   recentActivity: {
      latestMovement: string;
      updatedAt: number;
   };
   confidence: number;
   projectIntelligence: ProjectIntelligencePacket;
   libraryProject?: CanonicalProjectLibraryItem;
   generatedAt: number;
}

function stripUnsafeMarkup(value?: string) {
   return (value || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
      .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
      .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript\s*:/gi, "")
      .replace(/data\s*:\s*text\/html/gi, "")
      .replace(/<[^>]+>/g, "");
}

function cleanText(value?: string, limit: number = STATE_LIMITS.summary) {
   const clean = stripUnsafeMarkup(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

   return clean.length > limit ? clean.slice(0, limit).trim() : clean;
}

function cleanTitle(value?: string) {
   return cleanText(value, STATE_LIMITS.title).replace(/\n+/g, " ").trim();
}

function cleanId(value?: string) {
   return cleanText(value, STATE_LIMITS.id)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .trim();
}

function normalizeTitle(value?: string) {
   return cleanTitle(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

function safeNumber(value: unknown, fallback = 0) {
   return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeArray<T = unknown>(value: unknown): T[] {
   return Array.isArray(value) ? (value as T[]) : [];
}

function safeParse<T>(key: string, fallback: T): T {
   if (typeof window === "undefined") return fallback;

   const stored = localStorage.getItem(key);
   if (!stored) return fallback;

   try {
      return JSON.parse(stored) as T;
   } catch {
      return fallback;
   }
}

function getProjectUpdatedAt(project?: CanonicalProjectLibraryItem) {
   return Math.max(safeNumber(project?.updatedAt), safeNumber(project?.notes?.[0]?.savedAt), safeNumber(project?.createdAt));
}

export function readCanonicalProjectLibrary(): CanonicalProjectLibraryItem[] {
   const parsed = safeParse<CanonicalProjectLibraryItem[] | { items?: CanonicalProjectLibraryItem[] }>(PROJECT_LIBRARY_STORAGE_KEY, []);
   const items = Array.isArray(parsed) ? parsed : safeArray<CanonicalProjectLibraryItem>(parsed?.items);

   return items
      .filter((project) => cleanTitle(project?.title))
      .map((project) => ({
         ...project,
         id: cleanId(project.id),
         title: cleanTitle(project.title),
         workflowId: cleanId(project.workflowId),
         originBoardItemId: cleanId(project.originBoardItemId),
         latestSummary: cleanText(project.latestSummary, STATE_LIMITS.summary),
         sourceBrief: cleanText(project.sourceBrief, STATE_LIMITS.body),
         latestMovement: cleanText(project.latestMovement, STATE_LIMITS.small),
      }));
}

export function readCanonicalProjectSelection(): CanonicalProjectSelection | null {
   if (typeof window === "undefined") return null;

   const stored = localStorage.getItem(ALLEVIN_ACTIVE_PROJECT_SELECTION_STORAGE_KEY);
   if (!stored) return null;

   try {
      const parsed = JSON.parse(stored);
      const projectId = cleanId(typeof parsed === "string" ? parsed : parsed?.projectId || parsed?.id);
      const title = cleanTitle(typeof parsed === "string" ? parsed : parsed?.title || parsed?.projectTitle);
      const updatedAt = safeNumber(parsed?.updatedAt);

      return projectId || title ? { projectId, title, updatedAt } : null;
   } catch {
      const raw = cleanText(stored, STATE_LIMITS.title);
      return raw ? { projectId: cleanId(raw), title: cleanTitle(raw), updatedAt: 0 } : null;
   }
}

export function resolveCanonicalProjectSelection<T extends CanonicalProjectLibraryItem>(projects: T[]) {
   const selection = readCanonicalProjectSelection();

   if (!projects.length) {
      return {
         project: null as T | null,
         selection,
         source: "none" as const,
      };
   }

   if (selection) {
      const idMatch = selection.projectId ? projects.find((project) => cleanId(project.id) === selection.projectId) : undefined;
      if (idMatch) return { project: idMatch, selection, source: "explicit" as const };

      const titleKey = normalizeTitle(selection.title);
      const titleMatch = titleKey ? projects.find((project) => normalizeTitle(project.title) === titleKey) : undefined;
      if (titleMatch) return { project: titleMatch, selection, source: "explicit" as const };
   }

   const latest = [...projects].sort((a, b) => getProjectUpdatedAt(b) - getProjectUpdatedAt(a))[0] || null;
   return {
      project: latest,
      selection,
      source: latest ? ("fallback-library" as const) : ("none" as const),
   };
}

export function writeCanonicalProjectSelection(project?: CanonicalProjectLibraryItem | null) {
   if (typeof window === "undefined" || !project) return null;

   const record: CanonicalProjectSelection = {
      projectId: cleanId(project.id),
      title: cleanTitle(project.title),
      updatedAt: Date.now(),
   };

   if (!record.projectId && !record.title) return null;

   localStorage.setItem(ALLEVIN_ACTIVE_PROJECT_SELECTION_STORAGE_KEY, JSON.stringify(record));
   window.dispatchEvent(new CustomEvent("allevin-active-project-selection-change", { detail: record }));
   refreshCanonicalProjectState({ emit: true });
   return record;
}

function readTrackingMap() {
   const parsed = safeParse<Record<string, unknown>>(PROJECT_TRACKING_STORAGE_KEY, {});
   return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function sanitizeStringArray(value: unknown, limit = 30) {
   return safeArray<unknown>(value)
      .map((item) => cleanText(String(item || ""), STATE_LIMITS.summary))
      .filter(Boolean)
      .slice(0, limit);
}

function sanitizeTracking(projectId: string): CanonicalProjectTracking | null {
   if (!projectId) return null;

   // MK XI B4 — tracking-map keys must preserve the Projects library id exactly.
   // Project ids such as `title:electronics-program` are valid storage keys. The
   // old canonical read cleaned the colon before looking up the tracking map,
   // which meant Projects could show milestone 2 while AIDock silently fell back
   // to milestone 1 from the original project brief. Resolve the exact key first,
   // then keep a cleaned-id fallback only for older/migrated records.
   const trackingMap = readTrackingMap() as Record<string, any>;
   const exactProjectKey = cleanText(projectId, STATE_LIMITS.id);
   const stableProjectId = cleanId(projectId);
   const matchedKey =
      (exactProjectKey && Object.prototype.hasOwnProperty.call(trackingMap, exactProjectKey) ? exactProjectKey : "") ||
      (stableProjectId && Object.prototype.hasOwnProperty.call(trackingMap, stableProjectId) ? stableProjectId : "") ||
      Object.keys(trackingMap).find((key) => stableProjectId && cleanId(key) === stableProjectId) ||
      "";
   const raw = matchedKey ? trackingMap[matchedKey] : null;
   if (!raw || typeof raw !== "object") return null;

   const milestones = safeArray<any>(raw.milestones)
      .map((milestone, index) => ({
         id: cleanId(milestone?.id) || `${stableProjectId || "project"}-milestone-${index + 1}`,
         title: cleanTitle(milestone?.title),
         status: cleanText(milestone?.status, 80) || "waiting",
         completed: milestone?.completed === true || milestone?.status === "complete",
         completedAt: safeNumber(milestone?.completedAt) || undefined,
         goal: cleanText(milestone?.goal, STATE_LIMITS.summary),
         whyItMatters: cleanText(milestone?.whyItMatters, STATE_LIMITS.summary),
         startingPrompt: cleanText(milestone?.startingPrompt, STATE_LIMITS.summary),
         workingContent: cleanText(milestone?.workingContent, STATE_LIMITS.body),
         decisions: sanitizeStringArray(milestone?.decisions),
         openQuestions: sanitizeStringArray(milestone?.openQuestions),
         dependencies: sanitizeStringArray(milestone?.dependencies),
         completionCriteria: sanitizeStringArray(milestone?.completionCriteria).map((item) => formatMilestoneCheckpoint(item)).filter(Boolean),
         completedCriteria: sanitizeStringArray(milestone?.completedCriteria).map((item) => formatMilestoneCheckpoint(item)).filter(Boolean),
         order: safeNumber(milestone?.order, index + 1),
         createdAt: safeNumber(milestone?.createdAt),
         updatedAt: safeNumber(milestone?.updatedAt),
      }))
      .filter((milestone) => milestone.title);

   const requestedActiveMilestoneId = cleanId(raw.activeMilestoneId);
   const authoritativeMilestone =
      milestones.find((milestone) => milestone.id === requestedActiveMilestoneId && milestone.status !== "complete") ||
      milestones.find((milestone) => milestone.status === "active" && !milestone.completed) ||
      milestones.find((milestone) => milestone.status !== "complete" && !milestone.completed) ||
      null;

   return {
      status: cleanText(raw.status, 80) || "active",
      priority: raw.priority === "low" || raw.priority === "medium" || raw.priority === "high" ? raw.priority : "unknown",
      nextStep: cleanText(raw.nextStep, STATE_LIMITS.summary),
      activeMilestoneId: authoritativeMilestone?.id || "",
      milestones,
      calendarTaskTitle: cleanTitle(raw.calendarTaskTitle),
      calendarTaskDate: cleanText(raw.calendarTaskDate, 80),
      calendarTaskTime: cleanText(raw.calendarTaskTime, 80),
      calendarTaskDurationMinutes: safeNumber(raw.calendarTaskDurationMinutes),
      updatedAt: safeNumber(raw.updatedAt),
   };
}

function findMatchingMemoryProject(project?: CanonicalProjectLibraryItem | null) {
   const projectId = cleanId(project?.id);
   const workflowId = cleanId(project?.workflowId);
   const originBoardItemId = cleanId(project?.originBoardItemId);
   const titleKey = normalizeTitle(project?.title);

   return readProjectMemory().find((record: any) => {
      const recordIds = [record?.id, record?.workflowId, record?.originBoardItemId].map((value) => cleanId(value)).filter(Boolean);
      const identityIds = [projectId, workflowId, originBoardItemId].filter(Boolean);
      if (identityIds.some((id) => recordIds.includes(id))) return true;
      return Boolean(titleKey && normalizeTitle(record?.cleanTitle || record?.title) === titleKey);
   });
}

function readCanvas() {
   return safeParse<any | null>(CANVAS_STORAGE_KEY, null);
}

function canvasMatchesProject(canvas: any, project?: CanonicalProjectLibraryItem | null) {
   if (!canvas || !project) return false;

   const projectIds = [project.id, project.workflowId, project.originBoardItemId].map((value) => cleanId(value)).filter(Boolean);
   const canvasIds = [canvas.workflowId, canvas.originBoardItemId, canvas.projectId].map((value) => cleanId(value)).filter(Boolean);
   if (canvasIds.some((id) => projectIds.includes(id))) return true;

   const projectTitleKey = normalizeTitle(project.title);
   const canvasTitleKey = normalizeTitle(canvas.sourceTitle || canvas.title);
   return Boolean(projectTitleKey && canvasTitleKey && projectTitleKey === canvasTitleKey);
}

function materialMatchesProject(material: any, project?: CanonicalProjectLibraryItem | null) {
   if (!project) return false;
   const projectId = cleanId(project.id);
   const materialProjectId = cleanId(material?.projectId);
   if (projectId && materialProjectId && projectId === materialProjectId) return true;
   return Boolean(normalizeTitle(project.title) && normalizeTitle(material?.projectTitle) === normalizeTitle(project.title));
}

function readScopedMaterials(project?: CanonicalProjectLibraryItem | null) {
   if (!project) return [] as ProjectMaterialInput[];

   return safeArray<any>(safeParse<any[]>(PROJECT_MATERIALS_STORAGE_KEY, []))
      .filter((material) => materialMatchesProject(material, project))
      .map((material) => ({
         id: cleanId(material?.id),
         projectId: cleanId(material?.projectId),
         projectTitle: cleanTitle(material?.projectTitle),
         title: cleanTitle(material?.title),
         type: cleanText(material?.type, 80),
         summary: cleanText(material?.summary, STATE_LIMITS.summary),
         notes: cleanText(material?.notes, STATE_LIMITS.body),
         source: cleanText(material?.source, STATE_LIMITS.small),
         documentText: cleanText(material?.documentText, STATE_LIMITS.body),
         interpretationSummary: cleanText(material?.interpretationSummary, STATE_LIMITS.summary),
         interpretationUsefulContext: cleanText(material?.interpretationUsefulContext, STATE_LIMITS.summary),
         interpretationNextStep: cleanText(material?.interpretationNextStep, STATE_LIMITS.summary),
         createdAt: safeNumber(material?.createdAt),
         updatedAt: safeNumber(material?.updatedAt),
      }))
      .sort((a, b) => safeNumber(b.updatedAt) - safeNumber(a.updatedAt));
}

function eventMatchesProject(event: any, project?: CanonicalProjectLibraryItem | null) {
   if (!project) return false;

   const projectIds = [project.id, project.workflowId, project.originBoardItemId].map((value) => cleanId(value)).filter(Boolean);
   const eventIds = [event?.projectId, event?.workflowId, event?.originProjectsItemId, event?.originBoardItemId].map((value) => cleanId(value)).filter(Boolean);
   if (eventIds.some((id) => projectIds.includes(id))) return true;

   const projectTitleKey = normalizeTitle(project.title);
   const sourceTitleKey = normalizeTitle(event?.sourceTitle);
   const eventTitleKey = normalizeTitle(event?.title);
   return Boolean(projectTitleKey && (sourceTitleKey === projectTitleKey || eventTitleKey === projectTitleKey || eventTitleKey.startsWith(`${projectTitleKey}-`)));
}

function readScopedCalendar(project?: CanonicalProjectLibraryItem | null) {
   if (!project) return [] as CanonicalProjectCalendarEvent[];

   return safeArray<any>(safeParse<any[]>(CALENDAR_EVENTS_STORAGE_KEY, []))
      .filter((event) => eventMatchesProject(event, project))
      .filter((event) => safeNumber(event?.startTime) > 0 && safeNumber(event?.endTime) > safeNumber(event?.startTime))
      .map((event) => ({
         id: cleanId(event?.id),
         title: cleanTitle(event?.title),
         startTime: safeNumber(event?.startTime),
         endTime: safeNumber(event?.endTime),
         allDay: event?.allDay === true,
         description: cleanText(event?.description, 3000),
         sourceTitle: cleanTitle(event?.sourceTitle),
         workflowId: cleanId(event?.workflowId),
         originProjectsItemId: cleanId(event?.originProjectsItemId),
         recommendedNextAction: cleanText(event?.recommendedNextAction, STATE_LIMITS.summary),
         projectStage: cleanText(event?.projectStage, 120),
      }))
      .sort((a, b) => a.startTime - b.startTime);
}

function getLibraryFallbackFromMemory() {
   const memory = [...readProjectMemory()].sort((a: any, b: any) => safeNumber(b?.updatedAt) - safeNumber(a?.updatedAt))[0] as any;
   if (!memory) return null;

   return {
      id: cleanId(memory?.id || memory?.workflowId || memory?.originBoardItemId),
      title: cleanTitle(memory?.cleanTitle || memory?.title),
      workflowId: cleanId(memory?.workflowId),
      originBoardItemId: cleanId(memory?.originBoardItemId),
      latestSummary: cleanText(memory?.workingSummary || memory?.sourceContent || memory?.body, STATE_LIMITS.summary),
      latestMovement: cleanText(memory?.latestMovement, STATE_LIMITS.small),
      notes: [
         {
            body: cleanText(memory?.body || memory?.sourceContent, STATE_LIMITS.body),
            summary: cleanText(memory?.workingSummary || memory?.latestSummary, STATE_LIMITS.summary),
            savedAt: safeNumber(memory?.updatedAt),
         },
      ],
      createdAt: safeNumber(memory?.createdAt),
      updatedAt: safeNumber(memory?.updatedAt),
   } satisfies CanonicalProjectLibraryItem;
}

function getCanvasFallback() {
   const canvas = readCanvas();
   const title = cleanTitle(canvas?.sourceTitle || canvas?.title);
   if (!title) return null;

   return {
      id: cleanId(canvas?.projectId || canvas?.workflowId || canvas?.originBoardItemId),
      title,
      workflowId: cleanId(canvas?.workflowId),
      originBoardItemId: cleanId(canvas?.originBoardItemId),
      latestSummary: cleanText(canvas?.workingSummary || canvas?.content || canvas?.sourceContent, STATE_LIMITS.summary),
      latestMovement: "Canvas is current",
      notes: [
         {
            body: cleanText(canvas?.content || canvas?.sourceContent, STATE_LIMITS.body),
            summary: cleanText(canvas?.workingSummary, STATE_LIMITS.summary),
            savedAt: safeNumber(canvas?.updatedAt),
         },
      ],
      updatedAt: safeNumber(canvas?.updatedAt),
   } satisfies CanonicalProjectLibraryItem;
}

function getEmptyState(): CanonicalProjectState {
   const emptyIntelligence = getEmptyProjectIntelligencePacket();
   return {
      version: "MK XI",
      hasProject: false,
      identity: { projectId: "", title: "", workflowId: "", originBoardItemId: "", selectionSource: "none" },
      project: {
         body: "",
         sourceBrief: "",
         summary: "",
         currentState: "",
         goal: "",
         successState: "",
         projectDocument: parseProjectDocument(""),
         canvasContent: "",
         canvasUpdatedAt: 0,
         projectUpdatedAt: 0,
         tracking: null,
      },
      activeMilestone: null,
      decisions: { confirmed: [], unresolved: [], assumptions: [], rejected: [], superseded: [] },
      dependencies: [],
      risks: [],
      materials: { count: 0, items: [] },
      calendar: { projectSessions: [], upcomingProjectSessions: [], passedProjectSessions: [], nextProjectSession: null },
      recommendation: { nextMove: "", whyNow: "", whatItUnlocks: "", afterThis: "" },
      openQuestions: [],
      recentActivity: { latestMovement: "", updatedAt: 0 },
      confidence: 0,
      projectIntelligence: emptyIntelligence,
      generatedAt: Date.now(),
   };
}

function persistStateSnapshot(state: CanonicalProjectState) {
   if (typeof window === "undefined") return;

   try {
      const snapshot = {
         version: state.version,
         hasProject: state.hasProject,
         identity: state.identity,
         activeMilestone: state.activeMilestone,
         decisions: state.decisions,
         dependencies: state.dependencies,
         risks: state.risks,
         materials: state.materials,
         calendar: state.calendar,
         recommendation: state.recommendation,
         openQuestions: state.openQuestions,
         recentActivity: state.recentActivity,
         confidence: state.confidence,
         generatedAt: state.generatedAt,
      };
      localStorage.setItem(ALLEVIN_PROJECT_STATE_STORAGE_KEY, JSON.stringify(snapshot));
   } catch {
      // A live project state remains available even when the cache cannot be written.
   }
}

export function readCanonicalProjectState(): CanonicalProjectState {
   if (typeof window === "undefined") return getEmptyState();

   const projects = readCanonicalProjectLibrary();
   const resolution = resolveCanonicalProjectSelection(projects);
   let project = resolution.project;
   let selectionSource: CanonicalProjectState["identity"]["selectionSource"] = resolution.source;

   if (!project) {
      project = getLibraryFallbackFromMemory();
      selectionSource = project ? "fallback-memory" : "none";
   }

   if (!project) {
      project = getCanvasFallback();
      selectionSource = project ? "fallback-canvas" : "none";
   }

   if (!project?.title) return getEmptyState();

   const matchingMemory = findMatchingMemoryProject(project);
   const canvas = readCanvas();
   const alignedCanvas = canvasMatchesProject(canvas, project) ? canvas : null;
   // Pass the raw Projects id so storage keys such as `title:...` and
   // `workflow:...` remain addressable. sanitizeTracking still normalizes the
   // ids inside the returned canonical object.
   const tracking = sanitizeTracking(String(project.id || ""));
   const materials = readScopedMaterials(project);
   const calendarEvents = readScopedCalendar(project);

   const libraryBody = cleanText(project.notes?.[0]?.body || project.notes?.[0]?.summary || project.latestSummary, STATE_LIMITS.body);
   const memoryBody = cleanText((matchingMemory as any)?.body || (matchingMemory as any)?.sourceContent || (matchingMemory as any)?.workingSummary, STATE_LIMITS.body);
   const projectBody = libraryBody || memoryBody || cleanText(project.latestSummary, STATE_LIMITS.body) || cleanTitle(project.title);
   const sourceBrief = cleanText(project.sourceBrief || (matchingMemory as any)?.sourceContent, STATE_LIMITS.body);
   const intelligenceBody = sourceBrief && !projectBody.includes(sourceBrief) ? `${projectBody}\n\nOriginal Project Brief:\n${sourceBrief}` : projectBody;
   const projectDocument = parseProjectDocument(projectBody);
   const canvasContent = cleanText(alignedCanvas?.content || alignedCanvas?.sourceContent || alignedCanvas?.workingSummary, STATE_LIMITS.body);
   const projectJournal = readProjectWorkJournal(cleanId(project.id), cleanTitle(project.title));

   // Resolve the current milestone before building project intelligence. Projects
   // owns this choice; intelligence may enrich it but may not select a different
   // milestone simply because an older project document still lists it first.
   const trackingActiveMilestone =
      tracking?.milestones.find((milestone) => milestone.id === tracking?.activeMilestoneId && milestone.status !== "complete") ||
      tracking?.milestones.find((milestone) => milestone.status === "active" && !milestone.completed) ||
      tracking?.milestones.find((milestone) => milestone.status !== "complete" && !milestone.completed) ||
      null;

   const milestoneWorkspaces = tracking?.milestones.map((milestone) => {
      const journalText = formatWorkJournalForIntelligence(readProjectMilestoneWorkJournal(cleanId(project.id), cleanTitle(project.title), milestone.id, milestone.title));
      return {
         id: milestone.id,
         title: milestone.title,
         status: milestone.id === trackingActiveMilestone?.id && milestone.status !== "complete" ? "active" : milestone.status === "active" ? "waiting" : milestone.status,
         goal: milestone.goal,
         whyItMatters: milestone.whyItMatters,
         startingPrompt: milestone.startingPrompt,
         workingContent: [milestone.workingContent, journalText ? `Project updates:\n${journalText}` : ""].filter(Boolean).join("\n\n"),
         decisions: milestone.decisions,
         openQuestions: milestone.openQuestions,
         completionCriteria: milestone.completionCriteria.map((item) => formatMilestoneCheckpoint(item)).filter(Boolean),
         completedCriteria: milestone.completedCriteria.map((item) => formatMilestoneCheckpoint(item)).filter(Boolean),
         dependencies: milestone.dependencies,
         order: milestone.order,
      };
   });

   const rawProjectIntelligence = buildProjectIntelligencePacket({
      title: cleanTitle(project.title),
      projectDocument,
      projectBody: intelligenceBody,
      canvasContent,
      materials,
      milestoneWorkspaces,
   });

   const intelligenceMilestoneForTracking =
      rawProjectIntelligence.projectUnderstanding.milestones.find((milestone) => milestone.id === trackingActiveMilestone?.id) ||
      rawProjectIntelligence.projectUnderstanding.milestones.find((milestone) => normalizeTitle(milestone.title) === normalizeTitle(trackingActiveMilestone?.title)) ||
      null;

   // Canonicalize the intelligence packet itself. AIDock and legacy consumers
   // that still read ProjectUnderstanding now receive the same milestone id as
   // Projects instead of falling back to the first milestone in the old brief.
   const projectIntelligence: ProjectIntelligencePacket =
      trackingActiveMilestone && intelligenceMilestoneForTracking
         ? {
              ...rawProjectIntelligence,
              projectUnderstanding: {
                 ...rawProjectIntelligence.projectUnderstanding,
                 activeMilestoneId: intelligenceMilestoneForTracking.id,
              },
           }
         : rawProjectIntelligence;

   const understanding = projectIntelligence.projectUnderstanding;
   const durableDecisions = readProjectLeadDecisions(cleanId(project.id), cleanTitle(project.title));
   const durableProgress = readProjectLeadProgress(cleanId(project.id), cleanTitle(project.title));

   // ========================================
   // ALLEVIN MK XI B18 — Targets are not confirmed decisions
   // Purpose:
   // Project Intelligence may infer useful structure from the project document,
   // but success criteria and milestone completion criteria describe target
   // states. They are not evidence that those states have already been achieved
   // or explicitly chosen.
   //
   // Durable Project Lead decisions remain authoritative because they originate
   // from explicit user commitment. This boundary only filters *inferred*
   // confirmed decisions that duplicate a target state.
   // ========================================
   const inferredTargetStateKeys = new Set(
      [
         cleanText(understanding.successState, STATE_LIMITS.summary),
         ...(understanding.successCriteria || []).map((criterion) => cleanText(criterion?.statement, STATE_LIMITS.summary)),
         ...(understanding.milestones || []).flatMap((milestone) => [
            ...(milestone.completionCriteria || []),
         ]),
         ...(tracking?.milestones || []).flatMap((milestone) => [
            ...(milestone.completionCriteria || []),
         ]),
      ]
         .map((statement) => normalizeTitle(statement))
         .filter(Boolean),
   );

   const inferredConfirmedDecisions = (understanding.confirmedDecisions || []).filter(
      (decision) => !inferredTargetStateKeys.has(normalizeTitle(decision.statement)),
   );

   const intelligenceActiveMilestone =
      understanding.milestones.find((milestone) => milestone.id === understanding.activeMilestoneId) ||
      understanding.milestones.find((milestone) => milestone.id === trackingActiveMilestone?.id) ||
      understanding.milestones.find((milestone) => normalizeTitle(milestone.title) === normalizeTitle(trackingActiveMilestone?.title)) ||
      understanding.milestones.find((milestone) => milestone.status === "active") ||
      null;

   const currentMilestonePendingCriterion =
      trackingActiveMilestone?.completionCriteria.find(
         (criterion) => !trackingActiveMilestone.completedCriteria.some((completed) => normalizeTitle(completed) === normalizeTitle(criterion)),
      ) || "";

   const currentMilestoneNextMove = cleanText(
      currentMilestonePendingCriterion || trackingActiveMilestone?.startingPrompt || tracking?.nextStep || trackingActiveMilestone?.title,
      STATE_LIMITS.summary,
   );

   const now = Date.now();
   const upcomingProjectSessions = calendarEvents.filter((event) => event.endTime >= now);
   const passedProjectSessions = calendarEvents.filter((event) => event.endTime < now);
   const projectUpdatedAt = Math.max(getProjectUpdatedAt(project), safeNumber((matchingMemory as any)?.updatedAt), safeNumber(tracking?.updatedAt));
   const canvasUpdatedAt = safeNumber(alignedCanvas?.updatedAt);
   const materialUpdatedAt = materials.reduce((latest, material) => Math.max(latest, safeNumber(material.updatedAt)), 0);
   const calendarUpdatedAt = calendarEvents.reduce((latest, event) => Math.max(latest, event.startTime), 0);
   const latestJournalEntry = projectJournal[projectJournal.length - 1];
   const latestMovement =
      cleanText(latestJournalEntry?.text, STATE_LIMITS.small) ||
      cleanText(project.latestMovement || (matchingMemory as any)?.latestMovement, STATE_LIMITS.small) ||
      (canvasUpdatedAt >= projectUpdatedAt && canvasContent ? "Canvas is current" : "Saved project context is current");

   const state: CanonicalProjectState = {
      version: "MK XI",
      hasProject: true,
      identity: {
         projectId: cleanId(project.id),
         title: cleanTitle(project.title),
         workflowId: cleanId(project.workflowId),
         originBoardItemId: cleanId(project.originBoardItemId),
         selectionSource,
      },
      project: {
         body: projectBody,
         sourceBrief,
         summary: cleanText(project.notes?.[0]?.summary || project.latestSummary || (matchingMemory as any)?.workingSummary, STATE_LIMITS.summary),
         currentState: cleanText(projectDocument.currentState, STATE_LIMITS.summary),
         goal: cleanText(understanding.goal || projectDocument.goal, STATE_LIMITS.summary),
         successState: cleanText(understanding.successState, STATE_LIMITS.summary),
         projectDocument,
         canvasContent,
         canvasUpdatedAt,
         projectUpdatedAt,
         tracking,
      },
      activeMilestone: trackingActiveMilestone
         ? {
              id: trackingActiveMilestone.id,
              title: trackingActiveMilestone.title,
              status: trackingActiveMilestone.status,
              goal: trackingActiveMilestone.goal || intelligenceActiveMilestone?.goal || intelligenceActiveMilestone?.purpose || "",
              whyItMatters: trackingActiveMilestone.whyItMatters || intelligenceActiveMilestone?.whyItMatters || "",
              completionCriteria: trackingActiveMilestone.completionCriteria.map((item) => formatMilestoneCheckpoint(item)).filter(Boolean),
              completedCriteria: trackingActiveMilestone.completedCriteria.map((item) => formatMilestoneCheckpoint(item)).filter(Boolean),
              dependencies: [...trackingActiveMilestone.dependencies],
              openQuestions: [...trackingActiveMilestone.openQuestions],
           }
         : intelligenceActiveMilestone
           ? {
                id: intelligenceActiveMilestone.id,
                title: intelligenceActiveMilestone.title,
                status: intelligenceActiveMilestone.status,
                goal: intelligenceActiveMilestone.goal || intelligenceActiveMilestone.purpose,
                whyItMatters: intelligenceActiveMilestone.whyItMatters,
                completionCriteria: intelligenceActiveMilestone.completionCriteria.map((item) => formatMilestoneCheckpoint(item)).filter(Boolean),
                completedCriteria: intelligenceActiveMilestone.completedCriteria.map((item) => formatMilestoneCheckpoint(item)).filter(Boolean),
                dependencies: [...intelligenceActiveMilestone.dependencies],
                openQuestions: [...intelligenceActiveMilestone.openQuestions],
             }
           : null,
      decisions: {
         confirmed: [
            ...durableDecisions
               .filter((decision) => decision.status === "confirmed")
               .map((decision) => ({ id: decision.id, statement: decision.statement, affects: [...decision.affects] })),
            ...inferredConfirmedDecisions
               .filter((decision) => !durableDecisions.some((saved) => normalizeTitle(saved.statement) === normalizeTitle(decision.statement)))
               .map((decision) => ({ id: decision.id, statement: decision.statement, affects: [...decision.affects] })),
         ],
         unresolved: [
            ...durableDecisions
               .filter((decision) => decision.status === "unresolved")
               .map((decision) => ({ id: decision.id, statement: decision.statement, affects: [...decision.affects] })),
            ...understanding.unresolvedDecisions
               .filter((decision) => !durableDecisions.some((saved) => normalizeTitle(saved.statement) === normalizeTitle(decision.statement)))
               .map((decision) => ({ id: decision.id, statement: decision.statement, affects: [...decision.affects] })),
         ],
         assumptions: [
            ...durableDecisions
               .filter((decision) => decision.status === "assumed")
               .map((decision) => ({ id: decision.id, statement: decision.statement, affects: [...decision.affects] })),
            ...understanding.assumptions
               .filter((decision) => !durableDecisions.some((saved) => normalizeTitle(saved.statement) === normalizeTitle(decision.statement)))
               .map((decision) => ({ id: decision.id, statement: decision.statement, affects: [...decision.affects] })),
         ],
         rejected: durableDecisions.filter((decision) => decision.status === "rejected").map((decision) => ({ id: decision.id, statement: decision.statement, affects: [...decision.affects] })),
         superseded: durableDecisions.filter((decision) => decision.status === "superseded").map((decision) => ({ id: decision.id, statement: decision.statement, affects: [...decision.affects] })),
      },
      dependencies: understanding.dependencies.map((dependency) => ({
         id: dependency.id,
         before: dependency.before,
         after: dependency.after,
         reason: dependency.reason,
         state: dependency.state,
      })),
      risks: understanding.risks.map((risk) => ({
         id: risk.id,
         title: risk.title,
         consequence: risk.consequence,
         mitigation: risk.mitigation,
         severity: risk.severity,
      })),
      materials: {
         count: materials.length,
         items: materials.map((material) => ({
            id: cleanId(material.id),
            title: cleanTitle(material.title),
            type: cleanText(material.type, 80),
            summary: cleanText(material.summary || material.notes || material.interpretationSummary, STATE_LIMITS.summary),
            updatedAt: safeNumber(material.updatedAt),
         })),
      },
      calendar: {
         projectSessions: calendarEvents,
         upcomingProjectSessions,
         passedProjectSessions,
         nextProjectSession: upcomingProjectSessions[0] || null,
      },
      recommendation: {
         // The active milestone owns "what next". Intelligence is a fallback only
         // when Projects has no explicit current milestone to ground the answer.
         nextMove: currentMilestoneNextMove || cleanText(understanding.recommendedMove || projectDocument.immediateNextStep, STATE_LIMITS.summary),
         whyNow: cleanText(trackingActiveMilestone?.whyItMatters || understanding.whyNow, STATE_LIMITS.summary),
         whatItUnlocks: cleanText(understanding.whatItUnlocks, STATE_LIMITS.summary),
         afterThis: cleanText(understanding.afterThis, STATE_LIMITS.summary),
      },
      openQuestions: [...understanding.conversation.unresolvedQuestions],
      recentActivity: {
         latestMovement:
            latestJournalEntry && (!durableProgress[0] || latestJournalEntry.createdAt >= durableProgress[0].createdAt)
               ? latestJournalEntry.text
               : durableProgress[0]?.summary || latestMovement,
         updatedAt: Math.max(projectUpdatedAt, canvasUpdatedAt, materialUpdatedAt, calendarUpdatedAt, durableProgress[0]?.createdAt || 0, latestJournalEntry?.createdAt || 0),
      },
      confidence: Math.max(0, Math.min(100, Math.round(projectIntelligence.confidence || understanding.confidence || 0))),
      projectIntelligence,
      libraryProject: project,
      generatedAt: now,
   };

   persistStateSnapshot(state);
   return state;
}

export function refreshCanonicalProjectState(options: { emit?: boolean } = {}) {
   const state = readCanonicalProjectState();

   if (typeof window !== "undefined" && options.emit) {
      window.dispatchEvent(
         new CustomEvent(ALLEVIN_PROJECT_STATE_UPDATED_EVENT, {
            detail: {
               projectId: state.identity.projectId,
               projectTitle: state.identity.title,
               activeMilestoneTitle: state.activeMilestone?.title || "",
               recommendation: state.recommendation.nextMove,
               updatedAt: state.recentActivity.updatedAt || state.generatedAt,
            },
         }),
      );
   }

   return state;
}
