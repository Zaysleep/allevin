// ========================================
// ALLEVIN MK XII — ALLEVIN Server AI Boundary
// Purpose:
// Keep provider credentials server-side. ALLEVIN returns proposed life-state actions;
// the browser-side Life Store validates and applies them.
// ========================================

import { NextResponse } from "next/server";

import { openAICompletionOptions, providerFailureIsRetryable, providerFailureReason } from "@/lib/allevinOpenAIRequest";
import { ALLEVIN_BUILD } from "@/lib/allevinBuild";

import type { KinLLMRequest, KinLLMResponse } from "@/lib/allevinLLMTypes";
import type { KinAction, KinActionItemInput, LifeContext, LifeImportance, LifeItemKind, LifeItemState, LifeRecurrence, LifeTimingPrecision } from "@/lib/lifeTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
   const headers = new Headers(init?.headers);
   headers.set("Cache-Control", "no-store, max-age=0");
   headers.set("X-ALLEVIN-Build", ALLEVIN_BUILD.version);
   return NextResponse.json(body, { ...init, headers });
}

/**
 * A read-only production parity check. It reveals only whether the runtime has
 * its server-side language configuration; secret values never leave Vercel.
 */
export async function GET() {
   return noStoreJson({
      ok: true,
      build: ALLEVIN_BUILD.version,
      protocol: ALLEVIN_BUILD.languageProtocol,
      configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
   });
}

const VALID_CONTEXTS: LifeContext[] = ["personal", "work", "school", "kin-software", "home", "errand", "car", "finance", "health", "other"];
const VALID_KINDS: LifeItemKind[] = ["task", "commitment", "waiting", "routine", "note"];
const VALID_STATES: LifeItemState[] = ["active", "waiting", "someday", "done", "archived"];
const VALID_IMPORTANCE: LifeImportance[] = ["low", "normal", "high"];
const VALID_RECURRENCE: LifeRecurrence[] = ["none", "daily", "weekdays", "weekly", "monthly"];
const VALID_TIMING: LifeTimingPrecision[] = ["exact", "day", "window", "someday", "none"];

