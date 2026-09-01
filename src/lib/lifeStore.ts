// ========================================
// ALLEVIN MK XII — Life Store
// Purpose:
// Local-first authoritative state for daily life coordination.
// Kin may propose mutations, but every mutation is validated here.
// ========================================

import type {
   KinAction,
   KinActionItemInput,
   LifeActivity,
   LifeActivityKind,
   LifeContext,
   LifeImportance,
   LifeItem,
   LifeItemKind,
   LifeItemSource,
   LifeItemState,
   LifeRecurrence,
   LifeRepeatRule,
   LifeSnapshot,
   LifeState,
   LifeTimingPrecision,
} from "@/lib/lifeTypes";
import { canonicalTaskTitleFromPrompt } from "@/lib/allevinConversationIntelligence";
import { parseRelativeCalendarDate } from "@/lib/lifeTimingCore";

export const LIFE_STATE_STORAGE_KEY = "allevin-life-state-mkxii";
export const LIFE_STATE_UPDATED_EVENT = "allevin-life-state-updated";

const LEGACY_CALENDAR_EVENTS_STORAGE_KEY = "allevin-calendar-events-mki";
const MAX_ITEMS = 800;
const MAX_ACTIVITIES = 240;
const ONE_TIME_REMINDER_TTL = 4 * 60 * 60 * 1000;

const KIN_ACTION_CONTEXTS: LifeContext[] = ["personal", "work", "school", "kin-software", "home", "errand", "car", "finance", "health", "other"];
const KIN_ACTION_KINDS: LifeItemKind[] = ["task", "commitment", "waiting", "routine", "note"];
const KIN_ACTION_STATES: LifeItemState[] = ["active", "waiting", "someday", "done", "archived"];
const KIN_ACTION_IMPORTANCE: LifeImportance[] = ["low", "normal", "high"];
const KIN_ACTION_RECURRENCES: LifeRecurrence[] = ["none", "interval", "daily", "weekdays", "weekly", "monthly"];
const KIN_ACTION_TIMING: LifeTimingPrecision[] = ["exact", "day", "window", "someday", "none"];

