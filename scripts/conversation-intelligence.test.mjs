import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeIncompleteConversationRequest,
  canonicalTaskTitleFromPrompt,
  canonicalTitleIsSafe,
  mergeConversationDraft,
} from "../src/lib/allevinConversationIntelligence.ts";
import { parseRelativeCalendarDate } from "../src/lib/lifeTimingCore.ts";

test("extracts the underlying task regardless of temporal command order", () => {
  assert.equal(
    canonicalTaskTitleFromPrompt("In a month, remind me to check sony headphone price"),
    "Check sony headphone price",
  );
  assert.equal(
    canonicalTaskTitleFromPrompt("Remind me at 10 AM on Friday to get ready for my appointment"),
    "Get ready for my appointment",
  );
  assert.equal(
    canonicalTaskTitleFromPrompt("Don't let me forget to call Dr. Patel tomorrow"),
    "Call Dr. Patel",
  );
});

test("blocks cut-off requests before they become life items", () => {
  const incomplete = analyzeIncompleteConversationRequest("Remind me in a month to check on my");
  assert.equal(incomplete.incomplete, true);
  assert.match(incomplete.clarification || "", /what would you like me to check on in a month/i);

});

test("continues a cut-off request without losing its original timing", () => {
  const merged = mergeConversationDraft(
    "Remind me in a month to check on my",
    "Sony headphone price",
  );
  assert.equal(merged, "Remind me in a month to check on my Sony headphone price");
  assert.equal(analyzeIncompleteConversationRequest(merged).incomplete, false);

  assert.equal(canonicalTaskTitleFromPrompt(merged), "Check on my Sony headphone price");
});

test("one month means the same calendar day next month", () => {
  const now = new Date(2026, 7, 26, 12, 0, 0, 0).getTime();
  const result = parseRelativeCalendarDate("in a month", now);
  assert.ok(result);
  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 8);
  assert.equal(result.getDate(), 26);
});

test("model title refinement may improve casing and concision but not meaning", () => {
  assert.equal(
    canonicalTitleIsSafe("Check sony headphone price", "Check Sony headphone price"),
    "Check Sony headphone price",
  );
  assert.equal(
    canonicalTitleIsSafe("Phone down and start winding down for bed", "Wind down for bed"),
    "Wind down for bed",
  );
  assert.equal(
    canonicalTitleIsSafe("Check Sony headphone price", "Book a flight to Tokyo"),
    null,
  );
});
