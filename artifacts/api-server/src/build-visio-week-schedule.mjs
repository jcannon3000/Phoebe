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
import { rankedTiers, pickFromTier, matchScore, rotationForDay, parseRef } from "../../mymonastery/src/lib/visioSelect.ts";
import { ACT_COMMENTARY_CATALOGUE as ACT_CATALOGUE } from "../../mymonastery/src/lib/visioCommentaryCatalogue.ts";

/** How many times one work may appear in a calendar year. Owner: three. */
const CAP = 3;

/** Generate this many days forward from the start of the current year. */
const START = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
const DAYS = 365 * 3 + 1; // three years, so it doesn't quietly run out

/** The lectionary's own punctuation, matching useVisioToday's refsOf. */
const norm = (r) =>
  r.replace(/[[\]]/g, "").replace(/\(([^)]*)\)/g, ", $1")
    .replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();

/**
 * NEW TESTAMENT ONLY (owner: "Lets not use OT passages", after "we dont want
 * anything that … is from the psalm").
 *
 * So a week is chosen by its GOSPEL or its EPISTLE and nothing else. The book
 * names come from parseRef, which lowercases, strips points and normalises the
 * numbered books ("1 Cor." and "Corinthians I" both become "1 cor"), so a
 * prefix test covers the lectionary's abbreviations and ACT's back-to-front
 * spellings together. Philippians and Philemon share a prefix; both are
 * epistles, so nothing turns on telling them apart here.
 */
const NT_NON_GOSPEL = /^(acts|rom|([123] )?cor|gal|eph|phil|col|([123] )?thess|([123] )?tim|titus|philem|heb|jas|james|([123] )?pet|[123] john|jude|rev)/;
const isNewTestament = (ref) => {
  const p = parseRef(ref);
  if (!p) return false;
  // The gospels' own test, mirrored from visioSelect: a leading digit keeps
  // the Johannine epistles out ("1 john" is not the gospel).
  if (/^(matt|mark|luke|john)/.test(p.book)) return true;
  return NT_NON_GOSPEL.test(p.book);
};

function refsForDay(d) {
  const day = getOfficeDay(d);
  const out = [];
  for (const side of ["morning", "evening"]) {
    const lect = getLectionaryReadings(day, side);
    for (const key of ["lesson1", "lesson2", "lesson3"]) {
      const raw = lect[key];
      if (typeof raw !== "string" || !raw.trim() || /^-+$/.test(raw.trim())) continue;
      const ref = norm(raw);
      // OT lessons are dropped HERE rather than after a winner is chosen —
      // filtering the winner would leave the week empty and fall through to
      // the rotation, which is a work related to nothing at all.
      if (!isNewTestament(ref)) continue;
      out.push(ref);
    }
    /**
     * NO PSALMS (owner: "we dont want anything that doesnt have a
     * comendtary or is from the psalm").
     *
     * The psalms were contributed here so the third tier had something to
     * match on. Leaving them out empties that tier by construction, which is
     * the point: a week is now chosen by its gospel, epistle or Old Testament
     * reading, and never by an illuminated psalter initial standing in for a
     * passage nobody is reading that week.
     *
     * Done at the SOURCE rather than by filtering the winner. Dropping a psalm
     * pick later would leave the week with nothing and fall through to the
     * rotation — a work related to none of the readings, which is worse than
     * the psalm it replaced.
     */
  }
  return [...new Set(out)];
}

/**
 * The Sunday on or before a date — the day whose readings name the week.
 *
 * LOCAL day parts, deliberately, because the dates fed to it are local noon
 * (see the loop). Reading UTC parts off a local-noon date is how this produced
 * the wrong day: a mixed pair silently lands a day out for anyone west of
 * Greenwich.
 */
