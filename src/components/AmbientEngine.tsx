// ========================================
// Ambient Engine
// Purpose:
// Passive ambient intelligence layer
// Surfaces contextual behavioral insights
// ========================================

"use client";

import { useEffect, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { Sparkles } from "lucide-react";

import { getMemory } from "@/components/MemoryEngine";

// ========================================
// Suggestion Type
// ========================================

interface Suggestion {
   id: number;

   message: string;
}

// ========================================
// Ambient Engine Component
// ========================================

export default function AmbientEngine() {
   // ========================================
   // Suggestion State
   // ========================================

   const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

   // ========================================
   // Analyze Memory Patterns
   // ========================================

   useEffect(() => {
      const memory = getMemory();

      // ========================================
      // Deep Focus Detection
      // ========================================

      const deepSessions = memory.filter((item: any) => item.focusMode === "deep").length;

      // ========================================
      // Suggestion Logic
      // ========================================

      if (deepSessions >= 5) {
         setSuggestion({
            id: 1,

            message: "Frequent Deep Focus sessions detected. Consider enabling a simplified workspace layout.",
         });
      } else if (memory.length >= 3) {
         setSuggestion({
            id: 2,

            message: "Allevin is beginning to understand your interaction patterns.",
         });
      }
   }, []);

   // ========================================
   // Auto Hide Notification
   // ========================================

   useEffect(() => {
      if (!suggestion) {
         return;
      }

      const timer = setTimeout(() => {
         setSuggestion(null);
      }, 5000);

      return () => clearTimeout(timer);
   }, [suggestion]);

   return (
      <AnimatePresence>
         {suggestion && (
            <motion.div
               // ========================================
               // Entrance Animation
               // ========================================

               initial={{
                  opacity: 0,
                  y: -10,
                  scale: 0.98,
               }}
               animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
               }}
               exit={{
                  opacity: 0,
                  y: -10,
                  scale: 0.98,
               }}
               transition={{
                  duration: 0.25,
               }}
               // ========================================
               // Updated Positioning
               // Quiet top-right ambient placement
               // ========================================

               className="
                  fixed
                  top-6
                  right-6
                  z-50
                  w-full
                  max-w-sm
               "
            >
               {/* ========================================
                   Ambient Suggestion Card
               ======================================== */}

               <div
                  className="
                     rounded-2xl
                     border
                     border-[var(--border-subtle)]
                     bg-[rgba(255,255,255,0.88)]
                     p-5
                     shadow-[var(--shadow-soft)]
                     backdrop-blur-xl
                  "
               >
                  <div className="flex items-start gap-3">
                     {/* ========================================
                         Icon
                     ======================================== */}

                     <div
                        className="
                           mt-0.5
                           flex
                           h-9
                           w-9
                           items-center
                           justify-center
                           rounded-xl
                           bg-[var(--color-primary)]
                           text-[var(--color-cream)]
                        "
                     >
                        <Sparkles size={18} />
                     </div>

                     {/* ========================================
                         Content
                     ======================================== */}

                     <div className="flex-1">
                        <p
                           className="
                              mb-1
                              text-sm
                              font-semibold
                              text-[var(--color-text-primary)]
                           "
                        >
                           Ambient Intelligence
                        </p>

                        <p
                           className="
                              leading-relaxed
                              text-[var(--color-text-secondary)]
                           "
                        >
                           {suggestion.message}
                        </p>
                     </div>
                  </div>
               </div>
            </motion.div>
         )}
      </AnimatePresence>
   );
}
