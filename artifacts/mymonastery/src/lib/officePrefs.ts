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
// Which voice/tradition the audio office plays — Forward Movement (the
// US 1979 BCP offices, read aloud) or the Church of England (Common
// Worship Morning/Evening Prayer). The office-podcast player toggles
// this live; Settings sets the default. Per-device, like the reflection
// source.
const KEY_OFFICE_AUDIO_SOURCE = "phoebe:office:audio-source";
const KEY_INCLUDE_GRATITUDE_SLIDE = "phoebe:office:include-gratitude-slide";
// Default silent-contemplation length in minutes. 0 = off (no default;
// the Contemplation timer shows its picker). Set from the Daily Office
// wizard's meditation slide; read by the Contemplation page's "Begin"
// so a default skips the picker and starts a sit straight away.
const KEY_CONTEMPLATION_MINUTES = "phoebe:office:contemplation-minutes";
// Default "way to pray" for the full offices (Morning Prayer / Evening Prayer).
// "read" = the text slideshow (default); "listen" = the Forward Movement
// read-aloud podcast; "watch" = the National Cathedral morning broadcast;
// "book" = pray from your physical Book of Common Prayer — the office opens
// to the page-number guide instead of the slide deck.
// Only applies to the full offices — devotions and Compline always open as
// text (no listen/watch equivalents).
const KEY_DEFAULT_OFFICE_ENTRY = "phoebe:office:default-entry";

export type ReflectionSource = "cac" | "fdd" | "ssje" | "vts" | "none";
const REFLECTION_SOURCES: ReflectionSource[] = ["cac", "fdd", "ssje", "vts", "none"];

export type OfficeAudioSource = "forward-movement" | "church-of-england" | "gregory";
const OFFICE_AUDIO_SOURCES: OfficeAudioSource[] = ["forward-movement", "church-of-england", "gregory"];

export type DefaultOfficeEntry = "read" | "listen" | "watch" | "book";
const DEFAULT_OFFICE_ENTRIES: DefaultOfficeEntry[] = ["read", "listen", "watch", "book"];

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

// Backward-compatible reader: explicit pick, else the CAC default.
// Does NOT consult the home screen (no access to the server user here);
// React call sites that want the full precedence use
// useEffectiveReflectionSource() below. Default is CAC — the Center for Action
// and Contemplation daily meditation — the un-set-up reflection in the starter rule.
export function getReflectionSource(): ReflectionSource {
  return getExplicitReflectionSource() ?? "cac";
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
    if ((k === "cac" || k === "fdd" || k === "ssje" || k === "vts") && !hidden.has(k)) {
      return k;
    }
  }
  return null;
}

