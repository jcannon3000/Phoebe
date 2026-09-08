import { useState, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { DeckAnnouncer } from "@/components/DeckAnnouncer";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { artworkById } from "@/lib/visioSelect";
import { tidyArtist, tidyDate } from "@/lib/artistName";
import { playOpeningSwell, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { openReadingPage } from "@/lib/openExternal";
import { bibleUrl } from "@/lib/bibleGatewayUrl";
import { useBetaStatus } from "@/hooks/useDemo";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import {
  MYSTERY_SETS, mysterySetForDay, type MysterySet, type Mystery,
  SIGN_OF_THE_CROSS, APOSTLES_CREED, OUR_FATHER, HAIL_MARY, GLORY_BE,
  FATIMA_PRAYER, HAIL_HOLY_QUEEN, OPENING_INTENTIONS, BEADS_PER_DECADE,
  CONCLUDING_VERSICLE, CONCLUDING_RESPONSE, CONCLUDING_PRAYER,
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
 * REPETITION IS ONE SLIDE THAT SAYS HOW MANY TIMES (owner: "for any
 * repetition, like the Hail Marys, lets not have 10 slides, just say repeat 10
 * times"). A decade is ten Hail Marys and the opening is three; as slides that
 * is fifty-three screens of identical text, and as one tap per bead it was
 * seventy-nine taps to finish. Either turns a prayer into a chore. So the
 * words appear once with the count above them and the mystery held alongside,
 * and you pray them at your own pace — which is what the beads in your hand
 * are for.
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

/** A beat of the deck. `repeat` is a prayer said N times — see above. */
type Beat =
  | { kind: "prayer"; eyebrow: string; title: string; body: string }
  | { kind: "mystery"; mystery: Mystery; decade: number }
  | { kind: "repeat"; times: number; eyebrow: string; title: string; body: string; note?: string; decade?: number }
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
    {
      kind: "repeat", times: OPENING_INTENTIONS.length,
      eyebrow: "On the three beads", title: "Hail Mary", body: HAIL_MARY,
      note: `one ${OPENING_INTENTIONS.join(", one ")}`,
    },
    { kind: "prayer", eyebrow: "", title: "Glory be", body: GLORY_BE },
  ];
  for (const m of def.mysteries) {
    beats.push({ kind: "mystery", mystery: m, decade: m.n });
    beats.push({ kind: "prayer", eyebrow: `The ${ordinal(m.n)} decade`, title: "Our Father", body: OUR_FATHER });
    beats.push({ kind: "repeat", times: BEADS_PER_DECADE, eyebrow: m.title, title: "Hail Mary", body: HAIL_MARY, decade: m.n });
    beats.push({ kind: "prayer", eyebrow: `The ${ordinal(m.n)} decade`, title: "Glory be", body: GLORY_BE });
    beats.push({ kind: "prayer", eyebrow: `The ${ordinal(m.n)} decade`, title: "O my Jesus", body: FATIMA_PRAYER });
  }
  beats.push({ kind: "prayer", eyebrow: "To close", title: "Hail, holy Queen", body: HAIL_HOLY_QUEEN });
  // The versicle and response, then the collect — the received close.
  beats.push({ kind: "prayer", eyebrow: CONCLUDING_VERSICLE, title: "Pray for us", body: CONCLUDING_RESPONSE });
  beats.push({ kind: "prayer", eyebrow: "Let us pray", title: "The Concluding Prayer", body: CONCLUDING_PRAYER });
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
        { day?: string; set?: MysterySet; step?: number } | null;
      if (!raw || raw.day !== new Date().toLocaleDateString("en-CA")) return null;
      if (typeof raw.step !== "number" || raw.step < 1) return null;
      if (!raw.set || !(raw.set in MYSTERY_SETS)) return null;
      return raw;
    } catch { return null; }
  }, []);

  // step 0 is the intro; 1..beats.length walks the beats.
  const [step, setStep] = useState(0);
  const [set, setSet] = useState<MysterySet>(() => resumed?.set ?? mysterySetForDay());

  const backdropPhoto = useMemo(
    () => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );
  const beats = useMemo(() => buildBeats(set), [set]);
  const def = MYSTERY_SETS[set];

  /** What the day appoints — kept separate from `set` so the intro can say
   *  "Today's mysteries" when they match and name the tradition when they don't. */
  const todaysSet = useMemo(() => mysterySetForDay(), []);

  const isIntro = step === 0;
  const beat = isIntro ? null : beats[step - 1] ?? null;
  const isClosing = beat?.kind === "closing";

  // Write the place on every move. Cheap (one small JSON), and it means the
  // resume offer below is always truthful.
  useEffect(() => {
    if (step === 0) return;
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({
        day: new Date().toLocaleDateString("en-CA"), set, step,
      }));
    } catch { /* private mode — resume simply won't be offered */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, set]);

  /**
   * WARM THE NEXT MYSTERY'S PICTURE WHILE THIS DECADE IS PRAYED.
   *
   * The ACT originals average ~570 KB and the host offers no resizing (its
   * IIIF paths 403), so an unwarmed picture pops in a beat or two late on
   * cellular. A decade is ten Hail Marys — a minute or more of certain
   * warning — so the next one is fetched during it and is simply there.
   */
  useEffect(() => {
    if (beat?.kind !== "repeat" || !beat.decade) return;
    const next = beats.slice(step).find((b) => b.kind === "mystery") as { mystery: Mystery } | undefined;
    const art = next?.mystery.artId ? artworkById(next.mystery.artId) : null;
    if (!art?.img) return;
    try { const img = new Image(); img.decoding = "async"; img.src = art.img; } catch { /* non-fatal */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, beat?.kind]);

  useEffect(() => {
    if (step === 1) { try { playOpeningSwell(); } catch { /* non-fatal */ } }
    if (isClosing) {
      try { triggerSubmitFeedback(); } catch { /* non-fatal */ }
      /**
       * Kept the way every other practice is kept, now that the Rosary is a
       * real option in the customizer: markPracticeDoneToday writes the local
       * flag, queues the server row through the outbox, and is what the home
       * card, the dots and the weekly grid all read. "rosary" was added to
       * OptionalPractice and to the server's own section allow-list in the
       * same change, so the write is accepted rather than 400ing.
       */
      try {
        markPracticeDoneToday("rosary");
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

  const decadeOf = beat && (beat.kind === "mystery" || beat.kind === "repeat") ? (beat.decade ?? null) : null;
  /**
   * The mystery's picture, from the same ACT library Visio prays with.
   * Undefined for the Assumption, which the library has nothing for — the beat
   * simply shows no picture rather than borrowing an unrelated one.
   */
  const mysteryArt = beat?.kind === "mystery" && beat.mystery.artId ? artworkById(beat.mystery.artId) : null;
  /** Every work seen in THIS set — what the closing slide credits. */
  const creditedArt = useMemo(
    () => def.mysteries.map((m) => (m.artId ? artworkById(m.artId) : null)).filter((a): a is NonNullable<typeof a> => !!a),
    [def],
  );

  /** The bottom pill: what it says, and what it does. */
  const primary = (() => {
    if (isIntro) return { label: t("rosary.begin", { defaultValue: "Begin" }), onClick: () => setStep(1) };
    if (isClosing) return { label: t("rosary.done", { defaultValue: "Done" }), onClick: () => setLocation("/dashboard") };
    return { label: t("rosary.continue", { defaultValue: "Continue" }), onClick: () => setStep((s) => s + 1) };
  })();

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", overflow: "hidden" }}>
      <DeckAnnouncer
        label={
          isIntro ? `${def.name}. ${def.blurb}`
            : beat?.kind === "mystery" ? `${beat.mystery.title}, the ${ordinal(beat.decade)} mystery. ${beat.mystery.ref}`
            : beat?.kind === "repeat" ? `${beat.title}, ${beat.times} times. ${beat.eyebrow}`
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
            if (step > 0) setStep((s) => s - 1);
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
                    "Five mysteries, a decade each. Pray at your own pace — the deck keeps your place, so you can put it down whenever you need to.",
                })}
              </p>

              {/* All four, with today's highlighted (owner: "I want the
                  original of keeping all four visible with todays
                  highlighted"). The day decides which is lit; any of them can
                  be tapped. */}
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
                        // 44px minimum — these were ~30px tall.
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
              <p style={{ color: "rgba(168,186,216,0.72)", fontFamily: FONT, fontSize: 12.5, marginTop: 12 }}>
                {set === todaysSet
                  ? `${t("rosary.today_is", { defaultValue: "Today's mysteries" })} · ${def.days}`
                  : `${t("rosary.traditionally", { defaultValue: "Traditionally prayed on" })} ${def.days}`}
              </p>

              {/* Offered, never forced: Begin still starts a fresh rosary. */}
              {resumed && (
                <button
                  type="button"
                  onClick={() => {
                    setSet(resumed.set!);
                    setStep(resumed.step!);
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
              {mysteryArt?.img && (
                /* Held small and soft — this is a mystery being announced, not
                   Visio's long look at one picture. Attribution rides the alt
                   text the way Visio's does; the ACT licence is the same one. */
                <figure style={{ margin: "0 auto 18px" }}>
                  <img
                    src={mysteryArt.img}
                    alt={`${mysteryArt.title}${mysteryArt.artist ? ` — ${tidyArtist(mysteryArt.artist)}` : ""}`}
                    loading="eager"
                    decoding="async"
                    // No frame: no border, no card, no shadow (owner). The
                    // painting sits on the deck's own ground the way Visio's
                    // does, and anything drawn round it reads as chrome.
                    style={{
                      width: "100%", maxWidth: 300, maxHeight: "34dvh", objectFit: "contain",
                      margin: "0 auto", display: "block",
                    }}
                  />
                  {/* Credited on the slide, not only in the alt text — through
                      the SAME formatter Visio uses, so "JESUS MAFA" reads as
                      the Mafa community here too. */}
                  <figcaption style={{ color: "rgba(168,186,216,0.78)", fontFamily: FONT, fontSize: 11.5, lineHeight: 1.45, marginTop: 8 }}>
                    {mysteryArt.title}
                    {mysteryArt.artist ? <span style={{ display: "block", color: "rgba(240,237,230,0.55)" }}>{tidyArtist(mysteryArt.artist)}</span> : null}
                  </figcaption>
                </figure>
              )}
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

          {beat?.kind === "repeat" && (
            <motion.div
              key={`repeat-${step}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              {/* Whose decade this is, held above the prayer — ten Hail Marys
                  are never prayed without the mystery in front of you. */}
              <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 10 }}>
                {beat.eyebrow}
              </p>
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(20px, 5vw, 28px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 6 }}>
                {beat.title}
              </h2>
              <p style={{ color: "rgba(168,186,216,0.95)", fontFamily: FONT, fontSize: 13.5, fontWeight: 600, marginBottom: 18 }}>
                {/* Beads, not "times" (owner): it is what your hand is
                    holding, and it names the thing rather than the count. */}
                {t("rosary.beads", { defaultValue: "{{times}} beads", times: beat.times })}
                {beat.note ? ` — ${beat.note}` : ""}
              </p>
              <p style={{ color: "rgba(240,237,230,0.94)", margin: 0, fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(19px, 4.8vw, 24px)", lineHeight: 1.6 }}>
                {beat.body}
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
                {t("rosary.closing_body", { defaultValue: "Five mysteries held, one decade at a time. Carry them into the day." })}
              </p>

              {/**
                * THE PICTURES ARE CREDITED HERE (owner).
                *
                * Five works are seen in a rosary and each is someone's, held
                * under a licence. The mystery beats carry the title and the
                * artist so you know what you are looking at; the formal line —
                * ACT's attribution, where the work is, and the licence it is
                * offered under — belongs at the end, the way Visio's closing
                * slide credits its one work. Same fields, same order, same
                * formatter for the name.
                */}
              {creditedArt.length > 0 && (
                <div style={{ marginTop: 28, textAlign: "left" }}>
                  <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 10, textAlign: "center" }}>
                    {t("rosary.credits", { defaultValue: "The pictures" })}
                  </p>
                  {creditedArt.map((a) => (
                    <p key={a.id} style={{ color: "rgba(240,237,230,0.6)", fontFamily: FONT, fontSize: 11, lineHeight: 1.55, margin: "0 0 8px" }}>
                      <span style={{ color: "rgba(240,237,230,0.8)" }}>{a.title}</span>
                      {a.artist ? ` — ${tidyArtist(a.artist)}` : ""}
                      {a.date ? `, ${tidyDate(a.date)}` : ""}
                      {a.attribution ? <span style={{ display: "block" }}>{a.attribution}{a.where ? ` ${a.where}.` : ""}{a.licence ? ` ${a.licence}.` : ""}</span> : null}
                    </p>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom band — decade dots where the office puts its counter, then the
          pill. On a decade, the dots are the BEADS; everywhere else they are
          the five decades, so there is always a sense of how far in you are. */}
      <div className="absolute left-0 right-0 flex flex-col items-center" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)", zIndex: 2 }}>
        {decadeOf !== null ? (
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
