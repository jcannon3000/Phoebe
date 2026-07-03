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
export const PHOEBE_GUEST_ENABLED: boolean = false;