function clean(value: unknown, limit = 6000) {
   return String(value ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
      .slice(0, limit);
}

function safeTimestamp(value: unknown) {
   return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function sanitizeItemInput(raw: unknown): KinActionItemInput | undefined {
   if (!raw || typeof raw !== "object") return undefined;
   const value = raw as Record<string, unknown>;
   const title = clean(value.title, 180);
   const input: KinActionItemInput = {
      title: title || undefined,
      details: clean(value.details, 2000) || undefined,
      kind: VALID_KINDS.includes(value.kind as LifeItemKind) ? (value.kind as LifeItemKind) : undefined,
      state: VALID_STATES.includes(value.state as LifeItemState) ? (value.state as LifeItemState) : undefined,
      context: VALID_CONTEXTS.includes(value.context as LifeContext) ? (value.context as LifeContext) : undefined,
      importance: VALID_IMPORTANCE.includes(value.importance as LifeImportance) ? (value.importance as LifeImportance) : undefined,
      recurrence: VALID_RECURRENCE.includes(value.recurrence as LifeRecurrence) ? (value.recurrence as LifeRecurrence) : undefined,
      timingPrecision: VALID_TIMING.includes(value.timingPrecision as LifeTimingPrecision) ? (value.timingPrecision as LifeTimingPrecision) : undefined,
      dueAt: safeTimestamp(value.dueAt),
      startAt: safeTimestamp(value.startAt),
      endAt: safeTimestamp(value.endAt),
      followUpAt: safeTimestamp(value.followUpAt),
      deferUntil: safeTimestamp(value.deferUntil),
      durationMinutes: typeof value.durationMinutes === "number" && Number.isFinite(value.durationMinutes) ? Math.max(5, Math.min(720, Math.round(value.durationMinutes))) : undefined,
      location: clean(value.location, 180) || undefined,
      allDay: typeof value.allDay === "boolean" ? value.allDay : undefined,
      pinToToday: typeof value.pinToToday === "boolean" ? value.pinToToday : undefined,
   };
   return input;
}

function sanitizeActions(raw: unknown): KinAction[] {
   if (!Array.isArray(raw)) return [];
   return raw
      .slice(0, 8)
      .map((value): KinAction | null => {
         if (!value || typeof value !== "object") return null;
         const action = value as Record<string, unknown>;
         const type = action.type;
         if (type !== "create_item" && type !== "update_item" && type !== "complete_item" && type !== "reopen_item" && type !== "archive_item") return null;
         const result: KinAction = {
            type,
            targetId: clean(action.targetId, 180) || undefined,
            targetQuery: clean(action.targetQuery, 180) || undefined,
            item: sanitizeItemInput(action.item),
            changes: sanitizeItemInput(action.changes),
         };
         if (type === "create_item" && !result.item?.title) return null;
         if (type !== "create_item" && !result.targetId && !result.targetQuery) return null;
         return result;
      })
      .filter((action): action is KinAction => Boolean(action));
}

function sanitizeRequest(raw: unknown): KinLLMRequest | null {
   if (!raw || typeof raw !== "object") return null;
   const value = raw as Partial<KinLLMRequest>;
   if (value.mode !== "kin-life") return null;
   const input = clean(value.input, 6000);
   if (!input) return null;

   const phraseModes = ["state-ack", "grounded", "clarify", "mutation-ack"] as const;
   return {
      mode: "kin-life",
      responseMode: phraseModes.includes(value.responseMode as (typeof phraseModes)[number])
         ? value.responseMode
         : "normal",
      stateReceipt: clean(value.stateReceipt, 3000) || undefined,
      candidateTitle: clean(value.candidateTitle, 180) || undefined,
      recentReplies: Array.isArray(value.recentReplies)
         ? value.recentReplies.slice(-12).map((reply) => clean(reply, 1000)).filter(Boolean)
         : [],
      variationNonce: clean(value.variationNonce, 120) || undefined,
      rejectedReply: clean(value.rejectedReply, 1000) || undefined,
      input,
      nowIso: clean(value.nowIso, 80) || new Date().toISOString(),
      timezoneOffsetMinutes: typeof value.timezoneOffsetMinutes === "number" && Number.isFinite(value.timezoneOffsetMinutes) ? value.timezoneOffsetMinutes : 0,
      displayName: clean(value.displayName, 80) || undefined,
      assistantContext: clean(value.assistantContext, 12000) || undefined,
      voiceStyle: value.voiceStyle === "balanced" || value.voiceStyle === "calm" ? value.voiceStyle : "direct",
      lifeItems: Array.isArray(value.lifeItems)
         ? value.lifeItems.slice(0, 120).map((item) => ({
              id: clean(item?.id, 180),
              title: clean(item?.title, 180),
              kind: VALID_KINDS.includes(item?.kind as LifeItemKind) ? (item.kind as LifeItemKind) : "task",
              state: VALID_STATES.includes(item?.state as LifeItemState) ? (item.state as LifeItemState) : "active",
              context: VALID_CONTEXTS.includes(item?.context as LifeContext) ? (item.context as LifeContext) : "personal",
              importance: VALID_IMPORTANCE.includes(item?.importance as LifeImportance) ? (item.importance as LifeImportance) : "normal",
              dueAt: safeTimestamp(item?.dueAt),
              startAt: safeTimestamp(item?.startAt),
              endAt: safeTimestamp(item?.endAt),
              followUpAt: safeTimestamp(item?.followUpAt),
              deferUntil: safeTimestamp(item?.deferUntil),
              durationMinutes: typeof item?.durationMinutes === "number" && Number.isFinite(item.durationMinutes) ? item.durationMinutes : undefined,
              recurrence: VALID_RECURRENCE.includes(item?.recurrence as LifeRecurrence) ? (item.recurrence as LifeRecurrence) : "none",
              allDay: item?.allDay === true,
              pinToToday: item?.pinToToday === true,
              details: clean(item?.details, 1000) || undefined,
           }))
         : [],
      conversation: Array.isArray(value.conversation)
         ? value.conversation.slice(-12).map((message) => ({ role: message?.role === "user" ? ("user" as const) : ("assistant" as const), content: clean(message?.content, 3000) })).filter((message) => message.content)
         : [],
   };
}


type ResolvedRelativeTiming = {
   timestamp: number;
   precision: LifeTimingPrecision;
   allDay: boolean;
   pinToToday: boolean;
};

function localCalendarParts(timestamp: number, timezoneOffsetMinutes: number) {
   // Date#getTimezoneOffset is UTC - local. Shift the instant into a fake UTC
   // representation of the user's local wall clock so UTC getters give us the
   // user's local calendar fields deterministically on the server.
   const shifted = new Date(timestamp - timezoneOffsetMinutes * 60_000);
   return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth(),
      date: shifted.getUTCDate(),
      day: shifted.getUTCDay(),
   };
}

function localWallClockToTimestamp(
   year: number,
   month: number,
   date: number,
   hours: number,
   minutes: number,
   timezoneOffsetMinutes: number,
) {
   return Date.UTC(year, month, date, hours, minutes, 0, 0) + timezoneOffsetMinutes * 60_000;
}

function sameLocalCalendarDay(
   leftTimestamp: number,
   rightTimestamp: number,
   timezoneOffsetMinutes: number,
) {
   const left = localCalendarParts(leftTimestamp, timezoneOffsetMinutes);
   const right = localCalendarParts(rightTimestamp, timezoneOffsetMinutes);
   return left.year === right.year && left.month === right.month && left.date === right.date;
}

function parseExplicitClock(input: string) {
   const lower = input.toLowerCase();

   if (/\bnoon\b/.test(lower)) return { hours: 12, minutes: 0 };
   if (/\bmidnight\b/.test(lower)) return { hours: 0, minutes: 0 };

   // "at 6", "at 6:30", "6 pm", "6:30pm"
   const match =
      lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/) ||
      lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);

   if (!match) return null;

   let hours = Number(match[1]);
   const minutes = Number(match[2] || 0);
   const suffix = match[3];

   if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;

   if (suffix === "pm" && hours < 12) hours += 12;
   if (suffix === "am" && hours === 12) hours = 0;

   // For an explicit "at 6" without am/pm, preserve the same human-friendly
   // convention as the local interpreter: 1–7 defaults to afternoon/evening.
   if (!suffix && hours >= 1 && hours <= 7) hours += 12;

   return { hours, minutes };
}

