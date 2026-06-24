"use client";

import { useEffect, useMemo, useState } from "react";

import Sidebar from "@/layout/Sidebar";

import AIDock from "@/ai/AIDock";

import CommandPalette from "@/components/CommandPalette";

import WorkflowStateEngine from "@/components/WorkflowStateEngine";

import AdaptiveWorkCanvas from "@/components/AdaptiveWorkCanvas";

import IntegrationAdapterLayer from "@/components/IntegrationAdapterLayer";

import CalendarIntegrationPanel from "@/components/CalendarIntegrationPanel";

import { WorkspaceProvider } from "@/components/WorkspaceContext";

import { FocusProvider } from "@/components/FocusContext";

import { AIProvider } from "@/components/AIContext";

import { EnvironmentProvider } from "@/components/EnvironmentEngine";

import { getAllevinDisplayName, hasAllevinUserProfile, saveAllevinUserProfile, resetAllevinTesterWorkspace } from "@/lib/allevinUserProfile";

// ========================================
// ALLEVIN MK V Product Shell
// Purpose:
// Simple beginner-friendly workspace layout.
// Keep the app focused on what users can do:
// write, organize projects, schedule,
// and understand cognition.
// ========================================

type ProductModuleId = "home" | "canvas" | "tasks" | "board" | "recovery" | "control" | "calendar" | "integrations" | "advanced";

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
      id: "canvas",

      label: "Canvas",
   },

   {
      id: "integrations",

      label: "Projects",
   },

   {
      id: "calendar",

      label: "Calendar",
   },

   {
      id: "advanced",

      label: "Cognition",
   },
];

// ========================================
// Helpers
// ========================================

function isProductModuleId(value?: string): value is ProductModuleId {
   return value === "home" || value === "canvas" || value === "tasks" || value === "board" || value === "recovery" || value === "control" || value === "calendar" || value === "integrations" || value === "advanced";
}

function getScrollTargetForModule(moduleId: ProductModuleId) {
   if (moduleId === "home") {
      return "overview";
   }

   if (moduleId === "advanced") {
      return "cognition";
   }

   return "work-area";
}

