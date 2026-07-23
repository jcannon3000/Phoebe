// First-run intros for the contemplative practices — a single card that says
// what the practice IS, where it comes FROM, and what to DO, shown the first
// time someone enters it. So a beginner can start without a priest standing
// beside them to explain. Same localStorage-flag pattern as Co-Breathe / Moments.

export type PracticeIntroKey = "silence" | "office" | "psalms" | "examen" | "fdd";

const FLAG = (key: PracticeIntroKey) => `phoebe:intro-seen:${key}`;

// RETIRED 2026-07-22 (owner: didn't like them). The first-run practice-intro
// cards ("what it is / where it comes from / what to do") are off everywhere:
// this always reports the intro as already-seen, so every `!hasSeenIntro(key)`
// gate is false and the card never shows. The PracticeIntro component and the
// PRACTICE_INTROS content are kept, dormant, so it's a one-line revert.
export function hasSeenIntro(_key: PracticeIntroKey): boolean {
  return true;
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
    what: "A few minutes of stillness, simply resting in the presence of God. Thoughts drift in and out like clouds, and you let them pass.",
    from: "The Christian contemplative tradition — the Desert mothers and fathers, and in our own day Thomas Keating's Centering Prayer.",
    how: "Sit comfortably and close your eyes. Each time you notice you've drifted into thinking, gently return to that quiet resting — as many times as it takes. The returning itself is the prayer.",
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
    what: "A gentle look back over your day with God — noticing where you felt most alive and loved, and where that was harder to find.",
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
