/**
 * Creator season — /season/:token (the viewer side of "Creator").
 *
 * A creator's video inspired a practice; this link is where it lands. Not yet
 * joined: a landing page — the season's title, the creator's voice, what the
 * practice contains, how long the season runs, how many people are in it —
 * and one tap to take it home (joining APPLIES the practice like a preset
 * link and enters the cohort). Joined: the season itself — a cohort-shared
 * "Day N of M" clock, today's check-in, the group's witnesses (today's count
 * + first names, never history), and the creator's short async notes.
 */
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { adoptRoutineConfig } from "@/lib/routineSync";
import { swellHaptic } from "@/lib/swellHaptic";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type RoutineSpec = {
  v: number;
  officePrefs: {
    defaultPrayerLevel: string;
    contemplationGoalMinutes: number;
    contemplationReminderEnabled: boolean;
    morning: "office" | "devotion" | "none";
    evening: "office" | "devotion" | "none";
    morningTime: string | null;
    eveningTime: string | null;
  };
  silenceLadderEnabled: boolean;
  homeLayout: { order: string[]; hidden: string[]; v?: number };
  ruleConfig: Record<string, string>;
};

type SeasonData = {
  title: string;
  creatorName: string;
  description: string | null;
  durationDays: number;
  startYmd: string;
  memberCount: number;
  spec: RoutineSpec;
  joined: boolean;
  today: { ymd: string; day: number; checkedIn: boolean; keptCount: number; keptNames: string[] } | null;
  notes: Array<{ id: number; body: string; createdAt: string | null }> | null;
};

const CARD_LABELS: Record<string, string> = {
  gratitude: "Gratitude", journaling: "Journaling", reading: "Reading",
  podcasts: "Podcasts", examen: "Examen", listening: "Audio Divina",
  scripture: "Scripture audio", walk: "Walking prayer",
  cobreathe: "Creation Prayer", "prayer-list": "Prayer list",
  cac: "Richard Rohr (CAC)", fdd: "Forward Day by Day", ssje: "SSJE",
};
const OFFICE_LABEL: Record<string, string> = { devotion: "Daily Devotion", office: "Daily Office", none: "" };

function summarize(spec: RoutineSpec): string[] {
  const out: string[] = [];
  // Defensive: a partial/truncated spec (missing officePrefs/homeLayout) must
  // not white-screen the member's /season/:token landing.
  const op = spec?.officePrefs ?? ({} as RoutineSpec["officePrefs"]);
  if (op.morning && op.morning !== "none") out.push(`Morning — ${OFFICE_LABEL[op.morning]}${op.morningTime ? ` at ${op.morningTime}` : ""}`);
  if (op.evening && op.evening !== "none") out.push(`Evening — ${OFFICE_LABEL[op.evening]}${op.eveningTime ? ` at ${op.eveningTime}` : ""}`);
  if (spec?.silenceLadderEnabled) out.push("Silence — a growing daily practice");
  else if ((op.contemplationGoalMinutes ?? 0) > 0) out.push(`Silence — ${op.contemplationGoalMinutes} min a day`);
  const hidden = new Set(spec?.homeLayout?.hidden ?? []);
  const cards = (spec?.homeLayout?.order ?? []).filter((k) => CARD_LABELS[k] && !hidden.has(k)).map((k) => CARD_LABELS[k]);
  if (cards.length) out.push(`Practices — ${cards.join(" · ")}`);
  return out;
}

