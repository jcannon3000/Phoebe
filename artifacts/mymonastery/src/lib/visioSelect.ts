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
      best = Math.max(best, 1);
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

/** Stable small hash of the date, so ties break the same way for everyone. */
function dayHash(ymd: string): number {
  let h = 0;
  for (let i = 0; i < ymd.length; i++) h = (h * 31 + ymd.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The plain rotation — no readings needed, and the floor under everything. */
export function rotationForDay(ymd: string): CatalogueArtwork {
  const days = Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
  const n = ACT_CATALOGUE.length;
  const i = Number.isFinite(days) ? ((days % n) + n) % n : 0;
  return ACT_CATALOGUE[i]!;
}

export type Chosen = {
  art: CatalogueArtwork;
  /** The artwork's passage closest to today's readings — the one to show. */
  ref: string;
  /** True when the image was chosen BECAUSE of today's lessons. */
  followsToday: boolean;
};

/**
 * Today's artwork. `lessons` may be empty (offline, still loading, or a day
 * with no appointed lesson) — the rotation covers that case.
 */
export function chooseArtwork(ymd: string, lessons: string[]): Chosen {
  const scored = lessons.length
    ? ACT_CATALOGUE.map((art) => ({ art, score: matchScore(art.refs, lessons) })).filter((x) => x.score > 0)
    : [];
  if (!scored.length) {
    const art = rotationForDay(ymd);
    return { art, ref: art.refs[0] ?? "", followsToday: false };
  }
  const top = Math.max(...scored.map((x) => x.score));
  const best = scored.filter((x) => x.score === top);
  // Several works may depict the same reading — Passiontide especially. Pick
  // deterministically among them so the day has one image, not a shuffle.
  const art = best[dayHash(ymd) % best.length]!.art;
  // Show the artwork's own reference that today's reading actually matched,
  // rather than whichever ACT happened to list first.
  const ref = art.refs.find((r) => matchScore([r], lessons) === top) ?? art.refs[0] ?? "";
  return { art, ref, followsToday: true };
}
