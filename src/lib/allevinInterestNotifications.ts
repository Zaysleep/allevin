"use client";

import { buildRhythmForDate, localDateKey, readDailyRhythm } from "@/lib/dailyRhythm";
import {
   minutesFromInterestTime,
   readInterestPreferences,
   type InterestNotificationContext,
   type SportsTeamPreference,
} from "@/lib/allevinInterests";
import { recordNotificationReceipt } from "@/lib/allevinNotificationHealth";
import { readAllevinTone } from "@/lib/allevinVoice";

export interface PlannedInterestNotification {
   id: string;
   dueAt: number;
   title: string;
   priority: 2 | 3 | 4;
   context: InterestNotificationContext;
}

const PLAN_KEY = "allevin-interest-notification-plan-mkxxv-1";
const LOG_KEY = "allevin-interest-notification-log-mkxxv-1";
let localCheckRunning = false;

function timestampFor(date: Date, time: string) {
   const next = new Date(date);
   const minutes = minutesFromInterestTime(time);
   next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
   return next.getTime();
}

function addScheduled(
   jobs: PlannedInterestNotification[],
   kind: InterestNotificationContext["kind"],
   title: string,
   date: Date,
   time: string,
   priority: 2 | 3 | 4,
   allowedDays?: number[],
) {
   if (allowedDays && !allowedDays.includes(date.getDay())) return;
   const dueAt = timestampFor(date, time);
   if (dueAt <= Date.now() - 60_000) return;
   const dateKey = localDateKey(date);
   const preferences = readInterestPreferences();
   const occurrenceKey = `${dateKey}:interest:${kind}:${time}`;
   const scheduleFacts = kind === "briefing"
      ? buildRhythmForDate(readDailyRhythm(), date)
         .filter((entry) => !entry.completed && !entry.skipped)
         .slice(0, 12)
         .map((entry) => `${entry.time}${entry.endTime ? `–${entry.endTime}` : ""} ${entry.title}`)
      : undefined;
   jobs.push({ id: occurrenceKey, dueAt, title, priority, context: { kind, occurrenceKey, preferences, scheduledAt: dueAt, tone: readAllevinTone(), scheduleFacts } });
}

function finalOffsetMinutes(team: SportsTeamPreference) {
   if (team.league === "NBA" || team.league === "NHL") return 180;
   if (team.league === "NFL") return 230;
   return 240;
}

