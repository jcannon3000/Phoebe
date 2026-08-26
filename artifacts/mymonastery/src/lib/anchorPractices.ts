/**
 * Contemplative practices that can BE a side's anchor.
 *
 * Owner: "have them either be able to input their own or ... choose
 * contemplative practice, which could include Audio Divina ... the framework
 * that the Audio Divina could be your morning or evening anchor. And if it's
 * going to be the anchor, it has ... morning and then the contemplative
 * practice — a morning Contemplative Walk, morning Audio Divina."
 *
 * The customizer's "Create your own" slide already offered these as quick
 * picks, but choosing one only stored its NAME: the anchor became a generic
 * tap-to-mark-done card called "Audio Divina" that had nothing to do with the
 * real Audio Divina. Someone whose morning prayer IS sacred listening got a
 * checkbox instead of the practice.
 *
 * Matching on the name is deliberate. A side's custom anchor is stored as a
 * free-text name (phoebe:office:custom-name:<side>), and that is the shape
 * every other surface already reads; adding a parallel "which practice is
 * this" key would mean two sources of truth for one answer, and the first
 * rename would put them out of step.
 */
export type AnchorPractice = {
  /** The rhythm key this practice completes as. */
  key: "listening" | "cobreathe" | "walk" | "visio";
  emoji: string;
  /** Where the card goes. Empty = no page of its own; tap logs it instead. */
  href: string;
};

// Keyed by the exact labels the customizer's quick picks write.
const BY_NAME: Record<string, AnchorPractice> = {
  "audio divina": { key: "listening", emoji: "🎵", href: "/listening" },
  "creation prayer": { key: "cobreathe", emoji: "🌍", href: "/cobreathe" },
  // A walk has no screen to sit on — it's logged when you come back, the same
  // way the standalone Contemplative Walk card works.
  "contemplative walk": { key: "walk", emoji: "🚶", href: "" },
  // Reported: "I tried to make Visio Divina my evening practice and it didn't
  // work." It was missing from this map, so choosing it as a side's anchor
  // stored a name that resolved to no practice — a bare tap-to-mark card
  // called "Visio Divina" that had nothing to do with the real one.
  "visio divina": { key: "visio", emoji: "🖼️", href: "/visio" },
};

/** The practice a side's custom anchor NAMES, if it names one at all. */
export function anchorPracticeFor(name: string | null | undefined): AnchorPractice | null {
  if (!name) return null;
  return BY_NAME[name.trim().toLowerCase()] ?? null;
}
