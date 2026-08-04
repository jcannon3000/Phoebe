// Overview deck — a condensed version of the About deck (about-deck.tsx):
// the same thesis and narrative arc in far fewer slides, for a context where
// the full 19-slide essay is too much. Reuses the church deck's shell,
// styling, navigation, and real app-faithful mocks (DeckShell + Slide) so it
// looks exactly like the app; only the copy is trimmed.
import { DeckShell, type Slide } from "./church-deck";

const SLIDES: Slide[] = [
  // 1 — Title / thesis, over the real home mock.
  {
    kind: "title",
    headline: "Phoebe",
    sub: "From distributing spiritual content to cultivating shared spiritual practice — and the belonging that grows from it.",
    mock: "dashboard",
  },
  // 2 — The problem, condensed (about-deck's slides 2–4 in one).
  {
    kind: "statement",
    headline: "Not a lack of resources",
    body: [
      "For many Christians, the problem isn't a lack of resources about prayer — it's sustaining the daily habit itself. Churches often respond to spiritual hunger by adding more: another program, another gathering. But for people already stretched thin, more activity can deepen the very exhaustion that makes formation difficult.",
    ],
  },
  // 3 — The reframed question (about-deck slide 5, unchanged).
  {
    kind: "statement",
    headline: "A different question",
    body: [
      "Phoebe begins with a different question: how might the Church help people sustain a daily practice of prayer within the realities of their lives, while giving them something meaningful to gather around when their schedules allow?",
    ],
  },
  // 4 — Cultivating a daily habit, condensed (about-deck's slides 6–7 in one).
  {
    kind: "feature-combo",
    label: "Cultivating a Daily Habit",
    headline: "A routine, not a library",
    body: [
      "Phoebe guides each person through a customizable daily routine rather than a library to browse — one step at a time, always showing what's next, so it's easy to return the following day.",
    ],
    mock: "customizer",
  },
  // 5 — Walking Together, condensed (about-deck's Way of Love / Walking
  // Together / shared-rhythm slides in one).
  {
    kind: "feature-combo",
    label: "Walking Together",
    headline: "Moving in the same direction",
    body: [
      "Built on Bishop Michael Curry's Way of Love, Phoebe lets a group move in the same direction between gatherings — each person practicing within the realities of their own life, while knowing others are on the same road.",
    ],
    mock: "dashboard",
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
  // The invitation — same close as the full deck.
  {
    kind: "closing",
    body: [],
    featured: ["Pray daily", "with Phoebe"],
  },
];

export default function OverviewDeckPage() {
  return <DeckShell slides={SLIDES} exitTo="/about" autoAdvanceMs={12000} quickIndex={-1} />;
}