export async function planInterestNotifications() {
   const preferences = readInterestPreferences();
   const jobs: PlannedInterestNotification[] = [];
   const now = new Date();

   for (let offset = 0; offset <= 2; offset += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      date.setHours(12, 0, 0, 0);
      const briefingContainsWeather = preferences.briefing.enabled && preferences.briefing.includeWeather && preferences.briefing.days.includes(date.getDay()) && Math.abs(minutesFromInterestTime(preferences.briefing.time) - minutesFromInterestTime(preferences.weather.morningTime)) <= 30;
      if (preferences.briefing.enabled) addScheduled(jobs, "briefing", "Your morning briefing", date, preferences.briefing.time, 3, preferences.briefing.days);
      if (preferences.weather.enabled && preferences.weather.morningEnabled && !briefingContainsWeather) addScheduled(jobs, "weather", "Today’s weather", date, preferences.weather.morningTime, 3);
      if (preferences.stocks.enabled && preferences.stocks.reportEnabled) addScheduled(jobs, "stocks", "Your watchlist", date, preferences.stocks.reportTime, 3, preferences.stocks.reportDays);
   }

   if (preferences.stocks.enabled && preferences.stocks.monthlyReviewEnabled) {
      for (let offset = 0; offset <= 40; offset += 1) {
         const date = new Date(now);
         date.setDate(now.getDate() + offset);
         date.setHours(12, 0, 0, 0);
         if (date.getDate() === 1) addScheduled(jobs, "monthly-stocks", "Monthly portfolio check", date, preferences.stocks.monthlyReviewTime, 3);
      }
   }

   if (preferences.sports.enabled && preferences.sports.teams.length) {
      try {
         const response = await fetch("/api/allevin/interests", {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "plan-sports", preferences }),
         });
         const payload = await response.json() as { events?: Array<{ eventId: string; team: SportsTeamPreference; name: string; startsAt: number }> };
         for (const event of payload.events || []) {
            const team = event.team;
            const gameDate = new Date(event.startsAt);
            const dateKey = localDateKey(gameDate);
            const base = { preferences, team, eventId: event.eventId };
            if (team.gameDay) {
               const dueAt = timestampFor(gameDate, preferences.sports.gameDayTime);
               if (dueAt > Date.now() - 60_000 && dueAt < event.startsAt) {
                  const occurrenceKey = `${dateKey}:interest:sports-gameday:${event.eventId}`;
                  jobs.push({ id: occurrenceKey, dueAt, title: `${team.name} game day`, priority: 3, context: { ...base, kind: "sports-gameday", occurrenceKey, scheduledAt: dueAt, tone: readAllevinTone() } });
               }
            }
            if (team.pregame) {
               const dueAt = event.startsAt - team.pregameMinutes * 60_000;
               if (dueAt > Date.now() - 60_000) {
                  const occurrenceKey = `${dateKey}:interest:sports-pregame:${event.eventId}`;
                  jobs.push({ id: occurrenceKey, dueAt, title: `${team.name} plays soon`, priority: 4, context: { ...base, kind: "sports-pregame", occurrenceKey, scheduledAt: dueAt, tone: readAllevinTone() } });
               }
            }
            if (team.finalScore && !preferences.sports.noSpoilers) {
               const dueAt = event.startsAt + finalOffsetMinutes(team) * 60_000;
               const occurrenceKey = `${dateKey}:interest:sports-final:${event.eventId}`;
               jobs.push({ id: occurrenceKey, dueAt, title: `${team.name} result`, priority: 3, context: { ...base, kind: "sports-final", occurrenceKey, scheduledAt: dueAt, tone: readAllevinTone() } });
            }
         }
      } catch {
         // Existing non-sports jobs remain valid when the sports source is down.
      }
   }

   const unique = new Map(jobs.sort((left, right) => left.dueAt - right.dueAt).map((job) => [job.id, job]));
   const planned = [...unique.values()].slice(0, 80);
   window.localStorage.setItem(PLAN_KEY, JSON.stringify(planned));
   return planned;
}

function readPlan() {
   try {
      const parsed = JSON.parse(window.localStorage.getItem(PLAN_KEY) || "[]") as PlannedInterestNotification[];
      return Array.isArray(parsed) ? parsed : [];
   } catch {
      return [];
   }
}

function readLog() {
   try {
      const parsed = JSON.parse(window.localStorage.getItem(LOG_KEY) || "[]") as string[];
      return new Set(Array.isArray(parsed) ? parsed : []);
   } catch {
      return new Set<string>();
   }
}

export async function runInterestNotificationCheck() {
   if (localCheckRunning || !("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
   if (!readDailyRhythm().remindersEnabled) return;
   localCheckRunning = true;
   try {
      const now = Date.now();
      const log = readLog();
      const due = readPlan().filter((job) => job.dueAt <= now && job.dueAt >= now - 2 * 60_000 && !log.has(job.id));
      for (const job of due) {
         const response = await fetch("/api/allevin/interests", {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "notification", context: job.context, request: `Prepare the scheduled ${job.context.kind} update.`, tone: readAllevinTone() }),
         });
         const payload = await response.json() as { ok?: boolean; title?: string; body?: string; final?: boolean };
         if (!payload.ok || !payload.title || !payload.body || (job.context.kind === "sports-final" && payload.final === false)) continue;
         const registration = await navigator.serviceWorker.ready;
         const tag = `allevin-interest-${job.context.occurrenceKey}`;
         const existing = await registration.getNotifications({ tag });
         if (!existing.length) await registration.showNotification(payload.title, { body: payload.body, tag, icon: "/allevin-icon-192.png", badge: "/allevin-icon-192.png", data: { url: `/?interest=${job.context.kind}` } });
         log.add(job.id);
         window.localStorage.setItem(LOG_KEY, JSON.stringify([...log].slice(-400)));
         recordNotificationReceipt("shown");
      }
   } finally {
      localCheckRunning = false;
   }
}
