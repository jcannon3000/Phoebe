import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

type BetaStatus = { isBeta: boolean; isAdmin: boolean };

const BETA_VIEW_KEY = "phoebe:betaView";

/** Read the current beta view preference from localStorage */
function readBetaView(): boolean {
  try {
    const stored = localStorage.getItem(BETA_VIEW_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

/**
 * Toggle between beta view and regular view.
 * Returns [betaViewEnabled, toggle].
 */
export function useBetaViewToggle(): [boolean, () => void] {
  const [enabled, setEnabled] = useState<boolean>(readBetaView);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(BETA_VIEW_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  return [enabled, toggle];
}

/**
 * Check if the current user has beta access (server-managed).
 * Returns { isBeta, isAdmin, betaViewEnabled, toggleBetaView }.
 * betaViewEnabled can be toggled to preview the regular user experience.
 */
export function useBetaStatus(): BetaStatus & { isLoading: boolean; betaViewEnabled: boolean; toggleBetaView: () => void } {
  const { user } = useAuth();
  const [betaViewEnabled, toggleBetaView] = useBetaViewToggle();

  const { data, isLoading } = useQuery<BetaStatus>({
    queryKey: ["/api/beta/status"],
    queryFn: () => apiRequest("GET", "/api/beta/status"),
    enabled: !!user,
    staleTime: 60_000,
  });

  const rawIsBeta = data?.isBeta ?? false;
  const rawIsAdmin = data?.isAdmin ?? false;

  return {
    isBeta: rawIsBeta && betaViewEnabled,
    isAdmin: rawIsAdmin && betaViewEnabled,
    isLoading,
    betaViewEnabled,
    toggleBetaView,
  };
}

/**
 * Legacy demo flag hook — now just delegates to beta status.
 * Kept for backward compatibility.
 */
export function useDemoFlag(_flag: string): boolean {
  const { isBeta } = useBetaStatus();
  return isBeta;
}
