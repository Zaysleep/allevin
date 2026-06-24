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

   assistantMode: "standby" | "focused" | "recovery" | "approval" | "calendar" | "guidance";
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

   if (lower.includes("approve") || lower.includes("approval") || lower.includes("review action") || lower.includes("workflow control")) {
      return "awaiting-approval";
   }

   if (lower.includes("recover") || lower.includes("resume") || lower.includes("where i left off") || lower.includes("continue")) {
      return "recovery-available";
   }

   if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("meeting") || lower.includes("event")) {
      return "schedule-context-active";
   }

   if (lower.includes("export") || lower.includes("docs") || lower.includes("google doc") || lower.includes("integration")) {
      return "integration-ready";
   }

   if (lower.includes("focus") || lower.includes("deep work") || lower.includes("canvas") || lower.includes("task") || lower.includes("board")) {
      return "focused-work-active";
   }

   return "system-observing";
}

function getAssistantModeFromInput(input: string): AIContextType["assistantMode"] {
   const lower = input.toLowerCase();

   if (lower.includes("approve") || lower.includes("approval") || lower.includes("workflow control")) {
      return "approval";
   }

   if (lower.includes("recover") || lower.includes("resume") || lower.includes("where i left off") || lower.includes("continue")) {
      return "recovery";
   }

   if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("meeting") || lower.includes("event")) {
      return "calendar";
   }

   if (lower.includes("focus") || lower.includes("deep work") || lower.includes("productivity") || lower.includes("canvas")) {
      return "focused";
   }

   return "guidance";
}

function getInitialAssistantMessage() {
   return `${getGreeting()}, Isaiah. ALLEVIN is online. I can help you start work, recover context, prepare next actions, and keep everything review-based.`;
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

   const [assistantStatus, setAssistantStatus] = useState("Observing workspace");

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

Current system state:
${sessionState.systemStatusLabel}

Workspace:
${activeView}

I can help you start in Canvas, recover a previous thread, review actions, or prepare the next step.

${sessionState.approvalReminder}
         `.trim();
      }

      // ========================================
      // Recommendation / Next Step
      // ========================================

      if (lower.includes("recommend") || lower.includes("next step") || lower.includes("what should i do") || lower.includes("best move")) {
         return `
I can help with the next move.

Current read:
${sessionState.systemStatusLabel}

Recommended path:
Start in Canvas if the work still needs shaping.
Use Tasks if the next action is clear.
Use Board if the work is ready to track.
Use Recovery if you are continuing from a previous thread.

I will only prepare actions for review. Prepared actions stay in Workflow Control until reviewed.
         `.trim();
      }

      // ========================================
      // Deep Focus
      // ========================================

      if (lower.includes("focus") || lower.includes("deep work") || lower.includes("productivity")) {
         return `
Deep focus mode noted.

I will keep the workspace calm, reduce extra guidance, and point you toward one clear action at a time.

Best next move:
Open Canvas for active work, or ask ALLEVIN to recommend the next step.

Routing and creation stay inside Workflow Control until reviewed.
         `.trim();
      }

      // ========================================
      // Calm / Recovery
      // ========================================

      if (lower.includes("calm") || lower.includes("relax") || lower.includes("mindful") || lower.includes("overwhelmed") || lower.includes("stress")) {
         return `
Recovery tone activated.

We can slow this down.

Choose one small move:
Open Recovery, resume the latest thread, or start fresh in Canvas.

I will keep the system quiet and review-based.
         `.trim();
      }

      // ========================================
      // Approvals
      // ========================================

      if (lower.includes("approve") || lower.includes("approval") || lower.includes("workflow control") || lower.includes("review action")) {
         return `
Workflow Control is the review layer.

Use it to review prepared actions before ALLEVIN moves work into Tasks, Board, Calendar, or Integrations.

System rule:
Prepared actions will appear in Workflow Control for review.
         `.trim();
      }

      // ========================================
      // Calendar
      // ========================================

      if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("meeting") || lower.includes("event")) {
         return `
Calendar context is available.

Use Calendar to create events, capture schedule notes, and prepare follow-up work.

Recommended flow:
Calendar note → Workflow Control → Canvas or Task Vault.

Calendar actions stay in Workflow Control until reviewed.
         `.trim();
      }

      // ========================================
      // Insights
      // ========================================

      if (lower.includes("insights") || lower.includes("analytics") || lower.includes("signals") || lower.includes("history")) {
         return `
System insights are available in the Advanced System Core.

That area holds signals, notes, memory, workflow state, and orchestration details.

Use it when you want to inspect how ALLEVIN is reading the workspace.
         `.trim();
      }

      // ========================================
      // Canvas / Tasks / Board
      // ========================================

      if (lower.includes("canvas")) {
         return "Canvas is the best place to shape or continue work before turning it into action.";
      }

      if (lower.includes("task") || lower.includes("todo") || lower.includes("action item")) {
         return "Task Vault is best when the next action is clear and ready to execute.";
      }

      if (lower.includes("board") || lower.includes("track") || lower.includes("project")) {
         return "Project Board is the tracking layer. Use it when work is ready to move through Backlog, In Progress, Review, and Complete.";
      }

      // ========================================
      // Default
      // ========================================

      return `
I am observing the workspace.

Current state:
${sessionState.systemStatusLabel}

You can ask me to recommend the next move, open Canvas, recover a thread, review actions, or prepare work for Calendar or Integrations.

${sessionState.approvalReminder}
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
      // Update MK II Internal State
      // ========================================

      const nextSystemStatus = getSystemStatusFromInput(cleanInput);

      const nextAssistantMode = getAssistantModeFromInput(cleanInput);

      setSystemStatus(nextSystemStatus);

      registerWorkspaceActivity(nextSystemStatus);

      setAssistantMode(nextAssistantMode);

      setAssistantStatus(
         nextSystemStatus === "awaiting-approval"
            ? "Review ready"
            : nextSystemStatus === "recovery-available"
              ? "Recovery available"
              : nextSystemStatus === "schedule-context-active"
                ? "Schedule context active"
                : nextSystemStatus === "integration-ready"
                  ? "Integration ready"
                  : nextSystemStatus === "focused-work-active"
                    ? "Focused work active"
                    : "Observing workspace",
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

      setAssistantStatus("Observing workspace");

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
