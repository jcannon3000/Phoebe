/**
 * Praying with Icons — choose a sacred image by NAME, and sit with it.
 *
 * Owner: "an icon feature that uses the pictures in our catalogue: they open
 * the feature, they can search by name through the catalog of icons, they
 * select one and it goes to another page where they set a timer or no timer
 * — one to five minutes — and it goes down the page with the picture just
 * like the Visio Divina slideshow. Below the picture it has a countdown and
 * the timer. Then they complete it, and the final card shows the most recent
 * three icons they've done."
 *
 * The deliberate INVERSION of Visio Divina: there the day chooses the image
 * (everyone sees the same work), here the PERSON chooses it — an icon you
 * return to is the whole tradition of icon prayer. So this page shares
 * Visio's visual language (the leaf backdrop, the lifted picture, the museum
 * label, the frosted closing cards) but none of its selection machinery: no
 * lectionary, no chooseArtwork, no shared day.
 *
 * The timer is the practice's only structure. With one set, the picture is
 * held: the countdown runs under the work and Complete arrives when it ends
 * — the same "the one thing you cannot do quickly is look slowly" reasoning
 * as Visio's 12-second hold, stretched to a sit. With no timer, Complete is
 * simply there.
 *
 * Completion writes only the device-local icon history (the closing cards'
 * record) — this is a practice you can visit, not a card in the daily rhythm,
 * so it touches no completion flags and no dots.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ICON_CATALOGUE, type IconArtwork } from "@/lib/iconCatalogue";
import { getIconHistory, recordIconPrayed } from "@/lib/iconHistory";
import { FROST_BLUR } from "@/lib/frost";
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

/** Same tidy-ups the Visio deck applies to ACT's records. */
function tidyDate(d: string): string {
  return d.replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
}
function tidyArtist(a: string): string {
  return tidyDate(a.replace(/(^|[,\s])-\s*(\d{3,4})/g, "$1d. $2"));
}

