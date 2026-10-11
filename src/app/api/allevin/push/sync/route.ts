import { NextResponse } from "next/server";

import { mergeDevicePushPlan, pushStoreConfigured, replaceDevicePushPlan, type StoredPushJob } from "@/lib/allevinPushStore";
import { sanitizeInterestPreferences, type InterestNotificationContext, type SportsTeamPreference } from "@/lib/allevinInterests";
import { sanitizeNotificationCopyContext } from "@/lib/allevinNotificationCopy";
import type { NotificationInteractionContext } from "@/lib/allevinNotificationPolicy";

export const runtime = "nodejs";

function cleanDeviceId(value: unknown) {
   const id = String(value || "").trim();
   return /^[a-zA-Z0-9_-]{8,160}$/.test(id) ? id : null;
}

function cleanInterestContext(value: unknown): InterestNotificationContext | undefined {
   if (!value || typeof value !== "object") return undefined;
   const raw = value as Partial<InterestNotificationContext>;
   const kinds: InterestNotificationContext["kind"][] = ["weather", "stocks", "monthly-stocks", "sports-gameday", "sports-pregame", "sports-final", "briefing"];
   if (!kinds.includes(raw.kind as InterestNotificationContext["kind"])) return undefined;
   const team = raw.team && typeof raw.team === "object" ? raw.team : undefined;
   return {
      kind: raw.kind as InterestNotificationContext["kind"],
      occurrenceKey: String(raw.occurrenceKey || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 240),
      preferences: sanitizeInterestPreferences(raw.preferences),
      team: team ? {
         id: String(team.id || "").slice(0, 100),
         name: String(team.name || "").trim().slice(0, 80),
         league: (["MLB", "NBA", "NFL", "NHL", "other"].includes(String(team.league)) ? team.league : "other") as SportsTeamPreference["league"],
         providerId: team.providerId ? String(team.providerId).slice(0, 80) : undefined,
         gameDay: team.gameDay !== false,
         pregame: team.pregame !== false,
         finalScore: team.finalScore !== false,
         pregameMinutes: Math.max(5, Math.min(180, Math.round(Number(team.pregameMinutes) || 30))),
      } : undefined,
      eventId: raw.eventId ? String(raw.eventId).slice(0, 80) : undefined,
      scheduledAt: Number.isFinite(Number(raw.scheduledAt)) ? Number(raw.scheduledAt) : Date.now(),
      retryCount: Math.max(0, Math.min(8, Math.round(Number(raw.retryCount) || 0))),
      tone: raw.tone === "calm" || raw.tone === "balanced" ? raw.tone : "direct",
      scheduleFacts: Array.isArray(raw.scheduleFacts) ? raw.scheduleFacts.map((item) => String(item).replace(/[<>\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)).filter(Boolean).slice(0, 12) : undefined,
   };
}

function cleanJob(raw: unknown, deviceId: string): StoredPushJob | null {
   if (!raw || typeof raw !== "object") return null;
   const value = raw as Partial<StoredPushJob>;
   const dueAt = Number(value.dueAt);
   if (!Number.isFinite(dueAt) || dueAt < Date.now() - 60_000 || dueAt > Date.now() + 45 * 24 * 60 * 60 * 1000) return null;
   const phase = value.phase === "checkpoint" || value.phase === "start" ? value.phase : null;
   if (!phase) return null;
   const priority = Number(value.priority);
   if (![1, 2, 3, 4, 5].includes(priority)) return null;
   const id = String(value.id || "").slice(0, 320);
   const title = String(value.title || "").trim().slice(0, 160);
   const body = String(value.body || "").trim().slice(0, 420);
   if (!id || !title || !body) return null;
   const target = value.actionTarget;
   const actionTarget = target &&
      (target.source === "rhythm" || target.source === "life") &&
      typeof target.id === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(target.dateKey || ""))
      ? { source: target.source, id: target.id.slice(0, 220), dateKey: String(target.dateKey) }
      : undefined;
   const interaction = value.interactionContext as Partial<NotificationInteractionContext> | undefined;
   const interactionContext: NotificationInteractionContext | undefined = interaction &&
      (interaction.kind === "confirm-plan" || interaction.kind === "open-briefing")
      ? {
         kind: interaction.kind,
         source: interaction.source === "rhythm" || interaction.source === "life" ? interaction.source : undefined,
         sourceId: interaction.sourceId ? String(interaction.sourceId).slice(0, 220) : undefined,
         dateKey: /^\d{4}-\d{2}-\d{2}$/.test(String(interaction.dateKey || "")) ? String(interaction.dateKey) : undefined,
         title: interaction.title ? String(interaction.title).replace(/[<>\u0000-\u001F\u007F]/g, " ").trim().slice(0, 80) : undefined,
      }
      : undefined;
   const expiresAt = Number(value.expiresAt);

   return {
      id,
      deviceId,
      dueAt,
      title,
      body,
      tag: String(value.tag || id).slice(0, 240),
      url: String(value.url || "/").startsWith("/") ? String(value.url || "/").slice(0, 240) : "/",
      entryId: value.entryId ? String(value.entryId).slice(0, 220) : undefined,
      phase,
      priority: priority as StoredPushJob["priority"],
      actionTarget,
      interestContext: cleanInterestContext(value.interestContext),
      copyContext: sanitizeNotificationCopyContext(value.copyContext) || undefined,
      interactionContext,
      expiresAt: Number.isFinite(expiresAt) && expiresAt >= dueAt ? expiresAt : undefined,
   };
}

export async function POST(request: Request) {
   const requestUrl = new URL(request.url);
   const origin = request.headers.get("origin");
   // The Personal Alpha has no account system yet. Same-origin enforcement is
   // the first boundary: browser clients from another site cannot register or
   // replace this installation's schedule through a cross-site request.
   if (origin && origin !== requestUrl.origin) {
      return NextResponse.json({ error: "Cross-origin push sync is not allowed." }, { status: 403 });
   }
   if (!pushStoreConfigured()) return NextResponse.json({ error: "Push store is not configured." }, { status: 503 });

   const payload = (await request.json().catch(() => null)) as {
      deviceId?: unknown;
      subscription?: PushSubscriptionJSON;
      jobs?: unknown[];
      complete?: unknown;
      expectedJobs?: unknown;
   } | null;
   const deviceId = cleanDeviceId(payload?.deviceId);
   const subscription = payload?.subscription;
   if (!deviceId || !subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
   }

   const jobs = (Array.isArray(payload?.jobs) ? payload!.jobs : [])
      .map((job) => cleanJob(job, deviceId))
      .filter((job): job is StoredPushJob => Boolean(job))
      .slice(0, 160);

   const complete = payload?.complete === true;
   const expectedJobs = Math.max(0, Math.min(160, Math.round(Number(payload?.expectedJobs) || 0)));
   if (complete && (jobs.length !== expectedJobs || jobs.length !== (Array.isArray(payload?.jobs) ? payload!.jobs.length : 0))) {
      return NextResponse.json({ error: "The complete push plan did not validate." }, { status: 400 });
   }

   const count = complete
      ? await replaceDevicePushPlan({ deviceId, subscription, jobs })
      : await mergeDevicePushPlan({ deviceId, subscription, jobs });
   return NextResponse.json({ ok: true, jobs: count, mode: complete ? "replaced" : "merged", complete });
}
