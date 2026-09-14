import { NextResponse } from "next/server";

import { pushStoreConfigured, readDevicePushPlan, readPushDeliveryHealth, readPushSchedulerHeartbeat } from "@/lib/allevinPushStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanDeviceId(value: unknown) {
   const id = String(value || "").trim();
   return /^[a-zA-Z0-9_-]{8,160}$/.test(id) ? id : null;
}

export async function GET(request: Request) {
   const configured = pushStoreConfigured();
   const deviceId = cleanDeviceId(new URL(request.url).searchParams.get("deviceId"));
   const plan = configured && deviceId ? await readDevicePushPlan(deviceId) : [];
   const delivery = configured && deviceId ? await readPushDeliveryHealth(deviceId) : {};
   const schedulerLastRanAt = configured ? await readPushSchedulerHeartbeat() : undefined;
   return NextResponse.json({
      store: configured,
      vapid: Boolean(
         process.env.NEXT_PUBLIC_ALLEVIN_VAPID_PUBLIC_KEY &&
         process.env.ALLEVIN_VAPID_PRIVATE_KEY &&
         process.env.ALLEVIN_VAPID_SUBJECT
      ),
      cronSecret: Boolean(process.env.CRON_SECRET),
      queuedJobs: plan.length,
      nextDueAt: plan[0]?.dueAt,
      schedulerLastRanAt,
      ...delivery,
   });
}
