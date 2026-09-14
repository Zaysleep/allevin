import "server-only";

export interface StoredPushJob {
   id: string;
   deviceId: string;
   dueAt: number;
   title: string;
   body: string;
   tag: string;
   url: string;
   entryId?: string;
   phase: "checkpoint" | "start";
   priority: 1 | 2 | 3 | 4 | 5;
   actionTarget?: {
      source: "rhythm" | "life";
      id: string;
      dateKey: string;
   };
}

const JOBS_KEY = "allevin:push:jobs:v1";
const DEVICE_PREFIX = "allevin:push:device:v1:";
const DEVICE_JOBS_PREFIX = "allevin:push:device-jobs:v1:";
const DEVICE_RECEIPTS_PREFIX = "allevin:push:receipts:mkxxiv:";
const SCHEDULER_HEARTBEAT_KEY = "allevin:push:scheduler-heartbeat:mkxxiv";
const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 90;
const RECEIPT_TTL_SECONDS = 60 * 60 * 24 * 30;

function redisConfig() {
   // Vercel Marketplace/Upstash has used both naming schemes over time. The
   // server accepts either so deployment does not depend on one dashboard label.
   const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
   const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
   if (!url || !token) return null;
   return { url: url.replace(/\/$/, ""), token };
}

export function pushStoreConfigured() {
   return Boolean(redisConfig());
}

async function command<T = unknown>(args: Array<string | number>) {
   const config = redisConfig();
   if (!config) throw new Error("Push store is not configured.");

   const response = await fetch(config.url, {
      method: "POST",
      headers: {
         Authorization: `Bearer ${config.token}`,
         "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
   });

   if (!response.ok) throw new Error(`Push store request failed (${response.status}).`);
   const payload = (await response.json()) as { result?: T; error?: string };
   if (payload.error) throw new Error(payload.error);
   return payload.result as T;
}

async function pipeline(commands: Array<Array<string | number>>) {
   const config = redisConfig();
   if (!config) throw new Error("Push store is not configured.");
   if (!commands.length) return [];

   const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
         Authorization: `Bearer ${config.token}`,
         "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
   });

   if (!response.ok) throw new Error(`Push store pipeline failed (${response.status}).`);
   return response.json();
}

function deviceKey(deviceId: string) {
   return `${DEVICE_PREFIX}${deviceId}`;
}

function deviceJobsKey(deviceId: string) {
   return `${DEVICE_JOBS_PREFIX}${deviceId}`;
}

function deviceReceiptsKey(deviceId: string) {
   return `${DEVICE_RECEIPTS_PREFIX}${deviceId}`;
}

export async function replaceDevicePushPlan({
   deviceId,
   subscription,
   jobs,
}: {
   deviceId: string;
   subscription: PushSubscriptionJSON;
   jobs: StoredPushJob[];
}) {
   const oldMembers = await command<string[]>(["SMEMBERS", deviceJobsKey(deviceId)]).catch(() => []);
   const commands: Array<Array<string | number>> = [];

   for (const member of oldMembers || []) {
      commands.push(["ZREM", JOBS_KEY, member]);
   }

   commands.push(["DEL", deviceJobsKey(deviceId)]);
   commands.push(["SET", deviceKey(deviceId), JSON.stringify(subscription), "EX", DEVICE_TTL_SECONDS]);

   for (const job of jobs) {
      const member = JSON.stringify(job);
      commands.push(["ZADD", JOBS_KEY, job.dueAt, member]);
      commands.push(["SADD", deviceJobsKey(deviceId), member]);
   }

   commands.push(["EXPIRE", deviceJobsKey(deviceId), DEVICE_TTL_SECONDS]);
   await pipeline(commands);
   return jobs.length;
}

/**
 * A partial language response must never erase an already healthy queue.
 * Merge the jobs that were prepared successfully and leave every other future
 * occurrence in place until a later complete sync can safely reconcile it.
 */
export async function mergeDevicePushPlan({
   deviceId,
   subscription,
   jobs,
}: {
   deviceId: string;
   subscription: PushSubscriptionJSON;
   jobs: StoredPushJob[];
}) {
   const oldMembers = await command<string[]>(["SMEMBERS", deviceJobsKey(deviceId)]).catch(() => []);
   const incomingIds = new Set(jobs.map((job) => job.id));
   const commands: Array<Array<string | number>> = [
      ["SET", deviceKey(deviceId), JSON.stringify(subscription), "EX", DEVICE_TTL_SECONDS],
   ];

   for (const member of oldMembers || []) {
      let remove = false;
      try {
         const old = JSON.parse(member) as StoredPushJob;
         remove = incomingIds.has(old.id) || old.dueAt < Date.now() - 60_000;
      } catch {
         remove = true;
      }
      if (remove) {
         commands.push(["ZREM", JOBS_KEY, member]);
         commands.push(["SREM", deviceJobsKey(deviceId), member]);
      }
   }

   for (const job of jobs) {
      const member = JSON.stringify(job);
      commands.push(["ZADD", JOBS_KEY, job.dueAt, member]);
      commands.push(["SADD", deviceJobsKey(deviceId), member]);
   }
   commands.push(["EXPIRE", deviceJobsKey(deviceId), DEVICE_TTL_SECONDS]);
   await pipeline(commands);
   return jobs.length;
}

