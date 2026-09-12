"use client";

import { buildRhythmForDate, localDateKey, minutesFromClock, readDailyRhythm, type RhythmEntry } from "@/lib/dailyRhythm";
import type { NotificationCopyContext } from "@/lib/allevinNotificationCopy";
import { prepareNotificationBodies } from "@/lib/allevinNotificationCopyClient";
import {
   buildNotificationTimeline,
   lifeNotificationContext,
   rhythmNotificationContext,
   timestampForLocalClock,
} from "@/lib/allevinNotificationScheduleContext";
import { readAllevinTone } from "@/lib/allevinVoice";
import { lifeOccurrencesBetween, readLifeState } from "@/lib/lifeStore";
import type { LifeImportance, LifeItem } from "@/lib/lifeTypes";

export const SERVER_PUSH_ACTIVE_KEY = "allevin-server-push-active-v1";
export const ALLEVIN_PUSH_DEVICE_ID_KEY = "allevin-push-device-id-v1";
const HORIZON_HOURS = 48;
const RECURRING_HORIZON_DAYS = 40;
let copyRetryTimer: number | undefined;
let copyRetryAttempts = 0;

type ReminderPhase = "checkpoint" | "start";
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
   actionTarget?: { source: "rhythm" | "life"; id: string; dateKey: string };
   copyContext: NotificationCopyContext;
}

