import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import ImprintSlideshow, {
  useCorrespondenceSlides,
  useGatheringSlides,
  type ImprintSlide,
} from "@/components/ImprintSlideshow";
import { isNativeShell } from "@/lib/isNativeShell";
import { SPIRITUAL_JOURNEY, JOURNEY_TOTAL, CENTERING_PRAYER, CENTERING_TOTAL } from "@/lib/spiritualJourney";
import { WAY_OF_LOVE, WOL_TOTAL } from "@/lib/wayOfLoveCourse";
import { useCourseProgress } from "@/lib/courseProgress";
import { usePrayerListEnabled } from "@/hooks/usePrayerRequests";
import { useBetaStatus } from "@/hooks/useDemo";
import { DAILY_PRAYER_SERMON } from "@/lib/sermonDailyPrayer";

interface LearnTopic {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  slides: ImprintSlide[];
  accent: string;
  background: string;
  border: string;
}

export default function LearnPage() {
  const { user, isLoading } = useAuth();
  const signedUp = !!user && !user.isAnonymous;
  const prayerListEnabled = usePrayerListEnabled();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [activeTopic, setActiveTopic] = useState<LearnTopic | null>(null);
  // Live progress for the guided courses (web-only) surfaced below.
  const { completedCount } = useCourseProgress(SPIRITUAL_JOURNEY.id);
  const { completedCount: centeringDone } = useCourseProgress(CENTERING_PRAYER.id);
  const { completedCount: wolDone } = useCourseProgress(WAY_OF_LOVE.id);
  // Slides are read through hooks now so they react to the live
  // language. Keep them outside the topic array so the array itself
  // can carry the resolved arrays without re-running hooks on render.
  const gatheringSlides = useGatheringSlides();
  const correspondenceSlides = useCorrespondenceSlides();
  // ADMINS ONLY for now: the sermon below is the preacher's own work, and it
  // waits behind this gate until he has said yes to it living here.
  const { rawIsAdmin: isAdmin } = useBetaStatus();
  const TOPICS: LearnTopic[] = [
    /**
     * A SERMON, read a slide at a time — the first Learn topic that is
     * somebody else's voice rather than the app's. Owner: "build it just for
     * admins right now", and "it should be called the power of daily prayer".
     * Preached for Year A, Pentecost 14 on Exodus 3, Romans 12 and Matthew 16.
     */
    ...(isAdmin ? [{
      id: "daily-prayer-sermon",
      title: "The Power of Daily Prayer",
      emoji: "✝️",
      blurb: "A sermon on costly grace — Year A, Pentecost 14",
      slides: DAILY_PRAYER_SERMON,
      accent: "#C8A46A",
      background: "rgba(200,164,106,0.10)",
      border: "rgba(200,164,106,0.30)",
    }] : []),
    {
      id: "gatherings",
      title: t("learn.gatherings_title"),
      emoji: "🤝🏽",
      blurb: t("learn.gatherings_blurb"),
      slides: gatheringSlides,
      accent: "#7AAF7D",
      background: "rgba(122,175,125,0.10)",
      border: "rgba(122,175,125,0.30)",
    },
    {
      id: "letters",
      title: t("learn.letters_title"),
      emoji: "📮",
      blurb: t("learn.letters_blurb"),
      slides: correspondenceSlides,
      accent: "#8E9E42",
      background: "rgba(142,158,66,0.10)",
      border: "rgba(142,158,66,0.30)",
    },
  ];

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  if (activeTopic) {
    return (
      <ImprintSlideshow
        slides={activeTopic.slides}
        ctaLabel={t("learn.done_cta")}
        onComplete={() => setActiveTopic(null)}
      />
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/dashboard" className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70" style={{ color: "#8FAF96" }}>
            {t("saints.back_dashboard")}
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            {t("learn.title")} 📖
          </h1>
          <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
            {t("learn.subtitle")}
          </p>
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(200,212,192,0.12)" }} />

        <div className="space-y-3">
          {TOPICS.map((topic) => (
            <button
              key={topic.id}
              onClick={() => setActiveTopic(topic)}
              className="w-full text-left rounded-2xl px-5 py-4 transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{
                background: topic.background,
                border: `1px solid ${topic.border}`,
              }}
            >
              <div className="flex items-start gap-4">
                <span className="text-2xl leading-none mt-0.5">{topic.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {topic.title}
                  </p>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: "#8FAF96" }}>
                    {topic.blurb}
                  </p>
                  <p className="text-[11px] mt-2 font-semibold uppercase tracking-widest" style={{ color: topic.accent }}>
                    {t("learn.n_slides", { count: topic.slides.length })}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Guided courses. VIDEO courses (YouTube player) are web-only; the
            Way of Love AUDIO course plays natively too — same split as the
            home's HomeLearnSection, which was already iOS-aware while this
            page hid the whole section (the flagship rule-of-life course was
            invisible in the app). */}
        <div className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(143,175,150,0.7)" }}>
              Courses
            </p>
            <div className="space-y-3">
              {/* Centering Prayer first — the short PRACTICE course is the
                  on-ramp; the Spiritual Journey is where it deepens. */}
              {!isNativeShell() && (
              <button
                onClick={() => setLocation("/centering-prayer")}
                className="w-full text-left rounded-2xl px-5 py-4 transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ background: "rgba(46,107,64,0.14)", border: "1px solid rgba(46,107,64,0.32)" }}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl leading-none mt-0.5">🕯️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {CENTERING_PRAYER.title}
                    </p>
                    <p className="text-sm mt-1 leading-relaxed" style={{ color: "#8FAF96" }}>
                      Learn the method with Fr. Thomas Keating — five short talks, then the prayer itself.
                    </p>
                    <p className="text-[11px] mt-2 font-semibold uppercase tracking-widest" style={{ color: "#5FBF7F" }}>
                      {centeringDone > 0
                        ? `Continue · ${centeringDone} of ${CENTERING_TOTAL} complete`
                        : `Video course · ${CENTERING_TOTAL} lessons + the practice`}
                    </p>
                  </div>
                </div>
              </button>
              )}

              {!isNativeShell() && (
              <button
                onClick={() => setLocation("/journey")}
                className="w-full text-left rounded-2xl px-5 py-4 transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ background: "rgba(46,107,64,0.14)", border: "1px solid rgba(46,107,64,0.32)" }}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl leading-none mt-0.5">🎓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {SPIRITUAL_JOURNEY.title}
                    </p>
                    <p className="text-sm mt-1 leading-relaxed" style={{ color: "#8FAF96" }}>
                      {SPIRITUAL_JOURNEY.tagline}
                    </p>
                    <p className="text-[11px] mt-2 font-semibold uppercase tracking-widest" style={{ color: "#5FBF7F" }}>
                      {completedCount > 0
                        ? `Continue · ${completedCount} of ${JOURNEY_TOTAL} complete`
                        : `Video course · ${JOURNEY_TOTAL} lessons`}
                    </p>
                  </div>
                </div>
              </button>
              )}

              <button
                onClick={() => setLocation("/way-of-love-course")}
                className="w-full text-left rounded-2xl px-5 py-4 transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ background: "rgba(46,107,64,0.14)", border: "1px solid rgba(46,107,64,0.32)" }}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl leading-none mt-0.5">❤️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {WAY_OF_LOVE.title}
                    </p>
                    <p className="text-sm mt-1 leading-relaxed" style={{ color: "#8FAF96" }}>
                      {WAY_OF_LOVE.tagline}
                    </p>
                    <p className="text-[11px] mt-2 font-semibold uppercase tracking-widest" style={{ color: "#5FBF7F" }}>
                      {wolDone > 0
                        ? `Continue · ${wolDone} of ${WOL_TOTAL} complete`
                        : `Audio course · ${WOL_TOTAL} talks`}
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {!signedUp && prayerListEnabled && (
              <button
                onClick={() => setLocation("/signin")}
                className="w-full text-left rounded-2xl px-5 py-4 mt-3 transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ background: "rgba(193,154,58,0.10)", border: "1px solid rgba(193,154,58,0.30)" }}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl leading-none mt-0.5">🕊️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      Log in to create a prayer list
                    </p>
                    <p className="text-sm mt-1 leading-relaxed" style={{ color: "#8FAF96" }}>
                      Keep a private list of who and what you're holding in prayer.
                    </p>
                  </div>
                </div>
              </button>
            )}
        </div>

        <p className="text-xs italic text-center mt-8" style={{ color: "rgba(143,175,150,0.5)" }}>
          {t("learn.more_to_come")}
        </p>
      </div>
    </Layout>
  );
}
