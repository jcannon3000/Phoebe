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
  const track1: RclTrack = { ot: ots[0] ?? null, psalm: r.psalm, nt: r.nt[0] ?? null, gospel: r.gospel };
  const ot2 = ots.length > 1 ? ots[ots.length - 1]! : null;
  const track2: RclTrack | null = ot2 ? { ot: ot2, psalm: psalms2[psalms2.length - 1] ?? null, nt: r.nt[0] ?? null, gospel: r.gospel } : null;
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
    const timeout = setTimeout(() => controller.abort(), 10_000);
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
