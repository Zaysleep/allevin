import { NextResponse } from "next/server";

import { generateInterestLanguage, resolveInterestFacts, upcomingSportsEvents } from "@/lib/allevinInterestProviders";
import { sanitizeInterestPreferences, type InterestNotificationContext, type SportsTeamPreference } from "@/lib/allevinInterests";
import type { AllevinTone } from "@/lib/allevinVoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, limit = 500) {
   return String(value ?? "").replace(/<[^>]+>/g, "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeTeam(value: unknown): SportsTeamPreference | undefined {
   if (!value || typeof value !== "object") return undefined;
   const raw = value as Partial<SportsTeamPreference>;
   const name = clean(raw.name, 80);
   if (!name) return undefined;
   return {
      id: clean(raw.id, 100) || `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      league: ["MLB", "NBA", "NFL", "NHL", "other"].includes(String(raw.league)) ? raw.league as SportsTeamPreference["league"] : "other",
      providerId: clean(raw.providerId, 80) || undefined,
      gameDay: raw.gameDay !== false,
      pregame: raw.pregame !== false,
      finalScore: raw.finalScore !== false,
      pregameMinutes: Math.max(5, Math.min(180, Math.round(Number(raw.pregameMinutes) || 30))),
   };
}

function safeContext(value: unknown): InterestNotificationContext | null {
   if (!value || typeof value !== "object") return null;
   const raw = value as Partial<InterestNotificationContext>;
   const kinds: InterestNotificationContext["kind"][] = ["weather", "stocks", "monthly-stocks", "sports-gameday", "sports-pregame", "sports-final", "briefing"];
   if (!kinds.includes(raw.kind as InterestNotificationContext["kind"])) return null;
   const scheduledAt = Number(raw.scheduledAt);
   return {
      kind: raw.kind as InterestNotificationContext["kind"],
      occurrenceKey: clean(raw.occurrenceKey, 240) || `${raw.kind}:${Date.now()}`,
      preferences: sanitizeInterestPreferences(raw.preferences),
      team: safeTeam(raw.team),
      eventId: clean(raw.eventId, 80) || undefined,
      scheduledAt: Number.isFinite(scheduledAt) ? scheduledAt : Date.now(),
      retryCount: Math.max(0, Math.min(3, Math.round(Number(raw.retryCount) || 0))),
      tone: raw.tone === "calm" || raw.tone === "balanced" ? raw.tone : "direct",
      scheduleFacts: Array.isArray(raw.scheduleFacts) ? raw.scheduleFacts.map((item) => clean(item, 160)).filter(Boolean).slice(0, 12) : undefined,
   };
}

export async function GET() {
   return NextResponse.json({
      ok: true,
      weather: true,
      stocks: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
      sports: Boolean(process.env.THESPORTSDB_API_KEY),
   }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
   const requestUrl = new URL(request.url);
   const origin = request.headers.get("origin");
   if (origin && origin !== requestUrl.origin) return NextResponse.json({ error: "Cross-origin interest requests are not allowed." }, { status: 403 });

   const payload = await request.json().catch(() => null) as {
      action?: unknown;
      context?: unknown;
      preferences?: unknown;
      request?: unknown;
      tone?: unknown;
      symbols?: unknown;
      team?: unknown;
      finalOnly?: unknown;
      includeImportantDates?: unknown;
   } | null;
   const action = clean(payload?.action, 30);
   const preferences = sanitizeInterestPreferences(payload?.preferences);

   if (action === "plan-sports") {
      const events = await upcomingSportsEvents(preferences);
      return NextResponse.json({ ok: true, events }, { headers: { "Cache-Control": "no-store" } });
   }

   const context = safeContext(payload?.context) || safeContext({
      kind: action,
      occurrenceKey: `chat:${action}:${Date.now()}`,
      preferences,
      team: payload?.team,
      scheduledAt: Date.now(),
      tone: payload?.tone === "calm" || payload?.tone === "balanced" ? payload.tone : "direct",
   });
   if (!context) return NextResponse.json({ error: "Invalid interest request." }, { status: 400 });
   const symbols = Array.isArray(payload?.symbols)
      ? payload!.symbols.map((symbol) => clean(symbol, 12).toUpperCase()).filter((symbol) => /^[A-Z][A-Z0-9.-]{0,10}$/.test(symbol)).slice(0, 12)
      : undefined;
   const team = safeTeam(payload?.team);
   const facts = await resolveInterestFacts(context, { requestedSymbols: symbols, questionTeam: team, finalOnly: payload?.finalOnly === true, includeImportantDates: payload?.includeImportantDates === true });
   if (!facts.ok) return NextResponse.json({ ok: false, error: facts.error || "That live source is unavailable." }, { status: 200, headers: { "Cache-Control": "no-store" } });
   const tone: AllevinTone = payload?.tone === "calm" || payload?.tone === "balanced" ? payload.tone : "direct";
   const wording = await generateInterestLanguage({
      facts,
      request: clean(payload?.request, 500) || `Give me the latest ${context.kind} update.`,
      tone,
      notification: action === "notification",
   });
   if (!wording) return NextResponse.json({ ok: false, error: "The facts arrived, but the personal wording didn't finish." }, { status: 200, headers: { "Cache-Control": "no-store" } });
   return NextResponse.json({ ok: true, ...wording, facts: facts.facts, source: facts.source, observedAt: facts.observedAt, final: facts.final }, { headers: { "Cache-Control": "no-store" } });
}
