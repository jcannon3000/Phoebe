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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
          <p style={{ fontFamily: GEORGIA, fontStyle: "italic", color: SAGE, fontSize: 15, marginBottom: 20 }}>
            You're not the admin of any parish yet. Create one and become its first admin — you'll publish today's intercessions, see who prays with you each week, and add co-pastors as admins.
          </p>
          <Link href="/parish/new">
            <span
              style={{
                display: "inline-block",
                background: "#2D5E3F",
                color: WARM_TEXT,
                padding: "12px 24px",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: SPACE_GROTESK,
                cursor: "pointer",
                textDecoration: "none",
              }}
            >
              Create your parish →
            </span>
          </Link>
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
          padding: "calc(var(--safe-top) + 24px) 20px calc(env(safe-area-inset-bottom) + 32px)",
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

            {/* Ways to get involved — the priest publishes opportunities
                (worship roles, service ministries, community groups); members
                tap "I'm interested" and the admin sees who raised their hand. */}
            {parishId !== null && <OpportunitiesManager parishId={parishId} />}

            {/* Parish admin roster — creator + any co-admins the
                creator has granted access to. Adding goes by email
                (the recipient must already have a Phoebe account). */}
            <ParishAdminsManager slug={m.parish.slug} />

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

// ─── Parish admin roster — creator + co-admins ──────────────────────────────
// Adds another admin by email (the recipient must already have a
// Phoebe account). The creator is shown but not removable from this
// surface — they'd need to transfer ownership first.
// ─── "Ways to get involved" manager (admin side) ────────────────────────────
type AdminOpportunity = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  scheduleNote: string | null;
  contact: string | null;
  interestCount: number;
  viewerInterested: boolean;
};
const OPP_CATS: { value: string; label: string }[] = [
  { value: "worship", label: "🕊️ Worship & liturgy" },
  { value: "serve", label: "🤝 Serve" },
  { value: "community", label: "👥 Community" },
  { value: "other", label: "✨ Other" },
];

