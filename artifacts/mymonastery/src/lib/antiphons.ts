/**
 * THE DAY'S ANTIPHON — the one line the office opens with.
 *
 * Owner, after watching Contemplative Outreach's app open a sit with a short
 * psalm verse: "what if we use antiphons from Morning and Evening Prayer".
 * Better than a curated list of psalm excerpts, for three reasons: they are
 * already ours (the office has prayed them since the app began), they are one
 * line, and they change with the church year on their own — so a threshold
 * into silence in Advent is not the same threshold as in Easter, with nothing
 * to pick and nothing to maintain.
 *
 * These are the BCP's INVITATORY antiphons, p. 80–82 — the same ten texts
 * seeded server-side as `antiphon_*` in seeds/bcpTexts.ts and chosen by the
 * same seasons `liturgicalCalendar.ts` chooses them by. They are duplicated
 * here rather than fetched deliberately: ten short public-domain lines, and a
 * sit must open with no network at all.
 *
 * KEEP IN STEP WITH THE SERVER. If a seeded antiphon text changes there, it
 * changes here — the office and the sit must not open with different words on
 * the same morning. `npx tsx scripts/antiphon-match.mjs` checks exactly that:
 * it runs antiphonForDay for a real date in each season and compares the
 * result to the server's own seeded text, plus Compline's against
 * assembleCompline. Run it if you touch either side.
 *
 * WHAT THESE ARE, AND WHAT THEY ARE NOT. An invitatory antiphon is a call to
 * praise — "Come let us adore him" — which is a different gesture from the
 * consenting verse a centering-prayer app opens with. Compline's antiphon
 * ("Guide us waking, O Lord, and guard us sleeping") is the one in the BCP
 * that is genuinely a settling text, and it is offered here for an evening
 * sit for exactly that reason. If the owner wants the whole thing to settle
 * rather than summon, COMPLINE is the row to reach for.
 */
import { getDay } from "@/lib/liturgical";
import type { LiturgicalSeason } from "@/lib/liturgical/types";

export type Antiphon = {
  /** The line itself. One sentence — it is read, not studied. */
  text: string;
  /** Where it comes from, shown small beneath. */
  source: string;
};

/** BCP p. 80–82. Mirrors seeds/bcpTexts.ts `antiphon_*`. */
const BY_SEASON: Record<LiturgicalSeason, Antiphon> = {
  advent: {
    text: "Our King and Savior now draws near: Come let us adore him.",
    source: "Antiphon for Advent · BCP p. 80",
  },
  christmas: {
    text: "Alleluia. To us a child is born: Come let us adore him. Alleluia.",
    source: "Antiphon for Christmas · BCP p. 80",
  },
  epiphany: {
    text: "The Lord has manifested his glory: Come let us adore him.",
    source: "Antiphon for Epiphany · BCP p. 80",
  },
  lent: {
    text: "The Lord is full of compassion and mercy: Come let us adore him.",
    source: "Antiphon for Lent · BCP p. 80",
  },
  holy_week: {
    text: "Christ humbled himself and became obedient to death: Come let us adore him.",
    source: "Antiphon for Holy Week · BCP p. 80",
  },
  easter: {
    text: "Alleluia. The Lord is risen indeed: Come let us adore him. Alleluia.",
    source: "Antiphon for Easter · BCP p. 80",
  },
  /**
   * "pentecost" IN THE CLIENT CALENDAR MEANS THE LONG GREEN SEASON AFTER IT,
   * not the Day of Pentecost — types.ts says so: "After Pentecost — Ordinary
   * Time (Trinity onward)". Mapping it to the Pentecost antiphon put "the
   * Spirit of the Lord fills the whole world. Alleluia" on an ordinary
   * Tuesday in September, which is what the season sweep caught. The server
   * agrees: liturgicalCalendar routes season_after_pentecost to
   * antiphon_anytime. Both green seasons get the ordinary antiphon.
   */
  pentecost: {
    text: "The earth is the Lord's, for he made it: Come let us adore him.",
    source: "Antiphon · BCP p. 82",
  },
  ordinary: {
    text: "The earth is the Lord's, for he made it: Come let us adore him.",
    source: "Antiphon · BCP p. 82",
  },
};

/**
 * Compline's. Kept for the client/server match check (scripts/antiphon-match)
 * and for anyone who wants it; the sit itself no longer uses it — see
 * EVENING_ANTIPHONS.
 */
