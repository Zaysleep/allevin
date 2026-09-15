import { NextResponse } from "next/server";
import webpush, { type PushSubscription } from "web-push";

import {
   claimDuePushJobs,
   forgetClaimedJob,
   forgetDevice,
   pushStoreConfigured,
   readDeviceSubscription,
   recordPushReceipt,
   recordPushSchedulerHeartbeat,
   rescheduleClaimedJob,
} from "@/lib/allevinPushStore";
import { generateInterestLanguage, resolveInterestFacts } from "@/lib/allevinInterestProviders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
   const secret = process.env.CRON_SECRET;
   if (!secret) return true;
   return request.headers.get("authorization") === `Bearer ${secret}`;
}

function configureWebPush() {
   const subject = process.env.ALLEVIN_VAPID_SUBJECT;
   const publicKey = process.env.NEXT_PUBLIC_ALLEVIN_VAPID_PUBLIC_KEY;
   const privateKey = process.env.ALLEVIN_VAPID_PRIVATE_KEY;
   if (!subject || !publicKey || !privateKey) return false;
   webpush.setVapidDetails(subject, publicKey, privateKey);
   return true;
}

export async function GET(request: Request) {
   if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   if (!pushStoreConfigured() || !configureWebPush()) {
      return NextResponse.json({ error: "Server push is not fully configured." }, { status: 503 });
   }

   await recordPushSchedulerHeartbeat();

   // Redis atomically removes due jobs before they are sent. This prevents
   // overlapping serverless cron invocations from producing duplicate pushes.
   const jobs = await claimDuePushJobs(Date.now(), 100);
   let sent = 0;
   let failed = 0;

   for (const job of jobs) {
      const subscription = await readDeviceSubscription(job.deviceId);
      if (!subscription) {
         failed += 1;
         await forgetClaimedJob(job);
         continue;
      }

      try {
         let title = job.title;
         let body = job.body;
         if (job.interestContext) {
            const facts = await resolveInterestFacts(job.interestContext);
            const retryCount = job.interestContext.retryCount || 0;
            if (!facts.ok || (job.interestContext.kind === "sports-final" && facts.final === false)) {
               const retryLimit = job.interestContext.kind === "sports-final" ? 6 : 2;
               if (retryCount < retryLimit) await rescheduleClaimedJob(job, Date.now() + (job.interestContext.kind === "sports-final" ? 20 : 10) * 60_000);
               else await recordPushReceipt(job.deviceId, job.id, "failed").catch(() => null);
               failed += 1;
               continue;
            }
            const copy = await generateInterestLanguage({
               facts,
               request: `Prepare the scheduled ${job.interestContext.kind} update using only the latest verified facts.`,
               tone: job.interestContext.tone || "direct",
               notification: true,
            });
            if (!copy) {
               if (retryCount < 2) await rescheduleClaimedJob(job, Date.now() + 10 * 60_000);
               else await recordPushReceipt(job.deviceId, job.id, "failed").catch(() => null);
               failed += 1;
               continue;
            }
            title = copy.title || title;
            body = copy.body || body;
         }
         await webpush.sendNotification(
            subscription as PushSubscription,
            JSON.stringify({
               title,
               body,
               tag: job.tag,
               url: job.url,
               entryId: job.entryId,
               data: { jobId: job.id, deviceId: job.deviceId, phase: job.phase, priority: job.priority, scheduledAt: job.dueAt, actionTarget: job.actionTarget },
            }),
            { TTL: 300, urgency: job.priority >= 4 ? "high" : "normal" },
         );
         sent += 1;
         await recordPushReceipt(job.deviceId, job.id, "sent").catch(() => null);
      } catch (error) {
         failed += 1;
         await recordPushReceipt(job.deviceId, job.id, "failed").catch(() => null);
         const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 0;
         if (statusCode === 404 || statusCode === 410) await forgetDevice(job.deviceId);
      } finally {
         await forgetClaimedJob(job);
      }
   }

   return NextResponse.json({ ok: true, claimed: jobs.length, sent, failed, at: Date.now() });
}
