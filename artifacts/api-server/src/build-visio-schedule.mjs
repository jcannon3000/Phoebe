/**
 * THE VISIO SCHEDULE — one artwork per day, with a per-year appearance cap.
 *
 * Owner: "if you have something that is shown more than three times throughout
 * the year, go to matching for a different reading."
 *
 * WHY THIS IS A BUILD STEP AND NOT RUNTIME SELECTION.
 * A cap of three-per-year needs a YEAR-WIDE view, and the client only ever
 * holds today's lessons (useVisioToday fetches /api/office/readings for one
 * date); the lectionary itself is server-only. Worse, the cap is
 * self-referential — skipping a capped work changes which work every LATER day
 * gets, so you cannot precompute "the capped dates" separately from the
 * schedule they produce. The only honest way to enforce a count is to walk the
 * year in order, in one pass, which is what this does.
 *
 * The result is still a pure function of the date: everyone praying Visio on a
 * given day sees the same picture, which is the rule the whole selection is
 * built around. It's simply resolved ahead of time instead of per-device.
 *
 * WHAT "GO TO A DIFFERENT READING" MEANS HERE. On hitting the cap the walk
 * moves to the NEXT TIER — the owner's words, and the meaningful move: the
 * gospel's alternatives are all the same reading, so exhausting them would
 * still be showing the day's gospel, just a different painting of it.
 *
 * AND THEN THE CAP BENDS. When no tier can offer an uncapped work, that means
 * a SINGLE-MATCH day — semi-continuous reading parks on one chapter and only
 * one painting depicts it. Measured across 2026–27, that is about half of all
 * capped days. There the fourth appearance is allowed rather than dropping to
 * a book-level or rotation pick, because a repeat that genuinely depicts
 * today's gospel beats a stranger that depicts nothing appointed — the owner's
 * standing rule: "if there's one that applies to a specific reading and
 * lectionary, and there's no other one that does, we definitely want it."
 * The cap is a PREFERENCE, never a reason to show a worse reading or nothing.
 *
 * A .mjs, like its sibling audit scripts, ON PURPOSE: it imports .ts across
 * the workspace boundary into mymonastery/src, which api-server's own tsconfig
 * rootDir forbids. Typechecking it there fails on the import, not on anything
 * real. It is bundled by esbuild before running (see the npm script).
 *
 * Run:  pnpm --filter @workspace/api-server run build:visio-schedule
 */
import fs from "node:fs";
import path from "node:path";
import { getOfficeDay } from "./lib/liturgicalCalendar.ts";
import { getLectionaryReadings } from "./lib/lectionary.ts";
import { rankedTiers, rotationIndex, matchScore, rotationForDay } from "../../mymonastery/src/lib/visioSelect.ts";
import { ACT_CATALOGUE } from "../../mymonastery/src/lib/visioCatalogue.ts";

/** How many times one work may appear in a calendar year. Owner: three. */
const CAP = 3;

/** Generate this many days forward from the start of the current year. */
const START = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
const DAYS = 365 * 3 + 1; // three years, so it doesn't quietly run out

/** The lectionary's own punctuation, matching useVisioToday's refsOf. */
const norm = (r) =>
  r.replace(/[[\]]/g, "").replace(/\(([^)]*)\)/g, ", $1")
    .replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();

function refsForDay(d) {
  const day = getOfficeDay(d);
  const out = [];
  for (const side of ["morning", "evening"]) {
    const lect = getLectionaryReadings(day, side);
    for (const key of ["lesson1", "lesson2", "lesson3"]) {
      const raw = lect[key];
      if (typeof raw === "string" && raw.trim() && !/^-+$/.test(raw.trim())) out.push(norm(raw));
    }
    // psalms is a string ARRAY of numbers (["95", "100"]) — see
    // LectionaryReadings. Read as a string it would have silently contributed
    // nothing, and the psalm tier would have looked permanently empty.
    for (const p of lect.psalms ?? []) {
      if (typeof p === "string" && p.trim()) out.push(norm(`Psalm ${p.trim()}`));
    }
  }
  return [...new Set(out)];
}

