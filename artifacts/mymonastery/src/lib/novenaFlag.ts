// Novenas are OFF. Hidden 2026-08-07, brought back 2026-09-23, and taken
// straight back out the same day at the owner's word ("take out novenas").
//
// The original reason for hiding them: a long-running production bug (missing
// psalm_verse_range migration, fixed in cb878c93) that made trust in the
// feature collapse. The 2026-09-23 revival also rebuilt the day's prayer as
// ONE PAGE rather than a slideshow (pages/novena.tsx) and flattened the
// novena's info deck (pages/novena-detail.tsx) — that shape is still in the
// tree, so switching this constant back on is all a future revival needs;
// the Practices row it had is gone again (lib/practiceDirectory.ts).
//
// Consumers: useRhythmState.ts (forces novenaActive/novena to nothing — this
// is what actually hides it from every card/dot/widget), plus the three
// novena pages, which redirect to the dashboard when it's off.
export const NOVENAS_ENABLED = false;
