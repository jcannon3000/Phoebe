import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { ClimateSignup } from "@/components/ClimateSignup";
import { ClimateOnboarding } from "@/components/ClimateOnboarding";

// /climate is now a thin entry point. Once a user is enrolled and through
// onboarding, they use the regular Phoebe dashboard + prayer-mode for
// daily prayer — feed-scoped intercessions land in /api/moments via
// reconcileFeedPracticeMembers, the same plumbing groups use. The
// dispatcher below only handles the first-touch states (signup, opt-in,
// onboarding) and otherwise sends the user home.
//
// Dispatch by auth + enrollment + onboarding state:
//   • Unauthenticated → ClimateSignup (creates a climate-enrolled account)
//   • Authenticated, not enrolled → ClimateJoin (one-tap opt-in)
//   • Authenticated, enrolled, NOT onboarded → ClimateOnboarding
//   • Authenticated, enrolled, onboarded → redirect to /dashboard
export default function ClimatePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (user && user.climateEnrolled && user.climateOnboardingCompleted) {
      setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return <Layout><div /></Layout>;
  }

  if (user && user.climateEnrolled && !user.climateOnboardingCompleted) {
    // Onboarding is a full-screen overlay — render outside Layout so
    // the Phoebe header doesn't compete with the intro experience.
    return <ClimateOnboarding />;
  }

  // Already enrolled + onboarded — useEffect above will redirect to
  // /dashboard. Render an empty layout while the redirect fires.
  if (user && user.climateEnrolled && user.climateOnboardingCompleted) {
    return <Layout><div /></Layout>;
  }

  return (
    <Layout>
      {!user ? <ClimateSignup /> : <ClimateJoin />}
    </Layout>
  );
}

// Existing Phoebe user who hasn't joined Climate yet — one-tap opt-in.
// climate_only stays false for these users, so their regular Phoebe
// drawer is preserved and Phoebe Climate is added on top.
function ClimateJoin() {
  const queryClient = useQueryClient();
  const joinMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/climate/enroll-self"),
    onSuccess: () => {
      // /api/auth/me drives the dispatcher above — flipping
      // climateEnrolled true surfaces the onboarding flow next.
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
