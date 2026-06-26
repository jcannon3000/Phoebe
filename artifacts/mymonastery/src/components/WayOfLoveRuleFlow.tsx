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
import { useTranslation } from "react-i18next";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Check } from "lucide-react";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { FROST, FROST_BLUR } from "@/lib/frost";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { getCustomAnchors, addCustomAnchor, removeCustomAnchor, getJournalingSlot, setJournalingSlot, getPracticeSlot, setPracticeSlot, CUSTOM_ANCHORS_EVENT, CUSTOM_SLOTS, READING_UNITS, type CustomAnchor, type CustomSlot, type ReadingUnit, type ReadingConfig } from "@/lib/customAnchors";
import {
  setSideLevel,
  setSideReflection,
  setSideMinutes,
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
  type PsalmCycle,
  type ReflectionSource,
  type OfficeSide,
  type DefaultOfficeEntry,
} from "@/lib/officePrefs";
import { useBetaStatus } from "@/hooks/useDemo";
import { WEEKLY_PRACTICES, getEnabledWeekly, setEnabledWeekly, type WeeklyKind } from "@/lib/weeklyRhythm";

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

type PrayChoice = "community" | "devotion" | "offices" | "contemplation" | "fdd" | "psalms";
type Step =
  | "when"
  | "morning-way" | "morning-config"
  | "fdd-mode"
  | "psalms-cycle"
  | "evening-way" | "evening-config"
  | "contemplative" | "contemplation-goal" | "cobreathe-when" | "audio-when" | "examen-when" | "lectio-when" | "walk-when"
  | "learn" | "extras" | "custom" | "weekly" | "done"
  | "starter" | "tend";
// Named starter rules — coherent forms a first author adopts WHOLE and tunes
// later (you receive a rule, you don't compose one from a blank trellis). Each
// applies to the same office-prefs + home-layout the full flow writes.
type RulePreset = {
  id: string; emoji: string;
  sides: { morning: boolean; evening: boolean };
  pray: PrayChoice;
  silence: boolean; goalMin: number;
  reflections: ReflectionSource[];
};
const RULE_PRESETS: RulePreset[] = [
  { id: "morning-anchor", emoji: "🌅", sides: { morning: true, evening: false }, pray: "devotion", silence: false, goalMin: 0, reflections: ["fdd"] },
  { id: "offices",        emoji: "📖", sides: { morning: true, evening: true },  pray: "offices",  silence: false, goalMin: 0, reflections: ["fdd"] },
  { id: "contemplative",  emoji: "🕯️", sides: { morning: true, evening: true },  pray: "devotion", silence: true,  goalMin: 10, reflections: ["fdd"] },
];

// Contemplation goal options — a single dropdown in 5-minute increments.
const GOAL_OPTIONS = Array.from({ length: 18 }, (_, i) => (i + 1) * 5); // 5…90

// Each Pray choice → the office level it commits the day to. Community keeps no
// office (the home shows "Pray Together"); devotion/offices set the office card.
const PRAY_LEVEL: Record<PrayChoice, "intercessions" | "devotion" | "office" | "reflect-sit" | "fdd" | "psalms"> = {
  community: "intercessions",
  devotion: "devotion",
  offices: "office",
  // Contemplation as the primary form of prayer for this side — "reflect-sit"
  // is the handled office level for a contemplative sit (begin-prayer routes it
  // to the silence timer).
  contemplation: "reflect-sit",
  // Forward Day by Day IS the prayer for this side — the home FDD card replaces
  // the office card for whoever picks it.
  fdd: "fdd",
  // Praying the Psalms IS the prayer for this side — the home Psalms card.
  psalms: "psalms",
};
// Inverse of PRAY_LEVEL — read an existing office level back into a Pray
// choice so Customize opens with the user's current pick selected.
function prayFromLevel(level: string | null | undefined): PrayChoice | null {
  if (level === "office") return "offices";
  if (level === "devotion") return "devotion";
  if (level === "intercessions") return "community";
  if (level === "reflect-sit") return "contemplation";
  if (level === "fdd") return "fdd";
  if (level === "psalms") return "psalms";
  return null;
}
// …and the existing PRACTICES option id, so the saved selections stay readable
// by the Way of Love drawer / weekly review (commitmentLines).
const PRAY_OPTION_ID: Record<PrayChoice, string> = {
  community: "pray-intercessions",
  devotion: "pray-devotion",
  offices: "pray-office",
  contemplation: "pray-reflect-sit",
  fdd: "pray-fdd",
  psalms: "pray-psalms",
};
// Each Pray choice → the morning reminder pref the office-reminder cron reads
// (parish_office_morning_pref). "office" deep-links the nudge to Morning
// Prayer; "devotion" to the short form — community/devotion users get the
// lighter nudge. This is the REMINDER target only; it's independent of the
// default prayer level set above. A non-"none" value is what makes the daily
// 7am push fire at all (see runParishOfficeReminderSender on the server).
const PRAY_REMINDER_PREF: Record<PrayChoice, "office" | "devotion"> = {
  community: "devotion",
  devotion: "devotion",
  offices: "office",
  contemplation: "devotion",
  // FDD as morning prayer gets the lighter nudge that just opens the practice.
  fdd: "devotion",
  // Praying the Psalms gets a reminder (a non-"none" value fires the daily push).
  psalms: "devotion",
};
const DEFAULT_REMINDER_TIME = "07:30";

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
];

