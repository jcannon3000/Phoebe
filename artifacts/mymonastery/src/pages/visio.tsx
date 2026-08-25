/**
 * Visio Divina — praying with an image.
 *
 * The sibling of Audio Divina: there, sacred listening; here, sacred looking.
 *
 * Eight beats, in the owner's order: an invitation · the image · the day's
 * passage · the image AGAIN · two questions · the reflection · and a close
 * that is not a "well done" screen but the image once more with the recent
 * ones beside it.
 *
 * The shape is doing something specific. The invitation says what the looking
 * is for before there is anything to look at. The image then arrives with
 * nothing on it, because the practice IS the looking and any text on that beat
 * would be read instead. The passage comes next, and then the SAME image
 * returns — that return is the point of the whole deck: you see it differently
 * having read the text, and only then are you asked anything.
 *
 * ── Where the art comes from ──
 *
 * lib/visioCatalogue.ts — 233 works from Vanderbilt's Art in the Christian
 * Tradition, every one licence-verified against Wikimedia Commons (see
 * scripts/fetch-act-catalogue.mjs). Each is tagged to the passages it depicts,
 * so lib/visioSelect.ts can cross that against TODAY'S appointed lessons: on
 * the day the lectionary gives Luke 10:38-42 you get Vermeer's Martha and
 * Mary, not whatever a modulo landed on.
 *
 * Catalogue images load from ACT's own host — 233 paintings is far too much to
 * put in the app binary. So this screen is built to degrade: the readings
 * lookup is capped, an unreachable image falls back to a BUNDLED work, and
 * nothing here ever renders an empty page while it waits (the blank-screen rule
 * this repo keeps).
 *
 * Completion is finishing the deck, the same bar the office keeps — marked on
 * the closing slide, not on arrival. markPracticeDoneToday carries the local
 * flag and the server write, so the card, the dot, the weekly row, the widget
 * and yesterday's ordering all move together.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { artworkForDay } from "@/lib/visioArtworks";
import { chooseArtwork, artworkById, type Chosen } from "@/lib/visioSelect";
import { getVisioHistory, recordVisioSeen } from "@/lib/visioHistory";
import { apiRequest } from "@/lib/queryClient";
import { openOfficeReading, preloadExternal } from "@/lib/openExternal";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/**
 * The two questions, in the owner's words and in his order.
 *
 * Fixed, not a rotating pool: they are a sequence, not a variety pack. The
 * first only asks you to NOTICE — no interpreting, no meaning yet, just what
 * your eye keeps returning to. The second asks what that noticing might be
 * for. Asking the second one first turns the practice into a quiz.
 */
const QUESTIONS = [
  "Notice anything that is sticking out to you in the picture, and hold that.",
  "Consider what God may be speaking to you through the image.",
];

/** "1050-1100" is a range, and a range takes an en dash. */
function tidyDate(d: string): string {
  return d.replace(/(\d)\s*-\s*(\d)/g, "$1\u2013$2");
}

/** How long we'll wait on today's readings before praying without them. */
const READINGS_CAP_MS = 1500;

