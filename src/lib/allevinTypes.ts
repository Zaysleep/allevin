// ========================================
// ALLEVIN MK VI Shared Types
// Purpose: central type definitions for ALLEVIN's
// internal project workspace: Projects, Canvas,
// Project Materials, Calendar, Cognition, and AIDock.
//
// Note:
// A few legacy values remain for local-storage compatibility
// so older saved MK V/MK VI project records do not break.
// User-facing language should stay focused on Projects,
// Canvas, Materials, and Calendar.
// ========================================

export type AllevinSource =
   | "manual"
   | "canvas"
   | "task"
   | "board" // Legacy compatibility: older saved project-progress records.
   | "thread-recovery" // Legacy compatibility: older saved recovery records.
   | "calendar"
   | "integration" // Legacy compatibility: older internal project-save records.
   | "projects"
   | "materials"
   | "aidock"
   | "system"
   | "research"
   | "notes";

export type AllevinDestination =
   | "canvas"
   | "task"
   | "board" // Legacy compatibility: route to Projects in user-facing logic.
   | "thread-recovery" // Legacy compatibility: route to Projects in user-facing logic.
   | "calendar"
   | "notes"
   | "integrations" // Legacy compatibility: current user-facing label is Projects.
   | "projects"
   | "materials"
   | "cognition"
   | "system";

export type AllevinProjectStage = "idea" | "drafting" | "tasking" | "tracking" | "reviewing" | "preserved" | "material" | "completed" | "paused" | "unknown";

export type AllevinProjectStatus = "active" | "ready" | "paused" | "completed" | "archived" | "deleted" | "unknown";

export type AllevinPriority = "low" | "medium" | "high";

// Legacy compatibility only. Board UI was removed in MK VI, but older stored
// records may still contain lane values.
export type AllevinBoardLane = "backlog" | "active" | "review" | "complete";

export type AllevinWorkflowActionType = "send-to-canvas" | "send-to-task" | "send-to-calendar" | "save-to-projects" | "save-material" | "custom";

export type AllevinCalendarEventSource = "local" | "demo" | "aidock-direct-schedule";

export type AllevinCalendarRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

export type AllevinCalendarEventStatus = "upcoming" | "active" | "past";

export const ALLEVIN_SOURCES: AllevinSource[] = ["manual", "canvas", "task", "board", "thread-recovery", "calendar", "integration", "projects", "materials", "aidock", "system", "research", "notes"];

export const ALLEVIN_DESTINATIONS: AllevinDestination[] = ["canvas", "task", "board", "thread-recovery", "calendar", "notes", "integrations", "projects", "materials", "cognition", "system"];

export const ALLEVIN_PROJECT_STAGES: AllevinProjectStage[] = ["idea", "drafting", "tasking", "tracking", "reviewing", "preserved", "material", "completed", "paused", "unknown"];

export const ALLEVIN_PROJECT_STATUSES: AllevinProjectStatus[] = ["active", "ready", "paused", "completed", "archived", "deleted", "unknown"];

export const ALLEVIN_PRIORITIES: AllevinPriority[] = ["low", "medium", "high"];

export const ALLEVIN_BOARD_LANES: AllevinBoardLane[] = ["backlog", "active", "review", "complete"];

export const ALLEVIN_CALENDAR_EVENT_SOURCES: AllevinCalendarEventSource[] = ["local", "demo", "aidock-direct-schedule"];

export const ALLEVIN_CALENDAR_REPEATS: AllevinCalendarRepeat[] = ["none", "daily", "weekly", "monthly", "yearly"];

export function isAllevinSource(value?: string): value is AllevinSource {
   return ALLEVIN_SOURCES.includes(value as AllevinSource);
}

export function isAllevinDestination(value?: string): value is AllevinDestination {
   return ALLEVIN_DESTINATIONS.includes(value as AllevinDestination);
}

export function isAllevinProjectStage(value?: string): value is AllevinProjectStage {
   return ALLEVIN_PROJECT_STAGES.includes(value as AllevinProjectStage);
}

export function isAllevinProjectStatus(value?: string): value is AllevinProjectStatus {
   return ALLEVIN_PROJECT_STATUSES.includes(value as AllevinProjectStatus);
}

export function isAllevinPriority(value?: string): value is AllevinPriority {
   return ALLEVIN_PRIORITIES.includes(value as AllevinPriority);
}

export function isAllevinBoardLane(value?: string): value is AllevinBoardLane {
   return ALLEVIN_BOARD_LANES.includes(value as AllevinBoardLane);
}

