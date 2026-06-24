"use client";

import { useEffect, useMemo, useState } from "react";

import { useFocus } from "@/components/FocusContext";

import { useEnvironment } from "@/components/EnvironmentEngine";

import { getMemory } from "@/components/MemoryEngine";

// ========================================
// Types
// ========================================

interface OrchestrationState {
   cognitiveLoad: "low" | "moderate" | "high";

   stability: "stable" | "fragmented";

   recommendation: string;

   confidence: number;
}

// ========================================
// Component
// ========================================

export default function CognitiveOrchestrator() {
   // ========================================
   // Focus
   // ========================================

   const { focusMode } = useFocus();

   // ========================================
   // Environment
   // ========================================

   const { currentEnvironment } = useEnvironment();

   // ========================================
   // State
   // ========================================

   const [orchestration, setOrchestration] = useState<OrchestrationState>({
      cognitiveLoad: "low",
      stability: "stable",
      recommendation: "Baseline behavioral observation active.",
      confidence: 72,
   });

   // ========================================
   // Behavioral Memory
   // ========================================

   const memory = useMemo(() => {
      return getMemory();
   }, [focusMode, currentEnvironment]);

   // ========================================
   // Orchestration Logic
   // ========================================

   useEffect(() => {
      const recent = memory.slice(-10);

      const focusSwitches = recent.filter((entry) => {
         const lower = entry.message.toLowerCase();

         return lower.includes("focus") || lower.includes("calm") || lower.includes("deep") || lower.includes("relax");
      }).length;

      // ========================================
      // High Cognitive Cycling
      // ========================================

      if (focusSwitches >= 6) {
         setOrchestration({
            cognitiveLoad: "high",

            stability: "fragmented",

            recommendation: "Rapid cognitive context switching detected. Recommend reducing workspace density and enabling recovery-oriented adaptations.",

            confidence: 91,
         });

         return;
      }

      // ========================================
      // Deep Focus Stability
      // ========================================

      if (focusMode === "deep" && currentEnvironment === "focus") {
         setOrchestration({
            cognitiveLoad: "moderate",

            stability: "stable",

            recommendation: "Sustained deep-focus state detected. Maintain reduced distraction environment and suppress nonessential interruptions.",

            confidence: 88,
         });

         return;
      }

      // ========================================
      // Calm Recovery
      // ========================================

      if (currentEnvironment === "recovery") {
         setOrchestration({
            cognitiveLoad: "moderate",

            stability: "fragmented",

            recommendation: "Recovery-oriented environment active. Gradual cognitive decompression recommended before returning to intensive workflows.",

            confidence: 84,
         });

         return;
      }

      // ========================================
      // Default
      // ========================================

      setOrchestration({
         cognitiveLoad: "low",

         stability: "stable",

         recommendation: "Behavioral systems operating within normal adaptive thresholds.",

         confidence: 76,
      });
   }, [focusMode, currentEnvironment, memory]);

   // ========================================
   // Render
   // ========================================

   return (
      <section
         className="
            rounded-[32px]
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            p-8
            shadow-[var(--shadow-soft)]
         "
      >
         {/* Header */}

         <div className="mb-6">
            <p
               className="
                  text-sm
                  font-medium
                  uppercase
                  tracking-[0.2em]
                  text-[var(--color-text-secondary)]
               "
            >
               Cognitive Orchestration
            </p>

            <h2 className="mt-3 text-4xl">System Coordination Layer</h2>
         </div>

         {/* Grid */}

         <div
            className="
               grid
               grid-cols-3
               gap-6
            "
         >
            {/* Load */}

            <div
               className="
                  rounded-2xl
                  border
                  border-[var(--border-subtle)]
                  bg-white
                  p-5
               "
            >
               <p className="text-sm text-[var(--color-text-secondary)]">Cognitive Load</p>

               <h3 className="mt-2 text-2xl capitalize">{orchestration.cognitiveLoad}</h3>
            </div>

            {/* Stability */}

            <div
               className="
                  rounded-2xl
                  border
                  border-[var(--border-subtle)]
                  bg-white
                  p-5
               "
            >
               <p className="text-sm text-[var(--color-text-secondary)]">Stability</p>

               <h3 className="mt-2 text-2xl capitalize">{orchestration.stability}</h3>
            </div>

            {/* Confidence */}

            <div
               className="
                  rounded-2xl
                  border
                  border-[var(--border-subtle)]
                  bg-white
                  p-5
               "
            >
               <p className="text-sm text-[var(--color-text-secondary)]">Confidence</p>

               <h3 className="mt-2 text-2xl">{orchestration.confidence}%</h3>
            </div>
         </div>

         {/* Recommendation */}

         <div
            className="
               mt-6
               rounded-2xl
               border
               border-[var(--border-subtle)]
               bg-white
               p-6
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
               Orchestration Recommendation
            </p>

            <p
               className="
                  mt-4
                  text-lg
                  leading-relaxed
               "
            >
               {orchestration.recommendation}
            </p>
         </div>
      </section>
   );
}
