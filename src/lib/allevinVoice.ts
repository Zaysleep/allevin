export type AllevinTone = "direct" | "balanced" | "calm";
export type VoiceMoment = "start" | "missed" | "done" | "skip" | "recovery" | "evening" | "clear";

export const ALLEVIN_TONE_STORAGE_KEY = "allevin-tone-mkxii";
export const ALLEVIN_TONE_UPDATED_EVENT = "allevin-tone-updated";

const LINES: Record<AllevinTone, Record<VoiceMoment, string[]>> = {
   direct: {
      start: [
         "{item}. You’re up. Move before the calendar starts making decisions for you.",
         "{item}. No ceremony. Get it handled and keep the day moving.",
      ],
      missed: [
         "{item} slipped past. Adjust it or drop it. The clock already voted.",
         "The original time for {item} has passed. Decide whether it still belongs in today.",
      ],
      done: [
         "{item}: done. Good. Next thing.",
         "{item} is handled. One less thing following you around.",
      ],
      skip: [
         "{item} is skipped today. One change, not a collapse.",
         "Skipping {item}. Fine. Keep the rest of the day intact.",
      ],
      recovery: [
         "Original plan is cooked. I tightened the flexible pieces around {item}. Keep moving.",
         "The schedule moved. I rebuilt the flexible part around {item}. No heroics required.",
      ],
      evening: [
         "The fixed part of the day is done. Handle one real loose end if it matters, then stop inventing work.",
         "Day is closing. Anything nonessential can survive until tomorrow.",
      ],
      clear: [
         "Nothing is pressing. Don’t go shopping for a crisis.",
         "You’re clear. Keep the space instead of picking a fight with it.",
      ],
   },
   balanced: {
      start: ["{item} is up next.", "Time for {item}."],
      missed: ["The time for {item} has passed. Adjust it, move it, or leave it for today.", "The window for {item} passed. Decide what you want to do with it."],
      done: ["{item} is done.", "Done: {item}."],
      skip: ["{item} is skipped for today.", "Skipping {item} today."],
      recovery: ["I adjusted the flexible parts of the day around {item}.", "The plan changed, so I tightened the remaining flexible time around {item}."],
      evening: ["The main part of the day is done. Only carry forward what still matters.", "You are at the end of the day. Leave the nonessential stuff where it is."],
      clear: ["Nothing needs your attention right now.", "You are clear right now."],
   },
   calm: {
      start: ["{item} is next when you are ready.", "It is time for {item}."],
      missed: ["{item} did not happen in its original window. You can adjust it without changing the whole day.", "The original time for {item} passed. It can be moved, shortened, or skipped."],
      done: ["{item} is complete.", "You finished {item}."],
      skip: ["{item} is skipped today.", "I have left {item} out for today."],
      recovery: ["I adjusted the flexible parts of the plan around {item}.", "The day changed, so the flexible pieces have been rearranged around {item}."],
      evening: ["The main part of the day is complete. Anything that can wait may stay for tomorrow.", "The day is winding down. Only keep what truly needs attention."],
      clear: ["Nothing needs your attention right now.", "There is open space right now."],
   },
};

function stablePick(lines: string[], seed: string) {
   const total = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
   return lines[total % lines.length];
}

export function readAllevinTone(): AllevinTone {
   if (typeof window === "undefined") return "direct";
   const value = window.localStorage.getItem(ALLEVIN_TONE_STORAGE_KEY);
   return value === "balanced" || value === "calm" || value === "direct" ? value : "direct";
}

export function saveAllevinTone(tone: AllevinTone) {
   if (typeof window !== "undefined") {
      window.localStorage.setItem(ALLEVIN_TONE_STORAGE_KEY, tone);
      window.dispatchEvent(new CustomEvent(ALLEVIN_TONE_UPDATED_EVENT));
   }
   return tone;
}

export function rhythmVoice(moment: VoiceMoment, item = "That", tone: AllevinTone = "direct", seed = new Date().toDateString()) {
   return stablePick(LINES[tone][moment], `${tone}:${moment}:${item}:${seed}`).replaceAll("{item}", item);
}

export function cleanWaitingTitle(title: string) {
   return title.replace(/^waiting\s+(?:for|on)\s+/i, "").trim();
}
