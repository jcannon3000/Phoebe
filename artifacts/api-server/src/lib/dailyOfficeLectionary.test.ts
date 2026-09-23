// Run with: pnpm --filter @workspace/api-server run test
//
// Node's built-in runner (node:test), like the other tests here — the repo has
// no test framework and this needs no dependency to add one.
//
// WHAT THESE ARE FOR. Which year the Daily Office Lectionary is in decides
// what Phoebe reads every morning for twelve months, and it is invisible when
// wrong: the office still assembles, the readings still render, they are
// simply the wrong ones. The boundary is a moving Sunday — the First Sunday of
// Advent, which lands anywhere from 27 November to 3 December — so the cases
// most likely to regress are the Saturday before it and the Sunday itself, in
// years where Advent falls at each end of that window.
//
// The second half pins the rubric the owner asked for: two readings in the
// morning, Old Testament first, Epistle in Year One and Gospel in Year Two.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getDailyOfficeLectionaryYear, computeAdvent1 } from "./liturgicalCalendar";
import { planMorningLessons } from "./lectionary";

/** A local civil date, which is what the calendar functions work in. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

test("the owner's examples", () => {
  // Church year began Advent 2025 and ends in 2026 — even, so Year Two.
  assert.equal(getDailyOfficeLectionaryYear(day(2026, 9, 23)), 2);
  // The First Sunday of Advent 2026 begins the year that ends in 2027 — odd.
  assert.equal(getDailyOfficeLectionaryYear(day(2026, 11, 29)), 1);
  assert.equal(getDailyOfficeLectionaryYear(day(2026, 12, 25)), 1);
  assert.equal(getDailyOfficeLectionaryYear(day(2027, 6, 1)), 1);
});

test("Advent Sunday is where the year turns, and the Saturday before is not", () => {
  // Each pair is [year, Advent Sunday]. Chosen to span the whole window the
  // Sunday can fall in: 3 December at one end, 27 November at the other.
  const advents: Array<[number, number, number]> = [
    [2023, 12, 3],
    [2024, 12, 1],
    [2025, 11, 30],
    [2026, 11, 29],
    [2027, 11, 28],
    [2028, 12, 3],
    [2029, 12, 2],
    [2033, 11, 27],
  ];
  for (const [y, m, d] of advents) {
    const advent = computeAdvent1(y);
    assert.equal(
      `${advent.getFullYear()}-${advent.getMonth() + 1}-${advent.getDate()}`,
      `${y}-${m}-${d}`,
      `Advent 1 of ${y}`,
    );

    const sunday = day(y, m, d);
    const saturdayBefore = day(y, m, d - 1);
    const expectedNew = (y + 1) % 2 === 1 ? 1 : 2;
    const expectedOld = expectedNew === 1 ? 2 : 1;

    assert.equal(getDailyOfficeLectionaryYear(sunday), expectedNew, `Advent Sunday ${y}`);
    assert.equal(getDailyOfficeLectionaryYear(saturdayBefore), expectedOld, `Saturday before Advent ${y}`);
    // And it stays turned over the days either side of the boundary.
    assert.equal(getDailyOfficeLectionaryYear(day(y, 12, 25)), expectedNew, `Christmas ${y}`);
    assert.equal(getDailyOfficeLectionaryYear(day(y + 1, 6, 1)), expectedNew, `June ${y + 1}`);
  }
});

test("a year is one or two, never anything else", () => {
  for (let y = 2024; y <= 2035; y++) {
    for (const m of [1, 3, 6, 9, 11, 12]) {
      const answer = getDailyOfficeLectionaryYear(day(y, m, 15));
      assert.ok(answer === 1 || answer === 2, `${y}-${m}`);
    }
  }
});

// ── The morning's two readings ──────────────────────────────────────────────

const threeReadings = { lesson1: "Isa. 1:1-9", lesson2: "2 Pet. 3:1-10", lesson3: "Matt. 25:1-13" };

test("Year One reads the Old Testament, then the Epistle", () => {
  const plan = planMorningLessons(threeReadings, 1);
  assert.equal(plan.first, "Isa. 1:1-9");
  assert.equal(plan.second, "2 Pet. 3:1-10");
  assert.equal(plan.secondKind, "epistle");
  // The Gospel is not read in the office; it is offered beside it.
  assert.equal(plan.extra, "Matt. 25:1-13");
  assert.equal(plan.extraKind, "gospel");
});

test("Year Two reads the Old Testament, then the Gospel", () => {
  const plan = planMorningLessons(threeReadings, 2);
  assert.equal(plan.first, "Isa. 1:1-9");
  assert.equal(plan.second, "Matt. 25:1-13");
  assert.equal(plan.secondKind, "gospel");
  assert.equal(plan.extra, "2 Pet. 3:1-10");
  assert.equal(plan.extraKind, "epistle");
});

test("the Old Testament is first in both years", () => {
  for (const year of [1, 2] as const) {
    assert.equal(planMorningLessons(threeReadings, year).first, threeReadings.lesson1);
  }
});

test("a day that appoints its own morning pair is served as given", () => {
  // A Major Holy Day comes through getLectionaryReadings as its two
  // MORNING readings with an empty third — the prayer book has already said
  // what the morning is, so neither year swaps anything.
  const holyDay = { lesson1: "Isa. 52:7-10", lesson2: "Heb. 1:1-12", lesson3: "" };
  for (const year of [1, 2] as const) {
    const plan = planMorningLessons(holyDay, year);
    assert.equal(plan.first, "Isa. 52:7-10");
    assert.equal(plan.second, "Heb. 1:1-12");
    assert.equal(plan.extra, "", "nothing to offer beside it");
  }
});

test("a blank third reading is never served as a reading", () => {
  const plan = planMorningLessons({ lesson1: "Gen. 1:1", lesson2: "Rom. 1:1", lesson3: "   " }, 2);
  assert.equal(plan.second, "Rom. 1:1");
  assert.equal(plan.extra, "");
});

test("a day with no Epistle reads the Gospel in both years", () => {
  // 26, 27 and 28 December and Easter Day appoint Old Testament and Gospel
  // only — the book prints a rule where the Epistle would be. Year One must
  // not open the office with one reading and the Gospel as a footnote.
  const noEpistle = { lesson1: "Isa. 62:6-7, 10-12", lesson2: "", lesson3: "Matt. 1:18-25" };
  for (const year of [1, 2] as const) {
    const plan = planMorningLessons(noEpistle, year);
    assert.equal(plan.first, "Isa. 62:6-7, 10-12");
    assert.equal(plan.second, "Matt. 1:18-25");
    assert.equal(plan.secondKind, "gospel");
    assert.equal(plan.extra, "", "there is no third reading to offer");
  }
});
