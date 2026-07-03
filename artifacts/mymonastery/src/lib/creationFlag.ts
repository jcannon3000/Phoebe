// Creation Prayer feature flag.
//
// Creation Prayer (the creation-focused Daily Office: the two-week creation
// Psalter + appointed readings + collects/canticles/litanies, with Co-Breathe
// at the intercession) is ON (owner, 2026-07-03). Placement: it lives under
// PRACTICES (menu-practices) — deliberately NOT in the Book of Common Prayer
// menu, whose only creation entry is the "Prayers for the Climate" library.
// The flag also lights the customizer morning/evening option, the home cards
// (Morning/Evening Creation Prayer), the /creation-devotion +
// /creation-prayers pages, and the begin-prayer routing. Guests (the public
// no-login version) never see it (per-surface !guest gates).
// See memory "reference_creation_prayer_lectionary" for the full design.
// Typed as `boolean` (not the literal) so gated branches aren't dead code.
export const CREATION_PRAYER_ENABLED: boolean = true;
