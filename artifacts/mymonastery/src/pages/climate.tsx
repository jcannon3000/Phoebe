import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { ClimateSlideshow } from "@/components/ClimateSlideshow";
import { ClimateSignup } from "@/components/ClimateSignup";
import { ClimateOnboarding } from "@/components/ClimateOnboarding";

interface TodayResponse {
  entry: {
    id: number;
    title: string;
    body: string;
    scriptureRef: string | null;
  } | null;
  prayedToday: boolean;
  dayLocal: string;
  globalCount: number;
  parish: { name: string; count: number } | null;
}

// /climate dispatches by auth + enrollment + onboarding state:
//   • Unauthenticated → ClimateSignup (creates a climate-enrolled account)
//   • Authenticated, not enrolled → ClimateInviteOnly
//   • Authenticated, enrolled, NOT climate-onboarded → ClimateOnboarding
//     (full-screen overlay, no Layout — first-run experience)
//   • Authenticated, enrolled, climate-onboarded → ClimateTab
export default function ClimatePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Layout><div /></Layout>;
  }

  // Onboarding is a full-screen overlay — render outside Layout so
  // the Phoebe header doesn't compete with the intro experience.
  if (user && user.climateEnrolled && !user.climateOnboardingCompleted) {
    return <ClimateOnboarding />;
  }

  return (
    <Layout>
      {!user ? <ClimateSignup /> : !user.climateEnrolled ? <ClimateInviteOnly /> : <ClimateTab />}
    </Layout>
  );
}

// Authenticated Phoebe user who isn't enrolled in Climate. We don't want
// the silent-redirect-to-/dashboard behavior here — landing on /climate
// is intentional, and explaining why they don't see anything beats
// teleporting them away.
function ClimateInviteOnly() {
  return (
    <div className="flex flex-col gap-6 pt-2 max-w-md mx-auto w-full text-center">
      <div className="flex flex-col gap-1 items-center">
        <div className="text-4xl">🌿</div>
        <h1
          className="text-2xl font-bold"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: "#F0EDE6",
            letterSpacing: "-0.03em",
          }}
        >
          Phoebe Climate
        </h1>
      </div>

      <div
        className="rounded-2xl px-5 py-6"
        style={{
          background: "rgba(200,212,192,0.04)",
          border: "1px dashed rgba(46,107,64,0.2)",
        }}
      >
        <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
          Phoebe Climate is invite-only right now. If you'd like to join, reach
          out through Water &amp; Wilderness DC.
        </p>
      </div>

      <Link
        href="/dashboard"
        className="text-sm font-semibold"
        style={{ color: "#A8C5A0" }}
      >
        ← Back to Phoebe
      </Link>
    </div>
  );
}

// The daily-prayer tab itself — what an enrolled user sees when they land
// on /climate. Pulls today's entry, surfaces it inline with a Pray button,
// and opens the slideshow modal on tap.
function ClimateTab() {
  const [slideshowOpen, setSlideshowOpen] = useState(false);

  const { data, isLoading: todayLoading } = useQuery<TodayResponse>({
    queryKey: ["/api/climate/today"],
    queryFn: () => apiRequest("GET", "/api/climate/today"),
  });

  const entry = data?.entry ?? null;
  const prayedToday = data?.prayedToday ?? false;
  const dayLocal = data?.dayLocal ?? "";

  return (
    <div className="flex flex-col gap-6 pt-2">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="text-4xl">🌿</div>
        <h1
          className="text-2xl font-bold"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: "#F0EDE6",
            letterSpacing: "-0.03em",
          }}
        >
          Phoebe Climate
        </h1>
        <p className="text-sm" style={{ color: "#8FAF96" }}>
          Daily prayer for creation
        </p>
      </div>

      {/* Today's entry — primary content */}
      {todayLoading ? (
        <div
          className="rounded-2xl px-5 py-8 text-center"
          style={{ background: "rgba(200,212,192,0.04)", border: "1px solid rgba(46,107,64,0.15)" }}
        >
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.5)" }}>Loading…</p>
        </div>
      ) : entry ? (
        <div className="flex flex-col gap-4">
          <div
            className="rounded-2xl px-5 py-5"
            style={{
              background: "rgba(46,107,64,0.12)",
              border: "1px solid rgba(46,107,64,0.2)",
            }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "rgba(200,212,192,0.4)" }}
            >
              Today
            </p>
            <h2
              className="text-lg font-semibold leading-snug mb-2"
              style={{
                color: "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
                letterSpacing: "-0.01em",
              }}
            >
              {entry.title}
            </h2>
            <p
              className="text-sm leading-relaxed line-clamp-3 italic"
              style={{
                color: "#C8D4C0",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
            >
              {entry.body}
            </p>
            {entry.scriptureRef && (
              <p
                className="text-[11px] tracking-wide mt-3"
                style={{ color: "rgba(143,175,150,0.5)" }}
              >
                {entry.scriptureRef}
              </p>
            )}
          </div>

          <button
            onClick={() => setSlideshowOpen(true)}
            className="w-full py-3.5 rounded-full text-sm font-semibold tracking-wide transition-opacity hover:opacity-80 active:scale-[0.99]"
            style={{
              background: "#2D5E3F",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {prayedToday ? "Pray again" : "Pray"}
          </button>

          {prayedToday && (
            <p
              className="text-xs text-center"
              style={{ color: "rgba(143,175,150,0.6)" }}
            >
              ✓ You prayed today
            </p>
          )}
        </div>
      ) : (
        <div
          className="rounded-2xl px-5 py-8 text-center"
          style={{
            background: "rgba(200,212,192,0.04)",
            border: "1px dashed rgba(46,107,64,0.2)",
          }}
        >
          <p className="text-sm" style={{ color: "#8FAF96" }}>No prayer for today yet.</p>
          <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.5)" }}>Check back soon.</p>
        </div>
      )}

      {/* Slideshow modal */}
      {slideshowOpen && entry && (
        <ClimateSlideshow
          entry={entry}
          dayLocal={dayLocal}
          alreadyPrayed={prayedToday}
          globalCount={data?.globalCount ?? 0}
          parish={data?.parish ?? null}
          onClose={() => setSlideshowOpen(false)}
        />
      )}
    </div>
  );
}
