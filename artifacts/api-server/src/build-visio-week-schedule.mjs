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
import { RCL_SUNDAYS } from "./data/rclSundays.ts";
import { pickFromTier, matchScore, rotationForDay, parseRef } from "../../mymonastery/src/lib/visioSelect.ts";
import { ACT_CATALOGUE as CURATED_CATALOGUE } from "../../mymonastery/src/lib/visioCatalogue.ts";
import { ACT_COMMENTARY_CATALOGUE } from "../../mymonastery/src/lib/visioCommentaryCatalogue.ts";

/**
 * THE POOL, REOPENED. Owner: "using images that don't have commentaries …
 * first prioritizing those artists that we curated before, but using the
 * metadata of what passage is associated to attach them to the lectionary."
 *
 * So both catalogues, unioned: the curated library (314 works, 298 with
 * passage refs) and the commentary harvest (241 / 238). They overlap by two,
 * so this is 553 works where the commentary-only pool was 241 — and requiring
 * a commentary was what left 30 of 52 Sundays with nothing that depicted the
 * reading.
 *
 * CURATED FIRST is a real preference, not a sort order: `curated` rides on
 * every record and breaks ties in pickFrom, so a curated work and a harvested
 * one that match the reading equally well go to the curated one. A commentary
 * is no longer required for anything; where one exists it rides along as
 * `essay` and the practice offers it on the closing slide.
 */
const ACT_CATALOGUE = (() => {
  const byId = new Map();
  for (const a of CURATED_CATALOGUE) byId.set(a.id, { ...a, curated: true });
  for (const a of ACT_COMMENTARY_CATALOGUE) {
    const existing = byId.get(a.id);
    // A work in both keeps its curated standing and gains the commentary.
    if (existing) byId.set(a.id, { ...existing, essay: existing.essay || a.essay });
    else byId.set(a.id, { ...a, curated: false });
  }
  return [...byId.values()];
})();

/** How many times one work may appear in a calendar year. Owner: three. */
const CAP = 3;

/**
 * A DIFFERENT HAND EACH WEEK.
 *
 * Owner, 2026-09-14: "in the visio lectionary, make sure there is a variance of
 * artists, not just Jesus Mafa, which we like, but its been them 3 weeks
 * straight." Measured on the schedule then shipping: 53 of 157 weeks repeated
 * the previous week's artist, one run lasted 13 weeks, and the Mafa series held
 * 68 weeks. The cap could not see it — it counts WORKS, and the Vie de Jesus
 * Mafa series has a painting for most gospel scenes, so a different Mafa work
 * every week never tripped it.
 *
 * Two rules, in order of cost. BACK-TO-BACK weeks by one artist (or one work)
 * are avoided whenever another hand painted the same reading equally well —
 * tried inside the tier that already won, so it costs nothing. THREE STRAIGHT
 * weeks by one artist are broken even at a step of closeness: a chapter-level
 * painting of the same reading by another hand, then the week's other reading,
 * never below chapter level (see the note at the break in build()). Where
 * nothing else reaches chapter level the run stands — a picture of this
 * Sunday's reading beats a stranger. Both bend like the cap.
 */
const ARTIST_GAP_WEEKS = 1;

/** Generate this many days forward from the start of the current year. */
const START = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
const DAYS = 365 * 3 + 1; // three years, so it doesn't quietly run out

/** The lectionary's own punctuation, matching useVisioToday's refsOf. */
const norm = (r) =>
  r.replace(/[[\]]/g, "").replace(/\(([^)]*)\)/g, ", $1")
    .replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();

/**
 * THE GOSPEL, THEN THE EPISTLE, THEN THE OLD TESTAMENT (owner, 2026-09-14:
 * "for other than the 97, try the epistle, then try the OT"). It was New
 * Testament only ("Lets not use OT passages"); the Old Testament reading is now
 * the last reading asked, never ahead of the gospel's own verses or the
 * epistle. Psalms stay out ("we dont want anything that … is from the psalm").
 *
 * This test sorts a reading into the NT or OT group by its BOOK. The book
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
const isGospelRef = (ref) => /^(matt|mark|luke|john)/.test(parseRef(ref)?.book ?? "");
/** A psalm, wherever it turns up: the RCL table's `ot` list carries one on some
 *  Sundays (Psalm 99 at the Transfiguration, Psalm 145 on Proper 20). */
const isPsalmRef = (ref) => /^ps/.test(parseRef(ref)?.book ?? "");

