// ========================================
// Workspace Context
// Purpose:
// Global adaptive workspace state management
// MK VI:
// Keeps Projects, Canvas, Calendar, Cognition,
// and ALLEVIN guidance aligned without exposing
// old workflow language to users.
// ========================================

"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

import { getAllevinDisplayName } from "@/lib/allevinUserProfile";

// ========================================
// Allowed Workspace Views
// ========================================

export type WorkspaceView = "home" | "focus" | "workspace" | "insights" | "integrations";

// ========================================
// Internal System State
// ========================================

export type WorkspaceSystemStatus = "workspace-stable" | "focused-work-active" | "awaiting-approval" | "recovery-available" | "schedule-context-active" | "integration-ready" | "system-observing";

export interface WorkspaceSessionState {
   greetingName: string;

   systemStatus: WorkspaceSystemStatus;

   systemStatusLabel: string;

   welcomeMessage: string;

   approvalReminder: string;

   lastActiveAt: number;

   activityCount: number;
}

// ========================================
// Context Type
// ========================================

interface WorkspaceContextType {
   activeView: WorkspaceView;

   setActiveView: (view: WorkspaceView) => void;

   systemStatus: WorkspaceSystemStatus;

   setSystemStatus: (status: WorkspaceSystemStatus) => void;

   sessionState: WorkspaceSessionState;

   registerWorkspaceActivity: (status?: WorkspaceSystemStatus) => void;

   resetWorkspaceSession: () => void;
}

// ========================================
// Context Creation
// ========================================

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// ========================================
// MK VI Build 7 — Deferred Workspace State Updates
// Purpose:
// Some modules can report status while another component is still rendering.
// Deferring shared state updates prevents React cross-component update warnings.
// ========================================

function scheduleWorkspaceStateUpdate(callback: () => void) {
   if (typeof window === "undefined") {
      callback();

      return;
   }

   window.setTimeout(callback, 0);
}

// ========================================
// MK VI Build 7 — Workspace Context Safety
// Purpose:
// This file only owns allowed state values.
// It does not store user-written content, but
// it should still reject unexpected view/status
// values before they enter shared app state.
// ========================================

const WORKSPACE_SAFE_LIMITS = {
   stateValue: 80,
} as const;

