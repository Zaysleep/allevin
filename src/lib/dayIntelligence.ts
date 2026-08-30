import type { AllevinTone } from "@/lib/allevinVoice";
import { rhythmVoice } from "@/lib/allevinVoice";
import { buildRhythmForDate, formatClock, minutesFromClock, type DailyRhythmState } from "@/lib/dailyRhythm";
import { buildLifeViews, formatLifeDate } from "@/lib/lifeEngine";
import type { KinAction, LifeItem, LifeState } from "@/lib/lifeTypes";

export interface DayIntelligenceResult {
   handled: boolean;
   reply: string;
}

function normalize(value: string) {
   return value.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9\s:/-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isToday(timestamp?: number) {
   if (!timestamp) return false;
   const target = new Date(timestamp);
   const now = new Date();
   return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth() && target.getDate() === now.getDate();
}

function timestampMinutes(timestamp: number) {
   const date = new Date(timestamp);
   return date.getHours() * 60 + date.getMinutes();
}

function formatMinutes(total: number) {
   const hours = Math.floor(total / 60);
   const minutes = total % 60;
   if (!hours) return `${minutes} min`;
   if (!minutes) return `${hours} hr`;
   return `${hours} hr ${minutes} min`;
}

function requestedDayFromPrompt(lower: string, now = new Date()) {
   const target = new Date(now);

   if (/\bday after tomorrow\b/.test(lower)) {
      target.setDate(now.getDate() + 2);
      return target;
   }

   if (/\btomorrow\b/.test(lower)) {
      target.setDate(now.getDate() + 1);
      return target;
   }

   if (/\b(?:today|tonight)\b/.test(lower)) return target;

   const weekdayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
   };

   for (const [name, day] of Object.entries(weekdayMap)) {
      if (!new RegExp(`\\b${name}\\b`).test(lower)) continue;
      let delta = (day - now.getDay() + 7) % 7;
      if (delta === 0 && new RegExp(`\\bnext\\s+${name}\\b`).test(lower)) delta = 7;
      target.setDate(now.getDate() + delta);
      return target;
   }

   if (
      /\b(?:what does my day look like|what does the day look like|what s my day look like|what is my day looking like|show me my day|what is on my schedule|what s on my schedule)\b/.test(lower)
   ) {
      return target;
   }

   return null;
}


/**
 * Factual day readbacks should never depend on the LLM recognizing one exact
 * sentence shape. Once ALLEVIN can resolve the requested date, common ways of
 * asking "what does that day look like?" route to deterministic schedule truth.
 *
 * This is intentionally generic: it works for today/tomorrow/named weekdays
 * and does not encode any user's schedule or activities.
 */
function isDayReadbackPrompt(lower: string) {
   const dayToken =
      "(?:today|tonight|tomorrow|day after tomorrow|(?:next\\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))";

   return (
      /\b(?:what does my day look like|what does the day look like|what s my day look like|what is my day looking like|show me my day|what is on my schedule|what s on my schedule)\b/.test(lower) ||
      new RegExp(`\\bwhat does ${dayToken} look like(?: now)?\\b`).test(lower) ||
      new RegExp(`\\bwhat (?:s|is) ${dayToken} (?:look like|looking like)\\b`).test(lower) ||
      new RegExp(`\\b(?:show me|run me through) ${dayToken}(?: s)? (?:day|schedule)\\b`).test(lower) ||
      new RegExp(`\\bwhat (?:s|is) on ${dayToken}(?: s)? schedule\\b`).test(lower) ||
      new RegExp(`\\bwhat (?:s|is) ${dayToken}(?: s)? schedule\\b`).test(lower)
   );
}

function isSameLocalDate(timestamp: number, date: Date) {
   const target = new Date(timestamp);
   return (
      target.getFullYear() === date.getFullYear() &&
      target.getMonth() === date.getMonth() &&
      target.getDate() === date.getDate()
   );
}

