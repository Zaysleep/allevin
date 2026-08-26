// ========================================
// ALLEVIN MK XII.8 — Reality-Aware Day Adaptation
// Purpose:
// Translate day-specific user context into temporary rhythm changes.
//
// Architecture rule:
//   Base routine = what normally happens.
//   Reality overlay = what is true for this date.
//   Adapted day = base routine + date-scoped overrides/skips/replacements.
//
// Nothing in this file rewrites a recurring schedule unless the user explicitly
// uses a permanent-routine command handled elsewhere.
// ========================================

import { recordRecommendationOutcomeForRhythm } from "@/lib/allevinRecommendations";
import { readAllevinTone, rhythmVoice, type AllevinTone } from "@/lib/allevinVoice";
import {
   addRhythmDayContext,
   buildRhythmForDate,
   clockFromMinutes,
   localDateKey,
   minutesFromClock,
   moveRhythmAnchorForDay,
   readDailyRhythm,
   replaceRhythmAnchorForDay,
   saveDailyRhythm,
   skipRhythmAnchor,
   type DailyRhythmState,
   type RhythmAnchor,
   type RhythmCategory,
   type RhythmDayContext,
   type RhythmOutcomeRecord,
} from "@/lib/dailyRhythm";
import type { LifeItem, LifeState } from "@/lib/lifeTypes";
import { buildUpNextItem, upNextTimeLabel } from "@/lib/upNextIntelligence";

export interface AdaptiveDayResult {
   handled: boolean;
   changed: boolean;
   reply: string;
   /**
    * Machine-readable-ish facts for narration only.
    * The state mutation already happened before these are used. Keeping facts
    * separate from fallback copy lets the LLM sound natural without guessing
    * which consequence was primary.
    */
   narrationFacts?: string[];
}

export interface ReconcileResult {
   changed: boolean;
   adjustedTitles: string[];
}

export interface AdaptiveDayPreview {
   handled: boolean;
   reply: string;
   requiresConfirmation?: boolean;
}

function normalize(value: string) {
   return value
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9\s:.,!?'-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function parseTargetDate(lower: string) {
   const target = new Date();

   if (/\bday after tomorrow\b/.test(lower)) {
      target.setDate(target.getDate() + 2);
      return target;
   }

   if (/\btomorrow\b/.test(lower)) {
      target.setDate(target.getDate() + 1);
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
      let delta = (day - target.getDay() + 7) % 7;
      if (delta === 0 && new RegExp(`\\bnext\\s+${name}\\b`).test(lower)) delta = 7;
      target.setDate(target.getDate() + delta);
      return target;
   }

   // Temporary context defaults to today. This is intentionally conservative:
   // permanent phrases such as "from now on" are filtered before we get here.
   return target;
}

function hasExplicitDateReference(lower: string) {
   return /\b(?:today|tonight|tomorrow|day after tomorrow|(?:next\s+)?sunday|(?:next\s+)?monday|(?:next\s+)?tuesday|(?:next\s+)?wednesday|(?:next\s+)?thursday|(?:next\s+)?friday|(?:next\s+)?saturday)\b/.test(lower);
}

function mostRecentContextDate(state: DailyRhythmState) {
   let latest: { date: Date; at: number } | null = null;

   for (const [key, contexts] of Object.entries(state.dayContexts)) {
      const at = Math.max(0, ...contexts.map((context) => context.at || 0));
      if (!at || Date.now() - at > 20 * 60_000 || (latest && latest.at >= at)) continue;
      const [year, month, day] = key.split("-").map(Number);
      if (!year || !month || !day) continue;
      latest = { date: new Date(year, month - 1, day, 12, 0, 0, 0), at };
   }

   return latest?.date || null;
}

function resolveAdaptiveTargetDate(lower: string, state: DailyRhythmState) {
   if (hasExplicitDateReference(lower)) return parseTargetDate(lower);

   // Short follow-ups such as "I'm not going to work either" naturally refer
   // to the day ALLEVIN just changed. Use the most recent day-context timestamp
   // instead of silently snapping the follow-up back to today.
   if (/\b(?:either|also|too|as well|same day|actually)\b/.test(lower)) {
      return mostRecentContextDate(state) || parseTargetDate(lower);
   }

   return parseTargetDate(lower);
}

