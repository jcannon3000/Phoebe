import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Users, Check, Clock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

type Band = "morning" | "afternoon" | "evening";
type Level = "free" | "maybe" | "busy" | null;

interface PatternRow {
  dayOfWeek: number;
  timeBand: string;
  level: string;
}

interface GatheringMember {
  id: number;
  userId: number;
  role: string;
  inviteStatus: string;
  hasResponded: boolean;
  user: { id: number; name: string | null; avatarUrl: string | null } | null;
}

interface GatheringDetail {
  id: number;
  title: string;
  description: string | null;
  cadence: string;
  durationMin: number;
  expectedSize: number | null;
  needsRoom: boolean;
  needsClergy: boolean;
  visibility: string;
  status: string;
  confirmedDayOfWeek: number | null;
  confirmedTime: string | null;
  confirmedStartDate: string | null;
  myRole: string;
  myInviteStatus: string;
  myPatterns: PatternRow[];
  members: GatheringMember[];
}

interface Suggestion {
  dayOfWeek: number;
  timeBand: Band;
  score: number;
  respondedCount: number;
  blockedCount: number;
  totalMembers: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const BANDS: Band[] = ["morning", "afternoon", "evening"];
const BAND_LABELS: Record<Band, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };
const BAND_DEFAULT_TIMES: Record<Band, string> = { morning: "09:00", afternoon: "14:00", evening: "18:30" };

const LEVEL_STYLES: Record<NonNullable<Level>, { bg: string; border: string; icon: string }> = {
  free: { bg: "rgba(46,107,64,0.35)", border: "rgba(111,175,133,0.6)", icon: "✓" },
  maybe: { bg: "rgba(180,140,50,0.22)", border: "rgba(200,180,80,0.4)", icon: "~" },
  busy: { bg: "rgba(150,60,50,0.22)", border: "rgba(196,122,101,0.35)", icon: "✕" },
};

function nextLevel(current: Level): Level {
  if (current === null) return "free";
  if (current === "free") return "maybe";
  return null; // maybe → unset (busy is implicit for blank)
}

