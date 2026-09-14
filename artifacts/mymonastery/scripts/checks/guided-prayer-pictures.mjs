import { R } from "./_env.mjs";
const G = await import(R + "guidedPrayerArt.ts"); const { artworkById } = await import(R + "visioSelect.ts");
let fail = 0; const bad = m => { console.log("   ✗ " + m); fail++; };
const NAME = { 1: "Praise", 2: "Confession", 3: "Thanksgiving", 4: "Supplication" };
const hand = id => (artworkById(id)?.artist ?? "").trim().toLowerCase();
const dayN = i => new Date(2026, 8, 14 + i);
const home = new Map();
for (const [n, list] of Object.entries(G.GUIDED_PRAYER_ART)) {
  if (list.length < 2) bad(`${NAME[n]}: fewer than two pictures`);
  list.forEach(({ id, ratio }, i) => {
    if (!artworkById(id)?.img) bad(`${NAME[n]}: ${id} not in the catalogue`);
    if (!(ratio >= 3 / 5 && ratio <= 16 / 9)) bad(`${NAME[n]}: ${id} measures ${ratio}, outside 3:5–16:9`);
    if (home.has(id)) bad(`${id} is in both ${home.get(id)} and ${NAME[n]}`); home.set(id, NAME[n]);
    const next = list[(i + 1) % list.length].id; if (hand(id) && hand(id) === hand(next)) bad(`${NAME[n]}: ${id} and ${next} are neighbours by one hand`);
  });
}
// Every picture reaches a morning-only AND an evening-only person; four pictures, four hands, every sitting.
for (const side of ["morning", "evening"]) {
  const seen = new Set(); let blanks = 0, repeats = 0;
  for (let i = 0; i < 366; i++) {
    const ids = G.guidedPrayerArtIds(side, artworkById, dayN(i));
    for (const id of ids) id ? seen.add(id) : blanks++;
    const hands = ids.filter(Boolean).map(hand).filter(Boolean); if (new Set(hands).size < hands.length) repeats++;
  }
  for (const [id, name] of home) if (!seen.has(id)) bad(`${side}-only: ${name} ${id} is never shown`);
  if (blanks) bad(`${side}: ${blanks} movements went without a picture`); if (repeats) bad(`${side}: ${repeats} sittings showed one hand twice`);
}
let sameDay = 0;
for (let i = 0; i < 366; i++) { const m = G.guidedPrayerArtIds("morning", artworkById, dayN(i)), e = G.guidedPrayerArtIds("evening", artworkById, dayN(i)); if (m.some(id => id && e.includes(id))) sameDay++; }
if (sameDay) bad(`${sameDay} days showed one picture morning AND evening`);
// A work deleted at /admin/art-library is never chosen, and never leaves its movement without a picture.
for (const [id, name] of home) {
  const artOf = x => (x === id ? null : artworkById(x));
  for (let i = 0; i < 30; i++) { const ids = G.guidedPrayerArtIds("morning", artOf, dayN(i));
    if (ids.includes(id)) { bad(`deleted ${name} ${id} was still chosen`); break; }
    if (ids.includes(null)) { bad(`deleting ${name} ${id} left a movement without a picture`); break; } }
}
console.log(fail ? `✗ guided-prayer-pictures: ${fail}` : `✓ guided-prayer-pictures: ${home.size} pictures resolvable and inside 3:5–16:9, each reaching a morning-only and an evening-only person, four hands a sitting, mornings and evenings apart, a deletion never blanks a movement`);
process.exit(fail ? 1 : 0);