function OpportunitiesManager({ parishId }: { parishId: number }) {
  const qc = useQueryClient();
  const listQ = useQuery<{ opportunities: AdminOpportunity[] }>({
    queryKey: ["/api/parish/opportunities", parishId],
    queryFn: () => apiRequest("GET", `/api/parish/opportunities?parishId=${parishId}`),
  });
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("worship");
  const [scheduleNote, setScheduleNote] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [viewing, setViewing] = useState<number | null>(null);

  const resetForm = () => {
    setTitle(""); setCategory("worship"); setScheduleNote("");
    setDescription(""); setContact(""); setEditId(null); setShowForm(false);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        parishId, title: title.trim(), category,
        scheduleNote: scheduleNote.trim() || undefined,
        description: description.trim() || undefined,
        contact: contact.trim() || undefined,
      };
      return editId
        ? apiRequest("PUT", `/api/parish/admin/opportunities/${editId}`, body)
        : apiRequest("POST", "/api/parish/admin/opportunities", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/parish/opportunities", parishId] });
      resetForm();
    },
  });
  const archive = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/parish/admin/opportunities/${id}/archive`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/parish/opportunities", parishId] }),
  });

  const startEdit = (o: AdminOpportunity) => {
    setEditId(o.id); setTitle(o.title); setCategory(o.category);
    setScheduleNote(o.scheduleNote ?? ""); setDescription(o.description ?? "");
    setContact(o.contact ?? ""); setShowForm(true);
  };

  const opps = listQ.data?.opportunities ?? [];
  const input: React.CSSProperties = {
    width: "100%", background: "#0F2818", border: `1px solid ${BORDER}`, color: WARM_TEXT,
    fontFamily: SPACE_GROTESK, fontSize: 14, padding: "10px 12px", borderRadius: 10, marginBottom: 8,
  };

  return (
    <div style={{ marginTop: 28, marginBottom: 20 }}>
      <p style={{ fontFamily: SPACE_GROTESK, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: FAINT_GREEN, margin: "0 0 12px" }}>
        Ways to get involved
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {opps.map((o) => (
          <div key={o.id} style={{ background: "#0F2818", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, color: WARM_TEXT, margin: 0 }}>{o.title}</p>
                <p style={{ fontFamily: SPACE_GROTESK, fontSize: 11, color: FAINT_GREEN, margin: "3px 0 0" }}>
                  {OPP_CATS.find((c) => c.value === o.category)?.label ?? o.category}{o.scheduleNote ? ` · ${o.scheduleNote}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                <button onClick={() => startEdit(o)} style={{ background: "none", border: "none", color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 12, cursor: "pointer" }}>Edit</button>
                <button onClick={() => { if (window.confirm("Remove this opportunity?")) archive.mutate(o.id); }} style={{ background: "none", border: "none", color: "rgba(196,122,101,0.9)", fontFamily: SPACE_GROTESK, fontSize: 12, cursor: "pointer" }}>Remove</button>
              </div>
            </div>
            <button
              onClick={() => setViewing(viewing === o.id ? null : o.id)}
              style={{ marginTop: 8, background: "none", border: "none", color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 12, cursor: "pointer", padding: 0 }}
            >
              {o.interestCount} interested{o.interestCount > 0 ? (viewing === o.id ? " ▲" : " ▼") : ""}
            </button>
            {viewing === o.id && o.interestCount > 0 && <InterestList opportunityId={o.id} />}
          </div>
        ))}
        {opps.length === 0 && (
          <p style={{ fontFamily: SPACE_GROTESK, fontSize: 13, color: FAINT_GREEN, margin: 0 }}>
            No opportunities yet — add one so your parish can get involved.
          </p>
        )}
      </div>

      {showForm ? (
        <div style={{ marginTop: 12, background: "rgba(46,107,64,0.08)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Lector, Food pantry)" style={input} />
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...input, colorScheme: "dark" }}>
            {OPP_CATS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input value={scheduleNote} onChange={(e) => setScheduleNote(e.target.value)} placeholder="When (optional) — e.g. Sundays" style={input} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={3} style={{ ...input, resize: "vertical" }} />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact (optional) — e.g. Talk to Fr. James" style={input} />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}
              style={{ flex: 1, background: "rgba(46,107,64,0.85)", border: "1px solid rgba(126,210,140,0.5)", color: "#F0EDE6", fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, padding: "10px", borderRadius: 999, cursor: "pointer", opacity: !title.trim() ? 0.5 : 1 }}>
              {editId ? "Save" : "Add"}
            </button>
            <button onClick={resetForm} style={{ background: "none", border: `1px solid ${BORDER}`, color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 14, padding: "10px 16px", borderRadius: 999, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} style={{ marginTop: 10, background: "none", border: `1px solid ${BORDER}`, color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 999, cursor: "pointer", width: "100%" }}>
          + Add an opportunity
        </button>
      )}
    </div>
  );
}

function InterestList({ opportunityId }: { opportunityId: number }) {
  const q = useQuery<{ interests: { name: string | null; email: string | null; note: string | null; at: string }[] }>({
    queryKey: ["/api/parish/admin/opportunities", opportunityId, "interests"],
    queryFn: () => apiRequest("GET", `/api/parish/admin/opportunities/${opportunityId}/interests`),
  });
  const rows = q.data?.interests ?? [];
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ fontFamily: SPACE_GROTESK, fontSize: 12, color: "rgba(200,212,192,0.85)" }}>
          {r.name || "Someone"}{r.email ? ` · ${r.email}` : ""}{r.note ? ` — "${r.note}"` : ""}
        </div>
      ))}
    </div>
  );
}

