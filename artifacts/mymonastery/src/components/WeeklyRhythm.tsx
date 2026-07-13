/**
 * "This week" — the WEEKLY rhythm of the Way of Love (Commune · Go · Bless ·
 * Rest), kept as private self-logs alongside the daily rhythm. Beta only.
 *
 * This is presence, not performance. Commune / Go / Bless are ONE-TAP logs
 * (owner): the card carries the invitation, tapping it marks the week kept,
 * tapping again un-marks it — a log, not a journal. There is no sharing, no
 * streak, no shortfall; a kept practice shows a soft ✓ and resets gently on
 * Sunday. Rest is the one with a "when": its sheet is a small PLANNER — the
 * day you'll rest (the same phone-sabbath `restDays`) plus an optional TIME
 * WINDOW, held like an appointment ("an event to rest"), and a one-tap mark.
 *
 * Sits below the daily rhythm on the home (a separate band — the daily office
 * is the spine; this rides alongside it). See lib/weeklyRhythm.ts.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { swellHaptic } from "@/lib/swellHaptic";
import { ROUTINE_SYNCED_EVENT, pushRoutineConfig } from "@/lib/routineSync";
import {
  WEEKLY_PRACTICES,
  WEEKDAY_LABELS,
  WEEKDAY_FULL,
  addHours,
  windowHours,
  WEEKLY_ENABLED_EVENT,
  getEnabledWeekly,
  keptThisWeek,
  primarySabbathDay,
  todayISO,
  getRestWindow,
  setRestWindow,
  formatWindow,
  type RestWindow,
  type WeeklyKind,
  type WeeklyPractice,
  type PracticeLogEntry,
} from "@/lib/weeklyRhythm";

// Which weekly practices the user has turned on, kept in sync with the
// customizer (and other tabs) via the change event + the storage event.
function useEnabledWeekly(): WeeklyKind[] {
  const [enabled, setEnabled] = useState<WeeklyKind[]>(() => getEnabledWeekly());
  useEffect(() => {
    const sync = () => setEnabled(getEnabledWeekly());
    window.addEventListener(WEEKLY_ENABLED_EVENT, sync);
    window.addEventListener("storage", sync);
    // The key now rides rule_config — re-read when a device sync / a rule
    // adopt applies it (adoptRoutineConfig / syncRoutineFromServer).
    window.addEventListener(ROUTINE_SYNCED_EVENT, sync);
    return () => {
      window.removeEventListener(WEEKLY_ENABLED_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(ROUTINE_SYNCED_EVENT, sync);
    };
  }, []);
  return enabled;
}

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
  const { rawIsBeta } = useBetaStatus();
  const [open, setOpen] = useState<WeeklyKind | null>(null);
  // The optional rest window — re-read when the planner (or a device sync /
  // rule adopt) changes it.
  const [restWindow, setRestWindowState] = useState<RestWindow | null>(() => getRestWindow());
  useEffect(() => {
    const sync = () => setRestWindowState(getRestWindow());
    window.addEventListener(WEEKLY_ENABLED_EVENT, sync);
    window.addEventListener(ROUTINE_SYNCED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WEEKLY_ENABLED_EVENT, sync);
      window.removeEventListener(ROUTINE_SYNCED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);


  // BETA — hold the rest window like an appointment: (re)schedule the native
  // weekly local notification ("Your rest begins now 🌙") whenever the rest
  // days or window change. The native shell listens (wireRestReminders) and
  // no-ops on web. Rest must be enabled; clearing the window cancels.
  const restDaysKey = JSON.stringify(user?.restDays ?? []);
  useEffect(() => {
    if (!rawIsBeta) return;
    const enabled = getEnabledWeekly().includes("rest");
    const days: number[] = enabled ? (JSON.parse(restDaysKey) as number[]) : [];
    try {
      window.dispatchEvent(new CustomEvent("phoebe:schedule-rest-reminders", {
        detail: { days, start: restWindow?.start ?? null },
      }));
    } catch { /* non-fatal */ }
  }, [rawIsBeta, restDaysKey, restWindow?.start]);

  // Only the practices the user has turned on in the customizer appear here.
  const enabled = useEnabledWeekly();
  const practices = WEEKLY_PRACTICES.filter((p) => enabled.includes(p.kind));

  // One query per enabled practice (useQueries handles a variable-length set).
  const results = useQueries({
    queries: practices.map((p) => ({
      queryKey: logKey(p.kind),
      queryFn: () =>
        apiRequest("GET", `/api/practice-log/${p.kind}`) as Promise<{ entries: PracticeLogEntry[] }>,
      staleTime: 60_000,
    })),
  });

  const entriesByKind = {} as Record<WeeklyKind, PracticeLogEntry[]>;
  practices.forEach((p, i) => {
    entriesByKind[p.kind] = results[i]?.data?.entries ?? [];
  });

  const openPractice = practices.find((p) => p.kind === open) ?? null;

  // The band cascades in when it SCROLLS INTO VIEW — it sits below the fold on
  // mobile, so a page-load timer fired off-screen and the stagger was never
  // seen. framer's useInView + motion.div drives the fade-up in JS (NOT a CSS
  // keyframe on a style-swap, which the iOS WebView would not reliably start),
  // exactly like HomeLearnSection. Hooks stay ABOVE the early return so the
  // hook order never changes when the enabled set is empty.
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.2 });

  // Nothing turned on → no band at all.
  if (practices.length === 0) return null;

  // Header rises first, each card a beat behind (delay by index), once in view.
  const enterUp = (i: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const, delay: Math.min(i * 0.08, 0.6) },
  });

  return (
    <div className="mt-7" ref={rootRef}>
      {/* Same header treatment as the daily sections (Next / Done). */}
      <motion.div className="flex items-center gap-3 mb-2" {...enterUp(0)}>
        <h3 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>
          This week
        </h3>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </motion.div>
      <div className="space-y-2">
        {(() => {
          const rows = practices.map((p) => ({
            practice: p,
            kept: keptThisWeek(entriesByKind[p.kind]),
            sabbath: p.kind === "rest" ? primarySabbathDay(user?.restDays) : null,
          }));
          // Kept practices sink to the BOTTOM (stable within each group), same
          // as the daily rhythm's Next → Done split.
          const ordered = [...rows].sort((a, b) => Number(!!a.kept) - Number(!!b.kept));
          return ordered.map((r, i) => (
            // Each card cascades in a beat behind the header (once the band
            // scrolls into view). Kept cards re-sort to the bottom instantly.
            <motion.div key={r.practice.kind} {...enterUp(i + 1)}>
              <WeeklyCard
                practice={r.practice}
                kept={r.kept}
                sabbathDay={r.sabbath}
                restWindow={r.practice.kind === "rest" ? restWindow : null}
                // Every practice opens its sheet — the "Did you …?" ask (or,
                // for Rest, the planner) — like tapping a custom practice.
                onClick={() => setOpen(r.practice.kind)}
              />
            </motion.div>
          ));
        })()}
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
  restWindow,
  onClick,
}: {
  practice: WeeklyPractice;
  kept: PracticeLogEntry | null;
  sabbathDay: number | null;
  restWindow: RestWindow | null;
  onClick: () => void;
}) {
  // The card's second line: once kept this week, say so; otherwise the
  // invitation. For Rest, surface the planned rest — day + optional window —
  // held like a calendar event.
  let sub: string;
  if (kept) {
    sub = kept.what?.trim() ? `${practice.keptLabel} — ${kept.what.trim()}` : practice.keptLabel;
  } else if (practice.kind === "rest" && sabbathDay !== null) {
    sub = `${WEEKDAY_FULL[sabbathDay]}${restWindow ? ` · ${formatWindow(restWindow)}` : ""}`;
  } else {
    sub = practice.prompt;
  }
  const RGB = practice.rgb;
  const cta = practice.kind === "rest" ? "Plan" : "Log";

  // EXACTLY the daily rhythm-card shell (DailyProgressBody, non-hero row): the
  // same rounded-3xl frost, w-1 spine, px-4 py-3.5 padding, text-xl emoji,
  // 14.5px title / 12px sub, and the small ✓-only pill when kept.
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full flex rounded-3xl overflow-hidden text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
      style={{
        background: "rgba(26,52,36,0.27)",
        backdropFilter: "blur(11.34px)",
        WebkitBackdropFilter: "blur(11.34px)",
        border: "1px solid rgba(200,212,192,0.35)",
      }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${RGB},0.7)` }} />
      <div className="flex-1 min-w-0 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="text-xl flex-shrink-0" aria-hidden>{practice.emoji}</span>
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: WARM, fontFamily: FONT }}>
              {practice.label}
            </p>
            <p className="text-[12px] mt-0.5 leading-snug truncate" style={{ color: SAGE, fontFamily: FONT }}>
              {sub}
            </p>
          </div>
          {kept ? (
            <span
              className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5"
              style={{ background: `rgba(${RGB},0.18)`, color: "rgba(240,237,230,0.85)", border: `1px solid rgba(${RGB},0.45)` }}
              aria-label="Kept this week"
            >✓</span>
          ) : (
            <span
              className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5 text-center"
              style={{ minWidth: 84, background: `rgba(${RGB},0.85)`, color: WARM, fontFamily: FONT }}
            >
              {cta} <span aria-hidden>→</span>
            </span>
          )}
        </div>
      </div>
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
  const [closing, setClosing] = useState(false);
  const kept = keptThisWeek(entries);
  // The optional TIME WINDOW — rest held like an appointment. Persisted the
  // moment both ends are set (and synced across devices via the routine keys).
  const [win, setWin] = useState<RestWindow | null>(() => getRestWindow());
  const saveWindow = (next: RestWindow | null) => {
    setWin(next);
    setRestWindow(next);
    pushRoutineConfig();
  };

  const logMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/practice-log/${practice.kind}`, {
        day: todayISO(),
        what: "",
        notes: "",
      }),
    onSuccess: () => {
      swellHaptic();
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
        {/* The ask — "Did you …?" — the same tap-to-log shape as a custom
            practice. Rest's sheet is the planner (below) + the same mark. */}
        <p className="text-[15px] leading-snug mb-5" style={{ color: WARM, fontFamily: FONT }}>
          {practice.kind === "rest" ? "When will you carve out space to rest this week?" : practice.question}
        </p>

        {practice.kind === "rest" && (
          <div className="mb-5">
            <p className="text-[12px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
              The day
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

        {/* The window — held like a calendar event: a start time and a
            length (an hour, two, three), not an errand squeezed in. */}
        {practice.kind === "rest" && (
        <div className="mb-6">
          <p className="text-[12px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
            The window
          </p>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT, fontSize: 13.5 }}>From</span>
            <input
              type="time"
              value={win?.start ?? ""}
              onChange={(e) => {
                const start = e.target.value;
                if (!start) { saveWindow(null); return; }
                // Keep the existing length (default: two hours) anchored to
                // the new start — the event moves, its size holds.
                saveWindow({ start, end: addHours(start, win ? windowHours(win) : 2) });
              }}
              aria-label="Rest starts"
              className="rounded-xl px-3 py-2.5 text-[15px] outline-none"
              style={{ background: "rgba(9,26,16,0.6)", border: "1px solid rgba(46,107,64,0.35)", color: WARM, fontFamily: FONT, colorScheme: "dark", width: 118 }}
            />
            <span style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT, fontSize: 13.5 }}>for</span>
            {[1, 2, 3].map((h) => {
              const selected = !!win?.start && windowHours(win) === h;
              return (
                <button
                  key={h}
                  type="button"
                  disabled={!win?.start}
                  onClick={() => { if (win?.start) saveWindow({ start: win.start, end: addHours(win.start, h) }); }}
                  className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-opacity active:opacity-75 disabled:opacity-40"
                  style={selected
                    ? { background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(126,210,140,0.5)", fontFamily: FONT }
                    : { background: "transparent", color: "rgba(182,210,188,0.7)", border: "1px solid rgba(143,175,150,0.25)", fontFamily: FONT }}
                >
                  {h}h
                </button>
              );
            })}
            {win?.start && (
              <button
                type="button"
                onClick={() => saveWindow(null)}
                className="text-[12px] shrink-0 px-1 transition-opacity active:opacity-60"
                style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-[12px] mt-2" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
            {win?.start && win?.end
              ? `Held for you${restDays.length > 0 ? ` — ${restDays.map((d) => WEEKDAY_FULL[d]).join(" & ")}` : ""}, ${formatWindow(win)}. Like any other appointment — except this one is with quiet.`
              : "Pick a start and a length — two or three unhurried hours."}
          </p>
        </div>
        )}

        {/* One-tap mark, one-tap undo — a log, not a journal. */}
        <button
          type="button"
          disabled={logMutation.isPending || deleteMutation.isPending}
          onClick={() => (kept ? deleteMutation.mutate(kept.id) : logMutation.mutate())}
          className="w-full rounded-xl py-3.5 text-[15px] font-semibold transition-opacity active:opacity-80 disabled:opacity-45"
          style={kept
            ? { background: "rgba(46,107,64,0.3)", color: WARM, border: "1px solid rgba(126,210,140,0.4)", fontFamily: FONT }
            : { background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(126,210,140,0.4)", fontFamily: FONT }}
        >
          {kept
            ? `${practice.keptLabel} ✓ — tap to undo`
            : practice.kind === "rest" ? "I rested — mark the week kept" : "✓ Yes — mark the week kept"}
        </button>
      </motion.div>
    </motion.div>
  );
}
