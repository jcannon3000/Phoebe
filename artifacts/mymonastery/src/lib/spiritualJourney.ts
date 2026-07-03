// ─── The Spiritual Journey — a guided video course ───────────────────────────
//
// Fr. Thomas Keating's classic "Spiritual Journey" series, arranged as a
// Coursera-style course: units → lessons (talks) → parts (individual videos).
// The source is a public YouTube playlist; we play each video in-app via the
// YouTube IFrame API and track completion locally (see lib/courseProgress.ts).
//
// Playlist: https://www.youtube.com/playlist?list=PLBE6fmRmYU8g6CAOwq4-IEvpSnbBxKfRO
//
// Ordering below is the playlist order. Titles are cleaned for display (the
// original videos are suffixed "…, with Thomas Keating" and the talks carry
// "0a. / 0b. / 1a. …" numbering, which we fold into lesson/part structure).

export interface JourneyPart {
  /** YouTube video id. */
  id: string;
  /** "Part 1", "Part 2", … within the lesson. */
  label: string;
}

export interface JourneyLesson {
  /** Clean talk title, e.g. "Prayer as Relating to God". */
  title: string;
  /** The talk's number in Keating's series ("0", "1", … "28"); undefined for
   *  the two introductory sets (Method / Psychological Experience). */
  talk?: string;
  parts: JourneyPart[];
}

export interface JourneyUnit {
  /** Stable slug for the unit (used in progress + anchors). */
  id: string;
  /** Short unit name. */
  title: string;
  /** One-line pastoral description. */
  blurb: string;
  lessons: JourneyLesson[];
}

export interface JourneyCourse {
  id: string;
  title: string;
  author: string;
  tagline: string;
  playlistUrl: string;
  units: JourneyUnit[];
}