function localYmd(): string {
  return new Date().toLocaleDateString("en-CA");
}
// Calendar-day difference startYmd → today (Day 1 on the start day itself).
function dayNumber(startYmd: string, todayYmd: string): number {
  const s = Date.parse(`${startYmd}T00:00:00Z`);
  const t = Date.parse(`${todayYmd}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(t)) return 0;
  return Math.round((t - s) / 86_400_000) + 1;
}
function startLabel(startYmd: string): string {
  const d = new Date(`${startYmd}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? startYmd : d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export default function SeasonPage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const valid = /^[a-f0-9]{32}$/i.test(token ?? "");
  const ymd = localYmd();

  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<SeasonData>({
    queryKey: [`/api/creator/seasons/${token}`, ymd],
    queryFn: () => apiRequest("GET", `/api/creator/seasons/${token}?ymd=${ymd}`),
    enabled: valid,
    retry: false,
  });

  const join = async () => {
    if (joining || !data) return;
    setJoining(true); setError(null);
    try {
      await apiRequest("POST", `/api/creator/seasons/${token}/join`, {});
      // Mirror the practice onto THIS device so the home reflects it at once.
      adoptRoutineConfig(data.spec.ruleConfig);
      swellHaptic();
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] });
      qc.invalidateQueries({ queryKey: [`/api/creator/seasons/${token}`, ymd] });
    } catch {
      setError("Couldn't join the season. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const checkIn = async () => {
    if (!data?.today || data.today.checkedIn) return;
    // Optimistic — the tap should feel instant.
    qc.setQueryData<SeasonData>([`/api/creator/seasons/${token}`, ymd], (old) => old && old.today
      ? { ...old, today: { ...old.today, checkedIn: true, keptCount: old.today.keptCount + 1 } }
      : old);
    swellHaptic();
    try {
      await apiRequest("POST", `/api/creator/seasons/${token}/checkin`, { ymd });
      qc.invalidateQueries({ queryKey: [`/api/creator/seasons/${token}`, ymd] });
    } catch {
      // Roll the optimistic patch back on failure — otherwise, if the refetch
      // also fails (offline), the button keeps showing "Kept today ✓" for a
      // check-in that never registered.
      qc.setQueryData<SeasonData>([`/api/creator/seasons/${token}`, ymd], (old) => old && old.today
        ? { ...old, today: { ...old.today, checkedIn: false, keptCount: Math.max(0, old.today.keptCount - 1) } }
        : old);
      setError("Couldn't check in. Please try again.");
    }
  };

  const leafBg = LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[0] : null;
  const wrap: React.CSSProperties = {
    position: "relative", minHeight: "100dvh", display: "flex", flexDirection: "column",
    justifyContent: "center", alignItems: "stretch", gap: 16, padding: "28px 22px", maxWidth: 480, margin: "0 auto",
  };
  const card: React.CSSProperties = {
    background: "rgba(9,26,16,0.5)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
    border: "1px solid rgba(46,107,64,0.35)", borderRadius: 18, padding: 18,
  };
  const primaryBtn: React.CSSProperties = {
    background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)",
    borderRadius: 14, padding: "16px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
  };
  const Backdrop = () => (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, backgroundColor: "#091A10",
      backgroundImage: leafBg ? `url(${leafBg})` : undefined, backgroundSize: "cover", backgroundPosition: "center", opacity: leafBg ? 0.5 : 1 }} />
  );

  if (!valid) {
    return (
      <div style={wrap}><Backdrop />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: WARM, fontFamily: FONT }}>This link isn't valid</h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT }}>Double-check the link you were sent.</p>
      </div>
    );
  }
  if (isLoading || authLoading) {
    return <div style={wrap}><Backdrop /><p style={{ color: SAGE, fontFamily: FONT, textAlign: "center" }}>Loading…</p></div>;
  }
  if (isError || !data) {
    return (
      <div style={wrap}><Backdrop />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: WARM, fontFamily: FONT }}>Season not found</h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT }}>This season link may have been removed.</p>
      </div>
    );
  }

  // ── Member view — the season itself ────────────────────────────────────────
  if (data.joined && user) {
    const day = data.today?.day ?? dayNumber(data.startYmd, ymd);
    const active = day >= 1 && day <= data.durationDays;
    const finished = day > data.durationDays;
    const witnesses = data.today?.keptNames ?? [];
    return (
      <div style={{ ...wrap, justifyContent: "flex-start", paddingTop: "max(2.2rem, var(--safe-top, 1rem))" }}><Backdrop />
        <button onClick={() => setLocation("/dashboard")} style={{ alignSelf: "flex-start", background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14.5, cursor: "pointer", padding: "4px 0" }}>← Home</button>
        <div>
          <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
            {finished ? "Season complete 🌿" : active ? `Day ${day} of ${data.durationDays}` : `Begins ${startLabel(data.startYmd)}`}
          </p>
          <h1 style={{ fontSize: 25, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.22 }}>{data.title}</h1>
          <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 6 }}>
            with {data.creatorName} · {data.memberCount} {data.memberCount === 1 ? "person" : "people"}
          </p>
        </div>

        {/* Today's check-in — the daily loop. */}
        {active && (
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              type="button" onClick={checkIn} disabled={data.today?.checkedIn}
              style={{ ...primaryBtn, opacity: data.today?.checkedIn ? 0.55 : 1, cursor: data.today?.checkedIn ? "default" : "pointer" }}
            >
              {data.today?.checkedIn ? "Kept today ✓" : "I kept it today"}
            </button>
            <p style={{ fontSize: 13.5, color: "rgba(182,210,188,0.9)", fontFamily: FONT, textAlign: "center" }}>
              {(data.today?.keptCount ?? 0) === 0
                ? "Be the first to keep it today."
                : `${data.today?.keptCount} kept it today${witnesses.length ? ` — ${witnesses.join(", ")}` : ""}`}
            </p>
          </div>
        )}
        {finished && (
          <div style={card}>
            <p style={{ fontSize: 14.5, color: "rgba(240,237,230,0.95)", fontFamily: FONT, lineHeight: 1.5 }}>
              The season has ended — {data.durationDays} days, kept together. The practice is yours now; it stays on your home for as long as you want it.
            </p>
          </div>
        )}
        {!active && !finished && (
          <div style={card}>
            <p style={{ fontSize: 14.5, color: "rgba(240,237,230,0.95)", fontFamily: FONT, lineHeight: 1.5 }}>
              You're in. The practice is already on your home, and the season begins {startLabel(data.startYmd)} — everyone counts Day 1 together.
            </p>
          </div>
        )}

        {/* The creator's notes — short, async, a few times a week. */}
        <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(143,175,150,0.7)", fontFamily: FONT, marginTop: 6 }}>
          Notes from {data.creatorName}
        </p>
        {(data.notes ?? []).length === 0 ? (
          <p style={{ fontSize: 13.5, color: "rgba(143,175,150,0.75)", fontFamily: FONT }}>
            Nothing yet — {data.creatorName} will drop a short note here a few times a week.
          </p>
        ) : (
          (data.notes ?? []).map((n) => (
            <div key={n.id} style={{ ...card, padding: 16 }}>
              <p style={{ fontSize: 14.5, color: "rgba(240,237,230,0.95)", fontFamily: FONT, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{n.body}</p>
              {n.createdAt && (
                <p style={{ fontSize: 11.5, color: "rgba(143,175,150,0.6)", fontFamily: FONT, marginTop: 8 }}>
                  {new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  // ── Landing — take the practice home ───────────────────────────────────────
  const lines = summarize(data.spec);
  const weeks = Math.round(data.durationDays / 7);
  return (
    <div style={wrap}><Backdrop />
      <div>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
          A season with {data.creatorName} 🌿
        </p>
        <h1 style={{ fontSize: 25, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.22 }}>{data.title}</h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
          {weeks} weeks, starting {startLabel(data.startYmd)}
          {data.memberCount > 0 ? ` · ${data.memberCount} ${data.memberCount === 1 ? "person is" : "people are"} in` : ""}
        </p>
      </div>

      {data.description?.trim() && (
        <div style={card}>
          <p style={{ fontSize: 14.5, color: "rgba(240,237,230,0.95)", fontFamily: FONT, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{data.description.trim()}</p>
        </div>
      )}

      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        {lines.length === 0 ? (
          <p style={{ color: "rgba(182,210,188,0.9)", fontFamily: FONT, fontSize: 14 }}>A gentle daily practice.</p>
        ) : lines.map((l, i) => (
          <p key={i} style={{ color: "rgba(240,237,230,0.95)", fontFamily: FONT, fontSize: 14.5, lineHeight: 1.35 }}>{l}</p>
        ))}
      </div>

      <p style={{ fontSize: 12.5, color: "rgba(143,175,150,0.8)", fontFamily: FONT, textAlign: "center" }}>
        One tap sets the practice up as your daily rhythm for the season. {data.creatorName} shows up with short notes;
        the group sees each other's daily check-ins. Finite on purpose — {weeks} weeks, then it's yours.
      </p>

      {error && <p style={{ color: "#E5A3A3", fontSize: 13, fontFamily: FONT, textAlign: "center" }}>{error}</p>}

      {user ? (
        <button type="button" onClick={join} disabled={joining} style={{ ...primaryBtn, opacity: joining ? 0.6 : 1 }}>
          {joining ? "Joining…" : "Join the season"}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setLocation(`/signin?mode=signup&redirect=${encodeURIComponent(`/season/${token}`)}`)}
            style={primaryBtn}
          >
            Sign in to join
          </button>
          <p style={{ fontSize: 12.5, color: "rgba(143,175,150,0.7)", fontFamily: FONT, textAlign: "center" }}>
            Come back to this link after signing in.
          </p>
        </>
      )}
    </div>
  );
}
