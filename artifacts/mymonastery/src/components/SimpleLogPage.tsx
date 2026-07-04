import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { RiseSheet } from "@/components/RiseSheet";
import { markPracticeDoneToday, type OptionalPractice } from "@/lib/practiceCompletion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// A reusable logging-first practice page (rise sheet) modeled on Audio Divina /
// Lectio: one "what" field + a free-text "Notes" field, a frosted Log button, an
// inline log preview (your most recent), and a full history view. Backed by
// /api/practice-log/:kind.
//
// The log is STRICTLY PRIVATE — only ever visible to the person who wrote it.
// There is no sharing and no peer feed: a practice is presence, not performance,
// so no one can see an archive of what anyone else did. The personal log stays
// because it serves the practitioner (e.g. remembering where you left off).

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

const glassField = {
  background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
  border: "1px solid rgba(200,212,192,0.18)", color: WARM, fontFamily: FONT,
} as const;
const glassRow = {
  background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
  border: "1px solid rgba(200,212,192,0.18)",
} as const;
const FROST_CTA = {
  background: "rgba(9,26,16, 0.462)", backdropFilter: "blur(12.6px)", WebkitBackdropFilter: "blur(12.6px)",
  border: "1px solid rgba(200,212,192,0.28)",
} as const;

type ServerEntry = { id: number; day: string; what: string; notes: string; createdAt: string };
type View = "log" | "history";

export function SimpleLogPage({ kind, practiceKey, title, subtitle, emoji, whatLabel, whatPlaceholder, logCta, plainBackground = false }: {
  kind: string;
  practiceKey: OptionalPractice;
  title: string;
  subtitle: string;
  emoji: string;
  whatLabel: string;
  whatPlaceholder: string;
  logCta: string;
  // When true, skip the leaf photo and let RiseSheet's solid green show
  // through — the Contemplative Walk wants a plain green ground (owner).
  plainBackground?: boolean;
}) {
  const [view, setView] = useState<View>("log");
  const [what, setWhat] = useState("");
  const [notes, setNotes] = useState("");
  const bgPhoto = useMemo(() => (plainBackground || LEAF_PHOTOS.length === 0 ? null : LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]!), [plainBackground]);

  const qc = useQueryClient();
  const listKey = [`/api/practice-log/${kind}`];
  const { data: logData } = useQuery<{ entries: ServerEntry[] }>({ queryKey: listKey, queryFn: () => apiRequest("GET", `/api/practice-log/${kind}`), staleTime: 60_000 });
  const entries = logData?.entries ?? [];

  const logMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/practice-log/${kind}`, { day: new Date().toLocaleDateString("en-CA"), what: what.trim(), notes: notes.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: listKey }); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/practice-log/${kind}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: listKey }); },
  });

  function logToday() {
    logMutation.mutate();
    markPracticeDoneToday(practiceKey);
    setWhat(""); setNotes("");
    setView("history");
  }

  // ——— History (your own log only) ———
  if (view === "history") {
    return (
      <RiseSheet bgPhoto={bgPhoto}>
        {() => (
        <motion.div className="w-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
          <button onClick={() => setView("log")} className="text-[14px] mb-5 inline-flex items-center gap-1.5" style={{ color: SAGE, fontFamily: FONT }}>
            ← <span>{title}</span>
          </button>
          <h1 className="text-xl font-bold leading-tight mb-1" style={{ color: WARM, fontFamily: FONT }}>{title} log</h1>
          <p className="text-xs mb-4" style={{ color: SAGE, fontFamily: FONT }}>What you've kept. Private to you.</p>
          {entries.length === 0 ? (
            <p className="text-[14px] leading-relaxed mt-10 text-center" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>Nothing logged yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((e) => <YourRow key={`me-${e.id}`} e={e} onDelete={(id) => deleteMutation.mutate(id)} deleting={deleteMutation.isPending} />)}
            </div>
          )}
        </motion.div>
        )}
      </RiseSheet>
    );
  }

  // ——— Log ———
  const preview = entries
    .map((e) => ({ id: `me-${e.id}`, what: e.what, createdAt: e.createdAt }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 7);

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

        <button onClick={logToday} className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform" style={{ ...FROST_CTA, color: WARM, fontFamily: FONT }}>{logCta}</button>
        <p className="text-[11px] text-center mt-3" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>Private — kept only for you.</p>

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
                    <p className="text-[11.5px] mt-0.5 truncate" style={{ color: SAGE, fontFamily: FONT }}>{day}</p>
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

function YourRow({ e, onDelete, deleting }: { e: ServerEntry; onDelete: (id: number) => void; deleting: boolean }) {
  const d = new Date(e.day + "T12:00:00");
  const day = Number.isNaN(d.getTime()) ? e.day : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3" style={glassRow}>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{e.what?.trim() || "Logged"}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: SAGE, fontFamily: FONT }}>{day}</p>
        {e.notes?.trim() ? <p className="text-[12.5px] mt-1.5 leading-snug" style={{ color: "rgba(240,237,230,0.78)", fontFamily: FONT }}>{e.notes.trim()}</p> : null}
      </div>
      <button onClick={() => onDelete(e.id)} disabled={deleting} aria-label="Delete entry" className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-100 disabled:opacity-40 self-start" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(200,150,140,0.9)", opacity: 0.75 }}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}
