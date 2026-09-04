import { useQuery, useQueries } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { InboxSource } from "@/lib/taizeInbox";

export type PreviousIssue = { title: string; url: string };

/** How many the reader's "Previous" menu lists — owner: "the last 7". */
export const PREVIOUS_ISSUES = 7;

function listPath(source: InboxSource): string {
  if (source === "taize") return "/api/taize/meditations";
  if (source === "andrews") return "/api/andrews/posts";
  return `/api/weeklies/${source.slice(2)}/posts`;
}

/**
 * The last issues of a weekly newsletter, newest first, for the native
 * reader's "Previous" menu (passed through openExternal's `previous`). Both
 * lists are public and cached server-side; a failure just means no menu.
 */
export function usePreviousIssues(source: InboxSource, enabled: boolean): PreviousIssue[] {
  const q = useQuery<PreviousIssue[]>({
    queryKey: [listPath(source)],
    enabled,
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const raw = (await apiRequest("GET", listPath(source))) as { title?: string; url?: string }[] | null;
      return (raw ?? [])
        .filter((p): p is PreviousIssue => typeof p?.title === "string" && typeof p?.url === "string" && !!p.title && !!p.url)
        .slice(0, PREVIOUS_ISSUES);
    },
  });
  return q.data ?? [];
}

/** The same lists for a DYNAMIC set of sources (hooks can't loop) — keyed by source. */
export function usePreviousIssuesFor(sources: { source: InboxSource; enabled: boolean }[]): Record<string, PreviousIssue[]> {
  const results = useQueries({
    queries: sources.map(({ source, enabled }) => ({
      queryKey: [listPath(source)],
      enabled,
      staleTime: 15 * 60_000,
      queryFn: async () => {
        const raw = (await apiRequest("GET", listPath(source))) as { title?: string; url?: string }[] | null;
        return (raw ?? [])
          .filter((p): p is PreviousIssue => typeof p?.title === "string" && typeof p?.url === "string" && !!p.title && !!p.url)
          .slice(0, PREVIOUS_ISSUES);
      },
    })),
  });
  const out: Record<string, PreviousIssue[]> = {};
  sources.forEach(({ source }, i) => { out[source] = results[i]?.data ?? []; });
  return out;
}
