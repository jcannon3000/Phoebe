// Movable feasts — observances whose date is computed from Easter
// each year, not fixed to a calendar day.
//
// We return a map keyed by YMD so lookups are O(1). Each entry
// carries a partial LiturgicalDay (rank, name, color); the caller
// fills in season and formatting.

import { computeEaster, addDays, toYmd } from "./easter";
import type { LiturgicalColor, LiturgicalRank } from "./types";

export interface MovableFeastEntry {
  rank: LiturgicalRank;
  name: string;
  color: LiturgicalColor;
  description?: string;
  life?: string;
  // Collect text is intentionally not inlined here — reference the
  // BCP or Lesser Feasts and Fasts for the authoritative text so we
  // don't duplicate liturgical content with any errors.
  collectSource?: string;
}

// Build the table for a given year. Cached per year so we don't
// recompute on every getDay() call.
const movableCache = new Map<number, Map<string, MovableFeastEntry>>();

export function movableFeastsForYear(year: number): Map<string, MovableFeastEntry> {
  const hit = movableCache.get(year);
  if (hit) return hit;
  const easter = computeEaster(year);
  const m = new Map<string, MovableFeastEntry>();

  // ─── Lent ──────────────────────────────────────────────────
  m.set(toYmd(addDays(easter, -46)), {
    rank: "holy_day",
    name: "Ash Wednesday",
    color: "violet",
    description:
      "The first day of Lent. A day of fasting, repentance, and the imposition of ashes — a tangible reminder that we are dust, and to dust we shall return.",
    collectSource: "BCP, p. 264",
  });

  // ─── Holy Week ─────────────────────────────────────────────
  m.set(toYmd(addDays(easter, -7)), {
    rank: "principal_feast", // BCP ranks Palm Sunday's liturgy very high; treating as feast-level
    name: "Palm Sunday",
    color: "red",
    description:
      "The Sunday of the Passion: with the palms, the church enters Holy Week — Christ's entry into Jerusalem, the crowd's cry of Hosanna, and the reading of the Passion.",
    collectSource: "BCP, p. 219",
  });
  m.set(toYmd(addDays(easter, -6)), { rank: "holy_day", name: "Monday in Holy Week", color: "red" });
  m.set(toYmd(addDays(easter, -5)), { rank: "holy_day", name: "Tuesday in Holy Week", color: "red" });
  m.set(toYmd(addDays(easter, -4)), { rank: "holy_day", name: "Wednesday in Holy Week", color: "red" });
  m.set(toYmd(addDays(easter, -3)), {
    rank: "principal_feast",
    name: "Maundy Thursday",
    color: "white",
    description:
      "The institution of the Lord's Supper and the new commandment to love one another. The altar is stripped at the end of the liturgy.",
    collectSource: "BCP, p. 221",
  });
  m.set(toYmd(addDays(easter, -2)), {
    rank: "principal_feast",
    name: "Good Friday",
    color: "black",
    description:
      "The crucifixion. A quiet, austere liturgy of the Passion, solemn collects, and veneration of the cross.",
    collectSource: "BCP, p. 221",
  });
  m.set(toYmd(addDays(easter, -1)), {
    rank: "holy_day",
    name: "Holy Saturday",
    color: "unbleached",
    description:
      "The day the Lord lay in the tomb. Traditionally no Eucharist is celebrated; the Easter Vigil begins after sunset.",
    collectSource: "BCP, p. 221",
  });

  // ─── Easter and its Octave ────────────────────────────────
  m.set(toYmd(easter), {
    rank: "principal_feast",
    name: "Easter Day",
    color: "white",
    description:
      "The resurrection of our Lord Jesus Christ. The Queen of Feasts. Every Sunday of the year is a little Easter; today is Easter itself.",
    collectSource: "BCP, p. 222",
  });
  for (let i = 1; i <= 6; i++) {
    const names = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    m.set(toYmd(addDays(easter, i)), {
      rank: "holy_day",
      name: `${names[i]} in Easter Week`,
      color: "white",
    });
  }

  // ─── Rogation and Ascension ───────────────────────────────
  // Ascension Day — always Thursday, Easter + 39.
  m.set(toYmd(addDays(easter, 39)), {
    rank: "principal_feast",
    name: "Ascension Day",
    color: "white",
    description:
      "Forty days after Easter, Christ ascends to the right hand of the Father. A principal feast of the church year.",
    collectSource: "BCP, p. 226",
  });

  // ─── Pentecost and Trinity ────────────────────────────────
  m.set(toYmd(addDays(easter, 49)), {
    rank: "principal_feast",
    name: "The Day of Pentecost",
    color: "red",
    description:
      "Fifty days after Easter, the gift of the Holy Spirit to the church. The birthday of the church, and the close of the Great Fifty Days.",
    collectSource: "BCP, p. 227",
  });
  m.set(toYmd(addDays(easter, 56)), {
    rank: "principal_feast",
    name: "Trinity Sunday",
    color: "white",
    description:
      "The Sunday after Pentecost, set apart to celebrate the mystery of the Holy Trinity — one God in three Persons.",
    collectSource: "BCP, p. 228",
  });

  movableCache.set(year, m);
  return m;
}
