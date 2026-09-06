import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

/**
 * WHAT A PERSON'S COMMUNITIES UNLOCK.
 *
 * Owner (2026-09-05): a group admin can turn off shared prayer requests and
 * events; then "the group would have none of that UI, and the users wouldn't
 * unlock those menu and home-screen features." So the Events row, the home's
 * Events section and the /events page look for a community WITH events on,
 * and the shared prayer list for a community with prayer requests on — not
 * for any community at all (which is what `hasGroup` said).
 */
type GroupLite = { id: number; slug: string; isPublic?: boolean; prayerRequestsEnabled?: boolean; eventsEnabled?: boolean };

export function useGroupFeatures() {
  const { user } = useAuth();
  const { data } = useQuery<{ groups: GroupLite[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups") as Promise<{ groups: GroupLite[] }>,
    enabled: !!user,
    staleTime: 60_000,
  });
  const groups = data?.groups ?? [];
  const eventGroups = groups.filter((g) => g.eventsEnabled !== false);
  // A member gets the Prayer list unless the group's admin switched prayer
  // requests OFF. A PUBLIC group's flag is forced false by the server (a
  // browseable group can't host a shared list), which is the public rule, not
  // an admin's choice — so its members keep the feature (owner, 2026-09-05:
  // "I asked for the prayer list menu option to come back"; VTS Pilot is
  // public). The group's OWN list still needs the flag AND not-public
  // (community-detail prayersOn, server listIsOpen).
  const prayerGroups = groups.filter((g) => g.isPublic || g.prayerRequestsEnabled !== false);
  return {
    hasGroup: groups.length > 0,
    hasEventsGroup: eventGroups.length > 0,
    hasPrayerGroup: prayerGroups.length > 0,
    eventGroupIds: new Set(eventGroups.map((g) => g.id)),
    eventGroupSlugs: new Set(eventGroups.map((g) => g.slug)),
  };
}
