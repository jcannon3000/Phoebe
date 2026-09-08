import { useState, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { DeckAnnouncer } from "@/components/DeckAnnouncer";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { playOpeningSwell, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { openReadingPage } from "@/lib/openExternal";
import { bibleUrl } from "@/lib/bibleGatewayUrl";
import { useBetaStatus } from "@/hooks/useDemo";
import {
  MYSTERY_SETS, mysterySetForDay, type MysterySet, type Mystery,
  SIGN_OF_THE_CROSS, APOSTLES_CREED, OUR_FATHER, HAIL_MARY, GLORY_BE,
  FATIMA_PRAYER, HAIL_HOLY_QUEEN, OPENING_INTENTIONS, BEADS_PER_DECADE,
} from "@/lib/rosary";

/**
 * THE ROSARY — a guided walk through a set of mysteries.
 *
 * Built on Simple Guided Prayer's recipe exactly (owner: "use a similar UI to
 * the Simple Guided or Examen"): the same still-landscape backdrop under the
 * same wash, the same header with Back stepping the deck and a ✕ to leave, the
 * same centred column at 560/480, the same frosted pill and quiet dots in the
 * bottom band. Only the accent moves — a dusted blue rather than PACT's
 * terracotta — so the two practices are told apart at a glance without
 * inventing a second visual language.
 *
 * THE ONE THING THAT IS NOT LIKE PACT is the decade. Ten Hail Marys cannot be
 * ten slides: that is fifty slides of identical text in a five-decade rosary,
 * and the deck would stop being a prayer and start being a chore. So a decade
 * is ONE beat with ten beads on it — the pill advances a bead, the dots fill,
 * and the mystery stays on screen above the prayer the whole way, which is
 * what praying a decade actually is. It is also the closest thing on a screen
 * to the thing the beads do in your hand.
 *
 * ADMIN ONLY for now (owner). Gated here as well as in the menu, so the route
 * cannot be reached by typing it.
 */

const FONT = "'Space Grotesk', sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const BG = "#0C1F12";
const WARM = "#F0EDE6";
// PACT's chrome with a Marian blue in place of its terracotta. Same alpha
// values and the same roles (hairline, eyebrow, dots) so nothing else shifts.
const ACCENT = "rgba(150,170,205,0.5)";
const EYEBROW = "rgba(168,186,216,0.8)";
const DOT_ON = "#9BB0D0";
const DOT_OFF = "rgba(120,140,175,0.32)";

const PILL: CSSProperties = {
  background: "rgba(9,26,16,0.42)",
  backdropFilter: "blur(11px)",
  WebkitBackdropFilter: "blur(11px)",
  border: `1px solid ${ACCENT}`,
  color: WARM,
  fontFamily: FONT,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

/** A beat of the deck. `beads` is the decade — see the note above. */
type Beat =
  | { kind: "prayer"; eyebrow: string; title: string; body: string }
  | { kind: "mystery"; mystery: Mystery; decade: number }
  | { kind: "beads"; mystery: Mystery; decade: number }
  | { kind: "closing" };

function ordinal(n: number): string {
  return ["first", "second", "third", "fourth", "fifth"][n - 1] ?? `${n}`;
}

/** The whole rosary, in order, for one set of mysteries. */
function buildBeats(set: MysterySet): Beat[] {
  const def = MYSTERY_SETS[set];
  const beats: Beat[] = [
    { kind: "prayer", eyebrow: "To begin", title: "The Sign of the Cross", body: SIGN_OF_THE_CROSS },
    { kind: "prayer", eyebrow: "On the crucifix", title: "The Apostles' Creed", body: APOSTLES_CREED },
    { kind: "prayer", eyebrow: "On the first bead", title: "Our Father", body: OUR_FATHER },
    ...OPENING_INTENTIONS.map((intention) => ({
      kind: "prayer" as const,
      eyebrow: `A Hail Mary — ${intention}`,
      title: "Hail Mary",
      body: HAIL_MARY,
    })),
    { kind: "prayer", eyebrow: "", title: "Glory be", body: GLORY_BE },
  ];
  for (const m of def.mysteries) {
    beats.push({ kind: "mystery", mystery: m, decade: m.n });
    beats.push({ kind: "prayer", eyebrow: `The ${ordinal(m.n)} decade`, title: "Our Father", body: OUR_FATHER });
    beats.push({ kind: "beads", mystery: m, decade: m.n });
    beats.push({ kind: "prayer", eyebrow: `The ${ordinal(m.n)} decade`, title: "Glory be", body: GLORY_BE });
    beats.push({ kind: "prayer", eyebrow: `The ${ordinal(m.n)} decade`, title: "O my Jesus", body: FATIMA_PRAYER });
  }
  beats.push({ kind: "prayer", eyebrow: "To close", title: "Hail, holy Queen", body: HAIL_HOLY_QUEEN });
  beats.push({ kind: "prayer", eyebrow: "To close", title: "The Sign of the Cross", body: SIGN_OF_THE_CROSS });
  beats.push({ kind: "closing" });
  return beats;
}

export default function RosaryPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { rawIsAdmin: isSuperAdmin, isLoading: adminLoading } = useBetaStatus();

  /**
   * WHERE YOU WERE, KEPT.
   *
   * A full rosary is fifty Hail Marys and something like twenty minutes. It is
   * the practice in this app MOST likely to be interrupted — and without this,
   * a phone call at the third decade meant starting again from the Sign of the
   * Cross, which nobody does twice. The office persists its slide for exactly
   * this reason; a longer practice needs it more, not less.
   *
   * Kept for the local day only: coming back tomorrow should start a new
   * rosary, not resume yesterday's. Set as well as position, so the resume
   * lands in the mysteries you were actually praying.
   */
  const RESUME_KEY = "phoebe:rosary:progress";
  const resumed = useMemo(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as
        { day?: string; set?: MysterySet; step?: number; bead?: number } | null;
      if (!raw || raw.day !== new Date().toLocaleDateString("en-CA")) return null;
      if (typeof raw.step !== "number" || raw.step < 1) return null;
      if (!raw.set || !(raw.set in MYSTERY_SETS)) return null;
      return raw;
    } catch { return null; }
  }, []);

  // step 0 is the intro; 1..beats.length walks the beats.
  const [step, setStep] = useState(0);
  const [set, setSet] = useState<MysterySet>(() => resumed?.set ?? mysterySetForDay());
  // Which bead of the current decade we are on (0-based). Reset whenever the
  // beat changes, so re-entering a decade from Back starts it again.
  const [bead, setBead] = useState(0);

  const backdropPhoto = useMemo(
    () => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );
  const beats = useMemo(() => buildBeats(set), [set]);
  const def = MYSTERY_SETS[set];

  const isIntro = step === 0;
  const beat = isIntro ? null : beats[step - 1] ?? null;
  const isClosing = beat?.kind === "closing";

  /**
   * A new beat starts at its first bead — EXCEPT the one we just resumed onto.
   *
   * setStep and setBead batch together, so on a resume this effect ran after
   * the commit and reset the restored bead straight back to zero: the resume
   * landed on the right decade and then threw away where in it you were.
   */
  const resumingRef = useRef(false);
  useEffect(() => {
    if (resumingRef.current) { resumingRef.current = false; return; }
    setBead(0);
  }, [step]);

  // Write the place on every move. Cheap (one small JSON), and it means the
  // resume offer below is always truthful.
  useEffect(() => {
    if (step === 0) return;
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({
        day: new Date().toLocaleDateString("en-CA"), set, step, bead,
      }));
    } catch { /* private mode — resume simply won't be offered */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, bead, set]);

  useEffect(() => {
    if (step === 1) { try { playOpeningSwell(); } catch { /* non-fatal */ } }
    if (isClosing) {
      try { triggerSubmitFeedback(); } catch { /* non-fatal */ }
      /**
       * Kept LOCALLY, and only locally, for now.
       *
       * markPracticeDoneToday's OptionalPractice union is closed and each of
       * its members has a matching server-side section, so adding "rosary"
       * means a schema decision as well as a client one. This practice is
       * admin-only and in nobody's rhythm yet, so it records that it was
       * prayed and stops there — enough for the practice to know itself,
       * nothing that would write a section the server would reject. Wiring it
       * into the rhythm, the home card and the weekly grid is the next step,
       * once the owner has walked it.
       */
      try {
        localStorage.setItem("phoebe:rosary:last-prayed", new Date().toLocaleDateString("en-CA"));
        // Finished — there is nothing to resume.
        localStorage.removeItem("phoebe:rosary:progress");
      } catch { /* non-fatal */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /**
   * The route is admin-only as well as the menu row, so it can't be reached by
   * typing it — a quiet redirect rather than a refusal screen, since there is
   * nothing to explain to someone not meant to see it yet.
   *
   * WAIT FOR THE ANSWER. useBetaStatus returns rawIsAdmin: false while its
   * query is still in flight, so redirecting on `false` alone bounced the ADMIN
   * to the dashboard before the status resolved — the page would never have
   * opened for the one person allowed in. Caught auditing my own build.
   */
  useEffect(() => {
    if (!adminLoading && !isSuperAdmin) setLocation("/dashboard");
  }, [adminLoading, isSuperAdmin, setLocation]);
  if (adminLoading || !isSuperAdmin) return null;

  const decadeOf = beat && (beat.kind === "mystery" || beat.kind === "beads") ? beat.decade : null;

  /**
   * One bead on. Hoisted because the pill and the whole slide both do it —
   * fifty Hail Marys is fifty taps, and asking for all of them on a pill the
   * width of two words is the difference between a practice and a chore. The
   * office deck pages on a tap anywhere for the same reason.
   */
  const advanceBead = () => {
    try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } })); } catch { /* non-fatal */ }
    if (bead >= BEADS_PER_DECADE - 1) setStep((s) => s + 1);
    else setBead((b) => b + 1);
  };

  /** The bottom pill: what it says, and what it does. */
  const primary = (() => {
    if (isIntro) return { label: t("rosary.begin", { defaultValue: "Begin" }), onClick: () => setStep(1) };
    if (isClosing) return { label: t("rosary.done", { defaultValue: "Done" }), onClick: () => setLocation("/dashboard") };
    if (beat?.kind === "beads") {
      const last = bead >= BEADS_PER_DECADE - 1;
      return {
        label: last
          ? t("rosary.decade_done", { defaultValue: "Glory be" })
          : t("rosary.next_bead", { defaultValue: "Next bead" }),
        onClick: advanceBead,
      };
    }
    return { label: t("rosary.continue", { defaultValue: "Continue" }), onClick: () => setStep((s) => s + 1) };
  })();

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", overflow: "hidden" }}>
      <DeckAnnouncer
        label={
          isIntro ? `${def.name}. ${def.blurb}`
            : beat?.kind === "mystery" ? `${beat.mystery.title}, the ${ordinal(beat.decade)} mystery. ${beat.mystery.ref}`
            : beat?.kind === "beads" ? `${beat.mystery.title}. Bead ${bead + 1} of ${BEADS_PER_DECADE}`
            : beat?.kind === "prayer" ? beat.title
            : t("rosary.closing_title", { defaultValue: "The rosary is prayed" })
        }
      />
      {backdropPhoto ? (
        <>
          <motion.img
            src={backdropPhoto}
            alt=""
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.22 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }}
          />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }} />
        </>
      ) : (
        <AnimatedBackground base={BG} variant="subtle" />
      )}

      <header
        className="px-5 pb-2 flex items-center justify-between"
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 2, paddingTop: "max(1.25rem, calc(var(--safe-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={() => {
            // Back steps the deck; from the intro it leaves. Home, not the
            // offices picker — the same exit PACT and the Examen settled on.
            // Inside a decade, Back walks the beads — losing seven Hail Marys
            // because you wanted the last one again is not what Back means.
            if (beat?.kind === "beads" && bead > 0) setBead((b) => b - 1);
            else if (step > 0) setStep((s) => s - 1);
            else setLocation("/dashboard");
          }}
          style={{ color: "rgba(143,175,150,0.8)", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT, fontSize: 13 }}
        >
          {t("rosary.back", { defaultValue: "← Back" })}
        </button>
        {!isIntro && !isClosing && (
          <button
            type="button"
            onClick={() => setLocation("/dashboard")}
            aria-label={t("rosary.exit", { defaultValue: "Exit" })}
            className="flex items-center justify-center rounded-full"
            style={{
              width: 32, height: 32, background: "rgba(9,26,16,0.42)",
              backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
              border: `1px solid ${ACCENT}`, color: "rgba(240,237,230,0.85)",
              fontSize: 17, lineHeight: 1, cursor: "pointer",
            }}
          >
            ×
          </button>
        )}
      </header>

      <main
        className="flex flex-col items-center text-center px-6 w-full"
        // Only a decade pages on a tap. Everywhere else the pill is the one
        // way forward, so a stray touch can't skip a prayer you were reading.
        onClick={beat?.kind === "beads" ? advanceBead : undefined}
        style={{
          maxWidth: 560, margin: "0 auto", minHeight: "var(--app-dvh)", justifyContent: "center",
          paddingTop: "clamp(24px, 6dvh, 72px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 168px)",
          position: "relative", zIndex: 1,
          /**
           * SCROLLS WHEN IT HAS TO. PACT's bodies are two lines; the Creed is
           * seven hundred characters and Hail, holy Queen not far behind, and
           * the deck root is `overflow: hidden` — so on a small phone the end
           * of the Creed was simply cut off with no way to reach it. Centred
           * while it fits, scrollable when it doesn't.
           */
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
      >
        <AnimatePresence mode="wait">
          {isIntro && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 16 }}>
                {t("rosary.eyebrow", { defaultValue: "Pray the Rosary" })}
              </p>
              <h1 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 14 }}>
                {def.name}
              </h1>
              <p style={{ color: "rgba(226,232,244,0.9)", fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(17px, 4.4vw, 21px)", lineHeight: 1.5, marginBottom: 18 }}>
                {def.blurb}
              </p>
              <p style={{ color: "rgba(240,237,230,0.86)", margin: 0, fontFamily: FONT, fontSize: "clamp(15.5px, 4.2vw, 18px)", lineHeight: 1.55 }}>
                {t("rosary.intro_body", {
                  defaultValue:
                    "Five mysteries, a decade each. The deck keeps your place on the beads — take it as slowly as you like, and put it down whenever you need to.",
                })}
              </p>

              {/* Today's set is offered first; any of the four can be chosen —
                  the same shape as the office's own day-first, choose-anyway. */}
              <div className="flex flex-wrap items-center justify-center gap-2" style={{ marginTop: 22 }}>
                {(Object.keys(MYSTERY_SETS) as MysterySet[]).map((k) => {
                  const on = k === set;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSet(k)}
                      aria-pressed={on}
                      className="rounded-full"
                      style={{
                        // 44px minimum — the four chips were ~30px tall.
                        padding: "12px 16px", minHeight: 44,
                        fontFamily: FONT, fontSize: 13, fontWeight: 600,
                        cursor: "pointer",
                        color: on ? WARM : "rgba(240,237,230,0.66)",
                        background: on ? "rgba(150,170,205,0.18)" : "rgba(9,26,16,0.42)",
                        border: `1px solid ${on ? ACCENT : "rgba(150,170,205,0.22)"}`,
                        backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
                      }}
                    >
                      {MYSTERY_SETS[k].name.replace("The ", "").replace(" Mysteries", "")}
                    </button>
                  );
                })}
              </div>
              <p style={{ color: "rgba(168,186,216,0.7)", fontFamily: FONT, fontSize: 12.5, marginTop: 12 }}>
                {t("rosary.traditionally", { defaultValue: "Traditionally prayed on" })} {def.days}
              </p>
              {/* Offered, never forced: Begin still starts a fresh rosary. */}
              {resumed && (
                <button
                  type="button"
                  onClick={() => {
                    resumingRef.current = true;
                    setSet(resumed.set!);
                    setStep(resumed.step!);
                    if (typeof resumed.bead === "number") setBead(resumed.bead);
                  }}
                  style={{
                    marginTop: 16, padding: "9px 16px", borderRadius: 999, cursor: "pointer",
                    fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: WARM,
                    background: "rgba(150,170,205,0.18)", border: `1px solid ${ACCENT}`,
                    backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
                  }}
                >
                  {t("rosary.resume", { defaultValue: "Pick up where you left off" })}
                </button>
              )}
            </motion.div>
          )}

          {beat?.kind === "mystery" && (
            <motion.div
              key={`mystery-${beat.decade}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 16 }}>
                {t("rosary.mystery_n", { defaultValue: "The {{which}} mystery", which: ordinal(beat.decade) })}
              </p>
              <h2
                className="title-glow-breathe"
                style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 14 }}
              >
                {beat.mystery.title}
              </h2>
              <p style={{ color: "rgba(226,232,244,0.92)", fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(17px, 4.4vw, 21px)", lineHeight: 1.5, marginBottom: 18 }}>
                {beat.mystery.meditation}
              </p>
              {/* The passage opens in the app's reader, the same hand-off the
                  office and Lectio use — saved page first, live otherwise. */}
              <button
                type="button"
                onClick={() => {
                  // bibleUrl returns null for a reference it can't parse —
                  // never hand that to the reader, which would open about:blank.
                  const url = bibleUrl(beat.mystery.ref);
                  if (!url) return;
                  void openReadingPage(url, { officeTitle: def.name, slideLabel: `${beat.decade} of 5`, sectionLabel: beat.mystery.title });
                }}
                style={{
                  color: "rgba(168,186,216,0.95)", background: "none", border: "none",
                  // A link you tap on a phone needs a tappable box, not a text baseline.
                  padding: "10px 12px", minHeight: 44,
                  cursor: "pointer", fontFamily: FONT, fontSize: 14.5, textDecoration: "underline", textUnderlineOffset: 4,
                }}
              >
                {beat.mystery.ref} →
              </button>
              <p style={{ color: "rgba(240,237,230,0.6)", fontFamily: FONT, fontSize: 12.5, marginTop: 16 }}>
                {t("rosary.fruit", { defaultValue: "Fruit of the mystery" })}: {beat.mystery.fruit}
              </p>
            </motion.div>
          )}

          {beat?.kind === "beads" && (
            <motion.div
              key={`beads-${beat.decade}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              {/* The mystery stays above the prayer for the whole decade —
                  that is what praying a decade is: one thing held while the
                  same words go round. */}
              <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 10 }}>
                {beat.mystery.title}
              </p>
              <p style={{ color: "rgba(240,237,230,0.55)", fontFamily: FONT, fontSize: 12.5, marginBottom: 18 }}>
                {/* Interpolated, not baked into the default — a real translation of
                    this key would otherwise lose the numbers entirely. */}
                {t("rosary.bead_n_of_m", { defaultValue: "Bead {{n}} of {{total}}", n: bead + 1, total: BEADS_PER_DECADE })}
              </p>
              <p style={{ color: "rgba(240,237,230,0.94)", margin: 0, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(19px, 4.8vw, 24px)", lineHeight: 1.6 }}>
                {HAIL_MARY}
              </p>
            </motion.div>
          )}

          {beat?.kind === "prayer" && (
            <motion.div
              key={`prayer-${step}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              {beat.eyebrow && (
                <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 14 }}>
                  {beat.eyebrow}
                </p>
              )}
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(20px, 5vw, 28px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 16 }}>
                {beat.title}
              </h2>
              <p
                style={{
                  color: "rgba(240,237,230,0.92)", margin: 0,
                  fontFamily: SERIF, fontStyle: "italic",
                  fontSize: beat.body.length > 420 ? "clamp(15px, 4vw, 17px)" : "clamp(19px, 4.8vw, 24px)",
                  lineHeight: 1.6,
                }}
              >
                {beat.body}
              </p>
            </motion.div>
          )}

          {isClosing && (
            <motion.div
              key="closing"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ fontSize: 40, marginBottom: 18 }} aria-hidden>📿</p>
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 16 }}>
                {t("rosary.closing_title", { defaultValue: "The rosary is prayed" })}
              </h2>
              <p style={{ color: "rgba(240,237,230,0.94)", margin: 0, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(19px, 4.8vw, 24px)", lineHeight: 1.6 }}>
                {t("rosary.closing_body", { defaultValue: "Five mysteries held, one bead at a time. Carry them into the day." })}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom band — decade dots where the office puts its counter, then the
          pill. On a decade, the dots are the BEADS; everywhere else they are
          the five decades, so there is always a sense of how far in you are. */}
      <div className="absolute left-0 right-0 flex flex-col items-center" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)", zIndex: 2 }}>
        {beat?.kind === "beads" ? (
          <div className="flex items-center justify-center gap-1.5" style={{ marginBottom: 16 }}>
            {Array.from({ length: BEADS_PER_DECADE }, (_, i) => (
              <span key={i} className="block rounded-full" style={{ width: 6, height: 6, background: i <= bead ? DOT_ON : DOT_OFF }} />
            ))}
          </div>
        ) : decadeOf !== null ? (
          <div className="flex items-center justify-center gap-1.5" style={{ marginBottom: 16 }}>
            {[1, 2, 3, 4, 5].map((d) => (
              <span key={d} className="block rounded-full" style={{ width: 6, height: 6, background: d <= decadeOf ? DOT_ON : DOT_OFF }} />
            ))}
          </div>
        ) : null}
        <button
          type="button"
          // The bottom band is a SIBLING of <main>, not a child, so a tap on
          // the pill does not also reach the decade's tap-to-advance — no
          // double bead. (Checked, because it would be an easy thing to get
          // wrong and an invisible one to notice.)
          onClick={primary.onClick}
          className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={PILL}
        >
          {primary.label}
        </button>
      </div>
    </div>
  );
}
