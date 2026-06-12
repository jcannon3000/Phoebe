// Apple Health — Mindful Minutes (read-only).
//
// Thin typed wrapper over the native MindfulHealth Capacitor plugin
// (ios/App/App/MindfulHealthPlugin.swift). Meditation apps — Calm, Insight
// Timer, Apple's Mindfulness — write their sessions to Apple Health as
// "Mindful Minutes"; this lets Phoebe READ today's total so silence kept
// elsewhere can be reflected against the contemplation goal.
//
// iOS-native ONLY. On the web (`withphoebe.app`) or any non-native shell,
// `window.Capacitor` is absent and every call here no-ops / returns null, so
// callers can use these unconditionally and just hide the UI when
// `appleHealthAvailable()` is false.
//
// This is the read-only prototype: it can request read access and read the
// daily total. It does NOT upload anything or touch the goal — wiring the
// minutes into the goal/streak (with de-duplication of Phoebe's own in-app
// sits) is a deliberate follow-up.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isNativeShell } from "@/lib/isNativeShell";
import { apiRequest } from "@/lib/queryClient";

/** One mindful session read from Apple Health (for the history list). */
export type MindfulSession = {
  startMs: number;
  endMs: number;
  minutes: number;
  source: string;   // the app that logged it ("Calm", "Mindfulness", "Phoebe"…)
  isOwn: boolean;    // true when Phoebe itself wrote it (already shown in-app)
};

interface MindfulHealthPlugin {
  isAvailable: () => Promise<{ available: boolean }>;
  requestAuthorization: () => Promise<{ requested: boolean }>;
  mindfulMinutesToday: (opts?: { excludeOwn?: boolean }) => Promise<{ minutes: number; sessions: number }>;
  mindfulSessionsToday: () => Promise<{ sessions: MindfulSession[] }>;
  writeMindfulSession: (opts: { startMs: number; endMs: number }) => Promise<{ written: boolean }>;
  openApp: (opts: { scheme: string; fallbackUrl?: string }) => Promise<{ opened: boolean; usedFallback: boolean }>;
  // Arm background delivery of external mindful minutes so the contemplation
  // goal-reached push fires even when silence is kept in another app with
  // Phoebe closed. apiBase defaults native-side to https://withphoebe.app.
  enableBackgroundDelivery?: (opts?: { apiBase?: string }) => Promise<{ enabled: boolean }>;
}

function getPlugin(): MindfulHealthPlugin | null {
  if (!isNativeShell()) return null;
  const cap = (window as unknown as {
    Capacitor?: { Plugins?: Record<string, unknown> };
  }).Capacitor;
  return (cap?.Plugins?.MindfulHealth as MindfulHealthPlugin | undefined) ?? null;
}

/** True only inside the iOS native shell where the plugin is registered. */
export function appleHealthAvailable(): boolean {
  return getPlugin() !== null;
}

/** Whether HealthKit data is available on this device (false on web/simulator-less). */
export async function isMindfulDataAvailable(): Promise<boolean> {
  const p = getPlugin();
  if (!p) return false;
  try {
    return (await p.isAvailable()).available;
  } catch {
    return false;
  }
}

/**
 * Prompt for READ access to mindful sessions. Resolves true when the prompt was
 * shown — NOT necessarily that access was granted (HealthKit hides read-grant
 * state by design). Infer grant from whether getMindfulMinutesToday() returns
 * data on a day the user has logged mindful time elsewhere.
 */
export async function requestMindfulAuthorization(): Promise<boolean> {
  const p = getPlugin();
  if (!p) return false;
  try {
    return (await p.requestAuthorization()).requested;
  } catch {
    return false;
  }
}

/**
 * Today's mindful minutes (+ session count) from Apple Health, or null off-native.
 * Pass excludeOwn=true to drop Phoebe's own sits (written back to Health), leaving
 * only meditation from other apps — so the contemplation goal can fold them in
 * without double-counting sessions it already tracks in-app.
 */
export async function getMindfulMinutesToday(excludeOwn = false): Promise<{ minutes: number; sessions: number } | null> {
  const p = getPlugin();
  if (!p) return null;
  try {
    return await p.mindfulMinutesToday({ excludeOwn });
  } catch {
    return null;
  }
}

/**
 * Today's mindful sessions from Apple Health as a list (newest first), or []
 * off-native. Each carries its start/end, minutes, the writing app's name, and
 * isOwn — so the Contemplation history can show external meditation (Calm,
 * Insight Timer, Apple Mindfulness) as cards while dropping Phoebe's own sits,
 * which already appear as in-app history.
 */
export async function getMindfulSessionsToday(): Promise<MindfulSession[]> {
  const p = getPlugin();
  if (!p) return [];
  try {
    const r = await p.mindfulSessionsToday();
    return r?.sessions ?? [];
  } catch {
    return [];
  }
}