function parseClock(lower: string) {
   if (/\bnoon\b/.test(lower)) return "12:00";
   if (/\bmidnight\b/.test(lower)) return "00:00";

   const match =
      lower.match(/\b(?:at|until|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/) ||
      lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
   if (!match) return null;

   let hour = Number(match[1]);
   const minute = Number(match[2] || 0);
   const suffix = match[3];
   if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;

   if (suffix === "pm" && hour < 12) hour += 12;
   if (suffix === "am" && hour === 12) hour = 0;

   // This parser currently serves day-specific Work end changes. When someone
   // says "I'm leaving work at 4 tomorrow", 4 means 4 PM in ordinary language.
   // Preserve explicit AM/PM when supplied and use the late-day interpretation
   // only for an otherwise ambiguous 1–7 clock.
   if (!suffix && hour >= 1 && hour <= 7) hour += 12;

   if (hour > 23) return null;
   return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function inferCategory(title: string): RhythmCategory {
   const lower = title.toLowerCase();
   if (/\b(?:code|coding|business|project|client|work)\b/.test(lower)) return "personal";
   if (/\b(?:study|class|school|course|reading for class)\b/.test(lower)) return "school";
   if (/\b(?:exercise|workout|gym|run|walk|lift|yoga)\b/.test(lower)) return "exercise";
   if (/\b(?:breakfast|lunch|dinner|meal|eat|cook)\b/.test(lower)) return "meal";
   if (/\b(?:clean|laundry|home)\b/.test(lower)) return "home";
   return "personal";
}

function findAnchorFromPrompt(state: DailyRhythmState, lower: string) {
   // Match the user's exact routine wording first. Category aliases are only a
   // fallback so "skip the gym" still resolves an Exercise anchor.
   const exact = state.anchors
      .filter((anchor) => anchor.enabled)
      .sort((left, right) => right.title.length - left.title.length)
      .find((anchor) => lower.includes(anchor.title.toLowerCase()));
   if (exact) return exact;

   if (/\b(?:gym|workout|exercise|training)\b/.test(lower)) {
      return state.anchors.find((anchor) => anchor.enabled && anchor.category === "exercise");
   }

   if (/\b(?:breakfast|morning meal)\b/.test(lower)) {
      return state.anchors.find((anchor) => anchor.enabled && anchor.category === "meal" && /breakfast/i.test(anchor.title));
   }

   if (/\b(?:commute|drive to work|travel to work)\b/.test(lower)) {
      return state.anchors.find((anchor) => anchor.enabled && /commute|drive|travel/i.test(anchor.title));
   }

   return undefined;
}

function resolvedAnchorEntry(state: DailyRhythmState, anchor: RhythmAnchor, date: Date) {
   return buildRhythmForDate(state, date).find(
      (entry) => entry.kind === "anchor" && entry.sourceId === anchor.id,
   );
}

function requestedExtensionMinutes(lower: string) {
   const minutes = lower.match(/\b(?:another|extra)\s+(\d{1,3})\s*(?:minutes?|mins?)\b/);
   if (minutes) return Math.max(5, Math.min(360, Number(minutes[1])));
   const hours = lower.match(/\b(?:another|extra)\s+(\d+(?:\.\d+)?)\s*hours?\b/);
   if (hours) return Math.max(5, Math.min(360, Math.round(Number(hours[1]) * 60)));
   return 0;
}

function extensionAnchor(state: DailyRhythmState, lower: string, date: Date) {
   const named = findAnchorFromPrompt(state, lower);
   if (named) return named;
   const now = new Date();
   if (localDateKey(date) !== localDateKey(now)) return null;
   const minutes = now.getHours() * 60 + now.getMinutes();
   const active = buildRhythmForDate(state, date).filter((entry) => {
      if (entry.kind !== "anchor" || entry.completed || entry.skipped) return false;
      const start = minutesFromClock(entry.time);
      return minutes >= start && minutes <= start + Math.max(5, entry.durationMinutes || 30);
   });
   return active.length === 1 ? state.anchors.find((anchor) => anchor.id === active[0].sourceId) || null : null;
}

/**
 * Significant day changes get a deterministic consequence preview before any
 * state is written. The preview names only consequences ALLEVIN can prove from
 * the resolved day; the existing interpreter performs the actual mutation
 * after confirmation.
 */
export function previewAdaptiveDayConversation(
   prompt: string,
   state: DailyRhythmState,
): AdaptiveDayPreview {
   const lower = normalize(prompt);
   if (!lower || /\b(?:from now on|going forward|permanently)\b/.test(lower)) {
      return { handled: false, reply: "" };
   }
   const isLate = /\b(?:overslept|slept in late|running \d{1,3} minutes? late|behind schedule|running behind)\b/.test(lower);
   const extensionRequest = /\b(?:is taking longer than expected|need(?:s)? another|i need another|extra \d+)\b/.test(lower);
   const mentionsEarlyWork = /\b(?:leaving work early|leave work early|getting off work early|get off work early)\b/.test(lower);
   const changesWorkEnd =
      /\b(?:leaving work|leave work|getting off work|get off work|work ends|working until)\b/.test(lower) &&
      /\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower) &&
      Boolean(parseClock(lower));
   if (mentionsEarlyWork && !parseClock(lower)) {
      return { handled: true, requiresConfirmation: false, reply: "What time will Work end? Tell me, for example, “Work ends at 4 today,” and I’ll preview what follows it before changing the day." };
   }
   if (extensionRequest) {
      const anchor = extensionAnchor(state, lower, resolveAdaptiveTargetDate(lower, state));
      const extra = requestedExtensionMinutes(lower);
      if (!anchor) return { handled: false, reply: "" };
      if (!extra) return { handled: true, requiresConfirmation: false, reply: `How much longer does ${anchor.title} need?` };
      return {
         handled: true,
         requiresConfirmation: true,
         reply: `If I make that change:\n- ${anchor.title} gets another ${extra} minutes\n- later flexible routines may move if the space closes\n- hard commitments stay fixed\n\nWant me to make the change?`,
      };
   }
   if (!isLate && !changesWorkEnd) return { handled: false, reply: "" };

   const date = resolveAdaptiveTargetDate(lower, state);
   const entries = buildRhythmForDate(state, date).filter((entry) => !entry.completed && !entry.skipped);
   const hard = entries.filter((entry) => entry.kind === "schedule");
   const flexible = entries.filter((entry) => entry.kind === "anchor" && entry.flexible);
   const consequences: string[] = [];

   if (isLate) {
      if (flexible.length) consequences.push(`${flexible.slice(0, 3).map((entry) => entry.title).join(", ")} may move, shorten, or drop if they no longer fit`);
      if (hard.length) consequences.push(`${hard[0].title} stays protected at ${hard[0].time}`);
      consequences.push("nothing is marked complete just because time passed");
   } else {
      const end = parseClock(lower);
      const work = hard.find((entry) => entry.category === "work");
      consequences.push(`Work ends at ${end ? new Date(2000, 0, 1, Number(end.split(":")[0]), Number(end.split(":")[1])).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "the new time"} for this day only`);
      const afterWork = entries.filter((entry) => {
         if (entry.kind !== "anchor") return false;
         const anchor = state.anchors.find((candidate) => candidate.id === entry.sourceId);
         return anchor?.timingMode === "schedule-relative" && anchor.scheduleReferencePoint === "end";
      });
      if (afterWork.length) consequences.push(`${afterWork.map((entry) => entry.title).slice(0, 3).join(", ")} follows the new Work end`);
      if (work) consequences.push(`the normal ${work.title} schedule remains unchanged on other days`);
   }

   return {
      handled: true,
      requiresConfirmation: true,
      reply: `If I make that change:\n- ${consequences.join("\n- ")}\n\nWant me to make the change?`,
   };
}

function replacementTitle(prompt: string) {
   const match =
      prompt.match(/\binstead(?:\s+i)?\s+(?:want|would like|plan)?\s*(?:to\s+)?(.+?)(?:\s+before\s+work|\s+before\s+class|\s+this\s+(?:morning|afternoon|evening)|\s+today|\s+tomorrow|[.!?]|$)/i) ||
      prompt.match(/\breplace\s+.+?\s+with\s+(.+?)(?:[.!?]|$)/i);

   const raw = match?.[1]
      ?.replace(/^(?:i\s+)?(?:want\s+to|would\s+like\s+to)\s+/i, "")
      .trim();

   if (!raw) return "";
   return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function markRecommendationSkipped(anchorId: string, date: Date) {
   // Recommendation continuity uses the actual routine id as part of its
   // context key. Marking the assignment skipped keeps "suggested" separate
   // from "actually completed" progression.
   recordRecommendationOutcomeForRhythm(localDateKey(date), anchorId, "skipped");
}

function skipAnchorForReality(
   state: DailyRhythmState,
   anchor: RhythmAnchor,
   date: Date,
   kind: "skipped" | "replaced" | "suppressed",
   note: string,
) {
   markRecommendationSkipped(anchor.id, date);
   return skipRhythmAnchor(state, anchor.id, date, kind, note);
}

/**
 * Captures broad situational context even when there is no deterministic
 * mutation to make yet. This is how arbitrary statements such as
 * "I'm exhausted today" can still influence the AI/recommendation layer.
 *
 * Returns a short acknowledgement when context was stored. It deliberately
 * ignores permanent
 * phrases so "from now on" continues into the recurring-routine path.
 */
export function captureGeneralDayContext(prompt: string, state = readDailyRhythm()) {
   const lower = normalize(prompt);
   if (!lower || /\b(?:from now on|going forward|every day|every week|anymore|permanently)\b/.test(lower)) return null;

   const looksLikeQuestion =
      /\?$/.test(prompt.trim()) ||
      /^(?:what|when|where|why|how|should|can|could|would|will|do|does|is|are)\b/.test(lower);

   const looksLikePersistentProfile =
      /\b(?:preferred|usually|normally|my routine|my schedule|work schedule|class schedule)\b/.test(lower);

   // Concrete appointments/meetings belong in Life state so Calendar and
   // Coming Up can represent them. Situational facts do not. This prevents a
   // statement like "my car is in the shop Wednesday" from becoming a fake
   // all-day commitment just because the LLM sees a dated sentence.
   const looksLikeConcreteCommitment =
      /\b(?:appointment|meeting|reservation|dinner|lunch|breakfast|flight|interview|class|shift|concert|game|doctor|dentist|call|pickup|pick up|drop off|drop-off)\b/.test(lower) ||
      /\b(?:at|from)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/.test(lower);

   // The reality overlay is deliberately broader than a list of hard-coded
   // scenarios. First-person present-state details are useful even when ALLEVIN
   // does not have a deterministic mutation for them yet. Because the context
   // is date-scoped, capturing it does not turn it into a permanent preference.
   const situational =
      /\b(?:i am|i'm|i feel|i have|i've got|i need|i don't want|i do not want|i want to|my\s+[a-z0-9'-]+(?:\s+[a-z0-9'-]+){0,4}\s+(?:is|are|got|has)|plans changed|change of plans|got cancelled|got canceled|running late|tired|exhausted|sick|unwell|working from home|staying home|free earlier|finished early)\b/.test(lower);

   if (!situational || looksLikeQuestion || looksLikePersistentProfile || looksLikeConcreteCommitment) return null;

   const date = parseTargetDate(lower);
   const kind: RhythmDayContext["kind"] =
      /\b(?:sick|unwell|not feeling well|exhausted|wiped out|tired|low energy)\b/.test(lower)
         ? "recovery"
         : /\b(?:running late|behind|delayed)\b/.test(lower)
           ? "late"
           : /\b(?:sleep in|slept in)\b/.test(lower)
             ? "sleep-in"
             : /\b(?:working from home|work from home|wfh)\b/.test(lower)
               ? "work-from-home"
               : "custom";

   addRhythmDayContext(state, kind, prompt, date);

   const todayKey = localDateKey(new Date());
   const dateLabel = localDateKey(date) === todayKey
      ? "today"
      : date.toLocaleDateString([], { weekday: "long" });

   return `Got it. I’ll treat that as ${dateLabel}-only context and use it when deciding what fits.`;
}

/**
 * Finds the next hard boundary on one day. Recurring Work/Class blocks and
 * dated Life commitments are both treated as protected; flexible routines are
 * the things ALLEVIN is allowed to compress around them.
 */
function nextHardBoundaryMinutes(
   lifeState: LifeState,
   state: DailyRhythmState,
   date: Date,
   afterMinutes: number,
) {
   const rhythmBoundaries = buildRhythmForDate(state, date)
      .filter((entry) => entry.kind === "schedule" && !entry.skipped)
      .map((entry) => ({ minutes: minutesFromClock(entry.time), title: entry.title }))
      .filter((entry) => entry.minutes > afterMinutes);

   const lifeBoundaries = lifeState.items
      .filter((item) => item.state === "active" && item.kind === "commitment")
      .filter((item) => {
         const when = item.startAt || item.dueAt;
         return Boolean(when && localDateKey(new Date(when)) === localDateKey(date));
      })
      .map((item) => {
         const when = new Date(item.startAt || item.dueAt || 0);
         return { minutes: when.getHours() * 60 + when.getMinutes(), title: item.title };
      })
      .filter((entry) => entry.minutes > afterMinutes);

   return [...rhythmBoundaries, ...lifeBoundaries]
      .sort((left, right) => left.minutes - right.minutes)[0];
}

/**
 * Rebuilds the remaining flexible pre-commitment sequence after the user says
 * they are running late/overslept. Routines that still fit are moved for this
 * date only; routines that no longer fit are skipped for this occurrence.
 *
 * This never edits the recurring anchor time.
 */
function recoverLateDay(
   lifeState: LifeState,
   state: DailyRhythmState,
   date: Date,
) {
   const now = new Date();
   const isToday = localDateKey(date) === localDateKey(now);
   if (!isToday) return { state, moved: [] as string[], skipped: [] as string[], boundary: undefined as string | undefined };

   const nowMinutes = now.getHours() * 60 + now.getMinutes();
   const boundary = nextHardBoundaryMinutes(lifeState, state, date, nowMinutes);
   if (!boundary) return { state, moved: [] as string[], skipped: [] as string[], boundary: undefined };

   const flexible = buildRhythmForDate(state, date)
      .filter(
         (entry) =>
            entry.kind === "anchor" &&
            entry.flexible &&
            !entry.completed &&
            !entry.skipped &&
            entry.status !== "missed" &&
            minutesFromClock(entry.time) < boundary.minutes,
      )
      .sort((left, right) => minutesFromClock(left.time) - minutesFromClock(right.time));

   let next = state;
   let cursor = nowMinutes + 5;
   const moved: string[] = [];
   const skipped: string[] = [];

   for (let index = 0; index < flexible.length; index += 1) {
      const entry = flexible[index];

      // Preserve a small transition buffer before the hard commitment instead
      // of packing the day edge-to-edge after a late start.
      const remainingBeforeBoundary = boundary.minutes - cursor - 10;
      const minimumUsefulDuration = Math.min(entry.durationMinutes || 30, 15);
      const entriesLeft = flexible.length - index;
      const fairShare = Math.floor(Math.max(0, remainingBeforeBoundary) / Math.max(1, entriesLeft));
      const duration = Math.min(entry.durationMinutes || 30, Math.max(minimumUsefulDuration, fairShare));

      if (remainingBeforeBoundary < minimumUsefulDuration) {
         const anchor = state.anchors.find((candidate) => candidate.id === entry.sourceId);
         if (anchor) {
            next = skipAnchorForReality(next, anchor, date, "skipped", "Did not fit after a late start");
            skipped.push(entry.title);
         }
         continue;
      }

      // Temporary replacement blocks intentionally stay fixed; the permanent
      // routine mover only knows how to write date-scoped anchor overrides.
      const anchor = state.anchors.find((candidate) => candidate.id === entry.sourceId);
      if (!anchor) continue;

      next = moveRhythmAnchorForDay(
         next,
         anchor.id,
         clockFromMinutes(cursor),
         date,
         duration,
         "Moved after a late start",
      );
      moved.push(entry.title);
      cursor += duration + 5;
   }

   return { state: next, moved, skipped, boundary: boundary.title };
}

/**
 * Marks one recurring hard schedule category off for a single date. This is the
 * hard-commitment counterpart to skipping an elastic routine: the base Work or
 * School schedule remains intact for every other occurrence.
 */
function setScheduleCategoryOffForDay(
   state: DailyRhythmState,
   category: "work" | "school",
   date: Date,
) {
   const key = localDateKey(date);
   const day = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
   const blocks = state.scheduleBlocks.filter(
      (block) => block.enabled && block.category === category && block.days.includes(day),
   );
   if (!blocks.length) return { state, changed: false };

   const exceptions = { ...(state.scheduleExceptions[key] || {}) };
   for (const block of blocks) {
      exceptions[block.id] = { ...(exceptions[block.id] || {}), off: true };
   }

   return {
      state: saveDailyRhythm({
         ...state,
         scheduleExceptions: { ...state.scheduleExceptions, [key]: exceptions },
      }),
      changed: true,
   };
}

/**
 * Handles the high-confidence day changes locally. These are deterministic
 * because ALLEVIN should never need an LLM to decide whether "skip gym today"
 * means deleting the permanent Exercise routine.
 */
export function interpretAdaptiveDayConversation(
   prompt: string,
   lifeState: LifeState,
   state: DailyRhythmState,
   tone: AllevinTone = readAllevinTone(),
): AdaptiveDayResult {
   const lower = normalize(prompt);
   if (!lower) return { handled: false, changed: false, reply: "" };

   // Permanent-language requests belong to the recurring-routine interpreter.
   if (/\b(?:from now on|going forward|every day|every week|anymore|permanently)\b/.test(lower)) {
      return { handled: false, changed: false, reply: "" };
   }

   const targetDate = resolveAdaptiveTargetDate(lower, state);

   const extraMinutes = requestedExtensionMinutes(lower);
   if (extraMinutes) {
      const anchor = extensionAnchor(state, lower, targetDate);
      const entry = anchor ? resolvedAnchorEntry(state, anchor, targetDate) : undefined;
      if (anchor && entry) {
         moveRhythmAnchorForDay(state, anchor.id, entry.time, targetDate, (entry.durationMinutes || anchor.durationMinutes) + extraMinutes, "Extended from conversation");
         addRhythmDayContext(readDailyRhythm(), "event-change", prompt, targetDate);
         return {
            handled: true,
            changed: true,
            reply: `${anchor.title} gets another ${extraMinutes} minutes for this day. I left hard commitments in place.`,
            narrationFacts: [`${anchor.title} was extended by ${extraMinutes} minutes on ${localDateKey(targetDate)}`, "Recurring duration was not changed", "Time passing did not imply completion"],
         };
      }
   }

   // Explicitly cancelling Work/Class is different from merely feeling unwell.
   // The hard schedule changes only for this occurrence, and all schedule-linked
   // routines automatically disappear/recalculate with it.
   const cancelsWork =
      /\b(?:not going to work|calling out(?: of work)?|taking (?:today|tomorrow|the day) off work|i'?m off work|i am off work|no work|work (?:is |got )?cancelled|work (?:is |got )?canceled)\b/.test(lower);
   const cancelsSchool =
      /\b(?:not going to class|not going to school|no class|class (?:is |got )?cancelled|class (?:is |got )?canceled|school (?:is |got )?cancelled|school (?:is |got )?canceled)\b/.test(lower);

   if (cancelsWork || cancelsSchool) {
      let next = state;
      const changedLabels: string[] = [];

      if (cancelsWork) {
         const result = setScheduleCategoryOffForDay(next, "work", targetDate);
         next = result.state;
         if (result.changed) changedLabels.push("Work");
      }

      if (cancelsSchool) {
         const result = setScheduleCategoryOffForDay(next, "school", targetDate);
         next = result.state;
         if (result.changed) changedLabels.push("Class");
      }

      if (changedLabels.length) {
         addRhythmDayContext(next, "event-change", prompt, targetDate);
         return {
            handled: true,
            changed: true,
            reply: `${changedLabels.join(" and ")} ${changedLabels.length === 1 ? "is" : "are"} off for this occurrence. The normal schedule stays intact for the next one.`,
            narrationFacts: [
               `Requested date: ${localDateKey(targetDate)}`,
               `${changedLabels.join(" and ")} are not scheduled on that date`,
               "Recurring schedule rules for later dates were not changed",
            ],
         };
      }
   }

   // A late start is a reality change, not a permanent routine edit. Rebuild
   // only the flexible blocks that remain before the next hard commitment.
   if (/\b(?:overslept|slept in late|running late|behind schedule|running behind)\b/.test(lower)) {
      const recovered = recoverLateDay(lifeState, state, targetDate);
      const contextualState = addRhythmDayContext(recovered.state, "late", prompt, targetDate);

      if (!recovered.boundary) {
         return {
            handled: true,
            changed: contextualState !== state,
            reply: "I marked the late start. There isn’t another hard boundary ahead that needs a forced replan.",
         };
      }

      const pieces = [
         recovered.moved.length ? `Moved ${recovered.moved.join(", ")}` : "",
         recovered.skipped.length ? `left ${recovered.skipped.join(", ")} out for this occurrence` : "",
      ].filter(Boolean);

      return {
         handled: true,
         changed: true,
         reply: pieces.length
            ? `${pieces.join(" and ")} so ${recovered.boundary} stays protected. The normal routine is untouched.`
            : `You still have enough room before ${recovered.boundary}; I left the remaining plan alone.`,
      };
   }

   if (/\b(?:what should i do now|what should i do next|what matters now)\b/.test(lower)) {
      const next = buildUpNextItem(lifeState, state, Date.now());
      const contexts = state.dayContexts[localDateKey(new Date())] || [];
      const recoveryContext = contexts.some((context) => context.kind === "recovery");

      if (!next || next.dateKey !== localDateKey(new Date())) {
         if (recoveryContext) {
            return {
               handled: true,
               changed: false,
               reply: "Keep the open space. You marked today as a recovery day; no need to manufacture a side quest.",
            };
         }

         // No deterministic next item means judgment matters more than state
         // lookup. Let the LLM use the full day context/flexible choices.
         return { handled: false, changed: false, reply: "" };
      }

      if (recoveryContext && next.source === "rhythm" && next.category === "exercise") {
         return {
            handled: true,
            changed: false,
            reply: `${next.title} is next on the original plan, but you marked today as low-energy/recovery. I wouldn’t force it just to keep the schedule pretty.`,
         };
      }

      // Arbitrary custom context can materially change whether the nominal next
      // item is sensible ("my car is in the shop", "my friend is visiting").
      // The deterministic engine still supplies truth, but nuanced judgment is
      // delegated to the LLM with that context attached.
      if (contexts.some((context) => context.kind === "custom")) {
         return { handled: false, changed: false, reply: "" };
      }

      return {
         handled: true,
         changed: false,
         reply: `${next.title} is next — ${upNextTimeLabel(next)}. ${next.source === "rhythm" ? "That’s the cleanest thing to protect right now." : "Handle that, then reassess."}`,
      };
   }

   // One-day replacement: "I don't want to gym this morning; code instead."
   const anchor = findAnchorFromPrompt(state, lower);
   const replacement = replacementTitle(prompt);
   if (
      anchor &&
      replacement &&
      /\b(?:instead|replace)\b/.test(lower) &&
      /\b(?:don't want|do not want|skip|replace|rather)\b/.test(lower)
   ) {
      const entry = resolvedAnchorEntry(state, anchor, targetDate);
      if (!entry) return { handled: true, changed: false, reply: `${anchor.title} is not scheduled on that day.` };

      const next = replaceRhythmAnchorForDay(
         state,
         anchor.id,
         {
            title: replacement,
            category: inferCategory(replacement),
            time: entry.time,
            durationMinutes: entry.durationMinutes || anchor.durationMinutes,
            flexible: true,
            reason: `Replaced ${anchor.title} from conversation`,
         },
         targetDate,
      );

      addRhythmDayContext(next, "custom", `${anchor.title} replaced with ${replacement}`, targetDate);
      markRecommendationSkipped(anchor.id, targetDate);

      return {
         handled: true,
         changed: true,
         reply: `${anchor.title} is out for ${localDateKey(targetDate) === localDateKey(new Date()) ? "today" : targetDate.toLocaleDateString([], { weekday: "long" })}. ${replacement} takes that opening at ${entry.time ? new Date(2000, 0, 1, Number(entry.time.split(":")[0]), Number(entry.time.split(":")[1])).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "the same time"}. I left the hard commitments alone.`,
         narrationFacts: [
            `Requested date: ${localDateKey(targetDate)}`,
            `${anchor.title} is skipped/replaced on that date`,
            `${replacement} occupies the same opening at ${entry.time}`,
            "Hard commitments and the recurring routine remain unchanged",
         ],
      };
   }

   // Sleep-in is a day decision, not a request to permanently remove exercise.
   if (/\b(?:sleep in|sleeping in|stay in bed|extra sleep)\b/.test(lower)) {
      let next = state;
      const exercise = state.anchors.find((candidate) => candidate.enabled && candidate.category === "exercise");
      if (exercise && resolvedAnchorEntry(state, exercise, targetDate)) {
         next = skipAnchorForReality(next, exercise, targetDate, "skipped", "User chose extra sleep");
      }
      addRhythmDayContext(next, "sleep-in", prompt, targetDate);
      return {
         handled: true,
         changed: true,
         reply: exercise
            ? `Sleep in. ${exercise.title} is off this occurrence, and the rest of the day stays anchored around the commitments that still matter.`
            : "Sleep in. I marked the day accordingly and left the fixed commitments alone.",
         narrationFacts: [
            `Requested date: ${localDateKey(targetDate)}`,
            "The day has a sleep-in exception",
            ...(exercise ? [`${exercise.title} is skipped on that date`] : []),
            "Fixed commitments and recurring rules remain unchanged",
         ],
      };
   }

   // Low-energy/unwell context should soften the optional day without making a
   // medical judgment or cancelling work/class behind the user's back.
   if (/\b(?:i'?m sick|i am sick|feeling sick|not feeling well|i'?m unwell|i am unwell)\b/.test(lower)) {
      let next = state;
      const exerciseAnchors = state.anchors.filter(
         (candidate) => candidate.enabled && candidate.category === "exercise" && resolvedAnchorEntry(state, candidate, targetDate),
      );

      for (const exercise of exerciseAnchors) {
         next = skipAnchorForReality(next, exercise, targetDate, "suppressed", "Recovery context");
      }

      addRhythmDayContext(next, "recovery", prompt, targetDate);
      return {
         handled: true,
         changed: true,
         reply: `I put ${localDateKey(targetDate) === localDateKey(new Date()) ? "today" : targetDate.toLocaleDateString([], { weekday: "long" })} into recovery mode and dropped the optional exercise block${exerciseAnchors.length === 1 ? "" : "s"}. Work, class, and other hard commitments stay put unless you tell me they’re off too.`,
         narrationFacts: [
            `Requested date: ${localDateKey(targetDate)}`,
            "The user reported being unwell on that date",
            ...(exerciseAnchors.length ? ["Optional exercise occurrences are suppressed on that date"] : []),
            "Hard commitments were not cancelled",
         ],
      };
   }

   // Work-from-home is a classic one-day exception: keep Work, remove the
   // commute occurrence, and do not rewrite the normal commute routine.
   if (/\b(?:working from home|work from home|wfh|staying home for work)\b/.test(lower)) {
      let next = state;
      const commuteAnchors = state.anchors.filter(
         (candidate) => candidate.enabled && /commute|drive|travel/i.test(candidate.title) && resolvedAnchorEntry(state, candidate, targetDate),
      );

      for (const commute of commuteAnchors) {
         next = skipAnchorForReality(next, commute, targetDate, "suppressed", "Working from home");
      }

      addRhythmDayContext(next, "work-from-home", prompt, targetDate);
      return {
         handled: true,
         changed: true,
         reply: commuteAnchors.length
            ? "Working from home is set for this day. I removed the commute occurrence and left the normal schedule intact for the next workday."
            : "Working from home is set for this day. There was no commute routine to remove, so I left the rest alone.",
         narrationFacts: [
            `Requested date: ${localDateKey(targetDate)}`,
            "Work remains scheduled",
            ...(commuteAnchors.length ? ["Commute occurrences are suppressed on that date"] : ["No matching commute occurrence existed"]),
            "Recurring schedule rules remain unchanged",
         ],
      };
   }

   // Day-specific work end changes use the existing schedule-exception layer.
   if (
      /\b(?:leaving work|leave work|getting off work|get off work|work ends|working until)\b/.test(lower) &&
      /\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)
   ) {
      const end = parseClock(lower);
      if (end) {
         const day = targetDate.getDay();
         const key = localDateKey(targetDate);
         const blocks = state.scheduleBlocks.filter(
            (block) => block.enabled && block.category === "work" && block.days.includes(day as 0 | 1 | 2 | 3 | 4 | 5 | 6),
         );
         if (blocks.length) {
            const exceptions = { ...(state.scheduleExceptions[key] || {}) };
            for (const block of blocks) {
               exceptions[block.id] = { ...(exceptions[block.id] || {}), end };
            }
            const next = saveDailyRhythm({
               ...state,
               scheduleExceptions: { ...state.scheduleExceptions, [key]: exceptions },
            });
            addRhythmDayContext(next, "event-change", prompt, targetDate);
            return {
               handled: true,
               changed: true,
               reply: `Work ends at ${new Date(2000, 0, 1, Number(end.split(":")[0]), Number(end.split(":")[1])).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} for this day only. Anything tied to the end of Work will follow the new time.`,
               narrationFacts: [
                  `Requested date: ${key}`,
                  `Work end time on that date is ${end}`,
                  "Schedule-relative routines tied to Work end were recalculated",
                  "The recurring Work schedule on other dates was not changed",
               ],
            };
         }
      }
   }

   // Plain one-day skip. This is intentionally after replacement/sleep-in so
   // the more specific requests get richer behavior first.
   if (
      anchor &&
      /\b(?:don't want to|do not want to|skip|not doing|not going to)\b/.test(lower) &&
      !/\b(?:instead|from now on|going forward)\b/.test(lower)
   ) {
      skipAnchorForReality(state, anchor, targetDate, "skipped", "Skipped from conversation");
      return {
         handled: true,
         changed: true,
         reply: rhythmVoice("skip", anchor.title, tone),
      };
   }

   return { handled: false, changed: false, reply: "" };
}

function lifeItemDate(item: LifeItem) {
   const timestamp = item.startAt || item.dueAt;
   return timestamp ? new Date(timestamp) : null;
}

function sameDay(left: Date, right: Date) {
   return localDateKey(left) === localDateKey(right);
}

function intervalForLifeItem(item: LifeItem) {
   const start = item.startAt || item.dueAt;
   if (!start) return null;
   const end =
      item.endAt ||
      (item.durationMinutes ? start + item.durationMinutes * 60_000 : start + 60 * 60_000);
   return { start, end };
}

function intervalForRhythmEntry(date: Date, time: string, durationMinutes = 30) {
   const [hours, minutes] = time.split(":").map(Number);
   const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0).getTime();
   return { start, end: start + durationMinutes * 60_000 };
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
   return a.start < b.end && b.start < a.end;
}

function eventSemanticallyReplacesRoutine(
   event: LifeItem,
   routineTitle: string,
   routineCategory: RhythmCategory,
   eventInterval: { start: number; end: number },
   routineInterval: { start: number; end: number },
) {
   const eventText = `${event.title} ${event.details}`.toLowerCase();
   const routineText = routineTitle.toLowerCase();
   const mealEvent = /\b(?:dinner|lunch|breakfast|brunch|meal)\b/.test(eventText);
   const mealRoutine =
      routineCategory === "meal" ||
      /\b(?:cook|dinner|lunch|breakfast|meal|eat)\b/.test(routineText);

   if (!mealEvent || !mealRoutine) return false;

   // "Dinner with a friend" should suppress a nearby Cook/Dinner routine, but
   // it must not wipe Breakfast simply because both are meals on the same day.
   // A three-hour proximity window captures replacement intent without letting
   // meal semantics jump across unrelated parts of the day.
   const startDistance = Math.abs(eventInterval.start - routineInterval.start);
   return startDistance <= 3 * 60 * 60_000;
}

/**
 * Reconciles hard one-off commitments with elastic recurring routines.
 *
 * Important: event-driven suppressions are rebuilt from scratch on every pass.
 * If the event is later moved/cancelled, the routine automatically returns
 * instead of staying permanently skipped.
 */
export function reconcileLifeEventsWithRhythm(
   lifeState: LifeState,
   state = readDailyRhythm(),
   dates: Date[] = Array.from({ length: 8 }, (_, offset) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return date;
   }),
): ReconcileResult {
   let next = state;
   const adjustedTitles: string[] = [];
   let changed = false;

   for (const date of dates) {
      const key = localDateKey(date);
      const originalSkips = new Set(next.skips[key] || []);
      const originalOutcomes: Record<string, RhythmOutcomeRecord> = { ...(next.outcomes[key] || {}) };

      // Rebuild only event-created suppressions. Manual skips/replacements stay
      // untouched, while moving/cancelling an event can restore the routine.
      const rebuiltSkips = new Set(originalSkips);
      const rebuiltOutcomes: Record<string, RhythmOutcomeRecord> = { ...originalOutcomes };
      for (const [entryId, outcome] of Object.entries(rebuiltOutcomes)) {
         if (outcome.kind !== "suppressed" || !outcome.note?.startsWith("event:")) continue;
         delete rebuiltOutcomes[entryId];
         rebuiltSkips.delete(entryId);
      }

      const baseForDay: DailyRhythmState = {
         ...next,
         skips: { ...next.skips, [key]: [...rebuiltSkips] },
         outcomes: { ...next.outcomes, [key]: rebuiltOutcomes },
      };

      const events = lifeState.items
         .filter((item) => item.state === "active" && item.kind === "commitment")
         .filter((item) => {
            const itemDate = lifeItemDate(item);
            return Boolean(itemDate && sameDay(itemDate, date));
         });

      const entries = buildRhythmForDate(baseForDay, date)
         .filter((entry) => entry.kind === "anchor" && entry.flexible && !entry.completed && !entry.skipped);

      for (const entry of entries) {
         const rhythmInterval = intervalForRhythmEntry(date, entry.time, entry.durationMinutes || 30);

         const conflict = events.find((event) => {
            const eventInterval = intervalForLifeItem(event);
            if (!eventInterval) return false;
            const semanticReplacement = eventSemanticallyReplacesRoutine(
               event,
               entry.title,
               entry.category,
               eventInterval,
               rhythmInterval,
            );

            // All-day commitments are context for the date, not 24-hour time
            // collisions. Only a clear semantic replacement may suppress a
            // routine; ordinary timed commitments still use interval overlap.
            if (event.allDay) return semanticReplacement;
            return overlaps(rhythmInterval, eventInterval) || semanticReplacement;
         });

         if (!conflict) continue;

         const note = `event:${conflict.id}:${conflict.title}`;
         const prior = originalOutcomes[entry.sourceId];
         rebuiltSkips.add(entry.sourceId);
         rebuiltOutcomes[entry.sourceId] =
            prior?.kind === "suppressed" && prior.note === note
               ? prior
               : { kind: "suppressed", at: Date.now(), note };

         // Report only a genuinely new adjustment. Re-running reconciliation
         // because some unrelated context changed should not claim that an old
         // Dinner event just adjusted Cook again.
         if (!(prior?.kind === "suppressed" && prior.note === note)) {
            adjustedTitles.push(entry.title);
         }
      }

      const originalSkipKey = [...originalSkips].sort().join("|");
      const rebuiltSkipKey = [...rebuiltSkips].sort().join("|");
      const outcomeSignature = (outcomes: Record<string, RhythmOutcomeRecord>) =>
         Object.entries(outcomes)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([id, outcome]) => `${id}:${outcome.kind}:${outcome.at}:${outcome.note || ""}`)
            .join("|");
      const originalOutcomeKey = outcomeSignature(originalOutcomes);
      const rebuiltOutcomeKey = outcomeSignature(rebuiltOutcomes);

      if (originalSkipKey === rebuiltSkipKey && originalOutcomeKey === rebuiltOutcomeKey) continue;

      next = {
         ...next,
         skips: { ...next.skips, [key]: [...rebuiltSkips] },
         outcomes: { ...next.outcomes, [key]: rebuiltOutcomes },
      };
      changed = true;
   }

   if (changed) saveDailyRhythm(next);

   return {
      changed,
      adjustedTitles: [...new Set(adjustedTitles)],
   };
}

export function adaptationReplySuffix(result: ReconcileResult) {
   if (!result.changed || !result.adjustedTitles.length) return "";
   if (result.adjustedTitles.length === 1) {
      return ` I adjusted ${result.adjustedTitles[0]} for that day so the routine doesn’t fight the new commitment.`;
   }
   return ` I adjusted ${result.adjustedTitles.join(", ")} around the new commitment.`;
}
