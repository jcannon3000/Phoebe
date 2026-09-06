// ─── Home "Learn" section — continue (or start) a course from the home ───────
//
// Sits right after the Daily progress spine: a "Learn" header, then one card
// per course you're TAKING — "Continue · <next episode>" with a play button and
// your progress bar. If you haven't started anything, a single quiet
// "Start course" card offers the platform's flagship instead of a menu of all.
//
// PLATFORM: the video courses (Centering Prayer, The Spiritual Journey) are
// web/desktop-only (YouTube IFrame player) — on the iOS shell only Bishop
// Budde's Way of Love (an audio course on the podcast player) appears.

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, useInView } from "framer-motion";
import { Play } from "lucide-react";
import { isNativeShell } from "@/lib/isNativeShell";
import { useCourseProgress, isCourseHiddenFromHome, COURSE_HIDDEN_EVENT, snapshotProgress } from "@/lib/courseProgress";
import {
  CENTERING_PRAYER,
  CENTERING_INDEX,
  SPIRITUAL_JOURNEY,
  JOURNEY_INDEX,
  videoLabel,
  type CourseIndex,
} from "@/lib/spiritualJourney";
import { WAY_OF_LOVE, WOL_LESSONS, WOL_TOTAL } from "@/lib/wayOfLoveCourse";
import { useCacCourses, courseCompletion } from "@/lib/cacCourses";
import { useCacLibrary } from "@/hooks/useCacLibrary";
import { useBetaStatus } from "@/hooks/useDemo";

const FONT = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

type LearnCard = {
  key: string;
  title: string;
  nextLabel: string;
  href: string;
  done: number;
  total: number;
  started: boolean;
  /** When this course's progress was last touched — playing an episode
   *  (setLast + markStarted) or finishing one. 0 = never. */
  updatedAt: number;
};

// The next lesson of a VIDEO course: resume the last-opened video if it isn't
// finished, else the first uncompleted one in course order.
function videoCourseCard(
  course: { id: string; title: string },
  index: CourseIndex,
  href: string,
  progress: { completed: Set<string>; completedCount: number; lastId?: string; started: boolean },
): Omit<LearnCard, "updatedAt"> {
  const { completed, completedCount, lastId } = progress;
  const resume = lastId && index.get(lastId) && !completed.has(lastId) ? index.get(lastId) : undefined;
  const nextVid = resume ?? index.videos.find((v) => !completed.has(v.id)) ?? index.videos[0];
  return {
    key: course.id,
    title: course.title,
    nextLabel: nextVid ? videoLabel(nextVid) : "",
    href: nextVid ? `${href}?v=${nextVid.id}` : href,
    done: completedCount,
    total: index.total,
    // "Started" = an explicit play/open (markStarted) or real progress — NEVER
    // a mere page visit (lastId is stamped on visits for resume, so it can't
    // count here or browsing the Learn tab fills the home with Continue cards).
    started: completedCount > 0 || progress.started,
  };
}

