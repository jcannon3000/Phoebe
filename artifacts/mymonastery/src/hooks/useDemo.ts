import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

type BetaStatus = { isBeta: boolean; isAdmin: boolean };

/**
 * Check if the current user has beta access (server-managed).
 * Returns { isBeta, isAdmin }.
 */
export function useBetaStatus(): BetaStatus & { isLoading: boolean } {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<BetaStatus>({
    queryKey: ["/api/beta/status"],
    queryFn: () => apiRequest("GET", "/api/beta/status"),
    enabled: !!user,
    staleTime: 60_000, // cache for 1 minute
  });

  return {
    isBeta: data?.isBeta ?? false,
    isAdmin: data?.isAdmin ?? false,
    isLoading,
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
