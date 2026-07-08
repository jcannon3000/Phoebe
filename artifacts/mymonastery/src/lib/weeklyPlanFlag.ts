// Group weekly plan feature flag.
//
// A church programs a short checklist of practices for members to keep
// BETWEEN Sundays (e.g. "Read one CAC meditation", "Co-Breathe once", "Sit in
// silence for 10 minutes", "Listen to a podcast episode"). Leaders (group
// admins) author the week's items from the community's Rule of Life page;
// members see the checklist and tap items done. NOT YET PUBLIC — the server
// routes + schema exist (group_weekly_items / group_weekly_completions), but
// every client surface is gated on this flag and bounces when it's off.
// Typed as `boolean` (not the literal) so gated branches aren't dead code.
export const WEEKLY_PLAN_ENABLED: boolean = false;
