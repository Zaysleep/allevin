const RELATIVE_AMOUNT_WORDS: Record<string, number> = {
   a: 1,
   an: 1,
   one: 1,
   two: 2,
   three: 3,
   four: 4,
   five: 5,
   six: 6,
   seven: 7,
   eight: 8,
   nine: 9,
   ten: 10,
};

/**
 * Resolve short relative reminders from the current local instant. These are
 * clock moments, unlike calendar offsets such as "in a month," so they retain
 * neither all-day semantics nor a guessed AM/PM value.
 */
export function parseRelativeClockMoment(value: string, nowTimestamp = Date.now()) {
   const lower = value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
   const relative = lower.match(/\bin\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(minute|hour)s?\b/);
   if (!relative) return null;

   const amount = Math.max(1, Math.min(24 * 60, RELATIVE_AMOUNT_WORDS[relative[1]] || Number(relative[1]) || 1));
   const minutes = relative[2] === "hour" ? amount * 60 : amount;
   const date = new Date(nowTimestamp + minutes * 60_000);
   date.setSeconds(0, 0);
   return date;
}

/** Resolve "in a month" style offsets while preserving the local day. */
export function parseRelativeCalendarDate(value: string, nowTimestamp = Date.now()) {
   const lower = value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
   const relative = lower.match(/\bin\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(day|week|month)s?\b/);
   if (!relative) return null;

   const amount = Math.max(1, Math.min(365, RELATIVE_AMOUNT_WORDS[relative[1]] || Number(relative[1]) || 1));
   const date = new Date(nowTimestamp);
   if (relative[2] === "day") date.setDate(date.getDate() + amount);
   if (relative[2] === "week") date.setDate(date.getDate() + amount * 7);
   if (relative[2] === "month") {
      const originalDay = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + amount);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(originalDay, lastDay));
   }
   return date;
}
