import type { AllevinTone } from "@/lib/allevinVoice";
import { buildRhythmForDate, getRhythmDayContexts, minutesFromClock, type DailyRhythmState } from "@/lib/dailyRhythm";
import type { LifeState } from "@/lib/lifeTypes";

export type LifestylePeriod = "morning" | "afternoon" | "evening" | "anytime";
export type FlexibleChoiceFeedback = "accepted" | "liked" | "skipped" | "disliked";

export interface FlexibleChoiceSet {
   id: string;
   title: string;
   period: LifestylePeriod;
   choices: string[];
}

export interface FlexibleChoiceHistoryEntry {
   setId: string;
   choice: string;
   at: number;
   feedback?: FlexibleChoiceFeedback;
}

export interface LifestyleProfileState {
   version: 1;
   preferredBedtime?: string;
   commuteMinutes?: number;
   flexibleChoiceSets: FlexibleChoiceSet[];
   flexibleChoiceHistory: FlexibleChoiceHistoryEntry[];
   assignments: Record<string, string>;
   updatedAt: number;
}

export interface LifestyleConversationResult {
   handled: boolean;
   changed: boolean;
   reply: string;
}

export interface FlexibleChoiceSuggestion {
   setId: string;
   setTitle: string;
   choice: string;
   title: string;
   detail: string;
}

export const LIFESTYLE_PROFILE_UPDATED_EVENT = "allevin-lifestyle-profile-updated";
const STORAGE_KEY = "allevin-lifestyle-profile-mkxii-1";

function isBrowser() {
   return typeof window !== "undefined";
}

function makeId(prefix: string) {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
   return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyState(): LifestyleProfileState {
   return {
      version: 1,
      flexibleChoiceSets: [],
      flexibleChoiceHistory: [],
      assignments: {},
      updatedAt: Date.now(),
   };
}

function normalize(value: string) {
   return value
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9\s:/,+.-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function sanitizeClock(value: unknown) {
   const raw = String(value || "").trim();
   if (/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return raw;
   return undefined;
}

function sanitizeChoice(value: unknown) {
   return String(value || "")
      .replace(/[.!?]\s*(?:help|please)\s+me\s+(?:choose|pick|decide)[\s\S]*$/i, "")
      .replace(/\s+(?:and\s+)?(?:help|please)\s+me\s+(?:choose|pick|decide)[\s\S]*$/i, "")
      .replace(/[.;]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
}

function sanitizeState(raw: unknown): LifestyleProfileState {
   if (!raw || typeof raw !== "object") return emptyState();
   const value = raw as Partial<LifestyleProfileState>;

   const flexibleChoiceSets = Array.isArray(value.flexibleChoiceSets)
      ? value.flexibleChoiceSets
           .map((set) => {
              if (!set || typeof set !== "object") return null;
              const record = set as FlexibleChoiceSet;
              const choices = Array.isArray(record.choices)
                 ? [...new Set(record.choices.map(sanitizeChoice).filter(Boolean))].slice(0, 12)
                 : [];
              if (!choices.length) return null;
              return {
                 id: String(record.id || makeId("choice-set")).slice(0, 120),
                 title: String(record.title || "Flexible time").trim().slice(0, 80),
                 period: record.period === "morning" || record.period === "afternoon" || record.period === "evening" ? record.period : "anytime",
                 choices,
              } satisfies FlexibleChoiceSet;
           })
           .filter((set): set is FlexibleChoiceSet => Boolean(set))
      : [];

   const flexibleChoiceHistory = Array.isArray(value.flexibleChoiceHistory)
      ? value.flexibleChoiceHistory
           .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const record = entry as FlexibleChoiceHistoryEntry;
              const choice = sanitizeChoice(record.choice);
              if (!choice) return null;
              const feedback =
                 record.feedback === "accepted" ||
                 record.feedback === "liked" ||
                 record.feedback === "skipped" ||
                 record.feedback === "disliked"
                    ? record.feedback
                    : undefined;

              return {
                 setId: String(record.setId || "").slice(0, 120),
                 choice,
                 at:
                    typeof record.at === "number" &&
                    Number.isFinite(record.at)
                       ? record.at
                       : Date.now(),
                 ...(feedback ? { feedback } : {}),
              } as FlexibleChoiceHistoryEntry;
           })
           .filter(
              (entry): entry is FlexibleChoiceHistoryEntry =>
                 entry !== null,
           )
           .slice(-120)
      : [];

   return {
      version: 1,
      preferredBedtime: sanitizeClock(value.preferredBedtime),
      commuteMinutes: typeof value.commuteMinutes === "number" && Number.isFinite(value.commuteMinutes)
         ? Math.max(1, Math.min(240, Math.round(value.commuteMinutes)))
         : undefined,
      flexibleChoiceSets,
      flexibleChoiceHistory,
      assignments: value.assignments && typeof value.assignments === "object"
         ? Object.fromEntries(Object.entries(value.assignments).slice(-90).map(([key, choice]) => [String(key).slice(0, 160), sanitizeChoice(choice)]))
         : {},
      updatedAt: typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now(),
   };
}

export function readLifestyleProfile(): LifestyleProfileState {
   if (!isBrowser()) return emptyState();
   try {
      return sanitizeState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"));
   } catch {
      return emptyState();
   }
}

export function saveLifestyleProfile(state: LifestyleProfileState) {
   const normalized = sanitizeState({ ...state, updatedAt: Date.now() });
   if (isBrowser()) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent(LIFESTYLE_PROFILE_UPDATED_EVENT));
   }
   return normalized;
}

