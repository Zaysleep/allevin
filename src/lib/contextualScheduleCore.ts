// ========================================
// ALLEVIN MK XIII — Contextual Schedule Core
// Pure deterministic interval/reference logic. This module deliberately has no
// browser, storage, React, or LLM dependency so schedule truth stays testable.
// ========================================

export interface ContextualScheduleItem {
   id: string;
   title: string;
   start: number;
   end: number;
   hard: boolean;
   kind: "schedule" | "routine" | "commitment" | "task";
   context?: string;
   transitionBeforeMinutes?: number;
   transitionAfterMinutes?: number;
}

export interface AvailabilityWindow {
   start: number;
   end: number;
   minutes: number;
}

export type ReferenceResolution =
   | { status: "resolved"; item: ContextualScheduleItem }
   | { status: "ambiguous"; items: ContextualScheduleItem[] }
   | { status: "not-found"; items: [] };

export interface ScheduleConflictIssue {
   kind: "overlap" | "travel" | "tight";
   item: ContextualScheduleItem;
   gapMinutes: number;
}

const REFERENCE_FILLER = new Set([
   "a", "an", "the", "my", "our", "that", "it", "this", "thing", "item",
   "appointment", "event", "scheduled", "schedule", "today", "tomorrow",
   "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
]);

export function normalizeContextText(value: string) {
   return value
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9\s-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function referenceTokens(value: string) {
   return normalizeContextText(value)
      .split(" ")
      .filter((token) => token.length > 1 && !REFERENCE_FILLER.has(token));
}

export function resolveContextualReference(
   query: string,
   items: ContextualScheduleItem[],
   previousReferenceId?: string,
): ReferenceResolution {
   const normalized = normalizeContextText(query);
   const pronounOnly = /^(?:that|it|that one|the one|that thing|the appointment|the meeting)$/.test(normalized);

   if (pronounOnly && previousReferenceId) {
      const previous = items.find((item) => item.id === previousReferenceId);
      if (previous) return { status: "resolved", item: previous };
   }

   const queryTokens = referenceTokens(normalized);
   const ranked = items
      .map((item) => {
         const title = normalizeContextText(item.title);
         const titleTokens = referenceTokens(title);
         const overlap = titleTokens.filter((token) => queryTokens.includes(token)).length;
         let score = 0;
         if (normalized === title) score = 120;
         else if (normalized && (title.includes(normalized) || normalized.includes(title))) score = 80;
         else if (overlap) score = overlap * 18 + (overlap === titleTokens.length ? 8 : 0);
         return { item, score };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.item.start - right.item.start);

   if (!ranked.length) return { status: "not-found", items: [] };
   const tied = ranked.filter((candidate) => candidate.score === ranked[0].score);
   if (tied.length > 1) return { status: "ambiguous", items: tied.slice(0, 5).map((candidate) => candidate.item) };
   return { status: "resolved", item: ranked[0].item };
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>) {
   const ordered = intervals
      .filter((interval) => interval.end > interval.start)
      .sort((left, right) => left.start - right.start || left.end - right.end);
   const merged: Array<{ start: number; end: number }> = [];

   for (const interval of ordered) {
      const last = merged[merged.length - 1];
      if (!last || interval.start > last.end) merged.push({ ...interval });
      else last.end = Math.max(last.end, interval.end);
   }
   return merged;
}

export function calculateAvailability(
   items: ContextualScheduleItem[],
   windowStart: number,
   windowEnd: number,
   minimumMinutes = 15,
): AvailabilityWindow[] {
   if (windowEnd <= windowStart) return [];

   const occupied = mergeIntervals(
      items.map((item) => ({
         start: Math.max(windowStart, item.start - Math.max(0, item.transitionBeforeMinutes || 0)),
         end: Math.min(windowEnd, item.end + Math.max(0, item.transitionAfterMinutes || 0)),
      })),
   );

   const gaps: AvailabilityWindow[] = [];
   let cursor = windowStart;
   for (const interval of occupied) {
      if (interval.start > cursor) {
         const minutes = interval.start - cursor;
         if (minutes >= minimumMinutes) gaps.push({ start: cursor, end: interval.start, minutes });
      }
      cursor = Math.max(cursor, interval.end);
   }
   if (windowEnd > cursor) {
      const minutes = windowEnd - cursor;
      if (minutes >= minimumMinutes) gaps.push({ start: cursor, end: windowEnd, minutes });
   }
   return gaps;
}

export function analyzeScheduleConflict(
   proposed: Pick<ContextualScheduleItem, "start" | "end" | "context">,
   existing: ContextualScheduleItem[],
   travelMinutes = 0,
): ScheduleConflictIssue[] {
   const issues: ScheduleConflictIssue[] = [];
   const ordered = [...existing].sort((left, right) => left.start - right.start);

   for (const item of ordered) {
      if (proposed.start < item.end && item.start < proposed.end) {
         issues.push({ kind: "overlap", item, gapMinutes: -Math.min(item.end - proposed.start, proposed.end - item.start) });
         continue;
      }

      const beforeGap = proposed.start >= item.end ? proposed.start - item.end : Number.POSITIVE_INFINITY;
      const afterGap = item.start >= proposed.end ? item.start - proposed.end : Number.POSITIVE_INFINITY;
      const gap = Math.min(beforeGap, afterGap);
      if (!Number.isFinite(gap) || gap > Math.max(15, travelMinutes)) continue;

      const contextChanged = Boolean(proposed.context && item.context && proposed.context !== item.context);
      if (travelMinutes > 0 && contextChanged && gap < travelMinutes) {
         issues.push({ kind: "travel", item, gapMinutes: gap });
      } else if (gap <= 10) {
         issues.push({ kind: "tight", item, gapMinutes: gap });
      }
   }

   return issues.sort((left, right) => {
      const severity = { overlap: 3, travel: 2, tight: 1 };
      return severity[right.kind] - severity[left.kind] || left.gapMinutes - right.gapMinutes;
   });
}

export function describeDayShape(
   items: ContextualScheduleItem[],
   dayStart = 6 * 60,
   dayEnd = 23 * 60,
) {
   const ordered = [...items].sort((left, right) => left.start - right.start);
   const morning = ordered.filter((item) => item.start < 12 * 60);
   const hard = ordered.filter((item) => item.hard);
   const tightTransition = ordered.some((item, index) => {
      const next = ordered[index + 1];
      return Boolean(next && next.start >= item.end && next.start - item.end <= 10);
   });
   const eveningOpen = calculateAvailability(ordered, Math.max(17 * 60, dayStart), dayEnd, 90)
      .some((window) => window.minutes >= 90);
   const occupiedMinutes = mergeIntervals(ordered.map((item) => ({ start: item.start, end: item.end })))
      .reduce((total, interval) => total + Math.max(0, interval.end - interval.start), 0);

   return {
      demandingMorning: morning.length >= 3 || morning.reduce((total, item) => total + item.end - item.start, 0) >= 240,
      tightTransition,
      openEvening: eveningOpen,
      lightDay: hard.length <= 1 && occupiedMinutes <= 240,
      occupiedMinutes,
   };
}
