// VisioHowToIntro — a three-slide "how it works" for Visio Divina, shown the
// first time someone enters the practice and reachable afterwards from the
// Tutorial pill on the deck's opening slide.
//
// Owner: "the first time someone does [Visio], we want a slide tutorial in a
// similar UI to the creation prayer tutorial that explains to them that they
// will meditate on an image related to the lectionary reading throughout the
// week, returning to it not just once, but to be immersed in the passage
// throughout the week." So it is deliberately built to CobreatheHowToIntro's
// shape — per-slide landscape at 0.22 under the same heavy dark wash, content
// vertically centred, and the office-style bottom controls (an "X of Y"
// counter, a frosted Next pill, Skip beneath). Someone who has met the
// Creation Prayer tutorial should recognise this as the same kind of thing.
//
// What it does NOT share is the ring cluster: that intro teaches a mechanism
// you have to follow in time, and this one teaches a rhythm you keep across
// days. The thing to picture here is the same image returning, so the middle
// slide draws a week of days with one frame lit on each of them.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(200,212,192,0.62)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

const KEY = "phoebe:visio-howto-seen";

export function visioHowtoSeen(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function markVisioHowtoSeen(): void {
  try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ }
}

type Slide = { eyebrow?: string; title?: string; body: string; art: "look" | "week" | null };

const SLIDES: Slide[] = [
  {
    eyebrow: "Visio Divina",
    title: "Looking as prayer",
    body: "One work of art, chosen for the passage the lectionary appoints this week. There is nothing to solve and nothing to finish — you look, and you let the looking be the prayer.",
    art: "look",
  },
  {
    eyebrow: "One image, all week",
    title: "Come back to it",
    body: "The same picture waits for you every day until Sunday. What you notice on Thursday is not what you noticed on Monday, and that is the point: the passage has time to work on you.",
    art: "week",
  },
  {
    // Last slide — the invitation, centred, no eyebrow and no headline. Same
    // shape as the Creation Prayer tutorial's third slide.
    body: "After the first look comes the passage itself, and then a reflection written about the work. Come as often as you like. Let the week soak in.",
    art: null,
  },
];

/**
 * A week of days with the same frame lit on each — the middle slide's picture
 * of what "one image, all week" means.
 *
 * Drawn rather than photographed because the thing being taught is a PATTERN
 * across days, which no single photograph can show. The frames fill one after
 * another on a loop, so the eye reads it as a week passing.
 */
