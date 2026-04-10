import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";

export default function CommunitiesPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/dashboard" className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70" style={{ color: "#8FAF96" }}>
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Communities 🏘️
          </h1>
          <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
            Parishes, groups, and places that carry each other.
          </p>
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        <div
          className="rounded-2xl px-6 py-10 text-center"
          style={{
            background: "rgba(200,212,192,0.04)",
            border: "1px dashed rgba(200,212,192,0.2)",
          }}
        >
          <div className="text-5xl mb-5">🌱</div>
          <p className="text-lg font-semibold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Communities are coming soon
          </p>
          <p className="text-sm max-w-md mx-auto leading-relaxed" style={{ color: "#8FAF96" }}>
            Shared prayer, gatherings, and letters for your parish or group — a place where a whole community can keep showing up together.
          </p>
          <p className="text-xs italic mt-6" style={{ color: "rgba(143,175,150,0.55)" }}>
            In the meantime, start a gathering or a practice with the people you already walk with.
          </p>
          <div className="flex justify-center gap-4 mt-5">
            <Link href="/tradition/new">
              <span className="text-xs font-semibold" style={{ color: "#A8C5A0" }}>
                Start a gathering →
              </span>
            </Link>
            <Link href="/moment/new">
              <span className="text-xs font-semibold" style={{ color: "#A8C5A0" }}>
                Start a practice →
              </span>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
