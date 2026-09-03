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
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import WayOfLoveRuleFlow, { type RoutineSpec } from "@/components/WayOfLoveRuleFlow";
import { Layout } from "@/components/layout";
import { takePrescribedSpec } from "@/lib/prescribeHandoff";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { apiRequest } from "@/lib/queryClient";
import { setRoutineSyncSuspended } from "@/lib/routineSync";
import { snapshotRoutine, restoreRoutine } from "@/lib/routineDesignGuard";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// The snapshot/restore guard moved to lib/routineDesignGuard — the preset
// editor (admin-presets.tsx) needs exactly the same one, and a second copy of
// a key list is how this one drifted twice before.
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
  // Same full-screen leaf backdrop the normal customizer uses, picked once so
  // it can't reshuffle between steps.
  const flowLeaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  /**
   * Coming back from the questionnaire with a finished routine.
   *
   * The interview runs on its own route and hands the spec over through
   * sessionStorage (lib/prescribeHandoff). Taking it CONSUMES it, so a refresh
   * of this screen doesn't resurrect a routine that was already turned into a
   * link.
   *
   * Runs before the design phase renders, so an admin who used the
   * questionnaire lands straight on naming rather than being dropped back at
   * the start of the manual customizer they deliberately skipped.
   */
  useEffect(() => {
    const handed = takePrescribedSpec();
    if (!handed) return;
    setSpec(handed as RoutineSpec);
    setPhase("name");
  }, []);

  // Snapshot the admin's own routine on entry; restore on leave.
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
    // Owner: "the progress bar is too high... in the customizer." This route
    // rendered the flow BARE while rule-of-life.tsx (the normal way in) wraps
    // it in a chromeless <Layout>. The flow's shell only carries its own
    // paddingTop:24 and relies on Layout for the header/safe-area offset, so
    // without it the step header — the progress bar is its first element —
    // rode up under the status bar on a phone. Mounted the same way here, so
    // designing for someone else looks identical to designing your own; that
    // also restores the leaf backdrop (owned by Layout's bgPhoto, so it
    // covers behind the header) and the top-right X, neither of which this
    // route had.
    return (
      <Layout bgPhoto={flowLeaf} chromeless onClose={() => setLocation(backTarget)}>
        <WayOfLoveRuleFlow
          prescribe
          onPrescribe={handlePrescribe}
          onBack={() => setLocation(backTarget)}
          onDone={() => { /* unused in prescribe mode — commit() routes to onPrescribe */ }}
        />
      </Layout>
    );
  }

  // ── Name + share ─────────────────────────────────────────────────────────
  const wrap: React.CSSProperties = {
    minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center",
    alignItems: "stretch", gap: 18, /* Safe-area insets, not flat numbers: this is a full-height layer, so its
           padding measures from the very top of the display — notch included —
           and a flat value sits the panel under the status bar. Reported on the
           community rule-of-life screen ("the UI is too high"); these are the
           same declaration. Floored at the old values. */
        padding: "calc(var(--safe-top, 0px) + 24px) 22px calc(env(safe-area-inset-bottom, 0px) + 24px)", maxWidth: 460, margin: "0 auto",
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
