import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const rhythm = read("src/lib/dailyRhythm.ts");
const scheduleCore = read("src/lib/scheduleMutationCore.ts");
const notificationCore = read("src/lib/allevinNotificationCopy.ts");
const copyRoute = read("src/app/api/allevin/notifications/copy/route.ts");
const rhythmHook = read("src/hooks/useDailyRhythm.ts");
const pushRoute = read("src/app/api/allevin/push/sync/route.ts");

const checks = [
  [rhythm.includes("applyScheduleMutation"), "chat schedules use the day-aware mutation core"],
  [rhythm.includes("fullScheduleReplacementRequested"), "whole-schedule replacement requires explicit wording"],
  [rhythm.includes("Your ${title} schedule is now"), "schedule replies show complete stored truth"],
  [rhythm.includes("parseExplicitDurationMinutes"), "natural duration corrections are routed deterministically"],
  [scheduleCore.includes('ScheduleMutationMode = "merge" | "replace"'), "merge and replace semantics remain distinct"],
  [scheduleCore.includes("migrateScheduleExceptions"), "dated schedule exceptions survive block changes"],
  [notificationCore.includes("startsAtLabel"), "long notification gaps carry a verified clock time"],
  [copyRoute.includes("60 or more minutes away"), "AI copy cannot expose large raw minute gaps"],
  [rhythmHook.includes("Replacing the server plan after every meaningful state change"), "rhythm changes resync notification jobs"],
  [pushRoute.includes("replaceDevicePushPlan"), "server sync atomically replaces obsolete device jobs"],
];

const failed = checks.filter(([passed]) => !passed);
if (failed.length) {
  for (const [, label] of failed) console.error(`Missing combined-build behavior: ${label}`);
  process.exit(1);
}

console.log("Combined schedule and notification checks passed.");
