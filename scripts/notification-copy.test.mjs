import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationCopyContext,
  fallbackNotificationBody,
  notificationCopyCacheKey,
  validateNotificationBody,
} from "../src/lib/allevinNotificationCopy.ts";

const hour = 60 * 60 * 1000;
const startAt = new Date(2026, 7, 27, 8, 0, 0, 0).getTime();
const timeline = [
  { id: "current", title: "Breakfast", category: "meal", startAt, endAt: startAt + 30 * 60_000 },
  { id: "next", title: "Commute", category: "personal", startAt: startAt + 40 * 60_000, endAt: startAt + hour },
  { id: "later", title: "Work", category: "work", startAt: startAt + hour, endAt: startAt + 9 * hour },
];

function context(overrides = {}) {
  return createNotificationCopyContext({
    id: "job-1",
    occurrenceKey: "2026-08-27:rhythm:breakfast:start",
    title: "Breakfast",
    category: "meal",
    phase: "start",
    tone: "balanced",
    priority: 2,
    leadMinutes: 10,
    startAt,
    endAt: startAt + 30 * 60_000,
    timelineId: "current",
    timeline,
    ...overrides,
  });
}

test("uses deterministic timeline truth for the upcoming item and transition", () => {
  const result = context();
  assert.equal(result.next?.title, "Commute");
  assert.equal(result.next?.startsAtLabel, "8:40 AM");
  assert.equal(result.next?.startsInMinutes, 40);
  assert.equal(result.next?.minutesFromCurrentEnd, 10);
});

test("does not expose an unrelated event more than six hours away", () => {
  const result = context({
    timeline: [timeline[0], { id: "far", title: "Evening class", category: "school", startAt: startAt + 7 * hour, endAt: startAt + 8 * hour }],
  });
  assert.equal(result.next, undefined);
});

test("safety copy is factual and does not imitate generated personality", () => {
  const result = context();
  const body = fallbackNotificationBody(result);
  assert.ok(body.length >= 18 && body.length <= 220);
  assert.equal(body.toLowerCase().includes("breakfast"), false);
  assert.equal(validateNotificationBody(body, result), body);
  assert.match(body, /^Next:/);
});

test("rejects robotic, repetitive, and oversized model copy", () => {
  const result = context();
  assert.equal(validateNotificationBody("Breakfast starts now. Time to switch over.", result), null);
  assert.equal(validateNotificationBody("Clock's done negotiating. Handle the thing that matters.", result), null);
  assert.equal(validateNotificationBody("Use this window well and keep the transition clean.", result), null);
  assert.equal(validateNotificationBody("This is a good time to begin. Get into it and keep the next step simple.", result), null);
  assert.equal(validateNotificationBody("A".repeat(221), result), null);
});

test("long gaps use the next clock time instead of raw minute math", () => {
  const longGap = context({
    timeline: [
      timeline[0],
      { id: "later-routine", title: "Cook & Unwind", category: "personal", startAt: startAt + 153 * 60_000, endAt: startAt + 228 * 60_000 },
    ],
  });
  const body = fallbackNotificationBody(longGap);
  assert.equal(longGap.next?.startsAtLabel, "10:33 AM");
  assert.match(body, /10:33 AM/);
  assert.doesNotMatch(body, /153 minutes/i);
  assert.equal(
    validateNotificationBody("Cook & Unwind is coming up in 153 minutes. You have time before then.", longGap),
    null,
  );
});

test("copy cache identity changes when occurrence or nearby truth changes", () => {
  const base = context();
  const nextDay = context({ occurrenceKey: "2026-08-28:rhythm:breakfast:start" });
  const differentNext = context({ timeline: [timeline[0], { ...timeline[1], id: "dentist", title: "Dentist" }] });
  assert.notEqual(notificationCopyCacheKey(base), notificationCopyCacheKey(nextDay));
  assert.notEqual(notificationCopyCacheKey(base), notificationCopyCacheKey(differentNext));
});
