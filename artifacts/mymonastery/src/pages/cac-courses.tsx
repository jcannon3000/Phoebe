// ─── CAC Courses (beta) — Center for Action and Contemplation, by show ───────
//
// Owner (2026-08-01): bring CAC's shows back into view. This top level is a
// square-tile grid of SHOWS ONLY (mirrors podcasts.tsx's Discover grid) —
// tapping a show goes to /cac-show/:slug, which lists that show's seasons;
// tapping a season goes to /cac-course/:id, the episode player. Wears
// Phoebe's own frosted-leaf UI (lib/cacTheme) rather than a CAC-branded
// reskin. Beta-only (entry point lives in Admin Tools) while this gets
// tried against real feeds.

import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { useCacCourses, courseCompletion } from "@/lib/cacCourses";
import { useAnyCourseProgressTick } from "@/lib/courseProgress";
import { useBetaStatus } from "@/hooks/useDemo";
import { useCacLibrary } from "@/hooks/useCacLibrary";
import { CAC, CacFrame, CacBetaPill, useCacLeafBg } from "@/lib/cacTheme";

const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

export default function CacCoursesPage() {
  const { isBeta, isAdmin } = useBetaStatus();
  const { enabled: cacLibraryGranted } = useCacLibrary();
  const { data, isLoading } = useCacCourses();
  const leafBg = useCacLeafBg();
  // Re-render when any season's progress changes, so a show you just
  // started jumps to the top without needing a reload.
  useAnyCourseProgressTick();

  const courses = data?.courses ?? [];
  // One tile per show (registry order, preserved from the server response) —
  // seasons are a level down, on /cac-show/:slug. Shows with a started (but
  // not necessarily finished) season float to the top, ahead of everything
  // else — "pick up where you left off" beats browsing from scratch.
  const shows = useMemo(() => {
    const byShow = new Map<string, { showSlug: string; showTitle: string; author: string; artwork: string | null; seasonCount: number; started: boolean }>();
    for (const c of courses) {
      const started = courseCompletion(c).isStarted;
      const existing = byShow.get(c.showSlug);
      if (existing) {
        existing.seasonCount += 1;
        existing.started = existing.started || started;
        continue;
      }
      byShow.set(c.showSlug, { showSlug: c.showSlug, showTitle: c.showTitle, author: c.author, artwork: c.artwork, seasonCount: 1, started });
    }
    return [...byShow.values()].sort((a, b) => (a.started === b.started ? 0 : a.started ? -1 : 1));
  }, [courses]);

  /**
   * PILOT-GROUP ACCESS (owner: "members of special pilot groups would be able
   * to see the full library"). Same expression in all four places that gate
   * this feature — the three CAC pages and the Learn row — so a row can never
   * be offered to someone the page then turns away, or hidden from someone who
   * may use it. Widen one, widen all.
   */
  if (!isBeta && !isAdmin && !cacLibraryGranted) {
    return (
      <Layout bgPhoto={leafBg}>
        <CacFrame>
          <div className="mx-auto w-full max-w-md px-2 py-16 text-center">
            <p className="text-4xl">🌵</p>
            <h1 className="mt-4 text-xl font-bold" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
              CAC Courses
            </h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: CAC.inkMuted }}>
              This is a beta feature — not open yet.
            </p>
          </div>
        </CacFrame>
      </Layout>
    );
  }

  return (
    <Layout bgPhoto={leafBg}>
      <CacFrame>
        <div className="mx-auto w-full max-w-2xl">
          <Link href="/menu" className="mb-4 flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
            <ArrowLeft size={13} /> Menu
          </Link>
          <div className="mb-6">
            <h1 className="text-3xl font-bold" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
              Center for Action and Contemplation
            </h1>
            <p className="mt-2 max-w-lg text-[13px] leading-relaxed" style={{ color: CAC.inkMuted }}>
              Each teacher's show, one season at a time — walk through one like a course, at your own pace.
            </p>
            <div className="mt-3"><CacBetaPill /></div>
          </div>

          <div className="h-px" style={{ background: CAC.divider }} />

          <div className="mt-6">
            {isLoading && (
              <p className="py-8 text-center text-sm" style={{ color: CAC.inkMuted }}>Loading the library…</p>
            )}
            {!isLoading && shows.length === 0 && (
              <div className="rounded-2xl px-5 py-6 text-center" style={{ background: CAC.card, border: `1px solid ${CAC.border}`, ...FROST }}>
                <p className="text-sm leading-relaxed" style={{ color: CAC.inkMuted }}>
                  We couldn't load the CAC library just now. Try again shortly.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-7">
              {shows.map((show) => (
                <Link
                  key={show.showSlug}
                  href={`/cac-show/${show.showSlug}`}
                  className="cursor-pointer transition-opacity hover:opacity-90"
                >
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: 8,
                      overflow: "hidden",
                      padding: 10,
                      background: CAC.card,
                    }}
                  >
                    {show.artwork ? (
                      <img
                        src={show.artwork}
                        alt={show.showTitle}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: 4 }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl">🌵</div>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <p className="text-[15px] font-semibold leading-tight" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                      {show.showTitle}
                    </p>
                    {show.started && (
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: CAC.goldSoft, color: CAC.goldDark, fontFamily: CAC.label }}>
                        Continue
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] uppercase tracking-wide" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
                    {show.author} · {show.seasonCount} season{show.seasonCount === 1 ? "" : "s"}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          <p className="mt-8 px-1 text-[11px] italic leading-relaxed" style={{ color: CAC.inkMuted }}>
            Audio from the Center for Action and Contemplation. Plays in Phoebe's podcast player; your progress is saved on this device.
          </p>
        </div>
      </CacFrame>
    </Layout>
  );
}
