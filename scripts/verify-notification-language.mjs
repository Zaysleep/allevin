import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const serverClient = read("src/lib/allevinServerPushClient.ts");
const local = read("src/lib/allevinNotifications.ts");
const copyCore = read("src/lib/allevinNotificationCopy.ts");
const copyClient = read("src/lib/allevinNotificationCopyClient.ts");
const copyRoute = read("src/app/api/allevin/notifications/copy/route.ts");
const hook = read("src/hooks/useDailyRhythm.ts");

const checks = [
  [serverClient.includes("prepareNotificationBodies"), "server plan prepares copy before Redis sync"],
  [serverClient.includes("buildNotificationTimeline"), "server plan uses verified nearby schedule context"],
  [!serverClient.includes("getProactiveRecommendation"), "ungrounded recommendation injection removed"],
  [local.includes("notificationBodyFromCache"), "local fallback shares prepared wording"],
  [copyCore.includes("The LLM may phrase these facts"), "deterministic truth boundary documented"],
  [copyCore.includes("validateNotificationBody"), "model output validation"],
  [copyClient.includes("FALLBACK_CACHE_MAX_AGE"), "temporary fallback retry window"],
  [copyRoute.includes("Never invent an event"), "grounded LLM prompt"],
  [copyRoute.includes("Vary openings"), "anti-staleness prompt"],
  [copyRoute.includes("startsAtLocalTime"), "long gaps expose a human clock time"],
  [copyRoute.includes("60 or more minutes away"), "large minute-count wording prohibited"],
  [copyRoute.includes("Cross-origin notification copy is not allowed"), "same-origin API boundary"],
  [hook.includes("ALLEVIN_TONE_UPDATED_EVENT"), "tone changes resync future copy"],
];

const failed = checks.filter(([passed]) => !passed);
if (failed.length) {
  for (const [, label] of failed) console.error(`Missing notification-language feature: ${label}`);
  process.exit(1);
}

console.log("MK XIII contextual notification-language checks passed.");
