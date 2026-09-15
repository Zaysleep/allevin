import "server-only";

import { openAICompletionOptions, providerFailureIsRetryable } from "@/lib/allevinOpenAIRequest";
import { sanitizeInterestPreferences, type AllevinInterestPreferences, type InterestNotificationContext, type SportsTeamPreference } from "@/lib/allevinInterests";
import type { AllevinTone } from "@/lib/allevinVoice";

export interface InterestFactsResult {
   ok: boolean;
   kind: InterestNotificationContext["kind"] | "sports";
   facts?: string;
   source?: string;
   observedAt?: number;
   final?: boolean;
   error?: string;
}

export interface PlannedSportsEvent {
   eventId: string;
   team: SportsTeamPreference;
   name: string;
   startsAt: number;
   league: string;
}

function clean(value: unknown, limit = 500) {
   return String(value ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
}

async function fetchJson(url: string, headers?: HeadersInit) {
   const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(9000) });
   if (!response.ok) throw new Error(`source-${response.status}`);
   return response.json() as Promise<Record<string, unknown>>;
}

type SportsCacheEntry = {
   value: Record<string, unknown>;
   expiresAt: number;
   staleUntil: number;
};

const sportsCache = new Map<string, SportsCacheEntry>();
let sportsRequestQueue: Promise<void> = Promise.resolve();
let lastSportsRequestAt = 0;

function wait(milliseconds: number) {
   return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchSportsJson(url: string, cacheMinutes = 15) {
   const now = Date.now();
   const cached = sportsCache.get(url);
   if (cached && cached.expiresAt > now) return cached.value;

   let releaseQueue: () => void = () => {};
   const previousRequest = sportsRequestQueue;
   sportsRequestQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
   await previousRequest;

   try {
      const refreshed = sportsCache.get(url);
      if (refreshed && refreshed.expiresAt > Date.now()) return refreshed.value;

      const spacing = Math.max(0, 1_100 - (Date.now() - lastSportsRequestAt));
      if (spacing) await wait(spacing);

      let response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
      lastSportsRequestAt = Date.now();
      if (response.status === 429) {
         const stale = sportsCache.get(url);
         if (stale && stale.staleUntil > Date.now()) return stale.value;
         await wait(2_000);
         response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
         lastSportsRequestAt = Date.now();
      }
      if (!response.ok) throw new Error(response.status === 429 ? "sports-rate-limited" : `sports-source-${response.status}`);
      const value = await response.json() as Record<string, unknown>;
      sportsCache.set(url, {
         value,
         expiresAt: Date.now() + cacheMinutes * 60_000,
         staleUntil: Date.now() + 6 * 60 * 60_000,
      });
      return value;
   } finally {
      releaseQueue();
   }
}

function sportsErrorMessage(error: unknown) {
   if (error instanceof Error && error.message === "sports-rate-limited") {
      return "Sports updates are temporarily busy. Your followed teams are still saved, so try again in a minute.";
   }
   return "The sports schedule couldn't be refreshed right now. Your followed teams are still saved.";
}

async function fetchText(url: string, headers?: HeadersInit) {
   const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(9000) });
   if (!response.ok) throw new Error(`source-${response.status}`);
   return response.text();
}

function weatherDescription(value: unknown) {
   const code = Number(value);
   if (code === 0) return "clear sky";
   if ([1, 2, 3].includes(code)) return "partly cloudy to overcast";
   if ([45, 48].includes(code)) return "fog";
   if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
   if ([61, 63, 65, 66, 67].includes(code)) return "rain";
   if ([71, 73, 75, 77].includes(code)) return "snow";
   if ([80, 81, 82].includes(code)) return "rain showers";
   if ([85, 86].includes(code)) return "snow showers";
   if ([95, 96, 99].includes(code)) return "thunderstorms";
   return "condition unavailable";
}

