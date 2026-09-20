// ── The two Sunday commentaries, and how each is opened ─────────────────────
//
// Yale Divinity Commentary (Andrew McGowan's "Andrew's Version") and the
// Living Church Commentary, lifted out of pages/this-sunday.tsx so the home's
// Explore "Reflections" row can offer them too (owner, 2026-09-19: "Put Yale
// Commentary & Living Church Commentary in the reflection ticker") without a
// second copy of which post counts as THIS Sunday's or how it opens.
//
// Each is gated exactly as before: super admins always, everyone once its own
// Admin Tools switch is on (lib/appSettings). A gated-off commentary is simply
// absent from the list.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { openExternal, openExternalThenMarkRead } from "@/lib/openExternal";
import { useAndrewsVisible, useLivingChurchVisible } from "@/lib/appSettings";
import { usePreviousIssues, PREVIOUS_ISSUES } from "@/hooks/usePreviousIssues";
import { markAndrewsRead, type InboxItem } from "@/lib/taizeInbox";
import { nextSundayYmdNY } from "@/lib/sundayDate";

/** The Living Church's "Sunday's Readings" column — opened when this Sunday's post isn't up yet. */
export const LIVING_CHURCH_INDEX = "https://livingchurch.org/category/scripture/sundays-readings/";
const ANDREWS_INDEX = "https://abmcg.substack.com/";

export type SundayCommentary = {
  key: "commentary" | "living-church";
  /** No cross glyphs (owner's standing rule), so no ⛪ for the church. */
  emoji: string;
  title: string;
  blurb: string;
  open: () => void;
};

/**
 * @param sundayYmd the Sunday whose Living Church post to open; defaults to
 * the coming Sunday in New York, which is what This Sunday shows too.
 */
export function useSundayCommentaries(sundayYmd?: string | null): SundayCommentary[] {
  const andrewsVisible = useAndrewsVisible();
  const andrewsQ = useQuery<InboxItem | null>({
    queryKey: ["/api/andrews/latest"],
    enabled: andrewsVisible,
    staleTime: 15 * 60_000,
    queryFn: async () => ((await apiRequest("GET", "/api/andrews/latest")) as InboxItem | null) ?? null,
  });
  const andrewsPrevious = usePreviousIssues("andrews", andrewsVisible);

  const livingChurchVisible = useLivingChurchVisible();
  const livingChurchQ = useQuery<InboxItem[]>({
    queryKey: ["/api/living-church/posts"],
    enabled: livingChurchVisible,
    staleTime: 15 * 60_000,
    queryFn: async () => ((await apiRequest("GET", "/api/living-church/posts")) as InboxItem[] | null) ?? [],
  });
  const livingChurchPrevious = useMemo(
    () => (livingChurchQ.data ?? []).slice(0, PREVIOUS_ISSUES).map(({ title, url }) => ({ title, url })),
    [livingChurchQ.data],
  );
  /**
   * THIS SUNDAY'S commentary, not merely the newest (owner: "they post on
   * monday for the coming sunday … so it should be on this sunday"). The post
   * for a Sunday is the one published in the seven days up to it. From Monday,
   * when the page moves on to the next Sunday, until that week's post goes
   * up, nothing matches — and last week's commentary would be the wrong
   * Sunday's, so it opens the column instead.
   */
  const livingChurchPost = useMemo(() => {
    const ymd = sundayYmd ?? nextSundayYmdNY();
    const [y, m, d] = ymd.split("-").map(Number);
    const weekBefore = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) - 7)).toISOString().slice(0, 10);
    return (livingChurchQ.data ?? []).find((p) => !!p.published && p.published > weekBefore && p.published <= ymd) ?? null;
  }, [livingChurchQ.data, sundayYmd]);

  // Memoised: the reflections ticker lists this in a dependency array, and a
  // fresh array on every render rebuilt its pills for nothing.
  return useMemo(() => {
  const out: SundayCommentary[] = [];
  if (andrewsVisible) {
    out.push({
      key: "commentary", emoji: "📰",
      // Owner (2026-09-15): "have McGowan say "Yale Divinity Commentary" with
      // his name in the second line", then "have it say a commentary by Dr. ....".
      title: "Yale Divinity Commentary",
      blurb: "A commentary by Dr. Andrew McGowan",
      open: () => {
        const post = andrewsQ.data;
        if (!post?.url) { openExternal(ANDREWS_INDEX, { reader: true }); return; }
        openExternalThenMarkRead(post.url, () => markAndrewsRead(post.id), { reader: true, previous: andrewsPrevious });
      },
    });
  }
  if (livingChurchVisible) {
    out.push({
      key: "living-church", emoji: "🖋️",
      title: "Living Church Commentary",
      blurb: "Weekly reflection on the readings",
      // In Phoebe's reader (owner: "lets try a reader view"), with the
      // column's recent posts under Previous. Nothing is marked read: no other
      // card anywhere waits on it.
      open: () => { openExternal(livingChurchPost?.url ?? LIVING_CHURCH_INDEX, { reader: true, previous: livingChurchPrevious }); },
    });
  }
  return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [andrewsVisible, andrewsQ.data, andrewsPrevious, livingChurchVisible, livingChurchPost, livingChurchPrevious]);
}
