// ========================================
// Adaptive Research Panel
// Purpose:
// Real research surface for questions,
// sources, evidence, and synthesis inside ALLEVIN
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { Search, Plus, Trash2, BookOpen, Sparkles, Brain, Save, RotateCcw, Link, Send } from "lucide-react";

import { useFocus } from "@/components/FocusContext";

import { useEnvironment } from "@/components/EnvironmentEngine";

import { getBehavioralPrediction, getCognitiveProfile, getMemory } from "@/components/MemoryEngine";

// ========================================
// Storage
// ========================================

const STORAGE_KEY = "allevin-adaptive-research-panel";

// ========================================
// Types
// ========================================

interface ResearchItem {
   id: string;

   question: string;

   source: string;

   evidence: string;

   insight: string;

   confidence: "low" | "medium" | "high";
}

interface ResearchState {
   topic: string;

   summary: string;

   items: ResearchItem[];

   updatedAt: number;
}

type ResearchMode = "balanced" | "research" | "deep-focus" | "recovery" | "planning" | "creative";

// ========================================
// Initial State
// ========================================

function getInitialResearchState(): ResearchState {
   return {
      topic: "",

      summary: "",

      items: [
         {
            id: crypto.randomUUID(),

            question: "",

            source: "",

            evidence: "",

            insight: "",

            confidence: "medium",
         },
      ],

      updatedAt: Date.now(),
   };
}

// ========================================
// Component
// ========================================

