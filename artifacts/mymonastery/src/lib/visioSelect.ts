/**
 * Which artwork today, and which passage to read against it.
 *
 * The catalogue tags every work to the passages it depicts (ACT's own
 * cataloguing). Today's office already knows today's lessons. Crossing the two
 * is the whole idea: on the day the lectionary appoints Luke 10:38-42 you look
 * at Velázquez's Martha and Mary, not at whatever the calendar's modulo landed
 * on.
 *
 * Two rules hold this together:
 *
 *  1. DETERMINISTIC. Everyone praying on the same day with the same readings
 *     sees the same image, and re-opening the practice never reshuffles it —
 *     the same reasoning the office's date-keyed rotations use. Ties are broken
 *     by a hash of the date, never by Math.random.
 *
 *  2. IT ALWAYS RETURNS SOMETHING. The readings fetch can be slow, offline, or
 *     simply have no artwork for the day's texts. Every one of those paths ends
 *     at the date-keyed rotation over the whole catalogue rather than at an
 *     empty screen — see the blank-screen rule this repo keeps.
 */
import { ACT_CATALOGUE, type CatalogueArtwork } from "./visioCatalogue";
import { ACT_COMMENTARY_CATALOGUE } from "./visioCommentaryCatalogue";

import { VISIO_SCHEDULE } from "@/lib/visioSchedule";
import { isActHidden } from "@/lib/actOverrides";

/**
 * EVERY work we might have to NAME, both catalogues — so a picture someone
 * prayed with last month still opens from their history even though the pool
 * it was drawn from is no longer the one we choose from.
 */
const BY_ID = new Map([...ACT_CATALOGUE, ...ACT_COMMENTARY_CATALOGUE].map((a) => [a.id, a]));

/**
 * The library minus the owner's runtime DELETIONS (the admin art-library
 * tool). Consulted per call, not captured at module load, so an override
 * that arrives mid-session takes effect on the next choice. Everything below
 * draws from this — a deleted work must be unreachable by every path,
 * including a stale pre-built schedule entry (artworkById refuses it, and
 * chooseArtwork falls through to live matching).
 */
/**
 * THE WHOLE POOL — the curated library and the commentary harvest, unioned.
 *
 * The history matters, because this was narrowed and then reopened and the
 * reopening only half landed. First the owner asked for commentaries only
 * ("let's only use images that have a commentary"), which forced the artist
 * list open, since of the 314 works by the curated artists exactly TWO carry
 * one. Then he reopened the pool itself: a commentary is no longer required,
 * and where one exists it rides along as `essay` and the practice offers it
 * on the closing slide.
 *
 * The build unioned its own copy and left THIS function on the commentary
 * half, so every tiered search — which is to say the gospel-first rule the
 * whole schedule is built on — ran against 241 works instead of 553. Measured
 * before the fix: on 61 of 157 weeks the union held a strictly better gospel
 * match than the pool actually searched, 45 of them reaching verse level. The
 * week of Advent 2 read 2 Peter because the Mark 1 work was outside the pool.
 *
 * `curated` rides on every record so pickFrom can prefer the owner's own
 * artists on a tie — a preference that was also inert while this returned the
 * harvest alone, since those records never carried the flag.
 */
const UNIONED_CATALOGUE: CatalogueArtwork[] = (() => {
  const byId = new Map<number, CatalogueArtwork>();
  for (const a of ACT_CATALOGUE) byId.set(a.id, { ...a, curated: true });
  for (const a of ACT_COMMENTARY_CATALOGUE) {
    const existing = byId.get(a.id);
    // In both: keeps its curated standing and gains the commentary.
    if (existing) byId.set(a.id, { ...existing, essay: existing.essay || a.essay });
    else byId.set(a.id, { ...a, curated: false });
  }
  return [...byId.values()];
})();

function pool(): CatalogueArtwork[] {
  const p = UNIONED_CATALOGUE.filter((a) => !isActHidden(a.id));
  // Everything hidden (or a corrupted overrides snapshot marking it so) must
  // not crash the practice — rotationForDay indexes this array. A hidden work
  // showing again is the recoverable failure; a blank Visio is not (the
  // blank-screen rule this repo keeps).
  return p.length > 0 ? p : UNIONED_CATALOGUE;
}

/** One specific artwork, for re-opening something from the history gallery. */
export function artworkById(id: number): CatalogueArtwork | null {
  if (isActHidden(id)) return null;
  return BY_ID.get(id) ?? null;
}

