import type { AllevinTone } from "@/lib/allevinVoice";
import { buildRhythmForDate, getRhythmDayContexts, localDateKey, minutesFromClock, readDailyRhythm, type DailyRhythmState } from "@/lib/dailyRhythm";
import type { LifeState } from "@/lib/lifeTypes";

export type RecommendationCategory = "workout" | "breakfast" | "dinner" | "focus" | "transition" | "appointment" | "errand" | "admin" | "general";
export type RecommendationFeedback = "liked" | "disliked" | "skipped" | "accepted";

interface RecommendationOption {
   id: string;
   category: RecommendationCategory;
   title: string;
   detail: string;
   minMinutes: number;
   maxMinutes: number;
   focus?: string;
}

interface RecommendationHistoryEntry {
   optionId: string;
   category: RecommendationCategory;
   title: string;
   focus?: string;
   contextKey?: string;
   at: number;
   feedback?: RecommendationFeedback;
   source?: "conversation" | "up-next";
}

interface RecommendationState {
   version: 2;
   history: RecommendationHistoryEntry[];
   assignments: Record<string, string>;
}

export interface RecommendationResult {
   handled: boolean;
   reply: string;
}

export interface ProactiveRecommendation {
   optionId: string;
   title: string;
   detail: string;
   category: RecommendationCategory;
   focus?: string;
}

export const RECOMMENDATION_UPDATED_EVENT = "allevin-recommendations-updated";
const STORAGE_KEY = "allevin-recommendations-mkxii-2";
const LEGACY_STORAGE_KEY = "allevin-recommendations-mkxii-1";

