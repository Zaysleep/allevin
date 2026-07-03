"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

import { useFocus } from "@/components/FocusContext";

import { getCognitiveLoadState, getMemory } from "@/components/MemoryEngine";

// ========================================
// Environment Types
// ========================================

export type EnvironmentState = "calm" | "standard" | "deep-focus" | "recovery";

export type AdaptationStage = "passive" | "supportive" | "active" | "protective";

// ========================================
// Environment Profile
// MK VI Adaptive Guidance Layer
// ========================================

export interface EnvironmentProfile {
   environment: EnvironmentState;

   stage: AdaptationStage;

   label: string;

   systemTone: string;

   assistantCue: string;

   uiGuidance: string;

   approvalReminder: string;
}

// ========================================
// Context Type
// ========================================

interface EnvironmentContextType {
   currentEnvironment: EnvironmentState;

   adaptationIntensity: number;

   adaptationStage: AdaptationStage;

   adaptiveUI: boolean;

   interventionMessage: string | null;

   environmentProfile: EnvironmentProfile;

   signalSummary: string;

   refreshEnvironment: () => void;
}

// ========================================
// Context
// ========================================

const EnvironmentContext = createContext<EnvironmentContextType | null>(null);

// ========================================
// Helpers
// ========================================

function getAdaptationStageFromIntensity(intensity: number): AdaptationStage {
   if (intensity >= 81) {
      return "protective";
   }

   if (intensity >= 56) {
      return "active";
   }

   if (intensity >= 26) {
      return "supportive";
   }

   return "passive";
}

function clampIntensity(value: number) {
   return Math.min(100, Math.max(0, value));
}

function getEnvironmentProfile({
   environment,
   stage,
}: {
   environment: EnvironmentState;

   stage: AdaptationStage;
}): EnvironmentProfile {
   const approvalReminder = "ALLEVIN will keep guidance review-based and will not make changes without the user choosing the action.";

   if (environment === "deep-focus") {
      return {
         environment,

         stage,

         label: "Deep Focus",

         systemTone: "Focused",

         assistantCue: "I’ll keep guidance minimal and point toward one clear next action.",

         uiGuidance: "Prioritize active work, reduce extra prompts, and keep the workspace steady.",

         approvalReminder,
      };
   }

   if (environment === "recovery") {
      return {
         environment,

         stage,

         label: stage === "protective" ? "Protective Calm" : "Calm Support",

         systemTone: "Calm",

         assistantCue: "We can slow this down. I’ll keep the project grounded and the next step small.",

         uiGuidance: "Simplify choices, reduce visual density, and help the user return to the active project without extra clutter.",

         approvalReminder,
      };
   }

   if (environment === "calm") {
      return {
         environment,

         stage,

         label: "Calm",

         systemTone: "Low Pressure",

         assistantCue: "I’ll keep the workspace quiet and help you move one step at a time.",

         uiGuidance: "Use gentle prompts, fewer choices, and low-pressure project guidance.",

         approvalReminder,
      };
   }

   return {
      environment,

      stage,

      label: stage === "supportive" ? "Supportive Standard" : "Standard",

      systemTone: "Balanced",

      assistantCue: "Workspace ready. I’m watching for useful project signals and ready to guide when needed.",

      uiGuidance: "Maintain the normal layout, keep system feedback subtle, and keep Projects, Canvas, Materials, and Calendar easy to continue.",

      approvalReminder,
   };
}

function readMemorySafely() {
   try {
      const memory = getMemory();

      return Array.isArray(memory) ? memory : [];
   } catch {
      return [];
   }
}

