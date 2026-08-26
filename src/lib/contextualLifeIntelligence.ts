// ========================================
// ALLEVIN MK XIII — Contextual Life Intelligence
// Adapts authoritative Life + Rhythm state into deterministic references,
// availability answers, day-shape language, and follow-up mutations.
// ========================================

import {
   buildRhythmForDate,
   formatClock,
   localDateKey,
   minutesFromClock,
   type DailyRhythmState,
} from "@/lib/dailyRhythm";
import type { KinMessage } from "@/lib/kinConversation";
import type { KinAction, LifeItem, LifeState } from "@/lib/lifeTypes";
import {
   calculateAvailability,
   describeDayShape,
   normalizeContextText,
   resolveContextualReference,
   type ContextualScheduleItem,
} from "@/lib/contextualScheduleCore";

export interface ContextualAnswer {
   handled: boolean;
   reply: string;
   referencedItemId?: string;
}

export interface ContextualMutationResult extends ContextualAnswer {
   actions: KinAction[];
}

function sameDate(timestamp: number, date: Date) {
   return localDateKey(new Date(timestamp)) === localDateKey(date);
}

function targetDateFromPrompt(prompt: string, now = new Date()) {
   const lower = normalizeContextText(prompt);
   const target = new Date(now);
   target.setHours(12, 0, 0, 0);

   if (/\bday after tomorrow\b/.test(lower)) target.setDate(now.getDate() + 2);
   else if (/\btomorrow\b/.test(lower)) target.setDate(now.getDate() + 1);
   else {
      const weekdays: Record<string, number> = {
         sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
         thursday: 4, friday: 5, saturday: 6,
      };
      for (const [name, day] of Object.entries(weekdays)) {
         if (!new RegExp(`\\b(?:next\\s+)?${name}\\b`).test(lower)) continue;
         let delta = (day - now.getDay() + 7) % 7;
         if (delta === 0 && new RegExp(`\\bnext\\s+${name}\\b`).test(lower)) delta = 7;
         target.setDate(now.getDate() + delta);
         break;
      }
   }
   return target;
}

function explicitDayInPrompt(prompt: string) {
   return /\b(?:today|tonight|tomorrow|day after tomorrow|(?:next\s+)?sunday|(?:next\s+)?monday|(?:next\s+)?tuesday|(?:next\s+)?wednesday|(?:next\s+)?thursday|(?:next\s+)?friday|(?:next\s+)?saturday)\b/i.test(prompt);
}

function dayMinutes(timestamp: number) {
   const date = new Date(timestamp);
   return date.getHours() * 60 + date.getMinutes();
}

function lifeInterval(item: LifeItem) {
   const startAt = item.startAt || item.dueAt;
   if (!startAt || item.allDay) return null;
   const start = dayMinutes(startAt);
   const endAt = item.endAt || startAt + Math.max(5, item.durationMinutes || 30) * 60_000;
   return { start, end: Math.max(start + 5, dayMinutes(endAt)) };
}

export function buildContextualDayItems(
   lifeState: LifeState,
   rhythm: DailyRhythmState,
   date: Date,
   travelMinutes = 0,
): ContextualScheduleItem[] {
   const rhythmItems = buildRhythmForDate(rhythm, date)
      .filter((entry) => !entry.completed && !entry.skipped)
      .map((entry): ContextualScheduleItem => {
         const start = minutesFromClock(entry.time);
         const rawEnd = entry.endTime
            ? minutesFromClock(entry.endTime)
            : start + Math.max(5, entry.durationMinutes || 30);
         return {
            id: `rhythm:${entry.id}`,
            title: entry.title,
            start,
            end: rawEnd >= start ? rawEnd : rawEnd + 1440,
            hard: entry.kind === "schedule" || !entry.flexible,
            kind: entry.kind === "schedule" ? "schedule" : "routine",
            context: entry.category,
         };
      });

   const hasExplicitTravelRoutine = rhythmItems.some((item) => /\b(?:commute|travel|drive|leave)\b/i.test(item.title));
   const lifeItems = lifeState.items
      .filter((item) => item.state === "active" && (item.kind === "commitment" || item.kind === "task"))
      .filter((item) => Boolean((item.startAt || item.dueAt) && sameDate(item.startAt || item.dueAt || 0, date)))
      .flatMap((item): ContextualScheduleItem[] => {
         const interval = lifeInterval(item);
         if (!interval) return [];
         const needsTravel = !hasExplicitTravelRoutine && travelMinutes > 0 && Boolean(item.location);
         return [{
            id: `life:${item.id}`,
            title: item.title,
            start: interval.start,
            end: interval.end,
            hard: item.kind === "commitment",
            kind: item.kind === "commitment" ? "commitment" : "task",
            context: item.context,
            transitionBeforeMinutes: needsTravel ? travelMinutes : 0,
            transitionAfterMinutes: needsTravel ? travelMinutes : 0,
         }];
      });

   return [...rhythmItems, ...lifeItems]
      .sort((left, right) => left.start - right.start || left.end - right.end || left.title.localeCompare(right.title));
}

