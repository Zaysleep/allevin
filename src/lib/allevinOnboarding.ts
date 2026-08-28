"use client";

import {
   clockFromMinutes,
   minutesFromClock,
   readDailyRhythm,
   saveDailyRhythm,
   type RhythmAnchor,
   type RhythmCategory,
   type RhythmDay,
   type RhythmScheduleBlock,
} from "@/lib/dailyRhythm";
import {
   readLifestyleProfile,
   saveLifestyleProfile,
   type FlexibleChoiceSet,
} from "@/lib/allevinLifestyleProfile";
import { getAllevinUserProfile, saveAllevinUserProfile } from "@/lib/allevinUserProfile";
import { ALLEVIN_TONE_STORAGE_KEY, readAllevinTone, saveAllevinTone, type AllevinTone } from "@/lib/allevinVoice";
import { readLifeState } from "@/lib/lifeStore";
import { appendKinMessage, readKinConversation } from "@/lib/kinConversation";
import { arrangeOnboardingRoutineTimes, placeNewOnboardingRoutine, representativeScheduleDraft } from "@/lib/onboardingScheduleCore";

export { representativeScheduleDraft } from "@/lib/onboardingScheduleCore";

export const ALLEVIN_ONBOARDING_STORAGE_KEY = "allevin-onboarding-v1";

export type OnboardingMode = "setup" | "install";
export type OnboardingScheduleCategory = "work" | "school" | "other";
export type OnboardingRoutineTiming = "fixed" | "before" | "after";

export interface OnboardingScheduleDraft {
   id: string;
   title: string;
   category: OnboardingScheduleCategory;
   days: RhythmDay[];
   start: string;
   end: string;
}

export interface OnboardingRoutineDraft {
   id: string;
   title: string;
   timing: OnboardingRoutineTiming;
   scheduleBlockId?: string;
   days: RhythmDay[];
   time: string;
   offsetMinutes: number;
   durationMinutes: number;
}

export interface OnboardingDraft {
   name: string;
   scheduleBlocks: OnboardingScheduleDraft[];
   routines: OnboardingRoutineDraft[];
   hobbies: string;
   bedtime: string;
   travelMinutes: string;
   tone: AllevinTone;
}

export interface OnboardingPreviewRow {
   id: string;
   title: string;
   start: string;
   end?: string;
   kind: "commitment" | "routine";
}

interface OnboardingStatus {
   version: 1;
   state: "completed" | "skipped" | "phone-pending";
   at: number;
}

const ALL_DAYS: RhythmDay[] = [0, 1, 2, 3, 4, 5, 6];

function makeId(prefix: string) {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
   }
   return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeText(value: string, limit = 80) {
   return value
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
}

function clampMinutes(value: number, fallback: number, max = 360) {
   if (!Number.isFinite(value) || value <= 0) return fallback;
   return Math.max(5, Math.min(max, Math.round(value)));
}

function categoryForRoutine(title: string): RhythmCategory {
   const lower = title.toLowerCase();
   if (/work|shift|office/.test(lower)) return "work";
   if (/class|school|lecture|study/.test(lower)) return "school";
   if (/exercise|workout|gym|run|walk|yoga|lift|cardio/.test(lower)) return "exercise";
   if (/breakfast|coffee|matcha|lunch|dinner|meal|eat|cook/.test(lower)) return "meal";
   if (/kid|child|parent|care|hygiene|shower|brush|dress/.test(lower)) return "care";
   if (/clean|laundry|home|chore/.test(lower)) return "home";
   return "personal";
}

function scheduleCategory(category: OnboardingScheduleCategory): RhythmCategory {
   if (category === "work") return "work";
   if (category === "school") return "school";
   return "other";
}

function defaultScheduleTitle(category: OnboardingScheduleCategory) {
   if (category === "work") return "Work";
   if (category === "school") return "Class";
   return "Regular schedule";
}

/**
 * “Arrange for me” is intentionally deterministic. It packs before-routines
 * backward from the schedule start and after-routines forward from its end.
 * Users can then adjust ordinary clock fields; they never calculate offsets.
 */
export function arrangeOnboardingRoutines(draft: OnboardingDraft): OnboardingDraft {
   return arrangeOnboardingRoutineTimes(draft);
}

export function placeAddedOnboardingRoutine(draft: OnboardingDraft, routineId: string): OnboardingDraft {
   return placeNewOnboardingRoutine(draft, routineId);
}

function lifestyleChoices(value: string) {
   return [...new Set(
      value
         .split(/\s*(?:,|\/|\bor\b)\s*/i)
         .map((choice) => sanitizeText(choice, 80))
         .filter(Boolean),
   )].slice(0, 12);
}

