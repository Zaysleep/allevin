"use client";

import { createContext, useContext, useMemo, useState, ReactNode } from "react";

import { useFocus } from "@/components/FocusContext";

import { useWorkspace, type WorkspaceSystemStatus } from "@/components/WorkspaceContext";

import { saveMemory } from "@/components/MemoryEngine";

// ========================================
// Message Type
// ========================================

interface Message {
   role: "user" | "assistant";

   content: string;
}

// ========================================
// Context Type
// ========================================

interface AIContextType {
   messages: Message[];

   sendMessage: (input: string) => void;

   clearMessages: () => void;

   assistantStatus: string;

   assistantMode: "standby" | "focused" | "recovery" | "calendar" | "projects" | "materials" | "guidance";
}

// ========================================
// Context
// ========================================

const AIContext = createContext<AIContextType | null>(null);

// ========================================
// Helpers
// ========================================

function getGreeting() {
   const hour = new Date().getHours();

   if (hour < 12) {
      return "Good morning";
   }

   if (hour < 18) {
      return "Good afternoon";
   }

   return "Good evening";
}

function getSystemStatusFromInput(input: string): WorkspaceSystemStatus {
   const lower = input.toLowerCase();

   if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("meeting") || lower.includes("event") || lower.includes("deadline")) {
      return "schedule-context-active";
   }

   if (lower.includes("project") || lower.includes("materials") || lower.includes("document") || lower.includes("reference") || lower.includes("feedback") || lower.includes("research")) {
      return "integration-ready";
   }

   if (lower.includes("focus") || lower.includes("deep work") || lower.includes("canvas") || lower.includes("write") || lower.includes("draft") || lower.includes("update")) {
      return "focused-work-active";
   }

   if (lower.includes("recover") || lower.includes("resume") || lower.includes("where i left off") || lower.includes("continue")) {
      return "recovery-available";
   }

   return "system-observing";
}

function getAssistantModeFromInput(input: string): AIContextType["assistantMode"] {
   const lower = input.toLowerCase();

   if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("meeting") || lower.includes("event") || lower.includes("deadline")) {
      return "calendar";
   }

   if (lower.includes("material") || lower.includes("document") || lower.includes("reference") || lower.includes("feedback") || lower.includes("research") || lower.includes("image") || lower.includes("pdf")) {
      return "materials";
   }

   if (lower.includes("project") || lower.includes("home base") || lower.includes("saved work")) {
      return "projects";
   }

   if (lower.includes("recover") || lower.includes("resume") || lower.includes("where i left off") || lower.includes("continue")) {
      return "recovery";
   }

   if (lower.includes("focus") || lower.includes("deep work") || lower.includes("productivity") || lower.includes("canvas") || lower.includes("draft") || lower.includes("write")) {
      return "focused";
   }

   return "guidance";
}

function getInitialAssistantMessage() {
   return `${getGreeting()}, Isaiah. ALLEVIN is ready. I can help you organize a project, continue in Canvas, use project materials as references, or choose the next useful move.`;
}

// ========================================
// Provider
// ========================================

