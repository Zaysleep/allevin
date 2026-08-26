import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [dock, onboarding, engine, worker, pushRun, pushStore] = await Promise.all([
  read("src/components/KinDock.tsx"),
  read("src/components/OnboardingFlow.tsx"),
  read("src/lib/lifeEngine.ts"),
  read("public/allevin-sw.js"),
  read("src/app/api/allevin/push/run/route.ts"),
  read("src/lib/allevinPushStore.ts"),
]);

assert.match(dock, /answerContextualScheduleQuestion/);
assert.match(dock, /stagePendingAssistantChange/);
assert.match(dock, /buildMemoryContext/);
assert.match(onboarding, /When would you usually start/);
assert.match(onboarding, /Add ALLEVIN to your phone/);
assert.doesNotMatch(onboarding, /PWA environment|service worker|manifest/i);
assert.match(engine, /possessionCommitment/);
assert.match(worker, /running-late/);
assert.match(worker, /actionTarget/);
assert.match(pushRun, /actionTarget/);
assert.match(pushStore, /atomic/i);
assert.doesNotMatch([dock, onboarding, engine, worker, pushRun, pushStore].join("\n"), /CRON_SECRET\s*=|VAPID_PRIVATE_KEY\s*=|UPSTASH_REDIS_REST_TOKEN\s*=/);

console.log("MK XIII targeted source checks passed.");
