/**
 * The Way of Love rule — a three-step flow: Return → Pray → Learn.
 *
 * St. Benedict's Rule calls us back to God, so the rule starts with Return: a few
 * minutes of silence a day. Then Pray (how you pray daily — community
 * intercessions, a Daily Devotion, or the full Offices), then Learn (the daily
 * newsletter; Scripture is already covered when you pray a devotion/office).
 *
 * Finishing applies the prayer prefs (silence goal, office level, reflection
 * source) AND rewrites the home to match — the rule is the source of truth:
 * prayer requests (pinned) → Return (contemplation) → Pray (the office card,
 * which adapts to the chosen level) → the chosen newsletter. Replaces the older
 * seven-practice WayOfLoveStep as the rule-of-life experience.
 */

import { useState, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Check } from "lucide-react";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { apiRequest } from "@/lib/queryClient";
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
  const [step, setStep] = useState<Step>("listen");
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
  const [newsletter, setNewsletter] = useState<ReflectionSource>(() => {
    const r = getReflectionSource();
    return r && r !== "none" ? r : "fdd";
  });

  const { data: prefs } = useQuery<{ defaultPrayerLevel?: string; contemplationGoalMinutes?: number }>({
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
  const chooseNewsletter = (n: ReflectionSource) => { touchedRef.current = true; setNewsletter(n); };
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
  }, [prefs]);

  const goalMin = Math.max(0, Math.min(180, parseInt(goal, 10) || 0));
  // Picking a devotion / the offices already includes the day's Scripture, so
  // Learn's reading is covered — Community prayers does not, so we don't claim it.
  const scriptureCovered = pray !== "community";

  const commit = () => {
    const level = PRAY_LEVEL[pray];
    for (const side of SIDES) {
      setSideLevel(side, level);
      setSideReflection(side, newsletter);
      if (goalMin > 0) setSideMinutes(side, goalMin);
    }
    setReflectionSource(newsletter);
    apiRequest("PUT", "/api/me/office-prefs", {
      defaultPrayerLevel: level,
      contemplationGoalMinutes: goalMin,
      contemplationReminderEnabled: goalMin > 0,
    }).catch(() => {/* best-effort */});
    // Persist in the existing selections shape so the WoL drawer / weekly
    // review still read the commitment (Record<practiceId,{optionIds,custom}>).
    const selections: Record<string, { optionIds: string[]; custom: string }> = {
      pray: { optionIds: [PRAY_OPTION_ID[pray], "pray-silence"], custom: "" },
      learn: { optionIds: ["learn-devotional"], custom: "" },
    };
    apiRequest("PUT", "/api/rule-of-life/wol", { selections }).catch(() => {/* ignore */});
    // Rewrite the home to match the rule (the rule is the source of truth):
    // requests (pinned) → Return (contemplation) → Pray (the office card) → the
    // chosen newsletter. Other newsletters + secondary panels hidden (addable).
    const others = (["cac", "fdd", "ssje"] as const).filter((n) => n !== newsletter);
    const order = ["requests", "office", "contemplation", newsletter, "feeds", "gratitude", "examen", "ncmp", "podcasts", ...others];
    const hidden = ["feeds", "gratitude", "examen", "ncmp", "podcasts", ...others];
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
        {t("wol_rule.walk", { defaultValue: "Your Way of Love" })} · {n}/3
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

  // ── Step 1 — Return ──────────────────────────────────────────────────────
  if (step === "listen") {
    return shell(
      <>
        {backRow(onBack)}
        {stepHeader(1, t("wol_rule.listen_eyebrow", { defaultValue: "Return" }), t("wol_rule.listen_title", { defaultValue: "Return" }))}
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
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), () => setStep("pray"))}
      </>,
    );
  }

  // ── Step 2 — Pray ──────────────────────────────────────────────────────────
  if (step === "pray") {
    return shell(
      <>
        {backRow(() => setStep("listen"))}
        {stepHeader(2, t("wol_rule.pray_eyebrow", { defaultValue: "Pray" }), t("wol_rule.pray_title", { defaultValue: "Pray" }))}
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "14px 0 22px" }}>
          {t("wol_rule.pray_body", { defaultValue: "How will you pray each day?" })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {choiceRow(pray === "community", t("wol_rule.pray_community", { defaultValue: "Community prayers" }), t("wol_rule.pray_community_sub", { defaultValue: "Pray with your community through the day's intercessions." }), () => choosePray("community"))}
          {choiceRow(pray === "devotion", t("wol_rule.pray_devotion", { defaultValue: "Daily devotion" }), t("wol_rule.pray_devotion_sub", { defaultValue: "A short form of Morning or Evening Prayer." }), () => choosePray("devotion"))}
          {choiceRow(pray === "offices", t("wol_rule.pray_offices", { defaultValue: "The offices" }), t("wol_rule.pray_offices_sub", { defaultValue: "The full Daily Office — Morning & Evening Prayer." }), () => choosePray("offices"))}
        </div>
        {ctaButton(t("ruleOfLife.continue", { defaultValue: "Continue" }), () => setStep("learn"))}
      </>,
    );
  }

  // ── Step 3 — Learn ───────────────────────────────────────────────────────
  if (step === "learn") {
    return shell(
      <>
        {backRow(() => setStep("pray"))}
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
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "16px 0 16px" }}>
          {t("wol_rule.learn_body", { defaultValue: "Choose a daily reflection to read." })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {NEWSLETTERS.map((n) => choiceRow(newsletter === n.id, n.label, n.sub, () => chooseNewsletter(n.id)))}
        </div>
        {ctaButton(t("wol_rule.finish", { defaultValue: "Set my Way of Love" }), commit)}
      </>,
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  return shell(
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <span style={{ fontSize: 44 }} aria-hidden>🕊️</span>
      <h1 style={{ color: CREAM, fontSize: 26, fontWeight: 700, fontFamily: FONT, margin: "16px 0 0" }}>
        {t("wol_rule.done_title", { defaultValue: "Your Way of Love is set" })}
      </h1>
      <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, lineHeight: 1.6, margin: "10px 0 0", maxWidth: 340 }}>
        {t("wol_rule.done_sub", { defaultValue: "Your home now leads with Return, your prayer, and your reflection. Come back any time to change it." })}
      </p>
      <button onClick={onDone} style={{ marginTop: 28, background: CTA, border: `1px solid ${CARD_B_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "14px 28px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
        {t("wol_rule.done_cta", { defaultValue: "Go to my home" })}
      </button>
    </div>,
  );
}