export function HomeLearnSection() {
  const [, setLocation] = useLocation();
  const native = isNativeShell();
  const centering = useCourseProgress(CENTERING_PRAYER.id);
  const journey = useCourseProgress(SPIRITUAL_JOURNEY.id);
  const wol = useCourseProgress(WAY_OF_LOVE.id);

  /**
   * CAC seasons appear here too, once someone is actually listening (owner:
   * "if the admin is listening to it … showing up on their home screen like
   * the Bishop Buddy one").
   *
   * GATED ON THE SAME EXPRESSION as cac-courses / cac-show / cac-course and
   * the Learn row: `isAdmin || cacLibraryGranted`. A home card that opens a
   * page which then turns you away is worse than no card, and this is the
   * fifth surface that has to agree — widen one, widen all.
   *
   * The fetch is skipped entirely for everyone else rather than fetched and
   * filtered, so an ungranted account never asks for a catalogue it may not
   * see.
   */
  const { isAdmin } = useBetaStatus();
  const { enabled: cacLibraryGranted } = useCacLibrary();
  const maySeeCac = isAdmin || cacLibraryGranted;
  const { data: cacData } = useCacCourses({ enabled: maySeeCac });

  const cards: LearnCard[] = [];
  if (!native) {
    cards.push({ ...videoCourseCard(CENTERING_PRAYER, CENTERING_INDEX, "/centering-prayer", centering), updatedAt: snapshotProgress(CENTERING_PRAYER.id).updatedAt ?? 0 });
    cards.push({ ...videoCourseCard(SPIRITUAL_JOURNEY, JOURNEY_INDEX, "/journey", journey), updatedAt: snapshotProgress(SPIRITUAL_JOURNEY.id).updatedAt ?? 0 });
  }
  {
    const nextLesson = WOL_LESSONS.find((l) => !wol.completed.has(l.key)) ?? WOL_LESSONS[0];
    cards.push({
      key: WAY_OF_LOVE.id,
      title: WAY_OF_LOVE.title,
      // Text only — no lesson emoji on the course cards (owner).
      nextLabel: nextLesson ? nextLesson.practice : "",
      href: "/way-of-love-course",
      done: wol.completedCount,
      total: WOL_TOTAL,
      started: wol.completedCount > 0 || wol.started,
      updatedAt: snapshotProgress(WAY_OF_LOVE.id).updatedAt ?? 0,
    });
  }

  /**
   * One card per CAC SEASON in progress. Seasons rather than shows, because a
   * season is the thing with a start and an end — "Turning to the Mystics" as
   * a whole has thirteen of them and no finish line, so a progress bar across
   * the show would never move.
   *
   * The list below already drops anything not started or already finished, so
   * these are simply offered on the same terms as every other course and the
   * shared filter decides.
   */
  for (const c of cacData?.courses ?? []) {
    const { completedCount, total, nextTitle, isStarted, updatedAt } = courseCompletion(c);
    if (!isStarted) continue;
    cards.push({
      key: `cac-${c.id}`,
      title: `${c.showTitle} · ${c.title}`,
      nextLabel: nextTitle ?? "",
      href: `/cac-course/${c.id}`,
      done: completedCount,
      total,
      started: true,
      updatedAt,
    });
  }

  // ONLY ACTIVE courses appear on the home (owner): started and not yet
  // finished. A FRESH home with nothing in flight (owner, for first opens)
  // offers exactly one quiet "Start course" card — Bishop Budde's Way of Love,
  // the flagship on every platform — instead of a menu of all. Once everything
  // is finished, the section disappears; starting something else happens from
  // the Learn tab.
  // …and not one the reader has taken off their home (owner). Re-read on the
  // change event so hiding one from its own page removes it here without a
  // reload.
  const [hiddenTick, setHiddenTick] = useState(0);
  useEffect(() => {
    const bump = () => setHiddenTick((n) => n + 1);
    window.addEventListener(COURSE_HIDDEN_EVENT, bump);
    return () => window.removeEventListener(COURSE_HIDDEN_EVENT, bump);
  }, []);
  // `hiddenTick` is read so the filter re-runs when the event fires; the value
  // itself carries no meaning.
  void hiddenTick;
  /**
   * BOTH HOOKS ABOVE THE EARLY RETURN.
   *
   * `useRef` and `useInView` used to sit AFTER `if (show.length === 0) return
   * null;` — so the moment `show` flips from non-empty to empty (a course
   * finishing, or `hiddenTick` changing what's hidden) the hook count for
   * this component changes between renders and React throws "Rendered fewer
   * hooks than expected." `hiddenTick` bumps on the same `COURSE_HIDDEN_EVENT`
   * this component listens for, and it fires on login and on app-resume via
   * `courseProgress.ts`'s snapshot re-read — so backgrounding and reopening
   * the app, on the HOME SCREEN, could take the whole app down.
   *
   * Hooks now run unconditionally; the early return moves below them.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.25 });
  const onHome = cards.filter((c) => !isCourseHiddenFromHome(c.key));
  // MOST RECENTLY LISTENED FIRST (owner, 2026-09-05: "order the courses on
  // the home screen based on which one was listened to last"). Playing an
  // episode stamps the course's progress, so the one you had on last leads;
  // ties (never played, or equal stamps) keep the list's own order.
  const active = onHome
    .filter((c) => c.started && c.done < c.total)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const wolCard = onHome.find((c) => c.key === WAY_OF_LOVE.id);
  const show = active.length > 0 ? active : wolCard && wolCard.done < wolCard.total ? [wolCard] : [];
  if (show.length === 0) return null;

  // Fade-up cascade like the rhythm cards — the header rises first, each course
  // card a beat behind. Held hidden until the SECTION scrolls into view (it sits
  // below the fold, so an on-mount cascade would play off-screen and be missed),
  // then the whole cascade fires once, top-to-bottom, via the per-index delay.
  const enterUp = (i: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay: Math.min(i * 0.1, 1.2) },
  });

  return (
    <div className="mt-6" ref={rootRef}>
      {/* Same header recipe as the daily spine's "Next" / "Done" headings
          (DailyProgressBody.sectionHeader) so the sections read as siblings. */}
      <motion.div {...enterUp(0)} className="flex items-center gap-3 mb-2">
        <h3 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>Courses</h3>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </motion.div>
      <div className="space-y-3">
        {show.map((c, cardIdx) => {
          const pct = Math.round((c.done / Math.max(1, c.total)) * 100);
          return (
            <motion.div key={c.key} {...enterUp(cardIdx + 1)}>
            <button
              onClick={() => setLocation(c.href)}
              className="w-full text-left rounded-2xl px-4 py-3.5 transition-opacity hover:opacity-95 active:scale-[0.99]"
              style={{ ...FROST, background: "rgba(9,26,16,0.4)", border: "1px solid rgba(46,107,64,0.38)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
                    {c.started ? "Continue" : "Start course"} · {c.title}
                  </p>
                  <p className="truncate text-[15px] font-semibold mt-0.5" style={{ color: WARM, fontFamily: FONT }}>
                    {c.nextLabel}
                  </p>
                </div>
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ background: "#2D5E3F", color: WARM }}
                  aria-hidden
                >
                  <Play size={16} style={{ marginLeft: 2 }} />
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-2.5">
                <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(200,212,192,0.12)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#2D5E3F,#5FBF7F)" }} />
                </div>
                <span className="text-[11px] flex-shrink-0" style={{ color: SAGE, fontFamily: FONT }}>
                  {c.done} of {c.total}
                </span>
              </div>
            </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
