import { ICON_CATALOGUE, type IconArtwork } from "@/lib/iconCatalogue";
import { ACT_CATALOGUE } from "@/lib/visioCatalogue";
import { ACT_COMMENTARY_CATALOGUE } from "@/lib/visioCommentaryCatalogue";
import { COMMONS_VISIO_CATALOGUE } from "@/lib/visioCommonsCatalogue";
import { isActHidden, actIconOff } from "@/lib/actOverrides";

/**
 * THE GALLERY — every picture the app holds, to be scrolled through.
 *
 * Owner, 2026-09-18: "what if we create an image scroll feed like instagram
 * where people browse through images, holding where they findiing meeting" ·
 * "Just remember it" · all four libraries · "integrate into praying with
 * icons" · "where it could be a pill on the icon page" · "then they might be
 * able to open passages that relate to that image if there is one".
 *
 * Holding asks nothing: dwell on a picture and it is REMEMBERED, and that is
 * all. No timer starts, no practice is credited, nothing is kept up with. The
 * ones that held you come back on the first screen, and a work that carries a
 * passage can open it.
 *
 * WHAT IS KEPT IS TIME (owner: "we could track how much time someone spends on
 * each image, and then make an algorythem based on that" · "ones that they
 * might light based on other ones they have spent time on"). Seconds per work,
 * on the device only — nothing is sent anywhere. Tomorrow's scroll leads with
 * the works nearest to what you have actually stayed with: the same hand, the
 * same subjects, the same people. A picture you have never met still comes
 * first over one you have already held.
 *
 * The pool is every library at once (Vanderbilt's curated set and its
 * commentary set, the Wikimedia Commons picks, and the icons), because the
 * point of a gallery is reach: most of these works are never the day's
 * picture. An admin's deletions and icon-OFFs are honoured here as everywhere.
 */
export type GalleryWork = IconArtwork;

const HELD_KEY = "phoebe:icon-held";
/** How long a picture must hold the screen before the app considers it held. */
export const GALLERY_HOLD_MS = 6000;
/** One day's scroll. Long enough to wander, short enough to end. */
export const GALLERY_LENGTH = 40;

function asGallery(a: {
  id: number; title: string; artist: string | null; date: string | null; where: string | null;
  img: string; people: string[]; refs: string[]; days: string[]; subjects: string[];
  act: string; licence: string; attribution: string;
}): GalleryWork {
  return {
    id: a.id, title: a.title, artist: a.artist, date: a.date, where: a.where, img: a.img,
    people: a.people, refs: a.refs, days: a.days, subjects: a.subjects,
    act: a.act, licence: a.licence, attribution: a.attribution,
  };
}

/** Every work, once, from every library — admin-hidden and icon-OFF works left out. */
export function galleryPool(): GalleryWork[] {
  const byId = new Map<number, GalleryWork>();
  // Icons first, so an id that exists in both keeps the icon record (its
  // attribution is the one the practice already prints).
  for (const a of ICON_CATALOGUE) byId.set(a.id, a);
  for (const a of [...ACT_CATALOGUE, ...ACT_COMMENTARY_CATALOGUE, ...COMMONS_VISIO_CATALOGUE]) {
    if (!byId.has(a.id)) byId.set(a.id, asGallery(a));
  }
  return [...byId.values()].filter((a) => !!a.img && !isActHidden(a.id) && !actIconOff(a.id));
}

/**
 * TODAY'S SCROLL — the same order all day, a different one tomorrow, and the
 * ones you have already held first out of the way: a gallery that reshuffled
 * on every open would never let you find again what you saw this morning.
 */