export function setPreferredBedtime(value?: string) {
   const current = readLifestyleProfile();
   return saveLifestyleProfile({ ...current, preferredBedtime: sanitizeClock(value) });
}

export function setCommuteMinutes(value?: number) {
   const current = readLifestyleProfile();
   return saveLifestyleProfile({
      ...current,
      commuteMinutes: typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(240, Math.round(value))) : undefined,
   });
}

export function upsertFlexibleChoiceSet(input: Omit<FlexibleChoiceSet, "id"> & { id?: string }) {
   const current = readLifestyleProfile();
   const set: FlexibleChoiceSet = {
      id: input.id || makeId("choice-set"),
      title: input.title.trim().slice(0, 80) || "Flexible time",
      period: input.period,
      choices: [...new Set(input.choices.map(sanitizeChoice).filter(Boolean))].slice(0, 12),
   };
   const sets = current.flexibleChoiceSets.some((entry) => entry.id === set.id)
      ? current.flexibleChoiceSets.map((entry) => entry.id === set.id ? set : entry)
      : [...current.flexibleChoiceSets, set];
   return saveLifestyleProfile({ ...current, flexibleChoiceSets: sets });
}

export function removeFlexibleChoiceSet(id: string) {
   const current = readLifestyleProfile();
   return saveLifestyleProfile({
      ...current,
      flexibleChoiceSets: current.flexibleChoiceSets.filter((set) => set.id !== id),
      flexibleChoiceHistory: current.flexibleChoiceHistory.filter((entry) => entry.setId !== id),
   });
}

