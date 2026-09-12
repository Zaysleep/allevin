// ========================================
// ALLEVIN MK XII.8 — PWA Notification Orchestrator
// Purpose:
// Turn the *adapted* day into useful notification copy.
//
// Important boundary:
// This browser checker is dependable while the PWA is running. The service
// worker also understands real Web Push payloads so a production push scheduler
// can wake the installed PWA later without changing notification semantics.
// ========================================

import {
   buildRhythmForDate,
   localDateKey,
   minutesFromClock,
   readDailyRhythm,
   type RhythmEntry,
} from "@/lib/dailyRhythm";
import { notificationCopyFromCache, prepareNotificationBodies } from "@/lib/allevinNotificationCopyClient";
import { createNotificationCopyContext, type NotificationCopyContext } from "@/lib/allevinNotificationCopy";
import {
   buildNotificationTimeline,
   lifeNotificationContext,
   rhythmNotificationContext,
   timedLifeItemsForDate,
} from "@/lib/allevinNotificationScheduleContext";
import { readAllevinTone } from "@/lib/allevinVoice";
import { readLifeState } from "@/lib/lifeStore";
import type { LifeItem, LifeImportance } from "@/lib/lifeTypes";
import { serverPushIsActive } from "@/lib/allevinServerPushClient";

const NOTIFICATION_LOG_KEY = "allevin-notification-log-mkxii-3";
const SERVICE_WORKER_URL = "/allevin-sw.js?v=mkxxiii-context-follow-through-2";
let reminderCheckRunning = false;
type ReminderPriority = 1 | 2 | 3 | 4 | 5;

function canNotify() {
   return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

function readLog() {
   if (typeof window === "undefined") return new Set<string>();
   try {
      return new Set<string>(JSON.parse(window.localStorage.getItem(NOTIFICATION_LOG_KEY) || "[]"));
   } catch {
      return new Set<string>();
   }
}

function saveLog(log: Set<string>) {
   window.localStorage.setItem(NOTIFICATION_LOG_KEY, JSON.stringify([...log].slice(-500)));
}

export async function registerAllevinServiceWorker() {
   if (!canNotify()) return null;

   try {
      // updateViaCache:"none" avoids a stale service worker winning after a
      // deployment—the exact problem that can make a phone look one build behind.
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
         scope: "/",
         updateViaCache: "none",
      });
      await registration.update();
      return registration;
   } catch {
      return null;
   }
}

export async function enableAllevinNotifications() {
   if (!canNotify()) return "unsupported" as const;
   const permission = await Notification.requestPermission();
   if (permission !== "granted") return permission;
   await registerAllevinServiceWorker();
   return "granted" as const;
}

async function showNotification(title: string, body: string, tag: string, entryId?: string, url = "/") {
   if (!canNotify() || Notification.permission !== "granted") return;
   const registration = await navigator.serviceWorker.ready;

   await registration.showNotification(title, {
      body,
      tag,
      icon: "/allevin-icon-192.png",
      badge: "/allevin-icon-192.png",
      data: { url, entryId },
   });
}

/**
 * Sends a real, model-phrased local notification from Settings. The user picks
 * the subject, so this checks the same contextual-copy path as an ordinary
 * reminder without adding a fake calendar item or waiting for the scheduler.
 */
export async function sendAllevinTestNotification(subject: string) {
   const title = subject.replace(/\s+/g, " ").trim().slice(0, 120);
   if (!title || !canNotify() || Notification.permission !== "granted") return false;

   const now = Date.now();
   const id = `settings-test-${now}`;
   const context = createNotificationCopyContext({
      id,
      occurrenceKey: id,
      title,
      category: "personal",
      phase: "start",
      tone: readAllevinTone(),
      priority: 3,
      leadMinutes: 0,
      startAt: now,
      endAt: now + 30 * 60_000,
      timelineId: id,
      timeline: [],
   });
   const copy = notificationCopyFromCache(context) || (await prepareNotificationBodies([context])).get(context.id);
   if (!copy) return false;
   await showNotification(copy.title, copy.body, `allevin-settings-test-${now}`);
   return true;
}

async function showContextualNotification(
   context: NotificationCopyContext,
   title: string,
   tag: string,
   entryId?: string,
   url = "/",
) {
   const copy = notificationCopyFromCache(context) || (await prepareNotificationBodies([context])).get(context.id);
   if (!copy) return false;
   await showNotification(copy.title, copy.body, tag, entryId, url);
   return true;
}

