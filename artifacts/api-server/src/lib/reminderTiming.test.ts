// Run with: pnpm --filter @workspace/api-server run test
//
// Node's built-in runner (node:test), deliberately — the repo has no test
// framework and this needs no dependency to add one.
//
// WHAT THESE ARE FOR. A reminder that fires at the wrong time is invisible from
// the inside: nothing throws, nothing logs, the push goes out and the person
// simply stops trusting the app. The owner reported a 6:30 AM reminder arriving
// at 7:01; the cause turned out to be a write path that overwrote his stored
// time with a 07:00 default, but ruling this arithmetic out took a careful read
// with nothing pinning it. The DST cases below are the ones most likely to
// regress, because they only fail twice a year and only for people who are
// asleep when they fail.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isAtOrJustAfterMinute, addHoursToHHMM, REMINDER_GRACE_MINUTES } from "./reminderTiming";

const NY = "America/New_York";
/** An instant, written as the UTC wall clock — the only unambiguous spelling. */
const utc = (iso: string) => new Date(`${iso}Z`);

test("fires at the target minute", () => {
  // 06:30 EDT = 10:30 UTC.
  assert.equal(isAtOrJustAfterMinute(NY, "06:30", utc("2026-08-27T10:30:00")), true);
});

test("does not fire before the target", () => {
  assert.equal(isAtOrJustAfterMinute(NY, "06:30", utc("2026-08-27T10:29:00")), false);
  assert.equal(isAtOrJustAfterMinute(NY, "06:30", utc("2026-08-27T09:30:00")), false);
});

test("fires across the grace window, and stops at its edge", () => {
  for (let m = 0; m < REMINDER_GRACE_MINUTES; m++) {
    const at = utc(`2026-08-27T10:${String(30 + m).padStart(2, "0")}:00`);
    assert.equal(isAtOrJustAfterMinute(NY, "06:30", at), true, `+${m}min should fire`);
  }
  // One minute past the window is the first miss.
  assert.equal(isAtOrJustAfterMinute(NY, "06:30", utc("2026-08-27T10:40:00")), false);
});

test("a 6:30 target cannot fire at 7:01 — the report that prompted these tests", () => {
  // 07:01 EDT = 11:01 UTC. If this ever returns true, the grace window has been
  // widened past the point where a target time means anything.
  assert.equal(isAtOrJustAfterMinute(NY, "06:30", utc("2026-08-27T11:01:00")), false);
  // …whereas the 07:00 DEFAULT does fire then, which is what actually happened.
  assert.equal(isAtOrJustAfterMinute(NY, "07:00", utc("2026-08-27T11:01:00")), true);
});

test("the local day wrapping past midnight does not fire yesterday's target", () => {
  // 00:05 EST = 05:05 UTC. A 23:00 target is 21 hours behind, not 5 minutes.
  assert.equal(isAtOrJustAfterMinute(NY, "23:00", utc("2026-12-02T05:05:00")), false);
});

test("a malformed target never fires", () => {
  for (const bad of ["", "half six", "6", ":30", "aa:bb"]) {
    assert.equal(isAtOrJustAfterMinute(NY, bad, utc("2026-08-27T10:30:00")), false, bad);
  }
});

test("the zone is honoured, not the server's clock", () => {
  const at = utc("2026-08-27T10:30:00"); // 06:30 New York, 03:30 Los Angeles
  assert.equal(isAtOrJustAfterMinute(NY, "06:30", at), true);
  assert.equal(isAtOrJustAfterMinute("America/Los_Angeles", "06:30", at), false);
  assert.equal(isAtOrJustAfterMinute("America/Los_Angeles", "03:30", at), true);
});

test("an invalid zone falls back to UTC rather than a sentinel", () => {
  // lib/tz's documented policy. It must not throw, and it must not silently
  // match every minute.
  assert.equal(isAtOrJustAfterMinute("Not/AZone", "10:30", utc("2026-08-27T10:30:00")), true);
  assert.equal(isAtOrJustAfterMinute("Not/AZone", "06:30", utc("2026-08-27T10:30:00")), false);
});

