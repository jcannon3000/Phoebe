// ─── CAC Courses (beta) — Center for Action and Contemplation, by show ───────
//
// Owner (2026-08-01): bring CAC's shows back into view. This top level is a
// square-tile grid of SHOWS ONLY (mirrors podcasts.tsx's Discover grid) —
// tapping a show goes to /cac-show/:slug, which lists that show's seasons;
// tapping a season goes to /cac-course/:id, the episode player. Restyled
// (owner, 2026-08-01) to match cac.org's own look — cream paper, terracotta
// accent, serif display type — rather than Phoebe's usual dark green frost,
// since this is presenting CAC's own content under their own visual identity.
// Beta-only (entry point lives in Admin Tools) while this gets tried against
// real feeds.

import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { useCacCourses } from "@/lib/cacCourses";
import { useBetaStatus } from "@/hooks/useDemo";
import { CAC, CacFrame, CacBetaPill } from "@/lib/cacTheme";

export default function CacCoursesPage() {
  const { isBeta, isAdmin } = useBetaStatus();
  const { data, isLoading } = useCacCourses();

  const courses = data?.courses ?? [];
  // One tile per show (registry order, preserved from the server response) —
  // seasons are a level down, on /cac-show/:slug.
  const shows = useMemo(() => {
    const byShow = new Map<string, { showSlug: string; showTitle: string; author: string; artwork: string | null; seasonCount: number }>();
    for (const c of courses) {
      const existing = byShow.get(c.showSlug);
      if (existing) { existing.seasonCount += 1; continue; }
      byShow.set(c.showSlug, { showSlug: c.showSlug, showTitle: c.showTitle, author: c.author, artwork: c.artwork, seasonCount: 1 });
    }
    return [...byShow.values()];
  }, [courses]);

  if (!isBeta && !isAdmin) {
    return (
      <Layout>
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
    <Layout>
      <CacFrame>
        <div className="mx-auto w-full max-w-2xl">
          <Link href="/menu" className="mb-4 flex items-center gap-1 text-xs transition-opacity hover:opacity-70" style={{ color: CAC.inkMuted, fontFamily: CAC.label }}>
            <ArrowLeft size={13} /> Menu
          </Link>
          <div className="mb-6">
            <h1 className="text-3xl font-normal" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
              Center <em>for</em> Action <em>and</em> Contemplation
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
              <div className="rounded-2xl px-5 py-6 text-center" style={{ background: CAC.paperCard, border: `1px solid ${CAC.border}` }}>
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
                      borderRadius: 4,
                      overflow: "hidden",
                      background: show.artwork ? undefined : CAC.paperCard,
                      border: `1px solid ${CAC.border}`,
                      boxShadow: "0 6px 16px rgba(42,36,29,0.10)",
                    }}
                  >
                    {show.artwork ? (
                      <img src={show.artwork} alt={show.showTitle} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl">🌵</div>
                    )}
                  </div>
                  <p className="mt-2.5 text-[15px] font-semibold leading-tight" style={{ color: CAC.ink, fontFamily: CAC.serif }}>
                    {show.showTitle}
                  </p>
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
