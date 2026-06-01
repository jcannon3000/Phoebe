/**
 * "Traveling the Way of Love" (The Episcopal Church, Season One) — the video
 * library the /videos page lists. The episodes are documentary visits to
 * ministries, each paired to the Way of Love practice it best embodies. Kept
 * as a flat, ordered list so the page renders straight from it.
 *
 * NOTE: the per-practice detail screen (home-beta-section.tsx) keeps its own
 * section→videos map for the inline "Watch" embed; if you add an episode,
 * update both. (They share the same Wistia channel, wkxcjht52w.)
 */
import type { SectionKey } from "@/pages/home-beta";

export type WayOfLoveVideo = {
  id: string;          // Wistia media id
  section: SectionKey; // the practice this episode is paired to
  emoji: string;
  title: string;
  label?: string;      // sub-practice tag for combined sections ("Learn" / "Pray")
  blurb: string;       // one line for the library list
};

export const SERIES_TITLE = "Traveling the Way of Love";

// Order: Turn (the trailer) first, then the daily Learn & Pray pair, then the
// weekly practices — mirrors the rule's own ordering on the home/weekly pages.
export const WAY_OF_LOVE_VIDEOS: WayOfLoveVideo[] = [
  { id: "trfrpfx6q1", section: "turn",       emoji: "🔄", title: "Series trailer",                blurb: "Come along as we begin the journey." },
  { id: "u04ilt0dvb", section: "learn_pray", emoji: "📖", title: "Presiding Bishop Michael Curry", label: "Learn", blurb: "Why the Way of Love — a teaching to begin." },
  { id: "q4zzab2h1y", section: "learn_pray", emoji: "🙏", title: "Pop Up Prayer",                  label: "Pray",  blurb: "Prayer carried into the life of the city." },
  { id: "pisvfusoig", section: "worship",    emoji: "⛪", title: "St. Lydia's, Brooklyn",          blurb: "Dinner church — worship around the table." },
  { id: "2ckcg82pkz", section: "bless",      emoji: "🤲", title: "Thistle Farms, Nashville",       blurb: "Radical love and welcome for survivors." },
  { id: "b1l0elf3jd", section: "go",         emoji: "🌍", title: "Bishop Walker School",           blurb: "Crossing boundaries to serve and teach." },
  { id: "duye4nftap", section: "rest",       emoji: "🌙", title: "Honoré Farm & Mill",             blurb: "Sabbath and restoration on the land." },
];

export function wistiaEmbedUrl(id: string, autoPlay = false): string {
  return `https://fast.wistia.net/embed/iframe/${id}?seo=false&videoFoam=true${autoPlay ? "&autoPlay=true" : ""}`;
}
