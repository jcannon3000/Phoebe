/**
 * Daily Devotions Assembler
 *
 * Builds the abbreviated 1979 BCP Daily Devotions for Individuals and
 * Families (BCP pp. 137–140). The full liturgy lives in
 * assembleMorningPrayer / assembleEveningPrayer; the Devotions are the
 * short forms intended for personal or family use, and Phoebe currently
 * surfaces two of the four offices: In the Morning (p. 137) and In the
 * Early Evening (p. 139). Per user direction the Psalm slot uses the
 * appointed lectionary psalm for the day rather than a fixed selection,
 * which is permitted by the BCP rubric ("a Psalm such as the
 * following").
 *
 * The shape mirrors the Daily Office assemblers' slide schema so the
 * existing renderer (bcp-daily-office.tsx → OfficeViewer / LiturgyViewer)
 * can display devotion slides without any client-side changes. There's
 * no per-day cache here because devotions only need a single psalm
 * lookup; assembly cost is small enough to do on every request.
 */

import { eq, inArray } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { getOfficeDay } from "./liturgicalCalendar";
import { getLectionaryReadings } from "./lectionary";
import { bibleGatewayUrl } from "./bibleGatewayUrl";
import {
  parsePsalmRef,
  splitPsalmIntoChunks,
  sliceVersesByRange,
  psalmEyebrow,
} from "./psalmRange";
import { buildIntercessionSlides } from "./assembleIntercessions";
import type { Slide, CallAndResponseLine, OfficeDayInfo } from "./assembleMorningPrayer";

export type DevotionKind = "morning" | "early-evening";

// Keep the helper signature aligned with the office assemblers so the
// shape of `slide(...)` calls feels familiar when reading both files
// side-by-side.
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

// ── BCP text constants ────────────────────────────────────────────────────────
//
// Embedded directly so the devotions don't drag in a new bcp_texts seed
// pass. Page references are 1979 BCP. Lord's Prayer text matches what
// the Office assemblers render via the lords_prayer_contemporary key —
// kept inline here so the devotion file is self-contained.
const PHOS_HILARON =
  "O gracious light,\npure brightness of the everliving Father in heaven,\nO Jesus Christ, holy and blessed!\n\nNow as we come to the setting of the sun,\nand our eyes behold the vesper light,\nwe sing your praises, O God: Father, Son, and Holy Spirit.\n\nYou are worthy at all times to be praised by happy voices,\nO Son of God, O Giver of Life,\nand to be glorified through all the worlds.";

const LORDS_PRAYER_CONTEMPORARY =
  "Our Father in heaven,\nhallowed be your Name,\nyour kingdom come,\nyour will be done,\non earth as in heaven.\nGive us today our daily bread.\nForgive us our sins,\nas we forgive those who sin against us.\nSave us from the time of trial,\nand deliver us from evil.\nFor the kingdom, the power, and the glory are yours,\nnow and for ever. Amen.";

// "Lord God, almighty and everlasting Father…" — collect appointed for
// In the Morning (BCP p. 137).
const COLLECT_MORNING =
  "Lord God, almighty and everlasting Father, you have brought us in safety to this new day: Preserve us with your mighty power, that we may not fall into sin, nor be overcome by adversity; and in all we do, direct us to the fulfilling of your purpose; through Jesus Christ our Lord. Amen.";

// "Lord Jesus, stay with us…" — collect appointed for In the Early
// Evening (BCP p. 140). The wording is the Emmaus echo: "stay with us,
// for evening is at hand and the day is past".
const COLLECT_EARLY_EVENING =
  "Lord Jesus, stay with us, for evening is at hand and the day is past; be our companion in the way, kindle our hearts, and awaken hope, that we may know you as you are revealed in Scripture and the breaking of bread. Grant this for the sake of your love. Amen.";

// Fallback readings from the BCP devotion rubrics (pp. 137 / 139).
// Used only when the lectionary lookup misses for some reason — by
// default the devotion's scripture slide pulls from the day's
// lectionary so the devotion tracks the same Bible journey as the
// full Daily Office.
const FALLBACK_READING_MORNING_REF = "1 Peter 1:3";
const FALLBACK_READING_EARLY_EVENING_REF = "2 Corinthians 4:5–6";

// Body copy on the scripture slide. Title carries the reference; body
// is a soft prompt rather than echoing the same string, since
// Phoebe doesn't ship scripture text — readers tap "Read on
// BibleGateway" or open their own bible.
const LESSON_BODY_PROMPT = "Open your Bible, or read this passage online.";

// ── Main assembly ────────────────────────────────────────────────────────────

