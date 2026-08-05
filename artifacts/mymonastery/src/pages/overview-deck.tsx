// Overview deck — a condensed version of the About deck (about-deck.tsx):
// the same thesis and narrative arc in far fewer slides, for a context where
// the full 19-slide essay is too much. Reuses the church deck's shell,
// styling, navigation, and real app-faithful mocks (DeckShell + Slide) so it
// looks exactly like the app; only the copy is trimmed.
//
// ?intro=1 — the WEB landing mode: a brand-new signed-out visitor (see
// welcome-public.tsx's first-open redirect) sees this deck FIRST, with a
// persistent "Start praying" button (DeckShell's stickyAction) instead of
// the plain Close/Done — tapping it (mid-deck or at the end) runs the exact
// same seed-guest-rule + land-on-home sequence welcome-public.tsx otherwise
// runs immediately, so the deck is a detour in front of that flow, not a
// separate path.
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { DeckShell, type Slide } from "./church-deck";
import { seedGuestRule } from "@/lib/guestSeed";
import { ensureAnonymousUser } from "@/lib/guestProvision";

const SLIDES: Slide[] = [
  // 1 — Title / thesis, over the real home mock.
  {
    kind: "title",
    headline: "Phoebe",
    sub: "A tool for leaders to welcome people into the prayer life of the church — making space for them to find belonging.",
    mock: "dashboard",
  },
  // 2 — Cultivating a daily habit, condensed (about-deck's slides 6–7 in one).
  // Shows the home screen itself — the routine, always naming what's next —
  // rather than the customizer's when-to-pray picker, which is a setup step,
  // not the daily experience this slide is describing.
  {
    kind: "feature-combo",
    label: "Cultivating a Daily Habit",
    headline: "A routine, not a library",
    body: [
      "Phoebe guides each person through a customizable daily routine rather than a library to browse — one step at a time, always showing what's next, so it's easy to return the following day.",
    ],
    mock: "dashboard",
  },
  // 3 — Making the office itself easier to pray (from the original
  // church-deck, unchanged copy) — moved ahead of the personalization slide
  // below: the office's own flexibility is the more basic point, worth
  // making before layering on additional practices.
  {
    kind: "feature-combo",
    label: "",
    headline: "Making the office easier to pray",
    body: [
      "Tap \"How to pray\" on any office and choose how it meets you: a digital slideshow you move through at your own pace, the page numbers for a physical Book of Common Prayer, or listen to it read aloud. Every way keeps the same rhythm.",
    ],
    mock: "office-formats",
  },
  // 4 — A routine shaped around the person, not a fixed program — beyond the
  // office itself, each person adds whichever contemplative practices fit
  // their own life.
  {
    kind: "feature-combo",
    label: "",
    headline: "A routine that fits them",
    body: [
      "Beyond the daily office, each person can add the contemplative practices that fit their own life — Audio Divina, the Examen, Creation Prayer, a contemplative walk — building a day that's truly theirs, not a program applied the same way to everyone.",
    ],
    mock: "contemplative",
  },
  // 5 — Walking Together, condensed (about-deck's Way of Love / Walking
  // Together / shared-rhythm slides in one). No mock here — slide 2 already
  // showed the home screen, so a second dashboard mock this soon after just
  // repeated itself; this one carries the idea on text alone.
  {
    kind: "feature-text",
    label: "",
    headline: "Walking Together",
    body: [
      "Built on Bishop Michael Curry's Way of Love, Phoebe lets a group move in the same direction between gatherings — each person practicing within the realities of their own life, while knowing others are on the same road.",
    ],
  },
  // 6 — Gathering, whenever fits (about-deck slide 15, condensed).
  {
    kind: "feature-combo",
    label: "",
    headline: "Gather when it fits",
    body: [
      "When schedules do align, the gathering becomes a moment of reflection within a longer process already unfolding all week — not the only thing keeping it alive.",
    ],
    mock: "gatherings",
  },
  // 7 — The close: belonging as a byproduct (about-deck slide 18, unchanged).
  {
    kind: "statement",
    headline: "The conditions for belonging",
    body: [
      "Leaders can use Phoebe to create the conditions for belonging — as people enter a shared process of daily prayer, mutual encouragement, and walking together in the life of discipleship.",
    ],
  },
  // 8 — Hebrews 10, the same verse the full about-deck uses (unchanged).
  {
    kind: "statement",
    headline: "Hebrews 10",
    body: [
      "“And let us consider how we may spur one another on toward love and good deeds, not giving up meeting together, as some are in the habit of doing, but encouraging one another — and all the more as you see the Day approaching.”",
    ],
  },
  // The invitation — same close as the full deck.
  {
    kind: "closing",
    body: [],
    featured: ["Pray daily", "with Phoebe"],
  },
];

export default function OverviewDeckPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();
  const isIntro = new URLSearchParams(search).get("intro") === "1";

  const startPraying = () => {
    seedGuestRule();
    void ensureAnonymousUser().then((created) => {
      if (created) qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    });
    setLocation("/dashboard", { replace: true });
  };

  return (
    <DeckShell
      slides={SLIDES}
      exitTo="/about"
      autoAdvanceMs={12000}
      quickIndex={-1}
      stickyAction={isIntro ? { label: "Start praying →", onClick: startPraying } : undefined}
    />
  );
}
