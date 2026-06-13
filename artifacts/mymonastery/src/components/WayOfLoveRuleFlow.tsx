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

import { useState, useEffect, useRef, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Check } from "lucide-react";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  setSideLevel,
  setSideReflection,
  setSideMinutes,
  setReflectionSource,
  setSideEntry,
  getSideLevel,
  getSideEntry,
  getSideMinutes,
  getReflectionSource,
  type ReflectionSource,
  type OfficeSide,
  type DefaultOfficeEntry,
} from "@/lib/officePrefs";

const BG = "#091A10";
const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const CARD = "rgba(46,107,64,0.12)";
const CARD_ACTIVE = "rgba(46,107,64,0.34)";
const CARD_B = "rgba(46,107,64,0.28)";
const CARD_B_ACTIVE = "rgba(168,197,160,0.7)";
const CTA = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// Keep in sync with dashboard.tsx / customize-home.tsx — finishing the rule
// stamps the home layout with this version so it persists past a global reset.
const HOME_LAYOUT_VERSION = 2;
const SIDES = ["morning", "evening"] as const;

type PrayChoice = "community" | "devotion" | "offices" | "contemplation";
type Step =
  | "when"
  | "morning-way" | "morning-config"
  | "evening-way" | "evening-config"
  | "listen" | "learn" | "extras" | "done";
// Contemplation goal options — a single dropdown in 5-minute increments.
const GOAL_OPTIONS = Array.from({ length: 18 }, (_, i) => (i + 1) * 5); // 5…90

// Each Pray choice → the office level it commits the day to. Community keeps no
// office (the home shows "Pray Together"); devotion/offices set the office card.
const PRAY_LEVEL: Record<PrayChoice, "intercessions" | "devotion" | "office" | "reflect-sit"> = {
  community: "intercessions",
  devotion: "devotion",
  offices: "office",
  // Contemplation as the primary form of prayer for this side — "reflect-sit"
  // is the handled office level for a contemplative sit (begin-prayer routes it
  // to the silence timer).
  contemplation: "reflect-sit",
};
// Inverse of PRAY_LEVEL — read an existing office level back into a Pray
// choice so Customize opens with the user's current pick selected.
function prayFromLevel(level: string | null | undefined): PrayChoice | null {
  if (level === "office") return "offices";
  if (level === "devotion") return "devotion";
  if (level === "intercessions") return "community";
  if (level === "reflect-sit") return "contemplation";
  return null;
}
// …and the existing PRACTICES option id, so the saved selections stay readable
// by the Way of Love drawer / weekly review (commitmentLines).
const PRAY_OPTION_ID: Record<PrayChoice, string> = {
  community: "pray-intercessions",
  devotion: "pray-devotion",
  offices: "pray-office",
  contemplation: "pray-reflect-sit",
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
};
const DEFAULT_REMINDER_TIME = "07:00";

