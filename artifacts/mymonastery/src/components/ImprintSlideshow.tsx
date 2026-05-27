import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";

export interface ImprintSlide {
  headline: string;
  body: string;
}

interface ImprintSlideshowProps {
  slides: ImprintSlide[];
  ctaLabel: string;
  // When provided, finishing the slideshow marks that imprint as seen on the
  // user's profile. Omit it (e.g. from the Learn page) for pure read-only
  // playback that doesn't touch any server state.
  imprintType?: "correspondence" | "gathering";
  onComplete: () => void;
}

// Static slide arrays were inlined here as English-only literals. We
// switched to hooks (`useCorrespondenceSlides`, `useGatheringSlides`)
// so the slides re-read through t() on every render — Spanish
// toggles update them without page reload. The exported names stay
// the same so callers don't have to change. Hooks are valid here
// because every caller (LetterNew, tradition-new, learn) renders
// inside a component body, never in a top-level const.
export function useCorrespondenceSlides(): ImprintSlide[] {
  const { t } = useTranslation();
  return [
    {
      headline: t("imprint_correspondence.s1_head"),
      body: t("imprint_correspondence.s1_body"),
    },
    {
      headline: t("imprint_correspondence.s2_head"),
      body: t("imprint_correspondence.s2_body"),
    },
    {
      headline: t("imprint_correspondence.s3_head"),
      body: t("imprint_correspondence.s3_body"),
    },
    {
      headline: t("imprint_correspondence.s4_head"),
      body: t("imprint_correspondence.s4_body"),
    },
  ];
}

export function useGatheringSlides(): ImprintSlide[] {
  const { t } = useTranslation();
  return [
    {
      headline: t("imprint_gathering.s1_head"),
      body: t("imprint_gathering.s1_body"),
    },
    {
      headline: t("imprint_gathering.s2_head"),
      body: t("imprint_gathering.s2_body"),
    },
    {
      headline: t("imprint_gathering.s3_head"),
      body: t("imprint_gathering.s3_body"),
    },
  ];
}

// Back-compat const exports — kept as empty arrays so the old import
// names still type-check while callers migrate to the hooks. Slowly
// removable; for now any direct const consumer simply renders no
// slides until they switch to the hook. The known callers
// (LetterNew, tradition-new, learn) are updated alongside this
// change so the visible flow always reads from the hooks.
export const correspondenceSlides: ImprintSlide[] = [];
export const gatheringSlides: ImprintSlide[] = [];

const slideVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

export default function ImprintSlideshow({
  slides,
  ctaLabel,
  imprintType,
  onComplete,
}: ImprintSlideshowProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const queryClient = useQueryClient();

  const completeMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/auth/me/imprints", { type: imprintType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      onComplete();
    },
    onError: () => {
      // Don't block the user — proceed even if the API call fails
      onComplete();
    },
  });

  function finish() {
    if (imprintType) {
      completeMutation.mutate();
    } else {
      onComplete();
    }
  }

  function advance() {
    if (index < slides.length - 1) {
      setIndex((i) => i + 1);
    } else {
      finish();
    }
  }

  function skip() {
    finish();
  }

  const isLast = index === slides.length - 1;
  const slide = slides[index];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#091A10", fontFamily: "'Space Grotesk', sans-serif" }}
    >
      {/* Skip */}
      <div className="flex justify-end px-6 pt-6">
        <button
          onClick={skip}
          className="text-sm"
          style={{ color: "#8FAF96" }}
        >
          {t("common.skip")}
        </button>
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="text-center"
          >
            <h1
              className="text-2xl font-bold leading-snug mb-5"
              style={{ color: "#F0EDE6" }}
            >
              {slide.headline}
            </h1>
            <p
              className="text-base leading-relaxed font-normal"
              style={{ color: "#8FAF96" }}
            >
              {slide.body}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom — dots + CTA */}
      <div className="px-8 pb-12 flex flex-col items-center gap-8">
        {/* Progress dots */}
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === index ? 20 : 8,
                height: 8,
                background: i <= index ? "#8FAF96" : "rgba(200,212,192,0.2)",
              }}
            />
          ))}
        </div>

        {/* Tap to advance / final CTA */}
        {isLast ? (
          <button
            onClick={advance}
            disabled={completeMutation.isPending}
            className="w-full max-w-sm py-4 rounded-2xl text-base font-semibold disabled:opacity-50 transition-opacity"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            {completeMutation.isPending ? t("imprint_correspondence.starting") : ctaLabel}
          </button>
        ) : (
          <button
            onClick={advance}
            className="w-full max-w-sm py-4 rounded-2xl text-base font-semibold"
            style={{ background: "transparent", color: "#C8D4C0", border: "1.5px solid rgba(46,107,64,0.5)" }}
          >
            {t("pause_slide.continue")}
          </button>
        )}
      </div>
    </div>
  );
}
