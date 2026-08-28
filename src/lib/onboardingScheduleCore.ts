// ========================================
// ALLEVIN MK XVI — Onboarding Schedule Core
// Pure relationship helpers kept separate from browser storage so the one-page
// setup math can be regression-tested without React or localStorage.
// ========================================

export interface OnboardingScheduleCoreBlock {
   id: string;
   category: string;
   days: number[];
   start: string;
   end: string;
}

export interface OnboardingScheduleCoreRoutine {
   id: string;
   title: string;
   timing: "fixed" | "before" | "after";
   scheduleBlockId?: string;
   time: string;
   durationMinutes: number;
}

function clockMinutes(clock: string) {
   const [hours, minutes] = clock.split(":").map(Number);
   return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function clockFromMinutes(total: number) {
   const normalized = ((Math.round(total) % 1440) + 1440) % 1440;
   return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function safeDuration(value: number) {
   return Number.isFinite(value) && value > 0 ? Math.max(5, Math.min(360, Math.round(value))) : 30;
}

function routineOrder(title: string) {
   const lower = title.toLowerCase();
   if (/workout|exercise|gym|run|walk|yoga|lift|cardio/.test(lower)) return 10;
   if (/get ready|shower|hygiene|dress|prep/.test(lower)) return 20;
   if (/breakfast|meal|eat|coffee/.test(lower)) return 30;
   if (/commute|travel|leave/.test(lower)) return 40;
   return 25;
}

/** The schedule covering the most days becomes the familiar example clock. */
export function representativeScheduleDraft<T extends OnboardingScheduleCoreBlock>(
   blocks: T[],
   category?: string,
) {
   return blocks
      .filter((block) => !category || block.category === category)
      .map((block, index) => ({ block, index }))
      .sort((left, right) => right.block.days.length - left.block.days.length || left.index - right.index)[0]?.block;
}

/**
 * Pack routines around their representative schedule without asking the user
 * to subtract durations from a Work/Class boundary.
 */
export function arrangeOnboardingRoutineTimes<
   S extends OnboardingScheduleCoreBlock,
   R extends OnboardingScheduleCoreRoutine,
   D extends { scheduleBlocks: S[]; routines: R[] },
>(draft: D): D {
   const nextTimes = new Map<string, string>();
   const categories = [...new Set(draft.scheduleBlocks.map((block) => block.category))];

   for (const category of categories) {
      const reference = representativeScheduleDraft(draft.scheduleBlocks, category);
      if (!reference) continue;
      const relative = draft.routines.filter((routine) => {
         if (routine.timing === "fixed") return false;
         return draft.scheduleBlocks.find((block) => block.id === routine.scheduleBlockId)?.category === category;
      });

      const before = relative
         .filter((routine) => routine.timing === "before")
         .sort((left, right) => routineOrder(left.title) - routineOrder(right.title));
      let beforeCursor = clockMinutes(reference.start);
      for (const routine of [...before].reverse()) {
         beforeCursor -= safeDuration(routine.durationMinutes);
         nextTimes.set(routine.id, clockFromMinutes(beforeCursor));
      }

      let afterCursor = clockMinutes(reference.end);
      for (const routine of relative.filter((candidate) => candidate.timing === "after")) {
         nextTimes.set(routine.id, clockFromMinutes(afterCursor));
         afterCursor += safeDuration(routine.durationMinutes);
      }
   }

   return {
      ...draft,
      routines: draft.routines.map((routine) => nextTimes.has(routine.id)
         ? { ...routine, time: nextTimes.get(routine.id) || routine.time }
         : routine),
   };
}

function alignedRoutineStart(
   routine: OnboardingScheduleCoreRoutine,
   referenceMinutes: number,
) {
   let start = clockMinutes(routine.time);
   if (routine.timing === "before" && start > referenceMinutes) start -= 1440;
   if (routine.timing === "after" && start < referenceMinutes) start += 1440;
   return start;
}

/**
 * Give one newly added routine a useful open slot without rewriting any time
 * the user has already chosen. The full arranger remains available for an
 * explicit whole-day arrangement, but quick-add is intentionally additive.
 */
export function placeNewOnboardingRoutine<
   S extends OnboardingScheduleCoreBlock,
   R extends OnboardingScheduleCoreRoutine,
   D extends { scheduleBlocks: S[]; routines: R[] },
>(draft: D, routineId: string): D {
   const target = draft.routines.find((routine) => routine.id === routineId);
   if (!target || target.timing === "fixed" || !target.scheduleBlockId) return draft;

   const linked = draft.scheduleBlocks.find((block) => block.id === target.scheduleBlockId);
   if (!linked) return draft;

   // The full deterministic arrangement provides the best semantic starting
   // point for this routine. Only this new routine is allowed to use the result.
   const arranged = arrangeOnboardingRoutineTimes(draft);
   const idealRoutine = arranged.routines.find((routine) => routine.id === routineId) || target;
   const referenceMinutes = clockMinutes(target.timing === "before" ? linked.start : linked.end);
   const duration = safeDuration(target.durationMinutes);
   const idealStart = alignedRoutineStart(idealRoutine, referenceMinutes);

   const occupied = draft.routines
      .filter((routine) => routine.id !== routineId && routine.timing === target.timing)
      .filter((routine) => {
         const block = draft.scheduleBlocks.find((candidate) => candidate.id === routine.scheduleBlockId);
         return block?.category === linked.category;
      })
      .map((routine) => {
         const start = alignedRoutineStart(routine, referenceMinutes);
         return { start, end: start + safeDuration(routine.durationMinutes) };
      });

   const slotIsOpen = (start: number) => {
      const end = start + duration;
      if (target.timing === "before" && (end > referenceMinutes || start < referenceMinutes - 1440)) return false;
      if (target.timing === "after" && (start < referenceMinutes || end > referenceMinutes + 1440)) return false;
      return occupied.every((interval) => end <= interval.start || start >= interval.end);
   };

   let chosenStart = idealStart;
   if (!slotIsOpen(chosenStart)) {
      for (let distance = 5; distance <= 720; distance += 5) {
         const candidates = target.timing === "before"
            ? [idealStart - distance, idealStart + distance]
            : [idealStart + distance, idealStart - distance];
         const available = candidates.find(slotIsOpen);
         if (typeof available === "number") {
            chosenStart = available;
            break;
         }
      }
   }

   return {
      ...draft,
      routines: draft.routines.map((routine) => routine.id === routineId
         ? { ...routine, time: clockFromMinutes(chosenStart) }
         : routine),
   };
}
