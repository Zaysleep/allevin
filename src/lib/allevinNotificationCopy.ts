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
   startsInMinutes: number;
   minutesFromCurrentEnd: number;
}

export interface NotificationCopyContext {
   id: string;
   occurrenceKey: string;
   title: string;
   category: string;
   phase: NotificationCopyPhase;
   tone: AllevinTone;
   priority: 1 | 2 | 3 | 4 | 5;
   leadMinutes: number;
   durationMinutes: number;
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
   "future-you",
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

function minuteLabel(minutes: number) {
   return Math.max(1, Math.round(minutes));
}

function stableIndex(seed: string, length: number) {
   const total = [...seed].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
   return length ? total % length : 0;
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

   return {
      id: cleanInline(id, 320),
      occurrenceKey: cleanInline(occurrenceKey, 360),
      title: safeTitle,
      category: cleanInline(category, 80) || "general",
      phase,
      tone,
      priority,
      leadMinutes: Math.max(0, Math.min(60, Math.round(leadMinutes || 0))),
      durationMinutes: Math.max(0, Math.min(1440, Math.round((endAt - startAt) / 60_000))),
      next: next
         ? {
              title: cleanInline(next.title, 160),
              category: cleanInline(next.category, 80) || "general",
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
      category: context.category,
      phase: context.phase,
      tone: context.tone,
      priority: context.priority,
      leadMinutes: context.leadMinutes,
      durationMinutes: context.durationMinutes,
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
   const currentTitle = normalized(context.title);
   if (currentTitle.length >= 4 && normalized(body).includes(currentTitle)) return null;
   if ((body.match(/[.!?]/g) || []).length > 2) return null;
   if (/^[#*\-]|```|\b(?:phase|priority|schedule engine)\b/i.test(body)) return null;
   return body;
}

export function fallbackNotificationBody(context: NotificationCopyContext) {
   const lead = minuteLabel(context.leadMinutes);
   let lines: string[];

   if (context.phase === "prep") {
      if (context.tone === "direct") {
         lines = [
            `You’ve got ${lead} minutes. Finish where you are and get yourself set.`,
            `About ${lead} minutes to go. Wrap this up and make the handoff clean.`,
         ];
      } else if (context.tone === "calm") {
         lines = [
            `There are about ${lead} minutes to go. Bring this to a stopping point and move over when you’re ready.`,
            `You have ${lead} minutes. Finish where you are, then ease into the next part of your day.`,
         ];
      } else {
         lines = [
            `You’ve got ${lead} minutes. Wrap up what you’re doing and give yourself an easy transition.`,
            `This is your heads-up: about ${lead} minutes. Finish where you are, then ease into it.`,
         ];
      }
   } else if (context.next && context.next.minutesFromCurrentEnd <= 5) {
      lines = context.tone === "direct"
         ? [
              `${context.next.title} is close behind. Keep this focused and make the handoff clean.`,
              `${context.next.title} comes right after this. Use the window well and leave yourself room to move.`,
           ]
         : context.tone === "calm"
           ? [
                `${context.next.title} follows closely. Keep this simple and leave yourself a comfortable transition.`,
                `${context.next.title} is not far behind. Take this one step at a time and protect the handoff.`,
             ]
           : [
                `${context.next.title} comes right after this. Keep it simple and leave yourself an easy handoff.`,
                `${context.next.title} is close behind. Settle into this, but keep a little room for what follows.`,
             ];
   } else if (context.next && context.next.startsInMinutes <= 180) {
      lines = context.tone === "direct"
         ? [
              `${context.next.title} is coming up in ${minuteLabel(context.next.startsInMinutes)} minutes. Use this window well and keep the transition clean.`,
              `There’s room before ${context.next.title}. Get into this now and leave yourself a clean exit.`,
           ]
         : context.tone === "calm"
           ? [
                `You have some room before ${context.next.title}. Settle into this without rushing.`,
                `${context.next.title} comes later. For now, take this one step at a time.`,
             ]
           : [
                `You’ve got some breathing room before ${context.next.title}. Settle into this without rushing.`,
                `${context.next.title} is coming up later. There’s enough room to give this your attention now.`,
             ];
   } else {
      lines = context.tone === "direct"
         ? ["This is a good time to begin. Get into it and keep the next step simple.", "You’ve got the space for this now. Start clean and take it from there."]
         : context.tone === "calm"
           ? ["This is a good time to begin. Ease into it and take the next step from there.", "There is room for this now. Start gently and stay with the first step."]
           : ["This is a good time to begin. Ease into it and keep the next step simple.", "You have room for this now. Settle in and take it one step at a time."];
   }

   return lines[stableIndex(notificationCopyCacheKey(context), lines.length)];
}
