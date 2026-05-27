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
const KEY_SHOW_SSJE_CLOSE = "phoebe:office:show-ssje-close";
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

// Tri-state reader for prefs that default ON rather than OFF. Unset /
// malformed → returns the default; "1" → true; "0" → false. Lets us
// add "default true" prefs without losing the user's explicit opt-out
// (a plain readBool would have to be flipped, which we'd rather avoid
// so other prefs keep their "off until you ask" semantics).
function readBoolDefault(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

// ── CAC pill at office close ──
// Show a "Read CAC reflection" pill at the end of Morning and Evening
// Prayer. The pill opens today's CAC daily meditation externally and
// marks it read (so the home CacHomeCard flips to "Read again").
// Default ON — most users want a one-tap follow-on reading after the
// office; the Settings toggle lets them opt out per device.
export function getShowCacClose(): boolean { return readBoolDefault(KEY_SHOW_CAC_CLOSE, true); }
export function setShowCacClose(v: boolean): void { writeBool(KEY_SHOW_CAC_CLOSE, v); }

// ── FDD pill at office close ──
// Same, for Forward Day by Day (Forward Movement). Independent of
// the CAC pref — both can be on, neither, or just one. Default ON
// for the same reason as CAC above.
export function getShowFddClose(): boolean { return readBoolDefault(KEY_SHOW_FDD_CLOSE, true); }
export function setShowFddClose(v: boolean): void { writeBool(KEY_SHOW_FDD_CLOSE, v); }

// ── SSJE pill at office close ──
// Same, for SSJE Words ("Brother, Give Us a Word" from the Society of
// Saint John the Evangelist). Third optional daily reflection
// alongside CAC and FDD; default ON.
export function getShowSsjeClose(): boolean { return readBoolDefault(KEY_SHOW_SSJE_CLOSE, true); }
export function setShowSsjeClose(v: boolean): void { writeBool(KEY_SHOW_SSJE_CLOSE, v); }

// (No NCMP close pill — NCMP is a live weekday broadcast that IS
// Morning Prayer at the National Cathedral, not a post-office
// reflection. The Resources entry surfaces it as its own thing,
// not as a CAC/FDD-style follow-on.)

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
  showSsjeClose: boolean;
  includeGratitudeSlide: boolean;
} {
  const [state, setState] = useState(() => ({
    showCacClose: getShowCacClose(),
    showFddClose: getShowFddClose(),
    showSsjeClose: getShowSsjeClose(),
    includeGratitudeSlide: getIncludeGratitudeSlide(),
  }));
  useEffect(() => {
    const refresh = () => setState({
      showCacClose: getShowCacClose(),
      showFddClose: getShowFddClose(),
      showSsjeClose: getShowSsjeClose(),
      includeGratitudeSlide: getIncludeGratitudeSlide(),
    });
    window.addEventListener(OFFICE_PREFS_EVENT, refresh);
    return () => window.removeEventListener(OFFICE_PREFS_EVENT, refresh);
  }, []);
  return state;
}

// ── National Cathedral Morning Prayer URL + broadcast window ──
// The page is the same every day; the schedule logic below decides
// what label to show on the close pill. Window is Mon-Fri 07:00-07:30
// US Eastern (broadcast lasts ~25 minutes). We compute "now in ET"
// via Intl.DateTimeFormat rather than naively touching the user's
// local clock — a PT user opening the office at 5:00 AM local should
// see "Live in 2 hours" since the broadcast is at 7 AM ET = 4 AM PT,
// which already passed.
// Direct deep-link to the cathedral's YouTube channel's "/live" path —
// YouTube auto-redirects to the current live stream during the broadcast
// window (Mon–Fri 7:00–7:30 ET) and to the most-recent stream's video
// page afterward. The cathedral.org `/worship/weekly-services/morning-
// prayer/` page we used to point at is a marketing index that lists the
// service but doesn't autoplay anything; this URL drops the user
// directly onto the actual video so they're praying with the
// broadcast in one tap, not two.
export const NCMP_URL = "https://www.youtube.com/@WashingtonNationalCathedral/live";

// Today's National Cathedral Morning Prayer state, computed in ET.
// `kind` drives the pill label; `show` is false on weekends so the
// pill disappears entirely (no broadcast Sat/Sun).
export type NcmpState =
  | { show: false }
  | { show: true; kind: "upcoming"; minutesUntil: number }
  | { show: true; kind: "live" }
  | { show: true; kind: "recording" };

export function getNcmpState(now: Date = new Date()): NcmpState {
  // Pull the ET wall-clock parts via Intl — handles DST automatically.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const wd = parts.find(p => p.type === "weekday")?.value ?? "";
  const h = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
  const m = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(wd);
  if (!isWeekday) return { show: false };
  const minutesIntoDay = h * 60 + m;
  // Broadcast window: 07:00 - 07:30 ET (best estimate of typical length).
  const START = 7 * 60;
  const END = START + 30;
  if (minutesIntoDay >= START && minutesIntoDay < END) {
    return { show: true, kind: "live" };
  }
  if (minutesIntoDay < START) {
    return { show: true, kind: "upcoming", minutesUntil: START - minutesIntoDay };
  }
  // After the window has passed today — a recording lives on the same
  // URL until tomorrow's broadcast.
  return { show: true, kind: "recording" };
}
