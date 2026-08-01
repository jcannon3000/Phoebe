// ─── CAC Home (beta, admin tools only) — demo home screen ────────────────────
//
// Owner (2026-08-01): a demo of what a dedicated CAC daily-habit app's home
// screen could look like — a card for today's daily meditation up top,
// CAC's shows (as courses, grouped by season underneath each) below. Meant
// as a pitch/demo surface, not a feature Phoebe ships broadly — hence
// admin-tools-only rather than the wider isBeta gate the courses pages use.

import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Layout } from "@/components/layout";
import { useCacCourses, courseCompletion } from "@/lib/cacCourses";
import { useAnyCourseProgressTick } from "@/lib/courseProgress";
import { useCacDailyReflection } from "@/lib/cacDailyReflection";
import { useBetaStatus } from "@/hooks/useDemo";
import { CAC, CacFrame, CacBetaPill } from "@/lib/cacTheme";

export default function CacHomePage() {
  const { isAdmin } = useBetaStatus();
  const { data: coursesData, isLoading: coursesLoading } = useCacCourses();
  const { data: reflection, isLoading: reflectionLoading } = useCacDailyReflection();
  // Re-render when any season's progress changes, so a show you just
  // started jumps to the top without needing a reload.
  useAnyCourseProgressTick();

  const courses = coursesData?.courses ?? [];
  // Shows with a started (but not necessarily finished) season float to the
  // top — "pick up where you left off" beats browsing from scratch.
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

  // The home card's teaser line is plain text (not the rich HTML the full
  // reflection page renders) — strip tags/line-breaks from the first
  // paragraph rather than showing raw markup in a plain <p>.
  const excerpt = (reflection?.paragraphs?.[0] ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").trim();

  if (!isAdmin) {
    return (
      <Layout>
        <CacFrame>
          <p className="py-16 text-center text-sm" style={{ color: CAC.inkMuted }}>
            This is a beta feature — not open yet.
          </p>
        </CacFrame>
      </Layout>
    );
  }

  return (
    <Layout>
      <CacFrame>
        <div className="mx-auto w-full max-w-2xl">
          <Link href="/admin-tools" className="mb-4 flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
            <ArrowLeft size={13} /> Admin Tools
          </Link>

          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-normal" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                Center <em>for</em> Action <em>and</em> Contemplation
              </h1>
              <p className="mt-1 text-[12px]" style={{ color: CAC.inkMuted }}>
                A daily habit around CAC's teaching — demo home screen
              </p>
            </div>
            <CacBetaPill />
          </div>

          {/* Today's reflection */}
          <Link
            href="/cac-reflection"
            className="mb-8 block rounded-2xl px-5 py-5 transition-opacity hover:opacity-90"
            style={{ background: CAC.card, border: `1px solid ${CAC.border}`, boxShadow: "0 8px 20px rgba(42,36,29,0.10)" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: CAC.goldDark, fontFamily: CAC.label }}>
              Today's Meditation
            </p>
            {reflectionLoading ? (
              <p className="mt-2 text-sm" style={{ color: CAC.inkMuted }}>Loading…</p>
            ) : (
              <>
                <h2 className="mt-1.5 text-xl font-normal leading-tight" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                  {reflection?.title || "Today's Reflection"}
                </h2>
                {excerpt && (
                  <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed" style={{ color: CAC.inkMuted, fontFamily: CAC.serif }}>
                    {excerpt}
                  </p>
                )}
                <p className="mt-3 flex items-center gap-1 text-[12px] font-semibold" style={{ color: CAC.gold, fontFamily: CAC.label }}>
                  Read today's reflection <ArrowRight size={13} />
                </p>
              </>
            )}
          </Link>

          {/* Courses */}
          <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(42,36,29,0.55)", fontFamily: CAC.label }}>
            Courses
          </p>

          {coursesLoading && (
            <p className="py-8 text-center text-sm" style={{ color: CAC.inkMuted }}>Loading the library…</p>
          )}
          {!coursesLoading && shows.length === 0 && (
            <div className="rounded-2xl px-5 py-6 text-center" style={{ background: CAC.card, border: `1px solid ${CAC.border}` }}>
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
                    boxShadow: "0 6px 16px rgba(42,36,29,0.10)",
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

          <p className="mt-8 px-1 text-[11px] italic leading-relaxed" style={{ color: CAC.inkMuted }}>
            Content from the Center for Action and Contemplation — daily meditations and podcast library.
          </p>
        </div>
      </CacFrame>
    </Layout>
  );
}
