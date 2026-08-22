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
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";
import { ensureAnonymousUser } from "@/lib/guestProvision";
import { cacheHomeLayoutLocalOnly } from "@/lib/homeLayoutCache";
import { setGuestSilenceGoalMin } from "@/lib/guestSeed";

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
  reading: "Reading",
  podcasts: "Podcasts", examen: "Examen", listening: "Audio Divina",
  walk: "Walking prayer",
  cobreathe: "Creation Prayer", "prayer-list": "Prayer list",
  cac: "Richard Rohr (CAC)", fdd: "Forward Day by Day", ssje: "SSJE",
};
const OFFICE_LABEL: Record<string, string> = { devotion: "Daily Devotion", office: "Daily Office", none: "" };

// The weekly Way of Love practices the rule carries (ruleConfig
// "phoebe:weekly-practices" — a JSON array of kinds). Shown as its own
// summary line so an adopter sees the week's shape, not just the day's.
const WEEKLY_LABELS: Record<string, string> = { commune: "Commune", go: "Go", bless: "Bless", rest: "Rest" };
function weeklyLine(ruleConfig: Record<string, string> | undefined): string | null {
  try {
    const raw = ruleConfig?.["phoebe:weekly-practices"];
    if (!raw) return null;
    const kinds = (JSON.parse(raw) as unknown[]).filter((k): k is string => typeof k === "string" && k in WEEKLY_LABELS);
    if (kinds.length === 0) return null;
    return `Each week — ${kinds.map((k) => WEEKLY_LABELS[k]).join(" · ")}`;
  } catch { return null; }
}

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
  const weekly = weeklyLine(spec.ruleConfig);
  if (weekly) out.push(weekly);
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

  // Write the FULL rule onto THIS device — office levels/slots (ruleConfig), the
  // practice cards (home layout), and the silence goal. A guest's home reads all
  // of these from localStorage, so this alone makes them start praying the rule;
  // the server accept just persists it to their anon account and counts it.
  const applyDeviceLocal = (spec: RoutineSpec) => {
    try { adoptRoutineConfig(spec.ruleConfig); } catch { /* ignore */ }
    try { cacheHomeLayoutLocalOnly(spec.homeLayout); } catch { /* ignore */ }
    try { setGuestSilenceGoalMin(spec.officePrefs.contemplationGoalMinutes || 0); } catch { /* ignore */ }
  };

  // NO SIGN-UP — the heart of the QR parish sign. Provision an anonymous device
  // user, apply the rule locally + server-side, and drop them on the home
  // already praying this rhythm. A cold-scanned newcomer never touches sign-in.
  const beginNoLogin = async () => {
    if (applying || !data) return;
    setApplying(true); setError(null);
    // Provision the anonymous session (idempotent) so the accept below persists
    // + syncs. Offline / rate-limited → the device-local apply still works.
    try { await ensureAnonymousUser(); } catch { /* non-fatal */ }
    applyDeviceLocal(data.spec);
    try { await apiRequest("POST", `/api/prescribed-routines/${token}/accept`, {}); } catch { /* non-fatal — already live on device */ }
    qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] });
    qc.invalidateQueries({ queryKey: ["/api/me/silence-ladder"] });
    setApplied(true);
    setTimeout(() => setLocation("/dashboard"), 1000);
    setApplying(false);
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
        {/* Owner: "have it show who built it for them — like, this was tailored
            for you by Jeremy Cannon." Naming the person is the point: a rule of
            life arriving from a name you know is an invitation, and the same
            thing arriving from nobody is a settings import. */}
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
          {data.createdByName
            ? `This was tailored for you by ${data.createdByName}${data.groupName ? ` · ${data.groupName}` : ""}.`
            : `${fromWho} put this together for you.`}
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
        PHOEBE_GUEST_ENABLED ? (
          // Public no-login app: a newcomer (e.g. someone who just scanned the
          // parish QR sign) begins RIGHT HERE — no account. We provision an
          // anonymous device user behind the scenes and apply the rhythm.
          applied ? (
            // The no-login path has its OWN end state; the attribution belongs
            // on both, or a newcomer who begins without an account never learns
            // whose rhythm they're praying.
            <>
              <button type="button" disabled style={{ ...primaryBtn, opacity: 0.7 }}>Beginning… ✓</button>
              {data.createdByName && (
                <p style={{ fontSize: 13.5, color: SAGE, fontFamily: FONT, textAlign: "center", lineHeight: 1.55 }}>
                  Tailored for you by {data.createdByName}
                  {data.groupName ? ` · ${data.groupName}` : ""}.
                </p>
              )}
            </>
          ) : (
            <>
              {error && <p style={{ color: "#E5A3A3", fontSize: 13, fontFamily: FONT, textAlign: "center" }}>{error}</p>}
              <button type="button" onClick={beginNoLogin} disabled={applying} style={{ ...primaryBtn, opacity: applying ? 0.6 : 1 }}>
                {applying ? "Beginning…" : `Begin praying${data.groupName ? ` with ${data.groupName}` : ""}`}
              </button>
              <p style={{ fontSize: 12, color: SAGE, fontFamily: FONT, textAlign: "center" }}>
                No account needed — start in seconds. You can make one later to keep it across devices.
              </p>
            </>
          )
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                // Stash the token so App.tsx's pending-invite redirect brings
                // them straight back here once they're signed in (same
                // round-trip the fellow/companion invites use) — without it the
                // link silently dies for every brand-new invitee.
                try { sessionStorage.setItem("phoebe:routine-token", token ?? ""); } catch { /* ignore */ }
                setLocation("/signin");
              }}
              style={primaryBtn}
            >
              Sign in to add this rhythm
            </button>
            <p style={{ fontSize: 12, color: SAGE, fontFamily: FONT, textAlign: "center" }}>
              We'll bring you back here after you sign in.
            </p>
          </>
        )
      ) : applied ? (
        <>
          <button type="button" disabled style={{ ...primaryBtn, opacity: 0.7 }}>Added to your day ✓</button>
          {/* Owner: "at the end, when someone receives it, show who built it for
              them." Repeated here on purpose — the landing line is read before
              they've decided, and this is the moment it becomes their own
              rhythm. Whose hand shaped it is worth carrying into that. */}
          {data.createdByName && (
            <p style={{ fontSize: 13.5, color: SAGE, fontFamily: FONT, textAlign: "center", lineHeight: 1.55 }}>
              Tailored for you by {data.createdByName}
              {data.groupName ? ` · ${data.groupName}` : ""}.
            </p>
          )}
        </>
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
