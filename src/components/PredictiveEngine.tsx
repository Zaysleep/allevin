"use client";

import { useEffect, useMemo, useState } from "react";

import { getMemory } from "@/components/MemoryEngine";

import { useFocus } from "@/components/FocusContext";

import { useEnvironment } from "@/components/EnvironmentEngine";

// ========================================
// Types
// ========================================

interface PredictionState {
   predictedState: string;

   confidence: number;

   recommendation: string;

   trajectory: "stable" | "escalating" | "recovering";
}

// ========================================
// Component
// ========================================

export default function PredictiveEngine() {
   // ========================================
   // Focus
   // ========================================

   const { focusMode } = useFocus();

   // ========================================
   // Environment
   // ========================================

   const { currentEnvironment } = useEnvironment();

   // ========================================
   // Prediction State
   // ========================================

   const [prediction, setPrediction] = useState<PredictionState>({
      predictedState: "Baseline Continuity",

      confidence: 72,

      recommendation: "Behavioral continuity appears stable.",

      trajectory: "stable",
   });

   // ========================================
   // Behavioral Memory
   // ========================================

   const memory = useMemo(() => {
      return getMemory();
   }, [focusMode, currentEnvironment]);

   // ========================================
   // Prediction Engine
   // ========================================

   useEffect(() => {
      const recent = memory.slice(-12);

      const rapidSwitches = recent.filter((entry) => {
         const lower = entry.message.toLowerCase();

         return lower.includes("focus") || lower.includes("calm") || lower.includes("stress") || lower.includes("deep") || lower.includes("relax");
      }).length;

      const focusHeavy = recent.filter((entry) => {
         const lower = entry.message.toLowerCase();

         return lower.includes("focus") || lower.includes("deep work") || lower.includes("concentration");
      }).length;

      // ========================================
      // Overload Prediction
      // ========================================

      if (rapidSwitches >= 7) {
         setPrediction({
            predictedState: "Cognitive Fragmentation Risk",

            confidence: 93,

            trajectory: "escalating",

            recommendation: "Behavior patterns suggest an elevated probability of cognitive overload. Recommend proactive decompression and reduced environmental complexity.",
         });

         return;
      }

      // ========================================
      // Deep Focus Prediction
      // ========================================

      if (focusHeavy >= 5 && focusMode === "deep") {
         setPrediction({
            predictedState: "Sustained Deep Focus Session",

            confidence: 89,

            trajectory: "stable",

            recommendation: "Behavior suggests prolonged concentration continuity. Suppress nonessential interruptions and maintain low-noise workspace conditions.",
         });

         return;
      }

      // ========================================
      // Recovery Prediction
      // ========================================

      if (currentEnvironment === "recovery") {
         setPrediction({
            predictedState: "Recovery Stabilization",

            confidence: 84,

            trajectory: "recovering",

            recommendation: "Behavior suggests cognitive decompression is occurring. Gradual reintroduction of task complexity is recommended.",
         });

         return;
      }

      // ========================================
      // Default
      // ========================================

      setPrediction({
         predictedState: "Baseline Continuity",

         confidence: 74,

         trajectory: "stable",

         recommendation: "Behavioral continuity appears stable.",
      });
   }, [memory, focusMode, currentEnvironment]);

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
               Predictive Cognition
            </p>

            <h2 className="mt-3 text-4xl">Anticipatory Adaptation Layer</h2>
         </div>

         {/* Grid */}

         <div
            className="
               grid
               grid-cols-3
               gap-6
            "
         >
            {/* Predicted State */}

            <div
               className="
                  rounded-2xl
                  border
                  border-[var(--border-subtle)]
                  bg-white
                  p-5
               "
            >
               <p className="text-sm text-[var(--color-text-secondary)]">Predicted State</p>

               <h3 className="mt-2 text-2xl">{prediction.predictedState}</h3>
            </div>

            {/* Trajectory */}

            <div
               className="
                  rounded-2xl
                  border
                  border-[var(--border-subtle)]
                  bg-white
                  p-5
               "
            >
               <p className="text-sm text-[var(--color-text-secondary)]">Trajectory</p>

               <h3 className="mt-2 text-2xl capitalize">{prediction.trajectory}</h3>
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
               <p className="text-sm text-[var(--color-text-secondary)]">Prediction Confidence</p>

               <h3 className="mt-2 text-2xl">{prediction.confidence}%</h3>
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
               Predictive Recommendation
            </p>

            <p
               className="
                  mt-4
                  text-lg
                  leading-relaxed
               "
            >
               {prediction.recommendation}
            </p>
         </div>
      </section>
   );
}
