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
import { setGuestSilenceGoalMin } from "@/lib/guestSeed";
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
  // We EDIT the default rhythm (Morning + Evening office + a short silence) rather
  // than stripping it to one card. BCP forms (office/psalms/devotion) set the
  // office form for BOTH sides. Contemplative replaces the office with a silent
  // sit on both sides. Creation Prayer is a single daily breath practice, so it
  // KEEPS the twice-daily office + silence and ADDS the Co-Breathe card.
  const officeLevel: OfficeLevel = isContemplation ? "ask" : isCreation ? "office" : method.level;
  for (const side of SIDES) {
    setSideLevel(side, officeLevel);
    setSideContemplation(side, isContemplation);
    if (isContemplation) setSideMinutes(side, 10);
    setSideReflection(side, newsletter);
  }
  setReflectionSource(newsletter);

  const guest = isDeviceLocalGuest(user);
  // Keep the default silence card (the seeded 5-min goal) for every method — it's
  // part of the daily rhythm. Contemplative deepens it a little (10).
  if (guest && isContemplation) setGuestSilenceGoalMin(10);

  // Home layout: chosen reading ON (after the office card) + the other two OFF;
  // the Co-Breathe card ON only for Creation Prayer. Don't FABRICATE a layout for
  // a signed-in user whose real layout isn't loaded — overwriting it with a stub
  // would drop their cards. Only mutate when we have a base, or for a guest.
  const base = (user?.homeLayout as HomeLayout | undefined) ?? readCachedHomeLayout();
  if (base || guest) {
    let order = (base?.order ?? ["office"]).slice();
    let hidden = (base?.hidden ?? []).slice();
    [order, hidden] = setCard(order, hidden, "cobreathe", isCreation, "office");
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

// ── Little live-looking MOCKS of the real home so the tutorial SHOWS what it's
//    describing (like the Co-Breathe intro shows the breath ring). ──────────────
function MiniCard({ emoji, rgb, title, blurb, cta, kept, dim }: { emoji: string; rgb: string; title: string; blurb?: string; cta?: string; kept?: boolean; dim?: boolean }) {
  return (
    <div style={{ display: "flex", width: "100%", borderRadius: 18, overflow: "hidden", background: CARD_BG, border: `1px solid ${CARD_BORDER}`, opacity: dim ? 0.55 : 1 }}>
      <div style={{ width: 5, flexShrink: 0, background: `rgba(${rgb},0.72)` }} />
      <div style={{ flex: 1, minWidth: 0, padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 23, flexShrink: 0 }} aria-hidden>{emoji}</span>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: WARM, fontFamily: FONT, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
          {blurb && <p style={{ fontSize: 11, color: SAGE, fontFamily: FONT, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{blurb}</p>}
        </div>
        {kept ? (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(126,210,140,0.95)", fontFamily: FONT, flexShrink: 0 }}>✓ kept</span>
        ) : cta ? (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: WARM, fontFamily: FONT, background: `rgba(${rgb},0.85)`, borderRadius: 999, padding: "6px 13px", flexShrink: 0 }}>{cta}</span>
        ) : null}
      </div>
    </div>
  );
}

function RoutineRow({ emoji, title, on }: { emoji: string; title: string; on: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: "10px 12px" }}>
      <span style={{ color: "rgba(143,175,150,0.45)", fontSize: 15, letterSpacing: "-2px", flexShrink: 0 }} aria-hidden>⠿</span>
      <span style={{ fontSize: 19, flexShrink: 0 }} aria-hidden>{emoji}</span>
      <span style={{ flex: 1, textAlign: "left", fontSize: 14, fontWeight: 600, color: WARM, fontFamily: FONT }}>{title}</span>
      <span style={{ width: 34, height: 20, borderRadius: 999, flexShrink: 0, background: on ? "rgba(46,107,64,0.9)" : "rgba(143,175,150,0.22)", position: "relative", transition: "background 0.2s" }}>
        <span style={{ position: "absolute", top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: 999, background: "#F0EDE6", transition: "left 0.2s" }} />
      </span>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <p style={{ fontSize: 12, fontWeight: 700, color: WARM, fontFamily: FONT, margin: "0 0 8px", textAlign: "left", width: "100%" }}>{text}</p>;
}