/** One contiguous stretch of a reference. `end` is Infinity for "to the end". */
export type Span = { chapter: number; start: number; end: number };
/** Book name + the verse spans a reference covers. */
export type RefParts = { book: string; spans: Span[] };

/**
 * "1 Samuel 7:7-11" → { book: "1 samuel", chapters: [7] }.
 * "Matthew 26:14-27:66" → { book: "matthew", chapters: [26, 27] }.
 *
 * ACT writes some references back-to-front ("Samuel I, 7:7-11"), so the
 * leading-numeral forms are normalised both ways round before comparing.
 */
/**
 * An ACT reference, written the way a Bible browser expects it.
 *
 * ACT writes some books back-to-front with a comma — "Kings I, 19:1-18",
 * "Samuel II, 5:1-5, 9-10" — which `parseRef` already normalises for MATCHING,
 * but only into its own parts. Handing that string to oremus asks it for a
 * book called "Kings I" and gets nothing back, so the passage a commentary is
 * about has to be turned round before it can be opened.
 *
 * Only the leading-numeral form is touched. Everything else ("Luke 2:(1-7),
 * 8-20", "John 18:1-19:42") is already what oremus reads, and bibleUrl strips
 * the lectionary parentheticals on its way out.
 *
 * Returns the reference unchanged when there is nothing to turn round, and ""
 * for an empty ref so callers can test one thing.
 */
export function canonicalRef(ref: string): string {
  const trimmed = (ref ?? "").trim();
  if (!trimmed) return "";
  // "Samuel I, 17:..." → "1 Samuel 17:..."  ·  "Kings II, 5:1-14" → "2 Kings 5:1-14"
  const m = /^([A-Za-z][A-Za-z\s]*?)\s+(i{1,3})\s*,?\s*/i.exec(trimmed);
  if (!m) return trimmed;
  return `${m[2]!.length} ${m[1]!.trim()} ${trimmed.slice(m[0].length)}`.replace(/\s+/g, " ").trim();
}

/**
 * The passage a commentary is about, as an oremus URL.
 *
 * Owner: "can we also include the reading ... whatever the passage is that the
 * commentary is referring to." Not printed into the deck — that scripture
 * slide has been cut twice and the rule stands: Phoebe never reproduces the
 * NRSV, it opens oremus's own page and restyles it (see the reader view in
 * BibleWebViewController). This just builds the address.
 *
 * NOT `bibleUrl`, which BLANKS lectionary parentheticals. That is right for an
 * appointed lesson, where the brackets mark verses a reader may leave out.
 * Here the brackets are part of the passage the commentary discusses, so they
 * are UNWRAPPED instead: "1 Samuel 17:(1a, 4-11, 19-23), 32-49" asked as
 * "17:1a, 4-11, 19-23, 32-49" comes back whole (4828 characters against 2854,
 * measured), and under a heading that reads like a reference rather than
 * "1 Samuel 17: , 32-49".
 */
export function readingUrl(ref: string): string | null {
  const passage = canonicalRef(ref)
    .replace(/[()]/g, "")
    .replace(/--/g, "-")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    // The comma the unwrapped bracket leaves behind: "17:, 32-49" → "17:32-49".
    .replace(/:\s*,\s*/g, ":")
    .trim();
  if (!passage || !/\d/.test(passage)) return null;
  return `https://bible.oremus.org/?passage=${encodeURIComponent(passage)}`;
}