function getModuleFromWorkflowEvent(eventName: string): ProductModuleId | null {
   switch (eventName) {
      case "allevin-send-to-canvas":
         return "canvas";

      case "allevin-send-to-task":
      case "allevin-send-to-board":
      case "allevin-prepare-integration":
      case "allevin-request-workflow-action":
      case "allevin-open-workflow-control":
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
// MK V Build 6 — Page Shell Sanitization
// Home reads stored Canvas, Projects, and Calendar data.
// Treat stored text as untrusted before displaying it.
// ========================================

const PAGE_SANITIZE_LIMITS = {
   title: 120,
   preview: 500,
   suggestion: 900,
   calendarGlance: 500,
   eventName: 120,
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

function sanitizePageText(value?: string, maxLength = PAGE_SANITIZE_LIMITS.preview) {
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
      return "Ask ALLEVIN what is on your calendar when you want a quick read.";
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
      return "Nothing is on the local calendar yet. Add an event when something needs protected time.";
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
      "I’ve got your workspace ready. We can keep this simple: pick up the active project, save what matters, or put time on the calendar when you need focus.",
      "Everything is in one place. I’ll help you keep the work moving without turning it into a bigger project than it needs to be.",
      "Your workspace is ready when you are. We can continue what you were working on, organize what is worth keeping, or schedule a focused block.",
      "I’ll keep the workspace clear and help you choose the next useful move. No need to solve the whole day at once.",
      "You can start small here. Write the rough version, save the useful parts, and schedule time only when the work actually needs it.",
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

function getGeneratedSuggestionTail() {
   const tails = [
      "That keeps the work moving without adding extra noise.",
      "It is small enough to finish and useful enough to matter.",
      "That gives the project a cleaner next point to continue from.",
      "It keeps the next move clear without overbuilding the plan.",
      "That is a practical place to start.",
      "It should make the rest of the work easier to continue.",
      "That keeps the project grounded and manageable.",
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
      const starts = [
         "A good place to start is Canvas. Write the rough idea first, even if it is only a few lines.",
         "Start in Canvas and give the idea somewhere to land. We can shape it once there is a little context.",
         "Open Canvas and write the first version. It does not need to be polished to be useful.",
         "Begin with one clear note in Canvas. That gives ALLEVIN enough context to help you move it forward.",
         "Canvas is the easiest starting point. Capture the thought first, then decide whether it belongs in Projects or Calendar.",
      ];

      return sanitizePageText(pickRandomItem(starts), PAGE_SANITIZE_LIMITS.suggestion);
   }

   const lower = compactText(project.body).toLowerCase();

   const hasActionLanguage = ["need to", "next step", "task", "update", "test", "create", "finish", "review", "build"].some((signal) => lower.includes(signal));

   if (project.source === "Projects") {
      const openings = [
         `I’d bring ${project.title} back into Canvas and continue from the latest saved note.`,
         `${project.title} is saved in Projects, so the easiest move is to open it in Canvas and keep building from there.`,
         `You can resume ${project.title} in Canvas and keep the next update connected to the saved project.`,
         `The saved version of ${project.title} is ready to continue. I’d open it in Canvas and make the next edit there.`,
      ];

      return sanitizePageText(`${pickRandomItem(openings)} ${getGeneratedSuggestionTail()}`, PAGE_SANITIZE_LIMITS.suggestion);
   }

   if (hasActionLanguage) {
      const openings = [
         `I see a possible next action in ${project.title}. I’d pull out the clearest piece and turn it into one concrete move.`,
         `${project.title} already has enough direction to act on. I’d choose the most obvious next move and schedule it if it needs protected time.`,
         `The useful move is to take one action from ${project.title} and make it specific enough to finish.`,
         `I’d keep ${project.title} simple right now: choose one next action and avoid turning it into a bigger plan than it needs to be.`,
      ];

      return sanitizePageText(`${pickRandomItem(openings)} ${getGeneratedSuggestionTail()}`, PAGE_SANITIZE_LIMITS.suggestion);
   }

   const openings = [
      `I’d keep shaping ${project.title} in Canvas until the next action becomes obvious.`,
      `${project.title} has a place to continue. I’d stay in Canvas and tighten the main idea before scheduling or organizing it.`,
      `For ${project.title}, the best move is to keep the work close to Canvas and add a little more structure.`,
      `I’d give ${project.title} one more focused pass in Canvas before turning it into a scheduled block or saved project update.`,
   ];

   return sanitizePageText(`${pickRandomItem(openings)} ${getGeneratedSuggestionTail()}`, PAGE_SANITIZE_LIMITS.suggestion);
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

         setHomeSuggestionKey((currentKey) => {
            if (currentKey === nextSuggestionKey) {
               return currentKey;
            }

            setHomeSuggestion(getHomeSuggestion(nextProject));

            return nextSuggestionKey;
         });
      }

      function refreshHomeContext() {
         if (refreshTimer) {
            window.clearTimeout(refreshTimer);
         }

         // Defer the Home refresh so project-memory events from Canvas/AIDock
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
      const confirmed = window.confirm("Reset this tester workspace? This clears Canvas, Projects, Calendar, memory, and cognition data in this browser only.");

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

      setResetNotice("Workspace reset for this browser. Your tester name was kept.");

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
                  rounded-[24px]
                  border
                  border-[var(--border-subtle)]
                  bg-[var(--color-surface)]
                  p-5
                  shadow-[var(--shadow-soft)]
                  sm:p-6
                  lg:rounded-[32px]
                  lg:p-8
               "
            >
               <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">Welcome to ALLEVIN</p>

               <h1 className="mt-3 max-w-2xl text-3xl sm:text-4xl">Set up your test workspace.</h1>

               <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)]">ALLEVIN will use your name in greetings and assistant responses. Your test projects stay in this browser during this testing phase.</p>

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

                  <div className="rounded-2xl bg-[var(--color-bg)] p-4 text-sm leading-6 text-[var(--color-text-secondary)]">
                     Testing note: Please avoid entering highly sensitive information. This test version stores your workspace locally in this browser.
                  </div>

                  <button
                     type="submit"
                     className="
                        rounded-2xl
                        bg-[var(--color-primary)]
                        px-5
                        py-3
                        text-sm
                        font-medium
                        text-[var(--color-cream)]
                        transition-opacity
                        hover:opacity-90
                     "
                  >
                     Start testing ALLEVIN
                  </button>
               </form>
            </div>
         </section>
      );
   }

   const steps = [
      {
         number: "1",

         label: "Start in Canvas",

         description: "Capture the rough idea first. It can be messy here.",
         module: "canvas" as ProductModuleId,
      },
      {
         number: "2",

         label: "Save to Projects",

         description: "Save the work you want to keep and return to later.",
         module: "integrations" as ProductModuleId,
      },
      {
         number: "3",

         label: "Schedule if needed",

         description: "Give important work a real block of time.",
         module: "calendar" as ProductModuleId,
      },
      {
         number: "4",

         label: "Check Cognition",

         description: "Adjust how ALLEVIN responds when you need a different pace.",
         module: "advanced" as ProductModuleId,
      },
   ];

   return (
      <section
         id="overview"
         className="
            scroll-mt-24
            space-y-5
            pb-4
            lg:scroll-mt-28
         "
      >
         <div
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
            <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
               <div className="min-w-0">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">Welcome back</p>

                  <h1 className="mt-2 text-3xl sm:text-4xl">
                     {greeting}, {displayName}.
                  </h1>

                  <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)]">{homeGreeting}</p>

                  <div className="mt-5 grid w-full max-w-5xl grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
                     <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Current Project</p>

                        <p className="mt-2 text-lg font-medium">{lastProject.title || "No project selected yet"}</p>

                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{lastProject.source ? `Ready in ${lastProject.source}` : "Start in Canvas when you are ready to give ALLEVIN context."}</p>

                        <div className="mt-3 rounded-xl bg-white/70 p-3">
                           <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">Useful tip</p>

                           <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">{homeSuggestion}</p>
                        </div>
                     </div>

                     <div className="rounded-2xl bg-[var(--color-bg)] p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Today at a glance</p>

                        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{calendarGlance}</p>
                     </div>
                  </div>
               </div>

               <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
                  <button
                     onClick={() => setActiveModule("canvas")}
                     className="
                        w-full
                        rounded-2xl
                        bg-[var(--color-primary)]
                        px-5
                        py-3
                        text-sm
                        sm:w-auto
                        font-medium
                        text-[var(--color-cream)]
                        transition-opacity
                        hover:opacity-90
                     "
                  >
                     Start in Canvas
                  </button>

                  <button
                     onClick={() => setActiveModule("integrations")}
                     className="
                        w-full
                        rounded-2xl
                        border
                        border-[var(--border-subtle)]
                        bg-white
                        px-5
                        py-3
                        text-sm
                        sm:w-auto
                        font-medium
                        transition-colors
                        hover:bg-[var(--color-bg)]
                     "
                  >
                     Open Projects
                  </button>

                  <button
                     onClick={handleTesterWorkspaceReset}
                     className="
                        w-full
                        rounded-2xl
                        border
                        border-[var(--border-subtle)]
                        bg-white
                        px-5
                        py-3
                        text-sm
                        sm:w-auto
                        font-medium
                        text-[var(--color-text-secondary)]
                        transition-colors
                        hover:bg-[var(--color-bg)]
                     "
                  >
                     Reset Workspace
                  </button>

                  {resetNotice && <p className="w-full text-sm text-[var(--color-text-secondary)]">{resetNotice}</p>}
               </div>
            </div>
         </div>

         <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((step) => (
               <button
                  key={step.label}
                  onClick={() => setActiveModule(step.module)}
                  className="
                     rounded-[22px]
                     border
                     border-[var(--border-subtle)]
                     bg-white
                     p-4
                     sm:rounded-[28px]
                     sm:p-5
                     text-left
                     shadow-[var(--shadow-soft)]
                     transition-colors
                     hover:bg-[var(--color-bg)]
                  "
               >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-bg)] text-sm font-semibold">{step.number}</div>

                  <p className="text-lg font-medium">{step.label}</p>

                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{step.description}</p>
               </button>
            ))}
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

      const safeModuleId: ProductModuleId = resolvedModuleId === "tasks" || resolvedModuleId === "board" || resolvedModuleId === "recovery" || resolvedModuleId === "control" ? "integrations" : resolvedModuleId;

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

         if (moduleId === "tasks" || moduleId === "board" || moduleId === "recovery" || moduleId === "control") {
            activateModule("integrations");

            return;
         }

         activateModule(moduleId);
      }

      function handleOpenWorkflowControl() {
         activateModule("integrations");
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
               detailTarget === "canvas" ? "canvas" : detailTarget === "calendar" ? "calendar" : detailTarget === "projects" || detailTarget === "integrations" || detailTarget === "notes" ? "integrations" : getModuleFromWorkflowEvent(eventName);

            if (moduleId) {
               activateModule(moduleId);
            }
         };
      }

      const workflowHandlers = [
         "allevin-send-to-canvas",
         "allevin-send-to-task",
         "allevin-send-to-board",
         "allevin-send-to-calendar",
         "allevin-calendar-readback",
         "allevin-prepare-integration",
         "allevin-request-workflow-action",
         "allevin-internal-integration-suggestion",
      ].map((eventName) => ({
         eventName,

         handler: makeWorkflowHandler(eventName),
      }));

      window.addEventListener("allevin-open-product-module", handleOpenProductModule);

      window.addEventListener("allevin-open-workflow-control", handleOpenWorkflowControl);

      workflowHandlers.forEach(({ eventName, handler }) => {
         window.addEventListener(eventName, handler);
      });

      return () => {
         window.removeEventListener("allevin-open-product-module", handleOpenProductModule);

         window.removeEventListener("allevin-open-workflow-control", handleOpenWorkflowControl);

         workflowHandlers.forEach(({ eventName, handler }) => {
            window.removeEventListener(eventName, handler);
         });
      };
   }, []);

   return (
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
                        bg-[var(--color-bg)]
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
                              p-4
                              pb-44
                              pl-4
                              pr-4
                              sm:p-5
                              sm:pb-44
                              lg:p-6
                              lg:pl-28
                              lg:pb-10
                              xl:pr-6
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
                                 max-w-full
                                 overflow-x-auto
                                 rounded-[24px]
                                 overscroll-x-contain
                                 border
                                 border-[var(--border-subtle)]
                                 bg-[rgba(255,255,255,0.88)]
                                 p-2
                                 shadow-[var(--shadow-soft)]
                                 backdrop-blur-xl
                                 sm:block
                                 lg:rounded-[28px]
                                 lg:p-3
                              "
                           >
                              <div
                                 className="
                                    flex
                                    min-w-max
                                    items-center
                                    justify-center
                                    gap-2
                                    sm:mx-auto
                                    lg:flex-wrap
                                 "
                              >
                                 {productModules.map((module) => {
                                    const active = activeModule === module.id;

                                    return (
                                       <button
                                          key={module.id}
                                          onClick={() => activateModule(module.id)}
                                          className={`
                                             rounded-2xl
                                             border
                                             px-3
                                             py-2.5
                                             text-sm
                                             font-medium
                                             lg:px-4
                                             lg:py-3
                                             transition-colors

                                             ${
                                                active
                                                   ? `
                                                      border-[var(--color-primary)]
                                                      bg-[var(--color-primary)]
                                                      text-[var(--color-cream)]
                                                   `
                                                   : `
                                                      border-[var(--border-subtle)]
                                                      bg-white
                                                      text-[var(--color-text-primary)]
                                                      hover:bg-[var(--color-bg)]
                                                   `
                                             }
                                          `}
                                       >
                                          {module.label}
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

                                 ${activeModule !== "home" && activeModule !== "advanced" ? "block" : "hidden"}
                              `}
                           >
                              {/* Main workspace modules stay mounted when active so product events route cleanly. */}

                              <div id="canvas" className={activeModule === "canvas" ? "block min-w-0" : "hidden"}>
                                 <AdaptiveWorkCanvas />
                              </div>

                              <div id="calendar" className={activeModule === "calendar" ? "block min-w-0" : "hidden"}>
                                 <CalendarIntegrationPanel />
                              </div>

                              <div id="integrations" className={activeModule === "integrations" ? "block min-w-0" : "hidden"}>
                                 <IntegrationAdapterLayer />
                              </div>
                           </section>

                           {/* Cognition */}

                           <section
                              id="cognition"
                              className={`
                                 min-w-0
                                 scroll-mt-24
                                 space-y-6
                                 lg:scroll-mt-28

                                 ${activeModule === "advanced" ? "block" : "hidden"}
                              `}
                           >
                              <WorkflowStateEngine />
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
   );
}
