"use client";

import { useEffect, useMemo, useState } from "react";

import Sidebar from "@/layout/Sidebar";

import AIDock from "@/ai/AIDock";

import CommandPalette from "@/components/CommandPalette";

import ClientHydrationGate from "@/components/ClientHydrationGate";

import IntegrationAdapterLayer from "@/components/IntegrationAdapterLayer";

import CalendarIntegrationPanel from "@/components/CalendarIntegrationPanel";

import { WorkspaceProvider } from "@/components/WorkspaceContext";

import { FocusProvider } from "@/components/FocusContext";

import { AIProvider } from "@/components/AIContext";

import { EnvironmentProvider } from "@/components/EnvironmentEngine";

import { getAllevinDisplayName, hasAllevinUserProfile, saveAllevinUserProfile, resetAllevinTesterWorkspace } from "@/lib/allevinUserProfile";

import { getActiveProjectAwareness } from "@/components/MemoryEngine";

import { readCanonicalProjectState } from "@/lib/projectStateAuthority";

// ========================================
// ALLEVIN MK XI Product Shell
// Purpose:
// Beginner-friendly project workspace layout.
// MK XI keeps the product centered on three ideas:
// Projects hold the work and materials, Calendar protects time,
// and the Dock helps each project reach its finished outcome.
// ========================================

type ProductModuleId = "home" | "calendar" | "integrations";

interface ProductModule {
   id: ProductModuleId;

   label: string;
}

// ========================================
// Product Navigation
// ========================================

const productModules: ProductModule[] = [
   {
      id: "home",

      label: "Home",
   },

   {
      id: "integrations",

      label: "Projects",
   },

   {
      id: "calendar",

      label: "Calendar",
   },
];

// ========================================
// Helpers
// ========================================

function isProductModuleId(value?: string): value is ProductModuleId {
   return value === "home" || value === "calendar" || value === "integrations";
}

function getScrollTargetForModule(moduleId: ProductModuleId) {
   if (moduleId === "home") {
      return "overview";
   }

   return "work-area";
}

function getModuleFromWorkflowEvent(eventName: string): ProductModuleId | null {
   switch (eventName) {
      case "allevin-prepare-integration":
      case "allevin-internal-integration-suggestion":
         return "integrations";

      case "allevin-send-to-calendar":
      case "allevin-calendar-readback":
         return "calendar";

      default:
         return null;
   }
}

// ========================================
// Home Intelligence Helpers
// ========================================

const CANVAS_STORAGE_KEY = "allevin-adaptive-work-canvas";

const PROJECT_LIBRARY_STORAGE_KEY = "allevin-project-library";

const PROJECT_MEMORY_STORAGE_KEY = "allevin-mkii-project-memory";

const LEGACY_PROJECT_MEMORY_STORAGE_KEY = "allevin-project-memory";

const CALENDAR_EVENTS_STORAGE_KEY = "allevin-calendar-events-mki";

const ACTIVE_PROJECT_SELECTION_STORAGE_KEY = "allevin-active-project-selection-mkviii";

// ========================================
// MK XI — Page Shell Sanitization
// Home reads stored Projects and Calendar data.
// Treat stored text as untrusted before displaying it.
// ========================================

const PAGE_SANITIZE_LIMITS = {
   title: 120,
   preview: 500,
   suggestion: 900,
   calendarGlance: 500,
   eventName: 120,
   projectBody: 100000,
} as const;

function limitPageTextLength(value: string, maxLength: number) {
   if (value.length <= maxLength) {
      return value;
   }

   return value.slice(0, maxLength).trim();
}

function stripUnsafePageMarkup(value?: string) {
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

function sanitizePageText(value?: string, maxLength: number = PAGE_SANITIZE_LIMITS.preview) {
   return limitPageTextLength(
      stripUnsafePageMarkup(value)
         .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
         .replace(/\u2028|\u2029/g, "\n")
         .replace(/\r/g, "\n")
         .trim(),
      maxLength,
   );
}

function sanitizePageTitle(value?: string) {
   return sanitizePageText(value, PAGE_SANITIZE_LIMITS.title).replace(/\n+/g, " ").trim();
}

function sanitizePageBody(value?: string) {
   return sanitizePageText(value, PAGE_SANITIZE_LIMITS.projectBody);
}

function sanitizeCalendarGlanceText(value?: string) {
   return sanitizePageText(value, PAGE_SANITIZE_LIMITS.calendarGlance);
}

function sanitizeModuleEventValue(value?: string) {
   return sanitizePageText(value, PAGE_SANITIZE_LIMITS.eventName)
      .replace(/[^a-z0-9_-]/gi, "")
      .trim();
}

function compactText(value?: string) {
   return sanitizePageText(value).replace(/\s+/g, " ").trim();
}

function pickRandomItem(values: string[]) {
   return values[Math.floor(Math.random() * values.length)];
}

function getStartOfTodayForHome() {
   const date = new Date();

   date.setHours(0, 0, 0, 0);

   return date.getTime();
}

function getEndOfTodayForHome() {
   const date = new Date();

   date.setHours(23, 59, 59, 999);

   return date.getTime();
}

function getHomeTimeLabel(timestamp?: number) {
   if (!timestamp) {
      return "";
   }

   return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
   });
}

