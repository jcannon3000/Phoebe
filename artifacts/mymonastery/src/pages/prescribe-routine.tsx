/**
 * Prescribe a routine (community admin / clergy) — or, with NO community in the
 * route (/prescribe), an app-wide PRESET rule (super admins only).
 *
 * Reuses the rule-of-life customizer in "prescribe" mode: the admin designs a
 * daily rhythm exactly as they would their own, but on finish the routine is
 * CAPTURED (never written to the admin's account) and turned into a share link.
 * The community flow sends it to one person; the preset flow mints a link
 * anyone can join — the same /routine/:token landing applies it either way
 * (the server counts accepts, so one link serves many people).
 *
 * Designing here mutates the admin's own routine localStorage (the customizer's
 * controls write as you go). We snapshot those keys on entry and restore them
 * on exit so the admin's own rhythm is left exactly as it was.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import WayOfLoveRuleFlow, { type RoutineSpec } from "@/components/WayOfLoveRuleFlow";
import { apiRequest } from "@/lib/queryClient";
import { pushRoutineConfig } from "@/lib/routineSync";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// The localStorage keys the customizer writes for the routine STRUCTURE — we
// snapshot + restore exactly these so designing for someone else never touches
// the admin's own rhythm. (Mirrors ROUTINE_KEYS in lib/routineSync.ts.)
const ROUTINE_PREFIXES = ["phoebe:office:", "phoebe:slot:"];
const ROUTINE_EXACT = [
  "phoebe:journaling-slot", "phoebe:scripture-scope", "phoebe:fdd-mode",
  "phoebe:psalm-cycle", "phoebe:contemplation-style", "phoebe:routine:updated-at",
  // Also written by the customizer's controls (breath-count picker) or carried
  // in ROUTINE_KEYS — missing from this list, designing-for-others permanently
  // overwrote the designer's own values and pushed them to their devices.
  "phoebe:cobreathe-length", "phoebe:commitment-start", "phoebe:weekly-practices", "phoebe:rest-window",
];
function isRoutineKey(k: string): boolean {
  return ROUTINE_PREFIXES.some((p) => k.startsWith(p)) || ROUTINE_EXACT.includes(k);
}
function snapshotRoutine(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isRoutineKey(k)) { const v = localStorage.getItem(k); if (v != null) out[k] = v; }
    }
  } catch { /* private mode */ }
  return out;
}
function restoreRoutine(snap: Record<string, string>): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && isRoutineKey(k)) toRemove.push(k); }
    for (const k of toRemove) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
  } catch { /* private mode */ }
  // Push the admin's own (restored) routine back up so the server rule_config
  // is also reverted from any debounced writes the customizer made while designing.
  pushRoutineConfig();
}

export default function PrescribeRoutinePage() {
  // slug is absent on the /prescribe (app-wide preset, super admin) route.
  const { slug } = useParams<{ slug?: string }>();
  const backTarget = slug ? `/communities/${slug}/rule-of-life` : "/admin/tools";
  const [, setLocation] = useLocation();
  const snapRef = useRef<Record<string, string> | null>(null);
  const restoredRef = useRef(false);

  const [spec, setSpec] = useState<RoutineSpec | null>(null);
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<"design" | "name" | "done">("design");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Snapshot the admin's own routine on entry; restore on leave.
  useEffect(() => {
    snapRef.current = snapshotRoutine();
    return () => {
      if (!restoredRef.current && snapRef.current) { restoreRoutine(snapRef.current); restoredRef.current = true; }
    };
  }, []);
  const restoreNow = () => {
    if (!restoredRef.current && snapRef.current) { restoreRoutine(snapRef.current); restoredRef.current = true; }
  };

  // The customizer finished — it handed back the designed routine. Restore the
  // admin's own rhythm immediately, then move to naming + link creation.
  const handlePrescribe = (s: RoutineSpec) => {
    setSpec(s);
    restoreNow();
    setPhase("name");
  };

  const create = async () => {
    if (!spec || busy) return;
    setBusy(true); setError(null);
    try {
      // No slug → app-wide preset (server requires super admin for that path).
      const res = await apiRequest("POST", "/api/prescribed-routines", {
        ...(slug ? { groupSlug: slug } : {}), spec, label: label.trim() || undefined,
      }) as { url?: string };
      if (!res?.url) throw new Error("no url");
      setUrl(res.url);
      setPhase("done");
    } catch {
      setError(slug
        ? "Couldn't create the link. Make sure you're an admin of this community."
        : "Couldn't create the link. Preset rules need an app super admin.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!url) return;
    const text = label.trim() ? `A daily rhythm for you: ${label.trim()}` : "A daily rhythm I put together for you";
    try {
      if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
        await (navigator as Navigator).share({ title: "Phoebe routine", text, url });
        return;
      }
    } catch { /* fall through to copy */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  if (phase === "design") {
    return (
      <WayOfLoveRuleFlow
        prescribe
        onPrescribe={handlePrescribe}
        onBack={() => setLocation(backTarget)}
        onDone={() => { /* unused in prescribe mode — commit() routes to onPrescribe */ }}
      />
    );
  }

  // ── Name + share ─────────────────────────────────────────────────────────
  const wrap: React.CSSProperties = {
    minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center",
    alignItems: "stretch", gap: 18, padding: "24px 22px", maxWidth: 460, margin: "0 auto",
  };
  const card: React.CSSProperties = {
    background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
    border: "1px solid rgba(46,107,64,0.35)", borderRadius: 18, padding: 18,
  };

  if (phase === "name") {
    return (
      <div style={wrap}>
        <div>
          <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
            Routine ready 🌿
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>
            Name this rhythm
          </h1>
          <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
            Give it a short name the person will see — or leave it blank.
          </p>
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder="e.g. A rhythm for your first month"
          style={{ ...card, padding: "14px 16px", color: WARM, fontFamily: FONT, fontSize: 15, outline: "none" }}
        />
        {error && <p style={{ color: "#E5A3A3", fontSize: 13, fontFamily: FONT }}>{error}</p>}
        <button
          type="button" onClick={create} disabled={busy}
          style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Creating…" : "Create share link"}
        </button>
        <button
          type="button" onClick={() => setLocation(backTarget)}
          style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)", borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Done — share the link ─────────────────────────────────────────────────
  return (
    <div style={wrap}>
      <div>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
          Link ready 🔗
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>
          {label.trim() ? `“${label.trim()}” is ready to share` : "Your routine link is ready"}
        </h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
          Send this to the person. When they open it, they'll be asked whether to add this rhythm to their account.
        </p>
      </div>
      <div style={{ ...card, wordBreak: "break-all", color: "rgba(182,210,188,0.9)", fontFamily: FONT, fontSize: 13 }}>
        {url}
      </div>
      <button
        type="button" onClick={share}
        style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}
      >
        {copied ? "Copied ✓" : "Share link"}
      </button>
      <button
        type="button" onClick={() => setLocation(backTarget)}
        style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)", borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
      >
        Done
      </button>
    </div>
  );
}
