/**
 * Rule of Life — guided spiritual-direction intake that ends in a
 * rule-based recommendation for a personal daily prayer rhythm.
 *
 * Three movements:
 *   1. The Audit   — what your day actually looks like
 *   2. Desire      — what you long for (Ter Kuile's four connections)
 *   3. Logistics   — when, how long, how often
 *
 * Questions where several answers can be true are "select all that apply"
 * (multi-select); the rest pick one. Every slide advances on an explicit
 * Continue so multi-select has room to breathe. Ends with a named narrative
 * + concrete office settings that can be applied in one tap, saved, or emailed.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { EARTH_PHOTOS, LEAF_PHOTOS } from "@/lib/earthPhotos";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, X, Check, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { playOpeningSwell, primeAudio } from "@/lib/amenFeedback";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useBetaStatus } from "@/hooks/useDemo";
import { useAuth } from "@/hooks/useAuth";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";
import {
  setSideLevel,
  setSideEntry,
  setSideReflection,
  setSideConfession,
  setSideGratitude,
  setSideMinutes,
  type OfficeSide,
  type OfficeLevel,
  type ReflectionSource,
  type DefaultOfficeEntry,
} from "@/lib/officePrefs";
import WayOfLoveRuleFlow from "@/components/WayOfLoveRuleFlow";

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = "self" | "clergy" | "together";
type ConnectionFocus = "self" | "others" | "nature" | "transcendent";

interface RuleOfLifeAnswers {
  mode: Mode;
  subjectName?: string;
  pace: string;
  pause: string[];
  sacred: string[];
  longing: string[];
  connectionFocus: ConnectionFocus;
  godMoments: string[];
  carrying: string[];
  timeOfDay: "morning" | "evening" | "both";
  minutes: number;
  frequency: string;
}

interface SideSettings {
  enabled: boolean;
  level: OfficeLevel;
  wayToPray: DefaultOfficeEntry;
  reflectionSource: ReflectionSource;
  confession: boolean;
  gratitude: boolean;
  minutes: number;
  reminderTime: string;
}

interface RecommendResult {
  id: number;
  narrative: string;
  plainSummary: string;
  settings: { morning: SideSettings | { enabled: false }; evening: SideSettings | { enabled: false } };
  connectionFocus: ConnectionFocus;
  anchor: string;
}

// ── Colours + type ──────────────────────────────────────────────────────────────
// Matches the rest of the app: Space Grotesk for UI text, Georgia italic for
// contemplative prayer lines, warm cream + sage on a deep-green ground.

const EP_BG = "#091A10"; // match the daily office slides' background
const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const SANS = "'Space Grotesk', system-ui, sans-serif";
// The builder uses Space Grotesk throughout (matching the office UI); the
// "serif" token now points at Space Grotesk too, so the italic contemplative
// lines render as oblique Space Grotesk rather than Georgia.
const SERIF = "'Space Grotesk', system-ui, sans-serif";
const CHIP_DEFAULT = "rgba(46,107,64,0.14)";
const CHIP_BORDER = "rgba(46,107,64,0.28)";
const CHIP_ACTIVE = "rgba(46,107,64,0.52)";
const CHIP_BORDER_ACTIVE = "rgba(46,107,64,0.80)";
const CTA = "#2D5E3F";

// ── Slide spec ────────────────────────────────────────────────────────────────

interface Chip { value: string; label: string }
interface SlideSpec {
  key: keyof RuleOfLifeAnswers;
  movement?: string;
  italic?: string;
  question: string;
  chips: Chip[];
  clergyCopy?: string; // alternative question framing for clergy mode
  multi?: boolean;     // "select all that apply"
}

const SLIDES: SlideSpec[] = [
  // Movement 1 — The Audit
  {
    key: "pace",
    movement: "Movement I — Your day as it is",
    italic: "Walk me through an ordinary day.",
    question: "When you wake, what are the first thirty minutes usually like?",
    clergyCopy: "When they wake, what are the first thirty minutes usually like?",
    chips: [
      { value: "calm", label: "Calm and quiet" },
      { value: "rushing", label: "Rushing to get out" },
      { value: "gradual", label: "Gradually waking" },
      { value: "unpredictable", label: "It varies" },
    ],
  },
  {
    key: "pause",
    movement: "Movement I — Your day as it is",
    question: "Where in your day is there already a natural pause?",
    clergyCopy: "Where in their day is there already a natural pause?",
    multi: true,
    chips: [
      { value: "morning-coffee", label: "Morning coffee or tea" },
      { value: "commute", label: "The commute" },
      { value: "walk", label: "A daily walk" },
      { value: "mealtimes", label: "Mealtimes" },
      { value: "before-sleep", label: "Before sleep" },
      { value: "still-looking", label: "Still looking for one" },
    ],
  },
  {
    key: "sacred",
    movement: "Movement I — Your day as it is",
    italic: "What already feels even a little sacred?",
    question: "Even if you'd never call it prayer — what is it?",
    clergyCopy: "Even if they'd never call it prayer — what is it?",
    multi: true,
    chips: [
      { value: "morning-quiet", label: "Morning quiet" },
      { value: "walks", label: "Walks in nature" },
      { value: "music", label: "Music" },
      { value: "reading", label: "Reading" },
      { value: "caring", label: "Caring for others" },
      { value: "rest", label: "Rest" },
      { value: "nothing", label: "Nothing yet" },
    ],
  },
  // Movement 2 — Desire
  {
    key: "longing",
    movement: "Movement II — What you long for",
    italic: "Set goals aside for a moment.",
    question: "What do you actually long for in your life with God right now?",
    clergyCopy: "What do they actually long for in their life with God right now?",
    multi: true,
    chips: [
      { value: "peace", label: "More peace" },
      { value: "direction", label: "A sense of direction" },
      { value: "roots", label: "Deeper roots" },
      { value: "belonging", label: "To feel less alone" },
      { value: "grow", label: "To grow" },
      { value: "heal", label: "To heal" },
      { value: "give-back", label: "To give back" },
    ],
  },
  {
    key: "connectionFocus",
    movement: "Movement II — What you long for",
    italic: "The four connections: self, others, world, God.",
    question: "Which of these feels most alive — or most neglected — right now?",
    clergyCopy: "Which of these feels most alive — or most neglected — for them right now?",
    chips: [
      { value: "self", label: "Connection with myself" },
      { value: "others", label: "Connection with others" },
      { value: "nature", label: "Connection with the world" },
      { value: "transcendent", label: "Connection with God" },
    ],
  },
  {
    key: "godMoments",
    movement: "Movement II — What you long for",
    question: "When have you felt most alive, or closest to God?",
    clergyCopy: "When have they felt most alive, or closest to God?",
    multi: true,
    chips: [
      { value: "nature", label: "In nature" },
      { value: "community", label: "In community" },
      { value: "silence", label: "In silence" },
      { value: "service", label: "In serving others" },
      { value: "scripture", label: "In scripture or prayer" },
      { value: "beauty", label: "In beauty or art" },
      { value: "rarely", label: "Rarely, if ever" },
    ],
  },
  {
    key: "carrying",
    movement: "Movement II — What you long for",
    question: "Who are you carrying right now?",
    clergyCopy: "Who are they carrying right now?",
    multi: true,
    chips: [
      { value: "family", label: "Family" },
      { value: "friends", label: "Close friends" },
      { value: "suffering", label: "The suffering world" },
      { value: "myself", label: "Mostly myself" },
      { value: "none", label: "No one in particular" },
    ],
  },
  // Movement 3 — Logistics
  {
    key: "timeOfDay",
    movement: "Movement III — How it could fit",
    question: "When does a moment of prayer feel most natural?",
    clergyCopy: "When does a moment of prayer feel most natural for them?",
    chips: [
      { value: "morning", label: "Morning" },
      { value: "evening", label: "Evening" },
      { value: "both", label: "Both" },
    ],
  },
  {
    key: "minutes",
    movement: "Movement III — How it could fit",
    question: "How many minutes could you realistically give, most days?",
    clergyCopy: "How many minutes could they realistically give, most days?",
    chips: [
      { value: "5", label: "About 5" },
      { value: "10", label: "About 10" },
      { value: "15", label: "About 15" },
      { value: "20", label: "About 20" },
      { value: "30", label: "30 or more" },
    ],
  },
  {
    key: "frequency",
    movement: "Movement III — How it could fit",
    question: "How often are you hoping to pray?",
    clergyCopy: "How often are they hoping to pray?",
    chips: [
      { value: "daily", label: "Daily" },
      { value: "most-days", label: "Most days" },
      { value: "few-times", label: "A few times a week" },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = (h ?? 0) >= 12 ? "pm" : "am";
  const h12 = (h ?? 0) % 12 || 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
}

function applySettings(settings: RecommendResult["settings"]): void {
  for (const side of ["morning", "evening"] as OfficeSide[]) {
    const s = settings[side];
    if (!s.enabled) continue;
    const ss = s as SideSettings;
    setSideLevel(side, ss.level as OfficeLevel);
    setSideEntry(side, ss.wayToPray as DefaultOfficeEntry);
    setSideReflection(side, ss.reflectionSource as ReflectionSource);
    setSideConfession(side, ss.confession);
    setSideGratitude(side, ss.gratitude);
    setSideMinutes(side, ss.minutes);
  }
}

// ── Components ────────────────────────────────────────────────────────────────

function ChipButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? CHIP_ACTIVE : CHIP_DEFAULT,
        border: `1px solid ${selected ? CHIP_BORDER_ACTIVE : CHIP_BORDER}`,
        color: CREAM,
        borderRadius: 20,
        padding: "10px 18px",
        fontSize: 15,
        fontFamily: SANS,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {selected && <Check size={14} strokeWidth={2.5} />}
      {label}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Phase = "mode" | "name" | "slides" | "loading" | "result" | "apply-confirm" | "email" | "practices";

export default function RuleOfLifePage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  // PUBLIC no-login version: a signed-out visitor (flag on) gets the GUEST
  // customizer — trimmed ways, one merged BCP slide, fixed silence goal, and a
  // commit that writes only device-local prefs (see WayOfLoveRuleFlow's guest
  // prop). Flag off / signed in → unchanged.
  const { user: authUser, isLoading: authLoading } = useAuth();
  const guestFlow = PHOEBE_GUEST_ENABLED && !authLoading && !authUser;

  // Public — the Rule of Life / customizer is open to all users. The beta gate
  // that redirected non-beta users to /dashboard was removed per request, so
  // the daily-routine + customizer features are available to everyone.

  // Skip the questionnaire — open straight on the Way of Love sections.
  // (The questionnaire phases below stay in the file but are no longer
  // reached; WayOfLoveStep is self-contained and runs fine with defaults.)
  const [phase, setPhase] = useState<Phase>("practices");
  const [mode, setMode] = useState<Mode>("self");
  const [subjectName, setSubjectName] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<RuleOfLifeAnswers>>({});
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [applyDone, setApplyDone] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const totalSlides = SLIDES.length;
  const currentSlide = SLIDES[slideIndex];
  // A single calm landscape at low opacity behind the customizer slideshow.
  const customizerBgPhoto = useMemo(() => (EARTH_PHOTOS.length > 0 ? EARTH_PHOTOS[Math.floor(Math.random() * EARTH_PHOTOS.length)]! : null), []);
  // The builder flow's full-screen leaf backdrop (owned by Layout so it covers
  // behind the header, all the way to the top).
  const flowLeaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const recommendMutation = useMutation({
    mutationFn: (payload: RuleOfLifeAnswers) =>
      apiRequest<RecommendResult>("POST", "/api/rule-of-life/recommend", payload),
    onSuccess: (data) => {
      setResult(data);
      setPhase("result");
    },
    // Stay on the loading phase so the error UI (with Retry) shows, rather
    // than silently bouncing back to the last slide.
  });

  const applyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/rule-of-life/${id}/apply`),
  });

  const emailMutation = useMutation({
    mutationFn: ({ id, to }: { id: number; to: string }) =>
      apiRequest("POST", `/api/rule-of-life/${id}/email`, { to }),
    onSuccess: () => setEmailSent(true),
  });

  // ── Selection ────────────────────────────────────────────────────────────────

  const isSelected = (slide: SlideSpec, value: string): boolean => {
    const cur = answers[slide.key];
    if (Array.isArray(cur)) return cur.includes(value);
    return String(cur ?? "") === value;
  };

  const toggleChip = (slide: SlideSpec, value: string) => {
    // Unlock the audio context on a real tap so the advance swells can play.
    try { primeAudio(); } catch { /* non-fatal */ }
    setAnswers((prev) => {
      if (slide.multi) {
        const cur = Array.isArray(prev[slide.key]) ? (prev[slide.key] as string[]) : [];
        const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
        return { ...prev, [slide.key]: next };
      }
      return { ...prev, [slide.key]: slide.key === "minutes" ? Number(value) : value };
    });
  };

  const slideAnswered = (slide: SlideSpec): boolean => {
    const cur = answers[slide.key];
    if (slide.multi) return Array.isArray(cur) && cur.length > 0;
    return cur !== undefined && cur !== "";
  };

  const submit = () => {
    const payload = { ...answers, mode, subjectName: subjectName || undefined } as RuleOfLifeAnswers;
    setPhase("loading");
    recommendMutation.reset();
    recommendMutation.mutate(payload);
  };

  // A soft swell on each slide advance — rotating through the three octaves,
  // always STARTING with the lowest (0) at the top of the flow.
  const swellOctaveRef = useRef(0);
  const handleContinue = () => {
    if (!currentSlide || !slideAnswered(currentSlide)) return;
    try { playOpeningSwell(swellOctaveRef.current % 3); swellOctaveRef.current += 1; } catch { /* audio locked — non-fatal */ }
    if (slideIndex < totalSlides - 1) {
      setSlideIndex((i) => i + 1);
    } else {
      submit();
    }
  };

  const handleBack = () => {
    if (phase === "slides" && slideIndex > 0) {
      setSlideIndex((i) => i - 1);
    } else if (phase === "slides") {
      setPhase(mode === "clergy" ? "name" : "mode");
    } else if (phase === "name") {
      setPhase("mode");
    } else if (phase === "apply-confirm" || phase === "email") {
      setPhase("result");
    }
  };

  const handleApply = () => {
    if (!result) return;
    applySettings(result.settings);
    applyMutation.mutate(result.id);
    setApplyDone(true);
    setPhase("result");
    const { morning, evening } = result.settings;
    // Additive apply: turn ON / adjust the sides the rule recommends, but NEVER
    // silently turn a side OFF here. Writing "none" for a non-recommended side
    // was quietly disabling people's Morning office when they ran Customize —
    // turning a side off now lives only in Settings → office, an explicit choice.
    const payload: Record<string, unknown> = {
      showConfession: (morning.enabled && (morning as SideSettings).confession) ||
                     (evening.enabled && (evening as SideSettings).confession),
    };
    if (morning.enabled) { payload.morning = (morning as SideSettings).level; payload.morningTime = (morning as SideSettings).reminderTime; }
    if (evening.enabled) { payload.evening = (evening as SideSettings).level; payload.eveningTime = (evening as SideSettings).reminderTime; }
    apiRequest("PUT", "/api/me/office-prefs", payload).catch(() => {});
  };

  const handleEmailSend = () => {
    if (!result || !emailInput.trim()) return;
    emailMutation.mutate({ id: result.id, to: emailInput.trim() });
  };

  // ── Mode selection ──────────────────────────────────────────────────────────

  if (phase === "mode") {
    return (
      <div style={{ minHeight: "100dvh", background: EP_BG, position: "relative", display: "flex", flexDirection: "column" }}>
        <AnimatedBackground base={EP_BG} variant="pronounced" fadeTop />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 40px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <Link href="/daily-practice">
              <button style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: 8 }}>
                <X size={20} />
              </button>
            </Link>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 32, maxWidth: 480, margin: "0 auto", width: "100%" }}>
            <div>
              <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 16, fontFamily: SANS }}>
                {t("ruleOfLife.start_label", { defaultValue: "Start a conversation about prayer" })}
              </p>
              <h1 style={{ color: CREAM, fontSize: 26, fontWeight: 500, lineHeight: 1.35, fontFamily: SERIF, fontStyle: "italic", margin: 0 }}>
                {t("ruleOfLife.title", { defaultValue: "Rule of Life" })}
              </h1>
              <p style={{ color: SAGE, fontSize: 15, lineHeight: 1.6, marginTop: 12, fontFamily: SANS }}>
                {t("ruleOfLife.intro", { defaultValue: "A few questions about your day, your desires, and your time — then a personal practice to begin with." })}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { value: "self" as Mode, label: t("ruleOfLife.mode_self", { defaultValue: "Just me" }), sub: t("ruleOfLife.mode_self_sub", { defaultValue: "Walk through it on your own" }) },
                { value: "clergy" as Mode, label: t("ruleOfLife.mode_clergy", { defaultValue: "I'm guiding someone" }), sub: t("ruleOfLife.mode_clergy_sub", { defaultValue: "Questions are about the person across the table" }) },
                { value: "together" as Mode, label: t("ruleOfLife.mode_together", { defaultValue: "Together on two phones" }), sub: t("ruleOfLife.mode_together_sub", { defaultValue: "Each of you answers on your own device" }) },
              ].map(({ value, label, sub }) => (
                <button
                  key={value}
                  onClick={() => {
                    setMode(value);
                    if (value === "clergy") setPhase("name");
                    else { setPhase("slides"); setSlideIndex(0); }
                  }}
                  style={{
                    background: CHIP_DEFAULT,
                    border: `1px solid ${CHIP_BORDER}`,
                    borderRadius: 14,
                    padding: "14px 18px",
                    textAlign: "left",
                    cursor: "pointer",
                    color: CREAM,
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 600, fontFamily: SANS, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, color: SAGE_DIM, fontFamily: SANS }}>{sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Subject name (clergy mode) ──────────────────────────────────────────────

  if (phase === "name") {
    return (
      <div style={{ minHeight: "100dvh", background: EP_BG, position: "relative", display: "flex", flexDirection: "column" }}>
        <AnimatedBackground base={EP_BG} variant="pronounced" fadeTop />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 40px" }}>
          <button onClick={handleBack} style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "8px 0", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
            <ChevronLeft size={18} />
            <span style={{ fontSize: 14, fontFamily: SANS }}>{t("ruleOfLife.back", { defaultValue: "Back" })}</span>
          </button>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 24, maxWidth: 480, margin: "0 auto", width: "100%" }}>
            <p style={{ color: CREAM, fontSize: 20, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>
              {t("ruleOfLife.name_question", { defaultValue: "What's their first name?" })}
            </p>
            <p style={{ color: SAGE_DIM, fontSize: 14, fontFamily: SANS, margin: 0 }}>
              {t("ruleOfLife.name_sub", { defaultValue: "Used in the recommendation — you can leave it blank." })}
            </p>
            <input
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder={t("ruleOfLife.name_placeholder", { defaultValue: "First name (optional)" })}
              style={{
                background: CHIP_DEFAULT,
                border: `1px solid ${CHIP_BORDER}`,
                borderRadius: 12,
                padding: "14px 16px",
                color: CREAM,
                fontSize: 16,
                fontFamily: SANS,
                outline: "none",
              }}
              onKeyDown={(e) => { if (e.key === "Enter") { setPhase("slides"); setSlideIndex(0); } }}
            />
            <button
              onClick={() => { setPhase("slides"); setSlideIndex(0); }}
              style={{
                background: CTA,
                border: `1px solid ${CHIP_BORDER_ACTIVE}`,
                color: CREAM,
                borderRadius: 12,
                padding: "14px 20px",
                fontSize: 16,
                fontFamily: SANS,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {t("ruleOfLife.continue", { defaultValue: "Continue" })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Slideshow ───────────────────────────────────────────────────────────────

  if (phase === "slides" && currentSlide) {
    const progressPct = ((slideIndex + 1) / totalSlides) * 100;
    const questionText = mode === "clergy" && currentSlide.clergyCopy
      ? currentSlide.clergyCopy
      : currentSlide.question;
    const answered = slideAnswered(currentSlide);
    const isLast = slideIndex === totalSlides - 1;

    return (
      <div style={{ minHeight: "100dvh", background: EP_BG, position: "relative", display: "flex", flexDirection: "column" }}>
        <AnimatedBackground base={EP_BG} variant="pronounced" fadeTop />
        {customizerBgPhoto && (
          <>
            <img src={customizerBgPhoto} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.18, zIndex: 0 }} />
            <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(180deg, rgba(9,26,16, 0.605) 0%, rgba(9,26,16, 0.792) 50%, rgba(9,26,16, 0.935) 100%)" }} />
          </>
        )}
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 40px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <button onClick={handleBack} style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: 4 }}>
              <ChevronLeft size={20} />
            </button>
            <Link href="/daily-practice">
              <button style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: 4 }}>
                <X size={18} />
              </button>
            </Link>
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={slideIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, margin: "0 auto", width: "100%" }}
            >
              {currentSlide.movement && (
                <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, fontFamily: SANS }}>
                  {currentSlide.movement}
                </p>
              )}
              {currentSlide.italic && (
                <p style={{ color: CREAM, fontSize: 20, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.5, margin: 0, opacity: 0.85 }}>
                  {currentSlide.italic}
                </p>
              )}
              <p style={{ color: CREAM, fontSize: currentSlide.italic ? 17 : 22, fontFamily: currentSlide.italic ? SANS : SERIF, fontStyle: currentSlide.italic ? "normal" : "italic", lineHeight: 1.55, margin: 0 }}>
                {questionText}
              </p>
              {currentSlide.multi && (
                <p style={{ color: SAGE, fontSize: 13, fontFamily: SANS, margin: "-6px 0 0", letterSpacing: "0.2px" }}>
                  {t("ruleOfLife.select_all", { defaultValue: "Select all that apply" })}
                </p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {currentSlide.chips.map((chip) => (
                  <ChipButton
                    key={chip.value}
                    label={chip.label}
                    selected={isSelected(currentSlide, chip.value)}
                    onClick={() => toggleChip(currentSlide, chip.value)}
                  />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Continue */}
          <button
            onClick={handleContinue}
            disabled={!answered}
            style={{
              marginTop: 24,
              background: answered ? CTA : CHIP_DEFAULT,
              border: `1px solid ${answered ? CHIP_BORDER_ACTIVE : CHIP_BORDER}`,
              color: answered ? CREAM : SAGE_DIM,
              borderRadius: 12,
              padding: "14px 20px",
              fontSize: 16,
              fontWeight: 600,
              fontFamily: SANS,
              cursor: answered ? "pointer" : "not-allowed",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {isLast
              ? t("ruleOfLife.reveal", { defaultValue: "Reveal my rule of life" })
              : t("ruleOfLife.continue", { defaultValue: "Continue" })}
          </button>

          {/* Progress bar */}
          <div style={{ marginTop: 16, height: 2, background: "rgba(143,175,150,0.15)", borderRadius: 1 }}>
            <div style={{ height: "100%", background: SAGE, borderRadius: 1, width: `${progressPct}%`, transition: "width 0.3s" }} />
          </div>
          <p style={{ color: SAGE_DIM, fontSize: 12, textAlign: "center", margin: "8px 0 0", fontFamily: SANS }}>
            {slideIndex + 1} / {totalSlides}
          </p>
        </div>
      </div>
    );
  }

  // ── Loading / error ─────────────────────────────────────────────────────────

  if (phase === "loading") {
    const errored = recommendMutation.isError;
    return (
      <div style={{ minHeight: "100dvh", background: EP_BG, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <AnimatedBackground base={EP_BG} variant="pronounced" fadeTop />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: 24, maxWidth: 420 }}>
          {errored ? (
            <>
              <p style={{ color: CREAM, fontSize: 20, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>
                {t("ruleOfLife.error_title", { defaultValue: "Something interrupted us." })}
              </p>
              <p style={{ color: SAGE_DIM, fontSize: 14, marginTop: 12, fontFamily: SANS }}>
                {t("ruleOfLife.error_sub", { defaultValue: "Your answers are still here — let's try once more." })}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
                <button
                  onClick={submit}
                  style={{ background: CTA, border: `1px solid ${CHIP_BORDER_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "14px 20px", fontSize: 16, fontFamily: SANS, cursor: "pointer", fontWeight: 600 }}
                >
                  {t("ruleOfLife.try_again", { defaultValue: "Try again" })}
                </button>
                <button
                  onClick={() => { recommendMutation.reset(); setPhase("slides"); setSlideIndex(totalSlides - 1); }}
                  style={{ background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, color: CREAM, borderRadius: 12, padding: "13px 20px", fontSize: 15, fontFamily: SANS, cursor: "pointer" }}
                >
                  {t("ruleOfLife.back_to_questions", { defaultValue: "Back to questions" })}
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: CREAM, fontSize: 20, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>
                {t("ruleOfLife.loading", { defaultValue: "Holding what you've shared…" })}
              </p>
              <p style={{ color: SAGE_DIM, fontSize: 14, marginTop: 12, fontFamily: SANS }}>
                {t("ruleOfLife.loading_sub", { defaultValue: "Shaping a practice around your day." })}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Apply confirmation ──────────────────────────────────────────────────────

  if (phase === "apply-confirm" && result) {
    const { morning, evening } = result.settings;
    const lines: string[] = [];
    for (const [side, s] of [["morning", morning], ["evening", evening]] as [string, typeof morning][]) {
      if (!s.enabled) continue;
      const ss = s as SideSettings;
      const level = ss.level === "devotion" ? "Daily Devotion" : side === "morning" ? "Morning Prayer" : "Evening Prayer";
      lines.push(`${level} (${side}) · reminder ${fmtTime(ss.reminderTime)}`);
      if (ss.gratitude) lines.push("Gratitude pause");
      if (ss.confession) lines.push("Confession of sin");
      if (ss.minutes > 0) lines.push(`${ss.minutes} min silence`);
    }

    return (
      <div style={{ minHeight: "100dvh", background: EP_BG, position: "relative", display: "flex", flexDirection: "column" }}>
        <AnimatedBackground base={EP_BG} variant="pronounced" fadeTop />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 40px" }}>
          <button onClick={handleBack} style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "8px 0", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
            <ChevronLeft size={18} />
            <span style={{ fontSize: 14, fontFamily: SANS }}>{t("ruleOfLife.back", { defaultValue: "Back" })}</span>
          </button>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, margin: "0 auto", width: "100%" }}>
            <p style={{ color: CREAM, fontSize: 20, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>
              {t("ruleOfLife.apply_title", { defaultValue: "Apply this to your practice?" })}
            </p>
            <p style={{ color: SAGE_DIM, fontSize: 14, fontFamily: SANS, margin: 0 }}>
              {t("ruleOfLife.apply_sub", { defaultValue: "This will update your morning and evening prayer settings." })}
            </p>
            <div style={{ background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
              {lines.map((l, i) => (
                <p key={i} style={{ color: CREAM, fontSize: 14, fontFamily: SANS, margin: 0 }}>{l}</p>
              ))}
            </div>
            <button
              onClick={handleApply}
              style={{ background: CTA, border: `1px solid ${CHIP_BORDER_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "14px 20px", fontSize: 16, fontFamily: SANS, cursor: "pointer", fontWeight: 600 }}
            >
              {t("ruleOfLife.apply_confirm", { defaultValue: "Yes, apply it" })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Email modal ─────────────────────────────────────────────────────────────

  if (phase === "email" && result) {
    return (
      <div style={{ minHeight: "100dvh", background: EP_BG, position: "relative", display: "flex", flexDirection: "column" }}>
        <AnimatedBackground base={EP_BG} variant="pronounced" fadeTop />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 40px" }}>
          <button onClick={handleBack} style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "8px 0", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
            <ChevronLeft size={18} />
            <span style={{ fontSize: 14, fontFamily: SANS }}>{t("ruleOfLife.back", { defaultValue: "Back" })}</span>
          </button>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, margin: "0 auto", width: "100%" }}>
            {emailSent ? (
              <>
                <p style={{ color: CREAM, fontSize: 20, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>
                  {t("ruleOfLife.email_sent", { defaultValue: "Sent. The rule of life is on its way." })}
                </p>
                <button
                  onClick={() => setPhase("result")}
                  style={{ background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, color: CREAM, borderRadius: 12, padding: "14px 20px", fontSize: 15, fontFamily: SANS, cursor: "pointer" }}
                >
                  {t("ruleOfLife.back_to_result", { defaultValue: "Back to your rule of life" })}
                </button>
              </>
            ) : (
              <>
                <p style={{ color: CREAM, fontSize: 20, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>
                  {t("ruleOfLife.email_title", { defaultValue: "Where should we send it?" })}
                </p>
                <p style={{ color: SAGE_DIM, fontSize: 14, fontFamily: SANS, margin: 0 }}>
                  {t("ruleOfLife.email_sub", { defaultValue: "The narrative and a link to view it in the app." })}
                </p>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={t("ruleOfLife.email_placeholder", { defaultValue: "Email address" })}
                  style={{ background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, borderRadius: 12, padding: "14px 16px", color: CREAM, fontSize: 16, fontFamily: SANS, outline: "none" }}
                />
                <button
                  onClick={handleEmailSend}
                  disabled={!emailInput.trim() || emailMutation.isPending}
                  style={{ background: emailInput.trim() ? CTA : CHIP_DEFAULT, border: `1px solid ${emailInput.trim() ? CHIP_BORDER_ACTIVE : CHIP_BORDER}`, color: CREAM, borderRadius: 12, padding: "14px 20px", fontSize: 16, fontFamily: SANS, cursor: emailInput.trim() ? "pointer" : "not-allowed", fontWeight: 600, opacity: emailMutation.isPending ? 0.6 : 1 }}
                >
                  {emailMutation.isPending ? t("ruleOfLife.sending", { defaultValue: "Sending…" }) : t("ruleOfLife.send_email", { defaultValue: "Send it" })}
                </button>
                {emailMutation.isError && (
                  <p style={{ color: "#e87a7a", fontSize: 13, fontFamily: SANS, margin: 0 }}>
                    {t("ruleOfLife.email_error", { defaultValue: "Something went wrong. Try again." })}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Way of Love — address the thin connection ────────────────────────────────

  if (phase === "practices") {
    // Opens here directly (no questionnaire). When a maker result exists it
    // personalizes; otherwise it runs on sensible defaults. Wrapped in Layout
    // CHROMELESS — the Phoebe top bar is hidden so the builder reads as a focused
    // sheet; a single X-out (top-right) closes back to the daily progress.
    return (
      <Layout
        bgPhoto={flowLeaf}
        chromeless
        onClose={() => (result ? setPhase("result") : setLocation("/daily-progress"))}
      >
        <WayOfLoveRuleFlow
          guest={guestFlow}
          onBack={() => (result ? setPhase("result") : setLocation("/daily-progress"))}
          onDone={() => setLocation("/daily-progress")}
        />
      </Layout>
    );
  }

  // ── Result ──────────────────────────────────────────────────────────────────

  if (phase === "result" && result) {
    return (
      <div style={{ minHeight: "100dvh", background: EP_BG, position: "relative" }}>
        <AnimatedBackground base={EP_BG} variant="pronounced" fadeTop />
        <div style={{ position: "relative", zIndex: 1, padding: "24px 20px 60px", maxWidth: 560, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            <Link href="/daily-practice">
              <button style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", fontSize: 14, fontFamily: SANS, display: "flex", alignItems: "center", gap: 6 }}>
                <ChevronLeft size={16} />
                {t("ruleOfLife.done", { defaultValue: "Done" })}
              </button>
            </Link>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: "My Rule of Life", text: result.narrative, url: `${window.location.origin}/rule-of-life/${result.id}` }).catch(() => {});
                } else {
                  setPhase("email");
                }
              }}
              style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: 4 }}
            >
              <Share2 size={18} />
            </button>
          </div>

          {/* Saved badge */}
          {applyDone && (
            <div style={{ background: "rgba(46,107,64,0.20)", border: `1px solid rgba(46,107,64,0.40)`, borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <Check size={15} color={SAGE} />
              <span style={{ color: SAGE, fontSize: 13, fontFamily: SANS }}>
                {t("ruleOfLife.applied_badge", { defaultValue: "Applied to your prayer settings" })}
              </span>
            </div>
          )}

          {/* Title */}
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 10, fontFamily: SANS }}>
            {t("ruleOfLife.result_label", { defaultValue: "Your Rule of Life" })}
          </p>

          {/* Narrative */}
          <div style={{ marginBottom: 28 }}>
            {result.narrative.split("\n\n").map((para, i) => (
              <p key={i} style={{ color: CREAM, fontSize: 17, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.75, marginBottom: 18 }}>
                {para}
              </p>
            ))}
          </div>

          {/* Plain summary card */}
          <div style={{ background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, borderRadius: 14, padding: "16px 18px", marginBottom: 24 }}>
            <p style={{ color: SAGE, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px", fontFamily: SANS }}>
              {t("ruleOfLife.practice_label", { defaultValue: "The practice" })}
            </p>
            {result.plainSummary.split("\n").filter(Boolean).map((line, i) => (
              <p key={i} style={{ color: CREAM, fontSize: 14, fontFamily: SANS, margin: "0 0 6px", lineHeight: 1.5 }}>
                {line}
              </p>
            ))}
          </div>

          {/* Anchor callout */}
          <p style={{ color: SAGE_DIM, fontSize: 13, fontFamily: SERIF, fontStyle: "italic", textAlign: "center", marginBottom: 28 }}>
            {t("ruleOfLife.anchor_label", { defaultValue: "Anchor: " })}{result.anchor}
          </p>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => setPhase("practices")}
              style={{ background: CTA, border: `1px solid ${CHIP_BORDER_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "14px 20px", fontSize: 16, fontFamily: SANS, cursor: "pointer", fontWeight: 600 }}
            >
              {t("ruleOfLife.way_of_love_btn", { defaultValue: "Now — the areas to grow" })}
            </button>
            {!applyDone && (
              <button
                onClick={() => setPhase("apply-confirm")}
                style={{ background: "none", border: `1px solid rgba(143,175,150,0.25)`, color: SAGE, borderRadius: 12, padding: "13px 20px", fontSize: 15, fontFamily: SANS, cursor: "pointer" }}
              >
                {t("ruleOfLife.apply_btn", { defaultValue: "Apply to my prayer settings" })}
              </button>
            )}
            <button
              onClick={() => setLocation(`/rule-of-life/${result.id}`)}
              style={{ background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, color: CREAM, borderRadius: 12, padding: "14px 20px", fontSize: 15, fontFamily: SANS, cursor: "pointer" }}
            >
              {t("ruleOfLife.save_btn", { defaultValue: "Save & revisit later" })}
            </button>
            <button
              onClick={() => setPhase("email")}
              style={{ background: "none", border: `1px solid rgba(143,175,150,0.25)`, color: SAGE, borderRadius: 12, padding: "13px 20px", fontSize: 15, fontFamily: SANS, cursor: "pointer" }}
            >
              {t("ruleOfLife.email_btn", { defaultValue: "Email or text it" })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
