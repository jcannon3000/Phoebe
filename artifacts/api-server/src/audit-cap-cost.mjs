// RUN WITH THE CLIENT TSCONFIG — visioSelect imports "@/lib/visioSchedule",
// and that alias only resolves against artifacts/mymonastery/tsconfig.json:
//   DATABASE_URL="postgres://x:x@localhost:5/x" \
//     ../../mymonastery/node_modules/.bin/tsx \
//     --tsconfig ../../mymonastery/tsconfig.json <this file>
// (The DATABASE_URL is a dummy — the ordo builder is pure, it just wants the
// env var present at import time.)
// What a 3-per-calendar-year cap would cost: how many day-slots exceed it,
// and how many of those are single-match days where the cap must drop the
// picture to a WORSE-matching reading.
import { buildOfficeOrdoDay } from "./lib/officeOrdo.ts";
import { ACT_CATALOGUE } from "../../mymonastery/src/lib/visioCatalogue.ts";
import { matchScore, chooseArtwork, parseRef } from "../../mymonastery/src/lib/visioSelect.ts";

const norm = (r) => r.replace(/[\[\]]/g, "").replace(/\(([^)]*)\)/g, ", $1").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
const isPs = b => b === "psalm" || b === "psalms", isGos = b => /^(matt|mark|luke|john)/.test(b);
const tiersOf = (refs) => { const g=[],m=[],p=[]; for (const l of refs) { const q=parseRef(l); if(!q)continue; (isGos(q.book)?g:isPs(q.book)?p:m).push(l); } return [g,m,p]; };

for (const year of [2026, 2027]) {
  const start = new Date(Date.UTC(year, 0, 1));
  const days = (year % 4 === 0) ? 366 : 365;
  const uses = new Map();               // artId -> [dates]
  const tierSize = new Map();           // date -> winning tie-set size
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const ymd = d.toISOString().slice(0, 10);
    let day; try { day = buildOfficeOrdoDay(d); } catch { continue; }
    const refs = [...new Set([
      ...day.morning.lessons.map(l => l.ref), ...day.evening.lessons.map(l => l.ref),
      ...(day.morning.psalms ?? []).map(p => `Psalm ${p}`), ...(day.evening.psalms ?? []).map(p => `Psalm ${p}`),
    ].filter(Boolean).map(norm))];
    const c = chooseArtwork(ymd, refs);
    (uses.get(c.art.id) ?? uses.set(c.art.id, []).get(c.art.id)).push(ymd);
    let size = 0;
    for (const t of tiersOf(refs)) {
      const sc = ACT_CATALOGUE.map(a => ({ a, s: matchScore(a.refs, t) })).filter(x => x.s > 0);
      if (!sc.length) continue; const top = Math.max(...sc.map(x => x.s)); if (top < 2) continue;
      size = sc.filter(x => x.s === top).length; break;
    }
    tierSize.set(ymd, size);
  }
  const over = [...uses.entries()].filter(([, ds]) => ds.length > 3);
  const excessDates = over.flatMap(([, ds]) => ds.slice(3));
  const stuck = excessDates.filter(ymd => (tierSize.get(ymd) ?? 0) <= 1);
  console.log(`\n=== ${year} (${days} days) ===`);
  console.log(`distinct artworks used: ${uses.size}`);
  console.log(`artworks over 3 uses:   ${over.length}`);
  console.log(`day-slots above the cap: ${excessDates.length} (${(100*excessDates.length/days).toFixed(1)}% of the year)`);
  console.log(`  …of those, SINGLE-match days (cap must drop a tier): ${stuck.length}`);
  console.log("worst offenders:", over.sort((a,b)=>b[1].length-a[1].length).slice(0,6)
    .map(([id, ds]) => `${(ACT_CATALOGUE.find(a=>a.id===id)?.title ?? id).slice(0,26)}×${ds.length}`).join(" | "));
}
