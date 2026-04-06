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
  imprintType: "correspondence" | "gathering";
  onComplete: () => void;
}

export const correspondenceSlides: ImprintSlide[] = [
  {
    headline: "Letters are the oldest community technology in the world.",
    body: "The early church ran on them. Monks have kept relationships through them for centuries. Phoebe is just making the practice frictionless.",
  },
  {
    headline: "Vivek Murthy, the U.S. Surgeon General, named loneliness a public health crisis.",
    body: "Not a feeling. A health condition. Loneliness raises the risk of heart disease, stroke, and early death as much as smoking fifteen cigarettes a day. The medicine is connection — real, repeated, directed at specific people.",
  },
  {
    headline: "Once a week. One letter. One person.",
    body: "Because you only get one, it means something. You can't dash it off. You have to think: what actually happened this week? What do I want them to know? A zoom out from the daily noise. Sacred because it's set apart.",
  },
  {
    headline: "You are building something you cannot see yet.",
    body: "Robert Putnam spent decades studying what makes communities resilient. His answer: social capital. The web of relationships that holds people when hard things happen. You cannot build that web in a crisis. It has to already exist. Every letter you write is a thread in that web.",
  },
  {
    headline: "When the hospital calls, the network is already there.",
    body: "This is why Phoebe exists. Not to help you stay in touch. To make sure that when something hard happens — to you, to someone you love — there are already people who know you. Who have been reading your words. Who will show up.",
  },
];

export const gatheringSlides: ImprintSlide[] = [
  {
    headline: "Showing up is the practice.",
    body: "Not once. Repeatedly. In the same room, with the same people, on a rhythm you committed to together. The early church didn't build community through events. They built it through showing up, again and again, until the relationships had weight.",
  },
  {
    headline: "We are wired for the small group.",
    body: "Sebastian Junger spent years studying why soldiers miss war. His answer wasn't the combat. It was the tribe — the small group of people who depended on each other completely. Modern life dismantles that. We are surrounded by people and known by almost none of them. A tradition is how you rebuild it.",
  },
  {
    headline: "There is a difference between being around people and being known by them.",
    body: "Vivek Murthy found that loneliness has almost nothing to do with how many people are in your life. It has everything to do with whether any of them really know you. A tradition is not a social event. It is a practice of being known — slowly, over time, in the same room.",
  },
  {
    headline: "You cannot build a support network in a crisis.",
    body: "Most parishes only activate connection when something has already gone wrong. A death. A diagnosis. A divorce. By then it is too late to build the network — you are asking strangers to show up for each other. The tradition you start today is the network that will be there when it is needed. Every time you show up, the roots go deeper.",
  },
  {
    headline: "This is a covenant, not a calendar event.",
    body: "You are not scheduling a meetup. You are committing to a rhythm — weekly, fortnightly, monthly — and saying: we will keep showing up for each other. Phoebe handles the logistics. Finds the time, sends the invite, reschedules gracefully when life interrupts. Your only job is to show up.",
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

  function advance() {
    if (index < slides.length - 1) {
      setIndex((i) => i + 1);
    } else {
      completeMutation.mutate();
    }
  }

  function skip() {
    completeMutation.mutate();
  }

  const isLast = index === slides.length - 1;
  const slide = slides[index];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#F2EFE6", fontFamily: "'Space Grotesk', sans-serif" }}
    >
      {/* Skip */}
      <div className="flex justify-end px-6 pt-6">
        <button
          onClick={skip}
          className="text-sm"
          style={{ color: "#9a9390" }}
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
              style={{ color: "#2C1810" }}
            >
              {slide.headline}
            </h1>
            <p
              className="text-base leading-relaxed font-normal"
              style={{ color: "#6B6B6B" }}
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
                background: i <= index ? "#5C7A5F" : "#C8C4B4",
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
            style={{ background: "#5C7A5F", color: "#fff" }}
          >
            {completeMutation.isPending ? "Starting…" : ctaLabel}
          </button>
        ) : (
          <button
            onClick={advance}
            className="w-full max-w-sm py-4 rounded-2xl text-base font-semibold"
            style={{ background: "transparent", color: "#5C7A5F", border: "1.5px solid #5C7A5F" }}
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
