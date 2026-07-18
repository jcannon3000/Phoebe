import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { swellHaptic } from "@/lib/swellHaptic";
import {
  setSideLevel,
  setSideContemplation,
  setSideMinutes,
  setReflectionSource,
  setSideReflection,
  OFFICE_PREFS_EVENT,
  type OfficeSide,
  type OfficeLevel,
  type ReflectionSource,
} from "@/lib/officePrefs";
import {
  saveHomeLayout,
  cacheHomeLayoutLocalOnly,
  readCachedHomeLayout,
  HOME_LAYOUT_VERSION,
  type HomeLayout,
} from "@/lib/homeLayoutCache";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { setGuestSilenceGoalMin } from "@/lib/guestSeed";
import { pushRoutineConfig } from "@/lib/routineSync";
import { shouldShowFirstOpenOnboarding, markFirstOpenOnboardingDone, markFirstOpenOnboardingActive, FIRST_OPEN_ONBOARDING_CLOSED_EVENT } from "@/lib/firstOpenOnboarding";

// First-open prayer-setup splash — the look of the home "what's next" hero card
// (frosted-green card, left accent spine, emoji → title → blurb, over the leaf
// backdrop), used as a two-step picker: (1) which of five prayer methods to make
// your daily prayer, (2) which daily reading (newsletter) to carry. On finish it
// writes the same routine prefs the customizer's commit() does for those choices,
// so the home lands already set up. iOS/native, once, on first open.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_BORDER = "rgba(200,212,192,0.35)";
// The home hero card's frosted-green fill at its flat tint (≈0.4).
const CARD_BG = "rgba(20,42,29,0.31)";

type Method = {
  key: string;
  level: OfficeLevel;
  contemplation?: boolean;
  emoji: string;
  rgb: string;
  title: string;
  blurb: string;
};

const METHODS: Method[] = [
  { key: "psalms", level: "psalms", emoji: "📜", rgb: "120,150,170", title: "The Psalms", blurb: "Pray through the psalter, a portion each day." },
  { key: "office", level: "office", emoji: "🕊️", rgb: "46,107,64", title: "The Daily Office", blurb: "Morning & Evening Prayer from the Book of Common Prayer." },
  { key: "devotion", level: "devotion", emoji: "📖", rgb: "96,141,209", title: "Daily Devotions", blurb: "A shorter form of the office, for busy days." },
  { key: "contemplation", level: "reflect-sit", contemplation: true, emoji: "🕯️", rgb: "62,124,122", title: "Contemplative Prayer", blurb: "Rest in silence with God." },
  { key: "creation", level: "creation", emoji: "🌍", rgb: "90,150,110", title: "Creation Prayer", blurb: "A daily breath prayer with all creation." },
];

type Newsletter = { key: ReflectionSource; emoji: string; rgb: string; title: string; blurb: string };
const NEWSLETTERS: Newsletter[] = [
  { key: "fdd", emoji: "📖", rgb: "96,141,209", title: "Forward Day by Day", blurb: "A daily meditation from Forward Movement." },
  { key: "ssje", emoji: "✍🏽", rgb: "62,124,122", title: "Brother, Give Us a Word", blurb: "A word a day from the Society of St. John the Evangelist." },
  { key: "cac", emoji: "🌅", rgb: "150,120,180", title: "CAC Daily Meditation", blurb: "From the Center for Action & Contemplation." },
];

const SIDES: OfficeSide[] = ["morning", "evening"];
const NEWS_KEYS = ["cac", "fdd", "ssje"];

// Turn a home-layout card on/off. A card shows only when its key is in `order`
// AND not in `hidden` — so "off" keeps it in order but adds it to hidden.
function setCard(order: string[], hidden: string[], key: string, on: boolean, after?: string): [string[], string[]] {
  const o = order.filter((k) => k !== key);
  const h = hidden.filter((k) => k !== key);
  if (on) {
    const ai = after ? o.indexOf(after) : -1;
    if (ai >= 0) o.splice(ai + 1, 0, key);
    else o.push(key);
  } else {
    o.push(key);
    h.push(key);
  }
  return [o, h];
}

