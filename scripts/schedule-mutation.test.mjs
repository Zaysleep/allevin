import assert from "node:assert/strict";
import test from "node:test";

import {
  applyScheduleMutation,
  parseExplicitDurationMinutes,
  parseScheduleMutationSegments,
} from "../src/lib/scheduleMutationCore.ts";

function state(overrides = {}) {
  return {
    version: 2,
    scheduleBlocks: [
      { id: "work-sun", title: "Work", category: "work", days: [0], start: "07:30", end: "15:00", enabled: true },
      { id: "work-week", title: "Work", category: "work", days: [1, 2, 3, 4], start: "09:00", end: "18:00", enabled: true },
    ],
    anchors: [
      {
        id: "gym",
        title: "Gym",
        category: "exercise",
        time: "06:30",
        durationMinutes: 45,
        enabled: true,
        reminder: true,
        accountabilityAfterMinutes: 15,
        dayRule: "schedule",
        scheduleCategory: "work",
        flexible: true,
        timingMode: "schedule-relative",
        scheduleReferencePoint: "start",
        scheduleOffsetMinutes: -150,
      },
      {
        id: "cook",
        title: "Cook & Unwind",
        category: "meal",
        time: "18:15",
        durationMinutes: 75,
        enabled: true,
        reminder: true,
        accountabilityAfterMinutes: 15,
        dayRule: "schedule",
        scheduleCategory: "work",
        flexible: true,
        timingMode: "schedule-relative",
        scheduleReferencePoint: "end",
        scheduleOffsetMinutes: 15,
      },
    ],
    remindersEnabled: true,
    eveningResetEnabled: true,
    completions: {},
    skips: {},
    overrides: {},
    scheduleExceptions: {},
    temporaryEntries: {},
    dayContexts: {},
    outcomes: {},
    updatedAt: 0,
    ...overrides,
  };
}

function workBlockForDay(result, day) {
  return result.state.scheduleBlocks.find((block) => block.category === "work" && block.enabled && block.days.includes(day));
}

test("updating Monday through Thursday preserves Sunday and routine durations", () => {
  const result = applyScheduleMutation(
    state(),
    "work",
    "Work",
    [{ days: [1, 2, 3, 4], start: "09:00", end: "18:00" }],
    "merge",
  );
  assert.equal(result.kind, "updated");
  assert.equal(workBlockForDay(result, 0)?.end, "15:00");
  assert.equal(workBlockForDay(result, 1)?.end, "18:00");
  assert.equal(result.state.anchors.find((anchor) => anchor.id === "gym")?.durationMinutes, 45);
  assert.equal(result.state.anchors.find((anchor) => anchor.id === "cook")?.scheduleOffsetMinutes, 15);
});

test("adding Sunday does not erase an existing Monday through Thursday schedule", () => {
  const current = state({ scheduleBlocks: [state().scheduleBlocks[1]] });
  const result = applyScheduleMutation(
    current,
    "work",
    "Work",
    [{ days: [0], start: "07:30", end: "15:00" }],
    "merge",
  );
  assert.equal(result.kind, "added");
  assert.equal(workBlockForDay(result, 0)?.start, "07:30");
  assert.equal(workBlockForDay(result, 1)?.start, "09:00");
});

test("updating part of one shared block splits days without losing either side", () => {
  const current = state({
    scheduleBlocks: [
      { id: "work-all", title: "Work", category: "work", days: [0, 1, 2, 3, 4], start: "08:00", end: "17:00", enabled: true },
    ],
    anchors: [{ ...state().anchors[0], scheduleCategory: undefined, scheduleBlockId: "work-all" }],
  });
  const result = applyScheduleMutation(
    current,
    "work",
    "Work",
    [{ days: [1, 2, 3, 4], start: "09:00", end: "18:00" }],
    "merge",
  );
  assert.equal(workBlockForDay(result, 0)?.start, "08:00");
  assert.equal(workBlockForDay(result, 4)?.start, "09:00");
  assert.equal(result.state.anchors[0].scheduleBlockId, undefined);
  assert.equal(result.state.anchors[0].scheduleCategory, "work");
});

test("explicit replacement is the only mode that removes unmentioned days", () => {
  const result = applyScheduleMutation(
    state(),
    "work",
    "Work",
    [{ days: [0], start: "07:30", end: "15:00" }],
    "replace",
  );
  assert.equal(result.kind, "replaced");
  assert.equal(workBlockForDay(result, 0)?.end, "15:00");
  assert.equal(workBlockForDay(result, 1), undefined);
});

test("dated exceptions follow a day when its permanent block changes", () => {
  const current = state({
    scheduleBlocks: [
      { id: "work-all", title: "Work", category: "work", days: [0, 1, 2, 3, 4], start: "08:00", end: "17:00", enabled: true },
    ],
    scheduleExceptions: { "2026-08-31": { "work-all": { start: "10:00" } } },
  });
  const result = applyScheduleMutation(
    current,
    "work",
    "Work",
    [{ days: [1, 2, 3, 4], start: "09:00", end: "18:00" }],
    "merge",
  );
  const mondayBlock = workBlockForDay(result, 1);
  assert.ok(mondayBlock);
  assert.deepEqual(result.state.scheduleExceptions["2026-08-31"]?.[mondayBlock.id], { start: "10:00" });
  assert.equal(result.state.scheduleExceptions["2026-08-31"]?.["work-all"], undefined);
});

test("natural routine duration language resolves to human minutes", () => {
  assert.equal(parseExplicitDurationMinutes("Change Gym to 45 minutes"), 45);
  assert.equal(parseExplicitDurationMinutes("Gym should last 45 minutes"), 45);
  assert.equal(parseExplicitDurationMinutes("Make my workout 1.5 hours"), 90);
  assert.equal(parseExplicitDurationMinutes("Move Gym to 6:30 AM"), null);
});

test("the exact two-message Work sequence parses and merges without erasing days", () => {
  const initial = state({
    scheduleBlocks: [
      { id: "work-original", title: "Work", category: "work", days: [0, 1, 2, 3, 4], start: "08:00", end: "17:00", enabled: true },
    ],
  });
  const firstSegments = parseScheduleMutationSegments(
    "Change my schedule as Monday through Thursday I work 9:00 AM to 6:00 PM",
  );
  assert.deepEqual(firstSegments, [{ days: [1, 2, 3, 4], start: "09:00", end: "18:00" }]);
  const first = applyScheduleMutation(initial, "work", "Work", firstSegments, "merge");
  assert.equal(workBlockForDay(first, 0)?.start, "08:00");
  assert.equal(workBlockForDay(first, 1)?.start, "09:00");

  const secondSegments = parseScheduleMutationSegments(
    "Sundays I work 7:30 AM to 3:00 PM",
  );
  assert.deepEqual(secondSegments, [{ days: [0], start: "07:30", end: "15:00" }]);
  const second = applyScheduleMutation(first.state, "work", "Work", secondSegments, "merge");
  assert.equal(workBlockForDay(second, 0)?.end, "15:00");
  assert.equal(workBlockForDay(second, 1)?.end, "18:00");
  assert.equal(second.state.anchors.find((anchor) => anchor.id === "gym")?.durationMinutes, 45);
});
