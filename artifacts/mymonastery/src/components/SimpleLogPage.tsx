import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { RiseSheet } from "@/components/RiseSheet";
import { markPracticeDoneToday, type OptionalPractice } from "@/lib/practiceCompletion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// A reusable logging-first practice page (rise sheet) modeled on Audio Divina /
// Lectio: one "what" field + a free-text "Notes" field, an optional
// share-with-fellows toggle, a frosted Log button, an inline log preview (first
// 7, yours + fellows), and a full history view. Backed by /api/practice-log/:kind.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

const glassField = {
  background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(12.6px)", WebkitBackdropFilter: "blur(12.6px)",
  border: "1px solid rgba(200,212,192,0.18)", color: WARM, fontFamily: FONT,
} as const;
const glassRow = {
  background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(12.6px)", WebkitBackdropFilter: "blur(12.6px)",
  border: "1px solid rgba(200,212,192,0.18)",
} as const;
const FROST_CTA = {
  background: "rgba(9,26,16, 0.462)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
  border: "1px solid rgba(200,212,192,0.28)",
} as const;

type ServerEntry = { id: number; day: string; what: string; notes: string; shared?: boolean; createdAt: string };
type SharedEntry = { id: number; day: string; what: string; notes: string; createdAt: string; authorName: string; avatarUrl: string | null; isYou: boolean };
type View = "log" | "history";

