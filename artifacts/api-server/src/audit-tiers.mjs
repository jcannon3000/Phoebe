// Which TIER the day's picture comes from, and at what closeness.
import { buildOfficeOrdoDay } from "./lib/officeOrdo.ts";
import { ACT_CATALOGUE } from "../../mymonastery/src/lib/visioCatalogue.ts";
import { matchScore, chooseArtwork, parseRef } from "../../mymonastery/src/lib/visioSelect.ts";

const start = new Date(Date.UTC(2026, 0, 1));
const norm = (r) => r.replace(/[\[\]]/g, "").replace(/\(([^)]*)\)/g, ", $1").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
const isPs = (b) => b === "psalm" || b === "psalms";
const isGos = (b) => /^(matt|mark|luke|john)/.test(b);

const tally = { gospel: 0, middle: 0, psalm: 0, book: 0, rotation: 0 };
const closeness = { 3: 0, 2: 0, 1: 0, 0: 0 };
let prev = null, repeats = 0;
for (let i = 0; i < 730; i++) {
  const d = new Date(start.getTime() + i * 86400000);
  const ymd = d.toISOString().slice(0, 10);
  let day; try { day = buildOfficeOrdoDay(d); } catch { continue; }
  const refs = [...new Set([
    ...day.morning.lessons.map(l => l.ref), ...day.evening.lessons.map(l => l.ref),
    ...(day.morning.psalms ?? []).map(p => `Psalm ${p}`), ...(day.evening.psalms ?? []).map(p => `Psalm ${p}`),
  ].filter(Boolean).map(norm))];
  const c = chooseArtwork(ymd, refs);
  const sc = Math.max(0, ...refs.map(r => matchScore(c.art.refs, [r])));
  closeness[sc]++;
  if (!c.followsToday) { sc >= 1 ? tally.book++ : tally.rotation++; }
  else {
    // which tier did the winning ref come from?
    const p = parseRef(c.ref);
    const b = p?.book ?? "";
    tally[isGos(b) ? "gospel" : isPs(b) ? "psalm" : "middle"]++;
  }
  if (prev === c.art.id) repeats++;
  prev = c.art.id;
}
const pct = n => (100*n/730).toFixed(1)+"%";
console.log("SOURCE of the day's picture:");
console.log("  Gospel      ", pct(tally.gospel));
console.log("  Epistle/OT  ", pct(tally.middle));
console.log("  Psalm       ", pct(tally.psalm));
console.log("  book-level  ", pct(tally.book), "(not labelled 'today's reading')");
console.log("  rotation    ", pct(tally.rotation));
console.log("\nCLOSENESS to some appointed reading: verses", pct(closeness[3]), "chapter", pct(closeness[2]), "book", pct(closeness[1]), "none", pct(closeness[0]));
console.log("consecutive-day repeats:", repeats);
