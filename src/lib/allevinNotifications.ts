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
import { getProactiveRecommendation, type RecommendationCategory } from "@/lib/allevinRecommendations";
import { readAllevinTone, rhythmVoice, type AllevinTone } from "@/lib/allevinVoice";
import { readLifeState } from "@/lib/lifeStore";
import type { LifeItem } from "@/lib/lifeTypes";

const NOTIFICATION_LOG_KEY = "allevin-notification-log-mkxii-3";
const SERVICE_WORKER_URL = "/allevin-sw.js?v=mkxii8-personal-alpha";

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

async function showNotification(title: string, body: string, tag: string, entryId?: string) {
   if (!canNotify() || Notification.permission !== "granted") return;
   const registration = await navigator.serviceWorker.ready;

   await registration.showNotification(title, {
      body,
      tag,
      icon: "/allevin-icon-192.png",
      badge: "/allevin-icon-192.png",
      data: { url: "/", entryId },
   });
}

function recommendationCategoryForEntry(entry: RhythmEntry): RecommendationCategory {
   const title = entry.title.toLowerCase();
   if (entry.category === "exercise" || /gym|workout|run|cardio|strength|lift|mobility/.test(title)) return "workout";
   if (entry.category === "meal" && /breakfast|coffee|matcha|morning/.test(title)) return "breakfast";
   if (/commute|leave|prep|get ready|hygiene|shower/.test(title)) return "transition";
   if (entry.category === "work" || entry.category === "school") return "focus";
   return "general";
}

function startCopy(entry: RhythmEntry, tone: AllevinTone, dateKey: string) {
   const base = rhythmVoice("start", entry.title, tone, `${dateKey}:${entry.sourceId}:start`);
   const category = recommendationCategoryForEntry(entry);

   // Recommendation assignments are reused by Up Next and Talk to ALLEVIN.
   // A notification therefore cannot quietly invent a fourth "today's focus."
   const recommendation = getProactiveRecommendation(
      `${dateKey}:${entry.id}`,
      category,
      Math.max(5, entry.durationMinutes || 30),
      entry.title,
   );

   if (!recommendation) return base;

   // Keep notifications glanceable. The full detail stays in Up Next.
   return `${base} ${recommendation.title}`;
}

function sameLocalDay(timestamp: number, date: Date) {
   const target = new Date(timestamp);
   return (
      target.getFullYear() === date.getFullYear() &&
      target.getMonth() === date.getMonth() &&
      target.getDate() === date.getDate()
   );
}

function lifeStartMinutes(item: LifeItem) {
   const timestamp = item.startAt || item.dueAt;
   if (!timestamp) return null;
   const date = new Date(timestamp);
   return date.getHours() * 60 + date.getMinutes();
}

function lifeReminderCopy(item: LifeItem, tone: AllevinTone, seed: string) {
   if (tone === "direct") {
      return `${item.title} is up. Give it the attention it actually needs, then get back out.`;
   }
   return rhythmVoice("start", item.title, tone, seed);
}

/**
 * Checks the current adapted day. Any routine suppressed/replaced earlier is
 * already absent/skipped in buildRhythmForDate(), so obsolete reminders simply
 * stop existing instead of needing a separate cancellation list.
 */
export async function runRhythmReminderCheck(now = new Date()) {
   if (!canNotify() || Notification.permission !== "granted") return;

   const rhythm = readDailyRhythm();
   if (!rhythm.remindersEnabled) return;

   const tone = readAllevinTone();
   const key = localDateKey(now);
   const log = readLog();
   const nowMinutes = now.getHours() * 60 + now.getMinutes();
   const entries = buildRhythmForDate(rhythm, now);

   for (const entry of entries) {
      if (entry.completed || entry.skipped) continue;

      // Hard recurring schedule blocks (Work/Class/etc.) are useful day
      // transitions too. They receive a start notification, but never the
      // accountability follow-up that belongs to user-completable routines.
      if (entry.kind === "schedule") {
         const start = minutesFromClock(entry.time);
         const scheduleKey = `${key}:${entry.sourceId}:${entry.time}:schedule-start`;

         if (nowMinutes >= start && nowMinutes <= start + 10 && !log.has(scheduleKey)) {
            await showNotification(
               entry.title,
               rhythmVoice("start", entry.title, tone, scheduleKey),
               `allevin-${key}-${entry.sourceId}-${entry.time}-schedule`,
               entry.sourceId,
            );
            log.add(scheduleKey);
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
      const startKey = `${key}:${entry.sourceId}:${entry.time}:start`;

      if (nowMinutes >= start && nowMinutes <= start + 10 && !log.has(startKey)) {
         await showNotification(
            entry.title,
            startCopy(entry, tone, key),
            `allevin-${key}-${entry.sourceId}-${entry.time}-start`,
            entry.sourceId,
         );
         log.add(startKey);
      }

      const accountabilityAfter = anchor?.accountabilityAfterMinutes ?? 15;
      const accountabilityAt = start + (entry.durationMinutes || anchor?.durationMinutes || temporary?.durationMinutes || 30) + accountabilityAfter;
      const accountabilityKey = `${key}:${entry.sourceId}:${entry.time}:accountability`;

      if (nowMinutes >= accountabilityAt && nowMinutes <= accountabilityAt + 20 && !log.has(accountabilityKey)) {
         await showNotification(
            entry.title,
            rhythmVoice("missed", entry.title, tone, accountabilityKey),
            `allevin-${key}-${entry.sourceId}-${entry.time}-accountability`,
            entry.sourceId,
         );
         log.add(accountabilityKey);
      }
   }

   // One-off commitments (dinner, dentist, meetings, etc.) deserve the same
   // day-aware notification treatment as recurring routines.
   const life = readLifeState();
   const commitments = life.items.filter(
      (item) =>
         item.state === "active" &&
         item.kind === "commitment" &&
         Boolean(item.startAt || item.dueAt) &&
         sameLocalDay(item.startAt || item.dueAt || 0, now),
   );

   for (const item of commitments) {
      const start = lifeStartMinutes(item);
      if (start === null) continue;

      const eventKey = `${key}:life:${item.id}:start`;
      if (nowMinutes >= start && nowMinutes <= start + 10 && !log.has(eventKey)) {
         await showNotification(
            item.title,
            lifeReminderCopy(item, tone, eventKey),
            `allevin-${key}-life-${item.id}`,
            item.id,
         );
         log.add(eventKey);
      }
   }

   if (rhythm.eveningResetEnabled) {
      const scheduleEntries = entries.filter((entry) => entry.kind === "schedule" && entry.endTime);
      const lastScheduleEnd = scheduleEntries.reduce(
         (latest, entry) => Math.max(latest, minutesFromClock(entry.endTime || entry.time)),
         -1,
      );
      const resetAt = lastScheduleEnd >= 0 ? lastScheduleEnd + 15 : -1;
      const eveningKey = `${key}:evening-reset`;

      if (resetAt >= 0 && nowMinutes >= resetAt && nowMinutes <= resetAt + 30 && !log.has(eveningKey)) {
         await showNotification(
            "Day reset",
            rhythmVoice("evening", "today", tone, eveningKey),
            `allevin-${key}-evening-reset`,
         );
         log.add(eveningKey);
      }
   }

   saveLog(log);
}
