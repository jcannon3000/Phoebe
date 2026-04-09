import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { PrayerSection } from "@/components/prayer-section";
import { PrayerMode } from "@/components/PrayerMode";
import { apiRequest } from "@/lib/queryClient";

type Moment = {
  id: number;
  name: string;
  templateType: string | null;
  intention: string;
  intercessionTopic?: string | null;
  members: Array<{ name: string; email: string }>;
  todayPostCount: number;
  windowOpen: boolean;
  myUserToken: string | null;
  momentToken: string | null;
  commitmentSessionsGoal?: number | null;
  commitmentSessionsLogged?: number | null;
  goalDays?: number | null;
};

interface PrayerRequest {
  id: number;
  body: string;
  ownerName: string | null;
  isOwnRequest: boolean;
  isAnswered: boolean;
}

export default function PrayerListPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [prayerModeOpen, setPrayerModeOpen] = useState(false);
  // Track locally which intercessions were prayed in this session
  const [prayedIds, setPrayedIds] = useState<Set<number>>(new Set());

  const { data: momentsData } = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
  });

  const { data: prayerRequests = [] } = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
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
    (m) => m.windowOpen && m.todayPostCount === 0 && !prayedIds.has(m.id),
  );

  const handlePrayerComplete = async () => {
    // Log a check-in for each open, unprayed intercession using the existing post endpoint
    const unprayed = intercessions.filter(
      (m) => m.windowOpen && m.todayPostCount === 0 && m.momentToken && m.myUserToken,
    );
    await Promise.allSettled(
      unprayed.map((m) =>
        apiRequest("POST", `/api/moment/${m.momentToken}/${m.myUserToken}/post`, {
          loggingType: "checkin",
        }),
      ),
    );
    setPrayedIds(new Set(unprayed.map((m) => m.id)));
    queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
    setPrayerModeOpen(false);
    setLocation("/dashboard");
  };

  return (
    <>
      {prayerModeOpen && (
        <PrayerMode
          intercessions={intercessions.map((m) => ({
            intention: m.intercessionTopic || m.intention || m.name,
            withName: m.members
              .filter((p) => p.email !== user.email)
              .map((p) => p.name || p.email.split("@")[0])
              .slice(0, 3)
              .join(", "),
          }))}
          prayerRequests={prayerRequests
            .filter((r) => !r.isAnswered)
            .map((r) => ({
              body: r.body,
              fromName: r.ownerName ?? "",
            }))}
          onClose={() => setPrayerModeOpen(false)}
          onComplete={handlePrayerComplete}
        />
      )}

      <Layout>
        <div className="max-w-2xl mx-auto w-full">
          {/* Header */}
          <div className="mb-6">
            <h1
              className="text-2xl font-bold"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Prayer List 🙏
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
              onClick={() => setPrayerModeOpen(true)}
              className="px-6 py-3 rounded-xl text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{
                background: "#2D5E3F",
                color: "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
                boxShadow: "0 2px 16px rgba(46,107,64,0.25)",
              }}
            >
              Begin Prayer 🙏
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
                  const logged = m.commitmentSessionsLogged ?? 0;
                  const progressLabel = goal ? `${logged}/${goal} days` : null;
                  const href = (m.windowOpen && m.momentToken && m.myUserToken)
                    ? `/moment/${m.momentToken}/${m.myUserToken}`
                    : `/moments/${m.id}`;
                  const prayedInSession = prayedIds.has(m.id);
                  const prayedToday = m.todayPostCount > 0 || prayedInSession;

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
                              🙏 {m.intercessionTopic || m.name}
                            </span>
                            {progressLabel && (
                              <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
                                {progressLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            {otherMembers && (
                              <p className="text-xs" style={{ color: "#8FAF96" }}>with {otherMembers}</p>
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
    </>
  );
}