function dayReadbackLabel(date: Date) {
   return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function dayReadback(lifeState: LifeState, rhythm: DailyRhythmState, date: Date) {
   const rhythmRows = buildRhythmForDate(rhythm, date)
      .filter((entry) => !entry.skipped)
      .map((entry) => {
         const start = minutesFromClock(entry.time);
         const label =
            entry.kind === "schedule" && entry.endTime
               ? `${formatClock(entry.time)}–${formatClock(entry.endTime)} — ${entry.title}`
               : `${formatClock(entry.time)} — ${entry.title}`;
         return { sort: start, label };
      });

   const lifeRows = lifeState.items
      .filter((item) => item.state === "active")
      .filter((item) => {
         const when = item.startAt || item.dueAt;
         return Boolean(when && isSameLocalDate(when, date));
      })
      .map((item) => {
         const when = item.startAt || item.dueAt || 0;
         const start = item.allDay ? -1 : timestampMinutes(when);
         const startLabel = item.allDay
            ? "All day"
            : new Date(when).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
         const endLabel =
            !item.allDay && item.endAt
               ? `–${new Date(item.endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
               : "";
         return { sort: start, label: `${startLabel}${endLabel} — ${item.title}` };
      });

   const rows = [...rhythmRows, ...lifeRows].sort((left, right) => left.sort - right.sort || left.label.localeCompare(right.label));
   if (!rows.length) return `${dayReadbackLabel(date)}\n\nNothing is scheduled.`;
   return `${dayReadbackLabel(date)}\n\n${rows.map((row) => row.label).join("\n")}`;
}

function availableMinutesFromPrompt(lower: string) {
   const minute = lower.match(/\b(?:i\s+(?:only\s+)?have|i\s+ve\s+got|got)\s+(?:about\s+)?(\d{1,3})\s*(?:minutes?|mins?)\b/);
   if (minute) return Math.max(5, Math.min(720, Number(minute[1])));
   const hour = lower.match(/\b(?:i\s+(?:only\s+)?have|i\s+ve\s+got|got)\s+(?:about\s+)?(\d+(?:\.\d+)?)\s*hours?\b/);
   if (hour) return Math.max(5, Math.min(720, Math.round(Number(hour[1]) * 60)));
   return null;
}

function activeCandidateItems(state: LifeState) {
   const views = buildLifeViews(state);
   const unique = new Map<string, LifeItem>();
   for (const item of [...views.today, ...views.whenever]) unique.set(item.id, item);
   return [...unique.values()].filter((item) => item.state === "active");
}

function chooseTaskForWindow(state: LifeState, minutes: number) {
   const candidates = activeCandidateItems(state)
      .filter((item) => item.kind !== "commitment")
      .filter((item) => typeof item.durationMinutes === "number" && item.durationMinutes <= minutes)
      .sort((left, right) => {
         const importance = { high: 3, normal: 2, low: 1 };
         const score = importance[right.importance] - importance[left.importance];
         if (score) return score;
         return (left.durationMinutes || 999) - (right.durationMinutes || 999);
      });
   return candidates[0] || null;
}

function nextRhythmEntry(rhythm: DailyRhythmState, now = new Date()) {
   const nowMinutes = now.getHours() * 60 + now.getMinutes();
   return buildRhythmForDate(rhythm, now)
      .filter((entry) => !entry.completed && !entry.skipped)
      .find((entry) => entry.status === "due" || minutesFromClock(entry.time) >= nowMinutes) || null;
}

function nextLifeCommitment(state: LifeState) {
   return state.items
      .filter((item) => item.state === "active" && item.kind === "commitment" && item.startAt && item.startAt >= Date.now())
      .sort((left, right) => (left.startAt || 0) - (right.startAt || 0))[0] || null;
}

export function answerDayIntelligence(prompt: string, lifeState: LifeState, rhythm: DailyRhythmState, tone: AllevinTone = "direct"): DayIntelligenceResult {
   const raw = prompt.trim();
   const lower = normalize(raw);
   if (!raw) return { handled: false, reply: "" };

   const requestedDay = requestedDayFromPrompt(lower);
   const asksForDayReadback = isDayReadbackPrompt(lower);

   if (requestedDay && asksForDayReadback) {
      // State/date/schedule truth is deterministic. The LLM is not allowed to
      // summarize away entries or reconstruct weekday membership from prose.
      return { handled: true, reply: dayReadback(lifeState, rhythm, requestedDay) };
   }

   const available = availableMinutesFromPrompt(lower);
   if (available !== null) {
      const task = chooseTaskForWindow(lifeState, available);
      const next = nextRhythmEntry(rhythm);
      if (task) return { handled: true, reply: `You have ${formatMinutes(available)}. Use it for ${task.title}.` };
      if (next) return { handled: true, reply: `You have ${formatMinutes(available)} before the next part of the day. Nothing recorded cleanly fits that window. Keep the space.` };
      return { handled: true, reply: `You have ${formatMinutes(available)}. Nothing recorded needs to fill it.` };
   }

   if (/\b(?:what should i do next|what do i do next|what next|what should i be doing)\b/.test(lower)) {
      const rhythmEntry = nextRhythmEntry(rhythm);
      const views = buildLifeViews(lifeState);
      const attention = views.attention[0]?.item;
      const today = views.today[0];
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

      if (rhythmEntry && rhythmEntry.status === "due") return { handled: true, reply: rhythmVoice("start", rhythmEntry.title, tone) };
      if (attention) return { handled: true, reply: `${attention.title}. That is the cleanest thing to handle next.` };
      if (today) return { handled: true, reply: `${today.title} is the next recorded thing worth doing.` };
      if (rhythmEntry) {
         const gap = minutesFromClock(rhythmEntry.time) - nowMinutes;
         if (gap <= 30) return { handled: true, reply: `${rhythmEntry.title} starts in about ${Math.max(0, gap)} minutes. Do not cram something pointless into the gap.` };
      }
      return { handled: true, reply: rhythmVoice("clear", "", tone) };
   }

   if (/\b(?:when am i free|when do i have time|where am i free|free time today|what time am i free)\b/.test(lower)) {
      const now = new Date();
      const startOfWindow = now.getHours() * 60 + now.getMinutes();
      const endOfWindow = 22 * 60;
      const intervals: Array<{ start: number; end: number }> = [];

      for (const entry of buildRhythmForDate(rhythm, now)) {
         if (entry.completed || entry.skipped) continue;
         const start = minutesFromClock(entry.time);
         const end = entry.endTime ? minutesFromClock(entry.endTime) : start + (entry.durationMinutes || 30);
         if (end > startOfWindow) intervals.push({ start: Math.max(start, startOfWindow), end });
      }

      for (const item of lifeState.items) {
         if (item.state !== "active" || item.kind !== "commitment" || !item.startAt || !isToday(item.startAt)) continue;
         const start = timestampMinutes(item.startAt);
         const end = item.endAt ? timestampMinutes(item.endAt) : start + (item.durationMinutes || 30);
         if (end > startOfWindow) intervals.push({ start: Math.max(start, startOfWindow), end });
      }

      intervals.sort((a, b) => a.start - b.start);
      const merged: Array<{ start: number; end: number }> = [];
      for (const interval of intervals) {
         const last = merged[merged.length - 1];
         if (!last || interval.start > last.end) merged.push({ ...interval });
         else last.end = Math.max(last.end, interval.end);
      }

      const gaps: Array<{ start: number; end: number }> = [];
      let cursor = startOfWindow;
      for (const interval of merged) {
         if (interval.start - cursor >= 30) gaps.push({ start: cursor, end: interval.start });
         cursor = Math.max(cursor, interval.end);
      }
      if (endOfWindow - cursor >= 30) gaps.push({ start: cursor, end: endOfWindow });

      if (!gaps.length) return { handled: true, reply: "I do not see a clean 30-minute opening left today." };
      return {
         handled: true,
         reply: gaps.slice(0, 3).map((gap) => `${formatClock(`${String(Math.floor(gap.start / 60)).padStart(2, "0")}:${String(gap.start % 60).padStart(2, "0")}`)}–${formatClock(`${String(Math.floor(gap.end / 60)).padStart(2, "0")}:${String(gap.end % 60).padStart(2, "0")}`)}`).join("\n"),
      };
   }

   if (/\b(?:what am i forgetting|am i forgetting anything|anything i forgot)\b/.test(lower)) {
      const views = buildLifeViews(lifeState);
      if (views.attention.length) return { handled: true, reply: `The thing I would not ignore is ${views.attention[0].item.title}.` };
      const next = nextLifeCommitment(lifeState);
      if (next) return { handled: true, reply: `Nothing looks forgotten. Your next recorded commitment is ${next.title} — ${formatLifeDate(next.startAt)}.` };
      return { handled: true, reply: "Nothing recorded looks forgotten. I cannot know about something you never told me, which is inconvenient but honest." };
   }

   if (/\b(?:anything i should worry about this week|anything important this week|what matters this week)\b/.test(lower)) {
      const views = buildLifeViews(lifeState);
      const high = views.upcoming.filter((item) => item.importance === "high").slice(0, 3);
      const attention = views.attention.map(({ item }) => item).slice(0, 3);
      const merged = [...new Map([...attention, ...high].map((item) => [item.id, item])).values()];
      if (!merged.length) return { handled: true, reply: "Nothing recorded this week looks like a fire. Good. Keep it that way." };
      return { handled: true, reply: merged.map((item) => `${formatLifeDate(item.startAt || item.dueAt)} — ${item.title}`).join("\n") };
   }

   if (/\b(?:what changed today|what did i change today|what happened today)\b/.test(lower)) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const activities = lifeState.activities.filter((activity) => activity.at >= start.getTime()).slice(-6).reverse();
      if (!activities.length) return { handled: true, reply: "No recorded life-state changes today." };
      return { handled: true, reply: activities.map((activity) => `${activity.itemTitle} — ${activity.kind}`).join("\n") };
   }

   return { handled: false, reply: "" };
}

function tokens(value: string) {
   return normalize(value).split(" ").filter((word) => word.length > 2);
}


const REFERENCE_STOP_WORDS = new Set([
   "the", "this", "that", "those", "these", "my", "our", "your", "their",
   "was", "were", "is", "are", "be", "been", "being", "have", "has", "had",
   "cancel", "cancelled", "canceled", "remove", "removed", "delete", "deleted",
   "archive", "archived", "complete", "completed", "done", "finish", "finished",
   "at", "on", "in", "for", "to", "from", "of", "with", "and", "or",
   "today", "tomorrow", "tonight", "yesterday", "next",
   "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
   "am", "pm", "noon", "midnight", "thing", "item", "event",
]);

/**
 * Destructive commands need semantic identity as well as a matching clock.
 * The LLM may return a concrete targetId, but that ID is only a proposal. If
 * the user explicitly names a noun ("meeting", "dentist", "interview", etc.),
 * the target title must share one of those identity-bearing words.
 *
 * This is intentionally conservative: when identity and clock disagree,
 * ALLEVIN asks instead of deleting the wrong commitment.
 */
function explicitReferenceTerms(value: string) {
   return tokens(value)
      .filter((word) => !REFERENCE_STOP_WORDS.has(word))
      .filter((word) => !/^\d+$/.test(word));
}

function targetMatchesExplicitReference(item: LifeItem, userPrompt: string) {
   const terms = explicitReferenceTerms(userPrompt);
   if (!terms.length) return true;

   const titleTerms = new Set(tokens(item.title));
   return terms.some((term) => titleTerms.has(term));
}

function explicitClockMinutes(value: string) {
   const lower = value.toLowerCase();
   if (/\bnoon\b/.test(lower)) return 12 * 60;
   if (/\bmidnight\b/.test(lower)) return 0;

   const match = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
   if (!match) return null;

   let hour = Number(match[1]);
   const minute = Number(match[2] || 0);
   if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 12 || minute > 59) return null;
   if (match[3] === "pm" && hour < 12) hour += 12;
   if (match[3] === "am" && hour === 12) hour = 0;
   return hour * 60 + minute;
}

function localClockMinutes(timestamp?: number) {
   if (!timestamp) return null;
   const date = new Date(timestamp);
   return date.getHours() * 60 + date.getMinutes();
}

function clockLabel(minutes: number) {
   const hour24 = Math.floor(minutes / 60) % 24;
   const minute = minutes % 60;
   const suffix = hour24 >= 12 ? "PM" : "AM";
   const hour = hour24 % 12 || 12;
   return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function referenceCandidates(state: LifeState, query: string, expectedClock: number | null = null) {
   const queryTokens = tokens(query);
   return state.items
      .filter((item) => item.state !== "archived")
      .map((item) => {
         const title = normalize(item.title);
         const itemTokens = tokens(title);
         const overlap = itemTokens.filter((word) => queryTokens.includes(word)).length;
         const score = title === normalize(query) ? 100 : title.includes(normalize(query)) || normalize(query).includes(title) ? 50 : overlap;
         return { item, score };
      })
      .filter(({ item, score }) => {
         if (score <= 0) return false;
         if (expectedClock === null) return true;

         // A time-qualified correction/cancellation must target the item at that
         // time. "Cancel my 2 PM meeting" must never silently grab a 10 AM
         // meeting merely because both titles contain the word "meeting".
         const itemClock = localClockMinutes(item.startAt || item.dueAt);
         return itemClock !== null && itemClock === expectedClock;
      })
      .sort((a, b) => b.score - a.score);
}

function resolvedActionTarget(action: KinAction, state: LifeState, expectedClock: number | null = null) {
   if (action.targetId) {
      const item = state.items.find((candidate) => candidate.id === action.targetId && candidate.state !== "archived");
      if (!item) return undefined;
      if (expectedClock === null) return item;
      return localClockMinutes(item.startAt || item.dueAt) === expectedClock ? item : undefined;
   }

   if (!action.targetQuery) return undefined;
   return referenceCandidates(state, action.targetQuery, expectedClock)[0]?.item;
}

function actionProposedItem(action: KinAction, state: LifeState): Partial<LifeItem> | null {
   if (action.type === "create_item") return action.item || null;
   if (action.type !== "update_item") return null;
   const existing = resolvedActionTarget(action, state);
   if (!existing) return action.changes || null;
   return { ...existing, ...(action.changes || {}) };
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
   return startA < endB && startB < endA;
}

function commitmentInterval(item: Pick<LifeItem, "startAt" | "endAt" | "durationMinutes"> | Partial<LifeItem>) {
   if (!item.startAt) return null;
   return {
      start: item.startAt,
      end: item.endAt || item.startAt + (item.durationMinutes || 30) * 60_000,
   };
}

function intervalContains(parent: { start: number; end: number }, child: { start: number; end: number }) {
   return parent.start <= child.start && parent.end >= child.end;
}

function compatibleNestedCommitments(
   proposed: Partial<LifeItem>,
   existing: LifeItem,
   userPrompt: string,
) {
   const proposedInterval = commitmentInterval(proposed);
   const existingInterval = commitmentInterval(existing);
   if (!proposedInterval || !existingInterval) return false;

   const nested =
      intervalContains(existingInterval, proposedInterval) ||
      intervalContains(proposedInterval, existingInterval);
   if (!nested) return false;

   const sameContext = Boolean(proposed.context && proposed.context === existing.context);
   const explicitContainment = /\b(?:during|inside|within|part of)\b/i.test(userPrompt);

   // Long commitments can be containers (conference, work block imported as a
   // life event, class day, etc.). Same-context or explicit "during" language
   // is enough to treat the smaller event as part of the larger one.
   return sameContext || explicitContainment;
}

export interface AssistantScheduleRelation {
   childTitle: string;
   parentTitle: string;
   kind: "contained" | "overlap";
}

/**
 * A recurring schedule block is an ongoing context, not a mutually-exclusive
 * appointment. A meeting can live inside Work; an appointment can also sit
 * inside Work while still requiring the user to account for time away.
 *
 * This helper describes that relationship without mutating either item.
 */
export function assistantScheduleRelations(
   actions: KinAction[],
   state: LifeState,
   rhythm: DailyRhythmState,
   userPrompt = "",
): AssistantScheduleRelation[] {
   const relations: AssistantScheduleRelation[] = [];

   for (const action of actions) {
      const proposed = actionProposedItem(action, state);
      if (!proposed || proposed.kind !== "commitment" || !proposed.startAt) continue;

      const interval = commitmentInterval(proposed);
      if (!interval) continue;
      const date = new Date(proposed.startAt);

      for (const entry of buildRhythmForDate(rhythm, date)) {
         if (entry.kind !== "schedule") continue;

         const blockStart = new Date(date);
         const [sh, sm] = entry.time.split(":").map(Number);
         blockStart.setHours(sh, sm, 0, 0);
         const blockEnd = new Date(date);
         const [eh, em] = (entry.endTime || entry.time).split(":").map(Number);
         blockEnd.setHours(eh, em, 0, 0);

         if (!overlaps(interval.start, interval.end, blockStart.getTime(), blockEnd.getTime())) continue;

         const sameContext = Boolean(proposed.context && proposed.context === entry.category);
         const explicitContainment =
            new RegExp(`\\b(?:during|inside|within)\\s+(?:my\\s+)?(?:${entry.title}|${entry.category})\\b`, "i").test(userPrompt);

         relations.push({
            childTitle: proposed.title || "That commitment",
            parentTitle: entry.title,
            kind: sameContext || explicitContainment ? "contained" : "overlap",
         });
      }
   }

   return relations;
}

export function mergeScheduleRelationReply(
   reply: string,
   relations: AssistantScheduleRelation[],
) {
   if (!relations.length) return reply;

   const relation =
      relations.find((candidate) => candidate.kind === "overlap") ||
      relations[0];
   const lowerReply = reply.toLowerCase();

   // If provider wording still treats a parent schedule as a mutually-exclusive
   // appointment, replace that single sentence with deterministic relationship
   // truth. This is a safety correction, not the normal voice path.
   if (/\b(?:conflict|move one|choose one|which one)\b/.test(lowerReply)) {
      if (relation.kind === "contained") {
         return `${relation.childTitle} is in. ${relation.parentTitle} stays put; this is part of that block, not a replacement for it.`;
      }
      return `${relation.childTitle} is in. ${relation.parentTitle} stays put too; they overlap, so the only thing left to solve is the real-world buffer around the one-off commitment.`;
   }

   const alreadyExplained =
      lowerReply.includes(relation.parentTitle.toLowerCase()) &&
      /\b(?:stay|stays|keep|keeps|inside|within|during|part of|overlap)\b/.test(lowerReply);
   if (alreadyExplained) return reply;

   if (relation.kind === "overlap") {
      return `${reply} ${relation.parentTitle} stays in place; ${relation.childTitle} sits inside that block, so any travel or time-away buffer still needs to fit.`.trim();
   }

   return `${reply} ${relation.parentTitle} stays intact; ${relation.childTitle} is part of that block, not a replacement for it.`.trim();
}

/**
 * Detects true one-off collisions and transition pressure. The caller may let
 * the user confirm anyway; this function reports deterministic conflict truth
 * but never silently decides that the event cannot exist.
 * Overlap with a recurring Work/Class/etc. schedule is allowed because that
 * block represents ongoing context. `assistantScheduleRelations()` reports the
 * relationship separately so the UI/chat can explain it without deleting the
 * parent schedule.
 */
export function preflightAssistantActions(
   actions: KinAction[],
   state: LifeState,
   rhythm: DailyRhythmState,
   userPrompt = "",
): string | null {
   const promptClock = explicitClockMinutes(userPrompt);

   for (const action of actions) {
      if (action.type !== "create_item") {
         // On a move/update, an explicit clock usually describes the NEW time.
         // On a cancellation/completion, it can identify WHICH existing item
         // the user means. Only use it as a reference constraint in the latter
         // case so "move my 2 PM meeting to 3" does not reject the 2 PM item.
         const referenceClock =
            action.type === "archive_item" || action.type === "complete_item"
               ? promptClock
               : null;
         const target = resolvedActionTarget(action, state, referenceClock);

         if (!target) {
            const requested = action.targetQuery || "that item";
            const time = referenceClock === null ? "" : ` at ${clockLabel(referenceClock)}`;
            return `I can’t find a matching ${requested}${time} to change. Give me the title or day if you meant something else.`;
         }

         if (
            (action.type === "archive_item" || action.type === "complete_item") &&
            !targetMatchesExplicitReference(target, userPrompt)
         ) {
            const time = referenceClock === null ? "" : ` at ${clockLabel(referenceClock)}`;
            return `I can’t match what you called it to ${target.title}${time}, so I left it alone. Tell me the exact title if you meant that item.`;
         }

         if (action.targetQuery && !action.targetId) {
            const matches = referenceCandidates(state, action.targetQuery, referenceClock);
            if (matches.length > 1 && matches[0].score === matches[1].score) {
               return `I found more than one match for “${action.targetQuery}.” Tell me which one you mean.`;
            }
         }
      }

      const proposed = actionProposedItem(action, state);
      if (!proposed || proposed.kind !== "commitment" || !proposed.startAt) continue;
      const proposedInterval = commitmentInterval(proposed);
      if (!proposedInterval) continue;

      // Recurring schedule blocks intentionally do not block creation here.
      // They are parent contexts, and the relationship is described separately.

      const itemConflict = state.items.find((item) => {
         if (item.state !== "active" || item.kind !== "commitment" || !item.startAt) return false;
         if (action.targetId && item.id === action.targetId) return false;
         const itemInterval = commitmentInterval(item);
         if (!itemInterval) return false;
         if (!overlaps(proposedInterval.start, proposedInterval.end, itemInterval.start, itemInterval.end)) return false;
         return !compatibleNestedCommitments(proposed, item, userPrompt);
      });

      if (itemConflict) {
         return `${proposed.title || "That"} overlaps ${itemConflict.title}. I left the schedule unchanged.`;
      }

      const travelMinutes = 0;
      const neighbors = state.items
         .filter((item) => item.state === "active" && item.kind === "commitment" && item.startAt)
         .filter((item) => !action.targetId || item.id !== action.targetId)
         .flatMap((item) => {
            const interval = commitmentInterval(item);
            if (!interval || overlaps(proposedInterval.start, proposedInterval.end, interval.start, interval.end)) return [];
            const gapMs = interval.start >= proposedInterval.end
               ? interval.start - proposedInterval.end
               : proposedInterval.start - interval.end;
            return [{ item, gapMinutes: Math.round(gapMs / 60_000) }];
         })
         .filter((neighbor) => neighbor.gapMinutes >= 0 && neighbor.gapMinutes <= Math.max(10, travelMinutes))
         .sort((left, right) => left.gapMinutes - right.gapMinutes);
      const nearest = neighbors[0];
      if (nearest) {
         const travelApplies = travelMinutes > 0 && Boolean(proposed.location || nearest.item.location);
         if (travelApplies && nearest.gapMinutes < travelMinutes) {
            return `${proposed.title || "That"} leaves ${nearest.gapMinutes} minutes next to ${nearest.item.title}, but your usual travel time is ${travelMinutes} minutes. I left the schedule unchanged.`;
         }
         if (nearest.gapMinutes <= 10) {
            return `${proposed.title || "That"} leaves only ${nearest.gapMinutes} minutes next to ${nearest.item.title}. That transition is very tight, so I left the schedule unchanged.`;
         }
      }
   }

   return null;
}