export function AIProvider({ children }: { children: ReactNode }) {
   // ========================================
   // Workspace
   // ========================================

   const { activeView, setSystemStatus, sessionState, registerWorkspaceActivity } = useWorkspace();

   // ========================================
   // Focus
   // ========================================

   const { inferFocusMode } = useFocus();

   // ========================================
   // State
   // ========================================

   const [assistantMode, setAssistantMode] = useState<AIContextType["assistantMode"]>("standby");

   const [assistantStatus, setAssistantStatus] = useState("Guidance ready");

   const [messages, setMessages] = useState<Message[]>([
      {
         role: "assistant",

         content: getInitialAssistantMessage(),
      },
   ]);

   // ========================================
   // Generate Response
   // ========================================

   function generateResponse(input: string) {
      const lower = input.toLowerCase();

      // ========================================
      // Welcome / Identity
      // ========================================

      if (lower.includes("hello") || lower.includes("hi") || lower.includes("welcome") || lower.includes("start")) {
         return `
${getGreeting()}, Isaiah.

ALLEVIN is ready.

Current state:
${sessionState.systemStatusLabel}

Workspace:
${activeView}

Start with Projects when you want the full project home base. Use Canvas when you are ready to write, update, or continue the active project.
         `.trim();
      }

      // ========================================
      // Recommendation / Next Step
      // ========================================

      if (lower.includes("recommend") || lower.includes("next step") || lower.includes("what should i do") || lower.includes("best move")) {
         return `
I can help choose the next useful move.

Current read:
${sessionState.systemStatusLabel}

Best path:
Open Projects to see the project home base. Continue in Canvas when you are ready to write or update the work. Use Project Materials when you need notes, documents, feedback, or references nearby.

Tiny system note: less jumping around, more project staying put.
         `.trim();
      }

      // ========================================
      // Projects
      // ========================================

      if (lower.includes("project") || lower.includes("saved work") || lower.includes("home base")) {
         return `
Projects is the home base for each project.

Use it to keep the project, scheduled work, and materials connected in one place. Canvas is where you actively work on the selected project.
         `.trim();
      }

      // ========================================
      // Materials / References
      // ========================================

      if (lower.includes("material") || lower.includes("document") || lower.includes("reference") || lower.includes("feedback") || lower.includes("research") || lower.includes("image") || lower.includes("pdf")) {
         return `
Project Materials are the reference layer.

Use them for notes, documents, images, research, feedback, or anything you want available while working on a project. They should support the project without cluttering Canvas.
         `.trim();
      }

      // ========================================
      // Canvas
      // ========================================

      if (lower.includes("canvas") || lower.includes("write") || lower.includes("draft") || lower.includes("update")) {
         return `
Canvas is the active work area.

Use it to write, update, or continue the selected project. Keep the main work there, and use the reference panel when you need notes or materials nearby.
         `.trim();
      }

      // ========================================
      // Deep Focus
      // ========================================

      if (lower.includes("focus") || lower.includes("deep work") || lower.includes("productivity")) {
         return `
Focus mode noted.

I will keep guidance shorter and point you toward one useful action at a time.

Best next move:
Open the active project in Canvas and work from one selected reference, not the whole pile. The pile can wait its turn.
         `.trim();
      }

      // ========================================
      // Calm / Recovery
      // ========================================

      if (lower.includes("calm") || lower.includes("relax") || lower.includes("mindful") || lower.includes("overwhelmed") || lower.includes("stress") || lower.includes("recover")) {
         return `
Calm guidance is active.

We can keep this small.

Open Projects, pick one project, and continue only the next useful part in Canvas. Materials can stay nearby as references instead of crowding the workspace.
         `.trim();
      }

      // ========================================
      // Calendar
      // ========================================

      if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("meeting") || lower.includes("event") || lower.includes("deadline")) {
         return `
Calendar is the schedule reference.

Use it to see project blocks, deadlines, and events. Project planning should stay with Projects and Canvas; Calendar just shows when things are happening.
         `.trim();
      }

      // ========================================
      // Cognition
      // ========================================

      if (lower.includes("cognition") || lower.includes("style") || lower.includes("mode") || lower.includes("guidance")) {
         return `
Cognition adjusts how ALLEVIN guides the project.

Use it when you want responses to feel calmer, shorter, more structured, more creative, or more research-focused.
         `.trim();
      }

      // ========================================
      // Tasks / Next Actions
      // ========================================

      if (lower.includes("task") || lower.includes("todo") || lower.includes("action item")) {
         return "Tasks are best for simple next actions. Keep them short, connected to the project, and easy to finish.";
      }

      // ========================================
      // Default
      // ========================================

      return `
I am ready to help with the project.

Current state:
${sessionState.systemStatusLabel}

You can ask me to explain the project, choose the next move, continue in Canvas, reference project materials, or check the schedule.
      `.trim();
   }

   // ========================================
   // Send Message
   // ========================================

   function sendMessage(input: string) {
      if (!input.trim()) {
         return;
      }

      const cleanInput = input.trim();

      // ========================================
      // Infer Focus Mode
      // ========================================

      const focusMode = inferFocusMode(cleanInput);

      // ========================================
      // Update MK VI Internal State
      // ========================================

      const nextSystemStatus = getSystemStatusFromInput(cleanInput);

      const nextAssistantMode = getAssistantModeFromInput(cleanInput);

      setSystemStatus(nextSystemStatus);

      registerWorkspaceActivity(nextSystemStatus);

      setAssistantMode(nextAssistantMode);

      setAssistantStatus(
         nextSystemStatus === "recovery-available"
            ? "Project context available"
            : nextSystemStatus === "schedule-context-active"
              ? "Schedule ready"
              : nextSystemStatus === "integration-ready"
                ? "Projects ready"
                : nextSystemStatus === "focused-work-active"
                  ? "Canvas active"
                  : "Guidance ready",
      );

      // ========================================
      // Save Memory
      // ========================================

      saveMemory({
         id: crypto.randomUUID(),

         message: cleanInput,

         timestamp: Date.now(),

         focusMode,

         workspace: activeView,
      });

      // ========================================
      // User Message
      // ========================================

      const userMessage: Message = {
         role: "user",

         content: cleanInput,
      };

      // ========================================
      // Assistant Response
      // ========================================

      const assistantMessage: Message = {
         role: "assistant",

         content: generateResponse(cleanInput),
      };

      // ========================================
      // Update Messages
      // ========================================

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
   }

   // ========================================
   // Clear Messages
   // ========================================

   function clearMessages() {
      setAssistantMode("standby");

      setAssistantStatus("Guidance ready");

      setSystemStatus("workspace-stable");

      setMessages([
         {
            role: "assistant",

            content: getInitialAssistantMessage(),
         },
      ]);
   }

   // ========================================
   // Context Value
   // ========================================

   const value = useMemo(
      () => ({
         messages,

         sendMessage,

         clearMessages,

         assistantStatus,

         assistantMode,
      }),
      [messages, assistantStatus, assistantMode],
   );

   return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

// ========================================
// Hook
// ========================================

export function useAI() {
   const context = useContext(AIContext);

   if (!context) {
      throw new Error("useAI must be used inside AIProvider");
   }

   return context;
}
