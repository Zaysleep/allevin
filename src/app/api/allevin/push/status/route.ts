import { NextResponse } from "next/server";

import { pushStoreConfigured } from "@/lib/allevinPushStore";

export const runtime = "nodejs";

export async function GET() {
   return NextResponse.json({
      store: pushStoreConfigured(),
      vapid: Boolean(
         process.env.NEXT_PUBLIC_ALLEVIN_VAPID_PUBLIC_KEY &&
         process.env.ALLEVIN_VAPID_PRIVATE_KEY &&
         process.env.ALLEVIN_VAPID_SUBJECT
      ),
      cronSecret: Boolean(process.env.CRON_SECRET),
   });
}
