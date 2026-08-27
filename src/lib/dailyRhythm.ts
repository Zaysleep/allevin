import { rhythmVoice, type AllevinTone } from "@/lib/allevinVoice";
import {
   applyScheduleMutation,
   parseExplicitDurationMinutes,
   parseScheduleMutationSegments,
   type ScheduleMutationResult,
} from "./scheduleMutationCore";

export const DAILY_RHYTHM_UPDATED_EVENT = "allevin-daily-rhythm-updated";
export const DAILY_RHYTHM_STORAGE_KEY = "allevin-daily-rhythm-mkxii-2";
const LEGACY_DAILY_RHYTHM_STORAGE_KEY = "allevin-daily-rhythm-mkxii-1";

export type RhythmDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type RhythmAnchorId = string;
export type RhythmCategory = "work" | "school" | "exercise" | "meal" | "care" | "home" | "personal" | "other";
export type RhythmDayRule = "everyday" | "schedule" | "custom";
export type RhythmTimingMode = "fixed" | "schedule-relative";
export type RhythmScheduleReferencePoint = "start" | "end";

/**
 * A day outcome records what actually happened, not what the recurring plan said.
 * This is intentionally separate from the base routine so a one-off Tuesday does
 * not silently rewrite every future Tuesday.
 */
export type RhythmOutcomeKind = "completed" | "skipped" | "replaced" | "suppressed" | "moved";

export interface RhythmOutcomeRecord {
   kind: RhythmOutcomeKind;
   at: number;
   note?: string;
}

/**
 * Temporary entries are one-day replacements/additions created when reality
 * changes ("code instead of gym", "extra study block", etc.).
 */
export interface RhythmTemporaryEntry {
   id: string;
   title: string;
   category: RhythmCategory;
   time: string;
   durationMinutes: number;
   flexible: boolean;
   reason?: string;
   replacesAnchorId?: RhythmAnchorId;
}

/**
 * Day context is lightweight situational information supplied by the user.
 * It can influence recommendations/replanning without becoming a diagnosis or
 * a permanent preference.
 */
export interface RhythmDayContext {
   id: string;
   kind: "recovery" | "late" | "sleep-in" | "work-from-home" | "event-change" | "custom";
   text: string;
   at: number;
}

export interface RhythmScheduleBlock {
   id: string;
   title: string;
   category: RhythmCategory;
   days: RhythmDay[];
   start: string;
   end: string;
   enabled: boolean;
}

export interface RhythmAnchor {
   id: RhythmAnchorId;
   title: string;
   category: RhythmCategory;
   time: string;
   durationMinutes: number;
   enabled: boolean;
   reminder: boolean;
   accountabilityAfterMinutes: number;
   dayRule: RhythmDayRule;
   scheduleBlockId?: string;
   scheduleCategory?: RhythmCategory;
   days?: RhythmDay[];
   flexible: boolean;
   timingMode: RhythmTimingMode;
   scheduleReferencePoint?: RhythmScheduleReferencePoint;
   scheduleOffsetMinutes?: number;
}

export interface RhythmOverride {
   time?: string;
   durationMinutes?: number;
}

export interface ScheduleException {
   off?: boolean;
   start?: string;
   end?: string;
}

export interface DailyRhythmState {
   version: 2;
   scheduleBlocks: RhythmScheduleBlock[];
   anchors: RhythmAnchor[];
   remindersEnabled: boolean;
   eveningResetEnabled: boolean;
   completions: Record<string, RhythmAnchorId[]>;
   skips: Record<string, RhythmAnchorId[]>;
   overrides: Record<string, Record<RhythmAnchorId, RhythmOverride>>;
   scheduleExceptions: Record<string, Record<string, ScheduleException>>;

   // Reality overlay: all three structures are date-keyed and therefore temporary.
   temporaryEntries: Record<string, RhythmTemporaryEntry[]>;
   dayContexts: Record<string, RhythmDayContext[]>;
   outcomes: Record<string, Record<string, RhythmOutcomeRecord>>;
   updatedAt: number;
}

export interface RhythmEntry {
   id: string;
   sourceId: string;
   kind: "anchor" | "schedule";
   title: string;
   category: RhythmCategory;
   time: string;
   endTime?: string;
   durationMinutes?: number;
   completed: boolean;
   skipped: boolean;
   status: "upcoming" | "due" | "missed" | "completed" | "skipped";
   canComplete: boolean;
   flexible: boolean;
}

