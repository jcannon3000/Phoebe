import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";

// Browse the novena library, start one, or switch to a different one. Only
// one novena can be active at a time — starting a second one while another
// is in progress prompts a confirm ("stop this one and start that one?")
// instead of silently abandoning the first.

const BG = "#091A10";
const TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const CARD = "#0F2818";
const FONT = "'Space Grotesk', sans-serif";

type Novena = { id: number; title: string; saint: string | null; sourceNote: string | null; dayCount: number };

export default function NovenaLibraryPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { novena: activeNovena } = useRhythmState();
  const [switchPrompt, setSwitchPrompt] = useState<{ target: Novena; currentTitle: string } | null>(null);

  const { data } = useQuery<{ novenas: Novena[] }>({
    queryKey: ["/api/novenas"],
    queryFn: () => apiRequest("GET", "/api/novenas"),
  });

  const start = useMutation({
    mutationFn: (args: { id: number; confirmSwitch?: boolean }) =>
      apiRequest("POST", `/api/novenas/${args.id}/start`, { confirmSwitch: args.confirmSwitch === true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/me/novena"] });
      setSwitchPrompt(null);
      setLocation("/novena");
    },
    onError: async (err: unknown, vars) => {
      // 409 active_exists — a different novena is already in progress.
      const target = (data?.novenas ?? []).find((n) => n.id === vars.id);
      if (target) {
        setSwitchPrompt({ target, currentTitle: activeNovena?.title ?? "your current novena" });
      }
    },
  });

  const novenas = data?.novenas ?? [];

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: TEXT, fontFamily: FONT }} className="px-5 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Novenas</h1>
        <button onClick={() => setLocation("/dashboard")} className="text-sm" style={{ color: SAGE }}>Close</button>
      </div>

      <div className="space-y-3 max-w-lg mx-auto">
        {novenas.map((n) => {
          const isCurrent = activeNovena?.novenaId === n.id;
          return (
            <div key={n.id} className="rounded-2xl p-4" style={{ background: CARD, border: "1px solid rgba(46,107,64,0.35)" }}>
              <p className="font-semibold">{n.title}</p>
              {n.saint && <p className="text-sm mt-0.5" style={{ color: SAGE }}>{n.saint}</p>}
              <p className="text-xs mt-1" style={{ color: SAGE, opacity: 0.7 }}>{n.dayCount} days{n.sourceNote ? ` · ${n.sourceNote}` : ""}</p>
              <button
                onClick={() => isCurrent ? setLocation("/novena") : start.mutate({ id: n.id })}
                disabled={start.isPending}
                className="mt-3 px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-60"
                style={{ background: isCurrent ? "transparent" : "#2D5E3F", border: isCurrent ? `1px solid ${SAGE}` : "none", color: TEXT }}
              >
                {isCurrent ? "Continue" : "Start"}
              </button>
            </div>
          );
        })}
        {novenas.length === 0 && (
          <p style={{ color: SAGE }}>No novenas in the library yet.</p>
        )}
      </div>

      {switchPrompt && (
        <div className="fixed inset-0 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="rounded-2xl p-5 max-w-sm w-full" style={{ background: CARD, border: "1px solid rgba(46,107,64,0.4)" }}>
            <p className="mb-4">
              Stop {switchPrompt.currentTitle} and start {switchPrompt.target.title}?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSwitchPrompt(null)} className="px-4 py-2 rounded-full text-sm" style={{ color: SAGE }}>Cancel</button>
              <button
                onClick={() => start.mutate({ id: switchPrompt.target.id, confirmSwitch: true })}
                className="px-4 py-2 rounded-full text-sm font-semibold"
                style={{ background: "#2D5E3F", color: TEXT }}
              >
                Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
