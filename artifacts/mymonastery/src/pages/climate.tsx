import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { useBetaStatus } from "@/hooks/useDemo";
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

interface Walk {
  id: number;
  title: string | null;
  content: string;
  eventAt: string;
  location: string | null;
  groupName: string;
  groupSlug: string;
  groupEmoji: string | null;
}

interface WalksResponse {
  walks: Walk[];
}

function formatWalkDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
      {!user ? <ClimateSignup /> : !user.climateEnrolled ? <ClimateJoin /> : <ClimateTab />}
    </Layout>
  );
}

// Existing Phoebe user who hasn't joined Climate yet — one-tap opt-in.
// Symmetric with the unauth signup form: anyone with the URL can join.
// climate_only stays false for these users, so their regular Phoebe
// drawer is preserved and Phoebe Climate is added as an extra surface.
function ClimateJoin() {
  const queryClient = useQueryClient();
  const joinMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/climate/enroll-self"),
    onSuccess: () => {
      // Refetching /api/auth/me flips climateEnrolled true, which the
      // dispatcher above reads to surface the onboarding flow next.
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  return (
    <div className="flex flex-col gap-8 pt-2 max-w-md mx-auto w-full">
      <div className="flex flex-col gap-2 text-center">
        <div className="text-5xl">🌿</div>
        <h1
          className="text-3xl font-bold"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: "#F0EDE6",
            letterSpacing: "-0.03em",
          }}
        >
          Phoebe Climate
        </h1>
        <p className="text-sm" style={{ color: "#8FAF96" }}>
          A daily prayer for creation, sent every morning.
        </p>
      </div>

      <div
        className="rounded-2xl px-5 py-5"
        style={{
          background: "rgba(46,107,64,0.10)",
          border: "1px solid rgba(46,107,64,0.18)",
        }}
      >
        <p
          className="text-sm leading-relaxed italic"
          style={{ color: "#C8D4C0", fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          Pray for the climate with us. One short prayer each morning at 7am —
          joined by people across parishes and traditions.
        </p>
      </div>

      <button
        onClick={() => joinMutation.mutate()}
        disabled={joinMutation.isPending}
        className="w-full py-3.5 rounded-full text-sm font-semibold tracking-wide transition-opacity hover:opacity-80 active:scale-[0.99] disabled:opacity-50"
        style={{
          background: "#2D5E3F",
          color: "#F0EDE6",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        {joinMutation.isPending ? "Joining…" : "Join Phoebe Climate"}
      </button>

      <p className="text-[11px] text-center" style={{ color: "rgba(143,175,150,0.5)" }}>
        You'll receive a daily prayer notification at 7am. Your existing Phoebe
        experience is unchanged.
      </p>
    </div>
  );
}

// The daily-prayer tab itself — what an enrolled user sees when they land
// on /climate. Pulls today's entry, surfaces it inline with a Pray button,
// and opens the slideshow modal on tap. Also lists upcoming prayer walks.
function ClimateTab() {
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const { rawIsAdmin } = useBetaStatus();
  const { user } = useAuth();

  const { data, isLoading: todayLoading } = useQuery<TodayResponse>({
    queryKey: ["/api/climate/today"],
    queryFn: () => apiRequest("GET", "/api/climate/today"),
  });

  const { data: walksData } = useQuery<WalksResponse>({
    queryKey: ["/api/climate/walks"],
    queryFn: () => apiRequest("GET", "/api/climate/walks"),
  });

  const entry = data?.entry ?? null;
  const prayedToday = data?.prayedToday ?? false;
  const dayLocal = data?.dayLocal ?? "";
  const walks = walksData?.walks ?? [];

  return (
    <div className="flex flex-col gap-6 pt-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
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

        {rawIsAdmin && (
          <Link
            href="/climate/admin"
            className="text-xs font-semibold whitespace-nowrap pt-2"
            style={{ color: "#A8C5A0" }}
          >
            Curate →
          </Link>
        )}
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

      {/* Parish hint. Quiet link — surfaces the picker without making
          unparished feel like a problem. Hidden once a parish is set
          (the per-parish counter on the closing slide is the affordance
          that the connection is doing something). */}
      {user && user.parishId === null && (
        <Link
          href="/climate/parish"
          className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          style={{
            background: "rgba(46,107,64,0.08)",
            border: "1px solid rgba(46,107,64,0.18)",
          }}
        >
          <div>
            <p
              className="text-sm font-semibold"
              style={{
                color: "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Connect to a parish
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
              See how many people from your parish prayed today.
            </p>
          </div>
          <span style={{ color: "rgba(200,212,192,0.4)" }}>→</span>
        </Link>
      )}

      {/* Upcoming prayer walks — only render the section when there's
          something to show, no empty state spam. */}
      {walks.length > 0 && (
        <div className="flex flex-col gap-2.5 mt-2">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "rgba(200,212,192,0.4)" }}
          >
            Upcoming prayer walks
          </p>
          {walks.map((w) => (
            <div
              key={w.id}
              className="rounded-2xl px-4 py-3.5"
              style={{
                background: "rgba(46,107,64,0.08)",
                border: "1px solid rgba(46,107,64,0.18)",
              }}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-lg leading-tight pt-0.5">
                  {w.groupEmoji ?? "🚶🏽"}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-semibold leading-snug"
                    style={{
                      color: "#F0EDE6",
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    {w.title ?? "Prayer walk"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                    {formatWalkDate(w.eventAt)}
                    {w.location ? ` · ${w.location}` : ""}
                  </p>
                  <p
                    className="text-[11px] mt-1"
                    style={{ color: "rgba(143,175,150,0.6)" }}
                  >
                    Hosted by {w.groupName}
                  </p>
                </div>
              </div>
            </div>
          ))}
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
