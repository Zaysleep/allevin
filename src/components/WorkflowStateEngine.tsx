"use client";

import { motion } from "framer-motion";

import { Brain, Sparkles, Layers3, PenTool, Search, ArrowRightLeft, Activity, CheckCircle2 } from "lucide-react";

import { useEffect, useState } from "react";

// ========================================
// Insight Guidance Style
// ========================================

type WorkflowState = "research" | "deep-work" | "planning" | "creative" | "calm" | "context-switching" | "balanced";

type CognitionModeConfig = {
   state: WorkflowState;

   label: string;

   shortLabel: string;

   description: string;

   example: string;

   Icon: typeof Brain;
};

const COGNITION_STATE_STORAGE_KEY = "allevin-cognition-state";

const COGNITION_RESET_STORAGE_KEY = "allevin-cognition-manual-reset";

const COGNITION_ACTIVE_MODE_STORAGE_KEY = "allevin-cognition-active-response-mode";

// ========================================
// Style Options
// ========================================

const cognitionModes: CognitionModeConfig[] = [
   {
      state: "balanced",
      label: "Balanced",
      shortLabel: "Steady replies",
      description: "Best for everyday project work. ALLEVIN gives steady guidance, keeps the context clear, and suggests one useful next move.",
      example: "Next: choose the clearest move and keep going.",
      Icon: Activity,
   },
   {
      state: "calm",
      label: "Calm",
      shortLabel: "Softer replies",
      description: "Best when the project feels heavy or scattered. ALLEVIN keeps guidance softer, simpler, and easier to start.",
      example: "Small next move: pick one thing and keep it light.",
      Icon: Sparkles,
   },
   {
      state: "deep-work",
      label: "Deep Work",
      shortLabel: "Short replies",
      description: "Best when you need to focus. ALLEVIN keeps guidance short, direct, and centered on one move.",
      example: "Focus move: do one clear action.",
      Icon: Brain,
   },
   {
      state: "planning",
      label: "Planning",
      shortLabel: "Structured replies",
      description: "Best when your project needs order. ALLEVIN helps turn notes, materials, and ideas into a clearer structure.",
      example: "Planning move: define the order, then act.",
      Icon: Layers3,
   },
   {
      state: "creative",
      label: "Creative",
      shortLabel: "Idea-shaping replies",
      description: "Best for writing, design, and early ideas. ALLEVIN helps shape the work without over-organizing it too soon.",
      example: "Creative move: shape the idea without over-organizing it.",
      Icon: PenTool,
   },
   {
      state: "research",
      label: "Research",
      shortLabel: "Source-aware replies",
      description: "Best for research, references, and project materials. ALLEVIN keeps the question, source, and decision visible.",
      example: "Research move: clarify the question and next source.",
      Icon: Search,
   },
   {
      state: "context-switching",
      label: "Context Switching",
      shortLabel: "Anchored replies",
      description: "Best when you are moving between projects or tasks. ALLEVIN anchors guidance to one project, one reference point, and one next move.",
      example: "Anchor move: stay with one project.",
      Icon: ArrowRightLeft,
   },
];

function getModeConfig(state?: string) {
   return cognitionModes.find((mode) => mode.state === state) || cognitionModes[0];
}

function readStoredCognitionState() {
   if (typeof window === "undefined") {
      return cognitionModes[0];
   }

   try {
      const stored = localStorage.getItem(COGNITION_STATE_STORAGE_KEY);

      if (!stored) {
         return cognitionModes[0];
      }

      const parsed = JSON.parse(stored);

      return getModeConfig(parsed?.state);
   } catch {
      return cognitionModes[0];
   }
}

function buildStoredCognitionState(mode: CognitionModeConfig) {
   return {
      state: mode.state,
      label: mode.label,
      mood: mode.shortLabel,
      momentum: "guidance-style",
      suggestion: mode.example.replace(/^(Next|Small next move|Focus move|Planning move|Creative move|Research move|Anchor move):\s*/i, ""),
      adapts: mode.description,
      responseOnly: true,
      manualReset: mode.state === "balanced",
      updatedAt: Date.now(),
      resetAt: mode.state === "balanced" ? Date.now() : 0,
   };
}

// ========================================
// Component
// ========================================