const OPTIONS: RecommendationOption[] = [

   { id: "workout-push-pull", category: "workout", title: "Make back and pulling the focus.", detail: "Your session can lean toward pulling today. Pick the exact movements you prefer; the point is to give that pattern the attention instead of repeating yesterday.", minMinutes: 30, maxMinutes: 70, focus: "pull-back" },
   { id: "workout-circuit", category: "workout", title: "Make conditioning the focus.", detail: "Use the session for continuous work and keep the exact movements flexible. Today is about conditioning, not collecting exercises like side quests.", minMinutes: 20, maxMinutes: 50, focus: "conditioning" },
   { id: "workout-walk-core", category: "workout", title: "Make core and recovery the focus.", detail: "Keep the session lighter and give core or low-impact movement the attention. Useful when the rest of the day already has enough teeth.", minMinutes: 20, maxMinutes: 45, focus: "core-recovery" },
   { id: "breakfast-sandwich", category: "breakfast", title: "Build the fast sandwich.", detail: "Egg, cheese or another protein, toast or an English muffin, fruit on the side. Portable enough to survive a busy morning.", minMinutes: 10, maxMinutes: 25 },
   { id: "breakfast-cottage-fruit", category: "breakfast", title: "Keep it cold and protein-forward.", detail: "Cottage cheese or yogurt, fruit, toast, and your drink. Almost no cleanup, which is exactly the point.", minMinutes: 5, maxMinutes: 18 },
   { id: "breakfast-leftover-bowl", category: "breakfast", title: "Turn leftovers into breakfast.", detail: "Use whatever already works—rice, potatoes, vegetables, eggs, or another protein. Breakfast does not need a costume.", minMinutes: 10, maxMinutes: 25 },

   { id: "workout-cardio-intervals", category: "workout", title: "Make cardio the focus.", detail: "A harder cardio emphasis fits today. Choose the machine or route you actually enjoy; ALLEVIN is picking the lane, not pretending to be your trainer.", minMinutes: 20, maxMinutes: 60, focus: "cardio-hard" },
   { id: "workout-upper-strength", category: "workout", title: "Give upper body the focus.", detail: "Lean strength work toward the upper body today. You choose the exact exercises; keep the emphasis clear and let progression come from consistency, not novelty for its own sake.", minMinutes: 30, maxMinutes: 75, focus: "upper-body" },
   { id: "workout-lower-strength", category: "workout", title: "Give lower body the focus.", detail: "Make lower-body strength the lane today. Keep the actual exercise selection yours and avoid stacking the same focus on back-to-back sessions.", minMinutes: 35, maxMinutes: 80, focus: "lower-body" },
   { id: "workout-full-body", category: "workout", title: "Use a full-body focus.", detail: "Spread the work across the whole body and keep the session balanced. Good fit when no single area needs another turn yet.", minMinutes: 30, maxMinutes: 70, focus: "full-body" },
   { id: "workout-zone2", category: "workout", title: "Keep cardio steady today.", detail: "Use a lower-intensity cardio emphasis and leave the session feeling like you could have done more. Progress does not require every day to become a boss fight.", minMinutes: 25, maxMinutes: 75, focus: "cardio-steady" },
   { id: "workout-mobility", category: "workout", title: "Make recovery the focus.", detail: "Give mobility and easy movement the day. A lighter session is useful when it keeps the rest of the week intact instead of turning fatigue into a personality.", minMinutes: 15, maxMinutes: 50, focus: "recovery" },
   { id: "workout-bodyweight", category: "workout", title: "Keep the focus simple today.", detail: "Use a low-setup bodyweight emphasis if time or equipment is tight. The exact movements are yours; keep the session clean and useful.", minMinutes: 15, maxMinutes: 40, focus: "low-setup-strength" },
   { id: "workout-hill-walk", category: "workout", title: "Make incline work the focus.", detail: "A hill or incline emphasis gives you useful conditioning without needing a programming committee meeting. Keep it simple.", minMinutes: 20, maxMinutes: 55, focus: "incline-conditioning" },
   { id: "breakfast-eggs-toast", category: "breakfast", title: "Keep breakfast warm and simple.", detail: "Eggs, toast, fruit, and your usual coffee or matcha. Enough fuel without stealing the whole morning.", minMinutes: 10, maxMinutes: 30 },
   { id: "breakfast-yogurt", category: "breakfast", title: "Go cold and quick.", detail: "Greek yogurt, fruit, granola, and a drink. Fast enough for a compressed morning and still more useful than pretending coffee is breakfast.", minMinutes: 5, maxMinutes: 18 },
   { id: "breakfast-oats", category: "breakfast", title: "Make the one-bowl option.", detail: "Oatmeal, banana or berries, and nut butter. Minimal cleanup, predictable timing.", minMinutes: 8, maxMinutes: 22 },
   { id: "breakfast-smoothie", category: "breakfast", title: "Use the blender route.", detail: "Smoothie plus toast or another easy carb. Good when the schedule is moving faster than you are.", minMinutes: 7, maxMinutes: 18 },
   { id: "breakfast-burrito", category: "breakfast", title: "Make breakfast portable.", detail: "Eggs, beans or potatoes, and whatever else you keep around. Wrap it and keep moving.", minMinutes: 15, maxMinutes: 35 },
   { id: "breakfast-rice-egg", category: "breakfast", title: "Use leftovers intelligently.", detail: "Rice and eggs with something fresh on the side. Fast, filling, and it clears food that was already waiting for a job.", minMinutes: 12, maxMinutes: 28 },
   { id: "breakfast-avocado", category: "breakfast", title: "Make it a slower breakfast if you have the room.", detail: "Avocado toast, eggs, fruit, and your drink. Use this one when the schedule actually gives you breathing space.", minMinutes: 18, maxMinutes: 40 },
   { id: "dinner-sheet-pan", category: "dinner", title: "Keep dinner to one pan.", detail: "Roast a protein and vegetables together, then add rice, potatoes, or bread if you want it. Dinner stays useful without taking over the evening.", minMinutes: 30, maxMinutes: 75 },
   { id: "dinner-bowl", category: "dinner", title: "Build an easy dinner bowl.", detail: "Start with rice or another grain, add a protein and vegetables, then finish it with a sauce you already like. Flexible, filling, and light on cleanup.", minMinutes: 20, maxMinutes: 60 },
   { id: "dinner-pasta", category: "dinner", title: "Use the simple pasta route.", detail: "Pasta, vegetables, and a protein make a straightforward evening meal. Keep the ingredients familiar so the unwinding part still gets a turn.", minMinutes: 20, maxMinutes: 55 },
   { id: "dinner-leftovers", category: "dinner", title: "Let leftovers handle dinner.", detail: "Reheat what is already ready and add one fresh side if it needs balance. Saving effort is a valid dinner plan.", minMinutes: 5, maxMinutes: 25 },
   { id: "focus-first-hard", category: "focus", title: "Start with the thing that can bite you later.", detail: "Before the day fills up, identify the one commitment or handoff that becomes annoying if it slips and handle that first.", minMinutes: 10, maxMinutes: 120 },
   { id: "focus-meeting-check", category: "focus", title: "Check the fixed commitments first.", detail: "Look for meetings, deadlines, or handoffs before you create extra work. The calendar gets first vote.", minMinutes: 5, maxMinutes: 60 },
   { id: "focus-one-target", category: "focus", title: "Give the block one clear target.", detail: "Pick one outcome for this stretch instead of building a heroic list you will ignore by lunch.", minMinutes: 15, maxMinutes: 180 },
   { id: "focus-buffer", category: "focus", title: "Leave yourself a buffer.", detail: "Do not spend every open minute. Keep a little room before the next fixed commitment so the day can absorb reality.", minMinutes: 10, maxMinutes: 120 },
   { id: "transition-pack", category: "transition", title: "Set up for {item}.", detail: "Give {item} what it needs before you start. A little setup now beats turning a simple block into archaeology later.", minMinutes: 5, maxMinutes: 30 },
   { id: "transition-reset", category: "transition", title: "Give {item} a clean start.", detail: "Close the last thing before {item} begins. One context at a time; your brain already has enough tabs open.", minMinutes: 5, maxMinutes: 30 },
   { id: "transition-leave-early", category: "transition", title: "Protect {item}'s start.", detail: "If {item} needs travel or setup, count that buffer as part of the task. Future-you has enough enemies.", minMinutes: 5, maxMinutes: 45 },
   { id: "appointment-one-pass", category: "appointment", title: "Make it one clean pass.", detail: "Before “{item},” pull up the calendar, contact info, and anything they may ask for. Phone tag is a side quest nobody ordered.", minMinutes: 5, maxMinutes: 120 },
   { id: "appointment-outcome", category: "appointment", title: "Know what done looks like.", detail: "For “{item},” decide the outcome you actually need before you start. If the conversation wanders, drag it back to the point.", minMinutes: 5, maxMinutes: 120 },
   { id: "appointment-questions", category: "appointment", title: "Bring the two questions that matter.", detail: "Write down the two things you need answered for “{item}.” Memory gets real optimistic the second somebody puts you on hold.", minMinutes: 5, maxMinutes: 120 },
   { id: "appointment-buffer", category: "appointment", title: "Give it a little breathing room.", detail: "Leave a small buffer around “{item}.” Calls and appointments love pretending they know how long they’ll take.", minMinutes: 10, maxMinutes: 180 },
   { id: "errand-stack", category: "errand", title: "Make the trip earn itself.", detail: "If “{item}” takes you out, check whether one nearby errand belongs in the same run. One trip is useful; five tiny trips is a lifestyle bug.", minMinutes: 10, maxMinutes: 180 },
   { id: "errand-list", category: "errand", title: "Decide before you walk in.", detail: "For “{item},” know the exact target before you go. Wandering around hoping clarity appears under fluorescent lighting is not a plan.", minMinutes: 5, maxMinutes: 120 },
   { id: "errand-buffer", category: "errand", title: "Protect the return time.", detail: "Budget the trip for “{item},” not just the task itself. Getting there and back still counts, inconveniently.", minMinutes: 10, maxMinutes: 180 },
   { id: "admin-friction", category: "admin", title: "Kill the friction first.", detail: "Open whatever “{item}” needs before you start—form, login, document, email thread. Half the battle is refusing to hunt for things mid-task.", minMinutes: 5, maxMinutes: 120 },
   { id: "admin-finish", category: "admin", title: "Finish the loop, not just the first click.", detail: "For “{item},” get all the way to sent, submitted, booked, or confirmed. Almost-done has a nasty habit of coming back tomorrow.", minMinutes: 5, maxMinutes: 120 },
   { id: "admin-proof", category: "admin", title: "Keep the receipt.", detail: "When “{item}” is done, save the confirmation or note the result. Future-you shouldn’t have to reconstruct the crime scene.", minMinutes: 5, maxMinutes: 120 },
   { id: "general-no-extra", category: "general", title: "Keep {item} uncomplicated.", detail: "Give {item} the space it actually needs and do not bolt extra work onto it just because the calendar has room.", minMinutes: 5, maxMinutes: 180 },
   { id: "general-small-win", category: "general", title: "Make {item} the one win.", detail: "Handle {item} cleanly before you go looking for another mission. One finished thing beats three half-started side quests.", minMinutes: 10, maxMinutes: 60 },
   { id: "general-check-next", category: "general", title: "Give {item} the lane.", detail: "{item} is next. Set it up, handle it, then reassess. No need to make the next hour audition for a productivity documentary.", minMinutes: 5, maxMinutes: 60 },
   { id: "general-breathe", category: "general", title: "Leave room around {item}.", detail: "Do {item} without packing the edges with filler. Empty space is allowed to survive the day.", minMinutes: 10, maxMinutes: 180 },
];

