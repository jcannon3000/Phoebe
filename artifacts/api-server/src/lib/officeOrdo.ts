/**
 * Office Ordo — the per-day "what's appointed" for Morning & Evening Prayer,
 * pulled from the SAME selectors and pickers the slide assemblers use
 * (getLectionaryReadings / getCanticles / getEveningCanticles / pickInvitatoryKey
 * / pickSuffragesKey / pickPrayerForMissionKey). This is the data behind the
 * printable weekly-office grid: the office order with each day's psalms,
 * lessons, canticles, suffrages, and collect filled in — so the printout
 * matches exactly what someone prays in the app or from a physical BCP.
 *
 * Morning Prayer reads TWO lessons (OT + Epistle) with two canticles; Evening
 * Prayer reads the Gospel (one lesson) with one canticle and the Phos hilaron
 * in place of an invitatory psalm — mirroring assembleMorningPrayer /
 * assembleEveningPrayer.
 */

import { inArray } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { getOfficeDay } from "./liturgicalCalendar";
import { getLectionaryReadings } from "./lectionary";
import { getCanticles } from "./canticleSelector";
import { getEveningCanticles } from "./eveningCanticleSelector";
import { parsePsalmRef } from "./psalmRange";
import {
  pickInvitatoryKey,
  pickSuffragesKey,
  pickPrayerForMissionKey,
  CONCLUDING_BLESSINGS,
  type InvitatoryKey,
} from "./assembleMorningPrayer";

export type OrdoLesson = { label: string; ref: string };
export type OrdoCanticle = { label: string; name: string; number: number | null };
export type OrdoSide = {
  /** "Venite (Ps. 95)" / "Jubilate (Ps. 100)" / "Pascha Nostrum" at MP;
   *  "Phos hilaron (O Gracious Light)" at EP. */
  invitatory: string;
  /** Appointed psalms for this office, as the lectionary lists them. */
  psalms: string[];
  /** MP: First Lesson (OT) + Second Lesson (Epistle). EP: the Gospel (one). */
  lessons: OrdoLesson[];
  /** MP: after-OT + after-NT canticles. EP: the single after-Gospel canticle. */
  canticles: OrdoCanticle[];
  suffrages: "A" | "B";
  /** The day's collect label (e.g. "Proper 8", a feast name). */
  collect: string;
  /** Prayer for Mission option in use that day — "I" / "II" / "III". */
  prayerForMission: string;
};
export type OrdoDay = {
  date: string; // YYYY-MM-DD
  weekdayLabel: string;
  sundayLabel: string;
  season: string;
  morning: OrdoSide;
  evening: OrdoSide;
};

// canticle_NN textKey → concise display name (BCP p. 144 Table of Canticles).
const CANTICLE_NAMES: Record<string, string> = {
  canticle_8: "Cantemus Domino",
  canticle_9: "Ecce, Deus",
  canticle_10: "Quærite Dominum",
  canticle_11: "Surge, illuminare",
  canticle_12: "Benedicite",
  canticle_13: "Benedictus es",
  canticle_14: "Kyrie Pantokrator",
  canticle_15: "Magnificat",
  canticle_16: "Benedictus",
  canticle_17: "Nunc dimittis",
  canticle_18: "Dignus es",
  canticle_19: "Magna et mirabilia",
  canticle_20: "Gloria in excelsis",
  canticle_21: "Te Deum",
};
const canticleName = (key: string): string => CANTICLE_NAMES[key] ?? key.replace(/_/g, " ");
// The BCP canticle number (1–21) from the canticle_NN key, for "21 · Te Deum".
const canticleNumber = (key: string): number | null => {
  const m = key.match(/canticle_(\d+)/);
  return m ? Number(m[1]) : null;
};

const INVITATORY_DISPLAY: Record<InvitatoryKey, string> = {
  venite: "Venite (Ps. 95)",
  jubilate: "Jubilate (Ps. 100)",
  pascha_nostrum: "Pascha Nostrum",
};

// "prayer_mission_2" → "II". Falls back to the bare key tail.
const ROMAN = ["", "I", "II", "III", "IV", "V"];
function missionRoman(key: string): string {
  const m = key.match(/_(\d+)$/);
  const n = m ? Number(m[1]) : 0;
  return ROMAN[n] ?? String(n);
}

// Present = non-empty and not the lectionary's dashes ("----") for an
// unappointed slot (matches isLessonPresent in the assemblers).
const present = (s: string | null | undefined): boolean =>
  !!s && s.trim().length > 0 && !/^-+$/.test(s.trim());