function sanitizeWorkspaceStateValue(value?: string) {
   return (value || "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/[^a-z0-9_-]/gi, "")
      .slice(0, WORKSPACE_SAFE_LIMITS.stateValue)
      .trim();
}

function isWorkspaceView(value?: string): value is WorkspaceView {
   const cleanValue = sanitizeWorkspaceStateValue(value);

   return cleanValue === "home" || cleanValue === "focus" || cleanValue === "workspace" || cleanValue === "insights" || cleanValue === "integrations";
}

function isWorkspaceSystemStatus(value?: string): value is WorkspaceSystemStatus {
   const cleanValue = sanitizeWorkspaceStateValue(value);

   return (
      cleanValue === "workspace-stable" ||
      cleanValue === "focused-work-active" ||
      cleanValue === "awaiting-approval" ||
      cleanValue === "recovery-available" ||
      cleanValue === "schedule-context-active" ||
      cleanValue === "integration-ready" ||
      cleanValue === "system-observing"
   );
}

function getSafeWorkspaceView(value?: string): WorkspaceView {
   const cleanValue = sanitizeWorkspaceStateValue(value);

   return isWorkspaceView(cleanValue) ? cleanValue : "home";
}

function getSafeWorkspaceSystemStatus(value?: string): WorkspaceSystemStatus {
   const cleanValue = sanitizeWorkspaceStateValue(value);

   return isWorkspaceSystemStatus(cleanValue) ? cleanValue : "workspace-stable";
}

// ========================================
// Helpers
// ========================================

function getSystemStatusLabel(status: WorkspaceSystemStatus) {
   const safeStatus = getSafeWorkspaceSystemStatus(status);

   switch (safeStatus) {
      case "workspace-stable":
         return "Workspace ready";

      case "focused-work-active":
         return "Canvas active";

      case "awaiting-approval":
         return "Review ready";

      case "recovery-available":
         return "Project context available";

      case "schedule-context-active":
         return "Schedule ready";

      case "integration-ready":
         return "Projects ready";

      case "system-observing":
      default:
         return "Guidance ready";
   }
}

function getWelcomeMessage(status: WorkspaceSystemStatus) {
   const safeStatus = getSafeWorkspaceSystemStatus(status);

   switch (safeStatus) {
      case "awaiting-approval":
         return "I found something that needs review. I will keep it clear before anything changes.";

      case "recovery-available":
         return "Project context is available. You can reopen saved work without rebuilding everything from scratch.";

      case "schedule-context-active":
         return "Calendar is ready. Use it to see scheduled project blocks, deadlines, and events.";

      case "integration-ready":
         return "Projects are ready. Open a project to see its schedule, materials, and next place to continue.";

      case "focused-work-active":
         return "Canvas is active. Keep working from the project, with references nearby when you need them.";

      case "workspace-stable":
         return "Your workspace is ready. Start with Projects, continue in Canvas, or ask ALLEVIN for guidance.";

      case "system-observing":
      default:
         return "Guidance is ready. I will keep the next useful move within reach.";
   }
}

function getStatusFromView(view: WorkspaceView): WorkspaceSystemStatus {
   const safeView = getSafeWorkspaceView(view);

   switch (safeView) {
      case "focus":
      case "workspace":
         return "focused-work-active";

      case "insights":
         return "system-observing";

      case "integrations":
         return "integration-ready";

      case "home":
      default:
         return "workspace-stable";
   }
}

// ========================================
// Provider Component
// ========================================

export function WorkspaceProvider({ children }: { children: ReactNode }) {
   // ========================================
   // Active Workspace State
   // ========================================

   const [activeView, setActiveViewState] = useState<WorkspaceView>("home");

   const [systemStatus, setSystemStatusState] = useState<WorkspaceSystemStatus>("workspace-stable");

   const [lastActiveAt, setLastActiveAt] = useState(Date.now());

   const [activityCount, setActivityCount] = useState(0);

   const [displayName, setDisplayName] = useState("there");

   useEffect(() => {
      function refreshDisplayName() {
         setDisplayName(getAllevinDisplayName("there"));
      }

      refreshDisplayName();

      window.addEventListener("allevin-user-profile-update", refreshDisplayName);
      window.addEventListener("storage", refreshDisplayName);

      return () => {
         window.removeEventListener("allevin-user-profile-update", refreshDisplayName);
         window.removeEventListener("storage", refreshDisplayName);
      };
   }, []);

   function registerWorkspaceActivity(status?: WorkspaceSystemStatus) {
      const safeStatus = status ? getSafeWorkspaceSystemStatus(status) : undefined;

      scheduleWorkspaceStateUpdate(() => {
         setLastActiveAt(Date.now());

         setActivityCount((current) => Math.max(0, current + 1));

         if (safeStatus) {
            setSystemStatusState(safeStatus);
         }
      });
   }

   function setActiveView(view: WorkspaceView) {
      const safeView = getSafeWorkspaceView(view);

      const nextStatus = getStatusFromView(safeView);

      scheduleWorkspaceStateUpdate(() => {
         setActiveViewState(safeView);

         setSystemStatusState(nextStatus);

         setLastActiveAt(Date.now());

         setActivityCount((current) => Math.max(0, current + 1));
      });
   }

   function setSystemStatus(status: WorkspaceSystemStatus) {
      const safeStatus = getSafeWorkspaceSystemStatus(status);

      scheduleWorkspaceStateUpdate(() => {
         setSystemStatusState(safeStatus);

         setLastActiveAt(Date.now());

         setActivityCount((current) => Math.max(0, current + 1));
      });
   }

   function resetWorkspaceSession() {
      scheduleWorkspaceStateUpdate(() => {
         setActiveViewState("home");

         setSystemStatusState("workspace-stable");

         setLastActiveAt(Date.now());

         setActivityCount(0);
      });
   }

   const sessionState = useMemo<WorkspaceSessionState>(
      () => ({
         greetingName: displayName,

         systemStatus: getSafeWorkspaceSystemStatus(systemStatus),

         systemStatusLabel: getSystemStatusLabel(systemStatus),

         welcomeMessage: getWelcomeMessage(systemStatus),

         approvalReminder: "I will keep changes clear before anything important moves.",

         lastActiveAt,

         activityCount,
      }),
      [systemStatus, lastActiveAt, activityCount, displayName],
   );

   return (
      <WorkspaceContext.Provider
         value={{
            activeView,
            setActiveView,
            systemStatus,
            setSystemStatus,
            sessionState,
            registerWorkspaceActivity,
            resetWorkspaceSession,
         }}
      >
         {children}
      </WorkspaceContext.Provider>
   );
}

// ========================================
// Custom Hook
// Cleaner context usage
// ========================================

export function useWorkspace() {
   const context = useContext(WorkspaceContext);

   if (!context) {
      throw new Error("useWorkspace must be used inside WorkspaceProvider");
   }

   return context;
}
