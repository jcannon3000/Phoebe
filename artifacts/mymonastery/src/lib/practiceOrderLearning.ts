import { apiRequest } from "@/lib/queryClient";

/**
 * THE ORDER YOU ACTUALLY PRAY IN.
 *
 * Owner: "no longer the manual ordering, but the ordering based on tracking in
 * what order the user is opening the cards" — and "morning anchor first
 * always".
 *
 * Manual drag ordering is gone (he never once saw his own order take effect,
 * and it kept ranking a practice above his morning anchor). This replaces it
 * with something nobody has to maintain: the home watches which card you open
 * first, second, third, and settles into that shape. A rule of life is a habit
 * before it is a setting, so the habit is the better record of it.
 *
 * HOW IT LEARNS. Each open appends the card's key to today's sequence. A
 * card's rank is the MEAN of its positions across the recent days it appears
 * in — a mean, not a last-seen, so one unusual morning doesn't reshuffle the
 * day. A card seen on few days is held back (see MIN_DAYS) rather than
 * promoted on a single sighting.
 *
 * WHAT IT NEVER DOES. It never moves the morning anchor off the top, and it
 * never invents an order for practices it hasn't watched — those keep the
 * built-in shape of the day, behind the ones it knows.
 */

const KEY = "phoebe:practice-open-log";
/** Days of history kept. Long enough to average a week's shape, short enough
 *  that a rule someone changed last week stops speaking for them. */
const KEEP_DAYS = 21;
/** A card must have been opened on at least this many separate days before it
 *  is allowed to outrank the built-in order — one tap is not a habit. */
const MIN_DAYS = 2;

export const PRACTICE_ORDER_EVENT = "phoebe:practice-order-learned";

type DayLog = { ymd: string; keys: string[] };

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

function read(): DayLog[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (d): d is DayLog =>
        !!d && typeof d.ymd === "string" && Array.isArray(d.keys) &&
        d.keys.every((k: unknown) => typeof k === "string"),
    );
  } catch { return []; }
}

function write(days: DayLog[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(days.slice(-KEEP_DAYS)));
    window.dispatchEvent(new Event(PRACTICE_ORDER_EVENT));
  } catch { /* private mode */ }
}

/** Record that a practice was OPENED. Idempotent within a day: the first open
 *  is what says where the practice sits, and re-opening it later (to finish,
 *  or by accident) mustn't push it down the list. */
export function recordPracticeOpen(key: string): void {
  if (!key) return;
  const days = read();
  const ymd = today();
  const last = days[days.length - 1];
  if (last && last.ymd === ymd) {
    if (last.keys.includes(key)) return;
    last.keys.push(key);
  } else {
    days.push({ ymd, keys: [key] });
  }
  write(days);
  pushPracticeOpenLog();
}

/** The learned rank of each card key: mean opening position across the days it
 *  was opened, for cards seen on enough separate days to count. */
export function learnedRanks(): Map<string, number> {
  const seen = new Map<string, { sum: number; days: number }>();
  for (const d of read()) {
    d.keys.forEach((k, i) => {
      const cur = seen.get(k) ?? { sum: 0, days: 0 };
      cur.sum += i;
      cur.days += 1;
      seen.set(k, cur);
    });
  }
  const ranks = new Map<string, number>();
  for (const [k, v] of seen) if (v.days >= MIN_DAYS) ranks.set(k, v.sum / v.days);
  return ranks;
}

/**
 * Order cards by the habit, with the morning anchor pinned first.
 *
 * Stable in tiers: the morning anchor, then the newsletters, then everything
 * the log has an opinion about (by mean position), then everything it doesn't
 * — each tier keeping the built-in order among equals, so a day the log knows
 * nothing about looks exactly as it did before.
 *
 * THE NEWSLETTER TIER (owner, 2026-09-06: "make newsletters show up second
 * after the morning practice", then "forward should be second"). This sort
 * runs AFTER the caller's own ordering and used to override it completely:
 * anything the log had seen (Visio, opened once) outranked anything it hadn't
 * (Forward Day by Day, never opened), so the newsletter fell to third however
 * the caller had ordered it. The habit still orders everything below.
 *
 * `groupOf` keeps the caller's coarse ordering — the home passes its slot
 * group, so an evening practice cannot be lifted out of last place by having
 * been opened (owner: "examen — any evening should be last"). Callers that
 * pass nothing get one flat group, exactly as before.
 */
export const isPublicationKey = (key: string): boolean =>
  key.startsWith("reflect-") || key.startsWith("w:") || key === "taize" || key === "andrews"
  // "reflect" (no source) is the progress pill's single aggregate dot for all
  // of them — same tier as the cards it stands for.
  || key === "reflect";

/**
 * Which third of the day a card key belongs to, for surfaces that carry keys
 * but no slot (the header's progress dots).
 *
 * The home sorts by the card's real slot; this reads the side out of the key
 * instead, so the pill keeps the same shape the list has — and, in particular,
 * so an evening practice stays last there too (owner, 2026-09-06: "make sure
 * the evening practice is always last"). Compline and the Examen are
 * evening-slotted in DailyProgressBody, so they belong to the evening here.
 */
export function dayGroupForKey(key: string): number {
  if (key === "evening" || key.endsWith("-evening") || key === "compline" || key === "examen") return 2;
  if (key === "morning" || key.endsWith("-morning") || isPublicationKey(key)) return 0;
  return 1;
}

export function sortCardsByLearnedOrder<T extends { key: string }>(
  cards: T[],
  groupOf?: (c: T) => number,
): T[] {
  const ranks = learnedRanks();
  if (ranks.size === 0 && !groupOf) return cards;
  const tier = (c: T): number =>
    c.key === "morning" ? -2 : isPublicationKey(c.key) ? -1 : ranks.has(c.key) ? 0 : 1;
  return cards
    .map((c, i) => ({ c, i, g: groupOf ? groupOf(c) : 0, t: tier(c), r: ranks.get(c.key) ?? 0 }))
    .sort((a, b) => (a.g - b.g) || (a.t - b.t) || (a.t === 0 ? a.r - b.r : 0) || (a.i - b.i))
    .map((x) => x.c);
}

/** The recent day-sequences, for the server's cross-user pattern read. */
export function practiceOpenLog(): DayLog[] {
  return read();
}

/**
 * Send the log up (owner: "use this data to see patterns across users through
 * feeding it into the api").
 *
 * Debounced and fire-and-forget: this is a record of taps, and losing one to a
 * dropped request costs nothing — the next open sends the whole window again.
 * Guests have no account to attach it to, so nothing leaves their device.
 */
let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function pushPracticeOpenLog(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const days = read();
    if (days.length === 0) return;
    void apiRequest("PUT", "/api/me/practice-open-log", { days }).catch(() => { /* best-effort */ });
  }, 1500);
}

/**
 * Has this person actually used a practice yet?
 *
 * The open log is the broadest record of "they did something" the device
 * keeps — every rhythm card records its open here. The guest welcome card
 * used to ask the server's prayer-DAYS instead, which counts completed
 * offices only, so someone who read the day's newsletter or sat with the
 * picture still saw "Begin here" (owner, 2026-09-06: switch to the second
 * card "after they practice").
 */
export function hasUsedAPractice(): boolean {
  return read().some((d) => d.keys.length > 0);
}
