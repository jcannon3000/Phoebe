// User-tunable office prefs that don't yet warrant a server column.
//
// All values live in localStorage — per-device, not synced. That's
// the right grain for "what do I want this morning?" preferences;
// promote to server prefs only if cross-device sync becomes
// important. Pattern matches FEED_REMINDER_LS_KEY in settings.tsx.
//
// Each pref exposes:
//   • a read function (get…)
//   • a write function (set…) that also dispatches a custom event so
//     mounted components can re-read without a remount.
//   • the event name as a const, for listeners to subscribe to.
//
// Subscribers usually want all three changes, so we also export
// useOfficePrefs() — a tiny hook that snapshots the prefs into React
// state and refreshes on any pref event.

import { useEffect, useState } from "react";

// ── Storage keys ───────────────────────────────────────────────────
// Boolean prefs serialize as "1" / "0". Empty / malformed / missing
// → false. Keeping the format explicit makes Safari private-mode
// fallbacks easier to reason about than JSON.parse.
const KEY_SHOW_CAC_CLOSE = "phoebe:office:show-cac-close";
const KEY_SHOW_FDD_CLOSE = "phoebe:office:show-fdd-close";
const KEY_INCLUDE_GRATITUDE_SLIDE = "phoebe:office:include-gratitude-slide";

// ── Events ─────────────────────────────────────────────────────────
export const OFFICE_PREFS_EVENT = "phoebe:office-prefs";

// ── Generic boolean helpers ────────────────────────────────────────
function readBool(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

// ── CAC pill at office close ──
// Show a "Read CAC reflection" pill at the end of Morning and Evening
// Prayer. The pill opens today's CAC daily meditation externally and
// marks it read (so the home CacHomeCard flips to "Read again").
export function getShowCacClose(): boolean { return readBool(KEY_SHOW_CAC_CLOSE); }
export function setShowCacClose(v: boolean): void { writeBool(KEY_SHOW_CAC_CLOSE, v); }

// ── FDD pill at office close ──
// Same, for Forward Day by Day (Forward Movement). Independent of
// the CAC pref — both can be on, neither, or just one.
export function getShowFddClose(): boolean { return readBool(KEY_SHOW_FDD_CLOSE); }
export function setShowFddClose(v: boolean): void { writeBool(KEY_SHOW_FDD_CLOSE, v); }

// ── Gratitude slide in the office ──
// When on, MorningPrayerSlideshow splices a "Personal Thanksgiving"
// slide in before the closing — a contemplative prompt that asks
// the user what they're grateful for today. Applies to BOTH morning
// and evening (the slideshow component is shared).
export function getIncludeGratitudeSlide(): boolean { return readBool(KEY_INCLUDE_GRATITUDE_SLIDE); }
export function setIncludeGratitudeSlide(v: boolean): void { writeBool(KEY_INCLUDE_GRATITUDE_SLIDE, v); }

// ── React hook ─────────────────────────────────────────────────────
// Snapshot the prefs into state and refresh on any change. Use this
// instead of calling the getters in render — otherwise the component
// won't re-render when the user flips a toggle in Settings.
export function useOfficePrefs(): {
  showCacClose: boolean;
  showFddClose: boolean;
  includeGratitudeSlide: boolean;
} {
  const [state, setState] = useState(() => ({
    showCacClose: getShowCacClose(),
    showFddClose: getShowFddClose(),
    includeGratitudeSlide: getIncludeGratitudeSlide(),
  }));
  useEffect(() => {
    const refresh = () => setState({
      showCacClose: getShowCacClose(),
      showFddClose: getShowFddClose(),
      includeGratitudeSlide: getIncludeGratitudeSlide(),
    });
    window.addEventListener(OFFICE_PREFS_EVENT, refresh);
    return () => window.removeEventListener(OFFICE_PREFS_EVENT, refresh);
  }, []);
  return state;
}
