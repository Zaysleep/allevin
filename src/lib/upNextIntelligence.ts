import { buildRhythmForDate, localDateKey, type DailyRhythmState, type RhythmCategory, type RhythmEntry } from "@/lib/dailyRhythm";
import type { LifeItem, LifeState } from "@/lib/lifeTypes";

export type UpNextSource = "rhythm" | "life";

export interface UpNextItem {
   id: string;
   title: string;
   source: UpNextSource;
   category: RhythmCategory;
   at: number;
   endAt?: number;
   durationMinutes?: number;
   dateKey: string;
   rhythm?: RhythmEntry;
   life?: LifeItem;
}

function lifeTimestamp(item: LifeItem) {
   return item.startAt || item.dueAt;
}

function localTimestampForClock(date: Date, clock: string) {
   const [hours, minutes] = clock.split(":").map(Number);
   return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours || 0, minutes || 0, 0, 0).getTime();
}

function rhythmCandidate(entry: RhythmEntry, date: Date, nowMs: number): UpNextItem | null {
   if (entry.completed || entry.skipped || entry.status === "missed") return null;
   const startAt = localTimestampForClock(date, entry.time);
   const endAt = entry.endTime
      ? localTimestampForClock(date, entry.endTime)
      : startAt + Math.max(5, entry.durationMinutes || 30) * 60_000;

   if (localDateKey(date) === localDateKey(new Date(nowMs)) && endAt < nowMs) return null;

   return {
      id: entry.id,
      title: entry.title,
      source: "rhythm",
      category: entry.category,
      at: startAt <= nowMs && endAt >= nowMs ? nowMs - 1 : startAt,
      endAt,
      durationMinutes: entry.durationMinutes,
      dateKey: localDateKey(date),
      rhythm: entry,
   };
}

function lifeCategory(item: LifeItem): RhythmCategory {
   if (item.context === "work") return "work";
   if (item.context === "school") return "school";
   if (item.context === "home") return "home";
   if (item.context === "health") return "personal";
   return "personal";
}

function lifeCandidate(item: LifeItem, nowMs: number): UpNextItem | null {
   if (item.state !== "active") return null;
   const timestamp = lifeTimestamp(item);
   if (!timestamp && item.pinToToday) {
      return {
         id: item.id,
         title: item.title,
         source: "life",
         category: lifeCategory(item),
         at: nowMs,
         durationMinutes: item.durationMinutes,
         dateKey: localDateKey(new Date(nowMs)),
         life: item,
      };
   }
   if (!timestamp) return null;
   const endAt = item.endAt || timestamp + Math.max(5, item.durationMinutes || 30) * 60_000;
   if (endAt < nowMs) return null;

   return {
      id: item.id,
      title: item.title,
      source: "life",
      category: lifeCategory(item),
      at: timestamp <= nowMs && endAt >= nowMs ? nowMs - 1 : timestamp,
      endAt,
      durationMinutes: item.durationMinutes,
      dateKey: localDateKey(new Date(timestamp)),
      life: item,
   };
}