export function galleryForDay(ymd: string, opts: { held?: HeldWork[] } = {}): GalleryWork[] {
  const pool = galleryPool();
  const rows = opts.held ?? [];
  // A cheap deterministic hash of the day, so the order is stable per device
  // per day without storing anything.
  let seed = 0;
  for (let i = 0; i < ymd.length; i++) seed = (seed * 31 + ymd.charCodeAt(i)) >>> 0;
  const rand = () => {
    // xorshift32 — same sequence for the same seed, no dependency.
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0xffffffff;
  };
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const seenIds = new Set(rows.map((v) => v.id));
  const weights = affinityIndex(rows, pool);
  const fresh = shuffled.filter((a) => !seenIds.has(a.id));
  // Nearest first, the day's shuffle deciding between equals — and with no
  // history at all every score is 0, so a first scroll is simply the shuffle.
  const order = new Map(shuffled.map((a, i) => [a.id, i]));
  fresh.sort((a, b) => (affinityScore(b, weights) - affinityScore(a, weights)) || (order.get(a.id)! - order.get(b.id)!));
  const again = shuffled.filter((a) => seenIds.has(a.id));
  // The ones already met go last, which with a library this size means they
  // fall outside the day's forty and are simply met again another day. They
  // only reappear here once the unmet works run short — which is what the tail
  // is for, not a promise that today will show them again.
  return [...fresh, ...again].slice(0, GALLERY_LENGTH);
}

export type HeldWork = { id: number; ymd: string; seconds: number };

/** What you have stayed with — device-local, newest first, capped. */
export function getHeldWorks(): HeldWork[] {
  try {
    const raw = localStorage.getItem(HELD_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is HeldWork =>
        !!v && typeof v === "object"
        && typeof (v as HeldWork).id === "number" && typeof (v as HeldWork).ymd === "string")
      .map((v) => ({ ...v, seconds: typeof v.seconds === "number" && v.seconds > 0 ? v.seconds : GALLERY_HOLD_MS / 1000 }));
  } catch {
    return [];
  }
}

export const HELD_EVENT = "phoebe:icon-held-changed";

/**
 * Add the seconds just spent on a work. Time ACCUMULATES across visits — a
 * picture returned to three times for four seconds says as much as one held
 * once for twelve — and the most recent is kept at the front.
 */
export function recordDwell(id: number, seconds: number, ymd: string): void {
  if (!(seconds > 0)) return;
  try {
    const rows = getHeldWorks();
    const prior = rows.find((v) => v.id === id)?.seconds ?? 0;
    // Kept to a tenth, not a whole second: rounding at EVERY visit quietly ate
    // time — four seconds and a bit, three times over, came to nine rather
    // than thirteen. The display rounds; the record does not.
    const next = [{ id, ymd, seconds: Math.min(3600, Math.round((prior + seconds) * 10) / 10) }, ...rows.filter((v) => v.id !== id)].slice(0, 120);
    localStorage.setItem(HELD_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(HELD_EVENT));
  } catch { /* private mode — the gallery still scrolls */ }
}

export function forgetHeld(id: number): void {
  try {
    localStorage.setItem(HELD_KEY, JSON.stringify(getHeldWorks().filter((v) => v.id !== id)));
    window.dispatchEvent(new CustomEvent(HELD_EVENT));
  } catch { /* ignore */ }
}

/** Held = stayed with past the hold, as opposed to merely scrolled past. */
export function heldIds(rows: HeldWork[] = getHeldWorks()): Set<number> {
  return new Set(rows.filter((v) => v.seconds >= GALLERY_HOLD_MS / 1000).map((v) => v.id));
}

/**
 * NEARNESS TO WHAT YOU HAVE STAYED WITH. Each work you have dwelt on lends its
 * hand, its subjects and its people a weight in proportion to the time given
 * to it (square-rooted, so one long sit cannot drown out everything else), and
 * a candidate scores by what it shares. No network, no profile — the whole
 * model is the seconds on this device.
 */
export function affinityIndex(rows: HeldWork[], pool: GalleryWork[]): Map<string, number> {
  const byId = new Map(pool.map((a) => [a.id, a]));
  const weights = new Map<string, number>();
  const bump = (key: string, by: number) => weights.set(key, (weights.get(key) ?? 0) + by);
  for (const row of rows) {
    const art = byId.get(row.id);
    if (!art) continue;
    const w = Math.sqrt(row.seconds);
    if (art.artist) bump(`artist:${art.artist}`, w);
    for (const s of art.subjects) bump(`subject:${s}`, w);
    for (const p of art.people) bump(`person:${p}`, w);
  }
  return weights;
}

export function affinityScore(art: GalleryWork, weights: Map<string, number>): number {
  let score = 0;
  if (art.artist) score += weights.get(`artist:${art.artist}`) ?? 0;
  for (const s of art.subjects) score += weights.get(`subject:${s}`) ?? 0;
  for (const p of art.people) score += weights.get(`person:${p}`) ?? 0;
  return score;
}
