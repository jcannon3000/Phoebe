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

import { useLocation } from "wouter";
import { Play } from "lucide-react";
import { isNativeShell } from "@/lib/isNativeShell";
import { useCourseProgress } from "@/lib/courseProgress";
import {
  CENTERING_PRAYER,
  CENTERING_INDEX,
  SPIRITUAL_JOURNEY,
  JOURNEY_INDEX,
  videoLabel,
  type CourseIndex,
} from "@/lib/spiritualJourney";
import { WAY_OF_LOVE, WOL_LESSONS, WOL_TOTAL } from "@/lib/wayOfLoveCourse";

const FONT = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FROST = { backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

type LearnCard = {
  key: string;
  emoji: string;
  title: string;
  nextLabel: string;
  href: string;
  done: number;
  total: number;
  started: boolean;
};

// The next lesson of a VIDEO course: resume the last-opened video if it isn't
// finished, else the first uncompleted one in course order.
function videoCourseCard(
  course: { id: string; title: string },
  index: CourseIndex,
  emoji: string,
  href: string,
  progress: { completed: Set<string>; completedCount: number; lastId?: string },
): LearnCard {
  const { completed, completedCount, lastId } = progress;
  const resume = lastId && index.get(lastId) && !completed.has(lastId) ? index.get(lastId) : undefined;
  const nextVid = resume ?? index.videos.find((v) => !completed.has(v.id)) ?? index.videos[0];
  return {
    key: course.id,
    emoji,
    title: course.title,
    nextLabel: nextVid ? videoLabel(nextVid) : "",
    href: nextVid ? `${href}?v=${nextVid.id}` : href,
    done: completedCount,
    total: index.total,
    started: completedCount > 0 || !!lastId,
  };
}

export function HomeLearnSection() {
  const [, setLocation] = useLocation();
  const native = isNativeShell();
  const centering = useCourseProgress(CENTERING_PRAYER.id);
  const journey = useCourseProgress(SPIRITUAL_JOURNEY.id);
  const wol = useCourseProgress(WAY_OF_LOVE.id);

  const cards: LearnCard[] = [];
  if (!native) {
    cards.push(videoCourseCard(CENTERING_PRAYER, CENTERING_INDEX, "🕯️", "/centering-prayer", centering));
    cards.push(videoCourseCard(SPIRITUAL_JOURNEY, JOURNEY_INDEX, "🎓", "/journey", journey));
  }
  {
    const nextLesson = WOL_LESSONS.find((l) => !wol.completed.has(l.key)) ?? WOL_LESSONS[0];
    cards.push({
      key: WAY_OF_LOVE.id,
      emoji: "❤️",
      title: WAY_OF_LOVE.title,
      nextLabel: nextLesson ? `${nextLesson.emoji} ${nextLesson.practice}` : "",
      href: "/way-of-love-course",
      done: wol.completedCount,
      total: WOL_TOTAL,
      started: wol.completedCount > 0 || !!wol.lastId,
    });
  }

  const started = cards.filter((c) => c.started && c.done < c.total);
  // Nothing in flight → offer ONE starter (the platform's flagship), quietly.
  const show = started.length > 0 ? started : cards.slice(0, 1);
  if (show.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xl font-semibold" style={{ color: WARM, fontFamily: FONT }}>Learn</h2>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.14)" }} />
      </div>
      <div className="space-y-3">
        {show.map((c) => {
          const pct = Math.round((c.done / Math.max(1, c.total)) * 100);
          return (
            <button
              key={c.key}
              onClick={() => setLocation(c.href)}
              className="w-full text-left rounded-2xl px-4 py-3.5 transition-opacity hover:opacity-95 active:scale-[0.99]"
              style={{ ...FROST, background: "rgba(9,26,16,0.4)", border: "1px solid rgba(46,107,64,0.38)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl flex-shrink-0" aria-hidden>{c.emoji}</span>
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
          );
        })}
      </div>
    </div>
  );
}
