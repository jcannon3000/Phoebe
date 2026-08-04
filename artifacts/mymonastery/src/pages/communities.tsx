import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Search } from "lucide-react";

type Group = {
  id: number; name: string; slug: string; description: string | null;
  emoji: string | null; memberCount: number; myRole: string; createdAt: string;
};

export default function CommunitiesPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: groupsData } = useQuery<{ groups: Group[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  const { rawIsAdmin: isBuilder } = useBetaStatus();

  if (isLoading || !user) return null;

  const groups = groupsData?.groups ?? [];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/dashboard" className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70" style={{ color: "#8FAF96" }}>
            {t("communities.back_dashboard")}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("communities.title")} 🏘️
              </h1>
              <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
                {t("communities.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Always reachable — not just when you have zero communities.
                  This was previously only offered inside the empty state, so
                  anyone who'd already joined one had no way to find another. */}
              <Link href="/communities/browse">
                <span className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold"
                  style={{ background: "transparent", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.4)" }}>
                  <Search size={14} /> {t("communities.browse_communities", { defaultValue: "Browse" })}
                </span>
              </Link>
              {isBuilder && (
                <Link href="/communities/new">
                  <span className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                    <Plus size={14} /> {t("communities.new")}
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        {groups.length === 0 ? (
          <div
            className="rounded-2xl px-6 py-10 text-center"
            style={{
              background: "rgba(200,212,192,0.04)",
              border: "1px dashed rgba(46,107,64,0.3)",
            }}
          >
            <div className="text-5xl mb-4">🏘️</div>
            <p className="text-lg font-semibold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              {t("communities.empty_title")}
            </p>
            <p className="text-sm mb-5" style={{ color: "#8FAF96" }}>
              {isBuilder ? t("communities.empty_builder") : t("communities.empty_member")}
            </p>
            <div className="flex flex-col items-center gap-3">
              {isBuilder && (
                <Link href="/communities/new">
                  <span className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm font-semibold"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                    <Plus size={16} /> {t("communities.create_community")}
                  </span>
                </Link>
              )}
              {/* Everyone gets a way to find existing communities — without this
                  a member with no groups hit a pure dead end. */}
              <Link href="/communities/browse">
                <span className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm font-semibold"
                  style={isBuilder
                    ? { background: "transparent", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.4)" }
                    : { background: "#2D5E3F", color: "#F0EDE6" }}>
                  {t("communities.browse_communities", { defaultValue: "Browse communities" })} →
                </span>
              </Link>
            </div>
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
                      {t("menu.members", { count: g.memberCount })}
                      {g.myRole === "admin" && ` · ${t("communities.admin")}`}
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
