// RUN WITH THE CLIENT TSCONFIG — visioSelect imports "@/lib/visioSchedule",
// and that alias only resolves against artifacts/mymonastery/tsconfig.json:
//   DATABASE_URL="postgres://x:x@localhost:5/x" \
//     ../../mymonastery/node_modules/.bin/tsx \
//     --tsconfig ../../mymonastery/tsconfig.json <this file>
// (The DATABASE_URL is a dummy — the ordo builder is pure, it just wants the
// env var present at import time.)
// The days whose artwork does NOT verse-match: what was appointed, and what
// the best achievable score was for EACH reading on that day.
import { buildOfficeOrdoDay } from "./lib/officeOrdo.ts";
import { ACT_CATALOGUE } from "../../mymonastery/src/lib/visioCatalogue.ts";
import { matchScore, chooseArtwork } from "../../mymonastery/src/lib/visioSelect.ts";

const start = new Date(Date.UTC(2026, 0, 1));
const norm = (r) => r.replace(/[\[\]]/g, "").replace(/\(([^)]*)\)/g, ", $1").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
const bestFor = (ref) => Math.max(0, ...ACT_CATALOGUE.map(a => matchScore(a.refs, [ref])));

let weak = 0;
const lines = [];
for (let i = 0; i < 730; i++) {
  const d = new Date(start.getTime() + i * 86400000);
  const ymd = d.toISOString().slice(0, 10);
  let day; try { day = buildOfficeOrdoDay(d); } catch { continue; }
  const refs = [...new Set([
    ...day.morning.lessons.map(l => l.ref), ...day.evening.lessons.map(l => l.ref),
    ...(day.morning.psalms ?? []).map(p => `Psalm ${p}`), ...(day.evening.psalms ?? []).map(p => `Psalm ${p}`),
  ].filter(Boolean).map(norm))];
  const chosen = chooseArtwork(ymd, refs);
  const top = Math.max(0, ...refs.map(bestFor));
  if (top >= 3) continue;
  weak++;
  if (lines.length < 25) {
    lines.push(`${ymd}  top=${top}  chose="${chosen.art.title.slice(0,34)}" ref=${chosen.ref}`);
    lines.push("      " + refs.map(r => `${r}[${bestFor(r)}]`).join("  "));
  }
}
console.log(`days without a verse-level match: ${weak} / 730 (${(100*weak/730).toFixed(1)}%)\n`);
console.log(lines.join("\n"));
