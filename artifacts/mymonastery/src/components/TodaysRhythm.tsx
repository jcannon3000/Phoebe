import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  hasReadCacToday, hasReadFddToday, hasReadSsjeToday,
  CAC_READ_EVENT, FDD_READ_EVENT, SSJE_READ_EVENT,
} from "@/lib/cacReadState";

// ── Today's Rhythm ──────────────────────────────────────────────────────────
//
// A glanceable header that answers "where am I in today's rhythm, and what's
// next?" — the daily-habit cue the home screen was missing. Four anchors
// (Morning · Reflect · Silence · Evening) fill as the day is kept; a single
// time-aware prompt names the next step; a grace-based streak line rewards
// consistency without punishing the occasional missed day; and a quiet
// garden line turns "my checklist" into "our common life".
//
// It reads its own queries, but every queryKey matches what the dashboard /
// contemplation page already fetch, so React Query dedupes — no extra
// network. Reflection state is localStorage-only, so we read it synchronously
// and live-update off the read events the reflection cards fire.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Did the user finish an office on a given side today, per the localStorage
// flags the office viewer writes synchronously (before the server query
// lands)? Mirrors the dashboard's own fallback check.
function officeLocalDone(sides: string[]): boolean {
  const day = localDay();
  try {
    return sides.some((s) => localStorage.getItem(`phoebe:office-completed:${s}:${day}`) !== null);
  } catch {
    return false;
  }
}

type Anchor = {
  key: "morning" | "reflect" | "silence" | "evening";
  label: string;
  icon: string;       // emoji glyph
  done: boolean;
  href: string;       // where the next-step CTA routes
  cta: string;        // verb for the prompt ("Pray Morning Prayer")
  blurb: string;      // one-line invitation under the prompt
};

