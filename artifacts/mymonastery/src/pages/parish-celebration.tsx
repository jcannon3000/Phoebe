/**
 * Phoebe Parish — celebration screen shown after a parish-only user
 * finishes an office or devotion.
 *
 * Two-line headline:
 *   • Big number: parishioners who prayed today (including the viewer)
 *   • Smaller line: "N from <parish> this week"
 *
 * Plus a top-down presence line — the parish LEADER named if they prayed
 * with you today (never other members by name/face) — and a "Done" button.
 *
 * Modeled on the existing prayer-mode closing slide, but parish-scoped.
 * The office viewer's handleEnd routes parish-only users here when the
 * Amen on the last slide fires.
 */

import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const GEORGIA = "Georgia, 'Times New Roman', serif";

interface Celebration {
  parish: { id: number; slug: string; title: string };
  prayedTodayCount: number;
  prayedWeekCount: number;
  // Top-down presence: the leader (priest) named ONLY when they prayed with you
  // today; fellow parishioners are never named/pictured to each other.
  leaderName: string | null;
  leaderAvatarUrl: string | null;
  surface: string | null;
}

export default function ParishCelebration() {
  const { user, isLoading: authLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // ?surface=… tells the server which liturgy just finished, so the
  // count can be scoped to e.g. just morning-prayer rather than all
  // surfaces. Falls through to aggregate when missing.
  const surfaceMatch = location.match(/[?&]surface=([^&]+)/);
  const surface = surfaceMatch ? decodeURIComponent(surfaceMatch[1]) : null;

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLocation("/"); return; }
  }, [user, authLoading, setLocation]);

  const query = useQuery<Celebration>({
    queryKey: ["/api/parish/celebration", surface],
    queryFn: () =>
      apiRequest("GET", `/api/parish/celebration${surface ? `?surface=${encodeURIComponent(surface)}` : ""}`),
    enabled: !!user,
  });

  if (authLoading || !user) return null;

  const data = query.data;
  const todayCount = data?.prayedTodayCount ?? 0;
  const weekCount = data?.prayedWeekCount ?? 0;

  return (
    <div
      style={{
        background: BG,
        minHeight: "100vh",
        color: WARM_TEXT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          maxWidth: 540,
          margin: "0 auto",
          padding: "calc(var(--safe-top) + 64px) 24px 24px",
          textAlign: "center",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 28,
        }}
      >
        {/* Eyebrow */}
        <p
          style={{
            fontFamily: SPACE_GROTESK,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: FAINT_GREEN,
            margin: 0,
          }}
        >
          {data?.parish?.title ? `From ${data.parish.title}` : "From your parish"}
        </p>

        {/* Big number */}
        <div>
          <p
            style={{
              fontFamily: SPACE_GROTESK,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(143,175,150,0.55)",
              margin: 0,
            }}
          >
            Prayed today
          </p>
          <p
            style={{
              fontFamily: SPACE_GROTESK,
              fontSize: 88,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              color: "#C8D4C0",
              margin: "8px 0 0",
            }}
          >
            {todayCount}
          </p>
          <p
            style={{
              fontFamily: SPACE_GROTESK,
              fontSize: 14,
              color: SAGE,
              margin: "6px 0 0",
            }}
          >
            {weekCount} {weekCount === 1 ? "person" : "people"} this week
          </p>
        </div>

        {/* Leader presence — the priest named when they prayed with you today.
            Deliberately the ONLY named person: fellow parishioners stay an
            anonymous count above, never faces shown to each other. */}
        {data?.leaderName && (
          <div className="flex items-center justify-center" style={{ gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: `2px solid ${BG}`,
                background: "#1A4A2E",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {data.leaderAvatarUrl ? (
                <img src={data.leaderAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ color: "#A8C5A0", fontSize: 12, fontWeight: 600, fontFamily: SPACE_GROTESK }}>
                  {data.leaderName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                </span>
              )}
            </div>
            <span style={{ fontFamily: SPACE_GROTESK, fontSize: 14, color: SAGE }}>
              You prayed with {data.leaderName} today
            </span>
          </div>
        )}

        {/* Italic blessing */}
        <p
          style={{
            fontFamily: GEORGIA,
            fontStyle: "italic",
            fontSize: 17,
            lineHeight: 1.5,
            color: "rgba(240,237,230,0.85)",
            maxWidth: 360,
            margin: 0,
          }}
        >
          You have prayed alongside your parish today. 🌿
        </p>
      </div>

      {/* Bottom action */}
      <div
        style={{
          padding: "0 20px calc(env(safe-area-inset-bottom) + 24px)",
          maxWidth: 540,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <Link href="/parish">
          <span
            style={{
              display: "block",
              background: "#3E7C7A",
              color: WARM_TEXT,
              fontFamily: SPACE_GROTESK,
              fontSize: 15,
              fontWeight: 600,
              padding: "14px 24px",
              borderRadius: 999,
              textAlign: "center",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            Done
          </span>
        </Link>
      </div>
    </div>
  );
}
