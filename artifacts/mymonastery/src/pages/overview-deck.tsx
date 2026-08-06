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
  // 2 — The "why" before the "what": the essay's core diagnosis, compressed
  // to one sentence, so the next screen doesn't have to justify itself with
  // no groundwork. Deliberately NOT the full Daniel/social-acceleration
  // argument — that belongs in the essay/grant materials, building the case
  // before someone opens the app. Here, they've already opened it; this is
  // just enough context to earn what follows. Styled as a centered "title"
  // slide, small and white.
  {
    kind: "title",
    headline: "There's no shortage of resources on prayer — what's missing is a way to sustain the habit itself.",
    small: true,
  },
  // 3 — Cultivating a daily habit, condensed (about-deck's slides 6–7 in one).
  // Shows the home screen itself — the routine, always naming what's next —
  // rather than the customizer's when-to-pray picker, which is a setup step,
  // not the daily experience this slide is describing. Restores two things
  // the condensed version had lost: the non-punitive design promise ("not to
  // reward streaks or punish inconsistency" — a real differentiator next to
  // Duolingo-style apps) and the concrete daily-life grounding that makes the
  // habit feel achievable inside a real day.
  {
    kind: "feature-combo",
    label: "",
    headline: "Cultivate a daily habit",
    body: [
      "Phoebe guides each person through a customizable daily routine — one step at a time, always showing what's next.",
    ],
    mock: "dashboard",
    headlineSize: "lg",
  },
  // 4 — Making the office itself easier to pray (from the original
  // church-deck, unchanged copy) — moved ahead of the personalization slide
  // below: the office's own flexibility is the more basic point, worth
  // making before layering on additional practices.
  {
    kind: "feature-combo",
    label: "",
    headline: "Making the offices easier to pray",
    body: [
      "Tap \"How to pray\" on any office and choose how it meets you: a digital slideshow you move through at your own pace, the page numbers for a physical Book of Common Prayer, or listen to it read aloud.",
    ],
    mock: "office-formats",
    headlineSize: "sm",
  },
  // 5 — A routine shaped around the person, not a fixed program — beyond the
  // office itself, each person adds whichever contemplative practices fit
  // their own life.
  {
    kind: "feature-combo",
    label: "",
    headline: "A routine that fits",
    body: [
      "Each person can add the contemplative practices that fit their own life, building a day that's truly theirs, not a program applied the same way to everyone.",
    ],
    mock: "contemplative",
  },
  // 6 — Walking Together, condensed (about-deck's Way of Love / Walking
  // Together / shared-rhythm slides in one). No mock here — slide 2 already
  // showed the home screen, so a second dashboard mock this soon after just
  // repeated itself; this one carries the idea on text alone.
  {
    kind: "feature-text",
    label: "",
    headline: "Walking Together",
    body: [
      "Built on Bishop Michael Curry's Way of Love, Phoebe lets a group move in the same direction towards becoming more like Jesus between gatherings — each person practicing within the realities of their own life, while knowing others are on the same road of discipleship.",
    ],
  },
  // 7 — Gathering, whenever fits (about-deck slide 15, condensed).
  {
    kind: "feature-combo",
    label: "",
    headline: "Gather when it fits",
    body: [
      "When schedules do align, the gathering becomes a moment of reflection within a longer process already unfolding all week — not the only thing keeping it alive.",
    ],
    mock: "gatherings-compact",
    headlineSize: "lg",
    bodySize: "lg",
  },
  // 8 — The close: belonging as a byproduct (about-deck slide 18). Restores
  // the essay's real claim — gathering alone doesn't create connection — so
  // the belonging claim has the contrast that makes it interesting, not a
  // generic assertion.
  {
    kind: "statement",
    headline: "The conditions for belonging",
    body: [
      "Simply gathering people in the same room or being added to a group chat isn't enough to create belonging. Leaders can use Phoebe to create the conditions for it instead — as people enter a shared process of daily prayer, mutual encouragement, and walking together in the life of discipleship, as described in Hebrews.",
    ],
  },
  // 9 — Hebrews 10, the same verse the full about-deck uses. Styled as a
  // centered title slide — the verse itself is the headline; the citation
  // ("Hebrews 10:24-25") sits small underneath, like a caption, rather than
  // a "Hebrews 10" label above the verse.
  {
    kind: "title",
    headline: "“And let us consider how we may spur one another on toward love and good deeds, not giving up meeting together, as some are in the habit of doing, but encouraging one another — and all the more as you see the Day approaching.”",
    small: true,
    sub: "Hebrews 10:24-25",
  },
  // 10 — Who built this and why.
  {
    kind: "statement",
    headline: "",
    body: [
      "Phoebe is a project by Episcopal seminarians Anabelle Helsell and Jeremy Cannon, backed by a grant from the TryTank Research Institute at Virginia Theological Seminary.",
    ],
  },
  // 11 — The story behind the project.
  {
    kind: "statement",
    headline: "",
    body: [
      "Anabelle was the 2025 Liddell Award recipient for outstanding young adult ministry in New York. Jeremy was a postulant at Holy Cross Monastery, where they met on the feast of Thomas the Apostle, the patron saint of architects. Together, they set out to build Phoebe, to make monastic wisdom accessible to young adults in the modern world.",
    ],
  },
  // The invitation — same close as the full deck.
  {
    kind: "closing",
    body: [],
    featured: ["Cultivate a habit of prayer", "together with Phoebe"],
    caption: "Inspired by monastic wisdom",
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
      doneTo="/dashboard"
      autoAdvanceMs={12000}
      quickIndex={-1}
      stickyAction={isIntro ? { label: "Start praying →", onClick: startPraying } : undefined}
    />
  );
}
