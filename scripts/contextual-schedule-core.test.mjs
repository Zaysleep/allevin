import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeScheduleConflict,
  calculateAvailability,
  describeDayShape,
  resolveContextualReference,
} from "../src/lib/contextualScheduleCore.ts";

const items = [
  { id: "work", title: "Work", start: 540, end: 1020, hard: true, kind: "schedule" },
  { id: "meeting", title: "Team meeting", start: 690, end: 750, hard: true, kind: "commitment" },
  { id: "dentist", title: "Dentist appointment", start: 840, end: 900, hard: true, kind: "commitment", transitionBeforeMinutes: 20 },
];

test("resolves named and conversational references without guessing", () => {
  assert.equal(resolveContextualReference("my meeting", items).item?.id, "meeting");
  assert.equal(resolveContextualReference("that", items, "dentist").item?.id, "dentist");
  const ambiguous = resolveContextualReference("appointment", [
    { ...items[2], id: "one" },
    { ...items[2], id: "two", start: 960, end: 1020 },
  ]);
  assert.equal(ambiguous.status, "ambiguous");
});

test("availability subtracts timed state and transition time", () => {
  const windows = calculateAvailability(items.filter((item) => item.id !== "work"), 720, 1020, 10);
  assert.deepEqual(windows.map(({ start, end }) => [start, end]), [[750, 820], [900, 1020]]);
});

test("conflict analysis distinguishes overlap and travel pressure", () => {
  const overlap = analyzeScheduleConflict(
    { id: "new", title: "New visit", start: 720, end: 780, hard: true, kind: "commitment" },
    items,
    0,
  );
  assert.equal(overlap[0]?.kind, "overlap");
  const travel = analyzeScheduleConflict(
    { id: "new", title: "New visit", start: 910, end: 970, hard: true, kind: "commitment", context: "home" },
    [{ id: "prior", title: "Prior visit", start: 840, end: 900, hard: true, kind: "commitment", context: "work" }],
    20,
  );
  assert.equal(travel[0]?.kind, "travel");
});

test("whole-day shape is derived from deterministic intervals", () => {
  const shape = describeDayShape(items);
  assert.equal(typeof shape.demandingMorning, "boolean");
  assert.equal(typeof shape.openEvening, "boolean");
  assert.ok(shape.occupiedMinutes > 0);
});
