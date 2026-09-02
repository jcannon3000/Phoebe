import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./useAuth";

/**
 * May this person see the full CAC library?
 *
 * Owner: "members of special pilot groups would be able to see the full
 * library" … "only super admins could turn this on for groups."
 *
 * ONE SOURCE OF TRUTH, ON THE SERVER. The question is "does any group I have
 * JOINED carry the grant?", which the client cannot answer without the group
 * rows — and re-deriving it here from a cached membership list is how a gate
 * ends up disagreeing with the route it guards. /me/cac-library answers it, and
 * the same expression guards the pages themselves.
 *
 * `viaGroups` names which groups granted it, so a screen can say WHY rather
 * than access appearing by magic — and so "why can they see this?" has an
 * answer without a database query.
 *
 * FAILS CLOSED. A 401, an offline device or a malformed response yields
 * `false`, never a permissive default: this opens someone else's catalogue, so
 * the wrong answer should be "you can't see it yet", not "here you go".
 */
export type CacLibraryAccess = {
  enabled: boolean;
  viaGroups: string[];
  superAdmin: boolean;
};

export function useCacLibrary(): CacLibraryAccess & { isLoading: boolean } {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<CacLibraryAccess>({
    queryKey: ["/api/me/cac-library"],
    queryFn: () => apiRequest("GET", "/api/me/cac-library"),
    // Signed-out users have no groups and so no grant — asking would just be a
    // guaranteed 401 on every load.
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60_000,
  });
  return {
    enabled: data?.enabled === true,
    viaGroups: Array.isArray(data?.viaGroups) ? data.viaGroups : [],
    superAdmin: data?.superAdmin === true,
    isLoading,
  };
}