function makeId(prefix: string) {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
   return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultDailyRhythm(): DailyRhythmState {
   return {
      version: 2,
      scheduleBlocks: [],
      anchors: [],
      remindersEnabled: false,
      eveningResetEnabled: true,
      completions: {},
      skips: {},
      overrides: {},
      scheduleExceptions: {},
      temporaryEntries: {},
      dayContexts: {},
      outcomes: {},
      updatedAt: Date.now(),
   };
}

function isBrowser() {
   return typeof window !== "undefined";
}

function asDay(value: unknown): RhythmDay | null {
   return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 6 ? (Number(value) as RhythmDay) : null;
}

function sanitizeDays(value: unknown): RhythmDay[] {
   if (!Array.isArray(value)) return [];
   return [...new Set(value.map(asDay).filter((day): day is RhythmDay => day !== null))].sort() as RhythmDay[];
}

function sanitizeClock(value: unknown, fallback = "09:00") {
   const clean = String(value || "").trim();
   return /^([01]\d|2[0-3]):[0-5]\d$/.test(clean) ? clean : fallback;
}

function sanitizeCategory(value: unknown): RhythmCategory {
   return ["work", "school", "exercise", "meal", "care", "home", "personal", "other"].includes(String(value))
      ? (String(value) as RhythmCategory)
      : "other";
}

function migrateLegacy(raw: Record<string, unknown>): DailyRhythmState {
   const workDays = sanitizeDays(raw.workDays);
   const scheduleId = "schedule-work";
   const scheduleBlocks: RhythmScheduleBlock[] = workDays.length
      ? [{ id: scheduleId, title: "Work", category: "work", days: workDays, start: sanitizeClock(raw.workStart, "09:00"), end: sanitizeClock(raw.workEnd, "17:00"), enabled: true }]
      : [];

   const legacyAnchors = Array.isArray(raw.anchors) ? raw.anchors : [];
   const anchors: RhythmAnchor[] = legacyAnchors
      .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"))
      .map((anchor) => ({
         id: String(anchor.id || makeId("anchor")),
         title: String(anchor.title || "Routine").slice(0, 120),
         category: /exercise|workout|gym/i.test(String(anchor.title))
            ? "exercise"
            : /breakfast|coffee|matcha|lunch|dinner|meal/i.test(String(anchor.title))
              ? "meal"
              : "personal",
         time: sanitizeClock(anchor.time, "08:00"),
         durationMinutes: Math.max(5, Math.min(360, Number(anchor.durationMinutes) || 30)),
         enabled: anchor.enabled !== false,
         reminder: anchor.reminder !== false,
         accountabilityAfterMinutes: Math.max(0, Math.min(120, Number(anchor.accountabilityAfterMinutes) || 15)),
         dayRule: scheduleBlocks.length ? "schedule" : "everyday",
         scheduleBlockId: scheduleBlocks.length ? scheduleId : undefined,
         scheduleCategory: scheduleBlocks.length ? "work" : undefined,
         flexible: true,
         timingMode: scheduleBlocks.length ? "schedule-relative" : "fixed",
         scheduleOffsetMinutes: scheduleBlocks.length
            ? minutesFromClock(sanitizeClock(anchor.time, "08:00")) - minutesFromClock(sanitizeClock(raw.workStart, "09:00"))
            : undefined,
      }));

   return {
      version: 2,
      scheduleBlocks,
      anchors,
      remindersEnabled: raw.remindersEnabled === true,
      eveningResetEnabled: raw.eveningResetEnabled !== false,
      completions: raw.completions && typeof raw.completions === "object" ? (raw.completions as Record<string, string[]>) : {},
      skips: raw.skips && typeof raw.skips === "object" ? (raw.skips as Record<string, string[]>) : {},
      overrides: raw.overrides && typeof raw.overrides === "object" ? (raw.overrides as Record<string, Record<string, RhythmOverride>>) : {},
      scheduleExceptions: {},
      temporaryEntries: {},
      dayContexts: {},
      outcomes: {},
      updatedAt: Date.now(),
   };
}


function sanitizeTemporaryEntries(value: unknown): Record<string, RhythmTemporaryEntry[]> {
   if (!value || typeof value !== "object") return {};
   const result: Record<string, RhythmTemporaryEntry[]> = {};

   for (const [dateKey, entries] of Object.entries(value as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      result[dateKey] = entries
         .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
         .map((entry) => ({
            id: String(entry.id || makeId("temporary")).slice(0, 120),
            title: String(entry.title || "Temporary block").trim().slice(0, 120) || "Temporary block",
            category: sanitizeCategory(entry.category),
            time: sanitizeClock(entry.time, "08:00"),
            durationMinutes: Math.max(5, Math.min(360, Math.round(Number(entry.durationMinutes) || 30))),
            flexible: entry.flexible !== false,
            reason: entry.reason ? String(entry.reason).trim().slice(0, 240) : undefined,
            replacesAnchorId: entry.replacesAnchorId ? String(entry.replacesAnchorId).slice(0, 120) : undefined,
         }))
         .slice(-40);
   }

   return result;
}

function sanitizeDayContexts(value: unknown): Record<string, RhythmDayContext[]> {
   if (!value || typeof value !== "object") return {};
   const validKinds = new Set<RhythmDayContext["kind"]>(["recovery", "late", "sleep-in", "work-from-home", "event-change", "custom"]);
   const result: Record<string, RhythmDayContext[]> = {};

   for (const [dateKey, entries] of Object.entries(value as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      result[dateKey] = entries
         .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
         .map((entry) => {
            const rawKind = String(entry.kind || "custom") as RhythmDayContext["kind"];
            return {
               id: String(entry.id || makeId("context")).slice(0, 120),
               kind: validKinds.has(rawKind) ? rawKind : "custom",
               text: String(entry.text || "").trim().slice(0, 320),
               at: typeof entry.at === "number" && Number.isFinite(entry.at) ? entry.at : Date.now(),
            } satisfies RhythmDayContext;
         })
         .filter((entry) => Boolean(entry.text))
         .slice(-30);
   }

   return result;
}

function sanitizeOutcomes(value: unknown): Record<string, Record<string, RhythmOutcomeRecord>> {
   if (!value || typeof value !== "object") return {};
   const validKinds = new Set<RhythmOutcomeKind>(["completed", "skipped", "replaced", "suppressed", "moved"]);
   const result: Record<string, Record<string, RhythmOutcomeRecord>> = {};

   for (const [dateKey, rawEntries] of Object.entries(value as Record<string, unknown>)) {
      if (!rawEntries || typeof rawEntries !== "object") continue;
      const entries: Record<string, RhythmOutcomeRecord> = {};
      for (const [entryId, rawOutcome] of Object.entries(rawEntries as Record<string, unknown>)) {
         if (!rawOutcome || typeof rawOutcome !== "object") continue;
         const outcome = rawOutcome as Record<string, unknown>;
         const kind = String(outcome.kind || "") as RhythmOutcomeKind;
         if (!validKinds.has(kind)) continue;
         entries[entryId.slice(0, 120)] = {
            kind,
            at: typeof outcome.at === "number" && Number.isFinite(outcome.at) ? outcome.at : Date.now(),
            note: outcome.note ? String(outcome.note).trim().slice(0, 240) : undefined,
         };
      }
      result[dateKey] = entries;
   }

   return result;
}

function normalizeRhythm(raw: unknown): DailyRhythmState {
   const fallback = defaultDailyRhythm();
   if (!raw || typeof raw !== "object") return fallback;
   const value = raw as Record<string, unknown>;
   if (value.version !== 2) return migrateLegacy(value);

   const scheduleBlocks: RhythmScheduleBlock[] = Array.isArray(value.scheduleBlocks)
      ? value.scheduleBlocks
           .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
           .map((entry) => ({
              id: String(entry.id || makeId("schedule")).slice(0, 120),
              title: String(entry.title || "Schedule").slice(0, 120),
              category: sanitizeCategory(entry.category),
              days: sanitizeDays(entry.days),
              start: sanitizeClock(entry.start, "09:00"),
              end: sanitizeClock(entry.end, "17:00"),
              enabled: entry.enabled !== false,
           }))
           .filter((entry) => entry.days.length)
      : [];

   const anchors: RhythmAnchor[] = Array.isArray(value.anchors)
      ? value.anchors
           .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
           .map((entry) => {
              const rule: RhythmDayRule = entry.dayRule === "everyday" || entry.dayRule === "schedule" || entry.dayRule === "custom" ? entry.dayRule : "everyday";
              const category = sanitizeCategory(entry.category);
              const scheduleCategory = entry.scheduleCategory ? sanitizeCategory(entry.scheduleCategory) : undefined;
              const time = sanitizeClock(entry.time, "08:00");
              const timingMode: RhythmTimingMode =
                 entry.timingMode === "fixed" || entry.timingMode === "schedule-relative"
                    ? entry.timingMode
                    : rule === "schedule" && entry.flexible !== false
                      ? "schedule-relative"
                      : "fixed";
              const scheduleReferencePoint: RhythmScheduleReferencePoint =
                 entry.scheduleReferencePoint === "end" ? "end" : "start";
              const linkedBlock = entry.scheduleBlockId
                 ? scheduleBlocks.find((block) => block.id === String(entry.scheduleBlockId))
                 : undefined;
              const referenceClock = scheduleCategory
                 ? scheduleReferencePoint === "end"
                    ? dominantScheduleEndMinutes(scheduleBlocks, scheduleCategory)
                    : dominantScheduleStartMinutes(scheduleBlocks, scheduleCategory)
                 : linkedBlock
                   ? scheduleReferencePoint === "end"
                      ? linkedBlock.end
                      : linkedBlock.start
                   : undefined;
              const referenceMinutes =
                 typeof referenceClock === "number"
                    ? referenceClock
                    : typeof referenceClock === "string"
                      ? minutesFromClock(referenceClock)
                      : undefined;
              const scheduleOffsetMinutes =
                 typeof entry.scheduleOffsetMinutes === "number" && Number.isFinite(entry.scheduleOffsetMinutes)
                    ? Math.max(-720, Math.min(720, Math.round(entry.scheduleOffsetMinutes)))
                    : timingMode === "schedule-relative" && typeof referenceMinutes === "number"
                      ? minutesFromClock(time) - referenceMinutes
                      : undefined;

              return {
                 id: String(entry.id || makeId("anchor")).slice(0, 120),
                 title: String(entry.title || "Routine").slice(0, 120),
                 category,
                 time,
                 durationMinutes: Math.max(5, Math.min(360, Number(entry.durationMinutes) || 30)),
                 enabled: entry.enabled !== false,
                 reminder: entry.reminder !== false,
                 accountabilityAfterMinutes: Math.max(0, Math.min(120, Number(entry.accountabilityAfterMinutes) || 15)),
                 dayRule: rule,
                 scheduleBlockId: entry.scheduleBlockId ? String(entry.scheduleBlockId).slice(0, 120) : undefined,
                 scheduleCategory,
                 days: sanitizeDays(entry.days),
                 flexible: entry.flexible !== false,
                 timingMode,
                 scheduleReferencePoint,
                 scheduleOffsetMinutes,
              };
           })
      : [];

   return {
      version: 2,
      scheduleBlocks,
      anchors,
      remindersEnabled: value.remindersEnabled === true,
      eveningResetEnabled: value.eveningResetEnabled !== false,
      completions: value.completions && typeof value.completions === "object" ? (value.completions as Record<string, string[]>) : {},
      skips: value.skips && typeof value.skips === "object" ? (value.skips as Record<string, string[]>) : {},
      overrides: value.overrides && typeof value.overrides === "object" ? (value.overrides as Record<string, Record<string, RhythmOverride>>) : {},
      scheduleExceptions: value.scheduleExceptions && typeof value.scheduleExceptions === "object" ? (value.scheduleExceptions as Record<string, Record<string, ScheduleException>>) : {},
      temporaryEntries: sanitizeTemporaryEntries(value.temporaryEntries),
      dayContexts: sanitizeDayContexts(value.dayContexts),
      outcomes: sanitizeOutcomes(value.outcomes),
      updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
   };
}

export function readDailyRhythm() {
   if (!isBrowser()) return defaultDailyRhythm();
   try {
      const current = window.localStorage.getItem(DAILY_RHYTHM_STORAGE_KEY);
      if (current) return normalizeRhythm(JSON.parse(current));
      const legacy = window.localStorage.getItem(LEGACY_DAILY_RHYTHM_STORAGE_KEY);
      if (legacy) {
         const migrated = normalizeRhythm(JSON.parse(legacy));
         window.localStorage.setItem(DAILY_RHYTHM_STORAGE_KEY, JSON.stringify(migrated));
         return migrated;
      }
      return defaultDailyRhythm();
   } catch {
      return defaultDailyRhythm();
   }
}

export function saveDailyRhythm(next: DailyRhythmState) {
   const normalized = normalizeRhythm({ ...next, version: 2, updatedAt: Date.now() });
   if (isBrowser()) {
      window.localStorage.setItem(DAILY_RHYTHM_STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent(DAILY_RHYTHM_UPDATED_EVENT));
   }
   return normalized;
}

export function localDateKey(date = new Date()) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, "0");
   const day = String(date.getDate()).padStart(2, "0");
   return `${year}-${month}-${day}`;
}

export function minutesFromClock(clock: string) {
   const [hours, minutes] = clock.split(":").map(Number);
   return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

export function dominantScheduleStartMinutes(scheduleBlocks: RhythmScheduleBlock[], category: RhythmCategory) {
   const weighted = new Map<number, number>();
   for (const block of scheduleBlocks) {
      if (!block.enabled || block.category !== category) continue;
      const start = minutesFromClock(block.start);
      weighted.set(start, (weighted.get(start) || 0) + Math.max(1, block.days.length));
   }

   return [...weighted.entries()]
      .sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0];
}

export function dominantScheduleEndMinutes(scheduleBlocks: RhythmScheduleBlock[], category: RhythmCategory) {
   const weighted = new Map<number, number>();
   for (const block of scheduleBlocks) {
      if (!block.enabled || block.category !== category) continue;
      const end = minutesFromClock(block.end);
      weighted.set(end, (weighted.get(end) || 0) + Math.max(1, block.days.length));
   }

   return [...weighted.entries()]
      .sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0];
}

