/**
 * "This week" — the WEEKLY rhythm of the Way of Love (Commune · Go · Bless ·
 * Rest), kept as private self-logs alongside the daily rhythm. Beta only.
 *
 * This is presence, not performance. Each practice is a quiet card you tap to
 * log for yourself — who you communed with, where you went, how you blessed,
 * the day you rested. There is no sharing, no streak, no shortfall. A kept
 * practice shows a soft ✓ for the week and resets gently on Sunday. Rest is the
 * one with a "when": you set the day you'll rest (the same phone-sabbath
 * `restDays`) and the app holds it with you.
 *
 * Sits below the daily rhythm on the home (a separate band — the daily office
 * is the spine; this rides alongside it). See lib/weeklyRhythm.ts.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { swellHaptic } from "@/lib/swellHaptic";
import {
  WEEKLY_PRACTICES,
  WEEKDAY_LABELS,
  WEEKDAY_FULL,
  keptThisWeek,
  primarySabbathDay,
  todayISO,
  type WeeklyKind,
  type WeeklyPractice,
  type PracticeLogEntry,
} from "@/lib/weeklyRhythm";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const GREEN = "#7ED28C";

function logKey(kind: WeeklyKind): string[] {
  return [`/api/practice-log/${kind}`];
}

export function WeeklyRhythm() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState<WeeklyKind | null>(null);

  // One query per practice — a fixed set, so the hook count is stable.
  const results = useQueries({
    queries: WEEKLY_PRACTICES.map((p) => ({
      queryKey: logKey(p.kind),
      queryFn: () =>
        apiRequest("GET", `/api/practice-log/${p.kind}`) as Promise<{ entries: PracticeLogEntry[] }>,
      staleTime: 60_000,
    })),
  });

  const entriesByKind: Record<WeeklyKind, PracticeLogEntry[]> = {
    commune: results[0]?.data?.entries ?? [],
    go: results[1]?.data?.entries ?? [],
    bless: results[2]?.data?.entries ?? [],
    rest: results[3]?.data?.entries ?? [],
  };

  const openPractice = WEEKLY_PRACTICES.find((p) => p.kind === open) ?? null;

  return (
    <div className="mt-7">
      <p
        className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-2.5 px-0.5"
        style={{ color: "rgba(143,175,150,0.65)", fontFamily: FONT }}
      >
        This week
      </p>
      <div className="space-y-2">
        {WEEKLY_PRACTICES.map((p) => {
          const kept = keptThisWeek(entriesByKind[p.kind]);
          const sabbath = p.kind === "rest" ? primarySabbathDay(user?.restDays) : null;
          return (
            <WeeklyCard
              key={p.kind}
              practice={p}
              kept={kept}
              sabbathDay={sabbath}
              onClick={() => setOpen(p.kind)}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {openPractice && (
          <LogSheet
            key={openPractice.kind}
            practice={openPractice}
            entries={entriesByKind[openPractice.kind]}
            restDays={user?.restDays ?? []}
            onClose={() => setOpen(null)}
            onLogged={() => qc.invalidateQueries({ queryKey: logKey(openPractice.kind) })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function WeeklyCard({
  practice,
  kept,
  sabbathDay,
  onClick,
}: {
  practice: WeeklyPractice;
  kept: PracticeLogEntry | null;
  sabbathDay: number | null;
  onClick: () => void;
}) {
  // The card's second line: once kept this week, say so; otherwise the
  // invitation. For Rest, surface the chosen sabbath day when there is one.
  let sub: string;
  if (kept) {
    sub = kept.what?.trim() ? `${practice.keptLabel} — ${kept.what.trim()}` : practice.keptLabel;
  } else if (practice.kind === "rest" && sabbathDay !== null) {
    sub = `Your sabbath is ${WEEKDAY_FULL[sabbathDay]}`;
  } else {
    sub = practice.prompt;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl px-4 py-3.5 flex items-center gap-3 transition-opacity active:opacity-80"
      style={{
        background: "rgba(9,26,16,0.42)",
        backdropFilter: "blur(11.34px)",
        WebkitBackdropFilter: "blur(11.34px)",
        border: kept ? "1px solid rgba(126,210,140,0.4)" : "1px solid rgba(46,107,64,0.3)",
      }}
    >
      <span className="text-[22px] leading-none shrink-0" aria-hidden>
        {practice.emoji}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>
          {practice.label}
        </p>
        <p className="text-[12.5px] mt-0.5 truncate" style={{ color: "rgba(143,175,150,0.85)", fontFamily: FONT }}>
          {sub}
        </p>
      </div>
      {kept ? (
        <span className="text-[15px] font-bold shrink-0" style={{ color: GREEN }} aria-label="Kept this week">
          ✓
        </span>
      ) : (
        <span className="text-[20px] shrink-0" style={{ color: "rgba(143,175,150,0.45)" }} aria-hidden>
          +
        </span>
      )}
    </button>
  );
}

function LogSheet({
  practice,
  entries,
  restDays,
  onClose,
  onLogged,
}: {
  practice: WeeklyPractice;
  entries: PracticeLogEntry[];
  restDays: number[];
  onClose: () => void;
  onLogged: () => void;
}) {
  const qc = useQueryClient();
  const [what, setWhat] = useState("");
  const [notes, setNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const kept = keptThisWeek(entries);
  const isRest = practice.kind === "rest";

  const logMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/practice-log/${practice.kind}`, {
        day: todayISO(),
        what: what.trim(),
        notes: notes.trim(),
      }),
    onSuccess: () => {
      swellHaptic();
      setWhat("");
      setNotes("");
      onLogged();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/practice-log/${practice.kind}/${id}`),
    onSuccess: onLogged,
  });

  const sabbathMutation = useMutation({
    mutationFn: (days: number[]) => apiRequest("PUT", "/api/me/rest-days", { days }),
    // Optimistically reflect the new rest days in the auth cache so the picker
    // highlights immediately (and a quick second tap reads the fresh set, not a
    // stale one), then reconcile with the server's response.
    onMutate: (days: number[]) => {
      qc.setQueryData<AuthUser | null>(["/api/auth/me"], (prev) =>
        prev ? { ...prev, restDays: days } : prev,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });

  function close() {
    setClosing(true);
  }

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={close}
      style={{ background: "rgba(4,12,7,0.55)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: "100%" }}
        animate={{ y: closing ? "100%" : 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => { if (closing) onClose(); }}
        className="rounded-t-3xl px-5 pt-3 pb-8"
        style={{
          background: "#0c1f13",
          borderTop: "1px solid rgba(46,107,64,0.4)",
          paddingBottom: "max(env(safe-area-inset-bottom), 28px)",
          maxHeight: "82dvh",
          overflowY: "auto",
        }}
      >
        {/* grabber */}
        <div className="mx-auto mb-4 rounded-full" style={{ width: 38, height: 4, background: "rgba(143,175,150,0.35)" }} />

        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-[24px] leading-none" aria-hidden>{practice.emoji}</span>
          <h2 className="text-[20px] font-semibold" style={{ color: WARM, fontFamily: FONT, letterSpacing: "-0.01em" }}>
            {practice.label}
          </h2>
          {kept && (
            <span className="ml-auto text-[13px] font-bold" style={{ color: GREEN, fontFamily: FONT }}>✓ kept</span>
          )}
        </div>
        <p className="text-[13.5px] leading-snug mb-5" style={{ color: SAGE, fontFamily: FONT }}>
          {practice.prompt}
        </p>

        {isRest && (
          <div className="mb-5">
            <p className="text-[12px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
              The day you'll rest
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAY_LABELS.map((label, idx) => {
                const selected = restDays.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={sabbathMutation.isPending}
                    // Toggle this day WITHIN the existing rest-days set — never
                    // replace it. restDays is shared with the phone-sabbath
                    // (Settings / Walking Together), so clobbering it would wipe
                    // any other days the user configured there.
                    onClick={() =>
                      sabbathMutation.mutate(
                        selected
                          ? restDays.filter((d) => d !== idx)
                          : [...restDays, idx].sort((a, b) => a - b),
                      )
                    }
                    className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-opacity active:opacity-75 disabled:opacity-50"
                    style={selected
                      ? { background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(126,210,140,0.5)", fontFamily: FONT }
                      : { background: "transparent", color: "rgba(182,210,188,0.7)", border: "1px solid rgba(143,175,150,0.25)", fontFamily: FONT }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] mt-2" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
              {restDays.length > 0
                ? `On ${restDays.map((d) => WEEKDAY_FULL[d]).join(" & ")} you'll see a calm sabbath, not a behind.`
                : "Tap a day to set your weekly sabbath."}
            </p>
          </div>
        )}

        {/* the log field */}
        <label className="block text-[13px] font-medium mb-1.5" style={{ color: "rgba(240,237,230,0.8)", fontFamily: FONT }}>
          {practice.askLabel}
        </label>
        <input
          type="text"
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder={practice.askPlaceholder}
          className="w-full rounded-xl px-3.5 py-3 text-[15px] mb-3 outline-none"
          style={{ background: "rgba(9,26,16,0.6)", border: "1px solid rgba(46,107,64,0.35)", color: WARM, fontFamily: FONT }}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="A note, if you'd like (optional)"
          rows={2}
          className="w-full rounded-xl px-3.5 py-3 text-[14px] mb-4 outline-none resize-none"
          style={{ background: "rgba(9,26,16,0.6)", border: "1px solid rgba(46,107,64,0.35)", color: WARM, fontFamily: FONT }}
        />
        <button
          type="button"
          disabled={logMutation.isPending || (!isRest && what.trim() === "")}
          onClick={() => logMutation.mutate()}
          className="w-full rounded-xl py-3.5 text-[15px] font-semibold transition-opacity active:opacity-80 disabled:opacity-45"
          style={{ background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(126,210,140,0.4)", fontFamily: FONT }}
        >
          {isRest ? "Mark this week kept" : "Log it for this week"}
        </button>

        {/* this week + recent — for yourself, quietly */}
        {entries.length > 0 && (
          <div className="mt-6">
            <p className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}>
              Lately
            </p>
            <div className="space-y-1.5">
              {entries.slice(0, 8).map((e) => (
                <div key={e.id} className="flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(9,26,16,0.4)" }}>
                  <div className="flex-1 min-w-0">
                    {e.what?.trim() && (
                      <p className="text-[13.5px]" style={{ color: "rgba(240,237,230,0.9)", fontFamily: FONT }}>{e.what.trim()}</p>
                    )}
                    {e.notes?.trim() && (
                      <p className="text-[12.5px] mt-0.5" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>{e.notes.trim()}</p>
                    )}
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}>{e.day}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => deleteMutation.mutate(e.id)}
                    className="text-[13px] shrink-0 px-1.5 transition-opacity active:opacity-60"
                    style={{ color: "rgba(143,175,150,0.5)" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