export function TodaysRhythm() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const day = localDay();
  const hour = new Date().getHours();

  // Reflection read-state (localStorage). Re-read on the read events so the
  // anchor flips the moment a reflection is opened, without a refetch.
  const [reflectDone, setReflectDone] = useState(
    () => hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday(),
  );
  useEffect(() => {
    const recheck = () => setReflectDone(hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday());
    window.addEventListener(CAC_READ_EVENT, recheck);
    window.addEventListener(FDD_READ_EVENT, recheck);
    window.addEventListener(SSJE_READ_EVENT, recheck);
    window.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener(CAC_READ_EVENT, recheck);
      window.removeEventListener(FDD_READ_EVENT, recheck);
      window.removeEventListener(SSJE_READ_EVENT, recheck);
      window.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  const { data: officeHistory } = useQuery<{ days: Array<{ ymd: string; morning: boolean; evening: boolean }> }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    staleTime: 30_000,
  });

  const todaySince = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, []);
  const tz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  }, []);
  const { data: contStats } = useQuery<{ todaySeconds: number; healthMinutesToday: number }>({
    queryKey: ["/api/me/contemplation-stats", todaySince.slice(0, 10), tz],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-stats?todaySince=${encodeURIComponent(todaySince)}&tz=${encodeURIComponent(tz)}`),
    staleTime: 30_000,
  });

  const { data: cobreathe } = useQuery<{ done: boolean; count: number }>({
    queryKey: ["/api/breath/today", day],
    queryFn: () => apiRequest("GET", `/api/breath/today?day=${day}`),
    staleTime: 60_000,
  });

  const { data: rhythm } = useQuery<{ streak: number; last7: number; keptToday: boolean }>({
    queryKey: ["/api/me/prayer-days"],
    queryFn: () => apiRequest("GET", "/api/me/prayer-days"),
    staleTime: 60_000,
  });

  const { data: prayerStreak } = useQuery<{ gardenPrayedTodayCount?: number }>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak"),
    staleTime: 60_000,
  });

  const todayOffice = officeHistory?.days?.[officeHistory.days.length - 1];
  const morningDone = !!todayOffice?.morning || officeLocalDone(["morning", "morning-devotion"]);
  const eveningDone = !!todayOffice?.evening || officeLocalDone(["evening", "early-evening-devotion", "compline"]);
  const silenceDone =
    (contStats ? contStats.todaySeconds > 0 || contStats.healthMinutesToday > 0 : false) ||
    !!cobreathe?.done;

  const anchors: Anchor[] = [
    {
      key: "morning", label: t("rhythm.morning", { defaultValue: "Morning" }), icon: "🌅",
      done: morningDone, href: "/begin-prayer",
      cta: t("rhythm.cta_morning", { defaultValue: "Pray Morning Prayer" }),
      blurb: t("rhythm.blurb_morning", { defaultValue: "Begin the day with the office" }),
    },
    {
      key: "reflect", label: t("rhythm.reflect", { defaultValue: "Reflect" }), icon: "📖",
      done: reflectDone, href: "/menu/reflections",
      cta: t("rhythm.cta_reflect", { defaultValue: "Read today's reflection" }),
      blurb: t("rhythm.blurb_reflect", { defaultValue: "A few minutes with the day's word" }),
    },
    {
      key: "silence", label: t("rhythm.silence", { defaultValue: "Silence" }), icon: "🕯️",
      done: silenceDone, href: "/cobreathe",
      cta: t("rhythm.cta_silence", { defaultValue: "Keep two minutes of silence" }),
      blurb: t("rhythm.blurb_silence", { defaultValue: "Sit, or cobreathe for justice" }),
    },
    {
      key: "evening", label: t("rhythm.evening", { defaultValue: "Evening" }), icon: "🌙",
      done: eveningDone, href: hour >= 20 ? "/examen" : "/begin-prayer",
      cta: hour >= 20
        ? t("rhythm.cta_compline", { defaultValue: "Close the day — Compline & examen" })
        : t("rhythm.cta_evening", { defaultValue: "Pray Evening Prayer" }),
      blurb: hour >= 20
        ? t("rhythm.blurb_compline", { defaultValue: "Examine the day and rest" })
        : t("rhythm.blurb_evening", { defaultValue: "Mark the day's end with the office" }),
    },
  ];

  // Next step — the first undone anchor in a time-of-day order. Morning leads
  // before noon; the reflective middle leads through the afternoon; the
  // evening close leads after 8pm. All done → a benediction.
  const order: Anchor["key"][] = useMemo(() => {
    if (hour < 12) return ["morning", "reflect", "silence", "evening"];
    if (hour < 20) return ["reflect", "silence", "evening", "morning"];
    return ["evening", "silence", "reflect", "morning"];
  }, [hour]);

  const byKey = (k: Anchor["key"]) => anchors.find((a) => a.key === k)!;
  const next = order.map(byKey).find((a) => !a.done) ?? null;
  const allKept = anchors.every((a) => a.done);

  const gardenCount = prayerStreak?.gardenPrayedTodayCount ?? 0;
  const cobreatheCount = cobreathe?.count ?? 0;
  const streak = rhythm?.streak ?? 0;
  const last7 = rhythm?.last7 ?? 0;

  const go = useCallback((href: string) => setLocation(href), [setLocation]);

  return (
    <div
      className="rounded-2xl overflow-hidden mb-8 flex"
      style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.24)" }}
    >
      {/* Left accent bar — the "side panel" that matches the other home cards. */}
      <div className="w-1 flex-shrink-0" style={{ background: "rgba(110,180,130,0.85)" }} />
      <div className="flex-1 p-4">
      {/* Anchor strip */}
      <div className="flex items-start justify-around">
        {anchors.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => go(a.href)}
            className="flex flex-col items-center gap-1.5 flex-1"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            aria-label={a.label}
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 38, height: 38,
                background: a.done ? "rgba(46,107,64,0.30)" : "transparent",
                border: a.done ? "1.5px solid rgba(110,180,130,0.85)" : "1.5px dashed rgba(143,175,150,0.40)",
                fontSize: 16,
                filter: a.done ? "none" : "grayscale(0.7) opacity(0.65)",
                transition: "background 0.2s, border-color 0.2s",
              }}
            >
              {a.done ? "✓" : a.icon}
            </span>
            <span
              className="text-[10.5px]"
              style={{ color: a.done ? SAGE : "rgba(143,175,150,0.55)", fontFamily: SPACE_GROTESK }}
            >
              {a.label}
            </span>
          </button>
        ))}
      </div>

      {/* Streak / grace line */}
      {(streak > 0 || last7 > 0) && (
        <p className="text-[11.5px] text-center mt-2.5" style={{ color: "rgba(110,180,130,0.85)", fontFamily: SPACE_GROTESK }}>
          {streak > 0
            ? t("rhythm.streak_line", { streak, last7, defaultValue: `🔥 Day ${streak} of your rhythm · kept ${last7} of the last 7` })
            : t("rhythm.last7_line", { last7, defaultValue: `Kept ${last7} of the last 7 days` })}
        </p>
      )}

      {/* Next step prompt — or benediction when the day is fully kept */}
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(46,107,64,0.18)" }}>
        {next ? (
          <button
            type="button"
            onClick={() => go(next.href)}
            className="w-full flex items-center gap-3 text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span className="text-xl flex-shrink-0">{next.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                {t("rhythm.next_prefix", { defaultValue: "Next" })}: {next.cta}
              </p>
              <p className="text-[12px] mt-0.5 leading-snug" style={{ color: SAGE }}>
                {next.key === "silence" && cobreatheCount > 0
                  ? t("rhythm.blurb_silence_count", { count: cobreatheCount, defaultValue: `Sit, or cobreathe — ${cobreatheCount} have breathed today` })
                  : next.blurb}
              </p>
            </div>
            <span className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5"
              style={{ background: "#2D5E3F", color: WARM, fontFamily: SPACE_GROTESK }}>
              {t("rhythm.begin", { defaultValue: "Begin" })}
            </span>
          </button>
        ) : allKept ? (
          <div className="flex items-center gap-3">
            <span className="text-xl flex-shrink-0">🌿</span>
            <p className="text-[13.5px] leading-snug" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
              {t("rhythm.benediction", { defaultValue: "The day is kept. Rest now — the work and the prayer will keep till morning." })}
            </p>
          </div>
        ) : null}
      </div>

      {/* Garden social-proof line — our common life */}
      {gardenCount > 0 && (
        <Link href="/prayer-list">
          <p className="text-[11.5px] text-center mt-3 cursor-pointer" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SERIF, fontStyle: "italic" }}>
            {t("rhythm.garden_line", { count: gardenCount, defaultValue: `${gardenCount} ${gardenCount === 1 ? "person" : "people"} in your garden ${gardenCount === 1 ? "has" : "have"} prayed today` })}
          </p>
        </Link>
      )}
      </div>
    </div>
  );
}