function makeId(prefix: string) {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
   return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeText(value: unknown, limit = 500) {
   return String(value ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
}

function safeTimestamp(value: unknown) {
   return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function safeDuration(value: unknown) {
   if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
   return Math.max(5, Math.min(720, Math.round(value)));
}

function safeRepeatRule(value: unknown): LifeRepeatRule | undefined {
   if (!value || typeof value !== "object") return undefined;
   const raw = value as Partial<LifeRepeatRule>;
   const frequency = raw.frequency === "daily" || raw.frequency === "weekdays" || raw.frequency === "weekly" || raw.frequency === "monthly"
      ? raw.frequency
      : "interval";
   const intervalMinutes = raw.intervalMinutes === undefined ? undefined : Math.round(Number(raw.intervalMinutes));
   const windowStartMinutes = raw.windowStartMinutes === undefined ? undefined : Math.round(Number(raw.windowStartMinutes));
   const windowEndMinutes = raw.windowEndMinutes === undefined ? undefined : Math.round(Number(raw.windowEndMinutes));
   const timeMinutes = raw.timeMinutes === undefined ? undefined : Math.round(Number(raw.timeMinutes));
   const seriesStartedAt = safeTimestamp(raw.seriesStartedAt);
   if (!seriesStartedAt) return undefined;
   if (frequency === "interval" && (
      !Number.isFinite(intervalMinutes) || (intervalMinutes || 0) < 5 || (intervalMinutes || 0) > 7 * 24 * 60 ||
      !Number.isFinite(windowStartMinutes) || (windowStartMinutes || 0) < 0 || (windowStartMinutes || 0) > 1439 ||
      !Number.isFinite(windowEndMinutes) || (windowEndMinutes || 0) < 1 || (windowEndMinutes || 0) > 1440 ||
      (windowEndMinutes || 0) <= (windowStartMinutes || 0)
   )) return undefined;
   if (frequency !== "interval" && (!Number.isFinite(timeMinutes) || (timeMinutes || 0) < 0 || (timeMinutes || 0) > 1439)) return undefined;
   const daysOfWeek = Array.isArray(raw.daysOfWeek)
      ? [...new Set(raw.daysOfWeek.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
      : undefined;
   const monthlyOrdinal = raw.monthlyOrdinal === -1 || [1, 2, 3, 4, 5].includes(Number(raw.monthlyOrdinal))
      ? raw.monthlyOrdinal as LifeRepeatRule["monthlyOrdinal"]
      : undefined;
   return {
      frequency,
      intervalMinutes,
      cadence: raw.cadence === "flexible" ? "flexible" : "exact",
      scope: raw.scope === "today" ? "today" : "every-day",
      windowStartMinutes,
      windowEndMinutes,
      timeMinutes,
      daysOfWeek,
      monthlyDay: Number.isInteger(raw.monthlyDay) && Number(raw.monthlyDay) >= 1 && Number(raw.monthlyDay) <= 31 ? Number(raw.monthlyDay) : undefined,
      monthlyOrdinal,
      monthlyWeekday: Number.isInteger(raw.monthlyWeekday) && Number(raw.monthlyWeekday) >= 0 && Number(raw.monthlyWeekday) <= 6 ? Number(raw.monthlyWeekday) : undefined,
      shorterMonthPolicy: raw.shorterMonthPolicy === "last-day" ? "last-day" : raw.shorterMonthPolicy === "skip" ? "skip" : undefined,
      seriesStartedAt,
      seriesEndsAt: safeTimestamp(raw.seriesEndsAt),
      skipNextAt: safeTimestamp(raw.skipNextAt),
      stopWhenCompleted: raw.stopWhenCompleted === true,
      paused: raw.paused === true,
      userEdited: raw.userEdited === true,
   };
}

function asContext(value: unknown, fallback: LifeContext = "personal"): LifeContext {
   return KIN_ACTION_CONTEXTS.includes(value as LifeContext) ? (value as LifeContext) : fallback;
}

function asKind(value: unknown, fallback: LifeItemKind = "task"): LifeItemKind {
   return KIN_ACTION_KINDS.includes(value as LifeItemKind) ? (value as LifeItemKind) : fallback;
}

function asState(value: unknown, fallback: LifeItemState = "active"): LifeItemState {
   return KIN_ACTION_STATES.includes(value as LifeItemState) ? (value as LifeItemState) : fallback;
}

function asImportance(value: unknown, fallback: LifeImportance = "normal"): LifeImportance {
   return KIN_ACTION_IMPORTANCE.includes(value as LifeImportance) ? (value as LifeImportance) : fallback;
}

function asRecurrence(value: unknown, fallback: LifeRecurrence = "none"): LifeRecurrence {
   return KIN_ACTION_RECURRENCES.includes(value as LifeRecurrence) ? (value as LifeRecurrence) : fallback;
}

function asTimingPrecision(value: unknown, fallback: LifeTimingPrecision = "none"): LifeTimingPrecision {
   return KIN_ACTION_TIMING.includes(value as LifeTimingPrecision) ? (value as LifeTimingPrecision) : fallback;
}

export function getEmptyLifeState(): LifeState {
   return {
      version: "MK XII",
      items: [],
      activities: [],
      preferences: {
         weekStartsOn: 0,
         defaultContext: "personal",
         showCompletedToday: true,
      },
      migratedFromMkXI: false,
      updatedAt: Date.now(),
   };
}

function sanitizeItem(raw: Partial<LifeItem>, fallbackSource: LifeItemSource = "user"): LifeItem | null {
   const now = Date.now();
   const createdAt = safeTimestamp(raw.createdAt) || now;
   const storedTitle = sanitizeText(raw.title, 180);
   if (!storedTitle) return null;
   const leakedReminderCommand = /\b(?:remind me|don['’]?t let me forget|do not let me forget)\b/i.test(storedTitle);
   const repairedTitle = leakedReminderCommand ? canonicalTaskTitleFromPrompt(storedTitle) : storedTitle;
   const title = sanitizeText(repairedTitle, 180) || storedTitle;
   const hasStoredTiming = Boolean(raw.dueAt || raw.startAt || raw.followUpAt || raw.deferUntil);
   const repairedRelativeDate = leakedReminderCommand && !hasStoredTiming
      ? parseRelativeCalendarDate(storedTitle, createdAt)
      : null;
   if (repairedRelativeDate) repairedRelativeDate.setHours(12, 0, 0, 0);
   const kind = asKind(raw.kind);
   const state = asState(raw.state, kind === "waiting" ? "waiting" : "active");

   return {
      id: sanitizeText(raw.id, 180) || makeId("life"),
      title,
      details: sanitizeText(raw.details, 2000),
      kind,
      state,
      context: asContext(raw.context),
      importance: asImportance(raw.importance),
      recurrence: asRecurrence(raw.recurrence),
      repeatRule: safeRepeatRule(raw.repeatRule),
      timingPrecision: repairedRelativeDate ? "day" : asTimingPrecision(raw.timingPrecision),
      dueAt: safeTimestamp(raw.dueAt) || repairedRelativeDate?.getTime(),
      startAt: safeTimestamp(raw.startAt),
      endAt: safeTimestamp(raw.endAt),
      followUpAt: safeTimestamp(raw.followUpAt),
      deferUntil: safeTimestamp(raw.deferUntil),
      durationMinutes: safeDuration(raw.durationMinutes),
      location: sanitizeText(raw.location, 180) || undefined,
      allDay: repairedRelativeDate ? true : raw.allDay === true,
      pinToToday: raw.pinToToday === true,
      source: raw.source === "kin" || raw.source === "calendar" || raw.source === "migration" || raw.source === "user" ? raw.source : fallbackSource,
      createdAt,
      updatedAt: safeTimestamp(raw.updatedAt) || now,
      completedAt: safeTimestamp(raw.completedAt),
      lastCompletedAt: safeTimestamp(raw.lastCompletedAt),
   };
}

function sanitizeActivity(raw: Partial<LifeActivity>): LifeActivity | null {
   const itemTitle = sanitizeText(raw.itemTitle, 180);
   const itemId = sanitizeText(raw.itemId, 180);
   if (!itemTitle || !itemId) return null;

   const validKinds: LifeActivityKind[] = ["created", "updated", "completed", "reopened", "deferred", "waiting", "archived", "migrated"];
   const kind = validKinds.includes(raw.kind as LifeActivityKind) ? (raw.kind as LifeActivityKind) : "updated";

   return {
      id: sanitizeText(raw.id, 180) || makeId("activity"),
      itemId,
      itemTitle,
      kind,
      detail: sanitizeText(raw.detail, 360),
      at: safeTimestamp(raw.at) || Date.now(),
   };
}

function sanitizeState(raw: Partial<LifeState>): LifeState {
   const fallback = getEmptyLifeState();
   const items = Array.isArray(raw.items) ? raw.items.map((item) => sanitizeItem(item)).filter((item): item is LifeItem => Boolean(item)).slice(0, MAX_ITEMS) : [];
   const activities = Array.isArray(raw.activities)
      ? raw.activities.map((activity) => sanitizeActivity(activity)).filter((activity): activity is LifeActivity => Boolean(activity)).slice(-MAX_ACTIVITIES)
      : [];

   return {
      version: "MK XII",
      items,
      activities,
      preferences: {
         weekStartsOn: raw.preferences?.weekStartsOn === 1 ? 1 : 0,
         defaultContext: asContext(raw.preferences?.defaultContext, fallback.preferences.defaultContext),
         showCompletedToday: raw.preferences?.showCompletedToday !== false,
      },
      migratedFromMkXI: raw.migratedFromMkXI === true,
      updatedAt: safeTimestamp(raw.updatedAt) || Date.now(),
   };
}

export function readLifeState(): LifeState {
   if (typeof window === "undefined") return getEmptyLifeState();

   try {
      const stored = window.localStorage.getItem(LIFE_STATE_STORAGE_KEY);
      if (!stored) return getEmptyLifeState();
      const state = sanitizeState(JSON.parse(stored));
      const now = Date.now();
      let changed = false;

      // Exact one-time reminders leave the active workspace four hours after
      // their moment. They are not history, advice context, or late catch-up
      // work. Commitments and broad day items keep their existing lifecycle.
      const expiredIds = new Set(
         state.items
            .filter((item) => item.state === "active" && item.kind === "task" && item.recurrence === "none" && item.timingPrecision === "exact")
            .filter((item) => Boolean((item.dueAt || item.startAt) && (item.dueAt || item.startAt || 0) < now - ONE_TIME_REMINDER_TTL))
            .map((item) => item.id),
      );
      if (expiredIds.size) {
         state.items = state.items.filter((item) => !expiredIds.has(item.id));
         state.activities = state.activities.filter((activity) => !expiredIds.has(activity.itemId));
         changed = true;
      }

      for (const item of state.items) {
         if (item.state !== "active" || item.recurrence === "none" || item.repeatRule?.paused) continue;
         const current = item.dueAt || item.startAt || 0;
         // Keep the just-due occurrence visible long enough for the foreground
         // checker to deliver it; after that, jump directly to the next future
         // occurrence instead of replaying anything missed while offline.
         if (current > now - 2 * 60_000) continue;
         const next = nextLifeOccurrence(item, now + 1);
         if (next) {
            item.dueAt = next;
            changed = true;
         } else if (item.repeatRule?.scope === "today") {
            item.state = "done";
            changed = true;
         }
      }
      if (changed) {
         state.updatedAt = now;
         window.localStorage.setItem(LIFE_STATE_STORAGE_KEY, JSON.stringify(state));
      }
      return state;
   } catch {
      return getEmptyLifeState();
   }
}

export function writeLifeState(next: LifeState): LifeState {
   const safe = sanitizeState({ ...next, updatedAt: Date.now() });
   if (typeof window !== "undefined") {
      window.localStorage.setItem(LIFE_STATE_STORAGE_KEY, JSON.stringify(safe));
      window.dispatchEvent(new CustomEvent(LIFE_STATE_UPDATED_EVENT));
   }
   return safe;
}

function pushActivity(state: LifeState, item: LifeItem, kind: LifeActivityKind, detail: string) {
   state.activities = [
      ...state.activities,
      {
         id: makeId("activity"),
         itemId: item.id,
         itemTitle: item.title,
         kind,
         detail: sanitizeText(detail, 360),
         at: Date.now(),
      },
   ].slice(-MAX_ACTIVITIES);
}

function normalizeActionInput(input?: KinActionItemInput, current?: LifeItem): Partial<LifeItem> {
   if (!input) return {};

   return {
      title: input.title ? sanitizeText(input.title, 180) : current?.title,
      details: input.details !== undefined ? sanitizeText(input.details, 2000) : current?.details,
      kind: input.kind ? asKind(input.kind, current?.kind || "task") : current?.kind,
      state: input.state ? asState(input.state, current?.state || "active") : current?.state,
      context: input.context ? asContext(input.context, current?.context || "personal") : current?.context,
      importance: input.importance ? asImportance(input.importance, current?.importance || "normal") : current?.importance,
      recurrence: input.recurrence ? asRecurrence(input.recurrence, current?.recurrence || "none") : current?.recurrence,
      repeatRule: input.repeatRule !== undefined ? safeRepeatRule(input.repeatRule) : current?.repeatRule,
      timingPrecision: input.timingPrecision ? asTimingPrecision(input.timingPrecision, current?.timingPrecision || "none") : current?.timingPrecision,
      dueAt: input.dueAt !== undefined ? safeTimestamp(input.dueAt) : current?.dueAt,
      startAt: input.startAt !== undefined ? safeTimestamp(input.startAt) : current?.startAt,
      endAt: input.endAt !== undefined ? safeTimestamp(input.endAt) : current?.endAt,
      followUpAt: input.followUpAt !== undefined ? safeTimestamp(input.followUpAt) : current?.followUpAt,
      deferUntil: input.deferUntil !== undefined ? safeTimestamp(input.deferUntil) : current?.deferUntil,
      durationMinutes: input.durationMinutes !== undefined ? safeDuration(input.durationMinutes) : current?.durationMinutes,
      location: input.location !== undefined ? sanitizeText(input.location, 180) || undefined : current?.location,
      allDay: input.allDay !== undefined ? input.allDay === true : current?.allDay,
      pinToToday: input.pinToToday !== undefined ? input.pinToToday === true : current?.pinToToday,
   };
}

function findItem(state: LifeState, targetId?: string, targetQuery?: string) {
   const byId = targetId ? state.items.find((item) => item.id === targetId) : undefined;
   if (byId) return byId;

   const query = sanitizeText(targetQuery, 180).toLowerCase();
   if (!query) return undefined;

   const exact = state.items.find((item) => item.state !== "archived" && item.title.toLowerCase() === query);
   if (exact) return exact;

   return state.items.find((item) => item.state !== "archived" && (item.title.toLowerCase().includes(query) || query.includes(item.title.toLowerCase())));
}

function nextRecurrenceTimestamp(item: LifeItem, from = Date.now()) {
   return nextLifeOccurrence(item, Math.max(from, (item.dueAt || item.startAt || from) + 1)) || from;
}

function atLocalMinutes(date: Date, minutes: number) {
   const target = new Date(date);
   target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
   return target.getTime();
}

/** Return the first future occurrence without replaying anything missed offline. */
export function nextLifeOccurrence(item: LifeItem, after = Date.now()) {
   if (item.recurrence === "none") return item.startAt || item.dueAt;
   const baseAt = item.startAt || item.dueAt;
   if (!baseAt) return undefined;
   const baseDate = new Date(baseAt);
   const rule: LifeRepeatRule = item.repeatRule || {
      frequency: item.recurrence,
      cadence: "exact",
      scope: "every-day",
      timeMinutes: baseDate.getHours() * 60 + baseDate.getMinutes(),
      seriesStartedAt: baseAt,
      stopWhenCompleted: false,
      paused: false,
   };
   if (rule.paused) return undefined;
   const hardEnd = Math.min(rule.seriesEndsAt || Number.MAX_SAFE_INTEGER, after + 740 * 86_400_000);

   if (item.recurrence !== "interval") {
      const timeMinutes = rule.timeMinutes ?? (baseDate.getHours() * 60 + baseDate.getMinutes());
      const startDay = new Date(after);
      startDay.setHours(0, 0, 0, 0);
      const days = rule.daysOfWeek?.length ? rule.daysOfWeek : [baseDate.getDay()];

      for (let offset = 0; offset < 740; offset += 1) {
         const date = new Date(startDay);
         date.setDate(startDay.getDate() + offset);
         const candidate = atLocalMinutes(date, timeMinutes);
         if (candidate < after || candidate < rule.seriesStartedAt || candidate > hardEnd) continue;
         let matches = item.recurrence === "daily";
         if (item.recurrence === "weekdays") matches = date.getDay() >= 1 && date.getDay() <= 5;
         if (item.recurrence === "weekly") matches = days.includes(date.getDay());
         if (item.recurrence === "monthly") {
            const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
            if (rule.monthlyOrdinal && rule.monthlyWeekday !== undefined) {
               if (rule.monthlyOrdinal === -1) {
                  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
                  while (last.getDay() !== rule.monthlyWeekday) last.setDate(last.getDate() - 1);
                  matches = date.getDate() === last.getDate();
               } else {
                  const first = new Date(date.getFullYear(), date.getMonth(), 1);
                  const firstMatch = 1 + (rule.monthlyWeekday - first.getDay() + 7) % 7;
                  matches = date.getDate() === firstMatch + (rule.monthlyOrdinal - 1) * 7;
               }
            } else {
               const requestedDay = rule.monthlyDay || baseDate.getDate();
               const validDay = requestedDay <= lastDay
                  ? requestedDay
                  : rule.shorterMonthPolicy === "last-day" ? lastDay : -1;
               matches = date.getDate() === validDay;
            }
         }
         if (!matches) continue;
         if (rule.skipNextAt && Math.abs(candidate - rule.skipNextAt) < 60_000) continue;
         return candidate;
      }
      return undefined;
   }

   if (!rule.intervalMinutes || rule.windowStartMinutes === undefined || rule.windowEndMinutes === undefined) return undefined;
   const day = new Date(after);
   day.setHours(0, 0, 0, 0);

   for (let offset = 0; offset < 370; offset += 1) {
      const date = new Date(day);
      date.setDate(day.getDate() + offset);
      if (rule.scope === "today" && date.toDateString() !== new Date(rule.seriesStartedAt).toDateString()) return undefined;
      const start = atLocalMinutes(date, rule.windowStartMinutes);
      const end = atLocalMinutes(date, rule.windowEndMinutes);
      if (start > hardEnd) return undefined;
      const anchor = Math.max(start, rule.seriesStartedAt);
      const elapsed = Math.max(0, after - anchor);
      const steps = Math.ceil(elapsed / (rule.intervalMinutes * 60_000));
      let candidate = anchor + steps * rule.intervalMinutes * 60_000;
      if (rule.skipNextAt && Math.abs(candidate - rule.skipNextAt) < 60_000) candidate += rule.intervalMinutes * 60_000;
      if (candidate >= after && candidate <= end && candidate <= hardEnd) return candidate;
   }
   return undefined;
}

/** Expand only the requested horizon. The series itself stays a single item. */
export function lifeOccurrencesBetween(item: LifeItem, from: number, to: number) {
   if (item.recurrence === "none") {
      const once = item.startAt || item.dueAt;
      return once && once >= from && once <= to ? [once] : [];
   }
   const result: number[] = [];
   let cursor = from;
   for (let count = 0; count < 160; count += 1) {
      const occurrence = nextLifeOccurrence(item, cursor);
      if (!occurrence || occurrence > to) break;
      result.push(occurrence);
      cursor = occurrence + 1;
   }
   return result;
}

export function createLifeItem(input: KinActionItemInput, source: LifeItemSource = "user") {
   const current = readLifeState();
   const item = sanitizeItem(
      {
         ...normalizeActionInput(input),
         id: makeId("life"),
         source,
         createdAt: Date.now(),
         updatedAt: Date.now(),
      },
      source,
   );

   if (!item) return current;
   current.items = [item, ...current.items];
   pushActivity(current, item, source === "migration" ? "migrated" : "created", source === "kin" ? "Added by Kin" : "Added");
   return writeLifeState(current);
}

export function updateLifeItem(itemId: string, changes: KinActionItemInput, activityKind: LifeActivityKind = "updated") {
   const current = readLifeState();
   const index = current.items.findIndex((item) => item.id === itemId);
   if (index < 0) return current;

   const existing = current.items[index];
   const safe = sanitizeItem({ ...existing, ...normalizeActionInput(changes, existing), id: existing.id, updatedAt: Date.now(), source: existing.source });
   if (!safe) return current;
   current.items[index] = safe;
   pushActivity(current, safe, activityKind, activityKind === "deferred" ? "Moved to a later time" : activityKind === "waiting" ? "Moved to waiting" : "Updated");
   return writeLifeState(current);
}

export function completeLifeItem(itemId: string) {
   const current = readLifeState();
   const item = current.items.find((candidate) => candidate.id === itemId);
   if (!item) return current;

   if (item.kind === "routine" && item.recurrence !== "none") {
      if (item.repeatRule?.stopWhenCompleted) {
         item.state = "done";
         item.completedAt = Date.now();
         item.updatedAt = Date.now();
         pushActivity(current, item, "completed", "Recurring reminder completed");
         return writeLifeState(current);
      }
      const nextAt = nextRecurrenceTimestamp(item);
      item.lastCompletedAt = Date.now();
      item.updatedAt = Date.now();
      item.state = "active";
      if (item.dueAt) item.dueAt = nextAt;
      else item.startAt = nextAt;
      item.completedAt = undefined;
      pushActivity(current, item, "completed", "Routine completed; next occurrence scheduled");
      return writeLifeState(current);
   }

   item.state = "done";
   item.completedAt = Date.now();
   item.updatedAt = Date.now();
   pushActivity(current, item, "completed", "Completed");
   return writeLifeState(current);
}

export function reopenLifeItem(itemId: string) {
   const current = readLifeState();
   const item = current.items.find((candidate) => candidate.id === itemId);
   if (!item) return current;
   item.state = item.kind === "waiting" ? "waiting" : "active";
   item.completedAt = undefined;
   item.updatedAt = Date.now();
   pushActivity(current, item, "reopened", "Reopened");
   return writeLifeState(current);
}

export function archiveLifeItem(itemId: string) {
   const current = readLifeState();
   const item = current.items.find((candidate) => candidate.id === itemId);
   if (!item) return current;
   item.state = "archived";
   item.updatedAt = Date.now();
   pushActivity(current, item, "archived", "Archived");
   return writeLifeState(current);
}

export function moveLifeItemToTomorrow(itemId: string) {
   const tomorrow = new Date();
   tomorrow.setDate(tomorrow.getDate() + 1);
   tomorrow.setHours(12, 0, 0, 0);
   return updateLifeItem(itemId, { dueAt: tomorrow.getTime(), allDay: true, pinToToday: false, timingPrecision: "day", state: "active" }, "deferred");
}

export function bringLifeItemToToday(itemId: string) {
   const today = new Date();
   today.setHours(12, 0, 0, 0);
   return updateLifeItem(itemId, { dueAt: today.getTime(), allDay: true, pinToToday: true, timingPrecision: "day", state: "active" }, "updated");
}

export function markLifeItemWaiting(itemId: string, followUpAt?: number) {
   return updateLifeItem(itemId, { state: "waiting", kind: "waiting", followUpAt, pinToToday: false }, "waiting");
}

export function clearLifeState() {
   if (typeof window === "undefined") return;
   // A deliberate MK XII reset should stay empty instead of re-importing the
   // legacy MK XI calendar on the next refresh.
   writeLifeState({ ...getEmptyLifeState(), migratedFromMkXI: true });
}

function migrateLegacyCalendar(state: LifeState) {
   if (typeof window === "undefined" || state.migratedFromMkXI) return state;

   let legacy: unknown = [];
   try {
      legacy = JSON.parse(window.localStorage.getItem(LEGACY_CALENDAR_EVENTS_STORAGE_KEY) || "[]");
   } catch {
      legacy = [];
   }

   const values = Array.isArray(legacy) ? legacy : [];
   const migrated: LifeItem[] = [];

   values.slice(0, 180).forEach((raw) => {
      const event = raw as Record<string, unknown>;
      const title = sanitizeText(event.title, 180);
      const startAt = safeTimestamp(event.startTime ?? event.startAt);
      const endAt = safeTimestamp(event.endTime ?? event.endAt);
      const projectLinked = Boolean(sanitizeText(event.originProjectsItemId, 180) || sanitizeText(event.projectStage, 180));
      const alreadyPast = Boolean((endAt || startAt || 0) < new Date().setHours(0, 0, 0, 0));
      if (!title || !startAt || projectLinked || alreadyPast) return;

      const duplicate = state.items.some((item) => item.source === "migration" && item.title === title && item.startAt === startAt);
      if (duplicate) return;

      const item = sanitizeItem(
         {
            id: makeId("life-calendar"),
            title,
            details: sanitizeText(event.description ?? event.workingSummary, 1600),
            kind: "commitment",
            state: "active",
            context: "personal",
            recurrence:
               event.repeat === "daily" || event.repeat === "weekly" || event.repeat === "monthly"
                  ? (event.repeat as LifeRecurrence)
                  : "none",
            timingPrecision: event.allDay === true ? "day" : "exact",
            startAt,
            dueAt: startAt,
            endAt,
            location: sanitizeText(event.location, 180) || undefined,
            importance: event.priority === "high" ? "high" : event.priority === "low" ? "low" : "normal",
            allDay: event.allDay === true,
            pinToToday: false,
            source: "migration",
            createdAt: Date.now(),
            updatedAt: Date.now(),
         },
         "migration",
      );
      if (item) migrated.push(item);
   });

   state.items = [...migrated, ...state.items].slice(0, MAX_ITEMS);
   migrated.forEach((item) => pushActivity(state, item, "migrated", "Imported from the MK XI calendar"));
   state.migratedFromMkXI = true;
   return writeLifeState(state);
}

export function ensureLifeStateReady() {
   return migrateLegacyCalendar(readLifeState());
}

export function getLifeSnapshot(state: LifeState = readLifeState()): LifeSnapshot {
   return {
      now: Date.now(),
      items: state.items
         .filter((item) => item.state !== "archived")
         .slice(0, 120)
         .map((item) => ({
            id: item.id,
            title: item.title,
            kind: item.kind,
            state: item.state,
            context: item.context,
            importance: item.importance,
            dueAt: item.dueAt,
            startAt: item.startAt,
            endAt: item.endAt,
            followUpAt: item.followUpAt,
            deferUntil: item.deferUntil,
            durationMinutes: item.durationMinutes,
            recurrence: item.recurrence,
            repeatRule: item.repeatRule,
            allDay: item.allDay,
            pinToToday: item.pinToToday,
            details: item.details || undefined,
         })),
   };
}

export function applyKinActions(actions: KinAction[]) {
   let state = readLifeState();
   const applied: string[] = [];

   for (const action of actions.slice(0, 8)) {
      if (!action || typeof action !== "object") continue;

      if (action.type === "create_item" && action.item?.title) {
         state = createLifeItem(action.item, "kin");
         applied.push(`Added ${sanitizeText(action.item.title, 180)}`);
         continue;
      }

      const target = findItem(state, action.targetId, action.targetQuery);
      if (!target) continue;

      if (action.type === "update_item") {
         state = updateLifeItem(target.id, action.changes || {}, action.changes?.state === "waiting" ? "waiting" : "updated");
         applied.push(`Updated ${target.title}`);
      }

      if (action.type === "complete_item") {
         state = completeLifeItem(target.id);
         applied.push(`Completed ${target.title}`);
      }

      if (action.type === "reopen_item") {
         state = reopenLifeItem(target.id);
         applied.push(`Reopened ${target.title}`);
      }

      if (action.type === "archive_item") {
         state = archiveLifeItem(target.id);
         applied.push(`Archived ${target.title}`);
      }
   }

   return { state, applied };
}
