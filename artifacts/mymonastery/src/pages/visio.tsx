/**
 * Visio Divina — praying with an image.
 *
 * The sibling of Audio Divina: there, sacred listening; here, sacred looking.
 *
 * Six beats: prompt · picture · prompt · picture · reflection · completion.
 * Each prompt is followed by the looking it asks for — the first tells your
 * eyes what to do while there is still nothing to look at; the second asks
 * what that noticing might be for, and you look again holding the question.
 * The alternation is the practice.
 *
 * There is no scripture slide. The passage the artwork depicts is named — it
 * is the eyebrow over the title — but not printed: reading a lesson here
 * competed with the looking, and the office is where you read.
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
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { artworkForDay } from "@/lib/visioArtworks";
import { chooseArtwork, artworkById, type Chosen } from "@/lib/visioSelect";
import { getVisioHistory, recordVisioSeen } from "@/lib/visioHistory";
import { apiRequest } from "@/lib/queryClient";
import { openOfficeReading, preloadExternal } from "@/lib/openExternal";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

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
 * Fixed, not a rotating pool: they are a sequence, not a variety pack.
 *
 * The first is said BEFORE the picture appears — "as you view the following
 * picture" — so it's an instruction for your eyes, given while there's still
 * nothing to look at. It only asks you to NOTICE: no interpreting, no meaning
 * yet, just what your eye keeps returning to.
 *
 * The second comes after the first look, and asks what that noticing might be
 * for. Asking it first would turn the practice into a quiz.
 */
const QUESTIONS = [
  "As you view the following picture, notice anything that is sticking out to you, or grabs your attention.",
  "Consider what God might be speaking to you through the image in this moment.",
];

/**
 * "WEB: World English Bible (public domain)" → "WEB".
 *
 * The data file names itself in full, which is right for the data and far too
 * long for a letter-spaced eyebrow beside the reference.
 */
