/**
 * Visio Divina — the artworks, and why each one is safe to ship.
 *
 * ── The licensing shape, which decides the whole design ──
 *
 * Vanderbilt's Art in the Christian Tradition (ACT) is an INDEX, not a rights
 * holder. Each artwork page names a "copyright source" and says, in as many
 * words, to go there for reuse terms. For the pieces below that source is
 * Wikimedia Commons, and the works themselves are centuries out of copyright —
 * a faithful photographic reproduction of a flat public-domain painting carries
 * no new copyright of its own.
 *
 * So: only works whose ORIGINAL is unambiguously public domain, sourced from
 * Commons, bundled here rather than hot-linked from anyone's server. ACT's own
 * attribution line is reproduced on the closing slide because they ask for it
 * and because saying where a thing came from is the least a prayer app can do.
 *
 * Do NOT add an artwork here without checking its own rights. "It's on ACT" is
 * not a licence — ACT indexes plenty it does not own.
 *
 * ── The metadata is the point ──
 *
 * ACT tags each work to scripture passages AND to lectionary days (Year A/B/C,
 * Trinity Sunday, Proper 11…). That is what lets the image follow the day
 * rather than being a gallery on shuffle. `days` is unused in this first pass —
 * the rotation is date-keyed — but it is recorded now so the lectionary-aware
 * version doesn't have to re-gather it.
 */
import rublevTrinity from "@/assets/visio/rublev-trinity.jpg";

export type Artwork = {
  id: string;
  title: string;
  artist: string;
  /** Roughly when it was made — shown quietly under the title. */
  date: string;
  where: string;
  image: string;
  /** The passage to read against it. */
  scriptureRef: string;
  scripture: string;
  /** One question, for the looking. Not a study guide. */
  prompt: string;
  /** ACT's requested citation, reproduced verbatim on the closing slide. */
  attribution: string;
  /** ACT's own page, and the Visual Commentary essay where one exists. */
  actUrl: string;
  essayUrl?: string;
  /** Lectionary days ACT maps this to. Unused in this pass — see the note above. */
  days?: string[];
};

export const VISIO_ARTWORKS: Artwork[] = [
  {
    id: "rublev-trinity",
    title: "The Hospitality of Abraham",
    artist: "Andrei Rublev",
    date: "c. 1420",
    where: "Tretyakov Gallery, Moscow",
    image: rublevTrinity,
    scriptureRef: "Genesis 18:1–5",
    scripture:
      "The Lord appeared to Abraham by the oaks of Mamre, as he sat at the entrance of his tent in the heat of the day. He looked up and saw three men standing near him. When he saw them, he ran from the tent entrance to meet them, and bowed down to the ground. He said, “My lord, if I find favour with you, do not pass by your servant. Let a little water be brought, and wash your feet, and rest yourselves under the tree.”",
    prompt: "There is an empty place at this table, on the side nearest you. Sit in it a while.",
    attribution:
      "Rublev, Andreĭ, Saint, -approximately 1430. Hospitality of Abraham, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons.",
    actUrl: "https://act.library.vanderbilt.edu/artworks/58465",
    essayUrl: "https://thevcs.org/hospitality-abraham",
    days: ["Trinity Sunday (A, B, C)", "Proper 6 (A)", "Proper 11 (C)"],
  },
];

/**
 * Today's artwork.
 *
 * Date-keyed, not random: everyone praying on the same day is looking at the
 * same image, and re-opening the practice doesn't shuffle it out from under
 * someone mid-prayer. Same reasoning as the office's date-keyed rotations.
 */
export function artworkForDay(ymd: string): Artwork {
  const days = Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
  const i = Number.isFinite(days) ? ((days % VISIO_ARTWORKS.length) + VISIO_ARTWORKS.length) % VISIO_ARTWORKS.length : 0;
  return VISIO_ARTWORKS[i]!;
}
