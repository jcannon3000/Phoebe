import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { PrayerSection } from "@/components/prayer-section";
import { apiRequest } from "@/lib/queryClient";

type Moment = {
  id: number;
  name: string;
  templateType: string | null;
  intention: string;
  intercessionTopic?: string | null;
  intercessionFullText?: string | null;
  intercessionSource?: string | null;
  members: Array<{ name: string; email: string }>;
  todayPostCount: number;
  windowOpen: boolean;
  myUserToken: string | null;
  momentToken: string | null;
  commitmentSessionsGoal?: number | null;
  commitmentSessionsLogged?: number | null;
  computedSessionsLogged?: number;
  goalDays?: number | null;
  myLastPostAt?: string | null;
};

// Render "Last prayed" for the prayer-list card in the same register as
// the rest of the page — terse, lowercase, reassuring. Anything newer
// than 60 seconds reads as "just now". Days are floored so a post from
// 26 hours ago reads "yesterday", not "today".
function formatLastPrayed(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return null;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Last prayed just now";
  if (minutes < 60) return `Last prayed ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last prayed ${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Last prayed yesterday";
  if (days < 7) return `Last prayed ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `Last prayed ${weeks} wk${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `Last prayed ${months} mo${months === 1 ? "" : "s"} ago`;
}

export default function PrayerListPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: momentsData } = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  const intercessions = (momentsData?.moments ?? []).filter(
    (m) => m.templateType === "intercession",
  );

  const hasUnprayedToday = intercessions.some(
    (m) => m.windowOpen && m.todayPostCount === 0,
  );

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6">
          <h1
            className="text-2xl font-bold"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Prayer List 🙏🏽
          </h1>
          <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
            Carrying what your community is carrying.
          </p>
        </div>

        {/* Begin Prayer button */}
        <div className="mb-8 flex flex-col items-start gap-2">
          {hasUnprayedToday && (
            <p className="text-xs italic" style={{ color: "rgba(143,175,150,0.6)" }}>
              You haven't prayed today.
            </p>
          )}
          <button
            onClick={() => setLocation("/prayer-mode")}
            className="px-6 py-3 rounded-xl text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{
              background: "#2D5E3F",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
              boxShadow: "0 2px 16px rgba(46,107,64,0.25)",
            }}
          >
            Begin Prayer 🙏🏽
          </button>
        </div>

        {/* Active intercessions */}
        {intercessions.length > 0 && (
          <div className="mb-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: "#C8D4C0" }}>
              Your Intercessions
            </p>
            <div className="space-y-2">
              {intercessions.map((m) => {
                const otherMembers = m.members
                  .filter((p) => p.email !== user.email)
                  .map((p) => p.name || p.email.split("@")[0])
                  .slice(0, 3)
                  .join(", ");
                const goal = m.commitmentSessionsGoal ?? (m.goalDays && m.goalDays > 0 && m.goalDays < 365 ? m.goalDays : null);
                const logged = m.computedSessionsLogged ?? (m.commitmentSessionsLogged ?? 0);
                const progressLabel = goal ? `${logged}/${goal} days` : null;
                const href = (m.windowOpen && m.momentToken && m.myUserToken)
                  ? `/moment/${m.momentToken}/${m.myUserToken}?from=prayer-list`
                  : `/moments/${m.id}`;
                const prayedToday = m.todayPostCount > 0;
                const lastPrayedLabel = formatLastPrayed(m.myLastPostAt);

                // Card title: topic (BCP) → intention (custom) → fallback name.
                // For custom intercessions, `intention` is what the user typed
                // as "who are you praying for?" and is the right label.
                // Strip trailing emoji so we don't double-up with the 🙏🏽 prefix.
                const stripEmoji = (s: string) =>
                  // eslint-disable-next-line no-misleading-character-class
                  s.replace(/[\s\u200d]*(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component})+$/u, "").trim();
                const cardTitle = stripEmoji(m.intercessionTopic || m.intention || m.name);
                const fullPrayer = m.intercessionFullText?.trim() || null;

                return (
                  <Link key={m.id} href={href} className="block">
                    <div
                      className="relative flex rounded-xl overflow-hidden"
                      style={{
                        background: "rgba(46,107,64,0.15)",
                        border: `1px solid ${m.windowOpen && !prayedToday ? "rgba(46,107,64,0.5)" : "rgba(46,107,64,0.25)"}`,
                      }}
                    >
                      <div className="w-1 flex-shrink-0" style={{ background: "#2E6B40" }} />
                      <div className="flex-1 px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>
                            🙏🏽 {cardTitle}
                          </span>
                          {progressLabel && (
                            <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
                              {progressLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          {otherMembers ? (
                            <p className="text-xs truncate" style={{ color: "#8FAF96" }}>with {otherMembers}</p>
                          ) : (
                            <span />
                          )}
                          {m.windowOpen && !prayedToday && (
                            <span className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                              Pray now
                            </span>
                          )}
                          {prayedToday && (
                            <span className="text-xs" style={{ color: "#8FAF96" }}>Prayed today 🌿</span>
                          )}
                        </div>
                        {fullPrayer && (
                          <p
                            className="text-[13px] italic mt-2 leading-[1.55]"
                            style={{
                              color: "#C8D4C0",
                              fontFamily: "Playfair Display, Georgia, serif",
                            }}
                          >
                            {fullPrayer}
                          </p>
                        )}
                        {lastPrayedLabel && (
                          <p
                            className="text-[11px] mt-1"
                            style={{ color: "rgba(143,175,150,0.55)", fontStyle: "italic" }}
                          >
                            {lastPrayedLabel}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        <PrayerSection />
      </div>
    </Layout>
  );
}