function getHomeDateLabel(timestamp?: number) {
   if (!timestamp) {
      return "";
   }

   return new Date(timestamp).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
   });
}

interface HomeCalendarEvent {
   title?: string;
   startTime?: number;
   endTime?: number;
   allDay?: boolean;
   repeat?: string;
   sourceTitle?: string;
   workflowId?: string;
   originProjectsItemId?: string;
   description?: string;
   workingSummary?: string;
   recommendedNextAction?: string;
}

interface HomeProjectIdentity {
   id?: string;
   title?: string;
   workflowId?: string;
   originBoardItemId?: string;
}

function getHomeProjectIdentityTokens(project?: HomeProjectIdentity | null) {
   return new Set([project?.id, project?.workflowId, project?.originBoardItemId].map((value) => compactText(value)).filter(Boolean));
}

function calendarEventMatchesHomeProject(event: HomeCalendarEvent, project?: HomeProjectIdentity | null) {
   if (!project?.title && !project?.id && !project?.workflowId && !project?.originBoardItemId) {
      return false;
   }

   const projectTitleKey = normalizeHomeProjectTitle(project.title);
   const eventTitleKey = normalizeHomeProjectTitle(event.title);
   const sourceTitleKey = normalizeHomeProjectTitle(event.sourceTitle);
   const projectTokens = getHomeProjectIdentityTokens(project);
   const eventTokens = [event.workflowId, event.originProjectsItemId].map((value) => compactText(value)).filter(Boolean);

   if (eventTokens.some((token) => projectTokens.has(token))) {
      return true;
   }

   if (projectTitleKey && sourceTitleKey === projectTitleKey) {
      return true;
   }

   return Boolean(projectTitleKey && (eventTitleKey === projectTitleKey || eventTitleKey.startsWith(`${projectTitleKey}-`)));
}

function formatHomeCalendarEvent(event: HomeCalendarEvent, prefix = "Next up") {
   const title = compactText(event.title) || "Calendar event";
   const repeatText = event.repeat && event.repeat !== "none" ? ", repeats" : "";
   const todayStart = getStartOfTodayForHome();
   const todayEnd = getEndOfTodayForHome();
   const isToday = Number(event.startTime) <= todayEnd && Number(event.endTime) >= todayStart;

   if (isToday) {
      const timeText = event.allDay ? "all day" : getHomeTimeLabel(event.startTime);
      return sanitizeCalendarGlanceText(`${title} is on your calendar today at ${timeText}${repeatText}.`);
   }

   const dateText = getHomeDateLabel(event.startTime);
   const timeText = event.allDay ? "all day" : getHomeTimeLabel(event.startTime);

   return sanitizeCalendarGlanceText(`${prefix}: ${title} on ${dateText} at ${timeText}${repeatText}.`);
}

function getHomeCalendarGlance() {
   if (typeof window === "undefined") {
      return "Calendar shows events, deadlines, and focused work blocks after you add them.";
   }

   const canonicalState = readCanonicalProjectState();

   if (canonicalState.hasProject) {
      const nextProjectSession = canonicalState.calendar.nextProjectSession;

      if (nextProjectSession) {
         return formatHomeCalendarEvent(nextProjectSession);
      }
   }

   const events = safeParseStorage<HomeCalendarEvent[]>(CALENDAR_EVENTS_STORAGE_KEY, []);
   const now = Date.now();

   const cleanEvents = events
      .filter((event) => compactText(event.title) && typeof event.startTime === "number" && typeof event.endTime === "number" && Number(event.endTime) >= now)
      .map((event) => ({
         ...event,
         title: sanitizePageTitle(event.title),
         sourceTitle: sanitizePageTitle(event.sourceTitle),
         workflowId: compactText(event.workflowId),
         originProjectsItemId: compactText(event.originProjectsItemId),
      }))
      .sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0));

   if (!cleanEvents.length) {
      return "No events scheduled yet. Add one in Calendar when work needs protected time.";
   }

   const activeProject = getSelectedProjectLibraryItemForHome();
   const activeProjectEvents = activeProject ? cleanEvents.filter((event) => calendarEventMatchesHomeProject(event, activeProject)) : [];

   if (activeProjectEvents.length) {
      return formatHomeCalendarEvent(activeProjectEvents[0]);
   }

   if (activeProject?.title) {
      const nextEvent = formatHomeCalendarEvent(cleanEvents[0], "Next on your calendar");
      return sanitizeCalendarGlanceText(`No upcoming ${sanitizePageTitle(activeProject.title)} session is scheduled. ${nextEvent}`);
   }

   return formatHomeCalendarEvent(cleanEvents[0]);
}

function getGeneratedHomeGreeting() {
   return "Here’s what matters right now.";
}

function safeParseStorage<T>(key: string, fallback: T): T {
   if (typeof window === "undefined") {
      return fallback;
   }

   const stored = localStorage.getItem(key);

   if (!stored) {
      return fallback;
   }

   try {
      return JSON.parse(stored) as T;
   } catch {
      return fallback;
   }
}