/** The three readings a week is matched on. */
const TIER_NAMES = ["gospel", "epistle", "ot"];
/**
 * THE ORDER A WEEK'S PICTURE IS LOOKED FOR — [reading, closeness], where 3 is
 * the passage's own verses and 2 is the same chapter at other verses.
 *
 * Owner, 2026-09-14, after hearing that 97 of 157 weeks showed the Sunday's
 * exact verses: "for other than the 97, try the epistle, then try the OT". So
 * the gospel's own verses lead; failing those, the epistle (exact, then its
 * chapter), then the Old Testament (exact, then its chapter); and only then a
 * painting of the gospel's chapter at other verses, which is what those weeks
 * had been getting. Same-book and the rotation stay the last resort (PASS 3).
 *
 * Every step asks for works at EXACTLY that closeness, so a chapter-level
 * gospel painting can no longer slip in ahead of the epistle as the "one step
 * behind" reflection runner-up the tie-break used to allow — and the card's
 * "this week's reading" is always the pick's own score.
 */
const WALK = [[0, 3], [1, 3], [1, 2], [2, 3], [2, 2], [0, 2]];

function refsForDay(d) {
  const day = getOfficeDay(d);
  const out = [];
  const ot = [];
  for (const side of ["morning", "evening"]) {
    const lect = getLectionaryReadings(day, side);
    for (const key of ["lesson1", "lesson2", "lesson3"]) {
      const raw = lect[key];
      if (typeof raw !== "string" || !raw.trim() || /^-+$/.test(raw.trim())) continue;
      const ref = norm(raw);
      // SORTED, not dropped: Old Testament lessons are the last readings a week
      // is matched on (owner, 2026-09-14), after the gospel and the epistle.
      if (isPsalmRef(ref)) continue;
      (isNewTestament(ref) ? out : ot).push(ref);
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
  return { nt: [...new Set(out)], ot: [...new Set(ot)] };
}

/**
 * The Sunday on or AFTER a date — the Sunday the week is walking toward.
 *
 * MONDAY TO SUNDAY, not Sunday to Saturday. Owner: "we want the same image
 * from Monday to Sunday", and from the first description of this practice,
 * an image "most related to the lectionary for that Sunday LEADING UP TO
 * IT."
 *
 * So the week is preparatory, not retrospective. You meet the picture on
 * Monday, sit with it for six days, and on Sunday you hear the passage read
 * that it has been quietly working on you about all week. The alternative —
 * the Sunday that OPENS the week — puts the picture after the reading and
 * lets it trail off while the next Sunday arrives unprepared. It shipped that
 * way for one build; this is the correction.
 *
 * NOTE for anyone tempted to "fix" this back: a LITURGICAL week is named for
 * the Sunday that begins it, and that rule still holds everywhere else in the
 * app (see liturgicalCalendar). This function is not naming liturgical weeks.
 * It decides when the picture turns over, and it deliberately straddles them.
 *
 * LOCAL day parts, deliberately, because the dates fed to it are local noon
 * (see the loop). Reading UTC parts off a local-noon date is how this produced
 * the wrong day: a mixed pair silently lands a day out for anyone west of
 * Greenwich.
 */
function sundayEnding(d) {
  const s = new Date(d.getTime());
  // A Sunday belongs to the week it CLOSES, so it maps to itself.
  s.setDate(s.getDate() + ((7 - s.getDay()) % 7));
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
  const stats = { days: 0, curated: 0, capped: 0, tierMoved: 0, overCap: 0, gospel: 0, epistle: 0, ot: 0, exact: 0, chapter: 0, book: 0, rotation: 0, sameHandAsLastWeek: 0, thirdStraightBroken: 0 };
  /** The last ARTIST_GAP_WEEKS weeks' artists, newest first, across year ends. */
  const recentHands = [];
  let lastWeekId = null;
  const handOf = (art) => (art?.artist ?? "").trim().toLowerCase();
  const recentHand = (art) => art.id === lastWeekId || (!!handOf(art) && recentHands.slice(0, ARTIST_GAP_WEEKS).includes(handOf(art)));
  /** Would this be the SAME artist a third week running? */
  const thirdStraight = (art) => { const h = handOf(art); return !!h && recentHands[0] === h && recentHands[1] === h; };

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
    const sunday = sundayEnding(d);
    const weekKey = ymdOf(sunday);
    if (weekPick.has(weekKey)) {
      rows.push([ymd, weekPick.get(weekKey)]);
      continue;
    }
    let refs;
    /**
     * THE SUNDAY EUCHARIST READINGS, not the Daily Office's.
     *
     * Owner, looking at the week's image: "none of those were the readings."
     * He was right and the reason was here. This chose from the DAILY OFFICE
     * lectionary for the Sunday — semi-continuous, and largely unpainted — so
     * the week ending 30 August was pinned to Ephesians 5:8-14 while the
     * congregation heard Matthew 16:21-28 and Romans 12:9-21. Nobody looking
     * at the app and the pew leaflet would recognise them as the same day.
     *
     * The RCL table (data/rclSundays.ts) is what the parish actually reads,
     * and it is the reason coverage roughly doubled when it was measured. Its
     * gospel and epistle are already New Testament, so the NT filter below is
     * inert for them and stays only for the Daily Office fallback.
     *
     * Outside the seeded years the Daily Office remains the floor — a week
     * with a less apt image beats a week with none.
     */
    const rcl = RCL_SUNDAYS[weekKey];
    if (rcl) {
      refs = {
        nt: [rcl.gospel, ...(rcl.nt ?? [])].filter(Boolean).map(norm),
        ot: (rcl.ot ?? []).map(norm).filter((r) => !isPsalmRef(r) && !isNewTestament(r)),
      };
    } else {
      try { refs = refsForDay(sunday); } catch { continue; }
    }
    stats.days++;

    // The week's readings, sorted into gospel / epistle (Acts rides here through
    // Eastertide) / Old Testament. See WALK for the order they are asked in.
    const tiers = TIER_NAMES.map((name) => ({ name, refs: [] }));
    for (const r of refs.nt) (isGospelRef(r) ? tiers[0] : tiers[1]).refs.push(r);
    tiers[2].refs.push(...refs.ot);
    /** Works whose match against one reading is EXACTLY `score`. */
    const groupAt = (t, score) => tiers[t].refs.length
      ? ACT_CATALOGUE.filter((a) => matchScore(a.refs, tiers[t].refs) === score)
      : [];
    let chosen = null;
    let movedTier = false;

    /** Walk a tie set from the runtime's own offset, so an uncapped day
     *  resolves to EXACTLY what chooseArtwork would have picked. */
    /**
     * CURATED FIRST. Owner: "first prioritizing those artists that we curated
     * before." Where the curated library and the commentary harvest both
     * answer a reading equally well, the curated work wins — so the pool got
     * wider without the library the owner actually chose being diluted by it.
     *
     * A PREFERENCE, not a filter: if no curated work matches, the harvested
     * ones are offered exactly as before. Applied by trying the curated subset
     * first and only falling back, rather than by sorting, so the cap and the
     * rotation still see the full candidate list on the second pass.
     */
    const pickFrom = (best, respectCap, essayRunnerUp = [], varied = false) => {
      const allow = (cand) => (!respectCap || countFor(year, cand.id) < CAP) && (!varied || !recentHand(cand));
      const curated = best.filter((a) => a.curated);
      if (curated.length) {
        const pick = pickFromTier(ymd, curated, allow, essayRunnerUp.filter((a) => a.curated));
        if (pick) { stats.curated++; return pick; }
      }
      return pickFromTier(ymd, best, allow, essayRunnerUp);
    };
    /** A different hand from last week if this same tier has one; else the repeat. */
    const pickVaried = (best, respectCap, essayRunnerUp = []) =>
      pickFrom(best, respectCap, essayRunnerUp, true) ?? pickFrom(best, respectCap, essayRunnerUp, false);

    // PASS 1 — the cap respected, WALK in order. Within a step, an equally good
    // painting of the same reading is tried before moving on, since a less
    // apt reading is a bigger loss than a different brush.
    for (const [t, score] of WALK) {
      const group = groupAt(t, score);
      if (!group.length) continue;
      const pick = pickVaried(group, true);
      if (!pick) { movedTier = true; continue; }   // this reading is spent
      chosen = { art: pick, tierRefs: tiers[t].refs, top: score };
      stats[TIER_NAMES[t]]++;
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
      for (const [t, score] of WALK) {
        const group = groupAt(t, score);
        if (!group.length) continue;
        const pick = pickVaried(group, false);
        if (!pick) continue;
        chosen = { art: pick, tierRefs: tiers[t].refs, top: score };
        stats.overCap++;
        stats[TIER_NAMES[t]]++;
        break;
      }
    }

    // PASS 3 — nothing reached chapter level in any tier at all. Book-level
    // across everything, cap respected; then the least-used work in the
    // catalogue. Never nothing (visioSelect's own header: it always returns
    // something — the blank-screen rule this repo keeps).
    if (!chosen) {
      /**
       * TIERED, like every pass above it.
       *
       * This scored the whole catalogue against gospel and epistle TOGETHER
       * and took the highest, so a strong epistle match beat a weaker gospel
       * one and the owner's tier order — gospel first, then epistle or OT,
       * then psalm — was inverted at the bottom of the ladder. The week
       * ending 2027-08-01 appoints John 6:24-35 and Ephesians 4:1-16, and the
       * pin was the Ephesians work.
       *
       * Walking the tiers here costs nothing: the first tier with any match
       * at all wins, which is what "gospel first" means.
       */
      // `tiers` is already computed at the top of this week's loop.
      let scored = [];
      let top = 0;
      let tierRefsHere = [...refs.nt, ...refs.ot];
      for (const tier of tiers) {
        const s2 = ACT_CATALOGUE
          .map((art) => ({ art, score: matchScore(art.refs, tier.refs) }))
          .filter((x) => x.score > 0);
        if (s2.length) {
          scored = s2;
          top = Math.max(...s2.map((x) => x.score));
          tierRefsHere = tier.refs;
          break;
        }
      }
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
      const pick = pickVaried(best, true);
      if (pick) { chosen = { art: pick, tierRefs: tierRefsHere, top }; stats.book++; }
    }

    if (!chosen) {
      let leastId = rotationForDay(ymd).id;
      let leastN = Infinity;
      for (const art of ACT_CATALOGUE) {
        if (recentHand(art)) continue; // a different hand from last week, even here
        const n = countFor(year, art.id);
        if (n < leastN) { leastN = n; leastId = art.id; }
        if (n === 0) break;
      }
      const art = ACT_CATALOGUE.find((a) => a.id === leastId);
      chosen = { art, tierRefs: [], top: 0 };
      stats.rotation++;
    }

    /**
     * NEVER THREE WEEKS STRAIGHT (owner: "its been them 3 weeks straight").
     *
     * The swap inside pickVaried costs nothing — it only changes which equally
     * good painting of the SAME reading is shown — so it cannot break a run
     * where one artist is the only one who painted the passage at that
     * closeness. The Mafa series was exactly that for Matthew 18:15-20, 18:21-35
     * and 20:1-16, three Sundays running. A third consecutive week is where
     * variety is worth a step of closeness: another hand's painting, looked for
     * in the same order as any week's (WALK), at worst the same chapter. Never below chapter level, and the card only names the
     * verses when the replacement genuinely depicts them — `top` is the
     * replacement's own score, so followsToday is recomputed from it. If nothing
     * else reaches chapter level, the run stands.
     */
    if (thirdStraight(chosen.art)) {
      let replacement = null;
      for (const [t, score] of WALK) {
        const group = groupAt(t, score).filter((cand) => handOf(cand) !== handOf(chosen.art) && countFor(year, cand.id) < CAP);
        if (!group.length) continue;
        const pick = pickFrom(group, true);
        if (pick) { replacement = { art: pick, tierRefs: tiers[t].refs, top: score }; break; }
      }
      if (replacement) { chosen = replacement; stats.thirdStraightBroken++; }
    }

    if (movedTier) stats.tierMoved++;
    const { art, tierRefs, top } = chosen;
    const ref = (top > 0 ? art.refs.find((r) => matchScore([r], tierRefs) === top) : null) ?? art.refs[0] ?? "";
    /**
     * "THIS WEEK'S READING" MEANS THE VERSES, NOT THE CHAPTER.
     *
     * matchScore: 3 = the verse spans overlap, 2 = same chapter only, 1 =
     * same book. This said `>= 2`, so a chapter-level match printed the
     * artwork's own reference under the words "This week's reading" — and 59
     * of 157 weeks were chapter-only. The week ending 2026-10-25 the parish
     * reads Matthew 22:34-46, the Great Commandment; the card read "Matthew
     * 22:15-22", Render unto Caesar. A different passage, in the same
     * chapter, named as the one being read.
     *
     * The owner has already corrected this exact overclaim once: "if it is
     * not actually the passage from this week, dont have it say the verse."
     * A chapter-level pick is still a good picture for the week — it simply
     * doesn't get to claim the reading.
     */
    const entry = { id: art.id, ref, followsToday: top >= 3 };
    rows.push([ymd, entry]);
    // The week now has its work; the six days after this one reuse it, and
    // the cap counts a WEEK as one appearance rather than seven.
    weekPick.set(weekKey, entry);
    bump(year, art.id);
    if (top >= 3) stats.exact++; else if (top === 2) stats.chapter++;
    if (recentHand(art)) stats.sameHandAsLastWeek++;
    recentHands.unshift(handOf(art));
    recentHands.length = Math.min(recentHands.length, Math.max(ARTIST_GAP_WEEKS, 2));
    lastWeekId = art.id;
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
// Readings: the gospel's own verses first; otherwise the epistle (with Acts in
// Eastertide), then the Old Testament, each exact before its chapter; only then
// a painting of the gospel's chapter. Psalms are never used (owner, 2026-09-14).
//
// A different artist each week where the reading allows: the same hand is not
// chosen for back-to-back weeks if another artist painted the same reading, and
// a third straight week by one artist is broken even at a step of closeness — a
// chapter-level painting, or the week's epistle — never below chapter level
// (owner, 2026-09-14: "make sure there is a variance of artists").
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