function clockLabel(minutes: number) {
   const safe = ((minutes % 1440) + 1440) % 1440;
   return formatClock(`${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`);
}

function durationLabel(minutes: number) {
   const safe = Math.max(0, Math.round(minutes));
   const hours = Math.floor(safe / 60);
   const remainder = safe % 60;
   if (!hours) return `${remainder} minutes`;
   if (!remainder) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
   return `${hours} ${hours === 1 ? "hour" : "hours"} ${remainder} minutes`;
}

function dayLabel(date: Date, now = new Date()) {
   if (localDateKey(date) === localDateKey(now)) return "today";
   const tomorrow = new Date(now);
   tomorrow.setDate(now.getDate() + 1);
   if (localDateKey(date) === localDateKey(tomorrow)) return "tomorrow";
   return date.toLocaleDateString([], { weekday: "long" });
}

function stripDayWords(value: string) {
   return normalizeContextText(value)
      .replace(/\b(?:today|tonight|tomorrow|day after tomorrow|next|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function previousReferenceId(items: ContextualScheduleItem[], conversation: KinMessage[]) {
   for (const message of [...conversation].reverse()) {
      const content = normalizeContextText(message.content);
      const matches = items.filter((item) => content.includes(normalizeContextText(item.title)));
      if (matches.length === 1) return matches[0].id;
   }
   return undefined;
}

function clarification(items: ContextualScheduleItem[]) {
   const labels = items.slice(0, 3).map((item) => `${item.title} at ${clockLabel(item.start)}`);
   return `I found more than one match: ${labels.join(" or ")}. Which one do you mean?`;
}

function referenceQueryFromRelation(value: string) {
   return stripDayWords(value)
      .replace(/\b(?:do i have|going on|happens|comes|is|are)\b/g, " ")
      .replace(/\b(?:my|the)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function parseClockToken(value: string, inheritedSuffix?: "am" | "pm") {
   const match = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
   if (!match) return null;
   let hour = Number(match[1]);
   const minute = Number(match[2] || 0);
   const suffix = (match[3]?.toLowerCase() || inheritedSuffix) as "am" | "pm" | undefined;
   if (hour > 23 || minute > 59) return null;
   if (suffix === "pm" && hour < 12) hour += 12;
   if (suffix === "am" && hour === 12) hour = 0;
   if (!suffix && hour >= 1 && hour <= 7) hour += 12;
   return hour * 60 + minute;
}

function movedToClock(prompt: string) {
   // For a move command, only the clock after “to”/“at” is the destination.
   // This avoids treating a number in an event title as schedule truth.
   const destination = prompt.match(/\b(?:to|at)\s+(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)?.[1];
   if (!destination) return null;
   if (/^noon$/i.test(destination)) return 12 * 60;
   if (/^midnight$/i.test(destination)) return 0;
   return parseClockToken(destination);
}

function parseWindow(prompt: string) {
   const match = prompt.match(/\bbetween\s+(.+?)\s+(?:and|to)\s+(.+?)(?:\?|$)/i);
   if (!match) return null;
   const suffix = match[2].match(/\b(am|pm)\b/i)?.[1]?.toLowerCase() as "am" | "pm" | undefined;
   const start = parseClockToken(match[1], suffix);
   const end = parseClockToken(match[2]);
   if (start === null || end === null || end <= start) return null;
   return { start, end };
}

function requestedDuration(prompt: string, fallback = 30) {
   const hours = prompt.match(/\b(\d+(?:\.\d+)?)\s*hours?\b/i);
   const minutes = prompt.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i);
   if (hours) return Math.max(5, Math.min(480, Math.round(Number(hours[1]) * 60)));
   if (minutes) return Math.max(5, Math.min(480, Number(minutes[1])));
   return fallback;
}

function formatAvailability(windows: ReturnType<typeof calculateAvailability>) {
   return windows.slice(0, 4).map((window) =>
      `${clockLabel(window.start)}–${clockLabel(window.end)} (${durationLabel(window.minutes)})`,
   ).join("\n");
}

export function answerContextualScheduleQuestion(
   prompt: string,
   lifeState: LifeState,
   rhythm: DailyRhythmState,
   conversation: KinMessage[] = [],
   options: { travelMinutes?: number; bedtime?: string } = {},
): ContextualAnswer {
   const raw = prompt.trim();
   const lower = normalizeContextText(raw);
   if (!raw) return { handled: false, reply: "" };

   let date = targetDateFromPrompt(raw);
   if (!explicitDayInPrompt(raw) && /\b(?:that|it)\b/.test(lower)) {
      const recentDatedTurn = [...conversation].reverse().find((message) => message.role === "user" && explicitDayInPrompt(message.content));
      if (recentDatedTurn) date = targetDateFromPrompt(recentDatedTurn.content);
   }
   let items = buildContextualDayItems(lifeState, rhythm, date, options.travelMinutes || 0);
   let priorId = previousReferenceId(items, conversation);
   const relation = lower.match(/\b(?:what\s*s|what\s+is|what\s+do\s+i\s+have(?:\s+going\s+on)?|what\s+happens|what\s+comes)\s+(after|before)\s+(.+)$/);

   if (relation) {
      const direction = relation[1] as "after" | "before";
      const query = referenceQueryFromRelation(relation[2]);
      let resolved = resolveContextualReference(query || "that", items, priorId);
      // A named reference without a day means the nearest safely unique
      // occurrence, not an LLM guess. Search the next week deterministically.
      if (resolved.status === "not-found" && !explicitDayInPrompt(raw) && !/^(?:that|it)$/.test(query)) {
         for (let offset = 1; offset <= 7; offset += 1) {
            const candidateDate = new Date(date);
            candidateDate.setDate(date.getDate() + offset);
            const candidateItems = buildContextualDayItems(lifeState, rhythm, candidateDate, options.travelMinutes || 0);
            const candidate = resolveContextualReference(query, candidateItems);
            if (candidate.status === "not-found") continue;
            date = candidateDate;
            items = candidateItems;
            priorId = previousReferenceId(items, conversation);
            resolved = candidate;
            break;
         }
      }
      if (resolved.status === "ambiguous") return { handled: true, reply: clarification(resolved.items) };
      if (resolved.status === "not-found") return { handled: true, reply: `I can’t find ${query || "that item"} on ${dayLabel(date)}.` };

      const related = direction === "after"
         ? items.filter((item) => item.id !== resolved.item.id && item.start >= resolved.item.end)
         : items.filter((item) => item.id !== resolved.item.id && item.end <= resolved.item.start).slice(-3);
      const selected = direction === "after" ? related.slice(0, 4) : related;
      if (!selected.length) return { handled: true, referencedItemId: resolved.item.id, reply: `Nothing else is scheduled ${direction} ${resolved.item.title} ${dayLabel(date)}.` };
      return {
         handled: true,
         referencedItemId: resolved.item.id,
         reply: selected.map((item) => `${clockLabel(item.start)} — ${item.title}`).join("\n"),
      };
   }

   const betweenReferences = lower.match(/\b(?:what\s*s|what\s+is|what\s+do\s+i\s+have)\s+between\s+(.+?)\s+and\s+(.+)$/);
   if (betweenReferences && !parseWindow(raw)) {
      const left = resolveContextualReference(referenceQueryFromRelation(betweenReferences[1]), items, priorId);
      const right = resolveContextualReference(referenceQueryFromRelation(betweenReferences[2]), items, priorId);
      if (left.status === "ambiguous") return { handled: true, reply: clarification(left.items) };
      if (right.status === "ambiguous") return { handled: true, reply: clarification(right.items) };
      if (left.status !== "resolved" || right.status !== "resolved") return { handled: true, reply: "I can’t safely resolve both ends of that window." };
      const start = Math.min(left.item.end, right.item.end);
      const end = Math.max(left.item.start, right.item.start);
      const middle = items.filter((item) => item.id !== left.item.id && item.id !== right.item.id && item.start >= start && item.end <= end);
      return {
         handled: true,
         referencedItemId: right.item.id,
         reply: middle.length ? middle.map((item) => `${clockLabel(item.start)} — ${item.title}`).join("\n") : `Nothing is scheduled between ${left.item.title} and ${right.item.title}.`,
      };
   }

   if (/\b(?:(?:what\s*s|what\s+is)\s+)?my last thing\b|\b(?:what\s*s|what\s+is)\s+last\b/.test(lower)) {
      const last = [...items].sort((left, right) => right.start - left.start)[0];
      return last
         ? { handled: true, referencedItemId: last.id, reply: `${last.title} is last ${dayLabel(date)}, at ${clockLabel(last.start)}.` }
         : { handled: true, reply: `Nothing is scheduled ${dayLabel(date)}.` };
   }

   const openWindow = parseWindow(raw);
   if (openWindow && /\b(?:open|free|available|room|space)\b/.test(lower)) {
      const windows = calculateAvailability(items, openWindow.start, openWindow.end, 10);
      return { handled: true, reply: windows.length ? formatAvailability(windows) : `There isn’t a clean opening between ${clockLabel(openWindow.start)} and ${clockLabel(openWindow.end)}.` };
   }

   if (/\b(?:when am i free|when do i have time|what\s*s open|what\s+is open|free time|when am i open)\b/.test(lower)) {
      const today = localDateKey(date) === localDateKey(new Date());
      const now = new Date();
      const start = today ? Math.max(6 * 60, now.getHours() * 60 + now.getMinutes()) : 6 * 60;
      const bedtime = options.bedtime ? minutesFromClock(options.bedtime) : 23 * 60;
      const end = bedtime > start ? bedtime : 24 * 60;
      const windows = calculateAvailability(items, start, end, 30);
      return { handled: true, reply: windows.length ? formatAvailability(windows) : `I don’t see a clean 30-minute opening ${dayLabel(date)}.` };
   }

   const beforeReference = lower.match(/\bhow much time do i have before\s+(.+)$/);
   if (beforeReference) {
      const query = referenceQueryFromRelation(beforeReference[1]);
      const resolved = resolveContextualReference(query, items, priorId);
      if (resolved.status === "ambiguous") return { handled: true, reply: clarification(resolved.items) };
      if (resolved.status !== "resolved") return { handled: true, reply: `I can’t find ${query} on ${dayLabel(date)}.` };
      const today = localDateKey(date) === localDateKey(new Date());
      const now = new Date();
      const start = today ? now.getHours() * 60 + now.getMinutes() : 6 * 60;
      const windows = calculateAvailability(items.filter((item) => item.id !== resolved.item.id), start, resolved.item.start, 5);
      const total = windows.reduce((sum, window) => sum + window.minutes, 0);
      return {
         handled: true,
         referencedItemId: resolved.item.id,
         reply: total > 0
            ? `You have ${durationLabel(total)} of open time before ${resolved.item.title}. The cleanest window is ${formatAvailability(windows.slice().sort((a, b) => b.minutes - a.minutes).slice(0, 1))}.`
            : `There isn’t open time before ${resolved.item.title}.`,
      };
   }

   const fitBefore = lower.match(/\bcan i fit\s+(.+?)\s+before\s+(.+)$/);
   const fitAfter = lower.match(/\bdo i have time to\s+(.+?)\s+after\s+(.+)$/);
   const fit = fitBefore || fitAfter;
   if (fit) {
      const activity = fit[1].replace(/\bfor\s+\d+[\s\S]*$/, "").trim();
      const query = referenceQueryFromRelation(fit[2]);
      const resolved = resolveContextualReference(query, items, priorId);
      if (resolved.status === "ambiguous") return { handled: true, reply: clarification(resolved.items) };
      if (resolved.status !== "resolved") return { handled: true, reply: `I can’t find ${query} on ${dayLabel(date)}.` };
      const duration = requestedDuration(raw, 30);
      const bedtime = options.bedtime ? minutesFromClock(options.bedtime) : 23 * 60;
      const windowStart = fitBefore ? 6 * 60 : resolved.item.end;
      const windowEnd = fitBefore ? resolved.item.start : bedtime;
      const windows = calculateAvailability(items.filter((item) => item.id !== resolved.item.id), windowStart, windowEnd, duration);
      const opening = windows.find((window) => window.minutes >= duration);
      return {
         handled: true,
         referencedItemId: resolved.item.id,
         reply: opening
            ? `Yes. ${activity || "That"} fits from ${clockLabel(opening.start)} to ${clockLabel(opening.start + duration)} without moving ${resolved.item.title}.`
            : `Not cleanly. I can’t find ${durationLabel(duration)} around ${resolved.item.title} without moving something.`,
      };
   }

   if (/\b(?:how busy|shape of|what kind of day|is .* a light day|is .* a busy day)\b/.test(lower)) {
      const shape = describeDayShape(items);
      const observations = [
         shape.demandingMorning ? "The morning is demanding." : "The morning has breathing room.",
         shape.tightTransition ? "There’s at least one tight transition." : "The transitions have room.",
         shape.openEvening ? "The evening is open." : "The evening is fairly spoken for.",
      ];
      return { handled: true, reply: `${dayLabel(date).charAt(0).toUpperCase()}${dayLabel(date).slice(1)} looks ${shape.lightDay ? "light" : "structured"}. ${observations.join(" ")}` };
   }

   return { handled: false, reply: "" };
}

function mutationReferenceQuery(prompt: string) {
   return stripDayWords(prompt)
      .replace(/^(?:move|shift|push|cancel|remove|delete|archive|complete|finish|mark)\s+/, "")
      .replace(/\s+(?:to|at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b.*$/, "")
      .replace(/\s+(?:done|complete)$/, "")
      .trim();
}

function itemForContextualId(id: string, state: LifeState) {
   if (!id.startsWith("life:")) return undefined;
   return state.items.find((item) => item.id === id.slice("life:".length));
}

export function interpretContextualLifeMutation(
   prompt: string,
   lifeState: LifeState,
   rhythm: DailyRhythmState,
   conversation: KinMessage[] = [],
): ContextualMutationResult {
   const lower = normalizeContextText(prompt);
   const extensionCue = /\b(?:another|extra)\s+\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?)\b|\bis taking longer than expected\b/.test(lower);
   const mutation = /^(?:move|shift|push|cancel|remove|delete|archive|complete|finish|mark)\b/.test(lower) || extensionCue;
   if (!mutation) return { handled: false, reply: "", actions: [] };

   const date = targetDateFromPrompt(prompt);
   const allLifeItems = lifeState.items
      .filter((item) => item.state !== "archived" && Boolean(item.startAt || item.dueAt))
      .map((item): ContextualScheduleItem => {
         const timestamp = item.startAt || item.dueAt || 0;
         const start = dayMinutes(timestamp);
         return {
            id: `life:${item.id}`,
            title: item.title,
            start,
            end: item.endAt ? dayMinutes(item.endAt) : start + Math.max(5, item.durationMinutes || 30),
            hard: item.kind === "commitment",
            kind: item.kind === "commitment" ? "commitment" : "task",
            context: item.context,
         };
      });
   const scoped = explicitDayInPrompt(prompt)
      ? allLifeItems.filter((candidate) => {
           const item = itemForContextualId(candidate.id, lifeState);
           return Boolean(item && sameDate(item.startAt || item.dueAt || 0, date));
        })
      : allLifeItems;
   let priorId = previousReferenceId(scoped, conversation);
   if (!priorId && extensionCue) {
      const now = Date.now();
      const ongoing = lifeState.items.filter((item) => {
         const start = item.startAt || item.dueAt;
         const end = item.endAt || (start ? start + Math.max(5, item.durationMinutes || 30) * 60_000 : 0);
         return item.state === "active" && Boolean(start && start <= now && end >= now);
      });
      if (ongoing.length === 1) priorId = `life:${ongoing[0].id}`;
   }
   const longerTitle = lower.match(/^(.+?)\s+is taking longer than expected\b/)?.[1];
   const query = extensionCue ? (longerTitle || "that") : (mutationReferenceQuery(prompt) || "that");
   const resolved = resolveContextualReference(query, scoped, priorId);

   if (resolved.status === "ambiguous") return { handled: true, reply: clarification(resolved.items), actions: [] };
   if (resolved.status !== "resolved") return { handled: true, reply: `I can’t safely match ${query || "that"} to one calendar item.`, actions: [] };
   const target = itemForContextualId(resolved.item.id, lifeState);
   if (!target) return { handled: false, reply: "", actions: [] };

   if (extensionCue) {
      const extra = requestedDuration(prompt, 0);
      if (!extra) return { handled: true, referencedItemId: resolved.item.id, reply: `How much longer does ${target.title} need?` , actions: [] };
      const start = target.startAt || target.dueAt || Date.now();
      const currentEnd = target.endAt || start + Math.max(5, target.durationMinutes || 30) * 60_000;
      return {
         handled: true,
         referencedItemId: resolved.item.id,
         reply: `${target.title} gets another ${durationLabel(extra)}.`,
         actions: [{ type: "update_item", targetId: target.id, changes: { endAt: currentEnd + extra * 60_000, durationMinutes: Math.round((currentEnd + extra * 60_000 - start) / 60_000) } }],
      };
   }

   if (/^(?:cancel|remove|delete|archive)\b/.test(lower)) {
      return { handled: true, referencedItemId: resolved.item.id, reply: `${target.title} is cancelled.`, actions: [{ type: "archive_item", targetId: target.id }] };
   }
   if (/^(?:complete|finish|mark)\b/.test(lower)) {
      return { handled: true, referencedItemId: resolved.item.id, reply: `${target.title} is done.`, actions: [{ type: "complete_item", targetId: target.id }] };
   }

   const newClock = movedToClock(prompt);
   if (newClock === null) return { handled: true, referencedItemId: resolved.item.id, reply: `What time should ${target.title} move to?`, actions: [] };
   const base = new Date(target.startAt || target.dueAt || Date.now());
   if (explicitDayInPrompt(prompt)) {
      base.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
   }
   const oldStart = target.startAt || target.dueAt || base.getTime();
   const durationMs = target.endAt ? target.endAt - oldStart : Math.max(5, target.durationMinutes || 30) * 60_000;
   base.setHours(Math.floor(newClock / 60), newClock % 60, 0, 0);
   const nextStart = base.getTime();
   return {
      handled: true,
      referencedItemId: resolved.item.id,
      reply: `${target.title} moves to ${clockLabel(newClock)}.`,
      actions: [{
         type: "update_item",
         targetId: target.id,
         changes: {
            dueAt: nextStart,
            startAt: target.kind === "commitment" ? nextStart : target.startAt ? nextStart : undefined,
            endAt: target.endAt ? nextStart + durationMs : undefined,
            timingPrecision: "exact",
            allDay: false,
            pinToToday: sameDate(nextStart, new Date()),
         },
      }],
   };
}