// Build one day's ordo for both offices. Pure / synchronous — every value
// comes from the deterministic calendar + lectionary + the shared pickers.
export function buildOfficeOrdoDay(date: Date): OrdoDay {
  const ld = getOfficeDay(date);
  const mr = getLectionaryReadings(ld); // morning (default office)
  const er = getLectionaryReadings(ld, "evening");
  const mc = getCanticles(ld);
  const ec = getEveningCanticles(ld);

  const appointedNums = mr.psalms
    .map(parsePsalmRef)
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => p.number);
  const invKey = pickInvitatoryKey(ld, date, appointedNums);
  const suffrages: "A" | "B" = pickSuffragesKey(ld.weekInSeason) === "suffrages_a" ? "A" : "B";
  const prayerForMission = missionRoman(pickPrayerForMissionKey(date));

  // Morning lessons — OT then Epistle (skip an unappointed slot).
  const morningLessons: OrdoLesson[] = [];
  if (present(mr.lesson1)) morningLessons.push({ label: "First Lesson · OT", ref: mr.lesson1.trim() });
  if (present(mr.lesson2)) morningLessons.push({ label: "Second Lesson · Epistle", ref: mr.lesson2.trim() });

  // Evening lesson — the Gospel (lesson3); on "Eve of …" days the lectionary
  // puts both EP lessons in lesson1/lesson2, so fall back to lesson2 there
  // (mirrors assembleEveningPrayer's lessonForEvening logic).
  const hasL3 = present(er.lesson3);
  const eveningRef = hasL3
    ? er.lesson3.trim()
    : er.isEveOverride && present(er.lesson2)
      ? er.lesson2.trim()
      : "";
  const eveningLessons: OrdoLesson[] = eveningRef
    ? [{ label: hasL3 ? "The Gospel" : "The Lesson", ref: eveningRef }]
    : [];

  const morning: OrdoSide = {
    invitatory: INVITATORY_DISPLAY[invKey],
    psalms: mr.psalms,
    lessons: morningLessons,
    canticles: [
      { label: "After the Old Testament", name: canticleName(mc.afterOT), number: canticleNumber(mc.afterOT) },
      { label: "After the New Testament", name: canticleName(mc.afterNT), number: canticleNumber(mc.afterNT) },
    ],
    suffrages,
    /**
     * KNOWN LIMITATION, deliberately left: this names the WEEK, where the
     * offices themselves now name the collect's own day (see
     * assembleMorningPrayer's note — Ash Wednesday's collect was appearing
     * under "The First Sunday in Lent").
     *
     * Fixing it here needs the seeded bcp_texts row, and this builder is
     * synchronous with no database access. The printable ordo grid is a
     * lower-stakes surface than the office, so it keeps the week's label
     * until someone threads a collect-title map through from the route.
     */
    collect: ld.sundayLabel,
    prayerForMission,
  };
  const evening: OrdoSide = {
    invitatory: "Phos hilaron (O Gracious Light)",
    psalms: er.psalms,
    lessons: eveningLessons,
    canticles: [{ label: "After the Gospel", name: canticleName(ec.afterNT), number: canticleNumber(ec.afterNT) }],
    suffrages,
    /**
     * KNOWN LIMITATION, deliberately left: this names the WEEK, where the
     * offices themselves now name the collect's own day (see
     * assembleMorningPrayer's note — Ash Wednesday's collect was appearing
     * under "The First Sunday in Lent").
     *
     * Fixing it here needs the seeded bcp_texts row, and this builder is
     * synchronous with no database access. The printable ordo grid is a
     * lower-stakes surface than the office, so it keeps the week's label
     * until someone threads a collect-title map through from the route.
     */
    collect: ld.sundayLabel,
    prayerForMission,
  };

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return {
    date: `${y}-${m}-${d}`,
    weekdayLabel: ld.weekdayLabel,
    sundayLabel: ld.sundayLabel,
    season: ld.season,
    morning,
    evening,
  };
}

export type OrdoCommonText = { label: string; ref: string | null; text: string };

// The office's fixed prayers — said the same way every day — fetched once from
// bcp_texts (plus the three rotating Concluding Blessings, which live in code).
// Printed beneath the weekly grid so the sheet stands on its own without the
// physical book. Order follows the office: the penitential opening, the
// confession of faith + Lord's Prayer, the two suffrage sets, the prayers for
// mission, the general thanksgiving, and the blessings.
const COMMON_TEXT_SPEC: Array<{ key: string; label: string; fallbackRef: string }> = [
  { key: "confession_text", label: "Confession of Sin", fallbackRef: "BCP p. 79" },
  { key: "confession_absolution", label: "The Absolution (said by a priest)", fallbackRef: "BCP p. 80" },
  { key: "apostles_creed", label: "The Apostles' Creed", fallbackRef: "BCP p. 96" },
  { key: "lords_prayer_contemporary", label: "The Lord's Prayer", fallbackRef: "BCP p. 97" },
  { key: "suffrages_a", label: "The Suffrages — A", fallbackRef: "BCP p. 97" },
  { key: "suffrages_b", label: "The Suffrages — B", fallbackRef: "BCP p. 98" },
  { key: "prayer_mission_1", label: "A Prayer for Mission — I", fallbackRef: "BCP p. 100" },
  { key: "prayer_mission_2", label: "A Prayer for Mission — II", fallbackRef: "BCP p. 100" },
  { key: "prayer_mission_3", label: "A Prayer for Mission — III", fallbackRef: "BCP p. 101" },
  { key: "general_thanksgiving", label: "The General Thanksgiving", fallbackRef: "BCP p. 101" },
];

export async function getOrdoCommonTexts(): Promise<OrdoCommonText[]> {
  const rows = await db
    .select()
    .from(bcpTextsTable)
    .where(inArray(bcpTextsTable.textKey, COMMON_TEXT_SPEC.map((s) => s.key)));
  const byKey = new Map(rows.map((r) => [r.textKey, r]));

  const out: OrdoCommonText[] = [];
  for (const spec of COMMON_TEXT_SPEC) {
    const row = byKey.get(spec.key);
    if (!row || !row.content || !row.content.trim()) continue;
    out.push({ label: spec.label, ref: row.bcpReference ?? spec.fallbackRef, text: row.content.trim() });
  }
  for (const b of CONCLUDING_BLESSINGS) {
    out.push({ label: "A Concluding Blessing", ref: b.ref, text: b.text });
  }
  return out;
}
