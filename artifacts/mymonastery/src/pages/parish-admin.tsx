/**
 * Phoebe Parish — admin metrics dashboard.
 *
 * Available to parish creators (clergy who set the parish up) AND to
 * Phoebe staff with beta_users.is_admin = true. Shows aggregate prayer
 * activity for the parish over a rolling window (7 / 30 / 90 days).
 *
 * Sections, top to bottom:
 *   1. Window picker (7 / 30 / 90)
 *   2. Top-line totals: sessions, distinct prayers, total time praying
 *   3. Per-liturgy breakdown — sessions + time spent on each office /
 *      devotion / slideshow
 *   4. Daily bar chart (sessions per day) over the window
 *
 * The whole page is read-only — programming the parish's daily
 * intercessions still goes through the existing /prayer-feeds/<slug>/
 * manage page.
 */

import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const BORDER = "rgba(200,212,192,0.15)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const GEORGIA = "Georgia, 'Times New Roman', serif";

interface ParishCard {
  id: number;
  slug: string;
  title: string;
  timezone: string;
  state: string;
  subscriberCount: number;
}

interface MetricsResponse {
  parish: { id: number; slug: string; title: string; timezone: string; subscriberCount: number };
  windowDays: number;
  totals: { sessions: number; distinctPrayers: number; totalSeconds: number };
  bySurface: Array<{ surface: string; sessions: number; distinctPrayers: number; totalSeconds: number }>;
  daily: Array<{ day: string; sessions: number; distinctPrayers: number; totalSeconds: number }>;
}

