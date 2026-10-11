"use client";

export const NOTIFICATION_HEALTH_UPDATED_EVENT = "allevin-notification-health-updated";
export const NOTIFICATION_PREFERENCES_UPDATED_EVENT = "allevin-notification-preferences-updated";

const HEALTH_KEY = "allevin-notification-health-mkxxiv";
const PREFERENCES_KEY = "allevin-notification-preferences-mkxxiv";

export type NotificationHealthState = "off" | "checking" | "ready" | "needs-repair" | "local-only";

export interface NotificationPlanPreview {
   id: string;
   title: string;
   dueAt: number;
   phase: "checkpoint" | "start";
}

export interface NotificationHealth {
   state: NotificationHealthState;
   lastSyncAt?: number;
   lastSchedulerRunAt?: number;
   plannedJobs: number;
   queuedJobs: number;
   nextDueAt?: number;
   lastSentAt?: number;
   lastShownAt?: number;
   lastOpenedAt?: number;
   lastError?: string;
   preview: NotificationPlanPreview[];
}

export interface NotificationPreferences {
   quietDayEnabled: boolean;
   quietDayTime: string;
   contextualCheckInsEnabled: boolean;
   checkInWorkSchool: boolean;
   checkInAppointments: boolean;
   checkInCommutes: boolean;
   checkInRoutines: boolean;
   quietHoursEnabled: boolean;
   quietHoursStart: string;
   quietHoursEnd: string;
   allowImportantDuringQuietHours: boolean;
}

const EMPTY_HEALTH: NotificationHealth = {
   state: "off",
   plannedJobs: 0,
   queuedJobs: 0,
   preview: [],
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
   quietDayEnabled: false,
   quietDayTime: "09:00",
   contextualCheckInsEnabled: true,
   checkInWorkSchool: true,
   checkInAppointments: true,
   checkInCommutes: true,
   checkInRoutines: false,
   quietHoursEnabled: false,
   quietHoursStart: "22:00",
   quietHoursEnd: "06:00",
   allowImportantDuringQuietHours: true,
};

function safeTime(value: unknown, fallback: string) {
   return /^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : fallback;
}

function dispatch(name: string) {
   if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name));
}

export function readNotificationHealth(): NotificationHealth {
   if (typeof window === "undefined") return EMPTY_HEALTH;
   try {
      const raw = JSON.parse(window.localStorage.getItem(HEALTH_KEY) || "null") as Partial<NotificationHealth> | null;
      if (!raw) return EMPTY_HEALTH;
      return {
         state: ["off", "checking", "ready", "needs-repair", "local-only"].includes(String(raw.state))
            ? raw.state as NotificationHealthState
            : "needs-repair",
         lastSyncAt: Number.isFinite(raw.lastSyncAt) ? Number(raw.lastSyncAt) : undefined,
         lastSchedulerRunAt: Number.isFinite(raw.lastSchedulerRunAt) ? Number(raw.lastSchedulerRunAt) : undefined,
         plannedJobs: Math.max(0, Number(raw.plannedJobs) || 0),
         queuedJobs: Math.max(0, Number(raw.queuedJobs) || 0),
         nextDueAt: Number.isFinite(raw.nextDueAt) ? Number(raw.nextDueAt) : undefined,
         lastSentAt: Number.isFinite(raw.lastSentAt) ? Number(raw.lastSentAt) : undefined,
         lastShownAt: Number.isFinite(raw.lastShownAt) ? Number(raw.lastShownAt) : undefined,
         lastOpenedAt: Number.isFinite(raw.lastOpenedAt) ? Number(raw.lastOpenedAt) : undefined,
         lastError: typeof raw.lastError === "string" ? raw.lastError.slice(0, 180) : undefined,
         preview: Array.isArray(raw.preview)
            ? raw.preview.filter((item): item is NotificationPlanPreview => Boolean(item && typeof item.id === "string" && typeof item.title === "string" && Number.isFinite(item.dueAt))).slice(0, 8)
            : [],
      };
   } catch {
      return EMPTY_HEALTH;
   }
}

export function saveNotificationHealth(changes: Partial<NotificationHealth>) {
   if (typeof window === "undefined") return;
   const next: NotificationHealth = { ...readNotificationHealth(), ...changes };
   window.localStorage.setItem(HEALTH_KEY, JSON.stringify(next));
   dispatch(NOTIFICATION_HEALTH_UPDATED_EVENT);
}

export function recordNotificationReceipt(kind: "shown" | "opened", at = Date.now()) {
   saveNotificationHealth(kind === "shown" ? { lastShownAt: at } : { lastOpenedAt: at });
}

export function readNotificationPreferences(): NotificationPreferences {
   if (typeof window === "undefined") return DEFAULT_PREFERENCES;
   try {
      const raw = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) || "null") as Partial<NotificationPreferences> | null;
      // Merge rather than replace so older installations gain safe defaults
      // when a new notification preference is introduced.
      return {
         quietDayEnabled: raw?.quietDayEnabled === true,
         quietDayTime: safeTime(raw?.quietDayTime, DEFAULT_PREFERENCES.quietDayTime),
         contextualCheckInsEnabled: raw?.contextualCheckInsEnabled !== false,
         checkInWorkSchool: raw?.checkInWorkSchool !== false,
         checkInAppointments: raw?.checkInAppointments !== false,
         checkInCommutes: raw?.checkInCommutes !== false,
         checkInRoutines: raw?.checkInRoutines === true,
         quietHoursEnabled: raw?.quietHoursEnabled === true,
         quietHoursStart: safeTime(raw?.quietHoursStart, DEFAULT_PREFERENCES.quietHoursStart),
         quietHoursEnd: safeTime(raw?.quietHoursEnd, DEFAULT_PREFERENCES.quietHoursEnd),
         allowImportantDuringQuietHours: raw?.allowImportantDuringQuietHours !== false,
      };
   } catch {
      return DEFAULT_PREFERENCES;
   }
}

export function saveNotificationPreferences(next: NotificationPreferences) {
   if (typeof window === "undefined") return;
   window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      ...next,
      quietDayTime: safeTime(next.quietDayTime, DEFAULT_PREFERENCES.quietDayTime),
      quietHoursStart: safeTime(next.quietHoursStart, DEFAULT_PREFERENCES.quietHoursStart),
      quietHoursEnd: safeTime(next.quietHoursEnd, DEFAULT_PREFERENCES.quietHoursEnd),
   }));
   dispatch(NOTIFICATION_PREFERENCES_UPDATED_EVENT);
}
