import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

type BetaStatus = { isBeta: boolean; isAdmin: boolean; showWelcome?: boolean };

const BETA_VIEW_KEY = "phoebe:betaView";
const ADMIN_VIEW_KEY = "phoebe:adminView";

/** Read a boolean toggle from localStorage (defaults to true) */
function readToggle(key: string): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

/** Generic localStorage-backed toggle hook */
function useToggle(key: string): [boolean, () => void] {
  const [enabled, setEnabled] = useState<boolean>(() => readToggle(key));

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(key, String(next)); } catch {}
      return next;
    });
  }, [key]);

  return [enabled, toggle];
}

/**
 * Toggle between beta view and regular view.
 * Returns [betaViewEnabled, toggle].
 */
export function useBetaViewToggle(): [boolean, () => void] {
  return useToggle(BETA_VIEW_KEY);
}

/**
 * Check if the current user has beta access (server-managed).
 * Returns { isBeta, isAdmin, betaViewEnabled, toggleBetaView }.
 * betaViewEnabled can be toggled to preview the regular user experience.
 */
export function useBetaStatus(): BetaStatus & {
  isLoading: boolean;
  betaViewEnabled: boolean; toggleBetaView: () => void;
  adminViewEnabled: boolean; toggleAdminView: () => void;
  showWelcome: boolean; rawIsBeta: boolean; rawIsAdmin: boolean;
} {
  const { user } = useAuth();
  const [betaViewEnabled, toggleBetaView] = useBetaViewToggle();
  const [adminViewEnabled, toggleAdminView] = useToggle(ADMIN_VIEW_KEY);

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
    rawIsBeta,
    isAdmin: rawIsAdmin && betaViewEnabled && adminViewEnabled,
    rawIsAdmin,
    showWelcome: data?.showWelcome ?? false,
    isLoading,
    betaViewEnabled,
    toggleBetaView,
    adminViewEnabled,
    toggleAdminView,
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