function getProjectUpdatedAtForHome(project: { updatedAt?: number; createdAt?: number; notes?: Array<{ savedAt?: number }> }) {
   return typeof project.updatedAt === "number" ? project.updatedAt : typeof project.notes?.[0]?.savedAt === "number" ? project.notes[0].savedAt : typeof project.createdAt === "number" ? project.createdAt : 0;
}

function normalizeHomeProjectTitle(value?: string) {
   return sanitizePageTitle(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

interface HomeProjectLibraryItem {
   id?: string;
   title?: string;
   latestSummary?: string;
   workflowId?: string;
   originBoardItemId?: string;
   notes?: Array<{ body?: string; summary?: string; savedAt?: number }>;
   updatedAt?: number;
   createdAt?: number;
}

interface HomeActiveProjectSelection {
   projectId: string;
   title: string;
}

function readProjectLibraryForHome() {
   const parsed = safeParseStorage<HomeProjectLibraryItem[] | { items?: HomeProjectLibraryItem[] }>(PROJECT_LIBRARY_STORAGE_KEY, []);
   const projects = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];

   return projects.filter((project) => compactText(project?.title));
}

function readActiveProjectSelectionForHome(): HomeActiveProjectSelection | null {
   if (typeof window === "undefined") {
      return null;
   }

   const parsed = safeParseStorage<{
      projectId?: string;
      id?: string;
      title?: string;
      projectTitle?: string;
   } | null>(ACTIVE_PROJECT_SELECTION_STORAGE_KEY, null);

   if (!parsed || typeof parsed !== "object") {
      return null;
   }

   const projectId = compactText(parsed.projectId || parsed.id);
   const title = sanitizePageTitle(parsed.title || parsed.projectTitle);

   if (!projectId && !title) {
      return null;
   }

   return {
      projectId,
      title,
   };
}

function getSelectedProjectLibraryItemForHome() {
   const projectLibrary = readProjectLibraryForHome();
   const selection = readActiveProjectSelectionForHome();

   if (!selection) {
      return undefined;
   }

   const selectedTitleKey = normalizeHomeProjectTitle(selection.title);

   return projectLibrary.find((project) => {
      const projectTitleKey = normalizeHomeProjectTitle(project.title);

      return Boolean((selection.projectId && compactText(project.id) === selection.projectId) || (selectedTitleKey && projectTitleKey === selectedTitleKey));
   });
}

function getLatestProjectLibraryItemForHome() {
   const selectedProject = getSelectedProjectLibraryItemForHome();

   if (selectedProject) {
      return selectedProject;
   }

   return [...readProjectLibraryForHome()].sort((a, b) => getProjectUpdatedAtForHome(b) - getProjectUpdatedAtForHome(a))[0];
}

function getLatestProjectMemoryItemForHome() {
   const memoryFromCurrentKey = safeParseStorage<
      Array<{
         title?: string;
         cleanTitle?: string;
         body?: string;
         sourceContent?: string;
         workingSummary?: string;
         latestSummary?: string;
         updatedAt?: number;
      }>
   >(PROJECT_MEMORY_STORAGE_KEY, []);

   const memoryFromLegacyKey = safeParseStorage<
      Array<{
         title?: string;
         cleanTitle?: string;
         body?: string;
         sourceContent?: string;
         workingSummary?: string;
         latestSummary?: string;
         updatedAt?: number;
      }>
   >(LEGACY_PROJECT_MEMORY_STORAGE_KEY, []);

   return [...memoryFromCurrentKey, ...memoryFromLegacyKey].filter((project) => compactText(project.cleanTitle || project.title)).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
}

function getProjectBodyPreviewForHome(...values: Array<string | undefined>) {
   const cleanValues = values.map((value) => sanitizePageText(value, PAGE_SANITIZE_LIMITS.preview)).filter(Boolean);

   const nonCalendarOnly = cleanValues.find((value) => !value.toLowerCase().startsWith("calendar event:"));

   return nonCalendarOnly || cleanValues[0] || "";
}

function getLastWorkedOnProject() {
   if (typeof window === "undefined") {
      return {
         title: "",
         body: "",
         source: "",
      };
   }

   const canonicalState = readCanonicalProjectState();

   if (canonicalState.hasProject) {
      return {
         title: canonicalState.identity.title,
         body: sanitizePageText(canonicalState.project.body || canonicalState.project.summary, PAGE_SANITIZE_LIMITS.preview),
         source: "Projects",
      };
   }

   const canvas = safeParseStorage<{
      title?: string;
      sourceTitle?: string;
      content?: string;
      sourceContent?: string;
      workingSummary?: string;
      updatedAt?: number;
   } | null>(CANVAS_STORAGE_KEY, null);

   const canvasTitle = sanitizePageTitle(canvas?.sourceTitle || canvas?.title);
   const canvasBody = sanitizePageText(canvas?.content || canvas?.sourceContent || canvas?.workingSummary, PAGE_SANITIZE_LIMITS.preview);
   const selectedLibraryProject = getSelectedProjectLibraryItemForHome();

   if (selectedLibraryProject?.title) {
      const selectedTitle = sanitizePageTitle(selectedLibraryProject.title);
      const selectedTitleKey = normalizeHomeProjectTitle(selectedTitle);
      const selectedBody = getProjectBodyPreviewForHome(selectedLibraryProject.notes?.[0]?.body, selectedLibraryProject.notes?.[0]?.summary, selectedLibraryProject.latestSummary);
      const canvasMatchesSelection = Boolean(selectedTitleKey && normalizeHomeProjectTitle(canvasTitle) === selectedTitleKey);

      return {
         title: selectedTitle,
         body: (canvasMatchesSelection ? canvasBody : "") || selectedBody,
         source: "Projects",
      };
   }

   const latestLibraryProject = getLatestProjectLibraryItemForHome();
   const libraryTitle = sanitizePageTitle(latestLibraryProject?.title);
   const libraryBody = getProjectBodyPreviewForHome(latestLibraryProject?.notes?.[0]?.body, latestLibraryProject?.notes?.[0]?.summary, latestLibraryProject?.latestSummary);
   const latestMemoryProject = getLatestProjectMemoryItemForHome();
   const memoryTitle = sanitizePageTitle(latestMemoryProject?.cleanTitle || latestMemoryProject?.title);
   const memoryBody = getProjectBodyPreviewForHome(latestMemoryProject?.body, latestMemoryProject?.sourceContent, latestMemoryProject?.workingSummary, latestMemoryProject?.latestSummary);
   const canvasUpdated = Number(canvas?.updatedAt || 0);
   const libraryUpdated = getProjectUpdatedAtForHome(latestLibraryProject || {});
   const memoryUpdated = Number(latestMemoryProject?.updatedAt || 0);
   const canvasKey = normalizeHomeProjectTitle(canvasTitle);
   const libraryKey = normalizeHomeProjectTitle(libraryTitle);
   const memoryKey = normalizeHomeProjectTitle(memoryTitle);

   if (canvasTitle && (canvasKey === libraryKey || canvasKey === memoryKey || canvasUpdated >= libraryUpdated || canvasUpdated >= memoryUpdated)) {
      return {
         title: canvasTitle,
         body: canvasBody || libraryBody || memoryBody,
         source: "Canvas",
      };
   }

   if (libraryTitle && libraryUpdated >= memoryUpdated) {
      return {
         title: libraryTitle,
         body: libraryBody || memoryBody,
         source: "Projects",
      };
   }

   if (memoryTitle) {
      return {
         title: memoryTitle,
         body: memoryBody,
         source: "Projects",
      };
   }

   if (canvasTitle) {
      return {
         title: canvasTitle,
         body: canvasBody,
         source: "Canvas",
      };
   }

   return {
      title: "",
      body: "",
      source: "",
   };
}

function getLatestProjectCanvasPayloadForHome() {
   if (typeof window === "undefined") {
      return null;
   }

   const latestLibraryProject = getLatestProjectLibraryItemForHome();

   if (latestLibraryProject?.title) {
      const title = sanitizePageTitle(latestLibraryProject.title);

      const body = sanitizePageBody(latestLibraryProject.notes?.[0]?.body || latestLibraryProject.latestSummary || latestLibraryProject.notes?.[0]?.summary || title);

      const workflowId = sanitizePageTitle(latestLibraryProject.workflowId || latestLibraryProject.id || latestLibraryProject.originBoardItemId || "");

      const originBoardItemId = sanitizePageTitle(latestLibraryProject.originBoardItemId || latestLibraryProject.id || latestLibraryProject.workflowId || "");

      return {
         title,
         body: body || title,
         source: "project" as const,
         sourceTitle: title,
         sourceContent: body || title,
         workingSummary: body || title,
         cleanSourceContent: body || title,
         workflowId: workflowId || undefined,
         originBoardItemId: originBoardItemId || workflowId || undefined,
         projectId: sanitizePageTitle(latestLibraryProject.id || "") || undefined,
      };
   }

   const latestMemoryProject = getLatestProjectMemoryItemForHome();

   if (latestMemoryProject?.title || latestMemoryProject?.cleanTitle) {
      const title = sanitizePageTitle(latestMemoryProject.cleanTitle || latestMemoryProject.title);

      const body = sanitizePageBody(latestMemoryProject.body || latestMemoryProject.sourceContent || latestMemoryProject.workingSummary || latestMemoryProject.latestSummary || title);

      return {
         title,
         body: body || title,
         source: "project" as const,
         sourceTitle: title,
         sourceContent: body || title,
         workingSummary: body || title,
         cleanSourceContent: body || title,
         workflowId: undefined,
         originBoardItemId: undefined,
         projectId: undefined,
      };
   }

   const canvas = safeParseStorage<{
      title?: string;
      sourceTitle?: string;
      content?: string;
      sourceContent?: string;
      workingSummary?: string;
      workflowId?: string;
      originBoardItemId?: string;
   } | null>(CANVAS_STORAGE_KEY, null);

   const title = sanitizePageTitle(canvas?.sourceTitle || canvas?.title);

   if (!title) {
      return null;
   }

   const body = sanitizePageBody(canvas?.content || canvas?.sourceContent || canvas?.workingSummary || title);

   return {
      title,
      body: body || title,
      source: "project" as const,
      sourceTitle: title,
      sourceContent: body || title,
      workingSummary: body || title,
      cleanSourceContent: body || title,
      workflowId: sanitizePageTitle(canvas?.workflowId || "") || undefined,
      originBoardItemId: sanitizePageTitle(canvas?.originBoardItemId || canvas?.workflowId || "") || undefined,
      projectId: undefined,
   };
}

function getGeneratedSuggestionTail() {
   const tails = [
      "That keeps the work moving without adding more steps.",
      "It is small enough to finish and useful enough to keep.",
      "That gives the project a clear place to continue from.",
      "It keeps the next move clear without making the plan bigger than it needs to be.",
      "That is a practical place to start.",
      "It should make the next pass easier to continue.",
      "That keeps the project manageable.",
      "It gives you momentum without asking for too much at once.",
   ];

   return sanitizePageText(pickRandomItem(tails), PAGE_SANITIZE_LIMITS.suggestion);
}

function getHomeProjectKey(project: { title: string; body: string; source: string }) {
   const bodyPreview = sanitizePageText(project.body, 240);

   return `${project.source || "none"}::${project.title || "none"}::${bodyPreview}`;
}

function getHomeSuggestion(project: { title: string; body: string; source: string }) {
   if (!project.title) {
      return "Create a project and describe what you are trying to accomplish. ALLEVIN will turn that into editable Working Notes, progress points, and a clear starting move.";
   }

   const canonicalState = readCanonicalProjectState();

   if (canonicalState.hasProject && normalizeHomeProjectTitle(canonicalState.identity.title) === normalizeHomeProjectTitle(project.title)) {
      const nextMove = sanitizePageText(canonicalState.recommendation.nextMove, PAGE_SANITIZE_LIMITS.suggestion);

      if (nextMove) {
         return nextMove;
      }
   }

   try {
      const awareness = getActiveProjectAwareness();
      const awarenessTitle = sanitizePageTitle(awareness.title);
      const awarenessMatchesProject = Boolean(awareness.hasActiveProject && awarenessTitle && normalizeHomeProjectTitle(awarenessTitle) === normalizeHomeProjectTitle(project.title));
      const understanding = awarenessMatchesProject ? awareness.projectIntelligence?.projectUnderstanding : undefined;

      if (understanding) {
         const recommendedMove = sanitizePageText(understanding.recommendedMove, PAGE_SANITIZE_LIMITS.suggestion);

         if (recommendedMove) {
            return recommendedMove;
         }
      }
   } catch {
      // Fall through to the local note-based recommendation.
   }

   const lower = compactText(project.body).toLowerCase();

   const nextSentence =
      project.body
         .split(/(?<=[.!?])\s+/)
         .map((sentence) => compactText(sentence))
         .find((sentence) => /\b(?:need to|needs to|next|should|must|confirm|send|build|review|test|finalize|schedule|create|write|collect)\b/i.test(sentence)) || "";

   if (nextSentence) {
      return sanitizePageText(nextSentence, PAGE_SANITIZE_LIMITS.suggestion);
   }

   if (lower.includes("goal") || lower.includes("success")) {
      return "Review the current progress points and choose the first unfinished milestone that moves the project closer to its finished outcome.";
   }

   return "Open the project, review the Working Notes, and choose one clear progress point to move forward.";
}
// ========================================
// Home
// ========================================

function HomeStart({ setActiveModule }: { setActiveModule: (moduleId: ProductModuleId) => void }) {
   const greeting = useMemo(() => {
      const hour = new Date().getHours();

      if (hour < 12) {
         return "Good morning";
      }

      if (hour < 18) {
         return "Good afternoon";
      }

      return "Good evening";
   }, []);

   const [homeGreeting, setHomeGreeting] = useState("");

   const [lastProject, setLastProject] = useState({
      title: "",
      body: "",
      source: "",
   });

   const [homeSuggestion, setHomeSuggestion] = useState("");

   const [currentMilestoneTitle, setCurrentMilestoneTitle] = useState("");

   const [calendarGlance, setCalendarGlance] = useState("");

   const [displayName, setDisplayName] = useState("there");

   const [nameDraft, setNameDraft] = useState("");

   const [profileReady, setProfileReady] = useState(false);

   const [resetNotice, setResetNotice] = useState("");

   const [, setHomeSuggestionKey] = useState("");

   useEffect(() => {
      let refreshTimer: number | null = null;

      let mounted = true;

      const existingName = getAllevinDisplayName("");

      setDisplayName(existingName || "there");

      setNameDraft(existingName || "");

      setProfileReady(hasAllevinUserProfile());

      setHomeGreeting(getGeneratedHomeGreeting());

      function applyHomeContextRefresh() {
         if (!mounted) {
            return;
         }

         const nextProject = getLastWorkedOnProject();

         const nextSuggestionKey = getHomeProjectKey(nextProject);

         setLastProject(nextProject);

         const canonicalState = readCanonicalProjectState();
         setCurrentMilestoneTitle(canonicalState.hasProject && canonicalState.activeMilestone ? sanitizePageTitle(canonicalState.activeMilestone.title) : "");

         setCalendarGlance(getHomeCalendarGlance());

         setHomeSuggestionKey(nextSuggestionKey);

         setHomeSuggestion(getHomeSuggestion(nextProject));
      }

      function refreshHomeContext() {
         if (refreshTimer) {
            window.clearTimeout(refreshTimer);
         }

         // Defer the Home refresh so project-memory and Dock events
         // do not update Home state during another component's render/update cycle.
         refreshTimer = window.setTimeout(() => {
            refreshTimer = null;

            applyHomeContextRefresh();
         }, 0);
      }

      refreshHomeContext();

      function handleUserProfileUpdate() {
         const nextName = getAllevinDisplayName("");

         setDisplayName(nextName || "there");

         setNameDraft(nextName || "");

         setProfileReady(hasAllevinUserProfile());
      }

      window.addEventListener("storage", refreshHomeContext);

      window.addEventListener("allevin-user-profile-update", handleUserProfileUpdate);

      window.addEventListener("allevin-workspace-reset", refreshHomeContext);

      window.addEventListener("allevin-project-memory-update", refreshHomeContext);

      window.addEventListener("allevin-project-library-update", refreshHomeContext);

      window.addEventListener("allevin-active-project-selection-change", refreshHomeContext);

      window.addEventListener("allevin-project-state-update", refreshHomeContext);

      window.addEventListener("allevin-project-progress-update", refreshHomeContext);

      window.addEventListener("allevin-project-materials-update", refreshHomeContext);

      window.addEventListener("allevin-memory-update", refreshHomeContext);

      window.addEventListener("allevin-send-to-canvas", refreshHomeContext);

      window.addEventListener("allevin-prepare-integration", refreshHomeContext);

      window.addEventListener("allevin-calendar-events-updated", refreshHomeContext);

      window.addEventListener("allevin-send-to-calendar", refreshHomeContext);

      window.addEventListener("allevin-internal-integration-suggestion", refreshHomeContext);

      return () => {
         mounted = false;

         if (refreshTimer) {
            window.clearTimeout(refreshTimer);
         }

         window.removeEventListener("storage", refreshHomeContext);

         window.removeEventListener("allevin-user-profile-update", handleUserProfileUpdate);

         window.removeEventListener("allevin-workspace-reset", refreshHomeContext);

         window.removeEventListener("allevin-project-memory-update", refreshHomeContext);

         window.removeEventListener("allevin-project-library-update", refreshHomeContext);

         window.removeEventListener("allevin-active-project-selection-change", refreshHomeContext);

         window.removeEventListener("allevin-project-state-update", refreshHomeContext);

         window.removeEventListener("allevin-project-progress-update", refreshHomeContext);

         window.removeEventListener("allevin-project-materials-update", refreshHomeContext);

         window.removeEventListener("allevin-memory-update", refreshHomeContext);

         window.removeEventListener("allevin-send-to-canvas", refreshHomeContext);

         window.removeEventListener("allevin-prepare-integration", refreshHomeContext);

         window.removeEventListener("allevin-calendar-events-updated", refreshHomeContext);

         window.removeEventListener("allevin-send-to-calendar", refreshHomeContext);

         window.removeEventListener("allevin-internal-integration-suggestion", refreshHomeContext);
      };
   }, []);

   function handleTesterProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();

      const savedProfile = saveAllevinUserProfile(nameDraft);

      if (!savedProfile) {
         return;
      }

      setDisplayName(savedProfile.displayName);

      setProfileReady(true);

      setHomeGreeting(getGeneratedHomeGreeting());
   }

   function handleTesterWorkspaceReset() {
      const confirmed = window.confirm("Reset this test workspace? This clears saved Projects, Calendar, and response style data in this browser only.");

      if (!confirmed) {
         return;
      }

      resetAllevinTesterWorkspace({ preserveProfile: true });

      setLastProject({
         title: "",
         body: "",
         source: "",
      });

      setCurrentMilestoneTitle("");

      setCalendarGlance(getHomeCalendarGlance());

      setHomeSuggestion(getHomeSuggestion({ title: "", body: "", source: "" }));

      setResetNotice("Workspace reset in this browser. Your name was kept.");

      window.setTimeout(() => {
         setResetNotice("");
      }, 2400);
   }

   if (!profileReady) {
      return (
         <section
            id="overview"
            className="
               scroll-mt-24
               pb-4
               lg:scroll-mt-28
            "
         >
            <div
               className="
                  studio-paper
                  p-5
                  sm:p-7
                  lg:p-10
               "
            >
               <p className="studio-eyebrow">Welcome to ALLEVIN</p>

               <h1 data-editorial-title="true" className="mt-4 max-w-3xl text-4xl leading-tight sm:text-5xl">
                  Set up your studio.
               </h1>

               <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)]">ALLEVIN uses your name for greetings. Your projects, working notes, materials, and schedule stay together in this browser.</p>

               <form onSubmit={handleTesterProfileSubmit} className="mt-6 max-w-xl space-y-4">
                  <label className="block">
                     <span className="text-sm font-medium text-[var(--color-text-primary)]">What should ALLEVIN call you?</span>

                     <input
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        maxLength={40}
                        placeholder="Enter your first name"
                        className="
                           mt-2
                           w-full
                           rounded-2xl
                           border
                           border-[var(--border-subtle)]
                           bg-white
                           px-4
                           py-3
                           text-sm
                           outline-none
                           transition
                           focus:border-[var(--color-primary)]
                           focus:shadow-[var(--shadow-focus)]
                        "
                     />
                  </label>

                  <div className="rounded-[var(--radius-lg)] border border-[var(--border-muted)] bg-[var(--color-bg-soft)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">
                     Testing note: avoid highly sensitive information. This version saves your workspace in this browser.
                  </div>

                  <button type="submit" className="studio-button-primary">
                     Enter Studio
                  </button>
               </form>
            </div>
         </section>
      );
   }

   return (
      <section id="overview" className="scroll-mt-24 pb-6 lg:scroll-mt-28">
         <div className="mx-auto w-full max-w-[1240px] space-y-5 sm:space-y-6">
            <header className="px-1 pt-0 sm:px-2 sm:pt-1">
               <h1 data-editorial-title="true" className="mt-3 max-w-4xl text-4xl leading-[1.02] sm:text-5xl lg:text-6xl">
                  {greeting}, {displayName}.
               </h1>
               <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">{homeGreeting}</p>
            </header>

            <section className="studio-paper overflow-hidden">
               <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.7fr)]">
                  <div className="min-w-0 p-5 sm:p-7 lg:p-8">
                     <p className="studio-eyebrow">Active project</p>
                     <h2 data-editorial-title="true" className="mt-3 max-w-4xl text-3xl leading-tight sm:text-4xl lg:text-[2.65rem]">
                        {lastProject.title || "Your next project starts here."}
                     </h2>

                     {currentMilestoneTitle && (
                        <div className="mt-6 border-t border-[var(--border-subtle)] pt-5">
                           <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Current milestone</p>
                           <p className="mt-2 text-base font-semibold leading-6 text-[var(--color-text-primary)]">{currentMilestoneTitle}</p>
                        </div>
                     )}

                     <div className="mt-5 rounded-[var(--radius-lg)] bg-[var(--color-bg-soft)] p-4 sm:p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Next</p>
                        <p className="mt-2 max-w-3xl text-base leading-7 text-[var(--color-text-primary)]">{homeSuggestion}</p>
                     </div>

                     <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button onClick={() => setActiveModule("integrations")} className="studio-button-primary w-full sm:w-auto sm:min-w-[148px]">
                           Open Project
                        </button>
                        <button onClick={() => setActiveModule("calendar")} className="studio-button-secondary w-full justify-center sm:w-auto">
                           Open Calendar
                        </button>
                     </div>
                  </div>

                  <aside className="border-t border-[var(--border-subtle)] bg-[var(--color-bg-soft)] p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
                     <p className="studio-eyebrow">Schedule</p>
                     <p className="mt-3 text-sm leading-6 text-[var(--color-text-primary)] sm:text-base">{calendarGlance}</p>
                     <button onClick={() => setActiveModule("calendar")} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)] hover:opacity-80">
                        View schedule →
                     </button>
                  </aside>
               </div>
            </section>

            <div className="flex justify-end px-1">
               <button
                  onClick={handleTesterWorkspaceReset}
                  className="rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-text-secondary)]"
               >
                  Reset test workspace
               </button>
            </div>
            {resetNotice && <p className="px-1 text-right text-xs text-[var(--color-text-secondary)]">{resetNotice}</p>}
         </div>
      </section>
   );

}

