import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export const correspondenceSlides: ImprintSlide[] = [
  {
    headline: "For centuries, monks cultivated relationships through writing letters.",
    body: "Steady, unhurried, faithful. Letters caused them to be intentional about what they were sharing in their lives, and enter into dialogues that blossomed into meaningful connection.",
  },
  {
    headline: "One letter. One person. Once every two weeks.",
    body: "Because you only get one, it means something. You have to slow down and ask: what actually happened this week? What do I want them to know? The limitation is the gift. Sacred because it is set apart from everything else.",
  },
  {
    headline: "A letter is not a message. It is a record.",
    body: "Every time you write, you are adding to something. A shared history. A running account of two lives in honest contact. Directed, deliberate, yours. Years from now you will be able to read it back. That is something worth building.",
  },
  {
    headline: "The strength of our relationships is what makes life most vibrant.",
    body: "When something hard happens, there are already people who know you. Who have been reading your words. Who have been writing theirs. Who will show up. That is what a correspondence builds. That is what Phoebe is for.",
  },
];

export const gatheringSlides: ImprintSlide[] = [
  {
    headline: "Showing up is the practice.",
    body: "Repeatedly. In the same room, with the same people, on a rhythm you committed to together. The early church built community by returning to each other, again and again, until the relationships had weight.",
  },
  {
    headline: "To be known takes time and repetition.",
    body: "Vivek Murthy found that loneliness has almost nothing to do with how many people are in your life. It has everything to do with whether any of them truly know you. A tradition is a practice of being known, slowly, over time, in the same room.",
  },
  {
    headline: "Most tools give you a calendar invite. Phoebe gives you a commitment.",
    body: "You set an intention to meet — weekly, fortnightly, monthly. Then Phoebe works around everyone's actual schedule to find the times that make it possible. The goal is the gathering. The calendar is just how you get there.",
  },
];

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
          Skip
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
            {completeMutation.isPending ? "Starting…" : ctaLabel}
          </button>
        ) : (
          <button
            onClick={advance}
            className="w-full max-w-sm py-4 rounded-2xl text-base font-semibold"
            style={{ background: "transparent", color: "#C8D4C0", border: "1.5px solid rgba(46,107,64,0.5)" }}
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
