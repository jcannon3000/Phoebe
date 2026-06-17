/**
 * WalkTogether — "Walking together" on the People page. A mutual-opt-in
 * accountability layer on the Fellow bond: invite a fellow, and once you BOTH
 * say yes you can see each other's TODAY-ONLY rhythm dots and send a one-tap
 * word of encouragement. Companionship, not surveillance.
 *
 * Backed by /api/walk (beta). The outer section header is supplied by the
 * People page, mirroring FellowsConnect.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { WalkPartnerSheet, type WalkCompanion } from "@/components/WalkPartnerSheet";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_BG = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.3)";
const DOT_ON = "rgba(110,180,130,0.95)";

type Lite = { pairId: number; userId: number; name: string | null; avatarUrl: string | null; intention: string | null };
type Paused = Lite & { pausedByMe: boolean };
type Eligible = { userId: number; name: string | null; avatarUrl: string | null };
type WalkData = {
  companions: WalkCompanion[];
  incoming: Lite[];
  outgoing: Lite[];
  paused: Paused[];
  eligibleFellows: Eligible[];
};
type Nudge = { id: number; userId: number; name: string | null; avatarUrl: string | null; kind: string; at: string };

const NUDGE_PHRASE: Record<string, string> = {
  praying: "is praying for you",
  cheer: "is glad you're walking together",
  thinking: "is thinking of you",
};

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size, border: `1px solid ${CARD_B}` }} />;
  return <div className="rounded-full flex items-center justify-center font-semibold shrink-0" style={{ width: size, height: size, background: "#1A4A2E", color: "#A8C5A0", fontSize: size * 0.32, fontFamily: FONT }}>{initials(name)}</div>;
}
function Pill({ label, onClick, kind = "solid", disabled }: { label: string; onClick?: () => void; kind?: "solid" | "ghost" | "muted"; disabled?: boolean }) {
  const styles = {
    solid: { background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)" },
    ghost: { background: "rgba(200,212,192,0.08)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.4)" },
    muted: { background: "transparent", color: "rgba(182,210,188,0.5)", border: "1px solid rgba(143,175,150,0.22)" },
  }[kind];
  return <button type="button" onClick={onClick} disabled={disabled} className="shrink-0 rounded-full text-[12.5px] font-semibold px-3.5 py-1.5 transition-opacity active:scale-[0.97]" style={{ ...styles, fontFamily: FONT, opacity: disabled ? 0.6 : 1 }}>{label}</button>;
}

// The 6px dot strip — identical language to the header Daily-progress pill.
function Dots({ anchors }: { anchors: Array<{ key: string; done: boolean }> }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden>
      {anchors.map((d) => (
        <span key={d.key} style={{ width: 6, height: 6, borderRadius: 999, display: "inline-block", background: d.done ? DOT_ON : "transparent", border: d.done ? "none" : "1px solid rgba(143,175,150,0.5)" }} />
      ))}
    </span>
  );
}

export function WalkTogether() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [optInvited, setOptInvited] = useState<Set<number>>(() => new Set());

  const { data } = useQuery<WalkData>({ queryKey: ["/api/walk"], queryFn: () => apiRequest("GET", "/api/walk"), staleTime: 30_000 });
  const { data: nudgeData } = useQuery<{ nudges: Nudge[] }>({ queryKey: ["/api/walk/nudges"], queryFn: () => apiRequest("GET", "/api/walk/nudges"), staleTime: 30_000 });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["/api/walk"] }); };
  const invite = useMutation({ mutationFn: (userId: number) => apiRequest("POST", "/api/walk/request", { userId }), onSuccess: invalidate });
  const accept = useMutation({ mutationFn: (pairId: number) => apiRequest("POST", `/api/walk/requests/${pairId}/accept`), onSuccess: invalidate });
  const decline = useMutation({ mutationFn: (pairId: number) => apiRequest("POST", `/api/walk/requests/${pairId}/decline`), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: (pairId: number) => apiRequest("POST", `/api/walk/${pairId}/resume`), onSuccess: invalidate });

  // Warm welcome of any words sent to me, then quietly mark them seen.
  const nudges = nudgeData?.nudges ?? [];
  const [showWords, setShowWords] = useState(true);
  useEffect(() => {
    if (nudges.length === 0) return undefined;
    const t = setTimeout(() => { apiRequest("POST", "/api/walk/nudges/seen").then(() => qc.invalidateQueries({ queryKey: ["/api/walk/nudges"] })).catch(() => undefined); }, 4000);
    return () => clearTimeout(t);
  }, [nudges.length]);

  const companions = data?.companions ?? [];
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];
  const paused = data?.paused ?? [];
  const eligible = data?.eligibleFellows ?? [];

  // Nothing to show and nothing to start → render nothing (clean page).
  if (companions.length === 0 && incoming.length === 0 && outgoing.length === 0 && paused.length === 0 && eligible.length === 0) {
    return null;
  }

  const addInvite = (id: number) => { invite.mutate(id); setOptInvited((s) => new Set(s).add(id)); };
  const openCompanion = companions.find((c) => c.pairId === openId) ?? null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[11px] font-bold" style={{ color: WARM }}>Walking together</p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
      </div>

      {/* Words sent to me — a soft, brief welcome. */}
      {showWords && nudges.length > 0 && (
        <div className="rounded-2xl px-4 py-3 mb-3 flex items-center gap-3" style={{ background: "rgba(46,107,64,0.2)", border: "1px solid rgba(110,180,130,0.4)" }}>
          <Avatar name={nudges[0].name ?? "Someone"} url={nudges[0].avatarUrl} size={34} />
          <p className="flex-1 min-w-0 text-[13.5px]" style={{ color: WARM, fontFamily: FONT }}>
            <span className="font-semibold">{(nudges[0].name ?? "Someone").split(/\s+/)[0]}</span> {NUDGE_PHRASE[nudges[0].kind] ?? "sent you a word"}
            {nudges.length > 1 && <span style={{ color: SAGE }}> · +{nudges.length - 1} more</span>}
          </p>
          <button type="button" onClick={() => setShowWords(false)} aria-label="Dismiss" style={{ color: "rgba(143,175,150,0.6)", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Incoming invitations to walk together. */}
      {incoming.map((r) => (
        <div key={`in-${r.pairId}`} className="rounded-2xl px-4 py-3 mb-2" style={{ background: CARD_BG, border: `1px solid ${CARD_B}` }}>
          <div className="flex items-center gap-3">
            <Avatar name={r.name ?? "Someone"} url={r.avatarUrl} />
            <div className="flex-1 min-w-0">
              <p className="truncate text-[15px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{r.name ?? "Someone"}</p>
              <p className="text-[12.5px]" style={{ color: SAGE, fontFamily: FONT }}>Invited you to walk together</p>
            </div>
          </div>
          {r.intention && <p className="text-[13px] italic mt-1.5" style={{ color: "rgba(182,210,188,0.8)", fontFamily: "Georgia, serif" }}>“{r.intention}”</p>}
          <div className="flex items-center gap-2 mt-2.5">
            <Pill label="Walk together" kind="solid" onClick={() => accept.mutate(r.pairId)} disabled={accept.isPending} />
            <Pill label="Not now" kind="muted" onClick={() => decline.mutate(r.pairId)} disabled={decline.isPending} />
          </div>
        </div>
      ))}

      {/* Active companions — tap to see today + send a word. */}
      {companions.map((c) => {
        const first = (c.name ?? "Someone").split(/\s+/)[0];
        const p = c.progress;
        return (
          <button
            key={`c-${c.pairId}`} type="button" onClick={() => setOpenId(c.pairId)}
            className="w-full text-left flex items-center gap-3 rounded-2xl px-4 py-3 mb-2 transition-opacity active:scale-[0.99]"
            style={{ background: CARD_BG, border: `1px solid ${CARD_B}` }}
          >
            <Avatar name={c.name ?? "Someone"} url={c.avatarUrl} />
            <div className="flex-1 min-w-0">
              <p className="truncate text-[15px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{c.name ?? "Someone"}</p>
              <div className="flex items-center gap-2 mt-1">
                {p && p.anchors.length > 0 && <Dots anchors={p.anchors} />}
                <span className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>
                  {!p || p.totalCount === 0 ? "Walking with you"
                    : p.allKept ? "Kept the whole rhythm today 🌿"
                    : `${p.keptCount}/${p.totalCount} kept today`}
                </span>
              </div>
              {c.intention && <p className="truncate text-[12px] italic mt-0.5" style={{ color: "rgba(182,210,188,0.65)", fontFamily: "Georgia, serif" }}>“{c.intention}”</p>}
            </div>
            {c.lastNudge && <span title={`${first} sent a word`} style={{ fontSize: 15 }}>{c.lastNudge.kind === "praying" ? "🙏" : c.lastNudge.kind === "cheer" ? "🌿" : "💛"}</span>}
          </button>
        );
      })}

      {/* Outgoing — waiting on them. */}
      {outgoing.map((r) => (
        <div key={`out-${r.pairId}`} className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-2" style={{ background: CARD_BG, border: `1px solid ${CARD_B}`, opacity: 0.85 }}>
          <Avatar name={r.name ?? "Someone"} url={r.avatarUrl} />
          <p className="flex-1 min-w-0 truncate text-[15px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{r.name ?? "Someone"}</p>
          <Pill label="Invited" kind="muted" disabled />
        </div>
      ))}

      {/* Paused — quietly resumable. */}
      {paused.map((r) => (
        <div key={`pa-${r.pairId}`} className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-2" style={{ background: CARD_BG, border: `1px solid ${CARD_B}`, opacity: 0.9 }}>
          <Avatar name={r.name ?? "Someone"} url={r.avatarUrl} />
          <div className="flex-1 min-w-0">
            <p className="truncate text-[15px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{r.name ?? "Someone"}</p>
            <p className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>{r.pausedByMe ? "Paused — sharing is off" : "Paused"}</p>
          </div>
          <Pill label="Resume" kind="ghost" onClick={() => resume.mutate(r.pairId)} disabled={resume.isPending} />
        </div>
      ))}

      {/* Invite a fellow to walk together. */}
      {eligible.length > 0 && (
        adding ? (
          <div className="rounded-2xl p-3 mt-1" style={{ background: CARD_BG, border: `1px solid ${CARD_B}` }}>
            <p className="text-[11px] uppercase tracking-[0.14em] mb-2 px-1" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>Walk with a fellow</p>
            {eligible.map((f) => {
              const invited = optInvited.has(f.userId);
              return (
                <div key={`el-${f.userId}`} className="flex items-center gap-3 py-1.5">
                  <Avatar name={f.name ?? "Someone"} url={f.avatarUrl} size={36} />
                  <p className="flex-1 min-w-0 truncate text-[14.5px]" style={{ color: WARM, fontFamily: FONT }}>{f.name ?? "Someone"}</p>
                  {invited ? <Pill label="Invited" kind="muted" disabled /> : <Pill label="Invite" kind="solid" onClick={() => addInvite(f.userId)} />}
                </div>
              );
            })}
          </div>
        ) : (
          <button
            type="button" onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 mt-1 text-[13px] font-semibold transition-opacity active:scale-[0.98]"
            style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
          >
            <Plus size={15} /> Walk with a fellow
          </button>
        )
      )}

      <WalkPartnerSheet companion={openCompanion} onClose={() => setOpenId(null)} />
    </div>
  );
}
