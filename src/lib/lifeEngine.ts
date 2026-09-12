// ========================================
// ALLEVIN MK XII — Life Engine
// Purpose:
// Deterministic daily views, time helpers, and a resilient local Kin fallback.
// The LLM can improve interpretation, but ALLEVIN remains useful without it.
// ========================================

import type { KinAction, LifeContext, LifeItem, LifeRecurrence, LifeRepeatRule, LifeState } from "@/lib/lifeTypes";
import { analyzeIncompleteConversationRequest, canonicalTaskTitleFromPrompt, promptDescribesCommitment, taskReasonFromPrompt } from "@/lib/allevinConversationIntelligence";
import { parseRelativeCalendarDate, parseRelativeClockMoment } from "@/lib/lifeTimingCore";
import { minutesFromClock, readDailyRhythm } from "@/lib/dailyRhythm";
import { nextLifeOccurrence } from "@/lib/lifeStore";

export interface AttentionItem {
   item: LifeItem;
   reason: string;
}

export interface LifeViews {
   today: LifeItem[];
   attention: AttentionItem[];
   upcoming: LifeItem[];
   waiting: LifeItem[];
   whenever: LifeItem[];
   routines: LifeItem[];
   completedToday: LifeItem[];
}

function startOfDay(timestamp = Date.now()) {
   const date = new Date(timestamp);
   date.setHours(0, 0, 0, 0);
   return date.getTime();
}

function endOfDay(timestamp = Date.now()) {
   const date = new Date(timestamp);
   date.setHours(23, 59, 59, 999);
   return date.getTime();
}

function addDays(timestamp: number, amount: number) {
   const date = new Date(timestamp);
   date.setDate(date.getDate() + amount);
   return date.getTime();
}

function isSameDay(left: number, right: number) {
   return startOfDay(left) === startOfDay(right);
}

function itemTime(item: LifeItem) {
   return item.startAt || item.dueAt || item.followUpAt || item.deferUntil;
}

function itemIsDeferred(item: LifeItem, now: number) {
   return Boolean(item.deferUntil && item.deferUntil > endOfDay(now));
}

function byTime(left: LifeItem, right: LifeItem) {
   const leftTime = itemTime(left) || Number.MAX_SAFE_INTEGER;
   const rightTime = itemTime(right) || Number.MAX_SAFE_INTEGER;
   if (leftTime !== rightTime) return leftTime - rightTime;
   return right.importance.localeCompare(left.importance);
}

export function buildLifeViews(state: LifeState, now = Date.now()): LifeViews {
   const todayStart = startOfDay(now);
   const todayEnd = endOfDay(now);
   const horizon = endOfDay(addDays(now, 7));
   const active = state.items.filter((item) => item.state !== "archived");

   const today = active
      .filter((item) => {
         if (item.state !== "active") return false;
         if (itemIsDeferred(item, now)) return false;
         const when = item.startAt || item.dueAt;
         return item.pinToToday || Boolean(when && when >= todayStart && when <= todayEnd);
      })
      .sort(byTime);

   const todayIds = new Set(today.map((item) => item.id));

   const attention = active
      .flatMap((item): AttentionItem[] => {
         if (item.state === "done" || item.state === "someday") return [];
         if (item.state === "waiting") {
            if (item.followUpAt && item.followUpAt <= todayEnd) return [{ item, reason: item.followUpAt < todayStart ? "Follow-up is overdue" : "Follow up today" }];
            return [];
         }
         if (itemIsDeferred(item, now)) return [];
         const when = item.dueAt || item.startAt;
         if (when && when < todayStart) return [{ item, reason: "Overdue" }];
         if (item.importance === "high" && !todayIds.has(item.id) && (!when || when <= endOfDay(addDays(now, 1)))) return [{ item, reason: "High importance" }];
         return [];
      })
      .sort((left, right) => byTime(left.item, right.item));

   const upcoming = active
      .filter((item) => {
         if (item.state !== "active") return false;
         const when = item.deferUntil && item.deferUntil > todayEnd ? item.deferUntil : item.startAt || item.dueAt;
         return Boolean(when && when > todayEnd && when <= horizon);
      })
      .sort(byTime);

   const waiting = active.filter((item) => item.state === "waiting").sort((left, right) => (left.followUpAt || Number.MAX_SAFE_INTEGER) - (right.followUpAt || Number.MAX_SAFE_INTEGER));

   const whenever = active
      .filter((item) => {
         if (item.state === "someday") return true;
         if (item.state !== "active" || item.kind === "routine") return false;
         return !item.dueAt && !item.startAt && !item.deferUntil && !item.pinToToday;
      })
      .sort((left, right) => (left.importance === right.importance ? right.updatedAt - left.updatedAt : left.importance === "high" ? -1 : 1));

   const routines = active.filter((item) => item.kind === "routine" && item.state !== "done").sort(byTime);
   const completedToday = active.filter((item) => item.state === "done" && item.completedAt && isSameDay(item.completedAt, now)).sort((left, right) => (right.completedAt || 0) - (left.completedAt || 0));

   return { today, attention, upcoming, waiting, whenever, routines, completedToday };
}

