// Rhythm Finder — a short, reflective questionnaire that asks how a person
// already meets God (silence, scripture, music, nature, writing, community,
// breath), branches into follow-ups, and then RECOMMENDS a rule of life shaped
// from their answers, written straight into the same prefs the Customize flow
// (WayOfLoveRuleFlow) uses. Deterministic — no model at runtime; every answer
// combination maps to a concrete recommendation here.
//
// Answers are qualitative (the person's own words for the music question are
// kept verbatim, never interpreted into content). The recommendation only ever
// flips Phoebe's own settings.

import { apiRequest } from "@/lib/queryClient";
import { setSideLevel } from "@/lib/officePrefs";
import { saveHomeLayout } from "@/lib/homeLayoutCache";

// ——— Question model (drives the slideshow UI) ———

export type FinderOption = { id: string; emoji: string; label: string; sub?: string };
export type FinderQuestion = {
  id: keyof FinderAnswers;
  kind: "multi" | "single" | "text";
  eyebrow: string;
  prompt: string;
  sub?: string;
  options?: FinderOption[];
  placeholder?: string; // text questions
  optional?: boolean;
  showIf?: (a: FinderAnswers) => boolean;
};

export type FinderAnswers = {
  meet: string[];        // silence | scripture | music | nature | writing | community | breath
  musicKinds: string[];  // taize | choral | gospel | ambient | hymns
  artists: string;       // free text (their words)
  silenceLevel: string;  // new | sometimes | daily
  readingVoice: string;  // cac | fdd | ssje | unsure
  whenSpace: string[];   // morning | midday | evening | night
  season: string;        // beginning | returning | steady | rooted
  growToward: string[];  // silence | examen | music | walking
};

export const EMPTY_ANSWERS: FinderAnswers = {
  meet: [], musicKinds: [], artists: "", silenceLevel: "", readingVoice: "", whenSpace: [], season: "", growToward: [],
};

const has = (arr: string[], x: string) => arr.includes(x);

export const FINDER_QUESTIONS: FinderQuestion[] = [
  {
    id: "meet", kind: "multi", eyebrow: "Where you meet God",
    prompt: "Where do you most naturally meet God?",
    sub: "Choose as many as feel true.",
    options: [
      { id: "silence", emoji: "🕯️", label: "In silence and stillness" },
      { id: "scripture", emoji: "📖", label: "In Scripture and reading" },
      { id: "music", emoji: "🎧", label: "In music" },
      { id: "nature", emoji: "🚶", label: "In nature, walking, the body in motion" },
      { id: "writing", emoji: "📓", label: "In writing things down" },
      { id: "community", emoji: "🙏", label: "With others, in community" },
      { id: "breath", emoji: "🌬️", label: "In breath and the body" },
    ],
  },
  {
    id: "musicKinds", kind: "multi", eyebrow: "Music as prayer",
    prompt: "What kind of music draws you toward God?",
    showIf: (a) => has(a.meet, "music") || has(a.growToward, "music"),
    options: [
      { id: "taize", emoji: "🕊️", label: "Taizé & chant" },
      { id: "choral", emoji: "⛪", label: "Choral & sacred classical" },
      { id: "gospel", emoji: "🎶", label: "Gospel & worship" },
      { id: "ambient", emoji: "🌌", label: "Ambient & instrumental" },
      { id: "hymns", emoji: "📜", label: "Hymns" },
    ],
  },
  {
    id: "artists", kind: "text", eyebrow: "Music as prayer", optional: true,
    prompt: "Are there artists, composers, or songs that hold deep meaning for you?",
    sub: "However you'd describe them — we'll keep this to help shape your listening practice.",
    placeholder: "In your own words…",
    showIf: (a) => has(a.meet, "music") || has(a.growToward, "music"),
  },
  {
    id: "silenceLevel", kind: "single", eyebrow: "Silence",
    prompt: "Where are you with silent prayer?",
    showIf: (a) => has(a.meet, "silence") || has(a.growToward, "silence"),
    options: [
      { id: "new", emoji: "🌱", label: "New to it", sub: "A few quiet minutes is plenty." },
      { id: "sometimes", emoji: "🍃", label: "I sit sometimes", sub: "I'd like it to be steadier." },
      { id: "daily", emoji: "🌳", label: "A daily practice", sub: "Silence is already part of my day." },
    ],
  },
  {
    id: "readingVoice", kind: "single", eyebrow: "A daily word",
    prompt: "Which voice speaks to you?",
    showIf: (a) => has(a.meet, "scripture"),
    options: [
      { id: "cac", emoji: "🌅", label: "Contemplative & justice", sub: "Center for Action & Contemplation" },
      { id: "fdd", emoji: "📖", label: "Classic Episcopal daily", sub: "Forward Day by Day" },
      { id: "ssje", emoji: "✍🏽", label: "Monastic & reflective", sub: "Brother, Give Us a Word (SSJE)" },
      { id: "unsure", emoji: "🤍", label: "Not sure — choose for me" },
    ],
  },
  {
    id: "whenSpace", kind: "multi", eyebrow: "Your day",
    prompt: "When do you have the most space for God?",
    sub: "We'll shape reminders and the order of your day around this.",
    options: [
      { id: "morning", emoji: "🌅", label: "Morning" },
      { id: "midday", emoji: "☀️", label: "Midday" },
      { id: "evening", emoji: "🌙", label: "Evening" },
      { id: "night", emoji: "🌌", label: "Late night" },
    ],
  },
  {
    id: "season", kind: "single", eyebrow: "This season",
    prompt: "How would you describe this season of your prayer life?",
    options: [
      { id: "beginning", emoji: "🌱", label: "Just beginning" },
      { id: "returning", emoji: "🕊️", label: "Returning after time away" },
      { id: "steady", emoji: "🌿", label: "Steady, but I want more" },
      { id: "rooted", emoji: "🌳", label: "Deeply rooted" },
    ],
  },
  {
    id: "growToward", kind: "multi", eyebrow: "Growing", optional: true,
    prompt: "Anything you'd love to grow toward?",
    sub: "Optional — we'll gently make room for it.",
    options: [
      { id: "silence", emoji: "🕯️", label: "More silence" },
      { id: "examen", emoji: "🌗", label: "The Examen" },
      { id: "music", emoji: "🎧", label: "Music as prayer" },
      { id: "walking", emoji: "🚶", label: "A daily walk" },
    ],
  },
];

