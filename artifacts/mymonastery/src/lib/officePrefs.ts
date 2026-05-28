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
import { useAuth } from "@/hooks/useAuth";

// ── Storage keys ───────────────────────────────────────────────────
// Boolean prefs serialize as "1" / "0". Empty / malformed / missing
// → false. Keeping the format explicit makes Safari private-mode
// fallbacks easier to reason about than JSON.parse.
// Legacy per-source close-pill keys. Kept around so a previously
// migrated value can still be read once during the upgrade and folded
// into KEY_REFLECTION_SOURCE; new writes only touch the new key.
const KEY_SHOW_CAC_CLOSE = "phoebe:office:show-cac-close";
const KEY_SHOW_FDD_CLOSE = "phoebe:office:show-fdd-close";
const KEY_SHOW_SSJE_CLOSE = "phoebe:office:show-ssje-close";
// The user's EXPLICIT reflection-source pick from Settings → After the
// office (the close-pill radio). Mutually exclusive; "none" hides the
// close pill entirely. When this key is unset the effective source
// falls back to the visible home reflection card, then to FDD (see
// deriveReflectionSource). The CAC/FDD/SSJE *home cards* are a separate,
// independently toggled set of home modules — they are not driven by
// this value.
const KEY_REFLECTION_SOURCE = "phoebe:office:reflection-source";
const KEY_INCLUDE_GRATITUDE_SLIDE = "phoebe:office:include-gratitude-slide";
// Default silent-contemplation length in minutes. 0 = off (no default;
// the Contemplation timer shows its picker). Set from the Daily Office
// wizard's meditation slide; read by the Contemplation page's "Begin"
// so a default skips the picker and starts a sit straight away.
const KEY_CONTEMPLATION_MINUTES = "phoebe:office:contemplation-minutes";

export type ReflectionSource = "cac" | "fdd" | "ssje" | "none";
const REFLECTION_SOURCES: ReflectionSource[] = ["cac", "fdd", "ssje", "none"];

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

// ── Reflection source at office close ──
// One pill, the user's choice. Replaces the three independent
// CAC/FDD/SSJE booleans we briefly shipped.
//
// Precedence for which reflection actually surfaces (see
// deriveReflectionSource / useEffectiveReflectionSource):
//   1. An EXPLICIT settings pick (the radio in Settings → After the
//      office). Once set it wins — "they can also change this in
//      settings".
//   2. Otherwise, whichever reflection card the user has made visible
//      on their home screen — "if they have one on their home screen
//      visible, that's the one". Topmost in home order wins.
//   3. Otherwise the default, FDD ("Forward Day by Day").
//
// getExplicitReflectionSource() returns ONLY the explicit pick (or
// null), so callers can tell "user chose this" from "we defaulted".
// getReflectionSource() keeps its old signature for non-React / no-
// home-layout callers and folds in the FDD default.
export function getExplicitReflectionSource(): ReflectionSource | null {
  try {
    const raw = localStorage.getItem(KEY_REFLECTION_SOURCE);
    if (raw && (REFLECTION_SOURCES as string[]).includes(raw)) {
      return raw as ReflectionSource;
    }
  } catch { /* private mode */ }
  // Legacy migration — pick the first source whose old boolean is
  // explicitly "1". If none are explicit, return null (not chosen).
  try {
    if (localStorage.getItem(KEY_SHOW_CAC_CLOSE) === "1") return "cac";
    if (localStorage.getItem(KEY_SHOW_FDD_CLOSE) === "1") return "fdd";
    if (localStorage.getItem(KEY_SHOW_SSJE_CLOSE) === "1") return "ssje";
    // All three explicitly off → user opted out of reflections
    if (
      localStorage.getItem(KEY_SHOW_CAC_CLOSE) === "0" &&
      localStorage.getItem(KEY_SHOW_FDD_CLOSE) === "0" &&
      localStorage.getItem(KEY_SHOW_SSJE_CLOSE) === "0"
    ) return "none";
  } catch { /* non-fatal */ }
  return null;
}

// Backward-compatible reader: explicit pick, else the FDD default.
// Does NOT consult the home screen (no access to the server user here);
// React call sites that want the full precedence use
// useEffectiveReflectionSource() below.
export function getReflectionSource(): ReflectionSource {
  return getExplicitReflectionSource() ?? "fdd";
}

// Home layout shape we care about (mirror of AuthUser.homeLayout).
type HomeLayoutLike = { order: string[]; hidden: string[] } | null | undefined;