function randomId() {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
   return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function deviceId() {
   let value = window.localStorage.getItem(ALLEVIN_PUSH_DEVICE_ID_KEY);
   if (!value) {
      value = randomId();
      window.localStorage.setItem(ALLEVIN_PUSH_DEVICE_ID_KEY, value);
   }
   return value;
}

function base64UrlToUint8Array(value: string) {
   const padding = "=".repeat((4 - (value.length % 4)) % 4);
   const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
   const raw = window.atob(base64);
   return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function clampPriority(value: number): ReminderPriority {
   return Math.max(1, Math.min(5, Math.round(value))) as ReminderPriority;
}

/**
 * Reminder priority is deliberately deterministic. It controls *when* the checkpoint
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

function checkpointLeadMinutes(priority: ReminderPriority) {
   return ({ 1: 5, 2: 5, 3: 10, 4: 10, 5: 15 } as const)[priority];
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

function addEventJobs({
   jobs,
   device,
   sourceId,
   dateKey,
   startAt,
   title,
   priority,
   buildCopyContext,
   includeCheckpoint,
   actionTarget,
}: {
   jobs: PushPlanJob[];
   device: string;
   sourceId: string;
   dateKey: string;
   startAt: number;
   title: string;
   priority: ReminderPriority;
   buildCopyContext: (id: string, phase: ReminderPhase, leadMinutes: number) => NotificationCopyContext;
   includeCheckpoint?: boolean;
   actionTarget?: PushPlanJob["actionTarget"];
}) {
   const lead = checkpointLeadMinutes(priority);
   const checkpointAt = startAt - lead * 60_000;
   const now = Date.now();

   // A meaningful event receives one live checkpoint and one start notice.
   // A parent schedule may omit its checkpoint when an
   // explicit transition routine already ends at that exact start time; that
   // avoids two notifications describing the same transition in the same minute.
   if (includeCheckpoint !== false && checkpointAt > now + 5_000) {
      const id = `${device}:${dateKey}:${sourceId}:checkpoint:${startAt}`;
      const copyContext = buildCopyContext(id, "checkpoint", lead);
      jobs.push({
         id,
         deviceId: device,
         dueAt: checkpointAt,
         title,
         body: "",
         tag: `allevin-${dateKey}-${sourceId}-checkpoint`,
         url: `/?allevinCheckpoint=1&source=${actionTarget?.source || ""}&id=${encodeURIComponent(actionTarget?.id || sourceId)}&date=${dateKey}&title=${encodeURIComponent(title.slice(0, 80))}`,
         entryId: sourceId,
         phase: "checkpoint",
         priority,
         actionTarget,
         copyContext,
      });
   }

   if (startAt > now + 5_000) {
      const id = `${device}:${dateKey}:${sourceId}:start:${startAt}`;
      const copyContext = buildCopyContext(id, "start", lead);
      jobs.push({
         id,
         deviceId: device,
         dueAt: startAt,
         title,
         body: "",
         tag: `allevin-${dateKey}-${sourceId}-start`,
         url: `/?allevinEvent=1&source=${actionTarget?.source || ""}&id=${encodeURIComponent(actionTarget?.id || sourceId)}&date=${dateKey}&title=${encodeURIComponent(title.slice(0, 80))}`,
         entryId: sourceId,
         phase: "start",
         priority,
         actionTarget,
         copyContext,
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
   const lifeItems = readLifeState().items;
   const timelineByDate = new Map<string, ReturnType<typeof buildNotificationTimeline>>();

   for (let offset = 0; offset <= 2; offset += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      date.setHours(12, 0, 0, 0);
      const dateKey = localDateKey(date);

      const entries = buildRhythmForDate(rhythm, date);
      const timeline = buildNotificationTimeline(date, entries, lifeItems);
      timelineByDate.set(dateKey, timeline);
      for (const entry of entries) {
         if (!shouldScheduleRhythm(entry, dateKey)) continue;
         const startAt = timestampForLocalClock(date, entry.time);
         if (startAt > horizon) continue;
         const priority = rateRhythmEntry(entry);
         addEventJobs({
            jobs,
            device,
            sourceId: entry.id,
            dateKey,
            startAt,
            title: entry.title,
            priority,
            buildCopyContext: (id, phase, leadMinutes) => rhythmNotificationContext({ id, entry, date, phase, tone, priority, leadMinutes, timeline }),
            includeCheckpoint: !hasExplicitTransitionInto(entry, entries),
            actionTarget: entry.kind === "anchor"
               ? { source: "rhythm", id: entry.sourceId, dateKey }
               : undefined,
         });
      }
   }

   for (const item of lifeItems) {
      if (
         item.state !== "active" ||
         (item.kind !== "commitment" && item.kind !== "task" && !(item.kind === "routine" && item.recurrence !== "none")) ||
         item.allDay ||
         item.timingPrecision !== "exact"
      ) continue;
      const itemHorizon = item.recurrence !== "none" && item.recurrence !== "interval"
         ? Date.now() + RECURRING_HORIZON_DAYS * 24 * 60 * 60 * 1000
         : horizon;
      const occurrences = lifeOccurrencesBetween(item, Date.now() + 5_000, itemHorizon);
      for (const startAt of occurrences) {
         const date = new Date(startAt);
         const dateKey = localDateKey(date);
         const timeline = timelineByDate.get(dateKey) || buildNotificationTimeline(date, buildRhythmForDate(rhythm, date), lifeItems);
         const priority = rateLifeItem(item);
         addEventJobs({
            jobs,
            device,
            sourceId: `life:${item.id}`,
            dateKey,
            startAt,
            title: item.title,
            priority,
            buildCopyContext: (id, phase, leadMinutes) => lifeNotificationContext({ id, item, phase, tone, priority, leadMinutes, timeline, occurrenceAt: startAt }),
            // A repeated care nudge should remain one notification per
            // occurrence, not turn into a checkpoint/start avalanche.
            includeCheckpoint: item.recurrence !== "none" ? false : undefined,
            actionTarget: { source: "life", id: item.id, dateKey },
         });
      }
   }

   return jobs.sort((a, b) => a.dueAt - b.dueAt).slice(0, 160);
}

async function registerPushServiceWorker() {
   const registration = await navigator.serviceWorker.register("/allevin-sw.js?v=mkxxiii-context-follow-through-2", {
      scope: "/",
      updateViaCache: "none",
   });
   await registration.update();
   return registration;
}

function queueCopyRetry() {
   if (copyRetryTimer !== undefined || copyRetryAttempts >= 3) return;
   copyRetryAttempts += 1;
   copyRetryTimer = window.setTimeout(() => {
      copyRetryTimer = undefined;
      void syncServerNotificationSchedule();
   }, 20_000);
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
      const device = deviceId();
      const jobs = buildPushPlan(device);
      const copies = await prepareNotificationBodies(jobs.map((job) => job.copyContext));
      const preparedJobs = jobs.flatMap(({ copyContext, ...job }) => {
         const copy = copies.get(copyContext.id);
         return copy ? [{ ...job, title: copy.title, body: copy.body }] : [];
      });
      if (preparedJobs.length < jobs.length) queueCopyRetry();
      else {
         copyRetryAttempts = 0;
         if (copyRetryTimer !== undefined) {
            window.clearTimeout(copyRetryTimer);
            copyRetryTimer = undefined;
         }
      }
      const subscription = await ensurePushSubscription();
      const response = await fetch("/api/allevin/push/sync", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ deviceId: device, subscription: subscription.toJSON(), jobs: preparedJobs }),
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
