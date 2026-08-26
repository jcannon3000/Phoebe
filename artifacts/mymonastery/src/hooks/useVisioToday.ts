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
 * Which office's readings the artwork follows — FIXED, not the clock.
 *
 * Owner: "we want everyone to be viewing the same image who's practicing it."
 * Picking the side by the hour quietly broke that: someone praying before 5pm
 * matched the morning lessons and someone praying after matched the evening
 * ones, so two people on the same day got different paintings — and the home
 * card could name a different image from the one the practice then opened.
 * One side for everyone, all day.
 */
export const VISIO_READINGS_SIDE = "morning";

export function useVisioToday(): { chosen: Chosen | null; settled: boolean } {
  const today = useMemo(() => {
    try { return new Date().toLocaleDateString("en-CA"); } catch { return "1970-01-01"; }
  }, []);
  const { data, isFetched } = useQuery<{ lessons?: string[] }>({
    queryKey: ["/api/office/readings", VISIO_READINGS_SIDE, "office", today],
    // Never resolve undefined — React Query throws on it, and an older server
    // without the route falls through to the SPA and hands back a non-JSON
    // body. An empty shape simply means "no lectionary today".
    queryFn: async () => {
      try {
        const r = await apiRequest<{ lessons?: string[] } | undefined>(
          "GET", `/api/office/readings?side=${VISIO_READINGS_SIDE}&level=office&date=${today}`,
        );
        return r && typeof r === "object" ? r : {};
      } catch {
        return {};
      }
    },
    staleTime: 30 * 60_000,
    retry: false,
  });
  const lessons = useMemo(() => (data?.lessons ?? []).filter(Boolean), [data]);
  // Only once the lookup has settled. Naming the rotation's artwork while the
  // lessons are still in flight would put one title on the card and a
  // different one on the slide a moment later.
  const chosen = useMemo(() => (isFetched ? chooseArtwork(today, lessons) : null), [isFetched, today, lessons]);
  return { chosen, settled: isFetched };
}
