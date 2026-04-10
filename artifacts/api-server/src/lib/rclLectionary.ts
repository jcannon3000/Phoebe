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
 *   1. Exact seed hit (bundled, zero I/O).
 *   2. DB row for that exact Sunday (admin-populated fallback).
 *   3. Nearest seed entry — the seed is always available in memory, so
 *      this path is infallible as long as SEED_READINGS is non-empty.
 *
 * Design goal: this function MUST NOT throw in normal operation. The Lectio
 * card on the dashboard and the /lectio page both depend on it, and a
 * throw here nukes the user's entire experience. We'd rather show
 * yesterday's Gospel than an error screen.
 */
export async function getReadingForSunday(
  sundayDate: Date
): Promise<LectionaryReading> {
  const iso = ymd(sundayDate);

  // 1. Exact seed hit — fastest and most common path.
  const seeded = SEED.get(iso);
  if (seeded) return seedToReading(seeded);

  // 2. DB row for this exact Sunday (admin-populated or previously cached).
  try {
    const existing = await db
      .select()
      .from(lectionaryReadingsTable)
      .where(eq(lectionaryReadingsTable.sundayDate, iso))
      .limit(1);
    if (existing[0] && existing[0].gospelText?.trim()) {
      return existing[0];
    }
  } catch (err) {
    // DB unavailable — fall through to nearest-seed fallback.
    console.warn("[lectionary] DB lookup failed, using nearest seed:", err);
  }

  // 3. Nearest seed fallback. Prefer the closest Sunday on-or-before the
  // target (so if we're past the end of the seeded window we show the most
  // recent reading we have). If none is on-or-before, take the earliest.
  const sorted = SEED_READINGS.slice().sort((a, b) => a.sundayDate.localeCompare(b.sundayDate));
  if (sorted.length === 0) {
    throw new Error("Lectionary seed is empty — run scripts/fetch-lectionary-seed.mjs.");
  }
  let nearest: SeedReading = sorted[0]!;
  for (const r of sorted) {
    if (r.sundayDate <= iso) nearest = r;
    else break;
  }
  console.warn(
    `[lectionary] no exact match for ${iso}, falling back to nearest seed entry ${nearest.sundayDate}`
  );
  return seedToReading(nearest);
}

/** Convenience: reading for the upcoming Sunday. */
export async function getUpcomingSundayReading(): Promise<LectionaryReading> {
  return getReadingForSunday(nextSundayDate());
}
