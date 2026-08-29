import {
   localDateKey,
   minutesFromClock,
   type RhythmEntry,
} from "./dailyRhythm";
import type { LifeItem } from "./lifeTypes";
import {
   createNotificationCopyContext,
   type NotificationCopyContext,
   type NotificationCopyPhase,
   type NotificationTimelineItem,
} from "./allevinNotificationCopy";
import type { AllevinTone } from "./allevinVoice";

type ReminderPriority = 1 | 2 | 3 | 4 | 5;

export function timestampForLocalClock(date: Date, clock: string) {
   const target = new Date(date);
   const minutes = minutesFromClock(clock);
   target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
   return target.getTime();
}

export function rhythmEntryEndAt(date: Date, entry: RhythmEntry) {
   const startAt = timestampForLocalClock(date, entry.time);
   if (entry.endTime) {
      let endAt = timestampForLocalClock(date, entry.endTime);
      if (endAt < startAt) endAt += 24 * 60 * 60 * 1000;
      return endAt;
   }
   return startAt + Math.max(0, entry.durationMinutes || 0) * 60_000;
}

function lifeStartAt(item: LifeItem) {
   return item.startAt || item.dueAt || 0;
}

function lifeEndAt(item: LifeItem) {
   const startAt = lifeStartAt(item);
   return item.endAt && item.endAt >= startAt
      ? item.endAt
      : startAt + Math.max(5, item.durationMinutes || 30) * 60_000;
}

export function timedLifeItemsForDate(items: LifeItem[], date: Date) {
   const dateKey = localDateKey(date);
   return items.filter((item) => {
      const startAt = lifeStartAt(item);
      return item.state === "active" &&
         (item.kind === "commitment" || item.kind === "task") &&
         item.timingPrecision === "exact" &&
         !item.allDay &&
         Boolean(startAt) &&
         localDateKey(new Date(startAt)) === dateKey;
   });
}

export function buildNotificationTimeline(date: Date, entries: RhythmEntry[], lifeItems: LifeItem[]): NotificationTimelineItem[] {
   const rhythmTimeline = entries
      .filter((entry) => !entry.completed && !entry.skipped)
      .map((entry) => ({
         id: `rhythm:${entry.id}`,
         title: entry.title,
         category: entry.category,
         startAt: timestampForLocalClock(date, entry.time),
         endAt: rhythmEntryEndAt(date, entry),
      }));
   const lifeTimeline = timedLifeItemsForDate(lifeItems, date).map((item) => ({
      id: `life:${item.id}`,
      title: item.title,
      category: item.context === "personal" ? item.kind : item.context,
      startAt: lifeStartAt(item),
      endAt: lifeEndAt(item),
   }));
   return [...rhythmTimeline, ...lifeTimeline].sort((left, right) => left.startAt - right.startAt || left.title.localeCompare(right.title));
}

export function rhythmNotificationContext({
   id,
   entry,
   date,
   phase,
   tone,
   priority,
   leadMinutes,
   timeline,
}: {
   id: string;
   entry: RhythmEntry;
   date: Date;
   phase: NotificationCopyPhase;
   tone: AllevinTone;
   priority: ReminderPriority;
   leadMinutes: number;
   timeline: NotificationTimelineItem[];
}): NotificationCopyContext {
   const startAt = timestampForLocalClock(date, entry.time);
   return createNotificationCopyContext({
      id,
      occurrenceKey: `${localDateKey(date)}:rhythm:${entry.id}:${phase}:${startAt}`,
      title: entry.title,
      category: entry.category,
      phase,
      tone,
      priority,
      leadMinutes,
      startAt,
      endAt: rhythmEntryEndAt(date, entry),
      timelineId: `rhythm:${entry.id}`,
      timeline,
   });
}

export function lifeNotificationContext({
   id,
   item,
   phase,
   tone,
   priority,
   leadMinutes,
   timeline,
}: {
   id: string;
   item: LifeItem;
   phase: NotificationCopyPhase;
   tone: AllevinTone;
   priority: ReminderPriority;
   leadMinutes: number;
   timeline: NotificationTimelineItem[];
}): NotificationCopyContext {
   const startAt = lifeStartAt(item);
   const dateKey = localDateKey(new Date(startAt));
   return createNotificationCopyContext({
      id,
      occurrenceKey: `${dateKey}:life:${item.id}:${phase}:${startAt}`,
      title: item.title,
      reason: item.details,
      category: item.context === "personal" ? item.kind : item.context,
      phase,
      tone,
      priority,
      leadMinutes,
      startAt,
      endAt: lifeEndAt(item),
      timelineId: `life:${item.id}`,
      timeline,
   });
}
