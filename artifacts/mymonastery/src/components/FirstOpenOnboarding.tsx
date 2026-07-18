import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { HOME_LEAF_PHOTOS } from "@/lib/earthPhotos";
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
import { pushRoutineConfig } from "@/lib/routineSync";
import { shouldShowFirstOpenOnboarding, markFirstOpenOnboardingDone } from "@/lib/firstOpenOnboarding";

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
  { key: "intercessions", level: "intercessions", emoji: "🙏", rgb: "150,120,180", title: "The Prayer List", blurb: "Pray the community's daily intercessions." },
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

function applyChoices(
  method: Method,
  newsletter: ReflectionSource,
  user: { homeLayout?: HomeLayout | null; isAnonymous?: boolean } | null | undefined,
  invalidateAuth: () => void,
): void {
  // 1. Prayer method → office level (both sides), plus the contemplation flag.
  for (const side of SIDES) {
    setSideLevel(side, method.level);
    setSideContemplation(side, !!method.contemplation);
    if (method.contemplation) setSideMinutes(side, 10);
    setSideReflection(side, newsletter);
  }
  setReflectionSource(newsletter);

  // 2. Home layout: the chosen reading ON (right after the office card), the
  //    other two OFF. A reflection card only shows when its key is in `order` and
  //    not in `hidden`, so we set all three explicitly.
  const base: HomeLayout =
    (user?.homeLayout as HomeLayout | undefined) ??
    readCachedHomeLayout() ??
    { order: ["requests", "office", "contemplation", "feeds"], hidden: [] };
  let order = base.order.filter((k) => !NEWS_KEYS.includes(k));
  let hidden = base.hidden.filter((k) => !NEWS_KEYS.includes(k));
  if (newsletter !== "none") {
    const oi = order.indexOf("office");
    if (oi >= 0) order.splice(oi + 1, 0, newsletter);
    else order.unshift(newsletter);
  }
  for (const k of NEWS_KEYS) {
    if (k === newsletter) continue;
    order.push(k);
    hidden.push(k);
  }
  const layout: HomeLayout = { order, hidden, v: HOME_LAYOUT_VERSION };

  if (isDeviceLocalGuest(user)) {
    cacheHomeLayoutLocalOnly(layout);
  } else {
    void saveHomeLayout(layout);
    invalidateAuth();
    void pushRoutineConfig();
  }
  // Nudge every home reader to re-read (the setters already fire this, but fire
  // once more AFTER the layout write so the guest path picks up the new cache).
  try { window.dispatchEvent(new Event(OFFICE_PREFS_EVENT)); } catch { /* ignore */ }
}