export function readOnboardingStatus(): OnboardingStatus | null {
   if (typeof window === "undefined") return null;
   try {
      const parsed = JSON.parse(window.localStorage.getItem(ALLEVIN_ONBOARDING_STORAGE_KEY) || "null") as Partial<OnboardingStatus> | null;
      if (!parsed || parsed.version !== 1 || (parsed.state !== "completed" && parsed.state !== "skipped" && parsed.state !== "phone-pending")) return null;
      return { version: 1, state: parsed.state, at: typeof parsed.at === "number" ? parsed.at : Date.now() };
   } catch {
      return null;
   }
}

export function markOnboardingState(state: OnboardingStatus["state"]) {
   if (typeof window === "undefined") return;
   const status: OnboardingStatus = { version: 1, state, at: Date.now() };
   window.localStorage.setItem(ALLEVIN_ONBOARDING_STORAGE_KEY, JSON.stringify(status));
}

/**
 * Existing ALLEVIN users should not suddenly be trapped behind onboarding after
 * an upgrade. First-run onboarding appears automatically only when the browser
 * has no meaningful ALLEVIN setup yet. The guide can always be reopened later
 * from Settings.
 */
export function shouldShowNewUserOnboarding() {
   if (typeof window === "undefined") return false;
   const status = readOnboardingStatus();
   if (status?.state === "phone-pending") return true;
   if (status) return false;
   if (getAllevinUserProfile()) return false;

   const rhythm = readDailyRhythm();
   const lifestyle = readLifestyleProfile();
   const life = readLifeState();

   return !(
      rhythm.scheduleBlocks.length ||
      rhythm.anchors.length ||
      lifestyle.preferredBedtime ||
      lifestyle.commuteMinutes ||
      lifestyle.flexibleChoiceSets.length ||
      life.items.length
   );
}