async function weatherFacts(preferences: AllevinInterestPreferences) {
   const location = preferences.weather.location.trim();
   if (!location) return { ok: false, kind: "weather" as const, error: "Add a weather location in Interests first." };

   const geocode = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
   const place = Array.isArray(geocode.results) ? geocode.results[0] as Record<string, unknown> | undefined : undefined;
   const latitude = Number(place?.latitude);
   const longitude = Number(place?.longitude);
   if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ok: false, kind: "weather" as const, error: `I couldn't find weather data for ${location}.` };

   const unit = preferences.weather.unit === "celsius" ? "celsius" : "fahrenheit";
   const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
   forecastUrl.searchParams.set("latitude", String(latitude));
   forecastUrl.searchParams.set("longitude", String(longitude));
   forecastUrl.searchParams.set("temperature_unit", unit);
   forecastUrl.searchParams.set("wind_speed_unit", preferences.weather.unit === "celsius" ? "kmh" : "mph");
   forecastUrl.searchParams.set("precipitation_unit", preferences.weather.unit === "celsius" ? "mm" : "inch");
   forecastUrl.searchParams.set("timezone", "auto");
   forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m");
   forecastUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max");
   forecastUrl.searchParams.set("forecast_days", "2");
   const [forecast, air] = await Promise.all([
      fetchJson(forecastUrl.toString()),
      preferences.weather.outdoorConditions
         ? fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi&timezone=auto`).catch(() => ({}))
         : Promise.resolve({}),
   ]);
   const current = forecast.current as Record<string, unknown> | undefined;
   const daily = forecast.daily as Record<string, unknown> | undefined;
   const airCurrent = (air as Record<string, unknown>).current as Record<string, unknown> | undefined;
   const placeLabel = [place?.name, place?.admin1].map((part) => clean(part, 80)).filter(Boolean).join(", ") || location;
   const degree = preferences.weather.unit === "celsius" ? "C" : "F";
   const facts = {
      location: placeLabel,
      currentTemperature: `${current?.temperature_2m ?? "unknown"}°${degree}`,
      feelsLike: `${current?.apparent_temperature ?? "unknown"}°${degree}`,
      weatherCode: current?.weather_code,
      condition: weatherDescription(current?.weather_code),
      precipitationNow: current?.precipitation,
      rainNow: current?.rain,
      windSpeed: current?.wind_speed_10m,
      todayLow: Array.isArray(daily?.temperature_2m_min) ? `${daily.temperature_2m_min[0]}°${degree}` : "unknown",
      todayHigh: Array.isArray(daily?.temperature_2m_max) ? `${daily.temperature_2m_max[0]}°${degree}` : "unknown",
      rainChance: Array.isArray(daily?.precipitation_probability_max) ? `${daily.precipitation_probability_max[0]}%` : "unknown",
      uvIndex: Array.isArray(daily?.uv_index_max) ? daily.uv_index_max[0] : "unknown",
      usAirQualityIndex: airCurrent?.us_aqi ?? "unavailable",
      sourceTime: clean(current?.time, 40),
      timezone: clean(forecast.timezone, 60),
   };
   return { ok: true, kind: "weather" as const, facts: JSON.stringify(facts), source: "Open-Meteo", observedAt: Date.now() };
}

async function stockFacts(preferences: AllevinInterestPreferences, requestedSymbols?: string[], includeImportantDates = false) {
   const apiKey = process.env.ALPHA_VANTAGE_API_KEY?.trim();
   if (!apiKey) return { ok: false, kind: "stocks" as const, error: "Stock data isn't connected yet. Add ALPHA_VANTAGE_API_KEY to the environment." };
   const symbols = (requestedSymbols?.length ? requestedSymbols : preferences.stocks.symbols).slice(0, 12);
   if (!symbols.length) return { ok: false, kind: "stocks" as const, error: "Add at least one ticker to your stock watchlist first." };

   const quotes = await Promise.all(symbols.map(async (symbol) => {
      try {
         const data = await fetchJson(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`);
         const quote = data["Global Quote"] as Record<string, unknown> | undefined;
         if (!quote || !quote["05. price"]) return { symbol, unavailable: true };
         return {
            symbol,
            price: clean(quote["05. price"], 30),
            change: clean(quote["09. change"], 30),
            changePercent: clean(quote["10. change percent"], 30),
            latestTradingDay: clean(quote["07. latest trading day"], 30),
            previousClose: clean(quote["08. previous close"], 30),
         };
      } catch {
         return { symbol, unavailable: true };
      }
   }));
   const market = await fetchJson(`https://www.alphavantage.co/query?function=MARKET_STATUS&apikey=${encodeURIComponent(apiKey)}`).catch(() => ({}));
   const marketRecord = market as Record<string, unknown>;
   const markets = Array.isArray(marketRecord.markets) ? marketRecord.markets as Array<Record<string, unknown>> : [];
   const usEquity = markets.find((entry) => clean(entry.market_type, 40).toLowerCase() === "equity" && clean(entry.region, 40).toLowerCase().includes("united states"));
   const earnings = includeImportantDates && preferences.stocks.importantDates
      ? await Promise.all(symbols.slice(0, 5).map(async (symbol) => {
         try {
            const csv = await fetchText(`https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${encodeURIComponent(symbol)}&horizon=3month&apikey=${encodeURIComponent(apiKey)}`);
            const [headerLine, firstLine] = csv.trim().split(/\r?\n/);
            if (!headerLine || !firstLine) return { symbol, reportDate: "unavailable" };
            const headers = headerLine.split(",");
            const values = firstLine.split(",");
            const row = Object.fromEntries(headers.map((header, index) => [header.trim(), clean(values[index], 80)]));
            return { symbol, reportDate: row.reportDate || "unavailable", estimate: row.estimate || "unavailable", currency: row.currency || "" };
         } catch {
            return { symbol, reportDate: "unavailable" };
         }
      }))
      : [];
   return {
      ok: quotes.some((quote) => !("unavailable" in quote)),
      kind: "stocks" as const,
      facts: JSON.stringify({ quotes, earnings, marketStatus: clean(usEquity?.current_status, 40) || "unknown", freshness: "latest available quote; real-time access depends on the configured market-data entitlement", checkedAt: new Date().toISOString() }),
      source: "Alpha Vantage",
      observedAt: Date.now(),
      error: quotes.every((quote) => "unavailable" in quote) ? "The market data provider did not return a usable quote." : undefined,
   };
}

