/**
 * Contemplation setup (BETA) — choose how you keep the silence: a daily GOAL
 * (the existing minutes-a-day target) or SESSIONS. Session-based walks you, one
 * slide at a time, through 1–3 fixed sits a day — each with its own length, time
 * of day, and type (silent Contemplation or a Cobreathe breath). Keating's
 * twenty-and-twenty is two sessions, morning and evening.
 *
 * Config lives in lib/contemplationSessions (localStorage); a future v2 syncs +
 * reminds at each session's time.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import {
  TIME_SLOTS, MIN_SESSION_MIN, MAX_SESSION_MIN,
  setMode, setSessionCount, updateSession, getSessions, sessionLabel,
  type ContemplationSession, type TimeSlot, type SessionType,
} from "@/lib/contemplationSessions";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const G = "46,107,64";
const TEAL = "62,124,122";   // contemplation accent
const GREEN = "46,107,64";   // cobreathe accent

type Step = "mode" | "count" | "session";

export default function ContemplationSetupPage() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta } = useBetaStatus();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>("mode");
  const [count, setCount] = useState(2);
  const [sessions, setSessions] = useState<ContemplationSession[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!authLoading && (!user || !rawIsBeta)) setLocation("/dashboard");
  }, [authLoading, user, rawIsBeta, setLocation]);
  if (authLoading || !user || !rawIsBeta) return null;

  const chooseGoal = () => { setMode("goal"); setLocation("/contemplation"); };
  const chooseSessions = () => { setStep("count"); };
  const chooseCount = (n: number) => {
    setCount(n);
    setSessions(setSessionCount(n));
    setIdx(0);
    setStep("session");
  };

  const current = sessions[idx];
  const patch = (p: Partial<Omit<ContemplationSession, "id">>) => {
    if (!current) return;
    updateSession(current.id, p);
    setSessions(getSessions());
  };
  const next = () => {
    if (idx < sessions.length - 1) { setIdx(idx + 1); return; }
    setMode("sessions");
    setLocation("/dashboard");
  };
  const back = () => {
    if (step === "session" && idx > 0) { setIdx(idx - 1); return; }
    if (step === "session") { setStep("count"); return; }
    if (step === "count") { setStep("mode"); return; }
    setLocation("/contemplation");
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <button type="button" onClick={back} className="inline-flex items-center gap-1.5 text-sm mb-5" style={{ color: SAGE, background: "none", border: "none", cursor: "pointer" }}>
          <ChevronLeft size={14} /> {t("common.back", { defaultValue: "Back" })}
        </button>

        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: FAINT, fontFamily: FONT }}>
          🕯️ {t("contsetup.eyebrow", { defaultValue: "Contemplation" })}
        </p>

        {/* ── Step: mode ─────────────────────────────────────────────── */}
        {step === "mode" && (
          <>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
              {t("contsetup.mode_title", { defaultValue: "How do you want to keep the silence?" })}
            </h1>
            <p className="text-[14px] mt-2 mb-6 leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
              {t("contsetup.mode_sub", { defaultValue: "Aim for a daily total, or set fixed sessions through the day." })}
            </p>
            <div className="flex flex-col gap-3">
              <button type="button" onClick={chooseGoal} className="w-full text-left rounded-2xl px-5 py-4 active:scale-[0.99] transition-transform" style={{ background: `rgba(${TEAL},0.10)`, border: `1px solid rgba(${TEAL},0.30)` }}>
                <p className="text-[17px] font-bold" style={{ color: WARM, fontFamily: FONT }}>🎯 {t("contsetup.goal_title", { defaultValue: "A daily goal" })}</p>
                <p className="text-[13px] mt-0.5" style={{ color: SAGE, fontFamily: FONT }}>{t("contsetup.goal_blurb", { defaultValue: "Set a number of minutes to reach each day, any time you like." })}</p>
              </button>
              <button type="button" onClick={chooseSessions} className="w-full text-left rounded-2xl px-5 py-4 active:scale-[0.99] transition-transform" style={{ background: `rgba(${G},0.12)`, border: `1px solid rgba(${G},0.34)` }}>
                <p className="text-[17px] font-bold" style={{ color: WARM, fontFamily: FONT }}>🕰️ {t("contsetup.sessions_title", { defaultValue: "Set sessions" })}</p>
                <p className="text-[13px] mt-0.5" style={{ color: SAGE, fontFamily: FONT }}>{t("contsetup.sessions_blurb", { defaultValue: "Fixed sits through the day — like twenty minutes morning and evening." })}</p>
              </button>
            </div>
          </>
        )}

        {/* ── Step: count ────────────────────────────────────────────── */}
        {step === "count" && (
          <>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
              {t("contsetup.count_title", { defaultValue: "How many sessions a day?" })}
            </h1>
            <p className="text-[14px] mt-2 mb-6 leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
              {t("contsetup.count_sub", { defaultValue: "You can change any of them next." })}
            </p>
            <div className="flex gap-3">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" onClick={() => chooseCount(n)} className="flex-1 rounded-2xl py-6 active:scale-[0.98] transition-transform" style={{ background: `rgba(${G},0.10)`, border: `1px solid rgba(${G},0.30)` }}>
                  <p className="text-[30px] font-bold leading-none" style={{ color: WARM, fontFamily: FONT }}>{n}</p>
                  <p className="text-[12px] mt-1.5" style={{ color: SAGE, fontFamily: FONT }}>{n === 1 ? t("contsetup.session_one", { defaultValue: "session" }) : t("contsetup.session_many", { defaultValue: "sessions" })}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step: per-session config ───────────────────────────────── */}
        {step === "session" && current && (
          <>
            <p className="text-[13px] mb-1" style={{ color: FAINT, fontFamily: FONT }}>
              {t("contsetup.session_n", { n: idx + 1, total: sessions.length, defaultValue: `Session ${idx + 1} of ${sessions.length}` })}
            </p>
            <h1 className="text-2xl font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
              {sessionLabel(current.slot)}
            </h1>

            {/* Time of day */}
            <p className="text-[11px] font-semibold uppercase tracking-widest mt-6 mb-2" style={{ color: FAINT, fontFamily: FONT }}>
              {t("contsetup.when", { defaultValue: "Time of day" })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TIME_SLOTS.map((s) => {
                const on = current.slot === s.slot;
                return (
                  <button key={s.slot} type="button" onClick={() => patch({ slot: s.slot as TimeSlot })} className="rounded-xl px-3 py-3 text-left active:scale-[0.98] transition-transform" style={{ background: on ? `rgba(${G},0.85)` : `rgba(${G},0.08)`, border: `1px solid rgba(${G},${on ? 0.6 : 0.24})` }}>
                    <span className="text-[15px] font-semibold" style={{ color: on ? WARM : "#C8D4C0", fontFamily: FONT }}>{s.emoji} {s.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Length */}
            <p className="text-[11px] font-semibold uppercase tracking-widest mt-6 mb-2" style={{ color: FAINT, fontFamily: FONT }}>
              {t("contsetup.length", { defaultValue: "Length" })}
            </p>
            <div className="flex items-center justify-between rounded-2xl px-3 py-2.5" style={{ background: `rgba(${G},0.08)`, border: `1px solid rgba(${G},0.24)` }}>
              <button type="button" aria-label={t("contsetup.less", { defaultValue: "Less" })} onClick={() => patch({ minutes: Math.max(MIN_SESSION_MIN, current.minutes - 5) })} disabled={current.minutes <= MIN_SESSION_MIN} className="w-11 h-11 rounded-full text-[22px] font-bold disabled:opacity-30" style={{ background: "rgba(9,26,16, 0.550)", color: WARM, border: `1px solid rgba(${G},0.3)` }}>−</button>
              <span className="text-[20px] font-bold" style={{ color: WARM, fontFamily: FONT }}>{t("contsetup.minutes", { min: current.minutes, defaultValue: `${current.minutes} min` })}</span>
              <button type="button" aria-label={t("contsetup.more", { defaultValue: "More" })} onClick={() => patch({ minutes: Math.min(MAX_SESSION_MIN, current.minutes + 5) })} disabled={current.minutes >= MAX_SESSION_MIN} className="w-11 h-11 rounded-full text-[22px] font-bold disabled:opacity-30" style={{ background: "rgba(9,26,16, 0.550)", color: WARM, border: `1px solid rgba(${G},0.3)` }}>+</button>
            </div>

            {/* Type */}
            <p className="text-[11px] font-semibold uppercase tracking-widest mt-6 mb-2" style={{ color: FAINT, fontFamily: FONT }}>
              {t("contsetup.type", { defaultValue: "Practice" })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { type: "contemplation" as SessionType, emoji: "🕯️", label: t("contsetup.silent", { defaultValue: "Contemplation" }), sub: t("contsetup.silent_sub", { defaultValue: "Silent sit" }), rgb: TEAL },
                { type: "cobreathe" as SessionType, emoji: "🌍", label: t("contsetup.cobreathe", { defaultValue: "Creation Prayer" }), sub: t("contsetup.cobreathe_sub", { defaultValue: "Breathing together with God's creation" }), rgb: GREEN },
              ]).map((o) => {
                const on = current.type === o.type;
                return (
                  <button key={o.type} type="button" onClick={() => patch({ type: o.type })} className="rounded-xl px-3 py-3 text-left active:scale-[0.98] transition-transform" style={{ background: on ? `rgba(${o.rgb},0.85)` : `rgba(${o.rgb},0.08)`, border: `1px solid rgba(${o.rgb},${on ? 0.6 : 0.24})` }}>
                    <p className="text-[15px] font-semibold" style={{ color: on ? WARM : "#C8D4C0", fontFamily: FONT }}>{o.emoji} {o.label}</p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: on ? "rgba(240,237,230,0.8)" : SAGE, fontFamily: FONT }}>{o.sub}</p>
                  </button>
                );
              })}
            </div>

            {/* Continue */}
            <button type="button" onClick={next} className="w-full mt-8 rounded-full py-3.5 text-[15px] font-semibold active:scale-[0.99] transition-transform" style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT }}>
              {idx < sessions.length - 1
                ? t("contsetup.next_session", { defaultValue: "Next session →" })
                : t("contsetup.finish", { defaultValue: "Done" })}
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
