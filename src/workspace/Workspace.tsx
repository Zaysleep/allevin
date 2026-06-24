"use client";

import { useEffect, useMemo, useState } from "react";

import { motion } from "framer-motion";

import WorkspaceModules from "@/workspace/WorkspaceModules";

import MemoryPanel from "@/components/MemoryPanel";

import { useFocus } from "@/components/FocusContext";

import { useEnvironment } from "@/components/EnvironmentEngine";

import { useWorkspace } from "@/components/WorkspaceContext";

import { getAllevinSessionSummary, type AllevinSessionSummary } from "@/components/MemoryEngine";

// ========================================
// Density Configurations
// ========================================

const densityConfigs = {
   calm: {
      spacing: "8",
      padding: "p-8",
      textScale: "text-2xl",
   },

   standard: {
      spacing: "6",
      padding: "p-6",
      textScale: "text-2xl",
   },

   deep: {
      spacing: "4",
      padding: "p-5",
      textScale: "text-xl",
   },
};

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

function formatStatusValue(value?: string) {
   if (!value) {
      return "Unknown";
   }

   return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// ========================================
// Component
// ========================================

export default function Workspace() {
   // ========================================
   // Workspace
   // ========================================

   const { activeView, sessionState } = useWorkspace();

   // ========================================
   // Focus
   // ========================================

   const { focusMode, focusProfile } = useFocus();

   // ========================================
   // Environment
   // ========================================

   const { currentEnvironment, adaptationIntensity, adaptiveUI, interventionMessage, environmentProfile, signalSummary } = useEnvironment();

   // ========================================
   // Local Session Summary
   // ========================================

   const [sessionRefreshKey, setSessionRefreshKey] = useState(0);

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

   const sessionSummary = useMemo(() => getSafeSessionSummary(), [sessionRefreshKey]);

   // ========================================
   // Density
   // ========================================

   const densityConfig = densityConfigs[focusMode];

   // ========================================
   // Session Cards
   // ========================================

   const statusCards = useMemo(
      () => [
         {
            label: "System State",
            value: sessionSummary.systemStatusLabel,
            detail: sessionSummary.welcomeLine,
         },
         {
            label: "Focus Tone",
            value: focusProfile.label,
            detail: focusProfile.guidanceStyle,
         },
         {
            label: "Environment",
            value: environmentProfile.label,
            detail: environmentProfile.assistantCue,
         },
      ],
      [sessionSummary, focusProfile, environmentProfile],
   );

   const memoryCards = useMemo(
      () => [
         {
            label: "Active Thread",
            value: sessionSummary.hasActiveThread ? sessionSummary.activeThreadTitle : "No active thread",
            detail: sessionSummary.hasActiveThread
               ? `${formatStatusValue(sessionSummary.activeThreadStage)} · ${formatStatusValue(sessionSummary.activeThreadLocation)} · ${sessionSummary.activeThreadSignals} signal${sessionSummary.activeThreadSignals === 1 ? "" : "s"}`
               : "Start in Canvas or open Recovery to establish a thread.",
         },
         {
            label: "Review Queue",
            value: `${sessionSummary.pendingApprovalCount}`,
            detail: sessionSummary.pendingApprovalCount > 0 ? "Workflow Control has prepared actions waiting for review." : "No prepared actions are waiting right now.",
         },
         {
            label: "Calendar Context",
            value: `${sessionSummary.upcomingCalendarCount}`,
            detail: sessionSummary.upcomingCalendarCount > 0 ? `${sessionSummary.upcomingCalendarCount} upcoming item${sessionSummary.upcomingCalendarCount === 1 ? "" : "s"} available.` : "No upcoming calendar context loaded yet.",
         },
      ],
      [sessionSummary],
   );

   // ========================================
   // Render
   // ========================================

   return (
      <motion.section
         initial={{
            opacity: 0,
            y: 10,
         }}
         animate={{
            opacity: 1,
            y: 0,
         }}
         transition={{
            duration: 0.4,
         }}
         className="
            relative
            flex-1
            overflow-y-auto
            px-10
            py-10
         "
      >
         {/* ========================================
             HOME VIEW
         ======================================== */}

         {activeView === "home" && (
            <>
               {/* Header */}

               <header className="mb-8">
                  <p
                     className="
                        mb-3
                        text-sm
                        font-medium
                        uppercase
                        tracking-[0.2em]
                        text-[var(--color-text-secondary)]
                     "
                  >
                     Adaptive Workspace
                  </p>

                  <h1
                     className="
                        max-w-4xl
                        text-5xl
                        leading-[1.05]
                        text-[var(--color-text-primary)]
                     "
                  >
                     A calm system layer for starting, resuming, and moving work forward.
                  </h1>

                  <p
                     className="
                        mt-5
                        max-w-3xl
                        text-base
                        leading-7
                        text-[var(--color-text-secondary)]
                     "
                  >
                     {sessionSummary.welcomeLine} {sessionSummary.approvalReminder}
                  </p>
               </header>

               {/* MK II Session Status */}

               <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-3">
                  {statusCards.map((card) => (
                     <div
                        key={card.label}
                        className="
                           rounded-[var(--radius-lg)]
                           border
                           border-[var(--border-subtle)]
                           bg-[var(--color-surface)]
                           p-6
                           shadow-[var(--shadow-soft)]
                        "
                     >
                        <p
                           className="
                              text-sm
                              text-[var(--color-text-secondary)]
                           "
                        >
                           {card.label}
                        </p>

                        <h3 className="mt-2 text-2xl">{card.value}</h3>

                        <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{card.detail}</p>
                     </div>
                  ))}
               </div>

               {/* Memory / Approval / Calendar Read */}

               <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-3">
                  {memoryCards.map((card) => (
                     <div
                        key={card.label}
                        className="
                           rounded-[var(--radius-lg)]
                           border
                           border-[var(--border-subtle)]
                           bg-[rgba(255,255,255,0.78)]
                           p-6
                           shadow-[var(--shadow-soft)]
                           backdrop-blur-xl
                        "
                     >
                        <p
                           className="
                              text-sm
                              text-[var(--color-text-secondary)]
                           "
                        >
                           {card.label}
                        </p>

                        <h3 className="mt-2 line-clamp-2 text-2xl">{card.value}</h3>

                        <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{card.detail}</p>
                     </div>
                  ))}
               </div>

               {/* Environment Status */}

               <div
                  className="
                     mb-8
                     grid
                     grid-cols-1
                     gap-5
                     xl:grid-cols-3
                  "
               >
                  {/* Environment */}

                  <div
                     className="
                        rounded-[var(--radius-lg)]
                        border
                        border-[var(--border-subtle)]
                        bg-[var(--color-surface)]
                        p-6
                        shadow-[var(--shadow-soft)]
                     "
                  >
                     <p
                        className="
                           text-sm
                           text-[var(--color-text-secondary)]
                        "
                     >
                        Environment
                     </p>

                     <h3 className="mt-2 text-2xl">{formatStatusValue(currentEnvironment)}</h3>

                     <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{environmentProfile.uiGuidance}</p>
                  </div>

                  {/* Adaptive UI */}

                  <div
                     className="
                        rounded-[var(--radius-lg)]
                        border
                        border-[var(--border-subtle)]
                        bg-[var(--color-surface)]
                        p-6
                        shadow-[var(--shadow-soft)]
                     "
                  >
                     <p
                        className="
                           text-sm
                           text-[var(--color-text-secondary)]
                        "
                     >
                        Adaptive UI
                     </p>

                     <h3 className="mt-2 text-2xl">{adaptiveUI ? "Enabled" : "Inactive"}</h3>

                     <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{signalSummary}</p>
                  </div>

                  {/* Intensity */}

                  <div
                     className="
                        rounded-[var(--radius-lg)]
                        border
                        border-[var(--border-subtle)]
                        bg-[var(--color-surface)]
                        p-6
                        shadow-[var(--shadow-soft)]
                     "
                  >
                     <p
                        className="
                           text-sm
                           text-[var(--color-text-secondary)]
                        "
                     >
                        Adaptation Intensity
                     </p>

                     <h3 className="mt-2 text-2xl">{adaptationIntensity}%</h3>

                     <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                        Cognitive load: {sessionSummary.cognitiveLoadState} · Predicted state: {sessionSummary.predictedState}
                     </p>
                  </div>
               </div>

               {/* Intervention */}

               {interventionMessage && (
                  <motion.div
                     initial={{
                        opacity: 0,
                        y: -10,
                     }}
                     animate={{
                        opacity: 1,
                        y: 0,
                     }}
                     className="
                        mb-8
                        rounded-2xl
                        border
                        border-[var(--border-subtle)]
                        bg-[var(--color-surface)]
                        p-5
                        shadow-[var(--shadow-soft)]
                     "
                  >
                     <p
                        className="
                           text-sm
                           font-medium
                           uppercase
                           tracking-[0.15em]
                           text-[var(--color-text-secondary)]
                        "
                     >
                        Environmental Intervention
                     </p>

                     <p
                        className="
                           mt-3
                           text-lg
                           leading-relaxed
                        "
                     >
                        {interventionMessage}
                     </p>
                  </motion.div>
               )}

               {/* Recommended Next Move */}

               <div
                  className="
                     mb-8
                     rounded-[28px]
                     border
                     border-[var(--border-subtle)]
                     bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(247,248,252,0.84))]
                     p-6
                     shadow-[var(--shadow-soft)]
                  "
               >
                  <p
                     className="
                        text-sm
                        font-medium
                        uppercase
                        tracking-[0.15em]
                        text-[var(--color-text-secondary)]
                     "
                  >
                     Suggested Next Move
                  </p>

                  <p className="mt-3 max-w-4xl text-lg leading-8 text-[var(--color-text-primary)]">{sessionSummary.recommendedNextAction}</p>

                  <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">Assistant cue: {sessionState.welcomeMessage}</p>
               </div>

               {/* Main Grid */}

               <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                  {/* Workspace */}

                  <div className="xl:col-span-8">
                     <WorkspaceModules densityConfig={densityConfig} />
                  </div>

                  {/* Memory */}

                  <div className="xl:col-span-4">
                     <MemoryPanel />
                  </div>
               </div>
            </>
         )}

         {/* ========================================
             FOCUS VIEW
         ======================================== */}

         {activeView === "focus" && (
            <div className="space-y-6">
               <div>
                  <p
                     className="
                        mb-3
                        text-sm
                        font-medium
                        uppercase
                        tracking-[0.2em]
                        text-[var(--color-text-secondary)]
                     "
                  >
                     {focusProfile.systemTone}
                  </p>

                  <h1 className="text-5xl">{focusProfile.label}</h1>
               </div>

               <div
                  className="
                     rounded-3xl
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-surface)]
                     p-8
                     shadow-[var(--shadow-soft)]
                  "
               >
                  <p className="text-lg leading-relaxed">{focusProfile.description}</p>

                  <p className="mt-4 text-sm leading-6 text-[var(--color-text-secondary)]">{focusProfile.assistantCue}</p>
               </div>
            </div>
         )}

         {/* ========================================
             WORKSPACE VIEW
         ======================================== */}

         {activeView === "workspace" && (
            <div className="space-y-6">
               <div>
                  <p
                     className="
                        mb-3
                        text-sm
                        font-medium
                        uppercase
                        tracking-[0.2em]
                        text-[var(--color-text-secondary)]
                     "
                  >
                     Workspace Systems
                  </p>

                  <h1 className="text-5xl">Active Work Layer</h1>

                  <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--color-text-secondary)]">Use this area to move work through Canvas, Tasks, Board, Recovery, and review-based routes.</p>
               </div>

               <WorkspaceModules densityConfig={densityConfig} />
            </div>
         )}

         {/* ========================================
             INSIGHTS VIEW
         ======================================== */}

         {activeView === "insights" && (
            <div className="space-y-6">
               <div>
                  <p
                     className="
                        mb-3
                        text-sm
                        font-medium
                        uppercase
                        tracking-[0.2em]
                        text-[var(--color-text-secondary)]
                     "
                  >
                     Advanced System Core
                  </p>

                  <h1 className="text-5xl">Cognitive Insights</h1>

                  <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--color-text-secondary)]">Behavioral analytics, workflow signals, memory, and cognitive adaptation metrics appear here as ALLEVIN learns your workflow patterns.</p>
               </div>

               <div
                  className="
                     rounded-3xl
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-surface)]
                     p-8
                     shadow-[var(--shadow-soft)]
                  "
               >
                  <p className="text-lg leading-relaxed">{signalSummary}</p>

                  <p className="mt-4 text-sm leading-6 text-[var(--color-text-secondary)]">
                     Environment: {environmentProfile.label} · Intensity: {adaptationIntensity}% · Cognitive load: {sessionSummary.cognitiveLoadState}
                  </p>
               </div>
            </div>
         )}
      </motion.section>
   );
}
