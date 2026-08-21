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
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { getCustomAnchors, addCustomAnchor, removeCustomAnchor, getPracticeSlot, setPracticeSlot, CUSTOM_ANCHORS_EVENT, CUSTOM_SLOTS, READING_UNITS, type CustomAnchor, type CustomSlot, type ReadingUnit, type ReadingConfig } from "@/lib/customAnchors";
import { pushRoutineConfig, collectRoutineValues } from "@/lib/routineSync";
import { saveHomeLayout, cacheHomeLayoutLocalOnly } from "@/lib/homeLayoutCache";
import { setGuestSilenceGoalMin, getGuestSilenceGoalMinRaw } from "@/lib/guestSeed";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import {
  setSideLevel,
  setSideReflection,
  setSideMinutes,
  getSideMinutes,
  setReflectionSource,
  setSideEntry,
  getSideLevel,
  getExplicitSideLevel,
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
  type OfficeSide,
  type DefaultOfficeEntry,
} from "@/lib/officePrefs";
import { useBetaStatus } from "@/hooks/useDemo";
import { useKeyboardInputLift } from "@/hooks/useKeyboardInputLift";
import { WEEKLY_PRACTICES, getEnabledWeekly, setEnabledWeekly, WEEKLY_PRACTICES_ENABLED, type WeeklyKind } from "@/lib/weeklyRhythm";

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

// Keep in sync with dashboard.tsx / customize-home.tsx — finishing the rule
// stamps the home layout with this version so it persists past a global reset.
const HOME_LAYOUT_VERSION = 2;
const SIDES = ["morning", "evening"] as const;

// The OFFICE ANCHOR a side commits to. Contemplative Prayer and the Examen are
// NOT anchors — they're independent add-on cards (silence goal / examen home
// card), the same way Co-Breathe and Forward Day by Day ride alongside — so a
// side can hold a BCP office AND a silent sit AND the Examen, each its own card.
// "none" = no office anchor for this side (e.g. contemplation-only). The
// contemplation/fdd/examen values remain only so an OLD saved level still reads
// back (prayFromLevel) and migrates forward on the next save.
type PrayChoice = "none" | "community" | "devotion" | "offices" | "compline" | "contemplation" | "fdd" | "readings" | "psalms" | "examen" | "creation" | "guidedPrayer" | "ownPractice";

// Creation Prayer lengths — 6-breath increments, mirroring the /cobreathe
// page's own Length dropdown (default 12).
const COBREATHE_LENGTHS = [6, 12, 18, 24, 30, 36];
type Step =
  | "morning-way" | "morning-custom" | "morning-config"
  | "fdd-mode"
  | "psalms-cycle"
  | "evening-way" | "evening-custom" | "evening-config"
  | "contemplative" | "contemplation-goal"
  | "learn" | "extras" | "custom" | "weekly" | "done"
  | "starter" | "tend";
// Named starter rules — coherent forms a first author adopts WHOLE and tunes
// later (you receive a rule, you don't compose one from a blank trellis). Each
// applies to the same office-prefs + home-layout the full flow writes.
type RulePreset = {
  id: string; emoji: string;
  sides: { morning: boolean; evening: boolean };
  pray: PrayChoice;
  /** Evening's way when it differs from the morning (e.g. Morning Prayer +
   *  Evening Devotion). Omitted = same as `pray`. */
  evening?: PrayChoice;
  silence: boolean; goalMin: number;
  /** Which side carries the silent sit. Omitted = every side the preset turns
   *  on (the named rules); the time ladder pins ONE sit ("5 minutes of
   *  silence" means five, not five per side). */
  silenceSide?: "morning" | "evening";
  reflections: ReflectionSource[];
};
// Ordered by ascending commitment (least → most time), so a beginner reads down
// from the gentlest rule. Each maps to real schools of prayer: the catechumen's
// first anchor, the Benedictine psalter, the Keating/Centering stream, and
// prayer-book Anglicanism.
const RULE_PRESETS: RulePreset[] = [
  // A GENTLE START — the smallest rule: one short morning prayer. For beginning.
  { id: "morning-anchor", emoji: "🌅", sides: { morning: true, evening: false }, pray: "devotion", silence: false, goalMin: 0, reflections: ["fdd"] },
  // THE PSALMS — the shape a brand-new user already has on their home (Morning +
  // Evening Psalms + Forward Day by Day + a 5-minute silence). Keep in sync with
  // the new-user defaults: getSideLevel→"psalms", the FDD reflection fallback,
  // and the 5-minute starter goal in useRhythmState — so Customize opens
  // reflecting what's on the home, not a different rule.
  { id: "psalms-daily",   emoji: "📜", sides: { morning: true, evening: true },  pray: "psalms",   silence: true,  goalMin: 5,  reflections: ["fdd"] },
  // CENTERING PRAYER — two daily sits of silence in the school of Thomas Keating,
  // with the Center for Action & Contemplation's daily meditation. Contemplation
  // IS the prayer (pray "none" + silence), so it's the sit alone — no office.
  { id: "centering",      emoji: "🕯️", sides: { morning: true, evening: true },  pray: "none", silence: true, goalMin: 15, reflections: ["cac"] },
  // THE DAILY OFFICE — full Morning & Evening Prayer from the Book of Common Prayer.
  { id: "offices",        emoji: "📖", sides: { morning: true, evening: true },  pray: "offices",  silence: false, goalMin: 0, reflections: ["fdd"] },
];

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

// Contemplation goal options — a single dropdown in 5-minute increments.
const GOAL_OPTIONS = Array.from({ length: 17 }, (_, i) => (i + 2) * 5); // 10…90

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
  return p === "offices" || p === "compline" || p === "devotion" || p === "psalms" || p === "readings" || p === "community" || p === "creation" || p === "guidedPrayer" || p === "ownPractice" ? p : "none";
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