const SURFACE_LABEL: Record<string, string> = {
  "morning-prayer": "Morning Prayer",
  "evening-prayer": "Evening Prayer",
  "morning-devotion": "Morning Devotion",
  "early-evening-devotion": "Evening Devotion",
  slideshow: "Prayer List",
};

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function ParishAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [parishId, setParishId] = useState<number | null>(null);
  const [windowDays, setWindowDays] = useState<number>(7);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLocation("/"); return; }
  }, [user, authLoading, setLocation]);

  const parishesQuery = useQuery<{ parishes: ParishCard[]; isStaffAdmin: boolean }>({
    queryKey: ["/api/parish/admin/parishes"],
    queryFn: () => apiRequest("GET", "/api/parish/admin/parishes"),
    enabled: !!user,
  });

  // Default to the first manageable parish on load
  useEffect(() => {
    if (parishId === null && parishesQuery.data?.parishes.length) {
      setParishId(parishesQuery.data.parishes[0].id);
    }
  }, [parishesQuery.data, parishId]);

  const metricsQuery = useQuery<MetricsResponse>({
    queryKey: ["/api/parish/admin/metrics", parishId, windowDays],
    queryFn: () =>
      apiRequest("GET", `/api/parish/admin/metrics?parishId=${parishId}&days=${windowDays}`),
    enabled: !!user && parishId !== null,
  });

  const dailyMax = useMemo(() => {
    const rows = metricsQuery.data?.daily ?? [];
    return Math.max(1, ...rows.map((r) => r.sessions));
  }, [metricsQuery.data]);

  if (authLoading || !user) return null;

  if (parishesQuery.isLoading) {
    return (
      <div style={{ background: BG, minHeight: "100vh", color: SAGE, padding: 32 }}>Loading…</div>
    );
  }

  const parishes = parishesQuery.data?.parishes ?? [];

  if (parishes.length === 0) {
    return (
      <div style={{ background: BG, minHeight: "100vh", color: WARM_TEXT, padding: 32 }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link href={user.accessTier === "parish-only" ? "/parish" : "/dashboard"}>
            <span style={{ color: SAGE, fontSize: 13, fontFamily: SPACE_GROTESK, cursor: "pointer" }}>
              ← Back
            </span>
          </Link>
          <h1
            style={{
              fontFamily: SPACE_GROTESK,
              fontSize: 24,
              fontWeight: 700,
              margin: "20px 0 8px",
            }}
          >
            No parishes
          </h1>
          <p style={{ fontFamily: GEORGIA, fontStyle: "italic", color: SAGE, fontSize: 15 }}>
            You're not the admin of any parish yet. Phoebe staff provision parishes manually —
            ask us to set yours up.
          </p>
        </div>
      </div>
    );
  }

  const m = metricsQuery.data;

  return (
    <div style={{ background: BG, minHeight: "100vh", color: WARM_TEXT }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "calc(env(safe-area-inset-top) + 24px) 20px calc(env(safe-area-inset-bottom) + 32px)",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <Link href={user.accessTier === "parish-only" ? "/parish" : "/dashboard"}>
            <span style={{ color: SAGE, fontSize: 13, fontFamily: SPACE_GROTESK, cursor: "pointer" }}>
              ← Back
            </span>
          </Link>
          <h1
            style={{
              fontFamily: SPACE_GROTESK,
              fontSize: 16,
              fontWeight: 600,
              margin: 0,
            }}
          >
            Parish admin
          </h1>
          <span style={{ width: 40 }} />
        </div>

        {/* Quick links — pastoral inbox + intercession composer +
            any future per-parish admin surfaces sit here as a compact
            row of pills. */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Link href="/parish/intercessions">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(46,107,64,0.15)",
                border: "1px solid rgba(46,107,64,0.3)",
                color: WARM_TEXT,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: SPACE_GROTESK,
                padding: "8px 14px",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              🕯️ Today's intercessions
            </span>
          </Link>
          <Link href="/parish/concerns">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(46,107,64,0.15)",
                border: "1px solid rgba(46,107,64,0.3)",
                color: WARM_TEXT,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: SPACE_GROTESK,
                padding: "8px 14px",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              🤲 Pastoral concerns
            </span>
          </Link>
        </div>

        {/* Parish switcher (multiple parishes only) */}
        {parishes.length > 1 && (
          <div className="mb-6">
            <p
              style={{
                fontFamily: SPACE_GROTESK,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: FAINT_GREEN,
                margin: "0 0 8px",
              }}
            >
              Parish
            </p>
            <select
              value={parishId ?? ""}
              onChange={(e) => setParishId(parseInt(e.target.value, 10))}
              style={{
                width: "100%",
                background: "#0F2818",
                border: `1px solid ${BORDER}`,
                color: WARM_TEXT,
                fontFamily: SPACE_GROTESK,
                fontSize: 14,
                padding: "10px 12px",
                borderRadius: 12,
              }}
            >
              {parishes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.subscriberCount} subscribers · {p.state})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Window picker */}
        <div className="mb-6">
          <p
            style={{
              fontFamily: SPACE_GROTESK,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: FAINT_GREEN,
              margin: "0 0 8px",
            }}
          >
            Window
          </p>
          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setWindowDays(d)}
                style={{
                  background: windowDays === d ? "rgba(46,107,64,0.30)" : "#0F2818",
                  border: `1px solid ${windowDays === d ? "rgba(46,107,64,0.55)" : BORDER}`,
                  color: WARM_TEXT,
                  fontFamily: SPACE_GROTESK,
                  fontSize: 13,
                  padding: "8px 16px",
                  borderRadius: 999,
                  cursor: "pointer",
                }}
              >
                Last {d} days
              </button>
            ))}
          </div>
        </div>

        {/* Totals */}
        {metricsQuery.isLoading || !m ? (
          <div style={{ color: SAGE, padding: "24px 0", fontStyle: "italic" }}>Loading metrics…</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-6">
              <Stat label="Prayed" value={m.totals.distinctPrayers.toString()} sub="parishioners" />
              <Stat label="Sessions" value={m.totals.sessions.toString()} sub="prayer events" />
              <Stat label="Time" value={fmtDuration(m.totals.totalSeconds)} sub="praying" />
            </div>

            {/* Per-liturgy breakdown */}
            <p
              style={{
                fontFamily: SPACE_GROTESK,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: FAINT_GREEN,
                margin: "0 0 8px",
              }}
            >
              By liturgy
            </p>
            {m.bySurface.length === 0 ? (
              <p style={{ color: SAGE, fontStyle: "italic", fontFamily: GEORGIA }}>
                No prayer activity in this window yet.
              </p>
            ) : (
              <div
                style={{
                  background: "#0F2818",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 16,
                  overflow: "hidden",
                  marginBottom: 24,
                }}
              >
                {m.bySurface.map((row, i) => (
                  <div
                    key={row.surface}
                    style={{
                      padding: "12px 16px",
                      borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: SPACE_GROTESK, fontSize: 14, color: WARM_TEXT, margin: 0 }}>
                        {SURFACE_LABEL[row.surface] ?? row.surface}
                      </p>
                      <p style={{ color: SAGE, fontSize: 12, margin: "2px 0 0" }}>
                        {row.distinctPrayers} {row.distinctPrayers === 1 ? "person" : "people"} · {row.sessions} sessions
                      </p>
                    </div>
                    <p
                      style={{
                        fontFamily: SPACE_GROTESK,
                        fontSize: 14,
                        color: WARM_TEXT,
                        margin: 0,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtDuration(row.totalSeconds)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Daily bar chart */}
            <p
              style={{
                fontFamily: SPACE_GROTESK,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: FAINT_GREEN,
                margin: "0 0 8px",
              }}
            >
              Daily activity
            </p>
            {m.daily.length === 0 ? (
              <p style={{ color: SAGE, fontStyle: "italic", fontFamily: GEORGIA }}>—</p>
            ) : (
              <div
                style={{
                  background: "#0F2818",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 16,
                  padding: "16px 12px",
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 4,
                    height: 96,
                  }}
                >
                  {m.daily.map((d) => {
                    const height = Math.max(2, Math.round((d.sessions / dailyMax) * 88));
                    return (
                      <div
                        key={d.day}
                        title={`${d.day} · ${d.sessions} sessions · ${fmtDuration(d.totalSeconds)}`}
                        style={{
                          flex: 1,
                          minWidth: 4,
                          height,
                          background: "rgba(168,197,160,0.45)",
                          borderRadius: 2,
                        }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2">
                  <span style={{ color: FAINT_GREEN, fontSize: 11 }}>{m.daily[0]?.day ?? ""}</span>
                  <span style={{ color: FAINT_GREEN, fontSize: 11 }}>{m.daily[m.daily.length - 1]?.day ?? ""}</span>
                </div>
              </div>
            )}

            {/* Footer link to programming surface */}
            <Link href={`/prayer-feeds/${m.parish.slug}/manage`}>
              <span
                style={{
                  display: "block",
                  color: SAGE,
                  fontSize: 13,
                  fontFamily: SPACE_GROTESK,
                  textAlign: "center",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textDecorationColor: "rgba(143,175,150,0.35)",
                  textUnderlineOffset: 4,
                }}
              >
                Program today's intercessions →
              </span>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        background: "#0F2818",
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: "16px 14px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontFamily: SPACE_GROTESK,
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: FAINT_GREEN,
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: SPACE_GROTESK,
          fontSize: 28,
          fontWeight: 700,
          color: WARM_TEXT,
          margin: "4px 0 0",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </p>
      <p style={{ color: SAGE, fontSize: 11, margin: "2px 0 0" }}>{sub}</p>
    </div>
  );
}