export function isIosDevice() {
   if (typeof navigator === "undefined") return false;
   return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isInstalledPwa() {
   if (typeof window === "undefined") return false;
   const standaloneNavigator = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
   return standaloneNavigator || window.matchMedia("(display-mode: standalone)").matches;
}

export function deviceTimezoneLabel() {
   if (typeof Intl === "undefined") return "Device time zone";
   return Intl.DateTimeFormat().resolvedOptions().timeZone || "Device time zone";
}

export function createBlankScheduleDraft(): OnboardingScheduleDraft {
   return {
      id: makeId("setup-schedule"),
      title: "",
      category: "work",
      days: [],
      start: "09:00",
      end: "17:00",
   };
}

export function createBlankRoutineDraft(scheduleBlockId?: string): OnboardingRoutineDraft {
   return {
      id: makeId("setup-routine"),
      title: "",
      timing: scheduleBlockId ? "before" : "fixed",
      scheduleBlockId,
      days: [],
      time: "08:00",
      offsetMinutes: 30,
      durationMinutes: 30,
   };
}

function signedRoutineOffset(routine: OnboardingRoutineDraft, linked: Pick<OnboardingScheduleDraft, "start" | "end">) {
   const reference = minutesFromClock(routine.timing === "before" ? linked.start : linked.end);
   const chosen = minutesFromClock(routine.time || "08:00");
   // A time near midnight may belong on the other side of the reference. Pick
   // the closest same/adjacent-day distance, then enforce the chosen relation.
   const candidates = [chosen - reference, chosen + 1440 - reference, chosen - 1440 - reference];
   const expected = candidates
      .filter((offset) => routine.timing === "before" ? offset <= 0 : offset >= 0)
      .sort((left, right) => Math.abs(left) - Math.abs(right))[0];
   if (typeof expected === "number") return expected;
   const fallback = clampMinutes(routine.offsetMinutes, 30, 720);
   return routine.timing === "before" ? -fallback : fallback;
}

/** Live preview is derived from the same relationship math used on commit. */
export function buildOnboardingDayPreview(draft: OnboardingDraft, day: RhythmDay): OnboardingPreviewRow[] {
   const blocks = draft.scheduleBlocks.filter((block) => block.days.includes(day));
   const scheduleRows = blocks.map((block): OnboardingPreviewRow => ({
      id: `schedule:${block.id}`,
      title: sanitizeText(block.title, 120) || defaultScheduleTitle(block.category),
      start: block.start,
      end: block.end,
      kind: "commitment",
   }));
   const routineRows = draft.routines.flatMap((routine): OnboardingPreviewRow[] => {
      if (!sanitizeText(routine.title, 120)) return [];
      if (routine.timing === "fixed") {
         if (routine.days.length && !routine.days.includes(day)) return [];
         return [{ id: `routine:${routine.id}`, title: routine.title, start: routine.time, end: clockFromMinutes(minutesFromClock(routine.time) + clampMinutes(routine.durationMinutes, 30)), kind: "routine" }];
      }
      const referenceDraft = draft.scheduleBlocks.find((block) => block.id === routine.scheduleBlockId);
      if (!referenceDraft) return [];
      const dayBlock = blocks.find((block) => block.id === referenceDraft.id) ||
         (referenceDraft.category !== "other" ? blocks.find((block) => block.category === referenceDraft.category) : undefined);
      if (!dayBlock) return [];
      const reference = minutesFromClock(routine.timing === "before" ? dayBlock.start : dayBlock.end);
      const start = reference + signedRoutineOffset(routine, referenceDraft);
      return [{ id: `routine:${routine.id}`, title: routine.title, start: clockFromMinutes(start), end: clockFromMinutes(start + clampMinutes(routine.durationMinutes, 30)), kind: "routine" }];
   });
   return [...scheduleRows, ...routineRows].sort((left, right) => minutesFromClock(left.start) - minutesFromClock(right.start));
}

/**
 * Reopening the setup guide starts from the user's current recurring state.
 * That keeps “Set up ALLEVIN again” useful rather than forcing a destructive
 * blank-slate wizard every time.
 */
export function onboardingDraftFromCurrentState(): OnboardingDraft {
   const rhythm = readDailyRhythm();
   const lifestyle = readLifestyleProfile();
   const profile = getAllevinUserProfile();

   const scheduleBlocks: OnboardingScheduleDraft[] = rhythm.scheduleBlocks
      .filter((block) => block.enabled)
      .map((block) => ({
         id: block.id,
         title: block.title,
         category: block.category === "work" ? "work" : block.category === "school" ? "school" : "other",
         days: [...block.days],
         start: block.start,
         end: block.end,
      }));

   const routines: OnboardingRoutineDraft[] = rhythm.anchors
      .filter((anchor) => anchor.enabled)
      .map((anchor) => {
         const linkedBlock = anchor.scheduleBlockId
            ? scheduleBlocks.find((block) => block.id === anchor.scheduleBlockId)
            : representativeScheduleDraft(
                 scheduleBlocks,
                 scheduleBlocks.find((block) => scheduleCategory(block.category) === anchor.scheduleCategory)?.category,
              );
         const offset = anchor.scheduleOffsetMinutes ?? 0;
         const relative = anchor.timingMode === "schedule-relative" && Boolean(linkedBlock);
         return {
            id: anchor.id,
            title: anchor.title,
            timing: relative ? (offset < 0 ? "before" : "after") : "fixed",
            scheduleBlockId: linkedBlock?.id,
            days: anchor.dayRule === "everyday" ? [...ALL_DAYS] : [...(anchor.days || [])],
            // Reconstruct the visible example clock from the stored relative
            // offset and the representative schedule instead of trusting an
            // old example time that may have belonged to another shift.
            time: relative && linkedBlock
               ? clockFromMinutes(
                    minutesFromClock(offset < 0 ? linkedBlock.start : linkedBlock.end) + offset,
                 )
               : anchor.time,
            offsetMinutes: relative ? Math.max(5, Math.abs(offset)) : 30,
            durationMinutes: anchor.durationMinutes,
         };
      });

   const hobbies = [...new Set(lifestyle.flexibleChoiceSets.flatMap((set) => set.choices))].join(", ");

   return {
      name: profile?.displayName || "",
      scheduleBlocks,
      routines,
      hobbies,
      bedtime: lifestyle.preferredBedtime || "",
      travelMinutes: lifestyle.commuteMinutes ? String(lifestyle.commuteMinutes) : "",
      // Balanced is the neutral first-run voice. Existing users keep whatever
      // they already selected.
      tone: typeof window !== "undefined" && window.localStorage.getItem(ALLEVIN_TONE_STORAGE_KEY)
         ? readAllevinTone()
         : "balanced",
   };
}

/**
 * Commits the recurring setup in one deterministic transaction-like pass.
 * One-off Calendar events are intentionally untouched. Re-running onboarding
 * replaces the recurring week/routines and clears old date-specific outcomes so
 * an exception from an earlier version of the schedule cannot haunt the new one.
 */
export function applyOnboardingDraft(draft: OnboardingDraft) {
   const cleanName = sanitizeText(draft.name, 40);
   if (!cleanName) throw new Error("Add the name you want ALLEVIN to use first.");

   const incompleteSchedule = draft.scheduleBlocks.find((block) => !block.days.length || !block.start || !block.end);
   if (incompleteSchedule) throw new Error("Choose at least one day, a start time, and an end time for each regular schedule.");

   const untitledRoutine = draft.routines.find((routine) => !sanitizeText(routine.title, 120));
   if (untitledRoutine) throw new Error("Give each routine a name, or remove the empty routine before continuing.");

   const unlinkedRelativeRoutine = draft.routines.find((routine) => routine.timing !== "fixed" && !draft.scheduleBlocks.some((block) => block.id === routine.scheduleBlockId));
   if (unlinkedRelativeRoutine) throw new Error(`Choose which regular schedule ${sanitizeText(unlinkedRelativeRoutine.title, 120)} should happen ${unlinkedRelativeRoutine.timing}.`);

   const scheduleBlocks: RhythmScheduleBlock[] = draft.scheduleBlocks
      .filter((block) => block.days.length && block.start && block.end)
      .map((block) => ({
         id: block.id || makeId("schedule"),
         title: sanitizeText(block.title, 120) || defaultScheduleTitle(block.category),
         category: scheduleCategory(block.category),
         days: [...new Set(block.days)].sort() as RhythmDay[],
         start: block.start,
         end: block.end,
         enabled: true,
      }));

   const anchors: RhythmAnchor[] = draft.routines
      .filter((routine) => sanitizeText(routine.title, 120))
      .map((routine) => {
         const title = sanitizeText(routine.title, 120);
         const durationMinutes = clampMinutes(routine.durationMinutes, 30);
         const linked = scheduleBlocks.find((block) => block.id === routine.scheduleBlockId);

         if (routine.timing !== "fixed" && linked) {
            // The user supplies an ordinary representative-day clock. ALLEVIN derives
            // the relative offset internally and never asks them to calculate
            // raw minutes from a schedule boundary.
            const signedOffset = signedRoutineOffset(routine, linked);
            const referencePoint = routine.timing === "before" ? "start" : "end";
            const reference = minutesFromClock(referencePoint === "start" ? linked.start : linked.end);
            const sameCategoryBlocks = scheduleBlocks.filter((block) => block.category === linked.category);
            const followWholeCategory = linked.category !== "other" && sameCategoryBlocks.length > 1;

            return {
               id: routine.id || makeId("anchor"),
               title,
               category: categoryForRoutine(title),
               time: clockFromMinutes(reference + signedOffset),
               durationMinutes,
               enabled: true,
               reminder: true,
               accountabilityAfterMinutes: 15,
               dayRule: "schedule" as const,
               // If a user has different Work/Class hours on different days,
               // one routine should follow the whole category instead of making
               // them recreate the same routine for every schedule card.
               scheduleBlockId: followWholeCategory ? undefined : linked.id,
               scheduleCategory: linked.category,
               flexible: !/commute|travel|leave/i.test(title),
               timingMode: "schedule-relative" as const,
               scheduleReferencePoint: referencePoint,
               scheduleOffsetMinutes: signedOffset,
            } satisfies RhythmAnchor;
         }

         const days = routine.days.length ? [...new Set(routine.days)].sort() as RhythmDay[] : [...ALL_DAYS];
         const everyday = days.length === 7;
         return {
            id: routine.id || makeId("anchor"),
            title,
            category: categoryForRoutine(title),
            time: routine.time || "08:00",
            durationMinutes,
            enabled: true,
            reminder: true,
            accountabilityAfterMinutes: 15,
            dayRule: everyday ? "everyday" as const : "custom" as const,
            days: everyday ? undefined : days,
            flexible: !/commute|travel|leave/i.test(title),
            timingMode: "fixed" as const,
         } satisfies RhythmAnchor;
      });

   const currentRhythm = readDailyRhythm();
   saveDailyRhythm({
      ...currentRhythm,
      scheduleBlocks,
      anchors,
      completions: {},
      skips: {},
      overrides: {},
      scheduleExceptions: {},
      temporaryEntries: {},
      dayContexts: {},
      outcomes: {},
   });

   const currentLifestyle = readLifestyleProfile();
   const choices = lifestyleChoices(draft.hobbies);
   const flexibleChoiceSets: FlexibleChoiceSet[] = choices.length
      ? [{ id: "onboarding-anytime", title: "Free-time options", period: "anytime", choices }]
      : [];

   saveLifestyleProfile({
      ...currentLifestyle,
      preferredBedtime: /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.bedtime) ? draft.bedtime : undefined,
      commuteMinutes: draft.travelMinutes
         ? Math.max(1, Math.min(240, Math.round(Number(draft.travelMinutes) || 0))) || undefined
         : undefined,
      flexibleChoiceSets,
      flexibleChoiceHistory: [],
      assignments: {},
   });

   saveAllevinUserProfile(cleanName);
   saveAllevinTone(draft.tone);
   // Keep the last phone step resumable across the Safari → Home Screen
   // handoff. Completion is recorded only after the user enters ALLEVIN.
   markOnboardingState("phone-pending");

   // Give a first-time user one useful conversational handoff instead of a
   // blank assistant panel. This teaches the interaction model in one sentence
   // without turning onboarding into a tutorial deck.
   if (!readKinConversation().length) {
      appendKinMessage(
         "assistant",
         "You’re set. When the day changes, just tell me normally—running late, skipping something, adding dinner, moving a meeting, whatever happened.",
      );
   }

   return { scheduleBlocks, anchors, choices };
}
