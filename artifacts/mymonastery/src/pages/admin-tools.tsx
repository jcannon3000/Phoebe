import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus, useCommunityAdminToggle } from "@/hooks/useDemo";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ChevronRight } from "lucide-react";

function Toggle({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-colors text-left"
      style={{ background: "rgba(200,212,192,0.05)", border: "1px solid rgba(46,107,64,0.18)" }}
    >
      <div>
        <p className="text-sm font-medium" style={{ color: "#E8E4D8" }}>{label}</p>
        <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>{description}</p>
      </div>
      <div
        className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ml-4 ${enabled ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}
      >
        <div
          className={`absolute top-[3px] w-[14px] h-[14px] rounded-full shadow-sm transition-transform ${enabled ? "left-[18px]" : "left-[3px]"}`}
          style={{ background: "#F0EDE6" }}
        />
      </div>
    </button>
  );
}

function LinkRow({
  emoji,
  label,
  description,
  onClick,
}: {
  emoji: string;
  label: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-colors text-left"
      style={{ background: "rgba(200,212,192,0.05)", border: "1px solid rgba(46,107,64,0.18)" }}
      onMouseEnter={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.08)"; }}
      onMouseLeave={e => { (e.currentTarget).style.background = "rgba(200,212,192,0.05)"; }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl leading-none">{emoji}</span>
        <div>
          <p className="text-sm font-medium" style={{ color: "#E8E4D8" }}>{label}</p>
          {description && (
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>{description}</p>
          )}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: "rgba(200,212,192,0.3)" }} />
    </button>
  );
}

export default function AdminToolsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { rawIsBeta, rawIsAdmin: isAdmin, betaViewEnabled, toggleBetaView } = useBetaStatus();
  const [communityAdminView, toggleCommunityAdminView] = useCommunityAdminToggle();

  const { data: groupsData } = useQuery<{
    groups: Array<{ id: number; name: string; slug: string; myRole: string }>;
  }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });

  const { data: myFeedsData } = useQuery<{ feeds: Array<{ slug: string }> }>({
    queryKey: ["/api/prayer-feeds/mine"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/mine"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const myFeeds = myFeedsData?.feeds ?? [];

  const isCommunityAdmin = (groupsData?.groups ?? []).some(
    g => g.myRole === "admin" || g.myRole === "hidden_admin",
  );

  const showToggles = rawIsBeta || isCommunityAdmin;
  const showFeeds = myFeeds.length > 0;

  return (
    <Layout>
      <div
        className="min-h-screen px-4 pt-8 pb-24"
        style={{ maxWidth: 560, margin: "0 auto" }}
      >
        {/* Header */}
        <div className="mb-8">
          <p
            className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2"
            style={{ color: "rgba(143,175,150,0.5)" }}
          >
            Admin
          </p>
          <h1
            className="text-2xl font-semibold"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Admin Tools
          </h1>
        </div>

        {/* View toggles */}
        {showToggles && (
          <section className="mb-6">
            <p
              className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-3 px-1"
              style={{ color: "rgba(143,175,150,0.45)" }}
            >
              View
            </p>
            <div className="space-y-2">
              {rawIsBeta && (
                <Toggle
                  label={`Pilot view ${betaViewEnabled ? "on" : "off"}`}
                  description={betaViewEnabled ? "Seeing pilot features." : "Previewing regular user view."}
                  enabled={betaViewEnabled}
                  onToggle={toggleBetaView}
                />
              )}
              {isCommunityAdmin && (
                <Toggle
                  label={`Community admin ${communityAdminView ? "on" : "off"}`}
                  description={communityAdminView ? "Seeing admin tools." : "Viewing as a member."}
                  enabled={communityAdminView}
                  onToggle={toggleCommunityAdminView}
                />
              )}
            </div>
          </section>
        )}

        {/* Tools */}
        <section className="mb-6">
          <p
            className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-3 px-1"
            style={{ color: "rgba(143,175,150,0.45)" }}
          >
            Tools
          </p>
          <div className="space-y-2">
            {showFeeds && (
              <LinkRow
                emoji="🕊️"
                label="Manage Prayer Feeds"
                description={myFeeds.length === 1 ? "Edit your prayer feed" : `${myFeeds.length} feeds`}
                onClick={() => setLocation(
                  myFeeds.length === 1
                    ? `/prayer-feeds/${myFeeds[0].slug}/manage`
                    : "/prayer-feeds",
                )}
              />
            )}
            <LinkRow
              emoji="💬"
              label="Feedback"
              description="View submitted feedback"
              onClick={() => setLocation("/feedback")}
            />
            {isAdmin && (
              <>
                <LinkRow
                  emoji="📊"
                  label="User metrics"
                  description="Every user's engagement at a glance"
                  onClick={() => setLocation("/admin/users")}
                />
                <LinkRow
                  emoji="📨"
                  label="Newsletter"
                  description="Email Phoebe users"
                  onClick={() => setLocation("/admin/newsletter")}
                />
                <LinkRow
                  emoji="🔐"
                  label="Pilot Users"
                  description="Manage beta access"
                  onClick={() => setLocation("/beta")}
                />
                <LinkRow
                  emoji="📜"
                  label="Waitlist"
                  description="Review sign-up requests"
                  onClick={() => setLocation("/waitlist")}
                />
                <LinkRow
                  emoji="🚩"
                  label="Reports"
                  description="Engagement metrics"
                  onClick={() => setLocation("/admin/reports")}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
