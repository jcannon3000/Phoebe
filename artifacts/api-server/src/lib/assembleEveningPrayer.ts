/**
 * Evening Prayer Assembly Service
 *
 * Assembles the complete 1979 Episcopal BCP Evening Prayer Rite II
 * for a given date as a Slide[] array.
 *
 * Unlike Morning Prayer, lessons are NOT fetched — the user is told
 * the appointed reading and encouraged to read in their own translation.
 */

import { getOfficeDay } from "./liturgicalCalendar";
import { getEveningCanticles } from "./eveningCanticleSelector";
import { getLectionaryReadings } from "./lectionary";
import { EP_BCP_TEXTS } from "../data/bcpEveningPrayerTexts";
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
  canticle_14: "🙏🏽", canticle_15: "🌸", canticle_16: "🌅",
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

// All BCP texts now come from ../data/bcpEveningPrayerTexts.ts (EP_BCP_TEXTS)

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

  // Psalm numbers for EP
  const appointedPsalmNums = readings.psalms
    .map(p => { const num = parseInt(p.split(":")[0], 10); return isNaN(num) ? null : num; })
    .filter((n): n is number => n !== null);

  /** Look up a text from embedded data */
  function getText(key: string): string {
    return EP_BCP_TEXTS[key]?.content ?? "";
  }
  function getTextData(key: string) {
    return EP_BCP_TEXTS[key] ?? { content: "", title: key, bcpReference: "" };
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
    slide(id(), "confession", "🙏🏽", "CONFESSION OF SIN", getText("confession_text"), {
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
  const phosData = getTextData("phos_hilaron");
  slides.push(
    slide(id(), "invitatory_psalm", "🕯️", "O GRACIOUS LIGHT", phosData.content, {
      bcpReference: phosData.bcpReference,
      isScrollable: true,
      scrollHint: "↓ continue · tap when ready",
    }),
  );

  // 7. Appointed Psalms — shown as reference (psalms are too long to embed)
  for (const psalmNum of appointedPsalmNums) {
    slides.push(
      slide(id(), "lesson", PSALM_EMOJI[psalmNum] ?? "📖", `PSALM ${psalmNum}`, `Psalm ${psalmNum}`, {
        title: `Psalm ${psalmNum}`,
        metadata: {
          reference: `Psalm ${psalmNum}`,
          readingNote: "Pray this psalm from your BCP Psalter or Bible.",
        },
      }),
    );
  }

  // 8. First Lesson — reference only
  const lesson1 = readings.lesson1;
  slides.push(
    slide(id(), "lesson", "📜", "THE FIRST LESSON", lesson1, {
      title: lesson1,
      metadata: {
        reference: lesson1,
        readingNote: "Read this lesson in your own Bible or preferred translation.",
      },
    }),
  );

  // 9. Canticle after OT lesson
  const afterOTData = getTextData(afterOT);
  slides.push(
    slide(id(), "canticle", CANTICLE_EMOJI[afterOT] ?? "🌟",
      afterOTData.title.toUpperCase(),
      afterOTData.content,
      {
        bcpReference: afterOTData.bcpReference,
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
      },
    ),
  );

  // 10. Second Lesson — reference only
  const lesson2 = readings.lesson2;
  slides.push(
    slide(id(), "lesson", "✉️", "THE SECOND LESSON", lesson2, {
      title: lesson2,
      metadata: {
        reference: lesson2,
        readingNote: "Read this lesson in your own Bible or preferred translation.",
      },
    }),
  );

  // 11. Canticle after NT lesson
  const afterNTData = getTextData(afterNT);
  slides.push(
    slide(id(), "canticle", CANTICLE_EMOJI[afterNT] ?? "🌟",
      afterNTData.title.toUpperCase(),
      afterNTData.content,
      {
        bcpReference: afterNTData.bcpReference,
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
      },
    ),
  );

  // 12. The Apostles' Creed
  const creedData = getTextData("apostles_creed");
  slides.push(
    slide(id(), "creed", "✝️", creedData.title.toUpperCase(), creedData.content, {
      bcpReference: creedData.bcpReference,
      metadata: { prompt: "We say together what we believe." },
    }),
  );

  // 13. The Lord's Prayer
  const lpData = getTextData("lords_prayer_contemporary");
  slides.push(
    slide(id(), "lords_prayer", "🙏🏽", lpData.title.toUpperCase(), lpData.content, {
      bcpReference: lpData.bcpReference,
    }),
  );

  // 14. Suffrages
  const suffrageText = getText(suffragesKey);
  const suffrageData = getTextData(suffragesKey);
  slides.push(
    slide(id(), "suffrages", "🕊️", `SUFFRAGES ${suffragesKey === "suffrages_a" ? "A" : "B"}`, suffrageText, {
      bcpReference: suffrageData.bcpReference,
      isCallAndResponse: true,
      callAndResponseLines: parseSuffrages(suffrageText),
    }),
  );

  // 15. Collect of the Day
  const collectContent = getText(liturgicalDay.collectKey) || getText("collect_fallback");
  const collectRef = getTextData(liturgicalDay.collectKey).bcpReference || getTextData("collect_fallback").bcpReference;
  slides.push(
    slide(id(), "collect", "📅", "COLLECT OF THE DAY", collectContent, {
      title: liturgicalDay.sundayLabel,
      bcpReference: collectRef,
    }),
  );

  // 16. A Collect for Peace (EP)
  const peaceData = getTextData("collect_for_peace_ep");
  slides.push(
    slide(id(), "collect", "☮️", "A COLLECT FOR PEACE", peaceData.content, {
      bcpReference: peaceData.bcpReference,
    }),
  );

  // 17. A Collect for Aid against Perils (EP)
  const aidData = getTextData("collect_for_aid_ep");
  slides.push(
    slide(id(), "collect", "🛡️", "A COLLECT FOR AID AGAINST PERILS", aidData.content, {
      bcpReference: aidData.bcpReference,
    }),
  );

  // 18. Prayer for Mission
  const missionData = getTextData(missionPrayerKey);
  slides.push(
    slide(id(), "prayer_for_mission", "🌍", "A PRAYER FOR MISSION", missionData.content, {
      bcpReference: missionData.bcpReference,
    }),
  );

  // 19. General Thanksgiving
  const gtData = getTextData("general_thanksgiving");
  slides.push(
    slide(id(), "general_thanksgiving", "🌾", gtData.title.toUpperCase(), gtData.content, {
      bcpReference: gtData.bcpReference,
      isScrollable: true,
      scrollHint: "↓ continue · tap when ready",
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
