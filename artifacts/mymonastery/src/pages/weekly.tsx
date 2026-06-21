/**
 * This Week — weekly routines (BETA). The Way of Love's naturally-weekly
 * practices: Worship (gather), Sabbath (rest), Learn (go deeper), Bless (an act
 * of generosity). A practice is "kept" if done once in the liturgical week
 * (Sunday → Saturday). Enablement + per-week completion live in
 * lib/weeklyRoutines (localStorage, per-device); a future v2 syncs + nudges.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import {
  WEEKLY_CATALOG, WEEKLY_SET_EVENT, WEEKLY_DONE_EVENT,
  getEnabledWeekly, getEnabledKeys, setWeeklyEnabled, setWeeklyDay,
  toggleWeeklyKept, type EnabledWeekly, type WeeklyKey,
} from "@/lib/weeklyRoutines";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

function dayLabel(day: number | null): string {
  return day === null ? "Any day this week" : `${DAY_LABELS[day]}s`;
}

export default function ThisWeekPage() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta } = useBetaStatus();
  const [, setLocation] = useLocation();

  const [enabled, setEnabled] = useState<EnabledWeekly[]>(getEnabledWeekly);
  const [enabledKeys, setEnabledKeys] = useState<WeeklyKey[]>(getEnabledKeys);

  useEffect(() => {
    const resync = () => { setEnabled(getEnabledWeekly()); setEnabledKeys(getEnabledKeys()); };
    window.addEventListener(WEEKLY_SET_EVENT, resync);
    window.addEventListener(WEEKLY_DONE_EVENT, resync);
    window.addEventListener("focus", resync);
    window.addEventListener("pageshow", resync);
    window.addEventListener("phoebe:appactive", resync);
    return () => {
      window.removeEventListener(WEEKLY_SET_EVENT, resync);
      window.removeEventListener(WEEKLY_DONE_EVENT, resync);
      window.removeEventListener("focus", resync);
      window.removeEventListener("pageshow", resync);
      window.removeEventListener("phoebe:appactive", resync);
    };
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || !rawIsBeta)) setLocation("/dashboard");
  }, [authLoading, user, rawIsBeta, setLocation]);
  if (authLoading || !user || !rawIsBeta) return null;

  const keptCount = enabled.filter((p) => p.kept).length;
  const available = WEEKLY_CATALOG.filter((p) => !enabledKeys.includes(p.key));
  const todayDow = new Date().getDay();

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("common.home", { defaultValue: "Home" })}
        </Link>

        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: FAINT, fontFamily: FONT }}>
          🌿 {t("weekly.eyebrow", { defaultValue: "This week" })}
        </p>
        <h1 className="text-2xl font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>
          {t("weekly.title", { defaultValue: "Your weekly rhythm" })}
        </h1>
        <p className="text-[14px] mt-2 leading-relaxed" style={{ color: SAGE, fontFamily: FONT }}>
          {t("weekly.subtitle", { defaultValue: "Beyond the daily office — the larger practices of a life of love, kept once a week." })}
        </p>

        {/* Week strip + count (only once they keep something) */}
        {enabled.length > 0 && (
          <div className="mt-5 mb-1">
            <div className="flex items-center gap-1.5 mb-2">
              {DAY_SHORT.map((d, i) => (
                <span
                  key={i}
                  className="flex-1 text-center text-[11px] font-semibold rounded-md py-1"
                  style={{
                    maxWidth: 40,
                    color: i === todayDow ? "#0C1F12" : "rgba(143,175,150,0.6)",
                    background: i === todayDow ? "rgba(168,197,160,0.9)" : "rgba(143,175,150,0.10)",
                    fontFamily: FONT,
                  }}
                >{d}</span>
              ))}
            </div>
            <p className="text-[13px]" style={{ color: SAGE, fontFamily: FONT }}>
              {t("weekly.kept_count", { kept: keptCount, total: enabled.length, defaultValue: `${keptCount} of ${enabled.length} kept this week` })}
            </p>
          </div>
        )}

        {/* Enabled practices — kept-this-week toggles */}
        <div className="flex flex-col gap-2.5 mt-5">
          {enabled.map((p) => (
            <div
              key={p.key}
              className="rounded-2xl px-4 py-3.5"
              style={{ background: `rgba(${p.rgb},${p.kept ? 0.16 : 0.09})`, border: `1px solid rgba(${p.rgb},${p.kept ? 0.5 : 0.28})` }}
            >
              <div className="flex items-center gap-3">
                <span className="text-[26px] leading-none shrink-0">{p.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-bold leading-tight" style={{ color: WARM, fontFamily: FONT }}>{p.title}</p>
                  <p className="text-[12.5px] mt-0.5 leading-snug" style={{ color: SAGE, fontFamily: FONT }}>{p.blurb}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleWeeklyKept(p.key)}
                  className="shrink-0 rounded-full text-[12.5px] font-semibold px-3.5 py-1.5 active:scale-[0.97] transition-transform"
                  style={p.kept
                    ? { background: `rgba(${p.rgb},0.9)`, color: "#F0EDE6", fontFamily: FONT }
                    : { background: "transparent", color: "#A8C5A0", border: `1px solid rgba(${p.rgb},0.5)`, fontFamily: FONT }}
                >
                  {p.kept ? `✓ ${t("weekly.kept", { defaultValue: "Kept" })}` : t("weekly.mark_kept", { defaultValue: "Mark kept" })}
                </button>
              </div>
              {/* Day + remove controls */}
              <div className="flex items-center justify-between mt-2.5 pt-2.5" style={{ borderTop: `1px solid rgba(${p.rgb},0.18)` }}>
                <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: FAINT, fontFamily: FONT }}>
                  {t("weekly.on", { defaultValue: "On" })}
                  <select
                    value={p.day === null ? "any" : String(p.day)}
                    onChange={(e) => setWeeklyDay(p.key, e.target.value === "any" ? null : Number(e.target.value))}
                    className="rounded-lg px-2 py-1 text-[12px]"
                    style={{ background: "rgba(9,26,16, 0.550)", border: `1px solid rgba(${p.rgb},0.3)`, color: WARM, fontFamily: FONT, colorScheme: "dark" }}
                  >
                    <option value="any">{t("weekly.any_day", { defaultValue: "any day" })}</option>
                    {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => setWeeklyEnabled(p.key, false)} className="text-[12px]" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
                  {t("common.remove", { defaultValue: "Remove" })}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add practices */}
        {available.length > 0 && (
          <div className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: FAINT, fontFamily: FONT }}>
              {enabled.length === 0
                ? t("weekly.choose", { defaultValue: "Choose your weekly practices" })
                : t("weekly.add_more", { defaultValue: "Add a practice" })}
            </p>
            <div className="flex flex-col gap-2">
              {available.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setWeeklyEnabled(p.key, true)}
                  className="w-full text-left flex items-center gap-3 rounded-2xl px-4 py-3 active:scale-[0.99] transition-transform"
                  style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(46,107,64,0.22)" }}
                >
                  <span className="text-[22px] leading-none shrink-0">{p.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold leading-tight" style={{ color: WARM, fontFamily: FONT }}>{p.title}</p>
                    <p className="text-[12px] mt-0.5 leading-snug" style={{ color: SAGE, fontFamily: FONT }}>{p.blurb} · {dayLabel(p.day)}</p>
                  </div>
                  <span className="shrink-0 rounded-full text-[12.5px] font-semibold px-3 py-1.5" style={{ background: "rgba(46,107,64,0.85)", color: WARM, fontFamily: FONT }}>
                    + {t("common.add", { defaultValue: "Add" })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
