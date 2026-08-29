// Owner-chosen stand-ins for Sundays the VCS has no exhibition for.
//
// A handful of Sundays appoint a passage the Visual Commentary simply hasn't
// published on. Verified against a complete harvest — 230 New Testament
// exhibitions, every book meeting the count VCS publishes on its own index —
// by reference, by title keyword, and by direct URL probing. They are absent,
// not missed.
//
// But absent-by-reference is not the same as absent-by-SUBJECT, which is the
// owner's point: "look for the theme of the image, it might be in another
// place", and then, finding one himself, "what about using things like this for
// john the baptist — https://thevcs.org/misidentifying-prophet".
//
// He is right. Mark 1:1-8 and John 1:19-31 are different evangelists on the
// same man at the same moment: the forerunner in the wilderness, asked who he
// is. No reference matcher can see that, because they share no book, chapter or
// verse. A person can see it instantly.
//
// So this table is deliberately HUMAN. It is not a fallback rule and should
// never be generated: each row is a judgement that two passages are about the
// same thing, and the right author of that judgement is the owner, not a
// heuristic that will one day pair a parable with a coincidence of wording.
// Where no row exists the practice degrades as it already does — nearest
// passage in the same chapter, honestly labelled.

export type VisioSubstitute = {
  /** The appointed passage that has no exhibition of its own. */
  appointed: string;
  /** The VCS exhibition to show instead, as a path on thevcs.org. */
  exhibition: string;
  /** The passage that exhibition IS about — shown rather than the appointed
   *  one, so the deck never claims to be showing a reading it isn't. */
  shows: string;
  /** Why these two belong together, in plain words. Displayed nowhere yet;
   *  written down so the pairing can be reviewed rather than trusted. */
  because: string;
};

export const VISIO_SUBSTITUTES: VisioSubstitute[] = [
  {
    appointed: "Mark 1:1-8",
    exhibition: "/misidentifying-prophet",
    shows: "John 1:19-31",
    because:
      "John the Baptist in the wilderness, asked who he is. Mark opens his gospel "
      + "with it and John tells it as the interrogation by the priests and Levites; "
      + "the figure, the place and the moment are the same. Owner's own pairing.",
  },
];

/** The stand-in for an appointed passage, if the owner has named one. */
export function substituteFor(appointed: string): VisioSubstitute | null {
  const want = appointed.trim().toLowerCase();
  return VISIO_SUBSTITUTES.find((s) => s.appointed.toLowerCase() === want) ?? null;
}
