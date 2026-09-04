// resetRoutine — Settings → "Reset routine to default". Wipes this device's
// rule of life (per-side office method/entry/slots, reflection source, custom
// practices, home layout, contemplation goal, weekly practices, rest window)
// and re-seeds the precoded default: Morning & Evening Psalms (Daily Office
// Lectionary) · Forward Day by Day · a 5-minute silence goal. Daily completion
// logs (what you've prayed/read) are left alone — only the rule's SHAPE resets.
//
// A device-local guest is purely local. A real signed-in account also has its
// server routine reset (home layout + office-prefs + rule_config) so the
// default sticks and re-syncs to their other devices.
import { apiRequest } from "@/lib/queryClient";
import { clearRoutineKeys, pushRoutineConfig, ROUTINE_SYNCED_EVENT } from "@/lib/routineSync";
import { clearCustomAnchors, syncCustomAnchorsFromServer, type CustomAnchorSnapshot } from "@/lib/customAnchors";
import { clearHomeLayoutCache, saveHomeLayout, HOME_LAYOUT_VERSION } from "@/lib/homeLayoutCache";
import { clearGuestSeed, seedGuestRule } from "@/lib/guestSeed";
import { getStoredDefaultSeed } from "@/lib/rulePresetsStore";
import { OFFICE_PREFS_EVENT } from "@/lib/officePrefs";

// The default home shows the office (Pray) + the reflection (FDD) + the pinned
// requests lead + the feeds card; every optional add-on is off. This matches a
// brand-new account, whose null layout falls back to exactly this rhythm.
const DEFAULT_HIDDEN_MODULES = [
  // The server BACKFILLS every module key into `order`, so a key missing from
  // this list comes back VISIBLE — the opposite of what a reset means. "vts",
  // "visio" and "prayer-list" were missing once already, so resetting to
  // default left the Dean's Commentary and Visio Divina on the home, and the
  // customizer then seeded them as chosen. "icons", "taize", "nouwen", "sojo"
  // and "grist" were the same gap the second time: anyone who had turned on
  // Praying with Icons, the Taizé inbox, or any of the three newer
  // newsletters kept them visible after a "reset," despite this file's own
  // header promising "every optional add-on is off." Keep this list = every
  // optional module, not most of them.
  // NOT "cac" and NOT "visio": they ARE the default now (owner, seed v7 —
  // Simple Guided Prayer · CAC · Express Gratitude · Visio Divina in the
  // evening). seedGuestRule() below writes both into the layout; hiding
  // them here undid the seed on the very next line, so a signed-in reset
  // landed on a home with no newsletter and no Visio — reset ≠ default.
  "listening", "reading", "walk", "cobreathe", "compline",
  "examen", "ssje", "vts", "prayer-list",
  "ncmp", "podcasts", "contemplation",
  "icons", "taize", "andrews", "nouwen", "sojo", "grist", "spirituals", "lectio",
];

/** Every module a rhythm may or may not carry — what an admin-set default is
 *  measured against. (The staples the home always shows are excluded where
 *  this is used.) */
const ALL_OPTIONAL_MODULES = [
  "contemplation", "listening", "reading", "walk", "cobreathe", "compline", "examen",
  "visio", "icons", "lectio", "taize", "andrews", "spirituals", "cac", "fdd", "ssje", "vts",
  "nouwen", "sojo", "grist", "ncmp", "podcasts", "prayer-list",
];

export async function resetRoutineToDefault(opts: {
  realUser: boolean;
  // Write the given fresh /auth/me object into the query cache (qc.setQueryData).
  // Custom anchors sync FROM /auth/me on every load, so the cache — in memory AND
  // the persisted blob the reload re-hydrates — must carry the tombstoned truth,
  // or the union sync resurrects a just-deleted practice.
  applyAuth?: (freshUser: unknown) => void;
}): Promise<void> {
  // 1. Wipe the device-local rule structure (NOT the daily logs). Custom anchors
  //    are AWAITED — they need a tombstoned server push to land first, or the
  //    union sync resurrects them.
  clearRoutineKeys();
  await clearCustomAnchors();
  clearHomeLayoutCache();
  clearGuestSeed();
  // 2. Re-seed the precoded default. seedGuestRule no-ops if a rule already
  //    exists, so the clears above (which drop the seed flag + side levels) must
  //    come first.
  seedGuestRule();
  // 3. A real account keeps its rule on the server too — reset it so the default
  //    holds and re-syncs. (A guest has no server rule; nothing to push.)
  if (opts.realUser) {
    // Default home layout: office + FDD visible, every add-on hidden. An empty
    // `order` lets the server fill in the canonical order; `hidden` does the work.
    /**
     * WHEN AN ADMIN HAS SET THE DEFAULT, RESET MEANS THEIR DEFAULT.
     *
     * seedGuestRule (step 2 above) already applies the stored row, so a
     * hardcoded hidden-list here would hide the very cards it just turned on
     * — reset ≠ default, which is the exact bug 4fe70067 fixed for the code
     * default. Everything the admin's rhythm doesn't name is hidden, except
     * the three the home always carries.
     */
    const adminDefault = getStoredDefaultSeed();
    const ALWAYS_VISIBLE = ["office", "feeds", "requests"];
    const hidden = adminDefault
      ? [...new Set([...DEFAULT_HIDDEN_MODULES, ...ALL_OPTIONAL_MODULES])]
          .filter((k) => !adminDefault.cards.includes(k) && !ALWAYS_VISIBLE.includes(k))
      : DEFAULT_HIDDEN_MODULES;
    try {
      await saveHomeLayout({ order: [], hidden, v: HOME_LAYOUT_VERSION });
    } catch { /* stays cached + dirty; retried on next app-active */ }
    // Office anchor back to the full Office; NO silence goal — the default's
    // contemplative practice is Visio Divina (seed v7), and a 5 here raised
    // a Silence card the seed never asked for.
    try {
      await apiRequest("PUT", "/api/me/office-prefs", {
        defaultPrayerLevel: "office",
        contemplationGoalMinutes: adminDefault?.silenceMin ?? 0,
      });
    } catch { /* non-fatal */ }
    // Sync the re-seeded per-side levels / slots up into rule_config.
    pushRoutineConfig();
  }
  // 4. Re-read /auth/me — now carrying the anchor tombstones our PUT set — and
  //    (a) reconcile the LOCAL anchor list against it (drops the tombstoned ones
  //    that the union sync would otherwise keep) and (b) seat it in the query
  //    cache so the reload's re-hydrated /auth/me is the reset truth, not the
  //    stale pre-reset snapshot the persister would otherwise flush on pagehide.
  try {
    const me = await apiRequest("GET", "/api/auth/me");
    syncCustomAnchorsFromServer((me as { customAnchors?: CustomAnchorSnapshot } | null)?.customAnchors ?? null);
    opts.applyAuth?.(me);
  } catch { /* best-effort — the reload still cold-fetches below */ }
  // 5. Drop the persisted RQ blob too, so even if the pagehide flush is skipped
  //    the reload cold-fetches /auth/me instead of re-hydrating anything stale.
  try { localStorage.removeItem("phoebe:rq-daily"); } catch { /* ignore */ }
  // 6. Broadcast so an already-open home / customizer re-reads immediately. The
  //    caller also does a full reload as belt-and-suspenders.
  try {
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
    window.dispatchEvent(new Event(ROUTINE_SYNCED_EVENT));
    window.dispatchEvent(new Event("phoebe:prefs-changed"));
  } catch { /* ignore */ }
}
