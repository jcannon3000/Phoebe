// About deck — the About page as a swipeable slideshow. Reuses the church deck's
// shell, styling, navigation, and the real app-faithful mocks (DeckShell +
// Slide) so it looks exactly like the app; only the copy is About-specific.
import { DeckShell, type Slide } from "./church-deck";

const SLIDES: Slide[] = [
  // Title over the real home mock. Names the invitation, not the function.
  {
    kind: "title",
    headline: "Phoebe",
    sub: "The prayer life of the church, made accessible.",
    mock: "dashboard",
  },
  // Names the barrier being removed: the resources exist and are free, just
  // scattered and hard to navigate. Phoebe is the front door.
  {
    kind: "statement",
    headline: "One seamless routine",
    body: [
      "Phoebe brings together the prayers, psalms, and readings of the Episcopal Church and beyond. They're all there — and free — but scattered across a half-dozen websites, a physical prayer book, and a lectionary most people can't navigate. Phoebe is the front door.",
    ],
  },
  // Pray how you want — flexibility across the tradition's forms (Psalms, the
  // offices, contemplative silence), not the Daily Office alone. The ways-to-
  // pray mock.
  {
    kind: "feature-combo",
    label: "",
    headline: "Pray how you want",
    body: [
      "Pray the Psalms, the Daily Office, or sit in contemplative silence — whatever meets you that day. From your own Book of Common Prayer, on the app, or by audio. The depth of the tradition, met your way.",
    ],
    mock: "office-formats",
  },
  // A rhythm that meets your life — the customizer / rule of life, with the
  // wider practices folded in: a daily devotional, silence, Audio Divina.
  {
    kind: "feature-combo",
    label: "",
    headline: "A rhythm that meets your life",
    body: [
      "Build a rule of life shaped to the life you actually live: the offices, a daily devotional, a few minutes of silence, sacred listening with Audio Divina. Keep whatever you already pray, add only what you want — all in one place, and easily changed as your life does.",
    ],
    mock: "customizer",
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
  // What's next up — the real home view: where you are in today's rhythm and
  // the next thing to pray. Uses the accurate home mock.
  {
    kind: "feature-combo",
    label: "",
    headline: "See what's next up",
    body: [
      "Open Phoebe and it shows you where you are in today's rhythm — and the next thing to pray. Nothing to figure out, just the next step, made for the pace of modern life.",
    ],
    mock: "dashboard",
  },
  // Shared prayer — not a social feed, just the quiet mark that others prayed
  // the same words today. Gives the closing "carried to a community" line
  // something to land on.
  {
    kind: "statement",
    headline: "The same words, the same day",
    body: [
      "Some at dawn, some on a train, some at midnight — praying the same psalm, the same day. Not a feed to keep up with, not a crowd; just the quiet knowledge that you're not praying alone.",
    ],
  },
  // The invitation — stability, carried into modern life. The app icon
  // anchors it (see ClosingSlide).
  {
    kind: "closing",
    body: [
      "Monastic life is built on stability —",
      "a rhythm you return to, day after day, until it becomes a place to stand.",
      "Phoebe carries that steadiness into the pace of modern life:",
      "the depth of the tradition, meeting you where your days actually are.",
    ],
    featured: ["Phoebe"],
  },
];

export default function AboutDeckPage() {
  // No quick auto-advance slide (that's a church-deck-only thing), and hold each
  // slide 2s longer than the default.
  return <DeckShell slides={SLIDES} exitTo="/about" autoAdvanceMs={12000} quickIndex={-1} />;
}
