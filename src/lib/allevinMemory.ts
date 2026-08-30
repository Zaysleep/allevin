"use client";

// ========================================
// ALLEVIN MK XIII — Quiet Memory Distinctions
// Facts, preferences, observed choices, and temporary context intentionally
// keep different lifetimes. This module explains what is already stored; it
// does not create a second memory database or infer schedule truth from prose.
// ========================================

import { getRhythmDayContexts, type DailyRhythmState } from "@/lib/dailyRhythm";
import type { AllevinTone } from "@/lib/allevinVoice";

export function buildMemoryContext(rhythm: DailyRhythmState, tone: AllevinTone) {
   const facts: string[] = [];
   const preferences = [
      rhythm.bedtime ? `Preferred bedtime: ${rhythm.bedtime}.` : "",
      `Assistant style: ${tone}.`,
   ].filter(Boolean);
   const observed: string[] = [];
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

   const facts: string[] = [];
   const preferences = [
      rhythm.bedtime ? `You prefer bedtime around ${rhythm.bedtime}.` : "",
   ].filter(Boolean);
   const observed: string[] = [];
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
