// About deck — the About page as a swipeable slideshow. Reuses the church deck's
// shell, styling, navigation, and the real app-faithful mocks (DeckShell +
// Slide) so it looks exactly like the app; only the copy is About-specific.
import { DeckShell, type Slide } from "./church-deck";

const SLIDES: Slide[] = [
  // 1 — Title over the real home mock.
  {
    kind: "title",
    headline: "Phoebe",
    sub: "The prayer life of the church, made accessible.",
    mock: "dashboard",
  },
  // 2 — The front door: everything exists and is free, just scattered.
  {
    kind: "statement",
    headline: "One seamless routine",
    body: [
      "Phoebe brings together the prayers, psalms, and readings of the Episcopal Church and beyond — scattered across websites, books, and lectionaries — into one front door.",
    ],
  },
  // 3 — Make it yours: the customizer / rule of life.
  {
    kind: "feature-combo",
    label: "",
    headline: "Make it yours",
    body: [
      "Add pieces one at a time, or all at once, and shape a rhythm around the life you actually live.",
    ],
    mock: "customizer",
  },
  // 4 — A daily habit you can keep: the week at a glance.
  {
    kind: "feature-combo",
    label: "",
    headline: "A daily habit you can keep",
    body: [
      "Morning and evening, held as a gentle rhythm — never a streak to protect, just prayer, met each day.",
    ],
    mock: "prayer-rhythm",
  },
  // 5 — See what's next up: the real home view.
  {
    kind: "feature-combo",
    label: "",
    headline: "See what's next up",
    body: [
      "Open Phoebe and it shows you the next thing to pray, made for the pace of modern life.",
    ],
    mock: "dashboard",
  },
  // 6 — Not praying alone: a quiet text interlude, no mock.
  {
    kind: "statement",
    headline: "Not praying alone",
    body: [
      "Some at dawn, some on a train, some at midnight — praying the same psalm, the same day, together.",
    ],
  },
  // 7 — Pray alongside your leader: a leader's rule of life, ready to take up.
  {
    kind: "feature-combo",
    label: "",
    headline: "Pray alongside your leader",
    body: [
      "A leader can program their own daily rhythm of prayer and invite you to walk it alongside them.",
    ],
    mock: "leader-rule",
  },
  // 8 — Carried to you: the Phoebe-name / deacon origin story.
  {
    kind: "statement",
    headline: "Carried to you",
    body: [
      "Phoebe takes its name from the deacon who carried Paul's letter to the Romans — the church's prayer, carried to you.",
    ],
  },
  // The invitation — just the name and the ask. The app icon anchors it
  // (see ClosingSlide); no sub copy underneath.
  {
    kind: "closing",
    body: [],
    featured: ["Pray daily", "with Phoebe"],
  },
];

export default function AboutDeckPage() {
  // No quick auto-advance slide (that's a church-deck-only thing), and hold each
  // slide 2s longer than the default.
  return <DeckShell slides={SLIDES} exitTo="/about" autoAdvanceMs={12000} quickIndex={-1} />;
}
