/**
 * Routine invite — the recipient side of a prescribed routine.
 *
 * Someone's community leader designed a daily rhythm and shared /routine/:token.
 * This page shows what the routine contains and, on accept, applies it to the
 * recipient's account: offices, home layout, contemplation/silence, and the
 * per-device routine config. It never touches their prayers, fellows, or journals.
 */
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { adoptRoutineConfig } from "@/lib/routineSync";
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
type LandingData = { label: string | null; groupName: string | null; createdByName: string | null; spec: RoutineSpec };

// Human labels for the home-layout module keys we surface in the summary.
const CARD_LABELS: Record<string, string> = {
  gratitude: "Gratitude", journaling: "Journaling", reading: "Reading",
  podcasts: "Podcasts", examen: "Examen", listening: "Audio Divina",
  lectio: "Lectio Divina", scripture: "Scripture audio", walk: "Walking prayer",
  cobreathe: "Creation Prayer", "prayer-list": "Prayer list",
  cac: "Richard Rohr (CAC)", fdd: "Forward Day by Day", ssje: "SSJE",
};
const OFFICE_LABEL: Record<string, string> = { devotion: "Daily Devotion", office: "Daily Office", none: "" };

function summarize(spec: RoutineSpec): string[] {
  const out: string[] = [];
  const op = spec.officePrefs;
  if (op.morning !== "none") out.push(`Morning — ${OFFICE_LABEL[op.morning]}${op.morningTime ? ` at ${op.morningTime}` : ""}`);
  if (op.evening !== "none") out.push(`Evening — ${OFFICE_LABEL[op.evening]}${op.eveningTime ? ` at ${op.eveningTime}` : ""}`);
  if (spec.silenceLadderEnabled) out.push("Silence — a growing daily practice");
  else if (op.contemplationGoalMinutes > 0) out.push(`Silence — ${op.contemplationGoalMinutes} min a day`);
  const hidden = new Set(spec.homeLayout.hidden);
  const cards = spec.homeLayout.order.filter((k) => CARD_LABELS[k] && !hidden.has(k)).map((k) => CARD_LABELS[k]);
  if (cards.length) out.push(`Practices — ${cards.join(" · ")}`);
  return out;
}

export default function RoutineInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const valid = /^[a-f0-9]{32}$/i.test(token ?? "");

  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<LandingData>({
    queryKey: [`/api/prescribed-routines/${token}`],
    queryFn: () => apiRequest("GET", `/api/prescribed-routines/${token}`),
    enabled: valid,
    retry: false,
  });

  const accept = async () => {
    if (applying || !data) return;
    setApplying(true); setError(null);
    try {
      await apiRequest("POST", `/api/prescribed-routines/${token}/accept`, {});
      // Mirror the routine onto THIS device so the home reflects it immediately
      // (the home reads office levels / slots straight from localStorage).
      adoptRoutineConfig(data.spec.ruleConfig);
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] });
      qc.invalidateQueries({ queryKey: ["/api/me/silence-ladder"] });
      setApplied(true);
      setTimeout(() => setLocation("/dashboard"), 1200);
    } catch {
      setError("Couldn't apply the routine. Please try again.");
    } finally {
      setApplying(false);
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
        <h1 style={{ fontSize: 22, fontWeight: 700, color: WARM, fontFamily: FONT }}>Routine not found</h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT }}>This routine link may have been removed.</p>
      </div>
    );
  }

  const lines = summarize(data.spec);
  const fromWho = data.createdByName
    ? `${data.createdByName}${data.groupName ? ` · ${data.groupName}` : ""}`
    : (data.groupName ?? "Your community");

  return (
    <div style={wrap}><Backdrop />
      <div>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
          A rhythm for you 🌿
        </p>
        <h1 style={{ fontSize: 25, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.22 }}>
          {data.label?.trim() || "A daily rhythm to try"}
        </h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
          {fromWho} put this together for you.
        </p>
      </div>

      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        {lines.length === 0 ? (
          <p style={{ color: "rgba(182,210,188,0.9)", fontFamily: FONT, fontSize: 14 }}>A gentle daily rhythm.</p>
        ) : lines.map((l, i) => (
          <p key={i} style={{ color: "rgba(240,237,230,0.95)", fontFamily: FONT, fontSize: 14.5, lineHeight: 1.35 }}>{l}</p>
        ))}
      </div>

      <p style={{ fontSize: 12.5, color: "rgba(143,175,150,0.8)", fontFamily: FONT, textAlign: "center" }}>
        This sets your offices, practices, and silence. Your prayer list and everything personal stays exactly as it is.
      </p>

      {!user ? (
        <>
          <button type="button" onClick={() => setLocation("/signin")} style={primaryBtn}>Sign in to add this rhythm</button>
          <p style={{ fontSize: 12, color: SAGE, fontFamily: FONT, textAlign: "center" }}>
            Come back to this link after signing in.
          </p>
        </>
      ) : applied ? (
        <button type="button" disabled style={{ ...primaryBtn, opacity: 0.7 }}>Added to your day ✓</button>
      ) : (
        <>
          {error && <p style={{ color: "#E5A3A3", fontSize: 13, fontFamily: FONT, textAlign: "center" }}>{error}</p>}
          <button type="button" onClick={accept} disabled={applying} style={{ ...primaryBtn, opacity: applying ? 0.6 : 1 }}>
            {applying ? "Adding…" : "Add this rhythm to my day"}
          </button>
          <button type="button" onClick={() => setLocation("/dashboard")}
            style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)", borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
            Not now
          </button>
        </>
      )}
    </div>
  );
}
