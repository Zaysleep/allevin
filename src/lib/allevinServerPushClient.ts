"use client";

import { buildRhythmForDate, localDateKey, minutesFromClock, readDailyRhythm, type RhythmEntry } from "@/lib/dailyRhythm";
import { getProactiveRecommendation, type RecommendationCategory } from "@/lib/allevinRecommendations";
import { readAllevinTone, type AllevinTone } from "@/lib/allevinVoice";
import { readLifeState } from "@/lib/lifeStore";
import type { LifeImportance, LifeItem } from "@/lib/lifeTypes";

export const SERVER_PUSH_ACTIVE_KEY = "allevin-server-push-active-v1";
const DEVICE_ID_KEY = "allevin-push-device-id-v1";
const HORIZON_HOURS = 48;

type ReminderPhase = "prep" | "start";
type ReminderPriority = 1 | 2 | 3 | 4 | 5;

interface PushPlanJob {
   id: string;
   deviceId: string;
   dueAt: number;
   title: string;
   body: string;
   tag: string;
   url: string;
   entryId?: string;
   phase: ReminderPhase;
   priority: ReminderPriority;
}

function randomId() {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
   return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function deviceId() {
   let value = window.localStorage.getItem(DEVICE_ID_KEY);
   if (!value) {
      value = randomId();
      window.localStorage.setItem(DEVICE_ID_KEY, value);
   }
   return value;
}

function base64UrlToUint8Array(value: string) {
   const padding = "=".repeat((4 - (value.length % 4)) % 4);
   const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
   const raw = window.atob(base64);
   return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function categoryForEntry(entry: RhythmEntry): RecommendationCategory {
   const title = entry.title.toLowerCase();
   if (entry.category === "exercise" || /gym|workout|run|cardio|strength|lift|mobility/.test(title)) return "workout";
   if (entry.category === "meal" && /breakfast|coffee|morning/.test(title)) return "breakfast";
   if (/commute|leave|travel|prep|get ready|hygiene|shower/.test(title)) return "transition";
   if (entry.category === "work" || entry.category === "school") return "focus";
   return "general";
}

function clampPriority(value: number): ReminderPriority {
   return Math.max(1, Math.min(5, Math.round(value))) as ReminderPriority;
}

/**
 * Reminder priority is deliberately deterministic. It controls *when* the prep
 * reminder arrives, not whether ALLEVIN decides the user's life is important.
 * Exact commitments and hard schedule transitions score higher; low-importance
 * items score lower. The user-facing schedule remains authoritative.
 */
function rateRhythmEntry(entry: RhythmEntry): ReminderPriority {
   let score = 2;
   if (entry.kind === "schedule") score = 4;
   if (entry.category === "exercise") score = 3;
   if (entry.category === "work" || entry.category === "school") score = 4;
   if (/commute|leave|travel/.test(entry.title.toLowerCase())) score = 4;
   return clampPriority(score);
}

function rateLifeItem(item: LifeItem): ReminderPriority {
   let score = item.kind === "commitment" ? 4 : 3;
   const importanceShift: Record<LifeImportance, number> = { low: -1, normal: 0, high: 1 };
   score += importanceShift[item.importance];
   if (item.timingPrecision !== "exact") score -= 1;
   return clampPriority(score);
}

function prepLeadMinutes(priority: ReminderPriority) {
   return ({ 1: 5, 2: 10, 3: 15, 4: 20, 5: 30 } as const)[priority];
}

function stablePick(lines: string[], seed: string) {
   const total = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
   return lines[total % lines.length];
}

function prepCopy(title: string, lead: number, tone: AllevinTone, priority: ReminderPriority, seed: string) {
   if (tone === "calm") return `${title} starts in ${lead} minutes. Get what you need ready so the transition stays easy.`;
   if (tone === "balanced") return `${title} in ${lead} minutes. Get set now so you can start on time.`;

   const lines = priority >= 4
      ? [
           `${title} in ${lead}. Clear the runway now; scrambling is a terrible hobby.`,
           `${lead} minutes until ${title}. Get what you need lined up before the clock starts collecting interest.`,
        ]
      : [
           `${title} in ${lead}. Get set now and spare future-you the stupid little scramble.`,
           `${lead} minutes until ${title}. Line it up now; chaos has enough hobbies already.`,
        ];
   return stablePick(lines, seed);
}

function startCopy(title: string, tone: AllevinTone, priority: ReminderPriority, seed: string, recommendation?: string) {
   const focus = recommendation ? ` ${recommendation}` : "";
   if (tone === "calm") return `${title} starts now.${focus} Give it the space it needs.`;
   if (tone === "balanced") return `${title} starts now.${focus} Time to switch over.`;

   const lines = priority >= 4
      ? [
           `${title}. Time to move.${focus} This one deserves the lane—give it your attention and get back out.`,
           `${title} starts now.${focus} Clock's done negotiating. Handle the thing that matters.`,
        ]
      : [
           `${title}. You're up.${focus} Get it handled before the calendar starts freelancing.`,
           `${title} starts now.${focus} No ceremony. Do the useful thing and keep moving.`,
        ];
   return stablePick(lines, seed);
}

function timestampForClock(date: Date, clock: string) {
   const target = new Date(date);
   const minutes = minutesFromClock(clock);
   target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
   return target.getTime();
}

function shouldScheduleRhythm(entry: RhythmEntry, dateKey: string) {
   if (entry.completed || entry.skipped) return false;
   const rhythm = readDailyRhythm();
   if (!rhythm.remindersEnabled) return false;
   if (entry.kind === "schedule") return true;
   const anchor = rhythm.anchors.find((candidate) => candidate.id === entry.sourceId);
   const temporary = (rhythm.temporaryEntries[dateKey] || []).find((candidate) => candidate.id === entry.sourceId);
   return anchor?.reminder ?? Boolean(temporary);
}

function recommendationForEntry(entry: RhythmEntry, dateKey: string) {
   const recommendation = getProactiveRecommendation(
      `${dateKey}:${entry.id}`,
      categoryForEntry(entry),
      Math.max(5, entry.durationMinutes || 30),
      entry.title,
   );
   return recommendation?.title;
}

function addTwoPhaseJobs({
   jobs,
   device,
   sourceId,
   dateKey,
   startAt,
   title,
   priority,
   tone,
   recommendation,
   includePrep,
}: {
   jobs: PushPlanJob[];
   device: string;
   sourceId: string;
   dateKey: string;
   startAt: number;
   title: string;
   priority: ReminderPriority;
   tone: AllevinTone;
   recommendation?: string;
   includePrep?: boolean;
}) {
   const lead = prepLeadMinutes(priority);
   const prepAt = startAt - lead * 60_000;
   const now = Date.now();

   // Exactly two phases exist by design: one preparation reminder and one at
   // the scheduled start. A parent schedule may omit its prep phase when an
   // explicit transition routine already ends at that exact start time; that
   // avoids two notifications describing the same transition in the same minute.
   if (includePrep !== false && prepAt > now + 5_000) {
      jobs.push({
         id: `${device}:${dateKey}:${sourceId}:prep:${startAt}`,
         deviceId: device,
         dueAt: prepAt,
         title,
         body: prepCopy(title, lead, tone, priority, `${dateKey}:${sourceId}:prep`),
         tag: `allevin-${dateKey}-${sourceId}-prep`,
         url: "/",
         entryId: sourceId,
         phase: "prep",
         priority,
      });
   }

   if (startAt > now + 5_000) {
      jobs.push({
         id: `${device}:${dateKey}:${sourceId}:start:${startAt}`,
         deviceId: device,
         dueAt: startAt,
         title,
         body: startCopy(title, tone, priority, `${dateKey}:${sourceId}:start`, recommendation),
         tag: `allevin-${dateKey}-${sourceId}-start`,
         url: "/",
         entryId: sourceId,
         phase: "start",
         priority,
      });
   }
}


function hasExplicitTransitionInto(schedule: RhythmEntry, entries: RhythmEntry[]) {
   if (schedule.kind !== "schedule") return false;
   const scheduleStart = minutesFromClock(schedule.time);

   return entries.some((entry) => {
      if (entry.id === schedule.id || entry.completed || entry.skipped || entry.kind === "schedule") return false;
      const end = minutesFromClock(entry.time) + Math.max(0, entry.durationMinutes || 0);
      return Math.abs(end - scheduleStart) <= 2;
   });
}

function buildPushPlan(device: string) {
   const rhythm = readDailyRhythm();
   if (!rhythm.remindersEnabled) return [] as PushPlanJob[];

   const tone = readAllevinTone();
   const now = new Date();
   const horizon = Date.now() + HORIZON_HOURS * 60 * 60 * 1000;
   const jobs: PushPlanJob[] = [];

   for (let offset = 0; offset <= 2; offset += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      date.setHours(12, 0, 0, 0);
      const dateKey = localDateKey(date);

      const entries = buildRhythmForDate(rhythm, date);
      for (const entry of entries) {
         if (!shouldScheduleRhythm(entry, dateKey)) continue;
         const startAt = timestampForClock(date, entry.time);
         if (startAt > horizon) continue;
         const priority = rateRhythmEntry(entry);
         addTwoPhaseJobs({
            jobs,
            device,
            sourceId: entry.id,
            dateKey,
            startAt,
            title: entry.title,
            priority,
            tone,
            recommendation: recommendationForEntry(entry, dateKey),
            includePrep: !hasExplicitTransitionInto(entry, entries),
         });
      }
   }

   for (const item of readLifeState().items) {
      if (
         item.state !== "active" ||
         (item.kind !== "commitment" && item.kind !== "task") ||
         item.allDay ||
         item.timingPrecision !== "exact"
      ) continue;
      const startAt = item.startAt || item.dueAt;
      if (!startAt || startAt <= Date.now() + 5_000 || startAt > horizon) continue;
      const date = new Date(startAt);
      const dateKey = localDateKey(date);
      addTwoPhaseJobs({
         jobs,
         device,
         sourceId: `life:${item.id}`,
         dateKey,
         startAt,
         title: item.title,
         priority: rateLifeItem(item),
         tone,
      });
   }

   return jobs.sort((a, b) => a.dueAt - b.dueAt).slice(0, 160);
}

async function registerPushServiceWorker() {
   const registration = await navigator.serviceWorker.register("/allevin-sw.js?v=mkxii9-server-push", {
      scope: "/",
      updateViaCache: "none",
   });
   await registration.update();
   return registration;
}

async function ensurePushSubscription() {
   const publicKey = process.env.NEXT_PUBLIC_ALLEVIN_VAPID_PUBLIC_KEY;
   if (!publicKey) throw new Error("VAPID public key is missing.");
   const registration = await registerPushServiceWorker();

   const existing = await registration.pushManager.getSubscription();
   if (existing) return existing;

   return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
   });
}

export async function syncServerNotificationSchedule() {
   if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
   if (!("Notification" in window) || Notification.permission !== "granted") return false;

   try {
      const subscription = await ensurePushSubscription();
      const device = deviceId();
      const jobs = buildPushPlan(device);
      const response = await fetch("/api/allevin/push/sync", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ deviceId: device, subscription: subscription.toJSON(), jobs }),
      });

      if (!response.ok) throw new Error(`Push sync failed (${response.status}).`);
      window.localStorage.setItem(SERVER_PUSH_ACTIVE_KEY, "true");
      return true;
   } catch {
      window.localStorage.removeItem(SERVER_PUSH_ACTIVE_KEY);
      return false;
   }
}

export function serverPushIsActive() {
   return typeof window !== "undefined" && window.localStorage.getItem(SERVER_PUSH_ACTIVE_KEY) === "true";
}
