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

/**
 * ONE PICTURE, ONE PLACE IN THE SCROLL (owner, 2026-09-18: "Showed the same
 * image twice" — Cara B. Hochhalter's "Maundy Thursday Foot-Washing", back to
 * back).
 *
 * ACT files the same picture under several records, one per lectionary Sunday
 * it serves: Hochhalter's 66 records are about thirty pictures, the same JPEG
 * three times over. The JESUS MAFA and Koenig sets add a black-and-white
 * bulletin copy ("...bw.jpg") of works already held in colour. Visio wants
 * every record (each carries its own readings); the gallery wants each
 * picture once. So works are folded by image address AND by title + artist —
 * the address alone misses the bulletin copies, the title alone would fold two
 * different artists' "Transfiguration".
 *
 * The first record met is kept (icons first, then the curated library), unless
 * it is a bulletin copy and the newcomer is not — the colour scan wins.
 * `aliasOf` maps every folded id to the one kept, so time already spent on a
 * folded record still counts, and still reads as "you stayed with this".
 *
 * THE TITLE FOLD IS NARROW (audit, 2026-09-18). Title + artist alone also
 * folded genuinely different paintings: van Hemessen's two "Calling of Saint
 * Matthew" (1539 and 1548), Schönfeld's two Jacob-and-Esau canvases, and any
 * two "anonymous" works of one subject, so those never appeared. It now also
 * needs the same date and a named artist; ACT's duplicates (same scan, same
 * date) still fold. And one painting held under two different files AND two
 * wordings of its title can't be seen by either key, so those pairs are named
 * by hand in SAME_WORK, each checked against both records.
 */
const normImg = (u: string) => {
  let v = u;
  try { v = decodeURI(u); } catch { /* keep as is */ }
  return v.trim().toLowerCase().replace(/\s+/g, " ");
};
/** "c. 1520", "ca. 1520" and "circa 1520" are one date. */
const normDate = (d: string | null): string =>
  (d ?? "").trim().toLowerCase().replace(/^(?:c\.|ca\.|circa|approximately|about)\s*/, "").replace(/\s+/g, " ");
const normTitle = (a: { title: string; artist: string | null; date: string | null }): string | null => {
  const artist = (a.artist ?? "").trim().toLowerCase();
  if (!artist || /anonym|unknown/.test(artist)) return null;
  return `${a.title.trim().toLowerCase().replace(/\s+/g, " ")}|${artist}|${normDate(a.date)}`;
};

/**
 * One painting, two records with different files and titles: [kept, folded].
 * Duccio's Calling of Peter and Andrew (NGA, 1308-11): the icon record and the
 * Commons "The Calling of the Apostles…". Fra Angelico's San Marco Sermon on
 * the Mount: ACT's commentary record and the Commons one.
 */
const SAME_WORK: ReadonlyArray<readonly [number, number]> = [
  [49261, 9918996],
  [58321, 9864396],
];
const isBulletinCopy = (img: string) => /bw\d*\.jpe?g$/i.test(img);

let folded: { works: GalleryWork[]; aliasOf: Map<number, number> } | null = null;