function applyChoices(
  method: Method,
  newsletter: ReflectionSource,
  user: { homeLayout?: HomeLayout | null; isAnonymous?: boolean } | null | undefined,
  invalidateAuth: () => void,
): void {
  const isContemplation = method.key === "contemplation";
  const isCreation = method.key === "creation";
  // Contemplative AND Creation Prayer both ride the PER-SIDE contemplation cards
  // (Morning + Evening), exactly like the customizer — they differ only by
  // contemplation-style: "silent" = a silent sit, "cobreathe" = Co-Breathe, which
  // renders those two cards as "Morning/Evening Creation Prayer". So both are
  // twice-daily. BCP forms (office/psalms/devotion) are the twice-daily office.
  const contemplativeCard = isContemplation || isCreation;
  const officeLevel: OfficeLevel = contemplativeCard ? "ask" : method.level;
  for (const side of SIDES) {
    setSideLevel(side, officeLevel);
    setSideContemplation(side, contemplativeCard);
    if (isContemplation) setSideMinutes(side, 10);
    setSideReflection(side, newsletter);
  }
  setReflectionSource(newsletter);
  // Style the per-side contemplation cards: Co-Breathe for Creation Prayer, a
  // silent sit for Contemplative.
  if (contemplativeCard) {
    try { localStorage.setItem("phoebe:contemplation-style", isCreation ? "cobreathe" : "silent"); } catch { /* ignore */ }
  }

  const guest = isDeviceLocalGuest(user);
  // For Contemplative/Creation the per-side cards ARE the practice, so no separate
  // standalone silence card; BCP forms keep the default short silence in the rhythm.
  if (guest) setGuestSilenceGoalMin(contemplativeCard ? 0 : 5);

  // Home layout: only the daily reading (chosen ON after the office card, the other
  // two OFF). Creation Prayer needs NO layout card — it rides the per-side
  // contemplation cards above. Don't FABRICATE a layout for a signed-in user whose
  // real layout isn't loaded (would drop their cards) — only mutate with a base or
  // for a guest.
  const base = (user?.homeLayout as HomeLayout | undefined) ?? readCachedHomeLayout();
  if (base || guest) {
    let order = (base?.order ?? ["office"]).slice();
    let hidden = (base?.hidden ?? []).slice();
    for (const k of NEWS_KEYS) {
      [order, hidden] = setCard(order, hidden, k, k === newsletter, "office");
    }
    const layout: HomeLayout = { order, hidden, v: HOME_LAYOUT_VERSION };
    if (guest) cacheHomeLayoutLocalOnly(layout);
    else { void saveHomeLayout(layout); invalidateAuth(); }
  }
  if (!guest) void pushRoutineConfig();
  // Nudge every home reader to re-read (the setters already fire this, but fire
  // once more AFTER the layout write so the guest path picks up the new cache).
  try { window.dispatchEvent(new Event(OFFICE_PREFS_EVENT)); } catch { /* ignore */ }
}