// Is a home module currently surfaced? Mirrors the dashboard's gate: only a
// current-version layout counts, and the key must be in `order` and not
// `hidden`. Used to seed the optional-practice toggles from the live home.
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
  // (Removed: the weekly-cards step's own on/off state. That step is gone and
  // the card defaults ON — its toggle lives in Settings → Home display, which
  // owns the same phoebe:hide-turn-learn-pray key.)
  // A brand-new author — nobody has chosen a side level yet — is offered the
  // preset picker ("automatic mode"): four whole rules to adopt and tune, so
  // they don't have to know how to "drive stick" to begin. Anyone with an
  // existing rule (or the trimmed pilot flow) opens straight into the manual
  // shaping flow. "Or build my own →" drops into it too.
  //
  // That entry point is "morning-way" now, not the removed "when" step — a
  // default of "when" would open the flow on a step no longer in orderedSteps,
  // so indexOf would be -1 and Continue would do nothing.
  const [step, setStep] = useState<Step>(() => {
    // Guests always open the manual flow: their rule is already running (the
    // first-open seed), so the preset picker would re-adopt over it.
    if (pilot || guest) return "morning-way";
    const hasRule = !!getExplicitSideLevel("morning") || !!getExplicitSideLevel("evening");
    return hasRule ? "morning-way" : "starter";
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
  const [prayBySide, setPrayBySide] = useState<Record<OfficeSide, PrayChoice>>(() => ({
    morning: anchorFromLevel(getSideLevel("morning"), "morning"),
    evening: anchorFromLevel(getSideLevel("evening"), "evening"),
  }));
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
  // "90 minutes" on each card — owner). Values outside the picker's 5–30
  // range are legacy artifacts of the old goal-splash and read as unset.
  const sideSit = (side: OfficeSide): number => {
    const raw = getSideMinutes(side);
    return raw >= 5 && raw <= 30 ? raw : 15;
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
  const [newsletters, setNewsletters] = useState<ReflectionSource[]>(() => {
    const fromLayout = (["cac", "fdd", "ssje", "vts"] as const).filter((s) => homeCardOn(user?.homeLayout, s));
    if (fromLayout.length > 0) return [...fromLayout];
    const r = getReflectionSource();
    return r && r !== "none" ? [r] : ["fdd"];
  });
  // When to nudge them to pray, per side. Finishing turns the matching reminder
  // pref ON (pref != "none") so the server's daily push actually fires.
  const [timeBySide, setTimeBySide] = useState<Record<OfficeSide, string>>(() => ({
    morning: DEFAULT_REMINDER_TIME,
    evening: "18:00",
  }));
  // Whether to nudge at all on each side. "No reminder" sets the side's pref to
  // "none" so the server's daily push doesn't fire — the practice still counts
  // toward the rhythm, it just goes un-prompted. Default on.
  const [reminderOnBySide, setReminderOnBySide] = useState<Record<OfficeSide, boolean>>(() => ({
    morning: true,
    evening: true,
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
    nextOn: Record<OfficeSide, boolean>,
    nextTime: Record<OfficeSide, string>,
  ) => {
    // Guests have no office-prefs row to write to; their rhythm is local-only
    // until they have an account.
    if (!user || guest) return;
    if (reminderSaveTimer.current) clearTimeout(reminderSaveTimer.current);
    reminderSaveTimer.current = setTimeout(() => {
      apiRequest("PUT", "/api/me/office-prefs", {
        morning: sides.morning && nextOn.morning ? PRAY_REMINDER_PREF[prayBySide.morning] : "none",
        evening: sides.evening && nextOn.evening ? PRAY_REMINDER_PREF[prayBySide.evening] : "none",
        morningTime: nextOn.morning ? (/^\d{2}:\d{2}$/.test(nextTime.morning) ? nextTime.morning : DEFAULT_REMINDER_TIME) : null,
        eveningTime: nextOn.evening ? (/^\d{2}:\d{2}$/.test(nextTime.evening) ? nextTime.evening : "18:00") : null,
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
    const fromLayout = (["cac", "fdd", "ssje", "vts"] as const).filter((s) => homeCardOn(user.homeLayout, s));
    if (fromLayout.length > 0) setNewsletters([...fromLayout]);
    // Contemplative Prayer + the Examen are add-ons now (not office anchors), so
    // seed them from the saved office LEVEL (reflect-sit / examen) — plus the
    // examen home card — rather than from prayBySide.
    const silentSeed = getSideContemplation("morning") || getSideContemplation("evening") || getSideLevel("morning") === "reflect-sit" || getSideLevel("evening") === "reflect-sit";
    const examenSeed = homeCardOn(user.homeLayout, "examen") || getSideLevel("morning") === "examen" || getSideLevel("evening") === "examen";
    setContemplative((c) => touchedRef.current ? c : {
      cobreathe: homeCardOn(user.homeLayout, "cobreathe") || (contemplationStyle === "cobreathe" && silentSeed),
      audio: homeCardOn(user.homeLayout, "listening"),
      examen: examenSeed,
      walk: homeCardOn(user.homeLayout, "walk"),
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
  const [contemplative, setContemplative] = useState<{ cobreathe: boolean; audio: boolean; examen: boolean; walk: boolean; compline: boolean }>(() => ({
    // The Examen is an add-on, seeded from the saved level + the examen home card.
    cobreathe: homeCardOn(user?.homeLayout, "cobreathe") || (contemplationStyle === "cobreathe" && (getSideContemplation("morning") || getSideContemplation("evening") || getSideLevel("morning") === "reflect-sit" || getSideLevel("evening") === "reflect-sit")),
    audio: homeCardOn(user?.homeLayout, "listening"),
    examen: homeCardOn(user?.homeLayout, "examen") || getSideLevel("morning") === "examen" || getSideLevel("evening") === "examen",
    walk: homeCardOn(user?.homeLayout, "walk"),
    compline: homeCardOn(user?.homeLayout, "compline"),
  }));
  const toggleContemplative = (k: "cobreathe" | "audio" | "examen" | "walk" | "compline") => {
    touchedRef.current = true;
    setContemplative((c) => ({ ...c, [k]: !c[k] }));
  };
  // Contemplative Prayer is now PER SIDE — a silent sit as a Morning and/or
  // Evening card, each its own card + completed independently. Seed from the
  // explicit per-side flag; else the legacy reflect-sit level for that side.
  // (A pre-existing single silence goal is migrated to both sides in the
  // office-prefs hydration effect below.)
  const [contemplationBySide, setContemplationBySide] = useState<Record<OfficeSide, boolean>>(() => ({
    morning: getSideContemplationExplicit("morning") ?? (getSideLevel("morning") === "reflect-sit"),
    evening: getSideContemplationExplicit("evening") ?? (getSideLevel("evening") === "reflect-sit"),
  }));
  const anyContemplation = contemplationBySide.morning || contemplationBySide.evening;
  const toggleContemplationSide = (side: OfficeSide) => {
    touchedRef.current = true;
    setContemplationBySide((p) => ({ ...p, [side]: !p[side] }));
  };
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
  // Picking ANY practice for a side also clears a pending "None" on it —
  // every row on the way slide routes through here, so choosing a practice
  // after tapping None can't leave None still marked and silently switch the
  // side off on Continue.
  const choosePrayBySide = (side: OfficeSide, p: PrayChoice) => {
    touchedRef.current = true;
    setSideOffPending((prev) => (prev[side] ? { ...prev, [side]: false } : prev));
    setPrayBySide((prev) => ({ ...prev, [side]: p }));
  };
  const chooseMethodBySide = (side: OfficeSide, m: DefaultOfficeEntry) => { touchedRef.current = true; setMethodBySide((prev) => ({ ...prev, [side]: m })); };
  const chooseGoal = (g: string) => { touchedRef.current = true; setGoal(g); };
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
      setGoal(String(prefs.contemplationGoalMinutes));
      // An existing silence goal means Contemplative Prayer is already part of the
      // rhythm. Migrate a legacy GLOBAL goal (no explicit per-side pick yet) onto
      // BOTH sides so it opens with Morning + Evening Contemplation checked; an
      // explicit per-side choice is left untouched.
      if (getSideContemplationExplicit("morning") === null && getSideContemplationExplicit("evening") === null) {
        setContemplationBySide((p) => touchedRef.current ? p : { morning: true, evening: true });
      }
    }
    setTimeBySide((prev) => ({
      morning: typeof prefs.morningTime === "string" && /^\d{2}:\d{2}$/.test(prefs.morningTime) ? prefs.morningTime : prev.morning,
      evening: typeof prefs.eveningTime === "string" && /^\d{2}:\d{2}$/.test(prefs.eveningTime) ? prefs.eveningTime : prev.evening,
    }));
    // A saved side pref of "none" means they'd previously turned that reminder
    // off — reflect it so reopening Customize shows "No reminder" selected.
    setReminderOnBySide({
      morning: prefs.morning !== "none",
      evening: prefs.evening !== "none",
    });
    // Which sides are part of the rhythm comes from the SERVER office pref
    // ("none" = off) — the authoritative on/off. The local per-side level has no
    // "off" state, so seeding `sides` from it kept a side the user had turned
    // off still looking selected. Fall back to morning-only if neither is on.
    {
      const mOn = prefs.morning !== "none";
      const eOn = prefs.evening !== "none";
      setSides(mOn || eOn ? { morning: mOn, evening: eOn } : { morning: true, evening: false });
    }
    if (prefs.notificationStyle === "nudge") setNotificationStyle("nudge");
  }, [prefs]);

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
    const anySideSilentContemplation = anyContemplation && contemplationStyle === "silent";
    const effGoalMin = goalMin > 0 ? goalMin : (anySideSilentContemplation ? 10 : 0);
    for (const side of SIDES) {
      if (sides[side]) {
        setSideLevel(side, PRAY_LEVEL[prayBySide[side]]);
        setSideEntry(side, methodBySide[side]);
        setSideReflection(side, primary);
        persistCommunityWithOffice(side, prayBySide[side] !== "community" && communityWithOffice[side]);
        setSideContemplation(side, contemplationBySide[side]);
        // Sit length is per side (config picker), NOT the daily goal.
        if (contemplationBySide[side]) setSideMinutes(side, minutesBySide[side]);
        if (prayBySide[side] === "ownPractice") setSideCustomName(side, customNameBySide[side].trim());
      } else {
        setSideLevel(side, "ask");
        persistCommunityWithOffice(side, false);
        setSideContemplation(side, false);
      }
    }
    setReflectionSource(primary);
    // The office reminder pref / default level mirror a side that actually has an
    // office anchor (morning first); fall back to the first chosen side otherwise.
    const officeSides = SIDES.filter((s) => sides[s] && prayBySide[s] !== "none");
    const primarySide: OfficeSide = officeSides[0] ?? (sides.morning ? "morning" : "evening");
    // The "grow toward 30" ladder was removed — always a fixed goal now, so the
    // ladder is never enabled (and a returning grow-user is switched to fixed).
    const wantLadder = false;
    const officePrefs = {
      defaultPrayerLevel: (() => {
        const lvl = PRAY_LEVEL[prayBySide[primarySide]];
        // Only office/devotion/intercessions are valid server default levels;
        // everything else (ask/reflect-sit/fdd/psalms/examen) folds to devotion.
        return lvl === "office" || lvl === "devotion" || lvl === "intercessions" ? lvl : "devotion";
      })(),
      contemplationGoalMinutes: effGoalMin,
      contemplationReminderEnabled: effGoalMin > 0 || wantLadder,
      morning: (sides.morning && reminderOnBySide.morning ? PRAY_REMINDER_PREF[prayBySide.morning] : "none") as "office" | "devotion" | "none",
      evening: (sides.evening && reminderOnBySide.evening ? PRAY_REMINDER_PREF[prayBySide.evening] : "none") as "office" | "devotion" | "none",
      morningTime: reminderOnBySide.morning ? (/^\d{2}:\d{2}$/.test(timeBySide.morning) ? timeBySide.morning : DEFAULT_REMINDER_TIME) : null,
      eveningTime: reminderOnBySide.evening ? (/^\d{2}:\d{2}$/.test(timeBySide.evening) ? timeBySide.evening : "18:00") : null,
    };
    const others = (["cac", "fdd", "ssje", "vts"] as const).filter((n) => !newsletters.includes(n));
    // Creation Prayer earns a home card either through the per-side "way"
    // choice (a side's contemplation IS the breath) OR the standalone
    // "Add an additional practice" toggle (contemplative.cobreathe) — the
    // latter is only offered there when NEITHER side already carries it, so
    // the two paths never fight over the same card.
    const wantCobreathe = (contemplationStyle === "cobreathe" && anyContemplation) || contemplative.cobreathe;
    // Compline earns a home card ONLY as a standalone add-on. When it's a
    // side's office ANCHOR (the evening way-step choice) that side's own card
    // IS Compline, so a second "compline" module would double it on the home —
    // same one-practice-two-paths guard wantCobreathe applies above.
    const wantComplineCard = contemplative.compline && prayBySide.evening !== "compline" && prayBySide.morning !== "compline";
    const onKeys = [
      ...(extras.prayerList ? ["prayer-list"] : []),
      ...(extras.reading ? ["reading"] : []),
      ...(extras.podcasts ? ["podcasts"] : []),
      ...(wantComplineCard ? ["compline"] : []),
      ...(contemplative.examen ? ["examen"] : []),
      ...(contemplative.audio ? ["listening"] : []),
      ...(contemplative.walk ? ["walk"] : []),
      ...(wantCobreathe ? ["cobreathe"] : []),
    ];
    const offKeys = [
      ...(extras.prayerList ? [] : ["prayer-list"]),
      ...(extras.reading ? [] : ["reading"]),
      ...(extras.podcasts ? [] : ["podcasts"]),
      ...(wantComplineCard ? [] : ["compline"]),
      ...(contemplative.examen ? [] : ["examen"]),
      ...(contemplative.audio ? [] : ["listening"]),
      ...(contemplative.walk ? [] : ["walk"]),
      ...(wantCobreathe ? [] : ["cobreathe"]),
    ];
    const order = ["requests", "office", "contemplation", ...newsletters, ...onKeys, "feeds", "ncmp", "podcasts", ...offKeys, ...others];
    const hidden = ["ncmp", "podcasts", ...offKeys, ...others];
    // The captured rule-config is the DESIGNER's device snapshot — strip keys
    // that are personal state rather than routine structure. Without this,
    // everyone adopting the rule inherits the designer's own 30-day
    // commitment start (their "Day N of 30" opens mid-trial, or is wiped when
    // the designer has none, since applying a config REMOVES omitted keys).
    const ruleConfig = collectRoutineValues();
    delete ruleConfig["phoebe:commitment-start"];
    return {
      v: 1,
      officePrefs,
      silenceLadderEnabled: wantLadder,
      homeLayout: { order, hidden, v: HOME_LAYOUT_VERSION },
      ruleConfig,
    };
  };

  const commit = () => {
    // Prescribe mode: capture the routine and hand it back, writing NOTHING to
    // the (admin) user's own account. The prescribe page takes it from here.
    if (prescribe && onPrescribe) { onPrescribe(buildPrescribeSpec()); return; }
    // "none" reflection → no newsletter card; otherwise the first picked source
    // is the per-side close-slide reflection.
    const primary: ReflectionSource = newsletters[0] ?? "none";
    // Silence is its own step now (a daily-minutes goal) — the chosen value IS the
    // goal (0 = None). Contemplative Prayer is an add-on (its own silence card),
    // so a silent sit is wanted whenever it's checked — fall back to 10 min then.
    const anySideSilentContemplation = anyContemplation && contemplationStyle === "silent";
    const effGoalMin = goalMin > 0 ? goalMin : (anySideSilentContemplation ? 10 : 0);
    for (const side of SIDES) {
      if (sides[side]) {
        setSideLevel(side, PRAY_LEVEL[prayBySide[side]]);
        setSideEntry(side, methodBySide[side]);
        setSideReflection(side, primary);
        // Remember the Prayer List + BCP merge so the row stays checked on
        // re-open (only meaningful when the office anchor isn't community itself).
        persistCommunityWithOffice(side, prayBySide[side] !== "community" && communityWithOffice[side]);
        // Per-side Contemplative Prayer → the home's Morning/Evening Contemplation card.
        setSideContemplation(side, contemplationBySide[side]);
        // Sit length is per side (config picker), NOT the daily goal — a
        // 90-minute goal must not put a 90-minute sit on each card (owner).
        if (contemplationBySide[side]) setSideMinutes(side, minutesBySide[side]);
        if (prayBySide[side] === "ownPractice") setSideCustomName(side, customNameBySide[side].trim());
      } else {
        // Not part of their chosen rhythm — clear the level so it isn't a
        // programmed office for that side.
        setSideLevel(side, "ask");
        persistCommunityWithOffice(side, false);
        setSideContemplation(side, false);
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
    const wantLadder = false;
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
      contemplationGoalMinutes: effGoalMin,
      contemplationReminderEnabled: effGoalMin > 0 || wantLadder,
      // Each chosen side turns its reminder ON (a non-"none" pref is what makes
      // the server's daily office-reminder push fire) at its chosen time.
      // A side reminds only when it's part of the rhythm AND they didn't pick
      // "No reminder"; otherwise "none" keeps the daily push silent.
      morning: sides.morning && reminderOnBySide.morning ? PRAY_REMINDER_PREF[prayBySide.morning] : "none",
      evening: sides.evening && reminderOnBySide.evening ? PRAY_REMINDER_PREF[prayBySide.evening] : "none",
      morningTime: reminderOnBySide.morning ? (/^\d{2}:\d{2}$/.test(timeBySide.morning) ? timeBySide.morning : DEFAULT_REMINDER_TIME) : null,
      eveningTime: reminderOnBySide.evening ? (/^\d{2}:\d{2}$/.test(timeBySide.evening) ? timeBySide.evening : "18:00") : null,
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
    const others = (["cac", "fdd", "ssje", "vts"] as const).filter((n) => !newsletters.includes(n));
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
    const wantCobreathe = (contemplationStyle === "cobreathe" && anyContemplation) || contemplative.cobreathe;
    // Compline earns a home card ONLY as a standalone add-on. When it's a
    // side's office ANCHOR (the evening way-step choice) that side's own card
    // IS Compline, so a second "compline" module would double it on the home —
    // same one-practice-two-paths guard wantCobreathe applies above.
    const wantComplineCard = contemplative.compline && prayBySide.evening !== "compline" && prayBySide.morning !== "compline";
    const onKeys = [
      ...(extras.prayerList ? ["prayer-list"] : []),
      ...(extras.reading ? ["reading"] : []),
      ...(extras.podcasts ? ["podcasts"] : []),
      ...(wantComplineCard ? ["compline"] : []),
      ...(contemplative.examen ? ["examen"] : []),
      ...(contemplative.audio ? ["listening"] : []),
      ...(contemplative.walk ? ["walk"] : []),
      ...(wantCobreathe ? ["cobreathe"] : []),
    ];
    const offKeys = [
      ...(extras.prayerList ? [] : ["prayer-list"]),
      ...(extras.reading ? [] : ["reading"]),
      ...(extras.podcasts ? [] : ["podcasts"]),
      ...(wantComplineCard ? [] : ["compline"]),
      ...(contemplative.examen ? [] : ["examen"]),
      ...(contemplative.audio ? [] : ["listening"]),
      ...(contemplative.walk ? [] : ["walk"]),
      ...(wantCobreathe ? [] : ["cobreathe"]),
    ];
    const order = ["requests", "office", "contemplation", ...newsletters, ...onKeys, "feeds", "ncmp", "podcasts", ...offKeys, ...others];
    // "feeds" stays visible (self-hides until you subscribe to a prayer feed).
    const hidden = ["ncmp", "podcasts", ...offKeys, ...others];
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
    setStep("done");
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
    setContemplationStyle("silent");
    setContemplative({ cobreathe: false, audio: false, examen: false, walk: false, compline: false });
    // A starter rule's silence applies to whichever sides it turns on.
    setContemplationBySide({
      morning: preset.silence && preset.sides.morning && preset.silenceSide !== "evening",
      evening: preset.silence && preset.sides.evening && preset.silenceSide !== "morning",
    });
    // Starter rules carry a fixed minutes goal — adopt the fixed sizing, not the ladder.
    setSilenceMode("fixed");
    setGoal(String(preset.silence ? preset.goalMin : 0));
    // The preset's sit IS its promise ("5 minutes of silence" = one 5-minute
    // sit) — size each side's card to it.
    setMinutesBySide({
      morning: preset.silence && preset.goalMin >= 5 && preset.goalMin <= 30 ? preset.goalMin : 15,
      evening: preset.silence && preset.goalMin >= 5 && preset.goalMin <= 30 ? preset.goalMin : 15,
    });
    setNewsletters(preset.reflections);
    setExtras({ examen: false, listening: false, reading: false, podcasts: false, prayerList: false });
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
  const shell = (children: ReactNode) => (
    <div style={{ flex: 1, minHeight: 0, background: "transparent", position: "relative", isolation: "isolate", display: "flex", flexDirection: "column" }}>
      <div className="px-4 sm:px-6 md:px-8" style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", paddingTop: 24, paddingBottom: 40 }}>
        {/* Full width on mobile; on larger screens capped + centered at the SAME
            56rem the home uses (.dash-shell) so the customizer cards are exactly
            as wide as the home-screen cards, not a narrower column. */}
        <div className="w-full md:max-w-[56rem] md:mx-auto" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
    </div>
  );

  // The ordered input steps depend on which sides they chose — so the progress
  // bar and the "N/M" both adjust to the options picked.
  // Forward Day by Day asks a written/audio MEDIUM whenever it's chosen. FDD is
  // now always an add-on reflection (in `newsletters`), never a side office
  // anchor. The Psalms CYCLE is folded into each side's config slide.
  const needsFddMode = newsletters.includes("fdd");
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
  const buildSteps = (sidesArg: Record<OfficeSide, boolean>): Step[] => guest
    // GUEST (public no-login): when → per-side way + ONE merged config slide
    // (the BCP form + medium + reminder all live on side-config — no separate
    // side-bcp slide: "there doesn't need to be more than one slide") → learn →
    // silence goal (fixed only) → custom. No contemplative multi-select, no
    // extras, no weekly.
    ? [
        "morning-way",
        ...(sidesArg.morning ? (["morning-config"] as Step[]) : []),
        "evening-way",
        ...(sidesArg.evening ? (["evening-config"] as Step[]) : []),
        "learn",
        ...(needsFddMode ? (["fdd-mode"] as Step[]) : []),
        "contemplation-goal",
        "custom",
      ]
    : pilot
    // Pilot: morning/evening → reflections → silence → one custom anchor. No
    // contemplative multi-select, no per-practice slots, no extras, no weekly.
    ? [
        "morning-way",
        ...(sidesArg.morning ? ([...(prayBySide.morning === "ownPractice" ? ["morning-custom"] : []), "morning-config"] as Step[]) : []),
        "evening-way",
        ...(sidesArg.evening ? ([...(prayBySide.evening === "ownPractice" ? ["evening-custom"] : []), "evening-config"] as Step[]) : []),
        "learn",
        ...(needsFddMode ? (["fdd-mode"] as Step[]) : []),
        "contemplation-goal",
        "custom",
      ]
    : [
    "morning-way",
    ...(sidesArg.morning ? ([...(prayBySide.morning === "ownPractice" ? ["morning-custom"] : []), "morning-config"] as Step[]) : []),
    "evening-way",
    ...(sidesArg.evening ? ([...(prayBySide.evening === "ownPractice" ? ["evening-custom"] : []), "evening-config"] as Step[]) : []),
    // Reflection (the daily word) is chosen BEFORE contemplation now — you pick
    // what you'll read/listen to, then how you'll sit with it.
    "learn",
    // FDD medium choice — asked AFTER the reflection/prayer is picked, so it
    // covers FDD-as-reflection too (applies wherever FDD is used: both sides).
    ...(needsFddMode ? (["fdd-mode"] as Step[]) : []),
    // Silence (the daily-minutes goal, i.e. the silent sit).
    "contemplation-goal",
    // "Add an additional practice" — Audio Divina, Contemplative Walk, the
    // Examen, and (when neither side already carries it as their primary
    // prayer) Creation Prayer. No time-of-day detail step after this one
    // anymore — each is just available all day, not slotted to a part of
    // the day. The "Add to your day" extras step (Reading, Podcasts, Prayer
    // List) is still reachable from the Practices page instead, not here.
    "contemplative",
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
  const [sideOffPending, setSideOffPending] = useState<Record<OfficeSide, boolean>>(() => ({
    morning: !sides.morning,
    evening: !sides.evening,
  }));
  const wayContinue = (side: OfficeSide) => {
    const turningOff = sideOffPending[side];
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
    if (i >= 0 && i < next.length - 1) setStep(next[i + 1]);
  };
  const goNext = () => { const i = orderedSteps.indexOf(step); if (i >= 0 && i < orderedSteps.length - 1) setStep(orderedSteps[i + 1]); };
  const goPrev = () => { const i = orderedSteps.indexOf(step); if (i > 0) setStep(orderedSteps[i - 1]); else onBack(); };
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
    const showEyebrow = eyebrow.trim().toLowerCase() !== title.trim().toLowerCase();
    return (
      <>
        <div style={{ height: 3, background: CARD_B, borderRadius: 2, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ width: `${(n / totalSteps) * 100}%`, height: "100%", background: SAGE, transition: "width 0.3s ease" }} />
        </div>
        <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, fontFamily: FONT }}>
          {t("wol_rule.walk", { defaultValue: "Your daily rhythm of prayer" })}
        </p>
        {showEyebrow && (
          <p style={{ color: SAGE, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.9px", margin: "16px 0 0", fontFamily: FONT }}>{eyebrow}</p>
        )}
        <h1 style={{ color: CREAM, fontSize: 30, fontWeight: 700, fontFamily: FONT, margin: showEyebrow ? "6px 0 0" : "16px 0 0" }}>{title}</h1>
      </>
    );
  };

  // Continue + a bottom Back bar (the top Back row was removed). Back uses
  // goPrev, which steps back through the dynamic flow (or exits on the first
  // step). Tapping the right side of the screen also goes back (see shell).
  const ctaButton = (label: string, onClick: () => void) => (
    // marginTop:auto pins Continue (+ Back) to the BOTTOM of the flow's flex
    // column, so it sits in the same spot on every slide instead of riding up and
    // down with each step's content. paddingTop keeps a gap on the tall steps.
    <div style={{ marginTop: "auto", paddingTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <button onClick={onClick} style={{ width: "100%", background: "rgba(46,107,64,0.55)", ...FROST_BLUR, border: `1px solid ${CARD_B_ACTIVE}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", color: CREAM, borderRadius: 12, padding: "15px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
        {label}
      </button>
      <button onClick={goPrev} style={{ marginTop: 4, background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "10px 12px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: FONT }}>
        <ChevronLeft size={16} /> {t("ruleOfLife.back", { defaultValue: "Back" })}
      </button>
    </div>
  );

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
  if (isSuperAdmin && !guest && !pilot && !prescribe && !entryChoiceMade) {
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {choiceRow(
            false,
            `✍️ ${t("wol_rule.entry_manual", { defaultValue: "I'll set it up myself" })}`,
            t("wol_rule.entry_manual_sub", { defaultValue: "Go through the slides and choose each practice." }),
            () => setEntryChoiceMade(true),
          )}
          {choiceRow(
            false,
            `💬 ${t("wol_rule.entry_ask", { defaultValue: "Ask me about my practice" })}`,
            t("wol_rule.entry_ask_sub", { defaultValue: "Describe how you already pray, in your own words, and Phoebe programs it for you." }),
            () => setLocation("/routine-interview"),
          )}
        </div>
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
    const creationAlreadyPrimary = contemplationStyle === "cobreathe" && (contemplationBySide.morning || contemplationBySide.evening);
    // Same reasoning for the Examen: since evening's "Simple Guided Prayer" row
    // now doubles as the Examen (see the morning/evening "way" step), a user who
    // reaches this step with evening set that way already has the Examen as
    // their evening prayer — offering it again here as an "additional" extra
    // would be a confusing duplicate toggle for the same practice.
    const examenAlreadyPrimary = prayBySide.morning === "examen" || prayBySide.evening === "examen";
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
        {stepHeader(t("wol_rule.contemplative_eyebrow", { defaultValue: "Return" }), t("wol_rule.contemplative_title", { defaultValue: "Add an additional practice" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 20px" }}>
          {t("wol_rule.contemplative_body", { defaultValue: "Beyond silence, choose any other contemplative practices for your day — each becomes its own card." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!complineAlreadyPrimary && choiceRow(contemplative.compline, `🌙 ${t("wol_rule.cp_compline", { defaultValue: "Compline" })}`, t("wol_rule.cp_compline_sub", { defaultValue: "The night office — available from 7pm." }), () => toggleContemplative("compline"))}
          {choiceRow(contemplative.audio, `🎵 ${t("wol_rule.cp_audio", { defaultValue: "Audio Divina" })}`, t("wol_rule.cp_audio_sub", { defaultValue: "Sacred listening." }), () => toggleContemplative("audio"))}
          {!examenAlreadyPrimary && choiceRow(contemplative.examen, `🌗 ${t("wol_rule.cp_examen", { defaultValue: "The Examen" })}`, t("wol_rule.cp_examen_sub", { defaultValue: "Review the day with God." }), () => toggleContemplative("examen"))}
          {!creationAlreadyPrimary && choiceRow(contemplative.cobreathe, `🌍 ${t("wol_rule.cp_cobreathe", { defaultValue: "Creation Prayer" })}`, t("wol_rule.cp_cobreathe_sub", { defaultValue: "Breathing together with God's creation" }), () => toggleContemplative("cobreathe"))}
          {choiceRow(contemplative.walk, `🚶 ${t("wol_rule.cp_walk", { defaultValue: "Contemplative Walk" })}`, t("wol_rule.cp_walk_sub", { defaultValue: "A walk as prayer." }), () => toggleContemplative("walk"))}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Silence — the daily-minutes goal (the silent sit), chosen FIRST ───────
  if (step === "contemplation-goal") {
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(t("wol_rule.silence_eyebrow", { defaultValue: "Return" }), t("wol_rule.silence_title", { defaultValue: "Silence" }))}
        {/* Just the fixed daily-minutes goal — the "grow toward 30" ladder option
            was removed (owner); everyone sets a fixed amount. */}
        <div style={{ position: "relative", marginTop: 24 }}>
          <select
            value={String(goalMin)}
            onChange={(e) => chooseGoal(e.target.value)}
            aria-label={t("wol_rule.silence_goal_label", { defaultValue: "Choose how much silence you'd like to practice each day." })}
            style={{ ...FROST_BLUR, width: "100%", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
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

  // ── Per-side WAY slide — titled "Morning" / "Evening" ─────────────────────
  if (step === "morning-way" || step === "evening-way") {
    const side: OfficeSide = step === "morning-way" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, cap)}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.side_way_body", { side: cap.toLowerCase(), defaultValue: `How will you pray in the ${cap.toLowerCase()}?` })}
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
              follow the Examen (labeled "Simple Prayerful Reflection" rather
              than "Simple Guided Prayer", since PACT itself is a morning shape)
              — matching the same morning-PACT/evening-Examen pairing already
              shipped in the light /customize picker. */}
          {(() => {
            const isEveningExamen = side === "evening";
            const selected = isEveningExamen ? prayBySide[side] === "examen" : prayBySide[side] === "guidedPrayer";
            const sub = isEveningExamen
              ? t("wol_rule.pray_examen_sub", { defaultValue: "Review the day with God." })
              : t("wol_rule.pray_guided_prayer_sub", { defaultValue: "Three Minutes to Start Your Day" });
            const label = isEveningExamen
              ? t("wol_rule.pray_prayerful_reflection_label", { defaultValue: "Simple Prayerful Reflection" })
              : t("wol_rule.pray_guided_prayer_label", { defaultValue: "Simple Guided Prayer" });
            return choiceRow(
              selected,
              `🙌 ${label}`,
              sub,
              () => {
                if (selected) return; // already selected
                touchedRef.current = true;
                if (contemplationBySide[side]) toggleContemplationSide(side);
                choosePrayBySide(side, isEveningExamen ? "examen" : "guidedPrayer");
              },
            );
          })()}
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
              if (bcpOn) return; // already selected — nothing to switch
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
            contemplationBySide[side] && contemplationStyle === "silent",
            `🕯️ ${t("wol_rule.cp_contemplation", { defaultValue: "Contemplative Prayer" })}`,
            t("wol_rule.cp_contemplation_sub", { defaultValue: "A silent sit — loving God in silence." }),
            () => {
              const on = contemplationBySide[side] && contemplationStyle === "silent";
              if (on) return; // already selected — nothing to switch
              touchedRef.current = true;
              if (side === "evening" && prayBySide[side] === "examen") setContemplative((c) => ({ ...c, examen: false }));
              choosePrayBySide(side, "none");
              if (!contemplationBySide[side]) toggleContemplationSide(side);
              chooseContemplationStyle("silent");
              chooseSideMinutes(side, 10);
              if (goalMin === 0) { chooseGoal("20"); chooseSilenceMode("fixed"); }
            },
          )}
          {/* Forward Day by Day as the morning prayer itself — morning only,
              above "Create your own" at the bottom of the list (owner).
              Choosing it also follows it as a daily reflection (see the
              "learn" step below), so it shows checked there too — same
              signal in both places. Unchecking it on "learn" later is
              fine; that step notes when it's still the morning practice
              even if unchecked as a reflection. */}
          {side === "morning" && choiceRow(
            prayBySide[side] === "fdd",
            `📖 ${t("wol_rule.pray_fdd_label", { defaultValue: "Forward Day by Day" })}`,
            t("wol_rule.pray_fdd_sub", { defaultValue: "Today's meditation from Forward Movement." }),
            () => {
              if (prayBySide[side] === "fdd") return; // already selected
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
            prayBySide[side] === "ownPractice",
            `✨ ${t("wol_rule.cp_custom", { defaultValue: "Create your own" })}`,
            t("wol_rule.cp_custom_sub", { defaultValue: "Name a practice of your own." }),
            () => {
              if (prayBySide[side] === "ownPractice") return; // already selected
              touchedRef.current = true;
              if (side === "evening" && prayBySide[side] === "examen") setContemplative((c) => ({ ...c, examen: false }));
              if (contemplationBySide[side]) toggleContemplationSide(side);
              choosePrayBySide(side, "ownPractice");
            },
          )}
          {/* None — turn this side off entirely (owner). Replaces the removed
              "when" step's Morning/Evening checkboxes. Deferred: this only
              marks the row; `sides` flips on Continue (see wayContinue), so
              the slide the user is standing on can't vanish under them. */}
          {choiceRow(
            sideOffPending[side],
            `🚫 ${t("wol_rule.pray_none_label", { defaultValue: "None" })}`,
            t("wol_rule.pray_none_sub", {
              side: cap.toLowerCase(),
              defaultValue: `No ${cap.toLowerCase()} prayer — skip this side of the day.`,
            }),
            () => {
              if (sideOffPending[side]) return; // already selected
              touchedRef.current = true;
              setSideOffPending((p) => ({ ...p, [side]: true }));
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
    // Quick picks below the text field, from Phoebe's own contemplative-
    // practice vocabulary (same names/emoji as the "Add an additional
    // practice" step) — minus The Examen, which is already its own primary-
    // anchor choice on the previous step, so offering it again here would
    // just be a confusing second way to pick the same thing.
    const presets: Array<{ emoji: string; label: string }> = [
      { emoji: "🎵", label: t("wol_rule.cp_audio", { defaultValue: "Audio Divina" }) },
      { emoji: "🌍", label: t("wol_rule.cp_cobreathe", { defaultValue: "Creation Prayer" }) },
      { emoji: "🚶", label: t("wol_rule.cp_walk", { defaultValue: "Contemplative Walk" }) },
    ];
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
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "22px 0 8px", fontFamily: FONT }}>
          {t("wol_rule.custom_or_choose", { defaultValue: "Or choose a practice" })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {presets.map(({ emoji, label }) => choiceRow(current === label, `${emoji} ${label}`, "", () => {
            touchedRef.current = true;
            setCustomNameBySide((p) => ({ ...p, [side]: label }));
            setSideCustomName(side, label);
          }))}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Per-side CONFIG slide — default method / breath count ─────────────────
  // Reminder TIMES are no longer asked here (owner): they live in Settings →
  // Daily reminders, defaulting to 7am / 6pm. This slide only asks HOW you'll
  // pray (medium, or breath count for Creation Prayer).
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
    const isCobreatheSide = contemplationBySide[side] && contemplationStyle === "cobreathe";
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
        {/* The BCP FORM choice is merged INTO this slide as a dropdown — no
            separate morning/evening-bcp step anymore (owner: "I don't need a
            whole slide for the liturgy... just have a dropdown of which
            liturgy would you like to pray first, and then move everything
            down"). Same forms the old standalone step offered, same order
            (Psalms second). Compline only appears in the evening list — it
            IS the night office, so offering it as a morning form would be
            nonsense. */}
        {bcpOnSide(side) && (
          <>
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px", fontFamily: FONT }}>
              {t("wol_rule.bcp_form_body_short", { defaultValue: "Which liturgy?" })}
            </p>
            <div style={{ position: "relative", marginBottom: 22 }}>
              {(() => {
                const baseForms = (!pilot ? (["psalms", "readings", "devotion", "offices"] as const) : (["readings", "devotion", "offices"] as const));
                const forms: ReadonlyArray<"psalms" | "readings" | "devotion" | "offices" | "compline"> =
                  side === "evening" ? [...baseForms, "compline"] : baseForms;
                const formLabel = (form: (typeof forms)[number]): string =>
                  form === "compline" ? t("wol_rule.pray_compline_label", { defaultValue: "Compline" })
                  : form === "psalms" ? t("wol_rule.pray_psalms_label", { defaultValue: "Praying the Psalms" })
                  : form === "readings" ? t("wol_rule.pray_readings_label", { defaultValue: "Daily Scripture Readings" })
                  : form === "devotion" ? `${cap} ${t("wol_rule.devotion_word", { defaultValue: "Devotion" })}`
                  : `${cap} ${t("wol_rule.office_word", { defaultValue: "Office" })}`;
                const formEmoji = (form: (typeof forms)[number]): string =>
                  form === "compline" ? "🌙" : form === "psalms" ? "📜" : form === "readings" ? "📰" : "📖";
                const current = (forms as readonly string[]).includes(prayBySide[side]) ? (prayBySide[side] as (typeof forms)[number]) : forms[0]!;
                return (
                  <>
                    <select
                      value={current}
                      onChange={(e) => { const form = e.target.value as (typeof forms)[number]; setBcpForm((p) => ({ ...p, [side]: form })); choosePrayBySide(side, form); }}
                      aria-label={t("wol_rule.bcp_form_body_short", { defaultValue: "Which liturgy?" })}
                      style={{ width: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
                    >
                      {forms.map((form) => (
                        <option key={form} value={form}>{formEmoji(form)} {formLabel(form)}</option>
                      ))}
                    </select>
                    <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
                  </>
                );
              })()}
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
        {/* Contemplation is this side's prayer → also ask HOW LONG it is (the
            default the home "Begin" opens straight into). A Creation Prayer
            side asks in BREATHS (the /cobreathe preset); a silent sit asks in
            minutes (the shared silence goal / timer length). */}
        {contemplationBySide[side] && (
          <>
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "22px 0 10px", fontFamily: FONT }}>
              {isCobreatheSide
                ? t("wol_rule.cobreathe_length_label", { defaultValue: "How many breaths?" })
                : t("wol_rule.contemplation_length_label", { defaultValue: "How long is your sit?" })}
            </p>
            <div style={{ position: "relative", marginBottom: 4 }}>
              {isCobreatheSide ? (
                <select
                  value={String(cobreatheBreaths)}
                  onChange={(e) => chooseCobreatheBreaths(side, parseInt(e.target.value, 10) || 12)}
                  aria-label={t("wol_rule.cobreathe_length_label", { defaultValue: "How many breaths?" })}
                  style={{ ...FROST_BLUR, width: "100%", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
                >
                  {COBREATHE_LENGTHS.map((n) => (<option key={n} value={String(n)}>{t("wol_rule.n_breaths", { count: n, defaultValue: `${n} breaths` })}</option>))}
                </select>
              ) : (
                <select
                  value={String(minutesBySide[side])}
                  onChange={(e) => chooseSideMinutes(side, parseInt(e.target.value, 10) || 15)}
                  aria-label={t("wol_rule.contemplation_length_label", { defaultValue: "How long is your sit?" })}
                  style={{ ...FROST_BLUR, width: "100%", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
                >
                  {[5, 10, 15, 20].map((m) => (<option key={m} value={String(m)}>{t("wol_rule.n_min", { count: m, defaultValue: `${m} min` })}</option>))}
                </select>
              )}
              <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
            </div>
          </>
        )}
        {/* Daily reminder — a gentle push to pray this side, at the time you set
            (or off). Restored per owner. The commit writes the office-reminder
            pref + time the server's daily push reads. */}
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "22px 0 10px", fontFamily: FONT }}>
          {t("wol_rule.reminder_label", { side: cap.toLowerCase(), defaultValue: `Remind me to pray each ${cap.toLowerCase()}` })}
        </p>
        {/* Owner: "combine the reminder on or off into one line, and if it is
            off hide the time." One switch row instead of two mutually
            exclusive choice rows — on/off is a binary, and rendering it as two
            selectable cards (with the time wedged between them) made the time
            field look like it belonged to whichever row sat above it. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              touchedRef.current = true;
              setReminderOnBySide((r) => {
                const next = { ...r, [side]: !r[side] };
                saveReminderNow(next, timeBySide);
                return next;
              });
            }}
            style={{
              width: "100%", textAlign: "left", cursor: "pointer",
              background: reminderOnBySide[side] ? "rgba(46,107,64,0.14)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${reminderOnBySide[side] ? CARD_B_ACTIVE : CARD_B}`,
              borderRadius: 16, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              transition: "background 0.2s, border-color 0.2s",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: CREAM, fontFamily: FONT, margin: 0 }}>
                {`🔔 ${t("wol_rule.reminder_on", { defaultValue: "Remind me" })}`}
              </p>
              <p style={{ fontSize: 13, color: SAGE, fontFamily: FONT, margin: "3px 0 0" }}>
                {reminderOnBySide[side]
                  ? t("wol_rule.reminder_on_sub", { side: cap.toLowerCase(), defaultValue: `A gentle nudge to pray in the ${cap.toLowerCase()}.` })
                  : t("wol_rule.reminder_off_sub", { defaultValue: "No daily nudge — pray when you like." })}
              </p>
            </div>
            <span style={{ width: 46, height: 28, borderRadius: 999, flexShrink: 0, background: reminderOnBySide[side] ? CTA : "rgba(143,175,150,0.22)", position: "relative", transition: "background 0.2s" }}>
              <span style={{ position: "absolute", top: 3, left: reminderOnBySide[side] ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: CREAM, transition: "left 0.2s" }} />
            </span>
          </button>
          {reminderOnBySide[side] && (
            <div style={{ position: "relative" }}>
              <input
                type="time"
                value={timeBySide[side]}
                onChange={(e) => {
                  touchedRef.current = true;
                  const v = e.target.value;
                  setTimeBySide((tv) => {
                    const next = { ...tv, [side]: v };
                    // Only persist a complete HH:MM — a half-typed time would
                    // otherwise write the DEFAULT_REMINDER_TIME fallback.
                    if (/^\d{2}:\d{2}$/.test(v)) saveReminderNow(reminderOnBySide, next);
                    return next;
                  });
                }}
                aria-label={t("wol_rule.reminder_time", { defaultValue: "Reminder time" })}
                style={{ ...FROST_BLUR, width: "100%", maxWidth: "100%", boxSizing: "border-box", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark" }}
              />
            </div>
          )}
        </div>
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

  // ── Step 4 — Add to your day (optional practices) ─────────────────────────
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

  // ── Create-your-own — title + emoji → a custom Daily-progress anchor.
  // Reached from the "Create your own" card in the extras step. ───────────────
  if (step === "custom") {
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
              {isLastStep ? t("wol_rule.finish", { defaultValue: "Save my daily rhythm" }) : t("ruleOfLife.continue", { defaultValue: "Continue" })}
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
      : prayBySide[side] === "guidedPrayer" ? `${cap} Simple Guided Prayer`
      : prayBySide[side] === "ownPractice" ? (customNameBySide[side].trim() || `${cap} Practice`)
      : prayBySide[side] === "fdd" ? "Forward Day by Day"
      : prayBySide[side] === "readings" ? "Daily Scripture Readings"
      : `${cap} Devotion`;
  };
  const reviewRows: Array<{ emoji: string; label: string; sub: string; step: Step }> = [
    // One row per side that has an OFFICE ANCHOR. A side with only add-ons
    // (contemplation/examen) has no office card — those surface as their own
    // rows below (Silence / The Examen), so it isn't listed here as an office.
    ...SIDES.filter((s) => sides[s] && prayBySide[s] !== "none").map((s) => ({
      emoji: s === "morning" ? "🌅" : "🌙",
      label: sideWayLabel(s),
      sub: `${prayBySide[s] === "community" ? "On screen" : prayBySide[s] === "psalms" ? (psalmCycle === "monthly" ? "Monthly cycle" : "Daily office cycle") : prayBySide[s] === "guidedPrayer" ? "Praise · Confession · Thanksgiving · Supplication" : prayBySide[s] === "ownPractice" ? "Your own practice" : prayBySide[s] === "fdd" ? "Forward Movement" : prayBySide[s] === "readings" ? "Forward Movement" : methodLabel(methodBySide[s])} · ${timeBySide[s]}`,
      step: (s === "morning" ? "morning-way" : "evening-way") as Step,
    })),
    // Per-side contemplative prayer — its own row per side. When the style is
    // the breath it's "Morning / Evening Creation Prayer" (🌍); a silent sit is
    // "Morning / Evening Contemplation". The sub shows THIS side's session
    // length (breaths for the breath, minutes for a sit) — NOT the whole-day
    // goal, which read wrong ("144 min a day" on every card).
    ...((["morning", "evening"] as OfficeSide[]).filter((s) => contemplationBySide[s]).map((s) => {
      const isCob = contemplationStyle === "cobreathe";
      const cap = s === "morning" ? "Morning" : "Evening";
      return {
        emoji: isCob ? "🌍" : (silenceMode === "grow" ? "🌱" : "🕯️"),
        label: isCob ? `${cap} Creation Prayer` : `${cap} Contemplation`,
        sub: isCob
          ? t("wol_rule.n_breaths", { count: cobreatheBreaths, defaultValue: `${cobreatheBreaths} breaths` })
          : (silenceMode === "grow" ? "Growing toward 30 min" : (minutesBySide[s] > 0 ? t("wol_rule.n_min", { count: minutesBySide[s], defaultValue: `${minutesBySide[s]} min` }) : "A silent sit")),
        // Tapping edits THIS side (its config step sets the length + reminder).
        step: (isCob ? (s === "morning" ? "morning-config" : "evening-config") : "contemplation-goal") as Step,
      };
    })),
    // SOLO silence goal — minutes set with no per-side contemplation: the home
    // shows the single "Silence" progress card, so the review names it too
    // (otherwise a saved goal looks like it didn't take).
    ...((goalMin > 0 && !contemplationBySide.morning && !contemplationBySide.evening) ? [{
      emoji: (silenceMode === "grow" ? "🌱" : "🕯️"),
      label: "Silence",
      sub: silenceMode === "grow" ? "Growing toward 30 min" : `${goalMin} min a day`,
      step: "contemplation-goal" as Step,
    }] : []),
    // No time-of-day sub-label anymore — these add-ons are just available
    // all day (see the "contemplative" step for the "with your prayer"
    // exception, when Creation Prayer IS the side's primary sit style).
    ...(contemplative.compline ? [{ emoji: "🌙", label: "Compline", sub: "Available from 7pm", step: "contemplative" as Step }] : []),
    ...(contemplative.cobreathe ? [{ emoji: "🌍", label: "Creation Prayer", sub: cobreatheIsSideStyle ? "With your prayer" : "Available all day", step: "contemplative" as Step }] : []),
    ...(contemplative.audio ? [{ emoji: "🎵", label: "Audio Divina", sub: "Available all day", step: "contemplative" as Step }] : []),
    ...(contemplative.examen ? [{ emoji: "🌗", label: "The Examen", sub: "Available all day", step: "contemplative" as Step }] : []),
    ...(newsletters.length
      ? [{ emoji: "📖", label: "Today's reflection", sub: newsletters.map((n) => NEWSLETTERS.find((x) => x.id === n)?.label ?? n).join(" · "), step: "learn" as Step }]
      : []),
    ...(extras.prayerList ? [{ emoji: "🕊️", label: "My Prayer List", sub: "Pray through your own list", step: "extras" as Step }] : []),
    // The user's own custom practices — each tappable back into "Create your own".
    ...customList.map((a) => ({ emoji: a.emoji || "🌿", label: a.title, sub: SLOT_LABEL[a.slot], step: "custom" as Step })),
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
          <button onClick={() => { touchedRef.current = true; setStep("morning-way"); }} style={{ background: "none", border: "none", color: SAGE, fontSize: 13.5, fontFamily: FONT, cursor: "pointer" }}>
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
          {reviewRows.map((r, i) => (
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
        <button onClick={() => { touchedRef.current = true; setStep("morning-way"); }} style={{ marginTop: 12, background: "none", border: "none", color: "rgba(143,175,150,0.7)", fontSize: 13, fontFamily: FONT, cursor: "pointer", textDecoration: "underline", textAlign: "center" }}>
          {t("wol_rule.tend_reshape", { defaultValue: "Reshape from scratch" })}
        </button>
      </>,
    );
  }
  return shell(
    <>
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.4px", fontFamily: FONT, margin: "0 0 6px" }}>
          {t("wol_rule.done_eyebrow", { defaultValue: "Your rule of life" })}
        </p>
        <h1 style={{ color: CREAM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0 }}>
          {t("wol_rule.done_title", { defaultValue: "This is the shape of your days" })}
        </h1>
        <p style={{ color: SAGE, fontSize: 13.5, fontFamily: FONT, lineHeight: 1.55, margin: "10px auto 0", maxWidth: 332 }}>
          {t("wol_rule.done_behold", { defaultValue: "The practices you're choosing to return to, morning through evening." })}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
        {reviewRows.map((r, i) => (
          <button
            key={`${r.label}-${i}`}
            onClick={() => setStep(r.step)}
            style={{ background: CARD, ...FROST_BLUR, border: `1px solid ${CARD_B}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>{r.emoji}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", color: CREAM, fontSize: 15.5, fontWeight: 600, fontFamily: FONT }}>{r.label}</span>
              <span style={{ display: "block", color: SAGE, fontSize: 12.5, fontFamily: FONT, marginTop: 2 }}>{r.sub}</span>
            </span>
            <span style={{ color: "rgba(143,175,150,0.4)", fontSize: 16, flexShrink: 0 }} aria-hidden>›</span>
          </button>
        ))}
      </div>
      <p style={{ textAlign: "center", color: SAGE_DIM, fontSize: 12, fontFamily: FONT, margin: "16px 0 0" }}>
        {t("wol_rule.done_edit_hint", { defaultValue: "Tap any practice to adjust it." })}
      </p>
      {/* One plain closing CTA — no 30-day offer, no "do it together" invite
          stage (owner, 2026-07-03): they chose the rhythm, it's set, done. */}
      <button onClick={onDone} style={{ marginTop: 14, background: "rgba(46,107,64,0.72)", ...FROST_BLUR, border: `1px solid ${CARD_B_ACTIVE}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)", color: CREAM, borderRadius: 14, padding: "17px 20px", fontSize: 16.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
        {t("wol_rule.done_cta", { defaultValue: "Keep this rhythm" })}
      </button>
      {/* WEB save = an account (owner, 2026-07-03): on the web, browser storage
          is ephemeral — an account is what makes the rule durable. Offered to
          guests (no user, or the anonymous device user) on web only; the rhythm
          is already committed locally, and routineSync migrates it up to the
          account after sign-in. Signing up now upgrades the anonymous device
          user in place (auth/register), so the streak + practice history carry
          over too — the CTA can honestly promise "keep everything". The iOS app
          stays fully login-free. */}
      {guest && !isNativeShell() && (!user || user.isAnonymous) && (
        <button onClick={() => setLocation("/signin?from=customize")} style={{ marginTop: 12, background: "none", border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "12px 16px", color: CREAM, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", textAlign: "center", width: "100%" }}>
          {t("wol_rule.web_save_cta", { defaultValue: "Create an account to keep your rhythm and progress" })}
        </button>
      )}
    </>,
  );
}
