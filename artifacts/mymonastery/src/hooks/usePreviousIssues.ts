import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { InboxSource } from "@/lib/taizeInbox";

export type PreviousIssue = { title: string; url: string };

/** How many the reader's "Previous" menu lists — owner: "the last 7". */
export const PREVIOUS_ISSUES = 7;

const LIST_PATH: Record<InboxSource, string> = {
  taize: "/api/taize/meditations",
  andrews: "/api/andrews/posts",
};

/**
 * The last issues of a weekly newsletter, newest first, for the native
 * reader's "Previous" menu (passed through openExternal's `previous`). Both
 * lists are public and cached server-side; a failure just means no menu.
 */
export function usePreviousIssues(source: InboxSource, enabled: boolean): PreviousIssue[] {
  const q = useQuery<PreviousIssue[]>({
    queryKey: [LIST_PATH[source]],
    enabled,
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const raw = (await apiRequest("GET", LIST_PATH[source])) as { title?: string; url?: string }[] | null;
      return (raw ?? [])
        .filter((p): p is PreviousIssue => typeof p?.title === "string" && typeof p?.url === "string" && !!p.title && !!p.url)
        .slice(0, PREVIOUS_ISSUES);
    },
  });
  return q.data ?? [];
}
