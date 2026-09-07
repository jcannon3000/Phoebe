import { RCL_SUNDAYS } from "../data/rclSundays";
import { nextSundayDate } from "./rclLectionary";

/**
 * The coming Sunday's RCL readings, BY TRACK — for the Sunday readings deck
 * (owner, 2026-09-04: "a Track A or B toggle on the opening page that would
 * affect what readings are in the deck").
 *
 * After Pentecost the RCL appoints two Old Testament tracks, each with its
 * own psalm; the epistle and gospel are shared. lectionarypage.net lays the
 * two out as two columns of four links, which is the cleanest source there
 * is, so this reads that table live (cached) and falls back to the scraped
 * RCL_SUNDAYS row — whose `ot` list runs the second track's reading and
 * psalm together — when the page can't be reached.
 */
export type RclTrack = { ot: string | null; psalm: string | null; nt: string | null; gospel: string | null };
export type SundayTracks = { sundayDate: string; url: string; track1: RclTrack; track2: RclTrack | null };

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: SundayTracks }>();

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** The two-column link table → two tracks (or one). */
function parseTracks(html: string): { track1: RclTrack; track2: RclTrack | null } | null {
  // Every <td> in document order, each reduced to the texts of its <a>s.
  const cells: string[][] = [];
  for (const m of html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    const links = Array.from(m[1]!.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)).map((a) => decode(a[1]!)).filter(Boolean);
    if (links.length >= 3) cells.push(links);
  }
  if (cells.length === 0) return null;
  /**
   * A column is OT · Psalm · NT · Gospel — usually. When the psalm has an
   * alternate, the page lists FIVE links: "Psalm 114 or", "Exodus 15:1b-11,
   * 20-21", and reading positions left-to-right slid every lesson one place:
   * the canticle became the Epistle, Romans became the Gospel, and Matthew
   * fell off the end (Proper 19, 2026-09-13). The lessons are anchored from
   * the END instead — the Gospel is always last, the Epistle just before it,
   * the Old Testament first — and whatever sits between the OT and the
   * Epistle is psalmody: the psalm plus any alternate.
   */
  const trimOr = (s: string) => s.replace(/\s+or$/i, "").trim();
  const isPsalmody = (s: string) => /^(psalm|canticle)/i.test(s);
  const toTrack = (l: string[]): RclTrack => {
    const links = l.map(trimOr).filter(Boolean);
    if (links.length < 3) return { ot: null, psalm: null, nt: null, gospel: null };
    const ot = links[0]!;
    const gospel = links[links.length - 1]!;
    const middle = links.slice(1, -1);
    const psalm = middle.find(isPsalmody) ?? null;
    const lessons = middle.filter((s) => !isPsalmody(s));
    // The Epistle is the LAST non-psalmody link before the Gospel; anything
    // earlier in the middle is the psalm's alternate (a canticle, or a
    // second psalm the page didn't label as one).
    const nt = lessons.length > 0 ? lessons[lessons.length - 1]! : null;
    return { ot, psalm, nt, gospel };
  };
  return { track1: toTrack(cells[0]!), track2: cells[1] ? toTrack(cells[1]!) : null };
}

