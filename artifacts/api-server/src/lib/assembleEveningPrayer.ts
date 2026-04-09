/**
 * Evening Prayer Assembly Service
 *
 * Assembles the complete 1979 Episcopal BCP Evening Prayer Rite II
 * for a given date as a Slide[] array.
 *
 * Unlike Morning Prayer, lessons are NOT fetched — the user is told
 * the appointed reading and encouraged to read in their own translation.
 */

import { eq, inArray } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { getOfficeDay } from "./liturgicalCalendar";
import { getEveningCanticles } from "./eveningCanticleSelector";
import { getLectionaryReadings } from "./lectionary";
import type { Slide, SlideType, CallAndResponseLine, OfficeDayInfo } from "./assembleMorningPrayer";

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function slide(
  id: string,
  type: SlideType,
  emoji: string,
  eyebrow: string,
  content: string,
  overrides: Partial<Slide> = {},
): Slide {
  return {
    id,
    type,
    emoji,
    eyebrow,
    title: null,
    content,
    isCallAndResponse: false,
    callAndResponseLines: null,
    bcpReference: null,
    isScrollable: false,
    scrollHint: null,
    metadata: {},
    ...overrides,
  };
}

const PSALM_EMOJI: Record<number, string> = {};
const PRAISE_PSALMS = [8,19,29,33,47,65,66,67,68,96,98,100,103,104,111,113,117,135,136,145,146,147,148,149,150];
const LAMENT_PSALMS = [6,13,22,31,38,42,44,51,55,74,77,79,80,85,86,88,90,102,130,137,143];
const CONFIDENCE_PSALMS = [11,16,23,27,46,62,71,91,121,125,131];
const THANKSGIVING_PSALMS = [9,18,30,34,40,92,107,116,118,138];
PRAISE_PSALMS.forEach(n => (PSALM_EMOJI[n] = "🌟"));
LAMENT_PSALMS.forEach(n => (PSALM_EMOJI[n] = "💧"));
CONFIDENCE_PSALMS.forEach(n => (PSALM_EMOJI[n] = "🏔️"));
THANKSGIVING_PSALMS.forEach(n => (PSALM_EMOJI[n] = "🌾"));

const CANTICLE_EMOJI: Record<string, string> = {
  canticle_8: "🌊", canticle_9: "💧", canticle_10: "🔍",
  canticle_11: "✨", canticle_12: "🌍", canticle_13: "🌟",
  canticle_14: "🙏", canticle_15: "🌸", canticle_16: "🌅",
  canticle_17: "🕊️", canticle_18: "🕊️", canticle_19: "🌸",
  canticle_20: "✨", canticle_21: "🌟",
};

const SEASON_LABELS: Record<string, string> = {
  advent: "Advent 🕯️", christmas: "Christmas 🌟", epiphany: "Epiphany ✨",
  lent: "Lent 🌿", holy_week: "Holy Week ✝️", easter: "Eastertide 🌸",
  season_after_pentecost: "Season after Pentecost 🌳",
};

/** Parse suffrage text (V: / R: lines) into call-and-response lines */
function parseSuffrages(text: string): CallAndResponseLine[] {
  const lines: CallAndResponseLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("V.") || line.startsWith("V ")) {
      lines.push({ speaker: "officiant", text: line.replace(/^V\.?\s*/, "") });
    } else if (line.startsWith("R.") || line.startsWith("R ")) {
      lines.push({ speaker: "people", text: line.replace(/^R\.?\s*/, "") });
    } else if (lines.length > 0) {
      lines[lines.length - 1].text += " " + line;
    }
  }
  return lines;
}

/** Pick opening sentence (rotate by day of month) */
function pickOpeningSentenceKey(season: string, dayOfMonth: number): string {
  const seasonMap: Record<string, { prefix: string; count: number }> = {
    advent: { prefix: "opening_sentence_advent_", count: 3 },
    christmas: { prefix: "opening_sentence_christmas_", count: 2 },
    epiphany: { prefix: "opening_sentence_epiphany_", count: 3 },
    lent: { prefix: "opening_sentence_lent_", count: 5 },
    holy_week: { prefix: "opening_sentence_holyweek_", count: 2 },
    easter: { prefix: "opening_sentence_easter_", count: 5 },
    season_after_pentecost: { prefix: "opening_sentence_anytime_", count: 7 },
  };
  const entry = seasonMap[season] ?? { prefix: "opening_sentence_anytime_", count: 7 };
  const index = (dayOfMonth % entry.count) + 1;
  return `${entry.prefix}${index}`;
}

function pickMissionPrayerKey(dayOfWeek: number): string {
  return `prayer_mission_${(dayOfWeek % 3) + 1}`;
}

function pickSuffragesKey(weekInSeason: number): string {
  return weekInSeason % 2 === 1 ? "suffrages_a" : "suffrages_b";
}

