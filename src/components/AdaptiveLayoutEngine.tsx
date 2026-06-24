// ========================================
// Adaptive Layout Engine
// Purpose:
// Autonomous spatial hierarchy +
// layout restructuring intelligence
// ========================================

"use client";

import { motion, AnimatePresence } from "framer-motion";

import { LayoutGrid, Brain, AlertTriangle, Sparkles, Activity } from "lucide-react";

import { useEffect, useState } from "react";

import { useFocus } from "@/components/FocusContext";

import { useEnvironment } from "@/components/EnvironmentEngine";

import { getMemory } from "@/components/MemoryEngine";

// ========================================
// Types
// ========================================

interface LayoutState {
   mode: "balanced" | "focused" | "overloaded" | "recovery";

   recommendation: string;

   priority: string;

   density: string;

   confidence: number;
}

// ========================================
// Component
// ========================================

export default function AdaptiveLayoutEngine() {
   // ========================================
   // Context
   // ========================================

   const { focusMode } = useFocus();

   const { currentEnvironment } = useEnvironment();

   // ========================================
   // State
   // ========================================

   const [layoutState, setLayoutState] = useState<LayoutState>({
      mode: "balanced",

      recommendation: "Balanced adaptive workspace orchestration active.",

      priority: "Balanced systems",

      density: "Standard",

      confidence: 72,
   });

   // ========================================
   // Analysis
   // ========================================

   useEffect(() => {
      const memory = getMemory();

      const recent = memory.slice(-10);

      const deepCount = recent.filter((m) => m.focusMode === "deep").length;

      const calmCount = recent.filter((m) => m.focusMode === "calm").length;

      const rapidSwitching = deepCount >= 3 && calmCount >= 3;

      // ========================================
      // Recovery
      // ========================================

      if (currentEnvironment === "recovery") {
         setLayoutState({
            mode: "recovery",

            recommendation: "Recovery-oriented spatial simplification active. Non-essential cognitive systems suppressed.",

            priority: "Recovery stabilization",

            density: "Low",

            confidence: 94,
         });

         return;
      }

      // ========================================
      // Overload
      // ========================================

      if (rapidSwitching) {
         setLayoutState({
            mode: "overloaded",

            recommendation: "Cognitive fragmentation risk detected. Autonomous hierarchy compression recommended.",

            priority: "Critical focus systems",

            density: "Compressed",

            confidence: 96,
         });

         return;
      }

      // ========================================
      // Deep Focus
      // ========================================

      if (focusMode === "deep") {
         setLayoutState({
            mode: "focused",

            recommendation: "High-focus orchestration active. Primary cognitive modules elevated.",

            priority: "Focus acceleration",

            density: "Dense",

            confidence: 88,
         });

         return;
      }

      // ========================================
      // Balanced
      // ========================================

      setLayoutState({
         mode: "balanced",

         recommendation: "Balanced adaptive workspace orchestration active.",

         priority: "Balanced systems",

         density: "Standard",

         confidence: 74,
      });
   }, [focusMode, currentEnvironment]);

   // ========================================
   // Icon
   // ========================================

   function getIcon() {
      switch (layoutState.mode) {
         case "focused":
            return <Brain size={18} />;

         case "overloaded":
            return <AlertTriangle size={18} />;

         case "recovery":
            return <Sparkles size={18} />;

         default:
            return <Activity size={18} />;
      }
   }

   // ========================================
   // Render
   // ========================================

   return (
      <AnimatePresence mode="wait">
         <motion.div
            key={layoutState.mode}
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
            transition={{
               duration: 0.35,
            }}
            className="
               rounded-[28px]
               border
               border-[var(--border-subtle)]
               bg-[rgba(255,255,255,0.74)]
               p-6
               shadow-[var(--shadow-soft)]
               backdrop-blur-xl
            "
         >
            {/* ========================================
                Header
            ======================================== */}

            <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div
                     className="
                        flex
                        h-11
                        w-11
                        items-center
                        justify-center
                        rounded-2xl
                        bg-[var(--color-primary)]
                        text-[var(--color-cream)]
                     "
                  >
                     {getIcon()}
                  </div>

                  <div>
                     <p
                        className="
                           text-sm
                           uppercase
                           tracking-[0.15em]
                           text-[var(--color-text-secondary)]
                        "
                     >
                        Adaptive Layout Intelligence
                     </p>

                     <h3 className="mt-1 text-2xl capitalize">{layoutState.mode}</h3>
                  </div>
               </div>

               {/* Confidence */}

               <div
                  className="
                     rounded-2xl
                     bg-[var(--color-bg)]
                     px-4
                     py-2
                  "
               >
                  <p
                     className="
                        text-xs
                        uppercase
                        tracking-[0.15em]
                        text-[var(--color-text-secondary)]
                     "
                  >
                     Confidence
                  </p>

                  <p className="mt-1 text-lg font-semibold">{layoutState.confidence}%</p>
               </div>
            </div>

            {/* ========================================
                Main Recommendation
            ======================================== */}

            <div
               className="
                  mt-6
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
                  {layoutState.recommendation}
               </p>
            </div>

            {/* ========================================
                Metrics
            ======================================== */}

            <div className="mt-6 grid grid-cols-3 gap-4">
               {/* Priority */}

               <div
                  className="
                     rounded-2xl
                     bg-[var(--color-bg)]
                     p-4
                  "
               >
                  <p
                     className="
                        text-xs
                        uppercase
                        tracking-[0.15em]
                        text-[var(--color-text-secondary)]
                     "
                  >
                     Priority
                  </p>

                  <p className="mt-2 font-medium">{layoutState.priority}</p>
               </div>

               {/* Density */}

               <div
                  className="
                     rounded-2xl
                     bg-[var(--color-bg)]
                     p-4
                  "
               >
                  <p
                     className="
                        text-xs
                        uppercase
                        tracking-[0.15em]
                        text-[var(--color-text-secondary)]
                     "
                  >
                     Density
                  </p>

                  <p className="mt-2 font-medium">{layoutState.density}</p>
               </div>

               {/* Engine */}

               <div
                  className="
                     rounded-2xl
                     bg-[var(--color-bg)]
                     p-4
                  "
               >
                  <p
                     className="
                        text-xs
                        uppercase
                        tracking-[0.15em]
                        text-[var(--color-text-secondary)]
                     "
                  >
                     Engine
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                     <LayoutGrid size={16} />

                     <span className="font-medium">Autonomous</span>
                  </div>
               </div>
            </div>
         </motion.div>
      </AnimatePresence>
   );
}
