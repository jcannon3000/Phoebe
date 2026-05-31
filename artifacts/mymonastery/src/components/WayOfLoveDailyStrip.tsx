/**
 * WayOfLoveDailyStrip — the beta Way of Love presence on the daily home.
 *
 * After splitting the Way of Love into a daily home + a weekly page, this is
 * the compact strip that lives at the top of the production home for beta
 * users: the Turn fire streak (the consistency spine — fed by ALL engagement,
 * daily AND weekly; tap → the Turn detail) and a "This week — N of 4" doorway
 * into the weekly page. Self-contained + beta-gated, so it drops onto the
 * dashboard with a one-line render and is invisible to everyone else.
 *
 * Reads the same stores as the rest of the Way of Love — no new tracking.
 */

import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { useTranslation } from "react-i18next";
import { computeTurnConsistency, engagementDays, type EngagementOfficeDay } from "@/lib/turnConsistency";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.28)";

type CompletionRow = { section: string; localDate: string; weekStart: string };

function pad(n: number): string { return String(n).padStart(2, "0"); }
function ymd(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sundayStart(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }

const WEEKLY = ["worship", "bless", "go", "rest"];

export function WayOfLoveDailyStrip() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { rawIsBeta } = useBetaStatus();
  const { t } = useTranslation();
  const thisWeekStart = ymd(sundayStart(new Date()));

  const compQ = useQuery<{ completions: CompletionRow[] }>({
    queryKey: ["/api/practice-completion"],
    queryFn: () => apiRequest("GET", "/api/practice-completion"),
    enabled: !!user && rawIsBeta,
    staleTime: 15_000,
  });
  const officeQ = useQuery<{ days: EngagementOfficeDay[] }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    enabled: !!user && rawIsBeta,
    staleTime: 30_000,
  });
  // This week's Bless cycle — drives the gentle end-of-week review nudge.
  const blessQ = useQuery<{ intentions: unknown[]; reviewedAt: string | null }>({
    queryKey: ["/api/bless", thisWeekStart],
    queryFn: () => apiRequest("GET", `/api/bless?weekStart=${thisWeekStart}`),
    enabled: !!user && rawIsBeta,
    staleTime: 60_000,
  });

  if (!user || !rawIsBeta) return null;

  const rows = compQ.data?.completions ?? [];
  const turn = computeTurnConsistency(engagementDays(rows.map((r) => r.localDate), officeQ.data?.days ?? []));
  const weekDone = WEEKLY.filter((k) => rows.some((r) => r.section === k && r.weekStart === thisWeekStart)).length;
  // Fri–Sun, when there are intentions set but the week isn't reviewed yet, the
  // "This week" doorway becomes a gentle review nudge (the bell/push nudge is
  // separate). Never forced — it's an invitation.
  const dow = new Date().getDay();
  const needsReview = (dow === 5 || dow === 6 || dow === 0)
    && (blessQ.data?.intentions?.length ?? 0) > 0
    && !blessQ.data?.reviewedAt;

  return (
    <div style={{ display: "flex", gap: 10, margin: "18px 0 14px" }}>
      {/* Turn fire streak → Turn detail */}
      <button
        type="button"
        onClick={() => setLocation("/home-beta/turn")}
        style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "10px 14px", cursor: "pointer" }}
      >
        <span style={{ fontSize: 18 }} aria-hidden>🔥</span>
        <div style={{ textAlign: "left" }}>
          <p style={{ color: WARM, fontSize: 16, fontWeight: 700, fontFamily: FONT, margin: 0, lineHeight: 1 }}>{turn.currentRunDays}</p>
          <p style={{ color: SAGE_DIM, fontSize: 10.5, fontFamily: FONT, margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {t("week.turn_streak", { defaultValue: "day streak" })}
          </p>
        </div>
      </button>

      {/* This week → weekly page (becomes a review nudge near week's end) */}
      <button
        type="button"
        onClick={() => setLocation("/this-week")}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, background: needsReview ? "rgba(46,107,64,0.24)" : CARD, border: `1px solid ${needsReview ? "rgba(168,197,160,0.5)" : CARD_B}`, borderRadius: 14, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: 18 }} aria-hidden>{needsReview ? "🌿" : "🗓️"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: WARM, fontSize: 14, fontWeight: 600, fontFamily: FONT, margin: 0 }}>
            {needsReview ? t("week.review_nudge", { defaultValue: "Review this week" }) : t("week.eyebrow", { defaultValue: "This week" })}
          </p>
          <p style={{ color: SAGE, fontSize: 11.5, fontFamily: FONT, margin: "2px 0 0" }}>
            {needsReview
              ? t("week.review_nudge_sub", { defaultValue: "Look back, carry over, set next week" })
              : t("week.strip_status", { defaultValue: "{{done}} of {{total}} practices", done: weekDone, total: WEEKLY.length })}
          </p>
        </div>
        <span style={{ color: SAGE_DIM, fontSize: 16, flexShrink: 0 }}>›</span>
      </button>
    </div>
  );
}