export async function assembleDevotion(
  date: Date,
  userId: number,
  kind: DevotionKind,
): Promise<{
  slides: Slide[];
  officeDay: OfficeDayInfo;
}> {
  const liturgicalDay = getOfficeDay(date);
  // Use the lectionary psalm for the same office (morning ↔ morning,
  // early-evening ↔ evening). The BCP Daily Devotion rubric allows
  // any suitable psalm; pulling from the day's lectionary keeps the
  // devotion in rhythm with the rest of the liturgical calendar.
  const lectOffice = kind === "morning" ? "morning" : "evening";
  const lectionary = getLectionaryReadings(liturgicalDay, lectOffice);
  const { psalms } = lectionary;

  // Take just the first appointed psalm — the devotions are meant to
  // be short. If the lectionary entry is missing or yields no psalms,
  // fall back to Psalm 51 (morning) or Psalm 134 (evening), both of
  // which the BCP suggests as the default when no psalm is appointed.
  // We hold onto the parsed range so partial-psalm appointments like
  // "119:73-96" get sliced down rather than rendering all 176 verses.
  const firstPsalmRaw = psalms[0] ?? (kind === "morning" ? "51" : "134");
  const parsedRef = parsePsalmRef(firstPsalmRaw) ?? {
    number: kind === "morning" ? 51 : 134,
    range: null as [number, number] | null,
    raw: kind === "morning" ? "51" : "134",
  };
  const psalmNum = parsedRef.number;

  // Look up the psalm content. Single DB query; if the row is missing
  // we render a placeholder so the slide still appears (the user can
  // tap through and we can backfill the seed later).
  const psalmKey = `psalm_${psalmNum}`;
  const collectKey = liturgicalDay.collectKey;
  const fetchKeys = [psalmKey, collectKey];
  const fetchedRows = await db
    .select()
    .from(bcpTextsTable)
    .where(inArray(bcpTextsTable.textKey, fetchKeys));
  const psalmRow = fetchedRows.find((r) => r.textKey === psalmKey) ?? null;
  const collectOfTheDayRow = fetchedRows.find((r) => r.textKey === collectKey) ?? null;

  // ── Build slides ────────────────────────────────────────────────────────────

  const slides: Slide[] = [];
  let idx = 0;
  const id = () =>
    `devotion_${kind === "morning" ? "mp" : "ee"}_slide_${idx++}`;

  const isMorning = kind === "morning";
  const titleSuffix = isMorning ? "Morning Devotion" : "Early Evening Devotion";

  // The Daily Devotions used to start with a date-label slide (the
  // weekday label as italic body text), but the top bar already
  // shows the office name and the day, so the slide read as a
  // mostly-empty "OPENING — Wednesday in the 5th Week of Easter"
  // intro that the user had to tap past. Removed; the devotion now
  // opens directly on the versicle.

  // 1. Opening versicle. Morning uses the canonical "make speed /
  //    make haste" pair; early-evening uses the shorter "Light and
  //    peace" greeting from BCP p. 139. Both add the Gloria Patri.
  if (isMorning) {
    const lines: CallAndResponseLine[] = [
      { speaker: "officiant", text: "O God, make speed to save us." },
      { speaker: "people", text: "O Lord, make haste to help us." },
      {
        speaker: "both",
        text: "Glory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.",
      },
    ];
    if (liturgicalDay.useAlleluia) {
      lines.push({ speaker: "both", text: "Alleluia." });
    }
    slides.push(
      slide(id(), "invitatory", "🔔", "OPENING", "", {
        isCallAndResponse: true,
        callAndResponseLines: lines,
        bcpReference: "BCP p. 137",
      }),
    );
  } else {
    const lines: CallAndResponseLine[] = [
      { speaker: "officiant", text: "Light and peace, in Jesus Christ our Lord." },
      { speaker: "people", text: "Thanks be to God." },
    ];
    slides.push(
      slide(id(), "invitatory", "🕯️", "OPENING", "", {
        isCallAndResponse: true,
        callAndResponseLines: lines,
        bcpReference: "BCP p. 139",
      }),
    );
    // Phos Hilaron — the Hymn of Light. Same text as the Daily Office's
    // Evening Prayer; embedded as a constant so this file stays self-
    // contained.
    slides.push(
      slide(id(), "invitatory_psalm", "🕯️", "O GRACIOUS LIGHT", PHOS_HILARON, {
        bcpReference: "BCP p. 139",
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
      }),
    );
  }

  // 3. Psalm — appointed lectionary psalm for the office, sliced to
  // the appointed verse range when the lectionary specifies one.
  const gloriaPatri =
    "\nGlory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.";
  const slicedPsalm =
    psalmRow && parsedRef.range
      ? sliceVersesByRange(psalmRow.content, parsedRef.range)
      : psalmRow?.content;
  const eyebrow = psalmEyebrow(parsedRef);

  // Title slide — same big "Psalm 23" headline pattern the full
  // Daily Office uses. Reads as a deliberate transition into the
  // psalm rather than verses appearing cold.
  slides.push(
    slide(id(), "psalm_title", "📖", eyebrow, "", {
      title: psalmRow?.title ?? null,
      bcpReference: psalmRow?.bcpReference ?? null,
      isScrollable: false,
      scrollHint: null,
      metadata: {
        psalmNumber: psalmNum,
        psalmRange: parsedRef.range,
        psalmRef: parsedRef.raw,
        fromLectionary: true,
      },
    }),
  );

  if (slicedPsalm) {
    // 4 verses per slide; Gloria Patri appended to the last chunk
    // only so the doxology still seals the psalm.
    const chunks = splitPsalmIntoChunks(slicedPsalm, 4);
    const lastIdx = chunks.length - 1;
    chunks.forEach((chunk, i) => {
      const content = i === lastIdx ? chunk + gloriaPatri : chunk;
      slides.push(
        slide(id(), "psalm", "📖", eyebrow, content, {
          title: psalmRow?.title ?? null,
          bcpReference: psalmRow?.bcpReference ?? null,
          isScrollable: false,
          scrollHint: null,
          metadata: {
            psalmNumber: psalmNum,
            psalmRange: parsedRef.range,
            psalmRef: parsedRef.raw,
            fromLectionary: true,
            psalmChunkIndex: i,
            psalmChunkTotal: chunks.length,
          },
        }),
      );
    });
  } else {
    slides.push(
      slide(
        id(),
        "psalm",
        "📖",
        eyebrow,
        `[Psalm ${parsedRef.raw} — see BCP Psalter]${gloriaPatri}`,
        {
          title: psalmRow?.title ?? null,
          bcpReference: psalmRow?.bcpReference ?? null,
          isScrollable: false,
          scrollHint: null,
          metadata: {
            psalmNumber: psalmNum,
            psalmRange: parsedRef.range,
            psalmRef: parsedRef.raw,
            fromLectionary: true,
          },
        },
      ),
    );
  }

  // 4. Reading — pulled from the day's lectionary so the devotion
  // tracks the same Bible journey as the full Daily Office. Morning
  // takes lesson2 (the Epistle reading); early evening takes lesson3
  // (the Gospel) to mirror the full EP. If the lectionary entry
  // happens to be missing or empty, fall back to the BCP devotion
  // rubric's fixed pair.
  const lectReading = isMorning ? lectionary.lesson2 : lectionary.lesson3;
  const readingRef =
    lectReading && lectReading.trim().length > 0 && !/^-+$/.test(lectReading.trim())
      ? lectReading
      : (isMorning ? FALLBACK_READING_MORNING_REF : FALLBACK_READING_EARLY_EVENING_REF);
  slides.push(
    slide(id(), "lesson", "📜", "A READING FROM SCRIPTURE", LESSON_BODY_PROMPT, {
      title: readingRef,
      metadata: {
        reference: readingRef,
        readUrl: bibleGatewayUrl(readingRef),
        readingNote: "Read this passage in your own Bible or preferred translation.",
      },
    }),
  );

  // 5. Intercessions handoff. The BCP rubric "Prayers may be
  //    offered for ourselves and others" maps to a single
  //    intercessions_portal placeholder; the client recognises it
  //    and seamlessly transitions into /prayer-mode, then returns
  //    here for the Lord's Prayer + Collect. We skip the portal
  //    entirely if there's nothing to pray for.
  const devotionIntercessionSlides = await buildIntercessionSlides(userId, date);
  if (devotionIntercessionSlides.length > 0) {
    slides.push({
      id: id(),
      type: "intercessions_portal",
      emoji: "🙏🏽",
      eyebrow: "INTERCESSIONS",
      title: null,
      content: "Praying with your community…",
      isCallAndResponse: false,
      callAndResponseLines: null,
      bcpReference: null,
      isScrollable: false,
      scrollHint: null,
      metadata: { intercessionCount: devotionIntercessionSlides.length },
    });
  }

  // 6. Lord's Prayer
  slides.push(
    slide(id(), "lords_prayer", "🙏🏽", "THE LORD'S PRAYER", LORDS_PRAYER_CONTEMPORARY, {
      bcpReference: isMorning ? "BCP p. 137" : "BCP p. 140",
    }),
  );

  // 7. Collect — pulled from the day's lectionary so the devotion
  // closes with the same Collect of the Day that the full Daily
  // Office uses. Falls back to the BCP rubric's fixed devotion
  // collect (Lord God, almighty… in the morning / Lord Jesus,
  // stay with us… at early evening) if the lectionary entry is
  // missing for any reason.
  const collectText =
    collectOfTheDayRow?.content
      ? collectOfTheDayRow.content
      : (isMorning ? COLLECT_MORNING : COLLECT_EARLY_EVENING);
  const collectBcpRef =
    collectOfTheDayRow?.bcpReference
      ?? (isMorning ? "BCP p. 137" : "BCP p. 140");
  slides.push(
    slide(id(), "collect", "🌿", "THE COLLECT OF THE DAY", collectText, {
      bcpReference: collectBcpRef,
    }),
  );

  // (Closing slide removed — the previous "CLOSING / Morning
  // Devotion" beat just echoed the top bar and made the user tap
  // through one more empty slide to finish. The Collect now closes
  // the devotion; the bottom pill's "Done" button signals the end.)
  void titleSuffix;

  // Eslint silence — the eq import is shared with the office assembler
  // pattern; not used directly here yet but kept for parity if we add
  // a per-day cache later.
  void eq;

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