function build() {
  /** appearances[year][artId] — the count the cap is measured against. */
  const used = new Map();
  const countFor = (year, id) => used.get(year)?.get(id) ?? 0;
  const bump = (year, id) => {
    if (!used.has(year)) used.set(year, new Map());
    const m = used.get(year);
    m.set(id, (m.get(id) ?? 0) + 1);
  };

  const rows = [];
  const stats = { days: 0, capped: 0, tierMoved: 0, overCap: 0, gospel: 0, middle: 0, psalm: 0, book: 0, rotation: 0 };

  for (let i = 0; i < DAYS; i++) {
    const d = new Date(START.getTime() + i * 86400000);
    const ymd = d.toISOString().slice(0, 10);
    const year = d.getUTCFullYear();
    let refs;
    try { refs = refsForDay(d); } catch { continue; }
    stats.days++;

    const tiers = rankedTiers(refs);
    let chosen = null;
    let movedTier = false;

    /** Walk a tie set from the runtime's own offset, so an uncapped day
     *  resolves to EXACTLY what chooseArtwork would have picked. */
    const pickFrom = (best, respectCap) => {
      if (!best.length) return null;
      const start = rotationIndex(ymd, best.map((a) => a.id));
      for (let k = 0; k < best.length; k++) {
        const cand = best[(start + k) % best.length];
        if (!respectCap || countFor(year, cand.id) < CAP) return cand;
      }
      return null;
    };

    // PASS 1 — the cap respected. Tiers in order; within a tier, an equally
    // good painting of the SAME reading is tried before dropping a tier,
    // since a worse reading is a bigger loss than a different brush.
    for (let t = 0; t < tiers.length; t++) {
      const { refs: tierRefs, best, top } = tiers[t];
      if (top < 2 || !best.length) continue;
      const pick = pickFrom(best, true);
      if (!pick) { movedTier = true; continue; }   // this reading is spent
      chosen = { art: pick, tierRefs, top };
      stats[t === 0 ? "gospel" : t === 1 ? "middle" : "psalm"]++;
      break;
    }

    /**
     * PASS 2 — the cap BENDS before it breaks.
     *
     * Every tier's works are spent, which on this lectionary means a
     * single-match day: semi-continuous reading parks on one chapter and only
     * one painting depicts it. Measured over 2026–27, that's about half of all
     * capped days. Allow the fourth appearance rather than falling to a
     * book-level or rotation pick — a repeat that genuinely depicts today's
     * gospel beats a stranger that depicts nothing appointed, and the owner
     * has said so directly: "if there's one that applies to a specific reading
     * and lectionary, and there's no other one that does, we definitely want
     * it." The cap is a preference; this is where it yields.
     */
    if (!chosen) {
      for (let t = 0; t < tiers.length; t++) {
        const { refs: tierRefs, best, top } = tiers[t];
        if (top < 2 || !best.length) continue;
        const pick = pickFrom(best, false);
        if (!pick) continue;
        chosen = { art: pick, tierRefs, top };
        stats.overCap++;
        stats[t === 0 ? "gospel" : t === 1 ? "middle" : "psalm"]++;
        break;
      }
    }

    // PASS 3 — nothing reached chapter level in any tier at all. Book-level
    // across everything, cap respected; then the least-used work in the
    // catalogue. Never nothing (visioSelect's own header: it always returns
    // something — the blank-screen rule this repo keeps).
    if (!chosen) {
      const scored = ACT_CATALOGUE
        .map((art) => ({ art, score: matchScore(art.refs, refs) }))
        .filter((x) => x.score > 0);
      const top = scored.length ? Math.max(...scored.map((x) => x.score)) : 0;
      const best = scored.filter((x) => x.score === top).map((x) => x.art);
      const pick = pickFrom(best, true) ?? pickFrom(best, false);
      if (pick) { chosen = { art: pick, tierRefs: refs, top }; stats.book++; }
    }

    if (!chosen) {
      let leastId = rotationForDay(ymd).id;
      let leastN = Infinity;
      for (const art of ACT_CATALOGUE) {
        const n = countFor(year, art.id);
        if (n < leastN) { leastN = n; leastId = art.id; }
        if (n === 0) break;
      }
      const art = ACT_CATALOGUE.find((a) => a.id === leastId);
      chosen = { art, tierRefs: [], top: 0 };
      stats.rotation++;
    }

    if (movedTier) stats.tierMoved++;
    const { art, tierRefs, top } = chosen;
    const ref = (top > 0 ? art.refs.find((r) => matchScore([r], tierRefs) === top) : null) ?? art.refs[0] ?? "";
    rows.push([ymd, { id: art.id, ref, followsToday: top >= 2 }]);
    bump(year, art.id);
  }

  // How often the cap actually bit.
  for (const [, m] of used) for (const [, n] of m) if (n > CAP) stats.capped++;
  return { rows, stats };
}

const { rows, stats } = build();
const header = `// GENERATED by artifacts/api-server/src/build-visio-schedule.ts — do not edit.
//
// One artwork per day, with a cap of ${CAP} appearances per calendar year
// (owner: "if you have something that is shown more than three times
// throughout the year, go to matching for a different reading"). The cap needs
// a year-wide view and the lectionary is server-only, so the whole schedule is
// resolved here rather than per-device — still a pure function of the date, so
// everyone praying on a given day sees the same picture.
//
// Covers ${rows[0]?.[0]} … ${rows[rows.length - 1]?.[0]}. A date outside this
// range falls back to live matching in chooseArtwork, which is exactly the
// behaviour before this file existed — so running out degrades, never breaks.
//
// Regenerate: pnpm --filter @workspace/api-server run build:visio-schedule

export type VisioScheduleEntry = { id: number; ref: string; followsToday: boolean };

export const VISIO_SCHEDULE: Record<string, VisioScheduleEntry> = {
`;
const body = rows.map(([ymd, e]) =>
  `  ${JSON.stringify(ymd)}: { id: ${e.id}, ref: ${JSON.stringify(e.ref)}, followsToday: ${e.followsToday} },`,
).join("\n");
const out = `${header}${body}\n};\n`;

// Resolved from the CWD (or argv[2]) rather than import.meta.dirname: this is
// run as an esbuild bundle, whose dirname is the bundle's home, not the
// source's — which silently wrote the schedule into a temp directory.
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(process.cwd(), "../mymonastery/src/lib/visioSchedule.ts");
fs.writeFileSync(target, out, "utf8");
console.log(`[visio-schedule] ${rows.length} days → ${path.relative(process.cwd(), target)}`);
console.log(`[visio-schedule] ${JSON.stringify(stats)}`);