export function parseRef(ref: string): RefParts | null {
  if (!ref) return null;
  const cleaned = ref.trim().replace(/\s+/g, " ").replace(/\./g, "");
  // A LEADING numeral belongs to the name ("1 Samuel"), so peel it off before
  // looking for the chapter — otherwise the book name ends at the first digit
  // and every epistle collapses to the empty string.
  const lead = /^([123])\s+/.exec(cleaned);
  const rest = lead ? cleaned.slice(lead[0].length) : cleaned;
  const digit = rest.search(/\d/);
  const name = (digit < 0 ? rest : rest.slice(0, digit)).replace(/[,\s]+$/, "").trim();
  if (!name) return null;
  const nums = digit < 0 ? "" : rest.slice(digit);

  let book = name.toLowerCase();
  // ACT writes some names back-to-front ("Samuel I", "John III"), so both
  // forms have to normalise to the same key or they never match a lesson.
  const roman = /^(.*?)\s+(i{1,3})$/.exec(book);
  if (roman) book = `${roman[2]!.length} ${roman[1]}`;
  else if (lead) book = `${lead[1]} ${book}`;

  // chapter[:verse][ - chapter:verse | verse]
  const m = /^(\d+)(?::(\d+))?(?:\s*[-\u2013]\s*(?:(\d+):)?(\d+))?/.exec(nums);
  if (!m) return { book, spans: [] };
  const ch1 = parseInt(m[1]!, 10);
  const v1 = m[2] ? parseInt(m[2], 10) : 0;          // 0 = from the chapter's start
  const crossCh = m[3] ? parseInt(m[3], 10) : null;  // "26:14-27:66" → 27
  const tail = m[4] ? parseInt(m[4], 10) : null;

  // No verse at all ("Isaiah 40") means the whole chapter.
  if (!m[2] && !crossCh) return { book, spans: [{ chapter: ch1, start: 0, end: Infinity }] };

  if (crossCh && crossCh !== ch1) {
    // Spans chapters: the tail of the first, all of any in between, the head
    // of the last.
    const spans: Span[] = [{ chapter: ch1, start: v1, end: Infinity }];
    for (let c = ch1 + 1; c < crossCh && spans.length < 80; c++) spans.push({ chapter: c, start: 0, end: Infinity });
    spans.push({ chapter: crossCh, start: 0, end: tail ?? Infinity });
    return { book, spans };
  }
  // One chapter: "10:38-42" — the 42 is a verse, not a chapter.
  return { book, spans: [{ chapter: ch1, start: v1, end: tail ?? (m[2] ? v1 : Infinity) }] };
}

/**
 * How well an artwork's passages match today's lessons.
 *
 * 3 = the same VERSES · 2 = the same chapter · 1 = the same book · 0 = unrelated.
 *
 * The verse tier is what separates "right chapter" from "right story": Luke 10
 * holds both the Good Samaritan (25-37) and Martha and Mary (38-42), and on the
 * day the lectionary appoints 38-42 you want the Velazquez, not the Bassano.
 */
export function matchScore(artRefs: string[], lessons: string[]): number {
  let best = 0;
  for (const a of artRefs) {
    const ap = parseRef(a);
    if (!ap) continue;
    for (const l of lessons) {
      const lp = parseRef(l);
      if (!lp || lp.book !== ap.book) continue;
      /**
       * "Both are psalms" is not a connection.
       *
       * For every other book, sharing the book means sharing a story — a work
       * from Genesis 3 on a Genesis 16 day is at least the same narrative. The
       * Psalter isn't a narrative: Psalm 41 and Psalm 5 are separate poems that
       * happen to be bound together, and 212 of the catalogue's works are
       * psalm-tagged, so the book tier handed almost any day a psalm painting
       * with nothing to do with the psalm appointed. Audited: a "Hand of God"
       * tagged Psalm 41 was being shown on a day appointing Psalms 5, 6, 10 and
       * 11. For the Psalter the chapter IS the work, so only the chapter and
       * verse tiers below can be earned.
       */
      if (!isPsalmBook(lp.book)) best = Math.max(best, 1);
      for (const as of ap.spans) {
        for (const ls of lp.spans) {
          if (as.chapter !== ls.chapter) continue;
          best = Math.max(best, 2);
          if (as.start <= ls.end && ls.start <= as.end) return 3;
        }
      }
    }
  }
  return best;
}

/**
 * Days since the epoch — the ordinal of the date itself.
 *
 * A COUNTER, not a hash, and that difference is the whole design. Consecutive
 * days give consecutive indices, so when the lectionary appoints the same
 * reading several days running (Holy Week) the practice walks through the
 * paintings that match it instead of landing on the same one twice. A hash
 * would scatter, and scattering collides.
 */
function dayOrdinal(ymd: string): number {
  const d = Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
  return Number.isFinite(d) ? d : 0;
}

/** The plain rotation — no readings needed, and the floor under everything. */
export function rotationForDay(ymd: string): CatalogueArtwork {
  const p = pool();
  const n = p.length;
  return p[((dayOrdinal(ymd) % n) + n) % n]!;
}

