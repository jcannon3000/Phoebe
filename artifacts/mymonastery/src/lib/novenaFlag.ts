// Novenas hidden for all users per owner request (2026-08-07) — the feature
// had a long-running production bug (missing psalm_verse_range migration,
// fixed in cb878c93) that made trust in it collapse; rather than re-litigate
// whether it's solid now, it's switched off at this one shared constant.
// Consumers: useRhythmState.ts (forces novenaActive/novena to nothing —
// this is what actually hides it from every card/dot/widget), plus the
// three novena pages below as defense-in-depth against a stale bookmark or
// deep link, since the menu entry points are gone too.
export const NOVENAS_ENABLED = false;
