// The PUBLIC no-login version of Phoebe.
//
// When ON: anyone NOT signed in (and any signed-in non-beta user) gets the
// public experience — no login anywhere prominent, preferences saved on-device
// (localStorage, web AND the iOS shell), a rule of life seeded on first open
// (Morning Office · Evening Office · Forward Day by Day · a 5-minute silence
// goal with its progress-bar card), and the full app (community, prayer lists,
// events, feeds, Audio Divina, the silence ladder) closed off to BETA users,
// who reach it through a quiet Sign in. The office NEVER enters the
// intercession slideshow in guest mode.
//
// See memory "project_public_no_login" for the full spec + build order.
// Typed as `boolean` (not the literal) so gated branches aren't dead code.
// LIVE (owner, 2026-07-03): the public no-login experience is ON — visiting
// the site or opening the app lands straight on the daily-progress home with
// the seeded default rule; no welcome chooser, no sign-in required. The full
// app belongs to pilot-group members + app super admins.
export const PHOEBE_GUEST_ENABLED: boolean = true;

// Device-local guest — the STORAGE question ("does this session keep its
// rhythm on the device?"): signed OUT, or signed in as the ANONYMOUS DEVICE
// USER that guest boot silently provisions for push. Anonymous users hold a
// real session cookie, so `!user` alone misses them — that gap put anonymous
// devices on the full signed-in pipeline: the customizer's server office-prefs
// hydration clobbered the seeded Evening side, the home lost its Silence goal
// card (the guest card keys on this), and the legacy "signed-in user with no
// home layout" defaults surfaced a Co-Breathe card nobody chose. Distinct
// from useGuestMode (the SHAPE question — any non-pilot session, including
// ordinary signed-in accounts, which DO keep server-backed storage).
export function isDeviceLocalGuest(user?: { isAnonymous?: boolean } | null): boolean {
  return PHOEBE_GUEST_ENABLED && (!user || !!user.isAnonymous);
}
