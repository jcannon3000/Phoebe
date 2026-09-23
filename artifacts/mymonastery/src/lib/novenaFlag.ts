// Novenas — ON again since 2026-09-23 (owner: "Could we try to do novanas
// again, we would put it under practices").
//
// They were hidden for all users on 2026-08-07: the feature had a
// long-running production bug (missing psalm_verse_range migration, fixed in
// cb878c93) that made trust in it collapse, so rather than re-litigate
// whether it was solid, it was switched off at this one shared constant.
// The migration has been in production since; the entry point is now the
// Practices list (lib/practiceDirectory), and the day's prayer reads as one
// page rather than a slideshow (pages/novena.tsx).
//
// Consumers: useRhythmState.ts (this is what puts the card/dot/widget back),
// plus the three novena pages, which redirect to the dashboard when it's off.
export const NOVENAS_ENABLED = true;