function localReminderPriorityForEntry(entry: RhythmEntry): ReminderPriority {
   let score = 2;
   if (entry.kind === "schedule") score = 4;
   if (entry.category === "exercise") score = 3;
   if (entry.category === "work" || entry.category === "school") score = 4;
   if (/commute|leave|travel/.test(entry.title.toLowerCase())) score = 4;
   return Math.max(1, Math.min(5, score)) as ReminderPriority;
}

function localReminderPriorityForLife(item: LifeItem): ReminderPriority {
   let score = item.kind === "commitment" ? 4 : 3;
   const shift: Record<LifeImportance, number> = { low: -1, normal: 0, high: 1 };
   score += shift[item.importance];
   if (item.timingPrecision !== "exact") score -= 1;
   return Math.max(1, Math.min(5, score)) as ReminderPriority;
}

function leadMinutesForPriority(priority: number) {
   if (priority >= 5) return 15;
   if (priority >= 3) return 10;
   if (priority === 2) return 5;
   return 5;
}

function eventUrl(kind: "checkpoint" | "start", source: "rhythm" | "life", id: string, dateKey: string, title: string) {
   const query = new URLSearchParams({
      [kind === "checkpoint" ? "allevinCheckpoint" : "allevinEvent"]: "1",
      source,
      id,
      date: dateKey,
      title: title.slice(0, 80),
   });
   return `/?${query.toString()}`;
}

function lifeStartMinutes(item: LifeItem) {
   const timestamp = item.startAt || item.dueAt;
   if (!timestamp) return null;
   const date = new Date(timestamp);
   return date.getHours() * 60 + date.getMinutes();
}

/**
 * Checks the current adapted day. Any routine suppressed/replaced earlier is
 * already absent/skipped in buildRhythmForDate(), so obsolete reminders simply
 * stop existing instead of needing a separate cancellation list.
 */
