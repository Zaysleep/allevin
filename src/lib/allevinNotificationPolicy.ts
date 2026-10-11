import type { NotificationPreferences } from "@/lib/allevinNotificationHealth";
import type { RhythmEntry } from "@/lib/dailyRhythm";
import type { LifeItem } from "@/lib/lifeTypes";

export type NotificationInteractionKind = "none" | "confirm-plan" | "open-briefing";

export interface NotificationInteractionContext {
   kind: NotificationInteractionKind;
   source?: "rhythm" | "life";
   sourceId?: string;
   dateKey?: string;
   title?: string;
}

function commuteLike(title: string) {
   return /\b(?:commute|drive|leave|depart|travel)\b/i.test(title);
}

export function rhythmInteractionKind(entry: RhythmEntry, preferences: NotificationPreferences): NotificationInteractionKind {
   if (!preferences.contextualCheckInsEnabled) return "none";
   if (commuteLike(entry.title)) return preferences.checkInCommutes ? "confirm-plan" : "none";
   if (entry.kind === "schedule" || entry.category === "work" || entry.category === "school") {
      return preferences.checkInWorkSchool ? "confirm-plan" : "none";
   }
   return preferences.checkInRoutines ? "confirm-plan" : "none";
}

export function lifeInteractionKind(item: LifeItem, preferences: NotificationPreferences): NotificationInteractionKind {
   if (!preferences.contextualCheckInsEnabled || item.recurrence !== "none") return "none";
   if (commuteLike(item.title)) return preferences.checkInCommutes ? "confirm-plan" : "none";
   return preferences.checkInAppointments ? "confirm-plan" : "none";
}

export function isDuringQuietHours(at: number, preferences: NotificationPreferences) {
   if (!preferences.quietHoursEnabled) return false;
   const date = new Date(at);
   const minutes = date.getHours() * 60 + date.getMinutes();
   const [startHours, startMinutes] = preferences.quietHoursStart.split(":").map(Number);
   const [endHours, endMinutes] = preferences.quietHoursEnd.split(":").map(Number);
   const start = startHours * 60 + startMinutes;
   const end = endHours * 60 + endMinutes;
   return start === end ? true : start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function shouldSuppressForQuietHours(at: number, priority: number, preferences: NotificationPreferences) {
   if (!isDuringQuietHours(at, preferences)) return false;
   // Urgent commitments may still pass when the user explicitly allows them;
   // routine nudges never punch through a quiet window.
   return !(preferences.allowImportantDuringQuietHours && priority >= 4);
}
