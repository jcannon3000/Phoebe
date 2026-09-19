import { useLocation } from "wouter";
import { useOnline } from "@/lib/offline";
import { MenuHub } from "@/components/MenuHub";
import { useBetaStatus } from "@/hooks/useDemo";
import { useMemo } from "react";
import { useCacLibrary } from "@/hooks/useCacLibrary";
import { useCacCourses, useShowCourses, courseCompletion } from "@/lib/cacCourses";
import { seasonCardLines } from "@/components/HomeLearnSection";

// Courses — the guided courses, as their own menu category (the drawer's
// Courses row and /menu's Courses group both land here). Open to everyone,
// guests included — courses are part of the light experience.
//
// TWO SECTIONS, LISTEN AND WATCH (owner, 2026-09-18: "on courses make two
// sections, one's audio one's video"). Listen leads, because The Way of Love
// leads (owner, 2026-09-05).
//
// EVERY COURSE ON EVERY PLATFORM (owner, 2026-09-18: "Why am I still not
// seeing the centering prayer courses on mobile?"). Centering Prayer and The
// Spiritual Journey are YouTube courses, and this page used to hide them in
// the app because YouTube wouldn't embed there. It does now — inline on
// Android, through the in-app reader on iOS (lib/videoEmbed, ad450600) — but
// only /learn and the home were changed then, and this page, the one the
// menu actually opens, kept its web-only gate.
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
   * It rides CAC's podcast feeds, so — like The Way of Love — it works on iOS
   * as well as web.
   */
  const { isAdmin } = useBetaStatus();
  // Pilot groups too — the SAME test the three CAC pages use to admit a
  // visitor, so this row is never offered to someone they turn away.
  const { enabled: cacLibraryGranted } = useCacLibrary();
  // The CAC shows, one row each — the same grouping the CAC Courses page draws.
  const { data: cacData } = useCacCourses();
  /**
   * THE OTHER Way of Love — Presiding Bishop Curry's (owner, 2026-09-19:
   * "Can we add this as courses" · "The first course was with Budde not
   * curry" · "We don't have this as a course").
   *
   * His show was already in the audio library; what it wasn't was a course.
   * It needs no new page: its feed tags every episode with a season, so the
   * same per-show endpoint that turns CAC's seasons into courses turns his
   * into five, and /cac-show renders them — it gates only on a show being
   * CAC's, and this is the Episcopal Church's. So this row is open to
   * everyone, like Bishop Budde's above it.
   */
  const { data: curryData } = useShowCourses("way-of-love-curry");
  const currySeasons = curryData?.courses ?? [];
  const shows = useMemo(() => {
    const byShow = new Map<string, { showSlug: string; showTitle: string; author: string; seasonCount: number }>();
    for (const c of cacData?.courses ?? []) {
      const existing = byShow.get(c.showSlug);
      if (existing) { existing.seasonCount += 1; continue; }
      byShow.set(c.showSlug, { showSlug: c.showSlug, showTitle: c.showTitle, author: c.author, seasonCount: 1 });
    }
    return [...byShow.values()];
  }, [cacData]);
  const online = useOnline();
  return (
    <MenuHub
      title="Courses"
      emoji="🎓"
      subtitle="Guided courses in the life of prayer."
      backLabel="Menu"
      backHref="/menu"
      groups={[
        {
          /**
           * OFFLINE NOTHING HERE PLAYS (owner, 2026-09-06: "same thing with
           * courses"). Every course is streamed audio or video and none is
           * saved to the phone, so with no connection the rows are muted and
           * each section says so rather than letting someone tap into a dead
           * player.
           */
          header: online ? "Listen" : "Listen · not available offline",
          items: [
            // Way of Love first (owner, 2026-09-05), then every CAC show as
            // its own row — "bring them out of the folder of just CAC Courses".
            { emoji: "❤️", label: "Experiencing Jesus", sub: "Bishop Budde on the Way of Love", muted: !online, onClick: () => go("/way-of-love-course") },
            /**
             * ONE ROW PER SEASON of the Presiding Bishop's Way of Love (owner,
             * 2026-09-19: "And have its own card on the courses page"). It was
             * a single row for the show that you then drilled into, so someone
             * part-way through Season 1 who wanted Season 2 could not see
             * either from here. Each row carries its own progress, so starting
             * one while the other is half-done reads correctly.
             *
             * Named so each says WHOSE: the row above is Bishop Budde's course.
             * The CAC's own shows keep a row per SHOW below — there are dozens
             * of seasons there, and listing them flat would bury everything
             * else on this page.
             */
            ...currySeasons.map((c) => {
              const { completedCount, total } = courseCompletion(c);
              const { title, sub } = seasonCardLines(c.showTitle, c.title);
              return {
                emoji: "\u{1F49A}", // 💚 — no cross emojis (owner)
                label: title,
                // "0 of 12 complete" is just the length said awkwardly, so a
                // season nobody has played says how long it is instead.
                sub: [sub, c.author, completedCount > 0 ? `${completedCount} of ${total} complete` : `${total} episodes`]
                  .filter(Boolean).join(" · "),
                muted: !online,
                onClick: () => go(`/cac-course/${c.id}`),
              };
            }),
            ...(isAdmin || cacLibraryGranted
              ? shows.map((show) => ({
                  emoji: "🌵",
                  label: show.showTitle,
                  sub: [show.author, show.seasonCount > 1 ? `${show.seasonCount} seasons` : "1 season"].filter(Boolean).join(" · "),
                  muted: !online, onClick: () => go(`/cac-show/${show.showSlug}`),
                }))
              : []),
          ],
        },
        {
          header: online ? "Watch" : "Watch · not available offline",
          items: [
            { emoji: "🕯️", label: "Centering Prayer", sub: "Learn the practice with Fr. Keating", muted: !online, onClick: () => go("/centering-prayer") },
            { emoji: "🎓", label: "The Spiritual Journey", sub: "Keating's full contemplative series", muted: !online, onClick: () => go("/journey") },
          ],
        },
      ]}
    />
  );
}
