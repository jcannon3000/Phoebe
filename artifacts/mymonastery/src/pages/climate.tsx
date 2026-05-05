import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function ClimatePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user && !user.climateEnrolled) {
      setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation]);

  const { data } = useQuery<{ feed: { id: number; slug: string; title: string; tagline: string | null; coverEmoji: string | null; state: string; subscriberCount: number } }>({
    queryKey: ["/api/climate/feed"],
    queryFn: () => apiRequest("GET", "/api/climate/feed"),
    enabled: !!user?.climateEnrolled,
  });

  if (isLoading || !user?.climateEnrolled) return null;

  return (
    <div className="flex flex-col gap-6 pt-2">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="text-4xl">🌿</div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6", letterSpacing: "-0.03em" }}>
          Phoebe Climate
        </h1>
        <p className="text-sm" style={{ color: "#8FAF96" }}>Daily prayer for creation</p>
      </div>

      {/* Feed card */}
      {data?.feed && (
        <div className="rounded-2xl px-5 py-4" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.2)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(200,212,192,0.4)" }}>Feed</p>
          <p className="font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{data.feed.title}</p>
          {data.feed.tagline && <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>{data.feed.tagline}</p>}
        </div>
      )}

      {/* Placeholder */}
      <div className="rounded-2xl px-5 py-6 text-center" style={{ background: "rgba(200,212,192,0.04)", border: "1px dashed rgba(46,107,64,0.2)" }}>
        <p className="text-sm" style={{ color: "#8FAF96" }}>Daily prayers coming soon.</p>
        <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.5)" }}>Check back tomorrow.</p>
      </div>
    </div>
  );
}