export async function runRhythmReminderCheck(now = new Date()) {
   if (!canNotify() || Notification.permission !== "granted") return;
   // A successful server-plan sync means the service worker will receive the
   // scheduled Web Push even while the PWA sleeps. Do not also run the local
   // timer path or the user would get duplicate copies.
   if (serverPushIsActive()) return;
   // Focus, visibility, and the 30-second timer can all fire together on iOS.
   // A module-level mutex prevents those overlapping checks from racing and
   // displaying the same notification several times before the log is saved.
   if (reminderCheckRunning) return;
   reminderCheckRunning = true;

   const rhythm = readDailyRhythm();
   try {
      if (!rhythm.remindersEnabled) return;

      const tone = readAllevinTone();
      const key = localDateKey(now);
      const log = readLog();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const entries = buildRhythmForDate(rhythm, now);
      const life = readLifeState();
      const timedItems = timedLifeItemsForDate(life.items, now);
      const timeline = buildNotificationTimeline(now, entries, life.items);

   for (const entry of entries) {
      if (entry.completed || entry.skipped) continue;

      // Hard recurring schedule blocks (Work/Class/etc.) are useful day
      // transitions too. They receive a start notification, but never the
      // accountability follow-up that belongs to user-completable routines.
      if (entry.kind === "schedule") {
         const start = minutesFromClock(entry.time);
         const priority = localReminderPriorityForEntry(entry);
         const lead = leadMinutesForPriority(priority);
         const checkpointAt = start - lead;
         const hasExplicitTransition = entries.some((candidate) => {
            if (candidate.id === entry.id || candidate.kind === "schedule" || candidate.completed || candidate.skipped) return false;
            const candidateEnd = minutesFromClock(candidate.time) + Math.max(0, candidate.durationMinutes || 0);
            return Math.abs(candidateEnd - start) <= 2;
         });
         const checkpointKey = `${key}:${entry.sourceId}:${entry.time}:schedule-checkpoint`;
         if (!hasExplicitTransition && nowMinutes >= checkpointAt && nowMinutes <= checkpointAt + 1 && !log.has(checkpointKey)) {
            const context = rhythmNotificationContext({ id: checkpointKey, entry, date: now, phase: "checkpoint", tone, priority, leadMinutes: lead, timeline });
            if (await showContextualNotification(context, entry.title, `allevin-${key}-${entry.sourceId}-${entry.time}-schedule-checkpoint`, entry.sourceId, eventUrl("checkpoint", "rhythm", entry.sourceId, key, entry.title))) {
               log.add(checkpointKey);
               saveLog(log);
            }
         }

         const scheduleKey = `${key}:${entry.sourceId}:${entry.time}:schedule-start`;
         if (nowMinutes >= start && nowMinutes <= start + 1 && !log.has(scheduleKey)) {
            const context = rhythmNotificationContext({ id: scheduleKey, entry, date: now, phase: "start", tone, priority, leadMinutes: lead, timeline });
            if (await showContextualNotification(context, entry.title, `allevin-${key}-${entry.sourceId}-${entry.time}-schedule`, entry.sourceId, eventUrl("start", "rhythm", entry.sourceId, key, entry.title))) {
               log.add(scheduleKey);
               saveLog(log);
            }
         }
         continue;
      }

      const anchor = rhythm.anchors.find((candidate) => candidate.id === entry.sourceId);
      const temporary = (rhythm.temporaryEntries[key] || []).find((candidate) => candidate.id === entry.sourceId);
      const reminderEnabled = anchor?.reminder ?? Boolean(temporary);
      if (!reminderEnabled) continue;

      const start = minutesFromClock(entry.time);
      // Include the adapted time in the delivery key. If ALLEVIN moves a
      // routine after an earlier reminder, the new occurrence is allowed to
      // notify again instead of being blocked by the stale delivery record.
      const priority = localReminderPriorityForEntry(entry);
      const lead = leadMinutesForPriority(priority);
      const checkpointAt = start - lead;
      const checkpointKey = `${key}:${entry.sourceId}:${entry.time}:checkpoint`;
      if (nowMinutes >= checkpointAt && nowMinutes <= checkpointAt + 1 && !log.has(checkpointKey)) {
         const context = rhythmNotificationContext({ id: checkpointKey, entry, date: now, phase: "checkpoint", tone, priority, leadMinutes: lead, timeline });
         if (await showContextualNotification(context, entry.title, `allevin-${key}-${entry.sourceId}-${entry.time}-checkpoint`, entry.sourceId, eventUrl("checkpoint", "rhythm", entry.sourceId, key, entry.title))) {
            log.add(checkpointKey);
            saveLog(log);
         }
      }

      const startKey = `${key}:${entry.sourceId}:${entry.time}:start`;

      if (nowMinutes >= start && nowMinutes <= start + 1 && !log.has(startKey)) {
         const context = rhythmNotificationContext({ id: startKey, entry, date: now, phase: "start", tone, priority, leadMinutes: lead, timeline });
         if (await showContextualNotification(context, entry.title, `allevin-${key}-${entry.sourceId}-${entry.time}-start`, entry.sourceId, eventUrl("start", "rhythm", entry.sourceId, key, entry.title))) {
            log.add(startKey);
            saveLog(log);
         }
      }

   }

   // One-off commitments (dinner, dentist, meetings, etc.) deserve the same
   // day-aware notification treatment as recurring routines.
   for (const item of timedItems) {
      const start = lifeStartMinutes(item);
      if (start === null) continue;

      const priority = localReminderPriorityForLife(item);
      const lead = leadMinutesForPriority(priority);
      const checkpointAt = start - lead;
      const occurrenceAt = item.startAt || item.dueAt || 0;
      const checkpointKey = `${key}:life:${item.id}:${occurrenceAt}:checkpoint`;
      if (item.recurrence === "none" && nowMinutes >= checkpointAt && nowMinutes <= checkpointAt + 1 && !log.has(checkpointKey)) {
         const context = lifeNotificationContext({ id: checkpointKey, item, phase: "checkpoint", tone, priority, leadMinutes: lead, timeline });
         if (await showContextualNotification(context, item.title, `allevin-${key}-life-${item.id}-checkpoint`, item.id, eventUrl("checkpoint", "life", item.id, key, item.title))) {
            log.add(checkpointKey);
            saveLog(log);
         }
      }

      const eventKey = `${key}:life:${item.id}:${occurrenceAt}:start`;
      if (nowMinutes >= start && nowMinutes <= start + 1 && !log.has(eventKey)) {
         const context = lifeNotificationContext({ id: eventKey, item, phase: "start", tone, priority, leadMinutes: lead, timeline });
         if (await showContextualNotification(context, item.title, `allevin-${key}-life-${item.id}-start`, item.id, eventUrl("start", "life", item.id, key, item.title))) {
            log.add(eventKey);
            saveLog(log);
         }
      }
   }

   // Notifications are intentionally limited to a live checkpoint and exact
   // start. No automatic
   // accountability or generic evening-reset push is emitted here.
      saveLog(log);
   } finally {
      reminderCheckRunning = false;
   }
}
