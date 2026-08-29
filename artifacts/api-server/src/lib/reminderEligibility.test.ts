// Run with: pnpm --filter @workspace/api-server run test
//
// These guard a predicate that can SILENCE someone's reminders. A false
// negative here doesn't throw and doesn't log — the push simply never arrives,
// and the person concludes the app forgot them. So the "unknown must not
// suppress" cases below matter as much as the ones that do suppress.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sideHasPractice } from "./reminderEligibility";

const rc = (values: Record<string, string>) => ({ values });

test("a side with an anchor level counts as kept", () => {
  assert.equal(sideHasPractice(rc({ "phoebe:office:level:evening": "office" }), "evening"), true);
  assert.equal(sideHasPractice(rc({ "phoebe:office:level:morning": "fdd" }), "morning"), true);
  assert.equal(sideHasPractice(rc({ "phoebe:office:level:morning": "custom" }), "morning"), true);
});

test("the reported case: a populated rule with nothing on that side", () => {
  // A full morning, an empty evening. This is the person who says "I don't
  // have an evening practice, stop sending me an evening notification."
  const values = rc({
    "phoebe:office:level:morning": "office",
    "phoebe:office:reflection:morning": "fdd",
    "phoebe:slot:visio": "anytime",
  });
  assert.equal(sideHasPractice(values, "morning"), true);
  assert.equal(sideHasPractice(values, "evening"), false);
});

test('"ask" and "none" are blank, not a practice', () => {
  // "ask" is the customizer's own word for a side left empty.
  assert.equal(sideHasPractice(rc({ "phoebe:office:level:evening": "ask" }), "evening"), false);
  assert.equal(sideHasPractice(rc({ "phoebe:office:level:evening": "none" }), "evening"), false);
  assert.equal(sideHasPractice(rc({ "phoebe:office:level:evening": "   " }), "evening"), false);
});

test("a contemplative practice of its own counts, with no anchor level", () => {
  // An evening that is a silent sit, a walk, Visio — recorded as the side's
  // contemplation flag rather than a level. Missing this would have silenced
  // reminders for everyone whose evening IS their contemplative practice.
  assert.equal(sideHasPractice(rc({ "phoebe:office:contemplation:evening": "1" }), "evening"), true);
  // Explicitly off is off — "0" means off, absence means unknown.
  assert.equal(sideHasPractice(rc({ "phoebe:office:contemplation:evening": "0" }), "evening"), false);
});

test("a second practice on the side counts", () => {
  assert.equal(sideHasPractice(rc({ "phoebe:office:extra:evening": "examen" }), "evening"), true);
  assert.equal(sideHasPractice(rc({ "phoebe:office:extra:evening": "none" }), "evening"), false);
  assert.equal(sideHasPractice(rc({ "phoebe:office:extra:evening": "" }), "evening"), false);
});

test("the sides are read independently", () => {
  const values = rc({ "phoebe:office:contemplation:morning": "1" });
  assert.equal(sideHasPractice(values, "morning"), true);
  assert.equal(sideHasPractice(values, "evening"), false);
});

// ── Unknown must never suppress ─────────────────────────────────────────────

test("an unsynced or missing rule is UNKNOWN, and still gets its reminder", () => {
  for (const input of [null, undefined, {}, { values: undefined }, { values: {} }, "nonsense", 42]) {
    assert.equal(sideHasPractice(input, "evening"), true, JSON.stringify(input) ?? "undefined");
  }
});

test("a malformed rule errs toward sending", () => {
  // Anything unreadable must fall to true. Losing a reminder is silent; an
  // extra one is merely a nuisance.
  const hostile = { get values() { throw new Error("boom"); } };
  assert.equal(sideHasPractice(hostile, "evening"), true);
});
