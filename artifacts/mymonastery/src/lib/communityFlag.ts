/**
 * COMMUNITY FEATURES — ONE SWITCH, OFF.
 *
 * Owner, 2026-09-11: "I want to turn off community features including
 * prayer list for all users." Communities, prayer requests, the prayer
 * list, events and the people they bring with them are all gated here and
 * nowhere else:
 *   • usePrayerRequestsEnabled / usePrayerListEnabled → false
 *   • useGroupFeatures → no group, no events group, no prayer group
 *   • the drawer's social block and the menu's rows read those
 *   • the home's Prayer List card (useRhythmState) is inactive
 *   • the routes redirect home (App.tsx CommunityGate)
 *   • the customizers stop offering the Prayer List card
 * The server keeps its tables and endpoints; nothing in the app reaches
 * them while this is false. Flip to true and everything returns as it was.
 * The per-device "Hide community features" setting is superseded (and
 * hidden) while this is off.
 */
export const COMMUNITY_FEATURES_ENABLED = false;

/** Route prefixes that belong to the community features. */
export const COMMUNITY_ROUTE_PREFIXES = [
  "/prayer-list", "/pray-request", "/prayer-requests", "/communities", "/events",
  "/gatherings", "/feed/", "/group-reflection/", "/people/",
] as const;
