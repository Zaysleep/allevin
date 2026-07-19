"use client";

import { useEffect, useMemo, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";

import { upsertProjectMemory } from "@/lib/allevinProjectMemory";

import { useWorkspace } from "@/components/WorkspaceContext";

import { CalendarDays, Clock3, MapPin, ChevronDown, Plus, Trash2 } from "lucide-react";

// ========================================
// ALLEVIN Calendar
// Purpose:
// Simple schedule layer for project time blocks and events.
// Calendar stays inside ALLEVIN as a clean schedule view,
// while project notes and materials stay with Projects/Canvas.
// ========================================

type CalendarEventStatus = "upcoming" | "active" | "completed";

interface AllevinCalendarEvent {
   id: string;

   title: string;

   startTime: number;

   endTime: number;

   location?: string;

   description?: string;

   source: "demo" | "local" | "google-calendar";

   status: CalendarEventStatus;

   createdAt: number;

   // Calendar connection details
   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   workflowId?: string;

   originProjectsItemId?: string;

   priority?: "low" | "medium" | "high";

   projectStage?: string;

   latestMovement?: string;

   recommendedNextAction?: string;

   allDay?: boolean;

   repeat?: "none" | "daily" | "weekly" | "monthly" | "yearly";

   repeatSeriesId?: string;

   repeatIndex?: number;

   originalStartTime?: number;
}

interface CalendarEventNote {
   id: string;

   eventId: string;

   eventTitle: string;

   note: string;

   createdAt: number;

   updatedAt: number;
}

interface CalendarImportPayload {
   title: string;

   body?: string;

   description?: string;

   startTime?: number;

   endTime?: number;

   location?: string;

   sourceTitle?: string;

   sourceContent?: string;

   workingSummary?: string;

   workflowId?: string;

   originProjectsItemId?: string;

   priority?: "low" | "medium" | "high";

   projectStage?: string;

   recommendedNextAction?: string;

   skipCalendarStorageCreate?: boolean;

   allDay?: boolean;

   repeat?: "none" | "daily" | "weekly" | "monthly" | "yearly";
}

interface ApprovedInternalIntegrationPayload {
   id?: string;

   source?: "canvas" | "projects" | "calendar" | "cognition" | "aidock" | string;

   target?: "canvas" | "projects" | "calendar" | "cognition" | "aidock" | string;

   label?: string;

   title?: string;

   body?: string;

   summary?: string;

   sourceContent?: string;

   workingSummary?: string;

   suggestedAction?: string;

   workflowId?: string;

   originProjectsItemId?: string;

   originBoardItemId?: string;

   createdAt?: number;
}

// ========================================
// Storage Keys
// ========================================

const CALENDAR_EVENTS_STORAGE_KEY = "allevin-calendar-events-mki";

const CALENDAR_NOTES_STORAGE_KEY = "allevin-calendar-notes-mki";

const DELETED_CALENDAR_EVENTS_STORAGE_KEY = "allevin-calendar-deleted-events";

const DELETED_CALENDAR_EVENT_KEYS_STORAGE_KEY = "allevin-calendar-deleted-keys";

const WORKFLOW_TIMELINE_STORAGE_KEY = "allevin-global-workflow-timeline";

const THREAD_MEMORY_V2_STORAGE_KEY = "allevin-thread-memory-v2";

const CALENDAR_EVENTS_UPDATED_EVENT = "allevin-calendar-events-updated";

const APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY = "allevin-calendar-approved-internal-integration-handled";

// ========================================
// Calendar text limits
// Calendar data can come from manual input, ALLEVIN, Projects, or saved browser data.
// ========================================

const CALENDAR_SANITIZE_LIMITS = {
   title: 120,
   location: 300,
   description: 3000,
   note: 5000,
   summary: 1500,
   readback: 4000,
   notice: 220,
} as const;

function limitCalendarTextLength(value: string, maxLength: number) {
   if (value.length <= maxLength) {
      return value;
   }

   return value.slice(0, maxLength).trim();
}

function stripUnsafeCalendarMarkup(value?: string) {
   let clean = value || "";

   clean = clean.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
   clean = clean.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
   clean = clean.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "");
   clean = clean.replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "");
   clean = clean.replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "");
   clean = clean.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
   clean = clean.replace(/javascript\s*:/gi, "");
   clean = clean.replace(/data\s*:\s*text\/html/gi, "");
   clean = clean.replace(/<[^>]+>/g, "");

   return clean;
}

