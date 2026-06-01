/**
 * Feeds the iOS Lock/Home Screen widget (PhoebeWidget). Computes the prayer
 * rhythm — the forgiving consistency streak, whether an office was prayed today,
 * and the next office to pray — and hands it to the native bridge, which writes
 * it into the shared App Group store the widget reads.
 *
 * Native only: on web `PhoebeNative` is undefined and this is a no-op (no fetch,
 * no write). Mount <WidgetSync /> once where the app lands; react-query keeps
 * the two small fetches shared with the rest of the app.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";
import { computeTurnConsistency, engagementDays, type EngagementOfficeDay } from "@/lib/turnConsistency";

type WidgetState = {
  streakDays: number;
  prayedToday: boolean;
  nextOffice: string;
  updatedAt: string;
};
type WidgetBridge = { updateWidget?: (s: WidgetState) => void };

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function useWidgetSync(): void {
  const { user } = useAuth();
  const native = isNativeShell();
  const enabled = !!user && native;

  const officeQ = useQuery<{ days: EngagementOfficeDay[] }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    enabled,
    staleTime: 60_000,
  });
  const compQ = useQuery<{ completions: { localDate: string }[] }>({
    queryKey: ["/api/practice-completion"],
    queryFn: () => apiRequest("GET", "/api/practice-completion"),
    enabled,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!enabled) return;
    const days = officeQ.data?.days ?? [];
    if (days.length === 0) return;
    const todayEntry = days.find((d) => d.ymd === ymd(new Date()));
    const morning = !!todayEntry?.morning;
    const evening = !!todayEntry?.evening;
    const turn = computeTurnConsistency(
      engagementDays((compQ.data?.completions ?? []).map((r) => r.localDate), days),
    );
    const bridge = (window as unknown as { PhoebeNative?: WidgetBridge }).PhoebeNative;
    bridge?.updateWidget?.({
      streakDays: turn.currentRunDays,
      prayedToday: morning || evening,
      // "" when both offices are done → the widget shows "Prayed today".
      nextOffice: !morning ? "Morning Prayer" : !evening ? "Evening Prayer" : "",
      updatedAt: new Date().toISOString(),
    });
  }, [enabled, officeQ.data, compQ.data]);
}

export function WidgetSync(): null {
  useWidgetSync();
  return null;
}
