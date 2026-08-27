import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const dock = read("src/components/KinDock.tsx");
const life = read("src/lib/lifeEngine.ts");
const route = read("src/app/api/allevin/llm/route.ts");
const notificationRoute = read("src/app/api/allevin/notifications/copy/route.ts");
const notificationCopy = read("src/lib/allevinNotificationCopy.ts");
const lifeStore = read("src/lib/lifeStore.ts");

assert.match(dock, /analyzeIncompleteConversationRequest/);
assert.match(dock, /prepareMutationLanguage/);
assert.match(dock, /recentReplies/);
assert.match(life, /canonicalTaskTitleFromPrompt/);
assert.doesNotMatch(life, /Got it — I'll keep/);
assert.match(route, /json_schema/);
assert.match(route, /RECENT REPLIES TO AVOID REPEATING/);
assert.match(notificationRoute, /allevin_notification_copies/);
assert.match(notificationRoute, /ordinary human purpose/);
assert.doesNotMatch(notificationCopy, /This is a good time to begin\. Get into it/);
assert.match(lifeStore, /leakedReminderCommand/);
assert.match(lifeStore, /parseRelativeCalendarDate/);

console.log("MK XIV personal-assistant language checks passed.");