// Full precedence: explicit settings pick → visible home card → FDD.
// Forward Day by Day is the default reflection for un-set-up users (the starter
// rule); an explicit pick or a visible home reflection card still wins.
export function deriveReflectionSource(homeLayout: HomeLayoutLike): ReflectionSource {
  const explicit = getExplicitReflectionSource();
  if (explicit) return explicit;
  return visibleHomeReflection(homeLayout) ?? "cac";
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
export function getShowVtsClose(): boolean { return getReflectionSource() === "vts"; }
// No public setters for the derived booleans — flipping reflection
// source is a single-radio operation now. Callers use setReflectionSource.

// (No NCMP close pill — NCMP is a live weekday broadcast that IS
// Morning Prayer at the National Cathedral, not a post-office
// reflection. The Resources entry surfaces it as its own thing,
// not as a CAC/FDD-style follow-on.)

// ── Audio office source (Forward Movement vs Church of England) ──
// Which tradition the read-aloud Morning/Evening Prayer plays. Forward
// Movement = the US 1979 BCP offices (the original, default); Church of
// England = Common Worship Morning/Evening Prayer. The office-podcast
// player lets you switch live; Settings sets the default. Default =
// "forward-movement" so nothing changes for existing listeners.
export function getOfficeAudioSource(): OfficeAudioSource {
  try {
    const raw = localStorage.getItem(KEY_OFFICE_AUDIO_SOURCE);
    if (raw && (OFFICE_AUDIO_SOURCES as string[]).includes(raw)) {
      return raw as OfficeAudioSource;
    }
  } catch { /* private mode */ }
  return "forward-movement";
}
export function setOfficeAudioSource(v: OfficeAudioSource): void {
  try {
    localStorage.setItem(KEY_OFFICE_AUDIO_SOURCE, v);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* private mode / quota — non-fatal */ }
}

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
    const raw = localStorage.getItem(KEY_CONTEMPLATION_MINUTES);
    // Unset → default to a 5-minute sit (the default daily practice) so Begin
    // skips the picker. An explicit "0" still means off / show the picker.
    if (raw === null) return 5;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 5;
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

// ── Default office entry mode ──
// Which of the three "ways to pray" opens automatically when the user
// navigates to a full Morning or Evening Prayer office. "read" is the
// text slideshow; "listen" navigates to the Forward Movement podcast
// player; "watch" navigates to the National Cathedral broadcast.
export function getDefaultOfficeEntry(): DefaultOfficeEntry {
  try {
    const raw = localStorage.getItem(KEY_DEFAULT_OFFICE_ENTRY);
    if (raw && (DEFAULT_OFFICE_ENTRIES as string[]).includes(raw)) return raw as DefaultOfficeEntry;
  } catch { /* private mode */ }
  return "read";
}
export function setDefaultOfficeEntry(v: DefaultOfficeEntry): void {
  try {
    localStorage.setItem(KEY_DEFAULT_OFFICE_ENTRY, v);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* private mode / quota — non-fatal */ }
}

// ── Per-side practice overrides (Morning / Evening split) ──
// The split Morning/Evening wizards (Daily Practice → Build your practice)
// let each side carry its own depth, way-to-pray, and reflection. Stored
// locally per side; when a side is unset, callers fall back to the single
// shared pref, so anyone who never opens the split flows is unaffected.
export type OfficeSide = "morning" | "evening";
// "fdd" = Forward Day by Day IS this side's prayer (replaces the office card for
// that side, per-user). "psalms" = Praying the Psalms IS this side's prayer
// (the appointed psalms, per the chosen cycle). Both per-user, set in Customize.
export type OfficeLevel = "ask" | "devotion" | "office" | "intercessions" | "reflect-sit" | "journal" | "fdd" | "readings" | "psalms" | "examen" | "creation" | "guided-prayer" | "custom" | "compline";
const OFFICE_LEVELS: OfficeLevel[] = ["ask", "devotion", "office", "intercessions", "reflect-sit", "journal", "fdd", "readings", "psalms", "examen", "creation", "guided-prayer", "custom", "compline"];

// Depth/level per side. null = no per-side override → callers use the
// server-side global defaultPrayerLevel (begin-prayer already reads it).
export function getSideLevel(side: OfficeSide): OfficeLevel | null {
  try {
    const raw = localStorage.getItem(`phoebe:office:level:${side}`);
    if (raw && (OFFICE_LEVELS as string[]).includes(raw)) return coerceRetiredLevel(raw as OfficeLevel);
  } catch { /* private mode */ }
  // New-user default rule (owner, 2026-08-20): Morning = Simple Guided
  // Prayer, Evening = Daily Scripture Readings. Reflection defaults to CAC +
  // a 5-minute Silence goal + Co-Breathe, all handled in useRhythmState.
  // Only applies until the user explicitly picks a level for that side
  // (stored above).
  if (side === "morning") return "guided-prayer";
  if (side === "evening") return "readings";
  return null;
}

// Prayer requests / community intercessions are OFF for everyone (see
// hooks/usePrayerRequests.ts, 2026-07-23), so a side left on `intercessions`
// is a DEAD anchor: its home card routes to /prayer-mode, which PrayerGate
// bounces straight back to /dashboard, and useRhythmState has no done-clause
// for it — so the dot can never light no matter what the user does. This was
// also the built-in morning default, so it hit every user who never explicitly
// chose a morning practice. Read it back as the BCP office instead. Delete
// this coercion (and restore the default above) if intercessions return.
function coerceRetiredLevel(level: OfficeLevel): OfficeLevel {
  return level === "intercessions" ? "office" : level;
}
// Like getSideLevel but WITHOUT the new-user default — returns null when the
// user has not EXPLICITLY chosen a level for this side. Use this (not
// getSideLevel) for "has the user designed a rule yet?" / "which sides did they
// turn on?" checks, so the Morning=Psalms default never reads as a real choice.
export function getExplicitSideLevel(side: OfficeSide): OfficeLevel | null {
  try {
    const raw = localStorage.getItem(`phoebe:office:level:${side}`);
    // Coerce retired levels here too. Leaving this getter raw meant a stored
    // "intercessions" leaked out of it while getSideLevel reported "office" for
    // the SAME side — so pilot-home routed to Daily Devotions, routine-print
    // dropped the office readings, and SimpleRuleEditor showed no row selected,
    // all while the home card prayed it as the office.
    if (raw && (OFFICE_LEVELS as string[]).includes(raw)) return coerceRetiredLevel(raw as OfficeLevel);
  } catch { /* private mode */ }
  return null;
}
export function setSideLevel(side: OfficeSide, v: OfficeLevel): void {
  try {
    localStorage.setItem(`phoebe:office:level:${side}`, v);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// How the user takes Forward Day by Day when it's their prayer / reflection:
// "written" = open today's FDD reading; "audio" = play the FDD podcast. Per
// device, default written. Drives the FDD home card.
export type FddMode = "written" | "audio";
export function getFddMode(): FddMode {
  try {
    return localStorage.getItem("phoebe:fdd-mode") === "audio" ? "audio" : "written";
  } catch { return "written"; }
}
export function setFddMode(v: FddMode): void {
  try {
    localStorage.setItem("phoebe:fdd-mode", v);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// Which Psalter cycle "Praying the Psalms" follows: "office" = the daily-office
// lectionary appointment (in step with the office); "monthly" = the traditional
// 30-day Coverdale cycle (the whole Psalter every month — more psalms a day).
// Per device, default "office".
export type PsalmCycle = "office" | "monthly";
export function getPsalmCycle(): PsalmCycle {
  try {
    return localStorage.getItem("phoebe:psalm-cycle") === "monthly" ? "monthly" : "office";
  } catch { return "office"; }
}
export function setPsalmCycle(v: PsalmCycle): void {
  try {
    localStorage.setItem("phoebe:psalm-cycle", v);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// How the silent Contemplation card is kept: "timer" opens the countdown
// timer (/contemplation); "manual" just marks the sit done on tap, no timer
// — owner: "log method... either timer or manual log. or mark as done."
// Per device, default "timer" (the existing behavior). Only affects the
// SILENT sit — Creation Prayer (the Co-Breathe breath) is a different
// practice with its own guided flow and isn't offered a manual-log choice.
export type ContemplationLogMethod = "timer" | "manual";
export function getContemplationLogMethod(): ContemplationLogMethod {
  try {
    return localStorage.getItem("phoebe:contemplation-log-method") === "manual" ? "manual" : "timer";
  } catch { return "timer"; }
}
export function setContemplationLogMethod(v: ContemplationLogMethod): void {
  try {
    localStorage.setItem("phoebe:contemplation-log-method", v);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// Way to pray per side (read / listen / watch). Falls back to the shared
// default-office-entry when this side has no override.
export function getSideEntry(side: OfficeSide): DefaultOfficeEntry {
  try {
    const raw = localStorage.getItem(`phoebe:office:entry:${side}`);
    if (raw && (DEFAULT_OFFICE_ENTRIES as string[]).includes(raw)) return raw as DefaultOfficeEntry;
  } catch { /* private mode */ }
  return getDefaultOfficeEntry();
}
export function setSideEntry(side: OfficeSide, v: DefaultOfficeEntry): void {
  try {
    localStorage.setItem(`phoebe:office:entry:${side}`, v);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// Reflection per side. Returns ONLY the explicit per-side pick (or null);
// useEffectiveReflectionSource(side) folds in the shared precedence when null.
export function getSideReflectionExplicit(side: OfficeSide): ReflectionSource | null {
  try {
    const raw = localStorage.getItem(`phoebe:office:reflection:${side}`);
    if (raw && (REFLECTION_SOURCES as string[]).includes(raw)) return raw as ReflectionSource;
  } catch { /* private mode */ }
  return null;
}
export function setSideReflection(side: OfficeSide, v: ReflectionSource): void {
  try {
    localStorage.setItem(`phoebe:office:reflection:${side}`, v);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// Name of a side's own custom practice (level "custom" — "Create your own" in
// the morning/evening way-step). Only meaningful when getSideLevel(side) ===
// "custom"; otherwise stale/unset.
export function getSideCustomName(side: OfficeSide): string {
  try {
    return localStorage.getItem(`phoebe:office:custom-name:${side}`) ?? "";
  } catch { return ""; }
}
export function setSideCustomName(side: OfficeSide, v: string): void {
  try {
    localStorage.setItem(`phoebe:office:custom-name:${side}`, v);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// What a side's card actually calls itself — extracted from DailyProgressBody
// so /turn-learn-pray's per-slot summary (in Morning/Contemplative/Evening
// mode) names the SAME practice the home card does instead of a
// separately-maintained guess that drifts. `prayerKind` is useRhythmState's
// field of the same name; `t` is the caller's i18n function.
export function sideOfficeTitle(
  side: "Morning" | "Evening",
  prayerKind: string | undefined,
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  const lvl = getSideLevel(side.toLowerCase() as OfficeSide);
  if (lvl === "psalms") {
    return t(`rhythm.card_${side.toLowerCase()}_psalms`, { defaultValue: `${side} Psalms` });
  }
  if (lvl === "reflect-sit") return t("rhythm.card_contemplation", { defaultValue: "Contemplation" });
  if (lvl === "examen") return t("rhythm.card_examen", { defaultValue: "The Examen" });
  if (lvl === "compline") return t("rhythm.card_compline", { defaultValue: "Compline" });
  if (lvl === "guided-prayer") return t("rhythm.card_guided_prayer", { defaultValue: "Guided Prayer" });
  if (lvl === "custom") return getSideCustomName(side.toLowerCase() as OfficeSide).trim() || `${side} Practice`;
  return prayerKind === "community"
    ? t("rhythm.card_community", { defaultValue: "Pray together" })
    : prayerKind === "devotion"
      ? t(`rhythm.card_${side.toLowerCase()}_devotion`, { defaultValue: `${side} Devotion` })
      : t(`rhythm.card_${side.toLowerCase()}`, { defaultValue: `${side} Prayer` });
}

// Confession per side. null = no per-side override → the office uses the
// shared server pref (bcpShowConfession). When set, the office fetch passes
// it to /api/office/{morning,evening}?confession=1|0 so the server assembler
// honors this side's choice.
export function getSideConfession(side: OfficeSide): boolean | null {
  try {
    const raw = localStorage.getItem(`phoebe:office:confession:${side}`);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch { /* private mode */ }
  return null;
}
export function setSideConfession(side: OfficeSide, v: boolean): void {
  try {
    localStorage.setItem(`phoebe:office:confession:${side}`, v ? "1" : "0");
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// Gratitude pause per side. Falls back to the shared global when unset.
export function getSideGratitude(side: OfficeSide): boolean {
  try {
    const raw = localStorage.getItem(`phoebe:office:gratitude:${side}`);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch { /* private mode */ }
  return getIncludeGratitudeSlide();
}
export function setSideGratitude(side: OfficeSide, v: boolean): void {
  try {
    localStorage.setItem(`phoebe:office:gratitude:${side}`, v ? "1" : "0");
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// Silent-contemplation default (minutes; 0 = off) per side. Falls back to
// the shared global. The Contemplation page reads the side by time of day.
export function getSideMinutes(side: OfficeSide): number {
  try {
    const raw = localStorage.getItem(`phoebe:office:minutes:${side}`);
    const n = parseInt(raw ?? "", 10);
    if (Number.isFinite(n) && n >= 0 && raw !== null) return n;
  } catch { /* private mode */ }
  return getDefaultContemplationMinutes();
}
export function setSideMinutes(side: OfficeSide, minutes: number): void {
  try {
    localStorage.setItem(`phoebe:office:minutes:${side}`, String(Math.max(0, Math.round(minutes))));
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// "Community intercessions prayed WITHIN the office" per side — the customizer's
// Prayer List + Book of Common Prayer merge. The full office already surfaces the
// community intercessions, so this is a remembered UI intent (keeps the Prayer
// List row checked + the merge note on re-open), not a behavioral toggle.
export function getCommunityWithOffice(side: OfficeSide): boolean {
  try {
    return localStorage.getItem(`phoebe:office:community-within:${side}`) === "1";
  } catch { /* private mode */ }
  return false;
}
export function setCommunityWithOffice(side: OfficeSide, v: boolean): void {
  try {
    localStorage.setItem(`phoebe:office:community-within:${side}`, v ? "1" : "0");
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
}

// Per-side Contemplative Prayer — is a silent sit part of the rhythm for THIS
// side? Drives the home's per-side "Morning/Evening Contemplation" cards (each
// its own card, completed independently). A never-set key returns null so
// callers can distinguish "not chosen per-side yet" (fall back to the legacy
// single silence goal) from an explicit on/off.
export function getSideContemplationExplicit(side: OfficeSide): boolean | null {
  try {
    const raw = localStorage.getItem(`phoebe:office:contemplation:${side}`);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch { /* private mode */ }
  return null;
}
export function getSideContemplation(side: OfficeSide): boolean {
  return getSideContemplationExplicit(side) === true;
}
export function setSideContemplation(side: OfficeSide, v: boolean): void {
  try {
    localStorage.setItem(`phoebe:office:contemplation:${side}`, v ? "1" : "0");
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* non-fatal */ }
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
  officeAudioSource: OfficeAudioSource;
  defaultOfficeEntry: DefaultOfficeEntry;
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
      officeAudioSource: getOfficeAudioSource(),
      defaultOfficeEntry: getDefaultOfficeEntry(),
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
export function useEffectiveReflectionSource(side?: OfficeSide): ReflectionSource {
  const { user } = useAuth();
  const homeLayout = user?.homeLayout ?? null;
  // Serialize the layout so the effect re-runs on content change, not
  // on every react-query reference churn.
  const homeKey = homeLayout
    ? `${homeLayout.order.join(",")}|${homeLayout.hidden.join(",")}`
    : "";
  // When a side is given, an explicit per-side reflection pick wins;
  // otherwise (and for the shared case) fall to the precedence: global
  // explicit pick → visible home card → FDD.
  const derive = (): ReflectionSource => {
    if (side) {
      const perSide = getSideReflectionExplicit(side);
      if (perSide) return perSide;
    }
    return deriveReflectionSource(homeLayout);
  };
  const [src, setSrc] = useState<ReflectionSource>(derive);
  useEffect(() => {
    const refresh = () => setSrc(derive());
    refresh();
    window.addEventListener(OFFICE_PREFS_EVENT, refresh);
    return () => window.removeEventListener(OFFICE_PREFS_EVENT, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeKey, side]);
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
