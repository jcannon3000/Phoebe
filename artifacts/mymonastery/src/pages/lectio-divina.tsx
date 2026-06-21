import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { RiseSheet } from "@/components/RiseSheet";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// Lectio Divina — sacred reading, kept as a logging-first JOURNAL (mirrors Audio
// Divina): read a passage slowly, then note what you felt drawn to / called to
// do. No medium, no sharing — private to the user. Every entry is kept in a log.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

const glassField = {
  background: "rgba(9,26,16,0.27)",
  backdropFilter: "blur(12.6px)",
  WebkitBackdropFilter: "blur(12.6px)",
  border: "1px solid rgba(200,212,192,0.18)",
  color: WARM,
  fontFamily: SPACE_GROTESK,
} as const;
const glassRow = {
  background: "rgba(9,26,16,0.27)",
  backdropFilter: "blur(12.6px)",
  WebkitBackdropFilter: "blur(12.6px)",
  border: "1px solid rgba(200,212,192,0.18)",
} as const;
const FROST_CTA = {
  background: "rgba(9,26,16,0.42)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  border: "1px solid rgba(200,212,192,0.28)",
} as const;

type View = "log" | "history";
type ServerEntry = { id: number; day: string; passage: string; reflection: string; createdAt: string };

export default function LectioDivinaPage() {
  const [view, setView] = useState<View>("log");
  const [passage, setPassage] = useState("");
  const [reflection, setReflection] = useState("");
  const bgPhoto = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  const qc = useQueryClient();
  const { data: logData } = useQuery<{ entries: ServerEntry[] }>({
    queryKey: ["/api/lectio-log"],
    queryFn: () => apiRequest("GET", "/api/lectio-log"),
    staleTime: 60_000,
  });
  const entries = logData?.entries ?? [];
  const logMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/lectio-log", { day: new Date().toLocaleDateString("en-CA"), passage: passage.trim(), reflection: reflection.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/lectio-log"] }); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/lectio-log/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/lectio-log"] }); },
  });

  function logToday() {
    logMutation.mutate();
    markPracticeDoneToday("lectio");
    setPassage(""); setReflection("");
    setView("history");
  }

  // ——— History (the log) ———
  if (view === "history") {
    return (
      <RiseSheet bgPhoto={bgPhoto}>
        {() => (
        <motion.div className="w-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
          <button onClick={() => setView("log")} className="text-[14px] mb-5 inline-flex items-center gap-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            ← <span>Lectio Divina</span>
          </button>
          <h1 className="text-xl font-bold leading-tight mb-1" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Lectio log</h1>
          <p className="text-xs mb-4" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>What you've sat with.</p>
          {entries.length === 0 ? (
            <p className="text-[14px] leading-relaxed mt-10 text-center" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
              Nothing logged yet. Your readings will gather here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((e) => <HistoryRow key={e.id} e={e} onDelete={(id) => deleteMutation.mutate(id)} deleting={deleteMutation.isPending} />)}
            </div>
          )}
        </motion.div>
        )}
      </RiseSheet>
    );
  }

  // ——— Log (the main screen) ———
  return (
    <RiseSheet bgPhoto={bgPhoto}>
      {() => (
      <div className="w-full">
        {/* Header — title only, no emoji */}
        <div className="mb-7">
          <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Lectio Divina</h1>
          <p className="text-[13px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>Sacred reading.</p>
        </div>

        {/* 1 — What passage? */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          What passage?
        </p>
        <input
          value={passage}
          onChange={(e) => setPassage(e.target.value)}
          placeholder="A verse, chapter, or psalm…"
          className="w-full rounded-2xl px-4 py-3.5 mb-6 text-[15px] outline-none"
          style={glassField}
        />

        {/* 2 — What did you feel drawn to or feel called to do? */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          What did you feel drawn to or feel called to do? <span style={{ opacity: 0.6, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
        </p>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value.slice(0, 500))}
          rows={4}
          placeholder="What word or phrase stayed with you?"
          className="w-full rounded-2xl px-4 py-3.5 mb-7 text-[15px] outline-none resize-none"
          style={{ ...glassField, lineHeight: 1.6 }}
        />

        {/* Log it — frosted */}
        <button
          onClick={logToday}
          className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform"
          style={{ ...FROST_CTA, color: WARM, fontFamily: SPACE_GROTESK }}
        >
          Log today's reading
        </button>

        <p className="text-[11px] text-center mt-3" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>Synced to your account</p>

        {/* Lectio log preview — section header + View all, first 7 entries. */}
        {entries.length > 0 && (
          <div className="mt-9">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[15px] font-bold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Lectio log</h2>
              <button onClick={() => setView("history")} className="text-[12.5px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>View all ›</button>
            </div>
            <div className="flex flex-col gap-2">
              {entries.slice(0, 7).map((e) => {
                const d = new Date(e.createdAt);
                const day = Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                return (
                  <div key={e.id} className="rounded-2xl px-4 py-3" style={glassRow}>
                    <p className="text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{e.passage?.trim() || "A reading"}</p>
                    <p className="text-[11.5px] mt-0.5 truncate" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{day}</p>
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

function HistoryRow({ e, onDelete, deleting }: { e: ServerEntry; onDelete: (id: number) => void; deleting: boolean }) {
  const d = new Date(e.day + "T12:00:00");
  const day = Number.isNaN(d.getTime()) ? e.day : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3" style={glassRow}>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{e.passage?.trim() || "A reading"}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{day}</p>
        {e.reflection?.trim() ? (
          <p className="text-[12.5px] mt-1.5 leading-snug" style={{ color: "rgba(240,237,230,0.78)", fontFamily: SPACE_GROTESK }}>{e.reflection.trim()}</p>
        ) : null}
      </div>
      <button
        onClick={() => onDelete(e.id)}
        disabled={deleting}
        aria-label="Delete entry"
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-100 disabled:opacity-40 self-start"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(200,150,140,0.9)", opacity: 0.75 }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