function fallbackTracks(iso: string): { track1: RclTrack; track2: RclTrack | null } | null {
  const r = RCL_SUNDAYS[iso];
  if (!r) return null;
  // Psalmody is anything that is a psalm, a canticle, or ends in " or" (an
  // alternate's lead-in). Only a genuine second OT reading makes a track 2:
  // Advent 4's "2 Samuel 7 · Canticle 3 or · Canticle 15" used to become a
  // Track 2 whose Old Testament reading was "Canticle 15".
  const isPsalm = (s: string) => /^(psalm|canticle)/i.test(s) || /\s+or$/i.test(s);
  const ots = r.ot.filter((s) => !isPsalm(s));
  const psalms2 = r.ot.filter(isPsalm).map((s) => s.replace(/\s+or$/i, "").trim());

  /**
   * THROUGH EASTERTIDE THE RCL APPOINTS ACTS IN PLACE OF THE OLD TESTAMENT.
   *
   * The table records it where every other reading goes, in `nt` — so `nt[0]`
   * was Acts on nine Sundays and the deck showed "Acts 2:14a, 22-32" on the
   * Epistle card while the actual epistle (1 Peter 1:3-9) was never shown at
   * all. On seven of those Sundays there is no OT entry either, so the deck
   * simply had no first reading. Acts fills the first slot it was appointed
   * for, and the epistle is the next reading that is not Acts.
   */
  const nts = r.nt ?? [];
  const isActs = (x: string) => /^acts\b/i.test(x);
  const actsEntry = nts.find(isActs) ?? null;
  const nonActs = nts.filter((x) => !isActs(x));
  // Acts fills the FIRST slot only when there is no Old Testament reading to
  // put there; the epistle is the first reading that isn't Acts, falling back
  // to Acts itself on the days it is the only second reading appointed
  // (the Baptism of our Lord).
  const firstReading = ots[0] ?? actsEntry;
  const epistle = nonActs[0] ?? (ots[0] ? actsEntry : null);

  const track1: RclTrack = { ot: firstReading, psalm: r.psalm, nt: epistle, gospel: r.gospel };

  /**
   * A SECOND TRACK IS A SECOND OLD TESTAMENT READING — never a gospel.
   *
   * "The last non-psalmody entry" made a Track 2 out of whatever else sat in
   * the row, so Palm Sunday offered a track whose Old Testament reading was
   * the Passion (Matthew 27:11-54), Easter Day's was Matthew 28:1-10 and
   * Pentecost's was John 7:37-39. The RCL's two tracks belong to the Sundays
   * after Pentecost; a New Testament book in that slot means the row held
   * something else, not a track.
   */
  const NT_BOOKS = /^(matthew|mark|luke|john|acts|romans|1 corinthians|2 corinthians|galatians|ephesians|philippians|colossians|1 thessalonians|2 thessalonians|1 timothy|2 timothy|titus|philemon|hebrews|james|1 peter|2 peter|1 john|2 john|3 john|jude|revelation)\b/i;
  const ot2 = ots.length > 1 && !NT_BOOKS.test(ots[ots.length - 1]!) ? ots[ots.length - 1]! : null;
  const track2: RclTrack | null = ot2
    // Its own appointed psalm when the row carries one; otherwise the day's,
    // rather than null — a track with no psalm at all dropped the psalm slides.
    ? { ot: ot2, psalm: psalms2[psalms2.length - 1] ?? r.psalm, nt: epistle, gospel: r.gospel }
    : null;
  return { track1, track2 };
}

export async function getSundayTracks(today = new Date()): Promise<SundayTracks | null> {
  const d = nextSundayDate(today);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const row = RCL_SUNDAYS[iso];
  if (!row) return null;
  const hit = cache.get(row.url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let parsed: { track1: RclTrack; track2: RclTrack | null } | null = null;
  try {
    const controller = new AbortController();
    /**
     * SHORTER THAN THE CLIENTS' OWN BOUNDS. The deck gives a deck fetch 6
     * seconds and the background walk 8; a 10-second scrape here meant that on
     * the first request after a deploy — the one that fills this cache — both
     * gave up before the server could answer, and the reader saw nothing while
     * we waited on a page that is very likely blocked anyway (Railway's
     * outbound IP is refused by lectionarypage's mod_security; see the note in
     * rclLectionary). Falling back to the bundled table fast beats answering
     * late.
     */
    const timeout = setTimeout(() => controller.abort(), 4_000);
    const res = await fetch(row.url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (res.ok) parsed = parseTracks(await res.text());
  } catch (err) {
    console.warn("[rcl-tracks] page fetch failed, using the scraped row:", err);
  }
  if (!parsed || !parsed.track1.gospel) parsed = fallbackTracks(iso);
  if (!parsed) return null;
  const value: SundayTracks = { sundayDate: iso, url: row.url, ...parsed };
  cache.set(row.url, { at: Date.now(), value });
  return value;
}
