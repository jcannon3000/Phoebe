/**
 * Season of Creation — data for a creation-focused Daily Devotion.
 *
 * Two things live here:
 *
 *  1. A two-week Psalter cycle for Morning & Evening Prayer, drawn from the
 *     psalms appointed in *Season of Creation: A Celebration Guide for Episcopal
 *     Parishes* (Perennial Edition, 2025). Every psalm in the guide appears
 *     across the fortnight; longer psalms are split between the two offices of
 *     their day; both Fridays carry the penitential/lament psalms. After the
 *     14th day the cycle begins again.
 *
 *  2. The creation-themed liturgical texts the guide supplies for the office
 *     (Opening Sentences, Confession, Invitatory + Creation Gloria, Antiphons,
 *     Suffrages, Concluding Sentences).
 *
 * LICENSING — everything here is either PUBLIC DOMAIN (1979 BCP text, which the
 * Episcopal Church has placed in the public domain, and Scripture) or a
 * composition from the Season of Creation guide, which is released "to the
 * larger Church as a gift." We attribute the guide on the slides that use its
 * compositions. NOTHING here is drawn from Enriching Our Worship (© Church
 * Publishing) or the Laudato Si' Movement (© LEV) — those need permission.
 */

export type CreationSide = "morning" | "evening";
export type CreationWeek = "A" | "B";

/** psalm reference strings exactly as appointed in the guide (NRSV/RCL verse
 *  numbering). Whole psalm = "148"; range = "19:1-6"; multi-range =
 *  "90:1-2, 16-17"; the odd sub-verse ("45c") is treated as its verse. */
type OfficePsalms = { morning: string[]; evening: string[] };

export const CREATION_PSALTER: Record<CreationWeek, Record<number, OfficePsalms>> = {
  A: {
    0: { morning: ["148"], evening: ["96", "1"] },                                   // Sunday
    1: { morning: ["8", "121"], evening: ["65"] },                                   // Monday
    2: { morning: ["19:1-6", "15"], evening: ["19:7-14", "125"] },                   // Tuesday
    3: { morning: ["33:1-11"], evening: ["33:12-22", "107:1-9"] },                   // Wednesday
    4: { morning: ["145:1-8", "90:1-2, 16-17"], evening: ["147:1, 3-11", "105:1-6, 23-26, 45c"] }, // Thursday
    5: { morning: ["51:1-11"], evening: ["137", "14"] },                             // Friday (penitence)
    6: { morning: ["136:1-9, 25-26"], evening: ["25:1-8", "45:1-2, 7-10"] },         // Saturday
  },
  B: {
    0: { morning: ["103:1-11", "139:1-5, 12-17"], evening: ["103:12-22"] },          // Sunday
    1: { morning: ["105:1-6, 37-45"], evening: ["114", "81:1, 10-16"] },             // Monday
    2: { morning: ["89:1-2, 5-13", "37:1-10"], evening: ["89:14-18, 52", "116:1-8"] }, // Tuesday
    3: { morning: ["146", "80:7-14"], evening: ["112", "98"] },                      // Wednesday
    4: { morning: ["91:1-6, 14-16", "124"], evening: ["78:1-4, 12-16", "119:33-40"] }, // Thursday
    5: { morning: ["79:1-9", "54"], evening: ["74:12-23"] },                         // Friday (lament)
    6: { morning: ["149", "113"], evening: ["26"] },                                 // Saturday
  },
};

// Anchor the fortnight to a fixed Sunday so the cycle is deterministic for any
// date. September 1, 2024 was a Sunday and the start of the Season of Creation
// that year — so it opens Week A, and the parity perpetuates from there.
const CYCLE_EPOCH = new Date(2024, 8, 1); // 2024-09-01 (local), Sunday, Week A day 1
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Which week (A/B) and weekday (0=Sun..6=Sat) of the cycle a date falls on. */
export function creationCyclePosition(date: Date): { week: CreationWeek; weekday: number } {
  const weekday = date.getDay();
  // The Sunday that opens this date's week (local midnight).
  const sunday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday);
  // round() absorbs DST hour drift between two local-midnight Sundays.
  const weeks = Math.round((sunday.getTime() - CYCLE_EPOCH.getTime()) / MS_PER_WEEK);
  const week: CreationWeek = (((weeks % 2) + 2) % 2) === 0 ? "A" : "B";
  return { week, weekday };
}

