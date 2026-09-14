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
};

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
      const quietDayTime = /^\d{2}:\d{2}$/.test(String(raw?.quietDayTime || "")) ? String(raw?.quietDayTime) : DEFAULT_PREFERENCES.quietDayTime;
      return { quietDayEnabled: raw?.quietDayEnabled === true, quietDayTime };
   } catch {
      return DEFAULT_PREFERENCES;
   }
}

export function saveNotificationPreferences(next: NotificationPreferences) {
   if (typeof window === "undefined") return;
   const quietDayTime = /^\d{2}:\d{2}$/.test(next.quietDayTime) ? next.quietDayTime : DEFAULT_PREFERENCES.quietDayTime;
   window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ quietDayEnabled: next.quietDayEnabled, quietDayTime }));
   dispatch(NOTIFICATION_PREFERENCES_UPDATED_EVENT);
}
