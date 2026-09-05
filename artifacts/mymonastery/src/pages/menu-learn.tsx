import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { isNativeShell } from "@/lib/isNativeShell";
import { useBetaStatus } from "@/hooks/useDemo";
import { useMemo } from "react";
import { useCacLibrary } from "@/hooks/useCacLibrary";
import { useCacCourses } from "@/lib/cacCourses";

// Learn — the guided courses, as their own menu category (the drawer's Learn
// row and /menu's Learn group both land here). Centering Prayer and the deeper
// Spiritual Journey are YouTube video courses → WEB ONLY; The Way of Love
// (Bishop Budde) rides the podcast library, so it's the one course that also
// works on iOS. Open to everyone, guests included — courses are part of the
// light experience.
export default function MenuLearnPage() {
  const [, setLocation] = useLocation();
  const go = (p: string) => setLocation(p);
  /**
   * CAC Courses sits here for ADMINS (owner: "i want admins to see CAC courses
   * under learn like the way of love").
   *
   * Gated on exactly the same test /cac-courses itself uses to admit a visitor
   * — its own guard is `if (!isBeta && !isAdmin)`. Deliberately the SAME
   * expression rather than a similar one: a row shown more widely than the
   * page admits is a row that bounces people into a "not open yet" screen, and
   * a row shown less widely hides a feature from someone who can use it. If
   * that guard is ever widened, widen it here in the same change.
   *
   * It rides CAC's podcast feeds, so — like The Way of Love, and unlike the two
   * YouTube courses above — it works on iOS as well as web, and needs no
   * isNativeShell() branch.
   */
  const { isAdmin } = useBetaStatus();
  // Pilot groups too — the SAME test the three CAC pages use to admit a
  // visitor, so this row is never offered to someone they turn away.
  const { enabled: cacLibraryGranted } = useCacLibrary();
  // The CAC shows, one row each — the same grouping the CAC Courses page draws.
  const { data: cacData } = useCacCourses();
  const shows = useMemo(() => {
    const byShow = new Map<string, { showSlug: string; showTitle: string; author: string; seasonCount: number }>();
    for (const c of cacData?.courses ?? []) {
      const existing = byShow.get(c.showSlug);
      if (existing) { existing.seasonCount += 1; continue; }
      byShow.set(c.showSlug, { showSlug: c.showSlug, showTitle: c.showTitle, author: c.author, seasonCount: 1 });
    }
    return [...byShow.values()];
  }, [cacData]);
  return (
    <MenuHub
      title="Courses"
      emoji="🎓"
      subtitle="Guided courses in the life of prayer."
      backLabel="Menu"
      backHref="/menu"
      groups={[{
        items: [
          // Way of Love first (owner, 2026-09-05), then every CAC show as its
          // own row — "bring them out of the folder of just CAC Courses" —
          // then the web-only Keating courses.
          { emoji: "❤️", label: "The Way of Love", sub: "Bishop Budde on a rule of life", onClick: () => go("/way-of-love-course") },
          ...(isAdmin || cacLibraryGranted
            ? shows.map((show) => ({
                emoji: "🌵",
                label: show.showTitle,
                sub: [show.author, show.seasonCount > 1 ? `${show.seasonCount} seasons` : "1 season"].filter(Boolean).join(" · "),
                onClick: () => go(`/cac-show/${show.showSlug}`),
              }))
            : []),
          ...(!isNativeShell() ? [
            { emoji: "🕯️", label: "Centering Prayer", sub: "Learn the practice with Fr. Keating", onClick: () => go("/centering-prayer") },
            { emoji: "🎓", label: "The Spiritual Journey", sub: "Keating's full contemplative series", onClick: () => go("/journey") },
          ] : []),
        ],
      }]}
    />
  );
}