function scheduleStartForDate(state: DailyRhythmState, category: RhythmCategory, date: Date) {
   const key = localDateKey(date);
   const starts = state.scheduleBlocks
      .filter((block) => block.enabled && block.category === category && block.days.includes(date.getDay() as RhythmDay))
      .map((block) => {
         const exception = state.scheduleExceptions[key]?.[block.id];
         if (exception?.off) return null;
         return exception?.start || block.start;
      })
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => minutesFromClock(left) - minutesFromClock(right));

   return starts[0];
}

function scheduleEndForDate(state: DailyRhythmState, category: RhythmCategory, date: Date) {
   const key = localDateKey(date);
   const ends = state.scheduleBlocks
      .filter((block) => block.enabled && block.category === category && block.days.includes(date.getDay() as RhythmDay))
      .map((block) => {
         const exception = state.scheduleExceptions[key]?.[block.id];
         if (exception?.off) return null;
         return exception?.end || block.end;
      })
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => minutesFromClock(right) - minutesFromClock(left));

   return ends[0];
}

function resolveAnchorClockForDate(anchor: RhythmAnchor, state: DailyRhythmState, date: Date) {
   if (anchor.timingMode !== "schedule-relative") return anchor.time;

   const key = localDateKey(date);
   const point: RhythmScheduleReferencePoint = anchor.scheduleReferencePoint === "end" ? "end" : "start";
   let dayReference: string | undefined;
   let referenceMinutes: number | undefined;

   if (anchor.scheduleBlockId) {
      const block = state.scheduleBlocks.find((candidate) => candidate.id === anchor.scheduleBlockId && candidate.enabled);
      if (block?.days.includes(date.getDay() as RhythmDay)) {
         const exception = state.scheduleExceptions[key]?.[block.id];
         if (!exception?.off) {
            dayReference =
               point === "end"
                  ? exception?.end || block.end
                  : exception?.start || block.start;
            referenceMinutes = minutesFromClock(point === "end" ? block.end : block.start);
         }
      }
   } else if (anchor.scheduleCategory) {
      dayReference =
         point === "end"
            ? scheduleEndForDate(state, anchor.scheduleCategory, date)
            : scheduleStartForDate(state, anchor.scheduleCategory, date);
      referenceMinutes =
         point === "end"
            ? dominantScheduleEndMinutes(state.scheduleBlocks, anchor.scheduleCategory)
            : dominantScheduleStartMinutes(state.scheduleBlocks, anchor.scheduleCategory);
   }

   if (!dayReference) return anchor.time;

   const offset =
      typeof anchor.scheduleOffsetMinutes === "number"
         ? anchor.scheduleOffsetMinutes
         : typeof referenceMinutes === "number"
           ? minutesFromClock(anchor.time) - referenceMinutes
           : 0;

   return clockFromMinutes(minutesFromClock(dayReference) + offset);
}

