// One SUGGESTED icon per week, resolved ahead of time.
//
// The weekly icon practice offers three doors on the first open of a new week:
// keep last week's icon, choose a new one, or take the one suggested from the
// coming Sunday's readings. This builds that third door for every week of the
// years we have lectionary for.
//
// Resolved at build time, like the Visio schedule and for the same reasons: the
// suggestion must be the SAME for everyone, must not need a network round trip
// inside a practice, and depends on the RCL table which is server-side.
//
// THE WEEK IS MONDAY→SUNDAY, keyed to the Sunday it CLOSES. A Sunday maps to
// itself. Same convention and the same arithmetic as the Visio schedule; a
// different one would expire a stored pick on the wrong day.
//
// Usage: pnpm --filter @workspace/api-server run build:icon-schedule

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { RCL_SUNDAYS } from "./data/rclSundays.ts";
import { ICON_CATALOGUE } from "../../mymonastery/src/lib/iconCatalogue.ts";
import { matchScore, parseRef } from "../../mymonastery/src/lib/visioSelect.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2]
  ?? resolve(__dirname, "../../mymonastery/src/lib/iconSchedule.ts");

/** Stable and shared: every reader gets the same suggestion for a given week. */
function rotationIndex(key, ids) {
  const sig = ids.reduce((a, b) => (a + b) % 9973, 0);
  const n = ids.length;
  const ord = Math.floor(Date.parse(`${key}T00:00:00Z`) / 86_400_000) || 0;
  return (((ord + sig) % n) + n) % n;
}
const pick = (key, arts) =>
  arts.length ? arts[rotationIndex(key, arts.map((a) => a.id))] : null;

const SEASON_OF = {
  adv: "advent", christ: "christmas", christmas: "christmas", epi: "epiphany",
  lent: "lent", easter: "easter", prop: "proper", pent: "pentecost",
  ascension: "ascension", trinity: "trinity", allsaints: "all saints",
};

/**
 * Does an icon's liturgical-day tag name the Sunday this week closes on?
 *
 * ACT tags icons with days — "Year A Advent 4th Sunday", "Year B Proper 17th
 * Sunday". That is a stronger signal than chapter and verse, because it is the
 * day the work was CATALOGUED as belonging to: it carries the theme even when
 * the artwork depicts a scene from another book. The owner asked for exactly
 * that — "look for the theme of the image, it might be in another place".
 *
 * The Sunday's own identity comes from its lectionarypage URL, whose filename
 * encodes it: YearB_RCL/Advent/BAdv4_RCL → Year B, Advent, 4.
 *
 * SEASON AND NUMBER MUST BOTH AGREE. An earlier version checked the number and
 * only bothered with the season for Propers, so Advent 1 matched "Christmas 1st
 * Sunday", Advent 3 matched "Epiphany 3rd Sunday" and Advent 4 matched "Easter
 * 4th Sunday" — the right ordinal in the wrong season, which is worse than no
 * match because it looks deliberate. Found by printing which tag matched rather
 * than trusting the count.
 */
function dayTagMatches(tags, sundayUrl) {
  const m = /Year([ABC])_RCL\/[A-Za-z]+\/[ABC]([A-Za-z]+?)(\d+)?_RCL/.exec(sundayUrl || "");
  if (!m) return false;
  const [, year, dayWord, num] = m;
  const season = SEASON_OF[dayWord.toLowerCase()];
  if (!season) return false;                       // a principal feast we can't name
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (const t of tags) {
    const tag = norm(t);
    if (!tag.startsWith(`year ${year.toLowerCase()}`)) continue;
    if (!tag.includes(season)) continue;
    if (num) { if (new RegExp(`\\b${num}(st|nd|rd|th)?\\b`).test(tag)) return true; }
    else return true;
  }
  return false;
}

const rows = [];
const stats = { weeks: 0, day: 0, gospel: 0, nt: 0, subject: 0, book: 0, any: 0 };
const pool = ICON_CATALOGUE;

/**
 * EVERY SUNDAY IN THE RANGE, not every Sunday the RCL table happens to hold.
 *
 * This iterated RCL_SUNDAYS directly, and that table has holes: it jumps from
 * 2026-12-20 to 2027-01-10, so the two weeks of Christmas had no entry at all
 * and `suggestedForWeek` returned null. The icon practice's first-open-of-the-
 * week screen offers three doors — last week's, a new one, and one suggested
 * from Sunday's readings — and on those Mondays it silently offered two. The
 * same silence began permanently after the table's last row.
 *
 * The fallback pass at the end of the loop ("just recommend something") was
 * written for exactly these weeks and could never run, because the loop never
 * reached them. Walking the calendar instead means a missing lectionary row
 * costs the *reason* for the suggestion, not the suggestion.
 */
