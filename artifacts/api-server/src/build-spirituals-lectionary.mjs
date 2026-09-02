// One spiritual for every day of the year, resolved ahead of time.
//
// Owner: "start by creating a lectionary where it would have one for each day
// … but you could choose a different one if you chose."
//
// Resolved at build time for the same reasons as the Visio and icon
// schedules: the day's song must be the SAME for everyone, must not need a
// network round trip inside a practice, and depends on the lectionary table,
// which is server-side.
//
// THE SEASON COMES FROM THE SUNDAY BEFORE, NOT THE SUNDAY AFTER. This is a
// deliberate departure from build-icon-week-schedule.mjs and
// build-visio-week-schedule.mjs, which key a week to the Sunday it CLOSES on
// (Monday→Sunday) so a stored weekly pick expires on the right day. That is
// the right rule for a WEEKLY pick and the wrong one for a daily reading: a
// weekday belongs to the season of the Sunday it follows. Keyed forward,
// Monday of Holy Week would be Easter and Holy Saturday would be Easter Day.
// Do not "correct" this to match the other two builders.
//
// HOW A SONG IS CHOSEN. Most of these songs are not about a season; they are
// about crossing over, and they would fit any week of the year. So the
// lectionary does not pretend to a match it cannot make:
//
//   "season"    the song carries an unmistakable marker for the season being
//               kept — the crucifixion in Holy Week, the rising in Eastertide,
//               the nativity at Christmas. Only strong markers count.
//   "rotation"  every other day. The songs cycle in a fixed, seeded order and
//               the whole cycle is exhausted before any song comes round
//               again, so a reader meets the collection rather than a
//               favourite handful.
//
// Secular songs (the Louisiana Creole set and the work songs) are never
// appointed; they stay in the library but not in the practice.
//
// Usage: pnpm --filter @workspace/api-server run build:spirituals-lectionary

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { RCL_SUNDAYS } from "./data/rclSundays.ts";
import { SPIRITUALS } from "../../mymonastery/src/lib/spiritualsCatalogue.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2]
  ?? resolve(__dirname, "../../mymonastery/src/lib/spiritualsLectionary.ts");

/** How many days must pass before a song may be appointed again. */
const COOLDOWN = 30;

const SEASON_OF = {
  advent: "Advent", christmas: "Christmas", epiphany: "Epiphany", lent: "Lent",
  holywk: "Holy Week", holyweek: "Holy Week", easter: "Easter",
  pentecost: "Pentecost", holydays: "Holy Days", trinity: "Pentecost",
};

/**
 * Strong seasonal markers only.
 *
 * A word list this short is on purpose. Nearly every song in the book mentions
 * heaven, Jordan or an angel; matching on those would appoint "by the season"
 * every day of the year and mean nothing. These are the images that belong to
 * one season and no other.
 */
const MARKERS = {
  "Holy Week": [
    /\bcrucif/i, /\bcalvary\b/i, /\bcross\b/i, /\bnail(ed|s)?\b/i,
    /\bcrown of thorns\b/i, /\bpilate\b/i, /\bblood\b.*\b(save|stream|run)/i,
    /\bhammer/i, /\bwounded\b/i, /\bgethsemane\b/i,
  ],
  Lent: [
    /\bwilderness\b/i, /\bforty\b/i, /\btempt/i, /\bfast(ing)?\b/i,
    /\brepent/i, /\bmourn/i, /\bpray(ing)? all night\b/i, /\bhumble\b/i,
  ],
  Easter: [
    /\brise[ns]?\b.*\b(again|from de dead|grave)/i, /\brisen\b/i,
    /\bresurrection\b/i, /\bempty (tomb|grave)\b/i,
    /\bhe is not here\b/i, /\bvictory\b/i, /\bconquer/i,
  ],
  Christmas: [
    /\bbethlehem\b/i, /\bmanger\b/i, /\bborn\b.*\b(king|jesus|christ|savior|saviour)/i,
    /\bmary.*\bbaby\b/i, /\bchris'?mus\b/i, /\bchristmas\b/i, /\bnew.?born\b/i,
  ],
  Advent: [
    /\bgabriel\b/i, /\btrumpet\b/i, /\bjudgment day\b/i, /\bde day of judg/i,
    /\bwatch\b.*\bcome\b/i, /\bmorning star\b/i, /\bwhen de bridegroom\b/i,
  ],
  Pentecost: [
    /\bholy (ghost|spirit)\b/i, /\btongue[s]? of fire\b/i, /\bpentecost\b/i,
  ],
};

const dateKey = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

/** The season of the Sunday this day FOLLOWS. See the header. */
function seasonFor(key, sundays) {
  let best = null;
  for (const s of sundays) if (s.key <= key && (!best || s.key > best.key)) best = s;
  if (!best) return null;
  const m = /Year[ABC]_RCL\/([A-Za-z]+)\//.exec(best.url || "");
  const season = m ? SEASON_OF[m[1].toLowerCase()] ?? null : null;
  return season ? { season, sunday: best.key } : null;
}

/** Every text a marker could match: the sung lines and the title. */
const textOf = (s) => [s.title, ...s.stanzas.flatMap((st) => st.lines)].join("\n");

