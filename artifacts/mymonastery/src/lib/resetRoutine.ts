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
import { OFFICE_PREFS_EVENT } from "@/lib/officePrefs";

// The default home shows the office (Pray) + the reflection (FDD) + the pinned
// requests lead + the feeds card; every optional add-on is off. This matches a
// brand-new account, whose null layout falls back to exactly this rhythm.
const DEFAULT_HIDDEN_MODULES = [
  "listening", "reading", "walk", "cobreathe",
  "examen", "cac", "ssje", "ncmp", "podcasts", "contemplation",
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
    try {
      await saveHomeLayout({ order: [], hidden: DEFAULT_HIDDEN_MODULES, v: HOME_LAYOUT_VERSION });
    } catch { /* stays cached + dirty; retried on next app-active */ }
    // Office anchor back to the full Office; silence goal back to the 5-min seed.
    try {
      await apiRequest("PUT", "/api/me/office-prefs", { defaultPrayerLevel: "office", contemplationGoalMinutes: 5 });
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