function sundayOf(d) {
  const s = new Date(d.getTime());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

/** A date as YYYY-MM-DD in LOCAL terms — the same day the calendar will read. */
const ymdOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
  /** weekStartYmd → the artwork id that whole week shows. */
  const weekPick = new Map();
  const stats = { days: 0, capped: 0, tierMoved: 0, overCap: 0, gospel: 0, middle: 0, psalm: 0, book: 0, rotation: 0 };

  for (let i = 0; i < DAYS; i++) {
    /**
     * NOON, LOCAL — not UTC midnight.
     *
     * Owner: "it did psalm 137 as the main but thats not the psalm for this
     * sunday", and "this obviously is off". It was, for every week of the
     * year. These dates were built at UTC midnight and handed to
     * getOfficeDay, which reads LOCAL day parts: 2026-08-23T00:00:00Z is
     * Saturday 22 August in America/New_York. So each week was chosen from the
     * SATURDAY's lectionary and then labelled as the Sunday's — Psalm 137 is
     * Saturday's psalm that week; Sunday's are 146 and 147. Sampled across the
     * year, 7 Sundays in 8 were pinned to a passage not appointed that day,
     * and each carried followsToday:true, so the deck asserted a reading it
     * wasn't showing.
     *
     * Noon is the standard trick and the rest of this codebase already uses it
     * (`new Date(\`${dateStr}T12:00:00\`)` in the office routes): no timezone
     * within ±12h of UTC can push midday across a date boundary.
     */
    const stepped = new Date(START.getTime() + i * 86400000);
    const ymd = stepped.toISOString().slice(0, 10);
    const d = new Date(`${ymd}T12:00:00`);
    const year = d.getFullYear();
    /**
     * ONE IMAGE A WEEK, CHOSEN BY THE SUNDAY (owner: "one week, one image
     * that's most related to the lectionary for that Sunday leading up to
     * it").
     *
     * A picture asked to be looked at slowly needs longer than a day; a day
     * each also meant the week had no shape, and a work whose commentary you
     * began on Tuesday was gone by Wednesday. So the readings that choose it
     * are the SUNDAY's — the day the week is named for — and the six days
     * after it keep the same work. The schedule stays day-keyed so nothing
     * downstream has to learn about weeks; every day of a week simply
     * resolves to the same id.
     */
    const sunday = sundayOf(d);
    const weekKey = ymdOf(sunday);
    if (weekPick.has(weekKey)) {
      rows.push([ymd, weekPick.get(weekKey)]);
      continue;
    }
    let refs;
    try { refs = refsForDay(sunday); } catch { continue; }
    stats.days++;

    const tiers = rankedTiers(refs);
    let chosen = null;
    let movedTier = false;

    /** Walk a tie set from the runtime's own offset, so an uncapped day
     *  resolves to EXACTLY what chooseArtwork would have picked. */
    const pickFrom = (best, respectCap, essayRunnerUp = []) =>
      pickFromTier(ymd, best, (cand) => !respectCap || countFor(year, cand.id) < CAP, essayRunnerUp);

    // PASS 1 — the cap respected. Tiers in order; within a tier, an equally
    // good painting of the SAME reading is tried before dropping a tier,
    // since a worse reading is a bigger loss than a different brush.
    for (let t = 0; t < tiers.length; t++) {
      const { refs: tierRefs, best, top, essayRunnerUp } = tiers[t];
      if (top < 2 || !best.length) continue;
      const pick = pickFrom(best, true, essayRunnerUp);
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
      /**
       * BOOK-LEVEL RESPECTS THE CAP — no bend here.
       *
       * PASS 2 bends because a work that genuinely depicts today's GOSPEL
       * beats a stranger, and the owner said so. That reasoning does not carry
       * down here: a book-level hit is "same book, different passage" — a thin
       * thread already, and the row even reports followsToday:false. Bending
       * it was unlimited, so a sole Joshua painting won every Joshua day all
       * year: measured 10 appearances in 2026 against a cap of 3. Falling
       * through to the rotation costs a weak thread and buys a fresh work,
       * which is the better trade at this depth.
       */
      const pick = pickFrom(best, true);
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
    const entry = { id: art.id, ref, followsToday: top >= 2 };
    rows.push([ymd, entry]);
    // The week now has its work; the six days after this one reuse it, and
    // the cap counts a WEEK as one appearance rather than seven.
    weekPick.set(weekKey, entry);
    bump(year, art.id);
  }

  // How often the cap actually bit.
  for (const [, m] of used) for (const [, n] of m) if (n > CAP) stats.capped++;
  return { rows, stats };
}

const { rows, stats } = build();
const header = `// GENERATED by artifacts/api-server/src/build-visio-week-schedule.mjs — do not edit.
//
// ONE ARTWORK PER WEEK, repeated on all seven of that week's days and chosen
// from the lectionary for the week's SUNDAY. Every date in a week therefore
// carries the same entry; the file is still keyed by day so the client can
// stay a plain date lookup.
//
// The cap is ${CAP} appearances per calendar year, and an appearance is now a
// WEEK — so a capped work can be on screen for up to ${CAP * 7} days of a year
// (owner: "if you have something that is shown more than three times
// throughout the year, go to matching for a different reading", written when
// an appearance was a single day). The cap needs a year-wide view and the
// lectionary is server-only, so the whole schedule is resolved here rather
// than per-device — still a pure function of the date, so everyone praying in
// a given week sees the same picture.
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