function sanitizeCalendarPlainText(value?: string, maxLength: number = CALENDAR_SANITIZE_LIMITS.description, options: { preserveEdges?: boolean } = {}) {
   const cleaned = stripUnsafeCalendarMarkup(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n");

   return limitCalendarTextLength(options.preserveEdges ? cleaned : cleaned.trim(), maxLength);
}

function sanitizeLiveCalendarTitle(value?: string) {
   return sanitizeCalendarPlainText(value, CALENDAR_SANITIZE_LIMITS.title, {
      preserveEdges: true,
   }).replace(/\n+/g, " ");
}

function sanitizeLiveCalendarLocation(value?: string) {
   return sanitizeCalendarPlainText(value, CALENDAR_SANITIZE_LIMITS.location, {
      preserveEdges: true,
   }).replace(/\n+/g, " ");
}

function sanitizeLiveCalendarDescription(value?: string) {
   return sanitizeCalendarPlainText(value, CALENDAR_SANITIZE_LIMITS.description, { preserveEdges: true });
}

function sanitizeLiveCalendarNote(value?: string) {
   return sanitizeCalendarPlainText(value, CALENDAR_SANITIZE_LIMITS.note, {
      preserveEdges: true,
   });
}

function sanitizeCalendarTitle(value?: string) {
   return sanitizeCalendarPlainText(value, CALENDAR_SANITIZE_LIMITS.title).replace(/\n+/g, " ").trim();
}

function sanitizeCalendarLocation(value?: string) {
   return sanitizeCalendarPlainText(value, CALENDAR_SANITIZE_LIMITS.location).replace(/\n+/g, " ").trim();
}

function sanitizeCalendarDescription(value?: string) {
   return sanitizeCalendarPlainText(value, CALENDAR_SANITIZE_LIMITS.description);
}

function sanitizeCalendarNote(value?: string) {
   return sanitizeCalendarPlainText(value, CALENDAR_SANITIZE_LIMITS.note);
}

function sanitizeCalendarSummary(value?: string) {
   return sanitizeCalendarPlainText(value, CALENDAR_SANITIZE_LIMITS.summary);
}

function sanitizeCalendarNotice(value?: string) {
   return sanitizeCalendarPlainText(value, CALENDAR_SANITIZE_LIMITS.notice).replace(/\n+/g, " ").trim();
}

function isValidCalendarTimestamp(value?: number) {
   return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getCalendarDedupeKey(event: { title?: string; startTime?: number; endTime?: number }) {
   return `${getNormalizedCalendarTitleKey(event.title)}:${Number(event.startTime || 0)}:${Number(event.endTime || 0)}`;
}

function sanitizeCalendarEvent(event: Partial<AllevinCalendarEvent>): AllevinCalendarEvent | null {
   const title = sanitizeCalendarTitle(event.title);

   const startTime = Number(event.startTime);

   const endTime = Number(event.endTime);

   if (!title || !isValidCalendarTimestamp(startTime) || !isValidCalendarTimestamp(endTime) || endTime <= startTime) {
      return null;
   }

   return {
      id: typeof event.id === "string" && event.id ? event.id : crypto.randomUUID(),
      title,
      startTime,
      endTime,
      location: sanitizeCalendarLocation(event.location) || undefined,
      description: sanitizeCalendarDescription(event.description) || undefined,
      source: event.source === "google-calendar" || event.source === "local" || event.source === "demo" ? event.source : "local",
      status: getEventStatus({
         id: "temp",
         title,
         startTime,
         endTime,
         source: "local",
         status: "upcoming",
         createdAt: getNow(),
      } as AllevinCalendarEvent),
      createdAt: isValidCalendarTimestamp(event.createdAt) ? Number(event.createdAt) : getNow(),
      sourceTitle: sanitizeCalendarTitle(event.sourceTitle || title),
      sourceContent: sanitizeCalendarDescription(event.sourceContent),
      workingSummary: sanitizeCalendarSummary(event.workingSummary || event.description || title),
      workflowId: typeof event.workflowId === "string" ? event.workflowId : undefined,
      originProjectsItemId: typeof event.originProjectsItemId === "string" ? event.originProjectsItemId : undefined,
      priority: event.priority === "low" || event.priority === "medium" || event.priority === "high" ? event.priority : undefined,
      projectStage: sanitizeCalendarPlainText(event.projectStage, 120) || undefined,
      latestMovement: sanitizeCalendarPlainText(event.latestMovement, 220) || undefined,
      recommendedNextAction: sanitizeCalendarPlainText(event.recommendedNextAction, 1000) || undefined,
      allDay: event.allDay === true,
      repeat: event.repeat === "daily" || event.repeat === "weekly" || event.repeat === "monthly" || event.repeat === "yearly" ? event.repeat : "none",
      repeatSeriesId: typeof event.repeatSeriesId === "string" ? event.repeatSeriesId : undefined,
      repeatIndex: typeof event.repeatIndex === "number" ? event.repeatIndex : undefined,
      originalStartTime: typeof event.originalStartTime === "number" ? event.originalStartTime : undefined,
   };
}

function dedupeCalendarEvents(events: AllevinCalendarEvent[]) {
   const seenIds = new Set<string>();

   const seenKeys = new Set<string>();

   return events.filter((event) => {
      const key = getCalendarDedupeKey(event);

      if (seenIds.has(event.id) || seenKeys.has(key)) {
         return false;
      }

      seenIds.add(event.id);
      seenKeys.add(key);

      return true;
   });
}

const LEGACY_PLACEHOLDER_EVENT_TITLES = ["ALLEVIN MK I Demo Check", "Allevin MK I Demo Check", "Planning Check", "Project Planning Block", "Tomorrow Follow-Up"];

function isLegacyPlaceholderTitle(title?: string) {
   const cleanTitle = compactText(title).toLowerCase();

   return LEGACY_PLACEHOLDER_EVENT_TITLES.some((legacyTitle) => cleanTitle === legacyTitle.toLowerCase());
}

function isLegacyPlaceholderEvent(event?: Partial<AllevinCalendarEvent>) {
   return Boolean(event?.id === "demo-calendar-event-1" || event?.id === "demo-calendar-event-2" || event?.id === "demo-calendar-event-3" || isLegacyPlaceholderTitle(event?.title));
}

function cleanupLegacyCalendarStorage() {
   if (typeof window === "undefined") {
      return {
         events: [] as AllevinCalendarEvent[],

         notes: [] as CalendarEventNote[],
      };
   }

   const currentEvents = readStoredEvents();

   const currentNotes = readStoredNotes();

   const legacyEventIds = new Set(currentEvents.filter((event) => isLegacyPlaceholderEvent(event)).map((event) => event.id));

   const nextEvents = currentEvents.filter((event) => !isLegacyPlaceholderEvent(event));

   const nextNotes = currentNotes.filter((note) => !legacyEventIds.has(note.eventId) && !isLegacyPlaceholderTitle(note.eventTitle));

   saveStoredEvents(nextEvents);

   saveStoredNotes(nextNotes);

   return {
      events: nextEvents,

      notes: nextNotes,
   };
}

// ========================================
// Helpers
// ========================================

function getNow() {
   return Date.now();
}

function isReadableCalendarEvent(event?: Partial<AllevinCalendarEvent>, now = getNow()) {
   return Boolean(event && isValidCalendarTimestamp(Number(event.endTime)) && Number(event.endTime) >= now);
}

function getReadableCalendarEvents(events: AllevinCalendarEvent[], now = getNow()) {
   return sortEvents(events.filter((event) => isReadableCalendarEvent(event, now)));
}

function compactText(value?: string) {
   return sanitizeCalendarPlainText(value).replace(/\s+/g, " ").trim();
}

function getNormalizedCalendarTitleKey(value?: string) {
   return compactText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
}

function readStringArrayStorage(key: string) {
   if (typeof window === "undefined") {
      return [] as string[];
   }

   const stored = localStorage.getItem(key);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      return Array.isArray(parsed)
         ? parsed
              .filter((item) => typeof item === "string")
              .map((item) => sanitizeCalendarPlainText(item, 240))
              .filter(Boolean)
         : [];
   } catch {
      localStorage.removeItem(key);

      return [];
   }
}

function saveStringArrayStorage(key: string, values: string[]) {
   if (typeof window === "undefined") {
      return;
   }

   localStorage.setItem(key, JSON.stringify(Array.from(new Set(values.filter(Boolean)))));
}

function getDeletedCalendarKeys(event?: Partial<AllevinCalendarEvent>) {
   const titleKey = getNormalizedCalendarTitleKey(event?.sourceTitle || event?.title);

   return [event?.id ? `event:${event.id}` : "", event?.workflowId ? `workflow:${event.workflowId}` : "", event?.originProjectsItemId ? `origin:${event.originProjectsItemId}` : "", titleKey ? `title:${titleKey}` : ""].filter(Boolean);
}

function rememberDeletedCalendarEvent(event?: Partial<AllevinCalendarEvent>) {
   if (typeof window === "undefined" || !event) {
      return;
   }

   const ids = [event.id, event.workflowId, event.originProjectsItemId].filter(Boolean) as string[];

   saveStringArrayStorage(DELETED_CALENDAR_EVENTS_STORAGE_KEY, [...readStringArrayStorage(DELETED_CALENDAR_EVENTS_STORAGE_KEY), ...ids]);

   saveStringArrayStorage(DELETED_CALENDAR_EVENT_KEYS_STORAGE_KEY, [...readStringArrayStorage(DELETED_CALENDAR_EVENT_KEYS_STORAGE_KEY), ...getDeletedCalendarKeys(event)]);
}

function eventMatchesDeletedCalendar(event: any, deletedIds: string[], deletedKeys: string[]) {
   const titleKey = getNormalizedCalendarTitleKey(event?.sourceTitle || event?.title);

   const candidateIds = [event?.id, event?.workflowId, event?.originProjectsItemId].filter(Boolean) as string[];

   if (candidateIds.some((id) => deletedIds.includes(id))) {
      return true;
   }

   const candidateKeys = [event?.id ? `event:${event.id}` : "", event?.workflowId ? `workflow:${event.workflowId}` : "", event?.originProjectsItemId ? `origin:${event.originProjectsItemId}` : "", titleKey ? `title:${titleKey}` : ""].filter(Boolean);

   return candidateKeys.some((key) => deletedKeys.includes(key));
}

function pruneDeletedCalendarEventMemory(event: AllevinCalendarEvent) {
   if (typeof window === "undefined") {
      return;
   }

   const deletedIds = [event.id, event.workflowId, event.originProjectsItemId].filter(Boolean) as string[];

   const deletedKeys = getDeletedCalendarKeys(event);

   try {
      const storedTimeline = localStorage.getItem(WORKFLOW_TIMELINE_STORAGE_KEY);

      if (storedTimeline) {
         const parsedTimeline = JSON.parse(storedTimeline);

         if (Array.isArray(parsedTimeline)) {
            const nextTimeline = parsedTimeline.filter((timelineEvent) => !eventMatchesDeletedCalendar(timelineEvent, deletedIds, deletedKeys));

            localStorage.setItem(WORKFLOW_TIMELINE_STORAGE_KEY, JSON.stringify(nextTimeline));
         }
      }
   } catch {
      // Keep calendar deletion safe if timeline storage is malformed.
   }

   try {
      const storedThreadMemory = localStorage.getItem(THREAD_MEMORY_V2_STORAGE_KEY);

      if (storedThreadMemory) {
         const parsedThreadMemory = JSON.parse(storedThreadMemory);

         if (Array.isArray(parsedThreadMemory)) {
            const nextThreadMemory = parsedThreadMemory.filter((thread) => !eventMatchesDeletedCalendar(thread, deletedIds, deletedKeys));

            localStorage.setItem(THREAD_MEMORY_V2_STORAGE_KEY, JSON.stringify(nextThreadMemory));
         }
      }
   } catch {
      // Keep calendar deletion safe if memory storage is malformed.
   }

   window.dispatchEvent(
      new CustomEvent("allevin-calendar-event-deleted", {
         detail: {
            eventId: event.id,
            title: event.title,
            sourceTitle: event.sourceTitle || event.title,
            workflowId: event.workflowId,
            originProjectsItemId: event.originProjectsItemId,
            deletedAt: getNow(),
         },
      }),
   );

   window.dispatchEvent(new CustomEvent("allevin-memory-update"));

   window.dispatchEvent(new CustomEvent(CALENDAR_EVENTS_UPDATED_EVENT));
}

function padDatePart(value: number) {
   return String(value).padStart(2, "0");
}

function getDateInputValue(timestamp: number) {
   const date = new Date(timestamp);

   const year = date.getFullYear();

   const month = padDatePart(date.getMonth() + 1);

   const day = padDatePart(date.getDate());

   return `${year}-${month}-${day}`;
}

function getTomorrowDateInputValue() {
   const date = new Date();

   date.setDate(date.getDate() + 1);

   date.setHours(0, 0, 0, 0);

   return getDateInputValue(date.getTime());
}

function getStartOfDay(timestamp: number) {
   const date = new Date(timestamp);

   date.setHours(0, 0, 0, 0);

   return date.getTime();
}

function getMonthLabel(timestamp: number) {
   return new Date(timestamp).toLocaleDateString([], {
      month: "long",

      year: "numeric",
   });
}

const CALENDAR_MONTH_OPTIONS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

function getCalendarYearOptions(timestamp: number) {
   const currentYear = new Date().getFullYear();

   const visibleYear = new Date(timestamp).getFullYear();

   const startYear = Math.min(currentYear, visibleYear) - 2;

   const endYear = Math.max(currentYear, visibleYear) + 3;

   return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function getShortDayNumber(timestamp: number) {
   return new Date(timestamp).getDate();
}

function isSameCalendarDay(firstTimestamp: number, secondTimestamp: number) {
   return getStartOfDay(firstTimestamp) === getStartOfDay(secondTimestamp);
}

function getMonthGridDays(monthTimestamp: number) {
   const monthDate = new Date(monthTimestamp);

   const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);

   const gridStart = new Date(firstOfMonth);

   gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

   return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);

      date.setDate(gridStart.getDate() + index);

      date.setHours(0, 0, 0, 0);

      return {
         timestamp: date.getTime(),

         isCurrentMonth: date.getMonth() === monthDate.getMonth(),

         isToday: isSameCalendarDay(date.getTime(), Date.now()),
      };
   });
}

function getEventsForDay(events: AllevinCalendarEvent[], dayTimestamp: number) {
   const startOfDay = getStartOfDay(dayTimestamp);

   const endOfDay = startOfDay + 24 * 60 * 60000 - 1;

   return events.filter((event) => event.startTime <= endOfDay && event.endTime >= startOfDay);
}

