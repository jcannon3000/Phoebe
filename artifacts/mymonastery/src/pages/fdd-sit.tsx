import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
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
};

const BG = "#0C1F12";
const SAGE = "#8FAF96";
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

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data, isLoading, isError } = useQuery<FddToday>({
    queryKey: ["/api/podcast/forward-day-by-day/today"],
    queryFn: () => apiRequest("GET", "/api/podcast/forward-day-by-day/today"),
    enabled: !!user,
    staleTime: 30 * 60_000,
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

  return (
    <ContemplationTimer
      open
      audioUrl={data.audioUrl}
      audioTitle={audioTitle}
      eyebrowLabel={label}
      onClose={() => setLocation("/dashboard")}
    />
  );
}
