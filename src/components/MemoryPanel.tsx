"use client";

import { useEffect, useState } from "react";

import { Brain, Activity, AlertTriangle, Sparkles, User } from "lucide-react";

import { getMemory, clearMemory, getCognitiveLoadState, getBehavioralPrediction, getCognitiveProfile, CognitiveLoadState, BehavioralPrediction, CognitiveProfile } from "@/components/MemoryEngine";

// ========================================
// Component
// ========================================

export default function MemoryPanel() {
   // ========================================
   // State
   // ========================================

   const [interactions, setInteractions] = useState(0);

   const [deepFocus, setDeepFocus] = useState(0);

   const [calmSessions, setCalmSessions] = useState(0);

   const [load, setLoad] = useState<CognitiveLoadState>({
      state: "Balanced",

      intensity: 0,

      recentInteractions: 0,
   });

   const [prediction, setPrediction] = useState<BehavioralPrediction | null>(null);

   const [profile, setProfile] = useState<CognitiveProfile | null>(null);

   // ========================================
   // Refresh
   // ========================================

   function refreshData() {
      const memory = getMemory();

      setInteractions(memory.length);

      setDeepFocus(memory.filter((item) => item.focusMode === "deep").length);

      setCalmSessions(memory.filter((item) => item.focusMode === "calm").length);

      setLoad(getCognitiveLoadState());

      setPrediction(getBehavioralPrediction());

      setProfile(getCognitiveProfile());
   }

   // ========================================
   // Load
   // ========================================

   useEffect(() => {
      refreshData();

      const interval = setInterval(refreshData, 1000);

      return () => clearInterval(interval);
   }, []);

   // ========================================
   // Reset
   // ========================================

   function handleReset() {
      clearMemory();

      refreshData();
   }

   // ========================================
   // Load Label
   // ========================================

   function getLoadLabel() {
      return load.state;
   }

   // ========================================
   // Render
   // ========================================

   return (
      <section
         className="
            rounded-[var(--radius-lg)]
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            p-6
            shadow-[var(--shadow-soft)]
         "
      >
         {/* Header */}

         <div className="flex items-center justify-between">
            <div>
               <p
                  className="
                     text-sm
                     text-[var(--color-text-secondary)]
                  "
               >
                  Behavioral Memory
               </p>

               <h3 className="mt-1 text-2xl">Cognitive Tracking</h3>
            </div>

            <div
               className="
                  rounded-2xl
                  bg-[var(--color-bg)]
                  p-3
               "
            >
               <Brain size={22} />
            </div>
         </div>

         {/* Metrics */}

         <div className="mt-6 space-y-4">
            {/* Interactions */}

            <div
               className="
                  flex
                  items-center
                  justify-between
                  rounded-2xl
                  bg-[var(--color-bg)]
                  p-4
               "
            >
               <span>Interactions</span>

               <span className="font-semibold">{interactions}</span>
            </div>

            {/* Deep Focus */}

            <div
               className="
                  flex
                  items-center
                  justify-between
                  rounded-2xl
                  bg-[var(--color-bg)]
                  p-4
               "
            >
               <span>Deep Focus</span>

               <span className="font-semibold">{deepFocus}</span>
            </div>

            {/* Calm Sessions */}

            <div
               className="
                  flex
                  items-center
                  justify-between
                  rounded-2xl
                  bg-[var(--color-bg)]
                  p-4
               "
            >
               <span>Calm Sessions</span>

               <span className="font-semibold">{calmSessions}</span>
            </div>

            {/* Cognitive Load */}

            <div
               className="
                  rounded-2xl
                  border
                  border-[var(--border-subtle)]
                  bg-[var(--color-bg)]
                  p-5
               "
            >
               <div className="flex items-center justify-between">
                  <div>
                     <p
                        className="
                           text-sm
                           text-[var(--color-text-secondary)]
                        "
                     >
                        Cognitive Load
                     </p>

                     <h4 className="mt-1 text-xl">{getLoadLabel()}</h4>
                  </div>

                  <Activity size={22} />
               </div>

               <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                     <span>Intensity</span>

                     <span>{load.intensity}%</span>
                  </div>

                  <div className="flex justify-between">
                     <span>Recent Activity</span>

                     <span>{load.recentInteractions}</span>
                  </div>
               </div>

               {load.state === "Critical" && (
                  <div
                     className="
                        mt-4
                        flex
                        items-center
                        gap-2
                        rounded-xl
                        border
                        border-[var(--border-subtle)]
                        bg-white
                        p-3
                        text-sm
                     "
                  >
                     <AlertTriangle size={16} />

                     <span>Critical cognitive strain detected.</span>
                  </div>
               )}
            </div>

            {/* Prediction */}

            {prediction && (
               <div
                  className="
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-bg)]
                     p-5
                  "
               >
                  <div className="flex items-center gap-2">
                     <Sparkles size={18} />

                     <p
                        className="
                           text-sm
                           font-medium
                           uppercase
                           tracking-[0.15em]
                        "
                     >
                        Predictive Analysis
                     </p>
                  </div>

                  <h4 className="mt-4 text-xl">{prediction.predictedState}</h4>

                  <p
                     className="
                        mt-3
                        leading-relaxed
                        text-[var(--color-text-secondary)]
                     "
                  >
                     {prediction.recommendation}
                  </p>

                  <div
                     className="
                        mt-4
                        flex
                        items-center
                        justify-between
                        rounded-xl
                        bg-white
                        p-3
                        text-sm
                     "
                  >
                     <span>Confidence</span>

                     <span className="font-semibold">{prediction.confidence}%</span>
                  </div>
               </div>
            )}

            {/* Profile */}

            {profile && (
               <div
                  className="
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-bg)]
                     p-5
                  "
               >
                  <div className="flex items-center gap-2">
                     <User size={18} />

                     <p
                        className="
                           text-sm
                           font-medium
                           uppercase
                           tracking-[0.15em]
                        "
                     >
                        Cognitive Profile
                     </p>
                  </div>

                  <h4 className="mt-4 text-xl">{profile.profile}</h4>

                  <p
                     className="
                        mt-3
                        leading-relaxed
                        text-[var(--color-text-secondary)]
                     "
                  >
                     {profile.recommendation}
                  </p>

                  <div
                     className="
                        mt-4
                        flex
                        items-center
                        justify-between
                        rounded-xl
                        bg-white
                        p-3
                        text-sm
                     "
                  >
                     <span>Confidence</span>

                     <span className="font-semibold">{profile.confidence}%</span>
                  </div>
               </div>
            )}
         </div>

         {/* Reset */}

         <button
            onClick={handleReset}
            className="
               mt-6
               w-full
               rounded-xl
               border
               border-[var(--border-subtle)]
               bg-white
               px-4
               py-3
               text-sm
               font-medium
               transition-colors
               hover:bg-[var(--color-bg)]
            "
         >
            Reset Behavioral Memory
         </button>
      </section>
   );
}
