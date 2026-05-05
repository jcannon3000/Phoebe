import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Climate-specific onboarding shown once after signup. Three intro slides
// followed by a "Begin" tap that flips climate_onboarding_completed and
// drops the user into the climate tab. Distinct from Phoebe's general
// onboarding (which climate-enrolled users skip entirely).
const SLIDES: Array<{
  emoji: string;
  title: string;
  body: string;
}> = [
  {
    emoji: "🌿",
    title: "Welcome to Phoebe Climate.",
    body: "A short prayer for creation, every morning, alongside others praying together for climate justice.",
  },
  {
    emoji: "🔔",
    title: "Each morning at 7am,",
    body: "you'll receive a gentle notification with the day's prayer. Open it, read, and pray.",
  },
  {
    emoji: "🤲🏽",
    title: "You're part of a wider prayer.",
    body: "Each time you pray, you're joining everyone who has prayed today across parishes and traditions. The counter at the end shows the prayer rising together.",
  },
];

export function ClimateOnboarding() {
  const [index, setIndex] = useState(0);
  const queryClient = useQueryClient();

  const completeMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/climate/onboarding"),
    onSuccess: () => {
      // /auth/me drives the dispatcher in climate.tsx — refetch to flip
      // the user's climateOnboardingCompleted and surface the tab.
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index]!;

  function advance() {
    if (isLast) {
      completeMutation.mutate();
    } else {
      setIndex(index + 1);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center px-6"
      style={{ background: "#040D06" }}
    >
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center text-center gap-6"
          >
            <div className="text-5xl">{slide.emoji}</div>

            <h2
              className="text-[26px] leading-[1.25] font-semibold"
              style={{
                color: "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
                letterSpacing: "-0.02em",
              }}
            >
              {slide.title}
            </h2>

            <p
              className="text-[17px] leading-[1.6]"
              style={{ color: "#C8D4C0" }}
            >
              {slide.body}
            </p>

            <button
              onClick={advance}
              disabled={completeMutation.isPending}
              className="mt-6 px-8 py-3 rounded-full text-sm font-semibold tracking-wide transition-opacity hover:opacity-80 active:scale-[0.98] disabled:opacity-50"
              style={{
                background: "#2D5E3F",
                color: "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {isLast ? (completeMutation.isPending ? "Beginning…" : "Begin") : "Next →"}
            </button>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      <div className="absolute bottom-12 flex gap-2">
        {SLIDES.map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: i === index ? 18 : 6,
              background: i === index ? "rgba(168,197,160,0.9)" : "rgba(143,175,150,0.25)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