export const COMPLINE_ANTIPHON: Antiphon = {
  text: "Guide us waking, O Lord, and guard us sleeping; that awake we may watch with Christ, and asleep we may rest in peace.",
  source: "Antiphon at Compline · BCP p. 132",
};

/**
 * The antiphon for a given day.
 *
 * `side` picks the register rather than the text's season: an evening sit
 * opens with one of Evening Prayer's night sentences, a morning one with the
 * day's invitatory.
 *
 * THREE DAYS A YEAR ARE DELIBERATELY APPROXIMATE. Ascension, the Day of
 * Pentecost and Trinity Sunday each have their own antiphon in the office,
 * and the client calendar reports all three inside a containing season
 * (Ascension and Pentecost inside "easter", Trinity inside "pentecost"). They
 * are not split here: the alternative is a second copy of
 * liturgicalCalendar's Easter arithmetic, living on the client, drifting from
 * the server's, for one line on three days. If they are ever wanted, take the
 * key from the SERVER rather than recomputing it.
 */
/**
 * THE GREEN SEASONS ROTATE (owner, 2026-09-10: "make sure the contemplative
 * prayer is rotating antiphons"). Ordinary time runs for months, and one line
 * for months is not a threshold, it is wallpaper. The BCP gives THREE
 * invitatory antiphons for "other Sundays and weekdays" (p. 82); the office
 * seeds only one of them (antiphon_anytime), so the sit takes turns through
 * all three, one per day, in the book's own order. Seasons with a single
 * antiphon keep it — Advent is Advent every morning, and that sameness is the
 * season's own.
 */
export const ORDINARY_ANTIPHONS: readonly Antiphon[] = [
  BY_SEASON.ordinary,
  {
    text: "Worship the Lord in the beauty of holiness: Come let us adore him.",
    source: "Antiphon · BCP p. 82",
  },
  {
    text: "The mercy of the Lord is everlasting: Come let us adore him.",
    source: "Antiphon · BCP p. 82",
  },
];

/**
 * THE EVENING ROTATES TOO. Evening Prayer has no invitatory antiphons; what
 * it has is its opening sentences (BCP p. 115–116), the short scriptural lines
 * the office begins with. An evening sit takes turns through the ones that
 * are themselves about the night — the ones that settle rather than summon.
 * Each is one or two sentences, and each names where it is from.
 *
 * NOT Compline's antiphon (owner, 2026-09-10: "don't use Compline antiphons
 * for the contemplation"). Compline is its own office in this app, and its
 * "Guide us waking" belongs to it; the sit keeps to Morning and Evening
 * Prayer, which is what was asked for in the first place.
 */
export const EVENING_ANTIPHONS: readonly Antiphon[] = [
  {
    text: "Let my prayer be set forth in your sight as incense, the lifting up of my hands as the evening sacrifice.",
    source: "Psalm 141:2 · Evening Prayer, BCP p. 115",
  },
  {
    text: "I will bless the Lord who gives me counsel; my heart teaches me, night after night. I have set the Lord always before me; because he is at my right hand I shall not fall.",
    source: "Psalm 16:7, 8 · Evening Prayer, BCP p. 115",
  },
  {
    text: "Yours is the day, O God, yours also the night; you established the moon and the sun. You fixed all the boundaries of the earth; you made both summer and winter.",
    source: "Psalm 74:15, 16 · Evening Prayer, BCP p. 115",
  },
  {
    text: "Darkness is not dark to you, O Lord; the night is as bright as the day; darkness and light to you are both alike.",
    source: "Psalm 139:11 · Evening Prayer, BCP p. 116",
  },
];

/**
 * Day of the year, 0-based — the rotation's clock. Calendar arithmetic, not
 * millisecond arithmetic: a local-time subtraction across a daylight-saving
 * change is an hour short and floors to the previous day.
 */
function dayOfYear(d: Date): number {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86_400_000);
}

export function antiphonForDay(d: Date = new Date(), side: "morning" | "evening" = "morning"): Antiphon {
  const n = dayOfYear(d);
  if (side === "evening") return EVENING_ANTIPHONS[n % EVENING_ANTIPHONS.length]!;
  const season = getDay(d).season;
  if (season === "ordinary" || season === "pentecost") return ORDINARY_ANTIPHONS[n % ORDINARY_ANTIPHONS.length]!;
  return BY_SEASON[season] ?? BY_SEASON.ordinary;
}