function progressionFocus(option: RecommendationOption) {
   if (option.focus) return option.focus;

   const id = option.id;
   if (id.includes("eggs") || id.includes("sandwich")) return "warm-protein";
   if (id.includes("yogurt") || id.includes("cottage")) return "cold-protein";
   if (id.includes("oats")) return "oats";
   if (id.includes("smoothie")) return "smoothie";
   if (id.includes("burrito")) return "portable";
   if (id.includes("rice") || id.includes("leftover")) return "leftovers";
   if (id.includes("avocado")) return "slower-breakfast";
   if (id.includes("appointment")) return id.replace(/^appointment-/, "");
   if (id.includes("errand")) return id.replace(/^errand-/, "");
   if (id.includes("admin")) return id.replace(/^admin-/, "");
   if (id.includes("focus")) return id.replace(/^focus-/, "");
   if (id.includes("transition")) return id.replace(/^transition-/, "");
   if (id.includes("general")) return id.replace(/^general-/, "");
   return id;
}

function recommendationWasActuallyCompleted(entry: RecommendationHistoryEntry) {
   if (entry.feedback === "accepted" || entry.feedback === "liked") return true;
   if (!entry.contextKey) return false;

   // Planned routine contexts use DATE:anchor:ANCHOR_ID. Looking at the rhythm
   // outcome lets any completion path (Up Next, conversation, or direct UI)
   // count toward progression without coupling dailyRhythm back to this module.
   const match = entry.contextKey.match(/^(\d{4}-\d{2}-\d{2}):(anchor|temporary):(.+)$/);
   if (!match) return false;

   const rhythm = readDailyRhythm();
   return rhythm.outcomes[match[1]]?.[match[3]]?.kind === "completed";
}

