#!/usr/bin/env -S npx tsx
/**
 * Generates src/lib/saintsByDay.generated.ts — (month-day) → the name to put
 * in "Happy Feast of ___".
 *
 * WHY GENERATED. The calendar of lives lives in the CLIENT
 * (mymonastery/src/lib/liturgical: 33 BCP Holy Days + 243 Lesser Feasts), and
 * the server's own liturgicalCalendar.ts only knows the 21 observed holy days
 * — not the commemorations, which is most of what the Hagiographies practice
 * reads. The server can't import client TS at runtime (rootDir: src), so this
 * follows the pattern build-icon-week-schedule.mjs already set: read the
 * client's data at build time, emit a plain table the server imports.
 *
 * REGENERATE after any change to fixed-feasts.ts or lesser-feasts.ts:
 *   cd artifacts/api-server && npx tsx src/build-saints-by-day.mjs
 *
 * THE NAME IS TRIMMED OF ITS OFFICE. LFF entries read "Elizabeth Seton,
 * Vowed Religious and Educator" — the office belongs on a calendar line, not
 * in "Happy Feast of ___". Cutting at the first comma would be wrong for the
 * entries that name more than one person ("Sarah, Theodora, and Syncletica of
 * Egypt, Desert Mothers" → "Sarah"), so instead each comma-separated segment
 * is kept until one reads as an OFFICE rather than a name. The output is a
 * flat readable table on purpose: anything this gets wrong can be corrected
 * by hand in the override list below rather than by sharpening the rule.
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HOLY_DAYS } from "../../mymonastery/src/lib/liturgical/fixed-feasts.ts";
import { LESSER_FEASTS } from "../../mymonastery/src/lib/liturgical/lesser-feasts.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Words that mark a segment as an OFFICE, not a name. Drawn from the LFF
// entries themselves and the Vocation union in mymonastery/src/data/saints.ts.
const OFFICE_WORDS = [
  "apostle", "evangelist", "martyr", "martyrs", "bishop", "bishops", "archbishop",
  "priest", "priests", "deacon", "deaconess", "theologian", "theologians", "mystic",
  "monastic", "monastics", "abbot", "abbess", "hermit", "religious", "reformer",
  "missionary", "missionaries", "pastor", "teacher", "teachers", "scholar", "nurse",
  "physician", "queen", "king", "prophet", "prophets", "layperson", "lay", "mother",
  "mothers", "father", "fathers", "educator", "educators", "friar", "nun", "witness",
  "witnesses", "confessor", "virgin", "matriarch", "patriarch", "writer", "poet",
  "composer", "musician", "artist", "social", "activist", "liturgist", "catechist",
  "mission", "founder", "pioneer", "presbyter", "metropolitan", "patron", "ascetic",
  "desert", "companions", "doctor", "hymnwriter", "translator", "biblical",
  "superior", "lawyer", "statesman", "ruler", "emperor", "empress", "prince",
  "princess", "soldier", "physician's", "theological", "educator's",
  "philosopher", "philosophers", "unmercenary", "physicians", "scientist",
  "reformers", "abolitionist", "abolitionists", "chaplain", "catechists",
];
const looksLikeOffice = (seg) => {
  const words = seg.toLowerCase().replace(/^and\s+/, "").split(/[\s/]+/).filter(Boolean);
  return words.some((w) => OFFICE_WORDS.includes(w.replace(/[^a-z']/g, "")));
};

/**
 * DAYS THAT ARE NOT A PERSON. "Learn more about the life of Christmas Day" is
 * not a sentence, so these days say "the FEAST of ___" instead (owner,
 * 2026-10-01: "if it is not a person have it say learn more about the feast of
 * x"). They are listed, not detected, because the list is short and a wrong
 * guess here ships as nonsense.
 */
const EVENT_DAYS = new Set([
  "1-1",   // The Holy Name
  "1-6",   // The Epiphany
  "2-2",   // The Presentation
  "3-25",  // The Annunciation
  "5-31",  // The Visitation
  "7-4",   // Independence Day
  "8-6",   // The Transfiguration
  "9-14",  // Holy Cross Day
  "9-29",  // Saint Michael and All Angels — angels, not a life
  "11-1",  // All Saints' Day
  "12-25", // Christmas Day
  "12-28", // The Holy Innocents
]);

/**
 * Hand corrections, by "month-day" — `title` is what follows "Happy Feast
 * of", `life` is whose life the second line offers. A rule that reads English
 * will always miss a few, and a title that runs past ~40 characters is
 * truncated by pushSender, so the long ones are shortened here on purpose.
 *
 * The four event-days-about-a-person keep the day's own name in the title and
 * name the PERSON in the second line, which is the only place the two differ.
 */
const OVERRIDES = {
  "1-18":  { title: "the Confession of Saint Peter", life: "Saint Peter" },
  "1-25":  { title: "the Conversion of Saint Paul", life: "Saint Paul" },
  "6-24":  { title: "the Nativity of Saint John the Baptist", life: "Saint John the Baptist" },
  "8-15":  { title: "Saint Mary the Virgin", life: "Saint Mary" },
};

