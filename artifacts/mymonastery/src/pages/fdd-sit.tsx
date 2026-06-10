import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import ReflectionThoughts from "@/components/ReflectionThoughts";
import { ContemplationTimer } from "@/components/ContemplationTimer";

// ── /reflect/fdd — Forward Day by Day, then sit ─────────────────────────
//
// One continuous contemplative experience: today's Forward Day by Day —
// the reflection read aloud, from the FDD podcast — opens the sit, then
// flows seamlessly into a silent meditation timer over the same screen.
// The user sets ONE length for the whole thing and the full duration is
// logged as contemplation time, so listening and sitting read as a single
// experience with no visible "flip."
//
// Built on ContemplationTimer (its gradient backdrop, closing bell,
// keep-awake, and contemplation prayer-session logging) via the optional
// audio layer it now accepts.
//
// Audio-only by design: FDD's written meditation is Forward Movement's
// copyrighted text with no clean public feed, so we play their public
// podcast (the same reflection, read aloud) rather than reproduce the
// text. The episode title is today's date.

type FddToday = {
  feedTitle: string | null;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  // Skip-marks computed server-side (Whisper + detection). When present,
  // playback starts at the scripture reading and stops at the donation
  // appeal so the intro + outro are skipped. Absent → play the whole thing.
  scriptureStartSec?: number | null;
  appealStartSec?: number | null;
};

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

function Splash({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <div
      style={{
        minHeight: "100dvh", background: BG, color: "#F0EDE6", fontFamily: FONT,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 24, textAlign: "center",
      }}
    >
      <p style={{ color: SAGE, fontSize: 14, lineHeight: 1.5, maxWidth: 320, margin: 0 }}>{text}</p>
      <button
        type="button"
        onClick={onBack}
        style={{ marginTop: 20, background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}
      >
        ← Back
      </button>
    </div>
  );
}

export default function FddSitPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  // After the sit, the page flips from the timer to a reflection screen
  // (like CAC's companion page) rather than dropping back to the dashboard
  // / Contemplation timer. Local day so the thoughts are keyed to today.
  const [reflecting, setReflecting] = useState(false);
  const today = new Date().toLocaleDateString("en-CA");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data, isLoading, isError } = useQuery<FddToday>({
    queryKey: ["/api/podcast/forward-day-by-day/today"],
    queryFn: () => apiRequest("GET", "/api/podcast/forward-day-by-day/today"),
    enabled: !!user,
    staleTime: 30 * 60_000,
    // Opening the page triggers the skip-mark computation on demand. Poll a
    // few times while marks are still null so a user sitting on the picker
    // gets the intro/outro skip once it lands (begin() reads the latest data).
    // Stops as soon as the marks arrive (or there's no audio to skip).
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d?.audioUrl) return false;
      return d.scriptureStartSec == null ? 6000 : false;
    },
  });

  if (authLoading || !user) return null;

  // Gate on the audio so the timer's Begin always has it ready — that's
  // what makes the open→listen transition feel instant, not buffered.
  if (isLoading) {
    return <Splash text={t("fdd_sit.preparing", { defaultValue: "Preparing today's reflection…" })} onBack={() => setLocation("/dashboard")} />;
  }
  if (isError || !data?.audioUrl) {
    return <Splash text={t("fdd_sit.error", { defaultValue: "Couldn't load today's Forward Day by Day. Please try again in a little while." })} onBack={() => setLocation("/dashboard")} />;
  }

  const label = t("fdd_sit.eyebrow", { defaultValue: "Forward Day by Day" });
  const audioTitle = data.title ? `${label} · ${data.title}` : label;

  // Post-sit reflection — mirrors the CAC companion page (eyebrow + title +
  // the shared community-thoughts surface). Reached when the sit's closing
  // bell rings, so the experience ends on "what stayed with you?" instead
  // of bouncing back to the Contemplation timer.
  if (reflecting) {
    return (
      <Layout>
        <div style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "4px 2px 28px", fontFamily: FONT }}>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT, margin: "4px 0 2px" }}>
            {label}
          </p>
          <h1 style={{ color: WARM, fontSize: 23, fontWeight: 700, fontFamily: FONT, margin: "0 0 6px", lineHeight: 1.25 }}>
            {data.title || t("fdd_sit.reflect_title_fallback", { defaultValue: "Today's reflection" })}
          </h1>
          <p style={{ color: SAGE, fontSize: 13.5, fontFamily: FONT, margin: "0 0 22px", lineHeight: 1.5 }}>
            {t("fdd_sit.reflect_intro", { defaultValue: "You've kept the silence. What stayed with you?" })}
          </p>
          <ReflectionThoughts source="fdd" day={today} />
          <button
            type="button"
            onClick={() => setLocation("/dashboard")}
            style={{ display: "block", margin: "28px auto 0", background: "none", border: "none", color: SAGE_DIM, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}
          >
            {t("fdd_sit.done", { defaultValue: "Done" })}
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <ContemplationTimer
      open
      audioUrl={data.audioUrl}
      audioTitle={audioTitle}
      eyebrowLabel={label}
      // Pass the episode length so the picker shows it and lets the user
      // choose how much silence to add after the reflection ends, rather
      // than picking a total time blind (and potentially cutting the audio
      // short). begin() is called inside the Begin button's onClick, which
      // satisfies iOS's user-gesture requirement for audio.play().
      audioDurationSeconds={data.durationSeconds}
      audioStartSec={data.scriptureStartSec ?? null}
      audioEndSec={data.appealStartSec ?? null}
      // On the closing bell, flip to the reflection screen instead of the
      // dashboard. A bail-out before the bell (completed === false) still
      // just goes home.
      onClose={(result) => {
        if (result?.completed) setReflecting(true);
        else setLocation("/dashboard");
      }}
    />
  );
}
