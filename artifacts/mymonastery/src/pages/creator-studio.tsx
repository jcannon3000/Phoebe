/**
 * Creator studio — /creator ("Creator" in Admin tools).
 *
 * A creator's behavioral content lights people up and then evaporates — this is
 * the delivery mechanism for the second half. The studio turns a recommendation
 * into a BOUNDED SEASON: design the practice in the customizer (prescribe mode
 * — never touches your own rhythm), give it a title / the creator's name / a
 * short description in their voice / a length + start date, and mint the
 * one-tap join link that goes in the video description. Members live it as a
 * cohort (shared Day-N clock, witnessed daily check-ins) while the creator
 * drops short async notes from this page.
 *
 * Access: super admins create + post notes (operator-run for now); beta users
 * can SEE the seasons list. Everyone else is bounced home.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import WayOfLoveRuleFlow, { type RoutineSpec } from "@/components/WayOfLoveRuleFlow";
import { apiRequest } from "@/lib/queryClient";
import { pushRoutineConfig } from "@/lib/routineSync";
import { useBetaStatus } from "@/hooks/useDemo";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// Same snapshot/restore as prescribe-routine.tsx: designing a season mutates
// the designer's own routine localStorage as the customizer's controls write —
// snapshot on entry, restore on exit, so their own rhythm is untouched.
const ROUTINE_PREFIXES = ["phoebe:office:", "phoebe:slot:"];
const ROUTINE_EXACT = [
  "phoebe:journaling-slot", "phoebe:scripture-scope", "phoebe:fdd-mode",
  "phoebe:psalm-cycle", "phoebe:contemplation-style", "phoebe:routine:updated-at",
  "phoebe:cobreathe-length", "phoebe:commitment-start", "phoebe:weekly-practices",
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
  pushRoutineConfig();
}

type SeasonRow = {
  id: number; token: string; title: string; creatorName: string;
  durationDays: number; startYmd: string; memberCount: number;
};

function localYmd(): string {
  return new Date().toLocaleDateString("en-CA");
}

export default function CreatorStudioPage() {
  const [, setLocation] = useLocation();
  const { rawIsBeta, rawIsAdmin: isAdmin, isLoading: statusLoading } = useBetaStatus();
  const qc = useQueryClient();
  const canSee = isAdmin || rawIsBeta;

  // Not for everyone (yet) — bounce anyone who isn't a super admin or beta.
  // Wait for /api/beta/status to RESOLVE first: on a cold load / deep link the
  // flags are false while loading, which bounced even super admins.
  useEffect(() => {
    if (!statusLoading && !canSee) setLocation("/dashboard", { replace: true });
  }, [statusLoading, canSee, setLocation]);

  const { data: list } = useQuery<{ seasons: SeasonRow[] }>({
    queryKey: ["/api/creator/seasons"],
    queryFn: () => apiRequest("GET", "/api/creator/seasons"),
    enabled: canSee,
  });

  const snapRef = useRef<Record<string, string> | null>(null);
  const restoredRef = useRef(false);
  const restoreNow = () => {
    if (!restoredRef.current && snapRef.current) { restoreRoutine(snapRef.current); restoredRef.current = true; snapRef.current = null; }
  };
  useEffect(() => () => { restoreNow(); }, []); // restore on unmount if mid-design

  const [phase, setPhase] = useState<"list" | "design" | "details" | "done">("list");
  const [spec, setSpec] = useState<RoutineSpec | null>(null);
  const [title, setTitle] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [description, setDescription] = useState("");
  const [durationDays, setDurationDays] = useState(21);
  const [startYmd, setStartYmd] = useState(() => localYmd());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Note composer (per season, from the list).
  const [noteFor, setNoteFor] = useState<SeasonRow | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteSent, setNoteSent] = useState(false);

  const beginDesign = () => {
    snapRef.current = snapshotRoutine();
    restoredRef.current = false;
    setPhase("design");
  };
  const handlePrescribe = (s: RoutineSpec) => {
    setSpec(s);
    restoreNow();
    setPhase("details");
  };

  const create = async () => {
    if (!spec || busy) return;
    if (!title.trim() || !creatorName.trim()) { setError("A title and the creator's name are needed."); return; }
    setBusy(true); setError(null);
    try {
      const res = await apiRequest("POST", "/api/creator/seasons", {
        title: title.trim(), creatorName: creatorName.trim(),
        description: description.trim() || undefined,
        spec, durationDays, startYmd,
      }) as { url?: string };
      if (!res?.url) throw new Error("no url");
      setUrl(res.url);
      setPhase("done");
      qc.invalidateQueries({ queryKey: ["/api/creator/seasons"] });
    } catch {
      setError("Couldn't create the season. Seasons need an app super admin.");
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = async (u: string) => {
    try {
      if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
        await (navigator as Navigator).share({ title: "Phoebe season", url: u });
        return;
      }
    } catch { /* fall through to copy */ }
    try { await navigator.clipboard.writeText(u); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  const postNote = async () => {
    if (!noteFor || !noteBody.trim() || noteBusy) return;
    setNoteBusy(true);
    try {
      await apiRequest("POST", `/api/creator/seasons/${noteFor.token}/notes`, { body: noteBody.trim() });
      setNoteBody(""); setNoteSent(true);
      setTimeout(() => { setNoteSent(false); setNoteFor(null); }, 1200);
    } catch { /* leave the sheet open; they can retry */ } finally {
      setNoteBusy(false);
    }
  };

  if (!canSee) return null;

  if (phase === "design") {
    return (
      <WayOfLoveRuleFlow
        prescribe
        onPrescribe={handlePrescribe}
        onBack={() => { restoreNow(); setPhase("list"); }}
        onDone={() => { /* unused in prescribe mode */ }}
      />
    );
  }

  const wrap: React.CSSProperties = {
    minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "flex-start",
    alignItems: "stretch", gap: 14, padding: "max(2.2rem, var(--safe-top, 1rem)) 22px 40px", maxWidth: 520, margin: "0 auto",
  };
  const card: React.CSSProperties = {
    background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
    border: "1px solid rgba(46,107,64,0.35)", borderRadius: 18, padding: 18,
  };
  const inputStyle: React.CSSProperties = {
    ...card, padding: "13px 15px", color: WARM, fontFamily: FONT, fontSize: 15, outline: "none", width: "100%",
  };
  const primaryBtn: React.CSSProperties = {
    background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)",
    borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
  };
  const quietBtn: React.CSSProperties = {
    background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)",
    borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
  };
  const pill = (label: string, on: boolean, onClick: () => void) => (
    <button key={label} type="button" onClick={onClick}
      style={{ borderRadius: 999, padding: "10px 16px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
        background: on ? "rgba(46,107,64,0.85)" : "rgba(46,107,64,0.16)", color: WARM,
        border: `1px solid ${on ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.3)"}` }}>
      {label}
    </button>
  );

  // ── Details — name the season, set the frame ───────────────────────────────
  if (phase === "details") {
    return (
      <div style={wrap}>
        <div>
          <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
            Practice ready 🌿
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>Frame the season</h1>
          <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
            What viewers see when the link opens — the title, whose season it is, and how long it holds.
          </p>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
          placeholder="Season title — e.g. A reading practice that feels expansive" style={inputStyle} />
        <input value={creatorName} onChange={(e) => setCreatorName(e.target.value)} maxLength={80}
          placeholder="Creator's name — e.g. Nina Montagne" style={inputStyle} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={4}
          placeholder="A short landing note in the creator's voice — why this practice, what the season is like."
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
        <div>
          <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(143,175,150,0.7)", fontFamily: FONT, marginBottom: 8 }}>Length</p>
          <div style={{ display: "flex", gap: 8 }}>
            {[14, 21, 28].map((d) => pill(`${d / 7} weeks`, durationDays === d, () => setDurationDays(d)))}
          </div>
        </div>
        <div>
          <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(143,175,150,0.7)", fontFamily: FONT, marginBottom: 8 }}>Day 1</p>
          <input type="date" value={startYmd} min={localYmd()} onChange={(e) => setStartYmd(e.target.value || localYmd())}
            style={{ ...inputStyle, colorScheme: "dark" }} />
        </div>
        {error && <p style={{ color: "#E5A3A3", fontSize: 13, fontFamily: FONT }}>{error}</p>}
        <button type="button" onClick={create} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Creating…" : "Create the season link"}
        </button>
        <button type="button" onClick={() => setPhase("list")} style={quietBtn}>Cancel</button>
      </div>
    );
  }

  // ── Done — the link that goes in the description ───────────────────────────
  if (phase === "done" && url) {
    return (
      <div style={{ ...wrap, justifyContent: "center", minHeight: "100dvh" }}>
        <div>
          <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
            Season live 🔗
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>
            “{title.trim()}” is ready
          </h1>
          <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
            This is the link for the video description. One tap takes the practice home and joins the cohort — Day 1 is {startLabelYmd(startYmd)}.
          </p>
        </div>
        <div style={{ ...card, wordBreak: "break-all", color: "rgba(182,210,188,0.9)", fontFamily: FONT, fontSize: 13 }}>{url}</div>
        <button type="button" onClick={() => shareUrl(url)} style={primaryBtn}>{copied ? "Copied ✓" : "Share link"}</button>
        <button type="button" onClick={() => { setPhase("list"); setSpec(null); setTitle(""); setDescription(""); setUrl(null); }} style={quietBtn}>
          Done
        </button>
      </div>
    );
  }

  // ── List — every season, with member counts + note composer ────────────────
  const seasons = list?.seasons ?? [];
  return (
    <div style={wrap}>
      <button onClick={() => setLocation("/admin/tools")} style={{ alignSelf: "flex-start", background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14.5, cursor: "pointer", padding: "4px 0" }}>← Admin tools</button>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24 }} aria-hidden>🎬</span>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT }}>Creator</h1>
        </div>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 6, lineHeight: 1.5 }}>
          Turn a creator's recommendation into a bounded season: design the practice, mint the one-tap link for the
          video description, and the cohort lives it together — witnessed daily check-ins, short notes from the creator,
          finite on purpose.
        </p>
      </div>

      {isAdmin && (
        <button type="button" onClick={beginDesign} style={primaryBtn}>＋ New season</button>
      )}

      {seasons.length === 0 ? (
        <p style={{ fontSize: 14, color: "rgba(143,175,150,0.75)", fontFamily: FONT, textAlign: "center", marginTop: 18 }}>
          No seasons yet{isAdmin ? " — design the first one." : "."}
        </p>
      ) : seasons.map((s) => (
        <div key={s.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.3 }}>{s.title}</p>
          <p style={{ fontSize: 13, color: SAGE, fontFamily: FONT }}>
            {s.creatorName} · {Math.round(s.durationDays / 7)} weeks from {startLabelYmd(s.startYmd)} · {s.memberCount} joined
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setLocation(`/season/${s.token}`)} style={{ ...quietBtn, padding: "9px 14px", fontSize: 13 }}>Open</button>
            <button type="button" onClick={() => shareUrl(`https://withphoebe.app/season/${s.token}`)} style={{ ...quietBtn, padding: "9px 14px", fontSize: 13 }}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            {isAdmin && (
              <button type="button" onClick={() => { setNoteFor(s); setNoteBody(""); }} style={{ ...quietBtn, padding: "9px 14px", fontSize: 13 }}>
                ✍️ Drop a note
              </button>
            )}
          </div>
          {noteFor?.id === s.id && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} maxLength={2000} rows={3}
                placeholder={`A short note to everyone in "${s.title}"…`}
                style={{ ...inputStyle, padding: "11px 13px", fontSize: 14, resize: "vertical", lineHeight: 1.5 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={postNote} disabled={noteBusy || !noteBody.trim()}
                  style={{ ...primaryBtn, padding: "10px 16px", fontSize: 14, opacity: noteBusy || !noteBody.trim() ? 0.6 : 1 }}>
                  {noteSent ? "Sent ✓" : noteBusy ? "Sending…" : "Send to the season"}
                </button>
                <button type="button" onClick={() => setNoteFor(null)} style={{ ...quietBtn, padding: "10px 16px", fontSize: 14 }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function startLabelYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}
