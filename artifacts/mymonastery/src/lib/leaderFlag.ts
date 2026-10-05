/**
 * LEADER PAGES - OFF (owner, 2026-10-04: "Actually lets revert this all for now, or just hide it").
 *
 * The five-question form at /with/:slug, the admin inbox at /admin/leaders, and the
 * "Have a leader design a routine for you" card all stay in the tree; with this false the
 * routes send people to the home instead, and nothing in the app links to them. Flip to true
 * to bring the whole feature back (and restore the Leader page row on Admin tools).
 */
export const LEADER_PAGES_ENABLED = false;
