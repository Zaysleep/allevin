import type { AllevinTone } from "@/lib/allevinVoice";

export const ALLEVIN_INTERESTS_STORAGE_KEY = "allevin-interests-mkxxv-1";
export const ALLEVIN_INTERESTS_UPDATED_EVENT = "allevin-interests-updated";

export type TemperatureUnit = "fahrenheit" | "celsius";
export interface SportsTeamPreference {
   id: string;
   name: string;
   league: "MLB" | "NBA" | "NFL" | "NHL" | "other";
   providerId?: string;
   gameDay: boolean;
   pregame: boolean;
   finalScore: boolean;
   pregameMinutes: number;
}

export interface AllevinInterestPreferences {
   weather: {
      enabled: boolean;
      location: string;
      unit: TemperatureUnit;
      morningEnabled: boolean;
      morningTime: string;
      outdoorConditions: boolean;
   };
   stocks: {
      enabled: boolean;
      symbols: string[];
      reportEnabled: boolean;
      reportTime: string;
      reportDays: number[];
      monthlyReviewEnabled: boolean;
      monthlyReviewTime: string;
      importantDates: boolean;
   };
   sports: {
      enabled: boolean;
      teams: SportsTeamPreference[];
      noSpoilers: boolean;
      gameDayTime: string;
   };
   briefing: {
      enabled: boolean;
      time: string;
      days: number[];
      includeWeather: boolean;
      includeStocks: boolean;
      includeSports: boolean;
   };
}

export interface InterestNotificationContext {
   kind: "weather" | "stocks" | "monthly-stocks" | "sports-gameday" | "sports-pregame" | "sports-final" | "briefing";
   occurrenceKey: string;
   preferences: AllevinInterestPreferences;
   team?: SportsTeamPreference;
   eventId?: string;
   scheduledAt: number;
   retryCount?: number;
   tone?: AllevinTone;
   scheduleFacts?: string[];
}

const DEFAULTS: AllevinInterestPreferences = {
   weather: {
      enabled: false,
      location: "",
      unit: "fahrenheit",
      morningEnabled: false,
      morningTime: "06:05",
      outdoorConditions: true,
   },
   stocks: {
      enabled: false,
      symbols: [],
      reportEnabled: false,
      reportTime: "15:45",
      reportDays: [1, 2, 3, 4, 5],
      monthlyReviewEnabled: false,
      monthlyReviewTime: "09:00",
      importantDates: true,
   },
   sports: {
      enabled: false,
      teams: [],
      noSpoilers: false,
      gameDayTime: "09:00",
   },
   briefing: {
      enabled: false,
      time: "06:05",
      days: [1, 2, 3, 4, 5],
      includeWeather: true,
      includeStocks: true,
      includeSports: true,
   },
};

