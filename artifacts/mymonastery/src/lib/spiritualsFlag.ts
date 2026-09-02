// Meditating on Spirituals — ADMIN ONLY, not public (owner, 2026-09-02).
//
// Built 2026-09-01, taken out of public view the next day, and now visible to
// super-admins so the owner can walk the real practice rather than only read
// the catalogue in /admin/spirituals.
//
// This is a PAUSE, not a deletion. Nothing is torn out: the catalogue
// (spiritualsCatalogue.ts), the daily lectionary (spiritualsLectionary.ts), the
// admin library and the practice page all remain, and the practice key stays in
// all ten of the lists that must agree (see the header of pages/spirituals.tsx).
// Ripping the key back out of some-but-not-all of those lists is exactly the
// drift that has bitten this repo repeatedly, so visibility is decided at this
// one shared helper instead — the same approach as lib/novenaFlag.ts.
//
// WHY IT IS NOT PUBLIC. These are the songs of enslaved people, collected in
// 1867 by white abolitionists who rendered Gullah and African-American speech
// in the eye-dialect of their day. Carrying them well is a question about
// framing, attribution and whose voice is being presented — not a question
// about code. The building was quick; that decision should not be.
//
// Consumers, all passing the CURRENT USER rather than reading a constant:
//   useRhythmState.ts    — gates spiritualsActive, which is what actually
//                          governs the card, the dot and the widget, since
//                          every one of those reads it off that hook.
//   menu-practices.tsx   — the Practices row.
//   customize-home.tsx   — the customizer's add-list.
//   pages/spirituals.tsx — defense-in-depth against a stale deep link. That
//                          guard MUST wait for auth to settle before it
//                          redirects, or an admin is bounced out of the
//                          practice during the /auth/me round trip.
//
// /admin/spirituals is deliberately NOT gated here — it carries its own
// super-admin check, and reviewing the collection is the point of the pause.
//
// PROJECT STOPPED (owner, 2026-09-02): "stop this project and take it off the
// practices." The practice is now visible to NO ONE, admins included. What was
// learned, so nobody restarts it on the same footing: the 1867 collection and
// the Episcopal hymnal Lift Every Voice and Sing II are essentially different
// repertoires — of the 135 songs here, exactly ONE (Nobody Knows the Trouble
// I've Seen) is in LEVAS II — and the only clean public-domain sources for the
// hymnal's repertoire do not exist as text; they would have to be recovered
// from page scans by hand. Code and catalogue are left in place, unreachable;
// /admin/spirituals is not a practice and is unaffected.
//
// To bring it back for admins only: set SPIRITUALS_ADMIN_PREVIEW to true.
// To make it public: set SPIRITUALS_PUBLIC to true. Nothing else changes.

export const SPIRITUALS_PUBLIC = false;
export const SPIRITUALS_ADMIN_PREVIEW = true;

/** Whether this person may see the practice at all. */
export function spiritualsVisible(isSuperAdmin: boolean | null | undefined): boolean {
  return SPIRITUALS_PUBLIC || (SPIRITUALS_ADMIN_PREVIEW && !!isSuperAdmin);
}