function Choice({
  emoji, rgb, title, blurb, selected, onClick,
}: { emoji: string; rgb: string; title: string; blurb: string; selected: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="w-full text-left relative flex rounded-3xl overflow-hidden active:scale-[0.99] transition-transform"
      // The selected card's border opacity gently pulses; unselected is static.
      animate={selected
        ? { borderColor: [`rgba(${rgb},0.35)`, `rgba(${rgb},0.95)`, `rgba(${rgb},0.35)`] }
        : { borderColor: CARD_BORDER }}
      transition={selected
        ? { duration: 1.9, repeat: Infinity, ease: "easeInOut" }
        : { duration: 0.25 }}
      style={{
        background: CARD_BG,
        backdropFilter: "blur(11.34px)",
        WebkitBackdropFilter: "blur(11.34px)",
        borderWidth: 1.5,
        borderStyle: "solid",
        boxShadow: selected ? `0 0 0 3px rgba(${rgb},0.16)` : "none",
      }}
    >
      <div className="w-1.5 flex-shrink-0" style={{ background: `rgba(${rgb},0.72)` }} />
      <div className="flex-1 min-w-0 px-4 py-4 flex items-center gap-3">
        <span className="text-[28px] flex-shrink-0" aria-hidden>{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
          <p className="text-[12.5px] mt-0.5 leading-snug" style={{ color: SAGE, fontFamily: FONT }}>{blurb}</p>
        </div>
        <span
          className="flex-shrink-0 rounded-full flex items-center justify-center"
          style={{
            width: 22, height: 22, fontSize: 13, fontWeight: 800,
            border: `1.5px solid ${selected ? `rgba(${rgb},0.95)` : "rgba(200,212,192,0.35)"}`,
            background: selected ? `rgba(${rgb},0.95)` : "transparent",
            color: "#0A1C14",
          }}
        >
          {selected ? "✓" : ""}
        </span>
      </div>
    </motion.button>
  );
}


export function FirstOpenOnboarding() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [visible, setVisible] = useState(() => shouldShowFirstOpenOnboarding());
  const [step, setStep] = useState<"welcome" | "pray" | "read" | "loading">("welcome");
  const [method, setMethod] = useState<string>("psalms");
  const [newsletter, setNewsletter] = useState<ReflectionSource>("fdd");
  const [closing, setClosing] = useState(false);
  // `?firstrun=1` is a PREVIEW: walk the flow visually but write nothing and
  // don't mark it done, so opening a link with the param can never overwrite a
  // real (possibly signed-in) user's routine.
  const preview = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("firstrun") === "1"; } catch { return false; }
  }, []);

  // Mark the intro ACTIVE for its whole lifetime so the home (rendered behind
  // this overlay) holds its cards + cascade haptics until we dissolve. And fire
  // ONE sustained smooth swell haptic as the intro opens — the app's welcome.
  const swelledRef = useRef(false);
  useEffect(() => {
    if (!visible) return;
    markFirstOpenOnboardingActive(true);
    if (!swelledRef.current) { swelledRef.current = true; try { swellHaptic(); } catch { /* ignore */ } }
    return () => markFirstOpenOnboardingActive(false);
  }, [visible]);

  // The "setting up your home" loading beat, then dissolve straight into the home.
  useEffect(() => {
    if (step !== "loading") return;
    const id = window.setTimeout(() => dismiss(), 1900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!visible) return null;

  // Apply the two choices to the routine, mark onboarding done, and move to the
  // loading beat (done is stamped here so a force-quit during the tutorial won't
  // re-run the picker — they've already chosen).
  const applyAndContinue = (reading: ReflectionSource) => {
    // A returning signed-in user (real account with an existing home layout) who
    // lands on a fresh browser also trips the first-open gate — show them the
    // intro, but DON'T rewrite their rhythm. (Guests + brand-new signups have no
    // layout yet, so they get the real apply.) `?firstrun=1` is read-only too.
    const readOnly = preview || (!!user && !isDeviceLocalGuest(user) && !!user.homeLayout);
    if (!readOnly) {
      const chosen = METHODS.find((m) => m.key === method) ?? METHODS[0]!;
      try {
        applyChoices(chosen, reading, user, () => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }));
      } catch {
        /* never trap the user on the splash if a write fails */
      }
    }
    // Mark done except in the explicit ?firstrun preview (which stays repeatable).
    if (!preview) markFirstOpenOnboardingDone();
    setStep("loading");
  };
  // Dissolve INTO the home (fade the opaque overlay out) rather than hard-cutting.
  // As the fade BEGINS, tell the home to un-gate and cascade its cards in (so
  // they rise under the fading overlay), and clear the active flag so no cascade
  // haptic was suppressed a moment too long.
  const dismiss = () => {
    markFirstOpenOnboardingActive(false);
    try {
      sessionStorage.setItem("phoebe:splash-done-once", "1");
      window.dispatchEvent(new CustomEvent("phoebe:splash-done"));
      window.dispatchEvent(new CustomEvent(FIRST_OPEN_ONBOARDING_CLOSED_EVENT));
    } catch { /* ignore */ }
    setClosing(true);
  };

  const pillBase = "rounded-full px-9 py-3.5 text-sm font-semibold tracking-wide transition-opacity active:scale-[0.98]";
  const pillStyle = { background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: FONT, cursor: "pointer" } as const;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: closing ? 0.55 : 0.3, ease: "easeInOut" }}
      onAnimationComplete={() => { if (closing) setVisible(false); }}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "var(--oh-bg, #0C1F12)", isolation: "isolate",
        paddingTop: "var(--safe-top)",
        overflowY: "auto", overflowX: "hidden",
      }}
    >
      {/* The same slow drifting-green backdrop the office slideshow prays over,
          so the whole intro shares the liturgy's visual language. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <AnimatedBackground base="var(--oh-bg, #0C1F12)" variant="subtle" fadeTop />
      </div>

      <div
        className="relative w-full max-w-md mx-auto flex flex-col"
        style={{ zIndex: 1, minHeight: "100dvh", padding: "clamp(28px,6dvh,56px) 20px calc(env(safe-area-inset-bottom,0px) + 24px)" }}
      >
        <AnimatePresence mode="wait">
          {step === "welcome" ? (
            <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.5 }} className="flex-1 flex flex-col items-center justify-center text-center">
              <motion.div
                aria-hidden
                animate={{ scale: [1, 1.06, 1], opacity: [0.86, 1, 0.86] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                style={{ fontSize: 56, marginBottom: 26, filter: "drop-shadow(0 0 22px rgba(150,205,170,0.55))" }}
              >
                🕊️
              </motion.div>
              <h1 className="title-glow-breathe text-[32px] font-bold leading-tight mb-4" style={{ color: WARM, fontFamily: FONT }}>
                Welcome to Phoebe
              </h1>
              <p className="text-[16px] leading-relaxed px-3" style={{ color: "rgba(182,210,188,0.82)", fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", maxWidth: 360, textShadow: "0 2px 16px rgba(8,30,18,0.6)" }}>
                A gentle rhythm of prayer, kept a day at a time. Let's set yours up — it takes a moment, and you can change everything later.
              </p>
              <button type="button" onClick={() => setStep("pray")} className={`${pillBase} px-12 mt-10`} style={pillStyle}>
                Begin
              </button>
            </motion.div>
          ) : step === "pray" ? (
            <motion.div key="pray" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="flex flex-col">
              <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
                Welcome to Phoebe · 1 of 2
              </p>
              <h1 className="text-[26px] font-bold leading-tight mb-1.5" style={{ color: WARM, fontFamily: FONT }}>
                How would you like to pray?
              </h1>
              <p className="text-[14px] mb-5" style={{ color: SAGE, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
                Choose your daily prayer. You can change it, or add more, anytime.
              </p>
              <div className="flex flex-col gap-2.5">
                {METHODS.map((m) => (
                  <Choice key={m.key} emoji={m.emoji} rgb={m.rgb} title={m.title} blurb={m.blurb} selected={method === m.key} onClick={() => setMethod(m.key)} />
                ))}
              </div>
              <button type="button" onClick={() => setStep("read")} className={`${pillBase} w-full mt-6`} style={pillStyle}>
                Continue
              </button>
            </motion.div>
          ) : step === "read" ? (
            <motion.div key="read" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="flex flex-col">
              <button type="button" onClick={() => setStep("pray")} className="self-start text-[13px] font-semibold mb-3" style={{ color: SAGE, fontFamily: FONT, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                ← Back
              </button>
              <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
                Welcome to Phoebe · 2 of 2
              </p>
              <h1 className="text-[26px] font-bold leading-tight mb-1.5" style={{ color: WARM, fontFamily: FONT }}>
                A daily reading to carry
              </h1>
              <p className="text-[14px] mb-5" style={{ color: SAGE, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
                Pick a reflection to read each day — or skip for now.
              </p>
              <div className="flex flex-col gap-2.5">
                {NEWSLETTERS.map((n) => (
                  <Choice key={n.key} emoji={n.emoji} rgb={n.rgb} title={n.title} blurb={n.blurb} selected={newsletter === n.key} onClick={() => setNewsletter(n.key)} />
                ))}
              </div>
              <button type="button" onClick={() => applyAndContinue(newsletter)} className={`${pillBase} w-full mt-6`} style={pillStyle}>
                Begin
              </button>
              <button type="button" onClick={() => applyAndContinue("none")} className="mt-3 self-center text-[13px] font-semibold" style={{ color: "rgba(200,212,192,0.7)", fontFamily: FONT, background: "none", border: "none", cursor: "pointer", padding: "4px 10px" }}>
                Skip for now
              </button>
            </motion.div>
          ) : (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="flex-1 flex flex-col items-center justify-center text-center">
              {/* The office "gathering" screen — a breathing radial orb over the
                  drifting green backdrop, so setting up the home feels like the
                  start of prayer, not a buffering app. */}
              <div
                className="intercession-loader-orb"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 50% 38%, rgba(150,205,170,0.55) 0%, rgba(46,107,64,0.35) 55%, rgba(46,107,64,0.08) 100%)",
                  boxShadow: "0 0 36px rgba(46,107,64,0.55), inset 0 0 18px rgba(140,205,160,0.35)",
                }}
              />
              <p
                className="intercession-loader-copy mt-7 text-center"
                style={{ color: "rgba(182,210,188,0.82)", fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 16, lineHeight: 1.5, textShadow: "0 2px 16px rgba(8,30,18,0.6)", maxWidth: 320 }}
              >
                Setting up your home…
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
