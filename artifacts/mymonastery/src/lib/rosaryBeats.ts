/**
 * THE ORDER OF THE BEADS — what is prayed, in what order, on which bead.
 *
 * Lifted out of pages/rosary.tsx so the SEQUENCE can be run and checked
 * without mounting React: the rubrics are the part of this feature most
 * easily got wrong and least visible when they are (a missing direction looks
 * like an empty line, not like an error), and a deck of thirty-six beats is
 * not something to verify by scrolling past it.
 */
import {
  MYSTERY_SETS, type MysterySet, type Mystery,
  SIGN_OF_THE_CROSS, APOSTLES_CREED, OUR_FATHER, HAIL_MARY, GLORY_BE,
  FATIMA_PRAYER, HAIL_HOLY_QUEEN, OPENING_INTENTIONS, BEADS_PER_DECADE,
  CONCLUDING_VERSICLE, CONCLUDING_RESPONSE, CONCLUDING_PRAYER,
  ANGLICAN_SETS, ANGLICAN_CLOSING_PRAYER, ANGLICAN_DISMISSAL,
  BEADS_PER_WEEK, WEEKS_PER_CIRCLE, type AnglicanSet,
} from "@/lib/rosary";

/** Which set of beads is in your hand. */
export type Form = "roman" | "anglican";

/**
 * A beat of the deck.
 *
 * `repeat` is a prayer said N times on N beads — see the header.
 * `versicle` is a said-and-answered pair, which the first build rendered by
 * stuffing the versicle into the EYEBROW slot: "PRAY FOR US, O HOLY MOTHER OF
 * GOD" set at ten pixels in letterspaced small caps, which reads as a label
 * for the slide rather than as half of a prayer you say aloud.
 * `circle` is the Anglican rosary's "round again" — see buildAnglicanBeats.
 */
export type Beat =
  | { kind: "prayer"; eyebrow: string; title: string; body: string; note?: string }
  | { kind: "mystery"; mystery: Mystery; decade: number }
  | { kind: "repeat"; times: number; eyebrow: string; title: string; body: string; note?: string; decade?: number }
  | { kind: "versicle"; eyebrow: string; v: string; r: string }
  | { kind: "circle" }
  | { kind: "closing" };

export function ordinal(n: number): string {
  return ["first", "second", "third", "fourth", "fifth"][n - 1] ?? `${n}`;
}
export function cap(x: string): string { return x.replace(/^./, (c) => c.toUpperCase()); }

/**
 * THE DIRECTIONS ARE THE POINT (owner: "audit to make sure the directions are
 * being shown properly — all the instructions").
 *
 * The first build put a SECTION LABEL in the eyebrow — "The first decade" over
 * the Our Father, the Glory be and the Fatima prayer alike — which says where
 * you are but never what to do, and left the opening Glory be with no eyebrow
 * at all. A rosary is prayed with an object in your hand, and the received
 * form tells you which bead each prayer belongs to: the crucifix, the first
 * large bead, the three, the large bead of a decade, the ten small ones, the
 * medal. Those are the eyebrows now. Where you are is in the nav bar's
 * section label, which is what a counter is for.
 */
export function buildRomanBeats(set: MysterySet): Beat[] {
  const def = MYSTERY_SETS[set];
  const beats: Beat[] = [
    { kind: "prayer", eyebrow: "On the crucifix", title: "The Sign of the Cross", body: SIGN_OF_THE_CROSS },
    { kind: "prayer", eyebrow: "On the crucifix", title: "The Apostles' Creed", body: APOSTLES_CREED },
    { kind: "prayer", eyebrow: "On the first large bead", title: "Our Father", body: OUR_FATHER },
    {
      kind: "repeat", times: OPENING_INTENTIONS.length,
      eyebrow: "On the next three beads", title: "Hail Mary", body: HAIL_MARY,
      note: `One ${OPENING_INTENTIONS.join(", one ")}.`,
    },
    { kind: "prayer", eyebrow: "Before the first decade", title: "Glory be", body: GLORY_BE },
  ];
  for (const m of def.mysteries) {
    beats.push({ kind: "mystery", mystery: m, decade: m.n });
    beats.push({ kind: "prayer", eyebrow: "On the large bead", title: "Our Father", body: OUR_FATHER });
    beats.push({
      kind: "repeat", times: BEADS_PER_DECADE, eyebrow: m.title, title: "Hail Mary", body: HAIL_MARY,
      note: "On the ten small beads, holding the mystery.", decade: m.n,
    });
    beats.push({ kind: "prayer", eyebrow: "After the ten beads", title: "Glory be", body: GLORY_BE });
    // The Fatima prayer is a twentieth-century addition, prayed very widely
    // and required nowhere. Saying so is the honest rubric, and it means
    // nobody wonders whether Continue is skipping something.
    beats.push({
      kind: "prayer", eyebrow: "After the Glory be", title: "O my Jesus", body: FATIMA_PRAYER,
      note: "Widely prayed, and optional — continue if you don't use it.",
    });
  }
  beats.push({ kind: "prayer", eyebrow: "On the medal", title: "Hail, holy Queen", body: HAIL_HOLY_QUEEN });
  beats.push({ kind: "versicle", eyebrow: "Said and answered", v: CONCLUDING_VERSICLE, r: CONCLUDING_RESPONSE });
  beats.push({ kind: "prayer", eyebrow: "Let us pray", title: "The Concluding Prayer", body: CONCLUDING_PRAYER });
  beats.push({ kind: "prayer", eyebrow: "On the crucifix", title: "The Sign of the Cross", body: SIGN_OF_THE_CROSS });
  beats.push({ kind: "closing" });
  return beats;
}

/**
 * THE ANGLICAN CIRCLE, BUILT ONCE AND WALKED THREE TIMES.
 *
 * The four cruciform beads and their four weeks are laid out once; the
 * `circle` beat at the end sends you back to the first cruciform until the
 * three circuits are done (see onCircle in the page). Building 3 × 8 identical
 * slides instead would be the fifty-three-Hail-Marys mistake in another key —
 * on THIS form the words don't even change between circuits, which is the
 * whole point of it, so a flat list would be twenty-four screens of the same
 * two sentences with nothing to say how far round you were.
 */
export function buildAnglicanBeats(key: AnglicanSet): Beat[] {
  const def = ANGLICAN_SETS[key];
  const beats: Beat[] = [
    { kind: "prayer", eyebrow: "On the cross", title: "The Sign of the Cross", body: def.cross },
    { kind: "prayer", eyebrow: "On the invitatory bead", title: "The Invitatory", body: def.invitatory },
  ];
  for (let w = 1; w <= WEEKS_PER_CIRCLE; w++) {
    beats.push({
      kind: "prayer", eyebrow: `On the ${ordinal(w)} cruciform bead`, title: def.cruciformTitle, body: def.cruciform,
      note: w === 1 ? "The four cruciform beads make the cross within the circle." : undefined,
    });
    beats.push({
      kind: "repeat", times: BEADS_PER_WEEK, eyebrow: `The ${ordinal(w)} week`, title: def.weekTitle, body: def.week,
      note: `On the seven beads of the ${ordinal(w)} week.`, decade: w,
    });
  }
  beats.push({ kind: "circle" });
  beats.push({ kind: "prayer", eyebrow: "Back on the invitatory bead", title: "The Lord's Prayer", body: ANGLICAN_CLOSING_PRAYER });
  beats.push({ kind: "prayer", eyebrow: "On the cross", title: "The Blessing", body: ANGLICAN_DISMISSAL });
  beats.push({ kind: "closing" });
  return beats;
}