export function formatLifeTime(timestamp?: number, allDay = false) {
   if (!timestamp) return "";
   if (allDay) return "All day";
   return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatLifeDate(timestamp?: number) {
   if (!timestamp) return "";
   const now = Date.now();
   if (isSameDay(timestamp, now)) return "Today";
   if (isSameDay(timestamp, addDays(now, 1))) return "Tomorrow";
   return new Date(timestamp).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function formatRelativeMoment(timestamp?: number) {
   if (!timestamp) return "";
   const difference = timestamp - Date.now();
   const day = 86_400_000;
   if (Math.abs(difference) < day && isSameDay(timestamp, Date.now())) return formatLifeTime(timestamp);
   if (difference > 0 && difference < day * 2) return "Tomorrow";
   if (difference < 0 && Math.abs(difference) < day * 2) return "Yesterday";
   return formatLifeDate(timestamp);
}

export function getDayGreeting() {
   const hour = new Date().getHours();
   if (hour < 12) return "Good morning";
   if (hour < 18) return "Good afternoon";
   return "Good evening";
}

export function getTodayDateLabel() {
   return new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export function buildLocalDayBrief(state: LifeState) {
   const views = buildLifeViews(state);
   const parts: string[] = [];

   if (views.today.length) parts.push(`${views.today.length} ${views.today.length === 1 ? "thing" : "things"} on your plate today`);
   if (views.attention.length) parts.push(`${views.attention.length} ${views.attention.length === 1 ? "item needs" : "items need"} attention`);
   if (views.waiting.length) parts.push(`${views.waiting.length} ${views.waiting.length === 1 ? "thing is" : "things are"} waiting on someone or something else`);

   if (!parts.length) return "Nothing is demanding your attention right now.";
   return `${parts.join(" · ")}.`;
}

function normalizePrompt(value: string) {
   return value.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9:$\s/-]+/g, " ").replace(/\s+/g, " ").trim();
}

function contextFromText(value: string): LifeContext {
   const lower = normalizePrompt(value);
   if (/\b(?:class|school|assignment|professor|homework|reading|course)\b/.test(lower)) return "school";
   if (/\b(?:kin software|client|invoice|proposal|contract|dvbe|llc)\b/.test(lower)) return "kin-software";
   if (/\b(?:grocery|groceries|store|pickup|pick up|errand)\b/.test(lower)) return "errand";
   if (/\b(?:work|office|coworker|boss|dean|campus)\b/.test(lower)) return "work";
   if (/\b(?:car|porsche|tires|brakes|oil change|mechanic|registration)\b/.test(lower)) return "car";
   if (/\b(?:rent|bill|loan|bank|tax|roth|ira|payment)\b/.test(lower)) return "finance";
   if (/\b(?:doctor|dentist|appointment|prescription|pharmacy|health)\b/.test(lower)) return "health";
   if (/\b(?:laundry|clean|home|apartment|house)\b/.test(lower)) return "home";
   return "personal";
}

function parseClockTime(value: string) {
   const lower = value.toLowerCase();
   if (/\bnoon\b/.test(lower)) return { hours: 12, minutes: 0 };
   if (/\bmidnight\b/.test(lower)) return { hours: 0, minutes: 0 };

   const match = lower.match(/\b(?:at|around|for)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
   if (!match) return null;
   let hours = Number(match[1]);
   const minutes = Number(match[2] || 0);
   let suffix = match[3];
   if (!suffix && /\b(?:morning|before noon)\b/.test(lower)) suffix = "am";
   if (!suffix && /\b(?:afternoon|evening|tonight|after noon)\b/.test(lower)) suffix = "pm";
   if (suffix === "pm" && hours < 12) hours += 12;
   if (suffix === "am" && hours === 12) hours = 0;
   // Bare 1–12 clock times are blocked by conversation completeness before
   // parsing. Returning null here is a second safety guard against silent AM/PM
   // guesses from any future caller that bypasses the chat draft flow.
   if (!suffix && hours >= 1 && hours <= 12) return null;
   if (hours > 23 || minutes > 59) return null;
   return { hours, minutes };
}

function nextWeekday(day: number, includeToday = false) {
   const now = new Date();
   const delta = (day - now.getDay() + 7) % 7 || (includeToday ? 0 : 7);
   const date = new Date(now);
   date.setDate(now.getDate() + delta);
   return date;
}

export function parseLifeDateTime(value: string, nowTimestamp = Date.now()) {
   const lower = normalizePrompt(value);
   const now = new Date(nowTimestamp);
   let date: Date | null = null;
   let precision: "exact" | "day" | "window" | "none" = "none";

   const relativeClock = parseRelativeClockMoment(value, nowTimestamp);
   if (relativeClock) {
      return { timestamp: relativeClock.getTime(), allDay: false, precision: "exact" as const };
   }

   const relative = parseRelativeCalendarDate(value, nowTimestamp);

   if (relative) {
      date = relative;
      precision = "day";
   } else if (/\bday after tomorrow\b/.test(lower)) {
      date = new Date(now);
      date.setDate(now.getDate() + 2);
      precision = "day";
   } else if (/\btomorrow\b/.test(lower)) {
      date = new Date(now);
      date.setDate(now.getDate() + 1);
      precision = "day";
   } else if (/\b(?:today|tonight)\b/.test(lower)) {
      date = new Date(now);
      precision = /\btonight\b/.test(lower) ? "window" : "day";
   } else if (/\bnext week\b/.test(lower)) {
      date = new Date(now);
      date.setDate(now.getDate() + 7);
      precision = "window";
   } else if (/\bnext month\b/.test(lower)) {
      date = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      precision = "window";
   }

   // “The 14th of next month” must remain in the immediately following
   // calendar month. The language model may phrase the acknowledgement, but
   // deterministic date handling owns both the month and the requested day.
   if (date && /\bnext month\b/.test(lower)) {
      const requestedDay = lower.match(/\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:day\s+)?of\s+(?:the\s+)?next month\b/)?.[1];
      if (requestedDay) {
         const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
         date.setDate(Math.min(Math.max(1, Number(requestedDay)), lastDay));
         precision = "day";
      }
   }

   const weekdays: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
   if (!date) {
      for (const [name, day] of Object.entries(weekdays)) {
         if (new RegExp(`\\b(?:next\\s+)?${name}\\b`).test(lower)) {
            date = nextWeekday(day, false);
            precision = "day";
            break;
         }
      }
   }

   const months: Record<string, number> = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
   };
   if (!date) {
      for (const [name, month] of Object.entries(months)) {
         if (new RegExp(`\\b(?:in\\s+)?${name}\\b`).test(lower)) {
            const year = month < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
            date = new Date(year, month, 1);
            precision = "window";
            break;
         }
      }
   }

   const iso = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
   if (iso) {
      date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      precision = "day";
   }

   const slash = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/);
   if (slash) {
      const rawYear = slash[3] ? Number(slash[3]) : now.getFullYear();
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      date = new Date(year, Number(slash[1]) - 1, Number(slash[2]));
      precision = "day";
   }

   const clock = parseClockTime(value);
   if (clock) {
      const dateWasExplicit = Boolean(date);
      if (!date) date = new Date(now);
      date.setHours(clock.hours, clock.minutes, 0, 0);
      // "Remind me at 8:30 PM" means the next matching local clock. If that
      // time has already passed today, schedule tomorrow instead of silently
      // creating an overdue reminder.
      if (!dateWasExplicit && date.getTime() <= nowTimestamp) date.setDate(date.getDate() + 1);
      return { timestamp: date.getTime(), allDay: false, precision: "exact" as const };
   }

   if (!date) return { timestamp: undefined, allDay: true, precision: "none" as const };

   date.setHours(12, 0, 0, 0);
   return { timestamp: date.getTime(), allDay: true, precision };
}

