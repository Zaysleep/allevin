import { NextResponse } from "next/server";

import { pushStoreConfigured, recordPushReceipt, type PushReceiptKind } from "@/lib/allevinPushStore";

export const runtime = "nodejs";

function cleanDeviceId(value: unknown) {
   const id = String(value || "").trim();
   return /^[a-zA-Z0-9_-]{8,160}$/.test(id) ? id : null;
}

export async function POST(request: Request) {
   const requestUrl = new URL(request.url);
   const origin = request.headers.get("origin");
   if (origin && origin !== requestUrl.origin) return NextResponse.json({ error: "Cross-origin receipt rejected." }, { status: 403 });
   if (!pushStoreConfigured()) return NextResponse.json({ error: "Push store is not configured." }, { status: 503 });

   const payload = (await request.json().catch(() => null)) as { deviceId?: unknown; jobId?: unknown; kind?: unknown; at?: unknown } | null;
   const deviceId = cleanDeviceId(payload?.deviceId);
   const jobId = String(payload?.jobId || "").trim().slice(0, 320);
   const kind = payload?.kind === "shown" || payload?.kind === "opened" ? payload.kind as PushReceiptKind : null;
   const at = Number(payload?.at);
   if (!deviceId || !jobId || !kind) return NextResponse.json({ error: "Invalid receipt." }, { status: 400 });

   await recordPushReceipt(deviceId, jobId, kind, Number.isFinite(at) ? at : Date.now());
   return NextResponse.json({ ok: true });
}