export type Chosen = {
  art: CatalogueArtwork;
  /** The artwork's passage closest to today's readings — the one to show. */
  ref: string;
  /**
   * True when the image genuinely depicts what is APPOINTED today — the same
   * chapter or the same verses (matchScore >= 2), not merely the same book.
   *
   * Reported: a picture labelled "Today's reading" that wasn't. A book-level
   * match scores 1, and the label was shown for any score above zero — so an
   * artwork tagged "Psalm 22" claimed to be today's reading on any day the
   * office appointed ANY psalm, which is most of them. The score still picks
   * the image (a book-level match beats blind rotation); it just no longer
   * makes a claim about the lectionary it can't support.
   */
  followsToday: boolean;
};

/**
 * Today's artwork.
 *
 * ── A PURE FUNCTION OF THE DAY, and it has to be ──
 *
 * Owner: "we want everyone to be viewing the same image who's practicing it."
 * So nothing device-local may enter this decision. An earlier version
 * subtracted the reader's own history to avoid repeats, which quietly made the
 * image PERSONAL — two people praying the same morning would have been looking
 * at different paintings, and the practice stops being something a community
 * does together. History is now only a record, read on the closing slide.
 *
 * Same date + same appointed lessons ⇒ same painting, for everyone, all day.
 * "The same all day" needs no pinning any more: there is no state to drift.
 *
 * Different each day comes from the ordinal above rather than from memory: it
 * steps one place each day, through the matches when the lectionary gives
 * some, and through the whole 229 when it doesn't.
 *
 * `lessons` may be empty (offline, still loading, or a day with no appointed
 * lesson) — the rotation covers that, and is equally shared.
 */
/** The Psalter, however the lectionary spelled it. */
function isPsalmBook(book: string): boolean {
  return book === "psalm" || book === "psalms";
}
/**
 * A gospel, by book name — including the lectionary's abbreviations ("Matt.").
 * The numbered Johns normalise with their leading digit ("1 john"), so testing
 * the start of the name keeps the epistles out of the gospel tier.
 */
function isGospelBook(book: string): boolean {
  return /^(matt|mark|luke|john)/.test(book);
}

/**
 * WHICH READING THE PICTURE SHOULD FOLLOW, in the owner's order.
 *
 * Owner: "it should first try to match for the gospel of the day, then the
 * Epistle or OT, then psalm."
 *
 * So this is a tiered search, not one flat maximum. The gospel is asked first
 * and a real match there WINS — even against a closer match on a psalm, which
 * is the whole point of an order: the day's gospel is its centre, and the
 * picture should sit with it when it can.
 *
 * "The Epistle or OT" is one tier because the owner grouped them, which also
 * means this never has to tell an epistle from an OT lesson — anything that
 * isn't a gospel and isn't a psalm belongs to the middle.
 *
 * A tier is only ACCEPTED at chapter level or better. A book-level hit ("some
 * artwork from Mark, on a Mark day") is too loose to outrank a real match in
 * the tier below it; those are gathered at the end as the last thing before
 * the plain rotation.
 */
function tiersFor(lessons: string[]): string[][] {
  const gospel: string[] = [], middle: string[] = [], psalms: string[] = [];
  for (const l of lessons) {
    const p = parseRef(l);
    if (!p) continue;
    (isGospelBook(p.book) ? gospel : isPsalmBook(p.book) ? psalms : middle).push(l);
  }
  return [gospel, middle, psalms];
}

/**
 * Where in the tie set to start, for a given day.
 *
 * `dayOrdinal` alone decorrelates poorly across a CHANGING set: the office
 * reads semi-continuously, so consecutive days often produce tie sets of
 * different sizes drawn from overlapping works, and `ordinal % size` lands on
 * yesterday's painting by coincidence more often than it should. Measured over
 * the two-year cycle: 17 such repeats that had an alternative available.
 *
 * Folding the SET's own identity into the offset breaks that correlation — a
 * different set of candidates starts from a different place. Still a pure
 * function of the date and the set, so it stays deterministic: everyone
 * praying today sees the same picture, which is the rule this whole file is
 * built around.
 */
export function rotationIndex(ymd: string, ids: number[]): number {
  const sig = ids.reduce((a, b) => (a + b) % 9973, 0);
  const n = ids.length;
  return (((dayOrdinal(ymd) + sig) % n) + n) % n;
}

