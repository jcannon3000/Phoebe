import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { Plus } from "lucide-react";

type Group = {
  id: number; name: string; slug: string; description: string | null;
  emoji: string | null; memberCount: number; myRole: string; createdAt: string;
};

export default function CommunitiesPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { isBeta: communitiesEnabled, isLoading: betaLoading } = useBetaStatus();

  const { data: groupsData } = useQuery<{ groups: Group[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user && communitiesEnabled,
  });

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  const groups = groupsData?.groups ?? [];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/dashboard" className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70" style={{ color: "#8FAF96" }}>
            ← Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Communities 🏘️
              </h1>
              <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
                Parishes, groups, and places that carry each other.
              </p>
            </div>
            {communitiesEnabled && (
              <Link href="/communities/new">
                <span className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                  <Plus size={14} /> New
                </span>
              </Link>
            )}
          </div>
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        {!communitiesEnabled ? (
          <div
            className="rounded-2xl px-6 py-10 text-center"
            style={{
              background: "rgba(200,212,192,0.04)",
              border: "1px dashed rgba(46,107,64,0.3)",
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
              <Link href="/moment/new">
                <span className="text-xs font-semibold" style={{ color: "#A8C5A0" }}>
                  Start a practice →
                </span>
              </Link>
              <Link href="/tradition/new">
                <span className="text-xs font-semibold" style={{ color: "#A8C5A0" }}>
                  Start a gathering →
                </span>
              </Link>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div
            className="rounded-2xl px-6 py-10 text-center"
            style={{
              background: "rgba(200,212,192,0.04)",
              border: "1px dashed rgba(46,107,64,0.3)",
            }}
          >
            <div className="text-5xl mb-4">🏘️</div>
            <p className="text-lg font-semibold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              No communities yet
            </p>
            <p className="text-sm mb-5" style={{ color: "#8FAF96" }}>
              Create your first community to get started.
            </p>
            <Link href="/communities/new">
              <span className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                <Plus size={16} /> Create a Community
              </span>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map(g => (
              <Link key={g.slug} href={`/communities/${g.slug}`} className="block">
                <div className="flex items-center justify-between px-4 py-3.5 rounded-xl transition-colors"
                  style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.25)" }}>
                  {g.emoji && <span className="text-2xl shrink-0 mr-3">{g.emoji}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{g.name}</p>
                    {g.description && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: "#8FAF96" }}>{g.description}</p>
                    )}
                    <p className="text-[10px] mt-1" style={{ color: "rgba(143,175,150,0.5)" }}>
                      {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                      {g.myRole === "admin" && " · admin"}
                    </p>
                  </div>
                  <span className="text-sm shrink-0 ml-3" style={{ color: "rgba(200,212,192,0.3)" }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