export default function WorkflowStateEngine() {
   const [activeMode, setActiveMode] = useState<CognitionModeConfig>(readStoredCognitionState());

   function setCognitionMode(mode: CognitionModeConfig) {
      const storedState = buildStoredCognitionState(mode);

      setActiveMode(mode);

      localStorage.setItem(COGNITION_STATE_STORAGE_KEY, JSON.stringify(storedState));

      localStorage.setItem(COGNITION_ACTIVE_MODE_STORAGE_KEY, mode.state);

      if (mode.state === "balanced") {
         localStorage.setItem(
            COGNITION_RESET_STORAGE_KEY,
            JSON.stringify({
               active: true,
               responseOnly: true,
               resetAt: Date.now(),
            }),
         );
      } else {
         localStorage.removeItem(COGNITION_RESET_STORAGE_KEY);
      }

      window.dispatchEvent(
         new CustomEvent("allevin-cognition-update", {
            detail: storedState,
         }),
      );
   }

   useEffect(() => {
      function syncCognition(event?: Event) {
         const customEvent = event as CustomEvent<{ state?: WorkflowState }>;

         if (customEvent?.detail?.state) {
            setActiveMode(getModeConfig(customEvent.detail.state));

            return;
         }

         setActiveMode(readStoredCognitionState());
      }

      window.addEventListener("allevin-cognition-update", syncCognition);

      window.addEventListener("storage", syncCognition);

      syncCognition();

      return () => {
         window.removeEventListener("allevin-cognition-update", syncCognition);

         window.removeEventListener("storage", syncCognition);
      };
   }, []);

   const ActiveIcon = activeMode.Icon;

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
         className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-soft)]"
      >
         <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
               <p className="text-sm text-[var(--color-text-secondary)]">Workspace guidance</p>

               <h2 className="mt-1 text-3xl">Insights</h2>

               <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">Choose the style ALLEVIN should use when helping with your project.</p>
            </div>

            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-4 py-3">
               <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Selected style</p>

               <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--color-primary)]">
                     <ActiveIcon size={21} />
                  </div>

                  <div>
                     <p className="text-sm font-semibold">{activeMode.label}</p>

                     <p className="text-xs text-[var(--color-text-secondary)]">{activeMode.shortLabel}</p>
                  </div>
               </div>
            </div>
         </div>

         <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
               <div>
                  <p className="text-sm font-semibold">How this style helps</p>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">{activeMode.description}</p>
               </div>

               <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[var(--color-text-secondary)]">{activeMode.example}</div>
            </div>
         </div>

         <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cognitionModes.map((mode) => {
               const Icon = mode.Icon;

               const isActive = activeMode.state === mode.state;

               return (
                  <button
                     key={mode.state}
                     type="button"
                     onClick={() => setCognitionMode(mode)}
                     className={`
                        rounded-3xl
                        border
                        p-5
                        text-left
                        transition

                        ${
                           isActive
                              ? `
                                 border-[var(--color-primary)]
                                 bg-white
                                 shadow-[var(--shadow-soft)]
                              `
                              : `
                                 border-[var(--border-subtle)]
                                 bg-white/70
                                 hover:bg-white
                              `
                        }
                     `}
                  >
                     <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                           <div
                              className={`
                                 flex
                                 h-11
                                 w-11
                                 items-center
                                 justify-center
                                 rounded-2xl

                                 ${isActive ? "bg-[var(--color-primary)] text-[var(--color-cream)]" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)]"}
                              `}
                           >
                              <Icon size={19} />
                           </div>

                           <div>
                              <p className="text-sm font-semibold">{mode.label}</p>

                              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{mode.shortLabel}</p>
                           </div>
                        </div>

                        {isActive ? <CheckCircle2 size={18} className="text-[var(--color-primary)]" /> : null}
                     </div>

                     <p className="mt-4 text-sm leading-6 text-[var(--color-text-secondary)]">{mode.description}</p>
                  </button>
               );
            })}
         </div>

         <div className="mt-5 rounded-3xl border border-[var(--border-subtle)] bg-white p-5">
            <p className="text-sm font-semibold">Use this with ALLEVIN</p>

            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">Choose a style, then ask ALLEVIN for help with your project. Your project context stays the same; only the tone and structure of the guidance changes.</p>
         </div>
      </motion.section>
   );
}
