// Does every antiphon the client ships still match the server's seeded text?
import { readFileSync } from "node:fs";
const R = "/Users/jeremycannon/Documents/Eleanor/Eleanor/artifacts/";
const { default: _ } = { default: null };
const client = await import(R + "mymonastery/src/lib/antiphons.ts");
const seed = readFileSync(R + "api-server/src/seeds/bcpTexts.ts", "utf8");

const serverText = (key) => {
  const i = seed.indexOf(`textKey: "${key}"`);
  if (i < 0) return null;
  const seg = seed.slice(i, i + 900);
  const m = seg.match(/content:\s*\n?\s*"(.*?)",\n/s);
  return m ? m[1] : null;
};
// season → the server key liturgicalCalendar would choose
const MAP = {
  advent: "antiphon_advent", christmas: "antiphon_christmas", epiphany: "antiphon_epiphany",
  lent: "antiphon_lent", holy_week: "antiphon_holyweek", easter: "antiphon_easter",
  pentecost: "antiphon_anytime", ordinary: "antiphon_anytime",
};
// A representative date inside each season, so we exercise antiphonForDay itself.
const DATES = {
  advent: [2026,11,6], christmas: [2026,11,27], epiphany: [2027,0,17], lent: [2027,2,14],
  holy_week: [2027,2,25], easter: [2027,3,4], pentecost: [2026,8,8], ordinary: [2026,8,8],
};
let bad = 0;
for (const [season, key] of Object.entries(MAP)) {
  const [y,m,d] = DATES[season];
  const got = client.antiphonForDay(new Date(y,m,d), "morning").text;
  const want = serverText(key);
  const ok = want && got === want;
  if (!ok) { bad++; console.log(`  ✗ ${season}\n      client: ${got}\n      server: ${want}`); }
  else console.log(`  ✓ ${season.padEnd(11)} matches ${key}`);
}
// Compline's, against assembleCompline
const compline = readFileSync(R + "api-server/src/lib/assembleCompline.ts", "utf8");
const cm = compline.match(/COMPLINE_ANTIPHON_STANDARD\s*=\s*\n?\s*"(.*?)";/s);
const cOk = cm && client.COMPLINE_ANTIPHON.text === cm[1];
if (!cOk) { bad++; console.log(`  ✗ compline\n      client: ${client.COMPLINE_ANTIPHON.text}\n      server: ${cm && cm[1]}`); }
else console.log("  ✓ compline    matches assembleCompline");
console.log(bad === 0 ? "\n✓ the sit and the office open with the same words" : `\n${bad} DRIFTED`);