function recentProgressionFocuses(state: RecommendationState, category: RecommendationCategory, limit = 3) {
   // Progression should reflect what the user actually did or explicitly liked.
   // A suggestion that was merely shown is continuity data, not completed work.
   return state.history
      .filter((entry) => entry.category === category && recommendationWasActuallyCompleted(entry))
      .slice(-limit)
      .map((entry) => {
         const option = optionById(entry.optionId);
         return entry.focus || (option ? progressionFocus(option) : entry.optionId);
      });
}

function optionTraits(option: RecommendationOption) {
   const id = option.id;
   const traits = new Set<string>();

   if (id.includes("cardio") || id.includes("zone2") || id.includes("hill-walk")) traits.add("cardio");
   if (id.includes("strength") || id.includes("full-body") || id.includes("bodyweight")) traits.add("strength");
   if (id.includes("mobility")) { traits.add("recovery"); traits.add("low-impact"); }
   if (id.includes("bodyweight") || id.includes("hill-walk")) traits.add("low-setup");
   if (id.includes("intervals")) traits.add("high-energy");
   if (id.includes("zone2")) traits.add("steady");
   if (id.includes("full-body")) traits.add("full-body");

   if (id.includes("yogurt") || id.includes("smoothie") || id.includes("oats")) traits.add("quick");
   if (id.includes("eggs-toast") || id.includes("oats") || id.includes("rice-egg")) traits.add("warm");
   if (id.includes("burrito")) traits.add("portable");
   if (id.includes("rice-egg")) traits.add("leftovers");
   if (id.includes("avocado")) traits.add("slower");
   if (id.includes("smoothie")) traits.add("drinkable");

   if (id.includes("first-hard")) traits.add("priority-first");
   if (id.includes("meeting-check")) traits.add("calendar-first");
   if (id.includes("one-target")) traits.add("single-target");
   if (id.includes("buffer")) traits.add("buffer");
   if (id.includes("transition-pack")) traits.add("prep");
   if (id.includes("transition-reset")) traits.add("reset");
   if (id.includes("leave-early")) traits.add("time-protection");
   if (id.includes("no-extra") || id.includes("breathe")) traits.add("protect-space");
   if (id.includes("small-win")) traits.add("small-win");
   if (id.includes("appointment")) traits.add("prepared");
   if (id.includes("errand")) traits.add("efficient");
   if (id.includes("admin")) traits.add("close-the-loop");

   return [...traits];
}

function preferenceSignals(state: RecommendationState) {
   const scores = new Map<string, number>();

   for (const entry of state.history) {
      if (!recommendationWasActuallyCompleted(entry)) continue;
      const option = optionById(entry.optionId);
      if (!option) continue;
      const weight = entry.feedback === "liked" ? 3 : 1;
      for (const trait of optionTraits(option)) scores.set(trait, (scores.get(trait) || 0) + weight);
   }

   return [...scores.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 8)
      .map(([trait, score]) => ({ trait, score }));
}

function emptyState(): RecommendationState {
   return { version: 2, history: [], assignments: {} };
}

function readState(): RecommendationState {
   if (typeof window === "undefined") return emptyState();
   try {
      const current = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as RecommendationState | null;
      if (current?.version === 2 && Array.isArray(current.history)) {
         return { version: 2, history: current.history.slice(-160), assignments: current.assignments && typeof current.assignments === "object" ? current.assignments : {} };
      }
      const legacy = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) || "null") as { version?: number; history?: RecommendationHistoryEntry[] } | null;
      if (legacy?.version === 1 && Array.isArray(legacy.history)) return { version: 2, history: legacy.history.slice(-160), assignments: {} };
      return emptyState();
   } catch {
      return emptyState();
   }
}

function saveState(state: RecommendationState) {
   if (typeof window === "undefined") return;
   const assignmentEntries = Object.entries(state.assignments).slice(-120);
   window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, history: state.history.slice(-160), assignments: Object.fromEntries(assignmentEntries) }));
   window.dispatchEvent(new CustomEvent(RECOMMENDATION_UPDATED_EVENT));
}

function normalize(value: string) {
   return value.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9\s'-]+/g, " ").replace(/\s+/g, " ").trim();
}

function nextFixedMinutes(lifeState: LifeState, rhythm: DailyRhythmState, now: Date) {
   const nowMinutes = now.getHours() * 60 + now.getMinutes();
   const rhythmCandidates = buildRhythmForDate(rhythm, now)
      .filter((entry) => entry.kind === "schedule" && !entry.completed && !entry.skipped)
      .filter((entry) => minutesFromClock(entry.time) > nowMinutes)
      .map((entry) => ({ at: minutesFromClock(entry.time), title: entry.title }));

   const lifeCandidates = lifeState.items
      .filter((item) => item.state === "active" && item.kind === "commitment" && item.startAt)
      .filter((item) => {
         const date = new Date(item.startAt || 0);
         return date.toDateString() === now.toDateString();
      })
      .map((item) => {
         const date = new Date(item.startAt || 0);
         return { at: date.getHours() * 60 + date.getMinutes(), title: item.title };
      })
      .filter((item) => item.at > nowMinutes);

   const next = [...rhythmCandidates, ...lifeCandidates].sort((a, b) => a.at - b.at)[0];
   return next ? { minutes: next.at - nowMinutes, title: next.title } : null;
}