/** Best-scoring works for one set of references, with their score. */
function scoreAgainst(refs: string[]): {
  best: Array<{ art: CatalogueArtwork }>;
  top: number;
  /**
   * Works one step BELOW the top that still reach chapter level, and that
   * carry a reflection — the only reason to look past the best match at all.
   * See pickFromTier: on 13.4% of days the closest work is a bare
   * lectionary-expansion painting while a work WITH its commentary sits one
   * step behind it, and that step is worth taking.
   */
  essayRunnerUp: CatalogueArtwork[];
} {
  if (!refs.length) return { best: [], top: 0, essayRunnerUp: [] };
  const scored = pool()
    .map((art) => ({ art, score: matchScore(art.refs, refs) }))
    .filter((x) => x.score > 0);
  if (!scored.length) return { best: [], top: 0, essayRunnerUp: [] };
  const top = Math.max(...scored.map((x) => x.score));
  const under = top - 1;
  return {
    best: scored.filter((x) => x.score === top),
    top,
    essayRunnerUp: under >= 2
      ? scored.filter((x) => x.score === under && hasUsableEssay(x.art)).map((x) => x.art)
      : [],
  };
}

/**
 * Each tier's candidates, in order, with the score they reached.
 *
 * Factored out so the SCHEDULE GENERATOR and this file agree on "who matches
 * this reading" by construction rather than by two copies staying in step.
 * The generator needs the candidates rather than the winner, because it has to
 * skip a work that has already had its three appearances this year and move to
 * a different reading (see lib/visioSchedule).
 */
export function rankedTiers(lessons: string[]): Array<{
  refs: string[]; best: CatalogueArtwork[]; top: number; essayRunnerUp: CatalogueArtwork[];
}> {
  return tiersFor(lessons).map((refs) => {
    const { best, top, essayRunnerUp } = scoreAgainst(refs);
    return { refs, best: best.map((x) => x.art), top, essayRunnerUp };
  });
}

/** A reflection we can actually open — a real http(s) page, not an empty tag. */
export function hasUsableEssay(art: CatalogueArtwork): boolean {
  if (!art.essay) return false;
  try { return /^https?:$/.test(new URL(art.essay).protocol); } catch { return false; }
}

/**
 * One work out of a tier's tie set — PREFERRING ONE THAT CARRIES ITS REFLECTION.
 *
 * Owner: "the reflection got eliminated, I don't see the reflection in Visio
 * Divina anymore." Measured: it had gone from every day to 36% of them.
 *
 * The cause was the catalogue growing 229 → 580 to cover the lectionary. The
 * 351 works added by that expansion have no VCS commentary (`essay: ""`), and
 * they are BETTER lectionary matches by construction — they were harvested
 * precisely for the passages the original set missed — so they won most days
 * and took the reflection with them. Coverage of the readings was bought with
 * the reading about the picture, which was never the trade on offer.
 *
 * This costs nothing to put right, because a tie set is by definition works
 * that scored THE SAME. Ordering it so the ones with a reflection are tried
 * first changes which equally-good painting is shown, never how well the
 * painting matches. Only when no equally-good work has a reflection does a
 * bare one win — and then the deck already shows that day plainly.
 *
 * Shared with the schedule generator (`accept` is how it applies the 3-a-year
 * cap) so both resolve a tie the same way by construction, rather than by two
 * copies staying in step.
 */
export function pickFromTier(
  ymd: string,
  best: CatalogueArtwork[],
  accept: (art: CatalogueArtwork) => boolean = () => true,
  essayRunnerUp: CatalogueArtwork[] = [],
): CatalogueArtwork | null {
  if (!best.length && !essayRunnerUp.length) return null;
  /**
   * In order: an equally-good work WITH its reflection; then a work with its
   * reflection one step behind; then the best match, bare.
   *
   * The middle group is the only place match quality is traded, and it is
   * traded one step — a chapter-level painting of the same reading instead of
   * a verse-level one, never a different reading and never below chapter
   * level. Measured over 2026–27 that lifts the days carrying a reflection
   * from 44% to about 62%, which is the ceiling: on the remaining 38% no work
   * with a commentary reaches chapter level at all, and those days show the
   * picture plainly, as the deck already handles.
   *
   * TIERS ARE NEVER CROSSED for a reflection. The owner's order — gospel,
   * then Epistle or OT, then psalm — outranks this entirely; this only ever
   * reorders candidates WITHIN the tier that already won.
   */
  const groups = [
    best.filter(hasUsableEssay),
    essayRunnerUp,
    best.filter((a) => !hasUsableEssay(a)),
  ];
  for (const group of groups) {
    if (!group.length) continue;
    const start = rotationIndex(ymd, group.map((a) => a.id));
    for (let k = 0; k < group.length; k++) {
      const cand = group[(start + k) % group.length]!;
      if (accept(cand)) return cand;
    }
  }
  return null;
}