// ——— The recommendation (deterministic) ———

export type RecommendedRhythm = {
  morningPrayer: "office" | "devotion" | "community" | "contemplation";
  contemplationMinutes: number;
  reflectionSource: "fdd" | "cac" | "ssje" | null;
  listening: boolean;
  examen: boolean;
  cobreatheInterest: boolean;
  walking: boolean;
  artistsNote: string;
  morningReminder: boolean;
  eveningReminder: boolean;
  /** Human-readable "why" lines for the results screen. */
  reasons: string[];
};

export function recommend(a: FinderAnswers): RecommendedRhythm {
  const reasons: string[] = [];
  const fuller = a.season === "rooted" || a.season === "steady";
  const gentle = a.season === "beginning" || a.season === "returning";

  // Morning prayer form.
  let morningPrayer: RecommendedRhythm["morningPrayer"];
  if (has(a.meet, "community")) {
    morningPrayer = "community";
    reasons.push("You meet God with others, so we set your prayer to pray alongside your community.");
  } else if (has(a.meet, "silence") && a.meet.length === 1) {
    morningPrayer = "contemplation";
    reasons.push("Silence is where you meet God — so your prayer itself is a daily sit, not a liturgy.");
  } else if (fuller) {
    morningPrayer = "office";
    reasons.push("You're steady in prayer, so we gave you the fuller Daily Office.");
  } else {
    morningPrayer = "devotion";
    reasons.push("A short daily devotion to keep the rhythm gentle and easy to keep.");
  }

  // Contemplation length.
  let contemplationMinutes = 0;
  if (has(a.meet, "silence")) {
    contemplationMinutes = a.silenceLevel === "daily" ? 15 : a.silenceLevel === "sometimes" ? 10 : 5;
    reasons.push(`A daily silence of ${contemplationMinutes} minutes, set to where you are with it.`);
  } else if (has(a.growToward, "silence")) {
    contemplationMinutes = 5;
    reasons.push("A small 5-minute silence to grow into, since you'd like more of it.");
  }

  // A daily reflection.
  let reflectionSource: RecommendedRhythm["reflectionSource"] = null;
  if (has(a.meet, "scripture")) {
    reflectionSource = a.readingVoice === "cac" ? "cac" : a.readingVoice === "ssje" ? "ssje" : "fdd";
    reasons.push("A daily reflection to read, in the voice you chose.");
  }

  // Music → the Listening practice.
  const listening = has(a.meet, "music") || has(a.growToward, "music");
  if (listening) reasons.push("Audio Divina — music as a way of prayer — because that's where the music takes you.");

  // Examen — explicit, or sensible by season.
  let examen = has(a.growToward, "examen") || (a.season === "rooted");
  if (examen && !has(a.growToward, "examen")) reasons.push("The Examen, to review each day with God — a depth that fits where you are.");
  else if (has(a.growToward, "examen")) reasons.push("The Examen, since you'd like to review the day with God.");

  const walking = has(a.meet, "nature") || has(a.growToward, "walking");
  if (walking) reasons.push("You meet God in motion — a daily walk would sit beautifully in your rhythm (add it as your own practice in Customize).");

  const cobreatheInterest = has(a.meet, "breath");
  if (cobreatheInterest) reasons.push("You meet God in breath — try Creation Prayer from the contemplation screen, a breath prayed with all creation.");

  // Make sure no one leaves with an empty rhythm — the Examen is the
  // easiest first practice if nothing else optional was chosen.
  const anyExtra = listening || examen || reflectionSource || contemplationMinutes > 0;
  if (!anyExtra && gentle) {
    examen = true;
    reasons.push("The Examen to begin with — the gentlest way into a rhythm.");
  }

  const morningReminder = has(a.whenSpace, "morning") || a.whenSpace.length === 0;
  const eveningReminder = has(a.whenSpace, "evening") || has(a.whenSpace, "night");

  return {
    morningPrayer, contemplationMinutes, reflectionSource, listening,
    examen, cobreatheInterest, walking, artistsNote: a.artists.trim(),
    morningReminder, eveningReminder, reasons,
  };
}