function parseClockFromPrompt(lower: string) {
   const match = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
   if (!match) return null;
   let hour = Number(match[1]);
   const minute = Number(match[2] || 0);
   if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
   if (match[3] === "pm" && hour < 12) hour += 12;
   if (match[3] === "am" && hour === 12) hour = 0;
   return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatClock(clock?: string) {
   if (!clock) return "";
   const [hoursRaw, minutesRaw] = clock.split(":").map(Number);
   const suffix = hoursRaw >= 12 ? "PM" : "AM";
   const hours = hoursRaw % 12 || 12;
   return `${hours}:${String(minutesRaw).padStart(2, "0")} ${suffix}`;
}

function parseFlexibleChoices(raw: string) {
   const match =
      raw.match(/\b(?:my\s+)?(?:options|choices)\s+(?:are|include)\s+(.+)$/i) ||
      raw.match(/\b(?:choose|pick|decide)\s+(?:between|from)\s+(.+)$/i) ||
      raw.match(/\b(?:either)\s+(.+)$/i);

   if (!match) return [];
   const body = match[1]
      .replace(/[.!?]\s*(?:help|please)\s+me\s+(?:choose|pick|decide)[\s\S]*$/i, "")
      .replace(/\s+(?:and\s+)?(?:help|please)\s+me\s+(?:choose|pick|decide)[\s\S]*$/i, "")
      .replace(/\b(?:depending on the day|based on the day|later in the day|at night|tonight)\b.*$/i, "")
      .replace(/\s+and\s+make suggestions.*$/i, "")
      .trim();

   return [...new Set(
      body
         .split(/\s*(?:,|\/|\bor\b)\s*/i)
         .map((choice) => sanitizeChoice(choice.replace(/^(?:either|maybe|some)\s+/i, "")))
         .filter((choice) => choice.length >= 2),
   )].slice(0, 12);
}

function inferPeriod(lower: string): LifestylePeriod {
   if (/\b(?:morning|before work|before class)\b/.test(lower)) return "morning";
   if (/\b(?:afternoon|after lunch)\b/.test(lower)) return "afternoon";
   if (/\b(?:evening|tonight|later in the day|after work|night)\b/.test(lower)) return "evening";
   return "anytime";
}

function choiceSetTitle(period: LifestylePeriod) {
   if (period === "morning") return "Morning options";
   if (period === "afternoon") return "Afternoon options";
   if (period === "evening") return "Evening options";
   return "Flexible options";
}

function findChoiceSetForPrompt(profile: LifestyleProfileState, lower: string) {
   const period = inferPeriod(lower);
   return profile.flexibleChoiceSets.find((set) => set.period === period) ||
      profile.flexibleChoiceSets.find((set) => set.period === "anytime") ||
      profile.flexibleChoiceSets[0];
}

function feedbackFromPrompt(lower: string): FlexibleChoiceFeedback | null {
   if (/\b(?:liked that|i liked|that worked|more like that)\b/.test(lower)) return "liked";
   if (/\b(?:don'?t suggest|do not suggest|didn'?t like|did not like|not that again)\b/.test(lower)) return "disliked";
   if (/\b(?:skipped it|skip that|didn'?t do it|did not do it)\b/.test(lower)) return "skipped";
   if (/\b(?:i did it|went with that|did that|finished that)\b/.test(lower)) return "accepted";
   return null;
}

function minutesUntil(clock: string, now: Date) {
   const [hour, minute] = clock.split(":").map(Number);
   const target = new Date(now);
   target.setHours(hour, minute, 0, 0);

   if (target.getTime() <= now.getTime()) {
      // Bedtimes shortly after midnight belong to the current evening.
      if (hour <= 4 && now.getHours() >= 12) target.setDate(target.getDate() + 1);
      else return 0;
   }

   return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000));
}

function tomorrowEarliestStart(rhythm: DailyRhythmState, now: Date) {
   const tomorrow = new Date(now);
   tomorrow.setDate(now.getDate() + 1);
   tomorrow.setHours(12, 0, 0, 0);
   return buildRhythmForDate(rhythm, tomorrow)
      .filter((entry) => entry.kind === "schedule")
      .map((entry) => minutesFromClock(entry.time))
      .sort((a, b) => a - b)[0];
}

function classifyChoice(choice: string) {
   const lower = choice.toLowerCase();
   if (/\b(?:code|coding|program|study|studying|write|writing|business|project|build|design|practice)\b/.test(lower)) return "deep";
   if (/\b(?:read|reading|game|gaming|movie|tv|music|walk|relax|unwind|rest)\b/.test(lower)) return "recovery";
   return "neutral";
}

function choiceRecency(profile: LifestyleProfileState, setId: string, choice: string) {
   const index = [...profile.flexibleChoiceHistory].reverse().findIndex(
      (entry) => entry.setId === setId && entry.choice.toLowerCase() === choice.toLowerCase(),
   );
   return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function dislikedChoices(profile: LifestyleProfileState, setId: string) {
   return new Set(
      profile.flexibleChoiceHistory
         .filter((entry) => entry.setId === setId && entry.feedback === "disliked")
         .map((entry) => entry.choice.toLowerCase()),
   );
}

function chooseFlexibleChoice(
   profile: LifestyleProfileState,
   set: FlexibleChoiceSet,
   lifeState: LifeState,
   rhythm: DailyRhythmState,
   now = new Date(),
) {
   const disliked = dislikedChoices(profile, set.id);
   const candidates = set.choices.filter((choice) => !disliked.has(choice.toLowerCase()));
   if (!candidates.length) return null;

   const untilBed = profile.preferredBedtime ? minutesUntil(profile.preferredBedtime, now) : undefined;
   const tomorrowStart = tomorrowEarliestStart(rhythm, now);
   const lateWindow = typeof untilBed === "number" && untilBed <= 150;
   const earlyTomorrow = typeof tomorrowStart === "number" && tomorrowStart < 8 * 60;

   // Explicit day context ("I'm sick", "I'm exhausted") changes the scoring
   // for this date only. It never becomes a permanent assumption about the user.
   const recoveryDay = getRhythmDayContexts(rhythm, now).some((context) => context.kind === "recovery");

   const activeText = lifeState.items
      .filter((item) => item.state === "active")
      .map((item) => `${item.title} ${item.context}`)
      .join(" ")
      .toLowerCase();

   return [...candidates]
      .map((choice) => {
         const kind = classifyChoice(choice);
         let score = Math.min(choiceRecency(profile, set.id, choice), 12);

         if ((lateWindow || earlyTomorrow) && kind === "recovery") score += 5;
         if ((lateWindow || earlyTomorrow) && kind === "deep") score -= 5;
         if (!lateWindow && !earlyTomorrow && kind === "deep") score += 2;
         if (recoveryDay && kind === "recovery") score += 8;
         if (recoveryDay && kind === "deep") score -= 8;

         const words = choice.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
         if (words.some((word) => activeText.includes(word))) score += 4;

         return { choice, kind, score };
      })
      .sort((left, right) => right.score - left.score || left.choice.localeCompare(right.choice))[0];
}

function flexibleCopy(
   choice: string,
   kind: string,
   profile: LifestyleProfileState,
   rhythm: DailyRhythmState,
   tone: AllevinTone,
   now: Date,
) {
   const untilBed = profile.preferredBedtime ? minutesUntil(profile.preferredBedtime, now) : undefined;
   const tomorrowStart = tomorrowEarliestStart(rhythm, now);
   const earlyTomorrow = typeof tomorrowStart === "number" && tomorrowStart < 8 * 60;
   const lowerChoice = choice.toLowerCase();

   if (kind === "recovery" && (earlyTomorrow || (typeof untilBed === "number" && untilBed <= 150))) {
      const choiceLead = choice.charAt(0).toUpperCase() + choice.slice(1);
      const detail = `Tomorrow starts early enough to matter. ${choiceLead} fits the night without borrowing energy from the morning.`;
      return { title: `Go with ${lowerChoice}.`, detail };
   }

   if (kind === "deep" && typeof untilBed === "number" && untilBed >= 120) {
      const detail = `There’s enough runway before bed for one focused block. Give ${lowerChoice} a real hour, then shut it down instead of letting it eat the night.`;
      return { title: `Give ${lowerChoice} the block.`, detail };
   }

   const detail = tone === "direct"
      ? `${choice} has been sitting out long enough and it fits the time you have. One clean block. No need to turn the evening into a second shift.`
      : `${choice} fits the available time and has not been your most recent choice.`;
   return { title: `Pick ${lowerChoice}.`, detail };
}

export function getFlexibleChoiceSuggestion(
   lifeState: LifeState,
   rhythm: DailyRhythmState,
   nowMs = Date.now(),
   tone: AllevinTone = "direct",
): FlexibleChoiceSuggestion | null {
   const profile = readLifestyleProfile();
   const now = new Date(nowMs);
   const period: LifestylePeriod = now.getHours() >= 17 ? "evening" : now.getHours() >= 12 ? "afternoon" : "morning";
   const set =
      profile.flexibleChoiceSets.find((candidate) => candidate.period === period) ||
      profile.flexibleChoiceSets.find((candidate) => candidate.period === "anytime");

   if (!set) return null;

   const contextKey = `${now.toISOString().slice(0, 10)}:${period}:${set.id}`;
   const assigned = profile.assignments[contextKey];
   const validAssigned = assigned && set.choices.some((choice) => choice.toLowerCase() === assigned.toLowerCase()) ? assigned : null;
   const chosen = validAssigned
      ? { choice: validAssigned, kind: classifyChoice(validAssigned) }
      : chooseFlexibleChoice(profile, set, lifeState, rhythm, now);

   if (!chosen) return null;

   if (!validAssigned) {
      saveLifestyleProfile({
         ...profile,
         assignments: { ...profile.assignments, [contextKey]: chosen.choice },
         flexibleChoiceHistory: [
            ...profile.flexibleChoiceHistory,
            { setId: set.id, choice: chosen.choice, at: nowMs },
         ],
      });
   }

   const copy = flexibleCopy(chosen.choice, chosen.kind, profile, rhythm, tone, now);
   return {
      setId: set.id,
      setTitle: set.title,
      choice: chosen.choice,
      title: copy.title,
      detail: copy.detail,
   };
}

export function recordFlexibleChoiceFeedback(setId: string, choice: string, feedback: FlexibleChoiceFeedback) {
   const profile = readLifestyleProfile();
   const index = [...profile.flexibleChoiceHistory]
      .map((entry) => `${entry.setId}:${entry.choice.toLowerCase()}`)
      .lastIndexOf(`${setId}:${choice.toLowerCase()}`);
   if (index < 0) return false;
   const history = [...profile.flexibleChoiceHistory];
   history[index] = { ...history[index], feedback };
   saveLifestyleProfile({ ...profile, flexibleChoiceHistory: history });
   return true;
}

export function interpretLifestyleConversation(
   prompt: string,
   lifeState: LifeState,
   rhythm: DailyRhythmState,
   tone: AllevinTone = "direct",
): LifestyleConversationResult {
   const raw = prompt.trim();
   const lower = normalize(raw);
   if (!raw) return { handled: false, changed: false, reply: "" };

   const bedtimeCue = /\b(?:preferred\s+bedtime|bedtime|go to bed|usually in bed)\b/.test(lower);
   if (bedtimeCue) {
      const clock = parseClockFromPrompt(lower);
      if (clock) {
         setPreferredBedtime(clock);
         return { handled: true, changed: true, reply: `Bedtime set for ${formatClock(clock)}.` };
      }
   }

   const commuteCue = /\b(?:commute|drive|travel|get to work|get to class)\b/.test(lower);
   const commuteMatch = lower.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/);
   const routineMutationCue =
      /\b(?:add|create|schedule|set up)\b/.test(lower) &&
      /\b(?:before|after|at|workdays|school days|routine)\b/.test(lower);

   if (commuteCue && commuteMatch && !routineMutationCue) {
      const minutes = Math.max(1, Math.min(240, Number(commuteMatch[1])));
      setCommuteMinutes(minutes);
      return { handled: true, changed: true, reply: `I’ll use ${minutes} minutes as your normal travel buffer.` };
   }

   const choices = parseFlexibleChoices(raw);
   if (choices.length >= 2 && /\b(?:options|choices|choose|pick|decide|either)\b/.test(lower)) {
      const profile = readLifestyleProfile();
      const period = inferPeriod(lower);
      const existing = profile.flexibleChoiceSets.find((set) => set.period === period);
      upsertFlexibleChoiceSet({
         id: existing?.id,
         title: choiceSetTitle(period),
         period,
         choices,
      });
      return {
         handled: true,
         changed: true,
         reply: `I’ll keep ${choices.join(", ")} as ${period === "anytime" ? "flexible" : period} options and rotate them based on the day instead of defaulting to the same one.`,
      };
   }

   const feedback = feedbackFromPrompt(lower);
   if (feedback) {
      const profile = readLifestyleProfile();
      const last = profile.flexibleChoiceHistory[profile.flexibleChoiceHistory.length - 1];
      const referencesFlexibleChoice =
         Boolean(last) &&
         (
            lower.includes(last!.choice.toLowerCase()) ||
            /(?:that evening pick|that flexible choice|that option)/.test(lower)
         );

      if (last && referencesFlexibleChoice) {
         recordFlexibleChoiceFeedback(last.setId, last.choice, feedback);
         const reply =
            feedback === "disliked" ? "Got it. That option drops out of the rotation." :
            feedback === "liked" ? "Good. I’ll remember the direction without serving the exact same thing again." :
            feedback === "skipped" ? "Skipped. I’ll factor that into the next pick." :
            "Noted. That one worked.";
         return { handled: true, changed: true, reply };
      }
   }

   if (/\b(?:what should i do tonight|what should i do later|pick something for tonight|pick one for me|what fits tonight|what should i do with my free time)\b/.test(lower)) {
      const suggestion = getFlexibleChoiceSuggestion(lifeState, rhythm, Date.now(), tone);
      if (suggestion) return { handled: true, changed: false, reply: `${suggestion.title} ${suggestion.detail}` };
   }

   if (/\b(?:what do you know about my routine|what do you know about my schedule|what do you remember about my routine)\b/.test(lower)) {
      const profile = readLifestyleProfile();
      const pieces = [
         profile.preferredBedtime ? `Bedtime: ${formatClock(profile.preferredBedtime)}.` : "",
         profile.commuteMinutes ? `Travel buffer: ${profile.commuteMinutes} minutes.` : "",
         ...profile.flexibleChoiceSets.map((set) => `${set.title}: ${set.choices.join(", ")}.`),
      ].filter(Boolean);
      return {
         handled: true,
         changed: false,
         reply: pieces.length ? pieces.join(" ") : "I don’t have any lifestyle preferences saved yet.",
      };
   }

   return { handled: false, changed: false, reply: "" };
}

export function buildLifestyleContext() {
   const profile = readLifestyleProfile();
   return JSON.stringify({
      preferredBedtime: profile.preferredBedtime,
      commuteMinutes: profile.commuteMinutes,
      flexibleChoiceSets: profile.flexibleChoiceSets.map((set) => ({
         title: set.title,
         period: set.period,
         choices: set.choices,
      })),
      recentFlexibleChoices: profile.flexibleChoiceHistory.slice(-12).map((entry) => ({
         choice: entry.choice,
         feedback: entry.feedback,
         at: entry.at,
      })),
      lifestyleRule: "Use these only as user-supplied preferences. Do not invent lifestyle constraints. Flexible choices are suggestions, not commitments.",
   });
}