// ========================================
// Home
// ========================================

export default function Home() {
   const [activeModule, setActiveModule] = useState<ProductModuleId>("home");

   function activateModule(moduleId: ProductModuleId, shouldScroll = true) {
      const sanitizedModuleId = sanitizeModuleEventValue(moduleId);

      const resolvedModuleId = isProductModuleId(sanitizedModuleId) ? sanitizedModuleId : "home";

      const safeModuleId: ProductModuleId = resolvedModuleId;

      setActiveModule(safeModuleId);

      window.dispatchEvent(
         new CustomEvent("allevin-active-product-module-change", {
            detail: {
               moduleId: safeModuleId,
            },
         }),
      );

      if (!shouldScroll) {
         return;
      }

      window.setTimeout(() => {
         const target = document.getElementById(getScrollTargetForModule(safeModuleId));

         target?.scrollIntoView({
            behavior: "smooth",

            block: "start",
         });
      }, 80);
   }

   // ========================================
   // Route Listener
   // Keeps modules mounted but switches visible
   // focused area when product navigation,
   // ALLEVIN, Cmd+K, sidebar, or workflow
   // actions fire.
   // ========================================

   useEffect(() => {
      function handleOpenProductModule(event: Event) {
         const customEvent = event as CustomEvent<{
            moduleId?: string;
         }>;

         const moduleId = sanitizeModuleEventValue(customEvent.detail?.moduleId);

         if (!isProductModuleId(moduleId)) {
            return;
         }

         activateModule(moduleId);
      }

      function makeWorkflowHandler(eventName: string) {
         return (event: Event) => {
            const customEvent = event as CustomEvent<{
               moduleId?: string;
               target?: string;
               destination?: string;
            }>;

            const detailTarget = sanitizeModuleEventValue(customEvent.detail?.target || customEvent.detail?.destination);

            const moduleId =
               detailTarget === "canvas" ? "integrations" : detailTarget === "calendar" ? "calendar" : detailTarget === "projects" || detailTarget === "integrations" || detailTarget === "notes" ? "integrations" : getModuleFromWorkflowEvent(eventName);

            if (moduleId) {
               activateModule(moduleId);
            }
         };
      }

      const workflowHandlers = ["allevin-send-to-canvas", "allevin-send-to-calendar", "allevin-calendar-readback", "allevin-prepare-integration", "allevin-internal-integration-suggestion"].map((eventName) => ({
         eventName,

         handler: makeWorkflowHandler(eventName),
      }));

      window.addEventListener("allevin-open-product-module", handleOpenProductModule);

      workflowHandlers.forEach(({ eventName, handler }) => {
         window.addEventListener(eventName, handler);
      });

      return () => {
         window.removeEventListener("allevin-open-product-module", handleOpenProductModule);

         workflowHandlers.forEach(({ eventName, handler }) => {
            window.removeEventListener(eventName, handler);
         });
      };
   }, []);

   return (
      <ClientHydrationGate>
         <FocusProvider>
            <WorkspaceProvider>
               <EnvironmentProvider>
                  <AIProvider>
                     <main
                        className="
                        flex
                        min-h-screen
                        min-w-0
                        w-full
                        overflow-x-hidden
                        bg-transparent
                        text-[var(--color-text-primary)]
                     "
                     >
                        {/* Sidebar */}

                        <Sidebar />

                        {/* Command Palette */}

                        <CommandPalette />

                        {/* Main */}

                        <div className="relative z-0 flex min-w-0 flex-1 flex-col overflow-x-hidden">
                           <div
                              className="
                              min-w-0
                              max-w-full
                              flex-1
                              scroll-smooth
                              overflow-x-hidden
                              overflow-y-auto
                              px-[var(--space-page-x)]
                              pt-0
                              pb-44
                              sm:pt-0
                              sm:pb-44
                              lg:pt-0
                              lg:pl-28
                              lg:pb-12
                              xl:pr-8
                              2xl:pr-[520px]
                           "
                           >
                              {/* Product Navigation */}

                              <div
                                 className="
                                 sticky
                                 top-0
                                 z-30
                                 mb-5
                                 hidden
                                 border-b
                                 border-[var(--border-subtle)]
                                 bg-[rgba(247,245,240,0.94)]
                                 backdrop-blur-xl
                                 sm:block
                              "
                              >
                                 <div
                                    className="
                                    mx-auto
                                    flex
                                    max-w-[1480px]
                                    items-center
                                    justify-center
                                    gap-7
                                    overflow-x-auto
                                    px-2
                                 "
                                 >
                                    {productModules.map((module) => {
                                       const active = activeModule === module.id;

                                       return (
                                          <button
                                             key={module.id}
                                             onClick={() => activateModule(module.id)}
                                             className={`
                                             relative
                                             min-h-14
                                             whitespace-nowrap
                                             px-1
                                             text-sm
                                             font-medium
                                             transition-colors

                                             ${
                                                active
                                                   ? `
                                                      text-[var(--color-text-primary)]
                                                   `
                                                   : `
                                                      text-[var(--color-text-secondary)]
                                                      hover:text-[var(--color-text-primary)]
                                                   `
                                             }
                                          `}
                                          >
                                             {module.label}

                                             <span
                                                aria-hidden="true"
                                                className={`
                                                absolute
                                                bottom-0
                                                left-0
                                                right-0
                                                h-0.5
                                                rounded-full
                                                bg-[var(--color-primary)]
                                                transition-opacity

                                                ${active ? "opacity-100" : "opacity-0"}
                                             `}
                                             />
                                          </button>
                                       );
                                    })}
                                 </div>
                              </div>

                              {/* Home */}

                              <div className={activeModule === "home" ? "block" : "hidden"}>
                                 <HomeStart setActiveModule={activateModule} />
                              </div>

                              {/* Main Work Area */}

                              <section
                                 id="work-area"
                                 className={`
                                 min-w-0
                                 scroll-mt-24
                                 lg:scroll-mt-28

                                 ${activeModule !== "home" ? "block" : "hidden"}
                              `}
                              >
                                 {/* Main workspace modules stay mounted when active so product events route cleanly. */}
                                 <div id="calendar" className={activeModule === "calendar" ? "block min-w-0" : "hidden"}>
                                    <CalendarIntegrationPanel />
                                 </div>

                                 <div id="integrations" className={activeModule === "integrations" ? "block min-w-0" : "hidden"}>
                                    <IntegrationAdapterLayer />
                                 </div>
                              </section>
                           </div>
                        </div>

                        {/* ALLEVIN Dock */}

                        <AIDock />
                     </main>
                  </AIProvider>
               </EnvironmentProvider>
            </WorkspaceProvider>
         </FocusProvider>
      </ClientHydrationGate>
   );
}
