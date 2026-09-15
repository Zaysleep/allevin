"use client";

import {
   readInterestPreferences,
   saveInterestPreferences,
   type AllevinInterestPreferences,
   type InterestNotificationContext,
   type SportsTeamPreference,
} from "@/lib/allevinInterests";
import { buildRhythmForDate, readDailyRhythm } from "@/lib/dailyRhythm";
import type { AllevinTone } from "@/lib/allevinVoice";

export type InterestConversationResult = {
   handled: boolean;
   changed?: boolean;
   receipt?: string;
   reply?: string;
};

function clean(value: string) {
   return value.replace(/\s+/g, " ").trim();
}

function clockFromPrompt(value: string) {
   const match = value.match(/\b(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
   if (!match) return null;
   let hours = Number(match[1]);
   const minutes = Number(match[2] || 0);
   if (match[3].toLowerCase() === "pm" && hours < 12) hours += 12;
   if (match[3].toLowerCase() === "am" && hours === 12) hours = 0;
   return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function displayClock(value: string) {
   const [hours, minutes] = value.split(":").map(Number);
   const suffix = hours >= 12 ? "PM" : "AM";
   return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function tickerSymbols(value: string) {
   const preferences = readInterestPreferences();
   const known = preferences.stocks.symbols.filter((symbol) => new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(value));
   const explicitUppercase = value.match(/\b[A-Z][A-Z0-9.-]{0,5}\b/g) || [];
   const phrase = value.match(/(?:track|follow|add|remove|delete|ticker(?:s)?|watchlist|price(?:s)?\s+(?:for|of))\s+(.+?)(?:\s+stocks?\b|[?.!]|$)/i)?.[1] || "";
   const phraseTokens = phrase.split(/\s*(?:,|\band\b)\s*/i).map((token) => token.trim().toUpperCase()).filter((token) => /^[A-Z][A-Z0-9.-]{0,5}$/.test(token));
   const excluded = new Set(["A", "I", "AM", "PM", "THE", "AND", "AT", "TO", "MY", "TRACK", "FOLLOW", "ADD", "REMOVE", "DELETE", "STOCK", "STOCKS", "PRICE", "PRICES", "WATCHLIST"]);
   return [...new Set([...known, ...explicitUppercase, ...phraseTokens].map((symbol) => symbol.toUpperCase()).filter((word) => !excluded.has(word)))].slice(0, 12);
}

function titleCase(value: string) {
   return clean(value).split(" ").map((word) => word ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : word).join(" ");
}

function teamFromPrompt(value: string, preferences: AllevinInterestPreferences) {
   const lower = value.toLowerCase();
   const existing = preferences.sports.teams.find((team) => {
      const full = team.name.toLowerCase();
      const nickname = full.split(/\s+/).at(-1) || full;
      return lower.includes(full) || lower.includes(nickname);
   });
   if (existing) return existing;
   const match = value.match(/(?:follow|track|about|did|do|when (?:do|are)|score for|score|before every)\s+(?:the\s+)?([a-z][a-z .'-]{1,50}?)(?:\s+(?:play|plays|game|win|lose|next|score)|[?.!,]|$)/i);
   const name = match?.[1] ? titleCase(match[1]) : "";
   if (!name) return undefined;
   const league: SportsTeamPreference["league"] = /padres|dodgers|yankees|baseball/i.test(name) ? "MLB"
      : /lakers|basketball|nba/i.test(name) ? "NBA"
         : /chargers|football|nfl/i.test(name) ? "NFL"
            : "other";
   return { id: `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, league, gameDay: true, pregame: true, finalScore: true, pregameMinutes: 30 };
}

export function interpretInterestMutation(promptValue: string): InterestConversationResult {
   const prompt = clean(promptValue);
   const preferences = readInterestPreferences();

   if (/\b(?:track|follow|add)\b[\s\S]*\b(?:stock|stocks|ticker|tickers|watchlist)\b|\b(?:track|follow|add)\s+[A-Z]{1,6}(?:\s*,\s*[A-Z]{1,6})+/i.test(prompt)) {
      const symbols = tickerSymbols(prompt);
      if (!symbols.length) return { handled: true, receipt: "Ask which ticker symbols should be added." };
      const next = [...new Set([...preferences.stocks.symbols, ...symbols])];
      saveInterestPreferences({ ...preferences, stocks: { ...preferences.stocks, enabled: true, symbols: next } });
      return { handled: true, changed: true, receipt: `The stock watchlist now contains ${next.join(", ")}.` };
   }

   if (/\b(?:stop tracking|remove|delete)\b[\s\S]*\b(?:stock|stocks|ticker|tickers|watchlist)\b/i.test(prompt)) {
      const symbols = tickerSymbols(prompt);
      const next = preferences.stocks.symbols.filter((symbol) => !symbols.includes(symbol));
      saveInterestPreferences({ ...preferences, stocks: { ...preferences.stocks, enabled: next.length > 0, symbols: next } });
      return { handled: true, changed: true, receipt: `Removed ${symbols.join(", ")} from the stock watchlist. The remaining tickers are ${next.join(", ") || "none"}.` };
   }

   if (/\b(?:market|stock|watchlist)\b[\s\S]*\b(?:report|recap|update)\b[\s\S]*\b(?:every weekday|weekdays|daily)\b/i.test(prompt)) {
      const time = clockFromPrompt(prompt) || preferences.stocks.reportTime;
      saveInterestPreferences({ ...preferences, stocks: { ...preferences.stocks, enabled: true, reportEnabled: true, reportTime: time } });
      return { handled: true, changed: true, receipt: `The watchlist report will arrive on weekdays at ${displayClock(time)}.` };
   }

   if (/\b(?:follow|track)\b[\s\S]*\b(?:team|padres|lakers|chargers|dodgers|yankees|nba|nfl|mlb|nhl)\b/i.test(prompt)) {
      const team = teamFromPrompt(prompt, preferences);
      if (!team) return { handled: true, receipt: "Ask which sports team should be followed." };
      const teams = [...preferences.sports.teams.filter((candidate) => candidate.name.toLowerCase() !== team.name.toLowerCase()), team];
      saveInterestPreferences({ ...preferences, sports: { ...preferences.sports, enabled: true, teams } });
      return { handled: true, changed: true, receipt: `${team.name} is now followed. Game-day, 30-minute pregame, and final-score updates are enabled.` };
   }

   if (/\b(?:stop following|stop tracking|remove|unfollow)\b[\s\S]*\b(?:team|padres|lakers|chargers|dodgers|yankees|nba|nfl|mlb|nhl)\b/i.test(prompt)) {
      const team = teamFromPrompt(prompt, preferences);
      if (!team) return { handled: true, receipt: "Ask which sports team should be removed." };
      const teams = preferences.sports.teams.filter((candidate) => candidate.id !== team.id);
      saveInterestPreferences({ ...preferences, sports: { ...preferences.sports, enabled: teams.length > 0, teams } });
      return { handled: true, changed: true, receipt: `${team.name} was removed from followed teams.` };
   }

   if (/\b(?:morning|daily) briefing\b[\s\S]*\b(?:at|around)\b/i.test(prompt)) {
      const time = clockFromPrompt(prompt);
      if (!time) return { handled: true, receipt: "Ask what exact time the daily briefing should arrive." };
      saveInterestPreferences({ ...preferences, briefing: { ...preferences.briefing, enabled: true, time } });
      return { handled: true, changed: true, receipt: `The daily briefing will arrive at ${displayClock(time)} on the selected days.` };
   }

   if (/\b(?:weather|forecast)\b[\s\S]*\b(?:every morning|daily|weekdays)\b/i.test(prompt)) {
      const time = clockFromPrompt(prompt) || preferences.weather.morningTime;
      saveInterestPreferences({ ...preferences, weather: { ...preferences.weather, enabled: true, morningEnabled: true, morningTime: time } });
      return { handled: true, changed: true, receipt: `The weather update will arrive at ${displayClock(time)}. The saved location is ${preferences.weather.location || "still needed"}.` };
   }

   return { handled: false };
}

export async function answerInterestQuestion(promptValue: string, tone: AllevinTone): Promise<InterestConversationResult> {
   const prompt = clean(promptValue);
   const lower = prompt.toLowerCase();
   const preferences = readInterestPreferences();
   let action: InterestNotificationContext["kind"] | "" = "";
   let symbols: string[] | undefined;
   let team: SportsTeamPreference | undefined;
   let finalOnly = false;

   if (/\bwhat (?:stocks|tickers) (?:am i|are we|do i have)|what(?:'s| is) on my watchlist\b/i.test(prompt)) {
      return { handled: true, receipt: preferences.stocks.symbols.length ? `The stock watchlist contains ${preferences.stocks.symbols.join(", ")}.` : "The stock watchlist is empty." };
   }
   if (/\bwhat teams? (?:am i following|do i follow|are followed)|which teams? (?:am i following|do i follow)\b/i.test(prompt)) {
      return { handled: true, receipt: preferences.sports.teams.length ? `The followed teams are ${preferences.sports.teams.map((item) => item.name).join(", ")}.` : "No sports teams are followed yet." };
   }
   if (/\b(?:weather|temperature|forecast|rain|jacket|umbrella|air quality|uv index)\b/i.test(prompt)) action = "weather";
   else if (/\b(?:stock|stocks|ticker|watchlist|trading at|market recap|market update|earnings|reports earnings)\b/i.test(prompt)) {
      action = "stocks";
      symbols = tickerSymbols(prompt).filter((symbol) => preferences.stocks.symbols.includes(symbol) || /^[A-Z]{1,6}$/.test(symbol));
   } else if (/\b(?:padres|lakers|chargers|game|score|play next|playing next|teams? (?:am i|do i)|sports)\b/i.test(prompt)) {
      team = teamFromPrompt(prompt, preferences);
      action = /\b(?:score|win|won|lose|lost|final)\b/i.test(lower) ? "sports-final" : "sports-gameday";
      finalOnly = action === "sports-final";
   } else if (/\b(?:morning|daily) briefing\b/i.test(prompt)) action = "briefing";
   if (!action) return { handled: false };

   try {
      const scheduleFacts = action === "briefing"
         ? buildRhythmForDate(readDailyRhythm(), new Date()).filter((entry) => !entry.completed && !entry.skipped).slice(0, 12).map((entry) => `${entry.time}${entry.endTime ? `–${entry.endTime}` : ""} ${entry.title}`)
         : undefined;
      const response = await fetch("/api/allevin/interests", {
         method: "POST",
         cache: "no-store",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ action, preferences, request: prompt, tone, symbols, team, finalOnly, includeImportantDates: /\bearnings|important date|report date\b/i.test(prompt), context: { kind: action, occurrenceKey: `chat:${action}:${Date.now()}`, preferences, team, scheduledAt: Date.now(), tone, scheduleFacts } }),
      });
      const payload = await response.json() as { ok?: boolean; reply?: string; error?: string };
      return { handled: true, reply: payload.ok && payload.reply ? payload.reply : payload.error || "That live source couldn't be reached right now." };
   } catch {
      return { handled: true, reply: "That live source couldn't be reached right now." };
   }
}
