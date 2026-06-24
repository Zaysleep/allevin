// ========================================
// Workspace Modules
// Purpose:
// Adaptive cognitive workspace cards with
// MK II personality, session awareness,
// and spatial mutation intelligence.
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";

import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import { GripVertical, Brain, Sparkles, Activity, AlertTriangle, ShieldCheck, CalendarDays } from "lucide-react";

import { useFocus } from "@/components/FocusContext";

import { useEnvironment } from "@/components/EnvironmentEngine";

import { getMemory, getAllevinSessionSummary, type AllevinSessionSummary } from "@/components/MemoryEngine";

// ========================================
// Module Type
// ========================================

interface Module {
   id: string;

   title: string;

   content: string;
}

// ========================================
// Density Config
// ========================================

interface DensityConfig {
   spacing: string;

   padding: string;

   textScale: string;
}

// ========================================
// Props
// ========================================

interface WorkspaceModulesProps {
   densityConfig: DensityConfig;
}

// ========================================
// Initial Modules
// ========================================

const initialModules: Module[] = [
   {
      id: "focus",

      title: "Focus State",

      content: "ALLEVIN reads focus, environment, and cognitive load signals here.",
   },

   {
      id: "tasks",

      title: "Next Action Layer",

      content: "Recommended next steps and workflow movement appear here.",
   },

   {
      id: "ai",

      title: "ALLEVIN Guidance",

      content: "Calm, review-based assistant guidance appears here.",
   },

   {
      id: "insights",

      title: "System Memory",

      content: "Thread memory, signals, and recovery context appear here.",
   },

   {
      id: "approvals",

      title: "Workflow Review",

      content: "Prepared workflow actions waiting for review appear here.",
   },

   {
      id: "calendar",

      title: "Schedule Context",

      content: "Calendar events and notes that can become follow-up work appear here.",
   },
];

// ========================================
// Storage
// ========================================

const STORAGE_KEY = "allevin-workspace-modules";

// ========================================
// Helpers
// ========================================

function getSafeSessionSummary(): AllevinSessionSummary {
   try {
      return getAllevinSessionSummary();
   } catch {
      return {
         hasActiveThread: false,

         activeThreadTitle: "No active thread detected",

         activeThreadStage: "unknown",

         activeThreadStatus: "unknown",

         activeThreadLocation: "unknown",

         activeThreadSignals: 0,

         pendingApprovalCount: 0,

         upcomingCalendarCount: 0,

         calendarNoteCount: 0,

         recentMemoryCount: 0,

         cognitiveLoadState: "Stable",

         cognitiveLoadIntensity: 0,

         predictedState: "Baseline Observation",

         predictedConfidence: 50,

         recommendedNextAction: "Start by drafting in Canvas or creating one Task so ALLEVIN can begin tracking a thread.",

         systemStatusLabel: "Workspace stable",

         welcomeLine: "Your workspace is ready. Start in Canvas, recover a thread, or ask ALLEVIN for the next move.",

         approvalReminder: "Prepared actions will appear in Workflow Control for review.",

         updatedAt: Date.now(),
      };
   }
}

function normalizeSavedModules(savedModules: Module[]) {
   const savedIds = new Set(savedModules.map((module) => module.id));

   const safeSavedModules = savedModules
      .filter((module) => initialModules.some((initialModule) => initialModule.id === module.id))
      .map((module) => {
         const currentModule = initialModules.find((initialModule) => initialModule.id === module.id);

         return currentModule || module;
      });

   const missingModules = initialModules.filter((module) => !savedIds.has(module.id));

   return [...safeSavedModules, ...missingModules];
}

