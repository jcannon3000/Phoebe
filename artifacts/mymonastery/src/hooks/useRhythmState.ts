import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  hasReadCacToday, hasReadFddToday, hasReadSsjeToday,
  CAC_READ_EVENT, FDD_READ_EVENT, SSJE_READ_EVENT,
} from "@/lib/cacReadState";
import { getSideLevel } from "@/lib/officePrefs";

// How the user has chosen to pray the daily office — drives whether the
// Morning/Evening anchor reads "Prayer", "Devotion", or "Pray together".
export type PrayerKind = "office" | "devotion" | "community";

// ── useRhythmState ───────────────────────────────────────────────────────────
//
// The shared source of truth for "today's rhythm": the four daily anchors
// (Morning · Reflect · Silence · Evening) and the streak / garden counts.
// Extracted from the TodaysRhythm card so three surfaces can agree without
// duplicating the logic:
//   • TodaysRhythm (the full card — home was, now the closing slide + page)
//   • the header "Daily progress" pill (renders four dots from the done flags)
//   • the /daily-progress page
// Every queryKey matches what the dashboard / contemplation page already
// fetch, so React Query dedupes — calling this hook in several places adds no
// network. Reflection state is localStorage-only and live-updates off the
// read events the reflection cards fire.

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Did the user finish an office on a given side today, per the localStorage
// flags the office viewer writes synchronously (before the server query lands)?
function officeLocalDone(sides: string[]): boolean {
  const day = localDay();
  try {
    return sides.some((s) => localStorage.getItem(`phoebe:office-completed:${s}:${day}`) !== null);
  } catch {
    return false;
  }
}

export type RhythmState = {
  morningDone: boolean;
  reflectDone: boolean;
  silenceDone: boolean;
  eveningDone: boolean;
  /** How many of the four anchors are kept today (0–4). */
  doneCount: number;
  streak: number;
  last7: number;
  keptToday: boolean;
  gardenCount: number;
  cobreatheCount: number;
  /** Office / Devotion / community — so the Morning & Evening labels match
   *  what the user actually prays (their Customize-home / Rule of Life pick). */
  prayerKind: PrayerKind;
};

export function useRhythmState(): RhythmState {
  const day = localDay();

  // Reflection read-state. localStorage is per-device and flips instantly, but
  // doesn't sync across devices (read CAC on mobile → web wouldn't know). CAC
  // reads are also logged server-side, so we OR in a server check below; the
  // local flags keep the anchor responsive on the device that did the reading.
  const [reflectLocal, setReflectLocal] = useState(
    () => hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday(),
  );
  useEffect(() => {
    const recheck = () => setReflectLocal(hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday());
    // The reflection is read on a separate surface (often the in-app browser),
    // which stamps localStorage + fires a read-event. We re-check on those
    // events, but iOS WebViews don't fire `visibilitychange` reliably when the
    // in-app browser is dismissed — so the anchor "sometimes" didn't flip on
    // return. Listen on the broader set of return-to-app signals (focus,
    // pageshow, the native resume event) plus the storage event so the check
    // is robust however the read landed.
    window.addEventListener(CAC_READ_EVENT, recheck);
    window.addEventListener(FDD_READ_EVENT, recheck);
    window.addEventListener(SSJE_READ_EVENT, recheck);
    window.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    // Native shell signals: the app returning to the foreground, and — the
    // important one for reflections — the in-app browser being dismissed
    // (a reflection opened externally stamps read-state, then fires this).
    window.addEventListener("phoebe:appactive", recheck);
    window.addEventListener("phoebe:browserfinished", recheck);
    return () => {
      window.removeEventListener(CAC_READ_EVENT, recheck);
      window.removeEventListener(FDD_READ_EVENT, recheck);
      window.removeEventListener(SSJE_READ_EVENT, recheck);
      window.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
      window.removeEventListener("phoebe:browserfinished", recheck);
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

  // Server-backed reflection reads (CAC + FDD + SSJE) for today — so the
  // Reflect anchor is correct on a device that didn't do the reading (e.g. web,
  // after reading on mobile). OR'd with the instant local flag below.
  const { data: reflRead } = useQuery<{ cac: boolean; fdd: boolean; ssje: boolean }>({
    queryKey: ["/api/me/reflections-read", day],
    queryFn: () => apiRequest("GET", `/api/me/reflections-read?ymd=${day}`),
    staleTime: 60_000,
  });

  const reflectDone = reflectLocal || !!reflRead?.cac || !!reflRead?.fdd || !!reflRead?.ssje;

  // What the user prays for the office — global default (office-prefs) OR a
  // per-side override. Mirrors the home prayer card's resolution, so the
  // Morning/Evening anchors read "Devotion"/"Prayer"/"Pray together" to match.
  const { data: officePrefs } = useQuery<{ defaultPrayerLevel?: "devotion" | "office" | "intercessions" }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
  });
  const dpl = officePrefs?.defaultPrayerLevel;
  const ml = getSideLevel("morning");
  const el = getSideLevel("evening");
  const prayerKind: PrayerKind =
    (dpl === "office" || ml === "office" || el === "office") ? "office"
    : (dpl === "devotion" || ml === "devotion" || el === "devotion") ? "devotion"
    : (dpl === "intercessions" || ml === "intercessions" || el === "intercessions") ? "community"
    : "devotion";

  const todayOffice = officeHistory?.days?.[officeHistory.days.length - 1];
  const morningDone = !!todayOffice?.morning || officeLocalDone(["morning", "morning-devotion"]);
  const eveningDone = !!todayOffice?.evening || officeLocalDone(["evening", "early-evening-devotion", "compline"]);
  const silenceDone =
    (contStats ? contStats.todaySeconds > 0 || contStats.healthMinutesToday > 0 : false) ||
    !!cobreathe?.done;

  const doneCount = [morningDone, reflectDone, silenceDone, eveningDone].filter(Boolean).length;

  return {
    morningDone,
    reflectDone,
    silenceDone,
    eveningDone,
    doneCount,
    streak: rhythm?.streak ?? 0,
    last7: rhythm?.last7 ?? 0,
    keptToday: !!rhythm?.keptToday,
    gardenCount: prayerStreak?.gardenPrayedTodayCount ?? 0,
    cobreatheCount: cobreathe?.count ?? 0,
    prayerKind,
  };
}
