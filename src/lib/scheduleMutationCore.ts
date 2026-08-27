import type {
   DailyRhythmState,
   RhythmCategory,
   RhythmDay,
   RhythmScheduleBlock,
   ScheduleException,
} from "./dailyRhythm";

export interface ScheduleMutationSegment {
   days: RhythmDay[];
   start: string;
   end: string;
}

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

function parseClock(value: string) {
   const match = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
   if (!match) return null;
   let hours = Number(match[1]);
   const minutes = Number(match[2] || 0);
   const suffix = match[3].toLowerCase();
   if (suffix === "pm" && hours < 12) hours += 12;
   if (suffix === "am" && hours === 12) hours = 0;
   if (hours > 23 || minutes > 59) return null;
   return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseDaySpec(value: string): RhythmDay[] | null {
   const lower = value.toLowerCase();
   if (/\bweekdays?\b/.test(lower)) return [1, 2, 3, 4, 5];
   if (/\bweekends?\b/.test(lower)) return [0, 6];
   if (/\b(?:every day|daily)\b/.test(lower)) return [0, 1, 2, 3, 4, 5, 6];

   const range = lower.match(new RegExp(`\\b(${DAY_TOKEN_PATTERN})\\s*(?:through|thru|to|-)\\s*(${DAY_TOKEN_PATTERN})\\b`, "i"));
   if (range) {
      const start = dayFromToken(range[1]);
      const end = dayFromToken(range[2]);
      if (start !== null && end !== null) {
         const result: RhythmDay[] = [];
         let day = start;
         for (let count = 0; count < 7; count += 1) {
            result.push(day);
            if (day === end) break;
            day = ((day + 1) % 7) as RhythmDay;
         }
         return result;
      }
   }

   const tokens = [...lower.matchAll(new RegExp(`\\b(${DAY_TOKEN_PATTERN})\\b`, "gi"))]
      .map((match) => dayFromToken(match[1]))
      .filter((day): day is RhythmDay => day !== null);
   return tokens.length ? sortedDays(tokens) : null;
}

/** Parse one or more day + clock-range statements without involving an LLM. */
export function parseScheduleMutationSegments(value: string): ScheduleMutationSegment[] {
   const segments: ScheduleMutationSegment[] = [];
   const timeRangePattern = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(?:to|until|-|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/gi;
   let cursor = 0;

   for (const match of value.matchAll(timeRangePattern)) {
      const matchIndex = match.index ?? 0;
      const days = parseDaySpec(value.slice(cursor, matchIndex));
      const start = parseClock(match[1]);
      const end = parseClock(match[2]);
      if (days && start && end) segments.push({ days, start, end });
      cursor = matchIndex + match[0].length;
   }

   return segments;
}

export type ScheduleMutationMode = "merge" | "replace";
export type ScheduleMutationKind = "added" | "updated" | "replaced";

export interface ScheduleMutationResult {
   state: DailyRhythmState;
   kind: ScheduleMutationKind;
   affectedDays: RhythmDay[];
   preservedDays: RhythmDay[];
}

function sortedDays(days: Iterable<RhythmDay>) {
   return [...new Set(days)].sort() as RhythmDay[];
}

function nextScheduleId(category: RhythmCategory, reserved: Set<string>) {
   const base = `schedule-${category}`;
   if (!reserved.has(base)) return base;
   for (let index = 2; index < 100; index += 1) {
      const candidate = `${base}-${index}`;
      if (!reserved.has(candidate)) return candidate;
   }
   return `${base}-${Date.now()}`;
}

function dayForDateKey(dateKey: string): RhythmDay | null {
   if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
   const date = new Date(`${dateKey}T12:00:00`);
   if (Number.isNaN(date.getTime())) return null;
   return date.getDay() as RhythmDay;
}

function migrateScheduleExceptions(
   exceptions: DailyRhythmState["scheduleExceptions"],
   previousBlocks: RhythmScheduleBlock[],
   nextBlocks: RhythmScheduleBlock[],
   category: RhythmCategory,
) {
   const previousCategory = previousBlocks.filter((block) => block.category === category);
   const nextCategory = nextBlocks.filter((block) => block.category === category && block.enabled);
   const result: DailyRhythmState["scheduleExceptions"] = {};

   for (const [dateKey, values] of Object.entries(exceptions)) {
      const day = dayForDateKey(dateKey);
      const nextValues: Record<string, ScheduleException> = { ...values };
      if (day !== null) {
         const nextBlock = nextCategory.find((block) => block.days.includes(day));
         for (const previous of previousCategory.filter((block) => block.days.includes(day))) {
            const exception = values[previous.id];
            if (!exception) continue;
            delete nextValues[previous.id];
            if (nextBlock) nextValues[nextBlock.id] = { ...(nextValues[nextBlock.id] || {}), ...exception };
         }
      }
      if (Object.keys(nextValues).length) result[dateKey] = nextValues;
   }

   return result;
}

/**
 * Permanent schedule edits are day-aware. A normal statement updates only the
 * named days; deleting all other days requires explicit replace mode.
 */
export function applyScheduleMutation(
   current: DailyRhythmState,
   category: RhythmCategory,
   title: string,
   segments: ScheduleMutationSegment[],
   mode: ScheduleMutationMode = "merge",
): ScheduleMutationResult {
   const existingCategory = current.scheduleBlocks.filter((block) => block.category === category);
   const otherCategories = current.scheduleBlocks.filter((block) => block.category !== category);
   const affectedDays = sortedDays(segments.flatMap((segment) => segment.days));
   const affected = new Set<RhythmDay>(affectedDays);
   const existingDays = new Set<RhythmDay>(existingCategory.filter((block) => block.enabled).flatMap((block) => block.days));

   const retainedCategory = mode === "replace"
      ? []
      : existingCategory.flatMap((block): RhythmScheduleBlock[] => {
           const days = block.days.filter((day) => !affected.has(day));
           return days.length ? [{ ...block, days }] : [];
        });

   const reservedIds = new Set([...otherCategories, ...retainedCategory].map((block) => block.id));
   const consumedIds = new Set<string>();
   const incoming = segments.map((segment): RhythmScheduleBlock => {
      const reusable = existingCategory.find(
         (block) =>
            !reservedIds.has(block.id) &&
            !consumedIds.has(block.id) &&
            block.days.some((day) => segment.days.includes(day)),
      );
      const id = reusable?.id || nextScheduleId(category, new Set([...reservedIds, ...consumedIds]));
      consumedIds.add(id);
      return {
         id,
         title: reusable?.title || title,
         category,
         days: sortedDays(segment.days),
         start: segment.start,
         end: segment.end,
         enabled: true,
      };
   });

   const scheduleBlocks = [...otherCategories, ...retainedCategory, ...incoming];
   const nextCategoryBlocks = scheduleBlocks.filter((block) => block.category === category && block.enabled);
   const previousCategoryIds = new Set(existingCategory.map((block) => block.id));
   const anchors = current.anchors.map((anchor) => {
      if (
         anchor.dayRule !== "schedule" ||
         !anchor.scheduleBlockId ||
         !previousCategoryIds.has(anchor.scheduleBlockId)
      ) return anchor;

      const linkedStillExists = nextCategoryBlocks.some((block) => block.id === anchor.scheduleBlockId);
      if (linkedStillExists && nextCategoryBlocks.length === 1) return anchor;
      return {
         ...anchor,
         scheduleBlockId: undefined,
         scheduleCategory: category,
      };
   });

   const preservedDays = mode === "replace"
      ? []
      : sortedDays([...existingDays].filter((day) => !affected.has(day)));
   const kind: ScheduleMutationKind = mode === "replace"
      ? "replaced"
      : affectedDays.every((day) => !existingDays.has(day))
        ? "added"
        : "updated";

   return {
      state: {
         ...current,
         scheduleBlocks,
         anchors,
         scheduleExceptions: migrateScheduleExceptions(
            current.scheduleExceptions,
            current.scheduleBlocks,
            scheduleBlocks,
            category,
         ),
      },
      kind,
      affectedDays,
      preservedDays,
   };
}

export function parseExplicitDurationMinutes(value: string) {
   const minuteMatch = value.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i);
   if (minuteMatch) return Math.max(5, Math.min(360, Number(minuteMatch[1])));
   const hourMatch = value.match(/\b(\d+(?:\.\d+)?)\s*hours?\b/i);
   if (hourMatch) return Math.max(5, Math.min(360, Math.round(Number(hourMatch[1]) * 60)));
   return null;
}
