/**
 * Midday Prayer — "An Order of Service for Noonday", BCP 1979, pp. 103-107.
 *
 * Owner: "Could you also build a midday prayer? SAME UI as offices." So it is
 * assembled exactly the way Compline is (see assembleCompline.ts) and rides
 * the same OfficeViewer deck: one slide shape, the same renderer, the same
 * book guide.
 *
 * Shape:
 *   intro → "O God, make speed to save us" + Gloria (+ Alleluia except in Lent)
 *         → appointed Psalm (day-of-week rotation among the four the BCP
 *           prints: 119:105-112, 121, 124, 126) with title + verses + Gloria
 *         → short lesson (rotation among the three BCP readings:
 *           Romans 5:5 / 2 Corinthians 5:17-18 / Malachi 1:11)
 *         → Kyrie
 *         → Lord's Prayer (contemporary form)
 *         → "Lord, hear our prayer" / "Let us pray"
 *         → Collect (rotation among the four BCP noonday collects; Friday
 *           keeps "Blessed Savior, at this hour you hung upon the cross")
 *         → "Let us bless the Lord" / "Thanks be to God"
 *
 * Texts: the 1979 Book of Common Prayer is in the public domain, and these
 * are the texts as that book prints them — the same footing Compline's
 * embedded lessons and collects stand on. The four psalms come from the
 * bcp_texts seed (psalm_119/121/124/126 are all present).
 *
 * The Noonday-only texts below are English. The shared pieces (versicles,
 * Gloria, Lord's Prayer, closing) go through officeI18n like every office.
 *
 * No confession: Noonday has none, so there is no applyConfessionPref pass.
 * No per-day cache: one psalm SELECT plus string work, same as Compline.
 */

import { eq } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { getOfficeDay } from "./liturgicalCalendar";
import { parsePsalmRef, splitPsalmIntoChunks, slicePsalmToRef, psalmEyebrow } from "./psalmRange";
import type { Slide, CallAndResponseLine, OfficeDayInfo } from "./assembleMorningPrayer";
import { TITLES, EYEBROWS, PRAYERS, pick, type Locale } from "./officeI18n";