function formatStatusValue(value?: string) {
   if (!value) {
      return "Unknown";
   }

   return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getModuleLiveContent({
   module,
   sessionSummary,
   focusLabel,
   environmentLabel,
   environmentCue,
}: {
   module: Module;

   sessionSummary: AllevinSessionSummary;

   focusLabel: string;

   environmentLabel: string;

   environmentCue: string;
}) {
   switch (module.id) {
      case "focus":
         return {
            title: "Focus State",

            eyebrow: focusLabel,

            content: `Environment: ${environmentLabel}. Cognitive load is ${sessionSummary.cognitiveLoadState} at ${sessionSummary.cognitiveLoadIntensity}%.`,

            detail: environmentCue,
         };

      case "tasks":
         return {
            title: "Next Action Layer",

            eyebrow: "Recommended Move",

            content: sessionSummary.recommendedNextAction,

            detail: sessionSummary.approvalReminder,
         };

      case "ai":
         return {
            title: "ALLEVIN Guidance",

            eyebrow: sessionSummary.systemStatusLabel,

            content: sessionSummary.welcomeLine,

            detail: "Ask ALLEVIN to recommend, resume, prepare, or explain the next move.",
         };

      case "insights":
         return {
            title: "System Memory",

            eyebrow: sessionSummary.hasActiveThread ? "Thread Memory Active" : "Thread Memory Standby",

            content: sessionSummary.hasActiveThread
               ? `${sessionSummary.activeThreadTitle} is currently ${formatStatusValue(sessionSummary.activeThreadStage)} in ${formatStatusValue(sessionSummary.activeThreadLocation)}.`
               : "No persistent thread is active yet. Move work through Canvas, Tasks, Board, Notes, or Integrations to establish one.",

            detail: `${sessionSummary.activeThreadSignals} signal${sessionSummary.activeThreadSignals === 1 ? "" : "s"} · ${sessionSummary.recentMemoryCount} recent memory item${sessionSummary.recentMemoryCount === 1 ? "" : "s"}`,
         };

      case "approvals":
         return {
            title: "Workflow Review",

            eyebrow: sessionSummary.pendingApprovalCount > 0 ? "Review Needed" : "Clear",

            content: sessionSummary.pendingApprovalCount > 0 ? `${sessionSummary.pendingApprovalCount} prepared action${sessionSummary.pendingApprovalCount === 1 ? "" : "s"} ready to review.` : "No prepared actions are waiting right now.",

            detail: "Use Workflow Control to approve, edit, or cancel prepared actions.",
         };

      case "calendar":
         return {
            title: "Schedule Context",

            eyebrow: sessionSummary.upcomingCalendarCount > 0 ? "Calendar Active" : "Calendar Standby",

            content:
               sessionSummary.upcomingCalendarCount > 0 ? `${sessionSummary.upcomingCalendarCount} upcoming calendar item${sessionSummary.upcomingCalendarCount === 1 ? "" : "s"} available for context.` : "No upcoming calendar context is loaded yet.",

            detail: `${sessionSummary.calendarNoteCount} calendar note${sessionSummary.calendarNoteCount === 1 ? "" : "s"} captured.`,
         };

      default:
         return {
            title: module.title,

            eyebrow: "Adaptive Module",

            content: module.content,

            detail: "Workspace module is standing by.",
         };
   }
}

// ========================================
// Sortable Card
// ========================================

function SortableCard({
   module,
   densityConfig,
   sessionSummary,
}: {
   module: Module;

   densityConfig: DensityConfig;

   sessionSummary: AllevinSessionSummary;
}) {
   // ========================================
   // Focus
   // ========================================

   const { focusMode, focusProfile } = useFocus();

   // ========================================
   // Environment
   // ========================================

   const { currentEnvironment, environmentProfile } = useEnvironment();

   // ========================================
   // Memory
   // ========================================

   const memory = getMemory();

   const recent = memory.slice(-10);

   const deepCount = recent.filter((m) => m.focusMode === "deep").length;

   const calmCount = recent.filter((m) => m.focusMode === "calm").length;

   const overloaded = sessionSummary.cognitiveLoadState === "Critical" || (deepCount >= 3 && calmCount >= 3);

   const liveContent = getModuleLiveContent({
      module,

      sessionSummary,

      focusLabel: focusProfile.label,

      environmentLabel: environmentProfile.label,

      environmentCue: environmentProfile.assistantCue,
   });

   // ========================================
   // Mutation Classes
   // ========================================

   function getMutationClasses() {
      // ========================================
      // APPROVAL
      // ========================================

      if (sessionSummary.pendingApprovalCount > 0) {
         if (module.id === "approvals") {
            return `
               col-span-2
               scale-[1.02]
               ring-2
               ring-[rgba(48,92,222,0.16)]
            `;
         }

         if (module.id === "ai") {
            return `
               scale-[1.01]
            `;
         }
      }

      // ========================================
      // RECOVERY
      // ========================================

      if (currentEnvironment === "recovery") {
         // Promote focus and memory systems

         if (module.id === "focus" || module.id === "insights") {
            return `
               col-span-2
               scale-[1.02]
               opacity-100
            `;
         }

         // Suppress AI visual pressure without hiding it

         if (module.id === "ai") {
            return `
               opacity-70
               scale-[0.98]
            `;
         }

         // Soften schedule context

         if (module.id === "calendar") {
            return `
               opacity-60
            `;
         }
      }

      // ========================================
      // OVERLOAD
      // ========================================

      if (overloaded) {
         // Prioritize focus

         if (module.id === "focus") {
            return `
               col-span-2
               scale-[1.03]
               ring-2
               ring-[rgba(48,92,222,0.14)]
            `;
         }

         // Suppress extra modules

         if (module.id === "calendar") {
            return `
               opacity-40
               scale-[0.97]
            `;
         }

         if (module.id === "ai") {
            return `
               opacity-55
            `;
         }
      }

      // ========================================
      // DEEP FOCUS
      // ========================================

      if (focusMode === "deep") {
         // Promote focus and next action systems

         if (module.id === "focus" || module.id === "tasks") {
            return `
               col-span-2
               scale-[1.02]
            `;
         }

         // Compress AI

         if (module.id === "ai" || module.id === "calendar") {
            return `
               opacity-65
            `;
         }
      }

      // ========================================
      // CALM
      // ========================================

      if (focusMode === "calm") {
         if (module.id === "insights" || module.id === "focus") {
            return `
               col-span-2
               scale-[1.01]
            `;
         }
      }

      // ========================================
      // CALENDAR
      // ========================================

      if (sessionSummary.upcomingCalendarCount > 0 && module.id === "calendar") {
         return `
            scale-[1.01]
         `;
      }

      return "";
   }

   // ========================================
   // Sortable
   // ========================================

   const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: module.id,
   });

   const style = {
      transform: CSS.Transform.toString(transform),

      transition,
   };

   // ========================================
   // Icon Logic
   // ========================================

   function getIcon() {
      switch (module.id) {
         case "focus":
            return <Brain size={18} />;

         case "tasks":
            return <Activity size={18} />;

         case "ai":
            return <Sparkles size={18} />;

         case "approvals":
            return <ShieldCheck size={18} />;

         case "calendar":
            return <CalendarDays size={18} />;

         default:
            return <AlertTriangle size={18} />;
      }
   }

   return (
      <motion.div
         ref={setNodeRef}
         style={style}
         {...attributes}
         {...listeners}
         layout
         transition={{
            duration: 0.35,
         }}
         whileHover={{
            y: -2,
         }}
         whileTap={{
            scale: 0.99,
         }}
         className={`
            rounded-[var(--radius-lg)]
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            shadow-[var(--shadow-soft)]
            transition-all
            duration-700

            ${getMutationClasses()}
         `}
      >
         <div
            className={`
               ${densityConfig.padding}
            `}
         >
            {/* ========================================
                Header
            ======================================== */}

            <div className="mb-5 flex items-start justify-between">
               <div className="flex items-start gap-3">
                  {/* Icon */}

                  <div
                     className="
                        flex
                        h-11
                        w-11
                        items-center
                        justify-center
                        rounded-2xl
                        bg-[var(--color-bg)]
                        text-[var(--color-primary)]
                     "
                  >
                     {getIcon()}
                  </div>

                  {/* Title */}

                  <div>
                     <p
                        className="
                           text-sm
                           text-[var(--color-text-secondary)]
                        "
                     >
                        {liveContent.eyebrow}
                     </p>

                     <h3
                        className={`
                           mt-1
                           ${densityConfig.textScale}
                        `}
                     >
                        {liveContent.title}
                     </h3>
                  </div>
               </div>

               {/* Drag */}

               <div
                  className="
                     cursor-grab
                     rounded-xl
                     bg-[var(--color-bg)]
                     p-2
                     text-[var(--color-text-secondary)]
                  "
               >
                  <GripVertical size={18} />
               </div>
            </div>

            {/* ========================================
                Content
            ======================================== */}

            <div
               className="
                  rounded-2xl
                  bg-[var(--color-bg)]
                  p-5
               "
            >
               <p
                  className="
                     leading-relaxed
                     text-[var(--color-text-secondary)]
                  "
               >
                  {liveContent.content}
               </p>

               <p
                  className="
                     mt-4
                     text-sm
                     leading-6
                     text-[var(--color-text-secondary)]
                  "
               >
                  {liveContent.detail}
               </p>
            </div>
         </div>
      </motion.div>
   );
}