export const SPIRITUAL_JOURNEY: JourneyCourse = {
  id: "spiritual-journey",
  title: "The Spiritual Journey",
  author: "Fr. Thomas Keating",
  tagline:
    "A contemplative course on Centering Prayer and the healing of the whole person — walked one talk at a time.",
  playlistUrl:
    "https://www.youtube.com/playlist?list=PLBE6fmRmYU8g6CAOwq4-IEvpSnbBxKfRO",
  units: [
    {
      id: "method",
      title: "The Method",
      blurb:
        "The simple practice at the heart of it all — how to sit in Centering Prayer.",
      lessons: [
        {
          title: "The Method of Centering Prayer",
          parts: [
            { id: "5FWvxwfN_CE", label: "Part 1" },
            { id: "pX6XtDuRaqY", label: "Part 2" },
          ],
        },
      ],
    },
    {
      id: "psychological",
      title: "The Psychological Experience",
      blurb:
        "What actually happens within us as we consent to God's presence and action.",
      lessons: [
        {
          title: "The Psychological Experience of Centering Prayer",
          parts: [
            { id: "GwBH89wZLLw", label: "Part 1" },
            { id: "-WwEzLlgzf4", label: "Part 2" },
            { id: "nhcvUUCoBbY", label: "Part 3" },
          ],
        },
      ],
    },
    {
      id: "foundations",
      title: "Foundations: Relating to God",
      blurb:
        "Where the journey begins — our attitudes toward God, prayer as relationship, and resting in God.",
      lessons: [
        {
          talk: "0",
          title: "Introduction: Attitudes Toward God",
          parts: [
            { id: "iA3saijfLWU", label: "Part 1" },
            { id: "AsJBebsXVE8", label: "Part 2" },
          ],
        },
        {
          talk: "1",
          title: "Prayer as Relating to God",
          parts: [
            { id: "pWToa8QVJXw", label: "Part 1" },
            { id: "B0I5CZulwso", label: "Part 2" },
          ],
        },
        {
          talk: "2",
          title: "Four Levels of Scriptural Experience",
          parts: [
            { id: "wpUsRzhz_tQ", label: "Part 1" },
            { id: "itYkekfCLDM", label: "Part 2" },
          ],
        },
        {
          talk: "3",
          title: "Toward Resting in God",
          parts: [
            { id: "6sltmQP5CgI", label: "Part 1" },
            { id: "RPw1ua41ijs", label: "Part 2" },
          ],
        },
      ],
    },
    {
      id: "practice-progress",
      title: "Centering Prayer & Progress",
      blurb: "Centering Prayer as a method, and how we grow in it over time.",
      lessons: [
        {
          talk: "4",
          title: "Centering Prayer as Method",
          parts: [
            { id: "UAhoHjjDBjc", label: "Part 1" },
            { id: "6cWV6GrDZwI", label: "Part 2" },
          ],
        },
        {
          talk: "5",
          title: "Progress in Centering Prayer",
          parts: [
            { id: "GxyJJTZpcLA", label: "Part 1" },
            { id: "G-DlSFxkNH0", label: "Part 2" },
          ],
        },
      ],
    },
    {
      id: "human-condition",
      title: "The Human Condition & the False Self",
      blurb:
        "The roots of our woundedness — the emotional programs and the false self we build.",
      lessons: [
        {
          talk: "6",
          title: "The Human Condition: The Evolutionary Model",
          parts: [
            { id: "Su9plUI86gU", label: "Part 1" },
            { id: "kWiqoxDW4qU", label: "Part 2" },
          ],
        },
        {
          talk: "7",
          title: "Formation of the Homemade Self: The Existential Model",
          parts: [
            { id: "fG5HS_9XkDA", label: "Part 1" },
            { id: "EDEpSbqwRiI", label: "Part 2" },
          ],
        },
        {
          talk: "8",
          title: "The Pre-Rational Energy Centers",
          parts: [
            { id: "dFs0h_FsZ70", label: "Part 1" },
            { id: "Q7cJQxd_i78", label: "Part 2" },
          ],
        },
        {
          talk: "9",
          title: "Frustrations Caused by the Emotional Programs",
          parts: [
            { id: "2IYC9Z0FFeQ", label: "Part 1" },
            { id: "cUS3sftMB0k", label: "Part 2" },
          ],
        },
        {
          talk: "10",
          title: "Dismantling the Emotional Programs",
          parts: [
            { id: "FO2hittl3Yg", label: "Part 1" },
            { id: "uRFK8H-eiDM", label: "Part 2" },
          ],
        },
        {
          talk: "11",
          title: "The False Self in Action",
          parts: [
            { id: "UeKrB8DHCAA", label: "Part 1" },
            { id: "Fe2owke_RK4", label: "Part 2" },
          ],
        },
      ],
    },
    {
      id: "consents-paradigms",
      title: "The Four Consents & Paradigms",
      blurb: "Consenting to life, and the models that illumine the journey.",
      lessons: [
        {
          talk: "12",
          title: "The Four Consents",
          parts: [
            { id: "KvFB-Ug0OgM", label: "Part 1" },
            { id: "6JgYby-_pxo", label: "Part 2" },
          ],
        },
        {
          talk: "13",
          title: "The Human Condition: The Philosophical Model",
          parts: [
            { id: "iITNM_VnP9s", label: "Part 1" },
            { id: "Aw8V3Kr_oHE", label: "Part 2" },
          ],
        },
        {
          talk: "14",
          title: "Anthony as a Paradigm of the Spiritual Journey",
          parts: [
            { id: "hZa0biI_V0E", label: "Part 1" },
            { id: "a_dgpoemBWA", label: "Part 2" },
          ],
        },
      ],
    },
    {
      id: "liberation",
      title: "Liberation",
      blurb:
        "Being set free from the false self and the conditioning of our culture.",
      lessons: [
        {
          talk: "15",
          title: "Liberation from the False Self System",
          parts: [
            { id: "aiLKFn3CLAY", label: "Part 1" },
            { id: "QB0BZYO83X8", label: "Part 2" },
          ],
        },
        {
          talk: "16",
          title: "Liberation from Cultural Conditioning",
          parts: [
            { id: "QZSnG0w-asQ", label: "Part 1" },
            { id: "Y3ByBUOyyzA", label: "Part 2" },
          ],
        },
        {
          talk: "17",
          title: "Spirituality in Everyday Life",
          parts: [
            { id: "vsTckkac5gc", label: "Part 1" },
            { id: "YHFy3CWxOyw", label: "Part 2" },
          ],
        },
      ],
    },
    {
      id: "nights-healing",
      title: "The Nights & Healing",
      blurb:
        "The purifying nights of sense and spirit, and the healing of the Beatitudes.",
      lessons: [
        {
          talk: "18",
          title: "Night of Sense: The Biblical Desert",
          parts: [
            { id: "Cmg9vEJKmeI", label: "Part 1" },
            { id: "8U7wQkzl2yY", label: "Part 2" },
          ],
        },
        {
          talk: "19",
          title: "Night of Spirit: Toward Transformation",
          parts: [
            { id: "UPhikHVk82I", label: "Part 1" },
            { id: "jJDmxtrOYuE", label: "Part 2" },
          ],
        },
        {
          talk: "20",
          title: "The Beatitudes: Healing the Emotional Programs",
          parts: [
            { id: "RN-WZpOsSXg", label: "Part 1" },
            { id: "37QDfgq2VH4", label: "Part 2" },
          ],
        },
        {
          talk: "21",
          title: "The Spiritual Senses",
          parts: [
            { id: "n6K4XnHTEXs", label: "Part 1" },
            { id: "ElO3p1Ck_U0", label: "Part 2" },
          ],
        },
      ],
    },
    {
      id: "contemplation-action",
      title: "From Contemplation to Action",
      blurb:
        "What contemplation is — and is not — and how it flows into a life of love.",
      lessons: [
        {
          talk: "22",
          title: "What Contemplation is Not",
          parts: [
            { id: "Uo5ZNDXt8tU", label: "Part 1" },
            { id: "gkN0ljM0Maw", label: "Part 2" },
          ],
        },
        {
          talk: "23",
          title: "From Contemplation to Action",
          parts: [
            { id: "_xgmi-_B6Zg", label: "Part 1" },
            { id: "_zUp50vezik", label: "Part 2" },
          ],
        },
        {
          talk: "24",
          title: "The Most Excellent Path",
          parts: [
            { id: "5Rd0qPJMjYE", label: "Part 1" },
            { id: "q8_0UY09AXs", label: "Part 2" },
          ],
        },
        {
          talk: "25",
          title: "The Divine Banquet and Dance",
          parts: [
            { id: "Iwi5Z_DDJCI", label: "Part 1" },
            { id: "Q6JWFyiJXh8", label: "Part 2" },
          ],
        },
      ],
    },
    {
      id: "divine-therapy",
      title: "The Divine Therapy",
      blurb:
        "Prayer in secret, the divine therapy, and the invitation to contemplative outreach.",
      lessons: [
        {
          talk: "26",
          title: "Prayer in Secret: Matthew 6:6",
          parts: [
            { id: "eochTjDrlG0", label: "Part 1" },
            { id: "4CMT--ERQ5A", label: "Part 2" },
          ],
        },
        {
          talk: "27",
          title: "What is the Divine Therapy?",
          parts: [
            { id: "uJ-0WxRlSWY", label: "Part 1" },
            { id: "-_sOsV-ttAY", label: "Part 2" },
          ],
        },
        {
          talk: "28",
          title: "Contemplative Outreach: A Response to the Divine Invitation",
          parts: [
            { id: "ZdL5kiGc46I", label: "Part 1" },
            { id: "BUWYh0J1zyM", label: "Part 2" },
          ],
        },
      ],
    },
  ],
};