/** The appointed psalm references for a given date + office (two-week cycle). */
export function creationPsalmRefs(date: Date, side: CreationSide): string[] {
  const { week, weekday } = creationCyclePosition(date);
  const day = CREATION_PSALTER[week][weekday];
  return side === "morning" ? day.morning : day.evening;
}

// Days since the cycle epoch (local midnights; round absorbs DST).
function creationDaysSinceEpoch(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((d.getTime() - CYCLE_EPOCH.getTime()) / (24 * 60 * 60 * 1000));
}

// The 28-office "once a day" cycle — every morning AND evening selection of the
// two-week cycle, laid out one per day (Week A then B; each day's morning then
// evening). For someone who prays Creation Prayer ONCE a day this stretches the
// Psalter to FOUR WEEKS so that, across the fortnight-of-days, every psalm is
// still prayed (rather than only ever seeing the morning — or only the evening —
// halves).
export const CREATION_PSALTER_FLAT: string[][] = (() => {
  const flat: string[][] = [];
  (["A", "B"] as CreationWeek[]).forEach((week) => {
    for (let wd = 0; wd < 7; wd++) {
      flat.push(CREATION_PSALTER[week][wd].morning);
      flat.push(CREATION_PSALTER[week][wd].evening);
    }
  });
  return flat; // 28 entries
})();

/** 0–27 position in the four-week single-daily cycle. */
export function creationDayIndex(date: Date): number {
  return ((creationDaysSinceEpoch(date) % 28) + 28) % 28;
}

/** A fixed per-office SCHEDULE index — the SAME for everyone praying this office
 *  on this date, independent of how often they pray. It advances by one each day
 *  (so a given office cycles through every option in a pool), and morning vs
 *  evening differ by a week's offset. Drives the reading / antiphon / opening
 *  sentence / canticle / affirmation / litany / quote / blessing rotations, so
 *  they read like an appointed lectionary rather than anything per-user. */
export function creationScheduleSeq(date: Date, side: CreationSide): number {
  return creationDaysSinceEpoch(date) + (side === "evening" ? 7 : 0);
}

/** Psalms for a single-daily pray-er (the four-week combined cycle). */
export function creationPsalmRefsSingle(date: Date): string[] {
  return CREATION_PSALTER_FLAT[creationDayIndex(date)];
}

/** Psalms for the office. `single` = the user prays Creation Prayer only once a
 *  day → the four-week combined cycle; otherwise the two-week side-split (so a
 *  morning + evening pray-er covers everything in two weeks). */
export function creationPsalmRefsFor(date: Date, side: CreationSide, single: boolean): string[] {
  return single ? creationPsalmRefsSingle(date) : creationPsalmRefs(date, side);
}

// ── The Season of Creation is Sep 1 → Oct 4 (World Day of Prayer for the Care
//    of Creation → the Feast of St. Francis). The devotion can be prayed any
//    day, but we use this to gently surface it in-season. ──────────────────────
export function isSeasonOfCreation(date: Date): boolean {
  const m = date.getMonth(); // 8 = Sep, 9 = Oct
  const d = date.getDate();
  return (m === 8) || (m === 9 && d <= 4);
}

// ── Liturgical texts ─────────────────────────────────────────────────────────
// SOURCE tags: "bcp" / "scripture" = public domain; "guide" = a composition from
// the Season of Creation guide (gift-licensed; attributed on the slide).

export const CREATION_ATTRIBUTION =
  "Season of Creation: A Celebration Guide for Episcopal Parishes (2025)";

// Opening Sentences — Scripture (public domain). Rotated by weekday.
export const CREATION_OPENING_SENTENCES: Array<{ text: string; ref: string }> = [
  { text: "The heavens are telling the glory of God, and the firmament proclaims his handiwork.", ref: "Psalm 19:1" },
  { text: "The pastures of the wilderness overflow; the hills gird themselves with joy; the meadows clothe themselves with flocks; the valleys deck themselves with grain; they shout and sing together for joy.", ref: "Psalm 65:12-13" },
  { text: "Let the heavens be glad, and let the earth rejoice; let the sea roar and all that fills it; let the field exult and everything in it. Then shall all the trees of the forest sing for joy.", ref: "Psalm 96:11-12" },
  { text: "Shower, O heavens, from above, and let the skies rain down righteousness; let the earth open, that salvation may spring up, and let it cause righteousness to sprout up also.", ref: "Isaiah 45:8" },
];