const SUNDAYS = (() => {
  const keys = Object.keys(RCL_SUNDAYS).sort();
  if (keys.length === 0) return [];
  const out = [];
  const d = new Date(`${keys[0]}T12:00:00`);
  const last = new Date(`${keys[keys.length - 1]}T12:00:00`);
  while (d <= last) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 7);
  }
  return out;
})();

for (const sunday of SUNDAYS) {
  // No lectionary row for this Sunday: still pick, just without a reading to
  // reason from. `how` falls through to "any" and suggestionReason stays
  // silent rather than claiming a connection that isn't there.
  const reading = RCL_SUNDAYS[sunday] ?? { gospel: null, nt: [], url: "" };
  stats.weeks++;
  const gospel = reading.gospel ? [reading.gospel] : [];
  const nt = reading.nt ?? [];
  let chosen = null, how = null;

  // 1. The liturgical DAY — the theme, however the artwork tells it.
  const byDay = pool.filter((a) => dayTagMatches(a.days ?? [], reading.url));
  if (byDay.length) { chosen = pick(sunday, byDay); how = "day"; }

  // 2. The gospel, at chapter level or better.
  if (!chosen && gospel.length) {
    const best = pool.filter((a) => matchScore(a.refs ?? [], gospel) >= 2);
    if (best.length) { chosen = pick(sunday, best); how = "gospel"; }
  }
  // 3. Any other New Testament reading.
  if (!chosen && nt.length) {
    const best = pool.filter((a) => matchScore(a.refs ?? [], nt) >= 2);
    if (best.length) { chosen = pick(sunday, best); how = "nt"; }
  }
  // 4. SUBJECT overlap — the theme by another route, for a Sunday whose
  //    passage nothing depicts but whose subject plenty do.
  if (!chosen) {
    const words = new Set(
      [...gospel, ...nt].flatMap((r) => {
        const p = parseRef(r);
        return p ? [p.book] : [];
      }),
    );
    const best = pool.filter((a) =>
      (a.subjects ?? []).some((s) => [...words].some((w) => s.toLowerCase().includes(w))));
    if (best.length) { chosen = pick(sunday, best); how = "subject"; }
  }
  // 5. Same book at least.
  if (!chosen) {
    const best = pool.filter((a) => matchScore(a.refs ?? [], [...gospel, ...nt]) >= 1);
    if (best.length) { chosen = pick(sunday, best); how = "book"; }
  }
  // 6. Anything — the owner's own instruction where nothing lines up: "just
  //    recommend whatever … or just recommend anything". A suggestion the
  //    reader can decline beats an empty third door.
  if (!chosen) { chosen = pick(sunday, pool); how = "any"; }

  if (!chosen) continue;
  stats[how]++;
  const ref = (chosen.refs ?? []).find((r) => matchScore([r], [...gospel, ...nt]) >= 2) ?? null;
  rows.push([sunday, { id: chosen.id, how, ref }]);
}

const body = rows
  .map(([s, v]) => `  "${s}": { id: ${v.id}, how: ${JSON.stringify(v.how)}, ref: ${JSON.stringify(v.ref)} },`)
  .join("\n");

writeFileSync(OUT, `// GENERATED by api-server/src/build-icon-week-schedule.mjs — do not edit.
//
// The SUGGESTED icon for each week, keyed by the Sunday the week CLOSES on
// (Monday→Sunday; a Sunday maps to itself — the same convention as the Visio
// schedule, and the same arithmetic, so a stored pick expires on the right day).
//
// \`how\` records why this icon was suggested, so the practice can say so
// honestly: "day" is ACT's own liturgical-day tag, "gospel"/"nt" a passage
// match, "subject" a theme match, "book" the same book, "any" a suggestion made
// where nothing lined up.

export type IconWeekPick = { id: number; how: "day" | "gospel" | "nt" | "subject" | "book" | "any"; ref: string | null };

export const ICON_WEEK_SCHEDULE: Record<string, IconWeekPick> = {
${body}
};
`);

process.stderr.write(`[icon-schedule] ${rows.length} weeks → ${OUT}\n`);
process.stderr.write(`[icon-schedule] ${JSON.stringify(stats)}\n`);
