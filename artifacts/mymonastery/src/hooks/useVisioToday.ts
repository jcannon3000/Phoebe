/**
 * Today's Visio Divina artwork — one answer, shared by the practice and its
 * home card.
 *
 * The card's second line names the image (owner), and it must be the SAME
 * image the practice opens. Both call chooseArtwork with the same date and the
 * same lessons, through the same query key, so there is one computation rather
 * than two that agree by luck.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { chooseArtwork, type Chosen } from "@/lib/visioSelect";

/**
 * Which office's readings the artwork follows: ALL of them.
 *
 * Owner: "the best case scenario is every day, the picture we're showing is
 * connected to one of the lectionary readings — either in morning prayer or
 * evening prayer or the psalms."
 *
 * This used to be pinned to the morning office's lessons alone (a fix for an
 * older bug where the SIDE followed the clock and two people on one day saw
 * two paintings — that invariant still holds: everyone gets the same, fixed
 * set of references all day, it's just the whole day's set now). Audited over
 * the full two-year cycle: morning lessons alone connect the artwork to the
 * lectionary on 9% of days; morning + evening + the appointed psalms connect
 * on over 60%, and the psalms are most of the difference — the catalogue is
 * full of psalm-tagged works the old selection never saw.
 */
/**
 * The lectionary's own punctuation, removed: the office writes optional
 * psalms as "[95]" and optional verse spans as "63:1-8(9-11)", neither of
 * which the reference parser reads. Brackets drop, parens unwrap.
 */
function normalizeRef(r: string): string {
  // Parens become a separated list item ("63:1-8(9-11)" → "63:1-8, 9-11"),
  // never bare unwrapping — that glued the digits into "1-89-11". The parser
  // reads the first span, which is the appointed core either way.
  return r.replace(/[\[\]]/g, "").replace(/\(([^)]*)\)/g, ", $1").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
}

/** One side's appointed refs — lessons AND psalms, normalized. */
function refsOf(data: { lessons?: string[]; psalms?: string[] } | undefined): string[] {
  return [
    ...(data?.lessons ?? []),
    ...(data?.psalms ?? []).map((p) => `Psalm ${p}`),
  ].filter(Boolean).map(normalizeRef);
}

/**
 * Every reference appointed for today — both offices' lessons and psalms.
 * ONE implementation, used by the practice page and the home card both, so
 * the two can't disagree about which painting today gets.
 */
export function useVisioLessons(): { lessons: string[]; isFetched: boolean } {
  const today = useMemo(() => {
    try { return new Date().toLocaleDateString("en-CA"); } catch { return "1970-01-01"; }
  }, []);
  const q = (side: "morning" | "evening") => ({
    queryKey: ["/api/office/readings", side, "office", today],
    queryFn: async () => {
      try {
        const r = await apiRequest<{ lessons?: string[]; psalms?: string[] } | undefined>(
          "GET", `/api/office/readings?side=${side}&level=office&date=${today}`,
        );
        return r && typeof r === "object" ? r : {};
      } catch {
        return {};
      }
    },
    staleTime: 30 * 60_000,
    retry: false,
  });
  const morning = useQuery<{ lessons?: string[]; psalms?: string[] }>(q("morning"));
  const evening = useQuery<{ lessons?: string[]; psalms?: string[] }>(q("evening"));
  const lessons = useMemo(
    () => [...new Set([...refsOf(morning.data), ...refsOf(evening.data)])],
    [morning.data, evening.data],
  );
  // Fetched = BOTH settled. Choosing on half the day's readings would name one
  // painting on the card and another on the slide a moment later.
  return { lessons, isFetched: morning.isFetched && evening.isFetched };
}

export function useVisioToday(): { chosen: Chosen | null; settled: boolean } {
  const today = useMemo(() => {
    try { return new Date().toLocaleDateString("en-CA"); } catch { return "1970-01-01"; }
  }, []);
  const { lessons, isFetched } = useVisioLessons();
  // Only once the lookup has settled. Naming the rotation's artwork while the
  // lessons are still in flight would put one title on the card and a
  // different one on the slide a moment later.
  const chosen = useMemo(() => (isFetched ? chooseArtwork(today, lessons) : null), [isFetched, today, lessons]);
  return { chosen, settled: isFetched };
}