// Confession — a composition from the guide (gift-licensed).
export const CREATION_CONFESSION_INVITE = "Let us confess our sins against God and all Creation.";
export const CREATION_CONFESSION =
  "Holy and merciful God,\n" +
  "   we confess that we have failed to honor you\n" +
  "   by rightly claiming our kinship with all your creatures.\n" +
  "We have walked heavily on your earth,\n" +
  "   overused and wasted its resources,\n" +
  "   taken for granted its beauty and abundance,\n" +
  "   and treated its inhabitants unjustly,\n" +
  "   holding future generations hostage to our greed.\n" +
  "Have mercy on us and forgive us our sin.\n" +
  "Renew in us the resolve to keep and conserve your earth\n" +
  "   as you desire and intend,\n" +
  "   with grateful and compassionate hearts,\n" +
  "   through your Son, our Savior Jesus Christ. Amen.";

// Invitatory — versicle (adapts Ps 118:24, public domain) + the guide's
// "Creation Gloria" (a composition).
export const CREATION_INVITATORY: { officiant: string; people: string } = {
  officiant: "This is the day the Creator has made.",
  people: "Let us rejoice and be glad in it.",
};
export const CREATION_GLORIA =
  "Glory to the Source, Wisdom, and Breath of Creation; *\n" +
  "   as it was in the beginning, is now, and will be forever. Amen.";

// Antiphons "with the Invitatory Psalm" — guide compositions (drawn from the
// Psalms). One is chosen per office.
export const CREATION_ANTIPHONS: string[] = [
  "Creation is speaking: Come let us listen.",
  "The loving-kindness of the Lord fills the whole Creation: Come let us adore the Creator.",
  "The Hope of the earth astonishes us: Come let us draw near.",
  "The heavens and earth rejoice: Come let us sing a new song.",
];

// Suffrages "with Creation," Set A — a composition from the guide.
export const CREATION_SUFFRAGES: Array<{ v: string; r: string }> = [
  { v: "Show your creatures mercy, O Creator;", r: "And grant all Creation your restoration." },
  { v: "Clothe your beloved ones with all goodness;", r: "Let your creatures sing with joy." },
  { v: "Give peace, O Creator, in all the world;", r: "For only in you can we live in harmony." },
  { v: "Keep every tribe and community under your wing;", r: "And guide us in the way of universal communion." },
  { v: "Let your way of love be known upon earth;", r: "Your uniting wholeness among all divisions." },
  { v: "Let not those in need, O God, be lost;", r: "Nor the hope of the endangered be taken away." },
  { v: "Put in us new soft hearts of flesh, O God;", r: "And inspire us with your Holy Breath who sustains us." },
];

// Collect — BCP "For Joy in God's Creation" (1979 BCP p. 814, public domain).
export const CREATION_COLLECT = {
  text:
    "O heavenly Father, who hast filled the world with beauty: Open our eyes to behold thy gracious hand in all thy works; that, rejoicing in thy whole creation, we may learn to serve thee with gladness; for the sake of him through whom all things were made, thy Son Jesus Christ our Lord. Amen.",
  ref: "BCP p. 814",
};

// Concluding Sentences — Scripture (public domain). One per office.
export const CREATION_CONCLUDING: Array<{ text: string; ref: string }> = [
  { text: "All things came into being through the Word, and without him not one thing came into being. What has come into being in him was life, and the life was the light of all people. Amen.", ref: "John 1:3-4" },
  { text: "With all wisdom and insight God has made known to us the mystery of his will, according to his good pleasure that he set forth in Christ, as a plan for the fullness of time, to gather up all things in him, things in heaven and things on earth. Amen.", ref: "Ephesians 1:8-10" },
];

// The Gloria Patri that seals the psalmody (traditional, public domain).
export const GLORIA_PATRI =
  "Glory to the Father, and to the Son, and to the Holy Spirit: *\n" +
  "   as it was in the beginning, is now, and will be for ever. Amen.";

// The contemporary Lord's Prayer (matches the office; public domain).
export const CREATION_LORDS_PRAYER =
  "Our Father in heaven,\nhallowed be your Name,\nyour kingdom come,\nyour will be done,\non earth as in heaven.\nGive us today our daily bread.\nForgive us our sins,\nas we forgive those who sin against us.\nSave us from the time of trial,\nand deliver us from evil.\nFor the kingdom, the power, and the glory are yours,\nnow and for ever. Amen.";
