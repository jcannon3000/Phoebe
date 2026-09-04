import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { InboxItem } from "@/lib/taizeInbox";

/**
 * Pasted-in Substack WEEKLIES (owner, 2026-09-04: "put any link in through an
 * admin tool to a substack and it would turn it into a weekly").
 *
 * Subscriptions are their own server table, not home-layout keys — the
 * layout's server allowlist strips keys it doesn't know and the customizer
 * hides them on save. Everything that shows a weekly (the home card, the
 * Newsletters page, the customizer's reflections step, the push) reads the
 * one list below, so they agree by construction.
 */
export type WeeklySource = {
  slug: string; siteUrl: string; feedUrl: string;
  title: string; subtitle: string; description: string; emoji: string;
  enabled: boolean; subscribed: boolean;
};

export const WEEKLIES_KEY = ["/api/weeklies"] as const;
export const WEEKLY_LATEST_KEY = ["/api/weeklies/latest"] as const;

/** The inbox source id for a weekly — its read-state key and its card key. */
export const weeklySourceId = (slug: string) => `w:${slug}` as const;

export function useWeeklies(enabled = true): WeeklySource[] {
  const q = useQuery<WeeklySource[]>({
    queryKey: WEEKLIES_KEY,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => ((await apiRequest("GET", "/api/weeklies")) as WeeklySource[] | null) ?? [],
  });
  return q.data ?? [];
}

/** Newest post per slug, one request for all enabled sources. `undefined` while loading. */
export function useWeeklyLatest(enabled: boolean): Record<string, InboxItem | null> | undefined {
  const q = useQuery<Record<string, InboxItem | null>>({
    queryKey: WEEKLY_LATEST_KEY,
    enabled,
    staleTime: 15 * 60_000,
    retry: 1,
    queryFn: async () => ((await apiRequest("GET", "/api/weeklies/latest")) as Record<string, InboxItem | null> | null) ?? {},
  });
  return q.data;
}

/** Follow / unfollow — optimistic on the list, then refetched. */
export async function setWeeklySubscription(qc: QueryClient, slug: string, on: boolean): Promise<void> {
  await qc.cancelQueries({ queryKey: WEEKLIES_KEY });
  qc.setQueryData<WeeklySource[]>(WEEKLIES_KEY, (cur) => (cur ?? []).map((w) => (w.slug === slug ? { ...w, subscribed: on } : w)));
  try {
    await apiRequest("PUT", `/api/weeklies/${slug}/subscription`, { on });
  } finally {
    void qc.invalidateQueries({ queryKey: WEEKLIES_KEY });
  }
}

export function useSetWeeklySubscription(): (slug: string, on: boolean) => Promise<void> {
  const qc = useQueryClient();
  return (slug, on) => setWeeklySubscription(qc, slug, on);
}