/**
 * OTHER WORKS FOR THE SAME PASSAGE.
 *
 * Owner: "why would there be suggestions from different passages other then
 * whats for this sunday", and "we dont want anything that doesnt have a
 * comendtary or is from the psalm".
 *
 * It used to match on the DAY's lessons and, when those ran dry, fell to
 * same-book matches and then to a plain rotation — so beside a Psalm 137 image
 * it offered John 12, John 18 and John 19: three Holy Week paintings in
 * August, related to nothing anyone was reading. Fallbacks that always fill
 * three cards are the wrong trade here. An option is a suggestion, and a
 * suggestion that isn't about this week is noise.
 *
 * So the basis is the PASSAGE THE WEEK'S OWN IMAGE ANSWERS, not the day's
 * readings — which is also what makes it agree with the weekly model: every
 * day of a week shows one image, and its alternates are other treatments of
 * that same passage. Chapter level or better, nothing looser. Fewer than three
 * is a fine answer, and none is a fine answer; the button simply doesn't show.
 *
 * Psalms are excluded here as they are in the schedule, and the pool is the
 * commentary catalogue, so an option always has something written about it.
 *
 * Still pure: the date and the passage, nothing about the reader, so everyone
 * praying this week is offered the same alternatives.
 */
export function alternatesForDay(
  ymd: string,
  ref: string,
  excludeId: number | null,
  count = 3,
): Chosen[] {
  const passage = (ref ?? "").trim();
  if (!passage || /^psalm/i.test(passage)) return [];

  const matches = pool()
    .filter((art) => art.id !== excludeId)
    // Chapter level or better against the week's own passage. matchScore >= 2
    // is the same bar chooseArtwork uses to claim a work depicts a reading.
    .filter((art) => matchScore(art.refs, [passage]) >= 2);
  if (!matches.length) return [];

  // Deterministic among equals, and rotated by the same day counter the rest
  // of the file uses, so the order is stable for everyone on a given date.
  const start = rotationIndex(ymd, matches.map((a) => a.id));
  const ordered = matches.map((_, k) => matches[(start + k) % matches.length]!);

  // Variety of hands, as elsewhere: prefer artists not already offered, then
  // fill. The catalogue is lopsided enough that three works about one passage
  // are often three by the same painter.
  const out: Chosen[] = [];
  const hands = new Set<string>();
  const take = (art: CatalogueArtwork) => {
    const own = art.refs.find((r) => matchScore([r], [passage]) >= 2) ?? art.refs[0] ?? passage;
    out.push({ art, ref: own, followsToday: true });
  };
  for (const art of ordered) {
    if (out.length >= count) break;
    const hand = (art.artist ?? "").trim().toLowerCase();
    if (hand && hands.has(hand)) continue;
    if (hand) hands.add(hand);
    take(art);
  }
  for (const art of ordered) {
    if (out.length >= count) break;
    if (!out.some((c) => c.art.id === art.id)) take(art);
  }
  return out;
}

/**
 * A stand-in for a week whose pinned work has been hidden.
 *
 * Deterministic and week-scoped: it keys off the week's closing Sunday rather
 * than the day, so every day of that week resolves to the same replacement
 * and the week keeps showing one image. Matches the hidden work's own
 * reference where anything can, so the substitute is usually still about the
 * passage the week is reading; when nothing matches it takes a stable pick
 * from the pool and stops claiming a reading.
 */