// Is a home module currently surfaced? Mirrors the dashboard's gate: only a
// current-version layout counts, and the key must be in `order` and not
// `hidden`. Used to seed the optional-practice toggles from the live home.
function homeCardOn(
  hl: { order?: string[]; hidden?: string[]; v?: number } | null | undefined,
  key: string,
): boolean {
  if (!hl || hl.v !== HOME_LAYOUT_VERSION) return false;
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
  const [step, setStep] = useState<Step>("when");
  // When they want to pray — morning, evening, or both. Seeded from whichever
  // sides already have a per-side level; defaults to both on first run. At least
  // one side stays selected.
  const [sides, setSides] = useState<{ morning: boolean; evening: boolean }>(() => {
    const m = getSideLevel("morning");
    const e = getSideLevel("evening");
    if (m || e) return { morning: !!m, evening: !!e };
    return { morning: true, evening: true };
  });
  const toggleSide = (s: "morning" | "evening") => {
    setSides((prev) => {
      const next = { ...prev, [s]: !prev[s] };
      return next.morning || next.evening ? next : prev; // keep at least one
    });
  };
  // Preload from the user's current settings so Customize reflects what they
  // already chose, not the first-run defaults. localStorage per-side levels +
  // reflection + minutes are instant; the server office-prefs (the global
  // default + goal) hydrate a moment later for users whose pref was set
  // globally without a per-side override.
  const [goal, setGoal] = useState(() => {
    const m = getSideMinutes("morning");
    return m > 0 ? String(m) : "5";
  });
  // Per-side configuration — each chosen side gets its own way + method + time.
  const [prayBySide, setPrayBySide] = useState<Record<OfficeSide, PrayChoice>>(() => ({
    morning: prayFromLevel(getSideLevel("morning")) ?? prayFromLevel(getSideLevel("evening")) ?? "community",
    evening: prayFromLevel(getSideLevel("evening")) ?? prayFromLevel(getSideLevel("morning")) ?? "community",
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
  // Optional daily practices — adding one surfaces its home card AND an extra
  // Daily-progress checkmark. Seeded from whether the card is already on the
  // user's (current-version) home layout (in order, not hidden).
  const [extras, setExtras] = useState<{ gratitude: boolean; examen: boolean }>(() => ({
    gratitude: homeCardOn(user?.homeLayout, "gratitude"),
    examen: homeCardOn(user?.homeLayout, "examen"),
  }));
  // Re-seed once auth resolves — `user` is often null on the first render, so
  // the initializer above can miss an existing selection. Guard on touchedRef
  // so it never clobbers a toggle the user already made while auth loaded.
  const extrasHydrated = useRef(false);
  useEffect(() => {
    if (extrasHydrated.current || touchedRef.current || !user?.homeLayout) return;
    extrasHydrated.current = true;
    setExtras({
      gratitude: homeCardOn(user.homeLayout, "gratitude"),
      examen: homeCardOn(user.homeLayout, "examen"),
    });
  }, [user]);
  const toggleExtra = (k: "gratitude" | "examen") => {
    touchedRef.current = true;
    setExtras((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const { data: prefs } = useQuery<{ defaultPrayerLevel?: string; contemplationGoalMinutes?: number; morningTime?: string | null; eveningTime?: string | null }>({
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
  const chooseTimeBySide = (side: OfficeSide, tm: string) => { touchedRef.current = true; setTimeBySide((prev) => ({ ...prev, [side]: tm })); };
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
    // Seed each side's way from its saved level, falling back to the server's
    // global default, then community.
    const fromServer = prayFromLevel(prefs.defaultPrayerLevel);
    setPrayBySide((prev) => ({
      morning: prayFromLevel(getSideLevel("morning")) ?? fromServer ?? prev.morning,
      evening: prayFromLevel(getSideLevel("evening")) ?? fromServer ?? prev.evening,
    }));
    // The server's contemplationGoalMinutes is the authoritative current goal —
    // prefill from it so Customize opens on what they actually have set (a stale
    // local per-side minutes value must not win, which is why it showed 15 when
    // the real goal was 60).
    if (typeof prefs.contemplationGoalMinutes === "number" && prefs.contemplationGoalMinutes > 0) {
      setGoal(String(prefs.contemplationGoalMinutes));
    }
    setTimeBySide((prev) => ({
      morning: typeof prefs.morningTime === "string" && /^\d{2}:\d{2}$/.test(prefs.morningTime) ? prefs.morningTime : prev.morning,
      evening: typeof prefs.eveningTime === "string" && /^\d{2}:\d{2}$/.test(prefs.eveningTime) ? prefs.eveningTime : prev.evening,
    }));
  }, [prefs]);

  const goalMin = Math.max(0, Math.min(180, parseInt(goal, 10) || 0));

  const commit = () => {
    // "none" reflection → no newsletter card; otherwise the first picked source
    // is the per-side close-slide reflection.
    const primary: ReflectionSource = newsletters[0] ?? "none";
    for (const side of SIDES) {
      if (sides[side]) {
        setSideLevel(side, PRAY_LEVEL[prayBySide[side]]);
        setSideEntry(side, methodBySide[side]);
        setSideReflection(side, primary);
        if (goalMin > 0) setSideMinutes(side, goalMin);
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
      defaultPrayerLevel: PRAY_LEVEL[prayBySide[primarySide]],
      contemplationGoalMinutes: goalMin,
      contemplationReminderEnabled: goalMin > 0,
      // Each chosen side turns its reminder ON (a non-"none" pref is what makes
      // the server's daily office-reminder push fire) at its chosen time.
      morning: sides.morning ? PRAY_REMINDER_PREF[prayBySide.morning] : "none",
      evening: sides.evening ? PRAY_REMINDER_PREF[prayBySide.evening] : "none",
      morningTime: /^\d{2}:\d{2}$/.test(timeBySide.morning) ? timeBySide.morning : DEFAULT_REMINDER_TIME,
      eveningTime: /^\d{2}:\d{2}$/.test(timeBySide.evening) ? timeBySide.evening : "18:00",
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
    const extrasOn = [...(extras.gratitude ? ["gratitude"] : []), ...(extras.examen ? ["examen"] : [])];
    const extrasOff = [...(extras.gratitude ? [] : ["gratitude"]), ...(extras.examen ? [] : ["examen"])];
    const order = ["requests", "office", "contemplation", ...newsletters, ...extrasOn, "feeds", "ncmp", "podcasts", ...extrasOff, ...others];
    const hidden = ["feeds", "ncmp", "podcasts", ...extrasOff, ...others];
    apiRequest("PUT", "/api/me/home-layout", { order, hidden, v: HOME_LAYOUT_VERSION })
      .then(() => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }))
      .catch(() => {/* ignore */});
    setStep("done");
  };

  // ── Shared chrome ──────────────────────────────────────────────────────────
  // Full-bleed (negative margins cancel <Layout>'s main px-4/sm:px-6/md:px-8),
  // then the inner block re-adds the SAME small padding the home screen uses so
  // the cards sit at the same margin as the home cards — not inset twice (which
  // left it narrow), not jammed to the edge.
  // Tap the RIGHT side of the screen (not on a control) to go back — a quick
  // gesture alternative to the bottom Back button.
  const onTapBack = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, label")) return;
    if (e.clientX > window.innerWidth * 0.6) goPrev();
  };
  const shell = (children: ReactNode) => (
    <div onClick={onTapBack} className="-mx-4 sm:-mx-6 md:-mx-8" style={{ flex: 1, minHeight: 0, background: BG, position: "relative", display: "flex", flexDirection: "column" }}>
      {/* No fadeTop: rendered under <Layout>'s opaque header. */}
      <AnimatedBackground base={BG} variant="subtle" />
      <div className="px-4 sm:px-6 md:px-8" style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", paddingTop: 24, paddingBottom: 40 }}>
        {/* Full width on mobile; capped + centered only on larger screens so the
            elements aren't squeezed into a narrow column on a phone. */}
        <div className="w-full sm:max-w-[480px] sm:mx-auto" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
    </div>
  );

  // The ordered input steps depend on which sides they chose — so the progress
  // bar and the "N/M" both adjust to the options picked.
  const orderedSteps: Step[] = [
    "when",
    ...(sides.morning ? (["morning-way", "morning-config"] as Step[]) : []),
    ...(sides.evening ? (["evening-way", "evening-config"] as Step[]) : []),
    "listen", "learn", "extras",
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
    return (
      <>
        <div style={{ height: 3, background: CARD_B, borderRadius: 2, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ width: `${(n / totalSteps) * 100}%`, height: "100%", background: SAGE, transition: "width 0.3s ease" }} />
        </div>
        <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, fontFamily: FONT }}>
          {t("wol_rule.walk", { defaultValue: "Your daily rhythm of prayer" })} · {n}/{totalSteps}
        </p>
        <p style={{ color: SAGE, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.9px", margin: "16px 0 0", fontFamily: FONT }}>{eyebrow}</p>
        <h1 style={{ color: CREAM, fontSize: 30, fontWeight: 700, fontFamily: FONT, margin: "6px 0 0" }}>{title}</h1>
      </>
    );
  };

  // Continue + a bottom Back bar (the top Back row was removed). Back uses
  // goPrev, which steps back through the dynamic flow (or exits on the first
  // step). Tapping the right side of the screen also goes back (see shell).
  const ctaButton = (label: string, onClick: () => void) => (
    <div style={{ marginTop: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <button onClick={onClick} style={{ width: "100%", background: CTA, border: `1px solid ${CARD_B_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "15px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
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

  // ── Step 2 — Return (contemplation goal) ─────────────────────────────────
  if (step === "listen") {
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(t("wol_rule.listen_eyebrow", { defaultValue: "Return" }), t("wol_rule.listen_title", { defaultValue: "Contemplation" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 0" }}>
          {t("wol_rule.listen_body", { defaultValue: "St. Benedict's Rule calls us back to God — a daily return. Take a few minutes a day to sit in silence before God, open to what God might be speaking and to what's on your own heart. A return to God's love." })}
        </p>
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "26px 0 10px", fontFamily: FONT }}>
          {t("wol_rule.listen_goal_label", { defaultValue: "Minutes of silence a day" })}
        </p>
        <div style={{ position: "relative" }}>
          <select
            value={GOAL_OPTIONS.includes(goalMin) || goalMin === 0 ? String(goalMin) : "5"}
            onChange={(e) => chooseGoal(e.target.value)}
            aria-label={t("wol_rule.listen_goal_label", { defaultValue: "Minutes of silence a day" })}
            style={{ width: "100%", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 40px 13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}
          >
            <option value="0">{t("wol_rule.goal_none", { defaultValue: "No goal" })}</option>
            {GOAL_OPTIONS.map((m) => (
              <option key={m} value={String(m)}>{t("wol_rule.goal_minutes", { mins: m, defaultValue: `${m} minutes` })}</option>
            ))}
          </select>
          <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
        </div>
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "10px 0 0", lineHeight: 1.5 }}>
          {t("wol_rule.listen_goal_note", { defaultValue: "We'll gently remind you around 7pm on days you haven't reached it. Choose “No goal” to keep the practice without one." })}
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
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, cap)}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.side_way_body", { side: cap.toLowerCase(), defaultValue: `How will you pray in the ${cap.toLowerCase()}?` })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {choiceRow(prayBySide[side] === "community", `🙏 ${t("wol_rule.pray_community", { defaultValue: "Community Prayers" })}`, t("wol_rule.pray_community_sub", { defaultValue: "Pray with your community through the day's intercessions." }), () => choosePrayBySide(side, "community"))}
          {choiceRow(prayBySide[side] === "devotion", `🌿 ${cap} ${t("wol_rule.devotion_word", { defaultValue: "Devotion" })}`, t("wol_rule.pray_devotion_sub", { defaultValue: "A short liturgy with your community's prayers included." }), () => choosePrayBySide(side, "devotion"))}
          {choiceRow(prayBySide[side] === "offices", `📖 ${cap} ${t("wol_rule.office_word", { defaultValue: "Office" })}`, t("wol_rule.pray_offices_sub", { defaultValue: "The full liturgy with your community's prayers included." }), () => choosePrayBySide(side, "offices"))}
          {choiceRow(prayBySide[side] === "contemplation", `🕯️ ${cap} ${t("wol_rule.contemplation_word", { defaultValue: "Contemplation" })}`, t("wol_rule.pray_contemplation_sub", { defaultValue: "Silent prayer — we'll just remind you to sit." }), () => choosePrayBySide(side, "contemplation"))}
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
    return shell(
      <>
        {backRow(goPrev)}
        {stepHeader(cap, cap)}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {isContemplation
            ? t("wol_rule.side_config_contemplation_body", { side: cap.toLowerCase(), defaultValue: `When would you like a reminder to sit in the ${cap.toLowerCase()}?` })
            : t("wol_rule.side_config_body", { side: cap.toLowerCase(), defaultValue: `How and when would you like to pray in the ${cap.toLowerCase()}?` })}
        </p>
        {/* Contemplation has no on-screen/listen/book method — it's a silent
            sit — so the method picker is hidden for it. */}
        {!isContemplation && (
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
                    <option value="read">📖 {t("wol_rule.method_screen", { defaultValue: "Digital Slideshow" })}</option>
                    <option value="book">📕 {t("wol_rule.method_book", { defaultValue: "Physical BCP" })}</option>
                    <option value="listen">🎧 {t("wol_rule.method_listen", { defaultValue: "Listen" })}</option>
                    {side === "morning" && <option value="watch">📺 {t("wol_rule.method_watch", { defaultValue: "Watch" })}</option>}
                  </>
                )}
              </select>
              <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
            </div>
          </>
        )}
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "26px 0 10px", fontFamily: FONT }}>
          {t("wol_rule.reminder_side_label", { side: cap.toLowerCase(), defaultValue: `Remind me each ${cap.toLowerCase()}` })}
        </p>
        <input
          type="time"
          value={timeBySide[side]}
          onChange={(e) => chooseTimeBySide(side, e.target.value)}
          aria-label={t("wol_rule.reminder_side_label", { side: cap.toLowerCase(), defaultValue: `Remind me each ${cap.toLowerCase()}` })}
          style={{ width: "100%", maxWidth: 200, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark" }}
        />
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "10px 0 0", lineHeight: 1.5 }}>
          {t("wol_rule.reminder_note", { defaultValue: "We'll send a gentle notification. Change the time or turn it off anytime in Settings." })}
        </p>
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
          {choiceRow(noReflection, t("wol_rule.learn_none", { defaultValue: "None" }), t("wol_rule.learn_none_sub", { defaultValue: "No daily reflection — one fewer step in your rhythm." }), chooseNoReflection)}
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
          {choiceRow(extras.examen, `🌗 ${t("wol_rule.extra_examen", { defaultValue: "The Examen" })}`, t("wol_rule.extra_examen_sub", { defaultValue: "St. Ignatius' end-of-day review of the day with God." }), () => toggleExtra("examen"))}
        </div>
        {ctaButton(t("wol_rule.finish", { defaultValue: "Save my daily rhythm" }), commit)}
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
      : `${cap} Devotion`;
  };
  const reviewRows: Array<{ emoji: string; label: string; sub: string; step: Step }> = [
    ...SIDES.filter((s) => sides[s]).map((s) => ({
      emoji: s === "morning" ? "🌅" : "🌙",
      label: sideWayLabel(s),
      sub: `${prayBySide[s] === "community" ? "On screen" : prayBySide[s] === "contemplation" ? "Silent sit" : methodLabel(methodBySide[s])} · ${timeBySide[s]}`,
      step: (s === "morning" ? "morning-way" : "evening-way") as Step,
    })),
    { emoji: "🕯️", label: "Contemplation", sub: goalMin > 0 ? `${goalMin} min of silence a day` : "No goal", step: "listen" },
    ...(newsletters.length
      ? [{ emoji: "📖", label: "Today's reflection", sub: newsletters.map((n) => NEWSLETTERS.find((x) => x.id === n)?.label ?? n).join(" · "), step: "learn" as Step }]
      : []),
    ...(extras.gratitude ? [{ emoji: "🙏", label: "Gratitude", sub: "Name one gift from the day", step: "extras" as Step }] : []),
    ...(extras.examen ? [{ emoji: "🌗", label: "The Examen", sub: "Review the day with God", step: "extras" as Step }] : []),
  ];
  return shell(
    <>
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <span style={{ fontSize: 40 }} aria-hidden>🕊️</span>
        <h1 style={{ color: CREAM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: "12px 0 0" }}>
          {t("wol_rule.done_title", { defaultValue: "Your daily rhythm is set" })}
        </h1>
        <p style={{ color: SAGE_DIM, fontSize: 13, fontFamily: FONT, lineHeight: 1.5, margin: "8px auto 0", maxWidth: 340 }}>
          {t("wol_rule.done_review_sub", { defaultValue: "Tap any practice to change it." })}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
        {reviewRows.map((r, i) => (
          <button
            key={`${r.label}-${i}`}
            onClick={() => setStep(r.step)}
            style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>{r.emoji}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", color: CREAM, fontSize: 15.5, fontWeight: 600, fontFamily: FONT }}>{r.label}</span>
              <span style={{ display: "block", color: SAGE, fontSize: 12.5, fontFamily: FONT, marginTop: 2 }}>{r.sub}</span>
            </span>
            <span style={{ color: SAGE_DIM, fontSize: 18, flexShrink: 0 }} aria-hidden>›</span>
          </button>
        ))}
      </div>
      <button onClick={onDone} style={{ marginTop: 24, background: CTA, border: `1px solid ${CARD_B_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "15px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
        {t("wol_rule.done_cta", { defaultValue: "Go to Daily progress" })}
      </button>
    </>,
  );
}