function parseLocalDateTime(dateValue: string, timeValue: string) {
   if (!dateValue || !timeValue) {
      return null;
   }

   const [year, month, day] = dateValue.split("-").map(Number);

   const [hour, minute] = timeValue.split(":").map(Number);

   if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
      return null;
   }

   return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function parseLocalDateOnly(dateValue: string, endOfDay = false) {
   if (!dateValue) {
      return null;
   }

   const [year, month, day] = dateValue.split("-").map(Number);

   if (!year || !month || !day) {
      return null;
   }

   return endOfDay ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime() : new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function getSafeEndTime(startTime: number, endTime: number | null) {
   if (!endTime || endTime <= startTime) {
      return startTime + 45 * 60000;
   }

   return endTime;
}

function getStartOfToday() {
   const date = new Date();

   date.setHours(0, 0, 0, 0);

   return date.getTime();
}

function getEndOfToday() {
   const date = new Date();

   date.setHours(23, 59, 59, 999);

   return date.getTime();
}

function getStartOfTomorrow() {
   const date = new Date();

   date.setDate(date.getDate() + 1);

   date.setHours(0, 0, 0, 0);

   return date.getTime();
}

function getEndOfTomorrow() {
   const date = new Date();

   date.setDate(date.getDate() + 1);

   date.setHours(23, 59, 59, 999);

   return date.getTime();
}

function getEventsBetween(events: AllevinCalendarEvent[], startTime: number, endTime: number) {
   return sortEvents(events.filter((event) => event.startTime <= endTime && event.endTime >= startTime));
}

function getUniqueRecurringSeries(events: AllevinCalendarEvent[]) {
   const seenSeries = new Set<string>();

   return sortEvents(
      events.filter((event) => {
         if (!event.repeat || event.repeat === "none") {
            return false;
         }

         const seriesKey = event.repeatSeriesId || `${getNormalizedCalendarTitleKey(event.title)}-${event.repeat}`;

         if (seenSeries.has(seriesKey)) {
            return false;
         }

         seenSeries.add(seriesKey);

         return true;
      }),
   );
}

function getCalendarIntelligenceSummary(events: AllevinCalendarEvent[]) {
   const readableEvents = getReadableCalendarEvents(events);

   const today = getEventsBetween(readableEvents, getStartOfToday(), getEndOfToday());

   const tomorrow = getEventsBetween(readableEvents, getStartOfTomorrow(), getEndOfTomorrow());

   const upcoming = readableEvents;

   const recurring = getUniqueRecurringSeries(upcoming);

   const nextEvent = upcoming[0];

   return {
      today,
      tomorrow,
      upcoming,
      recurring,
      nextEvent,
      todayReadback: getCalendarReadbackEvents(today)
         .slice(0, 5)
         .map((event) => getCalendarReadbackLine(event))
         .join("\n"),
      tomorrowReadback: getCalendarReadbackEvents(tomorrow)
         .slice(0, 5)
         .map((event) => getCalendarReadbackLine(event))
         .join("\n"),
      recurringReadback: recurring
         .slice(0, 5)
         .map((event) => getCalendarReadbackLine(event))
         .join("\n"),
      nextEventReadback: nextEvent ? getCalendarReadbackLine(nextEvent) : "",
   };
}

function getEventStatus(event: AllevinCalendarEvent): CalendarEventStatus {
   const now = getNow();

   if (now >= event.startTime && now <= event.endTime) {
      return "active";
   }

   if (now > event.endTime) {
      return "completed";
   }

   return "upcoming";
}

function getTimeLabel(timestamp: number) {
   return new Date(timestamp).toLocaleString([], {
      month: "short",

      day: "numeric",

      hour: "numeric",

      minute: "2-digit",
   });
}

function getShortTimeLabel(timestamp: number) {
   return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",

      minute: "2-digit",
   });
}

function getDateLabel(timestamp: number) {
   return new Date(timestamp).toLocaleDateString([], {
      weekday: "long",

      month: "short",

      day: "numeric",
   });
}

function getDurationLabel(startTime: number, endTime: number) {
   const minutes = Math.max(1, Math.round((endTime - startTime) / 60000));

   if (minutes < 60) {
      return `${minutes} min`;
   }

   const hours = Math.floor(minutes / 60);

   const remainingMinutes = minutes % 60;

   if (!remainingMinutes) {
      return `${hours} hr`;
   }

   return `${hours} hr ${remainingMinutes} min`;
}

function getRepeatLabel(repeat?: AllevinCalendarEvent["repeat"]) {
   switch (repeat) {
      case "daily":
         return "Repeats daily";
      case "weekly":
         return "Repeats weekly";
      case "monthly":
         return "Repeats monthly";
      case "yearly":
         return "Repeats yearly";
      default:
         return "Does not repeat";
   }
}

function getRepeatIntervalLabel(repeat?: AllevinCalendarEvent["repeat"]) {
   switch (repeat) {
      case "daily":
         return "day";
      case "weekly":
         return "week";
      case "monthly":
         return "month";
      case "yearly":
         return "year";
      default:
         return "";
   }
}

function getRecurringOccurrenceCount(repeat?: AllevinCalendarEvent["repeat"]) {
   switch (repeat) {
      case "daily":
         return 30;
      case "weekly":
         return 26;
      case "monthly":
         return 12;
      case "yearly":
         return 5;
      default:
         return 1;
   }
}

function shiftRecurringDate(timestamp: number, repeat: AllevinCalendarEvent["repeat"], index: number) {
   const date = new Date(timestamp);

   if (repeat === "daily") {
      date.setDate(date.getDate() + index);
   }

   if (repeat === "weekly") {
      date.setDate(date.getDate() + index * 7);
   }

   if (repeat === "monthly") {
      date.setMonth(date.getMonth() + index);
   }

   if (repeat === "yearly") {
      date.setFullYear(date.getFullYear() + index);
   }

   return date.getTime();
}

function buildRecurringEvents(baseEvent: AllevinCalendarEvent) {
   const repeat = baseEvent.repeat || "none";

   if (repeat === "none") {
      return [baseEvent];
   }

   const occurrenceCount = getRecurringOccurrenceCount(repeat);

   const seriesId = baseEvent.repeatSeriesId || crypto.randomUUID();

   const duration = Math.max(1, baseEvent.endTime - baseEvent.startTime);

   return Array.from({ length: occurrenceCount }, (_, index) => {
      const startTime = shiftRecurringDate(baseEvent.startTime, repeat, index);

      return {
         ...baseEvent,
         id: index === 0 ? baseEvent.id : crypto.randomUUID(),
         startTime,
         endTime: startTime + duration,
         repeatSeriesId: seriesId,
         repeatIndex: index,
         originalStartTime: baseEvent.startTime,
      };
   });
}

function getEventTimeRangeLabel(event: Pick<AllevinCalendarEvent, "startTime" | "endTime" | "allDay">) {
   if (event.allDay) {
      return "All day";
   }

   return `${getShortTimeLabel(event.startTime)} - ${getShortTimeLabel(event.endTime)}`;
}

function getCalendarReadbackEvents(events: AllevinCalendarEvent[]) {
   const seenSeries = new Set<string>();

   return events.filter((event) => {
      if (!event.repeatSeriesId || event.repeat === "none") {
         return true;
      }

      if (seenSeries.has(event.repeatSeriesId)) {
         return false;
      }

      seenSeries.add(event.repeatSeriesId);

      return true;
   });
}

function getCalendarReadbackLine(event: AllevinCalendarEvent) {
   const timeLabel = event.allDay ? "all day" : `${getShortTimeLabel(event.startTime)} (${getDurationLabel(event.startTime, event.endTime)})`;

   const repeatLabel = event.repeat && event.repeat !== "none" ? `, ${getRepeatLabel(event.repeat).toLowerCase()}` : "";

   return `${event.title} — ${timeLabel}${repeatLabel}`;
}

function sortEvents(events: AllevinCalendarEvent[]) {
   return [...events].sort((a, b) => a.startTime - b.startTime);
}

function sortNotes(notes: CalendarEventNote[]) {
   return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

function readStoredEvents(): AllevinCalendarEvent[] {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(CALENDAR_EVENTS_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return [];
      }

      return dedupeCalendarEvents(parsed.map((event) => sanitizeCalendarEvent(event)).filter(Boolean) as AllevinCalendarEvent[]).filter((event) => !isLegacyPlaceholderEvent(event));
   } catch {
      localStorage.removeItem(CALENDAR_EVENTS_STORAGE_KEY);

      return [];
   }
}

function saveStoredEvents(events: AllevinCalendarEvent[]) {
   if (typeof window === "undefined") {
      return;
   }

   const safeEvents = dedupeCalendarEvents(events.map((event) => sanitizeCalendarEvent(event)).filter(Boolean) as AllevinCalendarEvent[]).filter((event) => !isLegacyPlaceholderEvent(event));

   localStorage.setItem(CALENDAR_EVENTS_STORAGE_KEY, JSON.stringify(sortEvents(safeEvents).slice(0, 80)));
}

function readStoredNotes(): CalendarEventNote[] {
   if (typeof window === "undefined") {
      return [];
   }

   const stored = localStorage.getItem(CALENDAR_NOTES_STORAGE_KEY);

   if (!stored) {
      return [];
   }

   try {
      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
         return [];
      }

      return parsed
         .filter((note) => note && typeof note.id === "string" && typeof note.eventId === "string" && typeof note.note === "string")
         .map((note) => ({
            id: note.id,
            eventId: note.eventId,
            eventTitle: sanitizeCalendarTitle(note.eventTitle || "Calendar Event"),
            note: sanitizeCalendarNote(note.note),
            createdAt: isValidCalendarTimestamp(note.createdAt) ? note.createdAt : getNow(),
            updatedAt: isValidCalendarTimestamp(note.updatedAt) ? note.updatedAt : isValidCalendarTimestamp(note.createdAt) ? note.createdAt : getNow(),
         }))
         .filter((note) => note.note && !isLegacyPlaceholderTitle(note.eventTitle));
   } catch {
      localStorage.removeItem(CALENDAR_NOTES_STORAGE_KEY);

      return [];
   }
}

