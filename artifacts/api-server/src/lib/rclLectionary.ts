/**
 * Revised Common Lectionary (RCL) reading lookup — seed-only, no network.
 *
 * The Gospel reading for a given Sunday is served directly from a bundled
 * seed file (`src/data/lectionary/seed.ts`) that is pre-fetched locally via
 * `scripts/fetch-lectionary-seed.mjs` and committed to the repo. The seed
 * currently covers ~24 weeks of Sundays; refresh it quarterly.
 *
 * We do NOT hit lectionarypage.net from the server — Railway's outbound IP
 * is blocked by their mod_security, and we don't want the Lectio card to
 * depend on flaky third-party availability anyway. If a user asks for a
 * Sunday outside the seeded window, we fall through to the lectionary_readings
 * DB table (in case an admin populated it by hand), and otherwise throw a
 * clear "reading_not_available" error.
 */

import { db, lectionaryReadingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { LectionaryReading } from "@workspace/db";
import { SEED_READINGS, type SeedReading } from "../data/lectionary/seed";

// In-memory index of the bundled seed. Built once at module load.
const SEED: Map<string, SeedReading> = new Map(
  SEED_READINGS.map((r) => [r.sundayDate, r])
);

// ─── Date helpers ───────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns the date of the upcoming Sunday (or today, if today is Sunday). */
export function nextSundayDate(today = new Date()): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sunday
  const add = dow === 0 ? 0 : 7 - dow;
  d.setDate(d.getDate() + add);
  return d;
}

/** Returns the most recent past Sunday (or today, if today is Sunday). */
export function mostRecentSundayDate(today = new Date()): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - dow);
  return d;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Shape the seed row into a LectionaryReading. The route consumers only use
 * sundayDate/sundayName/season/year/reference/text/sourceUrl, but we return
 * the full DB row shape so callers can treat seed hits and DB hits uniformly.
 */
function seedToReading(seed: SeedReading): LectionaryReading {
  return {
    id: 0,
    sundayDate: seed.sundayDate,
    sundayName: seed.sundayName,
    liturgicalSeason: seed.liturgicalSeason,
    liturgicalYear: seed.liturgicalYear,
    gospelReference: seed.gospelReference,
    gospelText: seed.gospelText,
    sourceUrl: seed.sourceUrl,
    fetchedAt: new Date(),
  };
}

/**
 * Resolve the RCL Gospel reading for a specific Sunday.
 *
 * Resolution order:
 *   1. Bundled seed (in-memory, zero I/O, always authoritative when present).
 *   2. `lectionary_readings` DB table — fallback for Sundays outside the
 *      seeded window, in case an admin populated a row by hand.
 *
 * Throws if neither source has a reading. The caller (routes/lectio.ts)
 * turns this into a clean 502 with `error: "reading_not_available"`.
 */
export async function getReadingForSunday(
  sundayDate: Date
): Promise<LectionaryReading> {
  const iso = ymd(sundayDate);

  // 1. Seed hit — fastest path, and the one the app is designed around.
  const seeded = SEED.get(iso);
  if (seeded) return seedToReading(seeded);

  // 2. DB fallback — Sundays outside the seeded window.
  const existing = await db
    .select()
    .from(lectionaryReadingsTable)
    .where(eq(lectionaryReadingsTable.sundayDate, iso))
    .limit(1);
  if (existing[0] && existing[0].gospelText?.trim()) {
    return existing[0];
  }

  throw new Error(
    `No lectionary reading available for ${iso} — not in seed and not in DB. ` +
      `Refresh the seed with scripts/fetch-lectionary-seed.mjs.`
  );
}

/** Convenience: reading for the upcoming Sunday. */
export async function getUpcomingSundayReading(): Promise<LectionaryReading> {
  return getReadingForSunday(nextSundayDate());
}
