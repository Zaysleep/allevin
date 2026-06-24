"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

import { getMemory } from "@/components/MemoryEngine";

// ========================================
// Focus Modes
// ========================================

export type FocusMode = "calm" | "standard" | "deep";

// ========================================
// Focus Profile
// MK II Finale Personality Layer
// ========================================

export interface FocusProfile {
   mode: FocusMode;

   label: string;

   systemTone: string;

   guidanceStyle: string;

   description: string;

   assistantCue: string;
}

// ========================================
// Context Type
// ========================================

interface FocusContextType {
   focusMode: FocusMode;

   setFocusMode: (mode: FocusMode) => void;

   inferFocusMode: (input: string) => FocusMode;

   focusProfile: FocusProfile;

   getFocusProfile: (mode?: FocusMode) => FocusProfile;
}

// ========================================
// Helpers
// ========================================

function getFocusProfile(mode: FocusMode = "standard"): FocusProfile {
   switch (mode) {
      case "deep":
         return {
            mode: "deep",

            label: "Deep Focus",

            systemTone: "Focused",

            guidanceStyle: "Minimal guidance. One clear next action at a time.",

            description: "ALLEVIN reduces extra prompts and keeps attention on the current work.",

            assistantCue: "I’ll keep this focused. One move at a time.",
         };

      case "calm":
         return {
            mode: "calm",

            label: "Calm Recovery",

            systemTone: "Calm",

            guidanceStyle: "Gentle guidance. Lower pressure and simplified choices.",

            description: "ALLEVIN softens the workspace and helps you resume without overload.",

            assistantCue: "We can slow this down. Choose one small next step.",
         };

      case "standard":
      default:
         return {
            mode: "standard",

            label: "Standard",

            systemTone: "Balanced",

            guidanceStyle: "Balanced guidance. Helpful, clear, and review-based.",

            description: "ALLEVIN keeps the workspace steady and easy to continue.",

            assistantCue: "Workspace ready. I can help recommend the next move.",
         };
   }
}

function readMemorySafely() {
   try {
      const memory = getMemory();

      return Array.isArray(memory) ? memory : [];
   } catch {
      return [];
   }
}

function normalizeInput(input: string) {
   return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function readManualCognitionReset() {
   if (typeof window === "undefined") {
      return {
         active: false,
         resetAt: 0,
      };
   }

   try {
      const stored = localStorage.getItem("allevin-cognition-manual-reset");

      if (!stored) {
         return {
            active: false,
            resetAt: 0,
         };
      }

      const parsed = JSON.parse(stored);

      return {
         active: parsed?.active === true,
         resetAt: typeof parsed?.resetAt === "number" ? parsed.resetAt : 0,
      };
   } catch {
      return {
         active: false,
         resetAt: 0,
      };
   }
}

// ========================================
// Context
// ========================================

const FocusContext = createContext<FocusContextType>({
   focusMode: "standard",

   setFocusMode: () => {},

   inferFocusMode: () => "standard",

   focusProfile: getFocusProfile("standard"),

   getFocusProfile,
});

// ========================================
// Hook
// ========================================

export function useFocus() {
   return useContext(FocusContext);
}

// ========================================
// Provider
// ========================================

export function FocusProvider({ children }: { children: ReactNode }) {
   // ========================================
   // State
   // ========================================

   const [cognitionResetActive, setCognitionResetActive] = useState(readManualCognitionReset().active);

   const [focusMode, setFocusModeState] = useState<FocusMode>(readManualCognitionReset().active ? "standard" : "standard");

   // ========================================
   // Safe Focus Setter
   // ========================================

   function setFocusMode(mode: FocusMode) {
      if (readManualCognitionReset().active || cognitionResetActive) {
         setFocusModeState("standard");

         return;
      }

      setFocusModeState(mode);
   }

   // ========================================
   // Cognition Reset Synchronization
   // ========================================

   useEffect(() => {
      function syncCognitionReset() {
         const reset = readManualCognitionReset();

         setCognitionResetActive(reset.active);

         if (reset.active) {
            setFocusModeState("standard");
         }
      }

      function handleCognitionReset() {
         setCognitionResetActive(true);

         setFocusModeState("standard");
      }

      window.addEventListener("allevin-cognition-update", syncCognitionReset);

      window.addEventListener("allevin-cognition-reset", handleCognitionReset);

      syncCognitionReset();

      return () => {
         window.removeEventListener("allevin-cognition-update", syncCognitionReset);

         window.removeEventListener("allevin-cognition-reset", handleCognitionReset);
      };
   }, []);

   // ========================================
   // Restore Cognitive State
   // ========================================

   useEffect(() => {
      if (readManualCognitionReset().active || cognitionResetActive) {
         setFocusModeState("standard");

         return;
      }

      const memory = readMemorySafely();

      if (!memory.length) {
         setFocusModeState("standard");

         return;
      }

      const deepCount = memory.filter((item: any) => item?.focusMode === "deep").length;

      const calmCount = memory.filter((item: any) => item?.focusMode === "calm").length;

      // ========================================
      // Infer Dominant State
      // ========================================

      if (deepCount > calmCount) {
         setFocusModeState("deep");

         return;
      }

      if (calmCount > deepCount) {
         setFocusModeState("calm");

         return;
      }

      setFocusModeState("standard");
   }, [cognitionResetActive]);

   // ========================================
   // Intelligent Inference
   // ========================================

   function inferFocusMode(input: string): FocusMode {
      if (readManualCognitionReset().active || cognitionResetActive) {
         setFocusModeState("standard");

         return "standard";
      }

      const lower = normalizeInput(input);

      // ========================================
      // Calm / Recovery
      // ========================================

      const calmSignals = ["calm", "relax", "slow down", "mindful", "overwhelmed", "stress", "stressed", "burnout", "too much", "recovery", "lower pressure", "quiet"];

      if (calmSignals.some((signal) => lower.includes(signal))) {
         setFocusModeState("calm");

         return "calm";
      }

      // ========================================
      // Deep Focus
      // ========================================

      const deepSignals = ["focus", "deep work", "concentration", "productivity", "minimal distractions", "lock in", "work mode", "study mode", "heads down", "priority"];

      if (deepSignals.some((signal) => lower.includes(signal))) {
         setFocusModeState("deep");

         return "deep";
      }

      // ========================================
      // Standard
      // ========================================

      setFocusModeState("standard");

      return "standard";
   }

   // ========================================
   // Current Focus Profile
   // ========================================

   const safeFocusMode: FocusMode = cognitionResetActive ? "standard" : focusMode;

   const focusProfile = useMemo(() => getFocusProfile(safeFocusMode), [safeFocusMode]);

   // ========================================
   // Memoized Context
   // ========================================

   const value = useMemo(
      () => ({
         focusMode: safeFocusMode,

         setFocusMode,

         inferFocusMode,

         focusProfile,

         getFocusProfile,
      }),
      [safeFocusMode, focusProfile, cognitionResetActive],
   );

   return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}
