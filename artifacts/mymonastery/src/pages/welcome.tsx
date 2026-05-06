import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";

// Post-signup picker. Two paths:
//   • Join Phoebe Climate (one-tap, no approval — flips climate_enrolled
//     true server-side, lands the user on /climate)
//   • Browse communities (approval required — admin accepts the request,
//     user gets pushed when they're in)
//
// Skippable. The "I'll explore on my own" link lands the user on the
// regular dashboard. They can come back via the drawer or their own
// navigation. We don't gate anything else on completing this picker —
// it's a friendly nudge, not a wall.
export default function WelcomePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  const joinClimate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/climate/enroll-self"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/climate");
    },
  });

  if (isLoading || !user) return null;

  return (
    <Layout>
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
            Welcome to Phoebe.
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Pick a place to start. You can always change later.
          </p>
        </div>

        {/* Path A — Climate. One-tap, no approval. */}
        <button
          onClick={() => joinClimate.mutate()}
          disabled={joinClimate.isPending}
          className="text-left rounded-2xl px-5 py-5 transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
          style={{
            background: "rgba(46,107,64,0.14)",
            border: "1px solid rgba(46,107,64,0.3)",
          }}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">🌿</span>
            <div className="min-w-0">
              <p
                className="text-base font-semibold"
                style={{
                  color: "#F0EDE6",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                Phoebe Climate
              </p>
              <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
                A daily prayer for the climate. Sent every morning, joined by
                people across parishes.
              </p>
              <p
                className="text-xs mt-2 font-semibold"
                style={{ color: "#A8C5A0" }}
              >
                {joinClimate.isPending ? "Joining…" : "Join →"}
              </p>
            </div>
          </div>
        </button>

        {/* Path B — Community. Request to join, admin approves. */}
        <Link
          href="/communities/browse"
          className="block text-left rounded-2xl px-5 py-5 transition-opacity hover:opacity-90"
          style={{
            background: "rgba(46,107,64,0.08)",
            border: "1px solid rgba(46,107,64,0.18)",
          }}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">🤝🏽</span>
            <div className="min-w-0">
              <p
                className="text-base font-semibold"
                style={{
                  color: "#F0EDE6",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                Find a community
              </p>
              <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
                Browse parishes and groups on Phoebe. Request to join one and
                a leader will let you in.
              </p>
              <p
                className="text-xs mt-2 font-semibold"
                style={{ color: "#A8C5A0" }}
              >
                Browse →
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard"
          className="text-xs text-center mt-2"
          style={{ color: "rgba(143,175,150,0.65)" }}
        >
          I'll explore on my own
        </Link>
      </div>
    </Layout>
  );
}
