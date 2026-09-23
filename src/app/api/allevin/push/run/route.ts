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
import type { StoredPushJob } from "@/lib/allevinPushStore";

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

async function generateScheduledNotificationLanguage(request: Request, jobs: StoredPushJob[]) {
   const result = new Map<string, { title: string; body: string }>();
   const contexts = jobs.flatMap((job) => job.copyContext ? [job.copyContext] : []);

   // Generate language at delivery time, after the reminder is safely queued.
   // Small batches keep the copy endpoint bounded if several jobs share a minute.
   for (let offset = 0; offset < contexts.length; offset += 48) {
      try {
         const response = await fetch(new URL("/api/allevin/notifications/copy", request.url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
               contexts: contexts.slice(offset, offset + 48),
               recentBodies: [],
               variationNonce: `delivery-${Date.now()}-${offset}`,
            }),
            cache: "no-store",
         });
         if (!response.ok) continue;
         const payload = (await response.json()) as {
            copies?: Array<{ id?: unknown; title?: unknown; body?: unknown; source?: unknown }>;
         };
         for (const copy of Array.isArray(payload.copies) ? payload.copies : []) {
            if (copy.source !== "llm" || typeof copy.id !== "string" || typeof copy.title !== "string" || typeof copy.body !== "string") continue;
            result.set(copy.id, { title: copy.title, body: copy.body });
         }
      } catch {
         // Every queued job already carries factual emergency copy. A language
         // outage must never turn into a missing reminder.
      }
   }
   return result;
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
   const scheduledCopies = await generateScheduledNotificationLanguage(request, jobs.filter((job) => !job.interestContext));
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
         if (job.copyContext) {
            const copy = scheduledCopies.get(job.copyContext.id);
            if (copy) {
               title = copy.title;
               body = copy.body;
            }
         }
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
