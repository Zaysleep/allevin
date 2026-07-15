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

// ========================================
// ALLEVIN MK VIII Product Shell
// Purpose:
// Beginner-friendly project workspace layout.
// MK VIII keeps the product centered on three ideas:
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

// ========================================
// MK VIII — Page Shell Sanitization
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

function getHomeCalendarGlance() {
   if (typeof window === "undefined") {
      return "Calendar shows events, deadlines, and focused work blocks after you add them.";
   }

   const events = safeParseStorage<
      Array<{
         title?: string;
         startTime?: number;
         endTime?: number;
         allDay?: boolean;
         repeat?: string;
      }>
   >(CALENDAR_EVENTS_STORAGE_KEY, []);

   const now = Date.now();

   const cleanEvents = events
      .filter((event) => compactText(event.title) && typeof event.startTime === "number" && typeof event.endTime === "number" && Number(event.endTime) >= now)
      .map((event) => ({
         ...event,
         title: sanitizePageTitle(event.title),
      }))
      .sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0));

   if (!cleanEvents.length) {
      return "No events scheduled yet. Add one in Calendar when work needs protected time.";
   }

   const todayStart = getStartOfTodayForHome();

   const todayEnd = getEndOfTodayForHome();

   const todayEvents = cleanEvents.filter((event) => Number(event.startTime) <= todayEnd && Number(event.endTime) >= todayStart);

   const targetEvent = todayEvents[0] || cleanEvents[0];

   const title = compactText(targetEvent.title) || "Calendar event";

   const repeatText = targetEvent.repeat && targetEvent.repeat !== "none" ? ", repeats" : "";

   if (todayEvents.length) {
      const timeText = targetEvent.allDay ? "all day" : getHomeTimeLabel(targetEvent.startTime);

      return sanitizeCalendarGlanceText(`${title} is on your calendar today at ${timeText}${repeatText}.`);
   }

   const dateText = getHomeDateLabel(targetEvent.startTime);

   const timeText = targetEvent.allDay ? "all day" : getHomeTimeLabel(targetEvent.startTime);

   return sanitizeCalendarGlanceText(`Next up: ${title} on ${dateText} at ${timeText}${repeatText}.`);
}