function weekSubstituteFor(ymd: string, hiddenId: number): Chosen | null {
  const p = pool().filter((a) => a.id !== hiddenId);
  if (p.length === 0) return null;
  // The week's Sunday — the same key the schedule itself is built on.
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  const sunday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // A stable index from the Sunday alone: same answer all week, every device.
  let h = 0;
  for (let i = 0; i < sunday.length; i++) h = (h * 31 + sunday.charCodeAt(i)) >>> 0;

  const hidden = BY_ID.get(hiddenId);
  const wantedRefs = hidden?.refs ?? [];
  if (wantedRefs.length > 0) {
    const scored = p
      .map((art) => ({ art, score: matchScore(art.refs, wantedRefs) }))
      .filter((x) => x.score >= 2);
    if (scored.length > 0) {
      const top = Math.max(...scored.map((x) => x.score));
      const best = scored.filter((x) => x.score === top).map((x) => x.art);
      const art = best[h % best.length]!;
      const ref = art.refs.find((r) => matchScore([r], wantedRefs) === top) ?? art.refs[0] ?? "";
      // Only a VERSE-level match may claim the week's reading — the same bar
      // the schedule builder holds itself to.
      return { art, ref, followsToday: top >= 3 };
    }
  }
  const art = p[h % p.length]!;
  return { art, ref: art.refs[0] ?? "", followsToday: false };
}

export function chooseArtwork(ymd: string, lessons: string[]): Chosen {
  /**
   * THE SCHEDULE FIRST — a day's picture is decided ahead of time.
   *
   * Owner: "if you have something that is shown more than three times
   * throughout the year, go to matching for a different reading." A cap on
   * appearances needs a YEAR-WIDE view, which nothing here can have: the
   * client holds one day's lessons and the lectionary is server-side. And the
   * cap is self-referential — skipping a spent work changes what every later
   * day gets, and across tiers too, so it can't be a filter bolted onto a
   * per-day choice. So the whole year is resolved by a build step
   * (api-server/src/build-visio-schedule.ts) and read back here.
   *
   * Still pure, still the same picture for everyone on a given day. A date
   * outside the generated range falls through to the live matching below —
   * exactly the behaviour before the schedule existed, so running out of
   * schedule degrades rather than breaks.
   */
  const scheduled = VISIO_SCHEDULE[ymd];
  if (scheduled) {
    const art = artworkById(scheduled.id);
    if (art) return { art, ref: scheduled.ref, followsToday: scheduled.followsToday };
    /**
     * THE PINNED WORK WAS HIDDEN — keep the WEEK together anyway.
     *
     * `artworkById` refuses a work the owner deleted at /admin/art-library,
     * which is right: a deleted work must be unreachable by every path,
     * including a stale schedule entry. But falling straight through to live
     * matching broke the practice's one promise — the tutorial says "the same
     * picture waits for you every day until Sunday" — because live matching
     * runs against TODAY'S Daily Office lessons and resolves by day ordinal.
     * Delete the current week's work on a Wednesday and Thursday, Friday and
     * Saturday each showed a different picture.
     *
     * So: substitute at the WEEK's level. Every day of this week asks the
     * same question — the same Sunday's entry, the same replacement — so the
     * week stays one image, just not the one that was deleted.
     */
    const weekly = weekSubstituteFor(ymd, scheduled.id);
    if (weekly) return weekly;
  }

  // Gospel, then Epistle/OT, then psalms — the first tier that matches at
  // CHAPTER level or better wins, whatever the tiers below could have scored.
  const tiers = tiersFor(lessons);
  for (const tier of tiers) {
    const { best, top, essayRunnerUp } = scoreAgainst(tier);
    if (top < 2 || !best.length) continue;
    // Deterministic among equals, and a COUNTER not a hash: consecutive days
    // give consecutive indices, so a lection appointed several days running
    // (Holy Week) walks its matching works instead of repeating one.
    const art = pickFromTier(ymd, best.map((x) => x.art), undefined, essayRunnerUp)!;
    // The work's OWN reference that today's reading matched — recomputed
    // against the art actually chosen, since a runner-up matched one step
    // lower than `top`.
    const ref = art.refs.find((r) => matchScore([r], tier) >= 2) ?? art.refs[0] ?? "";
    return { art, ref, followsToday: true };
  }
  // Nothing reached chapter level in any tier. Take the best BOOK-level match
  // across everything before giving up — same book is a thin thread, but it is
  // a thread, and the tiers above have already refused to let one outrank a
  // real match. (Psalms can't reach here: see matchScore.)
  const { best, top } = scoreAgainst(lessons);
  if (best.length && top >= 1) {
    const art = pickFromTier(ymd, best.map((x) => x.art))!;
    const ref = art.refs.find((r) => matchScore([r], lessons) === top) ?? art.refs[0] ?? "";
    // NOT "today's reading" — it's the same book, a different passage.
    return { art, ref, followsToday: false };
  }
  const art = rotationForDay(ymd);
  return { art, ref: art.refs[0] ?? "", followsToday: false };
}
