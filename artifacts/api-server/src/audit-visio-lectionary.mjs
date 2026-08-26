// Audit: how often does the Visio artwork actually connect to the day's lectionary?
import { buildOfficeOrdoDay } from "./lib/officeOrdo.ts";
import { ACT_CATALOGUE } from "../../mymonastery/src/lib/visioCatalogue.ts";
import { matchScore, chooseArtwork } from "../../mymonastery/src/lib/visioSelect.ts";

const start = new Date(Date.UTC(2026, 0, 1));
const DAYS = 730; // full two-year cycle
const psRef = (p) => `Psalm ${p}`;

let stats = { cur: [0,0,0,0], all: [0,0,0,0] };
const uncovered = new Map(); // reading -> count of days it appears while day uncovered
const repeatCheck = new Map(); // ymd->artId for consecutive-day repeats under ALL
let prevArt = null, repeats = 0;

for (let i = 0; i < DAYS; i++) {
  const d = new Date(start.getTime() + i * 86400000);
  const ymd = d.toISOString().slice(0, 10);
  let day;
  try { day = buildOfficeOrdoDay(d); } catch (e) { console.error("ordo fail", ymd, e.message); continue; }
  const mp = day.morning, ep = day.evening;
  const cur = mp.lessons.map(l => l.ref).filter(Boolean);
  const all = [
    ...mp.lessons.map(l => l.ref), ...ep.lessons.map(l => l.ref),
    ...(mp.psalms ?? []).map(psRef), ...(ep.psalms ?? []).map(psRef),
  ].filter(Boolean);
  const scoreOf = (lessons) => Math.max(0, ...ACT_CATALOGUE.map(a => matchScore(a.refs, lessons)));
  const sc = scoreOf(cur), sa = scoreOf(all);
  stats.cur[sc]++; stats.all[sa]++;
  if (sa < 2) for (const r of all) uncovered.set(r, (uncovered.get(r) ?? 0) + 1);
  const chosen = chooseArtwork(ymd, all);
  if (prevArt !== null && chosen.art.id === prevArt) repeats++;
  prevArt = chosen.art.id;
}
const pct = (n) => (100 * n / DAYS).toFixed(1) + "%";
console.log("=== 730 days, 2026-2027 (full 2-year cycle) ===");
console.log("score: 0=none 1=book 2=chapter 3=verses");
console.log("CURRENT (MP lessons only):   ", stats.cur.map(pct).join("  "));
console.log("PROPOSED (MP+EP+psalms):     ", stats.all.map(pct).join("  "));
console.log("consecutive-day same artwork (proposed):", repeats);
console.log("\n=== readings appearing on connected-less days (top 40 by day-count) ===");
[...uncovered.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
  .forEach(([r, c]) => console.log(String(c).padStart(4), r));