// ========================================
// Component
// ========================================

export default function WorkspaceModules({ densityConfig }: WorkspaceModulesProps) {
   // ========================================
   // State
   // ========================================

   const [mounted, setMounted] = useState(false);

   const [modules, setModules] = useState<Module[]>(initialModules);

   const [sessionRefreshKey, setSessionRefreshKey] = useState(0);

   // ========================================
   // Session Summary
   // ========================================

   const sessionSummary = useMemo(() => {
      void sessionRefreshKey;

      return getSafeSessionSummary();
   }, [sessionRefreshKey]);

   // ========================================
   // Mount
   // ========================================

   useEffect(() => {
      setMounted(true);

      const saved = localStorage.getItem(STORAGE_KEY);

      if (!saved) {
         return;
      }

      try {
         const parsed = JSON.parse(saved);

         if (Array.isArray(parsed)) {
            setModules(normalizeSavedModules(parsed));
         }
      } catch {
         localStorage.removeItem(STORAGE_KEY);

         setModules(initialModules);
      }
   }, []);

   // ========================================
   // Live Summary Refresh
   // ========================================

   useEffect(() => {
      function refreshSessionSummary() {
         setSessionRefreshKey((current) => current + 1);
      }

      window.addEventListener("allevin-memory-update", refreshSessionSummary);

      window.addEventListener("allevin-project-memory-update", refreshSessionSummary);

      window.addEventListener("allevin-workflow-control-update", refreshSessionSummary);

      window.addEventListener("allevin-calendar-note-created", refreshSessionSummary);

      window.addEventListener("allevin-calendar-readback", refreshSessionSummary);

      window.addEventListener("storage", refreshSessionSummary);

      return () => {
         window.removeEventListener("allevin-memory-update", refreshSessionSummary);

         window.removeEventListener("allevin-project-memory-update", refreshSessionSummary);

         window.removeEventListener("allevin-workflow-control-update", refreshSessionSummary);

         window.removeEventListener("allevin-calendar-note-created", refreshSessionSummary);

         window.removeEventListener("allevin-calendar-readback", refreshSessionSummary);

         window.removeEventListener("storage", refreshSessionSummary);
      };
   }, []);

   // ========================================
   // Persist
   // ========================================

   useEffect(() => {
      if (!mounted) return;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
   }, [modules, mounted]);

   // ========================================
   // Drag End
   // ========================================

   function handleDragEnd(event: DragEndEvent) {
      const { active, over } = event;

      if (!over || active.id === over.id) {
         return;
      }

      const oldIndex = modules.findIndex((module) => module.id === active.id);

      const newIndex = modules.findIndex((module) => module.id === over.id);

      setModules((items) => arrayMove(items, oldIndex, newIndex));
   }

   // ========================================
   // Reset
   // ========================================

   function resetWorkspace() {
      localStorage.removeItem(STORAGE_KEY);

      setModules(initialModules);
   }

   // ========================================
   // Hydration Protection
   // ========================================

   if (!mounted) {
      return null;
   }

   return (
      <div className="space-y-6">
         {/* ========================================
             Header
         ======================================== */}

         <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
               <p
                  className="
                     text-sm
                     text-[var(--color-text-secondary)]
                  "
               >
                  Autonomous Cognitive Workspace
               </p>

               <h3 className="mt-1 text-2xl">Spatial Mutation System</h3>

               <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">Cards adapt to focus, recovery, review queue, calendar context, and active thread memory.</p>
            </div>

            {/* Reset */}

            <button
               onClick={resetWorkspace}
               className="
                  rounded-xl
                  border
                  border-[var(--border-subtle)]
                  bg-white
                  px-4
                  py-2
                  text-sm
                  font-medium
                  transition-colors
                  hover:bg-[var(--color-bg)]
               "
            >
               Reset Layout
            </button>
         </div>

         {/* ========================================
             DND
         ======================================== */}

         <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
               <motion.div
                  layout
                  className="
                     grid
                     grid-cols-1
                     gap-6
                     xl:grid-cols-2
                  "
               >
                  <AnimatePresence>
                     {modules.map((module) => (
                        <SortableCard key={module.id} module={module} densityConfig={densityConfig} sessionSummary={sessionSummary} />
                     ))}
                  </AnimatePresence>
               </motion.div>
            </SortableContext>
         </DndContext>
      </div>
   );
}
