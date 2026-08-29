// ─── The Way of Love — a guided audio course ─────────────────────────────────
//
// Bishop Mariann Budde's "The Way of Love: A Rule of Life" — an 8-part series
// (an introduction + the seven practices: Turn, Learn, Pray, Worship, Bless,
// Go, Rest). The audio is already in Phoebe as the `experiencing-jesus` podcast
// show, so this course is a structured overlay on that feed: it defines the
// units/lessons and pastoral copy, then resolves each lesson to a live episode
// from GET /api/podcasts/show/experiencing-jesus and plays it in Phoebe's
// podcast player. Completion is tracked device-locally (see courseProgress.ts).

// Mirrors the server's EpisodeFull shape (routes/podcast.ts).
export interface PodcastEpisode {
  id: string;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  description: string | null;
  imageUrl: string | null;
}

export interface WolLesson {
  /** Stable id used for progress (independent of the feed). */
  key: string;
  /** The practice this lesson covers ("Turn", "Learn", …) or "Begin". */
  practice: string;
  emoji: string;
  /** One-line description of the practice. */
  blurb: string;
  /** Lowercased substrings that identify this lesson's episode by title. */
  match: string[];
}

export interface WolUnit {
  id: string;
  title: string;
  blurb: string;
  lessons: WolLesson[];
}

export interface WolCourse {
  id: string;
  /** The podcast show slug this course draws its audio from. */
  showSlug: string;
  title: string;
  author: string;
  tagline: string;
  units: WolUnit[];
}

export const WAY_OF_LOVE: WolCourse = {
  id: "way-of-love",
  showSlug: "experiencing-jesus",
  title: "The Way of Love",
  author: "Bishop Mariann Budde",
  tagline:
    "A rule of life for following Jesus — Bishop Mariann walks the seven practices, one talk at a time.",
  units: [
    {
      id: "begin",
      title: "Begin Here",
      blurb: "An invitation into the Way of Love as a rule of life.",
      lessons: [
        {
          key: "intro",
          practice: "The Way of Love",
          emoji: "❤️",
          blurb: "Spiritual practices for a Jesus-focused life.",
          match: ["spiritual practices", "jesus-focused", "ep. 1", "ep 1"],
        },
      ],
    },
    {
      id: "practices",
      title: "The Seven Practices",
      blurb: "Turn · Learn · Pray · Worship · Bless · Go · Rest.",
      lessons: [
        {
          key: "turn",
          practice: "Turn",
          emoji: "🔄",
          blurb: "Pause, listen, and turn toward Jesus.",
          match: ["turn"],
        },
        {
          key: "learn",
          practice: "Learn",
          emoji: "📖",
          blurb: "Reflect on Scripture — especially the life and teachings of Jesus.",
          match: ["to learn", "learn"],
        },
        {
          key: "pray",
          practice: "Pray",
          emoji: "🙏🏽",
          blurb: "Dwell intentionally with God each day.",
          match: ["to pray", "pray"],
        },
        {
          key: "worship",
          practice: "Worship",
          emoji: "🕊️",
          blurb: "Gather in community to thank, praise, and dwell with God.",
          match: ["to worship", "worship"],
        },
        {
          key: "bless",
          practice: "Bless",
          emoji: "🤲🏽",
          blurb: "Share your faith and give of yourself in love.",
          match: ["to bless", "bless"],
        },
        {
          key: "go",
          practice: "Go",
          emoji: "🚶🏽",
          blurb: "Cross boundaries, listen deeply, and live like Jesus.",
          match: ["to go", "go"],
        },
        {
          key: "rest",
          practice: "Rest",
          emoji: "🌙",
          blurb: "Receive the gift of Sabbath — grace and rest.",
          match: ["to rest", "rest"],
        },
      ],
    },
  ],
};

// Flat ordered lesson list (course order) — for counts + next/prev.
export const WOL_LESSONS: WolLesson[] = WAY_OF_LOVE.units.flatMap((u) => u.lessons);
export const WOL_TOTAL = WOL_LESSONS.length;

/**
 * Map each lesson to a concrete episode from the fetched feed. Matches by title
 * keyword first (robust to feed reordering); any lesson left unmatched is filled
 * from the remaining episodes in chronological (oldest-first) order.
 */
export function resolveWolEpisodes(
  episodes: PodcastEpisode[],
): Record<string, PodcastEpisode | undefined> {
  const norm = (s: string | null) => (s ?? "").toLowerCase();
  const used = new Set<string>();
  const out: Record<string, PodcastEpisode | undefined> = {};

  for (const lesson of WOL_LESSONS) {
    const ep = episodes.find(
      (e) => !used.has(e.id) && lesson.match.some((w) => norm(e.title).includes(w)),
    );
    if (ep) {
      out[lesson.key] = ep;
      used.add(ep.id);
    }
  }

  // Fallback for anything unmatched → chronological order.
  if (WOL_LESSONS.some((l) => !out[l.key])) {
    const oldestFirst = [...episodes].sort(
      (a, b) =>
        new Date(a.publishedAt ?? 0).getTime() - new Date(b.publishedAt ?? 0).getTime(),
    );
    let i = 0;
    for (const lesson of WOL_LESSONS) {
      if (out[lesson.key]) continue;
      while (i < oldestFirst.length && used.has(oldestFirst[i]!.id)) i++;
      if (i < oldestFirst.length) {
        out[lesson.key] = oldestFirst[i];
        used.add(oldestFirst[i]!.id);
        i++;
      }
    }
  }

  return out;
}

/** mm:ss / h:mm:ss for a duration in seconds. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