// ── Daylight saving ─────────────────────────────────────────────────────────
//
// US DST 2027: forward Sunday 14 March (02:00 EST → 03:00 EDT), back Sunday
// 7 November (02:00 EDT → 01:00 EST). A reminder is scheduled in WALL-CLOCK
// terms — 6:30 means 6:30 on the kitchen clock — so both days must still have
// exactly one 6:30, and the UTC instant it corresponds to shifts by an hour.

test("spring forward: 6:30 fires once, at the new offset", () => {
  // After the jump New York is EDT (UTC-4), so 06:30 local = 10:30 UTC.
  assert.equal(isAtOrJustAfterMinute(NY, "06:30", utc("2027-03-14T10:30:00")), true);
  // The pre-jump offset (EST, UTC-5) would have put 06:30 at 11:30 UTC.
  assert.equal(isAtOrJustAfterMinute(NY, "06:30", utc("2027-03-14T11:30:00")), false);
});

test("spring forward: a target inside the skipped hour never fires", () => {
  // 02:30 does not exist on this date in New York. The clock goes 01:59 → 03:00,
  // so no instant reads 02:30 and the reminder is simply missed that day —
  // which is correct, and must not become "fires at 03:30 instead".
  const minutes: boolean[] = [];
  for (let m = 0; m < 24 * 60; m++) {
    const at = new Date(Date.UTC(2027, 2, 14, 0, 0, 0) + m * 60_000);
    minutes.push(isAtOrJustAfterMinute(NY, "02:30", at, 1));
  }
  assert.equal(minutes.filter(Boolean).length, 0);
});

test("fall back: 6:30 fires once, at the new offset", () => {
  // After the fall back New York is EST (UTC-5), so 06:30 local = 11:30 UTC.
  assert.equal(isAtOrJustAfterMinute(NY, "06:30", utc("2027-11-07T11:30:00")), true);
  assert.equal(isAtOrJustAfterMinute(NY, "06:30", utc("2027-11-07T10:30:00")), false);
});

test("fall back: a target inside the REPEATED hour fires in both passes", () => {
  // 01:30 happens twice on this date (01:30 EDT, then 01:30 EST an hour later).
  // With a 1-minute window that is two distinct matching minutes. This is a
  // FACT ABOUT THE ARITHMETIC, not a bug to fix here: the senders' per-day
  // sent-date column is what keeps it to one push. If that dedupe is ever
  // weakened, this test says what will happen.
  let matches = 0;
  for (let m = 0; m < 24 * 60; m++) {
    const at = new Date(Date.UTC(2027, 10, 7, 0, 0, 0) + m * 60_000);
    if (isAtOrJustAfterMinute(NY, "01:30", at, 1)) matches++;
  }
  assert.equal(matches, 2);
});

test("every ordinary day has exactly one matching minute per target", () => {
  for (let m = 0; m < 24 * 60; m++) {
    const at = new Date(Date.UTC(2026, 7, 27, 0, 0, 0) + m * 60_000);
    if (isAtOrJustAfterMinute(NY, "06:30", at, 1)) {
      assert.equal(at.toISOString(), "2026-08-27T10:30:00.000Z");
    }
  }
});

// ── Follow-up offsets ───────────────────────────────────────────────────────

test("addHoursToHHMM adds whole hours and keeps the minute", () => {
  assert.equal(addHoursToHHMM("06:30", 3), "09:30");
  assert.equal(addHoursToHHMM("18:00", 3), "21:00");
  assert.equal(addHoursToHHMM("07:00", 3), "10:00");
});

test("addHoursToHHMM clamps instead of wrapping into the next day", () => {
  // The point of clamping: a follow-up must never arrive tomorrow morning.
  assert.equal(addHoursToHHMM("22:15", 3), "23:15");
  assert.equal(addHoursToHHMM("23:45", 3), "23:45");
});

test("addHoursToHHMM pads a single-digit minute", () => {
  assert.equal(addHoursToHHMM("06:5", 3), "09:05");
  assert.equal(addHoursToHHMM("06", 3), "09:00");
});

test("the morning follow-up lands 3h after the target, not near it", () => {
  // Guards the reading that 6:30 + follow-up could explain a 7:01 push.
  const followUp = addHoursToHHMM("06:30", 3);
  assert.equal(followUp, "09:30");
  assert.equal(isAtOrJustAfterMinute(NY, followUp, utc("2026-08-27T11:01:00")), false);
});