function formatHHMM(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  h = ((h + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2, "0")} ${suffix}`;
}

function cadenceLabel(cadence: string): string {
  if (cadence === "fortnightly") return "Every 2 weeks";
  return cadence.charAt(0).toUpperCase() + cadence.slice(1);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GatheringDetailPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/gatherings/:id");
  const gatheringId = Number(params?.id);
  const qc = useQueryClient();

  // Grid: key = "${day}-${band}", value = Level
  const [grid, setGrid] = useState<Map<string, Level>>(new Map());
  const [gridSynced, setGridSynced] = useState(false);

  const [confirmStep, setConfirmStep] = useState<"idle" | "picking">("idle");
  const [confirmDay, setConfirmDay] = useState<number | null>(null);
  const [confirmBand, setConfirmBand] = useState<Band | null>(null);
  const [confirmTime, setConfirmTime] = useState("09:00");
  const [confirmStartDate, setConfirmStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
    return d.toISOString().split("T")[0];
  });

  const { data: gathering, isLoading } = useQuery<GatheringDetail>({
    queryKey: ["/api/gatherings", gatheringId],
    queryFn: () => apiRequest("GET", `/api/gatherings/${gatheringId}`),
    enabled: !!user && !!gatheringId,
  });

  // Sync server patterns → grid once on first load
  useEffect(() => {
    if (!gathering || gridSynced) return;
    const initial = new Map<string, Level>();
    for (const p of gathering.myPatterns) {
      initial.set(`${p.dayOfWeek}-${p.timeBand}`, p.level as Level);
    }
    setGrid(initial);
    setGridSynced(true);
  }, [gathering, gridSynced]);

  const { data: suggestions = [] } = useQuery<Suggestion[]>({
    queryKey: ["/api/gatherings", gatheringId, "suggestions"],
    queryFn: () => apiRequest("GET", `/api/gatherings/${gatheringId}/suggestions`),
    enabled: !!user && !!gatheringId && gathering?.myRole === "leader" && gathering?.status === "forming",
  });

  const saveAvailability = useMutation({
    mutationFn: () => {
      const patterns: Array<{ dayOfWeek: number; timeBand: Band; level: string }> = [];
      for (const [key, level] of grid.entries()) {
        if (!level) continue;
        const dashIdx = key.indexOf("-");
        const day = Number(key.slice(0, dashIdx));
        const band = key.slice(dashIdx + 1) as Band;
        patterns.push({ dayOfWeek: day, timeBand: band, level });
      }
      return apiRequest("PUT", `/api/gatherings/${gatheringId}/availability`, { patterns });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/gatherings", gatheringId] });
      qc.invalidateQueries({ queryKey: ["/api/gatherings", gatheringId, "suggestions"] });
    },
  });

  const confirmSlot = useMutation({
    mutationFn: () => {
      if (confirmDay === null || !confirmBand) throw new Error("No slot selected");
      return apiRequest("POST", `/api/gatherings/${gatheringId}/confirm`, {
        confirmedDayOfWeek: confirmDay,
        confirmedTime: confirmTime,
        confirmedStartDate: confirmStartDate,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/gatherings", gatheringId] });
      setConfirmStep("idle");
    },
  });

  if (!user) { setLocation("/"); return null; }
  if (!gatheringId) { setLocation("/gatherings"); return null; }

  function toggleCell(day: number, band: Band) {
    if (day === 0 && band === "morning") return; // liturgically reserved
    const key = `${day}-${band}`;
    setGrid(prev => {
      const next = new Map(prev);
      const level = nextLevel(prev.get(key) ?? null);
      if (level === null) next.delete(key); else next.set(key, level);
      return next;
    });
  }

  const isLeader = gathering?.myRole === "leader";
  const isForming = gathering?.status === "forming";
  const isScheduled = gathering?.status === "scheduled";
  const joinedMembers = gathering?.members.filter(m => m.inviteStatus === "joined") ?? [];
  const respondedCount = gathering?.members.filter(m => m.hasResponded).length ?? 0;

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto w-full pt-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl animate-pulse mb-3" style={{ background: "#0F2818" }} />
          ))}
        </div>
      </Layout>
    );
  }

  if (!gathering) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto w-full pt-16 text-center">
          <p style={{ color: "#8FAF96" }}>Gathering not found.</p>
          <button onClick={() => setLocation("/gatherings")} className="mt-4 text-sm underline" style={{ color: "#8FAF96" }}>
            Back to Gatherings
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto w-full pb-28">

        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => setLocation("/gatherings")}
            className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "#8FAF96" }}
          >
            <ChevronLeft size={14} /> Gatherings
          </button>
          <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            {gathering.title}
          </h1>
          {gathering.description && (
            <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>{gathering.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span
              className="text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: "rgba(46,107,64,0.12)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.2)" }}
            >
              {cadenceLabel(gathering.cadence)}
            </span>
            <span className="text-xs flex items-center gap-1" style={{ color: "#8FAF96" }}>
              <Clock size={11} />{gathering.durationMin}m
            </span>
            <span className="text-xs flex items-center gap-1" style={{ color: "#8FAF96" }}>
              <Users size={11} />{gathering.members.length}
            </span>
            {gathering.needsRoom && (
              <span className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>room needed</span>
            )}
            {gathering.needsClergy && (
              <span className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>clergy needed</span>
            )}
          </div>
        </div>

        {/* Scheduled banner */}
        {isScheduled && gathering.confirmedDayOfWeek !== null && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 px-5 py-4 rounded-2xl"
            style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(111,175,133,0.3)" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#6FAF85" }}>Confirmed</p>
            <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
              {DAY_NAMES_FULL[gathering.confirmedDayOfWeek]}s at {formatHHMM(gathering.confirmedTime ?? "09:00")}
            </p>
            {gathering.confirmedStartDate && (
              <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
                Starting{" "}
                {new Date(gathering.confirmedStartDate + "T12:00:00").toLocaleDateString(undefined, {
                  month: "long", day: "numeric", year: "numeric",
                })}
              </p>
            )}
          </motion.div>
        )}

        {/* Response progress */}
        {isForming && joinedMembers.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs" style={{ color: "#8FAF96" }}>Responses</span>
              <span className="text-xs" style={{ color: "#8FAF96" }}>{respondedCount} / {joinedMembers.length}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(46,107,64,0.12)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${joinedMembers.length > 0 ? (respondedCount / joinedMembers.length) * 100 : 0}%`,
                  background: "#2D5E3F",
                }}
              />
            </div>
          </div>
        )}

        {/* Availability grid */}
        {isForming && (
          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(143,175,150,0.6)" }}>
              Your availability
            </p>
            <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.45)" }}>
              Tap to mark free (✓) or maybe (~). Blank = unavailable.
            </p>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "2px 4px" }}>
                <thead>
                  <tr>
                    <td style={{ width: 72, paddingBottom: 4 }} />
                    {DAYS.map((d, i) => (
                      <th
                        key={d}
                        style={{
                          textAlign: "center",
                          fontSize: 11,
                          fontWeight: 600,
                          paddingBottom: 4,
                          color: i === 0 ? "rgba(143,175,150,0.3)" : "rgba(200,212,192,0.5)",
                        }}
                      >
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BANDS.map(band => (
                    <tr key={band}>
                      <td
                        style={{
                          fontSize: 10,
                          color: "rgba(143,175,150,0.45)",
                          paddingRight: 6,
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {BAND_LABELS[band]}
                      </td>
                      {DAYS.map((_, day) => {
                        const key = `${day}-${band}`;
                        const level = grid.get(key) ?? null;
                        const isBlocked = day === 0 && band === "morning";
                        const styles = level ? LEVEL_STYLES[level] : null;
                        return (
                          <td key={day} style={{ textAlign: "center", padding: "2px 1px" }}>
                            <button
                              onClick={() => toggleCell(day, band)}
                              disabled={isBlocked}
                              style={{
                                width: "100%",
                                minWidth: 36,
                                aspectRatio: "1",
                                borderRadius: 8,
                                border: `1px solid ${isBlocked ? "transparent" : (styles?.border ?? "rgba(46,107,64,0.1)")}`,
                                background: isBlocked ? "transparent" : (styles?.bg ?? "rgba(46,107,64,0.05)"),
                                cursor: isBlocked ? "default" : "pointer",
                                opacity: isBlocked ? 0.2 : 1,
                                fontSize: 13,
                                color: styles ? (level === "free" ? "#6FAF85" : level === "maybe" ? "#C8B460" : "#C47A65") : "transparent",
                                transition: "background 0.12s, border-color 0.12s",
                              }}
                            >
                              {level ? styles?.icon : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => saveAvailability.mutate()}
              disabled={saveAvailability.isPending}
              className="w-full mt-4 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-40 transition-opacity hover:opacity-90"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              {saveAvailability.isPending ? "Saving…" : "Save availability"}
            </button>
            {saveAvailability.isSuccess && (
              <p className="text-xs text-center mt-2 flex items-center justify-center gap-1" style={{ color: "#6FAF85" }}>
                <Check size={12} /> Saved
              </p>
            )}
          </div>
        )}

        {/* Suggestions (leader only, forming) */}
        {isLeader && isForming && suggestions.length > 0 && (
          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(143,175,150,0.6)" }}>
              Best times
            </p>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <button
                  key={`${s.dayOfWeek}-${s.timeBand}`}
                  onClick={() => {
                    setConfirmDay(s.dayOfWeek);
                    setConfirmBand(s.timeBand);
                    setConfirmTime(BAND_DEFAULT_TIMES[s.timeBand]);
                    setConfirmStep("picking");
                  }}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left transition-all hover:brightness-110"
                  style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.18)" }}
                >
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>
                      {i === 0 && <span style={{ color: "#6FAF85", marginRight: 4 }}>✦</span>}
                      {DAY_NAMES_FULL[s.dayOfWeek]} {BAND_LABELS[s.timeBand]}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                      {s.respondedCount > 0
                        ? `${Math.round(s.score * 100)}% match${s.blockedCount > 0 ? ` · ${s.blockedCount} conflict${s.blockedCount > 1 ? "s" : ""}` : " · no conflicts"}`
                        : "No responses yet"}
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-lg shrink-0" style={{ background: "rgba(46,107,64,0.15)", color: "#8FAF96" }}>
                    Select
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirm flow */}
        <AnimatePresence>
          {isLeader && isForming && confirmStep === "picking" && confirmDay !== null && confirmBand && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mb-7 px-5 py-5 rounded-2xl"
              style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(111,175,133,0.2)" }}
            >
              <p className="text-sm font-semibold mb-4" style={{ color: "#F0EDE6" }}>
                Confirm: {DAY_NAMES_FULL[confirmDay]} {BAND_LABELS[confirmBand]}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                    Time
                  </label>
                  <input
                    type="time"
                    value={confirmTime}
                    onChange={e => setConfirmTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                    style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)", color: "#F0EDE6" }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                    First meeting date
                  </label>
                  <input
                    type="date"
                    value={confirmStartDate}
                    onChange={e => setConfirmStartDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                    style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)", color: "#F0EDE6" }}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setConfirmStep("idle")}
                  className="flex-1 py-3 rounded-xl text-sm font-medium"
                  style={{ background: "rgba(46,107,64,0.08)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.15)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmSlot.mutate()}
                  disabled={confirmSlot.isPending}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  {confirmSlot.isPending ? "Confirming…" : "Confirm"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Members */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(143,175,150,0.6)" }}>
            Members
          </p>
          <div className="space-y-2">
            {gathering.members.map(m => (
              <div
                key={m.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.1)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {m.user?.avatarUrl ? (
                    <img src={m.user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                      style={{ background: "rgba(46,107,64,0.2)", color: "#6FAF85" }}
                    >
                      {(m.user?.name ?? "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "#F0EDE6" }}>
                      {m.user?.name ?? "Invited"}
                    </p>
                    {m.role === "leader" && (
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: "#6FAF85" }}>Leader</p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 ml-3">
                  {m.hasResponded ? (
                    <span className="text-xs flex items-center gap-1" style={{ color: "#6FAF85" }}>
                      <Check size={11} /> Responded
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: "rgba(143,175,150,0.35)" }}>Pending</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
