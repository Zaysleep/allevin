import type { AllevinTone } from "./allevinVoice";

export type NotificationCopyPhase = "prep" | "start";

export interface NotificationTimelineItem {
   id: string;
   title: string;
   category: string;
   startAt: number;
   endAt: number;
}

export interface NotificationUpcomingContext {
   title: string;
   category: string;
   startsAtLabel: string;
   startsInMinutes: number;
   minutesFromCurrentEnd: number;
}

export interface NotificationPreviousContext {
   title: string;
   category: string;
   endedAtLabel: string;
   minutesBeforeCurrent: number;
}

export interface NotificationCopyContext {
   id: string;
   occurrenceKey: string;
   title: string;
   reason?: string;
   category: string;
   phase: NotificationCopyPhase;
   tone: AllevinTone;
   priority: 1 | 2 | 3 | 4 | 5;
   leadMinutes: number;
   durationMinutes: number;
   startsAtLabel: string;
   endsAtLabel: string;
   timeOfDay: "morning" | "afternoon" | "evening" | "night";
   previous?: NotificationPreviousContext;
   next?: NotificationUpcomingContext;
}

const DISALLOWED_COPY = [
   "calendar starts freelancing",
   "calendar is freelancing",
   "clock's done negotiating",
   "clock is done negotiating",
   "handle the thing that matters",
   "clear the runway",
   "collecting interest",
   "chaos has enough hobbies",
   "no ceremony",
   "you're up",
   "you’re up",
   "starts now",
   "time to switch over",
   "get it handled",
   "use this window well",
   "keep the transition clean",
   "make the handoff clean",
   "this is a good time to begin",
   "keep the next step simple",
   "you've got the space for this now",
   "you’ve got the space for this now",
   "get into it",
   "future-you",
   "scheduled reminder is due now",
   "reminder set",
   "stay on track",
   "before your morning unfolds",
   "scheduled in",
   "notification phase",
   "priority level",
   "deterministic engine",
];

function cleanInline(value: unknown, limit: number) {
   return String(value ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
}

function normalized(value: string) {
   return value.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
}

function localClockLabel(timestamp: number) {
   const date = new Date(timestamp);
   const hours = date.getHours();
   const minutes = date.getMinutes();
   const suffix = hours >= 12 ? "PM" : "AM";
   const hour = hours % 12 || 12;
   return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function localTimeOfDay(timestamp: number): NotificationCopyContext["timeOfDay"] {
   const hour = new Date(timestamp).getHours();
   if (hour < 5 || hour >= 22) return "night";
   if (hour < 12) return "morning";
   if (hour < 17) return "afternoon";
   return "evening";
}

/**
 * This context contains schedule truth that has already been resolved by
 * ALLEVIN. The LLM may phrase these facts, but it never discovers the next
 * event, calculates a gap, or decides whether the reminder is PREP or START.
 */
export function createNotificationCopyContext({
   id,
   occurrenceKey,
   title,
   reason,
   category,
   phase,
   tone,
   priority,
   leadMinutes,
   startAt,
   endAt,
   timelineId,
   timeline,
}: {
   id: string;
   occurrenceKey: string;
   title: string;
   reason?: string;
   category: string;
   phase: NotificationCopyPhase;
   tone: AllevinTone;
   priority: 1 | 2 | 3 | 4 | 5;
   leadMinutes: number;
   startAt: number;
   endAt: number;
   timelineId: string;
   timeline: NotificationTimelineItem[];
}): NotificationCopyContext {
   const safeTitle = cleanInline(title, 160) || "This item";
   const next = [...timeline]
      .filter((item) => item.id !== timelineId && item.startAt > startAt + 60_000 && normalized(item.title) !== normalized(safeTitle))
      .sort((left, right) => left.startAt - right.startAt)
      .find((item) => item.startAt - startAt <= 6 * 60 * 60 * 1000);
   const previous = [...timeline]
      .filter((item) => item.id !== timelineId && item.endAt <= startAt && normalized(item.title) !== normalized(safeTitle))
      .sort((left, right) => right.endAt - left.endAt)
      .find((item) => startAt - item.endAt <= 6 * 60 * 60 * 1000);

   return {
      id: cleanInline(id, 320),
      occurrenceKey: cleanInline(occurrenceKey, 360),
      title: safeTitle,
      reason: cleanInline(reason, 220) || undefined,
      category: cleanInline(category, 80) || "general",
      phase,
      tone,
      priority,
      leadMinutes: Math.max(0, Math.min(60, Math.round(leadMinutes || 0))),
      durationMinutes: Math.max(0, Math.min(1440, Math.round((endAt - startAt) / 60_000))),
      startsAtLabel: localClockLabel(startAt),
      endsAtLabel: localClockLabel(endAt),
      timeOfDay: localTimeOfDay(startAt),
      previous: previous
         ? {
              title: cleanInline(previous.title, 160),
              category: cleanInline(previous.category, 80) || "general",
              endedAtLabel: localClockLabel(previous.endAt),
              minutesBeforeCurrent: Math.max(0, Math.round((startAt - previous.endAt) / 60_000)),
           }
         : undefined,
      next: next
         ? {
              title: cleanInline(next.title, 160),
              category: cleanInline(next.category, 80) || "general",
              startsAtLabel: localClockLabel(next.startAt),
              startsInMinutes: Math.max(1, Math.round((next.startAt - startAt) / 60_000)),
              minutesFromCurrentEnd: Math.round((next.startAt - endAt) / 60_000),
           }
         : undefined,
   };
}

export function notificationCopyCacheKey(context: NotificationCopyContext) {
   const raw = JSON.stringify({
      occurrenceKey: context.occurrenceKey,
      title: context.title,
      reason: context.reason,
      category: context.category,
      phase: context.phase,
      tone: context.tone,
      priority: context.priority,
      leadMinutes: context.leadMinutes,
      durationMinutes: context.durationMinutes,
      startsAtLabel: context.startsAtLabel,
      endsAtLabel: context.endsAtLabel,
      timeOfDay: context.timeOfDay,
      previous: context.previous,
      next: context.next,
   });
   let hash = 2166136261;
   for (const char of raw) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
   }
   return `notification-copy-${(hash >>> 0).toString(36)}`;
}

/**
 * Models are treated as untrusted phrasing helpers. Copy that is too long,
 * repeats the visible title, or falls back into robotic ALLEVIN-era clichés is
 * rejected before it can enter the push plan.
 */
export function validateNotificationBody(value: unknown, context: NotificationCopyContext) {
   const body = cleanInline(value, 240);
   if (body.length < 18 || body.length > 220) return null;
   const lower = body.toLowerCase().replace(/[’]/g, "'");
   if (DISALLOWED_COPY.some((phrase) => lower.includes(phrase))) return null;
   if (/\b(?:you(?:'ve| have) got|there(?:'s| is)|about)\b[^.!?]{0,35}\b(?:for this task|for this reminder|to do this)\b/i.test(lower)) return null;
   if (/\b(?:this task|this reminder)\b/i.test(lower)) return null;
   const currentTitle = normalized(context.title);
   if (currentTitle.length >= 4 && normalized(body).includes(currentTitle)) return null;
   if (
      context.next &&
      context.next.startsInMinutes >= 60 &&
      /\b(?:6[0-9]|[7-9][0-9]|[1-9][0-9]{2,})\s+minutes?\b/i.test(body)
   ) return null;
   if ((body.match(/[.!?]/g) || []).length > 2) return null;
   if (/^[#*\-]|```|\b(?:phase|priority|schedule engine)\b/i.test(body)) return null;
   return body;
}