// ── Evening Prayer-specific texts (hardcoded, from BCP) ─────────────────────

const EP_TEXTS: Record<string, { content: string; title: string; bcpReference: string }> = {
  phos_hilaron: {
    title: "O Gracious Light",
    bcpReference: "BCP p. 118",
    content:
      "O gracious light,\npure brightness of the everliving Father in heaven,\nO Jesus Christ, holy and blessed!\n\nNow as we come to the setting of the sun,\nand our eyes behold the vesper light,\nwe sing your praises, O God: Father, Son, and Holy Spirit.\n\nYou are worthy at all times to be praised by happy voices,\nO Son of God, O Giver of Life,\nand to be glorified through all the worlds.",
  },
  canticle_15: {
    title: "The Song of Mary · Magnificat",
    bcpReference: "BCP p. 119",
    content:
      "My soul proclaims the greatness of the Lord,\nmy spirit rejoices in God my Savior; *\n  for he has looked with favor on his lowly servant.\nFrom this day all generations will call me blessed: *\n  the Almighty has done great things for me,\n  and holy is his Name.\nHe has mercy on those who fear him *\n  in every generation.\nHe has shown the strength of his arm, *\n  he has scattered the proud in their conceit.\nHe has cast down the mighty from their thrones, *\n  and has lifted up the lowly.\nHe has filled the hungry with good things, *\n  and the rich he has sent away empty.\nHe has come to the help of his servant Israel, *\n  for he has remembered his promise of mercy,\nThe promise he made to our fathers, *\n  to Abraham and his children for ever.\n\nGlory to the Father, and to the Son, and to the Holy Spirit: *\n  as it was in the beginning, is now, and will be for ever. Amen.",
  },
  canticle_17: {
    title: "The Song of Simeon · Nunc dimittis",
    bcpReference: "BCP p. 120",
    content:
      "Lord, you now have set your servant free *\n  to go in peace as you have promised;\nFor these eyes of mine have seen the Savior, *\n  whom you have prepared for all the world to see:\nA Light to enlighten the nations, *\n  and the glory of your people Israel.\n\nGlory to the Father, and to the Son, and to the Holy Spirit: *\n  as it was in the beginning, is now, and will be for ever. Amen.",
  },
  collect_for_peace_ep: {
    title: "A Collect for Peace",
    bcpReference: "BCP p. 123",
    content:
      "Most holy God, the source of all good desires, all right judgements, and all just works: Give to us, your servants, that peace which the world cannot give, so that our minds may be fixed on the doing of your will, and that we, being delivered from the fear of all enemies, may live in peace and quietness; through the mercies of Christ Jesus our Savior. Amen.",
  },
  collect_for_aid_ep: {
    title: "A Collect for Aid against Perils",
    bcpReference: "BCP p. 123",
    content:
      "Be our light in the darkness, O Lord, and in your great mercy defend us from all perils and dangers of this night; for the love of your only Son, our Savior Jesus Christ. Amen.",
  },
};

// ── Main Assembly ────────────────────────────────────────────────────────────

