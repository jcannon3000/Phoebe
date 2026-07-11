// About deck — the About page as a swipeable slideshow. Reuses the church deck's
// shell, styling, navigation, and the real app-faithful mocks (DeckShell +
// Slide) so it looks exactly like the app; only the copy is About-specific.
import { DeckShell, type Slide } from "./church-deck";

const SLIDES: Slide[] = [
  // Title over the real home mock.
  {
    kind: "title",
    headline: "Phoebe",
    sub: "An app for cultivating a daily practice of prayer.",
    mock: "dashboard",
  },
  {
    kind: "statement",
    headline: "One seamless routine",
    body: [
      "Phoebe brings together resources from across the Episcopal Church and beyond — with the modern tools to help you build a daily practice, and hold it.",
    ],
  },
  // The Daily Office — the real Evening Prayer psalm mock. Copy to the side,
  // mock on the right (the psalms render left-aligned, like the real office).
  {
    kind: "feature-combo",
    label: "",
    headline: "The Daily Office",
    body: [
      "Pray Morning and Evening Prayer with the psalms and lessons already filled in for you.",
    ],
    mock: "daily-office",
  },
  // One office, prayed your way — the ways-to-pray mock.
  {
    kind: "feature-combo",
    label: "",
    headline: "One office, prayed your way",
    body: [
      "From your own Book of Common Prayer, on the app, by audio, or alongside a cathedral broadcast — the same prayer, met however it meets you that day.",
    ],
    mock: "office-formats",
  },
  // Shape your own rhythm — the customizer / rule-of-life builder.
  {
    kind: "feature-combo",
    label: "",
    headline: "Shape your own rhythm",
    body: [
      "Build the practice that's yours — the offices, a reflection, a few minutes of silence. Keep whatever you already pray, add only what you want, and it's all held in one place — and easily changed as your life does.",
    ],
    mock: "customizer",
  },
  // The reflection, right where the office ends — the seamless FDD handoff.
  {
    kind: "feature-combo",
    label: "",
    headline: "A seamless practice",
    body: [
      "When the office ends, the day's Forward Day by Day reflection is right there — no searching, no second app. One unbroken movement from prayer into reflection.",
    ],
    mock: "office-fdd",
  },
  {
    kind: "statement",
    headline: "The depth, carried into your life",
    body: [
      "It keeps the depth of the tradition intact, and simply changes how it reaches you — meeting you in the busy, dispersed life you actually live.",
    ],
  },
  // Weekly progress — morning/evening held as a rhythm, the week at a glance.
  // (Moved to the end, ahead of the "what's next" view below.)
  {
    kind: "feature-combo",
    label: "",
    headline: "A daily habit you can keep",
    body: [
      "Morning and evening, held as a gentle rhythm — with your week at a glance. Never a streak to protect, just prayer, met each day.",
    ],
    mock: "prayer-rhythm",
  },
  // What's next — today's daily-progress view (position over score, the current
  // UI): where you are, and the next thing to pray.
  {
    kind: "feature-combo",
    label: "",
    headline: "Always, what's next",
    body: [
      "Open Phoebe and see exactly where you are in today's rhythm — and the next thing to pray. Made for the pace of modern life: nothing to figure out, just the next step.",
    ],
    mock: "prayer-streak",
  },
  // The name.
  {
    kind: "closing",
    body: [
      "It takes its name from the deacon Phoebe,",
      "who carried Paul’s letter to the Romans —",
      "entrusted to bring the word to where it needed to go.",
    ],
    featured: ["Phoebe"],
  },
];

export default function AboutDeckPage() {
  // No quick auto-advance slide (that's a church-deck-only thing), and hold each
  // slide 2s longer than the default.
  return <DeckShell slides={SLIDES} exitTo="/about" autoAdvanceMs={12000} quickIndex={-1} />;
}
