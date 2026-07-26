import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { openExternal } from "@/lib/openExternal";
import { FDD_TODAY_URL, recordFddOpened } from "@/lib/cacReadState";
import { PracticeIntro } from "@/components/PracticeIntro";
import { hasSeenIntro, markIntroSeen } from "@/lib/practiceIntros";

// ── /reflect/fdd — Forward Day by Day companion ─────────────────────────────
//
// The in-app companion page for today's Forward Day by Day reflection —
// the same shape as the CAC companion (reflect-cac.tsx): a "read the
// reflection" button + the shared community-thoughts surface. Like every
// daily-reflection ("newsletter"), it returns to the home screen when done.
//
// (Was a guided sit built on ContemplationTimer — audio read-aloud + a
// silence timer. That meditation-timer flow is gone: opening FDD now lands
// here, not on a timer.)

type FddToday = {
  title: string | null;
};

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CTA = "#2D5E3F";

export default function FddSitPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const today = new Date().toLocaleDateString("en-CA");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data } = useQuery<FddToday>({
    queryKey: ["/api/podcast/forward-day-by-day/today"],
    queryFn: () => apiRequest("GET", "/api/podcast/forward-day-by-day/today"),
    enabled: !!user,
    staleTime: 30 * 60_000,
  });
  // First-ever visit gets a one-card intro to what Forward Day by Day IS, so a
  // beginner isn't handed a bare reflection link unguided.
  const [introDismissed, setIntroDismissed] = useState(false);

  if (authLoading || !user) return null;

  if (!introDismissed && !hasSeenIntro("fdd")) {
    const dismiss = () => { markIntroSeen("fdd"); setIntroDismissed(true); };
    return <PracticeIntro intro="fdd" onBegin={dismiss} onSkip={dismiss} />;
  }

  const eyebrow = { color: SAGE_DIM, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT };
  const label = t("fdd_sit.eyebrow", { defaultValue: "Forward Day by Day" });

  const readReflection = () => {
    recordFddOpened();
    // { reader: true } — matches every other FDD entry point (same fix as
    // reflect-cac.tsx/reflection-read.tsx: without it this opens through a
    // separate native browser surface with its own cookie storage).
    openExternal(FDD_TODAY_URL, { reader: true });
  };

  return (
    <Layout>
      <div style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "4px 2px 28px", fontFamily: FONT }}>
        <p style={{ ...eyebrow, margin: "4px 0 2px" }}>{label}</p>
        <h1 style={{ color: WARM, fontSize: 23, fontWeight: 700, fontFamily: FONT, margin: "0 0 14px", lineHeight: 1.25 }}>
          {data?.title || t("fdd_sit.reflect_title_fallback", { defaultValue: "Today's reflection" })}
        </h1>

        <button
          type="button"
          onClick={readReflection}
          style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: CTA, color: WARM, border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
        >
          {t("fdd_sit.read", { defaultValue: "Read the reflection →" })}
        </button>

        <div style={{ marginTop: 26 }}>
        </div>

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