function foldedLibrary(): { works: GalleryWork[]; aliasOf: Map<number, number> } {
  if (folded) return folded;
  const kept: GalleryWork[] = [];
  const aliasOf = new Map<number, number>();
  const byImg = new Map<string, number>();
  const byTitle = new Map<string, number>();
  const seenId = new Set<number>();
  const all: GalleryWork[] = [
    ...ICON_CATALOGUE,
    ...[...ACT_CATALOGUE, ...ACT_COMMENTARY_CATALOGUE, ...COMMONS_VISIO_CATALOGUE].map(asGallery),
  ];
  for (const a of all) {
    // Icons first, so an id that exists in both keeps the icon record (its
    // attribution is the one the practice already prints).
    if (seenId.has(a.id) || !a.img) continue;
    seenId.add(a.id);
    const ik = normImg(a.img);
    const tk = normTitle(a);
    const pair = SAME_WORK.find(([, f]) => f === a.id);
    const pairAt = pair ? kept.findIndex((k) => k.id === pair[0]) : -1;
    const at = pairAt >= 0 ? pairAt : byImg.get(ik) ?? (tk ? byTitle.get(tk) : undefined);
    if (at === undefined) {
      byImg.set(ik, kept.length);
      if (tk) byTitle.set(tk, kept.length);
      kept.push(a);
      continue;
    }
    const prior = kept[at]!;
    if (isBulletinCopy(prior.img) && !isBulletinCopy(a.img)) {
      // The colour scan replaces the bulletin copy in the same slot.
      aliasOf.set(prior.id, a.id);
      for (const [k, v] of aliasOf) if (v === prior.id) aliasOf.set(k, a.id);
      kept[at] = a;
      byImg.set(ik, at);
    } else {
      aliasOf.set(a.id, prior.id);
    }
  }
  folded = { works: kept, aliasOf };
  return folded;
}

/** The id a record is shown under in the gallery (itself, unless folded). */
export function galleryIdFor(id: number): number {
  return foldedLibrary().aliasOf.get(id) ?? id;
}

/** Every picture, once, from every library — admin-hidden and icon-OFF works left out. */
export function galleryPool(): GalleryWork[] {
  return foldedLibrary().works.filter((a) => !isActHidden(a.id) && !actIconOff(a.id));
}

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

type GalleryDay = { works: GalleryWork[]; relatedFrom: number; tailIsRelated: boolean };

/**
 * THE SAME ORDER ALL DAY, KEPT RATHER THAN RE-DERIVED (audit, 2026-09-18).
 * The order depends on what you have met, and meeting pictures is what the
 * scroll is for, so rebuilding it on the second opening of a day reshuffled
 * it under the promise above. The first build of a day is saved on the device
 * (ids only) and reused until the date changes; any picture added to the
 * library since is appended, and one removed simply drops out.
 */
const DAY_KEY = "phoebe:icon-gallery-day";

export function galleryForDayWithMarker(
  ymd: string,
  opts: { held?: HeldWork[] } = {},
): GalleryDay {
  const pool = galleryPool();
  try {
    const raw = localStorage.getItem(DAY_KEY);
    const saved = raw ? JSON.parse(raw) as { ymd?: string; ids?: unknown; relatedFrom?: unknown; tailIsRelated?: unknown } : null;
    if (saved && saved.ymd === ymd && Array.isArray(saved.ids) && typeof saved.relatedFrom === "number") {
      const byId = new Map(pool.map((a) => [a.id, a]));
      const works: GalleryWork[] = [];
      const seen = new Set<number>();
      let relatedFrom = -1;
      saved.ids.forEach((id, i) => {
        if (i === saved.relatedFrom && relatedFrom < 0) relatedFrom = works.length;
        const a = typeof id === "number" ? byId.get(id) : undefined;
        if (a && !seen.has(a.id)) { works.push(a); seen.add(a.id); }
      });
      for (const a of pool) if (!seen.has(a.id)) works.push(a);
      // The floor applies to a restored day too, or a rule added today would
      // not reach anyone until tomorrow.
      spaceOutLatimore(works);
      return { works, relatedFrom: saved.relatedFrom >= 0 ? Math.max(0, relatedFrom) : -1, tailIsRelated: saved.tailIsRelated === true };
    }
  } catch { /* unreadable: build afresh */ }
  const built = buildGalleryDay(pool, ymd, opts);
  try {
    localStorage.setItem(DAY_KEY, JSON.stringify({
      ymd, ids: built.works.map((a) => a.id), relatedFrom: built.relatedFrom, tailIsRelated: built.tailIsRelated,
    }));
  } catch { /* private mode: it is rebuilt next time, as before */ }
  return built;
}

