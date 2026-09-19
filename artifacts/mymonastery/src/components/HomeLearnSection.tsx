// ─── Home "Learn" section — continue (or start) a course from the home ───────
//
// Sits right after the Daily progress spine: a "Learn" header, then one card
// per course you're TAKING — "Continue · <next episode>" with a play button and
// your progress bar. If you haven't started anything, a single quiet
// "Start course" card offers the platform's flagship instead of a menu of all.
//
// PLATFORM: every course appears on every platform. The two video courses
// (Centering Prayer, The Spiritual Journey) used to be web-only, because
// YouTube would not embed inside the app; their pages handle that themselves
// now (lib/videoEmbed), so nothing is hidden here.
//
// FOURTEEN DAYS (owner, 2026-09-16): a course nobody has engaged with for two
// weeks leaves the home — the "Start course" offer of the flagship too,
// counted from the day it was first offered. See selectHomeCourses and
// courseProgress.ts (COURSE_HOME_STALE_MS).

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, useInView } from "framer-motion";
import { PracticeCard } from "@/components/DailyProgressBody";
import {
  useCourseProgress,
  useAnyCourseProgressTick,
  isCourseHiddenFromHome,
  COURSE_HIDDEN_EVENT,
  snapshotProgress,
  isCourseStaleForHome,
  courseOfferedSince,
  markCourseOffered,
} from "@/lib/courseProgress";
import {
  CENTERING_PRAYER,
  CENTERING_INDEX,
  SPIRITUAL_JOURNEY,
  JOURNEY_INDEX,
  videoLabel,
  type CourseIndex,
} from "@/lib/spiritualJourney";
import { WAY_OF_LOVE, WOL_LESSONS, WOL_TOTAL } from "@/lib/wayOfLoveCourse";
import { useCacCourses, useShowCourses, courseCompletion } from "@/lib/cacCourses";
import { useCacLibrary } from "@/hooks/useCacLibrary";
import { useBetaStatus } from "@/hooks/useDemo";

const FONT = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";
/** The course cards' accent — the green their old progress bar ended on, so
 *  the bar reads the same now that PracticeCard draws it. */
const COURSE_RGB = "95,191,127";
export type LearnCard = {
  key: string;
  title: string;
  /** The card's emoji, in the rhythm card's left slot (owner, 2026-09-19:
   *  "Emoji on the left, cta on the right"). One per course, none of them a
   *  cross. */
  emoji: string;
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
  emoji: string,
  index: CourseIndex,
  href: string,
  progress: { completed: Set<string>; completedCount: number; lastId?: string; started: boolean },
): Omit<LearnCard, "updatedAt"> {
  const { completed, completedCount, lastId } = progress;
  const resume = lastId && index.get(lastId) && !completed.has(lastId) ? index.get(lastId) : undefined;
  const nextVid = resume ?? index.videos.find((v) => !completed.has(v.id)) ?? index.videos[0];
  return {
    key: course.id,
    emoji,
    title: course.title,
    nextLabel: nextVid ? videoLabel(nextVid) : "",
    href: nextVid ? `${href}?v=${nextVid.id}` : href,
    // Only THIS course's current videos count: an id completed under an older
    // syllabus must not make a course look finished early, or read "9 of 8".
    done: index.videos.filter((v) => completed.has(v.id)).length,
    total: index.total,
    // "Started" = an explicit play/open (markStarted) or real progress — NEVER
    // a mere page visit (lastId is stamped on visits for resume, so it can't
    // count here or browsing the Learn tab fills the home with Continue cards).
    started: completedCount > 0 || progress.started,
  };
}

/**
 * WHICH COURSES THE HOME SHOWS — pure, so it can be tested without React.
 *
 * Active courses (started, unfinished, engaged within 14 days), most recently
 * engaged first. With nothing active, the one quiet "Start course" offer —
 * the flagship — as long as it is not itself lapsed: a started one that
 * went quiet for 14 days is gone like any other, and a never-started one
 * lapses 14 days after the home first offered it (`wolOfferedAt`, 0 = never
 * offered yet, so it shows and gets stamped).
 */