function sportsConfig() {
   const key = process.env.THESPORTSDB_API_KEY?.trim();
   return key ? `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}` : null;
}

async function lookupSportsTeam(team: SportsTeamPreference) {
   const base = sportsConfig();
   if (!base) throw new Error("Sports data isn't connected yet. Add THESPORTSDB_API_KEY to the environment.");
   if (team.providerId) return { ...team, providerId: team.providerId };
   const data = await fetchSportsJson(`${base}/searchteams.php?t=${encodeURIComponent(team.name)}`, 24 * 60);
   const teams = Array.isArray(data.teams) ? data.teams as Array<Record<string, unknown>> : [];
   const targetLeague = team.league.toLowerCase();
   const match = teams.find((candidate) => clean(candidate.strLeague, 40).toLowerCase().includes(targetLeague.toLowerCase())) || teams[0];
   const providerId = clean(match?.idTeam, 80);
   if (!providerId) throw new Error(`I couldn't find ${team.name} in the sports schedule.`);
   return { ...team, providerId, name: clean(match?.strTeam, 80) || team.name };
}

function eventTimestamp(event: Record<string, unknown>) {
   const timestamp = Date.parse(clean(event.strTimestamp, 80));
   if (Number.isFinite(timestamp)) return timestamp;
   const date = clean(event.dateEvent, 20);
   const time = clean(event.strTime, 20) || "00:00:00";
   const fallback = Date.parse(`${date}T${time.endsWith("Z") ? time : `${time}Z`}`);
   return Number.isFinite(fallback) ? fallback : 0;
}

function normalizedEvent(event: Record<string, unknown>) {
   return {
      id: clean(event.idEvent, 80),
      name: clean(event.strEvent, 160),
      league: clean(event.strLeague, 60),
      startsAt: eventTimestamp(event),
      status: clean(event.strStatus, 60),
      homeTeam: clean(event.strHomeTeam, 100),
      awayTeam: clean(event.strAwayTeam, 100),
      homeScore: clean(event.intHomeScore, 20),
      awayScore: clean(event.intAwayScore, 20),
      venue: clean(event.strVenue, 100),
   };
}

export async function upcomingSportsEvents(preferencesValue: unknown): Promise<PlannedSportsEvent[]> {
   const preferences = sanitizeInterestPreferences(preferencesValue);
   if (!preferences.sports.enabled || !preferences.sports.teams.length || !sportsConfig()) return [];
   const events = await Promise.all(preferences.sports.teams.map(async (originalTeam) => {
      try {
         const team = await lookupSportsTeam(originalTeam);
         const data = await fetchSportsJson(`${sportsConfig()}/eventsnext.php?id=${encodeURIComponent(team.providerId || "")}`, 15);
         const rawEvents = Array.isArray(data.events) ? data.events as Array<Record<string, unknown>> : [];
         return rawEvents.map(normalizedEvent).filter((event) => event.id && event.startsAt > Date.now() - 60_000).slice(0, 5).map((event) => ({
            eventId: event.id,
            team,
            name: event.name,
            startsAt: event.startsAt,
            league: event.league,
         }));
      } catch {
         return [];
      }
   }));
   return events.flat().sort((left, right) => left.startsAt - right.startsAt);
}

