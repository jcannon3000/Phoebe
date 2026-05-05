import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { ClimateSignup } from "@/components/ClimateSignup";
import { ClimateOnboarding } from "@/components/ClimateOnboarding";

// /climate dispatcher:
//   • Unauthenticated → ClimateSignup
//   • Authenticated, not enrolled → ClimateJoin
//   • Authenticated, enrolled, NOT onboarded → ClimateOnboarding
//   • Authenticated, enrolled, onboarded → ClimateHub (walks + link to
//     /dashboard for the daily prayer experience)
//
// Daily prayer happens on the regular /dashboard + /prayer-mode. /climate
// is the climate-specific identity surface — upcoming gatherings live here.
export default function ClimatePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Layout><div /></Layout>;
  }

  if (user && user.climateEnrolled && !user.climateOnboardingCompleted) {
    return <ClimateOnboarding />;
  }

  return (
    <Layout>
      {!user
        ? <ClimateSignup />
        : !user.climateEnrolled
          ? <ClimateJoin />
          : <ClimateHub />}
    </Layout>
  );
}

interface Walk {
  id: number;
  title: string | null;
  content: string;
  eventAt: string;
  location: string | null;
  hostName: string;
  hostSlug: string | null;
  hostEmoji: string;
}

interface WalksResponse {
  walks: Walk[];
}

function ClimateHub() {
  const { data } = useQuery<WalksResponse>({
    queryKey: ["/api/climate/walks"],
    queryFn: () => apiRequest("GET", "/api/climate/walks"),
  });
  const walks = data?.walks ?? [];

  return (
    <div className="flex flex-col gap-6 pt-2 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col gap-1 text-center">
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
          Daily prayer for the climate, with everyone subscribed.
        </p>
      </div>

      {/* Pray now → goes to the regular dashboard where today's
          intercessions live. The climate prayer experience is on
          /dashboard + /prayer-mode, same as for any Phoebe user. */}
      <Link
        href="/dashboard"
        className="w-full py-3.5 rounded-full text-sm font-semibold tracking-wide text-center transition-opacity hover:opacity-80 active:scale-[0.99]"
        style={{
          background: "#2D5E3F",
          color: "#F0EDE6",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        Pray now →
      </Link>

      {/* Upcoming prayer walks */}
      <div className="flex flex-col gap-2.5">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(200,212,192,0.4)" }}
        >
          Upcoming prayer walks
        </p>
        {walks.length === 0 ? (
          <div
            className="rounded-2xl px-5 py-6 text-center"
            style={{
              background: "rgba(200,212,192,0.04)",
              border: "1px dashed rgba(46,107,64,0.2)",
            }}
          >
            <p className="text-sm" style={{ color: "#8FAF96" }}>No walks scheduled.</p>
            <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.5)" }}>
              Check back soon.
            </p>
          </div>
        ) : (
          walks.map((w) => (
            <div
              key={w.id}
              className="rounded-2xl px-4 py-3.5"
              style={{
                background: "rgba(46,107,64,0.08)",
                border: "1px solid rgba(46,107,64,0.18)",
              }}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-lg leading-tight pt-0.5">{w.hostEmoji}</span>
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
                    {new Date(w.eventAt).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {w.location ? ` · ${w.location}` : ""}
                  </p>
                  {w.content && (
                    <p
                      className="text-xs mt-1.5 line-clamp-2"
                      style={{ color: "rgba(200,212,192,0.6)" }}
                    >
                      {w.content}
                    </p>
                  )}
                  <p
                    className="text-[11px] mt-2"
                    style={{ color: "rgba(143,175,150,0.5)" }}
                  >
                    Hosted by {w.hostName}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ClimateJoin() {
  const queryClient = useQueryClient();
  const joinMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/climate/enroll-self"),
    onSuccess: () => {
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
          joined by people across parishes.
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
