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

/** Where the "related images" tail begins, and how long it runs. */
export const RELATED_TAIL = 20;
/** However much you like one hand, the day is not theirs. */
const MAX_PER_ARTIST_PER_DAY = 6;

/**
 * TODAY'S SCROLL — the same order all day, a different one tomorrow.
 *
 * Owner, 2026-09-18: "the algorytme needs work, i think because i held on a
 * wesley frank, it only was showing wesley franks" · "1 in every 3 should a
 * ramdom image to test if they like it" · "do extensive work on the
 * algorytem" · "also it needs to continue with other images that may be
 * related somehow" · "have a message in between that says related images".
 *
 * WHAT WENT WRONG. The old order was a plain greedy sort by score. Dwell once
 * on a work and its ARTIST earns a weight; every other work by that hand then
 * scores exactly the same, so the whole shelf of them rose to the top
 * together. Liking one painting became a day of that painter — the opposite of
 * a gallery.
 *
 * Three things fix it, and they are different things:
 *
 * 1. WHAT A SIGNAL IS WORTH. A shared subject or person says something about
 *    what you are praying with; a shared artist mostly says you liked a
 *    picture. So the hand counts for less, every facet is capped, and the
 *    whole score is square-rooted — a second match adds much less than the
 *    first. No single fact can dominate.
 *
 * 2. NO RUN OF ONE HAND. Even a fair score can stack. At most two works by the
 *    same artist in any six, enforced while the list is built rather than
 *    hoped for afterwards.
 *
 * 3. EVERY THIRD IS A STRANGER. A taste model can only ever hand back more of
 *    what it already believes. So one slot in three ignores the score entirely
 *    and draws from the whole library, which is both how you find something
 *    new and how the model learns it was wrong.
 *
 * THE TAIL. Past the day's forty the scroll keeps going with what is nearest
 * to the ones you have actually held — a different list from the day's, and
 * the caller marks it with a divider. `relatedFrom` is that index.
 */
export function galleryForDay(ymd: string, opts: { held?: HeldWork[] } = {}): GalleryWork[] {
  return galleryForDayWithMarker(ymd, opts).works;
}