/** Case/diacritic-insensitive haystack for the name search. */
function norm(s: string): string {
  try {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch {
    return s.toLowerCase();
  }
}

/** How many results the search shows at once — a screenful, not an archive. */
const RESULT_CAP = 24;

/** The icon pool's own lookup — history entries whose work left the
 *  catalogue on a regeneration simply drop out of the closing cards. */
const ICON_BY_ID = new Map(ICON_CATALOGUE.map((a) => [a.id, a]));

type Phase = "search" | "timer" | "pray" | "done";

export default function IconsPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<Phase>("search");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<IconArtwork | null>(null);
  /** Minutes, 1–5 — or null for "no timer". */
  const [minutes, setMinutes] = useState<number | null>(null);
  /**
   * The sit's END as a wall-clock timestamp, not a decrementing counter — a
   * backgrounded tab coalesces timers (this repo's own testing notes), and a
   * count that ticks only while the screen is watched would hold someone past
   * their five minutes. Remaining time is recomputed from the clock each tick.
   */
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  /** Read once at mount, like Visio's — this session's own completion joins
   *  it in state so the closing cards update without a re-read. */
  const [history, setHistory] = useState(() => getIconHistory());

  const backdropPhoto = useMemo(
    () => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  /**
   * The search. Empty query browses: recent icons first (the ones a person
   * actually returns to), then the front of the catalogue. A query matches
   * title OR artist, word-by-word, so "rublev trinity" and "trinity" both
   * land on the icon.
   */
  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) {
      const recent = history
        .map((h) => ICON_BY_ID.get(h.id))
        .filter((a): a is IconArtwork => !!a);
      const rest = ICON_CATALOGUE.filter((a) => !recent.some((r) => r.id === a.id));
      return [...recent, ...rest].slice(0, RESULT_CAP);
    }
    const words = q.split(/\s+/).filter(Boolean);
    return ICON_CATALOGUE
      .filter((a) => {
        // The PEOPLE tags are searched too — "teresa" must find an icon whose
        // title is only "St. Teresa of Avila" or whose tag carries the name
        // (the owner's own failed search, against ACT's People facet).
        const hay = norm(`${a.title} ${a.artist ?? ""} ${a.people.join(" ")}`);
        return words.every((w) => hay.includes(w));
      })
      .slice(0, RESULT_CAP);
  }, [query, history]);

  const choose = (a: IconArtwork) => {
    setChosen(a);
    setMinutes(null);
    setLoadedSrc(null);
    setImageFailed(false);
    setPhase("timer");
  };

  const begin = () => {
    if (!chosen) return;
    setEndsAt(minutes != null ? Date.now() + minutes * 60_000 : null);
    // Prime the remaining time IN THE SAME UPDATE. Left stale (its initial 0,
    // or 0 from a finished earlier sit), the pray phase's first render saw
    // timerDone=true — a one-frame tappable "Complete", and worse, the
    // arrival-haptic effect read that frame's closure and buzzed at BEGIN,
    // marking itself done so the real end arrived in silence.
    setRemainingMs(minutes != null ? minutes * 60_000 : 0);
    setPhase("pray");
  };

  /** The countdown itself — clock-derived, see endsAt above. */
  useEffect(() => {
    if (phase !== "pray" || endsAt == null) return;
    const tick = () => setRemainingMs(Math.max(0, endsAt - Date.now()));
    tick();
    const iv = window.setInterval(tick, 250);
    return () => window.clearInterval(iv);
  }, [phase, endsAt]);

  const timerDone = endsAt == null || remainingMs <= 0;
  /**
   * The release, felt — same medium haptic Visio's hold ends with, and for
   * the same reason: after minutes of looking your eyes are not on the
   * button, so the arrival has to be feelable.
   */
  const buzzed = useRef(false);
  useEffect(() => {
    if (phase !== "pray") { buzzed.current = false; return; }
    // The clock is the truth, not the mirrored state — remainingMs can lag a
    // render behind endsAt (see begin's priming), and a stale 0 here is
    // exactly the frame that buzzed at Begin.
    if (endsAt != null && remainingMs <= 0 && Date.now() >= endsAt && !buzzed.current) {
      buzzed.current = true;
      try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "medium" } })); } catch { /* non-fatal */ }
    }
  }, [phase, endsAt, remainingMs]);

  const complete = () => {
    if (!chosen) return;
    const ymd = new Date().toLocaleDateString("en-CA");
    try { recordIconPrayed(chosen.id, ymd); } catch { /* non-fatal */ }
    setHistory((h) => [{ id: chosen.id, ymd }, ...h.filter((v) => v.id !== chosen.id)]);
    setPhase("done");
  };

  /** "The most recent three they've done" (owner) — the one just finished
   *  is already at the front of history by the time this renders. */
  const recentCards = useMemo(
    () =>
      history
        .map((h) => ICON_BY_ID.get(h.id))
        .filter((a): a is IconArtwork => !!a)
        .slice(0, 3),
    [history],
  );

  const mmss = (ms: number): string => {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  /** Header Back steps phases; ✕ leaves for the Practices menu it came from. */
  const back = () => {
    if (phase === "timer") { setPhase("search"); return; }
    if (phase === "pray") { setPhase("timer"); return; }
    if (phase === "done") { setPhase("search"); setQuery(""); return; }
    setLocation("/menu/practices");
  };
  const close = () => setLocation("/menu/practices");

  const frosted: React.CSSProperties = {
    background: "rgba(240,237,230,0.06)",
    backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
    border: `1px solid ${BORDER}`,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* The shared backdrop treatment — identical to visio/guided-prayer/
          examen: one still landscape at 0.22 under the dark wash, absolute
          (never position:fixed — the iOS flash rule). */}
      {backdropPhoto ? (
        <>
          <motion.img
            src={backdropPhoto} alt="" aria-hidden
            initial={{ opacity: 0 }} animate={{ opacity: 0.22 }} transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }}
          />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }} />
        </>
      ) : (
        <AnimatedBackground base={BG} variant="subtle" />
      )}

      {/* Header — Back / title / close, the office's reader chrome. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 12px) 16px 8px", gap: 10 }}>
        <button
          type="button" onClick={back}
          style={{ userSelect: "none", WebkitTapHighlightColor: "transparent", background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer", padding: 6 }}
        >
          ← {t("common.back", { defaultValue: "Back" })}
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          {t("icons.title", { defaultValue: "Praying with Icons" })}
        </span>
        <button
          type="button" onClick={close} aria-label={t("common.close", { defaultValue: "Close" })}
          style={{ userSelect: "none", WebkitTapHighlightColor: "transparent", width: 32, height: 32, borderRadius: 999, background: "rgba(9,26,16,0.5)", border: `1px solid ${BORDER}`, color: WARM, cursor: "pointer", padding: 0 }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "8px 20px calc(env(safe-area-inset-bottom) + 20px)" }}>
        {/* Keyed fade-in on phase, not AnimatePresence mode="wait" — the same
            backgrounded-rAF freeze Visio's deck documents. */}
        <motion.div
          key={phase}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut" }}
          style={{ maxWidth: 520, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
        >
          {phase === "search" && (
            <>
              <p style={{ color: WARM, fontFamily: FONT, fontSize: 20, fontWeight: 600, textAlign: "center", margin: "10px 0 0", lineHeight: 1.4 }}>
                {t("icons.search_heading", { defaultValue: "Choose an icon to pray with" })}
              </p>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
                {t("icons.search_sub", { defaultValue: "Search the catalogue by name or artist, or browse below." })}
              </p>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Every suggested example actually LANDS in the catalogue —
                // "Good Shepherd" was here first and found nothing.
                placeholder={t("icons.search_placeholder", { defaultValue: "Search — “Teresa”, “Trinity”, “Pantocrator”…" })}
                inputMode="search"
                aria-label={t("icons.search_heading", { defaultValue: "Choose an icon to pray with" })}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 16, padding: "13px 16px",
                  borderRadius: 14, outline: "none", color: WARM, fontFamily: FONT, ...frosted,
                }}
              />
              <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {results.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => choose(a)}
                    style={{
                      userSelect: "none", WebkitTapHighlightColor: "transparent",
                      display: "flex", flexDirection: "column", gap: 8, padding: 10,
                      // minWidth 0: a grid item's default min-width is its
                      // content, and one nowrap artist line ("Lorenzetti,
                      // Ambrogio, 1285–approximately 1348") pushed the whole
                      // grid off the right edge of the screen.
                      minWidth: 0, overflow: "hidden",
                      borderRadius: 14, cursor: "pointer", textAlign: "left", ...frosted,
                    }}
                  >
                    <img
                      src={a.img} alt="" loading="lazy" decoding="async"
                      style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 9, boxShadow: "0 6px 18px rgba(0,0,0,0.45)" }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ color: WARM, fontFamily: SERIF, fontSize: 13.5, fontStyle: "italic", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {a.title}
                      </span>
                      {a.artist && (
                        <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {tidyArtist(a.artist)}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {results.length === 0 && (
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13.5, textAlign: "center", margin: "12px 0 0" }}>
                  {t("icons.search_none", { defaultValue: "Nothing by that name — try one word, or an artist." })}
                </p>
              )}
              {/* Only when a search is actually running — browsing always
                  fills the cap, and "keep typing" under an empty field asked
                  for typing nobody had started. */}
              {results.length === RESULT_CAP && query.trim() !== "" && (
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, textAlign: "center", margin: 0 }}>
                  {t("icons.search_more", { defaultValue: "Keep typing to narrow the search." })}
                </p>
              )}
            </>
          )}

          {phase === "timer" && chosen && (
            <>
              <img
                src={chosen.img} alt="" decoding="async"
                style={{ width: 148, height: 148, objectFit: "cover", borderRadius: 12, marginTop: 8, boxShadow: "0 18px 48px rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.4)" }}
              />
              <div style={{ textAlign: "center" }}>
                <p style={{ color: WARM, fontFamily: SERIF, fontSize: 19, fontStyle: "italic", margin: 0, lineHeight: 1.35 }}>{chosen.title}</p>
                {chosen.artist && (
                  <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "6px 0 0" }}>{tidyArtist(chosen.artist)}</p>
                )}
              </div>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, textAlign: "center", margin: "8px 0 0", lineHeight: 1.55 }}>
                {t("icons.timer_ask", { defaultValue: "How long will you sit with it?" })}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                {[null, 1, 2, 3, 4, 5].map((m) => {
                  const selected = minutes === m;
                  return (
                    <button
                      key={m ?? "none"}
                      type="button"
                      onClick={() => setMinutes(m)}
                      aria-pressed={selected}
                      style={{
                        userSelect: "none", WebkitTapHighlightColor: "transparent",
                        borderRadius: 999, padding: "10px 16px", fontSize: 14, fontWeight: 600,
                        fontFamily: FONT, cursor: "pointer",
                        background: selected ? "rgba(46,107,64,0.6)" : "rgba(240,237,230,0.06)",
                        border: selected ? "1px solid rgba(143,175,150,0.65)" : `1px solid ${BORDER}`,
                        color: WARM,
                      }}
                    >
                      {m == null
                        ? t("icons.timer_none", { defaultValue: "No timer" })
                        : t("icons.timer_min", { defaultValue: "{{n}} min", n: m })}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={begin}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420,
                  marginTop: 8, background: "rgba(46,107,64,0.55)", ...FROST_BLUR,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", border: `1px solid ${BORDER}`,
                  color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600,
                  fontFamily: FONT, cursor: "pointer",
                }}
              >
                {t("common.begin", { defaultValue: "Begin" })}
              </button>
            </>
          )}

          {phase === "pray" && chosen && (
            <>
              {/* The picture, exactly as Visio lifts it: drop shadow off the
                  wash, fade-in keyed by the loaded src (a cached image never
                  fires onLoad — the ref covers it). An unreachable image says
                  so rather than holding an empty sit. */}
              {!imageFailed ? (
                <img
                  src={chosen.img}
                  alt={`${chosen.title}${chosen.artist ? ` — ${chosen.artist}` : ""}`}
                  decoding="async"
                  ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoadedSrc(el.currentSrc || el.src); }}
                  onLoad={(e) => setLoadedSrc(e.currentTarget.currentSrc || e.currentTarget.src)}
                  onError={() => setImageFailed(true)}
                  style={{
                    maxWidth: "100%", maxHeight: "56vh", objectFit: "contain", borderRadius: 10, marginTop: 6,
                    boxShadow: "0 26px 74px rgba(0,0,0,0.66), 0 4px 14px rgba(0,0,0,0.45)",
                    opacity: loadedSrc === chosen.img ? 1 : 0, transition: "opacity 420ms ease-out",
                  }}
                />
              ) : (
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, textAlign: "center", margin: "24px 0", lineHeight: 1.6 }}>
                  {t("icons.image_failed", { defaultValue: "The image couldn't load right now — you can still keep the sit, or go back and choose another." })}
                </p>
              )}
              <div style={{ textAlign: "center" }}>
                <p style={{ color: WARM, fontFamily: SERIF, fontSize: 17, fontStyle: "italic", margin: 0 }}>{chosen.title}</p>
                {chosen.artist && (
                  <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, margin: "5px 0 0" }}>{tidyArtist(chosen.artist)}</p>
                )}
              </div>

              {/* THE COUNTDOWN, under the picture (owner). Tabular digits so
                  the clock doesn't shiver as it counts. */}
              {endsAt != null && (
                <p
                  aria-live="off"
                  style={{
                    color: timerDone ? SAGE : WARM, fontFamily: FONT, fontVariantNumeric: "tabular-nums",
                    fontSize: 30, fontWeight: 600, letterSpacing: "0.04em", margin: "2px 0 0",
                  }}
                >
                  {timerDone ? t("icons.timer_up", { defaultValue: "Amen" }) : mmss(remainingMs)}
                </p>
              )}

              <button
                type="button"
                onClick={() => { if (timerDone) complete(); }}
                aria-disabled={!timerDone}
                aria-label={timerDone ? undefined : t("icons.hold_aria", { defaultValue: "Stay with the icon until the timer ends" })}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420,
                  marginTop: 4, background: "rgba(46,107,64,0.55)", ...FROST_BLUR,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", border: `1px solid ${BORDER}`,
                  color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600,
                  fontFamily: FONT, cursor: timerDone ? "pointer" : "default",
                  opacity: timerDone ? 1 : 0.55, transition: "opacity 420ms ease-out",
                }}
              >
                {timerDone
                  ? t("common.complete", { defaultValue: "Complete" })
                  : t("icons.holding", { defaultValue: "Sit with the icon" })}
              </button>
            </>
          )}

          {phase === "done" && (
            <>
              <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "14px 0 2px", textAlign: "center" }}>
                {t("icons.done_eyebrow", { defaultValue: "Icon prayer complete" })}
              </p>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
                {t("icons.done_sub", { defaultValue: "The icons you've been praying with lately." })}
              </p>
              {/* The most recent three (owner) — the one just finished leads.
                  Tappable back into the timer step, because an icon you return
                  to is the point of keeping them. */}
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                {recentCards.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => choose(a)}
                    style={{
                      userSelect: "none", WebkitTapHighlightColor: "transparent",
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: 10, borderRadius: 14, cursor: "pointer", textAlign: "left", ...frosted,
                    }}
                  >
                    <img
                      src={a.img} alt="" loading="lazy" decoding="async"
                      style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flex: "0 0 auto", boxShadow: "0 6px 18px rgba(0,0,0,0.45)" }}
                    />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", color: WARM, fontFamily: SERIF, fontSize: 15.5, fontStyle: "italic", lineHeight: 1.3 }}>{a.title}</span>
                      <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11.5, marginTop: 3 }}>
                        {[tidyArtist(a.artist ?? ""), tidyDate(a.date ?? "")].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {/* The attribution ACT asks for — and the CC-licensed works
                  REQUIRE — for the work just prayed with, exactly where the
                  Visio deck carries its own. */}
              {chosen && (
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, lineHeight: 1.55, margin: "4px 0 0", textAlign: "center" }}>
                  {chosen.attribution}
                  {chosen.where ? ` ${chosen.where}.` : ""}
                  {chosen.licence ? ` ${chosen.licence}.` : ""}
                </p>
              )}
              <button
                type="button"
                onClick={() => setLocation("/dashboard")}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent", width: "100%", maxWidth: 420,
                  marginTop: 6, background: "rgba(46,107,64,0.55)", ...FROST_BLUR,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", border: `1px solid ${BORDER}`,
                  color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600,
                  fontFamily: FONT, cursor: "pointer",
                }}
              >
                {t("common.done", { defaultValue: "Done" })}
              </button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