function pushName(full) {
  const segs = full.split(",").map((s) => s.trim()).filter(Boolean);
  const kept = [];
  for (const seg of segs) {
    if (looksLikeOffice(seg)) break;
    kept.push(seg);
  }
  // Nothing kept means the FIRST segment already carries the office inside it
  // ("Saint Luke the Evangelist", "Martyrs of the Reformation Era") — that
  // segment is still the day's name, and the tail rules below are what take
  // the office off it. An early return here was the bug: it skipped every
  // rule under it, so "Saint Luke the Evangelist" kept its office while
  // "Hilary of Poitiers, Bishop" lost it.
  let name = kept.length > 0
    ? kept.join(", ").replace(/,\s*and\s+/g, " and ")
    : (segs[0] ?? full);

  /**
   * ONE NAME IN THE TITLE. A dozen commemorations name three or four people
   * ("Catherine of Alexandria, Barbara of Nicomedia and Margaret of Antioch")
   * and run to 84 characters, which pushSender truncates at 40 — so the title
   * would crop mid-name anyway. The first name carries the day and the page
   * itself names everyone. "Saints Philip and James" is left whole: the
   * plural "Saints" IS the day's name, not a list.
   */
  if (!/^Saints\b/.test(name)) {
    const firstPerson = name.split(/,| and /)[0].trim();
    if (firstPerson.length >= 3) name = firstPerson;
  }

  /**
   * THE HONORIFIC TAIL. "The Transfiguration of Our Lord Jesus Christ" and
   * "The Presentation of Our Lord Jesus Christ in the Temple" are the
   * calendar's full names; after "Happy Feast of" they only need their own
   * noun, and the full form is past the 40-character cap anyway. Where the
   * calendar already gives the short name after a colon ("The Nativity of Our
   * Lord Jesus Christ: Christmas Day"), that is the name to use.
   */
  if (name.includes(": ")) name = name.slice(name.indexOf(": ") + 2);
  name = name
    .replace(/\s+of Our Lord Jesus Christ\b/g, "")
    .replace(/\s+of Our Lord\b/g, "")
    .replace(/\s+in the Temple\b/g, "")
    .trim();
  // The apostles and evangelists wear their office in the calendar's own name
  // ("Saint Bartholomew the Apostle"); after "Happy Feast of" the name is
  // enough, and it buys back the characters the cap would otherwise take.
  name = name.replace(/\s+the (Apostle|Evangelist)s?\b/g, "").replace(/,?\s*Apostles?$/, "");
  // "Happy Feast of the Transfiguration", not "of The Transfiguration".
  name = name.replace(/^The\b/, "the");
  return name;
}

const table = {};
// Lesser feasts first, so a BCP Holy Day on the same date wins the key.
for (const e of [...LESSER_FEASTS, ...HOLY_DAYS]) {
  const key = `${e.month}-${e.day}`;
  const name = pushName(e.name);
  const kind = EVENT_DAYS.has(key) ? "feast" : "person";
  table[key] = { ...(OVERRIDES[key] ?? { title: name, life: name }), kind };
}
// An override for a date the calendar no longer carries is a silent lie about
// the day; fail loudly instead.
for (const key of Object.keys(OVERRIDES)) {
  if (!table[key]) {
    throw new Error(`[saints-by-day] OVERRIDES has ${key}, which the calendar does not commemorate`);
  }
}

const sorted = Object.keys(table).sort((a, b) => {
  const [am, ad] = a.split("-").map(Number);
  const [bm, bd] = b.split("-").map(Number);
  return am - bm || ad - bd;
});

const out = `// GENERATED by src/build-saints-by-day.mjs — do not edit by hand.
// Source: mymonastery/src/lib/liturgical/{fixed-feasts,lesser-feasts}.ts
// (${Object.keys(table).length} days of the year carry a life to read.)
// Regenerate: cd artifacts/api-server && npx tsx src/build-saints-by-day.mjs
//
// "month-day" (1-based month, no padding) → { title, life }:
//   title — what follows "Happy Feast of"
//   life  — whose life the second line offers (differs only for the
//           event-days-about-a-person, e.g. the Confession of Saint Peter)
// The office ("Bishop", "Vowed Religious and Educator") is trimmed off; see
// the generator's note for why not simply "everything before the first comma".
// Every commemorated day is here; the feasts of our Lord and the other event
// days carry kind "feast" rather than being left out.
//   kind  — "person" (a life to read) or "feast" (a day, not a person), which
//           chooses between "the life of ___" and "the feast of ___"
export const SAINTS_BY_DAY: Record<string, { title: string; life: string; kind: "person" | "feast" }> = {
${sorted.map((k) => `  "${k}": { title: ${JSON.stringify(table[k].title)}, life: ${JSON.stringify(table[k].life)}, kind: "${table[k].kind}" },`).join("\n")}
};
`;
const target = resolve(__dirname, "lib/saintsByDay.generated.ts");
writeFileSync(target, out, "utf8");
console.log(`[saints-by-day] wrote ${Object.keys(table).length} days → ${target}`);
const over = sorted
  .map((k) => ({ k, t: table[k].title }))
  .filter(({ t }) => `Happy Feast of ${t}`.length > 40)
  .sort((a, b) => b.t.length - a.t.length);
console.log(`[saints-by-day] ${over.length} titles still past the 40-char cap (add an OVERRIDES entry if one reads badly truncated):`);
for (const { k, t } of over) console.log(`  ${k.padEnd(6)} ${`Happy Feast of ${t}`.length} chars  Happy Feast of ${t}`);
const feasts = sorted.filter((k) => table[k].kind === "feast");
console.log(`[saints-by-day] ${feasts.length} days are a feast rather than a person: ${feasts.map((k) => `${k} ${table[k].title}`).join(" · ")}`);
