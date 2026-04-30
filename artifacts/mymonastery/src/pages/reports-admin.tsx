import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// Admin-only moderation queue for content reports. Required by App
// Store Guideline 1.2 — alongside the in-app Report path on each
// person profile, we need an operator-facing surface that turns
// "users can flag" into "and someone acts within 24 hours."
//
// Backend (routes/reports.ts) gates GET /api/reports on
// beta_users.is_admin so non-admins get 403. The UI also gates the
// nav link in the drawer menu (layout.tsx) on the same flag.

type Report = {
  id: number;
  kind: "user" | "prayer_request" | "prayer_word" | "letter";
  targetId: number;
  reason: string | null;
  status: "open" | "reviewed" | "dismissed";
  createdAt: string | null;
  reviewedAt: string | null;
  reporterUserId: number;
  reporterName: string | null;
  reporterEmail: string | null;
  target: { name: string; email: string } | null;
};

function StatusPill({ status }: { status: Report["status"] }) {
  const palette = {
    open: { bg: "rgba(194,92,92,0.18)", color: "#E89A8A", border: "rgba(194,92,92,0.35)" },
    reviewed: { bg: "rgba(46,107,64,0.18)", color: "#A8C5A0", border: "rgba(46,107,64,0.35)" },
    dismissed: { bg: "rgba(143,175,150,0.10)", color: "#8FAF96", border: "rgba(143,175,150,0.20)" },
  }[status];
  return (
    <span
      className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest"
      style={{ background: palette.bg, color: palette.color, border: `1px solid ${palette.border}` }}
    >
      {status}
    </span>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const dMs = Date.now() - t;
  if (dMs < 60_000) return "just now";
  if (dMs < 3_600_000) return `${Math.round(dMs / 60_000)}m ago`;
  if (dMs < 86_400_000) return `${Math.round(dMs / 3_600_000)}h ago`;
  return `${Math.round(dMs / 86_400_000)}d ago`;
}

export default function ReportsAdminPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin } = useBetaStatus();
  const queryClient = useQueryClient();

  // Same gate as /beta and /waitlist — bounce non-admins to dashboard.
  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!authLoading && user && !isAdmin) setLocation("/dashboard");
  }, [authLoading, user, isAdmin, setLocation]);

  const { data, isLoading } = useQuery<{ reports: Report[] }>({
    queryKey: ["/api/reports"],
    queryFn: () => apiRequest("GET", "/api/reports"),
    enabled: !!user && isAdmin,
    refetchInterval: 30_000,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "reviewed" | "dismissed" | "open" }) =>
      apiRequest("PATCH", `/api/reports/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    },
  });

  if (authLoading || !user || !isAdmin) return null;

  const reports = data?.reports ?? [];
  const open = reports.filter(r => r.status === "open");
  const closed = reports.filter(r => r.status !== "open");

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-5 pt-6 pb-12">
        <h1
          className="text-2xl font-semibold mb-2"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Reports
        </h1>
        <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
          User-flagged content. We commit to acting on every report within 24 hours.
        </p>

        {isLoading ? (
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.55)" }}>Loading…</p>
        ) : reports.length === 0 ? (
          <div
            className="rounded-xl px-5 py-8 text-center"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.18)" }}
          >
            <p className="text-sm" style={{ color: "#8FAF96" }}>No reports yet. The queue is empty.</p>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <section className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-base font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    Open ({open.length})
                  </h2>
                  <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
                </div>
                <div className="space-y-2">
                  {open.map(r => (
                    <ReportCard key={r.id} report={r} onAction={(status) => setStatus.mutate({ id: r.id, status })} />
                  ))}
                </div>
              </section>
            )}
            {closed.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-base font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    Closed ({closed.length})
                  </h2>
                  <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
                </div>
                <div className="space-y-2">
                  {closed.map(r => (
                    <ReportCard key={r.id} report={r} onAction={(status) => setStatus.mutate({ id: r.id, status })} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function ReportCard({ report, onAction }: { report: Report; onAction: (s: "reviewed" | "dismissed" | "open") => void }) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: "rgba(46,107,64,0.08)",
        border: `1px solid ${report.status === "open" ? "rgba(194,92,92,0.25)" : "rgba(46,107,64,0.18)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.55)" }}>
              {report.kind === "user" ? "User report" : `${report.kind} report`}
            </p>
            <StatusPill status={report.status} />
          </div>
          {report.kind === "user" && report.target ? (
            <p className="text-sm font-medium" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              <Link href={`/people/${encodeURIComponent(report.target.email)}`}>
                <a style={{ color: "#F0EDE6" }} className="hover:underline">
                  {report.target.name || report.target.email}
                </a>
              </Link>
            </p>
          ) : (
            <p className="text-sm font-medium" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              {report.kind} #{report.targetId}
            </p>
          )}
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
            Reported by {report.reporterName || report.reporterEmail || "Unknown"} · {formatRelative(report.createdAt)}
          </p>
        </div>
      </div>
      {report.reason && (
        <p
          className="text-sm leading-relaxed mb-3"
          style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif", whiteSpace: "pre-wrap" }}
        >
          “{report.reason}”
        </p>
      )}
      <div className="flex gap-2">
        {report.status === "open" ? (
          <>
            <button
              onClick={() => onAction("reviewed")}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: "rgba(46,107,64,0.18)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
            >
              Mark reviewed
            </button>
            <button
              onClick={() => onAction("dismissed")}
              className="flex-1 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: "rgba(143,175,150,0.05)", color: "#8FAF96", border: "1px solid rgba(143,175,150,0.18)" }}
            >
              Dismiss
            </button>
          </>
        ) : (
          <button
            onClick={() => onAction("open")}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-80"
            style={{ background: "rgba(143,175,150,0.05)", color: "#8FAF96", border: "1px solid rgba(143,175,150,0.18)" }}
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}