export default function WayOfLoveRuleFlow({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(() => {
    // Always open at the START of the authoring flow — even on re-entry — so the
    // customizer walks from the beginning each time instead of landing on the
    // "tend" overview. A returning user goes straight to "when" (their current
    // choices are pre-filled by the hydration below, so it's a re-shape, not a
    // reset); a first author still meets the named starter rules. getSideLevel
    // reads the local office prefs synchronously (reliable for a returning user).
    try {
      const has = getExplicitSideLevel("morning") !== null || getExplicitSideLevel("evening") !== null;
      return has ? "when" : "starter";
    } catch { return "starter"; }
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
  const toggleSide = (s: "morning" | "evening") => {
    const turningOn = !sides[s];
    touchedRef.current = true;
    setSides((prev) => {
      const next = { ...prev, [s]: !prev[s] };
      return next.morning || next.evening ? next : prev; // keep at least one
    });
    // Turning a side ON defaults its daily reminder ON, so the notification
    // step shows it enabled — re-enabling a side shouldn't inherit its old
    // "off" from a previous save.
    if (turningOn) setReminderOnBySide((r) => ({ ...r, [s]: true }));
  };
  // Preload from the user's current settings so Customize reflects what they
  // already chose, not the first-run defaults. localStorage per-side levels +
  // reflection + minutes are instant; the server office-prefs (the global
  // default + goal) hydrate a moment later for users whose pref was set
  // globally without a per-side override.
  // Default to 5 minutes — a gentle starting goal. A saved goal hydrates from the
  // server pref below (contemplationGoalMinutes) when the user has one (any value
  // is kept, e.g. 144); clearing the field on the goal step sets "No goal" (0).
  const [goal, setGoal] = useState("5");
  // Per-side configuration — each chosen side gets its own way + method + time.
  // Standard preset is Morning Devotion (on screen, 7:30) — so a fresh user with
  // no saved level defaults to "devotion", not the more involved "community".
  const [prayBySide, setPrayBySide] = useState<Record<OfficeSide, PrayChoice>>(() => ({
    // Morning has a real default now (Psalms — getSideLevel returns it when
    // unset), so the cross-mirror fallbacks below would leak that default onto
    // evening. Each side reads only its OWN level; unset evening stays Devotion.
    morning: prayFromLevel(getSideLevel("morning")) ?? "devotion",
    evening: prayFromLevel(getSideLevel("evening")) ?? "devotion",
  }));
  const [methodBySide, setMethodBySide] = useState<Record<OfficeSide, DefaultOfficeEntry>>(() => ({
    morning: getSideEntry("morning"),
    evening: getSideEntry("evening"),
  }));
  // Multiple daily reflections may be followed — each shows its own home card
  // and counts toward the Reflect anchor. Seeded from the current single source.
  const [newsletters, setNewsletters] = useState<ReflectionSource[]>(() => {
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
  const [extras, setExtras] = useState<{ gratitude: boolean; examen: boolean; listening: boolean; journaling: boolean; reading: boolean; podcasts: boolean }>(() => ({
    gratitude: homeCardOn(user?.homeLayout, "gratitude"),
    examen: homeCardOn(user?.homeLayout, "examen"),
    listening: homeCardOn(user?.homeLayout, "listening"),
    journaling: homeCardOn(user?.homeLayout, "journaling"),
    reading: homeCardOn(user?.homeLayout, "reading"),
    podcasts: homeCardOn(user?.homeLayout, "podcasts"),
  }));
  // Beta-only: the weekly Way of Love rhythm (Commune · Go · Bless · Rest),
  // turned on here and kept in the "This week" home band. Persisted on its own
  // localStorage key the moment it's toggled — DELIBERATELY separate from the
  // home layout this flow's commit() writes, so it can't be lost on a re-save.
  const { rawIsBeta } = useBetaStatus();
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
  // Keep a focused custom field above the on-screen keyboard. Capacitor runs
  // KeyboardResize.None (the webview does NOT shrink when the keyboard opens),
  // so a field near the bottom can hide behind it. We measure the inset from
  // visualViewport, give the body that much scroll runway, and lift the focused
  // field above the keyboard once it has settled.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    let raf = 0;
    const inset = () => Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const lift = () => {
      const kb = inset();
      document.body.style.paddingBottom = kb > 0 ? `${kb}px` : "";
      const el = document.activeElement;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      const r = el.getBoundingClientRect();
      const visibleBottom = window.innerHeight - kb - 24;
      if (kb > 0 && r.bottom > visibleBottom) {
        window.scrollBy({ top: r.bottom - visibleBottom + 8, behavior: "smooth" });
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      // The keyboard animates in over ~300ms; lift once it has settled, then
      // again to catch the final viewport.
      window.setTimeout(lift, 280);
      window.setTimeout(lift, 520);
    };
    const onVV = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(lift); };
    window.addEventListener("focusin", onFocusIn);
    vv.addEventListener("resize", onVV);
    return () => {
      window.removeEventListener("focusin", onFocusIn);
      vv.removeEventListener("resize", onVV);
      cancelAnimationFrame(raf);
      document.body.style.paddingBottom = "";
    };
  }, []);

  useEffect(() => {
    if (extrasHydrated.current || touchedRef.current || !user?.homeLayout) return;
    extrasHydrated.current = true;
    setExtras({
      gratitude: homeCardOn(user.homeLayout, "gratitude"),
      examen: homeCardOn(user.homeLayout, "examen"),
      listening: homeCardOn(user.homeLayout, "listening"),
      journaling: homeCardOn(user.homeLayout, "journaling"),
      reading: homeCardOn(user.homeLayout, "reading"),
      podcasts: homeCardOn(user.homeLayout, "podcasts"),
    });
    setContemplative((c) => touchedRef.current ? c : {
      prayer: prayBySide.morning === "contemplation" || prayBySide.evening === "contemplation",
      cobreathe: homeCardOn(user.homeLayout, "cobreathe") || (contemplationStyle === "cobreathe" && (prayBySide.morning === "contemplation" || prayBySide.evening === "contemplation")),
      audio: homeCardOn(user.homeLayout, "listening"),
      examen: homeCardOn(user.homeLayout, "examen"),
      lectio: homeCardOn(user.homeLayout, "lectio"),
      walk: homeCardOn(user.homeLayout, "walk"),
    });
  }, [user]);

  // ── Contemplative practices (the multi-select step) ────────────────────────
  // Pick any of: Contemplative Prayer (sets a silence goal), Co-Breathe, Audio
  // Divina, the Examen. The latter three slot into the day at a chosen time.
  const [contemplative, setContemplative] = useState<{ prayer: boolean; cobreathe: boolean; audio: boolean; examen: boolean; lectio: boolean; walk: boolean }>(() => ({
    prayer: prayBySide.morning === "contemplation" || prayBySide.evening === "contemplation",
    cobreathe: homeCardOn(user?.homeLayout, "cobreathe") || (contemplationStyle === "cobreathe" && (prayBySide.morning === "contemplation" || prayBySide.evening === "contemplation")),
    audio: homeCardOn(user?.homeLayout, "listening"),
    examen: homeCardOn(user?.homeLayout, "examen"),
    lectio: homeCardOn(user?.homeLayout, "lectio"),
    walk: homeCardOn(user?.homeLayout, "walk"),
  }));
  const toggleContemplative = (k: "prayer" | "cobreathe" | "audio" | "examen" | "lectio" | "walk") => {
    touchedRef.current = true;
    setContemplative((c) => ({ ...c, [k]: !c[k] }));
  };
  // Per-practice time-of-day slot for the slotted practices.
  const [slotByPractice, setSlotByPractice] = useState<Record<"cobreathe" | "listening" | "examen" | "lectio" | "walk", CustomSlot>>(() => ({
    cobreathe: getPracticeSlot("cobreathe"),
    listening: getPracticeSlot("listening"),
    examen: getPracticeSlot("examen"),
    lectio: getPracticeSlot("lectio"),
    walk: getPracticeSlot("walk"),
  }));
  const chooseSlot = (key: "cobreathe" | "listening" | "examen" | "lectio" | "walk", slot: CustomSlot) => {
    touchedRef.current = true;
    setSlotByPractice((p) => ({ ...p, [key]: slot }));
    setPracticeSlot(key, slot);
  };
  // Co-Breathe is already placed if a chosen side prays it as its contemplation
  // STYLE — then we don't ask for a separate time-of-day or add a standalone card.
  const cobreatheIsSideStyle = contemplationStyle === "cobreathe" && (
    (sides.morning && prayBySide.morning === "contemplation") ||
    (sides.evening && prayBySide.evening === "contemplation")
  );
  const SLOT_LABEL: Record<CustomSlot, string> = {
    morning: t("wol_rule.slot_morning", { defaultValue: "Morning" }),
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
  const [customSlot, setCustomSlot] = useState<CustomSlot>("morning");
  // Inline "add your own practice" field on the Morning/Evening prayer-way step.
  const [sideCustomDraft, setSideCustomDraft] = useState("");
  // Journaling's time-of-day slot — when they add Journaling we ask when in the
  // day they keep it, so its card slots into the rhythm at that point. Seeded
  // from the saved choice; persisted on tap (localStorage, per-device).
  const [journalingSlot, setJournalingSlotState] = useState<CustomSlot>(() => getJournalingSlot());
  const chooseJournalingSlot = (s: CustomSlot) => { touchedRef.current = true; setJournalingSlotState(s); setJournalingSlot(s); };
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
  const toggleExtra = (k: "gratitude" | "examen" | "listening" | "journaling" | "reading" | "podcasts") => {
    touchedRef.current = true;
    setExtras((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const { data: prefs } = useQuery<{ defaultPrayerLevel?: string; contemplationGoalMinutes?: number; dailyStepGoal?: number; morningTime?: string | null; eveningTime?: string | null; morning?: string | null; evening?: string | null }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
  });
  const hydrated = useRef(false);
  // Set once the user touches any control — so a slow office-prefs response
  // can't clobber a choice they've already made while it was loading.
  const touchedRef = useRef(false);
  const choosePrayBySide = (side: OfficeSide, p: PrayChoice) => { touchedRef.current = true; setPrayBySide((prev) => ({ ...prev, [side]: p })); };
  const chooseMethodBySide = (side: OfficeSide, m: DefaultOfficeEntry) => { touchedRef.current = true; setMethodBySide((prev) => ({ ...prev, [side]: m })); };
  const chooseTimeBySide = (side: OfficeSide, tm: string) => { touchedRef.current = true; setReminderOnBySide((prev) => ({ ...prev, [side]: true })); setTimeBySide((prev) => ({ ...prev, [side]: tm })); };
  const chooseReminderOn = (side: OfficeSide, on: boolean) => { touchedRef.current = true; setReminderOnBySide((prev) => ({ ...prev, [side]: on })); };
  const chooseGoal = (g: string) => { touchedRef.current = true; setGoal(g); };
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
    hydrated.current = true;
    // Seed each side's way from its EXPLICIT saved per-side level only; otherwise
    // keep the standard (Devotion, the initial state). We deliberately do NOT
    // seed from the server's global defaultPrayerLevel here — the old flow
    // defaulted the pray-choice to "community" and saved that as the global
    // defaultPrayerLevel ("intercessions"), so re-seeding from it would keep
    // re-presetting Customize to Community for users who never chose it.
    setPrayBySide((prev) => ({
      morning: prayFromLevel(getSideLevel("morning")) ?? prev.morning,
      evening: prayFromLevel(getSideLevel("evening")) ?? prev.evening,
    }));
    // The server's contemplationGoalMinutes is the authoritative current goal —
    // prefill from it so Customize opens on what they actually have set (a stale
    // local per-side minutes value must not win, which is why it showed 15 when
    // the real goal was 60).
    if (typeof prefs.contemplationGoalMinutes === "number" && prefs.contemplationGoalMinutes > 0) {
      setGoal(String(prefs.contemplationGoalMinutes));
      // An existing silence goal means Contemplative Prayer is already part of the
      // rhythm — pre-select it so this step opens reflecting what they have.
      setContemplative((c) => ({ ...c, prayer: true }));
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
  }, [prefs]);

  const goalMin = Math.max(0, Math.min(180, parseInt(goal, 10) || 0));

  const commit = () => {
    // "none" reflection → no newsletter card; otherwise the first picked source
    // is the per-side close-slide reflection.
    const primary: ReflectionSource = newsletters[0] ?? "none";
    // The silence goal (minutes a day) applies whenever contemplation is part of
    // the rhythm — either as a Contemplative Prayer practice, OR as a side's
    // prayer form set to silent contemplation. Both are "how much to sit a day".
    // No contemplation anywhere → no goal (0), even if a number lingered in state.
    const anySideSilentContemplation =
      (prayBySide.morning === "contemplation" || prayBySide.evening === "contemplation") &&
      contemplationStyle === "silent";
    const effGoalMin = contemplative.prayer || anySideSilentContemplation ? goalMin : 0;
    for (const side of SIDES) {
      if (sides[side]) {
        setSideLevel(side, PRAY_LEVEL[prayBySide[side]]);
        setSideEntry(side, methodBySide[side]);
        setSideReflection(side, primary);
        if (effGoalMin > 0) setSideMinutes(side, effGoalMin);
      } else {
        // Not part of their chosen rhythm — clear the level so it isn't a
        // programmed office for that side.
        setSideLevel(side, "ask");
      }
    }
    setReflectionSource(primary);
    // The global default mirrors whichever side they configured (morning first).
    const primarySide: OfficeSide = sides.morning ? "morning" : "evening";
    apiRequest("PUT", "/api/me/office-prefs", {
      // "fdd" / "psalms" aren't server-side default-prayer levels — the per-side
      // LOCAL level set above drives the home FDD / Psalms card. Send a safe
      // server default so this PUT never carries an unknown value.
      defaultPrayerLevel: (() => {
        const lvl = PRAY_LEVEL[prayBySide[primarySide]];
        return (lvl === "fdd" || lvl === "psalms") ? "devotion" : lvl;
      })(),
      contemplationGoalMinutes: effGoalMin,
      contemplationReminderEnabled: effGoalMin > 0,
      // Each chosen side turns its reminder ON (a non-"none" pref is what makes
      // the server's daily office-reminder push fire) at its chosen time.
      // A side reminds only when it's part of the rhythm AND they didn't pick
      // "No reminder"; otherwise "none" keeps the daily push silent.
      morning: sides.morning && reminderOnBySide.morning ? PRAY_REMINDER_PREF[prayBySide.morning] : "none",
      evening: sides.evening && reminderOnBySide.evening ? PRAY_REMINDER_PREF[prayBySide.evening] : "none",
      morningTime: reminderOnBySide.morning ? (/^\d{2}:\d{2}$/.test(timeBySide.morning) ? timeBySide.morning : DEFAULT_REMINDER_TIME) : null,
      eveningTime: reminderOnBySide.evening ? (/^\d{2}:\d{2}$/.test(timeBySide.evening) ? timeBySide.evening : "18:00") : null,
    }).catch(() => {/* best-effort */});
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
    apiRequest("PUT", "/api/rule-of-life/wol", { selections }).catch(() => {/* ignore */});
    // Rewrite the home to match the rule (the rule is the source of truth):
    // requests (pinned) → Return (contemplation) → Pray (the office card) → ALL
    // chosen reflections. Unselected reflections + secondary panels hidden.
    const others = (["cac", "fdd", "ssje"] as const).filter((n) => !newsletters.includes(n));
    // Added optional practices are surfaced (in order, not hidden); unselected
    // ones go to the hidden tail like the other opt-in modules.
    // Gratitude + journaling come from the "Add to your day" step; Examen, Audio
    // Divina (listening), and Co-Breathe come from the contemplative step. Every
    // selected Co-Breathe now gets its own home card — it's no longer suppressed
    // when a side also prays it as its contemplation style (that dropped the card).
    // Co-Breathe earns a home card from EITHER path: the Contemplation-practices
    // toggle (contemplative.cobreathe) OR picking Co-Breathe as a side's prayer
    // style (contemplationStyle === "cobreathe" on a contemplation side). The
    // side path never flips contemplative.cobreathe, so without this OR a sit
    // chosen that way produced no card. Mirrors the hydration logic above.
    const wantCobreathe =
      contemplative.cobreathe ||
      (contemplationStyle === "cobreathe" &&
        (prayBySide.morning === "contemplation" || prayBySide.evening === "contemplation"));
    const onKeys = [
      ...(extras.gratitude ? ["gratitude"] : []),
      ...(extras.journaling ? ["journaling"] : []),
      ...(extras.reading ? ["reading"] : []),
      ...(extras.podcasts ? ["podcasts"] : []),
      ...(contemplative.examen ? ["examen"] : []),
      ...(contemplative.audio ? ["listening"] : []),
      ...(contemplative.lectio ? ["lectio"] : []),
      ...(contemplative.walk ? ["walk"] : []),
      ...(wantCobreathe ? ["cobreathe"] : []),
    ];
    const offKeys = [
      ...(extras.gratitude ? [] : ["gratitude"]),
      ...(extras.journaling ? [] : ["journaling"]),
      ...(extras.reading ? [] : ["reading"]),
      ...(extras.podcasts ? [] : ["podcasts"]),
      ...(contemplative.examen ? [] : ["examen"]),
      ...(contemplative.audio ? [] : ["listening"]),
      ...(contemplative.lectio ? [] : ["lectio"]),
      ...(contemplative.walk ? [] : ["walk"]),
      ...(wantCobreathe ? [] : ["cobreathe"]),
    ];
    const order = ["requests", "office", "contemplation", ...newsletters, ...onKeys, "feeds", "ncmp", "podcasts", ...offKeys, ...others];
    // "feeds" stays visible (self-hides until you subscribe to a prayer feed).
    const hidden = ["ncmp", "podcasts", ...offKeys, ...others];
    apiRequest("PUT", "/api/me/home-layout", { order, hidden, v: HOME_LAYOUT_VERSION })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }))
      .catch(() => {/* ignore */});
    setStep("done");
  };
  // Adopting a named starter rule presets the flow state, then parks its id so
  // THIS effect (next render, after the setters apply) writes it via the same
  // commit() the full flow uses — landing on the review screen to behold it.
  const adoptRule = (preset: RulePreset) => {
    touchedRef.current = true;
    setSides(preset.sides);
    setPrayBySide({ morning: preset.pray, evening: preset.pray });
    setContemplationStyle("silent");
    setContemplative({ prayer: preset.silence, cobreathe: false, audio: false, examen: false, lectio: false, walk: false });
    setGoal(String(preset.silence ? preset.goalMin : 0));
    setNewsletters(preset.reflections);
    setExtras({ gratitude: false, examen: false, listening: false, journaling: false, reading: false, podcasts: false });
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
  // Forward Day by Day asks a written/audio MEDIUM whenever it's chosen — as a
  // side prayer OR as the daily reflection (the default). The Psalms CYCLE is
  // now folded into each side's config slide (no standalone step).
  const needsFddMode =
    (sides.morning && prayBySide.morning === "fdd") ||
    (sides.evening && prayBySide.evening === "fdd") ||
    newsletters.includes("fdd");
  const orderedSteps: Step[] = [
    "when",
    ...(sides.morning ? (["morning-way", "morning-config"] as Step[]) : []),
    ...(sides.evening ? (["evening-way", "evening-config"] as Step[]) : []),
    // Reflection (the daily word) is chosen BEFORE contemplation now — you pick
    // what you'll read/listen to, then how you'll sit with it.
    "learn",
    // FDD medium choice — asked AFTER the reflection/prayer is picked, so it
    // covers FDD-as-reflection too (applies wherever FDD is used: both sides).
    ...(needsFddMode ? (["fdd-mode"] as Step[]) : []),
    "contemplative",
    ...(contemplative.prayer ? (["contemplation-goal"] as Step[]) : []),
    ...(contemplative.cobreathe ? (["cobreathe-when"] as Step[]) : []),
    ...(contemplative.audio ? (["audio-when"] as Step[]) : []),
    ...(contemplative.lectio ? (["lectio-when"] as Step[]) : []),
    ...(contemplative.walk ? (["walk-when"] as Step[]) : []),
    // The Examen is always an evening practice — no time-of-day slide.
    "extras", "custom",
    // Beta: the weekly Way of Love rhythm is offered as a final, optional step.
    ...(rawIsBeta ? (["weekly"] as Step[]) : []),
  ];
  const totalSteps = orderedSteps.length;
  const goNext = () => { const i = orderedSteps.indexOf(step); if (i >= 0 && i < orderedSteps.length - 1) setStep(orderedSteps[i + 1]); };
  const goPrev = () => { const i = orderedSteps.indexOf(step); if (i > 0) setStep(orderedSteps[i - 1]); else onBack(); };

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

  // ── Contemplative practices — multi-select (pick any) ─────────────────────
  if (step === "contemplative") {
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(t("wol_rule.contemplative_eyebrow", { defaultValue: "Return" }), t("wol_rule.contemplative_title", { defaultValue: "Contemplation" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 20px" }}>
          {t("wol_rule.contemplative_body", { defaultValue: "Choose the contemplative practices for your day — pick as many as you like." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {choiceRow(contemplative.prayer, `🕯️ ${t("wol_rule.cp_prayer", { defaultValue: "Contemplative Prayer" })}`, t("wol_rule.cp_prayer_sub", { defaultValue: "Sit in silence before God." }), () => toggleContemplative("prayer"))}
          {choiceRow(contemplative.cobreathe, `🌍 ${t("wol_rule.cp_cobreathe", { defaultValue: "Co-Breathe" })}`, t("wol_rule.cp_cobreathe_sub", { defaultValue: "12 breaths as a prayer for climate justice." }), () => toggleContemplative("cobreathe"))}
          {choiceRow(contemplative.audio, `🎵 ${t("wol_rule.cp_audio", { defaultValue: "Audio Divina" })}`, t("wol_rule.cp_audio_sub", { defaultValue: "Sacred listening." }), () => toggleContemplative("audio"))}
          {choiceRow(contemplative.lectio, `📖 ${t("wol_rule.cp_lectio", { defaultValue: "Lectio Divina" })}`, t("wol_rule.cp_lectio_sub", { defaultValue: "Sacred reading." }), () => toggleContemplative("lectio"))}
          {choiceRow(contemplative.walk, `🚶 ${t("wol_rule.cp_walk", { defaultValue: "Contemplative Walk" })}`, t("wol_rule.cp_walk_sub", { defaultValue: "A walk as prayer." }), () => toggleContemplative("walk"))}
          {choiceRow(contemplative.examen, `🌗 ${t("wol_rule.cp_examen", { defaultValue: "The Examen" })}`, t("wol_rule.cp_examen_sub", { defaultValue: "Review the day with God." }), () => toggleContemplative("examen"))}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── "What time of day?" — slot picker for Co-Breathe / Audio Divina / Examen ─
  if (step === "cobreathe-when" || step === "audio-when" || step === "examen-when" || step === "lectio-when" || step === "walk-when") {
    const key = step === "cobreathe-when" ? "cobreathe" : step === "audio-when" ? "listening" : step === "lectio-when" ? "lectio" : step === "walk-when" ? "walk" : "examen";
    const meta = step === "cobreathe-when"
      ? { label: t("wol_rule.cp_cobreathe", { defaultValue: "Co-Breathe" }), body: t("wol_rule.when_cobreathe_body", { defaultValue: "When in the day would you like to breathe?" }) }
      : step === "audio-when"
        ? { label: t("wol_rule.cp_audio", { defaultValue: "Audio Divina" }), body: t("wol_rule.when_audio_body", { defaultValue: "Take time to listen to music intentionally as a spiritual practice." }) }
        : step === "lectio-when"
          ? { label: t("wol_rule.cp_lectio", { defaultValue: "Lectio Divina" }), body: t("wol_rule.when_lectio_body", { defaultValue: "When in the day would you like to read slowly and prayerfully?" }) }
          : step === "walk-when"
            ? { label: t("wol_rule.cp_walk", { defaultValue: "Contemplative Walk" }), body: t("wol_rule.when_walk_body", { defaultValue: "When in the day would you like to take a contemplative walk?" }) }
            : { label: t("wol_rule.cp_examen", { defaultValue: "The Examen" }), body: t("wol_rule.when_examen_body", { defaultValue: "When in the day would you like to pray the Examen?" }) };
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(meta.label, meta.label)}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 0" }}>{meta.body}</p>
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "26px 0 10px", fontFamily: FONT }}>
          {t("wol_rule.when_label", { defaultValue: "What time of day?" })}
        </p>
        <div style={{ position: "relative" }}>
          <select
            value={slotByPractice[key]}
            onChange={(e) => chooseSlot(key, e.target.value as CustomSlot)}
            aria-label={t("wol_rule.when_label", { defaultValue: "What time of day?" })}
            style={{ ...FROST_BLUR, width: "100%", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
          >
            {CUSTOM_SLOTS.map((s) => (<option key={s} value={s}>{SLOT_LABEL[s]}</option>))}
          </select>
          <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Contemplative Prayer — silence goal ──────────────────────────────────
  if (step === "contemplation-goal") {
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(t("wol_rule.listen_eyebrow", { defaultValue: "Return" }), t("wol_rule.listen_title", { defaultValue: "Contemplative Prayer" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 0" }}>
          {t("wol_rule.listen_body", { defaultValue: "St. Benedict's Rule calls us back to God — a daily return. Take a few minutes a day to sit in silence before God, open to what God might be speaking and to what's on your own heart. A return to God's love." })}
        </p>
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "26px 0 10px", fontFamily: FONT }}>
          {t("wol_rule.listen_goal_label", { defaultValue: "How much would you like to sit each day?" })}
        </p>
        <div style={{ position: "relative" }}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={180}
            // Free text so any goal is preserved (e.g. 144) instead of snapping
            // to a fixed dropdown option. Empty = "No goal". Keep only digits and
            // clamp to 0–180 (the same range commit uses).
            value={goalMin > 0 ? String(goalMin) : ""}
            placeholder="5"
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              if (digits === "") { chooseGoal("0"); return; }
              chooseGoal(String(Math.max(0, Math.min(180, parseInt(digits, 10) || 0))));
            }}
            aria-label={t("wol_rule.listen_goal_label", { defaultValue: "How much would you like to sit each day?" })}
            style={{ ...FROST_BLUR, width: "100%", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 48px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "textfield", WebkitAppearance: "none" }}
          />
          <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 13, pointerEvents: "none", fontFamily: FONT }}>min</span>
        </div>
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "10px 0 0", lineHeight: 1.5 }}>
          {t("wol_rule.listen_goal_note", { defaultValue: "A gentle daily goal — Phoebe helps you reach it at your own pace. It's never measured against you; how you meet it is up to you. Set 0 to keep the practice without one." })}
        </p>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Step 1 — When (which offices: morning, evening, or both) ──────────────
  if (step === "when") {
    return shell(
      <>
        {backRow(onBack)}
        {stepHeader(t("wol_rule.when_eyebrow", { defaultValue: "Pray" }), t("wol_rule.when_title", { defaultValue: "When" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.when_body", { defaultValue: "When would you like to pray? Choose one or both." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {choiceRow(sides.morning, `🌅 ${t("wol_rule.when_morning", { defaultValue: "Morning" })}`, t("wol_rule.when_morning_sub", { defaultValue: "Begin the day with prayer." }), () => toggleSide("morning"))}
          {choiceRow(sides.evening, `🌙 ${t("wol_rule.when_evening", { defaultValue: "Evening" })}`, t("wol_rule.when_evening_sub", { defaultValue: "Mark the day's end with prayer." }), () => toggleSide("evening"))}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Per-side WAY slide — titled "Morning" / "Evening" ─────────────────────
  if (step === "morning-way" || step === "evening-way") {
    const side: OfficeSide = step === "morning-way" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    const officeSub = side === "morning"
      ? t("wol_rule.pray_offices_sub_morning", { defaultValue: "The full Morning Prayer office." })
      : t("wol_rule.pray_offices_sub_evening", { defaultValue: "The full Evening Prayer office." });
    const devotionSub = side === "morning"
      ? t("wol_rule.pray_devotion_sub_morning", { defaultValue: "A short form of Morning Prayer." })
      : t("wol_rule.pray_devotion_sub_evening", { defaultValue: "A short form of Evening Prayer." });
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, cap)}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.side_way_body", { side: cap.toLowerCase(), defaultValue: `How will you pray in the ${cap.toLowerCase()}?` })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Praying the Psalms — the FIRST option on both morning and evening. */}
          {choiceRow(prayBySide[side] === "psalms", `📜 ${t("wol_rule.pray_psalms_label", { defaultValue: "Praying the Psalms" })}`, t("wol_rule.pray_psalms_sub", { defaultValue: "The appointed psalms, prayed each day." }), () => choosePrayBySide(side, "psalms"))}
          {choiceRow(prayBySide[side] === "devotion", `🌿 ${cap} ${t("wol_rule.devotion_word", { defaultValue: "Devotion" })}`, devotionSub, () => choosePrayBySide(side, "devotion"))}
          {choiceRow(prayBySide[side] === "offices", `📖 ${cap} ${t("wol_rule.office_word", { defaultValue: "Office" })}`, officeSub, () => choosePrayBySide(side, "offices"))}
          {/* Forward Day by Day was removed as a morning/evening prayer option
              per request. Existing FDD users still resolve via PRAY_LEVEL["fdd"];
              it's just no longer offered here. (FDD remains a daily reflection
              source in the Learn step.) */}
          {/* "Community prayer list" was removed as a morning/evening prayer
              option per request. Existing community users still resolve via
              prayFromLevel; it's just no longer offered here. */}
          {/* Contemplative Prayer = silent sit. Co-Breathe was removed as a
              morning/evening prayer option (it still lives in the contemplative
              practices step). */}
          {choiceRow(prayBySide[side] === "contemplation", `🕯️ ${t("wol_rule.contemplative_prayer_label", { defaultValue: "Contemplative Prayer" })}`, t("wol_rule.pray_contemplation_sub", { defaultValue: "Silent prayer — we'll just remind you to sit." }), () => { choosePrayBySide(side, "contemplation"); chooseContemplationStyle("silent"); })}
          {/* The Examen — an evening reflective practice (toggle alongside the office). */}
          {side === "evening" && choiceRow(contemplative.examen, `🌗 ${t("wol_rule.cp_examen", { defaultValue: "The Examen" })}`, t("wol_rule.cp_examen_sub", { defaultValue: "Review the day with God." }), () => toggleContemplative("examen"))}
        </div>

        {/* Add your own practice for this part of the day — logged like a custom
            anchor (tap to keep it each day). */}
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "20px 0 8px", fontFamily: FONT }}>
          {t("wol_rule.side_custom_label", { defaultValue: "Add your own" })}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={sideCustomDraft}
            onChange={(e) => setSideCustomDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && sideCustomDraft.trim()) { touchedRef.current = true; addCustomAnchor(sideCustomDraft.trim(), "🌿", side); setSideCustomDraft(""); setCustomList(getCustomAnchors()); } }}
            placeholder={t("wol_rule.side_custom_placeholder", { side: cap.toLowerCase(), defaultValue: `e.g. a ${cap.toLowerCase()} walk` })}
            style={{ flex: 1, minWidth: 0, ...FROST_BLUR, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 14px", fontSize: 15, color: CREAM, fontFamily: FONT }}
          />
          <button
            type="button"
            disabled={!sideCustomDraft.trim()}
            onClick={() => { touchedRef.current = true; addCustomAnchor(sideCustomDraft.trim(), "🌿", side); setSideCustomDraft(""); setCustomList(getCustomAnchors()); }}
            style={{ flexShrink: 0, background: sideCustomDraft.trim() ? CTA : CARD, border: `1px solid ${sideCustomDraft.trim() ? CARD_B_ACTIVE : CARD_B}`, color: CREAM, borderRadius: 12, padding: "0 18px", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: sideCustomDraft.trim() ? "pointer" : "default" }}
          >
            {t("common.add", { defaultValue: "Add" })}
          </button>
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), goNext)}
      </>,
    );
  }

  // ── Per-side CONFIG slide — default method + reminder time ────────────────
  if (step === "morning-config" || step === "evening-config") {
    const side: OfficeSide = step === "morning-config" ? "morning" : "evening";
    const cap = side === "morning" ? "Morning" : "Evening";
    const isIntercessions = prayBySide[side] === "community";
    const isContemplation = prayBySide[side] === "contemplation";
    const method = isIntercessions ? "read" : methodBySide[side];
    // FDD / Psalms (like contemplation) have no office "way to pray" method —
    // they open their own card — so this config slide shows ONLY the reminder
    // time, not the read/listen/watch dropdown.
    const noMethod = isContemplation || prayBySide[side] === "fdd" || prayBySide[side] === "psalms";
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, cap)}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {isContemplation
            ? t("wol_rule.side_config_contemplation_body", { side: cap.toLowerCase(), defaultValue: `When would you like a reminder to sit in the ${cap.toLowerCase()}?` })
            : prayBySide[side] === "psalms"
              ? t("wol_rule.side_config_psalms_body", { side: cap.toLowerCase(), defaultValue: `Choose how the Psalter unfolds, and when you'd like a reminder in the ${cap.toLowerCase()}.` })
              : noMethod
                ? t("wol_rule.side_config_reminder_body", { side: cap.toLowerCase(), defaultValue: `When would you like a reminder in the ${cap.toLowerCase()}?` })
                : t("wol_rule.side_config_body", { side: cap.toLowerCase(), defaultValue: `How and when would you like to pray in the ${cap.toLowerCase()}?` })}
        </p>
        {/* For a silent contemplation sit, ask HOW MUCH to sit a day — the daily
            goal (the silent-vs-Co-Breathe choice is made on the prayer-form list
            above). Wired to the same goal the Contemplative-Prayer step sets. */}
        {isContemplation && contemplationStyle === "silent" && (
          <>
            <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px", fontFamily: FONT }}>
              {t("wol_rule.contemplation_length_label", { defaultValue: "How long would you like to sit each session?" })}
            </p>
            <div style={{ position: "relative" }}>
              <select
                value={String(goalMin)}
                onChange={(e) => chooseGoal(e.target.value)}
                aria-label={t("wol_rule.contemplation_length_label", { defaultValue: "How long would you like to sit each session?" })}
                style={{ ...FROST_BLUR, width: "100%", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
              >
                {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={String(m)}>{t("wol_rule.minutes_each", { mins: m, defaultValue: `${m} minutes` })}</option>
                ))}
              </select>
              <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
            </div>
            <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "10px 0 0", lineHeight: 1.5 }}>
              {t("wol_rule.contemplation_length_note", { defaultValue: "How long each sit lasts — Phoebe times it for you, at your own pace, never measured against you." })}
            </p>
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
                    <option value="listen">🎧 {t("wol_rule.method_listen", { defaultValue: "Listen" })}</option>
                    {side === "morning" && <option value="watch">📺 {t("wol_rule.method_watch", { defaultValue: "Watch" })}</option>}
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
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "26px 0 10px", fontFamily: FONT }}>
          {t("wol_rule.reminder_side_label", { side: cap.toLowerCase(), defaultValue: `Remind me each ${cap.toLowerCase()}` })}
        </p>
        {/* Pick between a reminder time and no reminder at all. Tapping the time
            field (or its value) selects the reminder; the pill on the right
            selects silence. The selected one carries the active border. */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
          <input
            type="time"
            value={timeBySide[side]}
            onChange={(e) => chooseTimeBySide(side, e.target.value)}
            onFocus={() => chooseReminderOn(side, true)}
            aria-label={t("wol_rule.reminder_side_label", { side: cap.toLowerCase(), defaultValue: `Remind me each ${cap.toLowerCase()}` })}
            style={{
              flex: 1, maxWidth: 200,
              background: reminderOnBySide[side] ? CARD_ACTIVE : CARD,
              border: `1px solid ${reminderOnBySide[side] ? CARD_B_ACTIVE : CARD_B}`,
              borderRadius: 12, padding: "13px 14px",
              color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark",
              opacity: reminderOnBySide[side] ? 1 : 0.5,
            }}
          />
          <button
            type="button"
            onClick={() => chooseReminderOn(side, false)}
            style={{
              flex: 1, maxWidth: 200,
              background: !reminderOnBySide[side] ? CARD_ACTIVE : CARD,
              border: `1px solid ${!reminderOnBySide[side] ? CARD_B_ACTIVE : CARD_B}`,
              borderRadius: 12, padding: "13px 14px",
              color: !reminderOnBySide[side] ? CREAM : SAGE,
              fontSize: 14.5, fontFamily: FONT, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            🔕 {t("wol_rule.reminder_none", { defaultValue: "No reminder" })}
          </button>
        </div>
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "10px 0 0", lineHeight: 1.5 }}>
          {reminderOnBySide[side]
            ? t("wol_rule.reminder_note", { defaultValue: "We'll send a gentle notification. Change the time or turn it off anytime in Settings." })
            : t("wol_rule.reminder_note_off", { side: cap.toLowerCase(), defaultValue: `No ${cap.toLowerCase()} reminder — this practice still counts toward your rhythm.` })}
        </p>
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
          {NEWSLETTERS.map((n) => choiceRow(newsletters.includes(n.id), n.label, n.sub, () => toggleNewsletter(n.id)))}
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
          {choiceRow(extras.gratitude, `🙏 ${t("wol_rule.extra_gratitude", { defaultValue: "Gratitude" })}`, t("wol_rule.extra_gratitude_sub", { defaultValue: "Name one gift from the day." }), () => toggleExtra("gratitude"))}
          {/* Examen + Audio Divina now live in the Contemplation step. */}
          {choiceRow(extras.journaling, `📓 ${t("wol_rule.extra_journaling", { defaultValue: "Journaling" })}`, t("wol_rule.extra_journaling_sub", { defaultValue: "Keep a journal however you like — just log the day, no typing." }), () => toggleExtra("journaling"))}
          {choiceRow(extras.reading, `📚 ${t("wol_rule.extra_reading", { defaultValue: "Reading" })}`, t("wol_rule.extra_reading_sub", { defaultValue: "Log what you read." }), () => toggleExtra("reading"))}
          {choiceRow(extras.podcasts, `🎙️ ${t("wol_rule.extra_podcasts", { defaultValue: "Podcasts" })}`, t("wol_rule.extra_podcasts_sub", { defaultValue: "Log what you listened to." }), () => toggleExtra("podcasts"))}
          {/* When they journal — so the card slots into the rhythm at that time. */}
          {extras.journaling && (
            <div style={{ margin: "-4px 0 4px", padding: "0 2px" }}>
              <p style={{ color: SAGE_DIM, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 8px", fontFamily: FONT }}>
                {t("wol_rule.journaling_when", { defaultValue: "When do you journal?" })}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {CUSTOM_SLOTS.map((s) => {
                  const on = journalingSlot === s;
                  const label = s === "morning" ? t("wol_rule.slot_morning", { defaultValue: "Morning" })
                    : s === "midday" ? t("wol_rule.slot_midday", { defaultValue: "Midday" })
                      : s === "afternoon" ? t("wol_rule.slot_afternoon", { defaultValue: "Afternoon" })
                        : t("wol_rule.slot_evening", { defaultValue: "Evening" });
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => chooseJournalingSlot(s)}
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {CUSTOM_SLOTS.map((sl) => {
                const on = customSlot === sl;
                const label = sl === "morning" ? t("wol_rule.slot_morning", { defaultValue: "Morning" })
                  : sl === "midday" ? t("wol_rule.slot_midday", { defaultValue: "Midday" })
                    : sl === "afternoon" ? t("wol_rule.slot_afternoon", { defaultValue: "Afternoon" })
                      : t("wol_rule.slot_evening", { defaultValue: "Evening" });
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

        {/* Bottom: the add sub-slide just returns to the list; otherwise Save. */}
        {addingCustom ? (
          <div style={{ marginTop: "auto", paddingTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <button onClick={() => setAddingCustom(false)} style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "10px 12px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: FONT }}>
              <ChevronLeft size={16} /> {t("wol_rule.custom_back_to_list", { defaultValue: "Back to your practices" })}
            </button>
          </div>
        ) : (
          <div style={{ marginTop: "auto", paddingTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {/* Beta users get one more (optional) step — the weekly rhythm —
                before saving, so the button just continues there. */}
            <button onClick={rawIsBeta ? goNext : commit} style={{ width: "100%", background: CTA, border: `1px solid ${CARD_B_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "15px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
              {rawIsBeta ? t("ruleOfLife.continue", { defaultValue: "Continue" }) : t("wol_rule.finish", { defaultValue: "Save my daily rhythm" })}
            </button>
            <button onClick={() => setStep("extras")} style={{ marginTop: 4, background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "10px 12px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontFamily: FONT }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {WEEKLY_PRACTICES.map((p) => choiceRow(weekly[p.kind], `${p.emoji} ${p.label}`, p.prompt, () => toggleWeekly(p.kind)))}
        </div>
        <div style={{ marginTop: "auto", paddingTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <button onClick={commit} style={{ width: "100%", background: CTA, border: `1px solid ${CARD_B_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "15px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
            {t("wol_rule.finish_weekly", { defaultValue: "Save my rhythm" })}
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
    : `📖 ${t("wol_rule.method_screen", { defaultValue: "Digital Slideshow" })}`;
  const sideWayLabel = (side: OfficeSide): string => {
    const cap = side === "morning" ? "Morning" : "Evening";
    return prayBySide[side] === "community" ? "Community Intercessions"
      : prayBySide[side] === "offices" ? `${cap} Prayer`
      : prayBySide[side] === "contemplation" ? `${cap} Contemplation`
      : prayBySide[side] === "fdd" ? "Forward Day by Day"
      : prayBySide[side] === "psalms" ? "Praying the Psalms"
      : `${cap} Devotion`;
  };
  const reviewRows: Array<{ emoji: string; label: string; sub: string; step: Step }> = [
    ...SIDES.filter((s) => sides[s]).map((s) => ({
      emoji: s === "morning" ? "🌅" : "🌙",
      label: sideWayLabel(s),
      sub: `${prayBySide[s] === "community" ? "On screen" : prayBySide[s] === "contemplation" ? (contemplationStyle === "silent" && goalMin > 0 ? `${goalMin} min a day` : "Silent sit") : prayBySide[s] === "fdd" ? (fddMode === "audio" ? "Listen" : "Read") : prayBySide[s] === "psalms" ? (psalmCycle === "monthly" ? "Monthly cycle" : "Daily office cycle") : methodLabel(methodBySide[s])} · ${timeBySide[s]}`,
      step: (s === "morning" ? "morning-way" : "evening-way") as Step,
    })),
    ...(contemplative.prayer ? [{ emoji: "🕯️", label: "Contemplative Prayer", sub: goalMin > 0 ? `${goalMin} min a day` : "No daily goal", step: "contemplation-goal" as Step }] : []),
    ...(contemplative.cobreathe ? [{ emoji: "🌍", label: "Co-Breathe", sub: cobreatheIsSideStyle ? "With your prayer" : SLOT_LABEL[slotByPractice.cobreathe], step: "contemplative" as Step }] : []),
    ...(contemplative.audio ? [{ emoji: "🎵", label: "Audio Divina", sub: SLOT_LABEL[slotByPractice.listening], step: "contemplative" as Step }] : []),
    ...(contemplative.examen ? [{ emoji: "🌗", label: "The Examen", sub: SLOT_LABEL[slotByPractice.examen], step: "contemplative" as Step }] : []),
    ...(newsletters.length
      ? [{ emoji: "📖", label: "Today's reflection", sub: newsletters.map((n) => NEWSLETTERS.find((x) => x.id === n)?.label ?? n).join(" · "), step: "learn" as Step }]
      : []),
    ...(extras.gratitude ? [{ emoji: "🙏", label: "Gratitude", sub: "Name one gift from the day", step: "extras" as Step }] : []),
    ...(extras.journaling ? [{ emoji: "📓", label: "Journaling", sub: "Keep a journal — log the day", step: "extras" as Step }] : []),
    // The user's own custom practices — each tappable back into "Create your own".
    ...customList.map((a) => ({ emoji: a.emoji || "🌿", label: a.title, sub: SLOT_LABEL[a.slot], step: "custom" as Step })),
  ];

  // ── Starter — a first author receives a named rule (adopt whole, tune later),
  // or chooses to build their own. Adopting commits the preset, then beholds it.
  if (step === "starter") {
    const meta = (id: string) =>
      id === "morning-anchor" ? { label: t("wol_rule.preset_morning_anchor", { defaultValue: "A simple morning anchor" }), who: t("wol_rule.preset_morning_anchor_who", { defaultValue: "For beginning a daily habit of prayer." }) }
      : id === "offices" ? { label: t("wol_rule.preset_offices", { defaultValue: "Morning & evening with the offices" }), who: t("wol_rule.preset_offices_who", { defaultValue: "For praying the daily office, morning and night." }) }
      : { label: t("wol_rule.preset_contemplative", { defaultValue: "The contemplative path" }), who: t("wol_rule.preset_contemplative_who", { defaultValue: "For someone drawn to daily silence." }) };
    return shell(
      <>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <span style={{ fontSize: 38 }} aria-hidden>🕊️</span>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.4px", fontFamily: FONT, margin: "14px 0 6px" }}>
            {t("wol_rule.starter_eyebrow", { defaultValue: "Your rule of life" })}
          </p>
          <h1 style={{ color: CREAM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0 }}>
            {t("wol_rule.starter_title", { defaultValue: "Begin with a shape" })}
          </h1>
          <p style={{ color: SAGE, fontSize: 13.5, fontFamily: FONT, lineHeight: 1.55, margin: "10px auto 0", maxWidth: 332 }}>
            {t("wol_rule.starter_sub", { defaultValue: "Receive a simple rule and grow into it — you can change anything after." })}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
          {RULE_PRESETS.map((pr) => {
            const m = meta(pr.id);
            return (
              <button key={pr.id} onClick={() => adoptRule(pr)} style={{ background: CARD, ...FROST_BLUR, border: `1px solid ${CARD_B}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)", borderRadius: 14, padding: "15px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>{pr.emoji}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", color: CREAM, fontSize: 15.5, fontWeight: 600, fontFamily: FONT }}>{m.label}</span>
                  <span style={{ display: "block", color: SAGE, fontSize: 12.5, fontFamily: FONT, marginTop: 2 }}>{m.who}</span>
                </span>
                <span style={{ color: "rgba(143,175,150,0.5)", fontSize: 18, flexShrink: 0 }} aria-hidden>›</span>
              </button>
            );
          })}
        </div>
        <button onClick={() => { touchedRef.current = true; setStep("when"); }} style={{ marginTop: 18, background: "none", border: "none", color: SAGE, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", textAlign: "center" }}>
          {t("wol_rule.starter_build_own", { defaultValue: "Or build my own →" })}
        </button>
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
        <button onClick={() => { touchedRef.current = true; setStep("when"); }} style={{ marginTop: 12, background: "none", border: "none", color: "rgba(143,175,150,0.7)", fontSize: 13, fontFamily: FONT, cursor: "pointer", textDecoration: "underline", textAlign: "center" }}>
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
      <button onClick={onDone} style={{ marginTop: 14, background: "rgba(46,107,64,0.72)", ...FROST_BLUR, border: `1px solid ${CARD_B_ACTIVE}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)", color: CREAM, borderRadius: 14, padding: "17px 20px", fontSize: 16.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
        {t("wol_rule.done_cta", { defaultValue: "Keep this rhythm" })}
      </button>
    </>,
  );
}
