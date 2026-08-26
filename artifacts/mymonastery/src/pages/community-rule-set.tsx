/**
 * Set this group's RULE OF LIFE (leaders) — /communities/:slug/rule-of-life/set.
 *
 * The group's shared daily rhythm: designed once by a leader, then followed in
 * one tap by anyone who reads the group page. Reached from Community settings.
 *
 * THE DESIGN IS NOT THE DESIGNER'S. The customizer runs in `prescribe` mode,
 * which captures the spec and hands it back rather than committing it — and
 * three things guard that, because the customizer writes as you go:
 *   1. commit() returns before any PUT (the flow's own contract).
 *   2. routine sync is SUSPENDED for the session, so the half-built design is
 *      never pushed up as the leader's own rule_config.
 *   3. their localStorage is snapshotted on entry and restored on the way out.
 * A leader can design a rhythm they'd never keep themselves and walk away with
 * their own morning untouched.
 *
 * PUT mints a NEW prescribed_routines row against this group and repoints the
 * group at it — so it never joins the app-wide presets (those are group_id
 * NULL and super-admin only), and anyone still holding an old rule's link
 * keeps resolving to the rule they were given.
 */
import { useEffect, useRef, useState } from "react";
import { ROUTINE_KEYS } from "@/lib/routineSync";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import WayOfLoveRuleFlow, { type RoutineSpec } from "@/components/WayOfLoveRuleFlow";
import { apiRequest } from "@/lib/queryClient";
import { pushRoutineConfig, setRoutineSyncSuspended } from "@/lib/routineSync";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// Snapshot/restore the leader's OWN routine localStorage keys — designing the
// community's rule must never disturb their own rhythm. (Same key set as
// prescribe-routine.tsx / lib/routineSync ROUTINE_KEYS.)
const ROUTINE_PREFIXES = ["phoebe:office:", "phoebe:slot:"];
/**
 * DERIVED from ROUTINE_KEYS, not hand-copied beside it.
 *
 * This list claimed to be "the same key set" and wasn't: it was missing
 * phoebe:contemplation-log-method, phoebe:contemplation-sits,
 * phoebe:practice-days and phoebe:hide-turn-learn-pray — so designing a
 * community's rule permanently overwrote the leader's own values for those and
 * pushed them to their devices. That is the third time a hand-copied mirror of
 * this list has drifted (ROUTINE_KEYS' own comment records the first two).
 * Deriving makes the next drift impossible.
 */
const ROUTINE_EXACT = [
  ...ROUTINE_KEYS.filter((k) => !ROUTINE_PREFIXES.some((p) => k.startsWith(p))),
  // Not routine CONFIG, but written by the same screens and equally the
  // leader's own: restore them too.
  "phoebe:scripture-scope", "phoebe:routine:updated-at",
  "phoebe:commitment-start", "phoebe:weekly-practices", "phoebe:rest-window",
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
  // Designing is over: let this device sync again, and re-assert the OWN
  // routine we just put back (harmless if the server never changed — which,
  // with the suspension above, is the whole point).
  setRoutineSyncSuspended(false);
  pushRoutineConfig();
}

export default function CommunityRuleSetPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const snapRef = useRef<Record<string, string> | null>(null);
  const restoredRef = useRef(false);

  const [spec, setSpec] = useState<RoutineSpec | null>(null);
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<"design" | "name" | "done">("design");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    snapRef.current = snapshotRoutine();
    /**
     * Snapshot FIRST, then stop syncing.
     *
     * The customizer designs into the same localStorage keys this person's own
     * rhythm lives in, and every setter fires the event App.tsx pushes on — so
     * without this, designing for someone else streamed the half-built design
     * up as the designer's OWN routine. The snapshot/restore around it only
     * ever covered the device.
     */
    setRoutineSyncSuspended(true);
    return () => {
      if (!restoredRef.current && snapRef.current) { restoreRoutine(snapRef.current); restoredRef.current = true; }
    };
  }, []);
  const restoreNow = () => {
    if (!restoredRef.current && snapRef.current) { restoreRoutine(snapRef.current); restoredRef.current = true; }
  };

  const handlePrescribe = (s: RoutineSpec) => {
    setSpec(s);
    restoreNow();
    setPhase("name");
  };

  const save = async () => {
    if (!spec || busy) return;
    setBusy(true); setError(null);
    try {
      await apiRequest("PUT", `/api/groups/${slug}/rule`, { spec, label: label.trim() || undefined });
      qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/rule`] });
      setPhase("done");
    } catch {
      setError("Couldn't save the rule. Make sure you're a leader of this community.");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "design") {
    return (
      <WayOfLoveRuleFlow
        prescribe
        onPrescribe={handlePrescribe}
        onBack={() => setLocation(`/communities/${slug}`)}
        onDone={() => { /* unused in prescribe mode */ }}
      />
    );
  }

  const wrap: React.CSSProperties = {
    minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center",
    alignItems: "stretch", gap: 18, maxWidth: 460, margin: "0 auto",
    // The status bar and the home indicator own the top and bottom of the
    // screen. A flat 24px sat the whole panel too high — reported as "the
    // community rule of life UI is too high" — because a centred column on a
    // 100dvh page starts measuring from the very top of the display, notch
    // included. Insets on both ends, floored at the old padding.
    padding: "calc(env(safe-area-inset-top, 0px) + 24px) 22px calc(env(safe-area-inset-bottom, 0px) + 24px)",
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
            Rule ready 🕯️
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>
            Name your group's rule
          </h1>
          <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
            A short name people see before they follow it — "Our daily rhythm," "The Lent rule" — or leave it blank.
          </p>
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder="e.g. Our daily rhythm"
          style={{ ...card, padding: "14px 16px", color: WARM, fontFamily: FONT, fontSize: 15, outline: "none" }}
        />
        {error && <p style={{ color: "#E5A3A3", fontSize: 13, fontFamily: FONT }}>{error}</p>}
        <button
          type="button" onClick={save} disabled={busy}
          style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Saving…" : "Set as our rule of life"}
        </button>
        <button
          type="button" onClick={() => setLocation(`/communities/${slug}`)}
          style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)", borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // Done — the rule is live on the community page.
  return (
    <div style={wrap}>
      <div>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
          Rule set 🌿
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>
          {label.trim() ? `“${label.trim()}” is your group's rule` : "Your group's rule is set"}
        </h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
          It now lives on your group page, where anyone reading can follow it in one tap. Your own rhythm is
          exactly as you left it — designing this never touched it.
        </p>
      </div>
      <button
        type="button" onClick={() => setLocation(`/communities/${slug}`)}
        style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}
      >
        See it on the group page
      </button>
    </div>
  );
}