function buildGalleryDay(
  pool: GalleryWork[],
  ymd: string,
  opts: { held?: HeldWork[] },
): GalleryDay {
  const rows = foldHeld(opts.held ?? []);
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
   * THE TAIL — THE REST OF THE LIBRARY (owner, 2026-09-18: "I only looked at
   * like 30 images, isn't there like 500 in the library").
   *
   * It used to be twenty works near what you had held, and nothing at all with
   * no history — so a first scroll ended at forty with most of the library
   * unseen. Now the scroll goes on through every picture not yet shown:
   * nearest to what you have stayed with first (when there is anything to be
   * near), then everything else in the day's shuffle, with the same no-run-of-
   * one-hand window the day keeps (the per-day artist cap is the day's rule,
   * not the tail's, or a large set would simply stop partway).
   *
   * Pictures you have already met come LAST, after everything new, rather
   * than not at all (audit, 2026-09-18: a picture centred for a second on
   * Monday was otherwise missing from the whole scroll for weeks, under an end
   * card that said "the whole library").
   */
  const rest = fresh.filter((a) => !used.has(a.id));
  const tailRelated = weights.size > 0;
  const tailOrder = tailRelated
    ? [...rest].sort((a, b) =>
        (affinityScore(b, weights) - affinityScore(a, weights)) || (order.get(a.id)! - order.get(b.id)!))
    : rest;
  const pending = [...tailOrder];
  while (pending.length) {
    let k = pending.findIndex((a) => {
      if (!a.artist) return true;
      let n = 0;
      for (let i = Math.max(0, works.length - 5); i < works.length; i++) {
        if (works[i]!.artist === a.artist) n += 1;
      }
      return n < 2;
    });
    // Only one hand left: take it rather than stop.
    if (k < 0) k = 0;
    const [next] = pending.splice(k, 1);
    works.push(next!);
  }
  // Already met: in the day's shuffle, after everything new.
  for (const a of shuffled) if (seenIds.has(a.id) && !used.has(a.id)) works.push(a);
  spaceOutLatimore(works);
  return { works, relatedFrom: works.length > relatedFrom ? relatedFrom : -1, tailIsRelated: tailRelated };
}

/**
 * A KELLY LATIMORE AT LEAST EVERY TWENTY (owner, 2026-09-19: "Make sure it
 * shows a Kelly Latinate atleast once every 20" — his spelling of Latimore,
 * the icon painter).
 *
 * A FLOOR, not a filter: nothing is dropped and nothing is repeated. Walking
 * the finished order, wherever twenty pictures have passed without one, the
 * next Latimore still to come is MOVED UP to that place; everything else keeps
 * its order. So the day's shuffle, the one-in-three stranger, the fold, the
 * held works and the met-pictures-last tail all survive it.
 *
 * THE POOL IS 25 OF HIM, against a library of some 780. Twenty-five placements
 * at one per twenty covers the first five hundred pictures; past that there is
 * no Latimore left to move and the rule simply stops, because the alternative
 * would be showing the same icon twice. "At least every twenty, as often as
 * there are Latimores" is the honest reading.
 */
const LATIMORE = /latimore/i;
const LATIMORE_EVERY = 20;

function spaceOutLatimore(works: GalleryWork[]): void {
  let since = 0;
  for (let i = 0; i < works.length; i++) {
    if (LATIMORE.test(works[i]!.artist ?? "")) { since = 0; continue; }
    since += 1;
    if (since < LATIMORE_EVERY) continue;
    // Due one: take the next still to come, and put it here.
    let j = -1;
    for (let k = i + 1; k < works.length; k++) {
      if (LATIMORE.test(works[k]!.artist ?? "")) { j = k; break; }
    }
    if (j < 0) return; // none left — the rule stops rather than repeating one
    const [pick] = works.splice(j, 1);
    works.splice(i, 0, pick!);
    since = 0;
  }
}

/** Held rows with folded ids merged into the id the gallery shows. */
export function foldHeld(rows: HeldWork[]): HeldWork[] {
  const out = new Map<number, HeldWork>();
  for (const r of rows) {
    const id = galleryIdFor(r.id);
    const prior = out.get(id);
    out.set(id, prior ? { ...prior, seconds: prior.seconds + r.seconds } : { ...r, id });
  }
  return [...out.values()];
}

/**
 * THE COMMENTARY, WHERE THERE IS ONE (owner, 2026-09-18, with an ACT link:
 * "if there is a comentery, have a read comenatry pill next to the others").
 *
 * ACT records a work's commentary as a URL on thevcs.org — the Visual
 * Commentary on Scripture — not as text, so nothing of theirs is held here or
 * shipped in the bundle. The pill opens their page in the in-app reader, the
 * same rule this app keeps for Forward Movement, oremus and the newsletters.
 *
 * Both catalogues carry the field; the commentary harvest is where most of
 * them live (241 of its works have one). The http test matters because the
 * field is an empty string for a work without one, and the admin tool applies
 * the same test.
 */
const commentaryById = new Map<number, string>();
let commentaryBuilt = false;

export function commentaryUrlFor(id: number): string | null {
  if (!commentaryBuilt) {
    for (const a of [...ACT_COMMENTARY_CATALOGUE, ...ACT_CATALOGUE]) {
      const essay = (a as { essay?: string }).essay;
      if (essay && /^https?:\/\//i.test(essay) && !commentaryById.has(a.id)) {
        commentaryById.set(a.id, essay);
      }
    }
    commentaryBuilt = true;
  }
  return commentaryById.get(id) ?? null;
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
  return new Set(foldHeld(rows).filter((v) => v.seconds >= GALLERY_HOLD_MS / 1000).map((v) => v.id));
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
 * errors and remembers it for a week (see below: offline failures and bursts
 * are not remembered at all).
 */
const FAILED_KEY = "phoebe:icon-img-failed";
/**
 * A FAILURE IS A GUESS, SO IT EXPIRES (audit, 2026-09-18). Opening the scroll
 * offline used to fail every lazy image as it came near, remember each one for
 * good, and let the pages keep loading more to fail, until up to 300 pictures
 * were blacklisted forever and the end card claimed "the whole library". Now:
 *  - nothing is remembered while the device says it is offline;
 *  - a burst of failures (six inside ten seconds) is read as a bad connection,
 *    not six dead files, and stops the remembering for this session;
 *  - a remembered failure lasts a week, then the picture gets another chance.
 * Old entries (bare ids, from before this) are read as already expired.
 */
const FAILED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BURST_COUNT = 6;
const BURST_WINDOW_MS = 10_000;
let recentFailures: number[] = [];
let connectionSuspect = false;

type FailedRow = { id: number; at: number };

function readFailed(): FailedRow[] {
  try {
    const raw = localStorage.getItem(FAILED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((v): v is FailedRow =>
      !!v && typeof v === "object" && typeof (v as FailedRow).id === "number"
      && typeof (v as FailedRow).at === "number" && now - (v as FailedRow).at < FAILED_TTL_MS);
  } catch {
    return [];
  }
}

export function failedImageIds(): Set<number> {
  return new Set(readFailed().map((r) => r.id));
}

/**
 * Remember a picture whose image failed. Returns whether it was remembered, so
 * the feed can still hide it for this visit either way.
 */
export function rememberFailedImage(id: number): boolean {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    const now = Date.now();
    recentFailures = [...recentFailures.filter((t) => now - t < BURST_WINDOW_MS), now];
    if (recentFailures.length >= BURST_COUNT) connectionSuspect = true;
    if (connectionSuspect) return false;
    const rows = readFailed();
    if (rows.some((r) => r.id === id)) return true;
    // Capped: a bad spell must not blacklist the whole library.
    localStorage.setItem(FAILED_KEY, JSON.stringify([...rows, { id, at: now }].slice(-100)));
    return true;
  } catch {
    return false;
  }
}