function getMessageText(entry: unknown) {
   if (!entry || typeof entry !== "object") {
      return "";
   }

   const possibleEntry = entry as {
      message?: unknown;
   };

   return typeof possibleEntry.message === "string" ? possibleEntry.message : "";
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
// Provider
// ========================================

export function EnvironmentProvider({ children }: { children: ReactNode }) {
   const { focusMode, setFocusMode } = useFocus();

   const [currentEnvironment, setCurrentEnvironment] = useState<EnvironmentState>("standard");

   const [adaptationIntensity, setAdaptationIntensity] = useState(0);

   const [adaptationStage, setAdaptationStage] = useState<AdaptationStage>("passive");

   const [adaptiveUI, setAdaptiveUI] = useState(false);

   const [interventionMessage, setInterventionMessage] = useState<string | null>(null);

   const [signalSummary, setSignalSummary] = useState("No recent workspace signals yet.");

   const storedCognitionReset = readManualCognitionReset();

   const [cognitionResetActive, setCognitionResetActive] = useState(storedCognitionReset.active);

   useEffect(() => {
      function syncCognitionReset() {
         setCognitionResetActive(readManualCognitionReset().active);
      }

      function handleCognitionReset() {
         setCognitionResetActive(true);

         applyEnvironment({
            environment: "standard",
            intensity: 0,
            message: null,
            summary: "Cognition reset is active. ALLEVIN is staying in Balanced guidance mode.",
         });
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
   // Apply Environment State
   // ========================================

   function applyEnvironment({
      environment,
      intensity,
      message,
      summary,
      forceCalm = false,
   }: {
      environment: EnvironmentState;

      intensity: number;

      message: string | null;

      summary?: string;

      forceCalm?: boolean;
   }) {
      const clamped = clampIntensity(intensity);

      setCurrentEnvironment(environment);

      setAdaptationIntensity(clamped);

      setAdaptationStage(getAdaptationStageFromIntensity(clamped));

      setAdaptiveUI(clamped >= 26);

      setInterventionMessage(message);

      if (summary) {
         setSignalSummary(summary);
      }

      if (forceCalm) {
         setFocusMode("calm");
      }
   }

   // ========================================
   // Message Category Detection
   // ========================================

   function getCategories(message: string) {
      const lower = message.toLowerCase();

      const categories = new Set<string>();

      if (
         lower.includes("focus") ||
         lower.includes("deep") ||
         lower.includes("deep work") ||
         lower.includes("concentration") ||
         lower.includes("coding") ||
         lower.includes("build") ||
         lower.includes("implement") ||
         lower.includes("lock in") ||
         lower.includes("study mode")
      ) {
         categories.add("focus");
      }

      if (lower.includes("stress") || lower.includes("stressed") || lower.includes("burnout") || lower.includes("overwhelmed") || lower.includes("exhausted") || lower.includes("urgent") || lower.includes("too much") || lower.includes("scattered")) {
         categories.add("overload");
      }

      if (lower.includes("calm") || lower.includes("relax") || lower.includes("recovery") || lower.includes("slow down") || lower.includes("low pressure") || lower.includes("quiet")) {
         categories.add("recovery");
      }

      if (lower.includes("research") || lower.includes("study") || lower.includes("analyze") || lower.includes("compare") || lower.includes("investigate")) {
         categories.add("research");
      }

      if (lower.includes("plan") || lower.includes("organize") || lower.includes("roadmap") || lower.includes("schedule") || lower.includes("tasks") || lower.includes("next step")) {
         categories.add("planning");
      }

      if (lower.includes("design") || lower.includes("brainstorm") || lower.includes("ideas") || lower.includes("creative") || lower.includes("concept") || lower.includes("personality")) {
         categories.add("creative");
      }

      return categories;
   }

   function buildSignalSummary(counts: Record<string, number>, activeCategories: string[]) {
      if (!activeCategories.length) {
         return "No strong workspace pattern detected. ALLEVIN is staying in balanced guidance mode.";
      }

      const readable = activeCategories.map((category) => `${category}: ${counts[category] || 0}`).join(" · ");

      return `Recent workspace signals — ${readable}`;
   }

   // ========================================
   // Environment Evaluation
   // ========================================

   function refreshEnvironment() {
      if (cognitionResetActive || readManualCognitionReset().active) {
         applyEnvironment({
            environment: "standard",
            intensity: 0,
            message: null,
            summary: "Cognition reset is active. ALLEVIN is staying in Balanced guidance mode.",
         });

         return;
      }

      const load = getCognitiveLoadState();

      const memory = readMemorySafely();

      const recent = memory.slice(-8);

      const counts: Record<string, number> = {
         focus: 0,
         overload: 0,
         recovery: 0,
         research: 0,
         planning: 0,
         creative: 0,
      };

      recent.forEach((entry) => {
         const categories = getCategories(getMessageText(entry));

         categories.forEach((category) => {
            counts[category] = (counts[category] || 0) + 1;
         });
      });

      const totalSignals = Object.values(counts).reduce((sum, count) => sum + count, 0);

      const dominantCount = Math.max(...Object.values(counts));

      const activeCategories = Object.entries(counts)
         .filter(([, count]) => count > 0)
         .map(([category]) => category);

      const focusDominant = counts.focus >= 2 && counts.overload === 0 && counts.recovery <= 1;

      const recoveryDominant = counts.overload >= 2 || counts.recovery >= 3;

      const trueContextSwitching = activeCategories.length >= 3 && dominantCount < totalSignals - 1 && !focusDominant && !recoveryDominant;

      const nextSignalSummary = buildSignalSummary(counts, activeCategories);

      // ========================================
      // Intensity Calculation
      // ========================================

      let calculatedIntensity = Number(load?.intensity || 0);

      calculatedIntensity += counts.focus * 6;

      calculatedIntensity += counts.overload * 10;

      calculatedIntensity += counts.recovery * 8;

      calculatedIntensity += counts.planning * 5;

      calculatedIntensity += counts.creative * 5;

      calculatedIntensity += counts.research * 5;

      if (trueContextSwitching) {
         calculatedIntensity += 22;
      }

      calculatedIntensity = clampIntensity(calculatedIntensity);

      // ========================================
      // Active Deep Focus
      // Priority comes BEFORE recovery when
      // focus signals dominate and no real strain exists.
      // ========================================

      if (focusDominant || focusMode === "deep") {
         applyEnvironment({
            environment: "deep-focus",

            intensity: Math.max(Math.min(calculatedIntensity, 78), 62),

            message: "Deep Focus is active. ALLEVIN will keep guidance minimal and protect attention around the current work.",

            summary: nextSignalSummary,

            forceCalm: false,
         });

         return;
      }

      // ========================================
      // Protective Calm
      // True overload / fragmentation only.
      // ========================================

      if (load?.state === "Critical" || calculatedIntensity >= 81 || counts.overload >= 3 || trueContextSwitching) {
         applyEnvironment({
            environment: "recovery",

            intensity: Math.max(calculatedIntensity, 82),

            message: "Protective Calm is active. ALLEVIN is reducing pressure, simplifying choices, and keeping the next project move small.",

            summary: nextSignalSummary,

            forceCalm: true,
         });

         return;
      }

      // ========================================
      // Active Calm Support
      // ========================================

      if (load?.state === "Elevated" || recoveryDominant || counts.overload >= 2) {
         applyEnvironment({
            environment: "recovery",

            intensity: Math.max(calculatedIntensity, 62),

            message: "Calm support is active. ALLEVIN will lower pressure and help you continue the project without rebuilding context.",

            summary: nextSignalSummary,
         });

         return;
      }

      // ========================================
      // Calm
      // ========================================

      if (focusMode === "calm" || counts.recovery >= 1) {
         applyEnvironment({
            environment: "calm",

            intensity: Math.max(calculatedIntensity, 40),

            message: "Calm guidance is enabled. ALLEVIN will keep the workspace quiet and guide one project step at a time.",

            summary: nextSignalSummary,
         });

         return;
      }

      // ========================================
      // Supportive Adaptation
      // ========================================

      if (calculatedIntensity >= 26 || counts.focus === 1 || counts.planning >= 1 || counts.creative >= 1 || counts.research >= 1) {
         applyEnvironment({
            environment: "standard",

            intensity: Math.max(calculatedIntensity, 34),

            message: "Supportive guidance is active. ALLEVIN is watching project signals and keeping adjustments subtle.",

            summary: nextSignalSummary,
         });

         return;
      }

      // ========================================
      // Passive Standard
      // ========================================

      applyEnvironment({
         environment: "standard",

         intensity: 0,

         message: null,

         summary: nextSignalSummary,
      });
   }

   // ========================================
   // Auto Refresh On Focus Change
   // ========================================

   useEffect(() => {
      refreshEnvironment();
   }, [focusMode, cognitionResetActive]);

   // ========================================
   // Live Environment Polling
   // ========================================

   useEffect(() => {
      const interval = setInterval(() => {
         refreshEnvironment();
      }, 1000);

      return () => clearInterval(interval);
   }, [focusMode, cognitionResetActive]);

   // ========================================
   // Environment Profile
   // ========================================

   const environmentProfile = useMemo(
      () =>
         getEnvironmentProfile({
            environment: currentEnvironment,

            stage: adaptationStage,
         }),
      [currentEnvironment, adaptationStage],
   );

   // ========================================
   // Context Value
   // ========================================

   const value = useMemo(
      () => ({
         currentEnvironment,

         adaptationIntensity,

         adaptationStage,

         adaptiveUI,

         interventionMessage,

         environmentProfile,

         signalSummary,

         refreshEnvironment,
      }),
      [currentEnvironment, adaptationIntensity, adaptationStage, adaptiveUI, interventionMessage, environmentProfile, signalSummary],
   );

   return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

// ========================================
// Hook
// ========================================

export function useEnvironment() {
   const context = useContext(EnvironmentContext);

   if (!context) {
      throw new Error("useEnvironment must be used inside EnvironmentProvider");
   }

   return context;
}