function markedSeasons(song) {
  const text = textOf(song);
  const out = [];
  for (const [season, pats] of Object.entries(MARKERS)) {
    if (pats.some((p) => p.test(text))) out.push(season);
  }
  return out;
}

/** A fixed, seeded order — shared by everyone, stable across rebuilds. */
function seededOrder(songs) {
  const score = (s) => {
    let h = 2166136261 ^ s.number;
    for (const c of s.title) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  return songs.slice().sort((a, b) => score(a) - score(b) || a.number - b.number);
}

function main() {
  const sundays = Object.entries(RCL_SUNDAYS).map(([key, v]) => ({ key, url: v.url }));
  sundays.sort((a, b) => a.key.localeCompare(b.key));
  if (!sundays.length) throw new Error("no RCL sundays — cannot date the seasons");

  // Cover the whole calendar years the lectionary spans.
  const firstYear = +sundays[0].key.slice(0, 4);
  const lastYear = +sundays[sundays.length - 1].key.slice(0, 4);
  const start = new Date(Date.UTC(firstYear, 0, 1));
  const end = new Date(Date.UTC(lastYear, 11, 31));

  const pool = SPIRITUALS.filter((s) => s.sacred);
  const seasonsBySong = new Map(pool.map((s) => [s.number, markedSeasons(s)]));
  const rotation = seededOrder(pool);

  const lastUsed = new Map();          // song number -> day index
  let cursor = 0;                      // position in the rotation
  const out = {};
  const counts = new Map();
  const howCounts = { season: 0, rotation: 0 };

  let day = 0;
  for (let d = start; d <= end; d = addDays(d, 1), day++) {
    const key = dateKey(d);
    const info = seasonFor(key, sundays);
    const season = info?.season ?? null;

    let chosen = null;
    let how = "rotation";

    if (season) {
      const fits = rotation.filter(
        (s) => seasonsBySong.get(s.number)?.includes(season)
          && day - (lastUsed.get(s.number) ?? -Infinity) >= COOLDOWN,
      );
      if (fits.length) {
        // Least recently appointed of the songs that fit, so a season's few
        // songs take turns rather than one of them owning the season.
        fits.sort((a, b) =>
          (lastUsed.get(a.number) ?? -1) - (lastUsed.get(b.number) ?? -1) || a.number - b.number);
        chosen = fits[0];
        how = "season";
      }
    }

    if (!chosen) {
      // Walk the cycle to the next song off cooldown; if every song is on
      // cooldown the cycle has come round, so take the next one regardless.
      for (let i = 0; i < rotation.length; i++) {
        const cand = rotation[(cursor + i) % rotation.length];
        if (day - (lastUsed.get(cand.number) ?? -Infinity) >= COOLDOWN) {
          chosen = cand;
          cursor = (cursor + i + 1) % rotation.length;
          break;
        }
      }
      if (!chosen) {
        chosen = rotation[cursor % rotation.length];
        cursor = (cursor + 1) % rotation.length;
      }
    }

    lastUsed.set(chosen.number, day);
    counts.set(chosen.number, (counts.get(chosen.number) ?? 0) + 1);
    howCounts[how]++;
    out[key] = { number: chosen.number, how, season };
  }

  const rows = Object.entries(out)
    .map(([k, v]) => `  "${k}": { number: ${v.number}, how: "${v.how}", season: ${v.season ? `"${v.season}"` : "null"} },`)
    .join("\n");

  const body = `// GENERATED by api-server/src/build-spirituals-lectionary.mjs — do not edit.
//
// The spiritual appointed for each day, from Slave Songs of the United States
// (1867). \`how\` records why, so the practice can say so honestly:
// "season" means the song carries an unmistakable marker for the season being
// kept; "rotation" means it came up in the cycle, which is most days and is
// not a lesser reason — most of these songs belong to no one season.
//
// \`season\` is the season of the Sunday the day FOLLOWS. Only the sacred songs
// are ever appointed; the Creole and work songs stay in the library.

export type SpiritualPick = {
  /** The song's number in the book. */
  number: number;
  how: "season" | "rotation";
  season: string | null;
};

export const SPIRITUALS_LECTIONARY: Record<string, SpiritualPick> = {
${rows}
};

/** The day's appointed spiritual, or null outside the years we have. */
export function spiritualForDate(key: string): SpiritualPick | null {
  return SPIRITUALS_LECTIONARY[key] ?? null;
}
`;

  writeFileSync(OUT, body, "utf8");

  const days = Object.keys(out).length;
  const used = counts.size;
  const times = [...counts.values()];
  process.stdout.write(
    `wrote ${OUT}\n` +
    `  days         ${days} (${dateKey(start)} … ${dateKey(end)})\n` +
    `  songs in use ${used} of ${pool.length} sacred\n` +
    `  appointed     season ${howCounts.season} · rotation ${howCounts.rotation}\n` +
    `  per song     min ${Math.min(...times)}, max ${Math.max(...times)}\n`,
  );
  const never = pool.filter((s) => !counts.has(s.number));
  if (never.length) process.stdout.write(`  NEVER used   ${never.map((s) => s.number).join(", ")}\n`);
}

main();