function plannedRecommendationWindow(rhythm: DailyRhythmState, category: RecommendationCategory, now: Date) {
   if (category !== "workout" && category !== "breakfast" && category !== "dinner") return null;
   const categoryMatch = category === "workout" ? "exercise" : "meal";
   const titleMatch = category === "breakfast"
      ? /breakfast|coffee|matcha|morning/i
      : category === "dinner"
         ? /dinner|cook|supper|evening|unwind/i
         : null;
   const candidate = buildRhythmForDate(rhythm, now)
      .filter((entry) => entry.kind === "anchor" && !entry.completed && !entry.skipped && entry.status !== "missed" && entry.category === categoryMatch)
      .filter((entry) => !titleMatch || titleMatch.test(entry.title))
      .sort((a, b) => minutesFromClock(a.time) - minutesFromClock(b.time))[0];

   if (!candidate) return null;
   return {
      minutes: Math.max(5, candidate.durationMinutes || 30),
      contextKey: `${localDateKey(now)}:${candidate.id}`,
      subject: candidate.title,
   };
}

function availableWindow(lifeState: LifeState, rhythm: DailyRhythmState, category: RecommendationCategory, now = new Date()) {
   const planned = plannedRecommendationWindow(rhythm, category, now);
   if (planned) return { minutes: planned.minutes, nextTitle: "", planned: true, contextKey: planned.contextKey, subject: planned.subject };
   const next = nextFixedMinutes(lifeState, rhythm, now);
   const fallback = category === "breakfast" || category === "dinner" ? 30 : category === "workout" ? 45 : 30;
   const contextKey = `${localDateKey(now)}:conversation:${category}`;
   if (!next) return { minutes: fallback, nextTitle: "", planned: false, contextKey, subject: "" };
   return { minutes: Math.max(5, Math.min(120, next.minutes - 5)), nextTitle: next.title, planned: false, contextKey, subject: "" };
}

function lastCategory(history: RecommendationHistoryEntry[]) {
   return history[history.length - 1]?.category;
}

function detectCategory(lower: string, state: RecommendationState): RecommendationCategory | null {
   if (/\b(?:workout|exercise|gym|training|cardio|strength|mobility)\b/.test(lower)) return "workout";
   if (/\b(?:breakfast|morning meal|eat in the morning|food before work)\b/.test(lower)) return "breakfast";
   if (/\b(?:dinner|supper|evening meal|cook tonight|eat tonight)\b/.test(lower)) return "dinner";
   if (/\b(?:focus|work block|study|what should i tackle)\b/.test(lower)) return "focus";
   if (/\b(?:appointment|dentist|doctor|checkup|meeting|call|reservation|interview)\b/.test(lower)) return "appointment";
   if (/\b(?:errand|groceries|grocery|shopping|pick up|pickup|drop off|return|buy)\b/.test(lower)) return "errand";
   if (/\b(?:email|form|paperwork|submit|renew|application|book|schedule)\b/.test(lower)) return "admin";
   if (/\b(?:another|more like that|one more|give me more|something else|different one|give me another)\b/.test(lower)) return lastCategory(state.history) || null;
   return null;
}

function isRecommendationRequest(lower: string) {
   return /\b(?:recommend|suggest|idea|what should i do|what should i eat|what should i focus on|what should i focus|which should i focus on|give me|pick|another|more like that|one more|something else|different)\b/.test(lower);
}

function recommendationDateFromPrompt(lower: string, now = new Date()) {
   const target = new Date(now);

   if (/\bday after tomorrow\b/.test(lower)) {
      target.setDate(now.getDate() + 2);
      return target;
   }

   if (/\btomorrow\b/.test(lower)) {
      target.setDate(now.getDate() + 1);
      return target;
   }

   if (/\b(?:today|tonight)\b/.test(lower)) return target;

   const weekdayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
   };

   for (const [name, day] of Object.entries(weekdayMap)) {
      if (!new RegExp(`\\b${name}\\b`).test(lower)) continue;
      let delta = (day - now.getDay() + 7) % 7;
      if (delta === 0 && new RegExp(`\\bnext\\s+${name}\\b`).test(lower)) delta = 7;
      target.setDate(now.getDate() + delta);
      return target;
   }

   return target;
}

function recommendationDayLabel(target: Date, now = new Date()) {
   const today = new Date(now);
   today.setHours(0, 0, 0, 0);

   const day = new Date(target);
   day.setHours(0, 0, 0, 0);

   const difference = Math.round((day.getTime() - today.getTime()) / 86_400_000);
   if (difference === 0) return "today";
   if (difference === 1) return "tomorrow";
   return target.toLocaleDateString([], { weekday: "long" });
}

