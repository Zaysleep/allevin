// ========================================
// Cognitive Presence
// Purpose:
// Ambient cognitive monitoring +
// autonomous intervention layer
// ========================================

"use client";

import { motion, AnimatePresence } from "framer-motion";

import { Brain, Activity, AlertTriangle, Sparkles } from "lucide-react";

import { useEffect, useMemo, useState } from "react";

import { getMemory } from "@/components/MemoryEngine";

import { useEnvironment } from "@/components/EnvironmentEngine";

import { useFocus } from "@/components/FocusContext";

// ========================================
// Types
// ========================================

interface PresenceState {
   status: "stable" | "elevated" | "overloaded" | "recovery";

   message: string;

   confidence: number;
}

// ========================================
// Component
// ========================================

export default function CognitivePresence() {
   // ========================================
   // Context
   // ========================================

   const { currentEnvironment } = useEnvironment();

   const { focusMode } = useFocus();

   // ========================================
   // Local State
   // ========================================

   const [presence, setPresence] = useState<PresenceState>({
      status: "stable",

      message: "Baseline cognitive monitoring active.",

      confidence: 72,
   });

   // ========================================
   // Memory Analysis
   // ========================================

   const memories = useMemo(() => {
      return getMemory();
   }, [focusMode, currentEnvironment]);

   // ========================================
   // Presence Analysis
   // ========================================

   useEffect(() => {
      const recentMemories = memories.slice(-8);

      const deepCount = recentMemories.filter((m) => m.focusMode === "deep").length;

      const calmCount = recentMemories.filter((m) => m.focusMode === "calm").length;

      const rapidSwitching = deepCount >= 3 && calmCount >= 3;

      // ========================================
      // Recovery
      // ========================================

      if (currentEnvironment === "recovery") {
         setPresence({
            status: "recovery",

            confidence: 91,

            message: "Recovery-oriented environmental pacing active. Cognitive decompression recommended.",
         });

         return;
      }

      // ========================================
      // Overload
      // ========================================

      if (rapidSwitching) {
         setPresence({
            status: "overloaded",

            confidence: 95,

            message: "High-intensity cognitive cycling detected. Autonomous stabilization behaviors engaged.",
         });

         return;
      }

      // ========================================
      // Elevated
      // ========================================

      if (focusMode === "deep") {
         setPresence({
            status: "elevated",

            confidence: 84,

            message: "Sustained deep-focus behavior detected. Environmental prioritization increasing.",
         });

         return;
      }

      // ========================================
      // Stable
      // ========================================

      setPresence({
         status: "stable",

         confidence: 73,

         message: "Behavioral systems stable. Ambient cognitive monitoring active.",
      });
   }, [memories, currentEnvironment, focusMode]);

   // ========================================
   // Visual Status
   // ========================================

   function getStatusIcon() {
      switch (presence.status) {
         case "overloaded":
            return <AlertTriangle size={18} />;

         case "elevated":
            return <Activity size={18} />;

         case "recovery":
            return <Sparkles size={18} />;

         default:
            return <Brain size={18} />;
      }
   }

   // ========================================
   // Render
   // ========================================

   return (
      <AnimatePresence mode="wait">
         <motion.div
            key={presence.status}
            initial={{
               opacity: 0,
               y: 10,
            }}
            animate={{
               opacity: 1,
               y: 0,
            }}
            exit={{
               opacity: 0,
               y: -10,
            }}
            transition={{
               duration: 0.4,
            }}
            className="
               rounded-[28px]
               border
               border-[var(--border-subtle)]
               bg-[rgba(255,255,255,0.72)]
               p-6
               shadow-[var(--shadow-soft)]
               backdrop-blur-xl
            "
         >
            {/* Header */}

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
                     {getStatusIcon()}
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
                        Cognitive Presence
                     </p>

                     <h3 className="mt-1 text-2xl capitalize">{presence.status}</h3>
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

                  <p className="mt-1 text-lg font-semibold">{presence.confidence}%</p>
               </div>
            </div>

            {/* Message */}

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
                  {presence.message}
               </p>
            </div>
         </motion.div>
      </AnimatePresence>
   );
}