function cleanText(value: unknown, limit: number) {
   return String(value ?? "").replace(/[<>\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanTime(value: unknown, fallback: string) {
   const time = cleanText(value, 5);
   return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
}

function cleanDays(value: unknown, fallback: number[]) {
   if (!Array.isArray(value)) return [...fallback];
   const days = [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
   return days.length ? days : [...fallback];
}

function cleanSymbols(value: unknown) {
   if (!Array.isArray(value)) return [];
   return [...new Set(value.map((symbol) => cleanText(symbol, 12).toUpperCase()).filter((symbol) => /^[A-Z][A-Z0-9.-]{0,10}$/.test(symbol)))].slice(0, 20);
}

function cleanTeam(value: unknown): SportsTeamPreference | null {
   if (!value || typeof value !== "object") return null;
   const raw = value as Partial<SportsTeamPreference>;
   const name = cleanText(raw.name, 80);
   if (!name) return null;
   const league = ["MLB", "NBA", "NFL", "NHL", "other"].includes(String(raw.league)) ? raw.league as SportsTeamPreference["league"] : "other";
   return {
      id: cleanText(raw.id, 100) || `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      league,
      providerId: cleanText(raw.providerId, 80) || undefined,
      gameDay: raw.gameDay !== false,
      pregame: raw.pregame !== false,
      finalScore: raw.finalScore !== false,
      pregameMinutes: Math.max(5, Math.min(180, Math.round(Number(raw.pregameMinutes) || 30))),
   };
}

export function sanitizeInterestPreferences(value: unknown): AllevinInterestPreferences {
   const raw = value && typeof value === "object" ? value as Partial<AllevinInterestPreferences> : {};
   const weather = raw.weather || DEFAULTS.weather;
   const stocks = raw.stocks || DEFAULTS.stocks;
   const sports = raw.sports || DEFAULTS.sports;
   const briefing = raw.briefing || DEFAULTS.briefing;
   const teams = Array.isArray(sports.teams) ? sports.teams.map(cleanTeam).filter((team): team is SportsTeamPreference => Boolean(team)).slice(0, 12) : [];

   return {
      weather: {
         enabled: weather.enabled === true,
         location: cleanText(weather.location, 100),
         unit: weather.unit === "celsius" ? "celsius" : "fahrenheit",
         morningEnabled: weather.morningEnabled === true,
         morningTime: cleanTime(weather.morningTime, DEFAULTS.weather.morningTime),
         outdoorConditions: weather.outdoorConditions !== false,
      },
      stocks: {
         enabled: stocks.enabled === true,
         symbols: cleanSymbols(stocks.symbols),
         reportEnabled: stocks.reportEnabled === true,
         reportTime: cleanTime(stocks.reportTime, DEFAULTS.stocks.reportTime),
         reportDays: cleanDays(stocks.reportDays, DEFAULTS.stocks.reportDays),
         monthlyReviewEnabled: stocks.monthlyReviewEnabled === true,
         monthlyReviewTime: cleanTime(stocks.monthlyReviewTime, DEFAULTS.stocks.monthlyReviewTime),
         importantDates: stocks.importantDates !== false,
      },
      sports: {
         enabled: sports.enabled === true,
         teams,
         noSpoilers: sports.noSpoilers === true,
         gameDayTime: cleanTime(sports.gameDayTime, DEFAULTS.sports.gameDayTime),
      },
      briefing: {
         enabled: briefing.enabled === true,
         time: cleanTime(briefing.time, DEFAULTS.briefing.time),
         days: cleanDays(briefing.days, DEFAULTS.briefing.days),
         includeWeather: briefing.includeWeather !== false,
         includeStocks: briefing.includeStocks !== false,
         includeSports: briefing.includeSports !== false,
      },
   };
}

export function defaultInterestPreferences() {
   return sanitizeInterestPreferences(DEFAULTS);
}

export function readInterestPreferences() {
   if (typeof window === "undefined") return defaultInterestPreferences();
   try {
      return sanitizeInterestPreferences(JSON.parse(window.localStorage.getItem(ALLEVIN_INTERESTS_STORAGE_KEY) || "null"));
   } catch {
      return defaultInterestPreferences();
   }
}

export function saveInterestPreferences(preferences: AllevinInterestPreferences) {
   if (typeof window === "undefined") return;
   const safe = sanitizeInterestPreferences(preferences);
   window.localStorage.setItem(ALLEVIN_INTERESTS_STORAGE_KEY, JSON.stringify(safe));
   window.dispatchEvent(new CustomEvent(ALLEVIN_INTERESTS_UPDATED_EVENT));
}

export function interestSummary(preferences: AllevinInterestPreferences) {
   const active: string[] = [];
   if (preferences.weather.enabled) active.push("Weather");
   if (preferences.stocks.enabled) active.push(preferences.stocks.symbols.length ? `${preferences.stocks.symbols.length} stocks` : "Stocks");
   if (preferences.sports.enabled) active.push(preferences.sports.teams.length ? `${preferences.sports.teams.length} teams` : "Sports");
   if (preferences.briefing.enabled) active.push("Daily briefing");
   return active.length ? active.join(" · ") : "Nothing followed yet";
}

export function minutesFromInterestTime(value: string) {
   const [hours, minutes] = value.split(":").map(Number);
   return hours * 60 + minutes;
}
