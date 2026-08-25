"use client";

type HeroDayPart = "morning" | "afternoon" | "evening";

type HeroLine = {
   id: string;
   text: string;
};

type HeroLineHistory = Partial<Record<HeroDayPart, string[]>>;

const STORAGE_KEY = "allevin:hero-line-history:v1";

/**
 * These lines are ALLEVIN's own voice: sharp, dry, caring, and lightly
 * rebellious. They intentionally avoid quotes or direct imitation of any
 * existing character. The greeting stays general so it works for every user.
 */
const HERO_LINES: Record<HeroDayPart, HeroLine[]> = {
   morning: [
      { id: "m01", text: "You're up. Good. Get one clean win before the day starts making demands." },
      { id: "m02", text: "No need to conquer the world before breakfast. Just don't hand it the steering wheel." },
      { id: "m03", text: "The day's fresh. Try not to let everybody else spend it for you." },
      { id: "m04", text: "Start simple. Handle the thing that matters before the noise gets organized." },
      { id: "m05", text: "Morning's quiet for a reason. Use it before the meetings discover you." },
      { id: "m06", text: "You've got a whole day to make complicated. Maybe don't start there." },
      { id: "m07", text: "Pick a direction, move with purpose, and let momentum do some of the heavy lifting." },
      { id: "m08", text: "Nothing heroic required. Just show up sharp enough to make the next move count." },
      { id: "m09", text: "The schedule's a map, not a prison sentence. Use it. Adjust when reality gets clever." },
      { id: "m10", text: "Get the basics right first. Chaos hates a person who's already prepared." },
      { id: "m11", text: "You don't need more motivation. You need the first ten minutes handled." },
      { id: "m12", text: "Make future-you slightly less annoyed. That's a respectable morning target." },
      { id: "m13", text: "There's time. Spend it on purpose before somebody else volunteers it for you." },
      { id: "m14", text: "One worthwhile move beats six dramatic intentions. Start there." },
   ],
   afternoon: [
      { id: "a01", text: "Half the day's gone. Good news: the useful half can still be the next one." },
      { id: "a02", text: "Keep the middle of the day clean. Finish what matters before inventing new problems." },
      { id: "a03", text: "You've already survived the morning. Don't let the afternoon get ambitious." },
      { id: "a04", text: "Protect your attention. Everybody seems to want a piece of it around this hour." },
      { id: "a05", text: "One clean block of focus can rescue a surprisingly stupid afternoon." },
      { id: "a06", text: "Don't confuse being busy with moving forward. The calendar has enough fiction already." },
      { id: "a07", text: "Handle what's real. The imaginary emergencies can wait in line." },
      { id: "a08", text: "You've got enough time for something useful. That's also enough time to waste it, apparently." },
      { id: "a09", text: "Make the next move obvious, then do it before your brain opens negotiations." },
      { id: "a10", text: "If the plan still fits, use it. If it doesn't, change the plan—not the facts." },
      { id: "a11", text: "The day doesn't need a comeback story. It needs one sensible decision." },
      { id: "a12", text: "Keep a little energy in reserve. Evening-you has filed several complaints." },
      { id: "a13", text: "Do the useful thing, ignore the theatrical thing, and keep moving." },
      { id: "a14", text: "No gold star for doing everything. Pick what deserves the hour." },
   ],
   evening: [
      { id: "e01", text: "Day's winding down. Don't start a war with tomorrow just to squeeze in one more thing." },
      { id: "e02", text: "You made it through the noisy part. Keep the rest of the night worth having." },
      { id: "e03", text: "Quiet hours are expensive. Don't spend them all pretending you're still at work." },
      { id: "e04", text: "Nothing dramatic tonight. Handle what matters, enjoy what doesn't, and leave some fuel for morning." },
      { id: "e05", text: "The day had its turn. Take a little of the evening back." },
      { id: "e06", text: "You've got time for one good thing. Choose it before the internet chooses twelve bad ones." },
      { id: "e07", text: "Wrap the loose ends that deserve it. The rest can learn patience." },
      { id: "e08", text: "Don't mistake an open evening for an obligation to fill every inch of it." },
      { id: "e09", text: "Make tomorrow easier, then go do something you actually like. Revolutionary, I know." },
      { id: "e10", text: "The schedule can stop talking for a minute. You've earned some quiet." },
      { id: "e11", text: "If you've got energy, use it well. If you don't, stop trying to counterfeit it." },
      { id: "e12", text: "One last useful move is fine. A midnight productivity cult is not." },
      { id: "e13", text: "Leave the day cleaner than you found it. Doesn't have to be perfect." },
      { id: "e14", text: "Tomorrow can carry tomorrow's weight. That's why we invented tomorrow." },
   ],
};

function dayPartFor(date: Date): HeroDayPart {
   const hour = date.getHours();
   if (hour < 12) return "morning";
   if (hour < 18) return "afternoon";
   return "evening";
}

function readHistory(): HeroLineHistory {
   try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as HeroLineHistory;
      return parsed && typeof parsed === "object" ? parsed : {};
   } catch {
      return {};
   }
}

function writeHistory(history: HeroLineHistory) {
   try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
   } catch {
      // A blocked/private localStorage should never prevent the greeting from
      // rendering. In that case ALLEVIN still picks a line; it simply cannot
      // guarantee cross-refresh memory for the no-repeat queue.
   }
}

function randomIndex(length: number) {
   if (length <= 1) return 0;

   try {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0] % length;
   } catch {
      return Math.floor(Math.random() * length);
   }
}

/**
 * Returns a fresh hero line for this time of day.
 *
 * The browser remembers every line already shown in the current day-part bank
 * and will not reuse one until the whole bank has been exhausted. When a new
 * cycle starts, the immediately previous line remains excluded so a refresh
 * can never produce the exact same message twice in a row.
 */
export function getFreshAllevinHeroLine(now = new Date()) {
   if (typeof window === "undefined") return "";

   const part = dayPartFor(now);
   const bank = HERO_LINES[part];
   const history = readHistory();
   let used = Array.isArray(history[part]) ? history[part]!.filter((id) => bank.some((line) => line.id === id)) : [];
   const lastId = used.at(-1);

   // Once every line has appeared, begin a new cycle while keeping the last
   // line blocked. This preserves freshness without requiring an API call on
   // every page load.
   if (used.length >= bank.length) {
      used = lastId ? [lastId] : [];
   }

   let candidates = bank.filter((line) => !used.includes(line.id));
   if (!candidates.length) {
      candidates = bank.filter((line) => line.id !== lastId);
   }

   const chosen = candidates[randomIndex(candidates.length)] ?? bank[0];
   history[part] = [...used, chosen.id];
   writeHistory(history);

   return chosen.text;
}