function saveStoredNotes(notes: CalendarEventNote[]) {
   if (typeof window === "undefined") {
      return;
   }

   const safeNotes = notes
      .filter((note) => !isLegacyPlaceholderTitle(note.eventTitle))
      .map((note) => ({
         ...note,
         eventTitle: sanitizeCalendarTitle(note.eventTitle),
         note: sanitizeCalendarNote(note.note),
         createdAt: isValidCalendarTimestamp(note.createdAt) ? note.createdAt : getNow(),
         updatedAt: isValidCalendarTimestamp(note.updatedAt) ? note.updatedAt : getNow(),
      }))
      .filter((note) => note.note);

   localStorage.setItem(CALENDAR_NOTES_STORAGE_KEY, JSON.stringify(sortNotes(safeNotes).slice(0, 120)));
}

function buildEventContext(event: AllevinCalendarEvent, note?: string) {
   return `
Event Details

Title:
${event.title}

When:
${getDateLabel(event.startTime)}
${getEventTimeRangeLabel(event)}
Duration: ${event.allDay ? "All day" : getDurationLabel(event.startTime, event.endTime)}
Repeat: ${getRepeatLabel(event.repeat)}

Location:
${event.location || "No location added."}

Description:
${event.description || "No description added."}

Project notes:
${event.sourceContent || event.workingSummary || event.description || "No project notes added yet."}

Priority:
${event.priority || "medium"}

Event note:
${note || "No note saved yet."}

Suggested next step:
${event.recommendedNextAction || "Check this event, capture useful notes, and keep the schedule clear."}
   `.trim();
}

function buildCalendarCheckNoteMemoryBody(event: AllevinCalendarEvent, note: string) {
   return `
Calendar Note

Event:
${event.title}

When:
${getDateLabel(event.startTime)}
${getShortTimeLabel(event.startTime)} - ${getShortTimeLabel(event.endTime)}

Location:
${event.location || "No location added."}

Project notes:
${event.sourceContent || event.workingSummary || event.description || "No project notes added yet."}

Saved Note:
${note}

Suggested next step:
Keep this note with the event, then continue in Projects or Canvas when you are ready.
   `.trim();
}

function getCalendarCheckRecommendedNextAction(note: string) {
   const lower = compactText(note).toLowerCase();

   if (lower.includes("task") || lower.includes("follow up") || lower.includes("todo") || lower.includes("to do") || lower.includes("next action")) {
      return "Use this note to update the project or schedule the next calendar block when needed.";
   }

   if (lower.includes("board") || lower.includes("track") || lower.includes("status")) {
      return "Update the project status or keep this note attached to the event.";
   }

   if (lower.includes("draft") || lower.includes("write") || lower.includes("canvas") || lower.includes("continue")) {
      return "Continue this project in Canvas using the saved calendar note as the latest context.";
   }

   return "Keep this note attached to the event and use it as the latest schedule context.";
}

function getHandledCalendarIntegrationIds() {
   if (typeof window === "undefined") {
      return [] as string[];
   }

   try {
      const stored = sessionStorage.getItem(APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY);

      const parsed = stored ? JSON.parse(stored) : [];

      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
   } catch {
      return [];
   }
}

function rememberHandledCalendarIntegrationId(id?: string) {
   if (typeof window === "undefined" || !id) {
      return;
   }

   const current = getHandledCalendarIntegrationIds();

   sessionStorage.setItem(APPROVED_INTERNAL_INTEGRATION_HANDLED_KEY, JSON.stringify([id, ...current.filter((item) => item !== id)].slice(0, 60)));
}

function hasHandledCalendarIntegrationId(id?: string) {
   if (!id) {
      return false;
   }

   return getHandledCalendarIntegrationIds().includes(id);
}

function getNextCalendarReceiverBlock(minutes = 45) {
   const date = new Date();

   date.setMinutes(date.getMinutes() + 5);

   date.setSeconds(0, 0);

   const roundedMinutes = Math.ceil(date.getMinutes() / 5) * 5;

   if (roundedMinutes >= 60) {
      date.setHours(date.getHours() + 1);
      date.setMinutes(0);
   } else {
      date.setMinutes(roundedMinutes);
   }

   const startTime = date.getTime();

   return {
      startTime,
      endTime: startTime + minutes * 60000,
   };
}

function buildCalendarImportFromApprovedIntegration(payload: ApprovedInternalIntegrationPayload): CalendarImportPayload {
   const block = getNextCalendarReceiverBlock(45);

   const cleanTitle = sanitizeCalendarTitle(payload.title) || "ALLEVIN Calendar Block";

   const action = sanitizeCalendarPlainText(payload.suggestedAction, 1000);

   const body = sanitizeCalendarDescription(payload.body || payload.sourceContent || payload.workingSummary || payload.summary || action || cleanTitle);

   return {
      title: cleanTitle,
      body,
      description: action ? `${body}\n\nAction:\n${action}` : body,
      startTime: block.startTime,
      endTime: block.endTime,
      location: "ALLEVIN Calendar",
      sourceTitle: cleanTitle,
      sourceContent: payload.sourceContent || body,
      workingSummary: payload.workingSummary || payload.summary || body,
      workflowId: payload.workflowId || payload.id,
      originProjectsItemId: payload.originProjectsItemId || payload.originBoardItemId || payload.id,
      priority: "medium",
      projectStage: "scheduled",
      recommendedNextAction: action || "Use this block for the project work.",
      repeat: "none",
   };
}

// ========================================
// Component
// ========================================

