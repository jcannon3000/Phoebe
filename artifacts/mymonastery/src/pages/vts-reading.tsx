/**
 * In-app reader for the VTS Dean's Commentary — one paragraph per slide.
 * Owner: "make sure the ui is like the offices, there some significant
 * differences for no reason" — this now shares the Daily Office
 * slideshow's actual header layout (← Back / centered title pill / X
 * close), color tokens, animated backdrop, and body typography
 * (bcp-daily-office.tsx), rather than a separately-invented look. Still a
 * lightweight standalone build, not a reuse of that file's liturgical
 * engine — the commentary has nothing in common with an office beyond
 * the visual language.
 *
 * Text comes from api-server's GET /api/vts/today-text, which scrapes and
 * caches today's commentary body server-side (VTS gave permission to bring
 * the text into Phoebe rather than just linking out — see that route for
 * the scraping notes). If scraping ever comes back empty (site markup
 * changed, fetch failure), this falls back to a single "Read on VTS's
 * site" card rather than showing a broken reader.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { apiRequest } from "@/lib/queryClient";
import { markVtsRead, markReflectionPrayed } from "@/lib/cacReadState";
import { openExternal } from "@/lib/openExternal";
import { SPLASH_PHOTO, LEAF_PHOTOS } from "@/lib/earthPhotos";
import { resolvePlacePhotos, BUNDLED_SET_PREFIX } from "@/lib/breathPlacePhotos";
import splashForestPath from "@/assets/splash/forest-path.jpg";

// Same tokens bcp-daily-office.tsx uses (var()-backed so Office display
// settings — Paper mode, font choice — apply here too, not just there).
const BG = "var(--oh-bg2, #091A10)";
const WARM_TEXT = "var(--oh-ink, #F0EDE6)";
const FAINT_GREEN = "rgba(var(--ot-sage, 143,175,150),0.55)";
const BORDER = "rgba(var(--ot-mist, 200,212,192),0.15)";
const BUTTON_BG = "var(--oh-cta, #2D5E3F)";
const SPACE_GROTESK = "var(--office-font, 'Space Grotesk', system-ui, sans-serif)";

type VtsText = { title: string; url: string; paragraphs: string[]; date: string | null };

export default function VtsReadingPage() {
  const [, setLocation] = useLocation();
  // step 0 = the opening title/date slide ("VTS Dean's Commentary" + the
  // article's own date), 1..total = paragraphs[step - 1]. Owner: "have it
  // begin on it" — the reader opens ON this slide, not straight into
  // paragraph text.
  const [step, setStep] = useState(0);
  const [markedRead, setMarkedRead] = useState(false);
  // Today's local date in the query key — the server now day-scopes its own
  // cache too (see routes/vts.ts's todayStamp guard), but keying the CLIENT
  // cache the same way means a tab left open across midnight also refetches
  // instead of serving yesterday's cached commentary. Owner: "the first
  // time I opened it, it showed me yesterday's."
  const today = (() => { try { return new Date().toLocaleDateString("en-CA"); } catch { return ""; } })();
  const { data, isLoading } = useQuery<VtsText>({
    queryKey: ["/api/vts/today-text", today],
    queryFn: () => apiRequest("GET", "/api/vts/today-text"),
    staleTime: 10 * 60_000,
  });

  // The office's own held-breath loading veil (bcp-daily-office.tsx) — a
  // fixed leaf photo under a dark wash, with a quiet spinner. Same fixed
  // SPLASH_PHOTO the office defaults to (no per-user backdrop choice here,
  // this reader has no display settings of its own), picked once so it
  // can't shuffle mid-load. Owner: "the loading screen should be like how
  // the office loads."
  const veilPhoto = useMemo(() => SPLASH_PHOTO || splashForestPath, []);
  const [veilPhotoReady, setVeilPhotoReady] = useState(false);

  /**
   * FLAMINGOS behind the Dean's Commentary (owner, superseding the earlier ask
   * for leaf backgrounds — the flamingo is this publication's own mark: it's
   * the card's emoji, the notification's title, and the bird at VTS).
   *
   * Reuses the bundled set that backs The Flamingo breath place rather than a
   * second copy of the same photographs. Falls back to a leaf if that set is
   * ever empty, so the page can't end up on a flat green field.
   */
  const backdropPhoto = useMemo(() => {
    const flamingos = resolvePlacePhotos([`${BUNDLED_SET_PREFIX}flamingos`]);
    const pool = flamingos.length > 0 ? flamingos : LEAF_PHOTOS;
    return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]! : null;
  }, []);

  const close = () => setLocation("/");

  // Reading counts as read once you've actually stepped PAST the opening
  // title slide into a real paragraph — same "opened it" bar every other
  // reflection source uses, not "landed on the page." Fires once, the first
  // time step advances off the title slide.
  const markReadOnce = () => {
    if (markedRead) return;
    setMarkedRead(true);
    markVtsRead();
    /**
     * ?side=<morning|evening> — arrived from a side whose PRAYER is the
     * Dean's Commentary (begin-prayer routes a reflection anchor here when
     * VTS is the chosen source). Credit that side too: its own per-side
     * tracker plus a prayer-session row, so the anchor completes and syncs
     * across devices rather than only stamping the reflection card.
     *
     * Same bar as the reflection mark itself — stepping past the title slide
     * — so it can't credit an office for merely landing on the page.
     */
    try {
      const v = new URLSearchParams(window.location.search).get("side");
      if (v === "morning" || v === "evening") markReflectionPrayed("vts", v);
    } catch { /* ignore */ }
  };

  /**
   * The streak slide's numbers. Counted in PUBLISHING DAYS, not calendar days —
   * the Dean's Commentary comes out on weekdays, so a reader who never misses
   * would otherwise watch their streak reset every Saturday.
   */
  const localToday = (() => { try { return new Date().toLocaleDateString("en-CA"); } catch { return ""; } })();
  const { data: streak } = useQuery<{ current: number; totalDays: number }>({
    queryKey: ["/api/me/reflection-streak", "vts", localToday],
    queryFn: () => apiRequest("GET", `/api/me/reflection-streak?source=vts&today=${encodeURIComponent(localToday)}`),
    enabled: !!localToday,
    staleTime: 5 * 60_000,
  });

  const paragraphs = data?.paragraphs ?? [];
  // The reading, then one closing slide that says how long they've kept it.
  const total = paragraphs.length + (paragraphs.length > 0 ? 1 : 0);
  const isTitle = step === 0;
  const isStreak = paragraphs.length > 0 && step === total;
  const paraIndex = step - 1;

  // Same condition as isTitle, by definition (there's only one slide before
  // the first paragraph) — named separately for what each call site is
  // actually asking, but derived rather than duplicated so they can't
  // silently diverge.
  const atStart = isTitle;
  const atEnd = step >= total;
  const next = () => {
    if (step === 0) markReadOnce();
    if (!atEnd) setStep((s) => s + 1);
    else close();
  };
  // Matches the office nav pill's Back button — disabled at the first
  // slide rather than closing (the X already owns "leave the reader").
  const prev = () => { if (!atStart) setStep((s) => s - 1); };

  // Same veil bcp-daily-office.tsx shows on re-entry (no versicle — that's
  // this reader's own opening beat, not a liturgical threshold): a fixed
  // leaf photo under a dark wash, plus a quiet spinner.
  if (isLoading) {
    return (
      <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img
          src={veilPhoto}
          alt=""
          aria-hidden
          decoding="async"
          onLoad={() => setVeilPhotoReady(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1, opacity: veilPhotoReady ? 1 : 0, transition: "opacity 700ms ease-out" }}
        />
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(var(--ot-wash2, 8,18,12),0.62) 0%, rgba(var(--ot-wash2, 8,18,12),0.5) 45%, rgba(var(--ot-wash2, 8,18,12),0.78) 100%)" }} />
        <div aria-hidden className="animate-spin" style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(var(--ot-sage, 143,175,150),0.25)", borderTopColor: "rgba(var(--ot-sage, 143,175,150),0.8)" }} />
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, overflow: "hidden", fontFamily: SPACE_GROTESK }}>
      {/* Backdrop — a still leaf photo under the shared dark wash (matches
          guided-prayer.tsx / contemplation.tsx), falling back to the plain
          animated wash if no bundled photo is available. */}
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
        <AnimatedBackground base={BG} variant="subtle" fadeTop />
      )}

      {/* Top bar — Back / title pill / X. Mirrors the office's own header
          exactly (bcp-daily-office.tsx), not a separately-invented one. */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: "none" }}>
        <div
          className="max-w-2xl mx-auto w-full px-5 pb-2"
          style={{
            display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12,
            pointerEvents: "auto", paddingTop: "max(1.5rem, env(safe-area-inset-top))",
          }}
        >
          <button
            type="button"
            onClick={close}
            style={{ color: FAINT_GREEN, fontSize: 13, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: SPACE_GROTESK }}
          >
            ← Back
          </button>
          <span
            className="rounded-full"
            style={{
              background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
              border: `1px solid ${BORDER}`, color: WARM_TEXT, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", padding: "6px 16px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220,
            }}
          >
            🗞️ The Dean's Commentary
          </span>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              style={{ width: 32, height: 32, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid ${BORDER}`, color: WARM_TEXT, cursor: "pointer", padding: 0 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </header>

      <div
        className="max-w-2xl mx-auto w-full"
        style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          // Top-aligned and scrollable, matching the office's own content
          // slides (bcp-daily-office.tsx's <main>) — only the office's TITLE
          // cards vertically center; a body-text slide starts near the top
          // and scrolls if it runs long. Owner: "the vertical alignment of
          // the text on the slides is not matching the offices." The title
          // slide itself is one of those TITLE cards, so it centers too.
          justifyContent: isTitle ? "center" : "flex-start",
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          padding: "max(110px, calc(env(safe-area-inset-top) + 80px)) 28px max(96px, calc(env(safe-area-inset-bottom) + 60px))",
        }}
        onClick={(e) => {
          // Tap the left third to go back, the rest to advance — no swipe
          // gesture engine needed for a single-column paragraph reader.
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          if (x < e.currentTarget.clientWidth / 3) prev(); else next();
        }}
      >
        {total === 0 ? (
          <div style={{ textAlign: "left" }}>
            <p style={{ color: FAINT_GREEN, fontSize: 19, lineHeight: 1.75, fontFamily: SPACE_GROTESK, marginBottom: 24 }}>
              Couldn't load today's commentary here — read it on VTS's own site instead.
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (data?.url) openExternal(data.url, { reader: true }); markReadOnce(); close(); }}
              className="rounded-full text-[14px] font-semibold"
              style={{ background: "rgba(46,107,64,0.9)", color: WARM_TEXT, border: "1px solid rgba(46,107,64,0.6)", padding: "12px 22px", cursor: "pointer", fontFamily: SPACE_GROTESK }}
            >
              Open on vts.edu
            </button>
          </div>
        ) : isTitle ? (
          // Opening slide — the SAME illuminated, centered section-title
          // language the office's own "before you begin" threshold slide
          // uses (bcp-daily-office.tsx: eyebrow, title-glow-breathe h1,
          // centered), not a left-aligned preamble. The commentary body
          // itself starts on the slides that follow — owner: "the
          // cometary should be here [the following pages]," this slide is
          // title-only. "Have it begin on it" — this is still the reader's
          // first slide, not one to skip past.
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              textAlign: "center", gap: 18, maxWidth: 540, margin: "0 auto",
            }}
          >
            <p style={{ color: FAINT_GREEN, fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
              🗞️ VTS Dean's Commentary
            </p>
            <h1
              className="title-glow-breathe"
              style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(40px, 8vw, 72px)", lineHeight: 1.05, letterSpacing: "-0.02em", margin: 0 }}
            >
              {data?.title || "Today's commentary"}
            </h1>
            {data?.date && (
              <p style={{ color: FAINT_GREEN, fontSize: 14, fontFamily: SPACE_GROTESK, margin: 0 }}>
                {data.date}
              </p>
            )}
          </div>
        ) : isStreak ? (
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", textAlign: "center", gap: 14, maxWidth: 460, margin: "0 auto",
            }}
          >
            <p style={{ color: FAINT_GREEN, fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
              🦩 Kept
            </p>
            <p
              className="title-glow-breathe"
              style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(52px, 12vw, 92px)", lineHeight: 1, letterSpacing: "-0.03em", margin: 0 }}
            >
              {streak?.current ?? 0}
            </p>
            <p style={{ color: WARM_TEXT, fontSize: 17, fontFamily: SPACE_GROTESK, margin: 0 }}>
              {(streak?.current ?? 0) === 1
                ? "day of the Dean’s Commentary"
                : "days of the Dean’s Commentary, in a row"}
            </p>
            {/* Weekends are stepped over, not counted as misses — say so, or a
                reader who reads every weekday will think the number is wrong. */}
            <p style={{ color: FAINT_GREEN, fontSize: 13, lineHeight: 1.6, fontFamily: SPACE_GROTESK, margin: "2px 0 0" }}>
              {(streak?.totalDays ?? 0) > 0
                ? `${streak?.totalDays} day${(streak?.totalDays ?? 0) === 1 ? "" : "s"} read in all. It comes out on weekdays, so weekends don’t break the streak.`
                : "It comes out on weekdays, so weekends don’t break the streak."}
            </p>
          </div>
        ) : (
          <p style={{ color: WARM_TEXT, fontSize: 19, lineHeight: 1.75, fontFamily: SPACE_GROTESK, whiteSpace: "pre-line", margin: 0, textAlign: "left" }}>
            {paragraphs[paraIndex]}
          </p>
        )}
      </div>

      {/* Bottom nav pill — Back · position · Next/Done. Same floating pill
          the office uses (bcp-daily-office.tsx), not a plain text readout —
          owner: "there isn't a nav bar at the bottom." */}
      {total > 0 && (
        <nav
          aria-label="Reading navigation"
          style={{
            position: "fixed",
            left: "50%",
            bottom: "calc(env(safe-area-inset-bottom) + 16px)",
            transform: "translateX(-50%)",
            zIndex: 50,
            background: "rgba(var(--ot-deep, 9,26,16), 0.297)",
            backdropFilter: "blur(11.34px)",
            WebkitBackdropFilter: "blur(11.34px)",
            border: `1px solid ${BORDER}`,
            borderRadius: 999,
            padding: "8px 12px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          <div className="flex items-center gap-4" style={{ minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={prev}
              disabled={atStart}
              className="rounded-full transition-opacity disabled:opacity-20"
              style={{
                color: WARM_TEXT,
                background: "transparent",
                border: `1px solid ${BORDER}`,
                padding: "6px 14px",
                fontSize: 12,
                fontFamily: SPACE_GROTESK,
                fontWeight: 600,
                cursor: atStart ? "default" : "pointer",
              }}
            >
              Back
            </button>
            {!isTitle && total > 1 && (
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  margin: 0,
                  whiteSpace: "nowrap",
                  flex: "0 0 auto",
                }}
              >
                {paraIndex + 1} of {total}
              </p>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-full transition-opacity"
              style={{
                background: BUTTON_BG,
                color: WARM_TEXT,
                border: "none",
                padding: "6px 16px",
                fontSize: 12,
                fontFamily: SPACE_GROTESK,
                fontWeight: 600,
                letterSpacing: "0.02em",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {isTitle ? "Begin" : atEnd ? "Done" : "Next"}
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
