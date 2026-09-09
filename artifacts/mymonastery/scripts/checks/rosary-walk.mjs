import { R } from "./_env.mjs";
const { buildRomanBeats, buildAnglicanBeats } = await import(R + "rosaryBeats.ts");
const S = await import(R + "rosary.ts");
let fail = 0; const bad = m => { console.log("   ✗ " + m); fail++; };
for (const set of Object.keys(S.MYSTERY_SETS)) {
  const b = buildRomanBeats(set);
  b.forEach((x, i) => { if (!["closing","mystery","circle"].includes(x.kind) && !x.eyebrow?.trim()) bad(`${set} beat ${i+1} has no direction`); });
  const hail = b.filter(x => x.kind === "repeat").reduce((n, x) => n + x.times, 0);
  if (hail !== 53) bad(`${set}: ${hail} Hail Marys, received form is 53`);
  if (b.filter(x => x.kind === "prayer" && x.title === "Our Father").length !== 6) bad(`${set}: not 6 Our Fathers`);
  if (b.filter(x => x.kind === "prayer" && x.title === "Glory be").length !== 6) bad(`${set}: not 6 Glory Bes`);
  if (b.filter(x => x.kind === "mystery").length !== 5 || b.filter(x => x.kind === "versicle").length !== 1 || b.at(-1).kind !== "closing") bad(`${set}: shape wrong`);
}
const o = buildRomanBeats("joyful").map(b => b.kind === "mystery" ? "MYSTERY" : b.kind === "repeat" ? `${b.times}×${b.title}` : b.kind === "versicle" ? "V/R" : b.kind === "closing" ? "end" : b.title);
if (o.slice(0,6).join("|") !== "The Sign of the Cross|The Apostles' Creed|Our Father|3×Hail Mary|Glory be|MYSTERY") bad("opening order: " + o.slice(0,6).join(" → "));
if (o.slice(5,10).join("|") !== "MYSTERY|Our Father|10×Hail Mary|Glory be|O my Jesus") bad("decade order: " + o.slice(5,10).join(" → "));
if (o.slice(-5).join("|") !== "Hail, holy Queen|V/R|The Concluding Prayer|The Sign of the Cross|end") bad("closing order: " + o.slice(-5).join(" → "));
for (const k of Object.keys(S.ANGLICAN_SETS)) {
  const b = buildAnglicanBeats(k);
  b.forEach((x, i) => { if (!["closing","circle"].includes(x.kind) && !x.eyebrow?.trim()) bad(`${k} beat ${i+1} has no direction`); });
  const start = b.findIndex(x => x.kind === "prayer" && /invitatory/i.test(x.eyebrow)) + 1;
  let step = 1, circle = 1, said = 0, guard = 0;
  while (step <= b.length && guard++ < 500) { const x = b[step-1]; if (x.kind === "closing") break;
    if (x.kind === "circle") { if (circle < S.ANGLICAN_CIRCLES) { circle++; step = start; continue; } step++; continue; }
    if (!/on the cross/i.test(x.eyebrow)) said += x.kind === "repeat" ? x.times : 1; step++; }
  if (said !== 100) bad(`${k}: ${said} bead-prayers over three circuits, received form is 100`);
  if (circle !== 3 || b[step-1]?.kind !== "closing") bad(`${k}: loop did not end on closing after 3 circuits`);
}
const DAYS = { 0:"glorious",1:"joyful",2:"sorrowful",3:"glorious",4:"luminous",5:"sorrowful",6:"joyful" };
for (let d = 0; d < 7; d++) { const got = S.mysterySetForDay(new Date(2026, 8, 6 + d)); if (got !== DAYS[d]) bad(`weekday ${d}: ${got} ≠ ${DAYS[d]}`); }
console.log(fail ? `✗ rosary-walk: ${fail} departures` : "✓ rosary-walk: structure, counts, order, days, 100 Anglican beads");
process.exit(fail ? 1 : 0);
