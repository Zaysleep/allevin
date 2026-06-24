"use client";

import { Brain, HeartPulse, Sparkles } from "lucide-react";

import { motion } from "framer-motion";

import { useFocus } from "@/components/FocusContext";

import { useEnvironment } from "@/components/EnvironmentEngine";

import { getCognitiveLoadState, getBehavioralPrediction, getCognitiveProfile } from "@/components/MemoryEngine";

// ========================================
// Agent Card
// ========================================

function AgentCard({
   title,
   description,
   status,
   icon,
}: {
   title: string;

   description: string;

   status: string;

   icon: React.ReactNode;
}) {
   return (
      <motion.div
         layout
         whileHover={{
            y: -2,
         }}
         className="
            rounded-2xl
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            p-5
            shadow-[var(--shadow-soft)]
         "
      >
         <div className="flex items-start justify-between">
            <div>
               <p
                  className="
                     text-sm
                     uppercase
                     tracking-[0.15em]
                     text-[var(--color-text-secondary)]
                  "
               >
                  Cognitive Agent
               </p>

               <h3 className="mt-2 text-xl">{title}</h3>
            </div>

            <div
               className="
                  rounded-xl
                  bg-[var(--color-bg)]
                  p-3
               "
            >
               {icon}
            </div>
         </div>

         <p
            className="
               mt-4
               leading-relaxed
               text-[var(--color-text-secondary)]
            "
         >
            {description}
         </p>

         <div
            className="
               mt-5
               flex
               items-center
               justify-between
               rounded-xl
               bg-[var(--color-bg)]
               p-3
               text-sm
            "
         >
            <span>Status</span>

            <span className="font-medium">{status}</span>
         </div>
      </motion.div>
   );
}

// ========================================
// Component
// ========================================

export default function CognitiveAgents() {
   // ========================================
   // Context
   // ========================================

   const { focusMode } = useFocus();

   const { currentEnvironment } = useEnvironment();

   // ========================================
   // Memory Intelligence
   // ========================================

   const load = getCognitiveLoadState();

   const prediction = getBehavioralPrediction();

   const profile = getCognitiveProfile();

   // ========================================
   // Focus Agent
   // ========================================

   function getFocusStatus() {
      // Deep Focus

      if (focusMode === "deep") {
         return "High Concentration Monitoring";
      }

      // Elevated Load

      if (load.state === "Elevated") {
         return "Attention Instability Detected";
      }

      // Critical Load

      if (load.state === "Critical") {
         return "Cognitive Overload Intervention";
      }

      return "Normal Cognitive Monitoring";
   }

   // ========================================
   // Recovery Agent
   // ========================================

   function getRecoveryStatus() {
      if (currentEnvironment === "recovery") {
         return "Recovery Intervention Active";
      }

      if (focusMode === "calm") {
         return "Calm Regulation Monitoring";
      }

      if (load.state === "Critical") {
         return "Decompression Required";
      }

      return "Passive Recovery Observation";
   }

   // ========================================
   // Insight Agent
   // ========================================

   function getInsightStatus() {
      if (prediction.confidence >= 85) {
         return `${prediction.predictedState} • ${prediction.confidence}% Confidence`;
      }

      if (profile.confidence >= 75) {
         return `${profile.profile} • ${profile.confidence}% Confidence`;
      }

      return "Baseline Behavioral Observation";
   }

   return (
      <section className="space-y-5">
         {/* Header */}

         <div>
            <p
               className="
                  text-sm
                  text-[var(--color-text-secondary)]
               "
            >
               Multi-Agent Cognitive Architecture
            </p>

            <h2 className="mt-1 text-3xl">Cognitive Agent Network</h2>
         </div>

         {/* Grid */}

         <div className="grid grid-cols-3 gap-5">
            {/* Focus Agent */}

            <AgentCard
               title="Focus Agent"
               description="
                  Monitors concentration depth,
                  pacing stability,
                  attention continuity,
                  and cognitive strain signals.
               "
               status={getFocusStatus()}
               icon={<Brain size={22} />}
            />

            {/* Recovery Agent */}

            <AgentCard
               title="Recovery Agent"
               description="
                  Coordinates cognitive recovery pacing,
                  decompression environments,
                  and overload mitigation systems.
               "
               status={getRecoveryStatus()}
               icon={<HeartPulse size={22} />}
            />

            {/* Insight Agent */}

            <AgentCard
               title="Insight Agent"
               description="
                  Tracks behavioral trends,
                  cognitive profiles,
                  and predictive workflow patterns.
               "
               status={getInsightStatus()}
               icon={<Sparkles size={22} />}
            />
         </div>
      </section>
   );
}
