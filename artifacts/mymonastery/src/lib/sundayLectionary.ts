import { apiRequest } from "@/lib/queryClient";

export type SundayTrack = { ot: string | null; psalm: string | null; nt: string | null; gospel: string | null };
export type SundayLectionary = {
  sundayDate: string; name: string | null; url: string;
  gospel: string | null; psalm: string | null; nt: string[]; ot: string[];
  track1: SundayTrack | null; track2: SundayTrack | null;
};

/**
 * The coming Sunday's lectionary, as ONE query shared by /this-sunday and the
 * Menu, which warms it.
 *
 * The page offers Track 1 / Track 2 above its cards only once this answers,
 * so on a cold open it laid the cards out and then pushed them 55px down
 * (audit, 2026-09-14). Warmed from the Menu, the page that opens it, the
 * answer is usually there on its first frame.
 */
export const sundayLectionaryQuery = {
  // ?v=2 busts the WebView's HTTP cache of the pre-tracks body (served with an
  // hour's max-age); harmless once every cache has rolled over.
  queryKey: ["/api/lectionary/sunday", 2] as const,
  queryFn: async () => ((await apiRequest("GET", "/api/lectionary/sunday?v=2")) as SundayLectionary | null) ?? null,
  staleTime: 10 * 60_000,
};
