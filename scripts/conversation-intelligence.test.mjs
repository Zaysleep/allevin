import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeAmbiguousClockRequest,
  analyzeIncompleteConversationRequest,
  canonicalTaskTitleFromPrompt,
  canonicalTitleIsSafe,
  mergeConversationDraft,
  promptDescribesCommitment,
} from "../src/lib/allevinConversationIntelligence.ts";
import { parseRelativeCalendarDate, parseRelativeClockMoment } from "../src/lib/lifeTimingCore.ts";

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

test("bare clock reminders pause for AM or PM before saving", () => {
  const ambiguous = analyzeAmbiguousClockRequest("Set a reminder for 8:30 to call Mom");
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(ambiguous.clockLabel, "8:30");
  assert.match(ambiguous.clarification || "", /8:30 AM or 8:30 PM/i);

  assert.equal(
    analyzeIncompleteConversationRequest("Set a reminder for 8:30 to call Mom").reason,
    "missing-meridiem",
  );
  assert.equal(
    analyzeAmbiguousClockRequest("Set a reminder tonight at 8:30 to call Mom").ambiguous,
    false,
  );
});

test("an AM or PM follow-up completes the original clock in place", () => {
  const merged = mergeConversationDraft("Set a reminder for 8:30 to call Mom", "PM");
  assert.equal(merged, "Set a reminder for 8:30 PM to call Mom");
  assert.equal(analyzeIncompleteConversationRequest(merged).incomplete, false);
});

test("one month means the same calendar day next month", () => {
  const now = new Date(2026, 7, 26, 12, 0, 0, 0).getTime();
  const result = parseRelativeCalendarDate("in a month", now);
  assert.ok(result);
  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 8);
  assert.equal(result.getDate(), 26);
});

test("relative minutes and hours resolve to exact clock moments", () => {
  const now = new Date(2026, 7, 27, 7, 55, 42, 500).getTime();
  const inFive = parseRelativeClockMoment("Remind me in 5 minutes to stretch", now);
  assert.ok(inFive);
  assert.equal(inFive.getHours(), 8);
  assert.equal(inFive.getMinutes(), 0);
  assert.equal(inFive.getSeconds(), 0);

  const inTwoHours = parseRelativeClockMoment("in two hours", now);
  assert.ok(inTwoHours);
  assert.equal(inTwoHours.getHours(), 9);
  assert.equal(inTwoHours.getMinutes(), 55);
});

test("reminder actions do not become schedule commitments from activity words", () => {
  assert.equal(
    promptDescribesCommitment("Remind me at 8:06 AM to pack my lunch before work", true),
    false,
  );
  assert.equal(promptDescribesCommitment("Coffee with Sam Friday at 9 AM", true), true);
  assert.equal(promptDescribesCommitment("I have a call tomorrow at 2 PM", true), true);
  assert.equal(promptDescribesCommitment("Call Mom tomorrow at 2 PM", true), false);
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