function TutorialMock({ idx }: { idx: number }) {
  const wrap: React.CSSProperties = { width: "100%", maxWidth: 320, margin: "0 auto 26px", display: "flex", flexDirection: "column", gap: 8 };
  if (idx === 0) {
    return (
      <div style={wrap}>
        <SectionLabel text="Next" />
        <MiniCard emoji="🕊️" rgb="46,107,64" title="Morning Prayer" blurb="The office to begin your day" cta="Begin →" />
        <MiniCard emoji="📖" rgb="96,141,209" title="CAC Daily Meditation" blurb="Today's reading" cta="Read →" />
      </div>
    );
  }
  if (idx === 1) {
    return (
      <div style={wrap}>
        <MiniCard emoji="🕊️" rgb="46,107,64" title="Morning Prayer" blurb="Prayed this morning" kept dim />
        <MiniCard emoji="📖" rgb="96,141,209" title="CAC Daily Meditation" blurb="Read today" kept dim />
        <MiniCard emoji="🌙" rgb="124,116,196" title="Evening Prayer" blurb="Close the day" cta="Begin →" />
      </div>
    );
  }
  return (
    <div style={wrap}>
      <SectionLabel text="Your routine" />
      <RoutineRow emoji="🕊️" title="Morning Prayer" on />
      <RoutineRow emoji="🕯️" title="Contemplative Prayer" on />
      <RoutineRow emoji="🌍" title="Creation Prayer" on={false} />
    </div>
  );
}

// The daily-routine tutorial — three slides after the loading screen, in the
// SAME shape as the Co-Breathe how-it-works intro (mock → eyebrow → big title →
// body → Next pill + counter + Skip). Teaches what's-next, progress, and shaping.
const TUTORIAL: Array<{ eyebrow: string; title: string; body: string }> = [
  { eyebrow: "Your daily rhythm", title: "See what's next", body: "Phoebe always shows you the next thing to pray, right at the top. Tap the card and begin — no hunting, no guilt about what you missed." },
  { eyebrow: "Your daily rhythm", title: "Watch it come together", body: "Each practice you keep slips to “kept,” and your day fills in as you pray — a quiet picture of the rhythm you're keeping." },
  { eyebrow: "Your daily rhythm", title: "Shape it your way", body: "Reorder, toggle, add practices, change how you pray, set reminders. Your rhythm is yours — reshape it anytime." },
];

export function FirstOpenOnboarding() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [visible, setVisible] = useState(() => shouldShowFirstOpenOnboarding());
  const [step, setStep] = useState<"welcome" | "pray" | "read" | "loading" | "tutorial">("welcome");
  const [method, setMethod] = useState<string>("psalms");
  const [newsletter, setNewsletter] = useState<ReflectionSource>("fdd");
  const [tut, setTut] = useState(0);
  const [closing, setClosing] = useState(false);
  const bgPhoto = useMemo(
    () => (HOME_LEAF_PHOTOS.length > 0 ? HOME_LEAF_PHOTOS[Math.floor(Math.random() * HOME_LEAF_PHOTOS.length)]! : null),
    [],
  );
  // `?firstrun=1` is a PREVIEW: walk the flow visually but write nothing and
  // don't mark it done, so opening a link with the param can never overwrite a
  // real (possibly signed-in) user's routine.
  const preview = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("firstrun") === "1"; } catch { return false; }
  }, []);

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
  const dismiss = () => setClosing(true);
  const nextTutorial = () => { if (tut >= TUTORIAL.length - 1) dismiss(); else setTut((n) => n + 1); };

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
          {step === "welcome" ? (
            <motion.div key="welcome" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }} className="flex-1 flex flex-col items-center justify-center text-center">
              <div aria-hidden style={{ fontSize: 52, marginBottom: 22, filter: "drop-shadow(0 0 14px rgba(90,150,110,0.5))" }}>🕊️</div>
              <h1 className="text-[30px] font-bold leading-tight mb-4" style={{ color: WARM, fontFamily: FONT }}>
                Welcome to Phoebe
              </h1>
              <p className="text-[16px] leading-relaxed px-3" style={{ color: "rgba(240,237,230,0.86)", fontFamily: "Georgia, serif", fontStyle: "italic", maxWidth: 360 }}>
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
              <TutorialMock idx={tut} />
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