function shortTranslation(name: string): string {
  const abbrev = name.split(":")[0]?.trim();
  return abbrev && abbrev.length <= 12 ? abbrev : name.split("(")[0]!.trim();
}

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
      setChosen(chooseArtwork(today, (readings?.lessons ?? []).filter(Boolean)));
      return;
    }
    // …and a hard cap, so a hanging request can't hold the practice shut.
    const timer = setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      setChosen(chooseArtwork(today, []));
    }, READINGS_CAP_MS);
    return () => clearTimeout(timer);
  }, [isFetched, readings, today]);

  /** Whichever artwork the deck is actually showing — today's, or one the
   *  reader tapped back into from the closing gallery. */
  const active: Chosen | null = override
    ? { art: override, ref: override.refs[0] ?? "", followsToday: false }
    : chosen;

  /**
   * The passage, from the bundled World English Bible on the server.
   *
   * WEB and not the RSV that thevcs.org shows beside its commentary: the RSV
   * is under copyright to the National Council of Churches and licensed, not
   * public domain, so it can't be reproduced here however convenient their
   * viewer makes it look. WEB is genuinely public domain, which is why it can
   * be printed in full. Null text is normal (the deuterocanon isn't carried) —
   * the slide then shows the reference alone, exactly as the office does.
   */
  const ref = override ? (override.refs[0] ?? "") : (chosen?.ref ?? "");
  const { data: passage } = useQuery<{ text: string | null; translation: string | null }>({
    queryKey: ["/api/scripture/passage", ref],
    enabled: !!ref,
    queryFn: async () => {
      try {
        const r = await apiRequest<{ text?: string | null; translation?: string | null } | undefined>(
          "GET", `/api/scripture/passage?ref=${encodeURIComponent(ref)}`,
        );
        const ok = r && typeof r === "object";
        return { text: (ok ? r.text : null) ?? null, translation: (ok ? r.translation : null) ?? null };
      } catch {
        return { text: null, translation: null };
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

  /**
   * The leaf (owner: "we want the leaf as the background").
   *
   * An earlier pass lit the frame with a blurred copy of the ARTWORK itself.
   * That made every screen look like the painting it happened to be showing —
   * a cream Blake engraving washed the whole deck pale — and it made Visio the
   * one practice that doesn't look like the others. Contemplation, Co-Breathe,
   * the Examen and Simple Guided Prayer all sit on the same still landscape;
   * this belongs with them. Picked once per open, exactly as they do it.
   */
  const backdropPhoto = useMemo(
    () => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  // Remember today's, once it's settled — this is what pins the choice for the
  // rest of the day and keeps tomorrow's different. Not recorded for an
  // override: re-reading an old picture shouldn't rewrite today.
  useEffect(() => {
    if (!chosen) return;
    try { recordVisioSeen(chosen.art.id, today); } catch { /* non-fatal */ }
  }, [chosen, today]);

  /**
   * The completion cards: what you just looked at, then what you looked at
   * before it. Owner: "cards, like history that shows a thumbnail of the image
   * and the name of the image."
   */
  const cards = useMemo(() => {
    const seen = history
      .map((h) => artworkById(h.id))
      .filter((a): a is NonNullable<typeof a> => !!a);
    const list = active ? [active.art, ...seen.filter((a) => a.id !== active.art.id)] : seen;
    // Five fits the slide without it becoming a scrolling archive; this is a
    // closing beat, not a library.
    return list.slice(0, 5);
  }, [history, active]);

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
   * Seven beats (owner's order): prompt · scripture · picture · prompt ·
   * picture · reflection · completion.
   *
   * You are told what to do with your eyes; you read the passage the artwork
   * depicts; THEN you see it. The reading comes first so the picture arrives
   * into something — which is also why the picture isn't on screen during it.
   * Then the second prompt asks what the noticing might be for, and you look
   * again holding the question. The alternation is the practice.
   *
   * The scripture slide was cut and then asked back for once the owner saw
   * thevcs.org show the passage beside its commentary — "put it before the
   * first image". The reference stays as the eyebrow over the title on both
   * picture beats regardless.
   */
  const PROMPT_1 = 0, SCRIPTURE = 1, PICTURE_1 = 2, PROMPT_2 = 3, PICTURE_2 = 4, REFLECT = 5, DONE = 6;
  const [step, setStep] = useState(PROMPT_1);
  const TOTAL = 7;
  // NOT on the scripture beat: that one comes BEFORE the picture is ever seen,
  // and showing it there would spend the reveal early.
  const showsImage = step === PICTURE_1 || step === PICTURE_2;

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
   * a button that appears broken. Same contract bcp-daily-office.tsx keeps.
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
      // Deliberately NOT the artwork's title. Owner: "the bottom bar doesn't
      // need the full title... it makes the bottom bar too long when you're on
      // the web viewer." Some of these run to eighty characters.
      sectionLabel: "",
    });
  };

  /** Jump back into a picture from the completion cards. */
  const reopen = (id: number) => {
    setOverrideId(id);
    setLoadedSrc(null);
    setStep(PICTURE_1);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Backdrop — the shared treatment: one still landscape held at 0.22
          under the multi-stop dark wash, both on zIndex -1 inside the isolated
          stacking context. ABSOLUTE, never position:fixed (iOS flash — see the
          page-backdrop rule this repo keeps). Falls back to the ambient drift
          when there's no photo. Identical to guided-prayer.tsx / examen.tsx. */}
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
      <style>{`
        @keyframes visio-breathe { 0%,100% { opacity: .5 } 50% { opacity: .85 } }
        /* The prompts glow. They're the only things on their slides, and the
           glow is what makes them read as spoken TO you rather than printed. */
        @keyframes visio-glow {
          0%,100% { text-shadow: 0 0 16px rgba(240,237,230,0.30), 0 0 46px rgba(143,175,150,0.20) }
          50%     { text-shadow: 0 0 26px rgba(240,237,230,0.46), 0 0 70px rgba(143,175,150,0.32) }
        }
        .visio-prompt { animation: visio-glow 5200ms ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .visio-prompt { animation: none; text-shadow: 0 0 22px rgba(240,237,230,0.38), 0 0 60px rgba(143,175,150,0.26); }
        }
      `}</style>

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
          // The gospel beat fills from the top so the image can hold a fixed
          // band and the text scroll under it; every other beat is centred.
          justifyContent: step === SCRIPTURE ? "flex-start" : "center",
          padding: "0 20px", gap: 16,
          overflowY: step === SCRIPTURE ? "hidden" : "auto",
        }}
      >
        {/* The painting, lit from behind by itself.
            Owner: "have it be on a blurred background and there's a drop
            shadow." A blown-up, blurred copy sits underneath and bleeds past
            the frame, so a small image on a dark screen sits in its own light
            instead of floating on black. aria-hidden — it's the same picture,
            and a screen reader should hear about it once. */}
        {/* The painting itself, on the leaf. The drop shadow is what lifts it
            off the scenery — without it a dark artwork dissolves into the
            wash. */}
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
              maxHeight: "62vh",
              objectFit: "contain", borderRadius: 10,
              boxShadow: "0 26px 74px rgba(0,0,0,0.66), 0 4px 14px rgba(0,0,0,0.45)",
              // Fades in rather than snapping: these load over the network,
              // and a hard pop is the wrong first movement here.
              opacity: loadedSrc === view.img ? 1 : 0,
              transition: "opacity 420ms ease-out",
            }}
          />
        )}

        {/* Resolving. A soft empty frame rather than a spinner: the practice
            opens on stillness, and the first prompt normally covers the wait. */}
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

        {(step === PROMPT_1 || step === PROMPT_2) && (
          <p
            className="visio-prompt"
            style={{ color: WARM, fontFamily: SERIF, fontSize: 21, fontStyle: "italic", lineHeight: 1.6, textAlign: "center", maxWidth: 480, margin: 0 }}
          >
            {step === PROMPT_1
              ? t("visio.prompt_notice", { defaultValue: QUESTIONS[0]! })
              : t("visio.prompt_speaking", { defaultValue: QUESTIONS[1]! })}
          </p>
        )}

        {/* The passage, read before the picture is seen. Its own scroll box
            with a bottom SPACER — not padding, which iOS WebKit drops on a
            flex scroll container, hiding the last line behind the button. */}
        {step === SCRIPTURE && view && (
          <div style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 560, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 8px" }}>
              {view.scriptureRef}
              {passage?.translation ? ` · ${shortTranslation(passage.translation)}` : ""}
            </p>
            {view.scripture ? (
              <p style={{ color: WARM, fontFamily: SERIF, fontSize: 18, lineHeight: 1.7, margin: 0 }}>{view.scripture}</p>
            ) : (
              // Same graceful shape the office uses for a book we don't carry.
              <p style={{ color: "rgba(240,237,230,0.72)", fontFamily: SERIF, fontSize: 17, lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>
                {t("visio.open_your_bible", { defaultValue: "Open your bible to this passage, and read it slowly." })}
              </p>
            )}
            <div aria-hidden style={{ height: 28 }} />
          </div>
        )}

        {/* The picture's identity, on both looking beats.
            Owner: "title (name of picture, and scripture reference eyebrow)."
            ONE eyebrow, carrying both facts — the passage it depicts, and
            whether that's what the lectionary appointed today. Two stacked
            eyebrows was a thing this app got told off for once already. */}
        {showsImage && view && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 8px" }}>
              {view.scriptureRef}
              {view.followsToday ? ` · ${t("visio.follows_today", { defaultValue: "Today's reading" })}` : ""}
            </p>
            <p style={{ color: WARM, fontFamily: SERIF, fontSize: 19, fontStyle: "italic", margin: 0 }}>{view.title}</p>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "6px 0 0" }}>
              {[view.artist, tidyDate(view.date)].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}

        {/* The reflection. The essay is VCS's, and their images are licensed
            from agencies, so it is LINKED and never reproduced (same reasoning
            as lib/vcsExhibitions.ts). openOfficeReading hands it to the native
            in-app browser in the office's own flavour — swipe-back, the top bar
            and the floating bottom pill — so it reads like the lesson hand-off
            rather than like leaving the app.

            The URL is used EXACTLY as ACT recorded it in the artwork's notes.
            A previous pass trimmed these to the exhibition root, on the theory
            that the deep form landed mid-page; owner checked and the notes
            link "goes directly to the start of the relevant reflection". The
            trim also discarded the `?first=` parameter that 88 of them carry
            to select which artwork the exhibition opens on. Don't trim it. */}
        {step === REFLECT && (
          <div style={{ textAlign: "center", maxWidth: 480 }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
              {t("visio.reflection", { defaultValue: "Reflection" })}
            </p>
            {view?.essayUrl ? (
              <>
                <p style={{ color: WARM, fontFamily: SERIF, fontSize: 19, fontStyle: "italic", lineHeight: 1.6, margin: "14px 0 22px" }}>
                  {t("visio.reflection_line", { defaultValue: "A short reflection on this image, written for it." })}
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

        {/* The completion slide. Frosted cards (owner) — thumbnail and name —
            for what's been looked at lately, tappable to go back in. The
            attribution lives here too, because ACT asks for it and the
            CC-licensed works REQUIRE it. */}
        {step === DONE && (
          <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 2px", textAlign: "center" }}>
              {t("visio.close_eyebrow", { defaultValue: "Visio Divina complete" })}
            </p>
            {cards.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => reopen(a.id)}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent",
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: 10, borderRadius: 14, cursor: "pointer", textAlign: "left",
                  // Frosted (owner).
                  background: "rgba(240,237,230,0.06)",
                  backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
                  border: `1px solid ${BORDER}`,
                }}
              >
                <img
                  src={a.img}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flex: "0 0 auto", boxShadow: "0 6px 18px rgba(0,0,0,0.45)" }}
                />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", color: WARM, fontFamily: SERIF, fontSize: 15.5, fontStyle: "italic", lineHeight: 1.3 }}>{a.title}</span>
                  <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11.5, marginTop: 3 }}>
                    {[a.artist, tidyDate(a.date ?? "")].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            ))}
            {view && (
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, lineHeight: 1.55, margin: "6px 0 0", textAlign: "center" }}>
                {view.attribution}
                {view.where ? ` ${view.where}.` : ""}
                {view.licence ? ` ${view.licence}.` : ""}
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom) + 18px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={next}
          style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420, background: "rgba(46,107,64,0.55)", border: `1px solid ${BORDER}`, color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
        >
          {step === PROMPT_1
            ? t("common.begin", { defaultValue: "Begin" })
            : t("common.continue", { defaultValue: "Continue" })}
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.12em" }}>{step + 1} / {TOTAL}</span>
      </div>
    </div>
  );
}
