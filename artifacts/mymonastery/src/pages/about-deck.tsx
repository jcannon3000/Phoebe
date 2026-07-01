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
  // The Daily Office — the real Evening Prayer psalm mock.
  {
    kind: "feature-combo",
    label: "",
    headline: "The Daily Office",
    body: [
      "Pray Morning and Evening Prayer with the psalms and lessons already filled in for you.",
    ],
    mock: "daily-office",
    stacked: true,
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
    stacked: true,
  },
  // Your whole practice, held together — the rhythm mock.
  {
    kind: "feature-combo",
    label: "",
    headline: "Held together",
    body: [
      "Shape your own rhythm, from simply praying the Psalms to the full Daily Office. Whatever pieces your practice already has — the offices, a reflection, a few minutes of silence — held in one place.",
    ],
    mock: "prayer-rhythm",
    stacked: true,
  },
  {
    kind: "statement",
    headline: "The depth, carried into your life",
    body: [
      "It keeps the depth of the tradition intact, and simply changes how it reaches you — meeting you in the busy, dispersed life you actually live.",
    ],
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
  return <DeckShell slides={SLIDES} exitTo="/about" />;
}