function ParishAdminsManager({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const adminsQ = useQuery<{
    creator: { userId: number; name: string; email: string } | null;
    coAdmins: Array<{ userId: number; name: string; email: string; addedAt: string }>;
  }>({
    queryKey: [`/api/parishes/${slug}/admins`],
    queryFn: () => apiRequest("GET", `/api/parishes/${slug}/admins`),
    enabled: !!slug,
  });

  const addAdmin = useMutation<{ ok: boolean; name?: string }, Error, string>({
    mutationFn: (e: string) => apiRequest("POST", `/api/parishes/${slug}/admins`, { email: e }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/parishes/${slug}/admins`] });
      if (data.name) setJustAdded(data.name);
      setEmail("");
      setError("");
      window.setTimeout(() => setJustAdded(null), 2400);
    },
    onError: (err) => setError(err.message || "Couldn't add admin."),
  });

  const removeAdmin = useMutation<void, Error, number>({
    mutationFn: (userId: number) =>
      apiRequest("DELETE", `/api/parishes/${slug}/admins/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/parishes/${slug}/admins`] }),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    addAdmin.mutate(trimmed);
  }

  const creator = adminsQ.data?.creator ?? null;
  const coAdmins = adminsQ.data?.coAdmins ?? [];

  return (
    <div style={{ marginTop: 28, marginBottom: 24 }}>
      <p
        style={{
          fontFamily: SPACE_GROTESK,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: FAINT_GREEN,
          marginBottom: 10,
        }}
      >
        Parish admins
      </p>
      <div
        style={{
          background: "#0F2818",
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: "14px 16px",
        }}
      >
        {creator && (
          <AdminRow name={creator.name} email={creator.email} badge="Creator" />
        )}
        {coAdmins.map((a) => (
          <AdminRow
            key={a.userId}
            name={a.name}
            email={a.email}
            badge="Admin"
            onRemove={() => removeAdmin.mutate(a.userId)}
            removing={removeAdmin.isPending}
          />
        ))}
        {creator == null && coAdmins.length === 0 && !adminsQ.isLoading && (
          <p style={{ color: SAGE, fontSize: 12, fontFamily: SPACE_GROTESK, margin: 0, padding: "4px 0" }}>
            Loading…
          </p>
        )}

        <form onSubmit={handleAdd} style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <input
            type="email"
            placeholder="Add an admin by email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            disabled={addAdmin.isPending}
            style={{
              flex: 1,
              background: "#091A10",
              color: WARM_TEXT,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              fontFamily: SPACE_GROTESK,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={addAdmin.isPending || !email.trim()}
            style={{
              background: "#2D5E3F",
              color: WARM_TEXT,
              border: "none",
              borderRadius: 999,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: SPACE_GROTESK,
              cursor: addAdmin.isPending || !email.trim() ? "default" : "pointer",
              opacity: addAdmin.isPending || !email.trim() ? 0.45 : 1,
            }}
          >
            {addAdmin.isPending ? "…" : "Add"}
          </button>
        </form>
        {error && (
          <p style={{ color: "#C47A65", fontSize: 12, fontFamily: SPACE_GROTESK, margin: "8px 0 0" }}>
            {error}
          </p>
        )}
        {justAdded && (
          <p style={{ color: "#A8C5A0", fontSize: 12, fontFamily: SPACE_GROTESK, margin: "8px 0 0" }}>
            ✓ {justAdded} is now an admin.
          </p>
        )}
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 11, color: "rgba(143,175,150,0.55)", margin: "10px 0 0" }}>
          They'll need a Phoebe account already. They'll be able to publish today's intercessions and read pastoral concerns, same as you.
        </p>
      </div>
    </div>
  );
}

function AdminRow({
  name,
  email,
  badge,
  onRemove,
  removing,
}: {
  name: string;
  email: string;
  badge: string;
  onRemove?: () => void;
  removing?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: "1px solid rgba(200,212,192,0.08)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 14, color: WARM_TEXT, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </p>
        <p style={{ fontFamily: SPACE_GROTESK, fontSize: 11, color: SAGE, margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {email}
        </p>
      </div>
      <span
        style={{
          fontFamily: SPACE_GROTESK,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(168,197,160,0.7)",
          padding: "2px 8px",
          borderRadius: 999,
          background: "rgba(46,107,64,0.18)",
          border: "1px solid rgba(46,107,64,0.3)",
          flexShrink: 0,
        }}
      >
        {badge}
      </span>
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={removing}
          style={{
            background: "transparent",
            color: FAINT_GREEN,
            border: "none",
            fontSize: 12,
            fontFamily: SPACE_GROTESK,
            cursor: removing ? "default" : "pointer",
            padding: "4px 6px",
            opacity: removing ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}