export default function CalendarIntegrationPanel() {
   const workspace = useWorkspace();

   const [mounted, setMounted] = useState(false);

   const [calendarNow, setCalendarNow] = useState(getNow);

   const [events, setEvents] = useState<AllevinCalendarEvent[]>([]);

   const [notes, setNotes] = useState<CalendarEventNote[]>([]);

   const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

   const [visibleMonthDate, setVisibleMonthDate] = useState(() => {
      const date = new Date();

      date.setDate(1);

      date.setHours(0, 0, 0, 0);

      return date.getTime();
   });

   const [monthJumpOpen, setMonthJumpOpen] = useState(false);

   const [selectedDayDate, setSelectedDayDate] = useState(() => {
      const date = new Date();

      date.setHours(0, 0, 0, 0);

      return date.getTime();
   });

   const [noteDraft, setNoteDraft] = useState("");

   const [notesOpen, setNotesOpen] = useState(false);

   const [manualOpen, setManualOpen] = useState(false);

   const [expandedEventIds, setExpandedEventIds] = useState<string[]>([]);

   const [notice, setNotice] = useState("");

   const [newEventTitle, setNewEventTitle] = useState("");

   const [newEventStartDate, setNewEventStartDate] = useState(getTomorrowDateInputValue);

   const [newEventEndDate, setNewEventEndDate] = useState(getTomorrowDateInputValue);

   const [newEventStartTime, setNewEventStartTime] = useState("11:00");

   const [newEventEndTime, setNewEventEndTime] = useState("11:45");

   const [newEventAllDay, setNewEventAllDay] = useState(false);

   const [newEventRepeat, setNewEventRepeat] = useState<AllevinCalendarEvent["repeat"]>("none");

   const [newEventLocation, setNewEventLocation] = useState("");

   const [newEventDescription, setNewEventDescription] = useState("");

   // ========================================
   // Derived State
   // ========================================

   const hydratedEvents = useMemo(
      () =>
         sortEvents(events).map((event) => ({
            ...event,

            status: getEventStatus(event),
         })),
      [events],
   );

   const readableEvents = useMemo(() => getReadableCalendarEvents(hydratedEvents, calendarNow), [hydratedEvents, calendarNow]);

   const todayEvents = readableEvents.filter((event) => event.startTime >= getStartOfToday() && event.startTime <= getEndOfToday());

   const upcomingEvents = readableEvents;

   const selectedEvent = upcomingEvents.find((event) => event.id === selectedEventId) || upcomingEvents[0] || null;

   const monthGridDays = useMemo(() => getMonthGridDays(visibleMonthDate), [visibleMonthDate]);

   const selectedDayEvents = useMemo(() => getEventsForDay(hydratedEvents, selectedDayDate), [hydratedEvents, selectedDayDate]);

   const visibleMonthLabel = getMonthLabel(visibleMonthDate);

   const visibleMonthObject = new Date(visibleMonthDate);

   const visibleMonthIndex = visibleMonthObject.getMonth();

   const visibleYear = visibleMonthObject.getFullYear();

   const calendarYearOptions = useMemo(() => getCalendarYearOptions(visibleMonthDate), [visibleMonthDate]);

   // ========================================
   // Mount
   // ========================================

   useEffect(() => {
      const timer = window.setInterval(() => {
         setCalendarNow(getNow());
      }, 60000);

      return () => {
         window.clearInterval(timer);
      };
   }, []);

   useEffect(() => {
      setMounted(true);

      const cleanedState = cleanupLegacyCalendarStorage();

      const initialEvents = cleanedState.events;

      setEvents(initialEvents);

      setNotes(cleanedState.notes);

      setSelectedEventId(getReadableCalendarEvents(initialEvents)[0]?.id || null);

      saveStoredEvents(initialEvents);

      syncCalendarStatus(initialEvents.length > 0 ? "schedule-context-active" : "workspace-stable");
   }, []);

   // ========================================
   // Helpers
   // ========================================

   function showNotice(message: string) {
      setNotice(sanitizeCalendarNotice(message));

      window.setTimeout(() => {
         setNotice("");
      }, 1400);
   }

   function syncCalendarStatus(status: "schedule-context-active" | "workspace-stable" = "schedule-context-active") {
      workspace.setSystemStatus(status);

      workspace.registerWorkspaceActivity(status);
   }

   function refreshCalendar() {
      const cleanedState = cleanupLegacyCalendarStorage();

      const nextEvents = cleanedState.events;

      const nextNotes = cleanedState.notes;

      setEvents(nextEvents);

      setNotes(nextNotes);

      const readableEvents = getReadableCalendarEvents(nextEvents);

      setSelectedEventId((current) => (current && readableEvents.some((event) => event.id === current) ? current : readableEvents[0]?.id || null));

      syncCalendarStatus(nextEvents.length > 0 ? "schedule-context-active" : "workspace-stable");

      showNotice("Calendar refreshed");
   }

   async function tryLiveRefresh() {
      try {
         const response = await fetch("/api/calendar/events", {
            method: "GET",

            headers: {
               "Content-Type": "application/json",
            },
         });

         if (!response.ok) {
            throw new Error("Calendar API unavailable.");
         }

         const data = await response.json();

         if (!Array.isArray(data.events)) {
            throw new Error("Calendar API returned no events.");
         }

         const liveEvents: AllevinCalendarEvent[] = data.events
            .filter((event: any) => event && typeof event.title === "string" && typeof event.startTime === "number" && typeof event.endTime === "number")
            .map((event: any) => ({
               id: typeof event.id === "string" ? event.id : crypto.randomUUID(),

               title: sanitizeCalendarTitle(event.title),

               startTime: event.startTime,

               endTime: event.endTime,

               location: typeof event.location === "string" ? sanitizeCalendarLocation(event.location) : undefined,

               description: typeof event.description === "string" ? sanitizeCalendarDescription(event.description) : undefined,

               source: "google-calendar",

               status: getEventStatus(event),

               createdAt: typeof event.createdAt === "number" ? event.createdAt : getNow(),
            }));

         const readableLiveEvents = getReadableCalendarEvents(liveEvents);

         if (!readableLiveEvents.length) {
            throw new Error("No upcoming calendar events found.");
         }

         saveStoredEvents(liveEvents);

         setEvents(liveEvents);

         setSelectedEventId(readableLiveEvents[0]?.id || null);

         syncCalendarStatus("schedule-context-active");

         showNotice("Connected calendar loaded");
      } catch {
         refreshCalendar();

         showNotice("Showing saved calendar");
      }
   }

   // ========================================
   // External Calendar Listener
   // ========================================

   useEffect(() => {
      function handleCalendarImport(event: Event) {
         const customEvent = event as CustomEvent<CalendarImportPayload>;

         if (!customEvent.detail?.title) {
            return;
         }

         createCalendarEventFromPayload(customEvent.detail);
      }

      function handleCalendarEventsUpdated() {
         window.setTimeout(() => {
            refreshCalendar();
         }, 0);
      }

      function handleApprovedInternalIntegration(event: Event) {
         const customEvent = event as CustomEvent<ApprovedInternalIntegrationPayload>;

         const detail = customEvent.detail;

         if (!detail || detail.target !== "calendar") {
            return;
         }

         if (detail.id && hasHandledCalendarIntegrationId(detail.id)) {
            return;
         }

         if (!detail.title && !detail.body && !detail.summary && !detail.sourceContent && !detail.suggestedAction) {
            return;
         }

         rememberHandledCalendarIntegrationId(detail.id);

         createCalendarEventFromPayload(buildCalendarImportFromApprovedIntegration(detail));
      }

      window.addEventListener("allevin-send-to-calendar", handleCalendarImport);

      window.addEventListener("allevin-internal-integration-suggestion", handleApprovedInternalIntegration);

      window.addEventListener(CALENDAR_EVENTS_UPDATED_EVENT, handleCalendarEventsUpdated);

      return () => {
         window.removeEventListener("allevin-send-to-calendar", handleCalendarImport);

         window.removeEventListener("allevin-internal-integration-suggestion", handleApprovedInternalIntegration);

         window.removeEventListener(CALENDAR_EVENTS_UPDATED_EVENT, handleCalendarEventsUpdated);
      };
   }, [events, notes, selectedEventId, noteDraft]);

   function selectEvent(event: AllevinCalendarEvent) {
      setSelectedEventId(event.id);

      setSelectedDayDate(getStartOfDay(event.startTime));

      setVisibleMonthDate(new Date(new Date(event.startTime).getFullYear(), new Date(event.startTime).getMonth(), 1).getTime());

      const latestNote = sortNotes(notes.filter((note) => note.eventId === event.id))[0];

      setNoteDraft(latestNote?.note || "");

      syncCalendarStatus("schedule-context-active");

      showNotice("Event opened");
   }

   function createStableCalendarWorkflowId(title: string, fallbackId?: string) {
      const cleanTitle = compactText(title)
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, "-")
         .replace(/^-+|-+$/g, "")
         .slice(0, 80);

      return fallbackId || (cleanTitle ? `calendar-${cleanTitle}` : crypto.randomUUID());
   }

   function logCalendarWorkflowEvent(event: AllevinCalendarEvent, summary: string, destination = "calendar") {
      window.dispatchEvent(
         new CustomEvent("allevin-log-workflow-event", {
            detail: {
               id: crypto.randomUUID(),

               type: "insight",

               source: "calendar",

               destination,

               title: event.sourceTitle || event.title,

               summary,

               sourceTitle: event.sourceTitle || event.title,

               sourceContent: buildEventContext(event, getLatestNoteForEvent(event)),

               workingSummary: event.workingSummary || event.description || event.title,

               cleanSourceContent: buildEventContext(event, getLatestNoteForEvent(event)),

               workflowId: event.workflowId || event.id,

               originProjectsItemId: event.originProjectsItemId || event.id,

               createdAt: getNow(),
            },
         }),
      );
   }

   function createCalendarEventFromPayload(payload: CalendarImportPayload) {
      if (payload.skipCalendarStorageCreate) {
         refreshCalendar();

         syncCalendarStatus("schedule-context-active");

         showNotice("Event created");

         return;
      }

      const cleanTitle = sanitizeCalendarTitle(payload.title);

      if (!cleanTitle) {
         showNotice("Add a calendar title");
         return;
      }

      const startTime = typeof payload.startTime === "number" && isValidCalendarTimestamp(payload.startTime) ? payload.startTime : Date.now() + 24 * 60 * 60000;

      const endTime = getSafeEndTime(startTime, typeof payload.endTime === "number" && isValidCalendarTimestamp(payload.endTime) ? payload.endTime : null);

      if (!isValidCalendarTimestamp(startTime) || !isValidCalendarTimestamp(endTime) || endTime <= startTime || endTime - startTime > 24 * 60 * 60000) {
         showNotice("Check the start and end time");

         return;
      }

      const workflowId = payload.workflowId || createStableCalendarWorkflowId(cleanTitle);

      const calendarEvent: AllevinCalendarEvent = {
         id: crypto.randomUUID(),
         title: cleanTitle,
         startTime,
         endTime,
         location: sanitizeCalendarLocation(payload.location) || undefined,
         description: sanitizeCalendarDescription(payload.description || payload.body || payload.workingSummary) || "",
         source: "local",
         status: "upcoming",
         createdAt: getNow(),
         sourceTitle: sanitizeCalendarTitle(payload.sourceTitle) || cleanTitle,
         sourceContent: sanitizeCalendarDescription(payload.sourceContent || payload.body || payload.description),
         workingSummary: sanitizeCalendarSummary(payload.workingSummary || payload.body || payload.description),
         workflowId,
         originProjectsItemId: payload.originProjectsItemId || workflowId,
         priority: payload.priority || "medium",
         projectStage: payload.projectStage || "scheduled",
         latestMovement: "ALLEVIN → Calendar",
         recommendedNextAction: sanitizeCalendarPlainText(payload.recommendedNextAction, 1000) || "Use this scheduled block for the planned work.",
         allDay: payload.allDay === true,
         repeat: payload.repeat || "none",

         repeatSeriesId: payload.repeat && payload.repeat !== "none" ? crypto.randomUUID() : undefined,

         repeatIndex: 0,

         originalStartTime: startTime,
      };

      const eventsToAdd = buildRecurringEvents(calendarEvent);

      const nextEvents = sortEvents([...eventsToAdd, ...events]);
      saveStoredEvents(nextEvents);
      setEvents(nextEvents);
      setSelectedEventId(calendarEvent.id);
      setSelectedDayDate(getStartOfDay(calendarEvent.startTime));
      setVisibleMonthDate(new Date(new Date(calendarEvent.startTime).getFullYear(), new Date(calendarEvent.startTime).getMonth(), 1).getTime());
      setNoteDraft("");
      logCalendarWorkflowEvent(calendarEvent, `Event created from ALLEVIN context: ${calendarEvent.title}`);
      syncCalendarStatus("schedule-context-active");
      showNotice("Event created");
   }

   function addManualEvent() {
      const cleanTitle = sanitizeCalendarTitle(newEventTitle);

      if (!cleanTitle) {
         showNotice("Add a title");

         return;
      }

      const parsedStartTime = newEventAllDay ? parseLocalDateOnly(newEventStartDate) : parseLocalDateTime(newEventStartDate, newEventStartTime);

      if (!parsedStartTime) {
         showNotice(newEventAllDay ? "Add a valid start date" : "Add a valid start date and time");

         return;
      }

      const parsedEndTime = newEventAllDay ? parseLocalDateOnly(newEventEndDate || newEventStartDate, true) : parseLocalDateTime(newEventEndDate || newEventStartDate, newEventEndTime);

      const startTime = parsedStartTime;

      const endTime = getSafeEndTime(startTime, parsedEndTime);

      if (!isValidCalendarTimestamp(startTime) || !isValidCalendarTimestamp(endTime) || endTime <= startTime || endTime - startTime > 24 * 60 * 60000) {
         showNotice("Check the start and end time");

         return;
      }

      const newEvent: AllevinCalendarEvent = {
         id: crypto.randomUUID(),

         title: cleanTitle,

         startTime,

         endTime,

         location: sanitizeCalendarLocation(newEventLocation) || undefined,

         description: sanitizeCalendarDescription(newEventDescription) || "",

         source: "local",

         status: getEventStatus({
            id: "temp",

            title: cleanTitle,

            startTime,

            endTime,

            source: "local",

            status: "upcoming",

            createdAt: getNow(),
         }),

         createdAt: getNow(),

         sourceTitle: cleanTitle,

         sourceContent: sanitizeCalendarDescription(newEventDescription),

         workingSummary: sanitizeCalendarSummary(newEventDescription) || cleanTitle,

         workflowId: createStableCalendarWorkflowId(cleanTitle),

         originProjectsItemId: createStableCalendarWorkflowId(cleanTitle),

         priority: "medium",

         projectStage: "scheduled",

         latestMovement: "Manual → Calendar",

         recommendedNextAction: "Add notes to this event if needed.",

         allDay: newEventAllDay,

         repeat: newEventRepeat || "none",

         repeatSeriesId: newEventRepeat && newEventRepeat !== "none" ? crypto.randomUUID() : undefined,

         repeatIndex: 0,

         originalStartTime: startTime,
      };

      const eventsToAdd = buildRecurringEvents(newEvent);

      const nextEvents = sortEvents([...eventsToAdd, ...events]);

      saveStoredEvents(nextEvents);

      setEvents(nextEvents);

      setSelectedEventId(newEvent.id);

      setSelectedDayDate(getStartOfDay(newEvent.startTime));

      setVisibleMonthDate(new Date(new Date(newEvent.startTime).getFullYear(), new Date(newEvent.startTime).getMonth(), 1).getTime());

      setNewEventTitle("");

      setNewEventStartDate(getTomorrowDateInputValue());

      setNewEventEndDate(getTomorrowDateInputValue());

      setNewEventStartTime("11:00");

      setNewEventEndTime("11:45");

      setNewEventAllDay(false);

      setNewEventRepeat("none");

      setNewEventLocation("");

      setNewEventDescription("");

      setNoteDraft("");

      setManualOpen(false);

      logCalendarWorkflowEvent(newEvent, `Calendar event created: ${newEvent.title}`);

      syncCalendarStatus("schedule-context-active");

      showNotice(newEventRepeat && newEventRepeat !== "none" ? "Repeating event created" : "Event created");
   }

   function getRecurringDeleteChoice(event: AllevinCalendarEvent) {
      if (!event.repeatSeriesId || event.repeat === "none") {
         return "single";
      }

      const intervalLabel = getRepeatIntervalLabel(event.repeat);

      const choice = window.prompt(`Delete repeating event "${event.title}"?\n\nType one option:\n1 = Only this event\n2 = This and future ${intervalLabel ? `${intervalLabel}s` : "events"}\n3 = The full series`, "1");

      if (choice === "2") {
         return "future";
      }

      if (choice === "3") {
         return "series";
      }

      return "single";
   }

   function shouldDeleteRecurringEvent(candidate: AllevinCalendarEvent, target: AllevinCalendarEvent, mode: "single" | "future" | "series") {
      if (mode === "single") {
         return candidate.id === target.id;
      }

      if (!target.repeatSeriesId || candidate.repeatSeriesId !== target.repeatSeriesId) {
         return false;
      }

      if (mode === "series") {
         return true;
      }

      return candidate.startTime >= target.startTime;
   }

   function deleteEvent(eventId: string) {
      const eventToDelete = events.find((event) => event.id === eventId);

      if (!eventToDelete) {
         showNotice("Event was not found");

         return;
      }

      const deleteMode = getRecurringDeleteChoice(eventToDelete);

      const confirmed = window.confirm(deleteMode === "single" ? `Delete "${eventToDelete.title}"?` : deleteMode === "future" ? `Delete "${eventToDelete.title}" and future events in this series?` : `Delete the full "${eventToDelete.title}" series?`);

      if (!confirmed) {
         return;
      }

      const eventsToDelete = events.filter((event) => shouldDeleteRecurringEvent(event, eventToDelete, deleteMode));

      eventsToDelete.forEach((event) => {
         rememberDeletedCalendarEvent(event);

         pruneDeletedCalendarEventMemory(event);
      });

      const deletedIds = new Set(eventsToDelete.map((event) => event.id));

      const nextEvents = events.filter((event) => !deletedIds.has(event.id));

      const nextNotes = notes.filter((note) => !deletedIds.has(note.eventId));

      saveStoredEvents(nextEvents);

      saveStoredNotes(nextNotes);

      setEvents(nextEvents);

      setNotes(nextNotes);

      setSelectedEventId(getReadableCalendarEvents(nextEvents)[0]?.id || null);

      syncCalendarStatus(nextEvents.length > 0 ? "schedule-context-active" : "workspace-stable");

      showNotice(deleteMode === "single" ? "Event deleted" : deleteMode === "future" ? "Future events deleted" : "Series deleted");
   }

   function deleteNote(noteId: string) {
      const deletedNote = notes.find((note) => note.id === noteId);

      const nextNotes = notes.filter((note) => note.id !== noteId);

      saveStoredNotes(nextNotes);

      setNotes(nextNotes);

      if (deletedNote?.eventId === selectedEvent?.id) {
         const latestRemainingNote = sortNotes(nextNotes.filter((note) => note.eventId === selectedEvent.id))[0];

         setNoteDraft(latestRemainingNote?.note || "");
      }

      syncCalendarStatus("schedule-context-active");

      showNotice("Note deleted");
   }

   function clearNotesForSelectedEvent() {
      if (!selectedEvent) {
         showNotice("Choose an event first");

         return;
      }

      const nextNotes = notes.filter((note) => note.eventId !== selectedEvent.id);

      saveStoredNotes(nextNotes);

      setNotes(nextNotes);

      setNoteDraft("");

      syncCalendarStatus("schedule-context-active");

      showNotice("Notes cleared");
   }

   function preserveCalendarNoteToProjectMemory(event: AllevinCalendarEvent, note: string) {
      const sourceTitle = sanitizeCalendarTitle(event.sourceTitle || event.title);

      const workflowId = event.workflowId || event.id;

      const originProjectsItemId = event.originProjectsItemId || workflowId;

      const cleanNote = sanitizeCalendarNote(note);

      const memoryBody = sanitizeCalendarDescription(buildCalendarCheckNoteMemoryBody(event, cleanNote));

      const recommendedNextAction = sanitizeCalendarPlainText(getCalendarCheckRecommendedNextAction(cleanNote), 1000);

      upsertProjectMemory({
         title: sourceTitle,

         body: memoryBody,

         sourceTitle,

         sourceContent: memoryBody,

         workingSummary: sanitizeCalendarSummary(cleanNote),

         workflowId,

         originBoardItemId: originProjectsItemId,

         source: "system",

         destination: "calendar",

         stage: "reviewing",

         status: "active",

         priority: event.priority || "medium",

         recommendedNextAction,

         latestMovement: "Calendar → Event Notes",
      });

      window.dispatchEvent(
         new CustomEvent("allevin-log-workflow-event", {
            detail: {
               id: crypto.randomUUID(),

               type: "insight",

               source: "calendar",

               destination: "calendar",

               title: `Calendar note saved: ${sourceTitle}`,

               summary: sanitizeCalendarSummary(cleanNote),

               sourceTitle,

               sourceContent: memoryBody,

               workingSummary: sanitizeCalendarSummary(cleanNote),

               cleanSourceContent: memoryBody,

               workflowId,

               originProjectsItemId,

               createdAt: getNow(),
            },
         }),
      );

      window.dispatchEvent(
         new CustomEvent("allevin-calendar-check-note-saved", {
            detail: {
               eventId: event.id,

               eventTitle: event.title,

               sourceTitle,

               note: cleanNote,

               body: memoryBody,

               workflowId,

               originProjectsItemId,

               recommendedNextAction,

               createdAt: getNow(),
            },
         }),
      );
   }

   function saveNoteForSelectedEvent() {
      if (!selectedEvent) {
         showNotice("Choose an event first");

         return;
      }

      const cleanNote = sanitizeCalendarNote(noteDraft);

      if (!cleanNote) {
         showNotice("Write a note first");

         return;
      }

      const note: CalendarEventNote = {
         id: crypto.randomUUID(),

         eventId: selectedEvent.id,

         eventTitle: sanitizeCalendarTitle(selectedEvent.title),

         note: cleanNote,

         createdAt: getNow(),

         updatedAt: getNow(),
      };

      const nextNotes = sortNotes([note, ...notes]);

      saveStoredNotes(nextNotes);

      setNotes(nextNotes);

      preserveCalendarNoteToProjectMemory(selectedEvent, cleanNote);

      window.dispatchEvent(
         new CustomEvent("allevin-calendar-note-created", {
            detail: {
               eventId: selectedEvent.id,

               eventTitle: sanitizeCalendarTitle(selectedEvent.title),

               note: cleanNote,

               createdAt: getNow(),
            },
         }),
      );

      window.dispatchEvent(
         new CustomEvent("allevin-log-workflow-event", {
            detail: {
               id: crypto.randomUUID(),

               type: "insight",

               source: "calendar",

               destination: "calendar",

               title: sanitizeCalendarTitle(`Calendar note saved: ${selectedEvent.title}`),

               summary: cleanNote,

               sourceTitle: sanitizeCalendarTitle(selectedEvent.title),

               sourceContent: buildEventContext(selectedEvent, cleanNote),

               workingSummary: sanitizeCalendarSummary(cleanNote),

               cleanSourceContent: buildEventContext(selectedEvent, cleanNote),

               workflowId: selectedEvent.id,

               originProjectsItemId: selectedEvent.id,

               createdAt: getNow(),
            },
         }),
      );

      syncCalendarStatus("schedule-context-active");

      setNoteDraft("");

      showNotice("Note saved");
   }

   function clearNoteDraft() {
      setNoteDraft("");

      showNotice("Note draft cleared");
   }

   function getLatestNoteForEvent(event?: AllevinCalendarEvent) {
      if (!event) {
         return "";
      }

      const latestStoredNote = sortNotes(notes.filter((note) => note.eventId === event.id))[0]?.note || "";

      if (event.id === selectedEvent?.id) {
         return latestStoredNote || noteDraft;
      }

      return latestStoredNote;
   }

   function getNotesForEvent(event?: AllevinCalendarEvent) {
      if (!event) {
         return [];
      }

      return sortNotes(notes.filter((note) => note.eventId === event.id));
   }

   function getReadableSchedule() {
      const intelligence = getCalendarIntelligenceSummary(hydratedEvents);

      if (!intelligence.today.length && !intelligence.upcoming.length) {
         return "No events are saved right now.";
      }

      return intelligence.today.length
         ? intelligence.todayReadback
         : intelligence.upcoming
              .slice(0, 5)
              .map((event) => getCalendarReadbackLine(event))
              .join("\n");
   }

   function sendScheduleReadbackToAIDock() {
      const intelligence = getCalendarIntelligenceSummary(hydratedEvents);

      const readback = sanitizeCalendarPlainText(
         `
Calendar Summary

${intelligence.today.length ? "Today's events:" : "Upcoming events:"}
${getReadableSchedule()}

Tomorrow:
${intelligence.tomorrowReadback || "No events scheduled tomorrow."}

Recurring:
${intelligence.recurringReadback || "No recurring events scheduled."}

Next:
Ask what is on your calendar, what you have tomorrow, or what you should schedule next.
      `.trim(),
         CALENDAR_SANITIZE_LIMITS.readback,
      );

      window.dispatchEvent(
         new CustomEvent("allevin-calendar-readback", {
            detail: {
               title: "Calendar Summary",

               body: readback,

               events: intelligence.today.length ? intelligence.today : intelligence.upcoming,

               todayEvents: intelligence.today,

               tomorrowEvents: intelligence.tomorrow,

               recurringEvents: intelligence.recurring,

               nextEvent: intelligence.nextEvent,
            },
         }),
      );

      window.dispatchEvent(
         new CustomEvent("allevin-log-workflow-event", {
            detail: {
               id: crypto.randomUUID(),

               type: "insight",

               source: "calendar",

               destination: "system",

               title: "Calendar summary prepared",

               summary: readback,

               sourceTitle: "Calendar",

               sourceContent: readback,

               workingSummary: readback,

               cleanSourceContent: readback,

               workflowId: "calendar-readback",

               originProjectsItemId: "calendar-readback",

               createdAt: getNow(),
            },
         }),
      );

      syncCalendarStatus("schedule-context-active");

      showNotice("Calendar summary ready");
   }

   // ========================================
   // Native Month View Helpers
   // ========================================

   function moveVisibleMonth(offset: number) {
      const date = new Date(visibleMonthDate);

      date.setMonth(date.getMonth() + offset);

      date.setDate(1);

      date.setHours(0, 0, 0, 0);

      setVisibleMonthDate(date.getTime());

      setMonthJumpOpen(false);
   }

   function jumpToCalendarMonth(monthIndex: number, year: number) {
      const date = new Date(year, monthIndex, 1);

      date.setHours(0, 0, 0, 0);

      setVisibleMonthDate(date.getTime());

      setMonthJumpOpen(false);
   }

   function jumpToToday() {
      const today = new Date();

      today.setHours(0, 0, 0, 0);

      setSelectedDayDate(today.getTime());

      setVisibleMonthDate(new Date(today.getFullYear(), today.getMonth(), 1).getTime());

      setMonthJumpOpen(false);
   }

   function selectCalendarDay(timestamp: number) {
      setSelectedDayDate(getStartOfDay(timestamp));

      const dayEvents = getEventsForDay(readableEvents, timestamp);

      if (dayEvents[0]) {
         selectEvent(dayEvents[0]);
      } else {
         syncCalendarStatus("schedule-context-active");

         showNotice("Day selected");
      }
   }

   // ========================================
   // Render Helpers
   // ========================================

   function toggleEventDetails(eventId: string) {
      setExpandedEventIds((current) => (current.includes(eventId) ? current.filter((id) => id !== eventId) : [eventId, ...current].slice(0, 12)));
   }

   function renderEventCard(event: AllevinCalendarEvent) {
      const selected = event.id === selectedEvent?.id;

      const expanded = expandedEventIds.includes(event.id);

      const hasDetails = Boolean(event.description || event.location || event.sourceContent || event.workingSummary);

      return (
         <div
            key={event.id}
            className={`
               border-b
               border-[var(--border-subtle)]
               px-1
               py-4
               transition-colors

               ${selected ? "bg-[var(--color-surface-blue)]" : "bg-transparent"}
            `}
         >
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
               <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{event.title}</p>

                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{getDateLabel(event.startTime)}</p>
               </div>

               <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">{event.repeat && event.repeat !== "none" ? getRepeatLabel(event.repeat) : getEventStatus(event)}</span>
            </div>

            <div className="space-y-2 text-xs text-[var(--color-text-secondary)]">
               <div className="flex items-center gap-2">
                  <Clock3 size={13} />

                  <span>
                     {getEventTimeRangeLabel(event)} • {event.allDay ? getRepeatLabel(event.repeat) : getDurationLabel(event.startTime, event.endTime)}
                  </span>
               </div>

               {event.location && (
                  <div className="flex items-center gap-2">
                     <MapPin size={13} />

                     <span>{event.location}</span>
                  </div>
               )}
            </div>

            {event.description && <p className={`mt-3 text-xs leading-5 text-[var(--color-text-secondary)] ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}>{event.description}</p>}

            <AnimatePresence initial={false}>
               {expanded && hasDetails && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                     <div className="mt-3 space-y-3 border-t border-[var(--border-subtle)] pt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                        {event.sourceContent && event.sourceContent !== event.description && (
                           <div>
                              <p className="font-medium text-[var(--color-text-primary)]">Project notes</p>

                              <p className="mt-1 whitespace-pre-wrap">{event.sourceContent}</p>
                           </div>
                        )}

                        {event.workingSummary && event.workingSummary !== event.description && event.workingSummary !== event.sourceContent && (
                           <div>
                              <p className="font-medium text-[var(--color-text-primary)]">Summary</p>

                              <p className="mt-1 whitespace-pre-wrap">{event.workingSummary}</p>
                           </div>
                        )}
                     </div>
                  </motion.div>
               )}
            </AnimatePresence>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
               <button onClick={() => toggleEventDetails(event.id)} className="studio-button-secondary min-h-9 w-full justify-center px-3 py-2 text-xs" disabled={!hasDetails}>
                  <ChevronDown size={13} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                  {expanded ? "Hide details" : "Show details"}
               </button>

               <button onClick={() => deleteEvent(event.id)} className="studio-button-secondary min-h-9 w-full justify-center px-3 py-2 text-xs">
                  <Trash2 size={13} />
                  Delete
               </button>
            </div>
         </div>
      );
   }

   // ========================================
   // Render
   // ========================================

   if (!mounted) {
      return null;
   }

   return (
      <motion.section
         id="calendar"
         layout
         initial={{ opacity: 0, y: 10 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: 0.35 }}
         className="
            min-w-0
            bg-transparent
            pb-8
         "
      >
         {/* Header */}

         <div className="mb-6 flex flex-col gap-5 border-b border-[var(--border-subtle)] pb-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
               <p className="studio-eyebrow">Calendar</p>

               <h2 data-editorial-title="true" className="mt-2 text-4xl leading-tight sm:text-5xl">
                  Plan the time around the work.
               </h2>
            </div>

            {notice && <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-blue)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">{notice}</div>}
         </div>

         {/* Add Event */}

         <div className="mb-6 border-b border-[var(--border-subtle)] pb-5">
            <button onClick={() => setManualOpen((current) => !current)} className="flex w-full items-start justify-between gap-3 text-left sm:items-center">
               <div className="flex items-start gap-3 sm:items-center">
                  <Plus size={18} />

                  <div>
                     <p className="font-medium">Add Event</p>

                     <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Add a time block, deadline, or event when the work needs a place on the schedule.</p>
                  </div>
               </div>

               <ChevronDown size={18} className={`transition-transform duration-200 ${manualOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence initial={false}>
               {manualOpen && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                     <div className="studio-paper mt-4 space-y-4 p-4 sm:p-6">
                        <input
                           value={newEventTitle}
                           onChange={(event) => setNewEventTitle(sanitizeLiveCalendarTitle(event.target.value))}
                           placeholder="Title"
                           className="
                              w-full
                              rounded-2xl
                              border
                              border-[var(--border-subtle)]
                              bg-[var(--color-bg)]
                              p-4
                              text-sm
                              outline-none
                           "
                        />

                        <input
                           value={newEventLocation}
                           onChange={(event) => setNewEventLocation(sanitizeLiveCalendarLocation(event.target.value))}
                           placeholder="Location"
                           className="
                              w-full
                              rounded-2xl
                              border
                              border-[var(--border-subtle)]
                              bg-[var(--color-bg)]
                              p-4
                              text-sm
                              outline-none
                           "
                        />

                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-4">
                           <label className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                              <span className="text-sm font-medium">All-day</span>

                              <button
                                 type="button"
                                 onClick={() => setNewEventAllDay((current) => !current)}
                                 className={`
                                    flex
                                    min-w-[92px]
                                    items-center
                                    justify-center
                                    rounded-full
                                    border
                                    px-4
                                    py-2
                                    text-xs
                                    font-semibold
                                    transition-colors

                                    ${newEventAllDay ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-cream)] shadow-[var(--shadow-soft)]" : "border-[var(--border-subtle)] bg-white text-[var(--color-text-secondary)]"}
                                 `}
                                 aria-pressed={newEventAllDay}
                              >
                                 {newEventAllDay ? "On" : "Off"}
                              </button>
                           </label>
                        </div>

                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-4">
                           <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                              <p className="text-sm font-medium">Starts</p>

                              <div className={`grid w-full gap-2 sm:w-auto ${newEventAllDay ? "grid-cols-1" : "grid-cols-2"}`}>
                                 <input type="date" value={newEventStartDate} onChange={(event) => setNewEventStartDate(event.target.value)} className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none" />

                                 {!newEventAllDay && (
                                    <input type="time" value={newEventStartTime} onChange={(event) => setNewEventStartTime(event.target.value)} className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none" />
                                 )}
                              </div>
                           </div>

                           <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                              <p className="text-sm font-medium">Ends</p>

                              <div className={`grid w-full gap-2 sm:w-auto ${newEventAllDay ? "grid-cols-1" : "grid-cols-2"}`}>
                                 <input type="date" value={newEventEndDate} onChange={(event) => setNewEventEndDate(event.target.value)} className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none" />

                                 {!newEventAllDay && (
                                    <input type="time" value={newEventEndTime} onChange={(event) => setNewEventEndTime(event.target.value)} className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none" />
                                 )}
                              </div>
                           </div>
                        </div>

                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--color-bg)] p-4">
                           <label className="flex items-center justify-between gap-4">
                              <span className="text-sm font-medium">Repeat</span>

                              <select value={newEventRepeat} onChange={(event) => setNewEventRepeat(event.target.value as AllevinCalendarEvent["repeat"])} className="rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm outline-none">
                                 <option value="none">Never</option>
                                 <option value="daily">Every Day</option>
                                 <option value="weekly">Every Week</option>
                                 <option value="monthly">Every Month</option>
                                 <option value="yearly">Every Year</option>
                              </select>
                           </label>
                        </div>

                        <textarea
                           value={newEventDescription}
                           onChange={(event) => setNewEventDescription(sanitizeLiveCalendarDescription(event.target.value))}
                           placeholder="Notes"
                           className="
                              min-h-[100px]
                              w-full
                              resize-none
                              rounded-2xl
                              border
                              border-[var(--border-subtle)]
                              bg-[var(--color-bg)]
                              p-4
                              text-sm
                              leading-7
                              outline-none
                           "
                        />

                        <div className="grid grid-cols-1 gap-3">
                           <button onClick={addManualEvent} className="studio-button-primary w-full justify-center">
                              <Plus size={16} />
                              Add Event
                           </button>
                        </div>
                     </div>
                  </motion.div>
               )}
            </AnimatePresence>
         </div>

         {/* Month View */}

         <div className="studio-paper mb-5 p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-end gap-2">
               <button
                  type="button"
                  onClick={() => moveVisibleMonth(-1)}
                  aria-label="Previous month"
                  title="Previous month"
                  className="
                     flex
                     h-10
                     w-10
                     items-center
                     justify-center
                     rounded-[var(--radius-md)]
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-surface)]
                     text-[var(--color-text-secondary)]
                     transition-colors
                     hover:bg-[var(--color-bg-soft)]
                     hover:text-[var(--color-text-primary)]
                  "
               >
                  <span aria-hidden="true" className="text-xl leading-none">
                     ←
                  </span>
               </button>

               <button
                  type="button"
                  onClick={() => moveVisibleMonth(1)}
                  aria-label="Next month"
                  title="Next month"
                  className="
                     flex
                     h-10
                     w-10
                     items-center
                     justify-center
                     rounded-[var(--radius-md)]
                     border
                     border-[var(--border-subtle)]
                     bg-[var(--color-surface)]
                     text-[var(--color-text-secondary)]
                     transition-colors
                     hover:bg-[var(--color-bg-soft)]
                     hover:text-[var(--color-text-primary)]
                  "
               >
                  <span aria-hidden="true" className="text-xl leading-none">
                     →
                  </span>
               </button>
            </div>

            <div className="mb-5 border-y border-[var(--border-subtle)] py-5">
               <div className="relative">
                  <button onClick={() => setMonthJumpOpen((current) => !current)} className="flex items-center gap-3 text-left transition-colors hover:text-[var(--color-primary)]" aria-expanded={monthJumpOpen}>
                     <span data-editorial-title="true" className="text-3xl leading-tight sm:text-4xl">
                        {visibleMonthLabel}
                     </span>

                     <ChevronDown size={18} className={`transition-transform ${monthJumpOpen ? "rotate-180" : ""}`} />
                  </button>
               </div>

               <AnimatePresence initial={false}>
                  {monthJumpOpen && (
                     <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        <div className="mt-4 grid grid-cols-1 gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--color-surface)] p-4 sm:grid-cols-2">
                           <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                              Month
                              <select
                                 value={visibleMonthIndex}
                                 onChange={(event) => jumpToCalendarMonth(Number(event.target.value), visibleYear)}
                                 className="mt-2 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] outline-none"
                              >
                                 {CALENDAR_MONTH_OPTIONS.map((month, index) => (
                                    <option key={month} value={index}>
                                       {month}
                                    </option>
                                 ))}
                              </select>
                           </label>

                           <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                              Year
                              <select
                                 value={visibleYear}
                                 onChange={(event) => jumpToCalendarMonth(visibleMonthIndex, Number(event.target.value))}
                                 className="mt-2 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--color-bg)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] outline-none"
                              >
                                 {calendarYearOptions.map((year) => (
                                    <option key={year} value={year}>
                                       {year}
                                    </option>
                                 ))}
                              </select>
                           </label>
                        </div>
                     </motion.div>
                  )}
               </AnimatePresence>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.9fr]">
               <div>
                  <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
                     {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="border-b border-[var(--border-subtle)] px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)] sm:px-2 sm:text-xs">
                           {day}
                        </div>
                     ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1 sm:gap-2">
                     {monthGridDays.map((day) => {
                        const dayEvents = getEventsForDay(hydratedEvents, day.timestamp);

                        const selected = isSameCalendarDay(day.timestamp, selectedDayDate);

                        return (
                           <button
                              key={day.timestamp}
                              onClick={() => selectCalendarDay(day.timestamp)}
                              className={`
                                 min-h-[58px]
                                 rounded-[var(--radius-md)]
                                 sm:min-h-[92px]
                                 border
                                 p-1.5
                                 text-left
                                 sm:p-2
                                 transition-colors

                                 ${
                                    selected
                                       ? `
                                          border-[var(--color-primary)]
                                          bg-[rgba(48,92,222,0.08)]
                                       `
                                       : `
                                          border-[var(--border-subtle)]
                                          bg-[var(--color-surface)]
                                          hover:bg-[var(--color-bg-soft)]
                                       `
                                 }

                                 ${day.isCurrentMonth ? "" : "opacity-45"}
                              `}
                           >
                              <div className="mb-1 flex items-center justify-between gap-1 sm:mb-2 sm:gap-2">
                                 <span className={`text-xs font-medium sm:text-sm ${day.isToday ? "text-[var(--color-primary)]" : ""}`}>{getShortDayNumber(day.timestamp)}</span>

                                 {dayEvents.length > 0 && <span className="rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-cream)] shadow-sm sm:px-2">{dayEvents.length}</span>}
                              </div>

                              <div className="hidden space-y-1 sm:block">
                                 {dayEvents.slice(0, 2).map((event) => (
                                    <div key={event.id} className="truncate rounded-lg border border-[rgba(48,92,222,0.22)] bg-[rgba(48,92,222,0.12)] px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)]">
                                       {event.allDay ? "All day" : getShortTimeLabel(event.startTime)} {event.title}
                                    </div>
                                 ))}

                                 {dayEvents.length > 2 && <div className="px-2 text-[10px] text-[var(--color-text-secondary)]">+{dayEvents.length - 2} more</div>}
                              </div>
                           </button>
                        );
                     })}
                  </div>
               </div>

               <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                     <div>
                        <p className="text-xs uppercase tracking-[0.15em] text-[var(--color-text-secondary)]">Day</p>

                        <h3 className="mt-1 text-xl">{getDateLabel(selectedDayDate)}</h3>
                     </div>

                     <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">
                        {selectedDayEvents.length} event
                        {selectedDayEvents.length === 1 ? "" : "s"}
                     </span>
                  </div>

                  <div className="space-y-3">
                     {selectedDayEvents.length === 0 ? (
                        <div className="border-y border-[var(--border-subtle)] py-5 text-sm leading-6 text-[var(--color-text-secondary)]">No events scheduled for this day.</div>
                     ) : (
                        selectedDayEvents.map((event) => renderEventCard(event))
                     )}
                  </div>
               </div>
            </div>
         </div>
      </motion.section>
   );
}