function isRecoveryWorkoutOption(option: RecommendationOption) {
   const focus = progressionFocus(option);
   return ["recovery", "core-recovery", "cardio-steady"].includes(focus);
}

function chooseRecoveryWorkoutOption(
   minutes: number,
   state: RecommendationState,
   excludedOptionIds: Set<string> = new Set(),
) {
   const disliked = new Set(
      state.history
         .filter((entry) => entry.feedback === "disliked")
         .map((entry) => entry.optionId),
   );
   const used = new Set(
      state.history
         .filter((entry) => entry.category === "workout")
         .map((entry) => entry.optionId),
   );

   const safePool = OPTIONS.filter(
      (option) =>
         option.category === "workout" &&
         isRecoveryWorkoutOption(option) &&
         !disliked.has(option.id) &&
         !excludedOptionIds.has(option.id),
   );

   const unused = safePool.filter((option) => !used.has(option.id));
   const pool = unused.length ? unused : safePool;
   const fitting = pool.filter((option) => option.minMinutes <= minutes);

   return (fitting.length ? fitting : pool)
      .sort((left, right) => {
         const leftDistance = Math.abs(minutes - (left.minMinutes + left.maxMinutes) / 2);
         const rightDistance = Math.abs(minutes - (right.minMinutes + right.maxMinutes) / 2);
         return leftDistance - rightDistance || left.id.localeCompare(right.id);
      })[0] || null;
}

function contextDateKey(contextKey: string) {
   return contextKey.match(/^(\\d{4}-\\d{2}-\\d{2}):/)?.[1] || "";
}

function contextHasRecoverySignal(contextKey: string) {
   const dateKey = contextDateKey(contextKey);
   if (!dateKey) return false;
   return (readDailyRhythm().dayContexts[dateKey] || []).some(
      (context) => context.kind === "recovery",
   );
}

function chooseFreshOption(category: RecommendationCategory, minutes: number, state: RecommendationState, excludedOptionIds: Set<string> = new Set()) {
   const used = new Set(state.history.filter((entry) => entry.category === category).map((entry) => entry.optionId));
   const disliked = new Set(state.history.filter((entry) => entry.feedback === "disliked").map((entry) => entry.optionId));
   const recentFocuses = new Set(recentProgressionFocuses(state, category, 3));

   const unused = OPTIONS.filter((option) => option.category === category && !disliked.has(option.id) && !used.has(option.id) && !excludedOptionIds.has(option.id));
   const fitting = unused.filter((option) => option.minMinutes <= minutes);
   const pool = fitting.length ? fitting : unused;
   if (!pool.length) return null;

   const progressionFresh = pool.filter((option) => !recentFocuses.has(progressionFocus(option)));
   const fresh = progressionFresh.length ? progressionFresh : pool;

   const likedTraits = new Map(preferenceSignals(state).map((entry) => [entry.trait, entry.score]));
   const seed = new Date().getDate() + state.history.length;

   return [...fresh]
      .map((option, index) => {
         const preferenceScore = optionTraits(option).reduce((score, trait) => score + (likedTraits.get(trait) || 0), 0);
         const center = (option.minMinutes + option.maxMinutes) / 2;
         const timeScore = option.minMinutes <= minutes && minutes <= option.maxMinutes ? 2 : -Math.min(2, Math.abs(minutes - center) / 30);
         const progressionScore = recentFocuses.has(progressionFocus(option)) ? -20 : 4;
         const tieBreak = ((seed + index) % Math.max(1, fresh.length)) / 1000;
         return { option, score: preferenceScore * 10 + timeScore + progressionScore + tieBreak };
      })
      .sort((left, right) => right.score - left.score)[0].option;
}

function optionById(id: string) {
   return OPTIONS.find((option) => option.id === id) || null;
}

function formatRecommendationOption(option: RecommendationOption, subject?: string): ProactiveRecommendation {
   const item = (subject || "the next thing").trim();
   return {
      optionId: option.id,
      title: option.title.replaceAll("{item}", item),
      detail: option.detail.replaceAll("{item}", item),
      category: option.category,
      focus: progressionFocus(option),
   };
}

export function getProactiveRecommendation(contextKey: string, category: RecommendationCategory, minutes: number, subject?: string): ProactiveRecommendation | null {
   const state = readState();
   const recoveryContext = category === "workout" && contextHasRecoverySignal(contextKey);
   const assignedId = state.assignments[contextKey];

   if (assignedId) {
      const assigned = optionById(assignedId);
      const assignedHistory = [...state.history].reverse().find(
         (entry) => entry.optionId === assignedId && (!entry.contextKey || entry.contextKey === contextKey),
      );
      const stillFitsReality = !recoveryContext || (assigned ? isRecoveryWorkoutOption(assigned) : false);

      if (
         assigned &&
         assigned.category === category &&
         assignedHistory?.feedback !== "disliked" &&
         stillFitsReality
      ) {
         return formatRecommendationOption(assigned, subject);
      }

      // Context changed after the recommendation was assigned. Drop only the
      // assignment; keep history so ALLEVIN remembers it was suggested but not
      // completed.
      delete state.assignments[contextKey];
   }

   const option = recoveryContext
      ? chooseRecoveryWorkoutOption(minutes, state)
      : chooseFreshOption(category, minutes, state);
   if (!option) return null;
   const nextState: RecommendationState = {
      version: 2,
      history: [...state.history, { optionId: option.id, category, title: formatRecommendationOption(option, subject).title, focus: progressionFocus(option), contextKey, at: Date.now(), source: "up-next" }],
      assignments: { ...state.assignments, [contextKey]: option.id },
   };
   saveState(nextState);
   return formatRecommendationOption(option, subject);
}

