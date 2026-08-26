"use client";

// ========================================
// ALLEVIN MK XIII — Quiet Memory Distinctions
// Facts, preferences, observed choices, and temporary context intentionally
// keep different lifetimes. This module explains what is already stored; it
// does not create a second memory database or infer schedule truth from prose.
// ========================================

import { readLifestyleProfile } from "@/lib/allevinLifestyleProfile";
import { getRhythmDayContexts, type DailyRhythmState } from "@/lib/dailyRhythm";
import type { AllevinTone } from "@/lib/allevinVoice";

function humanDuration(minutes: number) {
   const hours = Math.floor(minutes / 60);
   const rest = minutes % 60;
   if (!hours) return `${rest} minutes`;
   if (!rest) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
   return `${hours} hr ${rest} min`;
}

export function buildMemoryContext(rhythm: DailyRhythmState, tone: AllevinTone) {
   const profile = readLifestyleProfile();
   const facts = [
      profile.commuteMinutes ? `Typical travel time: ${humanDuration(profile.commuteMinutes)}.` : "",
   ].filter(Boolean);
   const preferences = [
      profile.preferredBedtime ? `Preferred bedtime: ${profile.preferredBedtime}.` : "",
      `Assistant style: ${tone}.`,
      ...profile.flexibleChoiceSets.map((set) => `${set.title}: ${set.choices.join(", ")}.`),
   ].filter(Boolean);
   const observed = profile.flexibleChoiceHistory
      .filter((entry) => entry.feedback === "accepted" || entry.feedback === "liked")
      .slice(-8)
      .map((entry) => `${entry.choice} was chosen ${new Date(entry.at).toLocaleDateString([], { weekday: "long" })}.`);
   const temporary = getRhythmDayContexts(rhythm).slice(-5).map((entry) => entry.text);

   return [
      "MEMORY LIFETIMES (do not promote one category into another):",
      `Explicit facts: ${facts.length ? facts.join(" ") : "none recorded"}`,
      `Preferences: ${preferences.length ? preferences.join(" ") : "none recorded"}`,
      `Observed choices: ${observed.length ? observed.join(" ") : "none recorded"}`,
      `Today-only context: ${temporary.length ? temporary.join(" ") : "none recorded"}`,
   ].join("\n");
}

export function answerMemoryQuestion(prompt: string, rhythm: DailyRhythmState, tone: AllevinTone) {
   if (!/\bwhat (?:have you learned|do you know|do you remember)\b|\bwhat have i told you\b/i.test(prompt)) {
      return { handled: false, reply: "" };
   }

   const profile = readLifestyleProfile();
   const facts = profile.commuteMinutes ? [`Your usual travel time is ${humanDuration(profile.commuteMinutes)}.`] : [];
   const preferences = [
      profile.preferredBedtime ? `You prefer bedtime around ${profile.preferredBedtime}.` : "",
      ...profile.flexibleChoiceSets.map((set) => `For ${set.title.toLowerCase()}, you like choosing among ${set.choices.join(", ")}.`),
   ].filter(Boolean);
   const chosen = profile.flexibleChoiceHistory
      .filter((entry) => entry.feedback === "accepted" || entry.feedback === "liked")
      .slice(-6);
   const counts = new Map<string, number>();
   for (const entry of chosen) counts.set(entry.choice, (counts.get(entry.choice) || 0) + 1);
   const observed = [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([choice, count]) => `You have chosen ${choice} ${count} times recently.`);
   const temporary = getRhythmDayContexts(rhythm).slice(-3).map((entry) => `For today only: ${entry.text}`);
   const sections = [
      facts.length ? `Explicit facts\n${facts.join("\n")}` : "",
      preferences.length ? `Preferences\n${preferences.join("\n")}` : "",
      observed.length ? `Patterns I have observed\n${observed.join("\n")}` : "",
      temporary.length ? `Temporary context\n${temporary.join("\n")}` : "",
   ].filter(Boolean);

   return {
      handled: true,
      reply: sections.length
         ? sections.join("\n\n")
         : `I don’t have enough saved yet to claim a pattern. Your assistant style is ${tone}, but I won’t turn one choice into a permanent preference.`,
   };
}
