/**
 * WayOfLoveStep — the "address those areas" capstone of the Rule of Life maker.
 *
 * After the maker asks its questions and shows the recommended rhythm, this
 * step takes the named thin connection and answers it with The Episcopal
 * Church's Way of Love: it surfaces the practices that nourish that area
 * (pre-selected), lets the person confirm or browse all seven, assembles the
 * chosen practices into a short rule, and ends in a first-person covenant that
 * — when committed — applies the "app" practices through the SAME officePrefs
 * setters the maker already uses. No model, no new endpoints: every suggestion
 * comes from the deterministic engine in @/lib/wayOfLove.
 *
 * Self-contained on purpose (its own style tokens, no imports from the maker
 * page) so it drops into rule-of-life.tsx with a one-line render and can't
 * collide with that file's internals.
 */

import { useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { apiRequest } from "@/lib/queryClient";
import { computeTurnConsistency, engagementDays, type EngagementOfficeDay } from "@/lib/turnConsistency";
import {
  setSideLevel,
  setSideReflection,
  setSideConfession,
  setSideMinutes,
  type OfficeSide,
} from "@/lib/officePrefs";
import {
  PRACTICES,
  PRACTICE_ORDER,
  COVENANT,
  WAY_OF_LOVE_ATTRIBUTION,
  suggestedPractices,
  silenceMinutesForMinutes,
  type Connection,
  type PracticeId,
  type Cadence,
  type I18nText,
} from "@/lib/wayOfLove";

// ── Style tokens (mirrors the maker; kept local to stay decoupled) ───────────
const EP_BG = "#091A10"; // match the daily office slides' background
const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const SANS = "'Space Grotesk', system-ui, sans-serif";
// These slides use Space Grotesk throughout (to match the office UI); the
// "serif" token now points at Space Grotesk too, so the italic contemplative
// lines render as oblique Space Grotesk rather than Georgia.
const SERIF = "'Space Grotesk', system-ui, sans-serif";
const CHIP_DEFAULT = "rgba(46,107,64,0.14)";
const CHIP_BORDER = "rgba(46,107,64,0.28)";
const CHIP_ACTIVE = "rgba(46,107,64,0.52)";
const CHIP_BORDER_ACTIVE = "rgba(46,107,64,0.80)";
const CTA = "#2D5E3F";

// The maker names one of four connections; the Way of Love engine speaks the
// same four under slightly different labels. Map across the boundary.
type ConnectionFocus = "self" | "others" | "nature" | "transcendent";
const FOCUS_TO_CONNECTION: Record<ConnectionFocus, Connection> = {
  self: "self",
  others: "others",
  nature: "world",
  transcendent: "god",
};

export interface WayOfLoveStepProps {
  /** The connection the maker surfaced as most alive — or most neglected. */
  focus: ConnectionFocus;
  /** Logistics from the maker, used to route "app" practices onto office sides. */
  timeOfDay: "morning" | "evening" | "both";
  minutes: number;
  /** Desire-movement signals — personalize the copy, never change the engine. */
  carrying?: string[];
  godMoments?: string[];
  longing?: string[];
  onBack: () => void;
  onDone: () => void;
}

type Step = "choose" | "silence-goal" | "covenant" | "committed";

// Minute presets for the daily contemplative-silence goal slide.
const SILENCE_GOAL_PRESETS = [5, 10, 15, 20, 30] as const;

export default function WayOfLoveStep(props: WayOfLoveStepProps) {
  const { t } = useTranslation();
  const T = (x: I18nText) => t(x.key, { defaultValue: x.default });

  const primary = FOCUS_TO_CONNECTION[props.focus];
  const suggested = useMemo(() => suggestedPractices([primary]), [primary]);

  // Turn isn't a practice you set — it's the daily return to God, enacted every
  // time you pray in Phoebe. Read the same engagement signals the home Turn
  // card uses so the Turn slide can show the LIVE streak instead of options.
  const turnCompletionsQ = useQuery<{ completions: { localDate: string }[] }>({
    queryKey: ["/api/practice-completion"],
    queryFn: () => apiRequest("GET", "/api/practice-completion"),
    staleTime: 15_000,
  });
  const turnOfficeQ = useQuery<{ days: EngagementOfficeDay[] }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    staleTime: 30_000,
  });
  const turn = computeTurnConsistency(
    engagementDays(
      (turnCompletionsQ.data?.completions ?? []).map((r) => r.localDate),
      turnOfficeQ.data?.days ?? [],
    ),
  );

  const [step, setStep] = useState<Step>("choose");
  // Daily contemplative-silence goal (minutes), set on its own slide when the
  // "Keep contemplative silence" practice is kept. Defaults from the user's
  // available-time answer, floored at the smallest preset.
  const [silenceGoalMin, setSilenceGoalMin] = useState<number>(
    () => Math.max(SILENCE_GOAL_PRESETS[0], silenceMinutesForMinutes(props.minutes)),
  );
  // The Way of Love is presented as a seven-slide walk — one practice per
  // slide, every practice "on". For each, the person keeps/changes a prefilled
  // option (one or more) or writes their own commitment.
  const [practiceIndex, setPracticeIndex] = useState(0);
  // All seven on: default each practice to its first prefilled option.
  const [selected, setSelected] = useState<Set<string>>(
    // Every practice defaults to its first prefilled option — EXCEPT Turn,
    // which is the framing/spine, not a thing you "set". Its confession /
    // examen / psalm-51 options stay available but optional (unselected).
    () => new Set(PRACTICE_ORDER.filter((pid) => pid !== "turn").map((pid) => PRACTICES[pid].options[0]?.id).filter(Boolean) as string[]),
  );
  // Per-practice "write your own" commitments, keyed by practice id.
  const [custom, setCustom] = useState<Record<string, string>>({});

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // The chosen practices, grouped + ordered, for the assembled rule.
  const chosen = useMemo(
    () =>
      PRACTICE_ORDER.map((pid) => ({
        pid,
        options: PRACTICES[pid].options.filter((o) => selected.has(o.id)),
        custom: (custom[pid] ?? "").trim(),
      })).filter((g) => g.options.length > 0 || g.custom.length > 0),
    [selected, custom],
  );

  const sides: OfficeSide[] =
    props.timeOfDay === "both" ? ["morning", "evening"] : [props.timeOfDay];

  // Apply the selected "app" practices through the existing officePrefs setters
  // — the same path the maker's own Apply uses. Offline practices stay personal
  // commitments (nothing to toggle). "podcasts" has no pref target yet, so it's
  // a commitment too.
  const commit = () => {
    for (const { options } of chosen) {
      for (const o of options) {
        if (o.home !== "app" || !o.setting) continue;
        for (const side of sides) {
          switch (o.setting) {
            case "confession":
              setSideConfession(side, true);
              break;
            case "office":
              // Honor the option's chosen depth (full Office / Devotion /
              // Reflect & Sit / Intercessions / Journal), not always "office".
              setSideLevel(side, o.officeLevel ?? "office");
              break;
            case "reflectionSource":
              setSideReflection(side, o.reflectionSource ?? "fdd");
              break;
            case "silence":
              // Per-sit office silence default mirrors the daily goal they set.
              setSideMinutes(side, silenceGoalMin);
              break;
            case "podcasts":
              break;
          }
        }
      }
    }
    // Persist the selections so the "Your Way of Love" page can show/edit them.
    // Fire-and-forget — a save failure doesn't block the committed screen.
    const selections: Record<string, { optionIds: string[]; custom: string }> = {};
    for (const pid of PRACTICE_ORDER) {
      const optionIds = PRACTICES[pid].options
        .filter((o) => selected.has(o.id))
        .map((o) => o.id);
      const customText = (custom[pid] ?? "").trim();
      if (optionIds.length > 0 || customText) {
        selections[pid] = { optionIds, custom: customText };
      }
    }
    apiRequest("PUT", "/api/rule-of-life/wol", { selections }).catch(() => {/* ignore */});
    // If they kept contemplative silence, establish the daily contemplation
    // goal (and turn on the ~7pm nudge) from the minutes they chose. Same
    // server field the Contemplation page + Settings read/write.
    if (selected.has("pray-silence")) {
      apiRequest("PUT", "/api/me/office-prefs", {
        contemplationGoalMinutes: silenceGoalMin,
        contemplationReminderEnabled: true,
      }).catch(() => {/* ignore */});
    }
    setStep("committed");
  };

  const cadenceLabel = (c: Cadence): string =>
    c === "daily"
      ? t("way_of_love.cadence.daily", { defaultValue: "Daily" })
      : c === "weekly"
        ? t("way_of_love.cadence.weekly", { defaultValue: "Weekly" })
        : t("way_of_love.cadence.occasional", { defaultValue: "Now and then" });

  const shell = (children: ReactNode) => (
    // flex:1 (not 100dvh) so this fills the space under the Phoebe top bar
    // when rendered inside <Layout> — forcing a full viewport here would push
    // a second screen below the header and cause an awkward scroll.
    <div style={{ flex: 1, minHeight: 0, background: EP_BG, position: "relative", display: "flex", flexDirection: "column" }}>
      <AnimatedBackground base={EP_BG} variant="subtle" fadeTop />
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 40px" }}>
        {children}
      </div>
    </div>
  );

  const backRow = (onClick: () => void) => (
    <button
      onClick={onClick}
      style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "8px 0", display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}
    >
      <ChevronLeft size={18} />
      <span style={{ fontSize: 14, fontFamily: SANS }}>{t("ruleOfLife.back", { defaultValue: "Back" })}</span>
    </button>
  );

  // ── A practice card with its definition + selectable options ──
  const practiceCard = (pid: PracticeId, isSuggested: boolean) => {
    const p = PRACTICES[pid];
    return (
      <div
        key={pid}
        style={{ background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, borderRadius: 14, padding: "14px 16px" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h3 style={{ color: CREAM, fontSize: 17, fontWeight: 600, fontFamily: SANS, margin: 0 }}>{T(p.title)}</h3>
          {isSuggested && (
            <span style={{ color: SAGE, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: SANS }}>
              {t("way_of_love.suggested", { defaultValue: "For you" })}
            </span>
          )}
        </div>
        <p style={{ color: SAGE, fontSize: 13.5, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.5, margin: "6px 0 12px" }}>
          {T(p.definition)}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {p.options.map((o) => {
            const on = selected.has(o.id);
            return (
              <button
                key={o.id}
                onClick={() => toggle(o.id)}
                style={{
                  background: on ? CHIP_ACTIVE : "transparent",
                  border: `1px solid ${on ? CHIP_BORDER_ACTIVE : CHIP_BORDER}`,
                  color: CREAM,
                  borderRadius: 16,
                  padding: "8px 14px",
                  fontSize: 13.5,
                  fontFamily: SANS,
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                {on && <Check size={13} strokeWidth={2.5} />}
                {T(o.label)}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Step 1 — walk the seven practices, one slide each ──
  if (step === "choose") {
    const pid = PRACTICE_ORDER[practiceIndex];
    const p = PRACTICES[pid];
    const isSuggested = suggested.has(pid);
    const isLast = practiceIndex === PRACTICE_ORDER.length - 1;
    const progressPct = ((practiceIndex + 1) / PRACTICE_ORDER.length) * 100;
    // After the last practice: detour to the silence-goal slide if they kept
    // contemplative silence, otherwise straight to the covenant.
    const goNext = () =>
      isLast
        ? setStep(selected.has("pray-silence") ? "silence-goal" : "covenant")
        : setPracticeIndex((i) => i + 1);
    const goBack = () => (practiceIndex === 0 ? props.onBack() : setPracticeIndex((i) => i - 1));
    return shell(
      <>
        {backRow(goBack)}
        <div style={{ flex: 1, maxWidth: 480, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ height: 3, background: CHIP_BORDER, borderRadius: 2, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ width: `${progressPct}%`, height: "100%", background: SAGE, transition: "width 0.3s ease" }} />
          </div>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, fontFamily: SANS }}>
            {t("way_of_love.walk_label", { defaultValue: "The Way of Love" })} · {practiceIndex + 1}/{PRACTICE_ORDER.length}
            {isSuggested ? `  ·  ${t("way_of_love.suggested", { defaultValue: "For you" })}` : ""}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={pid}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              style={{ flex: 1, display: "flex", flexDirection: "column" }}
            >
              <h1 style={{ color: CREAM, fontSize: 28, fontWeight: 600, fontFamily: SANS, margin: "12px 0 0" }}>{T(p.title)}</h1>
              <p style={{ color: SAGE, fontSize: 15, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.55, margin: "8px 0 0" }}>{T(p.definition)}</p>
              {pid === "turn" ? (
                // Turn is the spine, not a practice you pick. Explain it and
                // show the live streak (same engagement signal as the home Turn
                // card) — no options, nothing to set.
                <>
                  <p style={{ color: SAGE, fontSize: 14, lineHeight: 1.65, margin: "14px 0 0", fontFamily: SANS }}>
                    {t("way_of_love.turn_body", { defaultValue: "Turn isn't something you choose or check off. It's the daily return to God — and you make it every time you open Phoebe to pray. There's nothing to set here; just keep showing up, and the rest of the Way of Love grows from it." })}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, borderRadius: 14, padding: "16px 18px", margin: "22px 0 0" }}>
                    <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden>🔥</span>
                    <div>
                      <p style={{ color: CREAM, fontSize: 26, fontWeight: 700, fontFamily: SANS, margin: 0, lineHeight: 1 }}>{turn.currentRunDays}</p>
                      <p style={{ color: SAGE_DIM, fontSize: 11, fontFamily: SANS, margin: "3px 0 0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {t("week.turn_streak", { defaultValue: "day streak" })}
                      </p>
                    </div>
                    {turn.engagedToday && (
                      <span style={{ marginLeft: "auto", color: SAGE, fontSize: 12.5, fontFamily: SANS, display: "flex", alignItems: "center", gap: 5 }}>
                        <Check size={14} strokeWidth={2.5} /> {t("way_of_love.turn_today", { defaultValue: "Today" })}
                      </span>
                    )}
                  </div>
                  {turn.madeSpaceCount > 0 && (
                    <p style={{ color: SAGE_DIM, fontSize: 13, fontFamily: SANS, margin: "12px 0 0", lineHeight: 1.5 }}>
                      {t("way_of_love.turn_made_space", { defaultValue: "You've made space for God {{count}} days in Phoebe.", count: turn.madeSpaceCount })}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p style={{ color: SAGE_DIM, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "20px 0 10px", fontFamily: SANS }}>
                    {t("way_of_love.pick_label", { defaultValue: "Choose a practice — or write your own" })}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {p.options.map((o) => {
                      const on = selected.has(o.id);
                      return (
                        <button
                          key={o.id}
                          onClick={() => toggle(o.id)}
                          style={{
                            background: on ? CHIP_ACTIVE : "transparent",
                            border: `1px solid ${on ? CHIP_BORDER_ACTIVE : CHIP_BORDER}`,
                            color: CREAM, borderRadius: 12, padding: "11px 14px", fontSize: 14, fontFamily: SANS,
                            cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center",
                            justifyContent: "space-between", gap: 10, transition: "background 0.15s, border-color 0.15s",
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {on && <Check size={14} strokeWidth={2.5} />}
                            {T(o.label)}
                          </span>
                          <span style={{ color: SAGE_DIM, fontSize: 12, whiteSpace: "nowrap" }}>{cadenceLabel(o.defaultCadence)}</span>
                        </button>
                      );
                    })}
                    <textarea
                      value={custom[pid] ?? ""}
                      onChange={(e) => setCustom((prev) => ({ ...prev, [pid]: e.target.value }))}
                      placeholder={t("way_of_love.custom_placeholder", { defaultValue: "Or write your own…" })}
                      rows={2}
                      style={{
                        background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, borderRadius: 12,
                        padding: "10px 12px", color: CREAM, fontFamily: SANS, fontSize: 14, lineHeight: 1.5,
                        resize: "none", outline: "none", marginTop: 2,
                      }}
                    />
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <button
            onClick={goNext}
            style={{ marginTop: 20, background: CTA, border: `1px solid ${CHIP_BORDER_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "14px 20px", fontSize: 16, fontWeight: 600, fontFamily: SANS, cursor: "pointer" }}
          >
            {isLast
              ? t("way_of_love.to_covenant", { defaultValue: "See my Way of Love" })
              : t("ruleOfLife.continue", { defaultValue: "Continue" })}
          </button>
          <p style={{ color: SAGE_DIM, fontSize: 12, textAlign: "center", margin: "12px 0 0", fontFamily: SANS }}>
            {WAY_OF_LOVE_ATTRIBUTION}
          </p>
        </div>
      </>,
    );
  }

  // ── Step 1.5 — set the daily contemplative-silence goal ──
  // Only reached when "Keep contemplative silence" is kept. The minutes here
  // become the daily contemplation goal (and the per-sit office default), and
  // turn on the gentle ~7pm nudge.
  if (step === "silence-goal") {
    return shell(
      <>
        {backRow(() => setStep("choose"))}
        <div style={{ flex: 1, maxWidth: 480, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key="silence-goal"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{ flex: 1, display: "flex", flexDirection: "column" }}
            >
              <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, fontFamily: SANS }}>
                {t("way_of_love.silence_goal_eyebrow", { defaultValue: "Pray · contemplative silence" })}
              </p>
              <h1 style={{ color: CREAM, fontSize: 28, fontWeight: 600, fontFamily: SANS, margin: "12px 0 0" }}>
                {t("way_of_love.silence_goal_title", { defaultValue: "How much silence a day?" })}
              </h1>
              <p style={{ color: SAGE, fontSize: 15, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.55, margin: "8px 0 0" }}>
                {t("way_of_love.silence_goal_sub", { defaultValue: "You chose to keep contemplative silence. Set a daily goal — we'll gently remind you around 7pm on days you haven't reached it." })}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 26 }}>
                {SILENCE_GOAL_PRESETS.map((m) => {
                  const on = silenceGoalMin === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setSilenceGoalMin(m)}
                      style={{
                        background: on ? CHIP_ACTIVE : "transparent",
                        border: `1px solid ${on ? CHIP_BORDER_ACTIVE : CHIP_BORDER}`,
                        color: CREAM, borderRadius: 14, padding: "12px 18px", fontSize: 15, fontWeight: 600,
                        fontFamily: SANS, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                    >
                      {on && <Check size={14} strokeWidth={2.5} />}
                      {m} min
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
          <button
            onClick={() => setStep("covenant")}
            style={{ marginTop: 20, background: CTA, border: `1px solid ${CHIP_BORDER_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "14px 20px", fontSize: 16, fontWeight: 600, fontFamily: SANS, cursor: "pointer" }}
          >
            {t("ruleOfLife.continue", { defaultValue: "Continue" })}
          </button>
        </div>
      </>,
    );
  }

  // ── Step 2 — the assembled rule + covenant ──
  if (step === "covenant") {
    const appCount = chosen.reduce(
      (n, g) => n + g.options.filter((o) => o.home === "app" && o.setting && o.setting !== "podcasts").length,
      0,
    );
    return shell(
      <>
        {backRow(() => setStep(selected.has("pray-silence") ? "silence-goal" : "choose"))}
        <AnimatePresence mode="wait">
          <motion.div
            key="covenant"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            style={{ flex: 1, maxWidth: 480, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column" }}
          >
            <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, fontFamily: SANS }}>
              {t("way_of_love.rule_label", { defaultValue: "Your Way of Love" })}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "16px 0 20px" }}>
              {chosen.map(({ pid, options, custom: c }) => (
                <div key={pid} style={{ background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, borderRadius: 12, padding: "12px 14px" }}>
                  <p style={{ color: SAGE, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 6px", fontFamily: SANS }}>
                    {T(PRACTICES[pid].title)}
                  </p>
                  {options.map((o) => (
                    <p key={o.id} style={{ color: CREAM, fontSize: 14, fontFamily: SANS, margin: "0 0 4px", lineHeight: 1.45, display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>{T(o.label)}</span>
                      <span style={{ color: SAGE_DIM, whiteSpace: "nowrap" }}>{cadenceLabel(o.defaultCadence)}</span>
                    </p>
                  ))}
                  {c && (
                    <p style={{ color: CREAM, fontSize: 14, fontFamily: SERIF, fontStyle: "italic", margin: "0 0 4px", lineHeight: 1.45 }}>{c}</p>
                  )}
                </div>
              ))}
            </div>

            {appCount > 0 && (
              <p style={{ color: SAGE, fontSize: 13, fontFamily: SANS, margin: "0 0 18px", lineHeight: 1.5 }}>
                {t("way_of_love.app_note", {
                  defaultValue: "Committing will set up {{count}} of these in your prayer settings.",
                  count: appCount,
                })}
              </p>
            )}

            <p style={{ color: CREAM, fontSize: 16.5, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.7, margin: "0 0 24px" }}>
              {T(COVENANT)}
            </p>

            <button
              onClick={commit}
              style={{ background: CTA, border: `1px solid ${CHIP_BORDER_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "14px 20px", fontSize: 16, fontFamily: SANS, cursor: "pointer", fontWeight: 600 }}
            >
              {t("way_of_love.commit", { defaultValue: "With God's help, I commit" })}
            </button>
            <p style={{ color: SAGE_DIM, fontSize: 12, textAlign: "center", margin: "12px 0 0", fontFamily: SANS }}>
              {WAY_OF_LOVE_ATTRIBUTION}
            </p>
          </motion.div>
        </AnimatePresence>
      </>,
    );
  }

  // ── Step 3 — committed ──
  return shell(
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", maxWidth: 420, margin: "0 auto", gap: 16 }}>
      <div style={{ width: 56, height: 56, borderRadius: 28, background: "rgba(46,107,64,0.25)", border: `1px solid ${CHIP_BORDER_ACTIVE}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Check size={26} color={SAGE} strokeWidth={2} />
      </div>
      <p style={{ color: CREAM, fontSize: 21, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>
        {t("way_of_love.committed_title", { defaultValue: "A beginning, not a finish line." })}
      </p>
      <p style={{ color: SAGE, fontSize: 15, lineHeight: 1.6, margin: 0, fontFamily: SANS }}>
        {t("way_of_love.committed_sub", {
          defaultValue: "Your Way of Love is set. It's a work in progress — return to it whenever you begin again.",
        })}
      </p>
      <button
        onClick={props.onDone}
        style={{ marginTop: 8, background: CTA, border: `1px solid ${CHIP_BORDER_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "13px 28px", fontSize: 15, fontFamily: SANS, cursor: "pointer", fontWeight: 600 }}
      >
        {t("way_of_love.committed_done", { defaultValue: "Begin" })}
      </button>
    </div>,
  );
}
