// Every distinct reading in the two-year Daily Office cycle (MP+EP lessons and
// psalms), with how many days it appears on and how well the current catalogue
// already covers it. Written for scripts/fetch-act-catalogue.mjs's targeted
// harvest phase.
import { writeFileSync } from "fs";
import { buildOfficeOrdoDay } from "./lib/officeOrdo.ts";
import { ACT_CATALOGUE } from "../../mymonastery/src/lib/visioCatalogue.ts";
import { matchScore } from "../../mymonastery/src/lib/visioSelect.ts";

const start = new Date(Date.UTC(2026, 0, 1));
const norm = (r) => r.replace(/[\[\]]/g, "").replace(/\(([^)]*)\)/g, "$1").replace(/\s+/g, " ").trim();
const counts = new Map();
for (let i = 0; i < 730; i++) {
  const d = new Date(start.getTime() + i * 86400000);
  let day; try { day = buildOfficeOrdoDay(d); } catch { continue; }
  const refs = [
    ...day.morning.lessons.map(l => l.ref), ...day.evening.lessons.map(l => l.ref),
    ...(day.morning.psalms ?? []).map(p => `Psalm ${p}`), ...(day.evening.psalms ?? []).map(p => `Psalm ${p}`),
  ].filter(Boolean).map(norm);
  for (const r of new Set(refs)) counts.set(r, (counts.get(r) ?? 0) + 1);
}
const rows = [...counts.entries()].map(([ref, days]) => ({
  ref, days,
  score: Math.max(0, ...ACT_CATALOGUE.map(a => matchScore(a.refs, [ref]))),
})).sort((a, b) => b.days - a.days);
const uncovered = rows.filter(r => r.score < 2);
console.log("distinct readings:", rows.length, "| uncovered (score<2):", uncovered.length,
  "| uncovered day-slots:", uncovered.reduce((s, r) => s + r.days, 0));
writeFileSync("../../../scripts/visio-target-readings.json", JSON.stringify(rows, null, 1));
console.log("wrote scripts/visio-target-readings.json");