/**
 * Save a finished contemplative sit to Apple Health as a Mindful Session.
 * Best-effort + fire-and-forget: no-ops on web, and silently fails (returns
 * false) until the user has connected Apple Health (write needs authorization).
 * Safe to call after every logged sit.
 */
export async function writeMindfulSession(start: Date, end: Date): Promise<boolean> {
  const p = getPlugin();
  if (!p) return false;
  try {
    const r = await p.writeMindfulSession({ startMs: start.getTime(), endMs: end.getTime() });
    return !!r?.written;
  } catch {
    return false;
  }
}

/**
 * React hook — true when Apple Health reports any mindful minutes TODAY and the
 * user has connected Health. iOS-native only: false on web and until they've
 * gone through the connect prompt (the `phoebe:health-connected` flag set by
 * the contemplation goal card). Shared so surfaces like the Way of Love "Pray"
 * practice can count meditation logged in OTHER apps (Insight Timer, Calm,
 * Apple Mindfulness) without each re-implementing the read. The query is gated,
 * so it no-ops entirely on web / when not connected.
 */
export function useHealthMindfulToday(): boolean {
  let connected = false;
  try { connected = localStorage.getItem("phoebe:health-connected") === "1"; } catch { /* private mode */ }
  const q = useQuery<{ minutes: number; sessions: number } | null>({
    // Keyed by local day so it refetches across a midnight rollover.
    queryKey: ["apple-health-mindful-today", new Date().toLocaleDateString("en-CA")],
    queryFn: () => getMindfulMinutesToday(),
    enabled: appleHealthAvailable() && connected,
    staleTime: 5 * 60_000,
  });
  return (q.data?.minutes ?? 0) > 0;
}

/**
 * Open the Apple Health app (best-effort, native only). HealthKit shows its
 * permission sheet exactly once — after a denial the ONLY way to grant read
 * access is inside the Health app (Profile → Apps → Phoebe → allow
 * Mindfulness), so settings deep-links there.
 */
export async function openHealthApp(): Promise<boolean> {
  const p = getPlugin();
  if (!p) return false;
  try {
    const r = await p.openApp({ scheme: "x-apple-health://" });
    return !!r?.opened;
  } catch {
    return false;
  }
}

// Module-level so the dedup survives Layout remounts on navigation (each page
// renders its own <Layout>, so a per-component ref would re-upload the same
// value on every route change). Reset implicitly on a full app reload.
let lastHealthUpload = "";

// Arm native background delivery once per app session. The native side is
// idempotent (it persists an "enabled" flag and re-registers the observer on
// every launch), so this single best-effort call per load is enough — it just
// ensures a fresh install / freshly-authenticated user turns it on.
let bgDeliveryArmed = false;

/**
 * Side-effect hook: best-effort upload of today's EXTERNAL mindful minutes to
 * the server (PUT /api/me/contemplation-health-minutes), so the ~7pm goal
 * nudge and the contemplation-stats endpoint can count silence kept in other
 * apps even when the user never opens the Contemplation page. Mounted in the
 * global Layout shell, so it runs on (nearly) every authenticated page.
 *
 * Reads with excludeOwn=true — Phoebe's own sits are already counted server-
 * side via prayer_sessions, so uploading them would double-count. iOS-native
 * only (no-ops on web); shares the Contemplation card's query key so the two
 * dedupe to a single HealthKit read. Only uploads a positive value, so an
 * ungranted/empty read can't clobber a real total synced earlier.
 */
export function useSyncHealthMinutes(): void {
  const day = new Date().toLocaleDateString("en-CA");
  const qc = useQueryClient();
  const q = useQuery<{ minutes: number; sessions: number } | null>({
    // Same key/queryFn as the Contemplation goal card → one shared fetch.
    queryKey: ["apple-health-mindful-external", day],
    queryFn: () => getMindfulMinutesToday(true),
    enabled: appleHealthAvailable(),
    staleTime: 5 * 60_000,
  });
  // Arm background delivery once HealthKit is available — so a goal crossed
  // entirely in another app (Phoebe closed) still uploads and fires the
  // goal-reached push. Independent of today's minutes: it must be armed before
  // the crossing happens, not after.
  useEffect(() => {
    if (bgDeliveryArmed) return;
    const p = getPlugin();
    if (!p?.enableBackgroundDelivery) return;
    bgDeliveryArmed = true;
    void p.enableBackgroundDelivery().catch(() => { bgDeliveryArmed = false; });
  }, []);
  const minutes = q.data?.minutes ?? 0;
  useEffect(() => {
    if (minutes <= 0) return;
    const key = `${day}:${minutes}`;
    if (lastHealthUpload === key) return;
    lastHealthUpload = key;
    void apiRequest("PUT", "/api/me/contemplation-health-minutes", { minutes, day })
      .then(() => {
        // Invalidate so ContemplationHomeCard on the dashboard picks up the
        // new external minutes without waiting for the 60s stale window.
        qc.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
      })
      .catch(() => { if (lastHealthUpload === key) lastHealthUpload = ""; }); // allow retry
  }, [minutes, day, qc]);
}