// ——— Apply: write the recommendation into Phoebe's real settings ———

const PRAYER_LEVEL: Record<RecommendedRhythm["morningPrayer"], "intercessions" | "devotion" | "office" | "reflect-sit"> = {
  community: "intercessions", devotion: "devotion", office: "office", contemplation: "reflect-sit",
};
const HOME_LAYOUT_VERSION = 2; // keep in sync with WayOfLoveRuleFlow
const ALL_EXTRAS = ["listening", "examen"] as const;

export async function applyRhythm(rec: RecommendedRhythm): Promise<void> {
  const level = PRAYER_LEVEL[rec.morningPrayer];
  // The office side levels (local, instant) — morning is the primary side.
  try { setSideLevel("morning", level); } catch { /* ignore */ }

  await apiRequest("PUT", "/api/me/office-prefs", {
    defaultPrayerLevel: level,
    contemplationGoalMinutes: rec.contemplationMinutes,
    contemplationReminderEnabled: rec.contemplationMinutes > 0,
    morning: rec.morningReminder ? (rec.morningPrayer === "office" ? "office" : "devotion") : "none",
    evening: rec.eveningReminder ? "devotion" : "none",
    morningTime: rec.morningReminder ? "07:30" : null,
    eveningTime: rec.eveningReminder ? "20:00" : null,
  }).catch(() => { /* best-effort */ });

  // Home layout — the reflection source + the optional practices ON; everything
  // else hidden. Same shape WayOfLoveRuleFlow writes.
  const newsletters = rec.reflectionSource ? [rec.reflectionSource] : [];
  const otherReflections = (["cac", "fdd", "ssje"] as const).filter((n) => !newsletters.includes(n));
  const onMap: Record<(typeof ALL_EXTRAS)[number], boolean> = {
    listening: rec.listening, examen: rec.examen,
  };
  const extrasOn = ALL_EXTRAS.filter((e) => onMap[e]);
  const extrasOff = ALL_EXTRAS.filter((e) => !onMap[e]);
  const order = ["requests", "office", "contemplation", ...newsletters, ...extrasOn, "feeds", "ncmp", "podcasts", ...extrasOff, ...otherReflections];
  // "feeds" stays visible (self-hides until you subscribe to a prayer feed).
  const hidden = ["ncmp", "podcasts", ...extrasOff, ...otherReflections];
  // Durable save (caches locally + retries) so an iOS WebView suspension right
  // after applying the rhythm can't drop the layout.
  await saveHomeLayout({ order, hidden, v: HOME_LAYOUT_VERSION }).catch(() => { /* stays cached + dirty; re-pushed next app-active */ });

  // Per-device choices the customizer also sets.
  try { localStorage.setItem("phoebe:contemplation-style", "silent"); } catch { /* ignore */ }
  if (rec.artistsNote) { try { localStorage.setItem("phoebe:listening-artists", rec.artistsNote); } catch { /* ignore */ } }
}