export default function VisioPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const today = useMemo(() => {
    try { return new Date().toLocaleDateString("en-CA"); } catch { return "1970-01-01"; }
  }, []);
  // Which office's readings to look at — the same 5 PM boundary the evening
  // office and the evening home cards use.
  const side = useMemo(() => (new Date().getHours() >= 17 ? "evening" : "morning"), []);

  const { data: readings, isFetched } = useQuery<{ lessons?: string[] }>({
    queryKey: ["/api/office/readings", side, "office", today],
    // Never resolve undefined — React Query throws on it, and an older server
    // without the route falls through to the SPA and hands back a non-JSON
    // body. An empty shape simply means "pray without the lectionary".
    queryFn: async () => {
      try {
        const r = await apiRequest<{ lessons?: string[] } | undefined>(
          "GET", `/api/office/readings?side=${side}&level=office&date=${today}`,
        );
        return r && typeof r === "object" ? r : {};
      } catch {
        return {};
      }
    },
    staleTime: 30 * 60_000,
    retry: false,
  });

  // Read once at mount: chooseArtwork needs it to pin today's pick and to
  // subtract what's already been seen, and re-reading mid-practice would let
  // this session's own entry change the answer underneath it.
  const [history] = useState(() => getVisioHistory());
  /**
   * Set when the reader taps something in the closing gallery. From then on
   * the deck shows THAT artwork instead of today's — a way back into a picture
   * they've been carrying, without disturbing which one today's is.
   */
  const [overrideId, setOverrideId] = useState<number | null>(null);
  const override = overrideId != null ? artworkById(overrideId) : null;

  /**
   * The choice is made ONCE and then frozen. Re-picking when the readings
   * arrive late would swap the painting out from under someone already looking
   * at it, which is the one thing this practice must not do.
   */
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current) return;
    if (isFetched) {
      settled.current = true;
      setChosen(chooseArtwork(today, (readings?.lessons ?? []).filter(Boolean), history));
      return;
    }
    // …and a hard cap, so a hanging request can't hold the practice shut.
    const timer = setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      setChosen(chooseArtwork(today, [], history));
    }, READINGS_CAP_MS);
    return () => clearTimeout(timer);
  }, [isFetched, readings, today, history]);

  /** Whichever artwork the deck is actually showing — today's, or one the
   *  reader tapped back into from the closing gallery. */
  const active: Chosen | null = override
    ? { art: override, ref: override.refs[0] ?? "", followsToday: false }
    : chosen;

  // The passage itself, from the bundled World English Bible on the server.
  // Null text is normal (the deuterocanon isn't carried) — the slide then
  // shows the reference alone, exactly as the office's lesson slides do.
  const ref = override ? (override.refs[0] ?? "") : (chosen?.ref ?? "");
  const { data: passage } = useQuery<{ text: string | null }>({
    queryKey: ["/api/scripture/passage", ref],
    enabled: !!ref,
    queryFn: async () => {
      try {
        const r = await apiRequest<{ text?: string | null } | undefined>(
          "GET", `/api/scripture/passage?ref=${encodeURIComponent(ref)}`,
        );
        return { text: (r && typeof r === "object" ? r.text : null) ?? null };
      } catch {
        return { text: null };
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  // An unreachable image (offline, or their host having a bad day) falls back
  // to a work bundled in the binary, so the practice still happens.
  const [imageFailed, setImageFailed] = useState(false);
  /**
   * Which SOURCE has finished loading — not a bare boolean.
   *
   * A boolean plus "reset it when the src changes" deadlocks on a cached
   * image: the browser has it decoded before React attaches the handler, so
   * `onLoad` never fires, the reset effect puts the flag back to false, and
   * the painting sits at opacity 0 forever. Keyed by src, the flag is simply
   * true for the image that loaded and false for any other — no reset needed,
   * and the ref below covers the cached case where no event is coming.
   */
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const bundled = useMemo(() => artworkForDay(today), [today]);

  // Remember today's, once it's settled — this is what pins the choice for the
  // rest of the day and keeps tomorrow's different. Not recorded for an
  // override: re-reading an old picture shouldn't rewrite today.
  useEffect(() => {
    if (!chosen) return;
    try { recordVisioSeen(chosen.art.id, today); } catch { /* non-fatal */ }
  }, [chosen, today]);

  /** The recent ones to offer at the close, today's excluded. */
  const recent = useMemo(
    () =>
      history
        .filter((h) => h.id !== active?.art.id)
        .map((h) => artworkById(h.id))
        .filter((a): a is NonNullable<typeof a> => !!a)
        // Five, not six: at 62px with 8px gaps six wrap to 5+1 on a 375px
        // screen and leave an orphan on its own row. Five is one clean strip.
        .slice(0, 5),
    [history, active?.art.id],
  );

  /**
   * The view model, from whichever source is actually usable.
   *
   * NULL while the choice is still resolving — deliberately. Falling back to
   * the bundled work during that moment meant the practice opened on Rublev's
   * Trinity and then swapped to the day's painting a beat later: a flash of
   * the WRONG image, which is the one thing a looking practice can't do. The
   * bundled artwork is a failure path, not a loading state.
   */
  const view = imageFailed
    ? {
        title: bundled.title,
        artist: bundled.artist,
        date: bundled.date,
        where: bundled.where,
        img: bundled.image,
        scriptureRef: bundled.scriptureRef,
        scripture: bundled.scripture,
        attribution: bundled.attribution,
        licence: "Public domain",
        essayUrl: bundled.essayUrl ?? null,
        followsToday: false,
      }
    : active
      ? {
          title: active.art.title,
          artist: active.art.artist ?? "",
          date: active.art.date ?? "",
          where: active.art.where ?? "",
          img: active.art.img,
          scriptureRef: active.ref,
          scripture: passage?.text ?? null,
          attribution: active.art.attribution,
          licence: active.art.licence,
          essayUrl: active.art.essay,
          followsToday: active.followsToday,
        }
      : null;

  /**
   * The eight beats.
   *
   * 0 invitation · 1 the image · 2 the passage · 3 the image AGAIN ·
   * 4 the first question · 5 the second · 6 the reflection · 7 the close.
   */
  const [step, setStep] = useState(0);
  const TOTAL = 8;
  const INVITE = 0, IMAGE = 1, PASSAGE = 2, AGAIN = 3, Q1 = 4, Q2 = 5, REFLECT = 6, CLOSE = 7;
  // The reflection beat is about a page that isn't ours, so the painting steps
  // aside for it; everywhere else after the invitation it stays in view.
  const showsImage = step >= IMAGE && step !== REFLECT;

  const atEnd = step >= TOTAL - 1;
  const goHome = () => setLocation("/dashboard");
  const next = () => {
    if (!atEnd) { setStep((s) => s + 1); return; }
    // Kept by finishing, not by opening.
    try { markPracticeDoneToday("visio"); } catch { /* non-fatal */ }
    goHome();
  };
  const prev = () => { if (step > 0) setStep((s) => s - 1); };

  /**
   * The in-app browser's own bottom bar drives the deck.
   *
   * openOfficeReading presents the office flavour of the native browser — the
   * one with a floating bottom pill whose Back/Next dismiss it and step the
   * screen underneath. That screen is US here, so without these listeners its
   * Next would do nothing and the reader would be stranded on a web page with
   * a button that appears broken. Same contract bcp-daily-office.tsx keeps for
   * its lesson hand-off.
   */
  useEffect(() => {
    const onNext = () => setStep((s) => Math.min(TOTAL - 1, s + 1));
    const onPrev = () => setStep((s) => Math.max(0, s - 1));
    window.addEventListener("phoebe:office-next-slide", onNext);
    window.addEventListener("phoebe:office-prev-slide", onPrev);
    return () => {
      window.removeEventListener("phoebe:office-next-slide", onNext);
      window.removeEventListener("phoebe:office-prev-slide", onPrev);
    };
  }, []);

  // Warm the essay while they're still looking, so the reflection opens
  // instantly rather than on a white page. No-op on web.
  useEffect(() => {
    if (view?.essayUrl) preloadExternal(view.essayUrl);
  }, [view?.essayUrl]);

  const openReflection = () => {
    if (!view?.essayUrl) return;
    openOfficeReading(view.essayUrl, {
      officeTitle: t("visio.title", { defaultValue: "Visio Divina" }),
      slideLabel: t("visio.reflection", { defaultValue: "Reflection" }),
      sectionLabel: view.title,
    });
  };

  /** Jump back into a picture from the closing gallery. */
  const reopen = (id: number) => {
    setOverrideId(id);
    setLoadedSrc(null);
    setStep(IMAGE);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header — Back / title / close, matching the office's reader chrome. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 12px) 16px 8px", gap: 10 }}>
        <button
          type="button"
          onClick={prev}
          disabled={step === 0}
          style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent", background: "none", border: "none", color: step === 0 ? "transparent" : SAGE, fontFamily: FONT, fontSize: 14, cursor: step === 0 ? "default" : "pointer", padding: 6 }}
        >
          ← {t("common.back", { defaultValue: "Back" })}
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          {t("visio.title", { defaultValue: "Visio Divina" })}
        </span>
        <button
          type="button"
          onClick={goHome}
          aria-label={t("common.close", { defaultValue: "Close" })}
          style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent", width: 32, height: 32, borderRadius: 999, background: "rgba(9,26,16,0.5)", border: `1px solid ${BORDER}`, color: WARM, cursor: "pointer", padding: 0 }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          // The passage beat fills from the top so the image can hold a fixed
          // band and the text scroll under it; every other beat is centred.
          justifyContent: step === PASSAGE ? "flex-start" : "center",
          padding: "0 20px", gap: 14,
          overflowY: step === PASSAGE ? "hidden" : "auto",
        }}
      >
        {/* The painting. Full height when it's the whole point (beats 1 and 3),
            a small band when it's accompanying something else. */}
        {showsImage && view && (
          <img
            src={view.img}
            alt={`${view.title}${view.artist ? ` — ${view.artist}` : ""}`}
            decoding="async"
            // Both paths: the event for a fresh fetch, the ref for one the
            // browser already had.
            ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoadedSrc(el.currentSrc || el.src); }}
            onLoad={(e) => setLoadedSrc(e.currentTarget.currentSrc || e.currentTarget.src)}
            onError={() => setImageFailed(true)}
            style={{
              flex: "0 0 auto",
              maxWidth: "100%",
              maxHeight: step === IMAGE || step === AGAIN ? "64vh" : step === PASSAGE ? "22vh" : step === CLOSE ? "30vh" : "38vh",
              objectFit: "contain", borderRadius: 10, boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
              // Fades in rather than snapping: these load over the network, and
              // a hard pop is the wrong first movement for a looking practice.
              opacity: loadedSrc === view.img ? 1 : 0,
              transition: "opacity 420ms ease-out",
            }}
          />
        )}

        {/* Resolving. A soft empty frame rather than a spinner: the practice
            opens on stillness, and this is usually gone within a beat — the
            invitation alone normally covers the wait. */}
        {showsImage && !view && (
          <div
            aria-hidden
            style={{
              width: "min(100%, 320px)", height: "46vh", borderRadius: 10,
              border: `1px solid ${BORDER}`, background: "rgba(46,107,64,0.07)",
              animation: "visio-breathe 2600ms ease-in-out infinite",
            }}
          />
        )}
        <style>{`@keyframes visio-breathe { 0%,100% { opacity: .5 } 50% { opacity: .85 } }`}</style>

        {/* The invitation (owner). It comes BEFORE the painting on purpose:
            said afterwards it would be a caption, and the looking would already
            be over. Said first it sets what the next beats are for. It also
            buys the readings lookup its moment, so the artwork is usually
            already chosen by the time they tap through. */}
        {step === INVITE && (
          <div style={{ textAlign: "center", maxWidth: 480 }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
              {t("visio.intro_eyebrow", { defaultValue: "Before you look" })}
            </p>
            <p style={{ color: WARM, fontFamily: SERIF, fontSize: 21, fontStyle: "italic", lineHeight: 1.6, margin: "14px 0 0" }}>
              {t("visio.intro_line", {
                defaultValue: "As you look at the picture that follows, consider what God may be speaking to you through the image.",
              })}
            </p>
          </div>
        )}

        {step === IMAGE && view && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: WARM, fontFamily: SERIF, fontSize: 19, fontStyle: "italic", margin: 0 }}>{view.title}</p>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "6px 0 0" }}>
              {[view.artist, tidyDate(view.date)].filter(Boolean).join(" · ")}
            </p>
            {/* Worth saying out loud when it's true — it's the difference
                between a gallery and a lectionary. */}
            {view.followsToday && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", margin: "10px 0 0" }}>
                {t("visio.follows_today", { defaultValue: "Today's reading" })}
              </p>
            )}
          </div>
        )}

        {step === PASSAGE && view && (
          // Its own scroll box, so the text moves and the image doesn't.
          <div style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 560, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 8px" }}>{view.scriptureRef}</p>
            {view.scripture ? (
              <p style={{ color: WARM, fontFamily: SERIF, fontSize: 18, lineHeight: 1.7, margin: 0 }}>{view.scripture}</p>
            ) : (
              // Same graceful shape the office uses for a book we don't carry.
              <p style={{ color: "rgba(240,237,230,0.72)", fontFamily: SERIF, fontSize: 17, lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>
                {t("visio.open_your_bible", { defaultValue: "Open your bible to this passage, and read it slowly." })}
              </p>
            )}
            {/* A SPACER, not padding on the scroll box — iOS WebKit drops
                bottom padding on a flex scroll container, and the last line of
                the lesson ended up hidden behind the Continue button. */}
            <div aria-hidden style={{ height: 28 }} />
          </div>
        )}

        {/* The return. Nothing on it but the picture — you have read the
            passage now, and this is the same image seen differently. */}
        {step === AGAIN && view && (
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
            {t("visio.look_again", { defaultValue: "Look again" })}
          </p>
        )}

        {(step === Q1 || step === Q2) && view && (
          <p style={{ color: WARM, fontFamily: SERIF, fontSize: 20, fontStyle: "italic", lineHeight: 1.6, textAlign: "center", maxWidth: 480, margin: 0 }}>
            {step === Q1
              ? t("visio.question_notice", { defaultValue: QUESTIONS[0]! })
              : t("visio.question_speaking", { defaultValue: QUESTIONS[1]! })}
          </p>
        )}

        {/* The reflection. The essay is VCS's, and their images are licensed
            from agencies, so it is LINKED and never reproduced (same reasoning
            as lib/vcsExhibitions.ts). openOfficeReading hands it to the native
            in-app browser in the office's own flavour — swipe-back, the top bar
            and the floating bottom pill — so it reads like the lesson hand-off
            rather than like leaving the app. */}
        {step === REFLECT && (
          <div style={{ textAlign: "center", maxWidth: 480 }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
              {t("visio.reflection", { defaultValue: "Reflection" })}
            </p>
            {view?.essayUrl ? (
              <>
                <p style={{ color: WARM, fontFamily: SERIF, fontSize: 19, fontStyle: "italic", lineHeight: 1.6, margin: "14px 0 22px" }}>
                  {t("visio.reflection_line", {
                    defaultValue: "A short reflection on this image, written for it.",
                  })}
                </p>
                <button
                  type="button"
                  onClick={openReflection}
                  style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent", background: "rgba(46,107,64,0.35)", border: `1px solid ${BORDER}`, color: WARM, borderRadius: 999, padding: "12px 22px", fontSize: 15, fontFamily: FONT, cursor: "pointer" }}
                >
                  {t("visio.read_reflection", { defaultValue: "Read the reflection →" })}
                </button>
              </>
            ) : (
              <p style={{ color: "rgba(240,237,230,0.72)", fontFamily: SERIF, fontSize: 18, fontStyle: "italic", lineHeight: 1.6, margin: "14px 0 0" }}>
                {t("visio.reflection_none", { defaultValue: "Sit with what you noticed a little longer." })}
              </p>
            )}
          </div>
        )}

        {/* The close. Not a "well done" screen (owner) — the picture once more,
            and the ones before it. Attribution rides here because ACT asks for
            it and the CC-licensed works REQUIRE it; the licence was verified
            per artwork when the catalogue was built, so it can be stated. */}
        {step === CLOSE && view && (
          <div style={{ textAlign: "center", maxWidth: 520, width: "100%" }}>
            {recent.length > 0 && (
              <>
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "4px 0 10px" }}>
                  {t("visio.recent", { defaultValue: "Recently" })}
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
                  {recent.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => reopen(a.id)}
                      title={a.title}
                      aria-label={a.title}
                      style={{ userSelect: "none", WebkitTapHighlightColor: "transparent", width: 62, height: 62, padding: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}`, background: "none", cursor: "pointer" }}
                    >
                      <img src={a.img} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                </div>
              </>
            )}
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11.5, lineHeight: 1.55, margin: 0 }}>
              {view.attribution}
              {view.where ? ` ${view.where}.` : ""}
              {view.licence ? ` ${view.licence}.` : ""}
            </p>
          </div>
        )}
      </div>

      <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom) + 18px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={next}
          style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420, background: "rgba(46,107,64,0.55)", border: `1px solid ${BORDER}`, color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
        >
          {step === INVITE
            ? t("common.begin", { defaultValue: "Begin" })
            : t("common.continue", { defaultValue: "Continue" })}
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.12em" }}>{step + 1} / {TOTAL}</span>
      </div>
    </div>
  );
}