export function buildUpNextItem(lifeState: LifeState, rhythmState: DailyRhythmState, nowMs = Date.now()): UpNextItem | null {
   const now = new Date(nowMs);
   const candidates: UpNextItem[] = [];

   for (let offset = 0; offset < 8; offset += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      date.setHours(12, 0, 0, 0);

      for (const entry of buildRhythmForDate(rhythmState, date)) {
         const candidate = rhythmCandidate(entry, date, nowMs);
         if (candidate) candidates.push(candidate);
      }
   }

   for (const item of lifeState.items) {
      const candidate = lifeCandidate(item, nowMs);
      if (!candidate) continue;
      if (candidate.at > nowMs + 8 * 24 * 60 * 60_000) continue;
      candidates.push(candidate);
   }

   // A long schedule block (Work/Class/etc.) is ongoing context, not the only
   // thing that can matter while it is active. A specific routine or one-off
   // commitment that is already underway temporarily becomes the immediate
   // focus; when it ends, the parent schedule naturally becomes current again.
   const activeSpecific = candidates
      .filter(
         (candidate) =>
            candidate.at <= nowMs &&
            Boolean(candidate.endAt && candidate.endAt >= nowMs) &&
            !(candidate.source === "rhythm" && candidate.rhythm?.kind === "schedule"),
      )
      .sort((left, right) => {
         if (left.source !== right.source) return left.source === "life" ? -1 : 1;
         return left.title.localeCompare(right.title);
      })[0];
   if (activeSpecific) return activeSpecific;

   const ongoingSchedules = candidates.filter(
      (candidate) =>
         candidate.source === "rhythm" &&
         candidate.rhythm?.kind === "schedule" &&
         candidate.at <= nowMs &&
         Boolean(candidate.endAt && candidate.endAt >= nowMs),
   );

   if (ongoingSchedules.length) {
      // If a one-off commitment inside the current parent block is close enough
      // that the user should start switching context, surface the child as Up
      // Next without ending/removing the parent. Thirty minutes is a transition
      // horizon, not a claim that every event needs thirty minutes of travel.
      const transitionHorizonMs = 30 * 60_000;
      const nestedSoon = candidates
         .filter((candidate) => {
            if (candidate.source !== "life" || !candidate.life?.startAt) return false;
            const startAt = candidate.life.startAt;
            if (startAt <= nowMs || startAt > nowMs + transitionHorizonMs) return false;
            return ongoingSchedules.some(
               (parent) =>
                  Boolean(parent.endAt) &&
                  startAt >= nowMs &&
                  startAt <= (parent.endAt as number),
            );
         })
         .sort(
            (left, right) =>
               (left.life?.startAt || left.at) - (right.life?.startAt || right.at) ||
               left.title.localeCompare(right.title),
         )[0];

      if (nestedSoon) return nestedSoon;

      return ongoingSchedules.sort(
         (left, right) =>
            (left.endAt || Number.MAX_SAFE_INTEGER) - (right.endAt || Number.MAX_SAFE_INTEGER),
      )[0];
   }

   // An untimed/flexible item can be more useful than merely echoing the next
   // chronological row, but it must fit cleanly before the next hard boundary.
   // This is guidance over known state—not an optimization score exposed to
   // the user, and never a claim that a flexible item was completed.
   const todayKey = localDateKey(now);
   const upcomingHard = candidates
      .filter((candidate) => candidate.at >= nowMs)
      .filter((candidate) => candidate.source === "life" ? candidate.life?.kind === "commitment" : candidate.rhythm?.kind === "schedule")
      .sort((left, right) => left.at - right.at)[0];
   const openMinutes = upcomingHard ? Math.floor((upcomingHard.at - nowMs) / 60_000) : 180;
   const recoveryDay = (rhythmState.dayContexts[todayKey] || []).some((context) => context.kind === "recovery" || context.kind === "sleep-in");
   const tomorrow = new Date(now);
   tomorrow.setDate(now.getDate() + 1);
   const tomorrowLoad = buildRhythmForDate(rhythmState, tomorrow).filter((entry) => !entry.skipped).length +
      lifeState.items.filter((item) => item.state === "active" && Boolean(lifeTimestamp(item)) && localDateKey(new Date(lifeTimestamp(item) || 0)) === localDateKey(tomorrow)).length;
   const flexibleNow = candidates
      .filter((candidate) => candidate.dateKey === todayKey && candidate.at <= nowMs + 15 * 60_000)
      .filter((candidate) => candidate.source === "life" ? candidate.life?.kind !== "commitment" : candidate.rhythm?.kind === "anchor" && candidate.rhythm.flexible)
      .filter((candidate) => (candidate.durationMinutes || 30) + 10 <= openMinutes)
      .filter((candidate) => !(recoveryDay && candidate.category === "exercise"))
      .sort((left, right) => {
         const importance = { low: 0, normal: 12, high: 28 };
         const leftScore = (left.life ? importance[left.life.importance] : 10) + (tomorrowLoad >= 6 && (left.durationMinutes || 30) <= 30 ? 6 : 0);
         const rightScore = (right.life ? importance[right.life.importance] : 10) + (tomorrowLoad >= 6 && (right.durationMinutes || 30) <= 30 ? 6 : 0);
         return rightScore - leftScore || (left.durationMinutes || 30) - (right.durationMinutes || 30) || left.title.localeCompare(right.title);
      })[0];
   if (flexibleNow && openMinutes >= 30) return flexibleNow;

   return candidates.sort((left, right) => left.at - right.at || left.title.localeCompare(right.title))[0] || null;
}

export function upNextTimeLabel(item: UpNextItem, nowMs = Date.now()) {
   const at = new Date(item.at <= nowMs ? nowMs : item.at);
   const now = new Date(nowMs);
   const dayDiff = Math.round(
      (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
   );
   const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
   if (item.at <= nowMs && item.endAt && item.endAt >= nowMs) return `Now · until ${new Date(item.endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
   if (dayDiff === 0) return `Today · ${time}`;
   if (dayDiff === 1) return `Tomorrow · ${time}`;
   return `${at.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

export function suggestionCategoryForUpNext(item: UpNextItem) {
   const title = item.title.toLowerCase();
   if (item.category === "exercise" || /workout|gym|run|cardio|strength|lift|yoga|mobility/.test(title)) return "workout" as const;
   if (/dinner|supper|cook|unwind/.test(title)) return "dinner" as const;
   if (/breakfast|coffee|matcha|morning meal/.test(title)) return "breakfast" as const;
   if (item.category === "meal" || /\b(?:meal|eat|lunch)\b/.test(title)) {
      return new Date(item.at).getHours() >= 15 ? "dinner" as const : "breakfast" as const;
   }
   if (/dentist|doctor|appointment|checkup|meeting|call|reservation|interview/.test(title)) return "appointment" as const;
   if (/grocery|groceries|shopping|pick up|pickup|drop off|return|buy|errand/.test(title)) return "errand" as const;
   if (/email|form|paperwork|submit|renew|application|book|schedule/.test(title)) return "admin" as const;
   if (item.category === "work" || item.category === "school") return "focus" as const;
   if (/hygiene|shower|wash|brush|dress|get ready|prep|commute|leave|pack/.test(title)) return "transition" as const;
   return "general" as const;
}

export function minutesAvailableForUpNext(item: UpNextItem, nowMs = Date.now()) {
   if (item.durationMinutes) return Math.max(5, item.durationMinutes);
   if (item.endAt && item.at <= nowMs && item.endAt > nowMs) return Math.max(5, Math.round((item.endAt - nowMs) / 60_000));
   if (item.at > nowMs) return Math.max(5, Math.min(120, Math.round((item.at - nowMs) / 60_000)));
   return 30;
}
