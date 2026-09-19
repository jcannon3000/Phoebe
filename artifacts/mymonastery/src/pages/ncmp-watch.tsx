import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { canEmbedVideoHere, isInReaderWatch, openVideoInReader } from "@/lib/videoEmbed";
import { useTranslation } from "react-i18next";

// ── /ncmp/watch — National Cathedral Morning Prayer ──
//
// Opens the broadcast in the system browser (SFSafariViewController via
// openExternal on iOS; a new tab on web) instead of an inline iframe.
// YouTube's player rejects the embed inside the app's WKWebView ("Error
// 153 — Video player configuration error" — it won't initialize from the
// app's local origin), so a real browser context is the reliable way to
// actually watch. This page is a Phoebe-framed launcher: a poster you tap
// to open the broadcast.
//
// Prayer-session log / Morning-Prayer credit:
//   Without an in-app player we can't measure in-iframe watch time, so we
//   credit based on time spent away watching. Tapping Watch records the
//   open time; coming back to Phoebe closes that span into an accumulator;
//   leaving the page commits one national-cathedral prayer-session with
//   the total. >=180s still counts as Morning Prayer (dashboard flag + the
//   server gate in users.ts).

const PALETTE = {
  bg: "#091A10",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
  border: "rgba(120,80,180,0.40)",
  cardBg: "rgba(120,80,180,0.14)",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CHANNEL_LIVE_URL = "https://www.youtube.com/@WashingtonNationalCathedral/live";

// Watching for at least this long counts as having prayed Morning Prayer
// (home-screen "prayed today" + the end-of-office rhythm slide). Mirrors
// the server gate in users.ts.
const MORNING_PRAYER_CREDIT_SECONDS = 180;

type NcmpMeta = {
  url: string;
  videoId: string | null;
  title: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
};

export default function NcmpWatchPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const { data: ncmpMeta, isLoading } = useQuery<NcmpMeta>({
    queryKey: ["/api/ncmp/today-meta"],
    queryFn: () => apiRequest("GET", "/api/ncmp/today-meta"),
    staleTime: 60 * 60_000,
  });

  // ── Watch-time credit via time-away-watching ──
  const startedAtRef = useRef<Date | null>(null);   // first Watch tap
  const openedAtRef = useRef<number | null>(null);   // browser opened at (ms)
  const accumulatedRef = useRef(0);                  // total watched seconds
  const committedRef = useRef(false);

  useEffect(() => {
    const closeSpan = endWatchSpan;
    // Commit exactly one row for this visit. Guarded so unmount + pagehide
    // can both call it without double-posting.
    const commit = () => {
      if (committedRef.current) return;
      closeSpan();
      const total = Math.round(accumulatedRef.current);
      const startedAt = startedAtRef.current;
      if (total <= 0 || !startedAt) return;
      committedRef.current = true;
      apiRequest("POST", "/api/prayer-sessions", {
        surface: "national-cathedral",
        durationSeconds: total,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
      }).catch(() => { /* best-effort */ });
      // Watched long enough to count as Morning Prayer — stamp the local
      // office-completed flag so the dashboard + rhythm slide reflect it
      // before the server history refetches.
      if (total >= MORNING_PRAYER_CREDIT_SECONDS) {
        try {
          const now = new Date();
          const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          localStorage.setItem(`phoebe:office-completed:morning:${dateKey}`, "1");
        } catch { /* private mode / quota — non-fatal */ }
      }
    };
    // Returning from the browser sheet makes the page visible again (and
    // backgrounding the whole app mid-watch fires this too) — close the
    // open watch span so the time counts.
    const onVisibility = () => {
      if (document.visibilityState === "visible") closeSpan();
    };
    /**
     * THE READER'S DISMISS IS THE ONLY SIGNAL THAT ACTUALLY ARRIVES on iOS.
     * The in-app reader is presented .overFullScreen, so this web view never
     * leaves the window and never gets a hidden/visible pair — the span above
     * stayed open from the tap until the page unmounted. Someone who watched
     * 20 seconds and then read the page for three minutes had all of it
     * counted, and Morning Prayer was stamped on the strength of it (audit,
     * 2026-09-18). The native side has always dispatched this on dismiss;
     * nothing listened.
     */
    const onBrowserFinished = () => closeSpan();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("phoebe:browserfinished", onBrowserFinished);
    window.addEventListener("pagehide", commit);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("phoebe:browserfinished", onBrowserFinished);
      window.removeEventListener("pagehide", commit);
      commit();
    };
  }, []);

  /**
   * A WATCH SPAN is the stretch we count as watched. Inline, the player opens
   * one when the video starts playing and closes it on pause, stall or end —
   * real watch time, which the old hand-off could only approximate by timing
   * how long the person was away (the note at the top of this file). On the
   * hand-off path the span is still the time spent in the reader.
   */
  const beginWatchSpan = () => {
    const prev = openedAtRef.current;
    if (prev !== null) accumulatedRef.current += (Date.now() - prev) / 1000;
    if (!startedAtRef.current) startedAtRef.current = new Date();
    openedAtRef.current = Date.now();
  };
  const endWatchSpan = () => {
    const open = openedAtRef.current;
    if (open === null) return;
    accumulatedRef.current += (Date.now() - open) / 1000;
    openedAtRef.current = null;
  };

  /**
   * The hand-off, for the one platform that can't embed: open THIS page at
   * withphoebe.app in the in-app reader, where the origin is real and the
   * player works. It used to open YouTube's own page, which is what made
   * watching feel like leaving Phoebe.
   *
   * Called synchronously inside the click handler to keep the iOS user-gesture
   * context (see openExternal).
   */
  const watch = () => {
    beginWatchSpan();
    if (!openVideoInReader()) openExternal(ncmpMeta?.url ?? CHANNEL_LIVE_URL);
  };

  const videoId = ncmpMeta?.videoId ?? null;
  // Can a YouTube iframe initialise on this page at all? See lib/videoEmbed.
  const inlineVideo = canEmbedVideoHere();
  const poster = ncmpMeta?.videoId
    ? `https://i.ytimg.com/vi/${ncmpMeta.videoId}/hqdefault.jpg`
    : null;

  return (
    <div
      style={{
        minHeight: "var(--app-dvh)",
        background: PALETTE.bg,
        color: PALETTE.warm,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar — Back + centered title. */}
      <header
        style={{
          paddingTop: "max(1.25rem, calc(var(--safe-top) + 0.5rem))",
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 10,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
        }}
      >
        {isInReaderWatch() ? <span /> : (
        <button
            type="button"
            onClick={() => setLocation("/dashboard")}
            style={{ justifySelf: "start", background: "none", border: "none", color: PALETTE.sage, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            ← {t("common.back")}
          </button>
        )}
        <span
          className="rounded-full"
          style={{ background: PALETTE.cardBg, border: `1px solid ${PALETTE.border}`, color: PALETTE.warm, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", padding: "6px 14px", whiteSpace: "nowrap" }}
        >
          📺 {t("ncmp.title")}
        </span>
        <span style={{ justifySelf: "end" }} />
      </header>

      <main style={{ flex: 1, padding: "12px 16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* THE BROADCAST, INSIDE PHOEBE (owner, 2026-09-18: "bring in video
            content, like the video of the cathedral's evening prayer, morning
            prayer … even go full screen without it looking like you're leaving
            the app").

            Where YouTube will embed — the web, and the Android shell, whose
            origin is a real https://localhost — it plays right here in our own
            frame, and the ⤢ button fills the screen with it. Where it won't
            (the iOS shell's capacitor:// origin, which the player answers with
            "Error 153"), the poster hands this same page to the in-app reader,
            which loads real URLs. Neither path lands on YouTube's own page,
            which is what "watch" used to mean here. See lib/videoEmbed. */}
        {inlineVideo && videoId ? (
          <div style={{ width: "100%", maxWidth: 560, alignSelf: "center" }}>
            <YouTubePlayer
              videoId={videoId}
              autoplay={false}
              onPlaying={beginWatchSpan}
              onPaused={endWatchSpan}
              onEnded={endWatchSpan}
            />
          </div>
        ) : (
          <>
        {/* Tappable poster — opens the broadcast in the browser. */}
          <button
            type="button"
            onClick={watch}
            aria-label={t("ncmp.watch", { defaultValue: "Watch Morning Prayer" })}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 560,
              aspectRatio: "16 / 9",
              alignSelf: "center",
              background: poster ? `center / cover no-repeat url("${poster}")` : "#000",
              borderRadius: 16,
              overflow: "hidden",
              border: `1px solid ${PALETTE.border}`,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(9,26,16, 0.385)" }} />
            <span aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(240,237,230,0.95)", color: "#091A10", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, paddingLeft: 4 }}>
                ▶
              </span>
            </span>
          </button>
  
          {/* Explicit Watch button + "opens in browser" hint. */}
          <div style={{ width: "100%", maxWidth: 560, alignSelf: "center", textAlign: "center" }}>
            <button
              type="button"
              onClick={watch}
              style={{ background: PALETTE.cardBg, border: `1px solid ${PALETTE.border}`, color: PALETTE.warm, fontFamily: FONT, fontSize: 14, fontWeight: 600, borderRadius: 999, padding: "10px 22px", cursor: "pointer" }}
            >
              {isLoading ? t("ncmp.loading") : t("ncmp.watch", { defaultValue: "Watch Morning Prayer" })}
            </button>
            <p style={{ fontSize: 12, color: PALETTE.faint, margin: "8px 0 0" }}>
              {t("ncmp.opens_in_app", { defaultValue: "Opens full screen in Phoebe" })}
            </p>
          </div>
  
          {/* Context blurb + today's title. */}
        </>
        )}

        <div style={{ width: "100%", maxWidth: 560, alignSelf: "center" }}>
          <p style={{ fontSize: 13, color: PALETTE.warm, margin: 0, lineHeight: 1.5 }}>{t("ncmp.blurb")}</p>
          {ncmpMeta?.title && (
            <p style={{ fontSize: 12, color: PALETTE.sage, margin: "8px 0 0", fontStyle: "italic" }}>{ncmpMeta.title}</p>
          )}
        </div>
      </main>
    </div>
  );
}