function assignedOptionForContext(state: RecommendationState, contextKey: string, category: RecommendationCategory) {
   const assignedId = state.assignments[contextKey];
   if (!assignedId) return null;
   const option = optionById(assignedId);
   if (!option || option.category !== category) return null;
   const latest = [...state.history].reverse().find((entry) => entry.optionId === assignedId && (!entry.contextKey || entry.contextKey === contextKey));
   if (latest?.feedback === "disliked") return null;
   return option;
}

function recentLegacyConversationOption(state: RecommendationState, category: RecommendationCategory, nowMs = Date.now()) {
   const recent = [...state.history]
      .reverse()
      .find((entry) =>
         entry.category === category &&
         entry.source === "conversation" &&
         !entry.contextKey &&
         entry.feedback !== "disliked" &&
         nowMs - entry.at <= 10 * 60_000
      );
   return recent ? optionById(recent.optionId) : null;
}

function asksForDifferentRecommendation(lower: string) {
   return /\b(?:another|different|something else|change it|change that|switch it|switch that|new direction|another direction|instead)\b/.test(lower);
}

function replyFor(
   option: RecommendationOption,
   minutes: number,
   nextTitle: string,
   tone: AllevinTone,
   planned = false,
   targetDate = new Date(),
) {
   const dayLabel = recommendationDayLabel(targetDate);
   const dayLead = dayLabel === "today" ? "Your schedule" : `${dayLabel.charAt(0).toUpperCase()}${dayLabel.slice(1)}'s schedule`;
   const windowText = planned
      ? `${dayLead} gives you about ${minutes} minutes here.`
      : nextTitle
        ? `You have about ${minutes} minutes before ${nextTitle}.`
        : `You have about ${minutes} minutes to work with.`;

   const formatted = formatRecommendationOption(option);
   const detail =
      dayLabel === "today"
         ? formatted.detail
         : formatted.detail.replace(/\btoday\b/gi, dayLabel);

   if (tone === "calm") return `${windowText} ${formatted.title} ${detail}`;
   if (tone === "balanced") return `${windowText} ${formatted.title} ${detail}`;
   return `${windowText} ${formatted.title} ${detail}`;
}


export function recordRecommendationFeedback(optionId: string, feedback: RecommendationFeedback) {
   const state = readState();
   const index = [...state.history].map((entry) => entry.optionId).lastIndexOf(optionId);
   if (index < 0) return false;
   const history = [...state.history];
   history[index] = { ...history[index], feedback };
   saveState({ ...state, history });
   return true;
}

/**
 * Marks the recommendation attached to one rhythm occurrence with the actual
 * outcome. Day adaptation calls this when an activity is skipped/replaced so
 * future progression does not pretend a suggested focus was completed.
 */
export function recordRecommendationOutcomeForRhythm(
   dateKey: string,
   rhythmAnchorId: string,
   feedback: Extract<RecommendationFeedback, "accepted" | "skipped">,
) {
   const state = readState();
   const contextKeys = [
      `${dateKey}:anchor:${rhythmAnchorId}`,
      `${dateKey}:temporary:${rhythmAnchorId}`,
   ];

   // Use the newest assignment if a user explicitly changed direction for the
   // same activity. Temporary one-day replacements share the same outcome API.
   const index = state.history
      .map((entry) => entry.contextKey)
      .reduce(
         (latest, contextKey, historyIndex) =>
            contextKey && contextKeys.includes(contextKey) ? historyIndex : latest,
         -1,
      );
   if (index < 0) return false;

   const history = [...state.history];
   history[index] = { ...history[index], feedback };
   saveState({ ...state, history });
   return true;
}