// The reflection card (if any) the user has surfaced on their home
// screen. CAC/FDD/SSJE are opt-in home modules: a card counts as
// "visible" when it's in the saved order and NOT in hidden. Cards that
// aren't in the saved order at all are opt-in-hidden (same guard the
// dashboard applies), so iterating the saved order and skipping hidden
// naturally ignores them. Topmost in order wins when several are on.
function visibleHomeReflection(homeLayout: HomeLayoutLike): ReflectionSource | null {
  if (!homeLayout) return null;
  const order = homeLayout.order ?? [];
  const hidden = new Set(homeLayout.hidden ?? []);
  for (const k of order) {
    if ((k === "cac" || k === "fdd" || k === "ssje") && !hidden.has(k)) {
      return k;
    }
  }
  return null;
}

// Full precedence: explicit settings pick → visible home card → FDD.
export function deriveReflectionSource(homeLayout: HomeLayoutLike): ReflectionSource {
  const explicit = getExplicitReflectionSource();
  if (explicit) return explicit;
  return visibleHomeReflection(homeLayout) ?? "fdd";
}

export function setReflectionSource(v: ReflectionSource): void {
  try {
    localStorage.setItem(KEY_REFLECTION_SOURCE, v);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* private mode / quota — non-fatal */ }
}

// Derived booleans — kept for the existing Slide / dashboard call
// sites that branch on per-source flags. Each is true iff the user's
// chosen source matches; they're mutually exclusive by construction.
export function getShowCacClose(): boolean { return getReflectionSource() === "cac"; }
export function getShowFddClose(): boolean { return getReflectionSource() === "fdd"; }
export function getShowSsjeClose(): boolean { return getReflectionSource() === "ssje"; }
// No public setters for the derived booleans — flipping reflection
// source is a single-radio operation now. Callers use setReflectionSource.

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

// ── Default contemplation length ──
// 0 = off (no default; show the picker). A positive value is the
// preset sit length the Contemplation "Begin" uses to skip the picker.
export function getDefaultContemplationMinutes(): number {
  try {
    const n = parseInt(localStorage.getItem(KEY_CONTEMPLATION_MINUTES) ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
export function setDefaultContemplationMinutes(minutes: number): void {
  try {
    localStorage.setItem(KEY_CONTEMPLATION_MINUTES, String(Math.max(0, Math.round(minutes))));
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

// ── React hook ─────────────────────────────────────────────────────
// Snapshot the prefs into state and refresh on any change. Use this
// instead of calling the getters in render — otherwise the component
// won't re-render when the user flips a toggle in Settings.
export function useOfficePrefs(): {
  reflectionSource: ReflectionSource;
  showCacClose: boolean;
  showFddClose: boolean;
  showSsjeClose: boolean;
  includeGratitudeSlide: boolean;
  defaultContemplationMinutes: number;
} {
  const snapshot = () => {
    const src = getReflectionSource();
    return {
      reflectionSource: src,
      showCacClose: src === "cac",
      showFddClose: src === "fdd",
      showSsjeClose: src === "ssje",
      includeGratitudeSlide: getIncludeGratitudeSlide(),
      defaultContemplationMinutes: getDefaultContemplationMinutes(),
    };
  };
  const [state, setState] = useState(snapshot);
  useEffect(() => {
    const refresh = () => setState(snapshot());
    window.addEventListener(OFFICE_PREFS_EVENT, refresh);
    return () => window.removeEventListener(OFFICE_PREFS_EVENT, refresh);
  }, []);
  return state;
}

// Effective reflection source for the close pill — runs the full
// precedence (explicit settings pick → visible home card → FDD).
// Pulls the user's home layout from useAuth, re-derives when that
// layout changes or when the user flips the radio in Settings. Use
// this anywhere the close-pill source is read; useOfficePrefs's raw
// reflectionSource (explicit-or-FDD, no home layer) is for the
// Settings radio's own "is this explicitly chosen?" needs.
export function useEffectiveReflectionSource(): ReflectionSource {
  const { user } = useAuth();
  const homeLayout = user?.homeLayout ?? null;
  // Serialize the layout so the effect re-runs on content change, not
  // on every react-query reference churn.
  const homeKey = homeLayout
    ? `${homeLayout.order.join(",")}|${homeLayout.hidden.join(",")}`
    : "";
  const [src, setSrc] = useState<ReflectionSource>(() => deriveReflectionSource(homeLayout));
  useEffect(() => {
    const refresh = () => setSrc(deriveReflectionSource(homeLayout));
    refresh();
    window.addEventListener(OFFICE_PREFS_EVENT, refresh);
    return () => window.removeEventListener(OFFICE_PREFS_EVENT, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeKey]);
  return src;
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
