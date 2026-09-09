import { R } from "./_env.mjs";
const S = await import(R + "rosary.ts"); const { artworkById } = await import(R + "visioSelect.ts");
let fail = 0; const bad = m => { console.log("   ✗ " + m); fail++; };
const artistOf = id => artworkById(id)?.artist ?? null, short = a => (a || "(anon)").split(",")[0];
for (const set of Object.values(S.MYSTERY_SETS)) for (const m of set.mysteries) {
  if (!m.artIds?.length) { bad(`${m.title}: no pictures`); continue; }
  const seen = new Set();
  for (let i = 0; i < 400; i++) { const d = new Date(2026, 8, 7 + i); if (set.dayNumbers.includes(d.getDay()) && S.mysterySetForDay(d) === set.key) seen.add(S.artIdForDay(set, m, d)); }
  const missed = m.artIds.filter(a => !seen.has(a)); if (missed.length) bad(`${m.title}: never shown ${missed}`);
  for (const id of m.artIds) if (!artworkById(id)?.img) bad(`${m.title}: ${id} not in catalogue`);
}
for (const v of Object.values(S.ANGLICAN_SETS)) for (const id of v.artIds ?? []) if (!artworkById(id)?.img) bad(`${v.name}: ${id} not in catalogue`);
let worst = 0, mafaHeavy = 0;
for (let i = 0; i < 365; i++) { const d = new Date(2026, 8, 8 + i); const set = S.MYSTERY_SETS[S.mysterySetForDay(d)];
  const per = new Map(); for (const id of S.artIdsForDay(set, artistOf, d)) if (id) { const n = short(artistOf(id)); per.set(n, (per.get(n) || 0) + 1); }
  worst = Math.max(worst, ...per.values()); if ((per.get("JESUS MAFA") || 0) >= 3) mafaHeavy++; }
if (worst > 2) bad(`a session showed one artist ${worst} of 5 times`); if (mafaHeavy) bad(`${mafaHeavy} sessions were 3+ Mafa`);
console.log(fail ? `✗ rosary-pictures: ${fail}` : "✓ rosary-pictures: every picture reachable, resolvable, ≤2 of one hand per session");
process.exit(fail ? 1 : 0);
