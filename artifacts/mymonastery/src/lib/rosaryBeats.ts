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
  | { kind: "prayer"; eyebrow: string; title: string; body: string; note?: string; artId?: number }
  | { kind: "mystery"; mystery: Mystery; decade: number }
  | { kind: "repeat"; times: number; eyebrow: string; title: string; body: string; note?: string; decade?: number }
  | { kind: "versicle"; eyebrow: string; v: string; r: string; note?: string }
  | { kind: "circle" }
  | { kind: "closing" };

export function ordinal(n: number): string {
  return ["first", "second", "third", "fourth", "fifth"][n - 1] ?? `${n}`;
}
export function cap(x: string): string { return x.replace(/^./, (c) => c.toUpperCase()); }

/**
 * SAY IT HOW MANY TIMES? A repeat slide shows the prayer ONCE with the bead
 * count above it, which is right for anyone who has prayed a rosary before
 * and silently wrong for anyone who has not: read the Hail Mary, tap Continue,
 * and you have prayed a decade of one. The count line stays "10 beads" (the
 * owner's word — it is what your hand is holding), and the rubric under the
 * prayer now says the number out loud.
 *
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
    { kind: "prayer", eyebrow: "On the crucifix", title: "The Sign of the Cross", body: SIGN_OF_THE_CROSS,
      note: "Take the crucifix between your fingers. The rosary begins and ends here." },
    { kind: "prayer", eyebrow: "On the crucifix", title: "The Apostles' Creed", body: APOSTLES_CREED,
      note: "Still holding the crucifix — you have not moved to the beads yet." },
    { kind: "prayer", eyebrow: "On the first large bead", title: "Our Father", body: OUR_FATHER,
      note: "Move up from the crucifix to the single large bead above it." },
    {
      kind: "repeat", times: OPENING_INTENTIONS.length,
      eyebrow: "On the next three beads", title: "Hail Mary", body: HAIL_MARY,
      note: `The three small beads in a row above it. Say it three times — one ${OPENING_INTENTIONS.join(", one ")}.`,
    },
    { kind: "prayer", eyebrow: "Before the first decade", title: "Glory be", body: GLORY_BE,
      // Audit 2026-09-10: there is NO bead for this one — after the three small
      // beads the chain runs straight to the medal, and the Glory Be is said on
      // the way. "One more bead brings you to the medal" sent the hand looking
      // for a bead that is not there.
      note: "There is no bead for this one: say it on the chain, on the way up to the medal, where the loop begins. The five decades go round from there." },
  ];
  for (const m of def.mysteries) {
    beats.push({ kind: "mystery", mystery: m, decade: m.n });
    beats.push({
      kind: "prayer", eyebrow: "On the large bead", title: "Our Father", body: OUR_FATHER,
      note: m.n === 1
        ? "The first large bead on the loop, just past the medal."
        : "The large bead your fingers have just reached, at the head of this decade.",
    });
    beats.push({
      kind: "repeat", times: BEADS_PER_DECADE, eyebrow: m.title, title: "Hail Mary", body: HAIL_MARY,
      note: "Say it ten times, once on each small bead, holding the mystery.", decade: m.n,
    });
    beats.push({
      kind: "prayer", eyebrow: "After the ten beads", title: "Glory be", body: GLORY_BE,
      note: m.n === 5
        ? "The tenth bead of the last decade. The loop is closed."
        : "You are at the end of this decade, on the chain before the next large bead.",
    });
    // The Fatima prayer is a twentieth-century addition, prayed very widely
    // and required nowhere. Saying so is the honest rubric, and it means
    // nobody wonders whether Continue is skipping something.
    beats.push({
      kind: "prayer", eyebrow: "After the Glory be", title: "O my Jesus", body: FATIMA_PRAYER,
      note: "Widely prayed, and optional — continue if you don't use it.",
    });
  }
  beats.push({
    kind: "prayer", eyebrow: "On the medal", title: "Hail, holy Queen", body: HAIL_HOLY_QUEEN,
    note: "Round the loop and back to the medal you set out from.",
  });
    beats.push({
    kind: "versicle", eyebrow: "Said and answered", v: CONCLUDING_VERSICLE, r: CONCLUDING_RESPONSE,
    // ℣ and ℟ are two glyphs a first-timer has never met. Praying alone you
    // say both — which is the one thing the marks do not tell you.
    note: "Praying alone, say both lines. ℣ is the line that calls, ℟ the one that answers.",
  });
  beats.push({ kind: "prayer", eyebrow: "Let us pray", title: "The Concluding Prayer", body: CONCLUDING_PRAYER });
  beats.push({
    kind: "prayer", eyebrow: "On the crucifix", title: "The Sign of the Cross", body: SIGN_OF_THE_CROSS,
    note: "Back down the short chain to the crucifix, where you began.",
  });
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
    { kind: "prayer", eyebrow: "On the cross", title: "The Sign of the Cross", body: def.cross,
      note: "Take the cross between your fingers. The circle begins and ends here." },
    { kind: "prayer", eyebrow: "On the invitatory bead", title: "The Invitatory", body: def.invitatory,
      note: "The single bead between the cross and the circle. You come back to it at the head of each time round, and once more at the end." },
  ];
  for (let w = 1; w <= WEEKS_PER_CIRCLE; w++) {
    beats.push({
      kind: "prayer", eyebrow: `On the ${ordinal(w)} cruciform bead`, title: def.cruciformTitle, body: def.cruciform,
      // One picture per cruciform bead, so a circuit moves through all four
      // the way a Roman decade moves through a mystery. Fixed to the bead
      // rather than the circuit, so every time round shows the same four in
      // the same places — the circle is meant to become familiar.
      artId: def.artIds?.[(w - 1) % def.artIds.length],
      note: w === 1
        ? "Move onto the circle. The four large beads spaced around it make a cross within the ring — this is the first."
        : "The next large bead round the circle, a quarter turn on.",
    });
    beats.push({
      kind: "repeat", times: BEADS_PER_WEEK, eyebrow: `The ${ordinal(w)} week`, title: def.weekTitle, body: def.week,
      note: `Say it seven times, once on each bead of the ${ordinal(w)} week.`, decade: w,
    });
  }
  beats.push({ kind: "circle" });
  beats.push({
    kind: "prayer", eyebrow: "Back on the invitatory bead", title: "The Lord's Prayer", body: ANGLICAN_CLOSING_PRAYER,
    note: "Off the circle and back down to the bead you set out from — the hundredth prayer.",
  });
  beats.push({
    kind: "prayer", eyebrow: "On the cross", title: "The Blessing", body: ANGLICAN_DISMISSAL,
    note: "Back to the cross, where you began.",
  });
  beats.push({ kind: "closing" });
  return beats;
}