export function galleryForDayWithMarker(
  ymd: string,
  opts: { held?: HeldWork[] } = {},
): { works: GalleryWork[]; relatedFrom: number } {
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
  const order = new Map(shuffled.map((a, i) => [a.id, i]));
  // Nearest first, the day's shuffle deciding between equals — and with no
  // history at all every score is 0, so a first scroll is simply the shuffle.
  const byAffinity = [...fresh].sort((a, b) =>
    (affinityScore(b, weights) - affinityScore(a, weights)) || (order.get(a.id)! - order.get(b.id)!));

  const used = new Set<number>();
  const works: GalleryWork[] = [];
  /**
   * TWO LIMITS, because they answer different halves of the complaint.
   *
   * The WINDOW stops a run — no more than two by one hand in any six, so the
   * scroll never feels like a slideshow of one painter. The DAY CAP stops the
   * quiet version: this library has 113 works by a single hand, and with
   * affinity behind them they can take a third of the forty without ever
   * breaking the window rule. Six is enough to say "we heard that you liked
   * this" and not so many that the day belongs to them.
   */
  const perArtist = new Map<string, number>();
  const handOk = (a: GalleryWork): boolean => {
    if (!a.artist) return true;
    if ((perArtist.get(a.artist) ?? 0) >= MAX_PER_ARTIST_PER_DAY) return false;
    let n = 0;
    for (let i = Math.max(0, works.length - 5); i < works.length; i++) {
      if (works[i]!.artist === a.artist) n += 1;
    }
    return n < 2;
  };
  const takeFrom = (list: GalleryWork[], relaxed: boolean): GalleryWork | null => {
    for (const a of list) {
      if (used.has(a.id)) continue;
      if (!relaxed && !handOk(a)) continue;
      return a;
    }
    return null;
  };
  // The stranger slots are drawn by the DAY's random walk, so they are as
  // reproducible as the rest of the order — the same scroll all day.
  const strangers = [...fresh];
  for (let i = strangers.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [strangers[i], strangers[j]] = [strangers[j]!, strangers[i]!];
  }
  let si = 0;
  while (works.length < GALLERY_LENGTH) {
    const wantStranger = works.length % 3 === 2;
    let next: GalleryWork | null = null;
    if (wantStranger) {
      while (si < strangers.length) {
        const cand = strangers[si++]!;
        if (used.has(cand.id)) continue;
        if (!handOk(cand)) continue;
        next = cand; break;
      }
    }
    // The affinity list is the default, and the fallback when a stranger can't
    // be had without stacking one hand.
    if (!next) next = takeFrom(byAffinity, false);
    // Last resort: a library with few artists must still fill the day rather
    // than stop short because the diversity rule can't be met.
    if (!next) next = takeFrom(byAffinity, true);
    if (!next) break;
    works.push(next);
    used.add(next.id);
    if (next.artist) perArtist.set(next.artist, (perArtist.get(next.artist) ?? 0) + 1);
  }

  const relatedFrom = works.length;
  /**
   * THE TAIL — nearest to what you have HELD, not to the day's picks, and only
   * when there is something to be near. With no history there is nothing
   * "related" to show, so the scroll simply ends where it always did.
   */
  if (weights.size > 0) {
    const tail = [...fresh]
      .filter((a) => !used.has(a.id) && affinityScore(a, weights) > 0)
      .sort((a, b) =>
        (affinityScore(b, weights) - affinityScore(a, weights)) || (order.get(a.id)! - order.get(b.id)!))
      .slice(0, RELATED_TAIL);
    works.push(...tail);
  }
  return { works, relatedFrom: works.length > relatedFrom ? relatedFrom : -1 };
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

/**
 * WHAT A SIGNAL IS WORTH.
 *
 * A shared SUBJECT or PERSON says something about what you are praying with. A
 * shared ARTIST mostly says you liked a picture — and because every work by a
 * hand shares that one fact exactly, an uncapped artist weight made the whole
 * shelf of them score identically and rise together (owner: "i held on a
 * wesley frank, it only was showing wesley franks").
 *
 * So the hand is worth less than the subject, every facet is capped on its own,
 * and the total is square-rooted: the second thing a work has in common with
 * your history adds far less than the first. A work that merely shares a
 * painter can no longer outrank one that shares what it is OF.
 */
const ARTIST_WEIGHT = 0.4;
const FACET_CAP = 4;

function capped(v: number): number {
  return Math.min(v, FACET_CAP);
}

export function affinityScore(art: GalleryWork, weights: Map<string, number>): number {
  let score = 0;
  if (art.artist) score += capped(weights.get(`artist:${art.artist}`) ?? 0) * ARTIST_WEIGHT;
  // Each facet capped, and the facet FAMILIES capped too, so a work tagged with
  // a dozen subjects cannot win on breadth alone.
  let subj = 0;
  for (const s of art.subjects) subj += capped(weights.get(`subject:${s}`) ?? 0);
  let people = 0;
  for (const p of art.people) people += capped(weights.get(`person:${p}`) ?? 0);
  score += Math.min(subj, FACET_CAP * 2) + Math.min(people, FACET_CAP * 2);
  // Diminishing returns overall.
  return Math.sqrt(score);
}

/**
 * PICTURES THAT DO NOT LOAD ARE NOT SHOWN (owner, 2026-09-18: "make sure that
 * any that are not loading do not show up"). A catalogue this size, drawn from
 * four sources, will always have a few dead addresses — a museum re-pathing a
 * file, a Commons thumb that 404s. The feed hides one the moment its image
 * errors and remembers it, so it never appears again on this device; a work
 * that only failed because the connection did gets a fresh chance whenever the
 * list is cleared.
 */
const FAILED_KEY = "phoebe:icon-img-failed";

export function failedImageIds(): Set<number> {
  try {
    const raw = localStorage.getItem(FAILED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === "number") : []);
  } catch {
    return new Set();
  }
}

export function rememberFailedImage(id: number): void {
  try {
    const ids = failedImageIds();
    if (ids.has(id)) return;
    ids.add(id);
    // Capped: a spell offline must not blacklist the whole library for good.
    localStorage.setItem(FAILED_KEY, JSON.stringify([...ids].slice(-300)));
  } catch { /* ignore */ }
}
