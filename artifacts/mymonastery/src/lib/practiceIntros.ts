// First-run intros for the contemplative practices — a single card that says
// what the practice IS, where it comes FROM, and what to DO, shown the first
// time someone enters it. So a beginner can start without a priest standing
// beside them to explain. Same localStorage-flag pattern as Co-Breathe / Moments.

export type PracticeIntroKey = "silence" | "office" | "psalms" | "examen" | "fdd";

const FLAG = (key: PracticeIntroKey) => `phoebe:intro-seen:${key}`;

export function hasSeenIntro(key: PracticeIntroKey): boolean {
  try { return !!localStorage.getItem(FLAG(key)); } catch { return true; }
}
export function markIntroSeen(key: PracticeIntroKey): void {
  try { localStorage.setItem(FLAG(key), "1"); } catch { /* ignore */ }
}

export type PracticeIntroContent = {
  emoji: string; eyebrow: string; title: string;
  what: string; from: string; how: string;
};

export const PRACTICE_INTROS: Record<PracticeIntroKey, PracticeIntroContent> = {
  silence: {
    emoji: "🕯️", eyebrow: "Silence", title: "Resting in silence",
    what: "A few minutes of stillness, doing nothing — not emptying your mind, just letting thoughts pass and gently returning to rest in God's presence.",
    from: "The Christian contemplative tradition — the Desert mothers and fathers, and in our own day Thomas Keating's Centering Prayer.",
    how: "Sit comfortably, close your eyes. When you notice you've drifted into thinking, simply return — as many times as it takes. That returning is the prayer.",
  },
  office: {
    emoji: "📖", eyebrow: "The Daily Office", title: "Morning & Evening Prayer",
    what: "The church's ancient rhythm of daily prayer — psalms, a scripture reading, canticles, and prayers, said morning and evening.",
    from: "The Book of Common Prayer, carrying a pattern monastics have kept for over 1,500 years.",
    how: "Move through the slides at your own pace. Today's psalms and readings are already chosen for you — nothing to look up or flip to.",
  },
  psalms: {
    emoji: "📜", eyebrow: "The Psalms", title: "Praying the Psalms",
    what: "The Bible's own prayer book — 150 songs of praise, lament, trust, and longing that the church prays through on a cycle.",
    from: "Israel's temple worship, and the prayers Jesus himself prayed. Monastics pray the whole Psalter on a repeating cycle.",
    how: "Read them slowly, aloud if you can. Today's psalms are already appointed — let the words become your own prayer.",
  },
  examen: {
    emoji: "🌙", eyebrow: "The Examen", title: "The Daily Examen",
    what: "A gentle look back over your day with God — noticing where you felt life and love, and where you didn't.",
    from: "St. Ignatius of Loyola, who thought it the one practice never to skip.",
    how: "Recall the day with thanks, notice the moments that drew you toward or away from God, and carry one into tomorrow.",
  },
  fdd: {
    emoji: "📖", eyebrow: "Forward Day by Day", title: "A daily reflection",
    what: "A short meditation on one of the day's appointed scripture readings — a few paragraphs to carry with you.",
    from: "Forward Movement, an Episcopal ministry publishing these daily since 1935.",
    how: "Read today's reflection, then sit a moment with the one line that stays with you.",
  },
};
