// ========================================
// Focus Switcher
// Purpose:
// Adaptive cognitive intensity controls
// ========================================

"use client";

import { useEffect, useState } from "react";

import { useFocus, FocusMode } from "@/components/FocusContext";

// ========================================
// Focus Modes
// ========================================

const modes: FocusMode[] = ["calm", "standard", "deep"];

// ========================================
// Manual Cognition Reset Helper
// ========================================

function isManualCognitionResetActive() {
   if (typeof window === "undefined") {
      return false;
   }

   try {
      const stored = localStorage.getItem("allevin-cognition-manual-reset");

      if (!stored) {
         return false;
      }

      const parsed = JSON.parse(stored);

      return parsed?.active === true;
   } catch {
      return false;
   }
}

function clearManualCognitionReset() {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.removeItem("allevin-cognition-manual-reset");

   window.dispatchEvent(new Event("allevin-cognition-update"));
}

// ========================================
// Component
// ========================================

export default function FocusSwitcher() {
   const { focusMode, setFocusMode } = useFocus();

   const [manualResetActive, setManualResetActive] = useState(false);

   useEffect(() => {
      function syncManualReset() {
         setManualResetActive(isManualCognitionResetActive());
      }

      window.addEventListener("allevin-cognition-update", syncManualReset);

      window.addEventListener("allevin-cognition-reset", syncManualReset);

      syncManualReset();

      return () => {
         window.removeEventListener("allevin-cognition-update", syncManualReset);

         window.removeEventListener("allevin-cognition-reset", syncManualReset);
      };
   }, []);

   function handleModeSelect(mode: FocusMode) {
      if (manualResetActive) {
         clearManualCognitionReset();

         setManualResetActive(false);
      }

      setFocusMode(mode);
   }

   return (
      <div className="flex flex-col gap-3">
         <div
            className="
               flex
               items-center
               gap-3
            "
         >
            {modes.map((mode) => (
               <button
                  key={mode}
                  type="button"
                  onClick={() => handleModeSelect(mode)}
                  className={`
                     rounded-xl
                     px-4
                     py-2
                     text-sm
                     font-medium
                     capitalize
                     transition-all

                     ${
                        focusMode === mode
                           ? `
                              bg-[var(--color-primary)]
                              text-[var(--color-cream)]
                              shadow-[var(--shadow-soft)]
                           `
                           : `
                              border
                              border-[var(--border-subtle)]
                              bg-white
                              text-[var(--color-text-secondary)]
                           `
                     }
                  `}
               >
                  {mode}
               </button>
            ))}
         </div>

         {manualResetActive ? <p className="text-xs leading-5 text-[var(--color-text-secondary)]">Cognition reset is active, so ALLEVIN is holding Balanced mode. Choosing a focus mode here will release the reset and apply your selection.</p> : null}
      </div>
   );
}