export function selectHomeCourses(
  onHome: LearnCard[],
  wolId: string,
  wolOfferedAt: number,
  now: number = Date.now(),
): LearnCard[] {
  const fresh = (c: LearnCard) => !isCourseStaleForHome(c.updatedAt, now);
  // MOST RECENTLY LISTENED FIRST (owner, 2026-09-05: "order the courses on
  // the home screen based on which one was listened to last"). Playing an
  // episode stamps the course's progress, so the one you had on last leads;
  // ties (never played, or equal stamps) keep the list's own order.
  const active = onHome
    .filter((c) => c.started && c.done < c.total && fresh(c))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (active.length > 0) return active;
  const wol = onHome.find((c) => c.key === wolId);
  if (!wol || wol.done >= wol.total) return [];
  if (wol.started) return fresh(wol) ? [wol] : [];
  return wolOfferedAt === 0 || !isCourseStaleForHome(wolOfferedAt, now) ? [wol] : [];
}

export function HomeLearnSection() {
  const [, setLocation] = useLocation();
  const centering = useCourseProgress(CENTERING_PRAYER.id);
  const journey = useCourseProgress(SPIRITUAL_JOURNEY.id);
  const wol = useCourseProgress(WAY_OF_LOVE.id);
  /**
   * RE-RENDER ON ANY COURSE'S PROGRESS (owner, 2026-09-14: "when someone is
   * finished with a course, make sure it disappears from the home screen …
   * make sure things are not stuck").
   *
   * The three hooks above are reactive, but the CAC season cards below read
   * progress through snapshotProgress() at render, so nothing told this
   * section when a season's last episode finished. Audio keeps playing on the
   * home in the mini-player, so a season could end right here and its card sit
   * on, finished, until something unrelated re-rendered. This tick is that
   * signal. Above the early return, like every hook here.
   */
  useAnyCourseProgressTick();

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
  // No gate: the Way of Love show is the Episcopal Church's, not CAC's, and
  // every course in the app is offered to everyone (see /menu/learn).
  const { data: curryData } = useShowCourses("way-of-love-curry");

  const cards: LearnCard[] = [];
  /*
   * THE VIDEO COURSES ARE ON THE HOME EVERYWHERE NOW (owner, 2026-09-18).
   * They were web-only here because their pages refused to play in the app —
   * a card that opened a "watch this on the web" wall. The pages play on a
   * phone now (inline where YouTube embeds, through the in-app reader where it
   * doesn't — lib/videoEmbed), so a course someone is in the middle of belongs
   * on their home whatever they are holding.
   */
  {
    // 🧘🏽 the sit itself, 🧭 a journey — neither a cross.
    cards.push({ ...videoCourseCard(CENTERING_PRAYER, "\u{1F9D8}\u{1F3FD}", CENTERING_INDEX, "/centering-prayer", centering), updatedAt: snapshotProgress(CENTERING_PRAYER.id).updatedAt ?? 0 });
    cards.push({ ...videoCourseCard(SPIRITUAL_JOURNEY, "\u{1F9ED}", JOURNEY_INDEX, "/journey", journey), updatedAt: snapshotProgress(SPIRITUAL_JOURNEY.id).updatedAt ?? 0 });
  }
  {
    const nextLesson = WOL_LESSONS.find((l) => !wol.completed.has(l.key)) ?? WOL_LESSONS[0];
    cards.push({
      key: WAY_OF_LOVE.id,
      emoji: "\u{1F49A}", // 💚
      title: WAY_OF_LOVE.title,
      // Text only — no lesson emoji on the course cards (owner).
      nextLabel: nextLesson ? nextLesson.practice : "",
      href: "/way-of-love-course",
      // The current lessons only, for the same reason as the video courses.
      done: WOL_LESSONS.filter((l) => wol.completed.has(l.key)).length,
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
  /**
   * …and one per season of Bishop Curry's Way of Love, the same way. His five
   * seasons (9522e0b6) come from the SHOW endpoint rather than the CAC one —
   * the show is the Episcopal Church's, open to everyone — so without this
   * loop a season someone had started could never reach the home.
   */
  for (const c of curryData?.courses ?? []) {
    const { completedCount, total, nextTitle, isStarted, updatedAt } = courseCompletion(c);
    if (!isStarted) continue;
    cards.push({
      key: `cac-${c.id}`,
      // ❤️‍🔥 for the Way of Love's seasons: 💚 is the whole course's card
      // above, and these are the same love, taught.
      emoji: "\u{2764}\u{FE0F}\u{200D}\u{1F525}",
      title: `${c.showTitle} · ${c.title}`,
      nextLabel: nextTitle ?? "",
      href: `/cac-course/${c.id}`,
      done: completedCount,
      total,
      started: true,
      updatedAt,
    });
  }

  for (const c of cacData?.courses ?? []) {
    const { completedCount, total, nextTitle, isStarted, updatedAt } = courseCompletion(c);
    if (!isStarted) continue;
    cards.push({
      key: `cac-${c.id}`,
      // The CAC's own emoji, the one its daily meditation card wears.
      emoji: "\u{1F335}",
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
  // offers exactly one quiet "Start course" card — Bishop Budde's Experiencing
  // Jesus (id "way-of-love", renamed 2026-09-19; Curry's Way of Love is the
  // show above),
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
  const show = selectHomeCourses(onHome, WAY_OF_LOVE.id, courseOfferedSince(WAY_OF_LOVE.id));
  // The never-started offer starts its 14-day clock the first time it is
  // actually shown. An effect (not a write during render), and above the
  // early return like every hook here; markCourseOffered is a no-op after
  // the first stamp.
  const offeringWol = show.length === 1 && show[0].key === WAY_OF_LOVE.id && !show[0].started;
  useEffect(() => {
    if (offeringWol) markCourseOffered(WAY_OF_LOVE.id);
  }, [offeringWol]);
  if (show.length === 0) return null;

  // Fade-up cascade like the rhythm cards — the header rises first, each course
  // card a beat behind. Held hidden until the SECTION scrolls into view (it sits
  // below the fold, so an on-mount cascade would play off-screen and be missed),
  // then the whole cascade fires once, top-to-bottom, via the per-index delay.
  const enterUp = (i: number) => ({
    // Opacity only — no travel. Animating y lands the card on a fractional
    // pixel and the end-of-animation re-rasterise shifts its hairline border.
    // See the long note on enterUp in DailyProgressBody.
    initial: { opacity: 0 },
    animate: inView ? { opacity: 1 } : { opacity: 0 },
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
      {/* One compositing layer for the whole list, like the home's Next and
          Done lists, so every card shares one origin. */}
      <div className="space-y-3" style={{ willChange: "transform" }}>
        {show.map((c, cardIdx) => {
          /**
           * THE RHYTHM CARD ITSELF (owner, 2026-09-19: "Can we make the course
           * cards more like the routine cards", then "Same ui", then "Emoji on
           * the left, cta on the right", then "You could have a progress bar
           * still like a contemplation card").
           *
           * Not a lookalike — PracticeCard, the component the practices above
           * use, so frame, height, padding, stroke, type and the round action
           * are the same by construction rather than by copying. The lesson
           * count is the card's own quiet second line and its own progress bar,
           * the shape the novena and contemplation cards already use, which is
           * what replaced the separate bar-and-counter this section drew.
           *
           * `done` is always false: a course on the home is one in flight, and
           * a ✓ here would claim the whole course was finished.
           */
          const lesson = Math.min(c.done + 1, c.total);
          // The lesson's own name, unless it just repeats the course's (the
          // course's first lesson can carry the course's own name) — a second line
          // that says the title again tells nobody anything.
          const label = c.nextLabel && !c.title.includes(c.nextLabel) ? ` · ${c.nextLabel}` : "";
          return (
            <motion.div key={c.key} {...enterUp(cardIdx + 1)}>
              <PracticeCard
                href={c.href}
                emoji={c.emoji}
                title={c.title}
                blurb={c.started
                  ? `Lesson ${lesson} of ${c.total}${label}`
                  : `${c.total} ${c.total === 1 ? "lesson" : "lessons"}${label}`}
                cta={c.started ? "Continue" : "Start"}
                done={false}
                rgb={COURSE_RGB}
                tint={Math.min(1, cardIdx * 0.2)}
                progress={{ current: c.done, goal: c.total }}
                alwaysShowProgress
                pulseOnLoad={false}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
