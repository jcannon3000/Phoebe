/**
 * Visio Divina — praying with an image.
 *
 * The sibling of Audio Divina: there, sacred listening; here, sacred looking.
 * Four beats — the image alone, the image with the day's passage, one question,
 * then the close. Deliberately slow: the first slide has nothing on it but the
 * painting, because the practice IS the looking and any text would be read
 * instead.
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
import { chooseArtwork, type Chosen } from "@/lib/visioSelect";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/**
 * The catalogue gives us the painting and the passage but not the question —
 * ACT catalogues art, it doesn't write prayer prompts. These are general
 * enough to sit under any of the 233 and specific enough to actually start
 * something. Chosen by the date so the day has one question, not a shuffle.
 */
const PROMPTS = [
  "What do you notice first? Stay with it a while before you let your eye move on.",
  "Where are you in this picture? Go and stand there.",
  "Look at the light — where it comes from, and what it falls on.",
  "What is being asked of the people here? What is being asked of you?",
  "Whose face would you least like to meet? Look at it anyway.",
  "What does this make you want to say to God? Say it.",
];

/** "1050-1100" is a range, and a range takes an en dash. */
function tidyDate(d: string): string {
  return d.replace(/(\d)\s*-\s*(\d)/g, "$1\u2013$2");
}

function dayHash(ymd: string): number {
  let h = 0;
  for (let i = 0; i < ymd.length; i++) h = (h * 31 + ymd.charCodeAt(i)) | 0;
  return Math.abs(h);
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

  // The passage itself, from the bundled World English Bible on the server.
  // Null text is normal (the deuterocanon isn't carried) — the slide then
  // shows the reference alone, exactly as the office's lesson slides do.
  const ref = chosen?.ref ?? "";
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
  const prompt = PROMPTS[dayHash(today) % PROMPTS.length]!;

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
        prompt: bundled.prompt,
        attribution: bundled.attribution,
        licence: "Public domain",
        essayUrl: bundled.essayUrl ?? null,
        followsToday: false,
      }
    : chosen
      ? {
          title: chosen.art.title,
          artist: chosen.art.artist ?? "",
          date: chosen.art.date ?? "",
          where: chosen.art.where ?? "",
          img: chosen.art.img,
          scriptureRef: chosen.ref,
          scripture: passage?.text ?? null,
          prompt,
          attribution: chosen.art.attribution,
          licence: chosen.art.licence,
          essayUrl: chosen.art.essay,
          followsToday: chosen.followsToday,
        }
      : null;

  // 0 the image · 1 the passage · 2 the question · 3 the close.
  const [step, setStep] = useState(0);
  const TOTAL = 4;
  const atEnd = step >= TOTAL - 1;
  const close = () => setLocation("/dashboard");
  const next = () => {
    if (!atEnd) { setStep((s) => s + 1); return; }
    // Kept by finishing, not by opening.
    try { markPracticeDoneToday("visio"); } catch { /* non-fatal */ }
    close();
  };
  const prev = () => { if (step > 0) setStep((s) => s - 1); };

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
          onClick={close}
          aria-label={t("common.close", { defaultValue: "Close" })}
          style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent", width: 32, height: 32, borderRadius: 999, background: "rgba(9,26,16,0.5)", border: `1px solid ${BORDER}`, color: WARM, cursor: "pointer", padding: 0 }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          // The passage slide fills from the top so the image can hold a fixed
          // band and the text scroll under it; every other beat is centred.
          justifyContent: step === 1 ? "flex-start" : "center",
          padding: "0 20px", gap: 14,
          overflowY: step === 1 ? "hidden" : "auto",
        }}
      >
        {/* The painting is on screen for the first three beats — the passage and
            the question are read WITH it, not instead of it.

            On the passage beat it holds a SMALL fixed band rather than sharing
            one scroll box with the text: a long lesson (Acts 1, or a Passion
            reading of eighty verses) pushed it off the top and left a 30px
            sliver of stone, which is worse than not showing it at all. */}
        {step < 3 && view && (
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
              maxHeight: step === 0 ? "64vh" : step === 1 ? "22vh" : "38vh",
              objectFit: "contain", borderRadius: 10, boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
              // Fades in rather than snapping: these load over the network, and
              // a hard pop is the wrong first movement for a looking practice.
              opacity: loadedSrc === view.img ? 1 : 0,
              transition: "opacity 420ms ease-out",
            }}
          />
        )}

        {/* Resolving. A soft empty frame rather than a spinner: the practice
            opens on stillness, and this is usually gone within a beat. */}
        {!view && (
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

        {step === 0 && view && (
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

        {step === 1 && view && (
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

        {step === 2 && view && (
          <p style={{ color: WARM, fontFamily: SERIF, fontSize: 20, fontStyle: "italic", lineHeight: 1.6, textAlign: "center", maxWidth: 480, margin: 0 }}>
            {view.prompt}
          </p>
        )}

        {step === 3 && view && (
          <div style={{ textAlign: "center", maxWidth: 520 }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
              {t("visio.close_eyebrow", { defaultValue: "Visio Divina complete" })}
            </p>
            <p style={{ color: WARM, fontFamily: SERIF, fontSize: 22, fontStyle: "italic", margin: "12px 0 18px" }}>
              {t("visio.close_line", { defaultValue: "Thank you for looking slowly." })}
            </p>
            {/* Attribution, because ACT asks for it, because the CC-licensed
                works REQUIRE it, and because a painting has a maker. The
                licence is named alongside it — it was verified per-artwork
                when the catalogue was built, so it can be stated plainly. */}
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11.5, lineHeight: 1.55, margin: 0 }}>
              {view.attribution}
              {view.where ? ` ${view.where}.` : ""}
              {view.licence ? ` ${view.licence}.` : ""}
            </p>
            {/* The commentary is the natural next step, and it opens OUT: VCS's
                essays are theirs and their images are licensed from agencies,
                so we send the reader to it rather than reproducing any of it
                here (same reasoning as lib/vcsExhibitions.ts). openExternal
                gives it the native in-app browser on iOS — the same smooth
                open the Bible and CAC links get. */}
            {view.essayUrl && (
              <button
                type="button"
                onClick={() => openExternal(view.essayUrl!)}
                style={{ marginTop: 12, background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, textDecoration: "underline", cursor: "pointer", padding: 6 }}
              >
                {view.essayUrl.includes("thevcs.org")
                  ? t("visio.read_essay_vcs", { defaultValue: "Read the commentary at the Visual Commentary on Scripture →" })
                  : t("visio.read_essay", { defaultValue: "Read about this image →" })}
              </button>
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
          {atEnd ? t("common.done", { defaultValue: "Done" }) : t("common.continue", { defaultValue: "Continue" })}
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.12em" }}>{step + 1} / {TOTAL}</span>
      </div>
    </div>
  );
}