async function sportsFacts(preferences: AllevinInterestPreferences, teamValue?: SportsTeamPreference, eventId?: string, finalOnly = false) {
   const team = teamValue || preferences.sports.teams[0];
   if (!team) return { ok: false, kind: "sports" as const, error: "Follow a team in Interests first." };
   let resolved: SportsTeamPreference;
   try {
      resolved = await lookupSportsTeam(team);
   } catch (error) {
      return { ok: false, kind: "sports" as const, error: sportsErrorMessage(error) };
   }
   const base = sportsConfig()!;
   let data: Record<string, unknown>;
   try {
      data = eventId
         ? await fetchSportsJson(`${base}/lookupevent.php?id=${encodeURIComponent(eventId)}`, finalOnly ? 3 : 15)
         : finalOnly
            ? await fetchSportsJson(`${base}/eventslast.php?id=${encodeURIComponent(resolved.providerId || "")}`, 3)
            : await fetchSportsJson(`${base}/eventsnext.php?id=${encodeURIComponent(resolved.providerId || "")}`, 15);
   } catch (error) {
      return { ok: false, kind: "sports" as const, error: sportsErrorMessage(error) };
   }
   const raw = (Array.isArray(data.events) ? data.events : Array.isArray(data.results) ? data.results : []) as Array<Record<string, unknown>>;
   const candidates = raw.map(normalizedEvent).filter((candidate) => candidate.id);
   const event = finalOnly || eventId
      ? candidates[0]
      : candidates.filter((candidate) => candidate.startsAt > Date.now() && !/final|finished|ft|aet/i.test(candidate.status)).sort((left, right) => left.startsAt - right.startsAt)[0];
   if (!event && !finalOnly) {
      return {
         ok: true,
         kind: "sports" as const,
         facts: JSON.stringify({ followedTeam: resolved.name, upcomingEvent: null, checkedAt: new Date().toISOString() }),
         source: "TheSportsDB",
         observedAt: Date.now(),
         final: false,
      };
   }
   if (!event) return { ok: false, kind: "sports" as const, error: `No recent result is available for ${resolved.name}.` };
   const final = /final|finished|ft|aet/i.test(event.status) || Boolean(event.homeScore && event.awayScore && event.startsAt < Date.now() - 5 * 60 * 60_000);
   return {
      ok: true,
      kind: "sports" as const,
      facts: JSON.stringify({ followedTeam: resolved.name, noSpoilers: preferences.sports.noSpoilers, event, checkedAt: new Date().toISOString() }),
      source: "TheSportsDB",
      observedAt: Date.now(),
      final,
   };
}

