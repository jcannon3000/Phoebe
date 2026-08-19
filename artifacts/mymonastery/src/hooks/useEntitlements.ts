// Feed-gated content — used to require FOLLOWING the Virginia Theological
// Seminary feed to unlock the Dean's Commentary as a daily-reflection
// source (the light /customize Newsletter row, the full rule-of-life
// "Learn" step, /customize-home's module list, and the home card itself).
//
// Owner: "make the Dean's commentary available for everyone now. So you
// don't have to be in the VTS feed to show up in your newsletter." `vts` is
// now unconditionally true — every consumer of useEntitlements() already
// treats it as a plain boolean gate, so this alone opens Dean's Commentary
// up everywhere without touching each call site. The server-side
// subscription/entitlements plumbing (api-server/src/lib/entitlements.ts,
// GET /api/me/entitlements) is left in place but no longer consulted here;
// following the feed itself still exists as its own thing (the Community
// Prayers feed content), just no longer a precondition for the reflection.

export type Entitlements = { vts: boolean };

const ALWAYS_ON: Entitlements = { vts: true };

export function useEntitlements(): Entitlements {
  return ALWAYS_ON;
}
