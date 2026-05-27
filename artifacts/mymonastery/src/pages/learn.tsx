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
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [activeTopic, setActiveTopic] = useState<LearnTopic | null>(null);
  // Slides are read through hooks now so they react to the live
  // language. Keep them outside the topic array so the array itself
  // can carry the resolved arrays without re-running hooks on render.
  const gatheringSlides = useGatheringSlides();
  const correspondenceSlides = useCorrespondenceSlides();
  const TOPICS: LearnTopic[] = [
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

        <p className="text-xs italic text-center mt-8" style={{ color: "rgba(143,175,150,0.5)" }}>
          {t("learn.more_to_come")}
        </p>
      </div>
    </Layout>
  );
}
