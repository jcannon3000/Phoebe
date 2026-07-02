// Creation Prayer feature flag.
//
// Creation Prayer (the creation-focused Daily Devotion: the two-week creation
// Psalter + appointed readings + collects/canticles/litanies, with Co-Breathe at
// the intercession) is BUILT but hidden from the app for now. Flip this to `true`
// to restore every surface at once — the customizer morning/evening option, the
// home cards, the Practices + Book of Common Prayer menu entries, the
// /creation-devotion + /creation-prayers pages, and the begin-prayer routing.
//
// Nothing about the feature is deleted — the assembler, lectionary data, office
// modes, and server endpoints all remain intact; this only gates the user-facing
// entry points. See the memory note "Creation Prayer" for the full lectionary
// design so it can be re-enabled with confidence.
// Typed as `boolean` (not the literal `false`) so gated branches aren't treated
// as unreachable code — flip to `true` to restore every Creation Prayer surface.
export const CREATION_PRAYER_ENABLED: boolean = false;