export function isAllevinCalendarEventSource(value?: string): value is AllevinCalendarEventSource {
   return ALLEVIN_CALENDAR_EVENT_SOURCES.includes(value as AllevinCalendarEventSource);
}

export function isAllevinCalendarRepeat(value?: string): value is AllevinCalendarRepeat {
   return ALLEVIN_CALENDAR_REPEATS.includes(value as AllevinCalendarRepeat);
}

export interface AllevinMemoryMeta {
   source?: AllevinSource;
   destination?: AllevinDestination;
   workflowId?: string;
   originBoardItemId?: string;
   projectKey?: string;
   createdAt?: number;
   updatedAt?: number;
}

export interface AllevinProjectEvent {
   id: string;
   type: "created" | "updated" | "moved" | "approved" | "canceled" | "recovered" | "paused" | "deleted" | "note" | "calendar" | "material" | "system";
   title: string;
   summary: string;
   source: AllevinSource;
   destination?: AllevinDestination;
   workflowId?: string;
   originBoardItemId?: string;
   createdAt: number;
}

export interface AllevinProject {
   id: string;
   workflowId: string;
   projectKey: string;
   title: string;
   cleanTitle: string;
   body: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   latestSummary?: string;
   stage: AllevinProjectStage;
   status: AllevinProjectStatus;
   priority: AllevinPriority;
   lastKnownLocation: AllevinDestination;
   suggestedDestination: AllevinDestination;
   signalCount: number;
   confidence: number;
   latestMovement: string;
   recommendedNextAction: string;
   originBoardItemId?: string;
   createdAt: number;
   updatedAt: number;
   history: AllevinProjectEvent[];
}

export interface AllevinThread {
   workflowId: string;
   projectKey: string;
   title: string;
   cleanSourceContent: string;
   workingSummary: string;
   currentStage: AllevinProjectStage;
   status: AllevinProjectStatus;
   lastKnownLocation: AllevinDestination;
   signalCount: number;
   confidence: number;
   recommendedNextAction: string;
   suggestedDestination: AllevinDestination;
   latestMovement: string;
   updatedAt: number;
}

export interface AllevinTask {
   id: string;
   title: string;
   description: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   workflowId?: string;
   originBoardItemId?: string;
   source: AllevinSource;
   priority: AllevinPriority;
   completed: boolean;
   createdAt: number;
   completedAt?: number;
}

// Legacy compatibility only. The user-facing Board was removed in MK VI.
export interface AllevinBoardItem {
   id: string;
   workflowId: string;
   title: string;
   description: string;
   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   lane: AllevinBoardLane;
   priority: AllevinPriority;
   originBoardItemId?: string;
   createdAt: number;
   updatedAt: number;
}

export interface AllevinCalendarEvent {
   id: string;
   title: string;
   startTime: number;
   endTime: number;
   location?: string;
   description?: string;
   source: AllevinCalendarEventSource;
   status?: AllevinCalendarEventStatus;
   createdAt: number;

   sourceTitle?: string;
   sourceContent?: string;
   workingSummary?: string;
   workflowId?: string;
   originProjectsItemId?: string;
   originBoardItemId?: string;
   priority?: AllevinPriority;
   projectStage?: AllevinProjectStage | string;
   latestMovement?: string;
   recommendedNextAction?: string;

   allDay?: boolean;
   repeat?: AllevinCalendarRepeat;
   repeatSeriesId?: string;
   repeatIndex?: number;
   originalStartTime?: number;
}

export interface AllevinCalendarNote {
   id: string;
   eventId: string;
   eventTitle: string;
   note: string;
   workflowId?: string;
   createdAt: number;
   updatedAt: number;
}

export interface AllevinWorkflowAction {
   id: string;
   actionType: AllevinWorkflowActionType;
   source: AllevinSource;
   destination: AllevinDestination;
   title: string;
   body: string;
   reason?: string;
   workflowId?: string;
   originBoardItemId?: string;
   priority?: AllevinPriority;
   status: "pending" | "editing" | "approved" | "canceled";
   createdAt: number;
   updatedAt?: number;
}

export interface AllevinProjectMaterialObject {
   id: string;
   title: string;
   body: string;
   materialType: "project-summary" | "meeting-notes" | "task-plan" | "research-brief" | "ux-case-study" | "accessibility-report" | "school-draft" | "general";
   workflowId?: string;
   sourceTitle?: string;
   sourceContent?: string;
   createdAt: number;
   updatedAt?: number;
}