function WeekOfDays() {
  const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => setLit((n) => (n + 1) % (DAYS.length + 2)), 620);
    return () => window.clearInterval(iv);
  }, []);
  return (
    <div aria-hidden style={{ display: "flex", gap: 7, justifyContent: "center", marginBottom: 26 }}>
      {DAYS.map((d, n) => {
        const on = n <= lit;
        return (
          <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 26, height: 32, borderRadius: 4,
                border: `1px solid ${on ? "rgba(168,197,160,0.75)" : "rgba(168,197,160,0.22)"}`,
                background: on ? "rgba(143,175,150,0.30)" : "rgba(143,175,150,0.06)",
                transition: "background 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease",
                boxShadow: on ? "0 0 10px rgba(143,175,150,0.28)" : "none",
              }}
            />
            <span style={{ color: on ? FAINT : "rgba(200,212,192,0.28)", fontSize: 10, fontFamily: FONT, letterSpacing: "0.06em", transition: "color 0.5s ease" }}>{d}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The first slide's picture: a frame with an eye's worth of attention on it. */
function OneFrame() {
  return (
    <div aria-hidden style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
      <motion.div
        initial={{ opacity: 0.55, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2.6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
        style={{
          width: 96, height: 118, borderRadius: 6,
          border: "1px solid rgba(168,197,160,0.6)",
          background: "linear-gradient(160deg, rgba(143,175,150,0.30) 0%, rgba(143,175,150,0.10) 100%)",
          boxShadow: "0 0 22px rgba(143,175,150,0.22)",
        }}
      />
    </div>
  );
}

/** Per-slide backdrop — a landscape at 0.22 that fades in, as the office look. */
function Backdrop({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img src={src} alt="" aria-hidden onLoad={() => setLoaded(true)}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 0.22 : 0, transition: "opacity 0.6s ease", zIndex: -1 }} />
  );
}

export function VisioHowToIntro({ onDone, photos }: { onDone: () => void; photos?: string[] }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const slide = SLIDES[i]!;
  const isLast = i === SLIDES.length - 1;

  const pool = photos && photos.length > 0 ? photos : [];
  const photo = pool.length > 0 ? pool[i % pool.length]! : null;

  const next = () => setI((n) => (n >= SLIDES.length - 1 ? (onDone(), n) : n + 1));

  // Desktop keyboard nav — mirrors tap-forward / left-edge back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); setI((n) => (n >= SLIDES.length - 1 ? (onDone(), n) : n + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  // Tap forward, left edge back — the same gesture the deck itself uses, so the
  // tutorial doesn't teach a different way of moving than the practice.
  const onTap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest("button")) return;
    if (e.clientX < window.innerWidth / 2) setI((n) => Math.max(0, n - 1));
    else next();
  };

  return (
    <div onClick={onTap} style={{ position: "fixed", inset: 0, zIndex: 95, background: "#0C1F12", isolation: "isolate", fontFamily: FONT }}>
      {photo && (
        <>
          <Backdrop key={photo} src={photo} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }} />
        </>
      )}

      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 26px 150px", textAlign: "center" }}>
        {/**
          * The picture sits outside the animated block, the way the Creation
          * Prayer tutorial keeps its ring cluster outside its own — it belongs
          * to the slide, but it shouldn't re-mount and re-fade every time the
          * words beneath it change.
          */}
        {slide.art === "look" && <OneFrame />}
        {slide.art === "week" && <WeekOfDays />}
        {/**
          * A KEYED ENTER, not an AnimatePresence exit.
          *
          * `mode="wait"` holds the incoming slide until the outgoing one's
          * animations finish, and here they never did: the counter advanced to
          * "2 of 3" and slide one stayed on the screen, through two different
          * attempts at what was blocking it. A keyed motion.div re-mounts and
          * fades the new slide in on its own — nothing to wait on, so nothing
          * to stall. The old slide is simply gone, which at this speed reads
          * the same as a cross-fade.
          */}
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ maxWidth: 560, width: "100%" }}
          >
            {slide.eyebrow && (
              <p style={{ color: SAGE, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: FONT, margin: "0 0 10px", fontWeight: 600 }}>
                {slide.eyebrow}
              </p>
            )}
            {slide.title && (
              <h1 style={{ color: WARM, fontSize: 25, fontWeight: 700, fontFamily: FONT, margin: "0 0 14px", lineHeight: 1.2 }}>
                {slide.title}
              </h1>
            )}
            <p style={{ color: slide.title ? FAINT : WARM, fontSize: slide.title ? 15.5 : 19, fontFamily: slide.title ? FONT : SERIF, fontStyle: slide.title ? "normal" : "italic", lineHeight: 1.6, margin: 0 }}>
              {slide.body}
            </p>
            {isLast && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDone(); }}
                className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ marginTop: 26, background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(168,197,160,0.5)", color: WARM, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
              >
                {t("visio.howto_begin", { defaultValue: "Begin looking" })} &rarr;
              </button>
            )}
          </motion.div>
      </div>

      {/* Bottom controls — the office's "X of Y" counter, a Next pill, and Skip
          beneath. Hidden on the last slide (it advances via its own Begin). */}
      <div className="absolute left-0 right-0 flex flex-col items-center" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)" }}>
        <p className="text-xs" style={{ color: "rgba(143,175,150,0.32)", letterSpacing: "0.06em", fontFamily: FONT, marginBottom: 16 }}>
          {i + 1} of {SLIDES.length}
        </p>
        {!isLast && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); next(); }}
              className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(168,197,160,0.5)", color: WARM, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
              {t("common.next", { defaultValue: "Next" })}
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onDone(); }}
              style={{ color: "rgba(200,212,192,0.65)", fontFamily: FONT, fontSize: 13, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer", padding: "2px 8px" }}>
              {t("common.skip", { defaultValue: "Skip" })}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
