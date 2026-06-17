/**
 * BetaRhythmExtras — entry cards for the BETA practices that live in the MAIN
 * flow (home): "This week" (weekly routines) and Contemplation sessions.
 * Self-contained + beta-gated (renders null off-beta). Gratitude ("Thank three
 * people") moved to its own menu item; friends' progress moved to the
 * daily-progress page. The rich experiences live on /weekly and the session
 * pages.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useBetaStatus } from "@/hooks/useDemo";
import {
  WEEKLY_SET_EVENT, WEEKLY_DONE_EVENT, getEnabledWeekly,
} from "@/lib/weeklyRoutines";
import { ContemplationSessionsCard } from "@/components/ContemplationSessionsCard";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export function BetaRhythmExtras() {
  const { t } = useTranslation();
  const { rawIsBeta } = useBetaStatus();

  const [weekly, setWeekly] = useState(getEnabledWeekly);

  useEffect(() => {
    const resync = () => { setWeekly(getEnabledWeekly()); };
    const evs = [WEEKLY_SET_EVENT, WEEKLY_DONE_EVENT, "focus", "pageshow", "phoebe:appactive"];
    evs.forEach((e) => window.addEventListener(e, resync));
    return () => evs.forEach((e) => window.removeEventListener(e, resync));
  }, []);

  if (!rawIsBeta) return null;

  const weeklyKept = weekly.filter((p) => p.kept).length;
  const weeklyPct = weekly.length > 0 ? Math.round((weeklyKept / weekly.length) * 100) : 0;

  return (
    <div className="mt-9">
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: FAINT, fontFamily: FONT }}>
        {t("beta_extras.eyebrow", { defaultValue: "Beta · new practices" })}
      </p>

      <div className="flex flex-col gap-2.5">
        {/* This week */}
        <Link href="/weekly" className="block">
          <div className="rounded-2xl px-4 py-3.5 active:scale-[0.99] transition-transform" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)" }}>
            <div className="flex items-center gap-3">
              <span className="text-[26px] leading-none shrink-0">🌿</span>
              <div className="flex-1 min-w-0">
                <p className="text-[16px] font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
                  {t("beta_extras.weekly_title", { defaultValue: "This week" })}
                </p>
                <p className="text-[12.5px] mt-0.5 leading-snug" style={{ color: SAGE, fontFamily: FONT }}>
                  {weekly.length === 0
                    ? t("beta_extras.weekly_setup", { defaultValue: "Set up your weekly rhythm — Worship, Bless, Go, Rest" })
                    : t("weekly.kept_count", { kept: weeklyKept, total: weekly.length, defaultValue: `${weeklyKept} of ${weekly.length} kept this week` })}
                </p>
              </div>
              <span className="shrink-0 rounded-full text-[12px] font-semibold px-3 py-1.5" style={{ background: "rgba(46,107,64,0.85)", color: WARM, fontFamily: FONT }}>
                {weekly.length === 0 ? `${t("common.set_up", { defaultValue: "Set up" })} →` : `${t("common.open", { defaultValue: "Open" })} →`}
              </span>
            </div>
            {weekly.length > 0 && (
              <div className="mt-3 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(143,175,150,0.16)" }}>
                <div className="h-full rounded-full" style={{ width: `${weeklyPct}%`, background: "rgba(46,107,64,0.85)", transition: "width 0.3s" }} />
              </div>
            )}
          </div>
        </Link>

        {/* Contemplation sessions — entry card, or the configured session cards. */}
        <ContemplationSessionsCard />
      </div>
    </div>
  );
}