export function formatClock(clock: string) {
   const total = minutesFromClock(clock);
   const hours24 = Math.floor(total / 60) % 24;
   const minutes = total % 60;
   const suffix = hours24 >= 12 ? "PM" : "AM";
   const hour = hours24 % 12 || 12;
   return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function clockFromMinutes(total: number) {
   const normalized = ((total % 1440) + 1440) % 1440;
   return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function appliesOnDate(anchor: RhythmAnchor, state: DailyRhythmState, date: Date) {
   const day = date.getDay() as RhythmDay;
   if (anchor.dayRule === "everyday") return true;
   if (anchor.dayRule === "custom") return (anchor.days || []).includes(day);

   if (anchor.scheduleCategory) {
      const key = localDateKey(date);
      return state.scheduleBlocks.some(
         (candidate) =>
            candidate.category === anchor.scheduleCategory &&
            candidate.enabled &&
            candidate.days.includes(day) &&
            !state.scheduleExceptions[key]?.[candidate.id]?.off,
      );
   }

   const block = state.scheduleBlocks.find((candidate) => candidate.id === anchor.scheduleBlockId && candidate.enabled);
   if (!block?.days.includes(day)) return false;
   return !state.scheduleExceptions[localDateKey(date)]?.[block.id]?.off;
}

function scheduleEntryForDate(block: RhythmScheduleBlock, state: DailyRhythmState, date: Date, nowMinutes: number): RhythmEntry | null {
   if (!block.enabled || !block.days.includes(date.getDay() as RhythmDay)) return null;
   const key = localDateKey(date);
   const exception = state.scheduleExceptions[key]?.[block.id];
   if (exception?.off) return null;
   const start = exception?.start || block.start;
   const end = exception?.end || block.end;
   const startMinutes = minutesFromClock(start);
   const endMinutes = minutesFromClock(end);
   const status: RhythmEntry["status"] = nowMinutes < startMinutes ? "upcoming" : nowMinutes <= endMinutes ? "due" : "missed";
   return {
      id: `schedule:${block.id}`,
      sourceId: block.id,
      kind: "schedule",
      title: block.title,
      category: block.category,
      time: start,
      endTime: end,
      durationMinutes: Math.max(0, endMinutes - startMinutes),
      completed: false,
      skipped: false,
      status,
      canComplete: false,
      flexible: false,
   };
}

export function buildRhythmForDate(state: DailyRhythmState, date = new Date()): RhythmEntry[] {
   const key = localDateKey(date);
   const isToday = key === localDateKey(new Date());
   const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
   const completed = new Set(state.completions[key] || []);
   const skipped = new Set(state.skips[key] || []);
   const overrides = state.overrides[key] || {};

   const anchors: RhythmEntry[] = state.anchors
      .filter((anchor) => anchor.enabled && appliesOnDate(anchor, state, date))
      .map((anchor) => {
         const override = overrides[anchor.id];
         const time = override?.time || resolveAnchorClockForDate(anchor, state, date);
         const durationMinutes = override?.durationMinutes ?? anchor.durationMinutes;
         const start = minutesFromClock(time);
         const end = start + durationMinutes;
         const isComplete = completed.has(anchor.id);
         const isSkipped = skipped.has(anchor.id);
         const status: RhythmEntry["status"] = isComplete
            ? "completed"
            : isSkipped
              ? "skipped"
              : nowMinutes < 0 || nowMinutes < start
                ? "upcoming"
                : nowMinutes <= end
                  ? "due"
                  : "missed";

         return {
            id: `anchor:${anchor.id}`,
            sourceId: anchor.id,
            kind: "anchor",
            title: anchor.title,
            category: anchor.category,
            time,
            durationMinutes,
            completed: isComplete,
            skipped: isSkipped,
            status,
            canComplete: true,
            flexible: anchor.flexible,
         };
      });

   const schedules = state.scheduleBlocks
      .map((block) => scheduleEntryForDate(block, state, date, nowMinutes))
      .filter((entry): entry is RhythmEntry => Boolean(entry));

   // Temporary entries live only on the selected date. They use the same
   // completion/skip collections as recurring anchors so Up Next and Calendar
   // do not need a second state model.
   const temporary: RhythmEntry[] = (state.temporaryEntries[key] || []).map((entry) => {
      const start = minutesFromClock(entry.time);
      const end = start + entry.durationMinutes;
      const isComplete = completed.has(entry.id);
      const isSkipped = skipped.has(entry.id);
      const status: RhythmEntry["status"] = isComplete
         ? "completed"
         : isSkipped
           ? "skipped"
           : nowMinutes < 0 || nowMinutes < start
             ? "upcoming"
             : nowMinutes <= end
               ? "due"
               : "missed";

      return {
         id: `temporary:${entry.id}`,
         sourceId: entry.id,
         kind: "anchor",
         title: entry.title,
         category: entry.category,
         time: entry.time,
         durationMinutes: entry.durationMinutes,
         completed: isComplete,
         skipped: isSkipped,
         status,
         canComplete: true,
         flexible: entry.flexible,
      };
   });

   return [...anchors, ...temporary, ...schedules].sort((left, right) => minutesFromClock(left.time) - minutesFromClock(right.time));
}

export function buildTodayRhythm(state: DailyRhythmState) {
   return buildRhythmForDate(state, new Date());
}

function withOutcome(
   state: DailyRhythmState,
   date: Date,
   id: string,
   kind: RhythmOutcomeKind,
   note?: string,
) {
   const key = localDateKey(date);
   return {
      ...state.outcomes,
      [key]: {
         ...(state.outcomes[key] || {}),
         [id]: { kind, at: Date.now(), note },
      },
   };
}

export function setRhythmCompletion(state: DailyRhythmState, id: RhythmAnchorId, done: boolean, date = new Date()) {
   const key = localDateKey(date);
   const current = new Set(state.completions[key] || []);
   if (done) current.add(id);
   else current.delete(id);

   // A completed recommendation should count toward progression only after the
   // activity actually happens. The outcome record gives downstream systems
   // that explicit signal.
   return saveDailyRhythm({
      ...state,
      completions: { ...state.completions, [key]: [...current] },
      outcomes: done ? withOutcome(state, date, id, "completed") : state.outcomes,
   });
}

export function skipRhythmAnchor(
   state: DailyRhythmState,
   id: RhythmAnchorId,
   date = new Date(),
   kind: RhythmOutcomeKind = "skipped",
   note?: string,
) {
   const key = localDateKey(date);
   const current = new Set(state.skips[key] || []);
   current.add(id);
   return saveDailyRhythm({
      ...state,
      skips: { ...state.skips, [key]: [...current] },
      outcomes: withOutcome(state, date, id, kind, note),
   });
}

/**
 * Adds context to one calendar day. Context never mutates the recurring
 * routine; it simply gives replanning/recommendation code truthful situational
 * information for that date.
 */
export function addRhythmDayContext(
   state: DailyRhythmState,
   kind: RhythmDayContext["kind"],
   text: string,
   date = new Date(),
) {
   const key = localDateKey(date);
   const entry: RhythmDayContext = {
      id: makeId("context"),
      kind,
      text: String(text || "").trim().slice(0, 320),
      at: Date.now(),
   };
   if (!entry.text) return state;
   return saveDailyRhythm({
      ...state,
      dayContexts: {
         ...state.dayContexts,
         [key]: [...(state.dayContexts[key] || []), entry].slice(-30),
      },
   });
}

export function getRhythmDayContexts(state: DailyRhythmState, date = new Date()) {
   return state.dayContexts[localDateKey(date)] || [];
}

/**
 * Creates a one-day activity without changing the user's permanent routine.
 * This is the mechanism used for replacements such as "code instead of gym".
 */
export function addTemporaryRhythmEntry(
   state: DailyRhythmState,
   input: Omit<RhythmTemporaryEntry, "id"> & { id?: string },
   date = new Date(),
) {
   const key = localDateKey(date);
   const entry: RhythmTemporaryEntry = {
      id: input.id || makeId("temporary"),
      title: String(input.title || "Temporary block").trim().slice(0, 120) || "Temporary block",
      category: sanitizeCategory(input.category),
      time: sanitizeClock(input.time, "08:00"),
      durationMinutes: Math.max(5, Math.min(360, Math.round(input.durationMinutes || 30))),
      flexible: input.flexible !== false,
      reason: input.reason ? String(input.reason).trim().slice(0, 240) : undefined,
      replacesAnchorId: input.replacesAnchorId,
   };

   return saveDailyRhythm({
      ...state,
      temporaryEntries: {
         ...state.temporaryEntries,
         [key]: [...(state.temporaryEntries[key] || []), entry].slice(-40),
      },
   });
}

/**
 * Replaces a recurring routine for one day. The recurring anchor remains
 * untouched; only this occurrence is marked replaced and a temporary block
 * takes its place.
 */
export function replaceRhythmAnchorForDay(
   state: DailyRhythmState,
   anchorId: RhythmAnchorId,
   replacement: Omit<RhythmTemporaryEntry, "id" | "replacesAnchorId">,
   date = new Date(),
) {
   const skipped = skipRhythmAnchor(state, anchorId, date, "replaced", `Replaced with ${replacement.title}`);
   return addTemporaryRhythmEntry(
      skipped,
      { ...replacement, replacesAnchorId: anchorId },
      date,
   );
}

/**
 * Moves one occurrence only. This writes a date-scoped override and preserves
 * the base recurring time for every other day.
 */
export function moveRhythmAnchorForDay(
   state: DailyRhythmState,
   anchorId: RhythmAnchorId,
   time: string,
   date = new Date(),
   durationMinutes?: number,
   note?: string,
) {
   const key = localDateKey(date);
   const overrides = {
      ...state.overrides,
      [key]: {
         ...(state.overrides[key] || {}),
         [anchorId]: {
            ...(state.overrides[key]?.[anchorId] || {}),
            time: sanitizeClock(time, "08:00"),
            ...(durationMinutes ? { durationMinutes: Math.max(5, Math.min(360, Math.round(durationMinutes))) } : {}),
         },
      },
   };
   return saveDailyRhythm({
      ...state,
      overrides,
      outcomes: withOutcome(state, date, anchorId, "moved", note),
   });
}

export function updateRhythmAnchorTime(state: DailyRhythmState, id: RhythmAnchorId, time: string) {
   const anchors = state.anchors.map((anchor) => {
      if (anchor.id !== id) return anchor;
      if (anchor.timingMode !== "schedule-relative") return { ...anchor, time };

      const category =
         anchor.scheduleCategory ||
         state.scheduleBlocks.find((block) => block.id === anchor.scheduleBlockId)?.category;
      const reference = category ? dominantScheduleStartMinutes(state.scheduleBlocks, category) : undefined;
      return {
         ...anchor,
         time,
         scheduleOffsetMinutes: typeof reference === "number" ? minutesFromClock(time) - reference : anchor.scheduleOffsetMinutes,
      };
   });
   return saveDailyRhythm({ ...state, anchors });
}

export function upsertScheduleBlock(
   state: DailyRhythmState,
   input: Omit<RhythmScheduleBlock, "id"> & { id?: string },
) {
   const block: RhythmScheduleBlock = {
      ...input,
      id: input.id || makeId("schedule"),
      title: String(input.title || "Schedule").trim().slice(0, 120) || "Schedule",
      category: sanitizeCategory(input.category),
      days: sanitizeDays(input.days),
      start: sanitizeClock(input.start, "09:00"),
      end: sanitizeClock(input.end, "17:00"),
      enabled: input.enabled !== false,
   };
   if (!block.days.length) return state;

   const existing = state.scheduleBlocks.some((candidate) => candidate.id === block.id);
   return saveDailyRhythm({
      ...state,
      scheduleBlocks: existing
         ? state.scheduleBlocks.map((candidate) => (candidate.id === block.id ? block : candidate))
         : [...state.scheduleBlocks, block],
   });
}

export function upsertRhythmAnchor(
   state: DailyRhythmState,
   input: Omit<RhythmAnchor, "id"> & { id?: string },
) {
   const category = sanitizeCategory(input.category);
   const time = sanitizeClock(input.time, "08:00");
   const timingMode: RhythmTimingMode = input.timingMode === "schedule-relative" ? "schedule-relative" : "fixed";
   const scheduleCategory = input.scheduleCategory ? sanitizeCategory(input.scheduleCategory) : undefined;
   const scheduleBlockId = input.scheduleBlockId ? String(input.scheduleBlockId).slice(0, 120) : undefined;
   const scheduleReferencePoint: RhythmScheduleReferencePoint =
      input.scheduleReferencePoint === "end" ? "end" : "start";
   const linkedBlock = state.scheduleBlocks.find((block) => block.id === scheduleBlockId);
   const linkedCategory = scheduleCategory || linkedBlock?.category;
   const reference =
      linkedCategory
         ? scheduleReferencePoint === "end"
            ? dominantScheduleEndMinutes(state.scheduleBlocks, linkedCategory)
            : dominantScheduleStartMinutes(state.scheduleBlocks, linkedCategory)
         : linkedBlock
           ? minutesFromClock(scheduleReferencePoint === "end" ? linkedBlock.end : linkedBlock.start)
           : undefined;
   const scheduleOffsetMinutes =
      timingMode === "schedule-relative"
         ? typeof input.scheduleOffsetMinutes === "number" && Number.isFinite(input.scheduleOffsetMinutes)
            ? Math.max(-720, Math.min(720, Math.round(input.scheduleOffsetMinutes)))
            : typeof reference === "number"
              ? minutesFromClock(time) - reference
              : undefined
         : undefined;

   const anchor: RhythmAnchor = {
      ...input,
      id: input.id || makeId("anchor"),
      title: String(input.title || "Routine").trim().slice(0, 120) || "Routine",
      category,
      time,
      durationMinutes: Math.max(5, Math.min(360, Math.round(input.durationMinutes || 30))),
      enabled: input.enabled !== false,
      reminder: input.reminder !== false,
      accountabilityAfterMinutes: Math.max(0, Math.min(120, Math.round(input.accountabilityAfterMinutes || 15))),
      dayRule: input.dayRule === "schedule" || input.dayRule === "custom" ? input.dayRule : "everyday",
      scheduleBlockId,
      scheduleCategory,
      days: sanitizeDays(input.days),
      flexible: input.flexible !== false,
      timingMode,
      scheduleReferencePoint,
      scheduleOffsetMinutes,
   };

   const existing = state.anchors.some((candidate) => candidate.id === anchor.id);
   return saveDailyRhythm({
      ...state,
      anchors: existing
         ? state.anchors.map((candidate) => (candidate.id === anchor.id ? anchor : candidate))
         : [...state.anchors, anchor],
   });
}

export function removeRhythmAnchor(state: DailyRhythmState, id: RhythmAnchorId) {
   return saveDailyRhythm({ ...state, anchors: state.anchors.filter((anchor) => anchor.id !== id) });
}

export function removeScheduleBlock(state: DailyRhythmState, id: string) {
   return saveDailyRhythm({
      ...state,
      scheduleBlocks: state.scheduleBlocks.filter((block) => block.id !== id),
      anchors: state.anchors.map((anchor) => anchor.scheduleBlockId === id ? { ...anchor, dayRule: "everyday" as const, scheduleBlockId: undefined } : anchor),
   });
}

function parseClock(value: string) {
   const match = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
   if (!match) return null;
   let hours = Number(match[1]);
   const minutes = Number(match[2] || 0);
   const suffix = match[3]?.toLowerCase();
   if (suffix === "pm" && hours < 12) hours += 12;
   if (suffix === "am" && hours === 12) hours = 0;
   if (!suffix && hours > 23) return null;
   if (hours > 23 || minutes > 59) return null;
   return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const DAY_INDEX: Record<string, RhythmDay> = {
   sunday: 0,
   monday: 1,
   tuesday: 2,
   wednesday: 3,
   thursday: 4,
   friday: 5,
   saturday: 6,
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY_TOKEN_PATTERN = String.raw`(?:sun(?:day)?s?|mon(?:day)?s?|tue(?:sday)?s?|wed(?:nesday)?s?|thu(?:rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?)`;

function dayFromToken(value: string): RhythmDay | null {
   const lower = value.toLowerCase().replace(/[^a-z]/g, "");
   if (lower.startsWith("sun")) return 0;
   if (lower.startsWith("mon")) return 1;
   if (lower.startsWith("tue")) return 2;
   if (lower.startsWith("wed")) return 3;
   if (lower.startsWith("thu")) return 4;
   if (lower.startsWith("fri")) return 5;
   if (lower.startsWith("sat")) return 6;
   return null;
}

function parseDayRange(value: string): RhythmDay[] | null {
   const rangePattern = new RegExp(`\\b(${DAY_TOKEN_PATTERN})\\s*(?:through|thru|to|-)\\s*(${DAY_TOKEN_PATTERN})\\b`, "i");
   const match = value.match(rangePattern);
   if (!match) return null;

   const start = dayFromToken(match[1]);
   const end = dayFromToken(match[2]);
   if (start === null || end === null) return null;

   const result: RhythmDay[] = [];
   let day = start;
   for (let count = 0; count < 7; count += 1) {
      result.push(day);
      if (day === end) break;
      day = ((day + 1) % 7) as RhythmDay;
   }
   return result;
}

function parseSingleDay(value: string) {
   const token = value.match(new RegExp(`\\b(${DAY_TOKEN_PATTERN})\\b`, "i"))?.[1];
   const day = token ? dayFromToken(token) : null;
   return day === null ? null : [day];
}

function parseDaySpec(value: string): RhythmDay[] | null {
   const lower = value.toLowerCase();

   if (/\bweekdays?\b/.test(lower)) return [1, 2, 3, 4, 5];
   if (/\bweekends?\b/.test(lower)) return [0, 6];
   if (/\b(?:every day|daily)\b/.test(lower)) return [0, 1, 2, 3, 4, 5, 6];

   const range = parseDayRange(lower);
   if (range) return range;

   const tokens = [...lower.matchAll(new RegExp(`\\b(${DAY_TOKEN_PATTERN})\\b`, "gi"))]
      .map((match) => dayFromToken(match[1]))
      .filter((day): day is RhythmDay => day !== null);

   if (!tokens.length) return null;
   return [...new Set(tokens)].sort() as RhythmDay[];
}

function scheduleSegmentsOverlap(segments: ReturnType<typeof parseScheduleMutationSegments>) {
   const seen = new Set<RhythmDay>();
   for (const segment of segments) {
      for (const day of segment.days) {
         if (seen.has(day)) return day;
         seen.add(day);
      }
   }
   return null;
}

const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayPhrase(days: RhythmDay[]) {
   const sorted = [...new Set(days)].sort() as RhythmDay[];
   if (sorted.length === 7) return "every day";
   if (sorted.length === 1) return FULL_DAY_NAMES[sorted[0]];
   const contiguous = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
   if (contiguous && sorted.length >= 3) return `${FULL_DAY_NAMES[sorted[0]]}–${FULL_DAY_NAMES[sorted.at(-1)!]}`;
   return sorted.map((day) => FULL_DAY_NAMES[day]).join(", ");
}

function fullScheduleReplacementRequested(lower: string, category: "work" | "school") {
   const label = category === "work" ? "work" : "(?:class|school)";
   return new RegExp(`\\b(?:replace|overwrite)\\s+(?:my\\s+)?(?:(?:entire|whole|full|complete)\\s+)?${label}\\s+schedule\\b`, "i").test(lower) ||
      new RegExp(`\\bmy\\s+(?:entire|whole|full|complete)\\s+${label}\\s+schedule\\s+(?:is|will be)\\b`, "i").test(lower);
}

function scheduleMutationReply(
   title: string,
   category: RhythmCategory,
   result: ScheduleMutationResult,
) {
   const blocks = result.state.scheduleBlocks
      .filter((block) => block.category === category && block.enabled)
      .sort((left, right) => Math.min(...left.days) - Math.min(...right.days) || minutesFromClock(left.start) - minutesFromClock(right.start));
   const schedule = blocks
      .map((block) => `${dayPhrase(block.days)} ${formatClock(block.start)}–${formatClock(block.end)}`)
      .join(" and ");
   const action = result.kind === "replaced"
      ? `Replaced your full ${title} schedule.`
      : result.kind === "added"
        ? `Added ${dayPhrase(result.affectedDays)}.`
        : `Updated ${dayPhrase(result.affectedDays)}.`;
   return `${action} Your ${title} schedule is now ${schedule}.`;
}

function parseTargetDate(lower: string) {
   const date = new Date();
   if (/\btomorrow\b/.test(lower)) date.setDate(date.getDate() + 1);
   else if (/\btoday\b/.test(lower)) return date;
   else {
      const single = parseSingleDay(lower);
      if (!single) return null;
      const target = single[0];
      let delta = (target - date.getDay() + 7) % 7;
      if (delta === 0 && /\bnext\b/.test(lower)) delta = 7;
      date.setDate(date.getDate() + delta);
   }
   return date;
}

function inferCategory(title: string): RhythmCategory {
   if (/work|shift|office/i.test(title)) return "work";
   if (/class|school|lecture|study/i.test(title)) return "school";
   if (/exercise|workout|gym|run|walk|yoga/i.test(title)) return "exercise";
   if (/breakfast|coffee|matcha|lunch|dinner|meal|eat/i.test(title)) return "meal";
   if (/kid|child|parent|care/i.test(title)) return "care";
   if (/clean|laundry|home/i.test(title)) return "home";
   return "personal";
}

function primarySchedule(state: DailyRhythmState) {
   return state.scheduleBlocks.find((block) => block.category === "work" && block.enabled) || state.scheduleBlocks.find((block) => block.enabled);
}

function findAnchor(state: DailyRhythmState, prompt: string) {
   const lower = prompt.toLowerCase();
   const exact = state.anchors.find((anchor) => lower.includes(anchor.title.toLowerCase()));
   if (exact) return exact;
   const scored = state.anchors
      .map((anchor) => ({
         anchor,
         score: anchor.title.toLowerCase().split(/\s+/).filter((word) => word.length > 2 && lower.includes(word)).length,
      }))
      .sort((a, b) => b.score - a.score);
   return scored[0]?.score ? scored[0].anchor : null;
}

function titleFromRoutineCommand(raw: string) {
   const clean = raw
      .replace(/^(?:please\s+)?(?:add|create|set up|schedule)\s+/i, "")
      .replace(/\s+(?:at|for|on)\s+\d[\s\S]*$/i, "")
      .replace(/\s+on\s+(?:workdays|every day|daily|weekdays|weekends|sunday|monday|tuesday|wednesday|thursday|friday|saturday)[\s\S]*$/i, "")
      .trim()
      .replace(/^my\s+/i, "")
      .replace(/^(?:a|an|the)\s+/i, "")
      .replace(/\s+routine$/i, "")
      .trim()
      .slice(0, 120);
   return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
}

function parseDuration(lower: string) {
   return parseExplicitDurationMinutes(lower) ?? 30;
}

function routineDays(
   lower: string,
   state: DailyRhythmState,
): Pick<RhythmAnchor, "dayRule" | "scheduleBlockId" | "scheduleCategory" | "days"> {
   if (/\bon\s+workdays\b/.test(lower)) {
      const hasWorkSchedule = state.scheduleBlocks.some((block) => block.category === "work" && block.enabled);
      if (hasWorkSchedule) return { dayRule: "schedule", scheduleCategory: "work" };
   }

   if (/\bon\s+school days\b/.test(lower)) {
      const hasSchoolSchedule = state.scheduleBlocks.some((block) => block.category === "school" && block.enabled);
      if (hasSchoolSchedule) return { dayRule: "schedule", scheduleCategory: "school" };
   }

   if (/\bon\s+schedule days\b/.test(lower)) {
      const schedule = primarySchedule(state);
      if (schedule) return { dayRule: "schedule", scheduleCategory: schedule.category };
   }

   if (/\b(?:every day|daily)\b/.test(lower)) return { dayRule: "everyday" };
   if (/\bweekdays\b/.test(lower)) return { dayRule: "custom", days: [1, 2, 3, 4, 5] };
   if (/\bweekends\b/.test(lower)) return { dayRule: "custom", days: [0, 6] };

   const days = parseDaySpec(lower);
   if (days) return { dayRule: "custom", days };

   return { dayRule: "everyday" };
}


type RelativeScheduleReference = {
   direction: "before" | "after";
   offsetMinutes: number;
   referencePoint: RhythmScheduleReferencePoint;
   scheduleCategory?: RhythmCategory;
   scheduleBlockId?: string;
   label: string;
};

function parseNaturalOffsetMinutes(lower: string) {
   const halfHour = /\bhalf\s+(?:an?\s+)?hour\b/.test(lower) ? 30 : 0;
   const oneHour = /\b(?:an?|one)\s+hour\b/.test(lower) ? 60 : 0;

   const halfMatch = lower.match(/\b(\d{1,2})\s+and\s+(?:a\s+)?half\s+hours?\b/);
   if (halfMatch) return Number(halfMatch[1]) * 60 + 30;

   const hourMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
   const minuteMatch = lower.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/);

   let total = 0;
   if (hourMatch) total += Math.round(Number(hourMatch[1]) * 60);
   else if (oneHour) total += oneHour;
   else if (halfHour) total += halfHour;

   if (minuteMatch) total += Number(minuteMatch[1]);
   return total > 0 ? Math.max(5, Math.min(720, total)) : null;
}

function scheduleReferenceFromPrompt(
   lower: string,
   state: DailyRhythmState,
): Omit<RelativeScheduleReference, "direction" | "offsetMinutes" | "referencePoint"> | null {
   if (/\b(?:work|shift)\b/.test(lower)) {
      const hasWork = state.scheduleBlocks.some((block) => block.enabled && block.category === "work");
      if (hasWork) return { scheduleCategory: "work", label: "work" };
   }

   if (/\b(?:school|class|classes)\b/.test(lower)) {
      const hasSchool = state.scheduleBlocks.some((block) => block.enabled && block.category === "school");
      if (hasSchool) return { scheduleCategory: "school", label: "class" };
   }

   const byTitle = state.scheduleBlocks
      .filter((block) => block.enabled)
      .sort((left, right) => right.title.length - left.title.length)
      .find((block) => {
         const title = block.title.toLowerCase();
         return title.length > 2 && (
            lower.includes(`before ${title}`) ||
            lower.includes(`after ${title}`) ||
            lower.includes(`before my ${title}`) ||
            lower.includes(`after my ${title}`)
         );
      });

   return byTitle ? { scheduleBlockId: byTitle.id, label: byTitle.title } : null;
}

function parseRelativeScheduleReference(lower: string, state: DailyRhythmState): RelativeScheduleReference | null {
   const directionMatch = lower.match(/\b(before|after)\b/);
   if (!directionMatch) return null;

   const offsetMinutes = parseNaturalOffsetMinutes(lower);
   if (!offsetMinutes) return null;

   const reference = scheduleReferenceFromPrompt(lower, state);
   if (!reference) return null;

   const direction = directionMatch[1] === "after" ? "after" : "before";
   const explicitlyStart =
      /\b(?:after|before)\s+(?:the\s+)?(?:start|beginning)\s+of\b/.test(lower) ||
      /\b(?:after|before)\b[^.?!]{0,40}\b(?:starts?|begins?)\b/.test(lower);
   const explicitlyEnd =
      /\b(?:after|before)\s+(?:the\s+)?end\s+of\b/.test(lower) ||
      /\b(?:after|before)\b[^.?!]{0,40}\b(?:ends?|finishes?)\b/.test(lower);

   const referencePoint: RhythmScheduleReferencePoint =
      explicitlyStart ? "start" :
      explicitlyEnd ? "end" :
      direction === "after" ? "end" : "start";

   return {
      ...reference,
      direction,
      referencePoint,
      offsetMinutes: direction === "after" ? offsetMinutes : -offsetMinutes,
   };
}

function titleFromRelativeRoutineCommand(raw: string) {
   const clean = raw
      .replace(/^(?:please\s+)?(?:add|create|set up|schedule)\s+/i, "")
      .replace(/\s+(?:(?:\d{1,2}\s+and\s+(?:a\s+)?half)|(?:\d+(?:\.\d+)?)\b|(?:an?|one|half)\b)\s*(?:hours?|hrs?|minutes?|mins?)?\b[\s\S]*?\b(?:before|after)\b[\s\S]*$/i, "")
      .replace(/\s+\b(?:before|after)\b[\s\S]*$/i, "")
      .replace(/^my\s+/i, "")
      .replace(/^(?:a|an|the)\s+/i, "")
      .replace(/\s+routine$/i, "")
      .trim()
      .slice(0, 120);

   return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
}

function relativeReferenceMinutes(reference: RelativeScheduleReference, state: DailyRhythmState) {
   if (reference.scheduleBlockId) {
      const block = state.scheduleBlocks.find((candidate) => candidate.id === reference.scheduleBlockId);
      if (!block) return undefined;
      return minutesFromClock(reference.referencePoint === "end" ? block.end : block.start);
   }
   if (reference.scheduleCategory) {
      return reference.referencePoint === "end"
         ? dominantScheduleEndMinutes(state.scheduleBlocks, reference.scheduleCategory)
         : dominantScheduleStartMinutes(state.scheduleBlocks, reference.scheduleCategory);
   }
   return undefined;
}

function relativeReply(title: string, reference: RelativeScheduleReference) {
   const magnitude = Math.abs(reference.offsetMinutes);
   const hours = Math.floor(magnitude / 60);
   const minutes = magnitude % 60;
   const amount = [
      hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "",
      minutes ? `${minutes} minutes` : "",
   ].filter(Boolean).join(" ");
   const boundary = reference.referencePoint === "end" ? `${reference.label} ends` : `${reference.label} starts`;
   return `${title} now runs ${amount} ${reference.direction} ${boundary}.`;
}


export interface RhythmConversationResult {
   handled: boolean;
   changed: boolean;
   reply: string;
}

export function isRhythmMutationPrompt(prompt: string) {
   const lower = prompt.toLowerCase();
   return /\b(?:i work|my work schedule|i have class|my class schedule|add|create|schedule|move|change|set|make|put|skip|not doing|done|finished|completed|off work|working .* this week|remove|delete|should be|should last|lasts?)\b/.test(lower);
}

export function interpretRhythmConversation(prompt: string, current: DailyRhythmState, tone: AllevinTone = "direct"): RhythmConversationResult {
   const raw = prompt.trim();
   const lower = raw.toLowerCase();
   if (!raw) return { handled: false, changed: false, reply: "" };

   if (/\b(?:what does|what'?s|show me)\s+(?:my\s+)?(?:morning|day|schedule)\b/.test(lower)) {
      const entries = buildTodayRhythm(current).filter((entry) => !entry.completed && !entry.skipped);
      if (!entries.length) return { handled: true, changed: false, reply: "Nothing is scheduled in your rhythm today." };
      return { handled: true, changed: false, reply: entries.map((entry) => `${formatClock(entry.time)} — ${entry.title}`).join("\n") };
   }

   if (/\b(?:i work|my work schedule|work schedule)\b/.test(lower)) {
      const segments = parseScheduleMutationSegments(lower);
      if (segments.length) {
         const overlap = scheduleSegmentsOverlap(segments);
         if (overlap !== null) {
            return {
               handled: true,
               changed: false,
               reply: `I heard more than one work time for ${DAY_NAMES[overlap]}. Which one should I keep?`,
            };
         }

         const mutation = applyScheduleMutation(
            current,
            "work",
            "Work",
            segments,
            fullScheduleReplacementRequested(lower, "work") ? "replace" : "merge",
         );
         const saved = saveDailyRhythm(mutation.state);
         return {
            handled: true,
            changed: true,
            reply: scheduleMutationReply("Work", "work", { ...mutation, state: saved }),
         };
      }
   }

   if (/\b(?:i have class|my class schedule|school schedule)\b/.test(lower)) {
      const segments = parseScheduleMutationSegments(lower);
      if (segments.length) {
         const overlap = scheduleSegmentsOverlap(segments);
         if (overlap !== null) {
            return {
               handled: true,
               changed: false,
               reply: `I heard more than one class time for ${DAY_NAMES[overlap]}. Which one should I keep?`,
            };
         }

         const mutation = applyScheduleMutation(
            current,
            "school",
            "Class",
            segments,
            fullScheduleReplacementRequested(lower, "school") ? "replace" : "merge",
         );
         const saved = saveDailyRhythm(mutation.state);
         return {
            handled: true,
            changed: true,
            reply: scheduleMutationReply("Class", "school", { ...mutation, state: saved }),
         };
      }
   }

   const relativeReference = parseRelativeScheduleReference(lower, current);

   if (
      relativeReference &&
      /\b(?:add|create|set up|schedule)\b/.test(lower) &&
      /\b(?:routine|every day|daily|workdays|weekdays|weekends|every sunday|every monday|every tuesday|every wednesday|every thursday|every friday|every saturday|on workdays|on school days)\b/.test(lower)
   ) {
      const title = titleFromRelativeRoutineCommand(raw);
      if (title) {
         const referenceStart = relativeReferenceMinutes(relativeReference, current);
         const dayRule: RhythmDayRule = "schedule";
         const anchor: RhythmAnchor = {
            id: makeId("anchor"),
            title,
            category: inferCategory(title),
            time: typeof referenceStart === "number"
               ? clockFromMinutes(referenceStart + relativeReference.offsetMinutes)
               : "08:00",
            durationMinutes: parseDuration(lower),
            enabled: true,
            reminder: true,
            accountabilityAfterMinutes: 15,
            flexible: true,
            dayRule,
            scheduleCategory: relativeReference.scheduleCategory,
            scheduleBlockId: relativeReference.scheduleBlockId,
            timingMode: "schedule-relative",
            scheduleReferencePoint: relativeReference.referencePoint,
            scheduleOffsetMinutes: relativeReference.offsetMinutes,
         };
         saveDailyRhythm({ ...current, anchors: [...current.anchors, anchor] });
         return { handled: true, changed: true, reply: relativeReply(title, relativeReference) };
      }
   }

   if (/\b(?:add|create|set up|schedule)\b/.test(lower) && /\b(?:routine|every day|daily|workdays|weekdays|weekends|every sunday|every monday|every tuesday|every wednesday|every thursday|every friday|every saturday|on workdays)\b/.test(lower) && /\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(lower)) {
      const timeMatch = lower.match(/\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
      const time = timeMatch ? parseClock(timeMatch[1]) : null;
      const title = titleFromRoutineCommand(raw);
      if (time && title) {
         const dayConfig = routineDays(lower, current);
         const linkedCategory = dayConfig.scheduleCategory;
         const reference = linkedCategory ? dominantScheduleStartMinutes(current.scheduleBlocks, linkedCategory) : undefined;
         const anchor: RhythmAnchor = {
            id: makeId("anchor"),
            title,
            category: inferCategory(title),
            time,
            durationMinutes: parseDuration(lower),
            enabled: true,
            reminder: true,
            accountabilityAfterMinutes: 15,
            flexible: true,
            timingMode: dayConfig.dayRule === "schedule" ? "schedule-relative" : "fixed",
            scheduleReferencePoint: dayConfig.dayRule === "schedule" ? "start" : undefined,
            scheduleOffsetMinutes:
               dayConfig.dayRule === "schedule" && typeof reference === "number"
                  ? minutesFromClock(time) - reference
                  : undefined,
            ...dayConfig,
         };
         saveDailyRhythm({ ...current, anchors: [...current.anchors, anchor] });
         return { handled: true, changed: true, reply: `${title} is in the rhythm at ${formatClock(time)}.` };
      }
   }

   if (/\b(?:make|set|change|adjust)\b/.test(lower) && /\b(?:routines?|rhythm)\b/.test(lower) && /\b(?:follow|relative|adjust)\b/.test(lower) && /\b(?:work|school)\b/.test(lower)) {
      const category: RhythmCategory = /\bschool\b/.test(lower) ? "school" : "work";
      const reference = dominantScheduleStartMinutes(current.scheduleBlocks, category);
      if (typeof reference !== "number") return { handled: true, changed: false, reply: `There is no ${category} schedule to follow yet.` };
      let changed = 0;
      const anchors = current.anchors.map((candidate) => {
         const linked = candidate.scheduleCategory === category || (candidate.dayRule === "schedule" && !candidate.scheduleCategory && category === "work");
         if (!linked) return candidate;
         changed += 1;
         return {
            ...candidate,
            dayRule: "schedule" as const,
            scheduleCategory: category,
            scheduleBlockId: undefined,
            timingMode: "schedule-relative" as const,
            scheduleReferencePoint: "start" as const,
            scheduleOffsetMinutes: minutesFromClock(candidate.time) - reference,
         };
      });
      if (!changed) return { handled: true, changed: false, reply: `I do not have any ${category}-linked routines to adjust.` };
      saveDailyRhythm({ ...current, anchors });
      return { handled: true, changed: true, reply: `${changed} ${category}-linked ${changed === 1 ? "routine now follows" : "routines now follow"} the actual ${category} start time for each day.` };
   }

   const anchor = findAnchor(current, lower);

   if (
      anchor &&
      relativeReference &&
      /\b(?:make|move|change|set|update|put)\b/.test(lower)
   ) {
      const referenceStart = relativeReferenceMinutes(relativeReference, current);
      upsertRhythmAnchor(current, {
         ...anchor,
         dayRule: "schedule",
         scheduleCategory: relativeReference.scheduleCategory,
         scheduleBlockId: relativeReference.scheduleBlockId,
         timingMode: "schedule-relative",
         scheduleReferencePoint: relativeReference.referencePoint,
         scheduleOffsetMinutes: relativeReference.offsetMinutes,
         time: typeof referenceStart === "number"
            ? clockFromMinutes(referenceStart + relativeReference.offsetMinutes)
            : anchor.time,
      });
      return { handled: true, changed: true, reply: relativeReply(anchor.title, relativeReference) };
   }

   if (anchor && /\b(?:follow|relative to|adjust with)\b/.test(lower) && /\b(?:work|school)\b/.test(lower) && /\bschedule\b/.test(lower)) {
      const category: RhythmCategory = /\bschool\b/.test(lower) ? "school" : "work";
      const reference = dominantScheduleStartMinutes(current.scheduleBlocks, category);
      if (typeof reference !== "number") return { handled: true, changed: false, reply: `There is no ${category} schedule to follow yet.` };
      upsertRhythmAnchor(current, {
         ...anchor,
         dayRule: "schedule",
         scheduleCategory: category,
         scheduleBlockId: undefined,
         timingMode: "schedule-relative",
         scheduleReferencePoint: "start",
         scheduleOffsetMinutes: minutesFromClock(anchor.time) - reference,
      });
      return { handled: true, changed: true, reply: `${anchor.title} now follows the ${category} start time instead of using one fixed clock time.` };
   }

   const explicitDuration = anchor ? parseExplicitDurationMinutes(lower) : null;
   if (
      anchor &&
      explicitDuration !== null &&
      /\b(?:change|set|make|update|should\s+(?:be|last)|lasts?|lasting)\b/.test(lower)
   ) {
      upsertRhythmAnchor(current, { ...anchor, durationMinutes: explicitDuration });
      return { handled: true, changed: true, reply: `${anchor.title} is now ${explicitDuration} minutes.` };
   }

   if (anchor && /\b(?:change|set|make|update)\b/.test(lower)) {

      if (/\b(?:workdays|school days|weekdays|weekends|every day|daily)\b/.test(lower)) {
         const dayConfig = routineDays(lower, current);
         const linkedCategory = dayConfig.scheduleCategory;
         const reference = linkedCategory ? dominantScheduleStartMinutes(current.scheduleBlocks, linkedCategory) : undefined;
         upsertRhythmAnchor(current, {
            ...anchor,
            ...dayConfig,
            scheduleBlockId: undefined,
            timingMode: dayConfig.dayRule === "schedule" ? "schedule-relative" : "fixed",
            scheduleReferencePoint: dayConfig.dayRule === "schedule" ? "start" : undefined,
            scheduleOffsetMinutes: dayConfig.dayRule === "schedule" && typeof reference === "number" ? minutesFromClock(anchor.time) - reference : undefined,
         });
         return { handled: true, changed: true, reply: `${anchor.title} now uses the new repeat schedule.` };
      }
   }

   if (anchor && /\b(?:move|change|set|make)\b/.test(lower)) {
      const time = parseClock(lower);
      if (time) {
         updateRhythmAnchorTime(current, anchor.id, time);
         return { handled: true, changed: true, reply: `${anchor.title} moves to ${formatClock(time)}.` };
      }
   }

   if (anchor && /\b(?:remove|delete)\b/.test(lower) && /\b(?:routine|rhythm|anchor)\b/.test(lower)) {
      removeRhythmAnchor(current, anchor.id);
      return { handled: true, changed: true, reply: `${anchor.title} is removed from the routine.` };
   }

   if (anchor && /\b(?:skip|not doing|not going to do)\b/.test(lower) && /\b(?:today|this morning|tonight)\b/.test(lower)) {
      skipRhythmAnchor(current, anchor.id);
      return { handled: true, changed: true, reply: rhythmVoice("skip", anchor.title, tone) };
   }

   if (anchor && /\b(?:done|finished|completed|i did)\b/.test(lower)) {
      setRhythmCompletion(current, anchor.id, true);
      return { handled: true, changed: true, reply: rhythmVoice("done", anchor.title, tone) };
   }

   if (/\b(?:i'?m off work|i am off work|no work)\b/.test(lower)) {
      const target = parseTargetDate(lower);
      if (target) {
         const targetDay = target.getDay() as RhythmDay;
         const blocks = current.scheduleBlocks.filter(
            (candidate) =>
               candidate.category === "work" &&
               candidate.enabled &&
               candidate.days.includes(targetDay),
         );

         if (blocks.length) {
            const key = localDateKey(target);
            const exceptionsForDay = { ...(current.scheduleExceptions[key] || {}) };

            for (const block of blocks) {
               exceptionsForDay[block.id] = {
                  ...(exceptionsForDay[block.id] || {}),
                  off: true,
               };
            }

            saveDailyRhythm({
               ...current,
               scheduleExceptions: {
                  ...current.scheduleExceptions,
                  [key]: exceptionsForDay,
               },
            });

            return { handled: true, changed: true, reply: `${target.toLocaleDateString([], { weekday: "long" })} is marked off work.` };
         }

         return {
            handled: true,
            changed: false,
            reply: `You do not have work scheduled on ${target.toLocaleDateString([], { weekday: "long" })}.`,
         };
      }
   }

   if (/\b(?:overslept|slept in|fix my morning|running late|behind schedule)\b/.test(lower)) {
      const now = new Date();
      const entries = buildTodayRhythm(current);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const nextFixed = entries.find((entry) => entry.kind === "schedule" && minutesFromClock(entry.time) > nowMinutes);
      if (!nextFixed) return { handled: true, changed: false, reply: "No fixed block ahead to recover around. Start from where you are." };

      const flexible = entries.filter((entry) => entry.kind === "anchor" && entry.flexible && !entry.completed && !entry.skipped && minutesFromClock(entry.time) < minutesFromClock(nextFixed.time));
      const remaining = minutesFromClock(nextFixed.time) - nowMinutes;
      if (!flexible.length) return { handled: true, changed: false, reply: `You have ${remaining} minutes before ${nextFixed.title}. Nothing else needs rearranging.` };

      const key = localDateKey(now);
      const overrides = { ...(current.overrides[key] || {}) };
      const skips = new Set(current.skips[key] || []);
      let cursor = nowMinutes + 5;
      let budget = Math.max(0, remaining - 10);

      for (const entry of flexible) {
         const minDuration = Math.min(entry.durationMinutes || 30, 15);
         if (budget < minDuration + 5) {
            skips.add(entry.sourceId);
            continue;
         }
         const duration = Math.min(entry.durationMinutes || 30, Math.max(minDuration, Math.floor(budget / Math.max(1, flexible.length))));
         overrides[entry.sourceId] = { time: clockFromMinutes(cursor), durationMinutes: duration };
         cursor += duration + 5;
         budget = Math.max(0, minutesFromClock(nextFixed.time) - cursor - 5);
      }

      saveDailyRhythm({ ...current, overrides: { ...current.overrides, [key]: overrides }, skips: { ...current.skips, [key]: [...skips] } });
      return { handled: true, changed: true, reply: rhythmVoice("recovery", nextFixed.title, tone) };
   }

   return { handled: false, changed: false, reply: "" };
}

export function buildRhythmContext(state: DailyRhythmState, now = new Date()) {
   const today = buildRhythmForDate(state, now);
   const schedules = state.scheduleBlocks.map((block) => ({ title: block.title, category: block.category, days: block.days, start: block.start, end: block.end, enabled: block.enabled }));
   const anchors = state.anchors.map((anchor) => ({ title: anchor.title, category: anchor.category, time: anchor.time, durationMinutes: anchor.durationMinutes, dayRule: anchor.dayRule, scheduleBlockId: anchor.scheduleBlockId, scheduleCategory: anchor.scheduleCategory, days: anchor.days, flexible: anchor.flexible, timingMode: anchor.timingMode, scheduleReferencePoint: anchor.scheduleReferencePoint, scheduleOffsetMinutes: anchor.scheduleOffsetMinutes }));
   const key = localDateKey(now);

   // Include only reality-bearing near-term days. This lets ALLEVIN remember
   // "tomorrow my car is in the shop" on a later turn without treating the
   // statement as a permanent profile fact.
   const nearTermReality = Array.from({ length: 8 }, (_, offset) => {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      const dateKey = localDateKey(date);
      const contexts = state.dayContexts[dateKey] || [];
      const outcomes = state.outcomes[dateKey] || {};
      const temporaryEntries = state.temporaryEntries[dateKey] || [];
      const overrides = state.overrides[dateKey] || {};
      const scheduleExceptions = state.scheduleExceptions[dateKey] || {};

      if (
         !contexts.length &&
         !Object.keys(outcomes).length &&
         !temporaryEntries.length &&
         !Object.keys(overrides).length &&
         !Object.keys(scheduleExceptions).length
      ) return null;

      return {
         dateKey,
         contexts,
         outcomes,
         temporaryEntries,
         overrides,
         scheduleExceptions,
         // Deterministic date resolution owns schedule truth. The LLM receives
         // the already-resolved adapted entries so it can make judgment calls
         // without guessing which recurring blocks apply on this weekday.
         entries: buildRhythmForDate(state, date)
            .filter((entry) => !entry.skipped)
            .map((entry) => ({
               title: entry.title,
               kind: entry.kind,
               category: entry.category,
               time: entry.time,
               endTime: entry.endTime,
               durationMinutes: entry.durationMinutes,
               status: entry.status,
            })),
      };
   }).filter(Boolean);

   return JSON.stringify({
      schedules,
      anchors,
      // The current date is explicit because “near term” data may contain
      // recovery/context for tomorrow or later. The language model must never
      // flatten those future facts into what is true right now.
      currentDateKey: key,
      today: today.map((entry) => ({ title: entry.title, kind: entry.kind, time: entry.time, endTime: entry.endTime, status: entry.status, completed: entry.completed, skipped: entry.skipped })),
      currentDayContext: state.dayContexts[key] || [],
      currentDayOutcomes: state.outcomes[key] || {},
      currentDayTemporaryEntries: state.temporaryEntries[key] || [],
      nearTermReality,
      realityRule: "Date scope is strict. For now/today/tonight use only currentDateKey + currentDayContext. Future nearTermReality applies only when the user asks about that matching date. Date-scoped context/overrides/replacements are never permanent routine changes.",
   });
}


/**
 * Resolves the date a user is actively talking about for conversational
 * judgment. This is intentionally separate from schedule mutation parsing:
 * the goal here is only to scope what reality the model is allowed to see.
 */
export function requestedRhythmContextDate(prompt: string, now = new Date(), state?: DailyRhythmState) {
   const lower = prompt.toLowerCase().replace(/[’']/g, "'");
   const target = new Date(now);

   if (/\b(?:now|today|tonight)\b/.test(lower)) return target;
   if (/\bday after tomorrow\b/.test(lower)) {
      target.setDate(now.getDate() + 2);
      return target;
   }
   if (/\btomorrow\b/.test(lower)) {
      target.setDate(now.getDate() + 1);
      return target;
   }

   const weekdays: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
   };

   for (const [name, day] of Object.entries(weekdays)) {
      if (!new RegExp(`\\b(?:next\\s+)?${name}\\b`).test(lower)) continue;
      let delta = (day - now.getDay() + 7) % 7;
      if (delta === 0 && new RegExp(`\\bnext\\s+${name}\\b`).test(lower)) delta = 7;
      target.setDate(now.getDate() + delta);
      return target;
   }

   // A terse follow-up such as "I'm not going to work either" should keep
   // the date of the reality change it follows. Use stored timestamps instead
   // of chat prose so the continuity rule remains deterministic and general.
   if (state && /\b(?:either|also|too|as well|actually|same day)\b/.test(lower)) {
      let latest: { key: string; at: number } | null = null;
      for (const [key, contexts] of Object.entries(state.dayContexts)) {
         const at = Math.max(0, ...contexts.map((context) => context.at || 0));
         if (!at || Date.now() - at > 20 * 60_000 || (latest && latest.at >= at)) continue;
         latest = { key, at };
      }
      if (latest) {
         const [year, month, day] = latest.key.split("-").map(Number);
         if (year && month && day) return new Date(year, month - 1, day, 12, 0, 0, 0);
      }
   }

   return null;
}

function scopedResolvedEntries(state: DailyRhythmState, date: Date) {
   return buildRhythmForDate(state, date)
      .filter((entry) => !entry.skipped)
      .map((entry) => ({
         title: entry.title,
         kind: entry.kind,
         category: entry.category,
         time: entry.time,
         endTime: entry.endTime,
         durationMinutes: entry.durationMinutes,
         status: entry.status,
         completed: entry.completed,
      }));
}

/**
 * Hard-scopes assistant context to the date named by the user. The previous
 * implementation exposed every near-term reality record and relied on prompt
 * instructions to keep dates separate. Models can still blend nearby facts,
 * so this function removes unrelated days before the request ever leaves the
 * browser. Deterministic state, not model attention, owns temporal truth.
 */
export function buildRhythmContextForPrompt(state: DailyRhythmState, prompt: string, now = new Date()) {
   const target = requestedRhythmContextDate(prompt, now, state);
   if (!target) return buildRhythmContext(state, now);

   const schedules = state.scheduleBlocks.map((block) => ({
      title: block.title,
      category: block.category,
      days: block.days,
      start: block.start,
      end: block.end,
      enabled: block.enabled,
   }));
   const anchors = state.anchors.map((anchor) => ({
      title: anchor.title,
      category: anchor.category,
      time: anchor.time,
      durationMinutes: anchor.durationMinutes,
      dayRule: anchor.dayRule,
      scheduleBlockId: anchor.scheduleBlockId,
      scheduleCategory: anchor.scheduleCategory,
      days: anchor.days,
      flexible: anchor.flexible,
      timingMode: anchor.timingMode,
      scheduleReferencePoint: anchor.scheduleReferencePoint,
      scheduleOffsetMinutes: anchor.scheduleOffsetMinutes,
   }));

   const currentDateKey = localDateKey(now);
   const requestedDateKey = localDateKey(target);

   return JSON.stringify({
      schedules,
      anchors,
      currentDateKey,
      requestedDateKey,
      requestedDay: scopedResolvedEntries(state, target),
      requestedDayContext: state.dayContexts[requestedDateKey] || [],
      requestedDayOutcomes: state.outcomes[requestedDateKey] || {},
      requestedDayTemporaryEntries: state.temporaryEntries[requestedDateKey] || [],
      requestedDayOverrides: state.overrides[requestedDateKey] || {},
      requestedDayScheduleExceptions: state.scheduleExceptions[requestedDateKey] || {},
      realityRule: "Only requestedDateKey is available in this request. Do not infer facts from any other date. Recurring schedules/anchors are permanent structure; requested-day context and changes are temporary unless the user explicitly makes them permanent.",
      overlapRule: "A kind=schedule entry is an ongoing parent context. One-off commitments may occur inside it without removing it. Same-context/during-parent events are contained; different-context appointments may overlap and need buffer, but the parent stays unless the user explicitly changes it.",
   });
}

/**
 * State acknowledgements need even less internal vocabulary than judgment.
 * Give the model the resolved visible day—not day-context implementation
 * labels—so it can narrate the practical result without saying things like
 * "recovery mode", "marked", or "for this occurrence".
 */
export function buildRhythmNarrationContextForPrompt(state: DailyRhythmState, prompt: string, now = new Date()) {
   const target = requestedRhythmContextDate(prompt, now, state) || now;
   const requestedDateKey = localDateKey(target);

   return JSON.stringify({
      currentDateKey: localDateKey(now),
      requestedDateKey,
      resolvedEntries: scopedResolvedEntries(state, target),
      narrationRule: "Describe only the practical visible result for requestedDateKey. Do not expose implementation/state terminology and do not invent a change that is not visible in resolvedEntries or the user's own statement.",
   });
}

export function reminderCopy(entry: RhythmEntry, tone: AllevinTone = "direct") {
   return rhythmVoice(entry.status === "missed" ? "missed" : "start", entry.title, tone);
}
