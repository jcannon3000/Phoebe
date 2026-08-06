import { useLocation } from "wouter";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";

// The active novena's current day — read it, mark it done. currentDay only
// ever advances via the /complete call below (never by the calendar), and
// once marked, the card/dot drop out of today's routine until tomorrow —
// same "done for today" convention as every other rhythm anchor.

const BG = "#091A10";
const TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', sans-serif";

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

export default function NovenaPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { novena, novenaDone } = useRhythmState();

  const complete = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/novena/complete", { localDate: localDay() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/me/novena"] });
    },
  });

  const stop = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/novena/stop"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/me/novena"] });
      setLocation("/novena-library");
    },
  });

  if (!novena) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: TEXT, fontFamily: FONT }} className="flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p style={{ color: SAGE }}>No novena in progress.</p>
        <button
          onClick={() => setLocation("/novena-library")}
          className="px-5 py-2.5 rounded-full text-sm font-semibold"
          style={{ background: "#2D5E3F", color: TEXT }}
        >
          Browse novenas
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: TEXT, fontFamily: FONT }} className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <button onClick={() => setLocation("/dashboard")} className="text-sm" style={{ color: SAGE }}>
          Close
        </button>
        <button onClick={() => stop.mutate()} className="text-sm" style={{ color: SAGE, opacity: 0.7 }}>
          Stop this novena
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-2xl mx-auto w-full">
        <p className="text-xs uppercase tracking-[0.18em] mb-2" style={{ color: SAGE }}>
          {novena.title}{novena.saint ? ` — ${novena.saint}` : ""} · Day {novena.currentDay} of {novena.dayCount}
        </p>
        {novena.day?.title && (
          <h1 className="text-2xl md:text-3xl font-semibold mb-6">{novena.day.title}</h1>
        )}
        {novena.day ? (
          <p className="text-base md:text-lg leading-relaxed whitespace-pre-line" style={{ color: TEXT }}>
            {novena.day.body}
          </p>
        ) : (
          <p style={{ color: SAGE }}>This day's text isn't available yet.</p>
        )}

        <button
          onClick={() => complete.mutate()}
          disabled={novenaDone || complete.isPending}
          className="mt-10 px-6 py-3 rounded-full text-sm font-semibold disabled:opacity-60"
          style={{ background: "#2D5E3F", color: TEXT }}
        >
          {novenaDone ? "Kept today" : "Mark today's day complete"}
        </button>
      </div>
    </div>
  );
}