export async function assembleEveningPrayer(
  date: Date,
  _userId: number,
): Promise<{
  slides: Slide[];
  officeDay: OfficeDayInfo;
  fromCache: boolean;
}> {
  const liturgicalDay = getOfficeDay(date);
  const readings = getLectionaryReadings(liturgicalDay, "evening");
  const { afterOT, afterNT } = getEveningCanticles(liturgicalDay);

  const openingSentenceKey = pickOpeningSentenceKey(liturgicalDay.season, date.getDate());
  const suffragesKey = pickSuffragesKey(liturgicalDay.weekInSeason);
  const missionPrayerKey = pickMissionPrayerKey(liturgicalDay.dayOfWeek);

  // Keys to fetch from DB
  const keysNeeded = [
    openingSentenceKey,
    "confession_text",
    "confession_absolution",
    afterOT,
    afterNT,
    "apostles_creed",
    "lords_prayer_contemporary",
    suffragesKey,
    liturgicalDay.collectKey,
    missionPrayerKey,
    "general_thanksgiving",
  ];

  // Psalm keys for EP appointed psalms
  const appointedPsalmNums = readings.psalms
    .map(p => { const num = parseInt(p.split(":")[0], 10); return isNaN(num) ? null : num; })
    .filter((n): n is number => n !== null);

  const psalmKeys = [...new Set(appointedPsalmNums.map(n => `psalm_${n}`))];

  // Fetch BCP texts from DB
  const [bcpRows, psalmRows] = await Promise.all([
    db.select().from(bcpTextsTable).where(inArray(bcpTextsTable.textKey, keysNeeded)),
    psalmKeys.length > 0
      ? db.select().from(bcpTextsTable).where(inArray(bcpTextsTable.textKey, psalmKeys))
      : Promise.resolve([]),
  ]);

  const texts: Record<string, { content: string; title: string; bcpReference: string | null; metadata: Record<string, unknown> }> = {};
  for (const row of [...bcpRows, ...psalmRows]) {
    texts[row.textKey] = {
      content: row.content,
      title: row.title,
      bcpReference: row.bcpReference ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    };
  }

  function getText(key: string): string {
    return texts[key]?.content ?? `[${key} — see BCP]`;
  }

  function getEPText(key: string): { content: string; title: string; bcpReference: string } {
    return EP_TEXTS[key] ?? { content: `[${key}]`, title: key, bcpReference: "" };
  }

  // ── Build slides ────────────────────────────────────────────────────────────

  const slides: Slide[] = [];
  let idx = 0;
  const id = () => `ep_slide_${idx++}`;

  // 1. Opening
  slides.push(
    slide(id(), "opening", "🌙", "", liturgicalDay.weekdayLabel, {
      metadata: {
        season: liturgicalDay.season,
        seasonLabel: SEASON_LABELS[liturgicalDay.season] ?? liturgicalDay.season,
        liturgicalYear: liturgicalDay.liturgicalYear,
        date: date.toISOString(),
        sundayLabel: liturgicalDay.sundayLabel,
        weekdayLabel: liturgicalDay.weekdayLabel,
        isMajorFeast: liturgicalDay.isMajorFeast,
        useAlleluia: liturgicalDay.useAlleluia,
        office: "evening",
      },
    }),
  );

  // 2. Opening Sentence
  slides.push(
    slide(id(), "opening_sentence", "📖", "OPENING SENTENCE", getText(openingSentenceKey), {
      bcpReference: "BCP p. 115",
    }),
  );

  // 3. Confession
  slides.push(
    slide(id(), "confession", "🙏", "CONFESSION OF SIN", getText("confession_text"), {
      bcpReference: "BCP p. 116",
      metadata: { prompt: "Pause. Bring what you carry. 🌿" },
    }),
  );

  // 4. Absolution
  slides.push(
    slide(id(), "absolution", "☀️", "ABSOLUTION", getText("confession_absolution"), {
      bcpReference: "BCP p. 117",
    }),
  );

  // 5. Invitatory — EP uses different versicle
  const invitatoryLines: CallAndResponseLine[] = [
    { speaker: "officiant", text: "O God, make speed to save us." },
    { speaker: "people", text: "O Lord, make haste to help us." },
    {
      speaker: "both",
      text: "Glory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.",
    },
  ];
  if (liturgicalDay.useAlleluia) {
    invitatoryLines.push({ speaker: "both", text: "Alleluia." });
  }

  slides.push(
    slide(id(), "invitatory", "🔔", "INVITATORY", "", {
      isCallAndResponse: true,
      callAndResponseLines: invitatoryLines,
      bcpReference: "BCP p. 117",
    }),
  );

  // 6. O Gracious Light (Phos hilaron) — unique to Evening Prayer
  const phosData = getEPText("phos_hilaron");
  slides.push(
    slide(id(), "invitatory_psalm", "🕯️", "O GRACIOUS LIGHT · PHOS HILARON", phosData.content, {
      bcpReference: phosData.bcpReference,
      isScrollable: true,
      scrollHint: "↓ continue · tap when ready",
    }),
  );

  // 7. Appointed Psalms (EP psalms)
  const gloriaPatri =
    "\nGlory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.";

  for (const psalmNum of appointedPsalmNums) {
    const psalmKey = `psalm_${psalmNum}`;
    const psalmData = texts[psalmKey];
    const content = psalmData
      ? psalmData.content + gloriaPatri
      : `[Psalm ${psalmNum} — see BCP Psalter]${gloriaPatri}`;

    slides.push(
      slide(id(), "psalm", PSALM_EMOJI[psalmNum] ?? "📖", `PSALM ${psalmNum}`, content, {
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
        metadata: psalmData?.metadata ?? {},
      }),
    );
  }

  // 8. First Lesson — reference only, no full text
  const lesson1 = readings.lesson1;
  slides.push(
    slide(id(), "lesson", "📜", "FIRST LESSON", lesson1, {
      title: lesson1,
      metadata: {
        reference: lesson1,
        readingNote: "Read this lesson in your own Bible or preferred translation.",
      },
    }),
  );

  // 9. Canticle after OT lesson
  // Check if EP-specific canticle exists in our hardcoded texts first
  const afterOTEP = EP_TEXTS[afterOT];
  const afterOTDB = texts[afterOT];
  const afterOTContent = afterOTEP?.content ?? afterOTDB?.content ?? `[${afterOT} — see BCP]`;
  const afterOTTitle = afterOTEP?.title ?? afterOTDB?.title ?? afterOT;
  const afterOTRef = afterOTEP?.bcpReference ?? afterOTDB?.bcpReference ?? null;

  slides.push(
    slide(id(), "canticle", CANTICLE_EMOJI[afterOT] ?? "🌟",
      `CANTICLE · ${afterOTTitle.toUpperCase()}`,
      afterOTContent,
      {
        bcpReference: afterOTRef,
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
      },
    ),
  );

  // 10. Second Lesson — reference only
  const lesson2 = readings.lesson2;
  slides.push(
    slide(id(), "lesson", "✉️", "SECOND LESSON", lesson2, {
      title: lesson2,
      metadata: {
        reference: lesson2,
        readingNote: "Read this lesson in your own Bible or preferred translation.",
      },
    }),
  );

  // 11. Canticle after NT lesson
  const afterNTEP = EP_TEXTS[afterNT];
  const afterNTDB = texts[afterNT];
  const afterNTContent = afterNTEP?.content ?? afterNTDB?.content ?? `[${afterNT} — see BCP]`;
  const afterNTTitle = afterNTEP?.title ?? afterNTDB?.title ?? afterNT;
  const afterNTRef = afterNTEP?.bcpReference ?? afterNTDB?.bcpReference ?? null;

  slides.push(
    slide(id(), "canticle", CANTICLE_EMOJI[afterNT] ?? "🌟",
      `CANTICLE · ${afterNTTitle.toUpperCase()}`,
      afterNTContent,
      {
        bcpReference: afterNTRef,
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
      },
    ),
  );

  // 12. Apostles' Creed
  slides.push(
    slide(id(), "creed", "✝️", "THE APOSTLES' CREED", getText("apostles_creed"), {
      bcpReference: "BCP p. 120",
      metadata: { prompt: "We say together what we believe." },
    }),
  );

  // 13. Lord's Prayer
  slides.push(
    slide(id(), "lords_prayer", "🙏", "THE LORD'S PRAYER", getText("lords_prayer_contemporary"), {
      bcpReference: "BCP p. 121",
    }),
  );

  // 14. Suffrages
  const suffrageText = getText(suffragesKey);
  const suffrageLabel = suffragesKey === "suffrages_a" ? "A" : "B";
  slides.push(
    slide(id(), "suffrages", "🕊️", `THE PRAYERS · SUFFRAGES ${suffrageLabel}`, suffrageText, {
      bcpReference: "BCP p. 121",
      isCallAndResponse: true,
      callAndResponseLines: parseSuffrages(suffrageText),
    }),
  );

  // 15. Collect of the Day
  const collectData = texts[liturgicalDay.collectKey];
  slides.push(
    slide(id(), "collect", "📅", "COLLECT OF THE DAY", getText(liturgicalDay.collectKey), {
      title: liturgicalDay.sundayLabel,
      bcpReference: collectData?.bcpReference ?? "BCP p. 211",
    }),
  );

  // 16. Collect for Peace (EP-specific)
  const peaceData = getEPText("collect_for_peace_ep");
  slides.push(
    slide(id(), "collect", "☮️", "A COLLECT FOR PEACE", peaceData.content, {
      bcpReference: peaceData.bcpReference,
    }),
  );

  // 17. Collect for Aid against Perils (EP-specific)
  const aidData = getEPText("collect_for_aid_ep");
  slides.push(
    slide(id(), "collect", "🛡️", "A COLLECT FOR AID AGAINST PERILS", aidData.content, {
      bcpReference: aidData.bcpReference,
    }),
  );

  // 18. Prayer for Mission
  slides.push(
    slide(id(), "prayer_for_mission", "🌍", "A PRAYER FOR MISSION", getText(missionPrayerKey), {
      bcpReference: "BCP p. 124",
    }),
  );

  // 19. General Thanksgiving
  slides.push(
    slide(id(), "general_thanksgiving", "🌾", "THE GENERAL THANKSGIVING", getText("general_thanksgiving"), {
      bcpReference: "BCP p. 125",
      metadata: { prompt: "This is often said aloud together." },
    }),
  );

  // 20. Closing
  slides.push(
    slide(id(), "closing", "🌙", "", "Evening Prayer", {
      metadata: { date: date.toISOString(), office: "evening" },
    }),
  );

  const officeDay: OfficeDayInfo = {
    season: liturgicalDay.season,
    liturgicalYear: liturgicalDay.liturgicalYear,
    sundayLabel: liturgicalDay.sundayLabel,
    weekdayLabel: liturgicalDay.weekdayLabel,
    properNumber: liturgicalDay.properNumber,
    feastName: liturgicalDay.feastName,
    isMajorFeast: liturgicalDay.isMajorFeast,
    useAlleluia: liturgicalDay.useAlleluia,
    totalSlides: slides.length,
  };

  return { slides, officeDay, fromCache: false };
}