export async function readDevicePushPlan(deviceId: string) {
   const members = await command<string[]>(["SMEMBERS", deviceJobsKey(deviceId)]).catch(() => []);
   return (members || [])
      .map((member) => {
         try {
            return JSON.parse(member) as StoredPushJob;
         } catch {
            return null;
         }
      })
      .filter((job): job is StoredPushJob => Boolean(job && job.dueAt >= Date.now() - 60_000))
      .sort((left, right) => left.dueAt - right.dueAt);
}

export type PushReceiptKind = "sent" | "shown" | "opened" | "failed";

export async function recordPushReceipt(deviceId: string, jobId: string, kind: PushReceiptKind, at = Date.now()) {
   const safeJobId = jobId.slice(0, 320);
   const receipt = JSON.stringify({ jobId: safeJobId, kind, at });
   await pipeline([
      ["HSET", deviceReceiptsKey(deviceId), `${safeJobId}:${kind}`, receipt],
      ["EXPIRE", deviceReceiptsKey(deviceId), RECEIPT_TTL_SECONDS],
   ]);
}

export async function readPushDeliveryHealth(deviceId: string) {
   const raw = await command<string[] | Record<string, string>>(["HGETALL", deviceReceiptsKey(deviceId)]).catch(() => []);
   const values = Array.isArray(raw)
      ? raw.filter((_, index) => index % 2 === 1)
      : Object.values(raw || {});
   const receipts = values.flatMap((value) => {
      try {
         const parsed = JSON.parse(value) as { jobId?: unknown; kind?: unknown; at?: unknown };
         if (typeof parsed.jobId !== "string" || !["sent", "shown", "opened", "failed"].includes(String(parsed.kind)) || !Number.isFinite(Number(parsed.at))) return [];
         return [{ jobId: parsed.jobId, kind: parsed.kind as PushReceiptKind, at: Number(parsed.at) }];
      } catch {
         return [];
      }
   });
   const latest = (kind: PushReceiptKind) => receipts.filter((entry) => entry.kind === kind).sort((a, b) => b.at - a.at)[0]?.at;
   return { lastSentAt: latest("sent"), lastShownAt: latest("shown"), lastOpenedAt: latest("opened"), lastFailedAt: latest("failed") };
}

export async function recordPushSchedulerHeartbeat(at = Date.now()) {
   await command(["SET", SCHEDULER_HEARTBEAT_KEY, at, "EX", 60 * 60 * 24 * 7]);
}

export async function readPushSchedulerHeartbeat() {
   const value = await command<string | null>(["GET", SCHEDULER_HEARTBEAT_KEY]).catch(() => null);
   const timestamp = Number(value);
   return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}

export async function readDeviceSubscription(deviceId: string) {
   const raw = await command<string | null>(["GET", deviceKey(deviceId)]);
   if (!raw) return null;
   try {
      return JSON.parse(raw) as PushSubscriptionJSON;
   } catch {
      return null;
   }
}

/**
 * Claiming is atomic. Multiple cron invocations can overlap on serverless
 * infrastructure; removing due jobs inside the same Redis Lua script prevents
 * two workers from sending the same reminder.
 */
export async function claimDuePushJobs(nowMs = Date.now(), limit = 100): Promise<StoredPushJob[]> {
   const script = [
      "local jobs = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, ARGV[2])",
      "for _, job in ipairs(jobs) do redis.call('ZREM', KEYS[1], job) end",
      "return jobs",
   ].join("\n");

   const members = await command<string[]>(["EVAL", script, 1, JOBS_KEY, nowMs, limit]);
   return (members || [])
      .map((member) => {
         try {
            return JSON.parse(member) as StoredPushJob;
         } catch {
            return null;
         }
      })
      .filter((job): job is StoredPushJob => Boolean(job));
}

export async function forgetClaimedJob(job: StoredPushJob) {
   // The global job was already removed atomically when claimed. Remove only
   // the device bookkeeping copy so the next plan replacement stays compact.
   await command(["SREM", deviceJobsKey(job.deviceId), JSON.stringify(job)]).catch(() => null);
}

export async function forgetDevice(deviceId: string) {
   const oldMembers = await command<string[]>(["SMEMBERS", deviceJobsKey(deviceId)]).catch(() => []);
   const commands: Array<Array<string | number>> = [];
   for (const member of oldMembers || []) commands.push(["ZREM", JOBS_KEY, member]);
   commands.push(["DEL", deviceJobsKey(deviceId)]);
   commands.push(["DEL", deviceKey(deviceId)]);
   commands.push(["DEL", deviceReceiptsKey(deviceId)]);
   await pipeline(commands);
}