export function SimpleLogPage({ kind, practiceKey, title, subtitle, emoji, whatLabel, whatPlaceholder, logCta }: {
  kind: string;
  practiceKey: OptionalPractice;
  title: string;
  subtitle: string;
  emoji: string;
  whatLabel: string;
  whatPlaceholder: string;
  logCta: string;
}) {
  const [view, setView] = useState<View>("log");
  const [what, setWhat] = useState("");
  const [notes, setNotes] = useState("");
  const [shareOn, setShareOn] = useState(false);
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const qc = useQueryClient();
  const listKey = [`/api/practice-log/${kind}`];
  const sharedKey = [`/api/practice-log/${kind}/shared`];
  const { data: logData } = useQuery<{ entries: ServerEntry[] }>({ queryKey: listKey, queryFn: () => apiRequest("GET", `/api/practice-log/${kind}`), staleTime: 60_000 });
  const { data: sharedData } = useQuery<{ entries: SharedEntry[] }>({ queryKey: sharedKey, queryFn: () => apiRequest("GET", `/api/practice-log/${kind}/shared`), staleTime: 60_000 });
  const entries = logData?.entries ?? [];
  const sharedEntries = sharedData?.entries ?? [];

  const logMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/practice-log/${kind}`, { day: new Date().toLocaleDateString("en-CA"), what: what.trim(), notes: notes.trim(), shared: shareOn }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: listKey }); qc.invalidateQueries({ queryKey: sharedKey }); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/practice-log/${kind}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: listKey }); qc.invalidateQueries({ queryKey: sharedKey }); },
  });
  const shareMutation = useMutation({
    mutationFn: ({ id, shared }: { id: number; shared: boolean }) => apiRequest("POST", `/api/practice-log/${kind}/${id}/share`, { shared }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: listKey }); qc.invalidateQueries({ queryKey: sharedKey }); },
  });

  function logToday() {
    logMutation.mutate();
    markPracticeDoneToday(practiceKey);
    setWhat(""); setNotes(""); setShareOn(false);
    setView("history");
  }

  // ——— History ———
  if (view === "history") {
    return (
      <RiseSheet bgPhoto={bgPhoto}>
        {() => (
        <motion.div className="w-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
          <button onClick={() => setView("log")} className="text-[14px] mb-5 inline-flex items-center gap-1.5" style={{ color: SAGE, fontFamily: FONT }}>
            ← <span>{title}</span>
          </button>
          <h1 className="text-xl font-bold leading-tight mb-1" style={{ color: WARM, fontFamily: FONT }}>{title} log</h1>
          <p className="text-xs mb-4" style={{ color: SAGE, fontFamily: FONT }}>What you've kept.</p>
          {entries.length === 0 && sharedEntries.length === 0 ? (
            <p className="text-[14px] leading-relaxed mt-10 text-center" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>Nothing logged yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((e) => <YourRow key={`me-${e.id}`} e={e} onDelete={(id) => deleteMutation.mutate(id)} deleting={deleteMutation.isPending} onShare={(id, s) => shareMutation.mutate({ id, shared: s })} />)}
              {sharedEntries.filter((e) => !e.isYou).map((e) => <FellowRow key={`fe-${e.id}`} e={e} />)}
            </div>
          )}
        </motion.div>
        )}
      </RiseSheet>
    );
  }

  // ——— Log ———
  const preview = [
    ...entries.map((e) => ({ id: `me-${e.id}`, what: e.what, createdAt: e.createdAt, who: null as string | null })),
    ...sharedEntries.filter((e) => !e.isYou).map((e) => ({ id: `fe-${e.id}`, what: e.what, createdAt: e.createdAt, who: e.authorName as string | null })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 7);

  return (
    <RiseSheet bgPhoto={bgPhoto}>
      {() => (
      <div className="w-full">
        <div className="mb-7">
          <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>{title}</h1>
          <p className="text-[13px] mt-0.5" style={{ color: SAGE, fontFamily: FONT }}>{subtitle}</p>
        </div>

        {/* 1 — What */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: FONT }}>{whatLabel}</p>
        <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder={whatPlaceholder} className="w-full rounded-2xl px-4 py-3.5 mb-6 text-[15px] outline-none" style={glassField} />

        {/* 2 — Notes */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: FONT }}>
          {emoji ? `${emoji} ` : ""}Notes <span style={{ opacity: 0.6, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
        </p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} rows={4} placeholder="Anything you want to remember." className="w-full rounded-2xl px-4 py-3.5 mb-7 text-[15px] outline-none resize-none" style={{ ...glassField, lineHeight: 1.6 }} />

        {/* Sharing — wide frosted dropdown pill */}
        <div className="w-full rounded-2xl px-4 py-2.5 mb-4 flex items-center justify-between gap-3" style={FROST_CTA}>
          <span className="text-[13px] font-semibold flex-shrink-0" style={{ color: WARM, fontFamily: FONT }}>Sharing</span>
          <div style={{ position: "relative" }}>
            <select value={shareOn ? "fellows" : "private"} onChange={(e) => setShareOn(e.target.value === "fellows")} aria-label="Sharing" className="text-[14px] font-medium outline-none bg-transparent pr-5 text-right" style={{ color: WARM, fontFamily: FONT, colorScheme: "dark", appearance: "none", WebkitAppearance: "none" }}>
              <option value="private">🔒 Private</option>
              <option value="fellows">🌿 Share with fellows</option>
            </select>
            <span aria-hidden style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 11, pointerEvents: "none" }}>▾</span>
          </div>
        </div>

        <button onClick={logToday} className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform" style={{ ...FROST_CTA, color: WARM, fontFamily: FONT }}>{logCta}</button>
        <p className="text-[11px] text-center mt-3" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>Synced to your account</p>

        {preview.length > 0 && (
          <div className="mt-9">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[15px] font-bold" style={{ color: WARM, fontFamily: FONT }}>{title} log</h2>
              <button onClick={() => setView("history")} className="text-[12.5px]" style={{ color: SAGE, fontFamily: FONT }}>View all ›</button>
            </div>
            <div className="flex flex-col gap-2">
              {preview.map((c) => {
                const d = new Date(c.createdAt);
                const day = Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                return (
                  <div key={c.id} className="rounded-2xl px-4 py-3" style={glassRow}>
                    <p className="text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: FONT }}>{c.what?.trim() || "Logged"}</p>
                    <p className="text-[11.5px] mt-0.5 truncate" style={{ color: SAGE, fontFamily: FONT }}>{c.who ? `${c.who} · ` : ""}{day}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      )}
    </RiseSheet>
  );
}

function YourRow({ e, onDelete, deleting, onShare }: { e: ServerEntry; onDelete: (id: number) => void; deleting: boolean; onShare: (id: number, shared: boolean) => void }) {
  const d = new Date(e.day + "T12:00:00");
  const day = Number.isNaN(d.getTime()) ? e.day : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3" style={glassRow}>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{e.what?.trim() || "Logged"}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: SAGE, fontFamily: FONT }}>{day}</p>
        {e.notes?.trim() ? <p className="text-[12.5px] mt-1.5 leading-snug" style={{ color: "rgba(240,237,230,0.78)", fontFamily: FONT }}>{e.notes.trim()}</p> : null}
        <button type="button" onClick={() => onShare(e.id, !e.shared)} className="text-[11px] mt-1.5 transition-opacity hover:opacity-80" style={{ color: e.shared ? "#A8C5A0" : "rgba(143,175,150,0.65)", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT }}>
          {e.shared ? "🌿 Shared with fellows · make private" : "Share with fellows"}
        </button>
      </div>
      <button onClick={() => onDelete(e.id)} disabled={deleting} aria-label="Delete entry" className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-100 disabled:opacity-40 self-start" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(200,150,140,0.9)", opacity: 0.75 }}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function FellowRow({ e }: { e: SharedEntry }) {
  const d = new Date(e.day + "T12:00:00");
  const day = Number.isNaN(d.getTime()) ? e.day : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3" style={glassRow}>
      {e.avatarUrl ? (
        <img src={e.avatarUrl} alt={e.authorName} className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{ border: "1px solid rgba(46,107,64,0.4)" }} />
      ) : (
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0", fontFamily: FONT }}>{(e.authorName.trim()[0] ?? "?").toUpperCase()}</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[11.5px]" style={{ color: SAGE, fontFamily: FONT }}>{e.authorName} · {day}</p>
        <p className="text-[14px] font-medium mt-0.5" style={{ color: WARM, fontFamily: FONT }}>{e.what?.trim() || "Logged"}</p>
        {e.notes?.trim() ? <p className="text-[12.5px] mt-1.5 leading-snug" style={{ color: "rgba(240,237,230,0.78)", fontFamily: FONT }}>{e.notes.trim()}</p> : null}
      </div>
    </div>
  );
}