// ─── Flattened view (playlist order) ─────────────────────────────────────────
// A single ordered list of every video, carrying its lesson/unit context. Used
// for the overall count, "next / previous" navigation, and looking a video up
// by id.

export interface FlatVideo {
  id: string;
  /** Talk title. */
  lessonTitle: string;
  /** "Part 1", … */
  partLabel: string;
  /** Keating's talk number, if any. */
  talk?: string;
  unitId: string;
  unitTitle: string;
  /** 1-based index within the whole course. */
  index: number;
  /** Whether the lesson has more than one part (drives the "· Part n" label). */
  multiPart: boolean;
}

export const JOURNEY_VIDEOS: FlatVideo[] = (() => {
  const out: FlatVideo[] = [];
  let index = 0;
  for (const unit of SPIRITUAL_JOURNEY.units) {
    for (const lesson of unit.lessons) {
      const multiPart = lesson.parts.length > 1;
      for (const part of lesson.parts) {
        index += 1;
        out.push({
          id: part.id,
          lessonTitle: lesson.title,
          partLabel: part.label,
          talk: lesson.talk,
          unitId: unit.id,
          unitTitle: unit.title,
          index,
          multiPart,
        });
      }
    }
  }
  return out;
})();

export const JOURNEY_TOTAL = JOURNEY_VIDEOS.length;

const VIDEO_BY_ID = new Map(JOURNEY_VIDEOS.map((v) => [v.id, v]));

export function getVideo(id: string | null | undefined): FlatVideo | undefined {
  return id ? VIDEO_BY_ID.get(id) : undefined;
}

export function nextVideo(id: string): FlatVideo | undefined {
  const v = VIDEO_BY_ID.get(id);
  if (!v) return undefined;
  return JOURNEY_VIDEOS[v.index]; // index is 1-based → element at [index] is the next
}

export function prevVideo(id: string): FlatVideo | undefined {
  const v = VIDEO_BY_ID.get(id);
  if (!v || v.index <= 1) return undefined;
  return JOURNEY_VIDEOS[v.index - 2];
}

export const FIRST_VIDEO_ID = JOURNEY_VIDEOS[0]?.id ?? "";

/** A short display label for a video, e.g. "Prayer as Relating to God · Part 2". */
export function videoLabel(v: FlatVideo): string {
  return v.multiPart ? `${v.lessonTitle} · ${v.partLabel}` : v.lessonTitle;
}