function getGeneratedHomeGreeting() {
   const greetings = [
      "ALLEVIN keeps your projects, Working Notes, materials, and schedule in one place.",
      "Start with a project, keep the working notes and materials together, and use the Dock to decide what matters next.",
      "Choose a project, update its Working Notes and progress points, add materials, or schedule the next focused block of time.",
      "Each project has one home. Projects stores the work, Canvas helps you shape it, and Calendar shows scheduled time.",
      "Keep it simple: choose a project, write in Canvas, save helpful materials, and schedule what needs time.",
   ];

   return sanitizePageText(pickRandomItem(greetings), PAGE_SANITIZE_LIMITS.suggestion);
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

function getLatestProjectLibraryItemForHome() {
   const projectLibrary = safeParseStorage<
      Array<{
         id?: string;
         title?: string;
         latestSummary?: string;
         workflowId?: string;
         originBoardItemId?: string;
         notes?: Array<{ body?: string; summary?: string; savedAt?: number }>;
         updatedAt?: number;
         createdAt?: number;
      }>
   >(PROJECT_LIBRARY_STORAGE_KEY, []);

   return [...projectLibrary].filter((project) => compactText(project.title)).sort((a, b) => getProjectUpdatedAtForHome(b) - getProjectUpdatedAtForHome(a))[0];
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

   // If Canvas is currently showing a saved project, prefer Canvas so Home
   // matches the active work surface and AIDock's current-project behavior.
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

   try {
      const awareness = getActiveProjectAwareness();
      const understanding = awareness.projectIntelligence?.projectUnderstanding;

      if (understanding) {
         const recommendedMove = sanitizePageText(understanding.recommendedMove, PAGE_SANITIZE_LIMITS.suggestion);
         const whyNow = sanitizePageText(understanding.whyNow, PAGE_SANITIZE_LIMITS.suggestion);

         if (recommendedMove && whyNow) {
            return sanitizePageText(`${recommendedMove}. ${whyNow}`, PAGE_SANITIZE_LIMITS.suggestion);
         }

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

   const steps = [
      {
         number: "1",
         label: "Tell ALLEVIN the goal",
         description: "Create a project, give it a title, and describe what you are trying to accomplish.",
         module: "integrations" as ProductModuleId,
      },
      {
         number: "2",
         label: "Adjust the progress points",
         description: "Review the Working Notes, milestones, open questions, and starting point ALLEVIN generates. Change anything that does not match your intent.",
         module: "integrations" as ProductModuleId,
      },
      {
         number: "3",
         label: "Work with the Dock",
         description: "Ask naturally, make decisions, and continue the conversation until the active milestone is complete.",
         module: "integrations" as ProductModuleId,
      },
      {
         number: "4",
         label: "Protect the time",
         description: "Use Calendar for deadlines and focused work blocks that help the next move actually happen.",
         module: "calendar" as ProductModuleId,
      },
   ];

   return (
      <section
         id="overview"
         className="
            scroll-mt-24
            pb-6
            lg:scroll-mt-28
         "
      >
         <div className="mx-auto w-full max-w-[1480px] space-y-6 sm:space-y-7">
            {/* Studio introduction */}

            <header className="px-1 pt-0 sm:px-2 sm:pt-1">
               <h1
                  data-editorial-title="true"
                  className="
                     mt-3
                     max-w-4xl
                     text-4xl
                     leading-[1.02]
                     sm:text-5xl
                     lg:text-6xl
                  "
               >
                  {greeting}, {displayName}.
               </h1>

               <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">{homeGreeting}</p>
            </header>

            {/* Active project desk */}

            <section
               className="
                  studio-paper
                  overflow-hidden
               "
            >
               <div className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
                  <div className="min-w-0 p-5 sm:p-7 lg:px-9 lg:pb-9 lg:pt-7">
                     <div className="flex flex-wrap items-center gap-3">
                        <span className="studio-eyebrow">Active Project</span>
                     </div>

                     <h2
                        data-editorial-title="true"
                        className="
                           mt-4
                           max-w-4xl
                           text-3xl
                           leading-tight
                           sm:text-4xl
                           lg:text-[2.8rem]
                        "
                     >
                        {lastProject.title || "Your next project starts here."}
                     </h2>

                     <div className="mt-7">
                        <div className="studio-panel">
                           <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Your next move</p>

                           <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-text-primary)]">{homeSuggestion}</p>
                        </div>
                     </div>

                     <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
                        <button onClick={() => setActiveModule("integrations")} className="studio-button-primary w-full sm:w-auto sm:min-w-[148px]">
                           Open Projects
                        </button>

                        <button
                           onClick={handleTesterWorkspaceReset}
                           className="
                              inline-flex
                              min-h-10
                              items-center
                              justify-center
                              rounded-[var(--radius-md)]
                              px-3
                              py-2
                              text-sm
                              font-medium
                              text-[var(--color-text-secondary)]
                              hover:bg-[var(--color-bg-soft)]
                              sm:ml-auto
                           "
                        >
                           Reset test workspace
                        </button>
                     </div>
                     {resetNotice && <p className="mt-4 text-sm text-[var(--color-text-secondary)]">{resetNotice}</p>}
                  </div>

                  <aside
                     className="
                        border-t
                        border-[var(--border-subtle)]
                        bg-[var(--color-bg-soft)]
                        p-5
                        sm:p-7
                        xl:border-l
                        xl:border-t-0
                        lg:p-8
                     "
                  >
                     <p className="studio-eyebrow">Schedule at a glance</p>

                     <p className="mt-4 text-base leading-7 text-[var(--color-text-primary)]">{calendarGlance}</p>

                     <button
                        onClick={() => setActiveModule("calendar")}
                        className="
                           mt-6
                           inline-flex
                           items-center
                           gap-2
                           text-sm
                           font-semibold
                           text-[var(--color-primary)]
                           hover:opacity-80
                        "
                     >
                        Open Calendar →
                     </button>
                  </aside>
               </div>
            </section>

            {/* MK VIII project flow */}

            <section>
               <div className="mb-4 px-1 sm:px-2">
                  <h2 data-editorial-title="true" className="text-3xl sm:text-4xl">
                     From goal to finished work.
                  </h2>
               </div>

               <div
                  className="
                     overflow-hidden
                     rounded-[var(--radius-xl)]
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-bg-soft)]
                  "
               >
                  <div className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.9fr)]">
                     <div
                        className="
                           border-b
                           border-[var(--border-subtle)]
                           p-5
                           sm:p-6
                           xl:border-b-0
                           xl:border-r
                        "
                     >
                        <p className="studio-eyebrow">How ALLEVIN works</p>

                        <h3 data-editorial-title="true" className="mt-3 text-2xl leading-tight sm:text-3xl">
                           Start with the goal. Keep moving until it is finished.
                        </h3>

                        <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                           ALLEVIN turns your description into a project foundation, helps you adjust the progress points, stays with you through the active milestone, and uses Calendar to protect the time.
                        </p>
                     </div>

                     <div className="p-5 sm:p-6">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                           {steps.map((step) => (
                              <button
                                 key={step.label}
                                 type="button"
                                 onClick={() => setActiveModule(step.module)}
                                 className="
                                    group
                                    flex
                                    h-full
                                    min-w-0
                                    flex-col
                                    self-stretch
                                    rounded-[var(--radius-lg)]
                                    border
                                    border-[var(--border-subtle)]
                                    bg-[var(--color-surface)]
                                    p-4
                                    text-left
                                    transition-colors
                                    hover:bg-white
                                 "
                              >
                                 <div className="flex w-full items-center justify-between gap-3">
                                    <span
                                       className="
                                          flex
                                          h-8
                                          w-8
                                          shrink-0
                                          items-center
                                          justify-center
                                          rounded-full
                                          border
                                          border-[var(--border-subtle)]
                                          bg-[var(--color-bg-soft)]
                                          text-sm
                                          font-semibold
                                          text-[var(--color-primary)]
                                       "
                                    >
                                       {step.number}
                                    </span>

                                    <span className="text-base text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-1">→</span>
                                 </div>

                                 <p className="mt-4 text-sm font-semibold text-[var(--color-text-primary)]">{step.label}</p>

                                 <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{step.description}</p>
                              </button>
                           ))}
                        </div>

                        <div className="mt-6 border-t border-[var(--border-subtle)] pt-5">
                           <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Try asking</p>

                           <div className="mt-3 flex flex-wrap gap-2">
                              {["What should I work on next?", "What am I overlooking?", "Why should I do that first?", "Is this project ready?", "What should I schedule next?"].map((prompt) => (
                                 <span
                                    key={prompt}
                                    className="
                                       rounded-full
                                       border
                                       border-[var(--border-subtle)]
                                       bg-[var(--color-surface)]
                                       px-3
                                       py-2
                                       text-xs
                                       font-medium
                                       text-[var(--color-text-primary)]
                                    "
                                 >
                                    “{prompt}”
                                 </span>
                              ))}
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            </section>
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