function slide(
  id: string,
  type: Slide["type"],
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

// ── Embedded BCP texts (pp. 105-107) ────────────────────────────────────────

interface NoondayLesson {
  ref: string;
  text: string;
}

const LESSON_ROMANS: NoondayLesson = {
  ref: "Romans 5:5",
  text: "The love of God has been poured into our hearts through the Holy Spirit that has been given to us.",
};
const LESSON_2_CORINTHIANS: NoondayLesson = {
  ref: "2 Corinthians 5:17-18",
  text: "If anyone is in Christ he is a new creation; the old has passed away, behold the new has come. All this is from God, who through Christ reconciled us to himself and gave us the ministry of reconciliation.",
};
const LESSON_MALACHI: NoondayLesson = {
  ref: "Malachi 1:11",
  text: "From the rising of the sun to its setting my Name shall be great among the nations, and in every place incense shall be offered to my Name, and a pure offering; for my Name shall be great among the nations, says the Lord of Hosts.",
};

const COLLECT_SPIRIT =
  "Heavenly Father, send your Holy Spirit into our hearts, to direct and rule us according to your will, to comfort us in all our afflictions, to defend us from all error, and to lead us into all truth; through Jesus Christ our Lord. Amen.";
const COLLECT_CROSS =
  "Blessed Savior, at this hour you hung upon the cross, stretching out your loving arms: Grant that all the peoples of the earth may look to you and be saved; for your tender mercies' sake. Amen.";
const COLLECT_PAUL =
  "Almighty Savior, who at noonday called your servant Saint Paul to be an apostle to the Gentiles: We pray you to illumine the world with the radiance of your glory, that all nations may come and worship you; for you live and reign for ever and ever. Amen.";
const COLLECT_PEACE =
  "Lord Jesus Christ, you said to your apostles, “Peace I give to you; my own peace I leave with you:” Regard not our sins, but the faith of your Church, and give to us the peace and unity of that heavenly City, where with the Father and the Holy Spirit you live and reign, now and for ever. Amen.";

// Psalm 119 is seeded whole under its first section's name (Beati immaculati);
// verses 105-112 are its own section, Lucerna pedibus meis.
const SECTION_TITLES: Record<string, string> = {
  "119:105-112": "Lucerna pedibus meis",
};

// Where each psalm is printed inside the office itself (a reader with the book
// open at Noonday finds them there, not in the Psalter).
const PSALM_PAGE: Record<string, string> = {
  "119:105-112": "BCP p. 103",
  "121": "BCP p. 104",
  "124": "BCP p. 104",
  "126": "BCP p. 105",
};

interface NoondayDay {
  psalmRef: string;
  lesson: NoondayLesson;
  collect: string;
}

// 0 = Sunday … 6 = Saturday. Every psalm, reading and collect the BCP prints
// comes round within the week; Friday keeps the collect of the cross.
const NOONDAY_BY_DOW: Record<number, NoondayDay> = {
  0: { psalmRef: "126", lesson: LESSON_2_CORINTHIANS, collect: COLLECT_SPIRIT },
  1: { psalmRef: "121", lesson: LESSON_ROMANS, collect: COLLECT_PAUL },
  2: { psalmRef: "119:105-112", lesson: LESSON_MALACHI, collect: COLLECT_PEACE },
  3: { psalmRef: "124", lesson: LESSON_ROMANS, collect: COLLECT_SPIRIT },
  4: { psalmRef: "126", lesson: LESSON_MALACHI, collect: COLLECT_PEACE },
  5: { psalmRef: "121", lesson: LESSON_2_CORINTHIANS, collect: COLLECT_CROSS },
  6: { psalmRef: "119:105-112", lesson: LESSON_ROMANS, collect: COLLECT_PAUL },
};

export async function assembleNoonday(
  date: Date,
  locale: Locale = "en",
): Promise<{ slides: Slide[]; officeDay: OfficeDayInfo }> {
  const liturgicalDay = getOfficeDay(date);
  const today = NOONDAY_BY_DOW[date.getDay()]!;
  const psalmRef = parsePsalmRef(today.psalmRef) ?? { number: 121, range: null, ranges: null, raw: "121" };

  const T = {
    introTitle: pick(locale, TITLES.noonday),
    introEyebrow: pick(locale, TITLES.before_you_begin),
    introBody:
      "Midday Prayer is the prayer book’s short office for the middle of the day. Stop where you are for a few minutes, and give the rest of the day to God.",
    eyebrowOpening: pick(locale, EYEBROWS.opening),
    eyebrowLesson: pick(locale, EYEBROWS.the_lesson),
    eyebrowLordsPrayer: pick(locale, EYEBROWS.the_lords_prayer),
    eyebrowCollect: pick(locale, EYEBROWS.the_collect),
    eyebrowClosing: pick(locale, EYEBROWS.closing),
    scrollHint: pick(locale, PRAYERS.scroll_hint_continue),
    lordsPrayer: pick(locale, PRAYERS.lords_prayer_contemporary),
    gloriaPatri: pick(locale, PRAYERS.gloria_patri),
    alleluia: pick(locale, PRAYERS.alleluia),
    versicleMakeSpeed: { off: pick(locale, PRAYERS.versicle_o_god), peo: pick(locale, PRAYERS.versicle_o_lord) },
    letUsBlessOfficiant: pick(locale, PRAYERS.compline_let_us_bless_off),
    letUsBlessPeople: pick(locale, PRAYERS.compline_let_us_bless_peo),
  };

  // A DB hiccup on the psalm lookup must not take the office down: the rest
  // of the deck is embedded, so it renders with the psalm's placeholder.
  let psalmRow: typeof bcpTextsTable.$inferSelect | undefined;
  try {
    [psalmRow] = await db
      .select()
      .from(bcpTextsTable)
      .where(eq(bcpTextsTable.textKey, `psalm_${psalmRef.number}`))
      .limit(1);
  } catch (err) {
    console.error("Noonday psalm lookup failed:", err);
  }

  const slides: Slide[] = [];
  let idx = 0;
  const id = () => `noonday_slide_${idx++}`;

  // 0. Threshold intro.
  slides.push(slide(id(), "office_intro", "☀️", T.introEyebrow, T.introBody, { title: T.introTitle }));

  // 1. Opening versicle + Gloria — BCP p. 103. "Except in Lent, add Alleluia."
  const openingLines: CallAndResponseLine[] = [
    { speaker: "officiant", text: T.versicleMakeSpeed.off },
    { speaker: "people", text: T.versicleMakeSpeed.peo },
    { speaker: "both", text: T.gloriaPatri },
  ];
  if (liturgicalDay.useAlleluia) openingLines.push({ speaker: "both", text: T.alleluia });
  slides.push(
    slide(id(), "invitatory", "🔔", T.eyebrowOpening, "", {
      isCallAndResponse: true,
      callAndResponseLines: openingLines,
      bcpReference: "BCP p. 103",
    }),
  );

  // 2. Psalm — title card, 4-verse chunks, Gloria (the Compline block shape).
  const psalmEyebrowText = psalmEyebrow(psalmRef);
  const psalmTitle = SECTION_TITLES[today.psalmRef] ?? psalmRow?.title ?? null;
  const psalmPage = PSALM_PAGE[today.psalmRef] ?? psalmRow?.bcpReference ?? null;
  const psalmBody = psalmRow?.content ? slicePsalmToRef(psalmRow.content, psalmRef) : null;
  const psalmMeta = {
    psalmNumber: psalmRef.number,
    psalmRange: psalmRef.range,
    psalmRef: psalmRef.raw,
    fromLectionary: false,
    noonday: true,
  };
  slides.push(slide(id(), "psalm_title", "📖", psalmEyebrowText, "", { title: psalmTitle, bcpReference: psalmPage, metadata: psalmMeta }));
  const chunks = psalmBody ? splitPsalmIntoChunks(psalmBody, 4) : [`[Psalm ${psalmRef.raw} — see BCP Psalter]`];
  chunks.forEach((chunk, i) => {
    slides.push(
      slide(id(), "psalm", "📖", psalmEyebrowText, chunk, {
        title: psalmTitle,
        bcpReference: psalmPage,
        metadata: { ...psalmMeta, psalmChunkIndex: i, psalmChunkTotal: chunks.length },
      }),
    );
  });
  slides.push(slide(id(), "psalm_gloria", "📖", psalmEyebrowText, T.gloriaPatri, { title: psalmTitle, bcpReference: psalmPage, metadata: psalmMeta }));

  // 3. Short lesson — BCP p. 105. Printed on the slide, like Compline's.
  slides.push(
    slide(id(), "lesson", "📖", today.lesson.ref.toUpperCase(), today.lesson.text, {
      title: today.lesson.ref,
      bcpReference: "BCP p. 105",
      isScrollable: true,
      scrollHint: T.scrollHint,
      metadata: { noonday: true, lessonRef: today.lesson.ref },
    }),
  );

  // 4. The Prayers begin — BCP p. 106.
  slides.push(
    slide(id(), "suffrages", "🙏🏽", "THE PRAYERS", "", {
      isCallAndResponse: true,
      callAndResponseLines: [
        { speaker: "both", text: "Lord, have mercy." },
        { speaker: "both", text: "Christ, have mercy." },
        { speaker: "both", text: "Lord, have mercy." },
      ],
      bcpReference: "BCP p. 106",
    }),
  );

  // 5. Lord's Prayer — contemporary form.
  slides.push(slide(id(), "lords_prayer", "🙏🏽", T.eyebrowLordsPrayer, T.lordsPrayer, { bcpReference: "BCP p. 106" }));

  // 6. "Lord, hear our prayer" — BCP p. 106.
  slides.push(
    slide(id(), "suffrages", "🕊️", "VERSICLE", "", {
      isCallAndResponse: true,
      callAndResponseLines: [
        { speaker: "officiant", text: "Lord, hear our prayer;" },
        { speaker: "people", text: "And let our cry come to you." },
        { speaker: "officiant", text: "Let us pray." },
      ],
      bcpReference: "BCP p. 106",
    }),
  );

  // 7. Collect — BCP p. 107.
  slides.push(slide(id(), "collect", "🌿", T.eyebrowCollect, today.collect, { bcpReference: "BCP p. 107" }));

  // 8. "Let us bless the Lord" — closes the office, BCP p. 107.
  slides.push(
    slide(id(), "closing", "☀️", T.eyebrowClosing, "", {
      isCallAndResponse: true,
      callAndResponseLines: [
        { speaker: "officiant", text: T.letUsBlessOfficiant },
        { speaker: "people", text: T.letUsBlessPeople },
      ],
      bcpReference: "BCP p. 107",
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
  return { slides, officeDay };
}
