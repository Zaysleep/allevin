import { NextResponse } from "next/server";

import { pushStoreConfigured, replaceDevicePushPlan, type StoredPushJob } from "@/lib/allevinPushStore";

export const runtime = "nodejs";

function cleanDeviceId(value: unknown) {
   const id = String(value || "").trim();
   return /^[a-zA-Z0-9_-]{8,160}$/.test(id) ? id : null;
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

   const count = await replaceDevicePushPlan({ deviceId, subscription, jobs });
   return NextResponse.json({ ok: true, jobs: count });
}
