import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const conversation = read("src/lib/allevinConversationIntelligence.ts");
const timing = read("src/lib/lifeTimingCore.ts");
const life = read("src/lib/lifeEngine.ts");
const dock = read("src/components/KinDock.tsx");
const llmRoute = read("src/app/api/allevin/llm/route.ts");
const notificationRoute = read("src/app/api/allevin/notifications/copy/route.ts");
const notificationClient = read("src/lib/allevinNotificationCopyClient.ts");
const provider = read("src/lib/allevinOpenAIRequest.ts");

assert.match(conversation, /missing-meridiem/);
assert.match(conversation, /Do you mean .* AM or .* PM/);
assert.match(conversation, /promptDescribesCommitment/);
assert.match(timing, /parseRelativeClockMoment/);
assert.match(life, /point-in-time task, not a lunch event/);
assert.match(dock, /for \(let attempt = 0; attempt < 2/);
assert.match(dock, /rejectedReply/);
assert.match(llmRoute, /materially different response/);
assert.match(provider, /max_completion_tokens/);
assert.match(notificationRoute, /requestProviderCopies/);
assert.match(notificationRoute, /Invalid wording is regenerated only/);
assert.match(notificationClient, /nearest eight are completed first/);
assert.match(notificationClient, /25_000/);

console.log("MK XV language reliability checks passed.");
