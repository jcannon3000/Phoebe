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

import { useState, useEffect, useRef, type ReactNode } from "react";
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
  getSideLevel,
  getSideMinutes,
  getReflectionSource,
  type ReflectionSource,
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

type PrayChoice = "community" | "devotion" | "offices";
type Step = "listen" | "pray" | "learn" | "done";

// Each Pray choice → the office level it commits the day to. Community keeps no
// office (the home shows "Pray Together"); devotion/offices set the office card.
const PRAY_LEVEL: Record<PrayChoice, "intercessions" | "devotion" | "office"> = {
  community: "intercessions",
  devotion: "devotion",
  offices: "office",
};
// Inverse of PRAY_LEVEL — read an existing office level back into a Pray
// choice so Customize opens with the user's current pick selected.
function prayFromLevel(level: string | null | undefined): PrayChoice | null {
  if (level === "office") return "offices";
  if (level === "devotion") return "devotion";
  if (level === "intercessions") return "community";
  return null;
}
// …and the existing PRACTICES option id, so the saved selections stay readable
// by the Way of Love drawer / weekly review (commitmentLines).
const PRAY_OPTION_ID: Record<PrayChoice, string> = {
  community: "pray-intercessions",
  devotion: "pray-devotion",
  offices: "pray-office",
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
  { id: "fdd", label: "Forward Day by Day", sub: "Forward Movement" },
  { id: "ssje", label: "SSJE — Brother, Give Us a Word", sub: "Society of St. John the Evangelist" },
  { id: "cac", label: "CAC Daily Meditation", sub: "Center for Action & Contemplation" },
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
  const [step, setStep] = useState<Step>("pray");
  // Preload from the user's current settings so Customize reflects what they
  // already chose, not the first-run defaults. localStorage per-side levels +
  // reflection + minutes are instant; the server office-prefs (the global
  // default + goal) hydrate a moment later for users whose pref was set
  // globally without a per-side override.
  const [goal, setGoal] = useState(() => {
    const m = getSideMinutes("morning");
    return m > 0 ? String(m) : "5";
  });
  const [pray, setPray] = useState<PrayChoice>(
    () => prayFromLevel(getSideLevel("morning")) ?? prayFromLevel(getSideLevel("evening")) ?? "community",
  );
  // Multiple daily reflections may be followed — each shows its own home card
  // and counts toward the Reflect anchor. Seeded from the current single source.
  const [newsletters, setNewsletters] = useState<ReflectionSource[]>(() => {
    const r = getReflectionSource();
    return r && r !== "none" ? [r] : ["fdd"];
  });
  // When to nudge them to pray each morning. Persisted as the office-reminder
  // time; finishing the flow also turns the morning reminder ON (pref !=
  // "none") so the server's daily push actually fires — this is the piece a
  // user who "isn't getting reminders" was missing.
  const [reminderTime, setReminderTime] = useState<string>(DEFAULT_REMINDER_TIME);
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

  const { data: prefs } = useQuery<{ defaultPrayerLevel?: string; contemplationGoalMinutes?: number; morningTime?: string | null }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
  });
  const hydrated = useRef(false);
  // Set once the user touches any control — so a slow office-prefs response
  // can't clobber a choice they've already made while it was loading.
  const touchedRef = useRef(false);
  const choosePray = (p: PrayChoice) => { touchedRef.current = true; setPray(p); };
  const chooseGoal = (g: string) => { touchedRef.current = true; setGoal(g); };
  const chooseReminder = (t: string) => { touchedRef.current = true; setReminderTime(t); };
  // Toggle a reflection in/out; never let the list go empty.
  const toggleNewsletter = (n: ReflectionSource) => {
    touchedRef.current = true;
    setNewsletters((prev) => {
      if (prev.includes(n)) return prev.length > 1 ? prev.filter((x) => x !== n) : prev;
      return [...prev, n];
    });
  };
  useEffect(() => {
    if (hydrated.current || touchedRef.current || !prefs) return;
    hydrated.current = true;
    // Only fall back to the server's global default when there's no explicit
    // per-side choice in localStorage (which the user set here before).
    const local = prayFromLevel(getSideLevel("morning")) ?? prayFromLevel(getSideLevel("evening"));
    const fromServer = prayFromLevel(prefs.defaultPrayerLevel);
    if (!local && fromServer) setPray(fromServer);
    if (getSideMinutes("morning") <= 0 && typeof prefs.contemplationGoalMinutes === "number" && prefs.contemplationGoalMinutes > 0) {
      setGoal(String(prefs.contemplationGoalMinutes));
    }
    if (typeof prefs.morningTime === "string" && /^\d{2}:\d{2}$/.test(prefs.morningTime)) {
      setReminderTime(prefs.morningTime);
    }
  }, [prefs]);

  const goalMin = Math.max(0, Math.min(180, parseInt(goal, 10) || 0));
  // Picking a devotion / the offices already includes the day's Scripture, so
  // Learn's reading is covered — Community prayers does not, so we don't claim it.
  const scriptureCovered = pray !== "community";

  const commit = () => {
    const level = PRAY_LEVEL[pray];
    const primary = newsletters[0] ?? "fdd"; // single per-side source (close slide)
    for (const side of SIDES) {
      setSideLevel(side, level);
      setSideReflection(side, primary);
      if (goalMin > 0) setSideMinutes(side, goalMin);
    }
    setReflectionSource(primary);
    apiRequest("PUT", "/api/me/office-prefs", {
      defaultPrayerLevel: level,
      contemplationGoalMinutes: goalMin,
      contemplationReminderEnabled: goalMin > 0,
      // Turn the morning prayer reminder ON (a non-"none" pref is what makes
      // the server's daily office-reminder push fire) and stamp the chosen
      // time. Building the habit means setting up the nudge, not just the prefs.
      morning: PRAY_REMINDER_PREF[pray],
      morningTime: /^\d{2}:\d{2}$/.test(reminderTime) ? reminderTime : DEFAULT_REMINDER_TIME,
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
      pray: { optionIds: [PRAY_OPTION_ID[pray], "pray-silence"], custom: "" },
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
  const shell = (children: ReactNode) => (
    <div style={{ flex: 1, minHeight: 0, background: BG, position: "relative", display: "flex", flexDirection: "column" }}>
      {/* No fadeTop: rendered under <Layout>'s opaque header. */}
      <AnimatedBackground base={BG} variant="subtle" />
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 40px" }}>
        <div style={{ flex: 1, maxWidth: 480, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
    </div>
  );

  const backRow = (onClick: () => void) => (
    <button onClick={onClick} style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "8px 0", display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
      <ChevronLeft size={18} />
      <span style={{ fontSize: 14, fontFamily: FONT }}>{t("ruleOfLife.back", { defaultValue: "Back" })}</span>
    </button>
  );

  const stepHeader = (n: number, eyebrow: string, title: string) => (
    <>
      <div style={{ height: 3, background: CARD_B, borderRadius: 2, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ width: `${(n / 3) * 100}%`, height: "100%", background: SAGE, transition: "width 0.3s ease" }} />
      </div>
      <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, fontFamily: FONT }}>
        {t("wol_rule.walk", { defaultValue: "Your daily rhythm of prayer" })} · {n}/3
      </p>
      <p style={{ color: SAGE, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.9px", margin: "16px 0 0", fontFamily: FONT }}>{eyebrow}</p>
      <h1 style={{ color: CREAM, fontSize: 30, fontWeight: 700, fontFamily: FONT, margin: "6px 0 0" }}>{title}</h1>
    </>
  );

  const ctaButton = (label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ marginTop: "auto", background: CTA, border: `1px solid ${CARD_B_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "15px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
      {label}
    </button>
  );

  // A radio-style choice row (single-select).
  const choiceRow = (on: boolean, label: string, sub: string, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        background: on ? CARD_ACTIVE : CARD,
        border: `1px solid ${on ? CARD_B_ACTIVE : CARD_B}`,
        color: CREAM, borderRadius: 14, padding: "14px 16px", textAlign: "left",
        display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: 999, flexShrink: 0, marginTop: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "#A8C5A0" : "transparent", border: on ? "none" : `1.5px solid ${CARD_B}` }}>
        {on && <Check size={12} strokeWidth={3} color="#0C1F12" />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15.5, fontWeight: 600, fontFamily: FONT }}>{label}</span>
        <span style={{ display: "block", color: SAGE, fontSize: 13, fontFamily: FONT, marginTop: 2, lineHeight: 1.4 }}>{sub}</span>
      </span>
    </button>
  );

  // ── Step 2 — Return (contemplation goal) ─────────────────────────────────
  if (step === "listen") {
    return shell(
      <>
        {backRow(() => setStep("pray"))}
        {stepHeader(2, t("wol_rule.listen_eyebrow", { defaultValue: "Return" }), t("wol_rule.listen_title", { defaultValue: "Contemplation" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 0" }}>
          {t("wol_rule.listen_body", { defaultValue: "St. Benedict's Rule calls us back to God — a daily return. Take a few minutes a day to sit in silence before God, open to what God might be speaking and to what's on your own heart. A return to God's love." })}
        </p>
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "26px 0 10px", fontFamily: FONT }}>
          {t("wol_rule.listen_goal_label", { defaultValue: "Minutes of silence a day" })}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {["5", "10", "20"].map((m) => {
            const on = goal === m;
            return (
              <button key={m} onClick={() => chooseGoal(m)} style={{ background: on ? CARD_ACTIVE : CARD, border: `1px solid ${on ? CARD_B_ACTIVE : CARD_B}`, color: CREAM, borderRadius: 12, padding: "12px 0", flex: 1, fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
                {m}
              </button>
            );
          })}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={180}
            value={goal}
            onChange={(e) => chooseGoal(e.target.value)}
            aria-label={t("wol_rule.listen_goal_label", { defaultValue: "Minutes of silence a day" })}
            style={{ width: 72, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "12px 10px", color: CREAM, fontSize: 15, fontFamily: FONT, textAlign: "center", outline: "none" }}
          />
        </div>
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "10px 0 0", lineHeight: 1.5 }}>
          {t("wol_rule.listen_goal_note", { defaultValue: "We'll gently remind you around 7pm on days you haven't reached it. Set 0 to keep the practice without a goal." })}
        </p>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), () => setStep("learn"))}
      </>,
    );
  }

  // ── Step 1 — Pray (how you pray the daily office) ─────────────────────────
  if (step === "pray") {
    return shell(
      <>
        {backRow(onBack)}
        {stepHeader(1, t("wol_rule.pray_eyebrow", { defaultValue: "Pray" }), t("wol_rule.pray_title", { defaultValue: "Pray" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.pray_body", { defaultValue: "How will you pray each day?" })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {choiceRow(pray === "community", t("wol_rule.pray_community", { defaultValue: "Community prayers" }), t("wol_rule.pray_community_sub", { defaultValue: "Pray with your community through the day's intercessions." }), () => choosePray("community"))}
          {choiceRow(pray === "devotion", t("wol_rule.pray_devotion", { defaultValue: "Daily devotion" }), t("wol_rule.pray_devotion_sub", { defaultValue: "A short form of Morning or Evening Prayer." }), () => choosePray("devotion"))}
          {choiceRow(pray === "offices", t("wol_rule.pray_offices", { defaultValue: "The offices" }), t("wol_rule.pray_offices_sub", { defaultValue: "The full Daily Office — Morning & Evening Prayer." }), () => choosePray("offices"))}
        </div>
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "26px 0 10px", fontFamily: FONT }}>
          {t("wol_rule.reminder_label", { defaultValue: "Remind me to pray each morning" })}
        </p>
        <input
          type="time"
          value={reminderTime}
          onChange={(e) => chooseReminder(e.target.value)}
          aria-label={t("wol_rule.reminder_label", { defaultValue: "Remind me to pray each morning" })}
          style={{ width: "100%", background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "13px 14px", color: CREAM, fontSize: 16, fontFamily: FONT, outline: "none", colorScheme: "dark" }}
        />
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "10px 0 0", lineHeight: 1.5 }}>
          {t("wol_rule.reminder_note", { defaultValue: "We'll send a gentle notification. Change the time or turn it off anytime in Settings." })}
        </p>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), () => setStep("listen"))}
      </>,
    );
  }

  // ── Step 3 — Learn (daily reflections, multi-select) ─────────────────────
  if (step === "learn") {
    return shell(
      <>
        {backRow(() => setStep("listen"))}
        {stepHeader(3, t("wol_rule.learn_eyebrow", { defaultValue: "Learn" }), t("wol_rule.learn_title", { defaultValue: "Learn" }))}
        {scriptureCovered && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: CARD_ACTIVE, border: `1px solid ${CARD_B_ACTIVE}`, borderRadius: 12, padding: "12px 14px", margin: "14px 0 0" }}>
            <span style={{ width: 20, height: 20, borderRadius: 999, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#A8C5A0" }}>
              <Check size={13} strokeWidth={3} color="#0C1F12" />
            </span>
            <span style={{ color: CREAM, fontSize: 14, fontFamily: FONT, lineHeight: 1.45 }}>
              {t("wol_rule.learn_scripture_done", { defaultValue: "Scripture — already covered by the office you pray." })}
            </span>
          </div>
        )}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "16px 0 4px" }}>
          {t("wol_rule.learn_body", { defaultValue: "Choose the daily reflections you'd like to read." })}
        </p>
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "0 0 16px" }}>
          {t("wol_rule.learn_multi_note", { defaultValue: "Pick as many as you like — each gets its own card on your home." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {NEWSLETTERS.map((n) => choiceRow(newsletters.includes(n.id), n.label, n.sub, () => toggleNewsletter(n.id)))}
        </div>
        <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "28px 0 6px", fontFamily: FONT }}>
          {t("wol_rule.extras_label", { defaultValue: "Add to your day" })}
        </p>
        <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, margin: "0 0 12px", lineHeight: 1.5 }}>
          {t("wol_rule.extras_note", { defaultValue: "Optional practices — each adds a checkmark to your Daily progress." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {choiceRow(extras.gratitude, t("wol_rule.extra_gratitude", { defaultValue: "Gratitude" }), t("wol_rule.extra_gratitude_sub", { defaultValue: "Name one gift from the day." }), () => toggleExtra("gratitude"))}
          {choiceRow(extras.examen, t("wol_rule.extra_examen", { defaultValue: "The Examen" }), t("wol_rule.extra_examen_sub", { defaultValue: "St. Ignatius' end-of-day review of the day with God." }), () => toggleExtra("examen"))}
        </div>
        {ctaButton(t("wol_rule.finish", { defaultValue: "Save my daily rhythm" }), commit)}
      </>,
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  return shell(
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <span style={{ fontSize: 44 }} aria-hidden>🕊️</span>
      <h1 style={{ color: CREAM, fontSize: 26, fontWeight: 700, fontFamily: FONT, margin: "16px 0 0" }}>
        {t("wol_rule.done_title", { defaultValue: "Your daily rhythm is set" })}
      </h1>
      <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "10px 0 0", maxWidth: 340 }}>
        {t("wol_rule.done_sub", { defaultValue: "Your home and Daily progress now lead with your prayer, your contemplation, and your reflections. Come back any time to change it." })}
      </p>
      <p style={{ color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, lineHeight: 1.55, margin: "16px 0 0", maxWidth: 320 }}>
        {t("wol_rule.done_reminder_hint", { defaultValue: "Not seeing reminders? Turn on notifications for Phoebe in your phone's Settings." })}
      </p>
      <button onClick={onDone} style={{ marginTop: 24, background: CTA, border: `1px solid ${CARD_B_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "14px 28px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
        {t("wol_rule.done_cta", { defaultValue: "Go to Daily progress" })}
      </button>
    </div>,
  );
}
