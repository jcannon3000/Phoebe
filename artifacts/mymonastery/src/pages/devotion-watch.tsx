import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { canEmbedVideoHere, isInReaderWatch, openVideoInReader } from "@/lib/videoEmbed";
import { useTranslation } from "react-i18next";

// ── /devotion/watch — Morning Devotion (St. John's Cathedral) ──
//
// The Morning-Devotion sibling of /ncmp/watch. St. John's Cathedral posts a
// daily weekday "Morning Devotion with Dean Kate" video to a public YouTube
// playlist; this is a Phoebe-framed launcher that opens today's video in the
// system browser (SFSafariViewController on iOS; a tab on web) — YouTube's
// player rejects the embed inside the app's WKWebView, so a real browser
// context is the reliable way to watch.
//
// Credit: without an in-app player we credit by time-away-watching, the same
// way NCMP does. Tapping Watch records the open time; returning closes the
// span into an accumulator; leaving the page commits. Watching >=180s counts
// as Morning Devotion — we POST a "morning-devotion" prayer-session (so the
// rhythm grid credits the morning office) and stamp the local office flag.
// Below 180s nothing is recorded (a brief peek doesn't count).

const PALETTE = {
  bg: "#091A10",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
  border: "rgba(46,107,64,0.42)",
  cardBg: "rgba(46,107,64,0.16)",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";
const PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLwOcNu4HOzu777pJge4KXVocRLLaNq0Eh";

// Watching at least this long counts as having prayed Morning Devotion.
const DEVOTION_CREDIT_SECONDS = 180;

type DevotionMeta = {
  url: string;
  videoId: string | null;
  title: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
};

export default function DevotionWatchPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const { data: meta, isLoading } = useQuery<DevotionMeta>({
    queryKey: ["/api/devotion-watch/today-meta"],
    queryFn: () => apiRequest("GET", "/api/devotion-watch/today-meta"),
    staleTime: 60 * 60_000,
  });

  // ── Watch-time credit via time-away-watching ──
  const startedAtRef = useRef<Date | null>(null);
  const openedAtRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const committedRef = useRef(false);

  useEffect(() => {
    const closeSpan = endWatchSpan;
    const commit = () => {
      if (committedRef.current) return;
      closeSpan();
      const total = Math.round(accumulatedRef.current);
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      // Only a real watch (>=180s) counts as Morning Devotion — the
      // "morning-devotion" surface credits the morning office unconditionally
      // server-side, so we don't post a brief peek.
      if (total < DEVOTION_CREDIT_SECONDS) return;
      committedRef.current = true;
      apiRequest("POST", "/api/prayer-sessions", {
        surface: "morning-devotion",
        durationSeconds: total,
        // A full (>=180s) watch is a deliberate "I prayed the devotion" act —
        // like the book attestation — so it counts as completed for the
        // office-history rollup (which now requires completed for offices).
        completed: true,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
      }).catch(() => { /* best-effort */ });
      try {
        const now = new Date();
        const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        localStorage.setItem(`phoebe:office-completed:morning-devotion:${dateKey}`, "1");
      } catch { /* private mode / quota — non-fatal */ }
    };
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
    // iOS: the reader is presented OVER the app (overFullScreen), so the app's
    // page is never hidden and never becomes "visible" again — the span stayed
    // open until this page was left, crediting minutes spent reading the page
    // afterwards (audit, 2026-09-18). The reader's own close event ends it.
    window.addEventListener("phoebe:browserfinished", closeSpan);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("phoebe:browserfinished", onBrowserFinished);
      window.removeEventListener("pagehide", commit);
      window.removeEventListener("phoebe:browserfinished", closeSpan);
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
    if (!openVideoInReader()) openExternal(meta?.url ?? PLAYLIST_URL);
  };

  const videoId = meta?.videoId ?? null;
  // Can a YouTube iframe initialise on this page at all? See lib/videoEmbed.
  const inlineVideo = canEmbedVideoHere();
  const poster = meta?.videoId
    ? `https://i.ytimg.com/vi/${meta.videoId}/hqdefault.jpg`
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
          🌿 {t("devotion_watch.title", { defaultValue: "Morning Devotion" })}
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
        <button
            type="button"
            onClick={watch}
            aria-label={t("devotion_watch.watch", { defaultValue: "Watch Morning Devotion" })}
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
  
          <div style={{ width: "100%", maxWidth: 560, alignSelf: "center", textAlign: "center" }}>
            <button
              type="button"
              onClick={watch}
              style={{ background: PALETTE.cardBg, border: `1px solid ${PALETTE.border}`, color: PALETTE.warm, fontFamily: FONT, fontSize: 14, fontWeight: 600, borderRadius: 999, padding: "10px 22px", cursor: "pointer" }}
            >
              {isLoading ? t("devotion_watch.loading", { defaultValue: "Loading…" }) : t("devotion_watch.watch", { defaultValue: "Watch Morning Devotion" })}
            </button>
            <p style={{ fontSize: 12, color: PALETTE.faint, margin: "8px 0 0" }}>
              {t("devotion_watch.opens_in_app", { defaultValue: "Opens full screen in Phoebe" })}
            </p>
          </div>
        </>
        )}

        <div style={{ width: "100%", maxWidth: 560, alignSelf: "center" }}>
          <p style={{ fontSize: 13, color: PALETTE.warm, margin: 0, lineHeight: 1.5 }}>{t("devotion_watch.blurb", { defaultValue: "Join Dean Kate for a daily morning devotion from St. John's Cathedral — scripture from the Daily Office, sacred art, and quiet prayer to begin the day. Watching counts toward your Morning Devotion." })}</p>
          {meta?.title && (
            <p style={{ fontSize: 12, color: PALETTE.sage, margin: "8px 0 0", fontStyle: "italic" }}>{meta.title}</p>
          )}
        </div>
      </main>
    </div>
  );
}