export async function resolveInterestFacts(
   context: InterestNotificationContext,
   options?: { requestedSymbols?: string[]; questionTeam?: SportsTeamPreference; finalOnly?: boolean; includeImportantDates?: boolean },
): Promise<InterestFactsResult> {
   const preferences = sanitizeInterestPreferences(context.preferences);
   try {
      if (context.kind === "weather") return weatherFacts(preferences);
      if (context.kind === "stocks" || context.kind === "monthly-stocks") return stockFacts(preferences, options?.requestedSymbols, options?.includeImportantDates || context.kind === "monthly-stocks");
      if (context.kind === "sports-gameday" || context.kind === "sports-pregame" || context.kind === "sports-final") {
         return sportsFacts(preferences, options?.questionTeam || context.team, context.eventId, options?.finalOnly || context.kind === "sports-final");
      }
      if (context.kind === "briefing") {
         const requests: Array<Promise<InterestFactsResult>> = [];
         if (preferences.briefing.includeWeather && preferences.weather.enabled) requests.push(weatherFacts(preferences));
         if (preferences.briefing.includeStocks && preferences.stocks.enabled && preferences.stocks.symbols.length) requests.push(stockFacts(preferences));
         if (preferences.briefing.includeSports && preferences.sports.enabled && preferences.sports.teams.length) requests.push(Promise.all(preferences.sports.teams.slice(0, 3).map((team) => sportsFacts(preferences, team))).then((parts) => ({ ok: parts.some((part) => part.ok), kind: "sports" as const, facts: JSON.stringify(parts.filter((part) => part.ok).map((part) => part.facts)), source: "TheSportsDB", observedAt: Date.now() })));
         const settled = await Promise.allSettled(requests);
         const parts = settled.flatMap((result) => result.status === "fulfilled" && result.value.ok && result.value.facts ? [result.value] : []);
         const schedule = (context.scheduleFacts || []).map((item) => clean(item, 160)).filter(Boolean).slice(0, 12);
         if (!parts.length && !schedule.length) return { ok: false, kind: "briefing", error: "No briefing information was available." };
         return { ok: true, kind: "briefing", facts: JSON.stringify({ schedule, interests: parts.map((part) => ({ kind: part.kind, source: part.source, facts: part.facts })) }), source: parts.map((part) => part.source).filter(Boolean).join(", ") || "saved schedule", observedAt: Date.now() };
      }
      return { ok: false, kind: context.kind, error: "That interest is not supported." };
   } catch {
      return { ok: false, kind: context.kind, error: "The live source couldn't be reached right now." };
   }
}

function parseJson(value: string) {
   try {
      return JSON.parse(value) as Record<string, unknown>;
   } catch {
      const object = value.match(/\{[\s\S]*\}/)?.[0];
      return object ? JSON.parse(object) as Record<string, unknown> : {};
   }
}

export async function generateInterestLanguage({
   facts,
   request,
   tone,
   notification,
}: {
   facts: InterestFactsResult;
   request: string;
   tone: AllevinTone;
   notification: boolean;
}) {
   if (!facts.ok || !facts.facts) return null;
   const apiKey = process.env.OPENAI_API_KEY?.trim();
   const model = (process.env.ALLEVIN_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
   if (!apiKey) return null;
   const responseFormat = notification
      ? { type: "json_schema", json_schema: { name: "allevin_interest_notification", strict: true, schema: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"] } } }
      : { type: "json_schema", json_schema: { name: "allevin_interest_reply", strict: true, schema: { type: "object", additionalProperties: false, properties: { reply: { type: "string" } }, required: ["reply"] } } };
   const providerRequest = () => fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
         model,
         ...openAICompletionOptions(model, notification ? 500 : 700, 0.8),
         response_format: responseFormat,
         messages: [
            {
               role: "system",
               content: `You are ALLEVIN, a concise and attentive personal assistant. Write ${notification ? "a short notification title and a one- or two-sentence body" : "a short plain-text answer"} using only the verified facts supplied. The source data is authoritative. Never invent a price, score, opponent, game time, weather condition, schedule, or personal motive. Preserve timestamps and freshness language when financial data is not explicitly real-time. Respect noSpoilers: if true, never reveal a score unless the user's request explicitly asks for it. ${tone === "calm" ? "Use a gentle, low-pressure voice." : tone === "balanced" ? "Use a natural, restrained voice." : "Use a clear, confident voice."} Avoid robotic openings, hype, filler, emojis, Markdown, and generic productivity advice. ${notification ? "Keep the body under 190 characters and the title under 70 characters." : "Use real line breaks only when they materially improve a multi-item report."}`,
            },
            { role: "user", content: `REQUEST\n${clean(request, 500)}\n\nVERIFIED FACTS\n${facts.facts}\n\nSOURCE\n${facts.source || "verified provider"}\n\nOBSERVED AT\n${facts.observedAt ? new Date(facts.observedAt).toISOString() : "unknown"}` },
         ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
   });
   let response = await providerRequest();
   if (!response.ok && providerFailureIsRetryable(response.status)) {
      await response.text();
      response = await providerRequest();
   }
   if (!response.ok) return null;
   const data = await response.json();
   const content = data?.choices?.[0]?.message?.content;
   if (typeof content !== "string" || !content.trim()) return null;
   const parsed = parseJson(content);
   if (notification) {
      const title = clean(parsed.title, 70);
      const body = clean(parsed.body, 220);
      return title && body ? { title, body } : null;
   }
   const reply = clean(parsed.reply, 2500);
   return reply ? { reply } : null;
}
