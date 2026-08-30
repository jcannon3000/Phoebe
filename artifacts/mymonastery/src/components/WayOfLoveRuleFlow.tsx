/**
 * Building your daily habit of prayer — a three-step Customize flow:
 * Pray → Contemplation → Learn.
 *
 * Step 1 Pray: how you pray daily — community intercessions, a Daily Devotion,
 * or the full Offices. Step 2 Contemplation: minutes of silence a day (the
 * contemplation goal). Step 3 Learn: the daily reflections (multi-select;
 * Scripture is already covered when you pray a devotion/office).
 *
 * Finishing applies the prayer prefs (contemplation goal, office level,
 * reflection sources) AND rewrites the home + Daily progress to match — this
 * flow is the source of truth: prayer requests (pinned) → contemplation → the
 * office card (adapts to the chosen level) → every chosen reflection. Opens from
 * the Daily progress "Customize" pill and returns there when done.
 */

import { useState, useEffect, useRef, type ReactNode, useMemo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Check } from "lucide-react";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { RhythmWhyIntro } from "@/components/RhythmWhyIntro";
import { isNativeShell } from "@/lib/isNativeShell";
import { FROST, FROST_BLUR } from "@/lib/frost";
import { Spinner } from "@/components/ui/spinner";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { apiRequest } from "@/lib/queryClient";
import { adoptRoutineConfig } from "@/lib/routineSync";
import { summarizeRuleSpec, type RuleSpec } from "@/lib/ruleSummary";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { RULE_PRESETS, type RulePreset, type PrayChoice } from "@/lib/rulePresets";
import { RELATIONAL_PRACTICES, activeRelationalPractices, setRelationalPractices, type RelationalPracticeId, getCustomAnchors, addCustomAnchor, removeCustomAnchor, updateCustomAnchor, flushCustomAnchorPush, describeDays, getPracticeSlot, setPracticeSlot, CUSTOM_ANCHORS_EVENT, CUSTOM_SLOTS, READING_UNITS, type CustomAnchor, type CustomSlot, type SlottedPractice, type ReadingUnit, type ReadingConfig } from "@/lib/customAnchors";
import { pushRoutineConfig, collectRoutineValues, flushRoutineConfig } from "@/lib/routineSync";
import { saveHomeLayout, cacheHomeLayoutLocalOnly } from "@/lib/homeLayoutCache";
import { getRoutineOrder } from "@/lib/routineOrder";
import { setGuestSilenceGoalMin, getGuestSilenceGoalMinRaw } from "@/lib/guestSeed";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import {
  setSideLevel,
  setSideReflection,
  getSideReflectionExplicit,
  setSideMinutes,
  getSideMinutes,
  setReflectionSource,
  setSideEntry,
  getSideLevel,
  getExplicitSideLevel,
  type OfficeLevel,
  getSideEntry,
  getReflectionSource,
  getFddMode,
  setFddMode,
  type FddMode,
  getPsalmCycle,
  setPsalmCycle,
  getCommunityWithOffice,
  setCommunityWithOffice as persistCommunityWithOffice,
  getSideContemplation,
  getSideContemplationExplicit,
  setSideContemplation,
  getSideCustomName,
  setSideCustomName,
  getContemplationLogMethod,
  setContemplationLogMethod,
  type ContemplationLogMethod,
  type PsalmCycle,
  type ReflectionSource,
  getSideDayRules,
  setSideDayRules,
  type SideDayRule,
  type OfficeSide,
  type DefaultOfficeEntry,
  setSideExtra,
  getSideExtra,
  setSideContemplationKind,
  setDaySwapSuppressed,
  clearSideDaySwap,
  getSideContemplationKind,
  TRACKED_REFLECTION_SOURCES,
} from "@/lib/officePrefs";
import { anchorPracticeFor } from "@/lib/anchorPractices";
import { useBetaStatus } from "@/hooks/useDemo";
import { useKeyboardInputLift } from "@/hooks/useKeyboardInputLift";
import { WEEKLY_PRACTICES, getEnabledWeekly, setEnabledWeekly, WEEKLY_PRACTICES_ENABLED, type WeeklyKind } from "@/lib/weeklyRhythm";

// Set once a routine snapshot exists, so the entry slide can offer "go back
// to a past routine" synchronously instead of racing a fetch.
const HAS_ROUTINE_HISTORY_KEY = "phoebe:has-routine-history";

const BG = "#091A10";
const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const CARD = "rgba(9,26,16, 0.297)";
const CARD_ACTIVE = "rgba(46,107,64,0.34)";
// Match the app-wide card border (rgba(46,107,64,0.4) — the dominant resting
// border on dashboard/daily-progress surfaces) so the builder doesn't read as a
// different style. Was 0.28, which looked noticeably fainter than other cards.
const CARD_B = "rgba(46,107,64,0.4)";
const CARD_B_ACTIVE = "rgba(168,197,160,0.7)";
const CTA = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";

/**
 * One row of the flat routine list.
 *
 * Its own component because reordering has two gestures now (owner: "on each
 * card an up arrow and a down arrow, just like a triangle — click it and it
 * moves. But also if you hold, you can drag — but the whole card doesn't
 * drag, just when you're touching the left UI"), and the drag half needs
 *
 * dragListener={false} + the ⠿ handle's onPointerDown is what confines the
 * drag to the left UI — the card body, the gear and the ✕ no longer start
 * one, so scrolling a long routine with a thumb on a card just scrolls. The
 * arrows move one step per tap and disable at their end of the list.
 */
function FlatRoutineRow({ id, emoji, label, sub, circle, onGear, onRemove }: {
  id: string;
  emoji: string;
  label: string;
  sub: string;
  circle: React.CSSProperties;
  onGear: (() => void) | null;
  // Null hides the X — the Prayer List row is not removable (its presence
  // follows prayer requests and groups, not the routine).
  onRemove: (() => void) | null;
}) {
  // NO DRAG HANDLE, NO ARROWS. The day is ordered by the order it is actually
  // prayed in (lib/practiceOrderLearning), so a control here would move a row
  // and change nothing a person ever sees — which is precisely what the manual
  // order did for a year before it was retired.
  return (
    <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 16, padding: "12px 14px" }}>
      <span style={{ fontSize: 20, flexShrink: 0 }} aria-hidden>{emoji}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: CREAM, fontSize: 15, fontWeight: 600, fontFamily: FONT }}>{label}</span>
        <span style={{ display: "block", color: SAGE, fontSize: 12.5, fontFamily: FONT, marginTop: 2 }}>{sub}</span>
      </span>
      {onGear && (
        <button type="button" aria-label={`Settings for ${label}`} onClick={onGear} style={circle}>⚙</button>
      )}
      {onRemove && (
        <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} style={circle}>✕</button>
      )}
    </div>
  );
}

// Keep in sync with dashboard.tsx / customize-home.tsx — finishing the rule
// stamps the home layout with this version so it persists past a global reset.
const HOME_LAYOUT_VERSION = 2;
const SIDES = ["morning", "evening"] as const;

/**
 * Saturday / Sunday alternatives.
 *
 * Owner, of the seminary's rule: "the chapel custom practice should just be on
 * the weekdays; for the Saturday we want it to be morning prayer, and on
 * Sunday be worship" — then, "build this into the customizer where they can
 * adjust the practices to have Saturday and Sunday alternatives."
 *
 * The weekend is where a rule of life actually bends: the office you keep
 * before work isn't the one you keep on a Saturday, and Sunday is usually
 * church rather than anything done alone. Only Sat/Sun are offered here on
 * purpose — a full seven-day scheduler is a different, heavier tool, and this
 * covers the shape nearly everyone actually needs.
 *
 * Stored as officePrefs day rules, which getSideLevel resolves for TODAY, so
 * the home card, its title, begin-prayer's routing and the doneness clauses
 * all follow without knowing the schedule exists.
 */
function weekendOptions(side: OfficeSide): Array<{ value: PrayChoice; label: string }> {
  const cap = side === "morning" ? "Morning" : "Evening";
  return [
    { value: "offices", label: `${cap} Prayer` },
    { value: "guidedPrayer", label: "Simple Guided Prayer" },
    { value: "psalms", label: "Praying the Psalms" },
    { value: "readings", label: "Daily Scripture Readings" },
    { value: "contemplation", label: "Contemplative Prayer" },
    ...(side === "evening"
      ? ([{ value: "examen", label: "The Examen" }, { value: "compline", label: "Compline" }] as Array<{ value: PrayChoice; label: string }>)
      : []),
    { value: "ownPractice", label: "Something of your own" },
    { value: "none", label: "Nothing this day" },
  ];
}

/** One weekend day's alternative — null means "same as the rest of the week". */
type WeekendAlt = { choice: PrayChoice; name: string } | null;
type WeekendBySide = Record<OfficeSide, { sat: WeekendAlt; sun: WeekendAlt }>;

/** Read the stored day rules back into the picker's shape. */
function readWeekend(side: OfficeSide, prayFrom: (l: string | null | undefined) => PrayChoice | null): { sat: WeekendAlt; sun: WeekendAlt } {
  const rules = getSideDayRules(side);
  const at = (d: number): WeekendAlt => {
    const r = rules.find((x) => x.days.includes(d));
    if (!r) return null;
    const choice = prayFrom(r.level);
    return choice ? { choice, name: r.customName ?? "" } : null;
  };
  return { sat: at(6), sun: at(0) };
}

// The OFFICE ANCHOR a side commits to. Contemplative Prayer and the Examen are
// NOT anchors — they're independent add-on cards (silence goal / examen home
// card), the same way Co-Breathe and Forward Day by Day ride alongside — so a
// side can hold a BCP office AND a silent sit AND the Examen, each its own card.
// "none" = no office anchor for this side (e.g. contemplation-only). The
// contemplation/fdd/examen values remain only so an OLD saved level still reads
// back (prayFromLevel) and migrates forward on the next save.

/**
 * Owner: "let's hide the questionnaire from Shape your rhythm for right
 * now, take that out of the options."
 *
 * The "Ask me about my practice" row was already super-admin-only; this
 * takes it off even for them, temporarily. Flip back to false to restore
 * it — nothing else about the interview (the route, the server) changes.
 */
const ROUTINE_INTERVIEW_ENTRY_HIDDEN = true;

// Creation Prayer lengths — 6-breath increments, mirroring the /cobreathe
// page's own Length dropdown (default 12).
const COBREATHE_LENGTHS = [6, 12, 18, 24, 30, 36];

/**
 * The additional-practice picker's options — the SAME menu the side's first
 * slide offers, so the second slide "looks exactly like the first with a
 * different description" (owner).
 *
 * `excludes` is the anchor this option would duplicate. The Office and the
 * Devotion are separate rows here rather than one BCP row with a liturgy
 * dropdown, which is what makes the owner's example work directly: an anchor
 * of Morning Office rules out Morning Office and leaves Morning Devotion
 * choosable.
 */
/**
 * What an extra actually TURNS ON.
 *
 * Owner: "if they chose a secondary morning practice ... it should be a full
 * practice that leads to the practice." Every extra used to be written as a
 * custom anchor — a log-only row that happened to be titled "Morning Devotion".
 * Each of these is a real practice Phoebe already has a card and a page for, so
 * the extra turns THAT on instead of minting a checkbox with its name.
 *
 *  - "level":     a second office-form on the side (getSideExtra). Its card
 *                 opens the office; it completes on its own mode flag.
 *  - "practice":  one of the standing all-day cards, already wired.
 *  - "contemplation": the side's own Contemplation card.
 *  - "newsletter":    a reflection source. WHICH one is asked on the extra's
 *                     own details slide (extraConfigKindFor -> "newsletter"),
 *                     not baked in here — this row used to BE "Forward Day by
 *                     Day", which made Forward the only reflection reachable
 *                     as a second practice even though the home renders a card
 *                     for all four (owner).
 */
type ExtraMapping =
  | { kind: "level"; level: "office" | "devotion" | "psalms" | "readings" | "guided-prayer" }
  | { kind: "practice"; key: "audio" | "walk" | "examen" | "cobreathe" | "compline" | "visio" | "taize" | "chittister" }
  | { kind: "contemplation" }
  | { kind: "newsletter" };
type ExtraPractice = {
  title: (cap: string) => string;
  emoji: string;
  sub: string;
  /** The anchor level this duplicates — filtered out when it matches. */
  excludes: string;
  side?: OfficeSide;
  maps: ExtraMapping;
  /**
   * Which top-level row this sits under.
   *
   * Owner: the additional-practice slide "should first give the top level
   * options, that lead to the detail pages, as if it was doing the full
   * anchor, not just a list of all the other options." So the same shape the
   * anchor uses — a short list of kinds, then the particular one — instead of
   * twelve rows that mix "Morning Office" with "Audio Divina".
   */
  group: ExtraGroupId;
};
type ExtraGroupId = "office" | "guided" | "examen" | "contemplative" | "newsletter";
/** The top level, in the anchor step's own order. */
const EXTRA_GROUPS: Array<{ id: ExtraGroupId; emoji: string; title: string; sub: string }> = [
  { id: "office", emoji: "📖", title: "From the prayer book", sub: "The office, a devotion, the psalms or the readings." },
  { id: "guided", emoji: "🙌🏽", title: "Simple Guided Prayer", sub: "Praise · Confession · Thanksgiving · Supplication." },
  { id: "examen", emoji: "🌗", title: "The Examen", sub: "Review the day with God." },
  { id: "contemplative", emoji: "🕯️", title: "A contemplative practice", sub: "Silence, a walk, sacred listening, Visio Divina, or Creation Prayer." },
  { id: "newsletter", emoji: "📰", title: "A reflection", sub: "Forward, SSJE, CAC, VTS, Nouwen, Sojourners or Grist." },
];
const EXTRA_PRACTICES: ExtraPractice[] = [
  { title: (c) => `${c} Office`, emoji: "📖", sub: "The full Daily Office.", excludes: "office", maps: { kind: "level", level: "office" } , group: "office" },
  { title: (c) => `${c} Devotion`, emoji: "📖", sub: "A short devotion.", excludes: "devotion", maps: { kind: "level", level: "devotion" } , group: "office" },
  { title: (c) => `${c} Psalms`, emoji: "📜", sub: "The day's appointed psalms.", excludes: "psalms", maps: { kind: "level", level: "psalms" } , group: "office" },
  { title: (c) => `${c} Scripture Reading`, emoji: "📰", sub: "The day's appointed readings.", excludes: "readings", maps: { kind: "level", level: "readings" } , group: "office" },
  // No `side` — PACT is an evening practice too (owner). Its sub no longer
  // says "to start your day" for the same reason.
  { title: () => "Simple Guided Prayer", emoji: "🙌🏽", sub: "Praise · Confession · Thanksgiving · Supplication.", excludes: "guided-prayer", maps: { kind: "level", level: "guided-prayer" } , group: "guided" },
  { title: () => "The Examen", emoji: "🌗", sub: "Review the day with God.", excludes: "examen", maps: { kind: "practice", key: "examen" } , group: "examen" },
  // Not excluded by any anchor level: which newsletter is chosen on the next
  // slide, so the row can't clash with the anchor until that's known (the
  // sub-picker drops Forward when Forward IS the anchor).
  { title: () => "Reflection Newsletter", emoji: "📖", sub: "Forward, SSJE, CAC, VTS, Nouwen, Sojourners or Grist.", excludes: "__none__", maps: { kind: "newsletter" } , group: "newsletter" },
  { title: () => "Compline", emoji: "🌙", sub: "The night office.", excludes: "compline", side: "evening", maps: { kind: "practice", key: "compline" } , group: "office" },
  // Owner: "the contemplative one should have a description that reflects
  // that it could be a practice like Contemplative Walk and not just
  // silence." Sitting in stillness is still the mechanism this row turns on
  // (the per-side sit timer, same as before), but the WORDS shouldn't read
  // as if silence were the only legitimate form of contemplative prayer
  // when "Contemplative Walk" is right there as a sibling option in this
  // same menu.
  { title: () => "Contemplative Practice", emoji: "🕯️", sub: "Silence, or another contemplative practice like a walk.", excludes: "reflect-sit", maps: { kind: "contemplation" } , group: "contemplative" },
  { title: () => "Audio Divina", emoji: "🎵", sub: "Connecting with God through music.", excludes: "__none__", maps: { kind: "practice", key: "audio" } , group: "contemplative" },
  { title: () => "Contemplative Walk", emoji: "🚶🏽", sub: "A walk as prayer.", excludes: "__none__", maps: { kind: "practice", key: "walk" } , group: "contemplative" },
  // Visio was the one contemplative practice you could take as a side's ANCHOR
  // and as a STANDING practice but never as a side's SECOND one, while all
  // three of its siblings could. anchoredAsForm already de-duplicates it.
  { title: () => "Visio Divina", emoji: "🖼️", sub: "Pray with an image — the day's artwork.", excludes: "__none__", maps: { kind: "practice", key: "visio" } , group: "contemplative" },
  // An INBOX, not a daily: it waits until it is read, and goes quiet until
  // Taizé posts the next one. Offered here because it is a reflection you sit
  // with, not because it behaves like the others in this list.
  { title: () => "Taizé meditation", emoji: "🕯️", sub: "A meditation from Taizé — it waits until you read it.", excludes: "__none__", maps: { kind: "practice", key: "taize" } , group: "contemplative" },
  // The other two inboxes, on the same terms. They shipped with a card, a
  // menu row and a home-layout key — and no way to TURN ON, because the only
  // switch was on /customize-home, a page nothing in the app links to. The
  // owner asked for Chittister's weekly by name ("try to integrate the weekly
  // here") and could not have found it.
  { title: () => "Vision and Viewpoint", emoji: "🌾", sub: "Joan Chittister's weekly — it waits until you read it.", excludes: "__none__", maps: { kind: "practice", key: "chittister" } , group: "contemplative" },
  { title: () => "Creation Prayer", emoji: "🌍", sub: "Breathing with God's creation.", excludes: "__none__", maps: { kind: "practice", key: "cobreathe" } , group: "contemplative" },
];

/** The extra chosen for a side, as its catalogue entry. */
function extraEntryFor(title: string | null, cap: string): ExtraPractice | null {
  if (!title) return null;
  return EXTRA_PRACTICES.find((e) => e.title(cap) === title) ?? null;
}

/**
 * The office MODE a level completes as — mirrors officePrefs.extraOfficeMode.
 * Used here to refuse a pairing the home could never tell apart: two practices
 * on one side that write the same completion flag are one practice with two
 * cards, and the second would tick itself whenever the first was prayed.
 */
function levelOfficeMode(side: OfficeSide, level: string): string | null {
  if (level === "office") return side;
  if (level === "compline") return "compline";
  if (level === "devotion" || level === "psalms" || level === "readings" || level === "guided-prayer") {
    return side === "morning" ? "morning-devotion" : "early-evening-devotion";
  }
  return null;
}
// bcpForm's liturgy → the PrayChoice it corresponds to, so the extra slide can
// rule out the exact liturgy chosen as the anchor rather than the BCP as a whole.
const BCP_FORM_TO_PRAY: Record<string, PrayChoice> = {
  offices: "offices",
  devotion: "devotion",
  psalms: "psalms",
  compline: "compline",
  readings: "readings",
};

const EXTRA_PRACTICE_EMOJI: Record<string, string> = Object.fromEntries(
  EXTRA_PRACTICES.flatMap((e) => ["Morning", "Evening"].map((c) => [e.title(c), e.emoji])),
);
type Step =
  // The opening slide: what this whole flow is for, and nothing else on it.
  | "intro"
  // Which sides are part of the day at all — the flow's opening question
  // (owner: "it starts asking if you would like morning or evening, and you
  // can turn them off or on"). A side has always been derivable from its way
  // slide (nothing chosen = off); this asks it outright, first.
  | "sides"
  // A side's anchor is picked, then NAMED, then configured — three slides, the
  // shape "Create your own" always had and the one the owner asked the other
  // two kinds to match: pick the kind, choose WHICH one, then its details.
  | "morning-way" | "morning-custom" | "morning-bcp" | "morning-contemplative" | "morning-config"
  | "fdd-mode"
  | "psalms-cycle"
  | "evening-way" | "evening-custom" | "evening-bcp" | "evening-contemplative" | "evening-config"
  // RELATIONAL PRACTICES — a category of its own (owner: "a new page on the
  // customizer that was relational … give someone a hug, express gratitude,
  // call a friend"). One slide, three toggles, each writing an ordinary custom
  // log so they inherit the home card and the done state.
  | "relational"
  // The "add an additional practice" slide — the same picker as the side's
  // first slide, minus whatever is already its anchor.
  | "morning-extra" | "evening-extra"
  // …the WHICH-ONE slide, when the kind they picked has more than one (the
  // prayer-book row, the contemplative row) — the anchor's own two-level shape.
  | "morning-extra-pick" | "evening-extra-pick"
  // …and its own details slide, when the practice they picked has details.
  | "morning-extra-config" | "evening-extra-config"
  | "contemplative" | "contemplation-goal"
  | "learn" | "extras" | "custom" | "weekly" | "done"
  | "starter" | "tend";
// Named starter rules — coherent forms a first author adopts WHOLE and tunes
// later (you receive a rule, you don't compose one from a blank trellis). Each
// applies to the same office-prefs + home-layout the full flow writes.

// ── The TIME LADDER — the automatic transmission's dial (owner, 2026-07-03).
// The first question isn't "which liturgy?" but "how much time will you give
// each day?" Every 5-minute step maps to one coherent suggested rhythm; the
// picker shows the routine live as the dial moves and adopts it whole.
// Forward Day by Day rides every step (the daily word), silence enters at 15.
type TimeStep = {
  minutes: number;
  /** What the rhythm contains, as display rows (emoji + label). */
  rows: Array<{ emoji: string; label: string }>;
  preset: RulePreset;
};
const TIME_LADDER: TimeStep[] = [
  {
    minutes: 5,
    rows: [
      { emoji: "📜", label: "The day's Psalms, once a day" },
      { emoji: "📖", label: "Forward Day by Day" },
    ],
    preset: { id: "time-5", emoji: "📜", sides: { morning: true, evening: false }, pray: "psalms", silence: false, goalMin: 0, reflections: ["fdd"] },
  },
  {
    minutes: 10,
    rows: [
      { emoji: "🌅", label: "Morning Psalms" },
      { emoji: "📖", label: "Forward Day by Day" },
      { emoji: "🌆", label: "Evening Devotion" },
    ],
    preset: { id: "time-10", emoji: "🌅", sides: { morning: true, evening: true }, pray: "psalms", evening: "devotion", silence: false, goalMin: 0, reflections: ["fdd"] },
  },
  {
    minutes: 15,
    rows: [
      { emoji: "🌅", label: "Morning Psalms" },
      { emoji: "📖", label: "Forward Day by Day" },
      { emoji: "🌆", label: "Evening Devotion" },
      { emoji: "🕯️", label: "5 minutes of silence" },
    ],
    preset: { id: "time-15", emoji: "🌅", sides: { morning: true, evening: true }, pray: "psalms", evening: "devotion", silence: true, goalMin: 5, silenceSide: "morning", reflections: ["fdd"] },
  },
  {
    minutes: 20,
    rows: [
      { emoji: "🌅", label: "Morning Prayer" },
      { emoji: "📖", label: "Forward Day by Day" },
      { emoji: "🕯️", label: "5 minutes of silence" },
    ],
    preset: { id: "time-20", emoji: "🌅", sides: { morning: true, evening: false }, pray: "offices", silence: true, goalMin: 5, silenceSide: "morning", reflections: ["fdd"] },
  },
  {
    minutes: 25,
    rows: [
      { emoji: "🌅", label: "Morning Prayer" },
      { emoji: "📖", label: "Forward Day by Day" },
      { emoji: "🌆", label: "Evening Devotion" },
      { emoji: "🕯️", label: "5 minutes of silence" },
    ],
    preset: { id: "time-25", emoji: "🌅", sides: { morning: true, evening: true }, pray: "offices", evening: "devotion", silence: true, goalMin: 5, silenceSide: "morning", reflections: ["fdd"] },
  },
  {
    minutes: 30,
    rows: [
      { emoji: "🌅", label: "Morning Prayer" },
      { emoji: "🌆", label: "Evening Prayer" },
      { emoji: "📖", label: "Forward Day by Day" },
      { emoji: "🕯️", label: "5 minutes of silence" },
    ],
    preset: { id: "time-30", emoji: "📖", sides: { morning: true, evening: true }, pray: "offices", silence: true, goalMin: 5, silenceSide: "morning", reflections: ["fdd"] },
  },
];
// The dial starts at 30 — Morning Prayer · Evening Prayer · Forward Day by Day ·
// 5 minutes of silence (the owner's chosen starting rule: the full Daily Office,
// morning AND evening).
const TIME_LADDER_DEFAULT = 5;

/**
 * Quarter-hour reminder times, labelled the way a person says them.
 *
 * `current` is included even when it isn't on the quarter-hour grid — an
 * existing 07:05 reminder must not be silently rounded to 07:00 just because
 * the control changed shape.
 */
function reminderTimeOptions(current: string): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (let mins = 0; mins < 24 * 60; mins += 15) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    out.push({ value, label: `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}` });
  }
  if (/^\d{2}:\d{2}$/.test(current) && !out.some((o) => o.value === current)) {
    const [ch, cm] = current.split(":").map((n) => parseInt(n, 10));
    const hour12 = ch % 12 === 0 ? 12 : ch % 12;
    out.push({ value: current, label: `${hour12}:${String(cm).padStart(2, "0")} ${ch < 12 ? "AM" : "PM"}` });
    out.sort((a, b) => a.value.localeCompare(b.value));
  }
  return out;
}

// Contemplation goal options — a single dropdown in 5-minute increments.
const GOAL_OPTIONS = Array.from({ length: 17 }, (_, i) => (i + 2) * 5); // 10…90
// One SIT's length, per side. Deliberately its own list, not GOAL_OPTIONS: that
// is the DAILY total across however many sits a person keeps, and conflating
// the two is exactly how a daily goal used to get mistaken for a per-side sit.
const SIT_LENGTHS = [2, 5, 10, 15, 20, 25, 30, 45, 60];

// Each Pray choice → the office level it commits the day to. Community keeps no
// office (the home shows "Pray Together"); devotion/offices set the office card.
const PRAY_LEVEL: Record<PrayChoice, "ask" | "intercessions" | "devotion" | "office" | "reflect-sit" | "fdd" | "readings" | "psalms" | "examen" | "creation" | "guided-prayer" | "custom" | "compline"> = {
  // No office anchor on this side — its level clears to "ask" (no office card).
  // Any Contemplative / Examen the user picked surface as their OWN cards.
  none: "ask",
  community: "intercessions",
  devotion: "devotion",
  offices: "office",
  // Compline IS this side's office — the night office standing in for
  // Evening Prayer, for someone whose evening anchor is the shorter
  // bedtime liturgy. Evening-only in the UI (see the way step); the
  // level itself is side-agnostic.
  compline: "compline",
  // Contemplation as the primary form of prayer for this side — "reflect-sit"
  // is the handled office level for a contemplative sit (begin-prayer routes it
  // to the silence timer).
  contemplation: "reflect-sit",
  // Forward Day by Day IS the prayer for this side — the home FDD card replaces
  // the office card for whoever picks it.
  fdd: "fdd",
  // Daily Scripture Readings (Forward Movement) IS the prayer for this side —
  // the home Readings card replaces the office card, either side.
  readings: "readings",
  // Praying the Psalms IS the prayer for this side — the home Psalms card.
  psalms: "psalms",
  // The Ignatian Examen IS the prayer for this side (usually evening) — the
  // home Examen card replaces the office card for whoever picks it.
  examen: "examen",
  // Creation Prayer IS the prayer for this side — a creation-focused devotion
  // (the creation Psalter + prayers, opening with Co-Breathe). begin-prayer
  // routes the "creation" level to /creation-devotion.
  creation: "creation",
  // Simple Guided Prayer (PACT) IS the prayer for this side — the home
  // Morning/Evening Simple Guided Prayer card replaces the office card.
  guidedPrayer: "guided-prayer",
  // A practice the user named themselves IS the prayer for this side — the
  // home Morning/Evening [name] card, a plain tap-to-mark-done.
  ownPractice: "custom",
};
// Inverse of PRAY_LEVEL — read an existing office level back into a Pray
// choice so Customize opens with the user's current pick selected.
function prayFromLevel(level: string | null | undefined): PrayChoice | null {
  if (level === "office") return "offices";
  if (level === "compline") return "compline";
  if (level === "devotion") return "devotion";
  if (level === "intercessions") return "community";
  if (level === "reflect-sit") return "contemplation";
  if (level === "fdd") return "fdd";
  if (level === "readings") return "readings";
  if (level === "psalms") return "psalms";
  if (level === "examen") return "examen";
  if (level === "creation") return "creation";
  if (level === "guided-prayer") return "guidedPrayer";
  if (level === "custom") return "ownPractice";
  return null;
}
// Read a saved office level back into a side's OFFICE ANCHOR only. Contemplation
// and the Examen are no longer anchors (they're independent add-on cards), so a
// reflect-sit / examen level maps to "none" here — the anchor is empty and the
// silence / examen card is seeded separately (from the goal + the examen home
// key). This is what lets a BCP office coexist with a silent sit.
function anchorFromLevel(level: string | null | undefined, side?: "morning" | "evening"): PrayChoice {
  const p = prayFromLevel(level);
  // "examen" is an office ANCHOR only on evening — the shipped PACT/Examen
  // pairing stores evening's Simple Guided Prayer choice as level "examen",
  // and the way-step's choiceRow checks prayBySide.evening === "examen" to
  // show it selected. Dropping it here (as the morning-only "examen is an
  // add-on, not an anchor" rule did) meant reopening the customizer always
  // showed evening's Simple Guided Prayer as unselected.
  if (p === "examen" && side === "evening") return p;
  // "readings" (Daily Scripture Readings) IS a BCP form anchor, same as
  // psalms/devotion/offices — dropping it here (as it originally mirrored
  // fdd's exclusion) meant reopening the customizer showed "With the Book
  // of Common Prayer" as unselected for anyone whose side is actually set
  // to it, including the new evening default (owner: "the full customizer
  // should work from what the user has").
  // "fdd" (a Reflection IS this side's prayer) is an anchor too. Leaving it out
  // meant a morning set to Forward Day by Day opened the customizer with NOTHING
  // selected on the way-step — and then, because commit() writes the whole rule
  // from flow state, saving one unrelated edit wrote that "nothing" back over a
  // rhythm the reader had. Screen-recorded. This is the THIRD level to be
  // restored to this list for exactly that reason (see examen and readings
  // above); the list is the bug, and every anchor level belongs in it.
  return p === "offices" || p === "compline" || p === "devotion" || p === "psalms" || p === "readings" || p === "fdd" || p === "community" || p === "creation" || p === "guidedPrayer" || p === "ownPractice" ? p : "none";
}
// …and the existing PRACTICES option id, so the saved selections stay readable
// by the Way of Love drawer / weekly review (commitmentLines).
const PRAY_OPTION_ID: Record<PrayChoice, string> = {
  none: "pray-devotion",
  community: "pray-intercessions",
  devotion: "pray-devotion",
  offices: "pray-office",
  compline: "pray-compline",
  contemplation: "pray-reflect-sit",
  fdd: "pray-fdd",
  readings: "pray-readings",
  psalms: "pray-psalms",
  examen: "pray-examen",
  creation: "pray-creation",
  guidedPrayer: "pray-guided-prayer",
  ownPractice: "pray-own-practice",
};
// Each Pray choice → the morning reminder pref the office-reminder cron reads
// (parish_office_morning_pref). "office" deep-links the nudge to Morning
// Prayer; "devotion" to the short form — community/devotion users get the
// lighter nudge. This is the REMINDER target only; it's independent of the
// default prayer level set above. A non-"none" value is what makes the daily
// 7am push fire at all (see runParishOfficeReminderSender on the server).
const PRAY_REMINDER_PREF: Record<PrayChoice, "office" | "devotion"> = {
  // A no-office side (contemplation/examen only) still gets the light nudge.
  none: "devotion",
  community: "devotion",
  devotion: "devotion",
  offices: "office",
  // Compline is a full (if short) office — same office-flavoured nudge.
  compline: "office",
  contemplation: "devotion",
  // FDD as morning prayer gets the lighter nudge that just opens the practice.
  fdd: "devotion",
  // Daily Scripture Readings gets the same lighter nudge.
  readings: "devotion",
  // Praying the Psalms gets a reminder (a non-"none" value fires the daily push).
  psalms: "devotion",
  // The Examen gets the lighter nudge that just opens the practice.
  examen: "devotion",
  // Creation Prayer gets the lighter nudge that opens the devotion.
  creation: "devotion",
  // Simple Guided Prayer gets the lighter nudge that opens the practice.
  guidedPrayer: "devotion",
  // A user's own named practice gets the lighter nudge too.
  ownPractice: "devotion",
};
// Default reminder times — 7am / 6pm (owner). Reminder TIMES themselves are no
// longer asked in the customizer; they're set in Settings → Daily reminders,
// which uses these same defaults (settings.tsx DEFAULT_MORNING/DEFAULT_EVENING).
const DEFAULT_REMINDER_TIME = "07:00";
/**
 * The slide column's bottom padding — and the exact amount the sticky CTA
 * cancels with a negative margin so it can sit at the true bottom of the
 * screen. ONE constant because the two must agree: when they drifted, the
 * button floated a padding's worth above the bottom edge.
 */
const SHELL_PAD_BOTTOM = 40;

// Is a home module currently surfaced? Mirrors the dashboard's gate: only a
// current-version layout counts, and the key must be in `order` and not
// `hidden`. Used to seed the optional-practice toggles from the live home.
/**
 * Is the Creation Prayer home card there because a SIDE keeps the breath?
 *
 * Owner: "if I had creation prayer in an anchor and take it out, it should not
 * be transferred into my contemplative practices — it should just be turned
 * off." (And: "but I could then turn it back on.")
 *
 * A side that keeps the breath makes commit() write the `cobreathe` home card.
 * The standing-practices toggle then seeded ITSELF from that same card — so
 * removing Creation Prayer from the anchor didn't remove it at all, it moved
 * it: the card stayed on, the toggle read it back as a standalone practice,
 * and commit wrote it again. The practice migrated rather than ending.
 *
 * So the card only counts as a STANDING practice when no side is carrying it.
 * It stays a row on the contemplative slide either way, so taking it off an
 * anchor and then choosing it as a standing practice is still one tap.
 */
function creationHeldBySide(): boolean {
  return (["morning", "evening"] as const).some(
    (sd) => getSideContemplation(sd) && getSideContemplationKind(sd) === "creation",
  );
}

function homeCardOn(
  hl: { order?: string[]; hidden?: string[]; v?: number } | null | undefined,
  key: string,
): boolean {
  // Read the saved layout REGARDLESS of its version — a version mismatch must
  // never discard the user's choices (that was the "every code change wipes my
  // home" bug). New/removed modules are reconciled by the order-merge on the
  // home + customize pages; the key is on iff it's in order and not hidden.
  if (!hl) return false;
  return (hl.order ?? []).includes(key) && !new Set(hl.hidden ?? []).has(key);
}

const NEWSLETTERS: { id: ReflectionSource; label: string; sub: string }[] = [
  { id: "fdd", label: "📖 Forward Day by Day", sub: "Forward Movement" },
  { id: "ssje", label: "✍🏽 SSJE — Brother, Give Us a Word", sub: "Society of St. John the Evangelist" },
  { id: "cac", label: "🌅 CAC Daily Meditation", sub: "Center for Action & Contemplation" },
  { id: "vts", label: "🦩 VTS Dean's Commentary", sub: "Virginia Theological Seminary · weekdays" },
  // Read-only sources (see ReflectionSource): they sit in the rule and open in
  // the reader like the others, but opening one is not scored.
  { id: "nouwen", label: "😊 Daily Henri Nouwen Quotes", sub: "Henri Nouwen Society" },
  { id: "sojo", label: "🕊️ Sojourner's Voice and Verse", sub: "Verse, voice and prayer of the day" },
  { id: "grist", label: "🌍 Grist Climate News", sub: "The day's climate journalism · weekdays" },
];

// A captured routine, identical to what commit() would write — used by the
// "prescribe a routine for someone" flow. Mirrors PrescribedRoutineSpec server-side.
export type RoutineSpec = {
  v: 1;
  officePrefs: {
    defaultPrayerLevel: string;
    contemplationGoalMinutes: number;
    contemplationReminderEnabled: boolean;
    morning: "office" | "devotion" | "none";
    evening: "office" | "devotion" | "none";
    morningTime: string | null;
    eveningTime: string | null;
  };
  silenceLadderEnabled: boolean;
  homeLayout: { order: string[]; hidden: string[]; v?: number };
  ruleConfig: Record<string, string>;
};

export default function WayOfLoveRuleFlow({
  onBack,
  onDone,
  // When set, the flow is being used to DESIGN a routine for someone else, not
  // to edit the current user's own account. commit() then captures the routine
  // and hands it to onPrescribe instead of writing any of it to the server. The
  // prescribe PAGE snapshots + restores the admin's own device routine keys so
  // designing here never disturbs the admin's own rhythm.
  prescribe = false,
  onPrescribe,
  // Pilot: a trimmed rhythm builder (morning/evening → reflections → silence →
  // one custom anchor). Drops the contemplative multi-select, per-practice
  // time-of-day slides, "add to your day" extras, the weekly rhythm, and CAC.
  pilot = false,
  // Guest (the PUBLIC no-login version): a signed-out customizer that writes
  // ONLY device-local prefs. Per-side ways trim to BCP · Contemplative Prayer ·
  // Co-Breathe; the BCP form + medium + reminder merge onto ONE per-side slide;
  // the silence step keeps its minutes goal but drops the "grow toward 30"
  // ladder; contemplative multi-select / extras / weekly are dropped (the
  // custom step stays). commit() skips every server PUT and mirrors the goal
  // into the guest silence key. See memory "project_public_no_login".
  guest = false,
}: {
  onBack: () => void;
  onDone: () => void;
  prescribe?: boolean;
  onPrescribe?: (spec: RoutineSpec) => void;
  pilot?: boolean;
  guest?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const entitlements = useEntitlements();
  const [, setLocation] = useLocation();
  // Owner: "For super admins, let's build a version where the first slide is an
  // option to do manual or have it ask questions." Same signal the rest of the
  // app calls super-admin (beta_users.is_admin, via /api/beta/status) — reused
  // rather than adding a second /admin/am-super query for the same bit.
  //
  // Rendered as a PRELUDE (like the why-intro below) rather than a step in
  // orderedSteps: rawIsAdmin arrives from a query and is false while it loads,
  // so a step list computed from it would flicker, and an initial `step`
  // computed from it would skip the slide entirely for the admin it's for.
  const { rawIsAdmin: isSuperAdmin } = useBetaStatus();
  const [entryChoiceMade, setEntryChoiceMade] = useState(false);
  /**
   * Manual path, second question: rebuild the whole thing, or change one part?
   *
   * Owner: "when they [choose] 'I'll set it up myself', before it goes straight
   * into the morning it should show their routine ... first it should ask,
   * start from scratch or edit part."
   *
   * Walking someone through eight slides to move one reminder is how a small
   * change becomes an accidental rewrite — the same reason the questionnaire
   * grew an adjust mode. Only shown when there IS a routine to edit.
   */
  /**
   * Opens on YOUR RHYTHM, not on a menu about it.
   *
   * Owner: "the beginning of Shape your routine should just first show the
   * person's routine like how the edit is, and have options at the bottom that
   * are choose preset and revert to past routine."
   *
   * It used to open on "What would you like to do?" — four rows describing
   * ways to answer a question you can't see yet. The rhythm itself is the
   * answer: show it, let them change a row in place, and keep the two whole-
   * rhythm moves (adopt a preset, go back to a past one) at the bottom where
   * they belong. "pick" is gone; `canEditParts` still decides whether there's
   * a rhythm to show at all, so a first-time author falls straight through to
   * the flow as before.
   */
  const [manualMode, setManualMode] = useState<"scratch" | "edit" | "preset">("edit");
  // A named rule the person has TAPPED but not yet confirmed. Adopting replaces
  // an existing rhythm wholesale (the ?adopt= path refuses to do that silently —
  // it once wiped people's offices), so the picker always asks first.
  const [presetPending, setPresetPending] = useState<string | null>(null);
  /**
   * A side whose ANCHOR reads a different newsletter from the rule's own —
   * carried from adoptRule to commit(), which otherwise points every side at
   * newsletters[0] and would undo it a slide later. Empty for every rule that
   * doesn't ask (see rulePresets.anchorReflection).
   */
  /**
   * WHICH reflection is each side's prayer — the side's own answer, seeded.
   *
   * It started empty, so commit() fell back to `newsletters[0]`: the first of
   * the reader's followed reflection CARDS, which has nothing to do with the
   * one their morning is set to. Screen-recorded: a morning anchored to
   * Forward Day by Day opened the "Which reflection?" step with CAC selected —
   * their day reflection — and saving moved the anchor to CAC.
   *
   * Worse, the picker wrote to `newsletters` rather than here, so choosing
   * Forward Day by Day for the morning also pushed it to the head of the
   * followed list and commit() gave them a second, separate "Forward Day by
   * Day — Each day" card they never asked for.
   *
   * Both halves are one mistake: the side's anchor source and the reader's
   * followed reflections are different questions and were sharing one answer.
   */
  const [anchorReflectionBySide, setAnchorReflectionBySide] = useState<Partial<Record<OfficeSide, ReflectionSource>>>(() => {
    const out: Partial<Record<OfficeSide, ReflectionSource>> = {};
    for (const s of ["morning", "evening"] as OfficeSide[]) {
      if (getSideLevel(s) !== "fdd") continue;
      const src = getSideReflectionExplicit(s);
      if (src) out[s] = src;
    }
    return out;
  });
  /**
   * Owner: "you can just edit one, and then it saves and goes back."
   *
   * The gear on the edit list used to drop you into the middle of the full
   * flow (manualMode "scratch" + that step), so changing one practice meant
   * walking every remaining slide to the end before anything was written. This
   * holds the row being edited alone: while it's set, Continue COMMITS and
   * returns to the list instead of advancing.
   */
  const [singleEditRow, setSingleEditRow] = useState<string | null>(null);
  /** Set when a single-practice edit was DEEP-LINKED from another screen
   *  (?edit=<rowId>&return=<path>). Saving returns there rather than to the
   *  customizer's own list, so the reader lands back where they started. */
  const [singleEditReturnTo, setSingleEditReturnTo] = useState<string | null>(null);
  /** Single edit begun ON the review screen — Save returns there ("done"),
   *  not to the edit list. */
  const [returnToReview, setReturnToReview] = useState(false);
  const [editRows, setEditRows] = useState<Array<{ id: string; emoji: string; label: string; sub: string }>>([]);
  const [editLoaded, setEditLoaded] = useState(false);
  const [deletingEditRow, setDeletingEditRow] = useState<{ id: string; label: string } | null>(null);
  /**
   * THE FLAT ENTRY's phases (owner: the customizer opens on your routine as a
   * plain reorderable list — no morning/evening slots for the sake of the
   * routine; Add walks five categories; notifications close the flow as the
   * light anchor system). Local phases rather than Steps: none of these
   * belong to orderedSteps' walk, and a phase can't be goNext'd into.
   */
  const [entryPhase, setEntryPhase] = useState<"list" | "add-cat" | "add-items" | "add-minutes" | "add-custom" | "notify">("list");
  const [addCat, setAddCat] = useState<"sgp" | "bcp" | "contemplative" | "reflections" | "custom" | null>(null);
  // The top-bar ⚙ dropdown on the flat list (preset / revert) — see shell.
  const [sitMinutes, setSitMinutes] = useState("10");
  const [newCustomName, setNewCustomName] = useState("");
  /** The list's drag order — edit-row ids. Re-derived whenever rows load. */
  const [orderIds, setOrderIds] = useState<string[]>([]);
  useEffect(() => {
    const saved = getRoutineOrder();
    const ids = editRows.map((r) => r.id);
    const known = saved.filter((id) => ids.includes(id));
    const rest = ids.filter((id) => !known.includes(id));
    setOrderIds([...known, ...rest]);
  }, [editRows]);
  const [notifyTarget, setNotifyTarget] = useState<Record<OfficeSide, string>>(() => {
    const read = (sd: OfficeSide) => { try { return localStorage.getItem(`phoebe:notify-target:${sd}`) ?? ""; } catch { return ""; } };
    return { morning: read("morning"), evening: read("evening") };
  });
  /**
   * Each nudge opens a CONCRETE practice from the routine — the vague "Your
   * usual practice" option is gone (owner: "get rid of 'your usual practice';
   * anything they chose that's most applicable for morning, make that the
   * morning one, and the one most applicable for evening the evening one").
   *
   * Seeded when the notify slide opens, and only into an empty or orphaned
   * target — a choice the person made stays theirs. Morning wants the row
   * that reads most like a morning (the morning side's own practice, its
   * extra, then a daily-word reflection, then the front of their order);
   * evening wants the evening side, its extra, the Examen (a review of the
   * day), then the back of their order.
   */
  useEffect(() => {
    // The Prayer List row orders the home card but is NOT a nudge target
    // (notifyOptions filters it out) — seed from the same filtered set, or a
    // routine where it sits first/last seeds a target the select can't show.
    const targetIds = orderIds.filter((id) => id !== "slot:prayer-list");
    if (entryPhase !== "notify" || targetIds.length === 0) return;
    const pick = (sd: OfficeSide, current: string, taken: string | null): string => {
      if (current && targetIds.includes(current)) return current;
      const prefs = sd === "morning"
        ? ["side:morning", "extra:morning", ...targetIds.filter((id) => id.startsWith("card:"))]
        : ["side:evening", "extra:evening", "slot:examen"];
      for (const p of prefs) if (targetIds.includes(p) && p !== taken) return p;
      const pool = targetIds.filter((id) => id !== taken);
      if (pool.length === 0) return targetIds[0]!;
      return sd === "morning" ? pool[0]! : pool[pool.length - 1]!;
    };
    setNotifyTarget((prev) => {
      const morning = pick("morning", prev.morning, null);
      const evening = pick("evening", prev.evening, morning);
      if (morning === prev.morning && evening === prev.evening) return prev;
      return { morning, evening };
    });
  }, [entryPhase, orderIds]);
  /** The review screen's ✕ confirm — carries the row's own remove(), since
   *  review rows are built from local state rather than server row ids. */
  // Whether this person has any past routine to go back to — read synchronously
  // from the flag the snapshot save leaves behind (see the effect below).
  const [hasRoutineHistory] = useState(() => {
    try { return localStorage.getItem(HAS_ROUTINE_HISTORY_KEY) === "1"; } catch { return false; }
  });
  // Defaults to "ask" (owner) — the interview is the intended path for a super
  // admin opening this; manual is the opt-out.
  // "Ask me" is the default only for those who have it — everyone else came
  // here to edit, so the manual path leads.
  const [entryChoice, setEntryChoice] = useState<"ask" | "manual" | "preset" | "revert">("ask");
  // (Removed: the weekly-cards step's own on/off state. That step is gone and
  // the card defaults ON — its toggle lives in Settings → Home display, which
  // owns the same phoebe:hide-turn-learn-pray key.)
  // A brand-new author — nobody has chosen a side level yet — is offered the
  // preset picker ("automatic mode"): four whole rules to adopt and tune, so
  // they don't have to know how to "drive stick" to begin. Anyone with an
  // existing rule (or the trimmed pilot flow) opens straight into the manual
  // shaping flow. "Or build my own →" drops into it too.
  //
  // That entry point is "sides" now — the flow's restored opening question.
  // It must be a step the CURRENT list contains: goNext looks the step up by
  // index, so opening on a step that isn't in orderedSteps gives -1 and a
  // Continue that does nothing. That is exactly what happened when "when" was
  // removed, and again when "intro" left the full list; "intro" survives only
  // in the guest/pilot lists, which still carry it.
  const [step, setStep] = useState<Step>(() => {
    // Guests always open the manual flow: their rule is already running (the
    // first-open seed), so the preset picker would re-adopt over it.
    if (pilot || guest) return "intro";
    const hasRule = !!getExplicitSideLevel("morning") || !!getExplicitSideLevel("evening");
    return hasRule ? "sides" : "starter";
  });
  // Show the "technology of holding" prelude ONCE, before the very first author
  // reaches the preset picker — it names why a daily practice matters and where
  // it leads, so the customizer isn't a stick shift you must already know how to
  // drive. Gated on a localStorage flag + first-author (same signal as `step`).
  const [showWhy, setShowWhy] = useState<boolean>(() => {
    if (pilot || guest) return false;
    const hasRule = !!getExplicitSideLevel("morning") || !!getExplicitSideLevel("evening");
    if (hasRule) return false;
    try { return !localStorage.getItem("phoebe:rhythm-why-seen"); } catch { return false; }
  });
  // When a named starter rule is adopted, its id parks here until the next render
  // (after the state setters have applied) so the commit effect writes the rule.
  const [adoptId, setAdoptId] = useState<string | null>(null);
  // When they want to pray — morning, evening, or both. Seeded from whichever
  // sides already have a per-side level; defaults to both on first run. At least
  // one side stays selected.
  const [sides, setSides] = useState<{ morning: boolean; evening: boolean }>(() => {
    const m = getExplicitSideLevel("morning");
    const e = getExplicitSideLevel("evening");
    if (m || e) return { morning: !!m, evening: !!e };
    return { morning: true, evening: true };
  });
  // Preload from the user's current settings so Customize reflects what they
  // already chose, not the first-run defaults. localStorage per-side levels +
  // reflection + minutes are instant; the server office-prefs (the global
  // default + goal) hydrate a moment later for users whose pref was set
  // globally without a per-side override.
  // Default to 5 minutes — a gentle starting goal. A saved goal hydrates from the
  // server pref below (contemplationGoalMinutes) when the user has one (any value
  // is kept, e.g. 144); clearing the field on the goal step sets "No goal" (0).
  // GUESTS have no server pref to hydrate from — their goal is the device-local
  // guest key (the first-open seed writes 5 there; commit() writes it back), so
  // seed the field from it and the Silence step opens on what the home shows.
  const [goal, setGoal] = useState(() => {
    if (guest) {
      const g = getGuestSilenceGoalMinRaw();
      if (g != null) return String(g);
    }
    return "5";
  });
  // Notification style — closing step. "gentle" (default) = today's one
  // reminder per side; "nudge" = also send the ~3h-later follow-up when that
  // side's office/practice still isn't done. Guests can pick it but it isn't
  // persisted anywhere until they have an account (no office-prefs row yet).
  const [notificationStyle, setNotificationStyle] = useState<"gentle" | "nudge">("gentle");
  // Per-side configuration — each chosen side gets its own way + method + time.
  // Standard preset is Morning Devotion (on screen, 7:30) — so a fresh user with
  // no saved level defaults to "devotion", not the more involved "community".
  // The OFFICE ANCHOR per side (BCP form / community / none). Contemplative
  // Prayer + the Examen are NOT stored here — they're independent add-ons — so a
  // saved reflect-sit/examen level seeds "none" here and is picked up by the
  // contemplative state below. Each side reads only its OWN level.
  const [prayBySide, setPrayBySide] = useState<Record<OfficeSide, PrayChoice>>(() => {
    /**
     * A LEGACY side is not "Create your own", even though that's how it's stored.
     *
     * Walks, sacred listening and Visio Divina used to be written as an
     * `ownPractice` side with the practice's NAME in the custom-name field.
     * contemplativeForm's seed already recovers those back into the real
     * practice — but it only fixed half the state. This seed still read the
     * level as "custom" and set ownPractice, so buildSteps kept the
     * "Create your own — what will you pray in the evening?" slide in the
     * flow, pre-filled with "Visio Divina".
     *
     * Reported with screenshots: Contemplative Practice selected, Visio Divina
     * selected under it, and then that slide anyway. Both halves have to
     * recover or the rule is half one thing and half the other — the picker
     * itself writes "none" for these, and so does this now.
     */
    const seed = (s: OfficeSide): PrayChoice => {
      if (getSideLevel(s) === "custom") {
        const named = anchorPracticeFor(getSideCustomName(s));
        if (named?.key === "visio" || named?.key === "walk" || named?.key === "listening") return "none";
      }
      return anchorFromLevel(getSideLevel(s), s);
    };
    return { morning: seed("morning"), evening: seed("evening") };
  });
  // Which BCP form the "With the Book of Common Prayer" option commits to
  // (Psalms / Devotion / Office). Seeded from the current per-side level so
  // re-opening Customize keeps the chosen form.
  const [bcpForm, setBcpForm] = useState<Record<OfficeSide, "offices" | "devotion" | "psalms" | "compline" | "readings">>(() => {
    const form = (s: OfficeSide): "offices" | "devotion" | "psalms" | "compline" | "readings" => {
      const p = prayFromLevel(getSideLevel(s));
      return p === "offices" || p === "devotion" || p === "psalms" || p === "compline" || p === "readings" ? p : "offices";
    };
    return { morning: form("morning"), evening: form("evening") };
  });
  // The name of a side's own "Create your own" practice — only meaningful
  // once that side picks "ownPractice"; seeded from the saved per-side name
  // so re-opening Customize shows what was typed before.
  /** Which top-level kind the extra picker is showing, per side. */
  const [extraGroupBySide, setExtraGroupBySide] = useState<Record<OfficeSide, ExtraGroupId | null>>({ morning: null, evening: null });

  /** Saturday / Sunday alternatives per side (officePrefs day rules). */
  const [weekendBySide, setWeekendBySide] = useState<WeekendBySide>(() => ({
    morning: readWeekend("morning", prayFromLevel),
    evening: readWeekend("evening", prayFromLevel),
  }));
  const setWeekend = (side: OfficeSide, day: "sat" | "sun", alt: WeekendAlt) => {
    touchedRef.current = true;
    setWeekendBySide((p) => ({ ...p, [side]: { ...p[side], [day]: alt } }));
  };
  /**
   * The picker's state as officePrefs day rules.
   *
   * A rule whose practice is the person's OWN carries its name with it —
   * without that, Sunday's Worship would inherit the weekday custom name and
   * the card would read "Chapel" on a Sunday.
   */
  const weekendRulesFor = (side: OfficeSide): SideDayRule[] => {
    const wk = weekendBySide[side];
    const rules: SideDayRule[] = [];
    for (const [day, alt] of [[6, wk.sat], [0, wk.sun]] as Array<[number, WeekendAlt]>) {
      if (!alt) continue;
      rules.push({
        days: [day],
        level: PRAY_LEVEL[alt.choice],
        ...(alt.choice === "ownPractice" ? { customName: alt.name.trim() || "Worship" } : {}),
      });
    }
    return rules;
  };

  const [customNameBySide, setCustomNameBySide] = useState<Record<OfficeSide, string>>(() => ({
    morning: getSideCustomName("morning"),
    evening: getSideCustomName("evening"),
  }));
  // The "check community + BCP" merge: community intercessions are prayed within
  // the office (the office already hands off to them). Remembered per side so the
  // Prayer List row stays checked + the merge note shows on re-open (persisted in
  // commit() via officePrefs; seeded here so it round-trips).
  const [communityWithOffice, setCommunityWithOffice] = useState<Record<OfficeSide, boolean>>(() => ({
    morning: getCommunityWithOffice("morning"),
    evening: getCommunityWithOffice("evening"),
  }));
  const [methodBySide, setMethodBySide] = useState<Record<OfficeSide, DefaultOfficeEntry>>(() => ({
    morning: getSideEntry("morning"),
    evening: getSideEntry("evening"),
  }));
  // Per-side SIT LENGTH — each side's contemplation card opens a sit of THIS
  // length; it is NOT the daily minutes goal (a 90-minute goal must never put
  // "90 minutes" on each card — owner). Only values the picker itself offers
  // (SIT_LENGTHS) are trusted; anything else is a legacy artifact of the old
  // goal-splash and reads as unset. The old guard was 5–30, which silently
  // rewrote a saved 45- or 60-minute sit (and the 2-minute one) to 15 on the
  // next save — the picker offered lengths its own seed then destroyed.
  const sideSit = (side: OfficeSide): number => {
    const raw = getSideMinutes(side);
    return SIT_LENGTHS.includes(raw) ? raw : 15;
  };
  const [minutesBySide, setMinutesBySide] = useState<Record<OfficeSide, number>>(() => ({
    morning: sideSit("morning"),
    evening: sideSit("evening"),
  }));
  const chooseSideMinutes = (side: OfficeSide, m: number) => { touchedRef.current = true; setMinutesBySide((prev) => ({ ...prev, [side]: m })); };
  // Multiple daily reflections may be followed — each shows its own home card
  // and counts toward the Reflect anchor. The home reads the chosen set from the
  // home-layout cards (cac/fdd/ssje), so seed from THOSE — otherwise re-opening
  // the customizer only pre-selected one. Fall back to the single effective
  // source / FDD default for an un-set-up user (no saved layout yet).
  /**
   * The relational practices, by id. Seeded from what is already in the rule
   * (matched by title, the same key addCustomAnchor dedupes on), so reopening
   * the customizer shows them ON rather than offering to add them again.
   */
  const [relational, setRelational] = useState<RelationalPracticeId[]>(() => {
    try { return [...activeRelationalPractices()]; } catch { return []; }
  });
  const toggleRelational = (id: RelationalPracticeId) => {
    touchedRef.current = true;
    setRelational((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const [newsletters, setNewsletters] = useState<ReflectionSource[]>(() => {
    const fromLayout = TRACKED_REFLECTION_SOURCES.filter((s) => homeCardOn(user?.homeLayout, s));
    if (fromLayout.length > 0) return [...fromLayout];
    const r = getReflectionSource();
    return r && r !== "none" ? [r] : ["fdd"];
  });
  // When to nudge them to pray, per side. Finishing turns the matching reminder
  // pref ON (pref != "none") so the server's daily push actually fires.
  // NULL means "not known yet" — not the default. Owner: "i had notifications
  // set to 6:30am but it sent at 7". The stored 6:30 was overwritten with the
  // default: this state used to initialise to 07:00 and hydrate from the
  // server behind an all-or-nothing touched gate, so touching ANY control
  // before the office-prefs GET resolved stranded the default here, and every
  // save path then wrote it over the real stored time. With null, the display
  // falls back to the server pref (then the default), and a save OMITS the
  // field entirely when the value was never learned — the route keeps the
  // stored column for an omitted field, so this bug is now inexpressible.
  const [timeBySide, setTimeBySide] = useState<Record<OfficeSide, string | null>>(() => ({
    morning: null,
    evening: null,
  }));
  // Whether to nudge at all on each side. "No reminder" sets the side's pref to
  // "none" so the server's daily push doesn't fire — the practice still counts
  // toward the rhythm, it just goes un-prompted. Null = not known yet (falls
  // back to the server pref, then "on"), same contract as timeBySide above.
  const [reminderOnBySide, setReminderOnBySide] = useState<Record<OfficeSide, boolean | null>>(() => ({
    morning: null,
    evening: null,
  }));
  // Owner: "I had my notification set for 7:30am but it sent at 7" → "maybe it
  // never saved the setting."
  //
  // It very likely didn't. The reminder time was PUT only by commit(), the
  // flow's final "Save my daily rhythm" — so choosing 7:30 here and leaving by
  // the X (or anywhere before the last step) kept 7:30 in local state, where
  // this slide happily kept displaying it, while the server column stayed
  // null. The sender's fallback for a null time is DEFAULT_MORNING_TIME —
  // 07:00 — which is precisely a 7:00 push for someone who set 7:30, with the
  // UI still showing 7:30 as proof they'd set it.
  //
  // So persist on CHANGE, like the reflection and minutes controls already do.
  // commit() still writes the whole payload; this just means the reminder no
  // longer depends on reaching the end of the flow. Debounced because a
  // <input type="time"> fires onChange per component (hour, then minute).
  const reminderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reminderSaveTimer.current) clearTimeout(reminderSaveTimer.current); }, []);
  const saveReminderNow = (
    nextOn: Record<OfficeSide, boolean | null>,
    nextTime: Record<OfficeSide, string | null>,
  ) => {
    // Guests have no office-prefs row to write to; their rhythm is local-only
    // until they have an account.
    if (!user || guest) return;
    /**
     * PRESCRIBE WRITES NOTHING TO THE DESIGNER'S OWN ACCOUNT.
     *
     * commit() honours that — it hands the spec to onPrescribe and returns
     * before any PUT. This one didn't, because it deliberately persists on
     * CHANGE rather than at the end (see the note above: a reminder set and
     * then abandoned mid-flow used to be silently lost). So a leader designing
     * their GROUP's rule of life, or a routine for one person, rewrote their
     * OWN server office-prefs — morning/evening reminder level and times —
     * the moment they touched a time picker.
     *
     * The pages that host this flow snapshot and restore the designer's
     * localStorage, which is what made this hard to see: the device looked
     * untouched while the server row had quietly changed, and the reminder
     * push that actually fires reads the server. Nothing in the restore path
     * could have caught it — office-prefs isn't rule_config.
     */
    if (prescribe) return;
    if (reminderSaveTimer.current) clearTimeout(reminderSaveTimer.current);
    reminderSaveTimer.current = setTimeout(() => {
      const onM = nextOn.morning ?? prefsReminderOn("morning") ?? true;
      const onE = nextOn.evening ?? prefsReminderOn("evening") ?? true;
      apiRequest("PUT", "/api/me/office-prefs", {
        morning: sides.morning && onM ? PRAY_REMINDER_PREF[prayBySide.morning] : "none",
        evening: sides.evening && onE ? PRAY_REMINDER_PREF[prayBySide.evening] : "none",
        ...reminderTimeField("morning", onM, nextTime.morning),
        ...reminderTimeField("evening", onE, nextTime.evening),
      }).catch(() => { /* best-effort; commit() writes it again at the end */ });
    }, 600);
  };
  // For a contemplation side: sit in silence, or Cobreathe (breathe to one
  // shared global pace). Stored locally; the home/daily-progress Contemplation
  // card's "Begin" opens Cobreathe directly when this is set.
  const [contemplationStyle, setContemplationStyle] = useState<"silent" | "cobreathe">(() => {
    try { return localStorage.getItem("phoebe:contemplation-style") === "cobreathe" ? "cobreathe" : "silent"; } catch { return "silent"; }
  });
  const chooseContemplationStyle = (s: "silent" | "cobreathe") => {
    touchedRef.current = true;
    setContemplationStyle(s);
    try { localStorage.setItem("phoebe:contemplation-style", s); } catch { /* ignore */ }
  };
  // Creation Prayer length — a BREATHS preset (the same 6-breath increments the
  // /cobreathe page offers), not minutes. One shared preset (the breath has one
  // length wherever it opens); /cobreathe hydrates from the same key, so the
  // home card's "Begin" opens straight into the chosen length.
  const [cobreatheBreaths, setCobreatheBreaths] = useState<number>(() => {
    try {
      const n = parseInt(localStorage.getItem("phoebe:cobreathe-length") || "", 10);
      return COBREATHE_LENGTHS.includes(n) ? n : 12;
    } catch { return 12; }
  });
  const chooseCobreatheBreaths = (side: OfficeSide, n: number) => {
    touchedRef.current = true;
    setCobreatheBreaths(n);
    try { localStorage.setItem("phoebe:cobreathe-length", String(n)); } catch { /* ignore */ }
    // phoebe:cobreathe-length is a routine-sync key (LWW by updatedAt). Writing
    // localStorage alone left the LOCAL clock un-bumped, so the very next
    // /auth/me refetch's syncRoutineFromServer saw serverAt > localAt and
    // applied the server's older value — reverting a fresh "24" back to "12".
    // pushRoutineConfig() stamps the local clock to now (so this device wins the
    // next reconcile) AND debounce-pushes the new length up. Signed-in users
    // only; a guest has no account blob to sync against.
    if (user) pushRoutineConfig();
    // Keep the minutes-based silence goal coherent with the breath length
    // (12s per breath), so a finished Creation Prayer completes the goal.
    chooseSideMinutes(side, Math.max(1, Math.round((n * 12) / 60)));
  };
  // Written vs audio for Forward Day by Day (the fdd-mode step, shown when FDD
  // is the morning prayer). Persisted via officePrefs; the home FDD card reads it.
  const [fddMode, setFddModeState] = useState<FddMode>(() => getFddMode());
  const chooseFddMode = (m: FddMode) => {
    touchedRef.current = true;
    setFddModeState(m);
    setFddMode(m);
  };
  // Which Psalter cycle "Praying the Psalms" follows (the psalms-cycle step).
  const [psalmCycle, setPsalmCycleState] = useState<PsalmCycle>(() => getPsalmCycle());
  const choosePsalmCycle = (c: PsalmCycle) => {
    touchedRef.current = true;
    setPsalmCycleState(c);
    setPsalmCycle(c);
  };
  // Optional daily practices — adding one surfaces its home card AND an extra
  // Daily-progress checkmark. Seeded from whether the card is already on the
  // user's (current-version) home layout (in order, not hidden).
  const [extras, setExtras] = useState<{ examen: boolean; listening: boolean; reading: boolean; podcasts: boolean; prayerList: boolean }>(() => ({
    examen: homeCardOn(user?.homeLayout, "examen"),
    listening: homeCardOn(user?.homeLayout, "listening"),
    reading: homeCardOn(user?.homeLayout, "reading"),
    podcasts: homeCardOn(user?.homeLayout, "podcasts"),
    prayerList: homeCardOn(user?.homeLayout, "prayer-list"),
  }));
  // The weekly Way of Love rhythm (Commune · Go · Bless · Rest) — available to
  // everyone now (un-beta-gated), all-four-or-nothing. Turned on here and kept
  // in the "This week" home band. Persisted on its own localStorage key the
  // moment it's toggled — DELIBERATELY separate from the home layout this flow's
  // commit() writes, so it can't be lost on a re-save.
  const [weekly, setWeekly] = useState<Record<WeeklyKind, boolean>>(() => {
    const on = getEnabledWeekly();
    return { commune: on.includes("commune"), go: on.includes("go"), bless: on.includes("bless"), rest: on.includes("rest") };
  });
  const toggleWeekly = (k: WeeklyKind) => {
    setWeekly((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      setEnabledWeekly((Object.keys(next) as WeeklyKind[]).filter((kk) => next[kk]));
      return next;
    });
  };
  // Re-seed once auth resolves — `user` is often null on the first render, so
  // the initializer above can miss an existing selection. Guard on touchedRef
  // so it never clobbers a toggle the user already made while auth loaded.
  const extrasHydrated = useRef(false);
  // Keep a focused custom field above the on-screen keyboard (Capacitor runs
  // KeyboardResize.None, so a field near the bottom can hide behind it).
  useKeyboardInputLift();

  useEffect(() => {
    if (extrasHydrated.current || touchedRef.current || !user?.homeLayout) return;
    extrasHydrated.current = true;
    setExtras({
      examen: homeCardOn(user.homeLayout, "examen"),
      listening: homeCardOn(user.homeLayout, "listening"),
      reading: homeCardOn(user.homeLayout, "reading"),
      podcasts: homeCardOn(user.homeLayout, "podcasts"),
      prayerList: homeCardOn(user.homeLayout, "prayer-list"),
    });
    // Re-seed the reflection multi-select from the layout cards too — same
    // reason: `user` was likely null at the initializer, so an existing
    // cac+fdd+ssje selection would otherwise collapse to one on re-open.
    const fromLayout = TRACKED_REFLECTION_SOURCES.filter((s) => homeCardOn(user.homeLayout, s));
    if (fromLayout.length > 0) setNewsletters([...fromLayout]);
    // Contemplative Prayer + the Examen are add-ons now (not office anchors), so
    // seed them from the saved office LEVEL (reflect-sit / examen) — plus the
    // examen home card — rather than from prayBySide.
    const silentSeed = getSideContemplation("morning") || getSideContemplation("evening") || getSideLevel("morning") === "reflect-sit" || getSideLevel("evening") === "reflect-sit";
    const examenSeed = homeCardOn(user.homeLayout, "examen") || getSideLevel("morning") === "examen" || getSideLevel("evening") === "examen";
    setContemplative((c) => touchedRef.current ? c : {
      cobreathe: !creationHeldBySide() && homeCardOn(user.homeLayout, "cobreathe"),
      audio: homeCardOn(user.homeLayout, "listening"),
      examen: examenSeed,
      walk: homeCardOn(user.homeLayout, "walk"),
      visio: homeCardOn(user.homeLayout, "visio"),
      taize: homeCardOn(user.homeLayout, "taize"),
      chittister: homeCardOn(user.homeLayout, "chittister"),
      compline: homeCardOn(user.homeLayout, "compline"),
    });
    // Per-side Contemplative Prayer — re-seed once the home layout lands.
    setContemplationBySide((p) => touchedRef.current ? p : {
      morning: getSideContemplationExplicit("morning") ?? (getSideLevel("morning") === "reflect-sit"),
      evening: getSideContemplationExplicit("evening") ?? (getSideLevel("evening") === "reflect-sit"),
    });
  }, [user]);

  // Seed the silence sizing mode once `user` lands (the ladder lives on the user,
  // not in homeLayout, so it gets its own one-shot hydrate independent of the
  // homeLayout-gated effect above).
  useEffect(() => {
    if (silenceModeHydrated.current || touchedRef.current || !user) return;
    silenceModeHydrated.current = true;
    if (user.silenceLadder?.enabled) setSilenceMode("grow");
  }, [user]);

  // ── Contemplative practices (the multi-select step) ────────────────────────
  // Pick any of: Contemplative Prayer (sets a silence goal), Co-Breathe, Audio
  // Divina, the Examen. The latter three slot into the day at a chosen time.
  const [contemplative, setContemplative] = useState<{ cobreathe: boolean; audio: boolean; examen: boolean; walk: boolean; visio: boolean; taize: boolean; chittister: boolean; compline: boolean }>(() => ({
    // The Examen is an add-on, seeded from the saved level + the examen home card.
    cobreathe: !creationHeldBySide() && homeCardOn(user?.homeLayout, "cobreathe"),
    audio: homeCardOn(user?.homeLayout, "listening"),
    examen: homeCardOn(user?.homeLayout, "examen") || getSideLevel("morning") === "examen" || getSideLevel("evening") === "examen",
    walk: homeCardOn(user?.homeLayout, "walk"),
    // Visio Divina — praying with an artwork. Same shape as its siblings.
    visio: homeCardOn(user?.homeLayout, "visio"),
    taize: homeCardOn(user?.homeLayout, "taize"),
    // Seeded the same way as every sibling — the layout key IS the switch.
    chittister: homeCardOn(user?.homeLayout, "chittister"),
    compline: homeCardOn(user?.homeLayout, "compline"),
  }));
  const toggleContemplative = (k: "cobreathe" | "audio" | "examen" | "walk" | "visio" | "taize" | "chittister" | "compline") => {
    touchedRef.current = true;
    setContemplative((c) => ({ ...c, [k]: !c[k] }));
  };
  // Contemplative Prayer is now PER SIDE — a silent sit as a Morning and/or
  // Evening card, each its own card + completed independently. Seed from the
  // explicit per-side flag; else the legacy reflect-sit level for that side.
  // (A pre-existing single silence goal is migrated to both sides in the
  // office-prefs hydration effect below.)
  /**
   * A second practice on a side, alongside the anchor.
   *
   * Owner: "have a [button] at the bottom — add additional practice — where
   * they could choose anything else, even the morning devotion in addition to
   * the morning [office]. It would show up as a morning card, but it just
   * wouldn't be their anchor for the weekly progress card."
   *
   * Stored as a CUSTOM ANCHOR in that side's slot, which is exactly those
   * semantics: its own card, its own completion, and invisible to the anchor —
   * the weekly Morning row reads the side's level, never a custom anchor. The
   * backend half of this already landed (anchorModesFor / countsForAnchor), so
   * a devotion kept beside the office no longer fills the office's dot.
   */
  const [extraBySide, setExtraBySide] = useState<Record<OfficeSide, string | null>>(() => {
    // Seeded from the stored second practice, so re-opening the customizer
    // shows what they already keep instead of a blank slide that then WRITES
    // the blank back over it on Continue. Only the office-form extras live in
    // this key; the rest are standing practices, hydrated by their own toggles.
    const titleFor = (side: OfficeSide): string | null => {
      const level = getSideExtra(side);
      if (!level) return null;
      const cap = side === "morning" ? "Morning" : "Evening";
      return EXTRA_PRACTICES.find((e) => e.maps.kind === "level" && e.maps.level === level)?.title(cap) ?? null;
    };
    return { morning: titleFor("morning"), evening: titleFor("evening") };
  });
  // Which reflection newsletter the "Reflection Newsletter" extra resolved to,
  // per side — asked on that extra's own details slide. Only a staging value
  // for the picker: what actually persists is `newsletters` (which drives the
  // home cards), so this starts empty on every open, exactly like the
  // newsletter extra itself.
  const [extraNewsletterBySide, setExtraNewsletterBySide] = useState<Record<OfficeSide, ReflectionSource | null>>({
    morning: null,
    evening: null,
  });
  // Which sides asked for the additional-practice slide. It's a real step in
  // the flow (see buildSteps) rather than an inline expansion — owner: "not
  // expand to a list, but advance to a second slide".
  const [extraWantedBySide, setExtraWantedBySide] = useState<Record<OfficeSide, boolean>>(() => ({
    morning: !!getSideExtra("morning"),
    evening: !!getSideExtra("evening"),
  }));

  /**
   * A contemplative practice the person names themselves.
   *
   * Owner: "there should be a custom option for contemplative practice." None
   * of the named rows can express "the thing I actually do" — a sit on the
   * porch, lectio, the rosary — and the customizer had no way to say it. On
   * Continue this becomes a CUSTOM ANCHOR, which is the app's existing shape
   * for a practice only you keep: its own card, dot and weekly row, kept with
   * a tap.
   *
   * NOT hydrated from existing anchors on re-open: there is no way to tell
   * which of a person's custom anchors came from THIS row rather than from
   * "Create your own" elsewhere, and claiming one would let re-opening the flow
   * silently re-adopt a practice they had removed. Re-opening shows an empty
   * box; the anchor they already made is untouched on the home.
   */
  const [customPracticeOn, setCustomPracticeOn] = useState(false);
  const [customPracticeName, setCustomPracticeName] = useState("");
  const [contemplationBySide, setContemplationBySide] = useState<Record<OfficeSide, boolean>>(() => ({
    morning: getSideContemplationExplicit("morning") ?? (getSideLevel("morning") === "reflect-sit"),
    evening: getSideContemplationExplicit("evening") ?? (getSideLevel("evening") === "reflect-sit"),
  }));
  const anyContemplation = contemplationBySide.morning || contemplationBySide.evening;
  const toggleContemplationSide = (side: OfficeSide) => {
    touchedRef.current = true;
    setContemplationBySide((p) => ({ ...p, [side]: !p[side] }));
  };
  // WHICH contemplative practice a side keeps. "Contemplative Practice" is a
  // family, not one thing — so, exactly like the Book of Common Prayer row and
  // its "which liturgy?" dropdown, choosing it asks which one on the config
  // slide (owner). null = this side isn't a contemplative practice at all.
  //
  // Kept as its own state rather than derived: picking Walk or Audio Divina
  // turns OFF the per-side silent-sit flag (one contemplative practice per
  // side), and deriving the dropdown's visibility from that flag would make
  // the dropdown vanish the moment you used it.
  // Visio Divina belongs here like the rest of them. It has a home card, a
  // dot, a weekly row, a `contemplative.visio` flag this flow already writes,
  // and its own row in the standing-practices multi-select — it was simply
  // never added to THIS list, so the "which practice?" dropdown on a side
  // couldn't offer the one contemplative practice that shipped last.
  const CONTEMPLATIVE_FORMS = ["prayer", "creation", "walk", "audio", "visio"] as const;
  type ContemplativeForm = (typeof CONTEMPLATIVE_FORMS)[number];
  // Owner: "the Examen and Compline shouldn't be in contemplative practice in
  // evening as they can be chosen other places." Compline is one of the prayer
  // book's liturgies and the Examen is its own row on the anchor slide, so
  // listing them here made the same practice reachable by two names — and a
  // reader who picked Compline here had no way to tell it apart from picking
  // it under the Book of Common Prayer. Same list for both sides now.
  const formsForSide = (_s: OfficeSide): readonly ContemplativeForm[] => CONTEMPLATIVE_FORMS;
  const [contemplativeForm, setContemplativeForm] = useState<Record<OfficeSide, ContemplativeForm | null>>(() => {
    // Only the two per-side forms survive a reload — walk/audio/examen/compline
    // are standing all-day practices with no per-side storage, so a side set to
    // one of those re-opens showing Contemplative Prayer. Honest default: it's
    // the first entry, and their standing practice is still on either way.
    const seed = (s: OfficeSide): ContemplativeForm | null => {
      /**
       * A WALK, SACRED LISTENING or VISIO DIVINA as this side's anchor.
       *
       * Reported: "Visio Divina flattened into a custom practice — it was an
       * anchor and it got flattened." Those three are stored as a `custom`
       * level whose NAME lib/anchorPractices matches back to the real practice
       * (that's the shape the anchor mechanism was designed around). But this
       * seed only ever recovered the two per-side forms, so re-opening the
       * customizer found no contemplative form, fell through to "Create your
       * own", and the practice lost its identity on the way back in.
       */
      // LEGACY: a side written before the kinds existed, as an ownPractice
      // named after a real practice. Recovered so an existing rule re-opens
      // as the practice it is rather than as "Create your own".
      if (getSideLevel(s) === "custom") {
        const named = anchorPracticeFor(getSideCustomName(s));
        if (named?.key === "visio") return "visio";
        if (named?.key === "walk") return "walk";
        if (named?.key === "listening") return "audio";
      }
      const on = getSideContemplationExplicit(s) ?? (getSideLevel(s) === "reflect-sit");
      if (!on) return null;
      // The kind IS the form — per side, all five. (The global was the
      // last-written side's kind, so a split rule re-opened with both sides
      // claiming whichever was written last, and the next commit wrote that
      // back over the real one.)
      const kind = getSideContemplationKind(s);
      return kind === "creation" ? "creation"
        : kind === "walk" ? "walk"
          : kind === "audio" ? "audio"
            : kind === "visio" ? "visio"
              : "prayer";
    };
    return { morning: seed("morning"), evening: seed("evening") };
  });
  /** A practice that became a SIDE'S ANCHOR stops being a standing add-on —
   *  its row disappears from the contemplative multi-select (see
   *  anchoredAsForm), and this makes sure the flag behind that row goes with
   *  it. Otherwise commit() would read a `true` nobody can see and give the
   *  practice a second home card alongside the side's own. */
  useEffect(() => {
    const anchored = [contemplativeForm.morning, contemplativeForm.evening];
    setContemplative((c) => {
      const next = { ...c };
      let changed = false;
      for (const f of ["audio", "walk", "visio"] as const) {
        if (anchored.includes(f) && next[f]) { next[f] = false; changed = true; }
      }
      return changed ? next : c;
    });
  }, [contemplativeForm.morning, contemplativeForm.evening]);

  /**
   * Is THIS SIDE'S contemplative practice the Creation Prayer breath?
   *
   * The flow used to ask `contemplationStyle === "cobreathe"` in six places
   * with a side in hand. That state is ONE value for the whole rule, so on a
   * split rule every one of them answered for whichever side was picked last:
   * the silent side's config slide asked "how many breaths?", its review row
   * said "N breaths" and linked to the wrong edit step, and commit() sized the
   * daily goal from the wrong practice.
   */
  const sideIsCreation = (sd: OfficeSide) => contemplativeForm[sd] === "creation";
  /** Does ANY side keep the breath / keep silence? For whole-rule questions. */
  const anySideCreation = sideIsCreation("morning") || sideIsCreation("evening");
  const anySideSilent = contemplativeForm.morning === "prayer" || contemplativeForm.evening === "prayer";

  /** Is this side set to a contemplative practice at all? */
  const contemplativeOnSide = (s: OfficeSide) => contemplativeForm[s] !== null;
  // Contemplative-Prayer silence sizing: a FIXED daily amount (the dropdown), or
  // the guided "grow my silence" ladder — start at 5 min, +5 every kept week up
  // to 30. Seeded from the saved ladder state (re-seeded in the hydration effect
  // once `user` resolves, since it's usually null at this initializer).
  const [silenceMode, setSilenceMode] = useState<"grow" | "fixed">(() => (user?.silenceLadder?.enabled ? "grow" : "fixed"));
  const silenceModeHydrated = useRef(false);
  const chooseSilenceMode = (m: "grow" | "fixed") => { touchedRef.current = true; setSilenceMode(m); };
  // Co-Breathe is already placed if the contemplative sit is Co-Breathe rather
  // than silence — then we don't ask for a separate time-of-day or add a
  // standalone card. Contemplative Prayer is now an add-on (contemplative.prayer),
  // not a side office, so read it from there.
  const cobreatheIsSideStyle = contemplationStyle === "cobreathe" && anyContemplation;
  const SLOT_LABEL: Record<CustomSlot, string> = {
    morning: t("wol_rule.slot_morning", { defaultValue: "Morning" }),
    anytime: t("wol_rule.slot_anytime", { defaultValue: "Anytime" }),
    midday: t("wol_rule.slot_midday", { defaultValue: "Midday" }),
    afternoon: t("wol_rule.slot_afternoon", { defaultValue: "Afternoon" }),
    evening: t("wol_rule.slot_evening", { defaultValue: "Evening" }),
  };

  // Custom practices — the user's own daily anchors (title + emoji). Created on
  // the "custom" slide below (reached from a card in the extras step), stored
  // per-device in lib/customAnchors. Each becomes a Daily-progress card + dot.
  const [customList, setCustomList] = useState<CustomAnchor[]>(() => getCustomAnchors());
  const [customTitle, setCustomTitle] = useState("");
  const [customEmoji, setCustomEmoji] = useState("");
  // Which part of the day a new custom practice belongs to — slots its card
  // into the rhythm at the right point. Kept across adds (often several land in
  // the same slot).
  const [customSlot, setCustomSlot] = useState<CustomSlot>("anytime");
  const [readingSlot, setReadingSlotState] = useState<CustomSlot>(() => getPracticeSlot("reading"));
  const chooseReadingSlot = (s: CustomSlot) => { touchedRef.current = true; setReadingSlotState(s); setPracticeSlot("reading", s); };
  // Reading ritual toggle — when on, the new practice is logged by an amount
  // (chapter / page / time) instead of a plain check, with an optional daily goal.
  const [customIsReading, setCustomIsReading] = useState(false);
  const [customUnit, setCustomUnit] = useState<ReadingUnit>("chapter");
  const [customGoal, setCustomGoal] = useState("");
  // When they already have practices, the add form moves to its own sub-slide;
  // "Add new" flips this on, the form's Add / Back flips it off.
  const [addingCustom, setAddingCustom] = useState(false);
  useEffect(() => {
    const refresh = () => setCustomList(getCustomAnchors());
    window.addEventListener(CUSTOM_ANCHORS_EVENT, refresh);
    return () => window.removeEventListener(CUSTOM_ANCHORS_EVENT, refresh);
  }, []);
  /**
   * The gear on a NAMED PRACTICE edits that practice.
   *
   * Reported: "I now can't edit the chapel custom on its own." Its gear
   * landed on "Create your own" — the whole list of practices, where the only
   * things you can do are add another or delete this one. There was no edit
   * anywhere, in the UI or under it (customAnchors could add and remove and
   * nothing else), so a practice's name, emoji, time of day and days were
   * fixed the moment it was made.
   */
  const editingCustomId = singleEditRow?.startsWith("custom:") ? singleEditRow.slice(7) : null;
  useEffect(() => {
    if (!editingCustomId) return;
    const a = getCustomAnchors().find((x) => x.id === editingCustomId);
    if (!a) return;
    setCustomTitle(a.title);
    setCustomEmoji(a.emoji);
    setCustomSlot(a.slot);
    setCustomDays(a.days && a.days.length > 0 && a.days.length < 7 ? [...a.days] : null);
    setCustomWeekly(a.cadence === "weekly");
  }, [editingCustomId]);
  /** null = every day; otherwise the chosen weekday numbers. */
  const [customDays, setCustomDays] = useState<number[] | null>(null);
  /**
   * Weekly rather than daily — see CustomAnchor.cadence. Owner: "weekly
   * practices that we set every Monday that are in next until you do them, and
   * then they're done, and they stay in done until the next week."
   */
  const [customWeekly, setCustomWeekly] = useState(false);
  const saveCustomEdit = () => {
    if (!editingCustomId) return;
    touchedRef.current = true;
    updateCustomAnchor(editingCustomId, {
      title: customTitle,
      emoji: customEmoji,
      slot: customSlot,
      /**
       * A WEEKLY PRACTICE HAS NO WEEKDAYS.
       *
       * The chips are hidden when "Once a week" is on — the UI already says
       * scoping a weekly practice to weekdays would be two answers to the
       * same question — but `customDays` state was never cleared, so it went
       * on being saved. Turn "Once a week" on for VTS's Community Meal
       * (days: Mon–Fri) and it became weekly AND still weekday-scoped, so
       * `anchorOnDay` hid it on Saturday and Sunday: the two days someone who
       * hasn't kept it yet is most likely to reach for it, and no sign in the
       * UI that the days were still in force.
       */
      days: customWeekly ? null : customDays,
      // undefined, not false — the whitelist only carries "weekly", and an
      // explicit false would be dropped on the next read anyway.
      cadence: customWeekly ? "weekly" : undefined,
    });
    setCustomList(getCustomAnchors());
    // Re-derive the list rows, or the row keeps its OLD sub-label ("Morning ·
    // weekdays") after the edit — the rows are described server-side.
    void reloadEditRows();
    setSingleEditRow(null);
    setManualMode("edit");
    setEntryPhase("list");
  };

  const addCustom = () => {
    const title = customTitle.trim();
    if (!title) return;
    const goalNum = parseInt(customGoal, 10);
    const reading: ReadingConfig | undefined = customIsReading
      ? { unit: customUnit, ...(Number.isFinite(goalNum) && goalNum > 0 ? { goal: goalNum } : {}) }
      : undefined;
    addCustomAnchor(title, customEmoji.trim() || (customIsReading ? "📖" : "🌿"), customSlot, reading);
    setCustomTitle("");
    setCustomEmoji("");
    setCustomGoal("");
    setCustomList(getCustomAnchors());
    setAddingCustom(false);
  };
  const toggleExtra = (k: "examen" | "listening" | "reading" | "podcasts" | "prayerList") => {
    touchedRef.current = true;
    setExtras((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  /**
   * Save the routine they arrived with, once per visit to the customizer.
   *
   * Owner: "we have a backlog that saves routines. Every time they get the
   * customizer." Taken on OPEN, before anything is edited, so what's stored is
   * the rhythm they actually lived with rather than a half-finished edit.
   *
   * Server-side capture with no body (see routes/routine-snapshots.ts): it
   * reads the routine off the account, so the snapshot can't drift from what
   * was really in force. Deduped there too, so opening and backing out doesn't
   * fill the backlog with identical entries.
   *
   * Deliberately fire-and-forget: a backlog is a safety net, and a failure to
   * write one must never stop someone editing their rule of life. Skipped for
   * guests (no account to read) and for prescribe mode (the admin is designing
   * for someone else — snapshotting their own routine there would be noise).
   */
  // What they already keep, described the same way the questionnaire's review
  // describes it — so "edit part" shows the same words the other flow does.
  /**
   * ?edit=<rowId>&return=<path> — open ONE practice for editing, from outside.
   *
   * The practices page lists what someone keeps; the obvious next thought is
   * changing one, and making them re-enter the customizer and find it again is
   * the long way round. Runs once, before anything is rendered, so the reader
   * lands directly on that practice's own slide.
   */
  const deepEditRef = useRef(false);
  useEffect(() => {
    if (deepEditRef.current) return;
    deepEditRef.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const rowId = params.get("edit");
      if (!rowId) return;
      const st = stepForRow(rowId);
      if (!st) return;
      const ret = params.get("return");
      // Same-origin PATH only — never an absolute URL, so this can't be used to
      // bounce someone off-site after saving.
      if (ret && /^\/[A-Za-z0-9\-_/]*$/.test(ret)) setSingleEditReturnTo(ret);
      setSingleEditRow(rowId);
      setManualMode("scratch");
      setStep(st);
    } catch { /* no search params — nothing to open */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Re-read "what they already keep" — called on mount, and again after a
   *  single-practice edit so the row shows its new value straight away. */
  const reloadEditRows = async (): Promise<void> => {
    try {
      /**
       * FLUSH BEFORE DESCRIBING — the list must describe THIS DEVICE'S rhythm.
       *
       * The rows are derived SERVER-side (describeSpec over rule_config +
       * customAnchors), while the home reads local state — and local is ahead
       * of the server whenever a push is in flight or dropped, which is
       * precisely what an adopt leaves behind. Verified on a clean state:
       * adopt Canterbury then VTS, reload, and the home showed VTS while this
       * list showed a BLEND of both — including no row at all for a custom
       * anchor that exists, which made it undeletable (an anchor you cannot
       * see is an anchor you cannot remove). Pushing both pipes up first
       * makes the server describe what the device holds.
       */
      try { await Promise.all([flushRoutineConfig(), flushCustomAnchorPush()]); } catch { /* best-effort */ }
      const r: any = await apiRequest("GET", "/api/routine-interview/current");
      const rows: Array<{ id: string; emoji: string; label: string; sub: string }> = Array.isArray(r?.settings) ? r.settings : [];
      /**
       * …and the CUSTOM-ANCHOR rows answer to the LOCAL store regardless.
       * customAnchors.ts is tombstone-correct and authoritative on-device; if
       * the flush above failed (offline, a dropped PUT), the server's answer
       * is stale in both directions — it can list an anchor the reader
       * deleted, or omit one they hold. Local defs replace the server's
       * custom rows wholesale, so every anchor that exists has its ✕ and
       * nothing deleted can linger.
       */
      const local = getCustomAnchors();
      const serverCustomless = rows.filter((row) => !row.id.startsWith("custom:"));
      const localCustomRows = local.map((a) => ({
        id: `custom:${a.id}`,
        emoji: a.emoji || "🌿",
        label: a.title,
        sub: a.days && a.days.length > 0 && a.days.length < 7
          ? `${SLOT_LABEL[a.slot]} · ${describeDays(a.days)}`
          : SLOT_LABEL[a.slot],
      }));
      // The Prayer List rides the list as a synthetic, always-present row so
      // it can be ORDERED like any practice (owner). It has no gear and no X:
      // whether it appears on the home follows prayer requests and groups,
      // not this editor — only its position is theirs to set. The id is
      // already in routineOrder's vocabulary ("slot:prayer-list" →
      // prayer-list-card), so a drag orders the home card end-to-end.
      const prayerListRow = {
        id: "slot:prayer-list",
        emoji: "🕊️",
        label: "My Prayer List",
        sub: "Prayers you and your groups are keeping",
      };
      setEditRows([
        ...serverCustomless.filter((row) => row.id !== "slot:prayer-list"),
        ...localCustomRows,
        prayerListRow,
      ]);
    } catch { /* no routine to edit — the scratch path is the fallback */ }
  };
  useEffect(() => {
    if (guest || prescribe || pilot) { setEditLoaded(true); return; }
    // This fetch GATES what renders, so it gets a deadline: a request that never
    // settles would hold the loading splash forever. On timeout we fall through
    // to the scratch path with no rows, which is the same place a failed request
    // lands.
    const bail = setTimeout(() => setEditLoaded(true), 6000);
    void reloadEditRows().finally(() => { clearTimeout(bail); setEditLoaded(true); });
    return () => clearTimeout(bail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest, prescribe, pilot]);

  // The one-day practice swap is invisible in here — see officePrefs'
  // setDaySwapSuppressed. Every seed below answers "what is the STANDING
  // rule", and commit() writes the whole rule back; letting the swap through
  // would promote today's stand-in into the rule on any Save.
  useEffect(() => {
    setDaySwapSuppressed(true);
    return () => setDaySwapSuppressed(false);
  }, []);

  useEffect(() => {
    if (guest || prescribe || pilot) return;
    apiRequest("POST", "/api/me/routine-snapshots", { source: "customizer" })
      .then((r: any) => {
        // Remember locally that a backlog exists, so the NEXT visit can offer
        // "go back to a past routine" on first paint. Reading it from a fetch
        // instead would pop the option in after the flow had already rendered
        // its first slide and yank the ground out from under them.
        try {
          if ((r?.count ?? 0) > 0) localStorage.setItem(HAS_ROUTINE_HISTORY_KEY, "1");
          else localStorage.removeItem(HAS_ROUTINE_HISTORY_KEY);
        } catch { /* private mode */ }
      })
      .catch(() => { /* non-fatal by design */ });
    // Once per mount — the point is the state on arrival, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: prefs } = useQuery<{ defaultPrayerLevel?: string; contemplationGoalMinutes?: number; morningTime?: string | null; eveningTime?: string | null; morning?: string | null; evening?: string | null; notificationStyle?: "gentle" | "nudge" }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
    // Guests have no server prefs — the local officePrefs initializers above
    // already seeded the flow from the device. The isDeviceLocalGuest check is
    // the backstop for the mount race: if the flow renders before /auth/me
    // settles (guest prop briefly false), a fresh anonymous account's default
    // prefs ("evening: none") would otherwise hydrate in and clobber the
    // seeded Evening side.
    enabled: !guest && !isDeviceLocalGuest(user),
  });
  const hydrated = useRef(false);
  // Set once the user touches any control — so a slow office-prefs response
  // can't clobber a choice they've already made while it was loading.
  const touchedRef = useRef(false);
  // No longer has to clear a pending "None": the None row is gone, and a side
  // being off is now derived from nothing being selected (see sideIsBlank), so
  // selecting a practice turns the side back on by definition rather than by
  // remembering to reset a second flag.
  const choosePrayBySide = (side: OfficeSide, p: PrayChoice) => {
    touchedRef.current = true;
    setPrayBySide((prev) => ({ ...prev, [side]: p }));
    /**
     * ONE anchor per side, cleared in ONE place.
     *
     * Reported: "something weird is happening in selecting more than one
     * practice on the first slides of the anchors." The Contemplative Practice
     * row reads its selected state from `contemplativeForm[side]`, which is a
     * different piece of state from `prayBySide` — and every other row cleared
     * `contemplationBySide` on the way past but never the FORM. So picking
     * Contemplative Practice and then the Book of Common Prayer left both rows
     * lit, and the slide looked like a checklist.
     *
     * Owner: "it's okay if they want a second, but they have to do that as the
     * additional practice on the second slide." So the anchor slide is
     * single-select, and it's enforced here rather than in six row handlers
     * where the seventh will forget. Clearing only for a REAL choice matters:
     * the Contemplative row itself calls this with "none" first and then sets
     * the form, and clearing on "none" would undo it a line later.
     */
    if (p !== "none") {
      setContemplativeForm((prev) => (prev[side] === null ? prev : { ...prev, [side]: null }));
      setContemplationBySide((prev) => (prev[side] ? { ...prev, [side]: false } : prev));
    }
  };
  const chooseMethodBySide = (side: OfficeSide, m: DefaultOfficeEntry) => { touchedRef.current = true; setMethodBySide((prev) => ({ ...prev, [side]: m })); };
  /** True once the reader (or hydration from a REAL stored goal) has engaged
   *  the goal at all — the PUT below omits the goal fields otherwise. The
   *  seed defaults to "5", and the server's GET answers 5 for a null goal, so
   *  an unconditional write MANUFACTURED a 5-minute silence habit plus its
   *  daily bell for anyone who opened the customizer and saved. Omitted
   *  fields leave the server value untouched (the PUT is field-conditional). */
  const goalEngagedRef = useRef(false);
  const chooseGoal = (g: string) => { touchedRef.current = true; goalEngagedRef.current = true; setGoal(g); };
  // Owner: "we want a second row that says log method two options. We want
  // it to be either timer or manual log. or mark as done." Device-local,
  // read fresh each mount (matches contemplationStyle's own pattern above).
  const [logMethod, setLogMethodState] = useState<ContemplationLogMethod>(() => getContemplationLogMethod());
  const chooseLogMethod = (m: ContemplationLogMethod) => { touchedRef.current = true; setLogMethodState(m); setContemplationLogMethod(m); };

  // Toggle a reflection in/out. "None" clears the list (no reflection card, one
  // fewer Daily-progress dot); picking a real source clears None.
  const noReflection = newsletters.length === 0;
  const toggleNewsletter = (n: ReflectionSource) => {
    touchedRef.current = true;
    setNewsletters((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };
  const chooseNoReflection = () => { touchedRef.current = true; setNewsletters([]); };
  useEffect(() => {
    if (hydrated.current || touchedRef.current || !prefs) return;
    // GUESTS never hydrate from server office-prefs — not even from CACHE.
    // Disabling the query above stops the fetch, but react-query still hands
    // this component any cached response another surface fetched (the home
    // queries office-prefs as the anonymous user), and a fresh anonymous
    // account's defaults ("evening: none") would overwrite the seeded
    // Morning + Evening rule right here. Device truth wins for guests.
    if (guest || isDeviceLocalGuest(user)) return;
    hydrated.current = true;
    // Seed each side's way from its EXPLICIT saved per-side level only; otherwise
    // keep the standard (Devotion, the initial state). We deliberately do NOT
    // seed from the server's global defaultPrayerLevel here — the old flow
    // defaulted the pray-choice to "community" and saved that as the global
    // defaultPrayerLevel ("intercessions"), so re-seeding from it would keep
    // re-presetting Customize to Community for users who never chose it.
    setPrayBySide({
      morning: anchorFromLevel(getSideLevel("morning"), "morning"),
      evening: anchorFromLevel(getSideLevel("evening"), "evening"),
    });
    // The server's contemplationGoalMinutes is the authoritative current goal —
    // prefill from it so Customize opens on what they actually have set (a stale
    // local per-side minutes value must not win, which is why it showed 15 when
    // the real goal was 60).
    if (typeof prefs.contemplationGoalMinutes === "number" && prefs.contemplationGoalMinutes > 0) {
      goalEngagedRef.current = true;   // a real stored goal — echoing it back is a no-op
      setGoal(String(prefs.contemplationGoalMinutes));
      /**
       * A goal NO LONGER implies per-side sits.
       *
       * This used to migrate a "legacy global goal" — a goal with no explicit
       * per-side pick — onto BOTH sides, so Customize opened with Morning AND
       * Evening Contemplation checked. That inference is now backwards: a
       * whole-day quota with the sides off is the ORDINARY shape, produced by
       * the questionnaire and by anyone who sets a daily amount without
       * attaching it to a side. The silence has its own card and its own
       * Silence slide; it does not need a side to live on.
       *
       * Owner, repeatedly: a 90-minute quota kept reappearing here as Morning +
       * Evening Contemplation at five minutes each, and finishing the
       * customizer wrote those sits back over the quota. Writing "0" instead of
       * deleting the keys (see normalizeContemplation) stops NEW routines
       * looking legacy — but every routine built before that still has the keys
       * absent, so the inference had to go, not just the ambiguity feeding it.
       *
       * Per-side contemplation is now only ever what someone explicitly chose.
       */
    }
    // Reminder time and on/off no longer hydrate here — they read the server
    // pref directly through shownReminderTime/reminderIsOn while their local
    // state is null, so there is nothing to strand behind this gate (see the
    // note on timeBySide's declaration).
    /**
     * Which sides are part of the rhythm: the EXPLICIT LEVEL first, the server
     * pref only as fallback.
     *
     * The server's morning/evening office pref is the REMINDER level — commit()
     * writes it as `sides.X && reminderOnBySide.X ? … : "none"`, so "none"
     * means "side off OR reminder off" and cannot distinguish the two. Seeding
     * side-on/off from it alone conflated them, and the conflation DELETED
     * PRACTICES: the time-ladder starter turns the evening reminder off, so
     * its server pref reads evening:"none" — reopening the customizer then
     * seeded sides.evening=false, and the next Save of ANYTHING (caught live:
     * a single edit of the morning sit) committed the whole rule with the
     * evening gone. Evening Prayer deleted by a tap on Save for a different
     * practice, with no step ever showing it deselected.
     *
     * The explicit per-side level is the record of what the person actually
     * chose — "ask" IS its off state (commit writes it on a side turned off),
     * so the old note's premise that the level "has no off state" was stale.
     * This is the standing rule elsewhere in the app: side-active reads
     * getExplicitSideLevel, not an inference. The pref-based read stays only
     * for accounts with no explicit level stored (pre-sync rules on a fresh
     * device, where rule-config hasn't landed yet).
     */
    {
      const mLvl = getExplicitSideLevel("morning");
      const eLvl = getExplicitSideLevel("evening");
      if (mLvl !== null || eLvl !== null) {
        const mOn = mLvl !== null && mLvl !== "ask";
        const eOn = eLvl !== null && eLvl !== "ask";
        setSides(mOn || eOn ? { morning: mOn, evening: eOn } : { morning: true, evening: false });
      } else {
        const mOn = prefs.morning !== "none";
        const eOn = prefs.evening !== "none";
        setSides(mOn || eOn ? { morning: mOn, evening: eOn } : { morning: true, evening: false });
      }
    }
    if (prefs.notificationStyle === "nudge") setNotificationStyle("nudge");
  }, [prefs]);

  // Reminder state resolution (see the note on timeBySide's declaration):
  // local state when the person touched it, the server pref while it's null,
  // the default only when neither exists. Guests never read prefs — react-query
  // can hand this component another surface's cached anonymous response.
  const prefsKnown = !!prefs && !guest && !isDeviceLocalGuest(user);
  const prefsReminderTime = (sd: OfficeSide): string | null => {
    if (!prefsKnown) return null;
    const v = sd === "morning" ? prefs!.morningTime : prefs!.eveningTime;
    return typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : null;
  };
  const prefsReminderOn = (sd: OfficeSide): boolean | null =>
    prefsKnown ? (sd === "morning" ? prefs!.morning : prefs!.evening) !== "none" : null;
  const reminderIsOn = (sd: OfficeSide): boolean => reminderOnBySide[sd] ?? prefsReminderOn(sd) ?? true;
  const shownReminderTime = (sd: OfficeSide): string =>
    timeBySide[sd] ?? prefsReminderTime(sd) ?? (sd === "morning" ? DEFAULT_REMINDER_TIME : "18:00");
  // What a save may write for a side's reminder time: the chosen (or known)
  // value, an explicit null when the reminder is off, or NOTHING when the
  // value was never learned — the route keeps the stored column for an
  // omitted field, which is the whole point.
  const reminderTimeField = (sd: OfficeSide, on: boolean, v: string | null): Record<string, string | null> => {
    const key = sd === "morning" ? "morningTime" : "eveningTime";
    if (!on) return { [key]: null };
    const chosen = v ?? prefsReminderTime(sd);
    return chosen && /^\d{2}:\d{2}$/.test(chosen) ? { [key]: chosen } : {};
  };

  const goalMin = Math.max(0, Math.min(180, parseInt(goal, 10) || 0));

  // Capture the designed routine as a portable spec WITHOUT writing it to any
  // account. Mirrors the payloads commit() computes (office-prefs body, the
  // home-layout order/hidden, the silence flag) and snapshots the routineSync
  // localStorage values. It DOES write the per-side office localStorage keys
  // (level/entry/reflection/minutes) — exactly as commit() step A — so
  // collectRoutineValues() picks them up; the prescribe page snapshots+restores
  // those so the admin's own device is left untouched.
  const buildPrescribeSpec = (): RoutineSpec => {
    const primary: ReflectionSource = newsletters[0] ?? "none";
    // Contemplative Prayer is an add-on now — its own per-side silence card
    // regardless of the office anchor — so a silent sit is wanted whenever it's
    // checked on either side.
    // effGoalMin IS goalMin. The fallback here manufactured a 10-minute daily
    // quota out of a per-side silent sit — the converse of "a goal never
    // implies per-side sits", and just as forbidden. A sit with no quota is a
    // complete, coherent rule.
    const effGoalMin = goalMin > 0 ? goalMin : 0;
    for (const side of SIDES) {
      if (sides[side]) {
        setSideLevel(side, PRAY_LEVEL[prayBySide[side]]);
        setSideEntry(side, methodBySide[side]);
        // …unless this side's ANCHOR reads a different one (Canterbury
        // Downtown: Forward Day by Day as the morning office, the CAC's
        // meditation as the newsletter card).
        setSideReflection(side, anchorReflectionBySide[side] ?? primary);
        persistCommunityWithOffice(side, prayBySide[side] !== "community" && communityWithOffice[side]);
        setSideContemplation(side, contemplationBySide[side]);
        // …and WHICH one. Per side (owner: "let's separate creation prayer and
        // contemplative prayer") — the form the reader picked on this side's
        // own slide, not the global style flag they used to share.
        if (contemplationBySide[side]) {
          const f = contemplativeForm[side];
          setSideContemplationKind(side,
            f === "creation" ? "creation" : f === "walk" ? "walk"
              : f === "audio" ? "audio" : f === "visio" ? "visio" : "silent");
        }
        // Sit length is per side (config picker), NOT the daily goal.
        if (contemplationBySide[side]) setSideMinutes(side, minutesBySide[side]);
        if (prayBySide[side] === "ownPractice") setSideCustomName(side, customNameBySide[side].trim());
        // Saturday / Sunday alternatives (see weekendRulesFor).
        setSideDayRules(side, weekendRulesFor(side));
      } else {
        setSideLevel(side, "ask");
        persistCommunityWithOffice(side, false);
        setSideContemplation(side, false);
        // A side that's off keeps no weekend schedule behind it, or turning
        // it back on would resurrect a Saturday practice nobody re-chose.
        setSideDayRules(side, []);
      }
    }
    setReflectionSource(primary);
    // The office reminder pref / default level mirror a side that actually has an
    // office anchor (morning first); fall back to the first chosen side otherwise.
    const officeSides = SIDES.filter((s) => sides[s] && prayBySide[s] !== "none");
    const primarySide: OfficeSide = officeSides[0] ?? (sides.morning ? "morning" : "evening");
    // The "grow toward 30" ladder was removed — always a fixed goal now, so the
    // ladder is never enabled (and a returning grow-user is switched to fixed).
    // The ladder the reader is ON stays on. This was a hard `false`, so
    // opening the customizer and saving — changing nothing — sent
    // silenceLadderEnabled:false and quietly ended a kept ladder. The seed
    // reads the real state into silenceMode ("grow"); the commit now honours
    // it, and only an explicit switch to a fixed goal turns the ladder off.
    const wantLadder = silenceMode === "grow";
    const officePrefs = {
      defaultPrayerLevel: (() => {
        const lvl = PRAY_LEVEL[prayBySide[primarySide]];
        // Only office/devotion/intercessions are valid server default levels;
        // everything else (ask/reflect-sit/fdd/psalms/examen) folds to devotion.
        return lvl === "office" || lvl === "devotion" || lvl === "intercessions" ? lvl : "devotion";
      })(),
      contemplationGoalMinutes: effGoalMin,
      contemplationReminderEnabled: effGoalMin > 0 || wantLadder,
      morning: (sides.morning && reminderIsOn("morning") ? PRAY_REMINDER_PREF[prayBySide.morning] : "none") as "office" | "devotion" | "none",
      evening: (sides.evening && reminderIsOn("evening") ? PRAY_REMINDER_PREF[prayBySide.evening] : "none") as "office" | "devotion" | "none",
      // A prescribed spec is applied to SOMEONE ELSE'S account, so it carries
      // the concrete displayed values — "omit what we never learned" protects
      // the designer's own row, not the recipient's.
      morningTime: reminderIsOn("morning") ? shownReminderTime("morning") : null,
      eveningTime: reminderIsOn("evening") ? shownReminderTime("evening") : null,
    };
    const others = TRACKED_REFLECTION_SOURCES.filter((n) => !newsletters.includes(n));
    // Creation Prayer earns a home card either through the per-side "way"
    // choice (a side's contemplation IS the breath) OR the standalone
    // "Add an additional practice" toggle (contemplative.cobreathe) — the
    // latter is only offered there when NEITHER side already carries it, so
    // the two paths never fight over the same card.
    const wantCobreathe = (anyContemplation && anySideCreation) || contemplative.cobreathe;
    // Compline earns a home card ONLY as a standalone add-on. When it's a
    // side's office ANCHOR (the evening way-step choice) that side's own card
    // IS Compline, so a second "compline" module would double it on the home —
    // same one-practice-two-paths guard wantCobreathe applies above.
    const wantComplineCard = contemplative.compline && prayBySide.evening !== "compline" && prayBySide.morning !== "compline";
    // Same guard for the Examen — it was the one add-on WITHOUT it, so a rule
    // whose evening anchor IS the Examen (A Gentle Start, Contemplative Art)
    // grew a second standalone Examen card on its first re-save.
    const wantExamenCard = contemplative.examen && prayBySide.evening !== "examen" && prayBySide.morning !== "examen";
    const onKeys = [
      ...(extras.prayerList ? ["prayer-list"] : []),
      ...(extras.reading ? ["reading"] : []),
      ...(extras.podcasts ? ["podcasts"] : []),
      ...(wantComplineCard ? ["compline"] : []),
      ...(wantExamenCard ? ["examen"] : []),
      ...(contemplative.audio ? ["listening"] : []),
      ...(contemplative.walk ? ["walk"] : []),
      ...(contemplative.visio ? ["visio"] : []),
      /**
       * THE THREE INBOXES. None of them was here — not even Taizé, which has
       * had a row in this flow since it shipped — so their toggles wrote
       * nothing: `contemplative.taize` was seeded FROM the home layout and
       * never written back TO it, and the switch did nothing but move.
       *
       * Chittister and the Cathedral had no row at all; their only switch was
       * on /customize-home, a page nothing in the app links to.
       */
      ...(contemplative.taize ? ["taize"] : []),
      ...(contemplative.chittister ? ["chittister"] : []),
      ...(wantCobreathe ? ["cobreathe"] : []),
    ];
    const offKeys = [
      ...(extras.prayerList ? [] : ["prayer-list"]),
      ...(extras.reading ? [] : ["reading"]),
      ...(extras.podcasts ? [] : ["podcasts"]),
      ...(wantComplineCard ? [] : ["compline"]),
      ...(wantExamenCard ? [] : ["examen"]),
      ...(contemplative.audio ? [] : ["listening"]),
      ...(contemplative.walk ? [] : ["walk"]),
      ...(contemplative.visio ? [] : ["visio"]),
      ...(contemplative.taize ? [] : ["taize"]),
      ...(contemplative.chittister ? [] : ["chittister"]),
      ...(wantCobreathe ? [] : ["cobreathe"]),
    ];
    // No hardcoded "podcasts" here — extras.podcasts already routes it through
    // onKeys/offKeys, and the template copy meant every saved layout carried
    // the key TWICE (order and hidden both) — found live in a committed layout.
    const order = ["requests", "office", "contemplation", ...newsletters, ...onKeys, "feeds", "ncmp", ...offKeys, ...others];
    // "podcasts" is NOT hardcoded here either — see the note on `order` above.
    // It was removed from order and left in hidden, and hidden GOVERNS: turning
    // Podcasts on wrote the key into both lists, so homeCardActive answered
    // false forever and the card, dot, weekly row and widget row never appeared
    // however many times you ticked the box.
    const hidden = ["ncmp", ...offKeys, ...others];
    // The captured rule-config is the DESIGNER's device snapshot — strip keys
    // that are personal state rather than routine structure. Without this,
    // everyone adopting the rule inherits the designer's own 30-day
    // commitment start (their "Day N of 30" opens mid-trial, or is wiped when
    // the designer has none, since applying a config REMOVES omitted keys).
    const ruleConfig = collectRoutineValues();
    delete ruleConfig["phoebe:commitment-start"];
    // Course progress is PERSONAL, and applying a config OVERWRITES any key it
    // carries — ADDITIVE_KEYS only protects against a key being omitted, not
    // against being replaced. Left in, an admin who had worked through a course
    // would hand their own lesson completions to everyone who opened the link,
    // wiping the adopter's. Strip them the same way commitment-start is.
    for (const k of Object.keys(ruleConfig)) {
      if (k.startsWith("phoebe:course:")) delete ruleConfig[k];
    }
    return {
      v: 1,
      officePrefs,
      silenceLadderEnabled: wantLadder,
      homeLayout: { order, hidden, v: HOME_LAYOUT_VERSION },
      ruleConfig,
    };
  };

  /**
   * The per-side extra practices — each written as the REAL practice it names.
   *
   * Owner: "if they chose a secondary morning practice ... it should be a full
   * practice that leads to the practice." This used to call addCustomAnchor for
   * every extra, so choosing a second morning devotion produced a log-only row
   * captioned "Your daily practice" that had nothing to do with the devotion.
   *
   * Most of the menu is practices Phoebe already has a card and a page for, and
   * those are just turned on (their toggles are read by the same commit that
   * writes everything else, so this only has to set the state). The office
   * forms have no standing card of their own, so they go to the side's extra
   * LEVEL, which the home renders as a real card and routes through
   * /begin-prayer?practice=.
   *
   * A custom anchor is what's left for the one case nothing can represent: an
   * extra whose completion flag would be the anchor's own (see levelOfficeMode).
   * A logged practice is a poorer thing, but it is at least honest — the
   * alternative is a card that ticks itself when you pray something else.
   */
  const commitExtraPractices = () => {
    const existing = new Set(getCustomAnchors().map((a) => a.title.trim().toLowerCase()));
    for (const side of SIDES) {
      const cap = side === "morning" ? "Morning" : "Evening";
      const title = extraBySide[side];
      const entry = extraEntryFor(title, cap);
      if (!title || !entry) { setSideExtra(side, null); continue; }
      if (entry.maps.kind === "level") {
        const anchorLevel = PRAY_LEVEL[prayBySide[side]];
        const anchorMode = anchorLevel === "office"
          ? side
          : (levelOfficeMode(side, anchorLevel) ?? (side === "morning" ? "morning-devotion" : "early-evening-devotion"));
        const extraMode = levelOfficeMode(side, entry.maps.level);
        if (extraMode && extraMode !== anchorMode) {
          setSideExtra(side, entry.maps.level);
          continue;
        }
        /**
         * Indistinguishable from the anchor — the two would share one
         * completion flag, so this side can't carry both.
         *
         * Owner: "make sure that a secondary practice doesn't get flattened
         * into a custom practice… one that is just a manual log instead of
         * going into the actual experience." It used to become a custom
         * anchor, whose card has no href at all (see customCard) — tapping it
         * opens a Log popup rather than the practice. So a real second office
         * quietly turned into a checkbox wearing its name.
         *
         * The extra PICKER already refuses to offer a colliding practice, so
         * this is only reachable by changing the ANCHOR afterwards into the
         * thing the extra already was — at which point the side genuinely does
         * keep that practice once, as its anchor. Dropping the duplicate is
         * honest; minting a fake one is not.
         */
        setSideExtra(side, null);
        continue;
      }
      // Everything else is a real standing practice; its own toggle carries it.
      setSideExtra(side, null);
    }
  };

  const commit = () => {
    // PRESCRIBE FIRST. commitExtraPractices() and the custom-anchor add below
    // WRITE — localStorage and, through customAnchors' own debounced pipe, a
    // server PUT that prescribe-routine's snapshot/suspend does not gate. With
    // the guard down here, an admin who named a practice while designing
    // someone ELSE's rule permanently added it to their own account.
    if (prescribe && onPrescribe) { onPrescribe(buildPrescribeSpec()); return; }
    // Saving the rule ends today's one-day swap on both sides: the person has
    // just said, explicitly, what their practice is — a stand-in chosen this
    // morning must not keep overriding the home after that, wearing a stale
    // "switched from" line for a rule that no longer exists.
    clearSideDaySwap("morning");
    clearSideDaySwap("evening");
    commitExtraPractices();
    /**
     * The relational practices, added and removed to match the slide.
     *
     * AFTER the prescribe guard above, deliberately: like every other
     * custom-anchor write in commit(), this one lands on the signed-in
     * account, so it must not run while an admin is designing someone else's
     * rule. setRelationalPractices only ever touches the three known titles,
     * so a practice someone made themselves is never swept up by the removal
     * half.
     */
    setRelationalPractices(relational);
    /**
     * The named-your-own contemplative practice becomes a CUSTOM ANCHOR — the
     * app's existing shape for "a practice only you keep". "anytime" matches
     * the other standing contemplative practices (walk, sacred listening),
     * which are available all day rather than pinned to a part of it.
     */
    if (customPracticeOn) {
      const title = customPracticeName.trim();
      if (title) {
        const already = getCustomAnchors().some((a) => a.title.trim().toLowerCase() === title.toLowerCase());
        if (!already) addCustomAnchor(title, "🌿", "anytime");
      }
    }
    // (Prescribe already returned at the top — before ANY write.)
    // "none" reflection → no newsletter card; otherwise the first picked source
    // is the per-side close-slide reflection.
    const primary: ReflectionSource = newsletters[0] ?? "none";
    // Silence is its own step now (a daily-minutes goal) — the chosen value IS the
    // goal (0 = None). Contemplative Prayer is an add-on (its own silence card),
    // so a silent sit is wanted whenever it's checked — fall back to 10 min then.
    // effGoalMin IS goalMin. The fallback here manufactured a 10-minute daily
    // quota out of a per-side silent sit — the converse of "a goal never
    // implies per-side sits", and just as forbidden. A sit with no quota is a
    // complete, coherent rule.
    const effGoalMin = goalMin > 0 ? goalMin : 0;
    for (const side of SIDES) {
      if (sides[side]) {
        setSideLevel(side, PRAY_LEVEL[prayBySide[side]]);
        setSideEntry(side, methodBySide[side]);
        // …unless this side's ANCHOR reads a different one (Canterbury
        // Downtown: Forward Day by Day as the morning office, the CAC's
        // meditation as the newsletter card).
        setSideReflection(side, anchorReflectionBySide[side] ?? primary);
        // Remember the Prayer List + BCP merge so the row stays checked on
        // re-open (only meaningful when the office anchor isn't community itself).
        persistCommunityWithOffice(side, prayBySide[side] !== "community" && communityWithOffice[side]);
        // Per-side Contemplative Prayer → the home's Morning/Evening Contemplation card.
        setSideContemplation(side, contemplationBySide[side]);
        // …and WHICH one. Per side (owner: "let's separate creation prayer and
        // contemplative prayer") — the form the reader picked on this side's
        // own slide, not the global style flag they used to share.
        if (contemplationBySide[side]) {
          const f = contemplativeForm[side];
          setSideContemplationKind(side,
            f === "creation" ? "creation" : f === "walk" ? "walk"
              : f === "audio" ? "audio" : f === "visio" ? "visio" : "silent");
        }
        // Sit length is per side (config picker), NOT the daily goal — a
        // 90-minute goal must not put a 90-minute sit on each card (owner).
        if (contemplationBySide[side]) setSideMinutes(side, minutesBySide[side]);
        if (prayBySide[side] === "ownPractice") setSideCustomName(side, customNameBySide[side].trim());
        // Saturday / Sunday alternatives (see weekendRulesFor).
        setSideDayRules(side, weekendRulesFor(side));
      } else {
        // Not part of their chosen rhythm — clear the level so it isn't a
        // programmed office for that side.
        setSideLevel(side, "ask");
        persistCommunityWithOffice(side, false);
        setSideContemplation(side, false);
        // A side that's off keeps no weekend schedule behind it, or turning
        // it back on would resurrect a Saturday practice nobody re-chose.
        setSideDayRules(side, []);
      }
    }
    setReflectionSource(primary);
    // The global default / reminder pref mirror a side that actually has an office
    // anchor (morning first); fall back to the first chosen side otherwise.
    const officeSides = SIDES.filter((s) => sides[s] && prayBySide[s] !== "none");
    const primarySide: OfficeSide = officeSides[0] ?? (sides.morning ? "morning" : "evening");
    // "Grow my silence" ladder is on whenever they chose the guided mode on the
    // Silence slide — the same standalone treatment the fixed dropdown gets (the
    // goal is written regardless of the later multi-select). Otherwise we
    // explicitly disable it so a previously-enabled ladder stops driving the goal.
    // The "grow toward 30" ladder was removed — always a fixed goal now, so the
    // ladder is never enabled (and a returning grow-user is switched to fixed).
    // The ladder the reader is ON stays on. This was a hard `false`, so
    // opening the customizer and saving — changing nothing — sent
    // silenceLadderEnabled:false and quietly ended a kept ladder. The seed
    // reads the real state into silenceMode ("grow"); the commit now honours
    // it, and only an explicit switch to a fixed goal turns the ladder off.
    const wantLadder = silenceMode === "grow";
    // PUBLIC no-login version: every guest commit writes the device-local
    // silence goal — the home's single "Silence" progress-bar card reads this
    // key, and the ANONYMOUS DEVICE USER is a guest too (keying on `!user`
    // left its key stale, so the card and the customizer disagreed). Signed
    // sessions (anonymous included) still PUT the server prefs below, which
    // keeps the reminder bell accurate; signed-out guests skip every PUT.
    if (guest) setGuestSilenceGoalMin(effGoalMin);
    if (user) apiRequest("PUT", "/api/me/office-prefs", {
      // Only office/devotion/intercessions are server-side default-prayer levels;
      // the per-side LOCAL level set above drives the home Psalms card etc. Fold
      // anything else (ask/reflect-sit/fdd/psalms/examen) to devotion so this PUT
      // never carries an unknown value.
      defaultPrayerLevel: (() => {
        const lvl = PRAY_LEVEL[prayBySide[primarySide]];
        return lvl === "office" || lvl === "devotion" || lvl === "intercessions" ? lvl : "devotion";
      })(),
      // Goal fields only when the goal was ENGAGED (chosen, or hydrated from a
      // real stored value): the state seeds "5" and the server GET answers 5
      // for null, so writing unconditionally manufactured a 5-minute silence
      // habit + bell out of opening the customizer. Omitted fields leave the
      // stored value as-is (this PUT is field-conditional).
      ...(guest || goalEngagedRef.current ? {
        contemplationGoalMinutes: effGoalMin,
        contemplationReminderEnabled: effGoalMin > 0 || wantLadder,
      } : {}),
      // Each chosen side turns its reminder ON (a non-"none" pref is what makes
      // the server's daily office-reminder push fire) at its chosen time.
      // A side reminds only when it's part of the rhythm AND they didn't pick
      // "No reminder"; otherwise "none" keeps the daily push silent.
      morning: sides.morning && reminderIsOn("morning") ? PRAY_REMINDER_PREF[prayBySide.morning] : "none",
      evening: sides.evening && reminderIsOn("evening") ? PRAY_REMINDER_PREF[prayBySide.evening] : "none",
      ...reminderTimeField("morning", reminderIsOn("morning"), timeBySide.morning),
      ...reminderTimeField("evening", reminderIsOn("evening"), timeBySide.evening),
      notificationStyle,
    })
      // Sync the silence ladder AFTER office-prefs lands so, when enabled, the
      // server's current rung (which /me/silence-ladder writes into
      // contemplationGoalMinutes) wins over the dropdown value just sent above.
      .then(() => apiRequest("PUT", "/api/me/silence-ladder", { enabled: wantLadder }))
      .then(() => {
        qc.invalidateQueries({ queryKey: ["/api/me/silence-ladder"] });
        qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] });
        qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      })
      .catch(() => {/* best-effort */});
    // Ask the native shell to register for push (request iOS permission if it
    // hasn't been granted, or re-register a dropped token). No-op on web — no
    // listener is attached there. Without an active device token the server's
    // reminder push silently no-ops, which is the usual cause of "I set a
    // reminder but never get notified."
    try { window.dispatchEvent(new Event("phoebe:request-push-permission")); } catch { /* non-fatal */ }
    // Persist in the existing selections shape so the WoL drawer / weekly
    // review still read the commitment (Record<practiceId,{optionIds,custom}>).
    const selections: Record<string, { optionIds: string[]; custom: string }> = {
      pray: { optionIds: [PRAY_OPTION_ID[prayBySide[primarySide]], "pray-silence"], custom: "" },
      learn: { optionIds: ["learn-devotional"], custom: "" },
    };
    if (user) apiRequest("PUT", "/api/rule-of-life/wol", { selections }).catch(() => {/* ignore */});
    // Rewrite the home to match the rule (the rule is the source of truth):
    // requests (pinned) → Return (contemplation) → Pray (the office card) → ALL
    // chosen reflections. Unselected reflections + secondary panels hidden.
    const others = TRACKED_REFLECTION_SOURCES.filter((n) => !newsletters.includes(n));
    // Added optional practices are surfaced (in order, not hidden); unselected
    // ones go to the hidden tail like the other opt-in modules.
    // Examen, Audio Divina (listening), and Co-Breathe come from the
    // contemplative step. Every
    // selected Co-Breathe gets its own home card. Co-Breathe earns a card from
    // EITHER path: the Contemplation-practices toggle (contemplative.cobreathe) OR
    // choosing Co-Breathe as the contemplative sit's STYLE (contemplationStyle ===
    // "cobreathe" with Contemplative Prayer on). Mirrors the hydration logic above.
    // Creation Prayer earns a home card either through the per-side "way"
    // choice (a side's contemplation IS the breath) OR the standalone
    // "Add an additional practice" toggle (contemplative.cobreathe) — the
    // latter is only offered there when NEITHER side already carries it, so
    // the two paths never fight over the same card.
    const wantCobreathe = (anyContemplation && anySideCreation) || contemplative.cobreathe;
    // Compline earns a home card ONLY as a standalone add-on. When it's a
    // side's office ANCHOR (the evening way-step choice) that side's own card
    // IS Compline, so a second "compline" module would double it on the home —
    // same one-practice-two-paths guard wantCobreathe applies above.
    const wantComplineCard = contemplative.compline && prayBySide.evening !== "compline" && prayBySide.morning !== "compline";
    // Same guard for the Examen — it was the one add-on WITHOUT it, so a rule
    // whose evening anchor IS the Examen (A Gentle Start, Contemplative Art)
    // grew a second standalone Examen card on its first re-save.
    const wantExamenCard = contemplative.examen && prayBySide.evening !== "examen" && prayBySide.morning !== "examen";
    const onKeys = [
      ...(extras.prayerList ? ["prayer-list"] : []),
      ...(extras.reading ? ["reading"] : []),
      ...(extras.podcasts ? ["podcasts"] : []),
      ...(wantComplineCard ? ["compline"] : []),
      ...(wantExamenCard ? ["examen"] : []),
      ...(contemplative.audio ? ["listening"] : []),
      ...(contemplative.walk ? ["walk"] : []),
      ...(contemplative.visio ? ["visio"] : []),
      ...(wantCobreathe ? ["cobreathe"] : []),
    ];
    const offKeys = [
      ...(extras.prayerList ? [] : ["prayer-list"]),
      ...(extras.reading ? [] : ["reading"]),
      ...(extras.podcasts ? [] : ["podcasts"]),
      ...(wantComplineCard ? [] : ["compline"]),
      ...(wantExamenCard ? [] : ["examen"]),
      ...(contemplative.audio ? [] : ["listening"]),
      ...(contemplative.walk ? [] : ["walk"]),
      ...(contemplative.visio ? [] : ["visio"]),
      ...(wantCobreathe ? [] : ["cobreathe"]),
    ];
    // No hardcoded "podcasts" here — extras.podcasts already routes it through
    // onKeys/offKeys, and the template copy meant every saved layout carried
    // the key TWICE (order and hidden both) — found live in a committed layout.
    const order = ["requests", "office", "contemplation", ...newsletters, ...onKeys, "feeds", "ncmp", ...offKeys, ...others];
    // "feeds" stays visible (self-hides until you subscribe to a prayer feed).
    // "podcasts" is NOT hardcoded here either — see the note on `order` above.
    // It was removed from order and left in hidden, and hidden GOVERNS: turning
    // Podcasts on wrote the key into both lists, so homeCardActive answered
    // false forever and the card, dot, weekly row and widget row never appeared
    // however many times you ticked the box.
    const hidden = ["ncmp", ...offKeys, ...others];
    // Cache the layout locally + PUT through the durable helper, so finishing
    // the customizer and immediately leaving the app on iOS can't drop the
    // save (the in-flight PUT would otherwise die with the suspended WebView).
    // A GUEST'S layout is device-local truth: local cache only, no dirty flag
    // (saveHomeLayout's PUT would 401 and leave flushHomeLayout retrying).
    if (user) {
      saveHomeLayout({ order, hidden, v: HOME_LAYOUT_VERSION })
        .then(() => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }))
        .catch(() => {/* stays cached + dirty; re-pushed next app-active */});
    } else {
      cacheHomeLayoutLocalOnly({ order, hidden, v: HOME_LAYOUT_VERSION });
    }
    // Sync the per-device routine settings (office levels, slots, reflection
    // source, fdd mode, psalm cycle, etc.) up so the rhythm matches across
    // devices — every setSide*/setPracticeSlot write is in localStorage by now.
    // (Signed-in only: a guest has no server rule_config to sync to.)
    if (user) pushRoutineConfig();
    /**
     * SAVED — straight to the home (owner: "get rid of that slide … once they
     * add any more custom ones they click done, just have it go back to the
     * home screen, they can see their routine there").
     *
     * commit used to land on a review of the rule just written. The home is
     * that review, and it is the real one — the cards they will actually tap.
     */
    onDone();
  };
  /**
   * THE RULES YOUR GROUPS KEEP — offered above the app's own presets.
   *
   * Owner: "if this user is in a group that has a preset routine for the
   * group, when they go to preset routines have their group's preset routine
   * be there, and have it be at the top. All the ones from groups at the top."
   *
   * At the top because it's the one on this list that other people are already
   * praying. The app's presets are schools of prayer; a group's rule is a
   * standing invitation from people the reader has actually joined, and burying
   * it under five general options would be reading the room wrong.
   *
   * Only the NAMES are fetched here (one cheap call the home's rule offer
   * already uses). A group's spec is pulled when its row is tapped — three
   * routine blobs nobody may look at is not a page load worth paying for.
   *
   * Skipped for guests, prescribe and pilot: guests have no groups, and the
   * other two are designing for someone else, whose groups these aren't.
   */
  const { data: groupRules } = useQuery<{ offers: Array<{ slug: string; name: string; label: string | null }> }>({
    queryKey: ["/api/me/rule-offers"],
    queryFn: () => apiRequest("GET", "/api/me/rule-offers"),
    enabled: !!user && !guest && !prescribe && !pilot,
    staleTime: 5 * 60_000,
  });
  const groupRuleOffers = groupRules?.offers ?? [];
  /** Which group's rule is being looked at on the confirm screen. */
  const [groupPending, setGroupPending] = useState<{ slug: string; name: string } | null>(null);
  const { data: groupPendingRule } = useQuery<{ rule: { label: string | null; spec: RuleSpec } | null }>({
    queryKey: [`/api/groups/${groupPending?.slug}/rule`],
    queryFn: () => apiRequest("GET", `/api/groups/${groupPending!.slug}/rule`),
    enabled: !!groupPending,
  });
  const [adoptingGroup, setAdoptingGroup] = useState(false);
  const [groupAdoptError, setGroupAdoptError] = useState(false);
  /**
   * Adopt a GROUP's rule — through the group's own endpoint, not adoptRule().
   *
   * adoptRule() replays a preset into this flow's state and lets commit() write
   * it. A group's rule isn't a preset: it's a stored spec, and the server
   * already knows how to apply one (the same call the group page's Follow
   * button makes). Going through it means the adoption is COUNTED, the viewer
   * shows as following on the group page, and the spec applied is byte-for-byte
   * the one the leader designed — no round-trip through flow state that only
   * carries what this customizer happens to model.
   */
  const adoptGroupRule = async () => {
    if (!groupPending || adoptingGroup) return;
    setAdoptingGroup(true); setGroupAdoptError(false);
    try {
      const res = await apiRequest("POST", `/api/groups/${groupPending.slug}/rule/adopt`, {}) as { ruleConfig?: Record<string, string> };
      adoptRoutineConfig(res?.ruleConfig);
      try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "medium" } })); } catch { /* non-fatal */ }
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] });
      qc.invalidateQueries({ queryKey: [`/api/groups/${groupPending.slug}/rule`] });
      onDone();
    } catch {
      setGroupAdoptError(true);
      setAdoptingGroup(false);
    }
  };
  const lastAdoptedPresetRef = useRef<string | null>(null);
  // The time-ladder dial's position (index into TIME_LADDER; default = 20 min:
  // Morning Prayer · FDD · 5 minutes of silence, no evening).
  const [timeIdx, setTimeIdx] = useState(TIME_LADDER_DEFAULT);

  // ?adopt=<presetId> — a shared link (e.g. the Centering course's practice
  // bridge lands here with ?adopt=centering) CARRIES the rule to auto-adopt, so
  // the recipient's rhythm arrives in one tap (no stick shift). Runs once on mount.
  const autoAdoptedRef = useRef(false);
  useEffect(() => {
    if (autoAdoptedRef.current) return;
    autoAdoptedRef.current = true;
    try {
      const id = new URLSearchParams(window.location.search).get("adopt");
      const preset = id ? RULE_PRESETS.find((p) => p.id === id) : null;
      // NEVER silently replace an EXISTING rule — the Centering course's
      // practice bridge lands here with ?adopt=centering, and one tap was
      // wiping a person's Morning/Evening offices ("it reverted back to
      // contemplation"). Auto-adopt is for first authors only; anyone with a
      // rule lands in their normal customizer, rule intact.
      const hasRule = !!(getExplicitSideLevel("morning") || getExplicitSideLevel("evening"));
      if (preset && !hasRule) { setShowWhy(false); adoptRule(preset); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adopting a named starter rule presets the flow state, then parks its id so
  // THIS effect (next render, after the setters apply) writes it via the same
  // commit() the full flow uses — landing on the review screen to behold it.
  const adoptRule = (preset: RulePreset) => {
    touchedRef.current = true;
    lastAdoptedPresetRef.current = preset.id;
    setSides(preset.sides);
    setPrayBySide({ morning: preset.pray, evening: preset.evening ?? preset.pray });
    setCommunityWithOffice({ morning: false, evening: false });
    // chooseContemplationStyle, NOT the raw setter: the style's localStorage
    // write ("phoebe:contemplation-style") lives in the chooser, and the home
    // card + "Begin" read it from there. Set state alone and a breath rule
    // (VTS) adopts a practice whose card still says Contemplation.
    chooseContemplationStyle(preset.contemplationStyle ?? "silent");
    // Cleared first, then whatever the preset actually names — so a rule that
    // wants Visio Divina and a Contemplative Walk gets exactly those, and
    // nothing survives from the rule being replaced.
    setContemplative({
      cobreathe: false, audio: false, examen: false, walk: false, visio: false, taize: false, chittister: false, compline: false,
      ...(preset.practices ?? {}),
    });
    /**
     * REPLACEMENT, NOT ACCUMULATION. The header on RulePreset promises
     * "nothing carries over from the rule being replaced", and that was true
     * only of the practices flags above. Three families survived — verified
     * from a clean state against the server (the leftovers are
     * server-persisted, so clearing localStorage proves nothing):
     *
     *  · the SECOND practice (phoebe:office:extra:<side>): extraBySide seeds
     *    from the OLD rule at mount, and commitExtraPractices faithfully
     *    re-wrote it — a literal "extra practice that shouldn't be there".
     *  · SLOT KEYS for practices the new rule doesn't name: commit() hides
     *    their cards, but the server's edit list derives rows from slot keys,
     *    so a ghost 🎵 Audio Divina sat in "Your rhythm" with its card off.
     *  · per-side KIND + MINUTES on sides the new rule turns off: inert until
     *    the side is re-enabled, then a stale "creation"/2-minute sit speaks
     *    for a rule that never chose it.
     *
     * Custom anchors are part of the rhythm too (owner's ruling, 2026-08-26:
     * "replaces" means replaces). Any anchor the new preset doesn't name by
     * title is removed — tombstoned and pushed immediately, like any other
     * deletion — so adopting VTS then A Gentle Start no longer keeps the
     * Community Meal forever. Never in prescribe (that would delete the
     * DESIGNER's own practices while drafting someone else's rule).
     */
    setExtraBySide({ morning: null, evening: null });
    setExtraWantedBySide({ morning: false, evening: false });
    if (!prescribe) {
      const named = new Set((preset.customAnchors ?? []).map((c) => c.title.trim().toLowerCase()));
      for (const a of getCustomAnchors()) {
        if (!named.has(a.title.trim().toLowerCase())) removeCustomAnchor(a.id);
      }
      setCustomList(getCustomAnchors());
    }
    for (const k of ["cobreathe", "listening", "examen", "walk", "reading", "visio"] as const) {
      const wanted = (preset.practiceSlots ?? {})[k] != null
        || (k === "cobreathe" && preset.practices?.cobreathe)
        || (k === "listening" && preset.practices?.audio)
        || (k === "examen" && preset.practices?.examen)
        || (k === "walk" && preset.practices?.walk)
        || (k === "visio" && preset.practices?.visio);
      if (!wanted) { try { localStorage.removeItem(`phoebe:slot:${k}`); } catch { /* ignore */ } }
    }
    for (const sd of SIDES) {
      const keeps = preset.silence && preset.sides[sd] && preset.silenceSide !== (sd === "morning" ? "evening" : "morning");
      if (!keeps) {
        try {
          localStorage.removeItem(`phoebe:office:contemplation-kind:${sd}`);
          localStorage.removeItem(`phoebe:office:minutes:${sd}`);
        } catch { /* ignore */ }
      }
      // The side's custom NAME goes with the rule that named it. Inert while
      // the level isn't "custom", but it prefilled "Chapel" the day someone
      // picked "Create your own" for a side VTS once owned.
      const namedHere = preset.customNames?.[sd]
        || (preset.dayRules?.[sd] ?? []).some((r) => r.pray === "ownPractice" && r.name);
      if (!namedHere) { try { localStorage.removeItem(`phoebe:office:custom-name:${sd}`); } catch { /* ignore */ } }
    }
    // …and at the part of the day the rule keeps them.
    for (const [key, slot] of Object.entries(preset.practiceSlots ?? {}) as Array<[SlottedPractice, CustomSlot]>) {
      if (slot) setPracticeSlot(key, slot);
    }
    // A starter rule's silence applies to whichever sides it turns on.
    const presetContemplation = {
      morning: preset.silence && preset.sides.morning && preset.silenceSide !== "evening",
      evening: preset.silence && preset.sides.evening && preset.silenceSide !== "morning",
    };
    setContemplationBySide(presetContemplation);
    // …and WHICH practice, on each side the rule turns on. commit() writes this
    // too, from contemplativeForm; doing it here as well means a rule adopted
    // and never re-opened still has a per-side kind rather than leaning on the
    // global flag's fallback.
    for (const sd of ["morning", "evening"] as const) {
      if (presetContemplation[sd]) {
        setSideContemplationKind(sd, preset.contemplationStyle === "cobreathe" ? "creation" : "silent");
      }
    }
    // Keep the "which contemplative practice" pick in step with the preset —
    // otherwise a stale form from before adopting it would leave the config
    // slide's dropdown disagreeing with what the preset actually turned on.
    const presetForm: ContemplativeForm | null = preset.contemplationStyle === "cobreathe" ? "creation" : "prayer";
    setContemplativeForm({
      morning: presetContemplation.morning ? presetForm : null,
      evening: presetContemplation.evening ? presetForm : null,
    });
    // Starter rules carry a fixed minutes goal — adopt the fixed sizing, not the ladder.
    setSilenceMode("fixed");
    setGoal(String(preset.silence ? preset.goalMin : 0));
    // The preset's sit IS its promise ("5 minutes of silence" = one 5-minute
    // sit) — size each side's card to it.
    // Only when the preset's sit IS silent — for a breath preset (VTS) the
    // goal is the day's separate silence total, and stamping it onto a side
    // whose practice is measured in breaths is the goal→per-side inference
    // this file has already removed twice.
    const presetSitsSilent = preset.silence && preset.contemplationStyle !== "cobreathe";
    setMinutesBySide({
      morning: presetSitsSilent && preset.goalMin >= 5 && preset.goalMin <= 30 ? preset.goalMin : 15,
      evening: presetSitsSilent && preset.goalMin >= 5 && preset.goalMin <= 30 ? preset.goalMin : 15,
    });
    setNewsletters(preset.reflections);
    // A side whose ANCHOR reads a different newsletter from the rule's own —
    // held in state so commit() can honour it (see anchorReflectionBySide).
    // Cleared first, like the practices above, so nothing carries over.
    setAnchorReflectionBySide({ ...(preset.anchorReflection ?? {}) });
    setExtras({ examen: false, listening: false, reading: false, podcasts: false, prayerList: false });
    // A side whose practice is the person's own needs its NAME, or the rule
    // adopts an anchor called "Morning Practice".
    if (preset.customNames) {
      setCustomNameBySide((prev) => ({
        morning: preset.customNames?.morning ?? prev.morning,
        evening: preset.customNames?.evening ?? prev.evening,
      }));
    }
    // The rule's own standing practices. Idempotent by title so re-adopting
    // (or adopting after having made the same practice by hand) doesn't stack
    // duplicates.
    // Saturday / Sunday alternatives the preset ships with. Loaded into the
    // picker's state so the weekend rows open pre-filled and the reader can
    // see (and change) what they just adopted, rather than having it applied
    // invisibly at commit.
    setWeekendBySide((prev) => {
      const next = { ...prev };
      for (const side of SIDES) {
        const rules = preset.dayRules?.[side];
        if (!rules) { next[side] = { sat: null, sun: null }; continue; }
        const at = (d: number): WeekendAlt => {
          const r = rules.find((x) => x.days.includes(d));
          return r ? { choice: r.pray, name: r.name ?? "" } : null;
        };
        next[side] = { sat: at(6), sun: at(0) };
      }
      return next;
    });
    if (preset.customAnchors?.length && !prescribe) {
      const existing = new Set(getCustomAnchors().map((a) => a.title.trim().toLowerCase()));
      for (const c of preset.customAnchors) {
        const key = c.title.trim().toLowerCase();
        if (existing.has(key)) continue;
        // …including `office`, which is how VTS's Chapel gets its "Open
        // Morning Prayer" door. Dropping it here silently created a Chapel
        // that looked right and couldn't be kept by praying the office.
        addCustomAnchor(c.title, c.emoji, c.slot, undefined, c.days, c.office);
        existing.add(key);
      }
    }
    try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "success" } })); } catch { /* ignore */ }
    setAdoptId(preset.id);
  };
  useEffect(() => {
    if (!adoptId) return;
    setAdoptId(null);
    commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptId]);

  // ── Shared chrome ──────────────────────────────────────────────────────────
  // The customizer mounts inside a CHROMELESS <Layout> (rule-of-life.tsx), whose
  // <main> drops its own horizontal gutter — so this shell's px-4/sm:px-6/md:px-8
  // is the ONLY padding and the cards sit at the SAME margin as the home cards
  // (not inset twice, which left them narrow on iOS; not jammed to the edge).
  // The leaf backdrop is now owned by <Layout bgPhoto> (rule-of-life.tsx), so it
  // covers the WHOLE screen including behind the header. The shell stays
  // transparent and just lays out the content over it.
  /**
   * minWidth: 0 on every flex column in this chain — the fix for the reminder
   * time bar overflowing the slide.
   *
   * A flex ITEM defaults to `min-width: auto`, meaning it refuses to shrink
   * below its own min-content width. iOS gives `input[type=time]` a wide
   * intrinsic width from its native control, and width/maxWidth:100% on the
   * input (and on its wrapper — both already had them) can't help, because the
   * floor is being set by an ANCESTOR that won't shrink. So the whole column
   * grew past the slide and the bar rendered wider than the cards above it.
   *
   * Fixed here rather than on the time row because it's the shell every slide
   * renders through: any future intrinsically-wide control — another native
   * input, a long unbroken string — would have hit exactly the same wall.
   */
  const shell = (children: ReactNode) => {
    // The top bar carries Back and the Layout X only. The primary action sits
    // at the BOTTOM (see ctaButton), and the two whole-routine actions are
    // rows at the foot of the list — both back where the owner asked for them.
    return (
    <div style={{ flex: 1, minHeight: 0, minWidth: 0, background: "transparent", position: "relative", isolation: "isolate", display: "flex", flexDirection: "column" }}>
      <div className="px-4 sm:px-6 md:px-8" style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", paddingTop: 24, paddingBottom: SHELL_PAD_BOTTOM }}>
        {/* BACK, pinned at the very top, sharing the row with the Layout X.
            (Next lived here too until the owner asked for Continue back at the
            bottom; Back stays because it belongs beside the X it steps
            toward.) The negative margin pulls this bar up over the space the
            chromeless X row + main's pt-2 + this shell's paddingTop occupy
            (36px X + 8 + 24 = 68, plus the safe-area --top-chrome the X row
            pads with); sticky top-0 then pins it — including in the one host
            that renders the flow without Layout, where sticky simply clamps
            the over-pulled bar back to the viewport top. paddingRight keeps
            the row clear of the 36px X. */}
        <div
          style={{
            position: "sticky", top: 0, zIndex: 15, pointerEvents: "none",
            marginTop: "calc(-68px - var(--top-chrome, 0px))",
            paddingTop: "var(--top-chrome, 0px)",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, height: 36, paddingRight: 46 }}>
            <button
              type="button"
              onClick={goPrev}
              style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", gap: 2, ...FROST_BLUR, background: CARD, border: `1px solid ${CARD_B}`, color: SAGE, borderRadius: 999, padding: "0 14px 0 8px", height: 36, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
            >
              <ChevronLeft size={16} /> {t("ruleOfLife.back", { defaultValue: "Back" })}
            </button>
            <div style={{ flex: 1 }} />
          </div>
        </div>
        {/* Full width on mobile; on larger screens capped + centered at the SAME
            56rem the home uses (.dash-shell) so the customizer cards are exactly
            as wide as the home-screen cards, not a narrower column. */}
        <div className="w-full md:max-w-[56rem] md:mx-auto" style={{ flex: 1, minWidth: 0, maxWidth: "100%", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
    </div>
    );
  };

  // The ordered input steps depend on which sides they chose — so the progress
  // bar and the "N/M" both adjust to the options picked.
  // Forward Day by Day asks a written/audio MEDIUM whenever it's chosen. FDD is
  // now always an add-on reflection (in `newsletters`), never a side office
  // anchor. The Psalms CYCLE is folded into each side's config slide.
  /**
   * The written/audio step — shown whenever Forward Day by Day is in the
   * rhythm AT ALL, as a followed reflection OR as a side's own prayer.
   *
   * It used to test `newsletters` alone, which happened to work only because
   * the "Which reflection?" picker pushed the anchor's source into that list
   * as a side effect — the same side effect that was handing people a
   * duplicate daily FDD card. Removing it took the format step with it:
   * "if I chose FDD it needs to have another slide where I chose the format."
   *
   * So ask the real question instead of relying on the side effect: is FDD
   * anywhere in this rhythm?
   */
  const fddIsAnchorSource = (["morning", "evening"] as OfficeSide[]).some(
    (s) => prayBySide[s] === "fdd" && (anchorReflectionBySide[s] ?? getSideReflectionExplicit(s) ?? "fdd") === "fdd",
  );
  const needsFddMode = newsletters.includes("fdd") || fddIsAnchorSource;
  // A side that picked "With the Book of Common Prayer" gets a dedicated slide
  // (morning-bcp / evening-bcp) to choose the form — Psalms / Devotion / Office.
  // Which pray-choices are "a BCP form", i.e. get the extra per-side bcp step.
  // "compline" MUST be here: it's one of the options that step itself offers,
  // so leaving it out meant picking Compline flipped bcpOnSide to false and
  // deleted the very step the user was standing on — orderedSteps shrank (the
  // progress bar jumped backward) and indexOf(step) went to -1, so goNext's
  // `i >= 0` guard failed and Continue did nothing.
  const bcpOnSide = (s: OfficeSide) => prayBySide[s] === "offices" || prayBySide[s] === "devotion" || prayBySide[s] === "psalms" || prayBySide[s] === "compline" || prayBySide[s] === "readings";
  // Owner: "take out the first slide of the customizer, have a none option at
  // the bottom of morning and evening here which would turn morning or evening
  // off." The "when" step is gone; both way slides ALWAYS render, and a side is
  // turned off from its own slide instead.
  //
  // The way slides staying unconditional is what makes that safe. Gate them on
  // `sides` and choosing None would delete the step the user is standing on —
  // orderedSteps shrinks, indexOf(step) goes to -1, and goNext's `i >= 0` guard
  // makes Continue do nothing. That exact bug is documented just above. Only
  // the CONFIG/CUSTOM slides are gated, so turning a side off removes slides
  // that come after the one in hand, never the one under it.
  //
  // Built as a function of `sides` so the deferred None (applied on Continue)
  // can compute the step list that WILL exist rather than navigating with the
  // stale one — a setState isn't visible to goNext in the same handler.
  /**
   * Does this side's chosen extra have details to set?
   *
   * Owner: "in the additional-practice slide, if they chose one, there needs to
   * be a details page for that — if it is something that, if it was the main
   * practice, would get a details page."
   *
   * So the test is the same one the anchor's own config slide applies, asked of
   * the extra: a silent sit needs its length, Creation Prayer its breaths, the
   * Psalter its cycle, an office form the way you take it. Everything else
   * (a walk, the Examen, Audio Divina) has nothing to ask as an anchor either,
   * and gets no slide here for the same reason.
   */
  const extraConfigKindFor = (side: OfficeSide): "medium" | "psalms" | "breaths" | "newsletter" | null => {
    const cap = side === "morning" ? "Morning" : "Evening";
    const entry = extraEntryFor(extraBySide[side], cap);
    if (!entry) return null;
    // "Reflection Newsletter" is a family, not a practice — WHICH of the four
    // is the whole question, so it always earns its slide.
    if (entry.maps.kind === "newsletter") return "newsletter";
    // A SILENT sit gets no slide here on purpose. Its length is a daily total
    // set once on the Silence slide, and asking for it per-side is the exact
    // inference that has turned a 90-minute quota into two 5-minute per-side
    // sits twice now. Creation Prayer is different — it's counted in breaths,
    // has no daily goal to inherit, and this is its only home.
    if (entry.maps.kind === "contemplation") return contemplationStyle === "cobreathe" ? "breaths" : null;
    if (entry.maps.kind === "practice" && entry.maps.key === "cobreathe") return "breaths";
    if (entry.maps.kind !== "level") return null;
    if (entry.maps.level === "psalms") return "psalms";
    if (entry.maps.level === "office" || entry.maps.level === "devotion") return "medium";
    return null;
  };
  /**
   * The practices this side could still add — everything the anchor doesn't
   * already occupy. Lifted out of the render because the step list needs it
   * too (to know whether a kind has more than one option worth a slide).
   */
  const extraOptionsFor = (side: OfficeSide): ExtraPractice[] => {
    const anchorLevel =
      prayBySide[side] === "offices" ? PRAY_LEVEL[BCP_FORM_TO_PRAY[bcpForm[side]] ?? "offices"]
        : PRAY_LEVEL[prayBySide[side]];
    // MUST mirror officePrefs.anchorModesFor's own fallback — see the note there.
    const anchorMode = levelOfficeMode(side, anchorLevel) ?? side;
    return EXTRA_PRACTICES
      .filter((e) => !e.side || e.side === side)
      .filter((e) => e.excludes !== anchorLevel)
      .filter((e) => e.maps.kind !== "level" || levelOfficeMode(side, e.maps.level) !== anchorMode);
  };

  const extraNeedsConfig = (side: OfficeSide): boolean => extraConfigKindFor(side) !== null;
  /**
   * Does the chosen KIND still need a which-one slide?
   *
   * Only when its group holds more than one practice this side can actually
   * take — "Simple Guided Prayer" is a group of one, so asking which one would
   * be a slide with a single row on it.
   */
  const extraGroupNeedsPick = (side: OfficeSide): boolean => {
    const g = extraGroupBySide[side];
    return !!g && extraOptionsFor(side).filter((e) => e.group === g).length > 1;
  };

  /** Is the SILENT sit part of this rhythm? Drives whether the Silence page
   *  (minutes + log method) is asked at all — see buildSteps — and lights the
   *  "Contemplative Prayer / Time set aside for silence" row. KIND-AWARE: a
   *  side kept as Creation Prayer (or a walk, or listening) is not silence,
   *  and counting it here lit the silence row for a VTS rule and let its
   *  toggle-OFF silently delete the Evening Creation Prayer. A side that's on
   *  with no recorded form is treated as silent (the legacy shape). */
  const sideIsSilentSit = (sd: OfficeSide) =>
    contemplationBySide[sd] && (contemplativeForm[sd] === "prayer" || contemplativeForm[sd] === null);
  const wantsSilence = goalMin > 0 || sideIsSilentSit("morning") || sideIsSilentSit("evening");
  const buildSteps = (sidesArg: Record<OfficeSide, boolean>): Step[] => guest
    // GUEST (public no-login): when → per-side way + ONE merged config slide
    // (the BCP form + medium + reminder all live on side-config — no separate
    // side-bcp slide: "there doesn't need to be more than one slide") → learn →
    // silence goal (fixed only) → custom. No contemplative multi-select, no
    // extras, no weekly.
    ? [
        "intro",
        "morning-way",
        ...(sidesArg.morning ? (["morning-config"] as Step[]) : []),
        "evening-way",
        ...(sidesArg.evening ? (["evening-config"] as Step[]) : []),
        "learn",
        ...(needsFddMode ? (["fdd-mode"] as Step[]) : []),
        "contemplation-goal",
        "relational",
        "custom",
      ]
    : pilot
    // Pilot: morning/evening → reflections → silence → one custom anchor. No
    // contemplative multi-select, no per-practice slots, no extras, no weekly.
    ? [
        "intro",
        "morning-way",
        ...(sidesArg.morning ? ([...(prayBySide.morning === "ownPractice" ? ["morning-custom"] : []), "morning-config"] as Step[]) : []),
        "evening-way",
        ...(sidesArg.evening ? ([...(prayBySide.evening === "ownPractice" ? ["evening-custom"] : []), "evening-config"] as Step[]) : []),
        "learn",
        ...(needsFddMode ? (["fdd-mode"] as Step[]) : []),
        "contemplation-goal",
        "relational",
        "custom",
      ]
    : [
    "sides",
    "morning-way",
    ...(sidesArg.morning ? ([...(prayBySide.morning === "ownPractice" ? ["morning-custom"] : []), ...(bcpOnSide("morning") ? ["morning-bcp"] : []), ...(contemplativeOnSide("morning") ? ["morning-contemplative"] : []), "morning-config", ...(extraWantedBySide.morning ? ["morning-extra"] : []), ...(extraGroupNeedsPick("morning") ? ["morning-extra-pick"] : []), ...(extraNeedsConfig("morning") ? ["morning-extra-config"] : [])] as Step[]) : []),
    "evening-way",
    ...(sidesArg.evening ? ([...(prayBySide.evening === "ownPractice" ? ["evening-custom"] : []), ...(bcpOnSide("evening") ? ["evening-bcp"] : []), ...(contemplativeOnSide("evening") ? ["evening-contemplative"] : []), "evening-config", ...(extraWantedBySide.evening ? ["evening-extra"] : []), ...(extraGroupNeedsPick("evening") ? ["evening-extra-pick"] : []), ...(extraNeedsConfig("evening") ? ["evening-extra-config"] : [])] as Step[]) : []),
    // CONTEMPLATIVE FIRST, THEN THE NEWSLETTERS (owner, restoring the older
    // order: "then you choose any of the contemplative practices, and you can
    // choose none, and then you choose any of the newsletters"). The two are
    // independent choices, so the order is simply his.
    "contemplative",
    ...(wantsSilence ? (["contemplation-goal"] as Step[]) : []),
    "learn",
    // FDD medium choice — asked AFTER the reflection/prayer is picked, so it
    // covers FDD-as-reflection too (applies wherever FDD is used: both sides).
    ...(needsFddMode ? (["fdd-mode"] as Step[]) : []),
    /**
     * CHOOSE the contemplative practice first, THEN configure it.
     *
     * Owner: "first say choose contemplative practice, and have that slide with
     * contemplative prayer at the top. Then if they chose contemplative prayer,
     * it would go to the [silence] slide."
     *
     * Silence asks for a daily minutes goal and how it's logged — questions
     * that only make sense for the silent sit. Asking them BEFORE the practice
     * was chosen meant someone whose practice is a Contemplative Walk was set a
     * silence goal they never asked for, and it is that goal the weekly
     * Contemplative row measures against. Making the page conditional is also
     * what settles the weekly card: the row means "did you keep your
     * contemplative practice", and minutes only enter for the practice that was
     * actually asked about them.
     */
    // RELATIONAL, then the free-form customs. It sits here because it is a
    // CATEGORY of ready-made practices, like the contemplative and newsletter
    // slides above it — and "create your own" belongs last, after every list
    // we can offer has been offered.
    "relational",
    "custom",
    // The weekly Way of Love rhythm (Commune / Go / Bless / Rest) closes the
    // flow — restored per owner (2026-07-09): a rule of life turns weekly too.
    // Each pick adds a card to the home's "This week" band, logged with a tap.
    // Globally OFF for now (owner) — skip the step while WEEKLY_PRACTICES_ENABLED
    // is false so the customizer never offers a practice that won't appear.
    ...(WEEKLY_PRACTICES_ENABLED ? (["weekly"] as Step[]) : []),
    // (Removed: the weekly-progress CARDS step. Owner: "make sure that the
    // weekly card slide is taken out, and just have it on by default and have
    // that on the settings page" — the card now defaults on and its toggle
    // lives in Settings → Home display. "custom" is the last step of the full
    // flow now, so its Continue is what commits.)
  ];
  const orderedSteps: Step[] = buildSteps(sides);
  const totalSteps = orderedSteps.length;
  // "None" is DEFERRED — owner: "if they click none on morning, just have it
  // wait until they hit continue to put it into effect so it doesn't break."
  // Tapping None only marks the row; `sides` flips on Continue, and navigation
  // uses the step list computed from the NEW sides rather than the stale one.
  /**
   * A side is OFF when nothing on its slide is selected.
   *
   * Owner: "instead of doing a 'none' card, let's just have it if they don't
   * click one." Derived rather than stored, so the row highlighting and the
   * on/off state cannot disagree — which is exactly what a separate
   * sideOffPending flag allowed: a side could be marked None while a practice
   * still showed as chosen.
   *
   * Still deferred to Continue (the original reason the flag existed): `sides`
   * only flips in wayContinue, so the slide someone is standing on can't
   * vanish underneath them mid-tap.
   */
  const sideIsBlank = (side: OfficeSide): boolean =>
    prayBySide[side] === "none" && !contemplationBySide[side];
  const wayContinue = (side: OfficeSide) => {
    const turningOff = sideIsBlank(side);
    const nextSides = { ...sides, [side]: !turningOff };
    // Nothing changed for this side — the ordinary path.
    if (nextSides[side] === sides[side]) { goNext(); return; }
    setSides(nextSides);
    // Turning a side back ON defaults its daily reminder ON (carried over from
    // the removed "when" step's toggleSide) — re-enabling a side shouldn't
    // inherit the "off" a previous save left behind.
    if (nextSides[side]) setReminderOnBySide((r) => ({ ...r, [side]: true }));
    // Navigate against the list this change produces. goNext would read the
    // pre-update orderedSteps and walk into a config slide that's about to
    // stop existing (or skip one that's about to appear).
    const next = buildSteps(nextSides);
    const i = next.indexOf(side === "morning" ? "morning-way" : "evening-way");
    const after = i >= 0 && i < next.length - 1 ? next[i + 1] : null;
    // Editing this practice alone: follow its own remaining slides, then save.
    // Without this, toggling a side off here walked on into the rest of the
    // flow — the exact thing a single-practice edit exists to avoid.
    if (singleEditRow) {
      // Same forward scan as goNext, against the list this change PRODUCES —
      // see nextStepForRow for why adjacency isn't enough.
      const start = i >= 0 ? i : -1;
      for (let j = start + 1; j < next.length; j++) {
        const cand = next[j]!;
        if (stepBelongsToRow(cand, singleEditRow)) { setStep(cand); return; }
      }
      finishSingleEdit();
      return;
    }
    if (after) setStep(after);
  };
  /** Finish a single-practice edit: write the rule, refresh the row, go back to
   *  the list. commit() ends on setStep("done"), but the edit list renders off
   *  manualMode and is checked before the step machine, so this lands there. */
  /**
   * Leave the customizer, rule written.
   *
   * The whole-rhythm counterpart to finishSingleEdit: that one saves ONE
   * practice and returns to the list, this one saves and hands back to the
   * page, which lands on the home screen (owner: "after any editing of the
   * routine it should go to the home screen").
   *
   * Prescribe mode is the one case that must not call onDone — there commit()
   * hands the captured spec to onPrescribe and writes nothing, and the
   * prescribe page drives what happens next.
   */
  const saveAndClose = () => {
    commit();
    if (prescribe && onPrescribe) return;
    onDone();
  };
  /**
   * A deletion on the REVIEW screen writes itself down.
   *
   * Reported: "when it's shown me the routine and I deleted things, they
   * didn't actually go into effect" — three practices ✕'d off the review, then
   * still on the home screen. This screen renders after commit() has already
   * run (commit ends on setStep("done")), so its ✕ edited customizer state
   * that nothing wrote again: the row vanished, convincingly, and the rule on
   * disk never changed.
   *
   * Committing on the way out fixes the "Keep this rhythm" path, but not the
   * ✕ in the corner — and someone who has just deleted three things and taps
   * close has every reason to expect them gone. So the write happens at the
   * DELETION instead, which covers both ways off the screen.
   *
   * Via an effect, not inside the handler: setState is async, so a commit()
   * called straight after would capture the state as it was BEFORE the
   * removal and faithfully write back the thing just deleted. Bumping a
   * counter and committing once the re-render has landed is what makes it the
   * new state that gets saved.
   */
  const [reviewEditTick, setReviewEditTick] = useState(0);
  useEffect(() => {
    if (reviewEditTick === 0) return;   // never on mount
    commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewEditTick]);

  const finishSingleEdit = () => {
    commit();
    const ret = singleEditReturnTo;
    setSingleEditRow(null);
    setSingleEditReturnTo(null);
    if (ret) { setLocation(ret); return; }
    // A review-born edit lands back on the review (its rows rebuild from the
    // state commit() just wrote), not on the edit list it never came from.
    if (returnToReview) { setReturnToReview(false); setStep("done"); return; }
    setManualMode("edit");
    /**
     * FLUSH before re-reading, or the list shows the routine you just left.
     *
     * Reported: changed the morning card to scripture, and the list it
     * returned to still said Morning Office. commit() writes localStorage;
     * routineSync mirrors that to the server on an 800ms debounce — but this
     * list is DERIVED SERVER-SIDE (/routine-interview/current reads
     * rule_config), so an immediate re-read races the debounce and loses.
     * Await the push (rule levels AND custom anchors — a practice added or
     * renamed in the edit rides the other pipe), then re-read.
     */
    void (async () => {
      try { await Promise.all([flushRoutineConfig(), flushCustomAnchorPush()]); } catch { /* best-effort */ }
      await reloadEditRows();
    })();
  };
  /**
   * Does this step still belong to the practice being edited alone?
   *
   * A practice isn't always one slide — a side can have a way slide, a config
   * slide, a "create your own" name. Editing one practice should walk THOSE and
   * stop, rather than either saving half-configured or spilling into the next
   * practice's slides.
   */
  const stepBelongsToRow = (st: Step, rowId: string): boolean => {
    if (rowId === "extra:morning") return st === "morning-extra" || st === "morning-extra-pick" || st === "morning-extra-config";
    if (rowId === "extra:evening") return st === "evening-extra" || st === "evening-extra-pick" || st === "evening-extra-config";
    // A side anchored on Forward Day by Day owns the format step as well —
    // it's part of choosing that practice, not a separate one. Without this,
    // editing the morning alone picked FDD and saved without ever asking how
    // they take it (owner: "it didn't give me an option to choose the format").
    if (rowId === "side:morning") return st.startsWith("morning-") || (st === "fdd-mode" && prayBySide.morning === "fdd");
    if (rowId === "side:evening") return st.startsWith("evening-") || (st === "fdd-mode" && prayBySide.evening === "fdd");
    if (rowId === "contemplation") return st === "contemplation-goal" || st === "contemplative";
    // A side's contemplative practice is that side's ANCHOR, so editing it
    // walks the side's whole run of slides (way → which practice → config),
    // exactly as the side:<side> row does — the owner asked to be able to
    // change Creation Prayer to the evening office from this gear. Without
    // this case the walk fell through to false and the FIRST slide's
    // Continue already said Save.
    if (rowId.startsWith("contemplation:")) {
      return rowId.endsWith(":morning") ? st.startsWith("morning-") : st.startsWith("evening-");
    }
    if (rowId.startsWith("slot:")) return st === "contemplative";
    if (rowId.startsWith("card:")) return st === "learn";
    if (rowId.startsWith("custom:")) return st === "custom";
    return false;
  };
  /**
   * Editing ONE practice: the next slide that still belongs to it.
   *
   * Not simply "the adjacent one" — a practice's slides are not always
   * contiguous. A side anchored on Forward Day by Day owns the format step,
   * and that step sits after BOTH sides and the reflections list, so an
   * adjacency test found the evening's slide, decided the edit was over, and
   * saved without ever asking how they take it. Scanning forward finds it.
   *
   * Everything else is unaffected: a side's own slides ARE contiguous, so for
   * every other row this returns exactly what adjacency returned.
   */
  const nextStepForRow = (from: Step, rowId: string): Step | null => {
    const i = orderedSteps.indexOf(from);
    if (i < 0) return null;
    for (let j = i + 1; j < orderedSteps.length; j++) {
      const cand = orderedSteps[j]!;
      if (stepBelongsToRow(cand, rowId)) return cand;
    }
    return null;
  };
  const goNext = () => {
    const i = orderedSteps.indexOf(step);
    const next = i >= 0 && i < orderedSteps.length - 1 ? orderedSteps[i + 1] : null;
    if (singleEditRow) {
      const mine = nextStepForRow(step, singleEditRow);
      if (mine) { setStep(mine); return; }
      finishSingleEdit();
      return;
    }
    if (next) setStep(next);
  };
  const goPrev = () => {
    // One practice, one slide: Back returns to the list rather than reversing
    // into a flow the reader never entered. The COMMIT-owned choices aren't
    // written (Continue is what saves those) — but note the slides also hold
    // immediate writers (breath length, psalm cycle, reminder time, FDD mode),
    // which persist the moment they're tapped. Backing out is only a full
    // undo for the practice choice itself.
    if (singleEditRow) {
      const ret = singleEditReturnTo;
      setSingleEditRow(null);
      setSingleEditReturnTo(null);
      if (ret) { setLocation(ret); return; }
      if (returnToReview) { setReturnToReview(false); setStep("done"); return; }
      setManualMode("edit");
      return;
    }
    /**
     * The flat entry's phases: Back walks the phase stack, never out of the
     * customizer. Without this, the ctaButton's Back on the notifications and
     * add slides fell through to onBack() and EXITED — Save's neighbour
     * silently abandoning the routine you were mid-way through shaping.
     */
    if (canEditParts && manualMode === "edit" && entryPhase !== "list") {
      if (entryPhase === "add-items" || entryPhase === "add-custom") { setEntryPhase("add-cat"); return; }
      if (entryPhase === "add-minutes") { setEntryPhase("add-items"); return; }
      setEntryPhase("list");
      return;
    }
    // "Build your own" enters at morning-way, SKIPPING the intro (owner) — so
    // Back from the flow's FIRST slide returns to the three-door entry.
    // It used to drop into the flat list (manualMode "edit"), which is no
    // longer the editor — the walk is. Landing there from Back was the one
    // way left to reach it.
    if (canEditParts && manualMode === "scratch" && (step === "sides" || step === "morning-way")) {
      setEntryChoiceMade(false);
      return;
    }
    const i = orderedSteps.indexOf(step);
    if (i > 0) { setStep(orderedSteps[i - 1]); return; }
    // Reported: "the back goes to the home screen and not the previous thing in
    // the customizer." From the FIRST step that used to be true by definition —
    // but there are now slides in front of it (the entry chooser, and the
    // scratch-or-edit fork), so leaving the app entirely skips right past them.
    // Back out of the preset CONFIRM to the preset LIST first — one tap should
    // undo one tap, not drop you two slides back at the fork.
    if (canEditParts && manualMode === "preset" && groupPending) { setGroupPending(null); return; }
    if (canEditParts && manualMode === "preset" && presetPending) { setPresetPending(null); return; }
    if (entryChoiceMade && showEntryChoice) { setEntryChoiceMade(false); return; }
    onBack();
  };
  // Is the CURRENT step the last one in whichever flow variant is active
  // (guest/pilot/full)? Used by whatever step now closes each variant
  // ("custom" now closes every variant) to commit instead of
  // just advancing, now that "notifications" no longer closes every flow.
  const isLastStep = orderedSteps[orderedSteps.length - 1] === step;

  // Desktop keyboard nav — ArrowRight advances a step, ArrowLeft goes back.
  // A ref holds the latest closures so the listener binds once yet always sees
  // the current step. Ignored while a text field is focused (so typing a custom
  // anchor / minutes doesn't jump steps).
  const keyNavRef = useRef<{ next: () => void; prev: () => void }>({ next: () => {}, prev: () => {} });
  keyNavRef.current = { next: goNext, prev: goPrev };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); keyNavRef.current.next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); keyNavRef.current.prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The top "Back" row is intentionally NOT rendered (per design — the flow
  // leads with the progress bar and the content sits higher). Kept as a no-op so
  // the per-step call sites don't each need editing; navigation still happens
  // via the bottom Continue / the editable review screen.
  const backRow = (_onClick: () => void): ReactNode => null;

  // Header for the current step — the N/M and progress fill come from the step's
  // position in the (dynamic) ordered list.
  const stepHeader = (eyebrow: string, title: string) => {
    const n = Math.max(1, orderedSteps.indexOf(step) + 1);
    // Hide the eyebrow when it just restates the title (e.g. "EVENING" over
    // "Evening", "ADD TO YOUR DAY" over "Add to your day") — otherwise the
    // step header reads the same word twice.
    // …and hide the old fixed walk line entirely: several slides still pass
    // wol_rule.walk as their eyebrow, and the owner removed that line ("take
    // the your daily rhythm of prayer eyebrow out so you can move the type
    // up"), so it renders for no one.
    const walkLine = t("wol_rule.walk", { defaultValue: "Your daily rhythm of prayer" });
    const showEyebrow = eyebrow.trim().toLowerCase() !== title.trim().toLowerCase()
      && eyebrow.trim().toLowerCase() !== walkLine.trim().toLowerCase();
    return (
      <>
        <div style={{ height: 3, background: CARD_B, borderRadius: 2, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ width: `${(n / totalSteps) * 100}%`, height: "100%", background: SAGE, transition: "width 0.3s ease" }} />
        </div>
        {showEyebrow && (
          <p style={{ color: SAGE, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.9px", margin: "16px 0 0", fontFamily: FONT }}>{eyebrow}</p>
        )}
        <h1 style={{ color: CREAM, fontSize: 30, fontWeight: 700, fontFamily: FONT, margin: showEyebrow ? "6px 0 0" : "16px 0 0" }}>{title}</h1>
      </>
    );
  };

  // A MENU row, not a choice row (owner). Some slides aren't a set of answers
  // you pick between — they're a fork where tapping takes you somewhere. A
  // radio circle on those is a lie twice over: nothing is selected, and
  // nothing ever will be, because the tap navigates. This reads like the rest
  // of the app's menus instead: emoji, label, sub, and a chevron saying "this
  // goes somewhere". Same card treatment as MenuHub.
  const menuRow = (emoji: string, label: string, sub: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={{
        ...FROST_BLUR,
        background: CARD,
        border: `1px solid ${CARD_B}`,
        color: CREAM, borderRadius: 16, padding: "16px 18px", textAlign: "left",
        display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0, width: 28, textAlign: "center" }} aria-hidden>{emoji}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 700, fontFamily: FONT }}>{label}</span>
        <span style={{ display: "block", color: SAGE, fontSize: 13, fontFamily: FONT, marginTop: 3, lineHeight: 1.35 }}>{sub}</span>
      </span>
      <span aria-hidden style={{ color: "rgba(143,175,150,0.4)", fontSize: 22, lineHeight: 1, flexShrink: 0 }}>›</span>
    </button>
  );

  // The slide's primary action. Renders NOTHING in place — it registers the
  /**
   * The slide's primary action — AT THE BOTTOM, hovering, content fading under.
   *
   * Owner: "lets put the continue back at the bottom, but all the way at
   * bottom" and "reduce the gap between the cta and the bottom while still
   * doing the hover." It spent a while as a pill in the top bar; this puts it
   * back where the thumb is, on the same sticky-with-a-fade treatment it had
   * before, only sitting lower.
   *
   * Back and the ⚙ stay in the top bar. He asked for the CONTINUE to come
   * down, not the whole pair, and Back belongs beside the X it steps toward.
   *
   * HOW THE HOVER IS BUILT, since three parts have to agree:
   *   marginTop:auto      — on a short slide it still sits at the bottom
   *                         rather than floating under the last card.
   *   sticky + bottom:0   — on a long slide it rides above the scroll.
   *   marginBottom:-GAP   — cancels the shell's own bottom padding so the
   *                         button can reach the true bottom of the screen.
   *   paddingTop + the gradient — the fade content passes under.
   *   boxShadow           — a SOLID skirt below the gradient. Without it the
   *                         last few pixels under the button stayed
   *                         transparent and you could see content through the
   *                         bottom of the fade (owner: "did you notice how
   *                         bellow the cta on the fade you could stills see").
   */
  const ctaButton = (rawLabel: string, onClick: () => void) => {
    // Editing one practice, this button is the end of the road — call it Save,
    // not Continue, because there is nothing after it to continue to. Only on
    // the practice's LAST slide, though: a practice can span two or three, and
    // a Save that actually continues is a lie about what the tap does.
    // Ask the SAME question goNext asks — the next slide still belonging to
    // this practice, scanning forward rather than testing the adjacent one.
    const savesNow = !!singleEditRow && !nextStepForRow(step, singleEditRow);
    const label = savesNow ? t("common.save", { defaultValue: "Save" }) : rawLabel;
    return (
      <div
        style={{
          marginTop: "auto",
          position: "sticky",
          bottom: 0,
          zIndex: 2,
          // The shell pads the column by SHELL_PAD_BOTTOM; cancelling it here
          // is what lets the button sit "all the way at bottom" instead of
          // floating one paragraph above it.
          marginBottom: -SHELL_PAD_BOTTOM,
          paddingTop: 56,
          // The gap he asked to reduce: the safe-area inset (the home
          // indicator) plus a hair, rather than the old 40px on top of it.
          paddingBottom: "calc(8px + max(6px, env(safe-area-inset-bottom)))",
          background:
            "linear-gradient(to top, rgba(9,26,16,1) 0%, rgba(9,26,16,1) 66%, rgba(9,26,16,0.9) 80%, rgba(9,26,16,0.45) 91%, rgba(9,26,16,0) 100%)",
          boxShadow: "0 24px 0 24px rgba(9,26,16,1)",
        }}
      >
        <button
          type="button"
          onClick={onClick}
          style={{
            width: "100%", ...FROST_BLUR, background: "rgba(46,107,64,0.72)",
            border: `1px solid ${CARD_B_ACTIVE}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
            color: CREAM, borderRadius: 999, padding: "15px 20px", fontSize: 16.5,
            fontWeight: 700, fontFamily: FONT, cursor: "pointer",
          }}
        >
          {label}
        </button>
      </div>
    );
  };

  // A radio-style choice row (single-select), with the home cards' left accent
  // bar — brighter when selected.
  const choiceRow = (on: boolean, label: string, sub: string, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        ...FROST_BLUR,
        background: on ? CARD_ACTIVE : CARD,
        border: `1px solid ${on ? CARD_B_ACTIVE : CARD_B}`,
        color: CREAM, borderRadius: 14, padding: 0, overflow: "hidden", textAlign: "left",
        // FULL WIDTH on its own. This used to rely on being a direct child of a
        // flex column (align-items: stretch) — so the moment two new slides
        // wrapped each row in a keyed <div>, the div stretched and the button
        // inside it shrank to fit its text, and a list of five options came out
        // with five different right edges. A row shouldn't care where it's put.
        width: "100%", boxSizing: "border-box",
        display: "flex", alignItems: "stretch", cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <span style={{ width: 4, flexShrink: 0, background: on ? "#A8C5A0" : CARD_B }} aria-hidden />
      <span style={{ flex: 1, minWidth: 0, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, flexShrink: 0, marginTop: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "#A8C5A0" : "transparent", border: on ? "none" : `1.5px solid ${CARD_B}` }}>
        {on && <Check size={12} strokeWidth={3} color="#0C1F12" />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15.5, fontWeight: 600, fontFamily: FONT }}>{label}</span>
        <span style={{ display: "block", color: SAGE, fontSize: 13, fontFamily: FONT, marginTop: 2, lineHeight: 1.4 }}>{sub}</span>
      </span>
      </span>
    </button>
  );


  // ── The "technology of holding" prelude — shown once before the first author
  // reaches the preset picker (all hooks above have already run). ────────────
  // ── Manual, or let it ask? (super admins) ─────────────────────────────────
  // Owner: "the first slide is an option to do manual or have it ask
  // questions." Sits ahead of everything — the why-intro and the preset picker
  // both belong to the manual path, and showing either before this choice
  // would be asking them to start the thing they might not have picked.
  //
  // Guests and the pilot flow never see it: both are deliberately stripped
  // shells, and the interview needs an account to write to.
  // Owner: "when someone goes to edit their routine, a third option ... revert
  // to past routine." So this slide is no longer super-admin-only: anyone with
  // a past routine gets it. A first-time customizer still goes straight in —
  // there's nothing to go back to, and an extra slide offering nothing is just
  // friction. The "Ask me" row stays super-admin-gated below.
  // Prescribe mode gets the slide too — owner: "if I'm building a prayer
  // routine for someone else, the preset rhythm link in the admin tools, I want
  // to do it through the questionnaire." Only the interview and the manual path
  // are offered there; "go back to a past routine" is about the ADMIN's own
  // history, which has nothing to do with the person they're building for.
  /**
   * Owner: "combine the first two slides of the customizer, just put the past
   * routine option on the bottom of the second slide."
   *
   * The entry slide asked "how would you like to build it?" — a real question
   * while the interview was an option. With the interview hidden
   * (ROUTINE_INTERVIEW_ENTRY_HIDDEN) its only remaining rows were "I'll set it
   * up myself", which is just Continue by another name, and "go back to a past
   * routine", which has moved to the bottom of the intro slide. A slide whose
   * only real content lives somewhere else is a tap for nothing.
   *
   * So it survives ONLY where the interview genuinely is on offer — prescribe
   * mode, or a super admin with the flag flipped back on. Everyone else opens
   * straight into the intro.
   */
  const interviewOnOffer = isSuperAdmin && !ROUTINE_INTERVIEW_ENTRY_HIDDEN;
  /**
   * THE INTRO SLIDE, BACK FOR EVERYONE (owner: "i want an intro slide again
   * before we see the routine with the three options of edit your routine,
   * chose preset routine, and revert").
   *
   * It was gated on `interviewOnOffer` — super admins with the interview flag
   * on — so in practice nobody met it, which is why preset and revert had to
   * be found somewhere else (a ⚙ menu, then rows at the foot of the list).
   * They belong here: they are things you decide BEFORE reading your routine,
   * not footnotes after it.
   *
   * Waits for editLoaded so the Revert row can't pop in a beat late. While it
   * loads, showEntryChoice is false, which makes entrySettled true and hands
   * the screen to the existing "Finding your rhythm…" splash rather than a
   * flash of the wrong slide.
   */
  const showEntryChoice = prescribe
    ? isSuperAdmin && !guest && !pilot
    : !guest && !pilot && editLoaded;
  // "Ask me" is the stored default (owner), but it's only offered to super
  // admins — so for everyone else it resolves to the manual path rather than
  // leaving no row selected and a Continue that walks into a page they can't
  // use. Derived rather than initialised, because isSuperAdmin arrives from a
  // query: seeding the state from it would race, and a super admin who loaded
  // slowly would silently lose their default.
  const canRevert = hasRoutineHistory && !prescribe;
  const effectiveEntryChoice: "ask" | "manual" | "preset" | "revert" =
    entryChoice === "ask" && (!isSuperAdmin || ROUTINE_INTERVIEW_ENTRY_HIDDEN) ? "manual"
      : entryChoice === "revert" && !canRevert ? "manual"
        : entryChoice;
  /**
   * Manual path → "start from scratch" or "edit part of it".
   *
   * Sits after the entry chooser and before the first real slide. Skipped
   * entirely when there's nothing to edit (a first author, a guest, prescribe
   * mode), so a blank routine never gets asked which half of nothing to change.
   */
  const canEditParts = !guest && !prescribe && !pilot && editLoaded && editRows.length > 0;

  /** Where the gear on each row goes — the step that actually owns it. */
  const stepForRow = (id: string): Step | null => {
    // A side's SECOND practice opens its own step, not the anchor's.
    if (id === "extra:morning") return "morning-extra";
    if (id === "extra:evening") return "evening-extra";
    if (id === "side:morning") return "morning-way";
    if (id === "side:evening") return "evening-way";
    // Bare "contemplation" is the DAY's silence goal. "contemplation:<side>"
    // is that side's contemplative practice — of any kind. Lumping the two
    // sent the gear on "Evening Creation Prayer" to the silent-goal slide
    // (owner screenshot, 2026-08-26), where Save then wrote the whole rule
    // from a slide about a different practice.
    //
    // And it opens the SIDE'S FIRST slide, not the practice's details —
    // owner: "it needs to go to the first slide of the evening side if it's
    // the evening anchor … if it's creation prayer, I need to be able to
    // change it to evening office if I want." The practice IS that side's
    // anchor, so its gear behaves exactly like the side row's: the way slide,
    // where the anchor itself can be swapped, then on through the side's own
    // slides.
    /**
     * SILENCE OPENS SILENCE — not the picker of contemplative practices.
     *
     * Owner: "when i click silence, it goes to the general anchor
     * contemplation rather then that practice."
     *
     * This row IS a practice ("Silence · 60 min a day · with a timer"), and
     * the gear on a practice configures THAT practice. It used to open the
     * picker instead, under the older rule that a gear opens the first slide
     * of the ANCHOR it belongs to, with every option on it — which was right
     * while contemplation was a side's anchor and the gear's job was to let
     * you swap the anchor itself. Standing on its own, Silence has nothing to
     * swap: changing practice means taking this row off and adding the one you
     * want, and what the gear is for is how long, and how it's kept.
     *
     * "contemplation-goal" sits after "contemplative" in the flow, so opening
     * here means nothing further belongs to the row and the button reads Save
     * — the gear is a round trip to this practice's settings and back.
     */
    if (id === "contemplation") return "contemplation-goal";
    if (id.startsWith("contemplation:")) {
      return id.endsWith(":morning") ? "morning-way" : "evening-way";
    }
    if (id.startsWith("slot:")) return "contemplative";
    if (id.startsWith("card:")) return "learn";
    if (id.startsWith("custom:")) return "custom";
    return null;
  };

  /** Clear one practice from the customizer's own state. Committed like any
   *  other edit — on Continue — so it can still be backed out of. */
  const clearEditRow = (id: string) => {
    touchedRef.current = true;
    if (id === "extra:morning" || id === "extra:evening") {
      const side: OfficeSide = id === "extra:morning" ? "morning" : "evening";
      setExtraBySide((p) => ({ ...p, [side]: "" }));
      return;
    }
    if (id === "side:morning" || id === "side:evening") {
      const side: OfficeSide = id === "side:morning" ? "morning" : "evening";
      choosePrayBySide(side, "none");
      setContemplationBySide((p) => ({ ...p, [side]: false }));
    } else if (id.startsWith("contemplation:")) {
      // One SIDE's contemplative practice — not the whole day's silence.
      const side: OfficeSide = id.endsWith(":morning") ? "morning" : "evening";
      setContemplationBySide((p) => ({ ...p, [side]: false }));
      setContemplativeForm((p) => ({ ...p, [side]: null }));
    } else if (id === "contemplation") {
      setContemplationBySide({ morning: false, evening: false });
      chooseGoal("0");
    } else if (id.startsWith("slot:")) {
      const key = id.slice("slot:".length);
      // The row id uses the CARD key ("listening"); the contemplative state
      // calls that same practice "audio". Writing contemplative.listening set a
      // field commit() never reads, so deleting Audio Divina did nothing at all.
      const contemplativeKey = key === "listening" ? "audio" : key;
      setContemplative((c) => (contemplativeKey in c ? { ...c, [contemplativeKey]: false } : c));
      setExtras((e) => (key in e ? { ...e, [key]: false } : e));
      // Also clear the slot key itself. commit() never removes these, and both
      // the edit list and the interview's "your current routine" read them
      // straight from the rule-config — so a deleted walk came back on the next
      // visit even though its home card was hidden.
      try { localStorage.removeItem(`phoebe:slot:${key}`); } catch { /* private mode */ }
    } else if (id.startsWith("card:")) {
      setNewsletters((prev) => prev.filter((n) => n !== id.slice("card:".length)));
    } else if (id.startsWith("custom:")) {
      // One of their OWN standing practices. Now that these are listed here
      // (they weren't before), the ✕ has to actually take it off — dropping
      // the row alone would put it back on the next visit, since the list is
      // re-read from the server each time.
      removeCustomAnchor(id.slice("custom:".length));
    }
    setEditRows((prev) => prev.filter((r) => r.id !== id));
    setDeletingEditRow(null);
    /**
     * WRITE IT DOWN NOW — this list's removals were half-real. A custom
     * practice was removed immediately (tombstoned, pushed), the slot key was
     * removed immediately, while the office anchors / reflections / silence
     * goal only changed customizer STATE that commit() would write "when you
     * finish" — so leaving via the corner ✕ produced a TORN rule: the custom
     * half gone forever, the rest back on the next open. Same tick-deferred
     * commit as the review's ✕ (inline commit would capture pre-removal
     * state); now every removal is durable the moment the dialog closes,
     * whichever way the reader leaves.
     */
    setReviewEditTick((n) => n + 1);
  };

  // The manual path's own first question.
  // "The entry question is behind us" — either they answered it, or (now that
  // the entry slide is gone for everyone but the interview path) it was never
  // put. Without this the scratch/edit fork below became unreachable the
  // moment the entry slide stopped rendering, silently dropping "edit part of
  // it" for every returning user.
  const entrySettled = entryChoiceMade || !showEntryChoice;
  // Until this settles we don't yet know whether the fork ("What would you like
  // to do?") or the step machine owns the screen — and the step machine's first
  // slide is the intro, so the intro FLASHED for the length of the request
  // before the fork replaced it. Hold a quiet splash for that window instead.
  // Never `return null` here: a blank screen is the worse failure, and the
  // fetch above now carries a deadline so this can't become permanent.
  if (entrySettled && !guest && !prescribe && !pilot && !editLoaded) {
    return shell(
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, minHeight: "50vh" }}>
        <Spinner className="size-7" style={{ color: SAGE }} />
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, letterSpacing: "0.4px" }}>
          {t("wol_rule.loading_rule", { defaultValue: "Finding your rhythm…" })}
        </p>
      </div>,
    );
  }
  // "Start from a preset" — the four named rules as a list you can READ before
  // you take one (emoji, name, what it actually contains). Adopting replaces the
  // whole rhythm, so a tap opens a confirm rather than committing outright.
  if (entrySettled && canEditParts && manualMode === "preset") {
    // A GROUP's rule, being looked at before taking it up. Same shape as the
    // app-preset confirm below it — the difference is where the rows come from
    // (the stored spec, summarised the way the group page summarises it) and
    // what Adopt does (the group's own adopt endpoint; see adoptGroupRule).
    if (groupPending) {
      const spec = groupPendingRule?.rule?.spec ?? null;
      const lines = spec ? summarizeRuleSpec(spec) : [];
      return shell(
        <>
          {stepHeader(
            t("wol_rule.preset_group_eyebrow", { defaultValue: "A rhythm your group keeps" }),
            groupPendingRule?.rule?.label?.trim() || groupPending.name,
          )}
          <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 18px" }}>
            {t("wol_rule.preset_group_body", {
              name: groupPending.name,
              defaultValue: `Taking this up replaces your current rhythm with the one ${groupPending.name} keeps. You can change any part of it afterwards, and nothing you've already prayed is lost.`,
            })}
          </p>
          <div style={{ ...FROST_BLUR, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "14px 16px" }}>
            {lines.length > 0 ? lines.map((l) => (
              <p key={l} style={{ color: CREAM, fontSize: 14.5, fontFamily: FONT, lineHeight: 1.5, margin: "4px 0" }}>{l}</p>
            )) : (
              <p style={{ color: SAGE_DIM, fontSize: 14, fontFamily: FONT, margin: 0 }}>
                {t("common.loading", { defaultValue: "Loading…" })}
              </p>
            )}
          </div>
          {groupAdoptError && (
            <p style={{ color: "#E5A3A3", fontSize: 13.5, fontFamily: FONT, margin: "12px 0 0" }}>
              {t("wol_rule.preset_group_error", { defaultValue: "Couldn't take up that rhythm just now. Try again." })}
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
            <button
              type="button"
              onClick={adoptGroupRule}
              disabled={!spec || adoptingGroup}
              style={{
                background: "rgba(46,107,64,0.9)", border: "none", color: CREAM, borderRadius: 999,
                padding: "13px 18px", fontSize: 15.5, fontWeight: 700, fontFamily: FONT,
                cursor: !spec || adoptingGroup ? "default" : "pointer", opacity: !spec || adoptingGroup ? 0.6 : 1,
              }}
            >
              {adoptingGroup
                ? t("wol_rule.preset_group_adopting", { defaultValue: "Setting it up…" })
                : t("wol_rule.preset_adopt", { defaultValue: "Adopt this rhythm" })}
            </button>
            <button
              type="button"
              onClick={() => { setGroupPending(null); setGroupAdoptError(false); }}
              style={{
                background: "none", border: "none", color: SAGE_DIM, fontSize: 13.5,
                fontFamily: FONT, textDecoration: "underline", cursor: "pointer", padding: "6px 10px",
              }}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </>,
      );
    }
    const pending = presetPending ? RULE_PRESETS.find((p) => p.id === presetPending) ?? null : null;
    if (pending) {
      return shell(
        <>
          {stepHeader(
            t("wol_rule.preset_eyebrow", { defaultValue: "Start from a preset" }),
            pending.title ?? "",
          )}
          <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 18px" }}>
            {t("wol_rule.preset_confirm_body", {
              defaultValue: "Adopting this replaces your current rhythm with the one below. Nothing you've already prayed is lost, and you can change any part of it afterwards.",
            })}
          </p>
          <div style={{ ...FROST_BLUR, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "14px 16px" }}>
            {(pending.rows ?? []).map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                <span style={{ fontSize: 17, flexShrink: 0 }} aria-hidden>{r.emoji}</span>
                <span style={{ color: CREAM, fontSize: 14.5, fontFamily: FONT, lineHeight: 1.4 }}>{r.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
            <button
              type="button"
              // Leave the fork as well as the confirm: commit() ends on
              // setStep("done"), and THIS block returns above the step machine —
              // stay in manualMode "preset" and the review screen can never
              // render. "scratch" is the mode that falls through.
              onClick={() => { setPresetPending(null); setManualMode("scratch"); adoptRule(pending); }}
              style={{
                background: "rgba(46,107,64,0.9)", border: "none", color: CREAM, borderRadius: 999,
                padding: "13px 18px", fontSize: 15.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
              }}
            >
              {t("wol_rule.preset_adopt", { defaultValue: "Adopt this rhythm" })}
            </button>
            <button
              type="button"
              onClick={() => setPresetPending(null)}
              style={{
                background: "none", border: "none", color: SAGE_DIM, fontSize: 13.5,
                fontFamily: FONT, textDecoration: "underline", cursor: "pointer", padding: "6px 10px",
              }}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </>,
      );
    }
    return shell(
      <>
        {stepHeader(
          t("wol_rule.preset_eyebrow", { defaultValue: "Start from a preset" }),
          t("wol_rule.preset_title", { defaultValue: "A rhythm someone has already shaped" }),
        )}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.preset_body", {
            defaultValue: "Each of these is a complete daily rule, drawn from a real school of prayer. Take one whole and tune it later.",
          })}
        </p>
        {/* A way BACK to the three-door entry. The list used to be reached
            from a screen that stayed mounted behind it; as a first-class door
            it was a room with no exit — no Back anywhere on it, and the
            browser's own Back leaves the customizer entirely. */}
        <button
          type="button"
          onClick={goPrev}
          style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "2px 0 14px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: FONT }}
        >
          <ChevronLeft size={16} /> {t("ruleOfLife.back", { defaultValue: "Back" })}
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* YOUR GROUPS FIRST (owner). These are the rhythms people the
              reader has actually joined are already praying — the app's
              presets below are schools of prayer offered to anyone. Under
              their own eyebrow so it's clear whose they are, and named by the
              group rather than by the rule, because that's what makes them
              worth taking up. */}
          {groupRuleOffers.length > 0 && (
            <>
              <p style={{ color: SAGE_DIM, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: FONT, margin: "0 0 2px" }}>
                {t("wol_rule.preset_from_groups", { defaultValue: "From your groups" })}
              </p>
              {groupRuleOffers.map((g) => (
                <button
                  key={g.slug}
                  type="button"
                  onClick={() => { try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } })); } catch { /* ignore */ } setGroupPending({ slug: g.slug, name: g.name }); }}
                  style={{
                    ...FROST_BLUR,
                    background: CARD, border: `1px solid ${CARD_B_ACTIVE}`, color: CREAM, borderRadius: 14,
                    padding: "14px 16px", textAlign: "left", cursor: "pointer", width: "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 24, flexShrink: 0 }} aria-hidden>🕯️</span>
                    <span style={{ color: CREAM, fontSize: 16.5, fontWeight: 700, fontFamily: FONT }}>{g.name}</span>
                  </div>
                  <p style={{ color: SAGE, fontSize: 13.5, fontFamily: FONT, lineHeight: 1.5, margin: "8px 0 0" }}>
                    {g.label?.trim() || t("wol_rule.preset_group_blurb", { defaultValue: "The daily rhythm this group keeps together." })}
                  </p>
                </button>
              ))}
              <p style={{ color: SAGE_DIM, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: FONT, margin: "12px 0 2px" }}>
                {t("wol_rule.preset_from_phoebe", { defaultValue: "Schools of prayer" })}
              </p>
            </>
          )}
          {RULE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => { try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } })); } catch { /* ignore */ } setPresetPending(preset.id); }}
              style={{
                ...FROST_BLUR,
                background: CARD, border: `1px solid ${CARD_B}`, color: CREAM, borderRadius: 14,
                padding: "14px 16px", textAlign: "left", cursor: "pointer", width: "100%",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }} aria-hidden>{preset.emoji}</span>
                <span style={{ color: CREAM, fontSize: 16.5, fontWeight: 700, fontFamily: FONT }}>{preset.title}</span>
              </div>
              <p style={{ color: SAGE, fontSize: 13.5, fontFamily: FONT, lineHeight: 1.5, margin: "8px 0 0" }}>{preset.blurb}</p>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${CARD_B}` }}>
                {(preset.rows ?? []).map((r) => (
                  <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden>{r.emoji}</span>
                    <span style={{ color: SAGE_DIM, fontSize: 13, fontFamily: FONT, lineHeight: 1.4 }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      </>,
    );
  }

  // "Edit part of it" — the routine as a list, each row with a gear and an ✕,
  // the same shape the questionnaire's review uses (owner).
  if (entrySettled && canEditParts && manualMode === "edit") {
    /**
     * THE FLAT ROUTINE (owner, superseding the three-door entry): the
     * customizer opens on your routine as ONE reorderable list — every
     * practice a standalone row with a gear and a ✕, no slot headings —
     * because "there's no actual need to do morning and evening anchors now."
     * Sides survive underneath as plumbing (streak, widget, sync), but the
     * customizer stops asking about them: BCP practices carry Morning/Evening
     * inside their OWN settings, which is the one place the question is real.
     *
     * Add walks five categories; drag writes phoebe:routine-order, which the
     * home's Next list sorts by; "Next" closes on the notifications slide —
     * the light anchor system: what you're notified about, and when.
     */
    const circle: React.CSSProperties = {
      width: 30, height: 30, flexShrink: 0, borderRadius: 999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(255,255,255,0.06)", border: `1px solid ${CARD_B}`,
      color: SAGE, fontSize: 14, cursor: "pointer", padding: 0,
    };
    const sideFree = (sd: OfficeSide) => { const l = getExplicitSideLevel(sd); return l === null || l === "ask"; };
    const sideHolds = (sd: OfficeSide, lvl: OfficeLevel) => getExplicitSideLevel(sd) === lvl;
    const layoutNow = () => {
      const hl = user?.homeLayout as { order?: string[]; hidden?: string[] } | undefined;
      return { order: [...(hl?.order ?? [])], hidden: [...(hl?.hidden ?? [])] };
    };
    const unhideCard = (key: string) => {
      const l = layoutNow();
      if (!l.order.includes(key)) l.order.push(key);
      l.hidden = l.hidden.filter((k) => k !== key);
      cacheHomeLayoutLocalOnly({ order: l.order, hidden: l.hidden });
      void saveHomeLayout({ order: l.order, hidden: l.hidden });
    };
    const afterAdd = () => {
      touchedRef.current = true;
      setEntryPhase("list"); setAddCat(null);
      void reloadEditRows();
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    };
    /**
     * One catalogue drives both the menu and the fades. `inRoutine` is per
     * CONCRETE practice, not per family (owner: "if they've added Morning
     * Prayer and go to find Evening Prayer, that needs to be available") —
     * and a row that IS in the routine renders faded with "Already in your
     * routine" rather than vanishing, so the menu reads the same every time.
     */
    type AddItem = { key: string; emoji: string; name: string; inRoutine: () => boolean; blocked?: () => string | null; add: () => void };
    const sideItems = (lvl: OfficeLevel, nameM: string, nameE: string, emoji: string): AddItem[] =>
      (["morning", "evening"] as OfficeSide[]).map((sd) => ({
        key: `${lvl}:${sd}`, emoji, name: sd === "morning" ? nameM : nameE,
        inRoutine: () => sideHolds(sd, lvl) || getSideExtra(sd) === lvl,
        blocked: () => {
          if (sideFree(sd)) return null;
          /**
           * The office+devotion pairing rides the EXTRA seat (owner: "add the
           * devotion too… they wouldn't conflict") — but ONLY beside the full
           * Office. Completion is tracked per MODE, and psalms, readings and
           * guided prayer all complete as the side's devotion mode
           * (extraOfficeMode) — an extra whose mode collides with the anchor's
           * is suppressed by extraModesFor, so offering it here stored a row
           * the home could never show. Audited live: Morning Devotion beside
           * Morning Psalms sat in the edit list and never on the home — one
           * routine, two answers, which is the thing this app is not allowed
           * to do. Offer only what the home can render.
           */
          if (lvl === "devotion" && getExplicitSideLevel(sd) === "office" && getSideExtra(sd) == null) return null;
          return sd === "morning" ? "Morning already has a practice" : "Evening already has a practice";
        },
        add: () => {
          if (sideFree(sd)) setSideLevel(sd, lvl);
          else if (lvl === "devotion") setSideExtra(sd, "devotion");
          afterAdd();
        },
      }));
    const practiceItem = (key: SlottedPractice | "compline", emoji: string, name: string): AddItem => ({
      key: `practice:${key}`, emoji, name,
      inRoutine: () => homeCardOn(user?.homeLayout, key === "listening" ? "listening" : key),
      add: () => {
        unhideCard(key);
        if (key !== "compline") setPracticeSlot(key as SlottedPractice, "anytime");
        afterAdd();
      },
    });
    const reflectionItem = (src: "cac" | "fdd" | "ssje" | "vts", name: string): AddItem => ({
      key: `refl:${src}`, emoji: src === "vts" ? "🦩" : "📖", name,
      inRoutine: () => homeCardOn(user?.homeLayout, src),
      add: () => { unhideCard(src); afterAdd(); },
    });
    const CATALOG: Record<string, { title: string; emoji: string; sub: string; items: AddItem[] }> = {
      sgp: {
        title: "Simple Guided Prayer", emoji: "🙌🏽", sub: "Praise · Confession · Thanksgiving · Supplication.",
        items: sideItems("guided-prayer", "Morning Guided Prayer", "Evening Guided Prayer", "🙌🏽"),
      },
      bcp: {
        title: "Book of Common Prayer", emoji: "📖", sub: "The offices, the Psalter, and the daily devotions.",
        items: [
          ...sideItems("office", "Morning Prayer", "Evening Prayer", "🌅"),
          ...sideItems("devotion", "Morning Devotion", "Evening Devotion", "🕊️"),
          ...sideItems("psalms", "Morning Psalms", "Evening Psalms", "📜"),
          ...sideItems("readings", "Morning Scripture Readings", "Evening Scripture Readings", "📖"),
          practiceItem("compline", "🌙", "Compline"),
        ],
      },
      contemplative: {
        title: "Contemplative practices", emoji: "🕯️", sub: "Silence, or another way of being still with God.",
        items: [
          {
            key: "sit", emoji: "🕯️", name: "Contemplative Prayer",
            // Ask the ROUTINE, not the goal field: `goal` seeds to "5" as a
            // picker convenience, so goalMin > 0 read true for accounts with
            // NO sit at all — "Already in your routine" on a practice they'd
            // never added, with no way to add it. The rows the flat list
            // renders are the truth about what the routine holds.
            inRoutine: () => orderIds.some((id) => id === "contemplation" || id.startsWith("contemplation:")),
            add: () => { setEntryPhase("add-minutes"); },
          },
          practiceItem("cobreathe", "🌍", "Creation Prayer"),
          practiceItem("walk", "🚶🏽", "Contemplative Walk"),
          practiceItem("listening", "🎵", "Audio Divina"),
          practiceItem("visio", "🖼️", "Visio Divina"),
          practiceItem("examen", "🌗", "The Examen"),
        ],
      },
      reflections: {
        title: "Reflections", emoji: "📖", sub: "A daily word to read and carry.",
        items: [
          reflectionItem("cac", "CAC Daily Meditation"),
          reflectionItem("fdd", "Forward Day by Day"),
          reflectionItem("ssje", "SSJE — Brother, Give Us a Word"),
          reflectionItem("vts", "VTS Dean's Commentary"),
        ],
      },
      custom: {
        title: "Custom practice", emoji: "✍🏽", sub: "A practice of your own — named by you, kept with a tap.",
        items: [],
      },
    };
    const rowById = (id: string) => editRows.find((r) => r.id === id);
    // The Prayer List row orders the home card but isn't a nudge target —
    // the reminder must open a practice, and prayer-mode has its own entry.
    const notifyOptions = orderIds.filter((id) => id !== "slot:prayer-list").map((id) => rowById(id)).filter(Boolean) as typeof editRows;
    const saveNotify = () => {
      // Saving the routine ends today's one-day swaps — the same invariant
      // commit() and the light editor keep: an explicit save supersedes a
      // stand-in chosen this morning.
      clearSideDaySwap("morning");
      clearSideDaySwap("evening");
      try {
        localStorage.setItem("phoebe:notify-target:morning", notifyTarget.morning);
        localStorage.setItem("phoebe:notify-target:evening", notifyTarget.evening);
      } catch { /* private mode */ }
      pushRoutineConfig();
      if (user) apiRequest("PUT", "/api/me/office-prefs", {
        morning: reminderIsOn("morning") ? PRAY_REMINDER_PREF[prayBySide.morning] : "none",
        evening: reminderIsOn("evening") ? PRAY_REMINDER_PREF[prayBySide.evening] : "none",
        ...reminderTimeField("morning", reminderIsOn("morning"), timeBySide.morning),
        ...reminderTimeField("evening", reminderIsOn("evening"), timeBySide.evening),
      }).then(() => qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] })).catch(() => { /* best-effort */ });
      onDone();
    };

    // ── Notifications — the LAST slide, and the light anchor system ─────────
    if (entryPhase === "notify") {
      const block = (sd: OfficeSide, label: string) => (
        <div style={{ ...FROST_BLUR, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 16, padding: "15px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: CREAM, fontSize: 15.5, fontWeight: 700, fontFamily: FONT }}>{label}</span>
            <button
              type="button"
              onClick={() => { touchedRef.current = true; const now = reminderIsOn(sd); setReminderOnBySide((r) => ({ ...r, [sd]: !now })); }}
              aria-label={`${label} on or off`}
              style={{ width: 42, height: 24, borderRadius: 999, position: "relative", border: "none", cursor: "pointer", background: reminderIsOn(sd) ? "#2D5E3F" : "rgba(255,255,255,0.12)" }}
            >
              <span style={{ position: "absolute", top: 3, left: reminderIsOn(sd) ? 21 : 3, width: 18, height: 18, borderRadius: 999, background: CREAM, transition: "left 160ms ease" }} />
            </button>
          </div>
          {reminderIsOn(sd) && (
            <>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, color: SAGE, fontSize: 13.5, fontFamily: FONT }}>
                Opens
                <select
                  value={notifyTarget[sd]}
                  onChange={(e) => { touchedRef.current = true; setNotifyTarget((p) => ({ ...p, [sd]: e.target.value })); }}
                  style={{ background: "rgba(9,26,16,0.6)", color: CREAM, border: `1px solid ${CARD_B}`, borderRadius: 10, padding: "8px 10px", fontFamily: FONT, fontSize: 14, maxWidth: 210 }}
                >
                  {/* No "Your usual practice" option (owner) — the seed effect
                      above guarantees a concrete row is selected whenever the
                      routine has any. */}
                  {notifyOptions.map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.label}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, color: SAGE, fontSize: 13.5, fontFamily: FONT }}>
                At
                <input
                  type="time"
                  value={shownReminderTime(sd)}
                  onChange={(e) => { touchedRef.current = true; const v = e.target.value; setTimeBySide((p) => ({ ...p, [sd]: v })); saveReminderNow({ ...reminderOnBySide }, { ...timeBySide, [sd]: v }); }}
                  style={{ background: "rgba(9,26,16,0.6)", color: CREAM, border: `1px solid ${CARD_B}`, borderRadius: 10, padding: "7px 10px", fontFamily: FONT, fontSize: 14 }}
                />
              </label>
            </>
          )}
        </div>
      );
      return shell(
        <>
          {stepHeader(
            t("wol_rule.walk", { defaultValue: "Your daily rhythm of prayer" }),
            t("wol_rule.notify_title", { defaultValue: "Notifications" }),
          )}
          <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 18px" }}>
            {t("wol_rule.notify_body", { defaultValue: "Choose what each nudge opens, and when. This is the anchor of your day — everything else is yours to order." })}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {block("morning", "Morning notification")}
            {block("evening", "Evening notification")}
          </div>
          <div style={{ marginTop: 8 }}>
            {ctaButton(t("common.save", { defaultValue: "Save" }), saveNotify)}
          </div>
        </>,
      );
    }

    // ── Add: the five categories ────────────────────────────────────────────
    if (entryPhase === "add-cat") {
      return shell(
        <>
          {stepHeader(t("wol_rule.walk", { defaultValue: "Your daily rhythm of prayer" }), t("wol_rule.add_title", { defaultValue: "Add a practice" }))}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
            {(["sgp", "bcp", "contemplative", "reflections", "custom"] as const).map((cid) => menuRow(
              CATALOG[cid]!.emoji, CATALOG[cid]!.title, CATALOG[cid]!.sub,
              () => { if (cid === "custom") { setNewCustomName(""); setEntryPhase("add-custom"); } else { setAddCat(cid); setEntryPhase("add-items"); } },
            ))}
          </div>
          <button type="button" onClick={() => setEntryPhase("list")} style={{ marginTop: 18, background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "10px 12px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: FONT }}>
            <ChevronLeft size={16} /> {t("ruleOfLife.back", { defaultValue: "Back" })}
          </button>
        </>,
      );
    }
    if (entryPhase === "add-items" && addCat && addCat !== "custom") {
      const cat = CATALOG[addCat]!;
      return shell(
        <>
          {stepHeader(cat.title, t("wol_rule.add_pick", { defaultValue: "Choose one" }))}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
            {cat.items.map((it) => {
              const already = it.inRoutine();
              const blockReason = !already && it.blocked ? it.blocked() : null;
              const dead = already || !!blockReason;
              return (
                <button
                  key={it.key}
                  type="button"
                  disabled={dead}
                  onClick={() => { if (!dead) it.add(); }}
                  style={{
                    ...FROST_BLUR, background: CARD, border: `1px solid ${CARD_B}`, color: CREAM,
                    borderRadius: 14, padding: "13px 16px", textAlign: "left", width: "100%",
                    display: "flex", alignItems: "center", gap: 12,
                    opacity: dead ? 0.45 : 1, cursor: dead ? "default" : "pointer",
                  }}
                >
                  <span aria-hidden style={{ fontSize: 20, flexShrink: 0 }}>{it.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 600, fontFamily: FONT }}>{it.name}</span>
                    {(already || blockReason) && (
                      <span style={{ display: "block", color: SAGE_DIM, fontSize: 12, fontFamily: FONT, marginTop: 2 }}>
                        {already ? t("wol_rule.add_already", { defaultValue: "Already in your routine" }) : blockReason}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setEntryPhase("add-cat")} style={{ marginTop: 18, background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "10px 12px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: FONT }}>
            <ChevronLeft size={16} /> {t("ruleOfLife.back", { defaultValue: "Back" })}
          </button>
        </>,
      );
    }
    if (entryPhase === "add-minutes") {
      return shell(
        <>
          {stepHeader("Contemplative Prayer", t("wol_rule.add_sit_title", { defaultValue: "How long is your sit?" }))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
            {["5", "10", "15", "20", "30", "45", "60"].map((m) => (
              <button key={m} type="button" onClick={() => setSitMinutes(m)}
                style={{ flex: "1 0 28%", padding: "13px 0", borderRadius: 12, fontFamily: FONT, fontSize: 15, fontWeight: 600, cursor: "pointer",
                  background: sitMinutes === m ? "rgba(46,107,64,0.55)" : CARD, color: CREAM,
                  border: `1px solid ${sitMinutes === m ? CARD_B_ACTIVE : CARD_B}` }}>
                {m} min
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            {ctaButton(t("wol_rule.add_cta", { defaultValue: "Add to my routine" }), () => {
              const min = Math.max(1, Math.min(180, parseInt(sitMinutes, 10) || 10));
              chooseGoal(String(min));
              goalEngagedRef.current = true;
              if (user) apiRequest("PUT", "/api/me/office-prefs", { contemplationGoalMinutes: min, contemplationReminderEnabled: true })
                .then(() => qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] })).catch(() => { /* best-effort */ });
              afterAdd();
            })}
          </div>
        </>,
      );
    }
    if (entryPhase === "add-custom") {
      return shell(
        <>
          {stepHeader("Custom practice", t("wol_rule.add_custom_title", { defaultValue: "Name your practice" }))}
          <input
            type="text" value={newCustomName}
            onChange={(e) => setNewCustomName(e.target.value)}
            placeholder={t("wol_rule.cp_custom_placeholder", { defaultValue: "What do you call it?" })}
            maxLength={60} autoFocus
            style={{ width: "100%", boxSizing: "border-box", marginTop: 18, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none" }}
          />
          <div style={{ marginTop: 16 }}>
            {ctaButton(t("wol_rule.add_cta", { defaultValue: "Add to my routine" }), () => {
              const name = newCustomName.trim();
              if (!name) { setEntryPhase("list"); return; }
              addCustomAnchor(name, "🌿", "anytime");
              afterAdd();
            })}
          </div>
        </>,
      );
    }

    // ── The routine itself — one flat, drag-reorderable list ────────────────
    return shell(
      <>
        {stepHeader(
          t("wol_rule.walk", { defaultValue: "Your daily rhythm of prayer" }),
          t("wol_rule.manual_edit_title", { defaultValue: "Your rhythm" }),
        )}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 18px" }}>
          {/* No longer "drag to order your day" — the day orders itself from
              the order you actually open things (lib/practiceOrderLearning),
              so a drag here would move rows that nothing reads. Owner: "I have
              never seen this working on my account." */}
          {t("wol_rule.flat_body_no_order", { defaultValue: "The gear changes a practice; the ✕ takes it off." })}
        </p>
        {orderIds.length === 0 && (
          <p style={{ color: SAGE_DIM, fontSize: 14, fontFamily: FONT, lineHeight: 1.6, margin: "4px 0 10px" }}>
            {t("wol_rule.flat_empty", { defaultValue: "Nothing here yet — add your first practice below, or start from a preset." })}
          </p>
        )}
        {/* A plain list — the drag went with the manual order it wrote. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
          {orderIds.map((id, idx) => {
            const r = rowById(id);
            if (!r) return null;
            return (
              <FlatRoutineRow
                key={id} id={id} emoji={r.emoji} label={r.label} sub={r.sub} circle={circle}
                onGear={r.id !== "slot:prayer-list" && stepForRow(r.id) ? () => { const st = stepForRow(r.id); if (st) { setSingleEditRow(r.id); setManualMode("scratch"); setStep(st); } } : null}
                onRemove={r.id === "slot:prayer-list" ? null : () => setDeletingEditRow({ id: r.id, label: r.label })}
              />
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => { touchedRef.current = true; setEntryPhase("add-cat"); }}
          style={{ width: "100%", marginTop: 12, background: "transparent", border: `1px dashed ${CARD_B}`, borderRadius: 14, padding: "13px 16px", color: SAGE, fontSize: 14.5, fontFamily: FONT, cursor: "pointer" }}
        >
          {t("wol_rule.edit_add_practice", { defaultValue: "+ Add a practice" })}
        </button>
        {/* Preset + revert are on the INTRO slide now (owner), so the list
            body ends at Add a practice — one place to choose a whole different
            rhythm, reached before you read this one. */}
        {ctaButton(t("wol_rule.next_notifications", { defaultValue: "Next: notifications" }), () => setEntryPhase("notify"))}

        {deletingEditRow && (
          <div role="dialog" aria-modal="true" onClick={() => setDeletingEditRow(null)}
            style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(4,12,7,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 18, padding: 18, maxWidth: 380, width: "100%", boxSizing: "border-box" }}>
              <p style={{ color: CREAM, fontFamily: FONT, fontSize: 17, fontWeight: 700, margin: 0 }}>Remove {deletingEditRow.label}?</p>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, lineHeight: 1.55, margin: "8px 0 0" }}>It comes off your rhythm now. You can add it back any time.</p>
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button type="button" onClick={() => clearEditRow(deletingEditRow.id)} style={{ flex: 1, background: CTA, color: CREAM, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "12px 16px", fontSize: 14.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>Remove</button>
                <button type="button" onClick={() => setDeletingEditRow(null)} style={{ flex: 1, background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)", borderRadius: 12, padding: "12px 16px", fontSize: 14.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>Keep it</button>
              </div>
            </div>
          </div>
        )}
      </>,
    );
  }

  if (showEntryChoice && !entryChoiceMade) {
    return shell(
      <>
        {stepHeader(
          t("wol_rule.entry_eyebrow", { defaultValue: "Your daily rhythm of prayer" }),
          t("wol_rule.entry_title", { defaultValue: "How would you like to build it?" }),
        )}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.entry_body", {
            defaultValue: "Shape it yourself, or describe the practice you already keep and let Phoebe set it up to match.",
          })}
        </p>
        {/* Owner: "have being asked be the default." So it's PRE-SELECTED and
            listed first, and the slide gained a Continue — without one, a
            "default" would be decoration, since tapping a row was itself the
            action and nothing would happen unless you tapped. Now the default
            is operative: open the slide, press Continue, you're in the
            interview. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {interviewOnOffer && choiceRow(
            effectiveEntryChoice === "ask",
            prescribe
              ? `💬 ${t("wol_rule.entry_ask_prescribe", { defaultValue: "Describe their practice" })}`
              : `💬 ${t("wol_rule.entry_ask", { defaultValue: "Ask me about my practice" })}`,
            prescribe
              ? t("wol_rule.entry_ask_sub_prescribe", { defaultValue: "Describe how they already pray, and Phoebe builds the routine to match." })
              : t("wol_rule.entry_ask_sub", { defaultValue: "Describe how you already pray, in your own words, and Phoebe programs it for you." }),
            () => setEntryChoice("ask"),
          )}
          {choiceRow(
            effectiveEntryChoice === "manual",
            `✍🏽 ${t("wol_rule.entry_manual", { defaultValue: "Edit your routine" })}`,
            t("wol_rule.entry_manual_sub", { defaultValue: "Your day as it stands — reorder it, change a practice, take one off." }),
            () => setEntryChoice("manual"),
          )}
          {/* Adopting REPLACES the rhythm (the owner's own ruling), so this is
              a fork taken before you've read your routine, not a tweak to it —
              which is the argument for it living on this slide rather than at
              the foot of the list. */}
          {choiceRow(
            effectiveEntryChoice === "preset",
            `📋 ${t("wol_rule.entry3_preset", { defaultValue: "Choose a preset routine" })}`,
            t("wol_rule.entry3_preset_sub", { defaultValue: "Start from a rhythm someone else keeps." }),
            () => setEntryChoice("preset"),
          )}
          {/* Owner: "a third option where it says revert to past routine, and
              we have a backlog that saves routines." Changing a rule of life
              shouldn't be a one-way door — someone who tried a fuller rhythm
              and found it didn't fit needs the old one back, not a from-scratch
              rebuild from memory of what they used to pray. */}
          {canRevert && choiceRow(
            effectiveEntryChoice === "revert",
            `↩️ ${t("wol_rule.entry_revert", { defaultValue: "Go back to a past routine" })}`,
            t("wol_rule.entry_revert_sub", { defaultValue: "Restore a rhythm you kept before." }),
            () => setEntryChoice("revert"),
          )}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), () => {
          if (effectiveEntryChoice === "ask") {
            // Carry the way back, so the finished routine returns to the page
            // that will name it and mint the link.
            setLocation(prescribe
              ? `/routine-interview?prescribe=1&from=${encodeURIComponent(window.location.pathname)}`
              : "/routine-interview");
            return;
          }
          if (effectiveEntryChoice === "revert") { setLocation("/routine-history"); return; }
          // The preset list is a mode of the same flow, not another page: mark
          // the entry answered and switch modes, so Back from the list returns
          // here rather than leaving the customizer altogether.
          if (effectiveEntryChoice === "preset") { setPresetPending(null); setManualMode("preset"); setEntryChoiceMade(true); return; }
          /**
           * "Edit your routine" WALKS THE FLOW again (owner, restoring the
           * older customizer): when you pray → the morning practice → the
           * evening practice → the contemplative practices → the newsletters
           * → your own practices. It had been opening the single flat list
           * instead, which is the same rule seen all at once rather than
           * asked about a step at a time. The three-option entry above is
           * unchanged — edit, preset, revert (owner).
           */
          setManualMode("scratch");
          setStep("sides");
          setEntryChoiceMade(true);
        })}
      </>,
    );
  }

  if (showWhy) {
    return (
      <RhythmWhyIntro
        onDone={() => {
          try { localStorage.setItem("phoebe:rhythm-why-seen", "1"); } catch { /* ignore */ }
          setShowWhy(false);
        }}
      />
    );
  }

  // ── Contemplative practices — multi-select (pick any) ─────────────────────
  if (step === "contemplative") {
    // Creation Prayer is already offered per SIDE via the legacy
    // contemplationStyle mechanism (a returning user's saved
    // "cobreathe" style) — only offer it again here as a standalone extra
    // when NEITHER side already carries it, so a user with it as their
    // primary prayer doesn't see a confusing duplicate toggle.
    const creationAlreadyPrimary = (contemplationBySide.morning && sideIsCreation("morning"))
      || (contemplationBySide.evening && sideIsCreation("evening"));
    // Same reasoning for the Examen: since evening's "Simple Guided Prayer" row
    // now doubles as the Examen (see the morning/evening "way" step), a user who
    // reaches this step with evening set that way already has the Examen as
    // their evening prayer — offering it again here as an "additional" extra
    // would be a confusing duplicate toggle for the same practice.
    const examenAlreadyPrimary = prayBySide.morning === "examen" || prayBySide.evening === "examen";
    /**
     * A practice already kept as a side's ANCHOR isn't an option here.
     *
     * Reported: "when I got to contemplative practice some of the things that
     * were in my anchors were selected — if they are anchors or additional
     * they should not be options." Compline, the Examen and Creation Prayer
     * each had their own hand-written guard above; the Walk, Audio Divina and
     * Visio Divina had none, and they became anchor-able the moment the
     * contemplative slide started offering them. So a morning of Audio Divina
     * showed up here as a standing add-on the reader never asked for.
     *
     * Forced OFF as well as hidden, in the effect below — a row you can't see
     * must not still be carrying a `true` into commit(), which would put its
     * card on the home a second time.
     */
    const anchorForms = new Set(
      [contemplativeForm.morning, contemplativeForm.evening].filter(Boolean) as ContemplativeForm[],
    );
    const anchoredAsForm = (f: ContemplativeForm) => anchorForms.has(f);
    // Same reasoning again for Compline: it's offered on the evening "way"
    // step as a BCP anchor (after Office). Someone who chose it there already
    // prays Compline as their evening office — re-offering it here as an
    // "additional" practice would be a second toggle for the same office, and
    // (worse) would put a duplicate Compline card on the home next to the
    // evening anchor that already IS Compline.
    const complineAlreadyPrimary = prayBySide.evening === "compline" || prayBySide.morning === "compline";
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(t("wol_rule.contemplative_eyebrow", { defaultValue: "Return" }), t("wol_rule.contemplative_title", { defaultValue: "Choose a contemplative practice" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 20px" }}>
          {t("wol_rule.contemplative_body", { defaultValue: "Choose the contemplative practices for your day — each becomes its own card." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* First, and the one that leads to the Silence page. Turning it on
              seeds a goal so that page has something to open on; turning it off
              clears the goal AND both per-side sits, so the page it would have
              configured stops being asked. */}
          {choiceRow(
            wantsSilence,
            `🕯️ ${t("wol_rule.cp_silence", { defaultValue: "Contemplative Prayer" })}`,
            t("wol_rule.cp_silence_sub", { defaultValue: "Time set aside for silence." }),
            () => {
              touchedRef.current = true;
              if (wantsSilence) {
                chooseGoal("0");
                // Only the SILENT sides go with it. This used to zero both
                // sides, so switching silence off took the Evening Creation
                // Prayer down with it — a practice this row never named.
                setContemplationBySide((prev) => ({
                  morning: sideIsSilentSit("morning") ? false : prev.morning,
                  evening: sideIsSilentSit("evening") ? false : prev.evening,
                }));
                setContemplativeForm((prev) => ({
                  morning: sideIsSilentSit("morning") ? null : prev.morning,
                  evening: sideIsSilentSit("evening") ? null : prev.evening,
                }));
              } else {
                chooseGoal("20");
                chooseSilenceMode("fixed");
              }
            },
          )}
          {!complineAlreadyPrimary && choiceRow(contemplative.compline, `🌙 ${t("wol_rule.cp_compline", { defaultValue: "Compline" })}`, t("wol_rule.cp_compline_sub", { defaultValue: "The night office — available from 7pm." }), () => toggleContemplative("compline"))}
          {!anchoredAsForm("audio") && choiceRow(contemplative.audio, `🎵 ${t("wol_rule.cp_audio", { defaultValue: "Audio Divina" })}`, t("wol_rule.cp_audio_sub", { defaultValue: "Connecting with God through music." }), () => toggleContemplative("audio"))}
          {!examenAlreadyPrimary && choiceRow(contemplative.examen, `🌗 ${t("wol_rule.cp_examen", { defaultValue: "The Examen" })}`, t("wol_rule.cp_examen_sub", { defaultValue: "Review the day with God." }), () => toggleContemplative("examen"))}
          {!creationAlreadyPrimary && choiceRow(contemplative.cobreathe, `🌍 ${t("wol_rule.cp_cobreathe", { defaultValue: "Creation Prayer" })}`, t("wol_rule.cp_cobreathe_sub", { defaultValue: "Breathing together with God's creation" }), () => toggleContemplative("cobreathe"))}
          {!anchoredAsForm("walk") && choiceRow(contemplative.walk, `🚶🏽 ${t("wol_rule.cp_walk", { defaultValue: "Contemplative Walk" })}`, t("wol_rule.cp_walk_sub", { defaultValue: "A walk as prayer." }), () => toggleContemplative("walk"))}
          {!anchoredAsForm("visio") && choiceRow(contemplative.visio, `🖼️ ${t("wol_rule.cp_visio", { defaultValue: "Visio Divina" })}`, t("wol_rule.cp_visio_sub", { defaultValue: "Pray with an image — the day's artwork, slowly." }), () => toggleContemplative("visio"))}
          {/* Last, because it's the answer when none of the named ones is. */}
          {choiceRow(
            customPracticeOn,
            // Its OWN key. This row and the per-side "Create your own" anchor
            // row below both landed on wol_rule.cp_custom from two different
            // sessions — harmless only while the key is absent from en.ts and
            // each call site falls back to its own defaultValue. The moment it
            // were translated, two unrelated features would render the same
            // label.
            `✍🏽 ${t("wol_rule.cp_own_practice", { defaultValue: "Something of your own" })}`,
            t("wol_rule.cp_own_practice_sub", { defaultValue: "A practice you keep that isn't listed here." }),
            () => { touchedRef.current = true; setCustomPracticeOn((v) => !v); },
          )}
          {customPracticeOn && (
            <input
              type="text"
              value={customPracticeName}
              onChange={(e) => { touchedRef.current = true; setCustomPracticeName(e.target.value); }}
              placeholder={t("wol_rule.cp_custom_placeholder", { defaultValue: "What do you call it?" })}
              aria-label={t("wol_rule.cp_custom_label", { defaultValue: "Name your practice" })}
              maxLength={60}
              style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none" }}
            />
          )}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Silence — the daily-minutes goal (the silent sit). Reached ONLY when
  //    Contemplative Prayer was chosen on the step before it, so its two
  //    questions (how long, how logged) are always about a practice the reader
  //    has actually taken up.
  if (step === "contemplation-goal") {
    return shell(
      <>
        {backRow(goPrev)}
        {/* Owner: "the silence slide in the customizer should be contemplative
            prayer." That IS the practice this slide sizes — the app calls it
            Contemplative Prayer on the anchor slide, on the contemplative
            picker and on the home card, and "Silence" was the one place it
            went by a different name. */}
        {stepHeader(t("wol_rule.silence_eyebrow", { defaultValue: "Return" }), t("wol_rule.silence_title", { defaultValue: "Contemplative Prayer" }))}
        {/* Owner: say what's being asked before the picker, rather than
            leaving a bare dropdown under a one-word heading. */}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 18px" }}>
          {t("wol_rule.silence_ask", { defaultValue: "How much time would you like to spend in contemplative prayer throughout the day?" })}
        </p>
        {/* Just the fixed daily-minutes goal — the "grow toward 30" ladder option
            was removed (owner); everyone sets a fixed amount. */}
        <div style={{ position: "relative", marginTop: 24 }}>
          <select
            value={String(goalMin)}
            onChange={(e) => chooseGoal(e.target.value)}
            aria-label={t("wol_rule.silence_goal_label", { defaultValue: "Choose how much silence you'd like to practice each day." })}
            style={{ ...FROST_BLUR, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" as const, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
          >
            <option value="0">{t("wol_rule.silence_none", { defaultValue: "No daily goal" })}</option>
            {/* Preserve a previously-saved non-standard goal (e.g. 144) as an option. */}
            {goalMin > 0 && !GOAL_OPTIONS.includes(goalMin) && (
              <option value={String(goalMin)}>{t("wol_rule.n_min", { count: goalMin, defaultValue: `${goalMin} min` })}</option>
            )}
            {GOAL_OPTIONS.map((m) => (<option key={m} value={String(m)}>{t("wol_rule.n_min", { count: m, defaultValue: `${m} min` })}</option>))}
          </select>
          <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
        </div>
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "10px 0 0", lineHeight: 1.5 }}>
          {t("wol_rule.silence_goal_note", { defaultValue: "A gentle daily goal — reach it at your own pace. Choose 0 to keep silence in your rhythm without a set goal. It's never measured against you." })}
        </p>

        <p style={{ color: SAGE_DIM, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, fontFamily: FONT, margin: "24px 0 10px" }}>
          {t("wol_rule.log_method_label", { defaultValue: "Log method" })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {choiceRow(
            logMethod === "timer",
            `⏱️ ${t("wol_rule.log_method_timer", { defaultValue: "Timer" })}`,
            t("wol_rule.log_method_timer_sub", { defaultValue: "Sit with a countdown, tap Begin to start it." }),
            () => chooseLogMethod("timer"),
          )}
          {choiceRow(
            logMethod === "manual",
            `✅ ${t("wol_rule.log_method_manual", { defaultValue: "Manual log" })}`,
            t("wol_rule.log_method_manual_sub", { defaultValue: "No timer — tap the card to mark it done." }),
            () => chooseLogMethod("manual"),
          )}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Opening slide — what this flow is for, and nothing else ───────────────
  //
  // Owner: "this description is supposed to be an intro slide, not on the
  // morning page ... have it be in like glowing centred text, but sized
  // properly." It was riding on top of the morning picker, where it pushed the
  // actual question and the first two options below the fold — a paragraph
  // explaining the flow was the loudest thing on the slide where the flow's
  // first real choice is made. On its own slide it can be read once and left
  // behind.
  //
  // "Glowing" is a text-shadow, not a brighter colour: the type stays the same
  // cream everything else uses and the light comes off it, so it reads as lit
  // rather than as an alert. "Sized properly" is the other half — this is the
  // only thing on the slide, so it gets headline-ish type (clamped, so it does
  // not run to 30px on a phone and 30px on a tablet alike) instead of the 14.5
  // it had while squeezed into a card.
  if (step === "sides") {
    /**
     * THE OPENING QUESTION: which ends of the day are part of this rule.
     *
     * Restored per owner. A side could already be turned off implicitly, by
     * choosing nothing on its way slide, but nothing ever ASKED — so the flow
     * opened straight into "how would you like to pray in the morning?" for a
     * person who may not want a morning at all. Turning one off here skips its
     * slides entirely (buildSteps is computed from `sides`).
     */
    const row = (side: OfficeSide, label: string, sub: string) => {
      const on = sides[side];
      return (
        <button
          type="button"
          onClick={() => {
            touchedRef.current = true;
            setSides((prev) => {
              const next = { ...prev, [side]: !prev[side] };
              // Never leave the rule with no day at all — the flow has nothing
              // left to ask, and the home would have no anchor to lead with.
              return next.morning || next.evening ? next : prev;
            });
            // Turning a side back on re-arms its reminder, matching wayContinue.
            if (!on) setReminderOnBySide((r) => ({ ...r, [side]: true }));
          }}
          style={{
            width: "100%", textAlign: "left", cursor: "pointer",
            background: on ? "rgba(46,107,64,0.14)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${on ? CARD_B_ACTIVE : CARD_B}`,
            borderRadius: 16, padding: 16, display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 12, transition: "background 0.2s, border-color 0.2s",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: CREAM, fontFamily: FONT }}>{label}</span>
            <span style={{ display: "block", fontSize: 13, color: SAGE, fontFamily: FONT, marginTop: 3 }}>{sub}</span>
          </span>
          <span style={{ width: 46, height: 28, borderRadius: 999, flexShrink: 0, background: on ? CTA : "rgba(143,175,150,0.22)", position: "relative", transition: "background 0.2s" }}>
            <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: CREAM, transition: "left 0.2s" }} />
          </span>
        </button>
      );
    };
    return shell(
      <>
        {stepHeader(
          t("wol_rule.sides_eyebrow", { defaultValue: "Your day" }),
          t("wol_rule.sides_title", { defaultValue: "When will you pray?" }),
        )}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.sides_body", { defaultValue: "Keep a morning, an evening, or both. You can change this whenever you like." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {row("morning", t("wol_rule.sides_morning", { defaultValue: "Morning" }), t("wol_rule.sides_morning_sub", { defaultValue: "A practice to open the day" }))}
          {row("evening", t("wol_rule.sides_evening", { defaultValue: "Evening" }), t("wol_rule.sides_evening_sub", { defaultValue: "A practice to close it" }))}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  if (step === "intro") {
    return shell(
      <>
        {stepHeader("Before you begin", "Before you begin")}
        <div
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            textAlign: "center", padding: "8px 4px",
          }}
        >
          <p
            style={{
              color: CREAM, fontFamily: FONT,
              fontSize: "clamp(19px, 5.2vw, 24px)", lineHeight: 1.55,
              fontWeight: 500, margin: 0, maxWidth: "22em",
              // The glow. Two shadows: a tight warm one for the lit edge and a
              // wide faint one for the halo — a single large-radius shadow just
              // reads as blur.
              textShadow: "0 0 14px rgba(220,240,225,0.34), 0 0 42px rgba(140,200,160,0.20)",
            }}
          >
            {t("wol_rule.flow_intent", {
              defaultValue:
                "You'll be guided through picking a practice to centre your mornings around, one for your evenings, and a place for contemplation in your day. After that there's room to add whatever else you keep.",
            })}
          </p>
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Per-side WAY slide — titled "Morning" / "Evening" ─────────────────────
  if (step === "morning-way" || step === "evening-way") {
    const side: OfficeSide = step === "morning-way" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, cap)}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {/* Owner: "have the question be, how would you like to pray in the
              evening? Select one — select your method, or leave blank if you
              would like to not have a practice in the evening." The second
              sentence is doing real work now that the None row is gone: with
              nothing selected meaning "this side is off", that has to be said
              out loud or it's a hidden rule. */}
          {t("wol_rule.side_way_body", {
            side: cap.toLowerCase(),
            defaultValue: `How would you like to pray in the ${cap.toLowerCase()}? Select one — or leave it blank if you'd rather not have a practice in the ${cap.toLowerCase()}.`,
          })}
        </p>
        {/* SIMPLIFIED daily-prayer choice (owner): exactly two ways, single-select
            — the Book of Common Prayer (its type + medium chosen on the next
            slide) or Creation Prayer (the 12-breath practice, which REPLACES the
            office for this side). No Contemplative/Prayer List/FDD/Examen rows
            here anymore — contemplation is asked as its own goal-slide later in
            the flow, reflections are chosen on "learn", and Examen/other add-ons
            aren't offered in this flow. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Simple Guided Prayer leads the list (owner). On EVENING the row
              functions as the Examen — subtitle, label, and selected-level all
              follow the Examen — matching the same morning-PACT/evening-Examen
              pairing already shipped in the light /customize picker.

              Owner: call it THE EXAMEN, here and on the card. It was labelled
              "Simple Prayerful Reflection" to sit alongside "Simple Guided
              Prayer", but that named the row after its morning twin's shape
              rather than after the practice, so the thing you chose and the
              card you got called themselves different names. The card has
              always read "The Examen" (explicitLevelTitle); this is the side
              that was wrong. */}
          {/**
            * SIMPLE GUIDED PRAYER — both sides now (owner: "I want Simple
            * Guided to be an evening option too, not Examen, the PACT").
            *
            * The evening used to REPLACE this row with the Examen — one row
            * wearing two names, so choosing PACT in the evening was impossible
            * and the Examen had no row of its own. They're two practices, so
            * they're two rows, and the evening gets both.
            */}
          {(() => {
            const on = prayBySide[side] === "guidedPrayer";
            return choiceRow(
              on,
              `🙌🏽 ${t("wol_rule.pray_guided_prayer_label", { defaultValue: "Simple Guided Prayer" })}`,
              t("wol_rule.pray_guided_prayer_sub", { defaultValue: "Praise · Confession · Thanksgiving · Supplication" }),
              () => {
                // Tapping the selected row CLEARS it. Owner: "instead of a
                // 'none' card, let's just have it that if they don't click one
                // ... I can't unclick either of them." A side with nothing
                // chosen is a side that's off.
                if (on) { touchedRef.current = true; choosePrayBySide(side, "none"); return; }
                touchedRef.current = true;
                if (contemplationBySide[side]) toggleContemplationSide(side);
                choosePrayBySide(side, "guidedPrayer");
              },
            );
          })()}
          {/* THE EXAMEN — its own row, evening only: it's a review of the day
              behind you, which is not a thing to do at breakfast. */}
          {side === "evening" && (() => {
            const on = prayBySide[side] === "examen";
            return choiceRow(
              on,
              `🌗 ${t("rhythm.card_examen", { defaultValue: "The Examen" })}`,
              t("wol_rule.pray_examen_sub", { defaultValue: "Review the day with God." }),
              () => {
                if (on) { touchedRef.current = true; choosePrayBySide(side, "none"); return; }
                touchedRef.current = true;
                if (contemplationBySide[side]) toggleContemplationSide(side);
                choosePrayBySide(side, "examen");
              },
            );
          })()}
          {/* (The "Your Prayer List" row left this slide — owner, 2026-08-26:
              "take your prayer list out of the morning and evening side." The
              list is a standalone practice now; prayerListSlot is gone.) */}
          
          {(() => {
            // Use the SHARED helper, not a hand-inlined copy of its condition.
            // This line used to re-list offices/devotion/psalms itself and so
            // silently omitted "compline": someone whose evening prayer IS
            // Compline reopened the customizer to find the "With the Book of
            // Common Prayer" row showing nothing selected, even though that's
            // exactly what they'd chosen. One source of truth so the next form
            // added to bcpOnSide can't drift out of sync here again.
            const bcpOn = bcpOnSide(side);
            // Always the generic "three options" line here, even once a
            // specific form is picked — the form itself (Psalms/Devotion/
            // Office) is chosen on the NEXT slide, so collapsing this row's
            // subtitle down to just the selected form's description (as it
            // used to) hid that the other two are still available under
            // this same choice.
            const bcpSub = t("wol_rule.pray_bcp_sub", { defaultValue: "Prayer with the BCP — Psalms, Devotion, or the full Office." });
            return choiceRow(bcpOn, `📖 ${t("wol_rule.pray_bcp_label", { defaultValue: "With the Book of Common Prayer" })}`, bcpSub, () => {
              if (bcpOn) { touchedRef.current = true; choosePrayBySide(side, "none"); return; }
              touchedRef.current = true;
              // Selecting BCP replaces any per-side contemplation on this side
              // (silent Contemplation OR the Creation Prayer breath).
              if (contemplationBySide[side]) toggleContemplationSide(side);
              // Switching evening AWAY from Examen shouldn't leave the
              // Examen add-on toggle silently still "on" — it was only on
              // because Examen WAS this side's prayer; that implication
              // doesn't carry over to a different evening pick.
              if (side === "evening" && prayBySide[side] === "examen") setContemplative((c) => ({ ...c, examen: false }));
              choosePrayBySide(side, bcpForm[side]);
            });
          })()}
          {/* Contemplation — a silent sit as THIS side's prayer (same as the
              basic /customize "Contemplative Prayer"). Clears the office and
              rides the per-side contemplation slot with the "silent" style, so
              the home shows a Morning/Evening Contemplation card (the sit timer).
              Seeds the shared silence goal to 20 min (the day's total across the
              two sits) and this side's length to 10 — the "two sessions split
              the goal" default; both are adjustable on the next slides. */}
          {choiceRow(
            // Selected whenever this side keeps ANY contemplative practice —
            // not just the silent sit. Keying on the silent-sit flag meant
            // picking Walk from the dropdown un-selected the row that led you
            // there.
            contemplativeOnSide(side),
            `🕯️ ${t("wol_rule.cp_contemplation", { defaultValue: "Contemplative Practice" })}`,
            t("wol_rule.cp_contemplation_sub", { defaultValue: "Silence, or another contemplative practice like a walk." }),
            () => {
              // Reported: "I can't unclick contemplative." Turning it off is
              // the only way to say "no contemplative practice on this side",
              // and without it the row was a one-way door.
              if (contemplativeOnSide(side)) {
                touchedRef.current = true;
                setContemplativeForm((p) => ({ ...p, [side]: null }));
                if (contemplationBySide[side]) toggleContemplationSide(side);
                return;
              }
              touchedRef.current = true;
              if (side === "evening" && prayBySide[side] === "examen") setContemplative((c) => ({ ...c, examen: false }));
              choosePrayBySide(side, "none");
              /**
               * KEEP a practice this side already has.
               *
               * Reported: "it put contemplative prayer into evening even
               * though I had creation prayer as that, and it deleted creation
               * prayer." This line forced "prayer" unconditionally, so merely
               * TOUCHING the Contemplative Practice row — to look at it, to
               * reach the slide behind it — retyped an evening of Creation
               * Prayer as a silent sit, and the next Continue wrote that over
               * the real one.
               *
               * "prayer" is only the default for a side that has nothing yet.
               */
              setContemplativeForm((p) => ({ ...p, [side]: p[side] ?? "prayer" }));
              if (!contemplationBySide[side]) toggleContemplationSide(side);
              chooseContemplationStyle("silent");
              chooseSideMinutes(side, 10);
              // NO goal manufacture. This wrote chooseGoal("20") when the goal
              // was 0 — a per-side sit implying a daily quota, the exact
              // converse of the invariant this repo has now removed FOUR
              // times in the goal→sit direction. Invisible while the side
              // stayed silent (a silent side suppresses the goal card), then
              // a 20-minute Silence card nobody created appeared the moment
              // the side switched to a breath or a Visio. The sit is the sit;
              // the daily quota is its own choice on the Silence slide.
            },
          )}
          {/* A reflection as the morning prayer itself — morning only, above
              Create your own (owner). Owner: "where it
              says Forward Day by Day as a morning option, let's have that
              say Reflection." Choosing it also follows it as a daily
              reflection (see the "learn" step below), so it shows checked
              there too — same signal in both places. Unchecking it on
              "learn" later is fine; that step notes when it's still the
              morning practice even if unchecked as a reflection.
              The ANCHOR LEVEL underneath is still literally "fdd" — the only
              OfficeLevel that means "a reflection replaces the office here"
              (getSideLevel, DailyProgressBody's FddHomeCard, begin-prayer.tsx
              are all keyed on that exact string). Letting someone pick CAC or
              SSJE as the actual anchor — not just as one of the "learn" step's
              newsletter cards — needs a real OfficeLevel of its own (or a
              stored "which source" pref the home card reads), not a label
              change; flagged rather than guessed at. */}
          {side === "morning" && choiceRow(
            prayBySide[side] === "fdd",
            `📖 ${t("wol_rule.pray_fdd_label", { defaultValue: "Reflection" })}`,
            t("wol_rule.pray_fdd_sub", { defaultValue: "Today's meditation from Forward Movement." }),
            () => {
              if (prayBySide[side] === "fdd") { touchedRef.current = true; choosePrayBySide(side, "none"); return; }
              touchedRef.current = true;
              if (contemplationBySide[side]) toggleContemplationSide(side);
              choosePrayBySide(side, "fdd");
              setNewsletters((prev) => (prev.includes("fdd") ? prev : [...prev, "fdd"]));
            },
          )}
          {/* Create your own — name a practice of your own and it BECOMES this
              side's prayer (replaces the office, same as the choices above).
              A plain per-side anchor: no contemplation slot, no session page —
              the home card is just a tap-to-mark-done for whatever they name
              it, chosen on its own slide right after (morning/evening-custom)
              rather than an inline field here — full-flow/pilot only, like the
              BCP-form detail slide above. */}
          {!guest && choiceRow(
            /**
             * ONLY when the practice is genuinely their own.
             *
             * A walk, sacred listening and Visio Divina are stored as an
             * ownPractice side whose NAME resolves to a real practice — so
             * choosing Visio lit BOTH this row and Contemplative Practice, and
             * the anchor slide showed two selections when it is single-select.
             * A named practice belongs to the Contemplative Practice row; this
             * one is for a name only the person keeps.
             */
            prayBySide[side] === "ownPractice" && !anchorPracticeFor(customNameBySide[side]),
            `✨ ${t("wol_rule.cp_custom", { defaultValue: "Create your own" })}`,
            t("wol_rule.cp_custom_sub", { defaultValue: "Name a practice of your own." }),
            () => {
              if (prayBySide[side] === "ownPractice") { touchedRef.current = true; choosePrayBySide(side, "none"); return; }
              touchedRef.current = true;
              if (side === "evening" && prayBySide[side] === "examen") setContemplative((c) => ({ ...c, examen: false }));
              if (contemplationBySide[side]) toggleContemplationSide(side);
              choosePrayBySide(side, "ownPractice");
            },
          )}
        </div>

        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), () => wayContinue(side))}
      </>,
    );
  }

  // ── Per-side CUSTOM PRACTICE NAME slide — pick a common practice or type
  // your own. Its own slide (not inline on the way step) so a lone text field
  // has room to breathe above the keyboard instead of sitting under a list of
  // four other choiceRows.
  if (step === "morning-custom" || step === "evening-custom") {
    const side: OfficeSide = step === "morning-custom" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    // (The quick picks that used to sit under this field are gone — owner:
    // "on create your own, take the choose-a-practice out since those can be
    // chosen now on contemplative practice." Audio Divina, Creation Prayer and
    // the Contemplative Walk are all rows on the contemplative slide now, so
    // offering them here too was a second door to the same three practices —
    // and the one that arrived as a NAMED CUSTOM ANCHOR rather than as the
    // practice itself, which is not the same thing at all.)
    const current = customNameBySide[side];
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, t("wol_rule.cp_custom", { defaultValue: "Create your own" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.custom_name_body", { side: cap.toLowerCase(), defaultValue: `What will you pray in the ${cap.toLowerCase()}?` })}
        </p>
        <input
          value={current}
          onChange={(e) => {
            const v = e.target.value.slice(0, 40);
            touchedRef.current = true;
            setCustomNameBySide((p) => ({ ...p, [side]: v }));
            setSideCustomName(side, v);
          }}
          aria-label={t("wol_rule.cp_custom_name", { defaultValue: "Practice name" })}
          placeholder={t("wol_rule.cp_custom_placeholder", { defaultValue: "e.g. Walking prayer" })}
          style={{ width: "100%", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 14px", fontSize: 15, color: CREAM, fontFamily: FONT }}
        />
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Per-side CONFIG slide — default method / breath count ─────────────────
  // Reminder TIMES are no longer asked here (owner): they live in Settings →
  // Daily reminders, defaulting to 7am / 6pm. This slide only asks HOW you'll
  // pray (medium, or breath count for Creation Prayer).
  // ── The ADDITIONAL practice slide ─────────────────────────────────────────
  // Owner: "advance to a second slide that looks exactly like the first morning
  // picker slide but has a different top description, same options — except
  // they just couldn't choose morning office again, but they could choose
  // morning devotion."
  /**
   * Choosing one particular extra practice. Shared by the which-one slide and
   * by the top-level rows whose kind holds only one option, so both routes
   * behave identically — the toggle-off, the real practice being switched on,
   * and the newsletter's withdraw-on-clear.
   */
  const chooseExtra = (side: OfficeSide, e: ExtraPractice, cap: string) => {
    const title = e.title(cap);
    touchedRef.current = true;
    // Tapping the chosen one clears it — the same toggle the anchor rows use,
    // so "actually, nothing else" costs one tap.
    const turningOff = extraBySide[side] === title;
    setExtraBySide((p) => ({ ...p, [side]: turningOff ? null : title }));
    // …and turn the real practice on (or back off). Everything in this menu
    // except the office forms is a standing practice with its own card; the
    // picker used to only remember the NAME, which is how a chosen Audio
    // Divina became a checkbox called "Audio Divina" sitting next to the real
    // one.
    const on = !turningOff;
    /**
     * WITHDRAW WHAT THIS SIDE HAD BEFORE.
     *
     * Reported: "Contemplative Walk was selected which I did not have; Audio
     * Divina was also selected." `extraBySide[side]` holds ONE title, but
     * `contemplative` is a six-key set that only ever accumulated: tapping
     * Audio Divina and then Contemplative Walk left the name on the walk and
     * BOTH practice flags true. commit() then wrote both home cards, and the
     * next open seeded both back as chosen. Switching your mind quietly added
     * a practice instead of replacing one.
     *
     * The newsletter branch below already withdrew its own pick on toggle-off;
     * this is the same withdrawal for the practice branch, and for the
     * REPLACEMENT case the newsletter branch never had to handle.
     */
    const previous = extraBySide[side];
    if (previous && previous !== title) {
      const prevEntry = extraEntryFor(previous, cap);
      if (prevEntry?.maps.kind === "practice") {
        const prevKey = prevEntry.maps.key;
        setContemplative((p) => (p[prevKey] ? { ...p, [prevKey]: false } : p));
      } else if (prevEntry?.maps.kind === "contemplation") {
        setContemplationBySide((p) => ({ ...p, [side]: false }));
      } else if (prevEntry?.maps.kind === "newsletter") {
        const picked = extraNewsletterBySide[side];
        if (picked) setNewsletters((p) => p.filter((x) => x !== picked));
        setExtraNewsletterBySide((p) => ({ ...p, [side]: null }));
      }
    }
    if (e.maps.kind === "practice") {
      const key = e.maps.key;
      setContemplative((p) => ({ ...p, [key]: on }));
    } else if (e.maps.kind === "contemplation") {
      setContemplationBySide((p) => ({ ...p, [side]: on }));
    } else if (e.maps.kind === "newsletter") {
      // Nothing to add yet — WHICH newsletter is the next slide's question.
      // Turning the row back off has to withdraw whatever that slide already
      // picked, or an abandoned choice would stay on the home as a card
      // nobody asked for.
      if (!on) {
        const picked = extraNewsletterBySide[side];
        if (picked) setNewsletters((p) => p.filter((x) => x !== picked));
        setExtraNewsletterBySide((p) => ({ ...p, [side]: null }));
      }
    }
  };

  // TOP LEVEL — the kinds, not the twelve particulars (owner). Same shape as
  // the anchor's own first slide: pick a kind, then its detail slide.
  if (step === "morning-extra" || step === "evening-extra") {
    const side: OfficeSide = step === "morning-extra" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    const options = extraOptionsFor(side);
    const chosen = extraEntryFor(extraBySide[side], cap);
    // A kind with nothing left in it (its only practice IS the anchor) isn't
    // offered — an empty detail slide is worse than one fewer row.
    const groups = EXTRA_GROUPS.filter((g) => options.some((e) => e.group === g.id));
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, t("wol_rule.extra_title", { defaultValue: `Anything else in the ${cap.toLowerCase()}?` }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.extra_body", {
            side: cap.toLowerCase(),
            defaultValue: `A second practice you keep in the ${cap.toLowerCase()}, alongside the one above. It gets its own card — your ${cap.toLowerCase()} progress still follows the practice you chose first.`,
          })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {groups.map((g) => {
            const members = options.filter((e) => e.group === g.id);
            const single = members.length === 1 ? members[0]! : null;
            const isChosen = !!chosen && chosen.group === g.id;
            // A chosen kind names what was actually picked, so the top level
            // still says "Morning Psalms" rather than only "From the prayer
            // book" once you've been into it. A kind of ONE already carries
            // that name as its title, so it keeps its description instead of
            // repeating itself underneath.
            const sub = isChosen && chosen && !single ? chosen.title(cap) : (single ? single.sub : g.sub);
            return choiceRow(
              isChosen,
              `${g.emoji} ${single ? single.title(cap) : g.title}`,
              sub,
              () => {
                if (single) { chooseExtra(side, single, cap); setExtraGroupBySide((p) => ({ ...p, [side]: isChosen ? null : g.id })); return; }
                // More than one — open its slide, the way the anchor does.
                touchedRef.current = true;
                setExtraGroupBySide((p) => ({ ...p, [side]: g.id }));
                setStep(side === "morning" ? "morning-extra-pick" : "evening-extra-pick");
              },
            );
          })}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // WHICH ONE — the detail slide for a kind that holds several.
  if (step === "morning-extra-pick" || step === "evening-extra-pick") {
    const side: OfficeSide = step === "morning-extra-pick" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    const g = extraGroupBySide[side];
    const group = EXTRA_GROUPS.find((x) => x.id === g);
    const members = extraOptionsFor(side).filter((e) => e.group === g);
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, group?.title ?? cap)}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.extra_pick_body", { defaultValue: "Which one would you like to keep?" })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {members.map((e) => {
            const title = e.title(cap);
            return choiceRow(extraBySide[side] === title, `${e.emoji} ${title}`, e.sub, () => chooseExtra(side, e, cap));
          })}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  /**
   * WHICH LITURGY — the prayer book's own slide, back again.
   *
   * These options lived here as a standalone step, were merged into the config
   * slide as a dropdown ("I don't need a whole slide for the liturgy"), and the
   * owner has asked for the slide back: "let's do three slides again for both
   * BCP and also contemplative practice, where the second slide you choose your
   * practice, then the next slide is details." So a side is picked, then named,
   * then configured — the shape "Create your own" always had.
   *
   * Rows, not a dropdown, and each carries its second line (owner) — a list of
   * bare liturgy names asks the reader to already know what they are.
   */
  if (step === "morning-bcp" || step === "evening-bcp") {
    const side: OfficeSide = step === "morning-bcp" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    const base = (!pilot ? (["psalms", "readings", "devotion", "offices"] as const) : (["readings", "devotion", "offices"] as const));
    // Compline IS the night office — offering it as a morning form is nonsense.
    const forms: ReadonlyArray<"psalms" | "readings" | "devotion" | "offices" | "compline"> =
      side === "evening" ? [...base, "compline"] : base;
    const row = (form: (typeof forms)[number]) => {
      const label = form === "compline" ? t("wol_rule.pray_compline_label", { defaultValue: "Compline" })
        : form === "psalms" ? t("wol_rule.pray_psalms_label", { defaultValue: "Praying the Psalms" })
        : form === "readings" ? t("wol_rule.pray_readings_label", { defaultValue: "Daily Scripture Readings" })
        : form === "devotion" ? `${cap} ${t("wol_rule.devotion_word", { defaultValue: "Devotion" })}`
        : `${cap} ${t("wol_rule.office_word", { defaultValue: "Office" })}`;
      const emoji = form === "compline" ? "🌙" : form === "psalms" ? "📜" : form === "readings" ? "📰" : "📖";
      const sub = form === "compline" ? t("wol_rule.bcp_sub_compline", { defaultValue: "The night office — the day laid down before sleep." })
        : form === "psalms" ? t("wol_rule.bcp_sub_psalms", { defaultValue: "The psalms appointed for today, and nothing else." })
        : form === "readings" ? t("wol_rule.bcp_sub_readings", { defaultValue: "Today's appointed scripture, read on its own." })
        : form === "devotion" ? t("wol_rule.bcp_sub_devotion", { side: cap.toLowerCase(), defaultValue: `A short ${cap.toLowerCase()} devotion — a few minutes.` })
        : t("wol_rule.bcp_sub_office", { side: cap.toLowerCase(), defaultValue: `${cap} Prayer in full, from the Book of Common Prayer.` });
      return choiceRow(prayBySide[side] === form, `${emoji} ${label}`, sub, () => {
        touchedRef.current = true;
        setBcpForm((p) => ({ ...p, [side]: form }));
        choosePrayBySide(side, form);
      });
    };
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, t("wol_rule.bcp_form_body_short", { defaultValue: "Which liturgy?" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.bcp_form_body", { side: cap.toLowerCase(), defaultValue: `Which of the prayer book's ${cap.toLowerCase()} liturgies would you like to keep?` })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {forms.map((f) => row(f))}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  /**
   * WHICH CONTEMPLATIVE PRACTICE — the same slide, for the other kind.
   *
   * Owner: "contemplative practice is the different practices including
   * Visio." Compline and the Examen are deliberately NOT here — both are
   * choosable elsewhere (Compline under the prayer book, the Examen as its own
   * row on the anchor slide), and listing them twice made the same practice
   * reachable under two names.
   */
  if (step === "morning-contemplative" || step === "evening-contemplative") {
    const side: OfficeSide = step === "morning-contemplative" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    const forms = formsForSide(side);
    const meta = (f: ContemplativeForm): { emoji: string; label: string; sub: string } =>
      f === "prayer" ? { emoji: "🕯️", label: t("wol_rule.cf_prayer", { defaultValue: "Contemplative Prayer" }), sub: t("wol_rule.cf_prayer_sub", { defaultValue: "Time set aside for silence." }) }
      : f === "creation" ? { emoji: "🌍", label: t("wol_rule.cf_creation", { defaultValue: "Creation Prayer" }), sub: t("wol_rule.cf_creation_sub", { defaultValue: "Breathing with creation, at one shared pace." }) }
      : f === "walk" ? { emoji: "🚶🏽", label: t("wol_rule.cf_walk", { defaultValue: "Contemplative Walk" }), sub: t("wol_rule.cf_walk_sub", { defaultValue: "A walk kept as prayer, attentive to what's around you." }) }
      : f === "audio" ? { emoji: "🎵", label: t("wol_rule.cf_audio", { defaultValue: "Audio Divina" }), sub: t("wol_rule.cf_audio_sub", { defaultValue: "Connecting with God through music." }) }
      : { emoji: "🖼️", label: t("wol_rule.cf_visio", { defaultValue: "Visio Divina" }), sub: t("wol_rule.cf_visio_sub", { defaultValue: "Pray with an image — the day's artwork, slowly." }) };
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, t("wol_rule.contemplative_form_label", { defaultValue: "Which practice?" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.contemplative_form_body", { side: cap.toLowerCase(), defaultValue: `Contemplative prayer is a family, not one thing. Which one will you keep in the ${cap.toLowerCase()}?` })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {forms.map((f) => {
            const m = meta(f);
            return choiceRow(contemplativeForm[side] === f, `${m.emoji} ${m.label}`, m.sub, () => {
                  touchedRef.current = true;
                  setContemplativeForm((p) => ({ ...p, [side]: f }));
                  // One contemplative practice per side: the two per-side forms
                  // (the silent sit / the Creation Prayer breath) ride
                  // contemplationBySide + the style flag; the rest are standing
                  // all-day practices, so choosing one turns the per-side sit
                  // OFF and that practice ON.
                  const perSide = f === "prayer" || f === "creation";
                  if (perSide) {
                    if (!contemplationBySide[side]) toggleContemplationSide(side);
                    // THIS side's kind — and the global stays in step for the
                    // side-less surfaces (see setSideContemplationKind).
                    setSideContemplationKind(side, f === "creation" ? "creation" : "silent");
                    chooseContemplationStyle(f === "creation" ? "cobreathe" : "silent");
                    if (f === "prayer") {
                      chooseSideMinutes(side, 10);
                      // No goal manufacture — see the way slide's note: a
                      // per-side sit never implies a daily quota.
                    }
                  } else {
                    /**
                     * A walk, sacred listening or Visio Divina AS THIS SIDE'S
                     * PRACTICE — stored as this side's CONTEMPLATION with its
                     * own kind, exactly like the sit and the breath.
                     *
                     * Owner: "it's not a custom practice/name in the first
                     * place... it's obviously not recognising Visio Divina as
                     * an actual contemplative practice." It used to be written
                     * as an `ownPractice` side with the practice's NAME typed
                     * into the custom-name field — so the flow went on to ask
                     * "Create your own: what will you pray in the evening?"
                     * with "Visio Divina" pre-filled, a question nobody asked
                     * and an answer nobody typed, and re-opening the routine
                     * read it back as a practice of the reader's own making.
                     * These are the app's own practices. They live in the
                     * kind.
                     */
                    choosePrayBySide(side, "none");
                    if (!contemplationBySide[side]) toggleContemplationSide(side);
                    setSideContemplationKind(side, f);
                    setContemplativeForm((p2) => ({ ...p2, [side]: f }));
                    // …and NOT also a standing all-day card.
                    setContemplative((c) => (c[f] ? { ...c, [f]: false } : c));
                  }
            });
          })}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  if (step === "morning-config" || step === "evening-config") {
    const side: OfficeSide = step === "morning-config" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    const isIntercessions = prayBySide[side] === "community";
    const method = isIntercessions ? "read" : methodBySide[side];
    // FDD / Psalms have no office "way to pray" method — they open their own
    // card — and a side with NO office anchor ("none": contemplation/examen only)
    // has no method either. (Silent-sit length is set on the dedicated
    // contemplation-goal step, not here — contemplation is no longer a side anchor.)
    const noMethod = prayBySide[side] === "none" || prayBySide[side] === "fdd" || prayBySide[side] === "readings" || prayBySide[side] === "psalms" || prayBySide[side] === "creation" || prayBySide[side] === "guidedPrayer" || prayBySide[side] === "ownPractice";
    // Creation Prayer side → the length question is a BREATHS preset, not a
    // silent-sit's minutes (owner: "it should not be minutes but the preset
    // for breaths").
    const isCobreatheSide = contemplationBySide[side] && sideIsCreation(side);
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, cap)}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {prayBySide[side] === "psalms"
            ? t("wol_rule.side_config_psalms_body_notime", { side: cap.toLowerCase(), defaultValue: `Choose how the Psalter unfolds in the ${cap.toLowerCase()}.` })
            : isCobreatheSide
              ? t("wol_rule.side_config_breaths_body", { side: cap.toLowerCase(), defaultValue: `How many breaths would you like each ${cap.toLowerCase()}?` })
              : noMethod
                ? t("wol_rule.side_config_plain_body", { side: cap.toLowerCase(), defaultValue: `Set up your ${cap.toLowerCase()} prayer.` })
                : t("wol_rule.side_config_body_notime", { side: cap.toLowerCase(), defaultValue: `How would you like to pray in the ${cap.toLowerCase()}?` })}
        </p>
        {/* Contemplative Prayer needs two more answers, and they are two
            DIFFERENT questions (owner): how long this side's sit is, and
            whether it's kept with a timer or just marked done.

            HOW LONG is per SIDE — never inferred from the daily goal. That
            inference (a 90-minute goal quietly becoming two 45-minute sits, or
            a goal implying a sit on a side that never asked for one) has been
            removed from this file twice before; the length lives here, on the
            side that owns it, and the daily goal stays its own separate thing
            on the Silence slide.

            Only for the silent sit: Creation Prayer counts in breaths (its own
            control below), and a walk or Audio Divina has no length to set. */}
        {contemplativeForm[side] === "prayer" && (
          <>
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px", fontFamily: FONT }}>
              {t("wol_rule.sit_length_label", { defaultValue: "How long?" })}
            </p>
            <div style={{ position: "relative", marginBottom: 22 }}>
              <select
                value={String(minutesBySide[side])}
                onChange={(e) => chooseSideMinutes(side, parseInt(e.target.value, 10) || 10)}
                aria-label={t("wol_rule.sit_length_label", { defaultValue: "How long?" })}
                style={{ ...FROST_BLUR, width: "100%", boxSizing: "border-box" as const, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
              >
                {/* Keep a previously-saved non-standard length selectable. */}
                {!SIT_LENGTHS.includes(minutesBySide[side]) && (
                  <option value={String(minutesBySide[side])}>{t("wol_rule.n_min", { count: minutesBySide[side], defaultValue: `${minutesBySide[side]} min` })}</option>
                )}
                {SIT_LENGTHS.map((m) => (
                  <option key={m} value={String(m)}>{t("wol_rule.n_min", { count: m, defaultValue: `${m} min` })}</option>
                ))}
              </select>
              <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
            </div>

            {/* The second, separate question: how it's kept. Same two options
                the Silence slide offers — this is that one setting, surfaced
                where the practice is actually being set up, so it can be
                answered without waiting for a later slide. */}
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px", fontFamily: FONT }}>
              {t("wol_rule.log_method_label", { defaultValue: "Log method" })}
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
              {([
                { id: "timer" as const, emoji: "⏱️", label: t("wol_rule.log_method_timer", { defaultValue: "Timer" }) },
                { id: "manual" as const, emoji: "✅", label: t("wol_rule.log_method_manual", { defaultValue: "Manual log" }) },
              ]).map((o) => {
                const on = logMethod === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => chooseLogMethod(o.id)}
                    style={{
                      flex: 1, borderRadius: 12, padding: "12px 10px", cursor: "pointer",
                      background: on ? CARD_ACTIVE : CARD,
                      border: `1px solid ${on ? CARD_B_ACTIVE : CARD_B}`,
                      color: on ? CREAM : SAGE, fontFamily: FONT, fontSize: 14, fontWeight: 600,
                    }}
                  >
                    <span aria-hidden>{o.emoji}</span> {o.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {/* Contemplation / FDD / Psalms have no on-screen/listen/book method,
            so the "Default way to pray" picker is hidden for them — only the
            reminder time below is shown. */}
        {!noMethod && (
          <>
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px", fontFamily: FONT }}>
              {t("wol_rule.method_label", { defaultValue: "Default way to pray" })}
            </p>
            <div style={{ position: "relative" }}>
              <select
                value={method}
                onChange={(e) => chooseMethodBySide(side, e.target.value as DefaultOfficeEntry)}
                disabled={isIntercessions}
                aria-label={t("wol_rule.method_label", { defaultValue: "Default way to pray" })}
                style={{ width: "100%", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none", opacity: isIntercessions ? 0.6 : 1 }}
              >
                {isIntercessions ? (
                  <option value="read">📖 {t("wol_rule.method_screen", { defaultValue: "Digital Slideshow" })}</option>
                ) : (
                  <>
                    <option value="book">📕 {t("wol_rule.method_book", { defaultValue: "Physical BCP" })}</option>
                    <option value="read">📖 {t("wol_rule.method_screen", { defaultValue: "Digital Slideshow" })}</option>
                    {/* Owner: "the third option in the dropdowns after digital
                        slideshow... Venite Digital." Hands the office off to
                        venite.app in the browser. Not pilot-reachable (leaves
                        the app), same as Listen/Watch below. */}
                    {!pilot && <option value="venite">🕊️ {t("wol_rule.method_venite", { defaultValue: "Venite Digital" })}</option>}
                    {/* Listen/Watch route the office CTA to /podcast/* and
                        /ncmp/watch, which aren't pilot-reachable — text office only. */}
                    {!pilot && <option value="listen">🎧 {t("wol_rule.method_listen", { defaultValue: "Listen" })}</option>}
                    {side === "morning" && !pilot && <option value="watch">📺 {t("wol_rule.method_watch", { defaultValue: "Watch" })}</option>}
                  </>
                )}
              </select>
              <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
            </div>
          </>
        )}
        {/* Praying the Psalms — choose the cycle right here (combined with the
            reminder), shown on EACH Psalms side. The cycle is shared: set it
            once and it applies wherever you pray the Psalms (morning + evening). */}
        {/* WHICH reflection, when a reflection is this side's anchor.
            Owner: "on the detail page they could pick any of the three."
            The anchor LEVEL is the single sentinel "fdd" whichever source is
            picked (see the Reflection row on the way-step); this is where the
            source itself is chosen, stored per side via setSideReflection on
            commit and read back by begin-prayer + useRhythmState. Without it
            the row silently always meant Forward Day by Day. */}
        {prayBySide[side] === "fdd" && (
          <>
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px", fontFamily: FONT }}>
              {t("wol_rule.reflection_which", { defaultValue: "Which reflection?" })}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
              {NEWSLETTERS
                .filter((n) => n.id !== "vts" || entitlements.vts || newsletters.includes("vts"))
                .map((n) => choiceRow(
                  (anchorReflectionBySide[side] ?? getSideReflectionExplicit(side) ?? "fdd") === n.id,
                  n.label,
                  n.sub,
                  () => {
                    touchedRef.current = true;
                    // THIS SIDE's source, and only that. It used to move the
                    // choice to the head of `newsletters` — the followed
                    // reflection CARDS — which both mis-read the current
                    // answer (showing whatever card happened to be first) and
                    // handed the reader a duplicate daily card for a source
                    // they'd only chosen as their morning prayer.
                    setAnchorReflectionBySide((prev) => ({ ...prev, [side]: n.id }));
                  },
                ))}
            </div>
          </>
        )}
        {prayBySide[side] === "psalms" && (
          <>
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px", fontFamily: FONT }}>
              {t("wol_rule.psalms_cycle_title", { defaultValue: "Which cycle?" })}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 4 }}>
              {choiceRow(psalmCycle === "office", `📖 ${t("wol_rule.psalms_office_label", { defaultValue: "In step with the office" })}`, t("wol_rule.psalms_office_sub", { defaultValue: "The psalms appointed in the daily office — about 2–3 a day." }), () => choosePsalmCycle("office"))}
              {choiceRow(psalmCycle === "monthly", `📜 ${t("wol_rule.psalms_monthly_label", { defaultValue: "The whole Psalter, monthly" })}`, t("wol_rule.psalms_monthly_sub", { defaultValue: "All 150 psalms across a month — fuller, more psalms a day (about 5)." }), () => choosePsalmCycle("monthly"))}
            </div>
          </>
        )}
        {/* The per-side "How long is your sit?" row USED to live here. Owner:
            "we never want 'how long is your sit' in the same slide with the
            evening office — take that row out."

            It was the last place the app still treated silence as a property
            of a side rather than a rhythm of its own. Sitting under the office
            dropdowns it also read as part of the office, which is how a
            whole-day quota kept coming back as two per-side sits. The daily
            amount is set once, on the Silence slide.

            The BREATH count stays. It isn't a sit length — Creation Prayer is
            counted in breaths, has no daily-minutes goal to inherit from the
            Silence slide, and this is its only home. Removing the whole block
            took it out along with the minutes row, which left a Creation
            Prayer side with no way to change its length at all. */}
        {isCobreatheSide && (
          <>
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "22px 0 10px", fontFamily: FONT }}>
              {t("wol_rule.cobreathe_length_label", { defaultValue: "How many breaths?" })}
            </p>
            <div style={{ position: "relative", marginBottom: 4 }}>
              <select
                value={String(cobreatheBreaths)}
                onChange={(e) => chooseCobreatheBreaths(side, parseInt(e.target.value, 10) || 12)}
                aria-label={t("wol_rule.cobreathe_length_label", { defaultValue: "How many breaths?" })}
                style={{ ...FROST_BLUR, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" as const, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
              >
                {COBREATHE_LENGTHS.map((n) => (
                  <option key={n} value={String(n)}>{t("wol_rule.n_breaths", { count: n, defaultValue: `${n} breaths` })}</option>
                ))}
              </select>
              <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
            </div>
          </>
        )}
        {/* Space above the reminder. Removing the per-side sit row left this
            card butted straight against the format dropdown, reading as part
            of the same group when it's a different question. */}
        <div style={{ height: 18 }} aria-hidden />
        {/* Owner: "combine the reminder on or off into one line, and if it is
            off hide the time." One switch row instead of two mutually
            exclusive choice rows — on/off is a binary, and rendering it as two
            selectable cards (with the time wedged between them) made the time
            field look like it belonged to whichever row sat above it. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, maxWidth: "100%" }}>
          <button
            type="button"
            onClick={() => {
              touchedRef.current = true;
              const now = reminderIsOn(side);
              setReminderOnBySide((r) => {
                const next = { ...r, [side]: !now };
                saveReminderNow(next, timeBySide);
                return next;
              });
            }}
            style={{
              width: "100%", textAlign: "left", cursor: "pointer",
              background: reminderIsOn(side) ? "rgba(46,107,64,0.14)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${reminderIsOn(side) ? CARD_B_ACTIVE : CARD_B}`,
              borderRadius: 16, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              transition: "background 0.2s, border-color 0.2s",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: CREAM, fontFamily: FONT, margin: 0 }}>
                {`🔔 ${t("wol_rule.reminder_on", { defaultValue: "Remind me" })}`}
              </p>
              <p style={{ fontSize: 13, color: SAGE, fontFamily: FONT, margin: "3px 0 0" }}>
                {reminderIsOn(side)
                  ? t("wol_rule.reminder_on_sub", { side: cap.toLowerCase(), defaultValue: `A gentle nudge to pray in the ${cap.toLowerCase()}.` })
                  : t("wol_rule.reminder_off_sub", { defaultValue: "No daily nudge — pray when you like." })}
              </p>
            </div>
            <span style={{ width: 46, height: 28, borderRadius: 999, flexShrink: 0, background: reminderIsOn(side) ? CTA : "rgba(143,175,150,0.22)", position: "relative", transition: "background 0.2s" }}>
              <span style={{ position: "absolute", top: 3, left: reminderIsOn(side) ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: CREAM, transition: "left 0.2s" }} />
            </span>
          </button>
          {reminderIsOn(side) && (
            // Width constraints on the WRAPPER as well — see the twin of this
            // row in routine-interview.tsx.
            <div style={{ position: "relative", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
              {/**
                * A real dropdown, not <input type="time"> (owner: "the time is
                * not a dropdown"). Every other control on this slide is a
                * select, and the native time input behaved differently on every
                * platform — it was also the thing that overflowed the slide on
                * iOS, which gives it an intrinsic width from its own control
                * that ignores width:100%. A select can't half-type a value
                * either, so the partial-HH:MM guard this used to need is gone.
                *
                * Quarter-hours across the day, plus the current value if it
                * happens to sit off that grid, so an existing reminder is never
                * silently moved.
                */}
              <select
                value={shownReminderTime(side)}
                onChange={(e) => {
                  touchedRef.current = true;
                  const v = e.target.value;
                  setTimeBySide((tv) => {
                    const next = { ...tv, [side]: v };
                    saveReminderNow(reminderOnBySide, next);
                    return next;
                  });
                }}
                aria-label={t("wol_rule.reminder_time", { defaultValue: "Reminder time" })}
                style={{ ...FROST_BLUR, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
              >
                {reminderTimeOptions(shownReminderTime(side)).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {/* The picker affordance, matching the dropdowns above it. */}
              <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
            </div>
          )}
        </div>
        {/* A SECOND practice for this side — on the CONFIG slide, not the one
            before it (owner). The first slide is where the anchor gets chosen;
            an "add another" button sitting under those options competed with
            that single decision. Here the anchor is already settled and this
            page is where the rest of the side is set up, so it reads as the
            next thing rather than an alternative to the last one.

            (owner, on the model). Not an anchor: it becomes a
            card of its own in this side's slot, and the weekly progress row
            keeps reading the anchor above. The side's own choice is filtered
            out — offering "Morning Devotion" to someone whose anchor already
            IS the devotion would just duplicate it. */}
        <div style={{ marginTop: 18, minWidth: 0, maxWidth: "100%" }}>
          {/* Owner: "the secondary practice needs an eyebrow." Every other
              group on this slide is labelled ("Which reflection?", "Which
              liturgy?"), so an unlabelled row read as a stray control rather
              than an answer to a question. */}
          <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px", fontFamily: FONT }}>
            {t("wol_rule.extra_eyebrow_label", { defaultValue: "Additional practice" })}
          </p>
          {extraBySide[side] ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px" }}>
              <span aria-hidden style={{ fontSize: 18 }}>{EXTRA_PRACTICE_EMOJI[extraBySide[side]!] ?? "🌿"}</span>
              <span style={{ flex: 1, minWidth: 0, color: CREAM, fontSize: 15, fontFamily: FONT }}>{extraBySide[side]}</span>
              <button
                type="button"
                // Route the ✕ through chooseExtra's own toggle-off rather than
                // poking the name to null — clearing the NAME alone left the
                // practice's flag on, and commit() then wrote its home card
                // for a second practice the reader had just removed.
                onClick={() => {
                  const current = extraEntryFor(extraBySide[side], cap);
                  if (current) chooseExtra(side, current, cap);
                  else { touchedRef.current = true; setExtraBySide((p) => ({ ...p, [side]: null })); }
                }}
                aria-label={`Remove ${extraBySide[side]}`}
                style={{ background: "none", border: "none", color: SAGE, fontSize: 15, cursor: "pointer", padding: "2px 6px" }}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                touchedRef.current = true;
                // Opt this side into the extra slide, then walk to it. The step
                // list is rebuilt from extraWantedBySide, so goNext would read
                // a stale list — jump directly.
                setExtraWantedBySide((p) => ({ ...p, [side]: true }));
                setStep(side === "morning" ? "morning-extra" : "evening-extra");
              }}
              style={{ width: "100%", background: "transparent", border: `1px dashed ${CARD_B}`, borderRadius: 14, padding: "13px 16px", color: SAGE, fontSize: 14.5, fontFamily: FONT, cursor: "pointer" }}
            >
              {t("wol_rule.add_extra_practice", {
                side: cap.toLowerCase(),
                defaultValue: `+ Add an additional ${cap.toLowerCase()} practice`,
              })}
            </button>
          )}
        </div>
        {/* Saturday / Sunday alternatives (owner) — HERE, under "add an
            additional practice", not on the anchor slide it used to sit on.
            That slide is one question ("what do you pray?") and the weekend
            is a second one; asking both at once made the first look longer
            and less decided than it is.

            Shown once this side has SOMETHING — an anchor or a contemplative
            practice. Offering "different on Saturday" for a side you haven't
            chosen anything for is a question about nothing. */}
        {(prayBySide[side] !== "none" || contemplativeOnSide(side)) && (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ color: SAGE_DIM, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
              {t("wol_rule.weekend_intro", {
                defaultValue: "Keep something different at the weekend? Leave these alone if the same practice runs all week.",
              })}
            </p>
            {(["sat", "sun"] as const).map((day) => {
              const alt = weekendBySide[side][day];
              const label = day === "sat"
                ? t("wol_rule.saturdays", { defaultValue: "Saturdays" })
                : t("wol_rule.sundays", { defaultValue: "Sundays" });
              return (
                <div key={day} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ color: CREAM, fontFamily: FONT, fontSize: 14, fontWeight: 500 }}>{label}</label>
                  <select
                    value={alt ? alt.choice : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setWeekend(side, day, v === "" ? null : { choice: v as PrayChoice, name: alt?.name ?? "" });
                    }}
                    aria-label={label}
                    style={{ ...FROST_BLUR, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" as const, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
                  >
                    <option value="">{t("wol_rule.weekend_same", { defaultValue: "Same as the rest of the week" })}</option>
                    {weekendOptions(side).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {/* Its own name, the way the weekday custom practice has one —
                      "Worship", "Eucharist", whatever they actually keep. */}
                  {alt?.choice === "ownPractice" && (
                    <input
                      type="text"
                      value={alt.name}
                      onChange={(e) => setWeekend(side, day, { choice: "ownPractice", name: e.target.value })}
                      placeholder={t("wol_rule.weekend_name_ph", { defaultValue: "Worship" })}
                      aria-label={t("wol_rule.weekend_name_label", { defaultValue: "Name this practice" })}
                      style={{ ...FROST_BLUR, width: "100%", boxSizing: "border-box" as const, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Forward Day by Day — read it, or listen to it ────────────────────────
  // Shown only when FDD is the morning prayer. Sets the per-device fdd-mode the
  // home FDD card reads (written = open the reading; audio = play the podcast).
  if (step === "fdd-mode") {
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(t("wol_rule.fdd_mode_eyebrow", { defaultValue: "Forward Day by Day" }), t("wol_rule.fdd_mode_title", { defaultValue: "What medium would you like?" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.fdd_mode_body", { defaultValue: "Read today's reflection, or listen to it read aloud." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {choiceRow(fddMode === "written", `📖 ${t("wol_rule.fdd_written", { defaultValue: "Read it" })}`, t("wol_rule.fdd_written_sub", { defaultValue: "Today's Forward Day by Day reflection." }), () => chooseFddMode("written"))}
          {choiceRow(fddMode === "audio", `🎧 ${t("wol_rule.fdd_audio", { defaultValue: "Listen to it" })}`, t("wol_rule.fdd_audio_sub", { defaultValue: "The Forward Day by Day podcast, read aloud." }), () => chooseFddMode("audio"))}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Praying the Psalms — which cycle ─────────────────────────────────────
  // Shown when either side picks Praying the Psalms. Sets the per-device cycle
  // the home Psalms card + reader read.
  if (step === "psalms-cycle") {
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(t("wol_rule.psalms_cycle_eyebrow", { defaultValue: "Praying the Psalms" }), t("wol_rule.psalms_cycle_title", { defaultValue: "Which cycle?" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.psalms_cycle_body", { defaultValue: "How the Psalter unfolds, day by day." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {choiceRow(psalmCycle === "office", `📖 ${t("wol_rule.psalms_office_label", { defaultValue: "In step with the office" })}`, t("wol_rule.psalms_office_sub", { defaultValue: "The psalms appointed in the daily office — about 2–3 a day." }), () => choosePsalmCycle("office"))}
          {choiceRow(psalmCycle === "monthly", `📜 ${t("wol_rule.psalms_monthly_label", { defaultValue: "The whole Psalter, monthly" })}`, t("wol_rule.psalms_monthly_sub", { defaultValue: "All 150 psalms across a month — fuller, more psalms a day (about 5)." }), () => choosePsalmCycle("monthly"))}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Step 3 — Learn (daily reflections, multi-select) ─────────────────────
  if (step === "learn") {
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(t("wol_rule.learn_eyebrow", { defaultValue: "Learn" }), t("wol_rule.learn_title", { defaultValue: "Learn" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "16px 0 4px" }}>
          {t("wol_rule.learn_body", { defaultValue: "Choose the daily reflections you'd like to read." })}
        </p>
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "0 0 16px" }}>
          {t("wol_rule.learn_multi_note", { defaultValue: "Pick as many as you like — each gets its own card on your home." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {NEWSLETTERS
            // VTS is feed-gated — hidden until the viewer follows the VTS
            // feed (useEntitlements). Anyone who already had it selected
            // still sees the row, so a lapsed follower can see and change
            // their own choice rather than having it vanish silently.
            .filter((n) => n.id !== "vts" || entitlements.vts || newsletters.includes("vts"))
            .map((n) => {
              // FDD chosen as the morning PRAYER (not just a reflection) stays
              // noted here even if unchecked as a reflection below — the two
              // are independent toggles now (see the morning-way step above).
              const sub = (n.id === "fdd" && prayBySide.morning === "fdd")
                ? `${n.sub} · ${t("wol_rule.learn_fdd_morning_note", { defaultValue: "Selected as your morning practice" })}`
                : n.sub;
              return choiceRow(newsletters.includes(n.id), n.label, sub, () => toggleNewsletter(n.id));
            })}
          {choiceRow(noReflection, t("wol_rule.learn_none", { defaultValue: "None" }), t("wol_rule.learn_none_sub", { defaultValue: "No daily reflection." }), chooseNoReflection)}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── The chosen extra's own details slide ──────────────────────────────────
  if (step === "morning-extra-config" || step === "evening-extra-config") {
    const side: OfficeSide = step === "morning-extra-config" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    const kind = extraConfigKindFor(side);
    const title = extraBySide[side] ?? cap;
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, title)}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {kind === "breaths"
            ? t("wol_rule.extra_cfg_breaths", { defaultValue: "How many breaths would you like?" })
            : kind === "psalms"
              ? t("wol_rule.extra_cfg_psalms", { defaultValue: "Choose how the Psalter unfolds." })
              : kind === "newsletter"
                ? t("wol_rule.extra_cfg_newsletter", { defaultValue: "Which reflection would you like to read?" })
                : t("wol_rule.extra_cfg_medium", { side: cap.toLowerCase(), defaultValue: `How would you like to pray it?` })}
        </p>

        {kind === "newsletter" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {NEWSLETTERS
              // All four are open to everyone — the Dean's Commentary is no
              // longer gated behind following the VTS feed (owner).
              // A reflection that's already this side's ANCHOR can't also be
              // its second practice — that's one practice with two cards.
              .filter((n) => !(n.id === "fdd" && prayBySide[side] === "fdd"))
              // BOTH sides may keep a reflection, but not the SAME one
              // (owner: "if they chose CAC in the morning, it can't be in
              // the evening too") — one newsletter is one card with one
              // read-flag a day, so the second side's card would tick itself
              // the moment the first was read. Morning CAC + evening SSJE is
              // fine; CAC twice is not.
              .filter((n) => n.id !== extraNewsletterBySide[side === "morning" ? "evening" : "morning"])
              .map((n) => choiceRow(
                extraNewsletterBySide[side] === n.id,
                n.label,
                n.sub,
                () => {
                  touchedRef.current = true;
                  const prev = extraNewsletterBySide[side];
                  if (prev === n.id) return; // already chosen — a no-op, not a toggle-off
                  setExtraNewsletterBySide((p) => ({ ...p, [side]: n.id }));
                  // Swap, don't accumulate: re-picking must not leave the
                  // previous choice behind as a second home card. The other
                  // side can never hold the same source (filtered above), so
                  // this side's own previous pick is the only one to
                  // withdraw.
                  setNewsletters((p) => [
                    ...new Set([...(prev ? p.filter((x) => x !== prev) : p), n.id]),
                  ]);
                },
              ))}
          </div>
        )}

        {kind === "medium" && (
          // The relative box wraps ONLY the select. The chevron is positioned
          // at top:50% of its offset parent, so including the note below it
          // centred the arrow on select-plus-paragraph and left it sitting at
          // the bottom edge of the pill.
          <div>
          <div style={{ position: "relative" }}>
            <select
              value={methodBySide[side]}
              onChange={(e) => chooseMethodBySide(side, e.target.value as DefaultOfficeEntry)}
              aria-label={t("wol_rule.method_label", { defaultValue: "Default way to pray" })}
              style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" as const, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
            >
              <option value="book">📕 {t("wol_rule.method_book", { defaultValue: "Physical BCP" })}</option>
              <option value="read">📖 {t("wol_rule.method_screen", { defaultValue: "Digital Slideshow" })}</option>
              {!pilot && <option value="venite">🕊️ {t("wol_rule.method_venite", { defaultValue: "Venite Digital" })}</option>}
              {!pilot && <option value="listen">🎧 {t("wol_rule.method_listen", { defaultValue: "Listen" })}</option>}
              {side === "morning" && !pilot && <option value="watch">📺 {t("wol_rule.method_watch", { defaultValue: "Watch" })}</option>}
            </select>
            <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
          </div>
          {/* Said out loud, because it is shared. The format is stored per
              SIDE, so both of this morning's practices take it — better to name
              that than to let someone set it here and wonder why the other card
              changed too. */}
          <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, lineHeight: 1.5, margin: "10px 2px 0" }}>
            {t("wol_rule.extra_cfg_medium_note", { side: cap.toLowerCase(), defaultValue: `This is how you take the ${cap.toLowerCase()} office, so it applies to both of your ${cap.toLowerCase()} practices.` })}
          </p>
          </div>
        )}

        {kind === "psalms" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {choiceRow(psalmCycle === "office", `📖 ${t("wol_rule.psalms_office_label", { defaultValue: "In step with the office" })}`, t("wol_rule.psalms_office_sub", { defaultValue: "The psalms appointed in the daily office — about 2–3 a day." }), () => choosePsalmCycle("office"))}
            {choiceRow(psalmCycle === "monthly", `📜 ${t("wol_rule.psalms_monthly_label", { defaultValue: "The whole Psalter, monthly" })}`, t("wol_rule.psalms_monthly_sub", { defaultValue: "All 150 psalms across a month — fuller, more psalms a day (about 5)." }), () => choosePsalmCycle("monthly"))}
          </div>
        )}

        {kind === "breaths" && (
          <div style={{ position: "relative" }}>
            <select
              value={String(cobreatheBreaths)}
              onChange={(e) => chooseCobreatheBreaths(side, parseInt(e.target.value, 10) || 12)}
              aria-label={t("wol_rule.cobreathe_length_label", { defaultValue: "How many breaths?" })}
              style={{ ...FROST_BLUR, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" as const, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
            >
              {COBREATHE_LENGTHS.map((n) => (
                <option key={n} value={String(n)}>{t("wol_rule.n_breaths", { count: n, defaultValue: `${n} breaths` })}</option>
              ))}
            </select>
            <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
          </div>
        )}

        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Step 4 — Add to your day (optional practices) ─────────────────────────
  // UNREACHABLE today: "extras" is in no orderedSteps build, and the one
  // review row that pointed here was retargeted (see the Prayer List row) —
  // its Continue was dead (indexOf -1). Kept because the reading/podcasts
  // toggles it carries have no other home; give it a place in the flow before
  // pointing anything at it again.
  if (step === "extras") {
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(t("wol_rule.extras_eyebrow", { defaultValue: "Add to your day" }), t("wol_rule.extras_title", { defaultValue: "Add to your day" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "16px 0 4px" }}>
          {t("wol_rule.extras_body", { defaultValue: "Optional practices you can keep each day." })}
        </p>
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "0 0 16px", lineHeight: 1.5 }}>
          {t("wol_rule.extras_note", { defaultValue: "Each adds a card on your home and a checkmark to your Daily progress." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Prayer List removed from "Add to your day" — it now lives inside the
              Prayer list page (the "My list" tab), not as a separate anchor. */}
          {/* Examen + Audio Divina now live in the Contemplation step. */}
          {choiceRow(extras.reading, `📚 ${t("wol_rule.extra_reading", { defaultValue: "Reading" })}`, t("wol_rule.extra_reading_sub", { defaultValue: "Log what you read." }), () => toggleExtra("reading"))}
          {choiceRow(extras.podcasts, `🎙️ ${t("wol_rule.extra_podcasts", { defaultValue: "Podcasts" })}`, t("wol_rule.extra_podcasts_sub", { defaultValue: "Log what you listened to." }), () => toggleExtra("podcasts"))}
          {/* When they read — so the Reading card slots into the rhythm at that
              time of day (mirrors journaling above). */}
          {extras.reading && (
            <div style={{ margin: "-4px 0 4px", padding: "0 2px" }}>
              <p style={{ color: SAGE_DIM, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 8px", fontFamily: FONT }}>
                {t("wol_rule.reading_when", { defaultValue: "When do you read?" })}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
                {CUSTOM_SLOTS.map((s) => {
                  const on = readingSlot === s;
                  const label = SLOT_LABEL[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => chooseReadingSlot(s)}
                      style={{
                        ...FROST_BLUR,
                        background: on ? CARD_ACTIVE : CARD,
                        border: `1px solid ${on ? CARD_B_ACTIVE : CARD_B}`,
                        color: on ? CREAM : SAGE,
                        borderRadius: 10, padding: "9px 4px", fontSize: 12.5, fontWeight: on ? 700 : 500,
                        fontFamily: FONT, cursor: "pointer", textAlign: "center",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Relational practices — a category of ready-made custom logs. ──────────
  // Owner: "a new page on the customizer that was relational … give someone a
  // hug, express gratitude, call a friend. Let's just start with those three."
  //
  // Nothing new underneath: each row writes an ordinary custom anchor, so it
  // arrives on the home screen with the same card, the same done state and the
  // same ordering as anything else someone made themselves. What they carry
  // that a hand-made practice doesn't is a QUESTION for the log sheet — these
  // are things you did with another person today or didn't, and the sheet asks
  // rather than offering a checkbox with the practice's own name on it.
  if (step === "relational") {
    return shell(
      <>
        {stepHeader(
          t("wol_rule.relational_eyebrow", { defaultValue: "Relational" }),
          t("wol_rule.relational_title", { defaultValue: "Relational Practices" }),
        )}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 20px" }}>
          {t("wol_rule.relational_body", {
            // Just the first sentence (owner). The rest explained the
            // mechanics of logging on a screen where nothing has been chosen
            // yet — the rows below say what each practice is, and the day
            // itself will do the asking.
            defaultValue: "Small things you do with someone else.",
          })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {RELATIONAL_PRACTICES.map((r) =>
            choiceRow(
              relational.includes(r.id),
              `${r.emoji} ${r.title}`,
              r.prompt,
              () => toggleRelational(r.id),
            ),
          )}
        </div>
        {/**
          * THE CAP, SAID OUT LOUD.
          *
          * Practices are capped at eight and addCustomAnchor refuses in
          * silence, so ticking a ninth moved the tick, reported nothing, and
          * wrote nothing — the row simply came back unticked next time. The
          * tick is only honest if the screen says when it couldn't be kept.
          */}
        {relational.length > 0 && customList.length >= 8 && !relational.every((id) =>
          customList.some((a) => a.title.trim().toLowerCase() === RELATIONAL_PRACTICES.find((r) => r.id === id)?.title.toLowerCase())
        ) && (
          <p style={{ color: "rgba(232,190,150,0.9)", fontSize: 13.5, fontFamily: FONT, lineHeight: 1.55, margin: "16px 0 0" }}>
            {t("wol_rule.relational_at_cap", {
              defaultValue: "You're keeping the most practices Phoebe holds at once. Remove one on the next screen to make room for this.",
            })}
          </p>
        )}
        {/* THE WAY OUT. Owner: "for some reason there is not a continue on the
            practice with other people." There wasn't: every other step in this
            flow ends with this line and this one never had it, so the only
            control on the screen was Back — you could reach the step, choose
            on it, and have no way forward from it. */}
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Create-your-own — title + emoji → a custom Daily-progress anchor.
  // Reached from the "Create your own" card in the extras step. ───────────────
  if (step === "custom") {
    // ONE practice, opened by its own gear — its settings, not the catalogue.
    const editingAnchor = editingCustomId ? customList.find((a) => a.id === editingCustomId) ?? null : null;
    if (editingAnchor) {
      const dayOn = (d: number) => customDays === null || customDays.includes(d);
      /**
       * ONCE A WEEK — the row that turns a daily practice into a weekly one.
       *
       * Sits above the weekday chips because it changes what they MEAN: a
       * weekly practice is owed once between Monday and Sunday, so scoping it
       * to particular weekdays as well would be two answers to the same
       * question. The chips are hidden while it is on.
       */
      const weeklyRow = (
        <button
          type="button"
          onClick={() => { touchedRef.current = true; setCustomWeekly((w) => !w); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", textAlign: "left", borderRadius: 14, padding: "13px 16px",
            background: customWeekly ? "rgba(46,107,64,0.28)" : "rgba(240,237,230,0.06)",
            border: `1px solid ${customWeekly ? "rgba(168,197,160,0.5)" : "rgba(200,212,192,0.18)"}`,
            color: CREAM, fontFamily: FONT, fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span>{t("wol_rule.custom_weekly", { defaultValue: "Once a week" })}</span>
            <span style={{ color: SAGE, fontSize: 12.5, fontWeight: 500, lineHeight: 1.45 }}>
              {t("wol_rule.custom_weekly_sub", { defaultValue: "Stays in Next until you keep it, then rests until Monday." })}
            </span>
          </span>
          <span aria-hidden style={{ fontSize: 18 }}>{customWeekly ? "\u2713" : ""}</span>
        </button>
      );
      const toggleDay = (d: number) => {
        touchedRef.current = true;
        setCustomDays((prev) => {
          const cur = prev === null ? [0, 1, 2, 3, 4, 5, 6] : prev;
          const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort();
          // Every day is spelled as "no days set" everywhere else.
          return next.length === 0 || next.length === 7 ? null : next;
        });
      };
      return shell(
        <>
          {stepHeader(
            t("wol_rule.custom_eyebrow", { defaultValue: "Add to your day" }),
            editingAnchor.title,
          )}
          <div style={{ display: "flex", gap: 8, margin: "20px 0 0" }}>
            <input
              value={customEmoji}
              onChange={(e) => { touchedRef.current = true; setCustomEmoji(e.target.value.slice(0, 2)); }}
              aria-label={t("wol_rule.custom_emoji", { defaultValue: "Emoji" })}
              placeholder="🌿"
              style={{ width: 56, flexShrink: 0, textAlign: "center", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 0", fontSize: 18, color: CREAM, fontFamily: FONT }}
            />
            <input
              value={customTitle}
              onChange={(e) => { touchedRef.current = true; setCustomTitle(e.target.value); }}
              aria-label={t("wol_rule.custom_name", { defaultValue: "Practice name" })}
              style={{ flex: 1, minWidth: 0, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 14px", fontSize: 15, color: CREAM, fontFamily: FONT }}
            />
          </div>

          <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "22px 0 8px", fontFamily: FONT }}>
            {t("wol_rule.custom_when", { defaultValue: "When in the day?" })}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
            {CUSTOM_SLOTS.map((sl) => {
              const on = customSlot === sl;
              return (
                <button
                  key={sl}
                  type="button"
                  onClick={() => { touchedRef.current = true; setCustomSlot(sl); }}
                  style={{ background: on ? "rgba(46,107,64,0.30)" : CARD, border: `1px solid ${on ? CARD_B_ACTIVE : CARD_B}`, color: on ? CREAM : SAGE, borderRadius: 10, padding: "10px 0", fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
                >
                  {sl}
                </button>
              );
            })}
          </div>

          {/* HOW OFTEN — daily, or once a week. Above the weekday chips
              because it changes what they mean; see weeklyRow. */}
          <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "22px 0 8px", fontFamily: FONT }}>
            {t("wol_rule.custom_cadence", { defaultValue: "How often?" })}
          </p>
          {weeklyRow}

          {/* WHICH DAYS — Chapel is a weekday thing, and until now the only
              way to change that was to delete the practice and make it again.
              Hidden for a weekly practice: it is owed once between Monday and
              Sunday, so naming weekdays as well would be two answers to one
              question. */}
          {!customWeekly && (<>
          <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "22px 0 8px", fontFamily: FONT }}>
            {t("wol_rule.custom_days", { defaultValue: "Which days?" })}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((lbl, d) => {
              const on = dayOn(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-label={`${lbl} ${on ? "on" : "off"}`}
                  style={{ background: on ? "rgba(46,107,64,0.30)" : CARD, border: `1px solid ${on ? CARD_B_ACTIVE : CARD_B}`, color: on ? CREAM : SAGE, borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
          <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "8px 0 0" }}>
            {customDays === null
              ? t("wol_rule.custom_days_all", { defaultValue: "Every day" })
              : describeDays(customDays)}
          </p>
          </>)}

          {ctaButton(t("common.save", { defaultValue: "Save" }), saveCustomEdit)}
        </>,
      );
    }
    const hasCustoms = customList.length > 0;
    // Once they have at least one practice, the list leads with a wide "Add new"
    // pill, and the add form moves to its own sub-slide (addingCustom). A
    // first-timer with no practices yet sees the form directly.
    const showList = hasCustoms && !addingCustom;
    const showForm = !hasCustoms || addingCustom;
    return shell(
      <>
        {backRow(addingCustom ? () => setAddingCustom(false) : goPrev)}
        {stepHeader(
          t("wol_rule.custom_eyebrow", { defaultValue: "Add to your day" }),
          addingCustom
            ? t("wol_rule.custom_add_title", { defaultValue: "Add a practice" })
            : t("wol_rule.custom_title", { defaultValue: "Create your own" }),
        )}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 0" }}>
          {t("wol_rule.custom_body", { defaultValue: "Keep anything you like — a walk, a stretch, a phone call. Name it, pick an emoji, and it becomes a card you check off each day." })}
        </p>

        {showList && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "20px 0 0" }}>
            {customList.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "11px 14px" }}>
                <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden>{a.emoji}</span>
                <span style={{ flex: 1, minWidth: 0, color: CREAM, fontSize: 15, fontWeight: 600, fontFamily: FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                {a.reading && (
                  <span style={{ flexShrink: 0, color: SAGE_DIM, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>
                    {a.reading.unit === "minute" ? t("wol_rule.unit_time", { defaultValue: "Time" }) : a.reading.unit === "page" ? t("wol_rule.unit_page", { defaultValue: "Page" }) : t("wol_rule.unit_chapter", { defaultValue: "Chapter" })}
                  </span>
                )}
                <span style={{ flexShrink: 0, color: SAGE_DIM, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT }}>{a.slot}</span>
                <button type="button" onClick={() => { removeCustomAnchor(a.id); setCustomList(getCustomAnchors()); }} aria-label={t("common.remove", { defaultValue: "Remove" })} style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", fontSize: 16, padding: "2px 6px" }}>✕</button>
              </div>
            ))}
            {/* Add new — a full-width pill, as wide as the practice rows, that opens
                the add form on its own sub-slide. */}
            <button
              type="button"
              onClick={() => { touchedRef.current = true; setCustomTitle(""); setCustomEmoji(""); setAddingCustom(true); }}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: CARD, border: `1px dashed ${CARD_B_ACTIVE}`, borderRadius: 12, padding: "13px 14px", color: CREAM, fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
            >
              ＋ {t("wol_rule.custom_add_new", { defaultValue: "Add new" })}
            </button>
          </div>
        )}

        {showForm && (
          <>
            {/* Name first — emoji + name + Add. */}
            <div style={{ display: "flex", gap: 8, margin: "20px 0 0" }}>
              <input
                value={customEmoji}
                onChange={(e) => setCustomEmoji(e.target.value.slice(0, 2))}
                aria-label={t("wol_rule.custom_emoji", { defaultValue: "Emoji" })}
                placeholder="🌿"
                style={{ width: 56, flexShrink: 0, textAlign: "center", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 0", fontSize: 18, color: CREAM, fontFamily: FONT }}
              />
              <input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
                aria-label={t("wol_rule.custom_name", { defaultValue: "Practice name" })}
                placeholder={t("wol_rule.custom_placeholder", { defaultValue: "e.g. Morning walk" })}
                style={{ flex: 1, minWidth: 0, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 14px", fontSize: 15, color: CREAM, fontFamily: FONT }}
              />
              <button
                type="button"
                onClick={addCustom}
                disabled={!customTitle.trim()}
                style={{ flexShrink: 0, background: customTitle.trim() ? CTA : CARD, border: `1px solid ${customTitle.trim() ? CARD_B_ACTIVE : CARD_B}`, color: CREAM, borderRadius: 12, padding: "0 18px", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: customTitle.trim() ? "pointer" : "default" }}
              >
                {t("common.add", { defaultValue: "Add" })}
              </button>
            </div>

            {/* Then when in the day — so the card slots into the rhythm in the
                right place (a morning walk near Morning Prayer, etc.). */}
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "22px 0 8px", fontFamily: FONT }}>
              {t("wol_rule.custom_when", { defaultValue: "When in the day?" })}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
              {CUSTOM_SLOTS.map((sl) => {
                const on = customSlot === sl;
                const label = SLOT_LABEL[sl];
                return (
                  <button
                    key={sl}
                    type="button"
                    onClick={() => { touchedRef.current = true; setCustomSlot(sl); }}
                    style={{
                      ...FROST_BLUR,
                      background: on ? CARD_ACTIVE : CARD,
                      border: `1px solid ${on ? CARD_B_ACTIVE : CARD_B}`,
                      color: on ? CREAM : SAGE,
                      borderRadius: 10, padding: "10px 4px", fontSize: 12.5, fontWeight: on ? 700 : 500,
                      fontFamily: FONT, cursor: "pointer", textAlign: "center",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Audio Divina used to also be offered here as "add a practice we've
            made" — removed (owner): it already lives on the Contemplation step
            ("Add an additional practice"), and offering it again on this
            unrelated custom-practice step was a confusing duplicate. */}

        {/* Bottom: the add sub-slide just returns to the list; otherwise Save. */}
        {addingCustom ? (
          <div style={{ marginTop: "auto", paddingTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <button onClick={() => setAddingCustom(false)} style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "10px 12px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: FONT }}>
              <ChevronLeft size={16} /> {t("wol_rule.custom_back_to_list", { defaultValue: "Back to your practices" })}
            </button>
          </div>
        ) : (
          <div style={{ marginTop: "auto", paddingTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <button onClick={isLastStep ? commit : goNext} style={{ width: "100%", background: CTA, border: `1px solid ${CARD_B_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "15px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
              {/* "Save", not "Save my daily rhythm" (owner) — it is the last
                  tap of the flow and it goes straight to the home. */}
              {isLastStep ? t("wol_rule.finish_save", { defaultValue: "Save" }) : t("ruleOfLife.continue", { defaultValue: "Continue" })}
            </button>
            <button onClick={goPrev} style={{ marginTop: 4, background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "10px 12px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: FONT }}>
              <ChevronLeft size={16} /> {t("ruleOfLife.back", { defaultValue: "Back" })}
            </button>
          </div>
        )}
      </>,
    );
  }

  // ── Weekly rhythm (BETA) — the Way of Love's weekly practices, opt-in. Each
  // toggle persists immediately to its own store (lib/weeklyRhythm), so it never
  // rides commit()/the home layout. Shows in the "This week" home band. ────────
  if (step === "weekly") {
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(t("wol_rule.weekly_eyebrow", { defaultValue: "Each week" }), t("wol_rule.weekly_title", { defaultValue: "Your weekly rhythm" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "16px 0 4px" }}>
          {t("wol_rule.weekly_body", { defaultValue: "The Way of Love also turns each week. Would you like to set up your weekly practices? Keep any of these — quietly, for yourself." })}
        </p>
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "0 0 16px", lineHeight: 1.5 }}>
          {t("wol_rule.weekly_note", { defaultValue: "Each adds a card to the “This week” band on your home. No sharing, no streak — just a quiet log." })}
        </p>
        {/* All four or nothing (owner) — one toggle, with the four practices shown. */}
        {(() => {
          const on = WEEKLY_PRACTICES.some((p) => weekly[p.kind]);
          const toggle = () => {
            const turnOn = !on;
            setWeekly({ commune: turnOn, go: turnOn, bless: turnOn, rest: turnOn });
            setEnabledWeekly(turnOn ? (["commune", "go", "bless", "rest"] as WeeklyKind[]) : []);
          };
          return (
            <button
              type="button"
              onClick={toggle}
              style={{
                width: "100%", textAlign: "left", cursor: "pointer",
                background: on ? "rgba(46,107,64,0.14)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${on ? CARD_B_ACTIVE : CARD_B}`,
                borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 14,
                transition: "background 0.2s, border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: CREAM, fontFamily: FONT, margin: 0 }}>
                    {t("wol_rule.weekly_all_label", { defaultValue: "Keep the weekly practices" })}
                  </p>
                  <p style={{ fontSize: 13, color: SAGE, fontFamily: FONT, margin: "3px 0 0" }}>
                    {t("wol_rule.weekly_all_sub2", { defaultValue: "Commune, Go, Bless & Rest — all four together" })}
                  </p>
                </div>
                <span style={{ width: 46, height: 28, borderRadius: 999, flexShrink: 0, background: on ? CTA : "rgba(143,175,150,0.22)", position: "relative", transition: "background 0.2s" }}>
                  <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: CREAM, transition: "left 0.2s" }} />
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {WEEKLY_PRACTICES.map((p) => (
                  <div
                    key={p.kind}
                    style={{
                      display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 12,
                      background: on ? "rgba(46,107,64,0.18)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${on ? "rgba(126,210,140,0.3)" : CARD_B}`,
                      opacity: on ? 1 : 0.5, transition: "opacity 0.2s, background 0.2s",
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }} aria-hidden>{p.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: CREAM, fontFamily: FONT }}>{p.label}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })()}
        <div style={{ marginTop: "auto", paddingTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <button onClick={goNext} style={{ width: "100%", background: CTA, border: `1px solid ${CARD_B_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "15px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
            {t("ruleOfLife.continue", { defaultValue: "Continue" })}
          </button>
          <button onClick={() => setStep("custom")} style={{ marginTop: 4, background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "10px 12px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: FONT }}>
            <ChevronLeft size={16} /> {t("ruleOfLife.back", { defaultValue: "Back" })}
          </button>
        </div>
      </>,
    );
  }


  // ── Done / review — the practices they set, each tappable to jump back and
  // edit that part of the flow ───────────────────────────────────────────────
  const methodLabel = (m: DefaultOfficeEntry): string =>
    m === "listen" ? `🎧 ${t("wol_rule.method_listen", { defaultValue: "Listen" })}`
    : m === "book" ? `📕 ${t("wol_rule.method_book", { defaultValue: "Physical BCP" })}`
    : m === "watch" ? "📺 Watch"
    : m === "venite" ? `🕊️ ${t("wol_rule.method_venite", { defaultValue: "Venite Digital" })}`
    : `📖 ${t("wol_rule.method_screen", { defaultValue: "Digital Slideshow" })}`;
  // Labels the office ANCHOR only (community / BCP form). Contemplation, FDD and
  // the Examen are add-ons now — never anchors — so they don't appear here; a
  // "none" side has no office row (reviewRows filters it out before calling this).
  const sideWayLabel = (side: OfficeSide): string => {
    const cap = side === "morning" ? "Morning" : "Evening";
    return prayBySide[side] === "community" ? "Community Intercessions"
      : prayBySide[side] === "offices" ? `${cap} Prayer`
      : prayBySide[side] === "compline" ? "Compline"
      : prayBySide[side] === "psalms" ? "Praying the Psalms"
      : prayBySide[side] === "examen" ? "The Examen"
      : prayBySide[side] === "guidedPrayer" ? `${cap} Simple Guided Prayer`
      : prayBySide[side] === "ownPractice" ? (customNameBySide[side].trim() || `${cap} Practice`)
      : prayBySide[side] === "fdd" ? "Forward Day by Day"
      : prayBySide[side] === "readings" ? "Daily Scripture Readings"
      : `${cap} Devotion`;
  };
  /**
   * Owner: the review screen wants the same ⚙/✕ the edit list has, so a
   * practice can be adjusted or taken off without leaving "the shape of your
   * days". The gear reuses each row's existing `step`; `remove` is new — the
   * review builds its rows from local state rather than from server row ids,
   * so each names its own way off rather than routing through clearEditRow.
   * A row with no `remove` shows only the gear.
   */
  /** `editId` — the edit-list row id this review row corresponds to, when one
   *  exists. The gear uses it to enter SINGLE-EDIT mode (walk that practice's
   *  slides, Save, come back) instead of dropping into the middle of the full
   *  flow — from which goPrev could never return here ("done" isn't in
   *  orderedSteps) and the corner ✕ silently discarded the edit. */
  const reviewRowsRaw: Array<{ emoji: string; label: string; sub: string; step: Step; editId?: string; remove?: () => void }> = [
    // One row per side that has an OFFICE ANCHOR. A side with only add-ons
    // (contemplation/examen) has no office card — those surface as their own
    // rows below (Silence / The Examen), so it isn't listed here as an office.
    ...SIDES.filter((s) => sides[s] && prayBySide[s] !== "none").map((s) => ({
      emoji: s === "morning" ? "🌅" : "🌙",
      label: sideWayLabel(s),
      sub: `${prayBySide[s] === "community" ? "On screen" : prayBySide[s] === "psalms" ? (psalmCycle === "monthly" ? "Monthly cycle" : "Daily office cycle") : prayBySide[s] === "guidedPrayer" ? "Praise · Confession · Thanksgiving · Supplication" : prayBySide[s] === "ownPractice" ? (anchorPracticeFor(customNameBySide[s])
        ? t("wol_rule.own_named_practice", { defaultValue: "Your anchor practice" })
        : t("wol_rule.own_practice", { defaultValue: "Your own practice" })) : prayBySide[s] === "fdd" ? "Forward Movement" : prayBySide[s] === "readings" ? "Forward Movement" : methodLabel(methodBySide[s])} · ${shownReminderTime(s)}`,
      step: (s === "morning" ? "morning-way" : "evening-way") as Step,
      editId: `side:${s}`,
      // Taking the office off leaves the side itself alone — its add-ons
      // (a sit, the Examen) keep their own rows below.
      remove: () => choosePrayBySide(s, "none"),
    })),
    // Per-side contemplative prayer — its own row per side. When the style is
    // the breath it's "Morning / Evening Creation Prayer" (🌍); a silent sit is
    // "Morning / Evening Contemplation". The sub shows THIS side's session
    // length (breaths for the breath, minutes for a sit) — NOT the whole-day
    // goal, which read wrong ("144 min a day" on every card).
    ...((["morning", "evening"] as OfficeSide[]).filter((s) => contemplationBySide[s]).map((s) => {
      // THIS side's practice — the aggregate made both rows claim whichever
      // was picked last, so the silent side's row read "N breaths" and its
      // tap-to-edit went to the breath step.
      const isCob = sideIsCreation(s);
      const cap = s === "morning" ? "Morning" : "Evening";
      return {
        emoji: isCob ? "🌍" : (silenceMode === "grow" ? "🌱" : "🕯️"),
        label: isCob ? `${cap} Creation Prayer` : `${cap} Contemplation`,
        sub: isCob
          ? t("wol_rule.n_breaths", { count: cobreatheBreaths, defaultValue: `${cobreatheBreaths} breaths` })
          : (silenceMode === "grow" ? "Growing toward 30 min" : (minutesBySide[s] > 0 ? t("wol_rule.n_min", { count: minutesBySide[s], defaultValue: `${minutesBySide[s]} min` }) : "A silent sit")),
        /**
         * THE FIRST SLIDE, WITH ALL THE OPTIONS (owner's standing rule) — the
         * side's WAY slide, where the practice itself can be swapped.
         *
         * This pointed at the side's CONFIG slide, arguing that config "sets
         * what this row displays". True, and beside the point: someone tapping
         * their contemplation row to change the practice got a length-and-
         * reminder form with no route to the choice they came for — while the
         * SAME row's gear on the edit list (stepForRow, same editId) already
         * opened the way slide. One door, two destinations, and this was the
         * wrong one. Continue still reaches config: stepBelongsToRow claims
         * the side's whole run, so nothing the old target offered is lost.
         */
        step: (s === "morning" ? "morning-way" : "evening-way") as Step,
        editId: `contemplation:${s}`,
        // Same pair clearEditRow's "contemplation:<side>" branch clears — the
        // flag AND the form, or the side reopens claiming a practice it no
        // longer keeps.
        remove: () => {
          touchedRef.current = true;
          setContemplationBySide((prev) => ({ ...prev, [s]: false }));
          setContemplativeForm((prev) => ({ ...prev, [s]: null }));
        },
      };
    })),
    // SOLO silence goal — minutes set with no per-side contemplation: the home
    // shows the single "Silence" progress card, so the review names it too
    // (otherwise a saved goal looks like it didn't take).
    /**
     * The daily silence goal, as its own row.
     *
     * It used to be suppressed whenever EITHER side carried a contemplation —
     * on the assumption that the side's row already spoke for it. That's true
     * when the side's practice is the silent sit, and false when it's the
     * BREATH: useRhythmState's silenceGoalCardActive explicitly supports
     * `creationPerSide && contemplationGoalMinutes > 0` and puts a real
     * contemplation card on the home for it. So on the VTS rule (Creation
     * Prayer in the evening plus ten minutes of silence) the home showed the
     * silence card while this review said the practice didn't exist.
     *
     * Suppressed now only by a per-side SILENT sit — the one case that really
     * is the same practice said twice.
     */
    ...((goalMin > 0
      // Per-SIDE kind, not the global style: setSideContemplationKind mirrors
      // the LAST-written side into the global, so on a split rule (silent one
      // side, creation the other) the global holds whichever side committed
      // last and this suppression fired for the wrong one.
      && !(contemplationBySide.morning && contemplativeForm.morning === "prayer")
      && !(contemplationBySide.evening && contemplativeForm.evening === "prayer")) ? [{
      emoji: (silenceMode === "grow" ? "🌱" : "🕯️"),
      label: "Silence",
      sub: silenceMode === "grow" ? "Growing toward 30 min" : `${goalMin} min a day`,
      // The review row opens the same first slide its gear does — one door,
      // one destination (see stepForRow's note on the standing rule).
      step: "contemplative" as Step,
      editId: "contemplation",
      remove: () => chooseGoal("0"),
    }] : []),
    // No time-of-day sub-label anymore — these add-ons are just available
    // all day (see the "contemplative" step for the "with your prayer"
    // exception, when Creation Prayer IS the side's primary sit style).
    ...(contemplative.compline ? [{ emoji: "🌙", label: "Compline", sub: "Available from 7pm", step: "contemplative" as Step, editId: "slot:compline", remove: () => toggleContemplative("compline") }] : []),
    /**
     * The standing Creation Prayer add-on — but NOT when a side already lists
     * it as that side's own practice.
     *
     * `contemplative.cobreathe` is inferred as on whenever the style is the
     * breath and any side carries a contemplation (see its initializer), so a
     * rule with Creation Prayer as its EVENING anchor listed the practice
     * twice: once as "Evening Creation Prayer · 12 breaths" and again as
     * "Creation Prayer · With your prayer". The side's row is the truthful
     * one — it names when and how long — so the add-on row stands down.
     */
    ...((contemplative.cobreathe && !(cobreatheIsSideStyle && (contemplationBySide.morning || contemplationBySide.evening)))
      ? [{ emoji: "🌍", label: "Creation Prayer", sub: "Available all day", step: "contemplative" as Step, editId: "slot:cobreathe", remove: () => toggleContemplative("cobreathe") }] : []),
    ...(contemplative.audio ? [{ emoji: "🎵", label: "Audio Divina", sub: "Available all day", step: "contemplative" as Step, editId: "slot:listening", remove: () => toggleContemplative("audio") }] : []),
    ...(contemplative.examen ? [{ emoji: "🌗", label: "The Examen", sub: "Available all day", step: "contemplative" as Step, editId: "slot:examen", remove: () => toggleContemplative("examen") }] : []),
    // Visio was chosen on the contemplative slide and then MISSING here
    // (owner: "visio not showing at the end") — every other contemplative
    // practice had a row and this one never did, so it couldn't be seen or
    // ordered even though the home was already showing it.
    ...(contemplative.visio ? [{ emoji: "🖼️", label: "Visio Divina", sub: "Pray with the day's image", step: "contemplative" as Step, editId: "slot:visio", remove: () => toggleContemplative("visio") }] : []),
    // A ROW EACH (owner: "the reflections should be two different cards in the
    // orderer"). They were one "Today's reflection" row listing both names in
    // its subtitle — which is not what the home does (each reflection is its
    // own card) and left them impossible to order apart, since the row carried
    // the single id "card:reflection".
    ...newsletters.map((n) => {
      // NEWSLETTERS labels carry their own emoji ("🦩 VTS Dean's Commentary"),
      // and this row renders an emoji of its own — so split the label rather
      // than printing the glyph twice.
      const full = NEWSLETTERS.find((x) => x.id === n)?.label ?? n;
      const m = /^(\S+)\s+(.*)$/.exec(full);
      const hasEmoji = !!m && !/[A-Za-z0-9]/.test(m[1]!);
      return {
      emoji: hasEmoji ? m![1]! : "📖",
      label: hasEmoji ? m![2]! : full,
      sub: "Today's reflection",
      step: "learn" as Step,
      editId: `card:${n}`,
      remove: () => toggleNewsletter(n),
      };
    }),
    /**
     * Prayer List's home CARD. Its only edit is on/off, and the ✕ is the off —
     * there is no slide of options for it, so the row deliberately doesn't
     * navigate ("done" re-renders this review). It pointed at "extras", a
     * slide NO flow order contains: goNext's indexOf came back -1 there, so
     * Continue did nothing (this file's twice-documented dead-Continue bug),
     * and the slide had itself stopped offering Prayer List — a dead end that
     * couldn't even change the thing tapped.
     */
    ...(extras.prayerList ? [{ emoji: "🕊️", label: "My Prayer List", sub: "Pray through your own list", step: "done" as Step, remove: () => { touchedRef.current = true; setExtras((e) => ({ ...e, prayerList: false })); } }] : []),
    // The user's own custom practices — each tappable back into "Create your own".
    // A weekday-scoped practice says so: "Midday" alone described Community
    // Meal as an every-day practice, which is not what the rule set up.
    ...customList.map((a) => ({
      emoji: a.emoji || "🌿",
      label: a.title,
      sub: a.days && a.days.length > 0 && a.days.length < 7
        ? `${SLOT_LABEL[a.slot]} · ${describeDays(a.days)}`
        : SLOT_LABEL[a.slot],
      step: "custom" as Step,
      editId: `custom:${a.id}`,
      // A real anchor with server state — removeCustomAnchor tombstones it, so
      // dropping the row alone would let the next sync bring it straight back.
      remove: () => { touchedRef.current = true; removeCustomAnchor(a.id); setCustomList(getCustomAnchors()); },
    })),
    // Drop any row whose edit target is no longer in the flow (e.g. an existing
    // user's contemplative/extras cards under the limited customizer) — tapping
    // it would jump to an unreachable step and strand them. Their cards stay on
    // the home; the review just doesn't offer to edit what this flow can't.
  ].filter((r) => orderedSteps.includes(r.step));


  // ── Starter — a first author receives a named rule (adopt whole, tune later),
  // or chooses to build their own. Adopting commits the preset, then beholds it.
  if (step === "starter") {
    // The TIME-FIRST automatic transmission: pick how many minutes a day, and
    // the suggested rhythm for that amount renders live below the dial. One
    // tap adopts it whole (the review screen follows, everything adjustable).
    const stepDef = TIME_LADDER[timeIdx] ?? TIME_LADDER[TIME_LADDER_DEFAULT];
    return shell(
      <>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <span style={{ fontSize: 38 }} aria-hidden>🕊️</span>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.4px", fontFamily: FONT, margin: "14px 0 6px" }}>
            {t("wol_rule.starter_eyebrow", { defaultValue: "Your rule of life" })}
          </p>
          <h1 style={{ color: CREAM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0 }}>
            {t("wol_rule.time_title", { defaultValue: "How much time will you give each day?" })}
          </h1>
          <p style={{ color: SAGE, fontSize: 13.5, fontFamily: FONT, lineHeight: 1.55, margin: "10px auto 0", maxWidth: 332 }}>
            {t("wol_rule.time_sub", { defaultValue: "We'll shape a complete daily rhythm to fit it. You can change anything later." })}
          </p>
        </div>

        {/* The dial — minutes readout + a 5-minute-step slider. */}
        <div style={{ textAlign: "center", marginTop: 26 }}>
          <p style={{ color: CREAM, fontSize: 40, fontWeight: 700, fontFamily: FONT, margin: 0, lineHeight: 1 }}>
            {stepDef.minutes}
            <span style={{ fontSize: 15, fontWeight: 600, color: SAGE, marginLeft: 8 }}>
              {t("wol_rule.time_unit", { defaultValue: "minutes a day" })}
            </span>
          </p>
          <input
            type="range"
            min={0}
            max={TIME_LADDER.length - 1}
            step={1}
            value={timeIdx}
            onChange={(e) => { touchedRef.current = true; setTimeIdx(parseInt(e.target.value, 10)); }}
            aria-label={t("wol_rule.time_title", { defaultValue: "How much time will you give each day?" })}
            style={{ width: "100%", maxWidth: 340, marginTop: 18, accentColor: "#2D5E3F" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 340, margin: "4px auto 0" }}>
            <span style={{ color: SAGE_DIM, fontSize: 11, fontFamily: FONT }}>5 min</span>
            <span style={{ color: SAGE_DIM, fontSize: 11, fontFamily: FONT }}>30 min</span>
          </div>
        </div>

        {/* The suggested rhythm for this amount — live as the dial moves. */}
        <div style={{ background: CARD, ...FROST_BLUR, border: `1px solid ${CARD_B}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 16px", marginTop: 20 }}>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", fontFamily: FONT, margin: "0 0 10px" }}>
            {t("wol_rule.time_suggested", { defaultValue: "Your rhythm" })}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {stepDef.rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden>{r.emoji}</span>
                <span style={{ color: CREAM, fontSize: 14.5, fontWeight: 500, fontFamily: FONT }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => adoptRule(stepDef.preset)} style={{ marginTop: 16, width: "100%", background: "rgba(46,107,64,0.72)", ...FROST_BLUR, border: `1px solid ${CARD_B_ACTIVE}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)", color: CREAM, borderRadius: 14, padding: "16px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
          {t("wol_rule.time_cta", { defaultValue: "Keep this rhythm" })}
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16, alignItems: "center" }}>
          <button onClick={() => setLocation("/find-your-rhythm")} style={{ background: "none", border: "none", color: CREAM, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
            {t("wol_rule.starter_help_choose", { defaultValue: "Not sure? Help me choose →" })}
          </button>
          <button onClick={() => { touchedRef.current = true; setStep(pilot || guest ? "intro" : "sides"); }} style={{ background: "none", border: "none", color: SAGE, fontSize: 13.5, fontFamily: FONT, cursor: "pointer" }}>
            {t("wol_rule.starter_build_own", { defaultValue: "Or build my own →" })}
          </button>
        </div>
      </>,
    );
  }

  // ── Tend — re-entry (a rhythm already shaped) opens here, not the full flow:
  // a calm overview of the current rule, each row tappable to adjust. Reshaping
  // from scratch is available but quieter (a half-step weightier than tending).
  if (step === "tend") {
    return shell(
      <>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <span style={{ fontSize: 38 }} aria-hidden>🌿</span>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.4px", fontFamily: FONT, margin: "14px 0 6px" }}>
            {t("wol_rule.tend_eyebrow", { defaultValue: "Your rule of life" })}
          </p>
          <h1 style={{ color: CREAM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0 }}>
            {t("wol_rule.tend_title", { defaultValue: "Tend your rhythm" })}
          </h1>
          <p style={{ color: SAGE, fontSize: 13.5, fontFamily: FONT, lineHeight: 1.55, margin: "10px auto 0", maxWidth: 332 }}>
            {t("wol_rule.tend_sub", { defaultValue: "Adjust a time, or add and drop as your life changes. Tap any practice." })}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
          {reviewRowsRaw.map((r, i) => (
            <button key={`tend-${r.label}-${i}`} onClick={() => setStep(r.step)} style={{ background: CARD, ...FROST_BLUR, border: `1px solid ${CARD_B}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>{r.emoji}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", color: CREAM, fontSize: 15.5, fontWeight: 600, fontFamily: FONT }}>{r.label}</span>
                <span style={{ display: "block", color: SAGE, fontSize: 12.5, fontFamily: FONT, marginTop: 2 }}>{r.sub}</span>
              </span>
              <span style={{ color: "rgba(143,175,150,0.4)", fontSize: 16, flexShrink: 0 }} aria-hidden>›</span>
            </button>
          ))}
        </div>
        <button onClick={onDone} style={{ marginTop: 22, background: "rgba(46,107,64,0.72)", ...FROST_BLUR, border: `1px solid ${CARD_B_ACTIVE}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)", color: CREAM, borderRadius: 14, padding: "16px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
          {t("wol_rule.tend_done", { defaultValue: "That’s all for now" })}
        </button>
        <button onClick={() => { touchedRef.current = true; setStep(pilot || guest ? "intro" : "sides"); }} style={{ marginTop: 12, background: "none", border: "none", color: "rgba(143,175,150,0.7)", fontSize: 13, fontFamily: FONT, cursor: "pointer", textDecoration: "underline", textAlign: "center" }}>
          {t("wol_rule.tend_reshape", { defaultValue: "Reshape from scratch" })}
        </button>
      </>,
    );
  }
  /**
   * The flow's last screen is "Create your own"; its Save commits and hands
   * off to the home, so nothing normally renders here. This stays as the
   * component's required fallback — quiet, and never a half-built rule.
   */
  return shell(
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15 }}>
        {t("wol_rule.saving", { defaultValue: "Saving your rhythm…" })}
      </p>
    </div>,
  );
}
