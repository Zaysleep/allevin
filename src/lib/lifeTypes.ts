// ========================================
// ALLEVIN MK XII — Life Types
// Purpose:
// Small authoritative data model for daily life coordination.
// The UI is a view over this state; Kin can propose actions against it,
// but the life store remains the source of truth.
// ========================================

export type LifeItemKind = "task" | "commitment" | "waiting" | "routine" | "note";
export type LifeItemState = "active" | "waiting" | "someday" | "done" | "archived";
export type LifeImportance = "low" | "normal" | "high";
export type LifeContext = "personal" | "work" | "school" | "kin-software" | "home" | "errand" | "car" | "finance" | "health" | "other";
export type LifeRecurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly";
export type LifeTimingPrecision = "exact" | "day" | "window" | "someday" | "none";
export type LifeItemSource = "user" | "kin" | "calendar" | "migration";

export interface LifeItem {
   id: string;
   title: string;
   details: string;
   kind: LifeItemKind;
   state: LifeItemState;
   context: LifeContext;
   importance: LifeImportance;
   recurrence: LifeRecurrence;
   timingPrecision: LifeTimingPrecision;
   dueAt?: number;
   startAt?: number;
   endAt?: number;
   followUpAt?: number;
   deferUntil?: number;
   durationMinutes?: number;
   location?: string;
   allDay: boolean;
   pinToToday: boolean;
   source: LifeItemSource;
   createdAt: number;
   updatedAt: number;
   completedAt?: number;
   lastCompletedAt?: number;
}

export type LifeActivityKind = "created" | "updated" | "completed" | "reopened" | "deferred" | "waiting" | "archived" | "migrated";

export interface LifeActivity {
   id: string;
   itemId: string;
   itemTitle: string;
   kind: LifeActivityKind;
   detail: string;
   at: number;
}

export interface LifePreferences {
   weekStartsOn: 0 | 1;
   defaultContext: LifeContext;
   showCompletedToday: boolean;
}

export interface LifeState {
   version: "MK XII";
   items: LifeItem[];
   activities: LifeActivity[];
   preferences: LifePreferences;
   migratedFromMkXI: boolean;
   updatedAt: number;
}

export interface LifeSnapshotItem {
   id: string;
   title: string;
   kind: LifeItemKind;
   state: LifeItemState;
   context: LifeContext;
   importance: LifeImportance;
   dueAt?: number;
   startAt?: number;
   endAt?: number;
   followUpAt?: number;
   deferUntil?: number;
   durationMinutes?: number;
   recurrence: LifeRecurrence;
   allDay: boolean;
   pinToToday: boolean;
   details?: string;
}

export interface LifeSnapshot {
   now: number;
   items: LifeSnapshotItem[];
}

export type KinActionType = "create_item" | "update_item" | "complete_item" | "reopen_item" | "archive_item";

export interface KinActionItemInput {
   title?: string;
   details?: string;
   kind?: LifeItemKind;
   state?: LifeItemState;
   context?: LifeContext;
   importance?: LifeImportance;
   recurrence?: LifeRecurrence;
   timingPrecision?: LifeTimingPrecision;
   dueAt?: number;
   startAt?: number;
   endAt?: number;
   followUpAt?: number;
   deferUntil?: number;
   durationMinutes?: number;
   location?: string;
   allDay?: boolean;
   pinToToday?: boolean;
}

export interface KinAction {
   type: KinActionType;
   targetId?: string;
   targetQuery?: string;
   item?: KinActionItemInput;
   changes?: KinActionItemInput;
}
