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
import { clearCustomAnchors } from "@/lib/customAnchors";
import { clearHomeLayoutCache, saveHomeLayout, HOME_LAYOUT_VERSION } from "@/lib/homeLayoutCache";
import { clearGuestSeed, seedGuestRule } from "@/lib/guestSeed";
import { OFFICE_PREFS_EVENT } from "@/lib/officePrefs";

// The default home shows the office (Pray) + the reflection (FDD) + the pinned
// requests lead + the feeds card; every optional add-on is off. This matches a
// brand-new account, whose null layout falls back to exactly this rhythm.
const DEFAULT_HIDDEN_MODULES = [
  "listening", "lectio", "reading", "walk", "cobreathe", "gratitude",
  "examen", "journaling", "cac", "ssje", "ncmp", "podcasts", "contemplation",
];

export async function resetRoutineToDefault(opts: { realUser: boolean; invalidate?: () => void }): Promise<void> {
  // 1. Wipe the device-local rule structure (NOT the daily logs).
  clearRoutineKeys();
  clearCustomAnchors();
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
  // 4. Broadcast so an already-open home / customizer re-reads immediately. The
  //    caller also does a full reload as belt-and-suspenders.
  try {
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
    window.dispatchEvent(new Event(ROUTINE_SYNCED_EVENT));
    window.dispatchEvent(new Event("phoebe:prefs-changed"));
  } catch { /* ignore */ }
  opts.invalidate?.();
}