function feedbackFromPrompt(lower: string): RecommendationFeedback | null {
   if (/\b(?:liked that|i liked|that was good|good one|more like that)\b/.test(lower)) return "liked";
   if (/\b(?:don'?t suggest|do not suggest|didn'?t like|did not like|not that again|hate that)\b/.test(lower)) return "disliked";
   if (/\b(?:skipped it|skip that|didn'?t do it|did not do it)\b/.test(lower)) return "skipped";
   if (/\b(?:i did it|made that|ate that|went with that|used that)\b/.test(lower)) return "accepted";
   return null;
}

export function interpretRecommendationConversation(prompt: string, lifeState: LifeState, rhythm: DailyRhythmState, tone: AllevinTone = "direct"): RecommendationResult {
   const lower = normalize(prompt);
   if (!lower) return { handled: false, reply: "" };

   const state = readState();
   let workingState = state;
   const feedback = feedbackFromPrompt(lower);
   if (feedback && state.history.length) {
      const history = [...state.history];
      history[history.length - 1] = { ...history[history.length - 1], feedback };
      workingState = { ...state, history };
      saveState(workingState);

      const asksForAnother =
         feedback === "liked" &&
         /\b(?:another|more like that|give me more|one more|different one)\b/.test(lower);

      if (!asksForAnother) {
         const copy = feedback === "disliked"
            ? "Got it. That one is off the board."
            : feedback === "liked"
              ? "Good. I’ll remember what worked and keep the next one different."
              : feedback === "skipped"
                ? "Skipped. No guilt spreadsheet required."
                : "Noted. I’ll keep the next recommendation fresh.";
         return { handled: true, reply: copy };
      }
   }

   const category = detectCategory(lower, workingState);
   if (!category || !isRecommendationRequest(lower)) return { handled: false, reply: "" };

   const targetDate = recommendationDateFromPrompt(lower);
   const window = availableWindow(lifeState, rhythm, category, targetDate);
   const wantsDifferent = asksForDifferentRecommendation(lower);
   const assigned = assignedOptionForContext(workingState, window.contextKey, category);
   const recoveryContext = getRhythmDayContexts(rhythm, targetDate).some((context) => context.kind === "recovery");
   const realityCompatibleAssignment =
      assigned &&
      (!recoveryContext || category !== "workout" || isRecoveryWorkoutOption(assigned))
         ? assigned
         : null;

   // Recovery context comes from explicit user input ("I'm sick", "I'm wiped
   // out"), not a medical inference. If exercise is already absent from the
   // adapted day, ALLEVIN should not manufacture a workout recommendation.
   if (category === "workout" && recoveryContext && !window.planned && !wantsDifferent) {
      return {
         handled: true,
         reply: "You marked this as a recovery day, so I’d leave the workout out unless you decide to bring it back.",
      };
   }

   if (realityCompatibleAssignment && !wantsDifferent) {
      return { handled: true, reply: replyFor(realityCompatibleAssignment, window.minutes, window.nextTitle, tone, window.planned, targetDate) };
   }

   // One-time continuity bridge for recommendations created immediately before
   // context assignments existed. It lets an in-progress session keep the most
   // recent answer instead of inventing a third focus after an upgrade.
   if (!assigned && !wantsDifferent) {
      const legacy = recentLegacyConversationOption(workingState, category);
      if (legacy && (!recoveryContext || category !== "workout" || isRecoveryWorkoutOption(legacy))) {
         const bridgedState: RecommendationState = {
            ...workingState,
            assignments: { ...workingState.assignments, [window.contextKey]: legacy.id },
            history: workingState.history.map((entry, index, history) =>
               index === history.length - 1 && entry.optionId === legacy.id && entry.source === "conversation" && !entry.contextKey
                  ? { ...entry, contextKey: window.contextKey }
                  : entry
            ),
         };
         saveState(bridgedState);
         return { handled: true, reply: replyFor(legacy, window.minutes, window.nextTitle, tone, window.planned, targetDate) };
      }
   }

   const excluded = new Set<string>();
   if (assigned && wantsDifferent) excluded.add(assigned.id);

   const option =
      category === "workout" && recoveryContext
         ? chooseRecoveryWorkoutOption(window.minutes, workingState, excluded)
         : chooseFreshOption(category, window.minutes, workingState, excluded);

   if (!option) return { handled: true, reply: "I’ve already used the useful options I have under those constraints. Give me one new preference or constraint and I’ll change the lane." };

   const nextState: RecommendationState = {
      ...workingState,
      history: [...workingState.history, {
         optionId: option.id,
         category,
         title: formatRecommendationOption(option, window.subject).title,
         focus: progressionFocus(option),
         contextKey: window.contextKey,
         at: Date.now(),
         source: "conversation",
      }],
      assignments: { ...workingState.assignments, [window.contextKey]: option.id },
   };
   saveState(nextState);
   return { handled: true, reply: replyFor(option, window.minutes, window.nextTitle, tone, window.planned, targetDate) };
}

export function buildRecommendationContext() {
   const state = readState();
   return JSON.stringify({
      recentRecommendations: state.history.slice(-20).map((entry) => ({ category: entry.category, title: entry.title, focus: entry.focus, contextKey: entry.contextKey, feedback: entry.feedback, source: entry.source })),
      learnedPreferenceSignals: preferenceSignals(state),
      recommendationRule: "Keep one stable recommendation assignment per activity/date until it is completed, skipped, or explicitly changed. Progression must use actual accepted/liked outcomes rather than treating every displayed suggestion as completed work. Rotate the underlying focus, not just the sentence. Respect explicit dislikes and date-scoped recovery/context changes.",
   });
}
