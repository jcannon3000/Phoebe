import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
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
    const closeSpan = () => {
      const o = openedAtRef.current;
      if (o === null) return;
      const elapsed = (Date.now() - o) / 1000;
      if (elapsed > 0) accumulatedRef.current += elapsed;
      openedAtRef.current = null;
    };
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
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", commit);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", commit);
      commit();
    };
  }, []);

  const watch = () => {
    const url = ncmpMeta?.url ?? CHANNEL_LIVE_URL;
    // Close any still-open span (re-tap) before starting a new one.
    const prev = openedAtRef.current;
    if (prev !== null) accumulatedRef.current += (Date.now() - prev) / 1000;
    if (!startedAtRef.current) startedAtRef.current = new Date();
    openedAtRef.current = Date.now();
    // Call synchronously inside the click handler to preserve the iOS
    // user-gesture context the popup blocker enforces (see openExternal).
    openExternal(url);
  };

  const poster = ncmpMeta?.videoId
    ? `https://i.ytimg.com/vi/${ncmpMeta.videoId}/hqdefault.jpg`
    : null;

  return (
    <div
      style={{
        minHeight: "100dvh",
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
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          style={{ justifySelf: "start", background: "none", border: "none", color: PALETTE.sage, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}
        >
          ← {t("common.back")}
        </button>
        <span
          className="rounded-full"
          style={{ background: PALETTE.cardBg, border: `1px solid ${PALETTE.border}`, color: PALETTE.warm, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", padding: "6px 14px", whiteSpace: "nowrap" }}
        >
          📺 {t("ncmp.title")}
        </span>
        <span style={{ justifySelf: "end" }} />
      </header>

      <main style={{ flex: 1, padding: "12px 16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
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
            {t("ncmp.opens_in_browser", { defaultValue: "Opens in your browser" })}
          </p>
        </div>

        {/* Context blurb + today's title. */}
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