export default function AdaptiveResearchPanel() {
   const { focusMode } = useFocus();

   const { currentEnvironment, adaptationStage, adaptationIntensity, adaptiveUI } = useEnvironment();

   const [mounted, setMounted] = useState(false);

   const [research, setResearch] = useState<ResearchState>(getInitialResearchState());

   const [saved, setSaved] = useState(false);

   const [resetNotice, setResetNotice] = useState(false);

   const [sendNotice, setSendNotice] = useState(false);

   // ========================================
   // Load
   // ========================================

   useEffect(() => {
      setMounted(true);

      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
         try {
            setResearch(JSON.parse(stored));
         } catch {
            localStorage.removeItem(STORAGE_KEY);
         }
      }
   }, []);

   // ========================================
   // Auto Save
   // ========================================

   useEffect(() => {
      if (!mounted) return;

      const timer = setTimeout(() => {
         localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
               ...research,

               updatedAt: Date.now(),
            }),
         );
      }, 800);

      return () => clearTimeout(timer);
   }, [research, mounted]);

   // ========================================
   // Intelligence
   // ========================================

   const memory = getMemory();

   const prediction = getBehavioralPrediction();

   const profile = getCognitiveProfile();

   // ========================================
   // Research Mode
   // ========================================

   const researchMode = useMemo<ResearchMode>(() => {
      if (currentEnvironment === "recovery") {
         return "recovery";
      }

      if (currentEnvironment === "deep-focus" || focusMode === "deep") {
         return "deep-focus";
      }

      const recent = memory.slice(-8);

      let researchSignals = 0;

      let planningSignals = 0;

      let creativeSignals = 0;

      recent.forEach((entry) => {
         const message = entry.message.toLowerCase();

         if (message.includes("research") || message.includes("study") || message.includes("analyze") || message.includes("compare") || message.includes("investigate")) {
            researchSignals++;
         }

         if (message.includes("plan") || message.includes("organize") || message.includes("roadmap") || message.includes("schedule") || message.includes("tasks")) {
            planningSignals++;
         }

         if (message.includes("design") || message.includes("brainstorm") || message.includes("ideas") || message.includes("creative") || message.includes("concept")) {
            creativeSignals++;
         }
      });

      if (researchSignals >= planningSignals && researchSignals >= creativeSignals && researchSignals > 0) {
         return "research";
      }

      if (planningSignals >= researchSignals && planningSignals >= creativeSignals && planningSignals > 0) {
         return "planning";
      }

      if (creativeSignals >= researchSignals && creativeSignals >= planningSignals && creativeSignals > 0) {
         return "creative";
      }

      return "balanced";
   }, [memory, currentEnvironment, focusMode]);

   // ========================================
   // Adaptive Configuration
   // ========================================

   const panelMode = useMemo(() => {
      if (researchMode === "recovery") {
         return {
            label: "Recovery",

            icon: Sparkles,

            description: "ALLEVIN is reducing research pressure.",

            layoutClass: "grid-cols-1",

            listLimit: 1,

            sideClass: "hidden",
         };
      }

      if (researchMode === "deep-focus") {
         return {
            label: "Deep Focus",

            icon: Brain,

            description: "ALLEVIN is narrowing research around one line of inquiry.",

            layoutClass: "grid-cols-12",

            listLimit: 3,

            sideClass: "col-span-3 opacity-70",
         };
      }

      if (researchMode === "research") {
         return {
            label: "Research",

            icon: Search,

            description: "ALLEVIN is supporting evidence, sources, and synthesis.",

            layoutClass: "grid-cols-12",

            listLimit: research.items.length,

            sideClass: "col-span-4",
         };
      }

      if (researchMode === "planning") {
         return {
            label: "Planning",

            icon: BookOpen,

            description: "ALLEVIN is connecting evidence to decisions.",

            layoutClass: "grid-cols-12",

            listLimit: research.items.length,

            sideClass: "col-span-4",
         };
      }

      if (researchMode === "creative") {
         return {
            label: "Exploration",

            icon: Sparkles,

            description: "ALLEVIN is supporting discovery and concept evidence.",

            layoutClass: "grid-cols-12",

            listLimit: research.items.length,

            sideClass: "col-span-4",
         };
      }

      return {
         label: adaptiveUI ? "Supported" : "Balanced",

         icon: Search,

         description: "A stable surface for questions, evidence, and insight.",

         layoutClass: "grid-cols-12",

         listLimit: research.items.length,

         sideClass: "col-span-4",
      };
   }, [researchMode, research.items.length, adaptiveUI]);

   const PanelIcon = panelMode.icon;

   const visibleItems = research.items.slice(0, panelMode.listLimit);

   // ========================================
   // Actions
   // ========================================

   function saveResearch() {
      const updated = {
         ...research,

         updatedAt: Date.now(),
      };

      setResearch(updated);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      setSaved(true);

      setTimeout(() => {
         setSaved(false);
      }, 1200);
   }

   function resetResearch() {
      const fresh = getInitialResearchState();

      localStorage.removeItem(STORAGE_KEY);

      setResearch(fresh);

      setResetNotice(true);

      setTimeout(() => {
         setResetNotice(false);
      }, 1200);
   }

   function addResearchItem() {
      const newItem: ResearchItem = {
         id: crypto.randomUUID(),

         question: "",

         source: "",

         evidence: "",

         insight: "",

         confidence: "medium",
      };

      setResearch({
         ...research,

         items: [newItem, ...research.items],
      });
   }

   function updateItem(id: string, field: keyof ResearchItem, value: string) {
      setResearch({
         ...research,

         items: research.items.map((item) =>
            item.id === id
               ? {
                    ...item,

                    [field]: value,
                 }
               : item,
         ),
      });
   }

   function deleteItem(id: string) {
      setResearch({
         ...research,

         items: research.items.filter((item) => item.id !== id),
      });
   }

   // ========================================
   // Send Research Insight To Canvas
   // ========================================

   function sendInsightToCanvas(item: ResearchItem) {
      const payload = {
         title: "Research Insight",

         source: "research" as const,

         body: `
Question:
${item.question || "No question provided."}

Source:
${item.source || "No source provided."}

Evidence:
${item.evidence || "No evidence captured."}

Insight:
${item.insight || "No insight written yet."}

Confidence:
${item.confidence}
         `.trim(),
      };

      window.dispatchEvent(
         new CustomEvent("allevin-send-to-canvas", {
            detail: payload,
         }),
      );

      const fresh = getInitialResearchState();

      localStorage.removeItem(STORAGE_KEY);

      setResearch(fresh);

      setSendNotice(true);

      setTimeout(() => {
         setSendNotice(false);
      }, 1200);
   }

   function getResearchGuidance() {
      if (researchMode === "recovery") {
         return "Keep one question, one source, and one useful insight.";
      }

      if (researchMode === "deep-focus") {
         return "Stay with one line of inquiry.";
      }

      if (researchMode === "research") {
         return "Separate evidence from interpretation.";
      }

      if (researchMode === "planning") {
         return "Use evidence to support the next decision.";
      }

      if (researchMode === "creative") {
         return "Look for patterns, analogies, and alternate directions.";
      }

      if (prediction.predictedState !== "Baseline Observation") {
         return prediction.recommendation;
      }

      return "Collect evidence and convert it into useful insight.";
   }

   function insertResearchStarter() {
      const starter: ResearchItem = {
         id: crypto.randomUUID(),

         question: "",

         source: "",

         evidence: "",

         insight: "",

         confidence: "medium",
      };

      setResearch({
         ...research,

         items: [starter, ...research.items],
      });
   }

   function getSmartQuestionPlaceholder() {
      if (researchMode === "planning") {
         return "What decision does this support?";
      }

      if (researchMode === "creative") {
         return "What idea am I exploring?";
      }

      if (researchMode === "deep-focus") {
         return "What single question matters most?";
      }

      if (researchMode === "recovery") {
         return "What is simplest to understand?";
      }

      return "What question am I answering?";
   }

   // ========================================
   // Hydration Protection
   // ========================================

   if (!mounted) {
      return null;
   }

   return (
      <motion.section
         layout
         initial={{
            opacity: 0,
            y: 10,
         }}
         animate={{
            opacity: 1,
            y: 0,
         }}
         transition={{
            duration: 0.35,
         }}
         className="
            rounded-[32px]
            border
            border-[var(--border-subtle)]
            bg-[var(--color-surface)]
            p-6
            shadow-[var(--shadow-soft)]
         "
      >
         {/* Header */}

         <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div
                  className="
                     flex
                     h-14
                     w-14
                     items-center
                     justify-center
                     rounded-2xl
                     bg-[var(--color-bg)]
                  "
               >
                  <PanelIcon size={24} />
               </div>

               <div>
                  <p className="text-sm text-[var(--color-text-secondary)]">Evidence surface</p>

                  <h2 className="mt-1 text-3xl">Research</h2>

                  <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">{panelMode.description}</p>
               </div>
            </div>

            <div className="flex items-center gap-3">
               {sendNotice && <div className="rounded-2xl bg-[var(--color-bg)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">Sent</div>}

               <button
                  onClick={insertResearchStarter}
                  className="
                     flex
                     items-center
                     gap-2
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-white
                     px-5
                     py-3
                     text-sm
                     font-medium
                     transition-colors
                     hover:bg-[var(--color-bg)]
                  "
               >
                  <Plus size={16} />
                  Question
               </button>

               <button
                  onClick={addResearchItem}
                  className="
                     flex
                     items-center
                     gap-2
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-white
                     px-5
                     py-3
                     text-sm
                     font-medium
                     transition-colors
                     hover:bg-[var(--color-bg)]
                  "
               >
                  <Plus size={16} />
                  Evidence
               </button>

               <button
                  onClick={resetResearch}
                  className="
                     flex
                     items-center
                     gap-2
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-white
                     px-5
                     py-3
                     text-sm
                     font-medium
                     transition-colors
                     hover:bg-[var(--color-bg)]
                  "
               >
                  <RotateCcw size={16} />
                  Reset
               </button>

               <button
                  onClick={saveResearch}
                  className="
                     flex
                     items-center
                     gap-2
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
                  <Save size={16} />

                  {saved ? "Saved" : "Save"}
               </button>
            </div>
         </div>

         {/* Status Row */}

         <div
            className="
               mb-6
               grid
               grid-cols-5
               gap-4
            "
         >
            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Mode</p>

               <p className="mt-2 font-medium">{panelMode.label}</p>
            </div>

            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Flow</p>

               <p className="mt-2 font-medium capitalize">{researchMode.replace("-", " ")}</p>
            </div>

            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Environment</p>

               <p className="mt-2 font-medium capitalize">{currentEnvironment}</p>
            </div>

            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Stage</p>

               <p className="mt-2 font-medium capitalize">{adaptationStage}</p>
            </div>

            <div className="rounded-2xl bg-[var(--color-bg)] p-4">
               <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Intensity</p>

               <p className="mt-2 font-medium">{adaptationIntensity}%</p>
            </div>
         </div>

         {/* Main Layout */}

         <div
            className={`
               grid
               gap-6
               transition-all
               duration-700

               ${panelMode.layoutClass}
            `}
         >
            {/* Main Research Area */}

            <div
               className={`
                  ${currentEnvironment === "recovery" ? "col-span-1" : currentEnvironment === "deep-focus" ? "col-span-9" : "col-span-8"}
               `}
            >
               {/* Topic + Summary */}

               <div
                  className="
                     mb-5
                     rounded-3xl
                     border
                     border-[var(--border-subtle)]
                     bg-white
                     p-5
                  "
               >
                  <input
                     value={research.topic}
                     onChange={(e) =>
                        setResearch({
                           ...research,

                           topic: e.target.value,
                        })
                     }
                     className="
                        mb-4
                        w-full
                        bg-transparent
                        text-3xl
                        font-semibold
                        outline-none
                        placeholder:text-[var(--color-text-secondary)]
                     "
                     placeholder="Untitled research thread"
                  />

                  <textarea
                     value={research.summary}
                     onChange={(e) =>
                        setResearch({
                           ...research,

                           summary: e.target.value,
                        })
                     }
                     className="
                        min-h-[120px]
                        w-full
                        resize-none
                        bg-transparent
                        leading-7
                        outline-none
                        text-[var(--color-text-primary)]
                        placeholder:text-[var(--color-text-secondary)]
                     "
                     placeholder="Collect questions, evidence, sources, and insights..."
                  />
               </div>

               {/* Evidence Items */}

               <div className="space-y-4">
                  <AnimatePresence>
                     {visibleItems.map((item) => (
                        <motion.div
                           key={item.id}
                           layout
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
                              scale: 0.96,
                           }}
                           className="
                              rounded-3xl
                              border
                              border-[var(--border-subtle)]
                              bg-white
                              p-5
                           "
                        >
                           <div className="mb-4 flex items-start justify-between gap-4">
                              <div className="flex-1">
                                 <p className="mb-2 text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Question</p>

                                 <input
                                    value={item.question}
                                    onChange={(e) => updateItem(item.id, "question", e.target.value)}
                                    className="
                                       w-full
                                       bg-transparent
                                       text-xl
                                       font-semibold
                                       outline-none
                                       placeholder:text-[var(--color-text-secondary)]
                                    "
                                    placeholder={getSmartQuestionPlaceholder()}
                                 />
                              </div>

                              <button
                                 onClick={() => deleteItem(item.id)}
                                 className="
                                    rounded-xl
                                    bg-[var(--color-bg)]
                                    p-2
                                    hover:bg-white
                                 "
                              >
                                 <Trash2 size={16} />
                              </button>
                           </div>

                           <div className="grid grid-cols-2 gap-4">
                              <div
                                 className="
                                    rounded-2xl
                                    bg-[var(--color-bg)]
                                    p-4
                                 "
                              >
                                 <div className="mb-2 flex items-center gap-2">
                                    <Link size={14} />

                                    <p className="text-sm font-medium">Source</p>
                                 </div>

                                 <textarea
                                    value={item.source}
                                    onChange={(e) => updateItem(item.id, "source", e.target.value)}
                                    className="
                                       min-h-[90px]
                                       w-full
                                       resize-none
                                       bg-transparent
                                       text-sm
                                       outline-none
                                       placeholder:text-[var(--color-text-secondary)]
                                    "
                                    placeholder="Paste source, citation, URL, or reference..."
                                 />
                              </div>

                              <div
                                 className="
                                    rounded-2xl
                                    bg-[var(--color-bg)]
                                    p-4
                                 "
                              >
                                 <p className="mb-2 text-sm font-medium">Evidence</p>

                                 <textarea
                                    value={item.evidence}
                                    onChange={(e) => updateItem(item.id, "evidence", e.target.value)}
                                    className="
                                       min-h-[90px]
                                       w-full
                                       resize-none
                                       bg-transparent
                                       text-sm
                                       outline-none
                                       placeholder:text-[var(--color-text-secondary)]
                                    "
                                    placeholder="What does this show?"
                                 />
                              </div>

                              <div
                                 className="
                                    col-span-2
                                    rounded-2xl
                                    bg-[var(--color-bg)]
                                    p-4
                                 "
                              >
                                 <p className="mb-2 text-sm font-medium">Insight</p>

                                 <textarea
                                    value={item.insight}
                                    onChange={(e) => updateItem(item.id, "insight", e.target.value)}
                                    className="
                                       min-h-[90px]
                                       w-full
                                       resize-none
                                       bg-transparent
                                       text-sm
                                       outline-none
                                       placeholder:text-[var(--color-text-secondary)]
                                    "
                                    placeholder="What does this mean?"
                                 />
                              </div>
                           </div>

                           <div className="mt-4 flex items-center justify-between gap-3">
                              <p className="text-sm text-[var(--color-text-secondary)]">Confidence</p>

                              <div className="flex items-center gap-3">
                                 <button
                                    onClick={() => sendInsightToCanvas(item)}
                                    className="
                                       flex
                                       items-center
                                       gap-2
                                       rounded-xl
                                       border
                                       border-[var(--border-subtle)]
                                       bg-white
                                       px-3
                                       py-2
                                       text-sm
                                       font-medium
                                       transition-colors
                                       hover:bg-[var(--color-bg)]
                                    "
                                 >
                                    <Send size={14} />
                                    Send
                                 </button>

                                 <select
                                    value={item.confidence}
                                    onChange={(e) => updateItem(item.id, "confidence", e.target.value)}
                                    className="
                                       rounded-xl
                                       border
                                       border-[var(--border-subtle)]
                                       bg-white
                                       px-3
                                       py-2
                                       text-sm
                                       outline-none
                                    "
                                 >
                                    <option value="low">Low</option>

                                    <option value="medium">Medium</option>

                                    <option value="high">High</option>
                                 </select>
                              </div>
                           </div>
                        </motion.div>
                     ))}
                  </AnimatePresence>
               </div>
            </div>

            {/* Side Panel */}

            <aside
               className={`
                  transition-all
                  duration-700

                  ${panelMode.sideClass}
               `}
            >
               <div className="space-y-4">
                  <div
                     className="
                        rounded-3xl
                        border
                        border-[var(--border-subtle)]
                        bg-white
                        p-5
                     "
                  >
                     <div className="mb-4 flex items-center gap-3">
                        <Sparkles size={18} />

                        <p className="font-medium">Guidance</p>
                     </div>

                     <p className="leading-relaxed text-[var(--color-text-secondary)]">{getResearchGuidance()}</p>
                  </div>

                  <div
                     className="
                        rounded-3xl
                        border
                        border-[var(--border-subtle)]
                        bg-white
                        p-5
                     "
                  >
                     <div className="mb-4 flex items-center gap-3">
                        <BookOpen size={18} />

                        <p className="font-medium">Structure</p>
                     </div>

                     <div className="space-y-3">
                        {["Question: What are you answering?", "Source: Where did it come from?", "Evidence: What does it show?", "Insight: What does it mean?"].map((item) => (
                           <div
                              key={item}
                              className="
                                 rounded-2xl
                                 bg-[var(--color-bg)]
                                 p-4
                                 text-sm
                                 leading-relaxed
                                 text-[var(--color-text-secondary)]
                              "
                           >
                              {item}
                           </div>
                        ))}
                     </div>
                  </div>

                  <div
                     className="
                        rounded-3xl
                        border
                        border-[var(--border-subtle)]
                        bg-white
                        p-5
                     "
                  >
                     <div className="mb-4 flex items-center gap-3">
                        <Brain size={18} />

                        <p className="font-medium">Profile</p>
                     </div>

                     <p className="font-medium">{profile.profile}</p>

                     <p className="mt-2 leading-relaxed text-[var(--color-text-secondary)]">{profile.recommendation}</p>
                  </div>
               </div>
            </aside>
         </div>
      </motion.section>
   );
}