function parseRecurrence(value: string): LifeRecurrence {
   const lower = normalizePrompt(value);
   if (/\b(?:every|each)\s+(?:(?:\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:minutes?|hours?)\b|\bhourly\b/.test(lower)) return "interval";
   if (/\b(?:every\s*day|ever\s+day|each\s+day|daily)\b/.test(lower)) return "daily";
   if (/\b(?:every|each)\s+weekday\b|\bweekdays\b/.test(lower)) return "weekdays";
   if (/\b(?:every|each)\s+(?:week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\bweekly\b/.test(lower)) return "weekly";
   if (/\b(?:every|each)\s+month\b|\bmonthly\b/.test(lower)) return "monthly";
   return "none";
}

const NUMBER_WORDS: Record<string, number> = {
   a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
   six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function clockMinutesFromText(value: string) {
   const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
   if (!match) return undefined;
   let hour = Number(match[1]);
   const minute = Number(match[2] || 0);
   if (hour < 1 || hour > 12 || minute > 59) return undefined;
   if (match[3].toLowerCase() === "pm" && hour < 12) hour += 12;
   if (match[3].toLowerCase() === "am" && hour === 12) hour = 0;
   return hour * 60 + minute;
}

function intervalMinutesFromPrompt(value: string) {
   if (/\bhourly\b/i.test(value)) return 60;
   const match = value.match(/\b(?:every|each)\s+(?:(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(minutes?|hours?)\b/i);
   if (!match) return undefined;
   const amount = match[1] ? Number(match[1]) || NUMBER_WORDS[match[1].toLowerCase()] : 1;
   return amount * (/hour/i.test(match[2]) ? 60 : 1);
}

const WEEKDAY_INDEX: Record<string, number> = {
   sunday: 0,
   monday: 1,
   tuesday: 2,
   wednesday: 3,
   thursday: 4,
   friday: 5,
   saturday: 6,
};

const ORDINAL_VALUE: Record<string, 1 | 2 | 3 | 4 | 5 | -1> = {
   first: 1,
   second: 2,
   third: 3,
   fourth: 4,
   fifth: 5,
   last: -1,
};

function explicitClockMinutesFromPrompt(value: string) {
   const match = value.match(/\b(?:at|around|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i) ||
      value.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[.!?]*$/i);
   return match ? clockMinutesFromText(match[1]) : undefined;
}

function weeklyDaysFromPrompt(value: string) {
   const lower = normalizePrompt(value);
   return Object.entries(WEEKDAY_INDEX)
      .filter(([name]) => new RegExp(`\\b${name}\\b`).test(lower))
      .map(([, day]) => day);
}

function monthlyPatternFromPrompt(value: string) {
   const lower = normalizePrompt(value);
   const ordinalWeekday = lower.match(/\b(first|second|third|fourth|fifth|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:of\s+)?(?:every|each)\s+month\b/);
   if (ordinalWeekday) {
      return {
         monthlyOrdinal: ORDINAL_VALUE[ordinalWeekday[1]],
         monthlyWeekday: WEEKDAY_INDEX[ordinalWeekday[2]],
      };
   }
   if (/\blast\s+day\s+of\s+(?:every|each)\s+month\b/.test(lower)) {
      return { monthlyDay: 31, shorterMonthPolicy: "last-day" as const };
   }
   const numbered = lower.match(/\b(?:on\s+)?(?:the\s+)?(first|second|third|fourth|fifth|\d{1,2}(?:st|nd|rd|th)?)\s+(?:day\s+)?of\s+(?:every|each)\s+month\b/) ||
      lower.match(/\b(?:every|each)\s+month\s+(?:on\s+)?(?:the\s+)?(first|second|third|fourth|fifth|\d{1,2}(?:st|nd|rd|th)?)\b/);
   if (!numbered) return {};
   const named = ORDINAL_VALUE[numbered[1]];
   const monthlyDay = named && named > 0 ? named : Number(numbered[1].replace(/(?:st|nd|rd|th)$/i, ""));
   return Number.isInteger(monthlyDay) && monthlyDay >= 1 && monthlyDay <= 31
      ? {
           monthlyDay,
           shorterMonthPolicy: /\b(?:use\s+)?(?:the\s+)?last\s+day\b/.test(lower)
              ? "last-day" as const
              : /\bskip\s+(?:shorter\s+)?months?\b/.test(lower) ? "skip" as const : undefined,
        }
      : {};
}

export interface RecurringReminderAnalysis {
   recurring: boolean;
   incomplete: boolean;
   clarification?: string;
   intervalMinutes?: number;
   recurrence?: LifeRecurrence;
}

/** Completeness is deterministic; the LLM only phrases the resulting question. */
export function analyzeRecurringReminderRequest(value: string, bedtime?: string): RecurringReminderAnalysis {
   const recurrence = parseRecurrence(value);
   const intervalMinutes = intervalMinutesFromPrompt(value);
   if (recurrence === "none" || !/\b(?:remind|reminder)\b/i.test(value)) return { recurring: false, incomplete: false };
   if (recurrence !== "interval") {
      const timeMinutes = explicitClockMinutesFromPrompt(value);
      if (timeMinutes === undefined) {
         return {
            recurring: true,
            incomplete: true,
            recurrence,
            clarification: recurrence === "monthly" ? "What time should I use each month?" : "What time should this repeat?",
         };
      }
      if (recurrence === "monthly") {
         const monthly = monthlyPatternFromPrompt(value);
         if (!monthly.monthlyDay && monthly.monthlyOrdinal === undefined) {
            return { recurring: true, incomplete: true, recurrence, clarification: "Which day of the month should this happen?" };
         }
         if ((monthly.monthlyDay || 0) >= 29 && !monthly.shorterMonthPolicy) {
            return {
               recurring: true,
               incomplete: true,
               recurrence,
               clarification: "In shorter months, should I use the final day or skip that month?",
            };
         }
      }
      return { recurring: true, incomplete: false, recurrence };
   }
   if (!intervalMinutes) return { recurring: false, incomplete: false };
   const hasScope = /\b(?:today|tonight|every\s*day|ever\s+day|daily|each\s+day|weekdays?|weekly)\b/i.test(value);
   if (!hasScope) {
      return {
         recurring: true,
         incomplete: true,
         intervalMinutes,
         recurrence,
         clarification: "Should this repeat today until bedtime, or every day?",
      };
   }
   const hasEnd = /\buntil\s+(?:bedtime|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i.test(value) ||
      /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*$/i.test(value) ||
      /\b(?:for|over)\s+(?:the\s+)?next\s+\d+\s+(?:hours?|days?)\b/i.test(value);
   if (!hasEnd && !bedtime) {
      return {
         recurring: true,
         incomplete: true,
         intervalMinutes,
         recurrence,
         clarification: "What time should these reminders stop?",
      };
   }
   if (intervalMinutes < 15 && !/\b(?:yes|confirm|do it|that is fine|that's fine)\b/i.test(value)) {
      return {
         recurring: true,
         incomplete: true,
         intervalMinutes,
         recurrence,
         clarification: `That would be a lot of reminders—one every ${intervalMinutes} minutes. Do you want me to set all of them?`,
      };
   }
   return { recurring: true, incomplete: false, intervalMinutes, recurrence };
}

function recurringReminderRule(value: string, now = Date.now()): { rule: LifeRepeatRule; firstAt: number } | null {
   const intervalMinutes = intervalMinutesFromPrompt(value);
   if (!intervalMinutes) return null;
   const rhythm = readDailyRhythm();
   const current = new Date(now);
   const currentMinute = current.getHours() * 60 + current.getMinutes();
   const explicitStart = value.match(/\b(?:starting|beginning|from)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
   const explicitEnd = value.match(/\buntil\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i) ||
      value.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*$/i);
   const scope = /\b(?:every\s*day|ever\s+day|daily|each\s+day)\b/i.test(value) ? "every-day" as const : "today" as const;
   const startMinutes = explicitStart ? clockMinutesFromText(explicitStart[1]) : undefined;
   const bedtime = /\buntil\s+bedtime\b/i.test(value) || !explicitEnd ? rhythm.bedtime : undefined;
   const endMinutes = explicitEnd ? clockMinutesFromText(explicitEnd[1]) : bedtime ? minutesFromClock(bedtime) : undefined;
   if (typeof endMinutes !== "number") return null;

   let first = new Date(current);
   first.setSeconds(0, 0);
   if (/\bon the hour\b/i.test(value)) {
      first.setMinutes(0, 0, 0);
      first.setHours(first.getHours() + 1);
   } else if (typeof startMinutes === "number") {
      first.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
      if (first.getTime() <= now) first = new Date(now + intervalMinutes * 60_000);
   } else {
      first = new Date(now + intervalMinutes * 60_000);
      first.setSeconds(0, 0);
   }

   const windowStartMinutes = typeof startMinutes === "number" ? startMinutes : currentMinute;
   const rule: LifeRepeatRule = {
      frequency: "interval",
      intervalMinutes,
      cadence: /\b(?:about|roughly|around|approximately|flexible)\b/i.test(value) ? "flexible" : "exact",
      scope,
      windowStartMinutes,
      windowEndMinutes: endMinutes,
      seriesStartedAt: first.getTime(),
      seriesEndsAt: scope === "today"
         ? new Date(current.getFullYear(), current.getMonth(), current.getDate(), Math.floor(endMinutes / 60), endMinutes % 60).getTime()
         : undefined,
      stopWhenCompleted: /\buntil\s+(?:i|we)\s+(?:do|finish|complete)\b/i.test(value),
      paused: false,
   };
   return { rule, firstAt: first.getTime() };
}

function structuredRecurringReminder(value: string, now = Date.now()): { recurrence: LifeRecurrence; rule: LifeRepeatRule; firstAt: number } | null {
   const recurrence = parseRecurrence(value);
   if (recurrence === "none" || recurrence === "interval") return null;
   const timeMinutes = explicitClockMinutesFromPrompt(value);
   if (timeMinutes === undefined) return null;
   const monthly = recurrence === "monthly" ? monthlyPatternFromPrompt(value) : {};
   const daysOfWeek = recurrence === "weekly" ? weeklyDaysFromPrompt(value) : undefined;
   const rule: LifeRepeatRule = {
      frequency: recurrence,
      cadence: "exact",
      scope: "every-day",
      timeMinutes,
      daysOfWeek: daysOfWeek?.length ? daysOfWeek : undefined,
      monthlyDay: monthly.monthlyDay,
      monthlyOrdinal: monthly.monthlyOrdinal,
      monthlyWeekday: monthly.monthlyWeekday,
      shorterMonthPolicy: monthly.shorterMonthPolicy,
      seriesStartedAt: now,
      stopWhenCompleted: false,
      paused: false,
   };
   const template: LifeItem = {
      id: "preview",
      title: "Preview",
      details: "",
      kind: "routine",
      state: "active",
      context: "personal",
      importance: "normal",
      recurrence,
      repeatRule: rule,
      timingPrecision: "exact",
      dueAt: now,
      allDay: false,
      pinToToday: false,
      source: "kin",
      createdAt: now,
      updatedAt: now,
   };
   const firstAt = nextLifeOccurrence(template, now + 1);
   return firstAt ? { recurrence, rule, firstAt } : null;
}

function ordinalLabel(value: number) {
   if (value === -1) return "last";
   return ({ 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth" } as Record<number, string>)[value] || `${value}`;
}

function dayOfMonthLabel(value: number) {
   if (value === 1) return "first";
   if (value === 2) return "second";
   if (value === 3) return "third";
   const remainder = value % 100;
   const suffix = remainder >= 11 && remainder <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
   return `${value}${suffix}`;
}

export function formatRecurringReminder(item: LifeItem) {
   const rule = item.repeatRule;
   if (item.recurrence === "interval" && rule?.intervalMinutes) {
      const cadence = rule.intervalMinutes % 60 === 0
         ? `Every ${rule.intervalMinutes / 60 === 1 ? "hour" : `${rule.intervalMinutes / 60} hours`}`
         : `Every ${rule.intervalMinutes} minutes`;
      const window = rule.windowStartMinutes !== undefined && rule.windowEndMinutes !== undefined
         ? `${formatClockMinutes(rule.windowStartMinutes)}–${formatClockMinutes(rule.windowEndMinutes)}`
         : "";
      const scope = rule.scope === "every-day" ? "Daily" : "Today";
      return `${cadence} · ${scope}${window ? `, ${window}` : ""}${rule.paused ? " · Paused" : ""}`;
   }
   const clock = rule?.timeMinutes !== undefined ? ` · ${formatClockMinutes(rule.timeMinutes)}` : "";
   if (item.recurrence === "daily") return `Every day${clock}${rule?.paused ? " · Paused" : ""}`;
   if (item.recurrence === "weekdays") return `Every weekday${clock}${rule?.paused ? " · Paused" : ""}`;
   if (item.recurrence === "weekly") {
      const days = (rule?.daysOfWeek || []).map((day) => Object.keys(WEEKDAY_INDEX).find((name) => WEEKDAY_INDEX[name] === day)?.slice(0, 3)).filter(Boolean).join(", ");
      return `${days ? `Every ${days}` : "Weekly"}${clock}${rule?.paused ? " · Paused" : ""}`;
   }
   if (item.recurrence === "monthly") {
      const schedule = rule?.monthlyOrdinal && rule.monthlyWeekday !== undefined
         ? `${ordinalLabel(rule.monthlyOrdinal)} ${Object.keys(WEEKDAY_INDEX).find((name) => WEEKDAY_INDEX[name] === rule.monthlyWeekday)}`
         : rule?.monthlyDay === 31 && rule.shorterMonthPolicy === "last-day" ? "last day" : `${dayOfMonthLabel(rule?.monthlyDay || new Date(item.dueAt || Date.now()).getDate())}`;
      return `${schedule.charAt(0).toUpperCase()}${schedule.slice(1)} of every month${clock}${rule?.paused ? " · Paused" : ""}`;
   }
   return item.recurrence;
}

function formatClockMinutes(minutes: number) {
   const date = new Date();
   date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
   return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function splitMultipleReminderActions(raw: string): KinAction[] {
   const match = raw.match(/^(.*?)\bremind\s+me\s+(?:to\s+)?(.+?)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+and\s+(.+?)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[.!?]*$/i);
   if (!match) return [];
   return [[match[2], match[3]], [match[4], match[5]]].flatMap(([subject, clock]) => {
      const prompt = `${match[1]} remind me to ${subject} at ${clock}`;
      const date = parseLifeDateTime(prompt);
      const title = canonicalTaskTitleFromPrompt(prompt);
      return date.timestamp && title ? [{
         type: "create_item" as const,
         item: {
            title,
            details: taskReasonFromPrompt(prompt) || undefined,
            kind: "task" as const,
            state: "active" as const,
            context: contextFromText(prompt),
            importance: "normal" as const,
            recurrence: "none" as const,
            timingPrecision: "exact" as const,
            dueAt: date.timestamp,
            allDay: false,
            pinToToday: isSameDay(date.timestamp, Date.now()),
         },
      }] : [];
   });
}

function findReferencedItem(state: LifeState, query: string) {
   const lower = normalizePrompt(query);
   const candidates = state.items.filter((item) => item.state !== "archived");
   if (/\b(?:those|these|recurring|repeating)\s+reminders?\b/.test(lower)) {
      return candidates
         .filter((item) => item.recurrence !== "none")
         .sort((left, right) => right.updatedAt - left.updatedAt)[0];
   }
   const exact = candidates.find((item) => lower.includes(normalizePrompt(item.title)));
   if (exact) return exact;

   // Natural references often use a singular noun for a plural title ("the
   // stock reminder" -> "Buy stocks"). Compare meaningful word stems instead
   // of forcing the user to repeat the exact stored title.
   const ignored = new Set(["that", "this", "the", "remind", "reminder", "reminders", "please"]);
   const stems = (value: string) => normalizePrompt(value)
      .split(" ")
      .map((word) => word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word)
      .filter((word) => word.length > 2 && !ignored.has(word));
   const queryWords = new Set(stems(lower));
   return candidates
      .map((item) => ({ item, score: stems(item.title).filter((word) => queryWords.has(word)).length }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || right.item.updatedAt - left.item.updatedAt)[0]?.item;
}

export function buildDeterministicLifeReadback(prompt: string, state: LifeState): string | null {
   const raw = prompt.trim();
   const lower = normalizePrompt(raw);
   const views = buildLifeViews(state);

   const asksAQuestion =
      raw.endsWith("?") ||
      /^(?:what|when|where|who|which|how|do|does|did|am|is|are|can|could|should|would|will|have|has)\b/i.test(raw);

   if (!asksAQuestion) return null;

   const asksReminders =
      /\b(?:what|which|show|list)\b.*\breminders?\b/.test(lower) ||
      /\breminders?\b.*\b(?:have|active|upcoming|set)\b/.test(lower);

   if (asksReminders) {
      const now = Date.now();
      const reminders = state.items
         .filter((item) => item.state === "active")
         .filter((item) => item.recurrence !== "none" || (item.kind === "task" && item.timingPrecision === "exact" && Boolean(item.dueAt && item.dueAt > now)))
         .sort((left, right) => (left.dueAt || Number.MAX_SAFE_INTEGER) - (right.dueAt || Number.MAX_SAFE_INTEGER));
      if (!reminders.length) return "You don't have any upcoming reminders.";
      return reminders.slice(0, 8).map((item) => {
         if (item.recurrence !== "none") return `${item.title} — ${formatRecurringReminder(item)}.`;
         return `${item.title} — ${formatLifeDate(item.dueAt)} at ${formatLifeTime(item.dueAt)}.`;
      }).join("\n");
   }

   const asksToday =
      lower.includes("attention today") ||
      lower.includes("need today") ||
      lower.includes("need to do today") ||
      lower.includes("matters today") ||
      lower.includes("have today") ||
      lower.includes("today looking") ||
      lower.includes("today look like") ||
      lower === "what s today" ||
      lower === "what is today";

   if (asksToday) {
      if (!views.today.length && !views.attention.length) {
         return "Nothing needs your attention today.";
      }

      const today = views.today.slice(0, 5).map((item) => item.title);
      const attention = views.attention
         .slice(0, 4)
         .map(({ item }) => item.title)
         .filter((title) => !today.includes(title));

      return [
         today.length ? `Today: ${today.join(", ")}.` : "",
         attention.length ? `Also worth attention: ${attention.join(", ")}.` : "",
      ].filter(Boolean).join(" ");
   }

   const asksWaiting =
      lower.includes("what am i waiting") ||
      lower.includes("what s waiting") ||
      lower.includes("what is waiting") ||
      lower.includes("waiting on") ||
      lower.includes("waiting for");

   if (asksWaiting) {
      if (!views.waiting.length) return "You're not waiting on anything I've recorded.";
      const titles = views.waiting
         .slice(0, 5)
         .map((item) => item.title.replace(/^waiting\s+(?:for|on)\s+/i, "").trim());
      return `You're waiting on ${titles.join(", ")}.`;
   }

   const asksUpcoming =
      lower.includes("coming up") ||
      lower.includes("what s upcoming") ||
      lower.includes("what is upcoming") ||
      lower.includes("this week") ||
      lower.includes("next seven days");

   if (asksUpcoming) {
      if (!views.upcoming.length) return "Nothing is coming up in the next seven days.";
      return views.upcoming
         .slice(0, 7)
         .map((item) => `${formatLifeDate(item.startAt || item.dueAt)} — ${item.title}`)
         .join("\n");
   }

   const asksShortWindow =
      (lower.includes("30 minutes") || lower.includes("thirty minutes")) &&
      (lower.includes("i have") || lower.includes("i ve got") || lower.includes("got"));

   if (asksShortWindow) {
      const candidate = [...views.today, ...views.whenever].find(
         (item) => !item.durationMinutes || item.durationMinutes <= 30,
      );
      return candidate
         ? `Use the 30 minutes for ${candidate.title}.`
         : "I don't have a clearly short task recorded.";
   }

   return null;
}

export function shouldUseDeterministicLifeReadback(prompt: string, state?: LifeState) {
   if (!state) {
      const raw = prompt.trim();
      const lower = normalizePrompt(raw);
      const asksAQuestion = raw.endsWith("?") || /^(?:what|when|where|who|which|how|do|does|did|am|is|are|can|could|should|would|will|have|has)\b/i.test(raw);
      if (!asksAQuestion) return false;
      return lower.includes("attention today") || lower.includes("coming up") || lower.includes("what am i waiting") || lower.includes("30 minutes") || lower.includes("thirty minutes") || /\b(?:what|which|show|list)\b.*\breminders?\b/.test(lower);
   }
   return buildDeterministicLifeReadback(prompt, state) !== null;
}

function localQuestionResponse(prompt: string, state: LifeState) {
   const deterministic = buildDeterministicLifeReadback(prompt, state);
   if (deterministic) return deterministic;
   return "Tell me what changed or what you want to figure out.";
}

export interface LocalKinInterpretation {
   reply: string;
   actions: KinAction[];
   incomplete?: boolean;
}

export function interpretKinLocally(prompt: string, state: LifeState): LocalKinInterpretation {
   const raw = prompt.trim();
   const lower = normalizePrompt(raw);
   if (!raw) return { reply: "What's on your mind?", actions: [] };

   const completeness = analyzeIncompleteConversationRequest(raw);
   if (completeness.incomplete) {
      return {
         reply: completeness.clarification || "What detail should I add before I save this?",
         actions: [],
         incomplete: true,
      };
   }

   const multipleReminderActions = splitMultipleReminderActions(raw);
   if (multipleReminderActions.length > 1) {
      return {
         reply: "Both reminders were saved at their separate times.",
         actions: multipleReminderActions,
      };
   }

   const recurringControl = raw.match(/\b(pause|resume|skip\s+(?:the\s+)?next|cancel|stop)\b\s+(.+?)(?:\s+reminders?)?[.!?]*$/i);
   if (recurringControl) {
      const target = findReferencedItem(state, recurringControl[2]);
      if (target?.repeatRule && target.recurrence !== "none") {
         const command = recurringControl[1].toLowerCase();
         if (command === "cancel" || command === "stop") {
            return { reply: `${target.title} will no longer repeat.`, actions: [{ type: "archive_item", targetId: target.id }] };
         }
         if (command.startsWith("skip")) {
            const skippedAt = target.dueAt || target.startAt || nextLifeOccurrence(target, Date.now());
            const updatedRule = { ...target.repeatRule, skipNextAt: skippedAt };
            const nextAt = nextLifeOccurrence({ ...target, repeatRule: updatedRule }, (skippedAt || Date.now()) + 1);
            return { reply: `The next ${target.title} reminder is skipped.`, actions: [{ type: "update_item", targetId: target.id, changes: { repeatRule: updatedRule, dueAt: nextAt } }] };
         }
         const resumedRule = { ...target.repeatRule, paused: command === "pause" };
         return {
            reply: `${target.title} reminders are ${command === "pause" ? "paused" : "running again"}.`,
            actions: [{
               type: "update_item",
               targetId: target.id,
               changes: {
                  repeatRule: resumedRule,
                  dueAt: command === "resume" ? nextLifeOccurrence({ ...target, repeatRule: resumedRule }, Date.now()) : target.dueAt,
               },
            }],
         };
      }
   }

   const recurringAnalysis = analyzeRecurringReminderRequest(raw, readDailyRhythm().bedtime);
   if (recurringAnalysis.recurring) {
      if (recurringAnalysis.incomplete) {
         return { reply: recurringAnalysis.clarification || "When should these reminders stop?", actions: [], incomplete: true };
      }
      const recurring = recurringReminderRule(raw);
      const structured = structuredRecurringReminder(raw);
      const title = canonicalTaskTitleFromPrompt(raw);
      if (recurring && title) {
         return {
            reply: `${title} will repeat every ${recurring.rule.intervalMinutes} minutes within the time you chose.`,
            actions: [{
               type: "create_item",
               item: {
                  title,
                  details: taskReasonFromPrompt(raw) || undefined,
                  kind: "routine",
                  state: "active",
                  context: contextFromText(raw),
                  importance: "normal",
                  recurrence: "interval",
                  repeatRule: recurring.rule,
                  timingPrecision: "exact",
                  dueAt: recurring.firstAt,
                  allDay: false,
                  pinToToday: recurring.rule.scope === "today",
               },
            }],
         };
      }
      if (structured && title) {
         const preview: LifeItem = {
            id: "preview",
            title,
            details: "",
            kind: "routine",
            state: "active",
            context: contextFromText(raw),
            importance: "normal",
            recurrence: structured.recurrence,
            repeatRule: structured.rule,
            timingPrecision: "exact",
            dueAt: structured.firstAt,
            allDay: false,
            pinToToday: false,
            source: "kin",
            createdAt: Date.now(),
            updatedAt: Date.now(),
         };
         return {
            reply: `${title} is set for ${formatRecurringReminder(preview)}.`,
            actions: [{ type: "create_item", item: {
               title,
               details: taskReasonFromPrompt(raw) || undefined,
               kind: "routine",
               state: "active",
               context: contextFromText(raw),
               importance: "normal",
               recurrence: structured.recurrence,
               repeatRule: structured.rule,
               timingPrecision: "exact",
               dueAt: structured.firstAt,
               allDay: false,
               pinToToday: false,
            } }],
         };
      }
   }

   const completionCue = /\b(?:mark|finish|complete)\s+(.+?)\s+(?:done|complete)|\b(?:i'?m done with|i finished|i completed)\s+(.+)/i.exec(raw);
   if (completionCue) {
      const query = completionCue[1] || completionCue[2] || raw;
      const target = findReferencedItem(state, query);
      if (target) return { reply: `Done — I'll close out ${target.title}.`, actions: [{ type: "complete_item", targetId: target.id }] };
   }

   const removeCue = /\b(?:remove|delete|archive|cancel)\s+(.+)/i.exec(raw);
   if (removeCue) {
      const target = findReferencedItem(state, removeCue[1]);
      if (target) return { reply: `I'll take ${target.title} out of active view.`, actions: [{ type: "archive_item", targetId: target.id }] };
   }

   const moveDateCue = /\b(?:move|push|shift)\s+(.+?)\s+(?:to|until)\s+(.+)$/i.exec(raw);
   if (moveDateCue) {
      const target = findReferencedItem(state, moveDateCue[1]);
      const date = parseLifeDateTime(moveDateCue[2]);
      if (target && date.timestamp) {
         const targetClockMinutes = new Date(date.timestamp).getHours() * 60 + new Date(date.timestamp).getMinutes();
         const repeatRule = target.recurrence !== "none" && target.repeatRule
            ? {
                 ...target.repeatRule,
                 timeMinutes: target.recurrence === "interval" ? target.repeatRule.timeMinutes : targetClockMinutes,
                 userEdited: true,
              }
            : target.repeatRule;
         const recurringPreview = repeatRule
            ? { ...target, repeatRule, dueAt: date.timestamp, startAt: target.kind === "commitment" ? date.timestamp : target.startAt }
            : target;
         const dueAt = target.recurrence !== "none"
            ? nextLifeOccurrence(recurringPreview, Date.now() + 1) || date.timestamp
            : date.timestamp;
         return {
            reply: `Okay — ${target.title} moves to ${formatLifeDate(date.timestamp)}${date.allDay ? "" : ` at ${formatLifeTime(date.timestamp)}`}.`,
            actions: [{ type: "update_item", targetId: target.id, changes: { dueAt, startAt: target.kind === "commitment" ? dueAt : target.startAt, repeatRule, allDay: date.allDay, timingPrecision: date.precision, pinToToday: isSameDay(dueAt, Date.now()), state: "active" } }],
         };
      }
   }

   const moveTomorrowCue = /\b(?:move|push|shift)\s+(.+?)\s+(?:to|until)\s+tomorrow\b/i.exec(raw);
   if (moveTomorrowCue) {
      const target = findReferencedItem(state, moveTomorrowCue[1]);
      if (target) {
         const tomorrow = new Date();
         tomorrow.setDate(tomorrow.getDate() + 1);
         tomorrow.setHours(12, 0, 0, 0);
         return {
            reply: `Okay — ${target.title} moves to tomorrow.`,
            actions: [{ type: "update_item", targetId: target.id, changes: { dueAt: tomorrow.getTime(), allDay: true, timingPrecision: "day", pinToToday: false, state: "active" } }],
         };
      }
   }

   const looksLikeQuestion = /\?$/.test(raw) || /^(?:what|when|where|which|who|why|how|do i|am i|can i|should i|is there|are there)\b/i.test(raw);
   if (looksLikeQuestion) return { reply: localQuestionResponse(raw, state), actions: [] };

   const waiting = /\b(?:waiting\s+(?:on|for)|hear back|response from|reply from)\b/i.test(raw);
   const someday = /\b(?:someday|eventually|one day|when i get around to it)\b/i.test(raw);
   const recurrence = parseRecurrence(raw);
   const date = parseLifeDateTime(raw);
   // “I have / I’ve got X Friday at 9” is ordinary calendar language even
   // when X is not in a vocabulary list. “I have to X” remains a task. This
   // broadens creation without teaching users a magic command or hardcoding
   // their personal examples.
   // "Remind me to pack lunch" is a point-in-time task, not a lunch event.
   // The shared classifier keeps that distinction identical in tests and in
   // the mutation path that ultimately drives routine reconciliation.
   const declarativeCommitment = promptDescribesCommitment(raw, Boolean(date.timestamp));
   const actionCue =
      waiting ||
      someday ||
      recurrence !== "none" ||
      declarativeCommitment ||
      /\b(?:remind me|set (?:a )?reminder|don't let me forget|do not let me forget|i need(?: to)?|i have to|i should|we need(?: to)?|we have to|need(?: to)?|add|create|put|pick up|buy|call|email|submit|pay|renew|schedule|book|order|return|send|finish|complete|do)\b/i.test(raw);

   if (!actionCue) return { reply: localQuestionResponse(raw, state), actions: [] };

   const title = canonicalTaskTitleFromPrompt(raw);
   const context = contextFromText(raw);
   const importance = /\b(?:urgent|important|must|deadline|can't forget|cannot forget|due)\b/i.test(lower) ? "high" : "normal";
   const kind = waiting ? "waiting" : recurrence !== "none" ? "routine" : declarativeCommitment ? "commitment" : "task";
   const stateValue = waiting ? "waiting" : someday ? "someday" : "active";
   const timingPrecision = someday ? "someday" : date.precision;

   const item = {
      title,
      details: taskReasonFromPrompt(raw) || undefined,
      kind,
      state: stateValue,
      context,
      importance,
      recurrence,
      timingPrecision,
      dueAt: waiting ? undefined : date.timestamp,
      startAt: kind === "commitment" ? date.timestamp : undefined,
      followUpAt: waiting ? date.timestamp : undefined,
      allDay: date.allDay,
      pinToToday: date.timestamp ? isSameDay(date.timestamp, Date.now()) : false,
   } as const;

   const timing = date.timestamp ? ` for ${formatLifeDate(date.timestamp)}${date.allDay ? "" : ` at ${formatLifeTime(date.timestamp)}`}` : someday ? " for later" : waiting ? " in Waiting" : "";
   return { reply: `${title}${timing}.`, actions: [{ type: "create_item", item }] };
}
