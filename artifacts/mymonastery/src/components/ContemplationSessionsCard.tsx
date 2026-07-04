/**
 * ContemplationSessionsCard (BETA) — renders the configured contemplation
 * sessions as Begin + done cards, or a "set up sessions" entry when none are
 * configured. Self-contained; reads lib/contemplationSessions live. Each session
 * Begin launches the right practice: a silent sit (/contemplation?sit=N) or a
 * Cobreathe breath (/cobreathe?start=1).
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  CONTEMPLATION_SESSIONS_EVENT, CONTEMPLATION_SESSION_DONE_EVENT,
  getMode, getSessionsToday, slotMeta, sessionLabel, toggleSessionDoneToday,
  type SessionType, type TimeSlot,
} from "@/lib/contemplationSessions";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const TEAL = "62,124,122";
const GREEN = "46,107,64";

function accent(type: SessionType): string {
  return type === "cobreathe" ? GREEN : TEAL;
}

export function ContemplationSessionsCard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState(getMode);
  const [sessions, setSessions] = useState(getSessionsToday);

  useEffect(() => {
    const resync = () => { setMode(getMode()); setSessions(getSessionsToday()); };
    const evs = [CONTEMPLATION_SESSIONS_EVENT, CONTEMPLATION_SESSION_DONE_EVENT, "focus", "pageshow", "phoebe:appactive"];
    evs.forEach((e) => window.addEventListener(e, resync));
    return () => evs.forEach((e) => window.removeEventListener(e, resync));
  }, []);

  const active = mode === "sessions" && sessions.length > 0;

  // Not set up → a single entry card pointing at the setup flow.
  if (!active) {
    return (
      <Link href="/contemplation-setup" className="block">
        <div className="rounded-2xl px-4 py-3.5 active:scale-[0.99] transition-transform" style={{ background: `rgba(${TEAL},0.10)`, border: `1px solid rgba(${TEAL},0.30)` }}>
          <div className="flex items-center gap-3">
            <span className="text-[26px] leading-none shrink-0">🕯️</span>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
                {t("contcard.setup_title", { defaultValue: "Contemplation sessions" })}
              </p>
              <p className="text-[12.5px] mt-0.5 leading-snug" style={{ color: SAGE, fontFamily: FONT }}>
                {t("contcard.setup_sub", { defaultValue: "Set fixed sits — like twenty minutes morning and evening" })}
              </p>
            </div>
            <span className="shrink-0 rounded-full text-[12px] font-semibold px-3 py-1.5" style={{ background: `rgba(${TEAL},0.85)`, color: WARM, fontFamily: FONT }}>
              {t("common.set_up", { defaultValue: "Set up" })} →
            </span>
          </div>
        </div>
      </Link>
    );
  }

  const launch = (type: SessionType, minutes: number) => {
    if (type === "cobreathe") setLocation("/cobreathe?start=1");
    else setLocation(`/contemplation?sit=${minutes}`);
  };
  const doneCount = sessions.filter((s) => s.done).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>
          🕯️ {t("contcard.title", { defaultValue: "Contemplation sessions" })}
          <span className="ml-2 text-[12px] font-normal" style={{ color: SAGE }}>
            {t("contcard.kept", { done: doneCount, total: sessions.length, defaultValue: `${doneCount} of ${sessions.length} today` })}
          </span>
        </p>
        <Link href="/contemplation-setup" className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>
          {t("common.edit", { defaultValue: "Edit" })}
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {sessions.map((s) => {
          const rgb = accent(s.type);
          const typeLabel = s.type === "cobreathe"
            ? t("contcard.cobreathe", { defaultValue: "Creation Prayer" })
            : t("contcard.silent", { defaultValue: "Contemplation" });
          return (
            <div key={s.id} className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: `rgba(${rgb},${s.done ? 0.16 : 0.09})`, border: `1px solid rgba(${rgb},${s.done ? 0.45 : 0.26})` }}>
              {/* Done toggle */}
              <button
                type="button"
                onClick={() => toggleSessionDoneToday(s.id)}
                aria-label={s.done ? t("contcard.undo", { defaultValue: "Mark not done" }) : t("contcard.mark_done", { defaultValue: "Mark done" })}
                className="shrink-0 rounded-full flex items-center justify-center text-[14px] font-bold transition-colors active:scale-95"
                style={{
                  width: 30, height: 30,
                  background: s.done ? `rgba(${rgb},0.9)` : "transparent",
                  border: s.done ? "none" : `1.5px solid rgba(143,175,150,0.4)`,
                  color: s.done ? "#EAF6F4" : "transparent",
                }}
              >✓</button>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
                  {slotMeta(s.slot as TimeSlot).emoji} {sessionLabel(s.slot)}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: SAGE, fontFamily: FONT }}>
                  {t("contcard.detail", { min: s.minutes, type: typeLabel, defaultValue: `${s.minutes} min · ${typeLabel}` })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => launch(s.type, s.minutes)}
                className="shrink-0 rounded-full text-[12.5px] font-semibold px-3.5 py-1.5 active:scale-[0.97] transition-transform"
                style={{ background: `rgba(${rgb},0.85)`, color: WARM, fontFamily: FONT }}
              >
                {s.done ? t("contcard.again", { defaultValue: "Again" }) : t("contcard.begin", { defaultValue: "Begin" })} →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