function Choice({
  emoji, rgb, title, blurb, selected, onClick,
}: { emoji: string; rgb: string; title: string; blurb: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left relative flex rounded-3xl overflow-hidden active:scale-[0.99] transition-transform"
      style={{
        background: CARD_BG,
        backdropFilter: "blur(11.34px)",
        WebkitBackdropFilter: "blur(11.34px)",
        border: selected ? `1.5px solid rgba(${rgb},0.95)` : `1px solid ${CARD_BORDER}`,
        boxShadow: selected ? `0 0 0 3px rgba(${rgb},0.18)` : "none",
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
    </button>
  );
}

// The daily-routine tutorial — three slides after the loading screen, in the
// SAME shape as the Co-Breathe how-it-works intro (eyebrow → big title → body →
// Next pill + counter + Skip). Teaches what's-next, progress, and shaping.
const TUTORIAL: Array<{ eyebrow: string; title: string; body: string; emoji: string }> = [
  { eyebrow: "Your daily rhythm", emoji: "🕊️", title: "See what's next", body: "Phoebe always shows you the next thing to pray, right at the top. Tap the card and begin — no hunting, no guilt about what you missed." },
  { eyebrow: "Your daily rhythm", emoji: "🌿", title: "Watch it come together", body: "Each practice you keep slips down to “done,” and your day fills in as you pray — a quiet picture of the rhythm you're keeping." },
  { eyebrow: "Your daily rhythm", emoji: "✨", title: "Shape it your way", body: "Add practices, change how you pray, set reminders. Your rhythm is yours — reshape it anytime from your routine." },
];

export function FirstOpenOnboarding() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [visible, setVisible] = useState(() => shouldShowFirstOpenOnboarding());
  const [step, setStep] = useState<"pray" | "read" | "loading" | "tutorial">("pray");
  const [method, setMethod] = useState<string>("psalms");
  const [newsletter, setNewsletter] = useState<ReflectionSource>("fdd");
  const [tut, setTut] = useState(0);
  const bgPhoto = useMemo(
    () => (HOME_LEAF_PHOTOS.length > 0 ? HOME_LEAF_PHOTOS[Math.floor(Math.random() * HOME_LEAF_PHOTOS.length)]! : null),
    [],
  );

  // The "setting up your home" loading beat, then into the tutorial.
  useEffect(() => {
    if (step !== "loading") return;
    const id = window.setTimeout(() => setStep("tutorial"), 1700);
    return () => window.clearTimeout(id);
  }, [step]);

  if (!visible) return null;

  // Apply the two choices to the routine, mark onboarding done, and move to the
  // loading beat (done is stamped here so a force-quit during the tutorial won't
  // re-run the picker — they've already chosen).
  const applyAndContinue = (reading: ReflectionSource) => {
    const chosen = METHODS.find((m) => m.key === method) ?? METHODS[0]!;
    try {
      applyChoices(chosen, reading, user, () => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }));
    } catch {
      /* never trap the user on the splash if a write fails */
    }
    markFirstOpenOnboardingDone();
    setStep("loading");
  };
  const dismiss = () => setVisible(false);
  const nextTutorial = () => { if (tut >= TUTORIAL.length - 1) dismiss(); else setTut((n) => n + 1); };

  const pillBase = "rounded-full px-9 py-3.5 text-sm font-semibold tracking-wide transition-opacity active:scale-[0.98]";
  const pillStyle = { background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: FONT, cursor: "pointer" } as const;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "#091A10", isolation: "isolate",
        paddingTop: "var(--safe-top)",
        overflowY: "auto", overflowX: "hidden",
      }}
    >
      {bgPhoto && (
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <img src={bgPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.42 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(9,26,16,0.62) 0%, rgba(9,26,16,0.82) 55%, rgba(9,26,16,0.94) 100%)" }} />
        </div>
      )}

      <div
        className="relative w-full max-w-md mx-auto flex flex-col"
        style={{ zIndex: 1, minHeight: "100dvh", padding: "clamp(28px,6dvh,56px) 20px calc(env(safe-area-inset-bottom,0px) + 24px)" }}
      >
        <AnimatePresence mode="wait">
          {step === "pray" ? (
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
          ) : step === "loading" ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="flex-1 flex flex-col items-center justify-center text-center">
              <motion.div
                aria-hidden
                animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                style={{ fontSize: 44, marginBottom: 18 }}
              >
                🌿
              </motion.div>
              <p className="text-[15px]" style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
                Setting up your home…
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={`tut-${tut}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}
              className="flex-1 flex flex-col items-center justify-center text-center"
              onClick={nextTutorial}
              style={{ cursor: "pointer" }}
            >
              <div aria-hidden style={{ fontSize: 52, marginBottom: 20, filter: "drop-shadow(0 0 14px rgba(90,150,110,0.5))" }}>
                {TUTORIAL[tut]!.emoji}
              </div>
              <p className="text-[11px] uppercase tracking-[0.22em] font-semibold mb-3.5" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
                {TUTORIAL[tut]!.eyebrow}
              </p>
              <h1 className="text-[28px] font-bold leading-tight mb-4 px-2" style={{ color: WARM, fontFamily: FONT }}>
                {TUTORIAL[tut]!.title}
              </h1>
              <p className="text-[16px] leading-relaxed px-3" style={{ color: "rgba(240,237,230,0.86)", fontFamily: FONT, maxWidth: 360 }}>
                {TUTORIAL[tut]!.body}
              </p>
              <div className="mt-10 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs mb-4" style={{ color: "rgba(143,175,150,0.4)", letterSpacing: "0.06em", fontFamily: FONT }}>
                  {tut + 1} of {TUTORIAL.length}
                </p>
                <button type="button" onClick={nextTutorial} className={`${pillBase} px-12`} style={pillStyle}>
                  {tut >= TUTORIAL.length - 1 ? "Enter Phoebe" : "Next"}
                </button>
                {tut < TUTORIAL.length - 1 && (
                  <button type="button" onClick={dismiss} className="mt-3 text-[13px] font-semibold" style={{ color: "rgba(200,212,192,0.65)", fontFamily: FONT, background: "none", border: "none", cursor: "pointer", padding: "4px 10px" }}>
                    Skip
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
