/**
 * Warms the start of today's office audio so it plays the moment the user taps.
 *
 * Mounted globally (App.tsx) but gated to signed-in users. Deferred to idle so
 * it never competes with first paint: once the app is quiet, it resolves
 * today's Morning + Evening office episodes (the user's chosen audio source)
 * and preloads the opening ~15s of each into the HTTP cache. Best-effort —
 * any failure is silent, and each URL is warmed at most once per session.
 */
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOfficePrefs } from "@/lib/officePrefs";
import { apiRequest } from "@/lib/queryClient";
import { preloadAudioStart } from "@/lib/preloadAudio";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function OfficeAudioPreloader() {
  const { user } = useAuth();
  const { officeAudioSource } = useOfficePrefs();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const run = async () => {
      try {
        const src = encodeURIComponent(officeAudioSource);
        for (const slug of ["morning-office", "evening-office"]) {
          if (cancelled) return;
          const ep = (await apiRequest("GET", `/api/podcast/${slug}/today?source=${src}`)) as { audioUrl?: string | null };
          if (!cancelled && ep?.audioUrl) preloadAudioStart(ep.audioUrl);
        }
      } catch {
        /* best effort */
      }
    };

    const w = window as IdleWindow;
    let idleId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === "function") idleId = w.requestIdleCallback(run, { timeout: 5000 });
    else timerId = setTimeout(run, 2500);

    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId);
      if (timerId !== undefined) clearTimeout(timerId);
    };
  }, [user, officeAudioSource]);

  return null;
}