function resolveRelativeTiming(
   input: string,
   nowIso: string,
   timezoneOffsetMinutes: number,
): ResolvedRelativeTiming | null {
   const lower = clean(input, 6000).toLowerCase();
   const nowTimestamp = Date.parse(nowIso);
   if (!Number.isFinite(nowTimestamp)) return null;

   const now = localCalendarParts(nowTimestamp, timezoneOffsetMinutes);
   let year = now.year;
   let month = now.month;
   let date = now.date;
   let matched = false;
   let precision: LifeTimingPrecision = "day";

   const shiftDays = (days: number) => {
      const shifted = new Date(Date.UTC(year, month, date + days, 12, 0, 0, 0));
      year = shifted.getUTCFullYear();
      month = shifted.getUTCMonth();
      date = shifted.getUTCDate();
   };

   if (/\bday after tomorrow\b/.test(lower)) {
      shiftDays(2);
      matched = true;
   } else if (/\btomorrow\b/.test(lower)) {
      shiftDays(1);
      matched = true;
   } else if (/\b(?:today|tonight)\b/.test(lower)) {
      matched = true;
      if (/\btonight\b/.test(lower)) precision = "window";
   } else if (/\bnext week\b/.test(lower)) {
      shiftDays(7);
      matched = true;
      precision = "window";
   } else if (/\bnext month\b/.test(lower)) {
      const shifted = new Date(Date.UTC(year, month + 1, 1, 12, 0, 0, 0));
      year = shifted.getUTCFullYear();
      month = shifted.getUTCMonth();
      date = shifted.getUTCDate();
      matched = true;
      precision = "window";
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

   if (!matched) {
      for (const [name, targetDay] of Object.entries(weekdays)) {
         if (!new RegExp(`\\b(?:next\\s+)?${name}\\b`).test(lower)) continue;

         const currentDay = new Date(Date.UTC(year, month, date, 12, 0, 0, 0)).getUTCDay();
         let delta = (targetDay - currentDay + 7) % 7;
         if (delta === 0) delta = 7;
         if (new RegExp(`\\bnext\\s+${name}\\b`).test(lower) && delta < 7) {
            // "next Tuesday" means the next occurrence; the computed delta
            // already expresses that for a future weekday.
         }
         shiftDays(delta);
         matched = true;
         break;
      }
   }

   if (!matched) return null;

   const clock = parseExplicitClock(lower);
   const broadWindow = /\b(?:morning|afternoon|evening|tonight|after work|before work|sometime|later in the day)\b/.test(lower);

   if (clock) {
      precision = "exact";
   } else if (broadWindow) {
      precision = "window";
   }

   const hours = clock?.hours ?? 12;
   const minutes = clock?.minutes ?? 0;
   const timestamp = localWallClockToTimestamp(
      year,
      month,
      date,
      hours,
      minutes,
      timezoneOffsetMinutes,
   );

   return {
      timestamp,
      precision,
      allDay: !clock,
      pinToToday: sameLocalCalendarDay(timestamp, nowTimestamp, timezoneOffsetMinutes),
   };
}

function findActionTarget(request: KinLLMRequest, action: KinAction) {
   if (action.targetId) {
      const byId = request.lifeItems.find((item) => item.id === action.targetId);
      if (byId) return byId;
   }

   const query = clean(action.targetQuery, 180).toLowerCase();
   if (!query) return undefined;

   const exact = request.lifeItems.find((item) => item.title.toLowerCase() === query);
   if (exact) return exact;

   return request.lifeItems.find(
      (item) =>
         item.title.toLowerCase().includes(query) ||
         query.includes(item.title.toLowerCase()),
   );
}

function reanchorTimestampToExplicitClock(
   timestamp: number | undefined,
   clock: { hours: number; minutes: number } | null,
   timezoneOffsetMinutes: number,
) {
   if (!timestamp || !clock) return timestamp;

   // Preserve the model-selected local DATE while replacing only the wall-clock
   // time with the user's explicit wording. This fixes continuation phrases
   // like "lunch at noon" where the prior turn supplies the day but the current
   // turn supplies the exact clock.
   const parts = localCalendarParts(timestamp, timezoneOffsetMinutes);
   return localWallClockToTimestamp(
      parts.year,
      parts.month,
      parts.date,
      clock.hours,
      clock.minutes,
      timezoneOffsetMinutes,
   );
}

function normalizeActionTiming(
   actions: KinAction[],
   request: KinLLMRequest,
) {
   const timing = resolveRelativeTiming(
      request.input,
      request.nowIso,
      request.timezoneOffsetMinutes,
   );
   const explicitClock = parseExplicitClock(request.input);

   // Even if the current turn does not repeat the date, an action may already
   // carry the intended date from conversation/state context. In that case we
   // still honor an explicit clock such as "noon" or "2 PM" deterministically.
   if (!timing && !explicitClock) return actions;

   return actions.map((action) => {
      if (action.type === "create_item" && action.item) {
         const item = { ...action.item };
         const waiting = item.kind === "waiting" || item.state === "waiting";
         const commitment = item.kind === "commitment";

         if (timing) {
            if (waiting) {
               item.followUpAt = timing.timestamp;
               item.dueAt = undefined;
               item.startAt = undefined;
            } else {
               item.dueAt = timing.timestamp;
               if (commitment) item.startAt = timing.timestamp;
            }

            item.timingPrecision = timing.precision;
            item.allDay = timing.allDay;
            item.pinToToday = timing.pinToToday;
         } else if (explicitClock) {
            const base = item.startAt || item.dueAt;
            const exact = reanchorTimestampToExplicitClock(
               base,
               explicitClock,
               request.timezoneOffsetMinutes,
            );
            if (exact) {
               item.dueAt = exact;
               if (commitment) item.startAt = exact;
               item.timingPrecision = "exact";
               item.allDay = false;
               item.pinToToday = sameLocalCalendarDay(
                  exact,
                  Date.parse(request.nowIso),
                  request.timezoneOffsetMinutes,
               );
            }
         }

         return { ...action, item };
      }

      if (action.type === "update_item" && action.changes) {
         const changes = { ...action.changes };
         const target = findActionTarget(request, action);
         const waiting =
            changes.kind === "waiting" ||
            changes.state === "waiting" ||
            target?.kind === "waiting" ||
            target?.state === "waiting";
         const commitment =
            changes.kind === "commitment" ||
            target?.kind === "commitment";

         if (timing) {
            if (waiting) {
               changes.followUpAt = timing.timestamp;
               changes.dueAt = undefined;
               changes.startAt = undefined;
            } else {
               changes.dueAt = timing.timestamp;
               if (commitment) changes.startAt = timing.timestamp;
            }

            changes.timingPrecision = timing.precision;
            changes.allDay = timing.allDay;
            changes.pinToToday = timing.pinToToday;
         } else if (explicitClock) {
            const base =
               changes.startAt ||
               changes.dueAt ||
               target?.startAt ||
               target?.dueAt;
            const exact = reanchorTimestampToExplicitClock(
               base,
               explicitClock,
               request.timezoneOffsetMinutes,
            );
            if (exact) {
               changes.dueAt = exact;
               if (commitment) changes.startAt = exact;
               changes.timingPrecision = "exact";
               changes.allDay = false;
               changes.pinToToday = sameLocalCalendarDay(
                  exact,
                  Date.parse(request.nowIso),
                  request.timezoneOffsetMinutes,
               );
            }
         }

         return { ...action, changes };
      }

      return action;
   });
}

function buildPrompt(request: KinLLMRequest) {
   const voice = request.voiceStyle || "direct";
   const phraseOnly = request.responseMode !== "normal";
   const outputContract = request.responseMode === "mutation-ack"
      ? `Return ONLY valid JSON with this exact shape:\n{\n  "reply": "natural post-action acknowledgement",\n  "canonicalTitle": "concise action title"\n}`
      : phraseOnly
        ? `Return ONLY valid JSON with this exact shape:\n{\n  "reply": "natural grounded response"\n}`
        : `Return ONLY valid JSON with this exact shape:
{
  "reply": "natural response to the user",
  "actions": [
    {
      "type": "create_item | update_item | complete_item | reopen_item | archive_item",
      "targetId": "existing item id when changing an item",
      "targetQuery": "only if an id is genuinely unavailable",
      "item": { ...fields for create_item },
      "changes": { ...fields for update_item }
    }
  ]
}`;
   return [
      {
         role: "system" as const,
         content: `You are ALLEVIN, a high-level personal assistant inside ALLEVIN MK XII. ALLEVIN helps a person understand the shape of their day, preserve accurate life state, adapt when reality changes, and decide what deserves attention next.

ALLEVIN is not a project manager, productivity scoreboard, habit-streak app, or generic chatbot.

The LIFE STATE and ASSISTANT CONTEXT supplied by the app are authoritative. Never claim a task, commitment, routine, schedule block, completion, waiting item, or date exists unless that context says so or you return an allowed action that would change LIFE STATE. Routine/schedule mutations are handled by the client-side rhythm engine; never pretend you changed them if no life-state action can represent the change.

${outputContract}

Allowed item fields:
title, details, kind(task|commitment|waiting|routine|note), state(active|waiting|someday|done|archived), context(personal|work|school|kin-software|home|errand|car|finance|health|other), importance(low|normal|high), recurrence(none|daily|weekdays|weekly|monthly), timingPrecision(exact|day|window|someday|none), dueAt/startAt/endAt/followUpAt/deferUntil as Unix milliseconds, durationMinutes, location, allDay, pinToToday.

Assistant behavior:
- Maintain truth before personality. The app owns dates, state, recurrence, completion, and schedule truth.
- Do not create an item merely because the user asks a question.
- Create an item when the user clearly asks you to remember, remind, schedule, track, wait for, or do something.
- If the user's request is visibly cut off or ends without the required person, object, action, or time, return no actions and ask one concise question for the missing detail. Never save a partial title.
- For every created item, title must be the concise underlying action or event—not the user's full command. Remove phrases such as “remind me”, “add”, and temporal scaffolding from the title while preserving proper names, brands, and acronyms.
- A dated/timed real-world plan such as dinner with someone, an appointment, reservation, meeting, class event, flight, or other place/time obligation is kind=commitment. Treat it as a hard one-off boundary so the deterministic day adapter can move/suppress elastic routines around it.
- Waiting on another person belongs in kind=waiting and state=waiting. Do not invent a follow-up date.
- Someday/eventually ideas belong in state=someday. Do not crowd Today with them.
- Relative calendar language is normalized deterministically after your response. Do not trust your own timestamp math over the app.
- In a sequence of planning statements, a new item that gives a time but omits the day may inherit the immediately established date from RECENT CONVERSATION only when that continuation is unambiguous. If more than one date is plausible, ask instead of guessing.
- A broad window such as afternoon or after work is not an exact appointment time unless the user gave one.
- Update an existing item when the user corrects themselves. Do not create duplicates when the target is clear.
- If a reference could reasonably point to multiple items, ask one concise clarification instead of guessing.
- Recurring schedule blocks such as Work, Class, caregiving, or another long context are containers, not mutually-exclusive appointments. A one-off commitment can live inside them without deleting the parent block.
- If a one-off item shares the parent context or the user explicitly says it happens "during" that block, treat it as contained (for example a meeting inside a workday). Keep the parent schedule intact.
- If a one-off commitment with a different context lands inside a long parent schedule (for example an appointment during Work), add the commitment and keep the parent schedule. Point out that travel/time-away buffer may still need to be solved; do not ask the user to delete the whole parent block unless they explicitly want that.
- Only a genuine one-off commitment versus another one-off commitment should be treated as a mutually-exclusive collision by default. If two exact one-off commitments conflict, do not hide it; the client may block the mutation and ask which one wins.
- When the user says a specific existing item was cancelled/completed/moved, only claim success if LIFE STATE contains a matching item by identity/title and any explicit time/date. Never substitute a different item just because a generic word such as "meeting" overlaps.
- Do not invent urgency. Important, urgent, scheduled, flexible, and merely available are different things.
- Protect open space. If nothing deserves attention, say so.
- If something is waiting on someone else and no follow-up is due, there is nothing actionable yet.
- When the user has a short window, prefer a recorded task with a known compatible duration. If none fits, preserve the free time.
- When plans change, favor adaptation over guilt. Skipped is not the same as completed.
- The rhythm context may include date-scoped dayContext, outcomes, and temporaryEntries. Treat those as the current reality overlay for that date, never as a permanent user trait.
- Date scope is strict. For a question about now/today/tonight, only context whose dateKey matches currentDateKey may affect the answer. Future recovery, travel, illness, event, or custom context must never leak backward into the present. For a question about a named/future day, use only that day’s matching context plus permanent routine/profile data.
- When the user asks how a particular day should change, ground the answer in the already-resolved entries supplied for that date. Do not re-derive weekday schedule membership yourself, do not claim a commitment is absent when the resolved entries contain it, and do not invent cancellations. If temporary context creates an ambiguous consequence, identify the affected scheduled boundary and say what choice still needs the user rather than guessing.
- User-supplied context outranks routine assumptions. If the user says they are tired, working from home, running late, changing plans, or otherwise describes what is true for a date, reason from that revised day instead of defending the original plan.
- Hard commitments remain protected unless the user changes or cancels them. Elastic routines may be skipped, replaced, or suppressed by the deterministic client; do not shame the user for that adaptation.
- A one-off commitment should not silently become a recurring preference. Temporary context stays temporary unless the user clearly says "from now on", "going forward", or equivalent permanent language.
- Do not diagnose health or infer medical restrictions. If the user explicitly says they are unwell, respect the stored recovery context and keep optional suggestions low-pressure unless they ask otherwise.
- Do not shame the user. Do not congratulate every ordinary action. Do not turn every reply into advice.
- Be concise when the answer is simple. Push back only when it is useful.
- Lifestyle suggestions must be schedule-aware and optional. Use the available time, the next fixed commitment, the user's stored rhythm, bedtime/travel preferences, and saved flexible choices before suggesting a workout, meal, preparation step, or use of free time.
- Recommendation history in ASSISTANT CONTEXT is memory. Do not recycle a recommendation already listed there unless the user explicitly asks for it again. Never repeat something the user disliked.
- Progression matters more than novelty. When a recurring activity appears, recommend the next useful focus based on recent focus history, available time, schedule pressure, and explicit feedback. Rotate the underlying focus, not merely the wording.
- For fitness, recommend a training focus or muscle-group direction rather than pretending to prescribe a complete workout. Leave exact exercises, load, sets, and medical judgment to the user or their qualified professional.
- Apply the same progression principle generally: learning can rotate subject/focus, creative work can rotate explore/refine/finish, recovery can rotate low-pressure options, and flexible leisure/work choices can rotate based on the day.
- Flexible choices are options, not obligations. Select from the user's saved choices only when the option fits the available time, current context, recent history, and next-day load.
- Learn only from explicit feedback and stored state. Do not invent health, dietary, fitness, or lifestyle constraints the user never gave you.
- Current voice setting: ${voice}. Direct means sharp, dry, street-smart, unsentimental, occasionally darkly funny, and willing to call out a bad plan in one clean line. Use humor like a scalpel, not confetti. Balanced is neutral and concise. Calm is steady and low-pressure. Never imitate, quote, or roleplay a fictional character directly.
- Serious situations stay serious. Humor belongs only where stakes are low.
- In Direct mode, favor confident short sentences, useful pushback, and a little edge. Do not become cruel, melodramatic, or performative.
- Sound like a person responding to what changed, not a state machine narrating its implementation. Avoid bookkeeping phrases such as “for this occurrence”, “recovery mode”, “normal schedule stays intact”, “I marked”, “I put the day into”, or “date-scoped context” unless the user explicitly asks how the system works. Say what changed in ordinary language, then stop.
- Make the response useful to this specific action. When the supplied facts support it, connect the action to its ordinary human purpose: preparation, rest, recovery, nourishment, focus, care, connection, relief, or protecting time. Do not invent a personal motive, feeling, or benefit that is not reasonably grounded in the action.
- Vary openings and sentence shape. Do not lead with filler such as “Got it”, “Okay”, “Understood”, “Noted”, “Done”, or “I’ll keep”. Avoid copying RECENT REPLIES.
- Avoid generic task language such as “this is a good time to begin”, “get into it”, “keep the next step simple”, “you have space for this now”, “use this window well”, and “keep the transition clean”.
- When you return mutation actions, write the reply as the successful post-action acknowledgement, not a promise to act later. Prefer “Staff meeting is in at 10” over “I’ll add your staff meeting.” The client will suppress your reply if preflight rejects the mutation.
- RECENT CONVERSATION is supporting language context only, never temporal authority. If old prose conflicts with currentDateKey, currentDayContext, matching nearTermReality, or resolved entries, ignore the old prose.
- No Jarvis roleplay, hype, motivational-poster language, or product-management jargon.
- Never claim to send emails, place calls, buy things, or mutate an external calendar. Only returned actions may change ALLEVIN life state.

The goal is not to maximize activity. The goal is to help the user understand what is happening, what matters, what fits, what changed, and what should happen next.`,
      },
      {
         role: "user" as const,
         content: `CURRENT LOCAL MOMENT
${request.nowIso}
Timezone offset from UTC in minutes: ${request.timezoneOffsetMinutes}
Name: ${request.displayName || "not set"}

ASSISTANT CONTEXT
${request.assistantContext || "No recurring rhythm has been configured."}

LIFE STATE
${JSON.stringify(request.lifeItems, null, 2)}

RECENT CONVERSATION
${JSON.stringify(request.conversation, null, 2)}

RECENT REPLIES TO AVOID REPEATING
${JSON.stringify(request.recentReplies || [], null, 2)}

${request.rejectedReply ? `REJECTED WORDING FROM A PRIOR ATTEMPT
${request.rejectedReply}
Write a materially different response. Do not repeat or lightly paraphrase the rejected wording.` : ""}

VARIATION NONCE
${request.variationNonce || "not supplied"}

RESPONSE MODE
${request.responseMode || "normal"}
${phraseOnly ? `
STATE RECEIPT
${request.stateReceipt || "The deterministic state engine already applied the requested change."}

GROUNDED RESPONSE RULES
- You are phrasing verified facts. Never propose or return state-changing actions.
- Acknowledge only what the authoritative current state supports. When the receipt contains factual anchors, preserve their meaning but do not borrow their wording.
- Lead with the primary change the user explicitly requested. Mention downstream effects only after that, and only when they matter.
- Lead with the practical consequence rather than filler such as "Got it", "Understood", "Noted", or "I've marked".
- Phrase it naturally in ALLEVIN’s selected voice; never expose internal state terminology.
- Do not add a second change, invent a consequence, or turn temporary context into a permanent preference.
- Keep it to one or two compact sentences unless clarification is genuinely needed.
${request.responseMode === "clarify" ? "- The request is incomplete. Ask only for the missing detail. Do not imply that anything was saved." : ""}
${request.responseMode === "grounded" ? "- Answer from the supplied factual receipt. Do not turn a simple answer into a confirmation or advice unless the facts support it." : ""}
${request.responseMode === "mutation-ack" ? `- The deterministic action will be applied only after client validation. Phrase the reply as the successful result.\n- Do not turn the reply into CANDIDATE TITLE plus a date/time receipt. Respond to why the request helps in this moment, then confirm the verified time naturally.\n- Improve CANDIDATE TITLE into a concise calendar title that preserves the same action and subject. Remove command/timing scaffolding, preserve proper names and brands, and do not add facts.\nCANDIDATE TITLE\n${request.candidateTitle || ""}` : ""}
` : ""}
USER
${request.input}`,
      },
   ];
}

function parseJson(content: string) {
   try {
      return JSON.parse(content);
   } catch {
      const object = content.match(/\{[\s\S]*\}/)?.[0];
      return object ? JSON.parse(object) : {};
   }
}

export async function POST(request: Request) {
   let payload: KinLLMRequest | null = null;
   try {
      payload = sanitizeRequest(await request.json());
   } catch {
      payload = null;
   }

   if (!payload) return NextResponse.json({ ok: false, reply: "", actions: [], usedFallback: true, error: "Invalid ALLEVIN request." } satisfies KinLLMResponse, { status: 400 });

   const apiKey = process.env.OPENAI_API_KEY;
   const model = process.env.ALLEVIN_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
   if (!apiKey) return NextResponse.json({ ok: true, reply: "", actions: [], usedFallback: true, error: "No server AI key configured." } satisfies KinLLMResponse);

   try {
      const phraseOnly = payload.responseMode !== "normal";
      const responseFormat = phraseOnly
         ? {
              type: "json_schema",
              json_schema: {
                 name: payload.responseMode === "mutation-ack" ? "allevin_mutation_ack" : "allevin_grounded_reply",
                 strict: true,
                 schema: payload.responseMode === "mutation-ack"
                    ? {
                         type: "object",
                         additionalProperties: false,
                         properties: {
                            reply: { type: "string" },
                            canonicalTitle: { type: "string" },
                         },
                         required: ["reply", "canonicalTitle"],
                      }
                    : {
                         type: "object",
                         additionalProperties: false,
                         properties: { reply: { type: "string" } },
                         required: ["reply"],
                      },
              },
           }
         : { type: "json_object" };
      const requestProvider = () => fetch("https://api.openai.com/v1/chat/completions", {
         method: "POST",
         headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
         body: JSON.stringify({
            model,
            ...openAICompletionOptions(model, 700, phraseOnly ? 0.9 : 0.3),
            response_format: responseFormat,
            messages: buildPrompt(payload),
         }),
         cache: "no-store",
      });

      let provider = await requestProvider();
      if (!provider.ok && providerFailureIsRetryable(provider.status)) {
         await provider.text();
         provider = await requestProvider();
      }

      if (!provider.ok) {
         const reason = providerFailureReason(provider.status);
         await provider.text();
         return NextResponse.json({ ok: true, reply: "", actions: [], usedFallback: true, error: reason } satisfies KinLLMResponse);
      }

      const data = await provider.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) return NextResponse.json({ ok: true, reply: "", actions: [], usedFallback: true, error: "AI provider returned no content." } satisfies KinLLMResponse);

      const parsed = parseJson(content) as Record<string, unknown>;
      const sanitizedActions = sanitizeActions(parsed.actions);
      const result: KinLLMResponse = {
         ok: true,
         reply: clean(parsed.reply, 8000),
         // State-ack requests are deliberately read-only. Deterministic client
         // logic already owns the mutation; the model only supplies natural
         // language so personality can evolve without becoming state authority.
         actions: phraseOnly ? [] : normalizeActionTiming(sanitizedActions, payload),
         usedFallback: false,
         canonicalTitle: payload.responseMode === "mutation-ack"
            ? clean(parsed.canonicalTitle, 180) || undefined
            : undefined,
      };
      return NextResponse.json(result);
   } catch {
      return NextResponse.json({ ok: true, reply: "", actions: [], usedFallback: true, error: "ALLEVIN used the local interpreter." } satisfies KinLLMResponse);
   }
}
