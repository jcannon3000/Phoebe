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
  // Names the FORM claim explicitly (slideshow, not a scrolling document) —
  // the thing young adults actually asked for.
  {
    kind: "feature-combo",
    label: "",
    headline: "The Daily Office",
    body: [
      "Pray Morning and Evening Prayer with the psalms and lessons already filled in for you — presented one movement at a time, in the form the apps you already use taught you. Not a document to scroll.",
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
  // Shape your own rhythm — the customizer / rule-of-life builder. Names the
  // rule of life and the light-on-day-one → deeper-when-ready arc.
  {
    kind: "feature-combo",
    label: "",
    headline: "Shape your own rhythm",
    body: [
      "Build a rule of life that's actually yours — the offices, a reflection, a few minutes of silence. Begin lightly on day one, go deeper when you're ready. Keep whatever you already pray, add only what you want — and change it as your life changes.",
    ],
    mock: "customizer",
  },
  // The breadth of practices — the ones young adults asked for by name.
  {
    kind: "statement",
    headline: "Practices that meet you",
    body: [
      "Forward Day by Day and the CAC's daily meditation. Audio Divina — praying with the music you love. Creation prayer, silence, gratitude, a daily walk — or a practice you name yourself. And each week, the Way of Love.",
    ],
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
  // ─────────────────────────────────────────────────────────────
  // The communal turn — praying WITH each other, not just for.
  // (The email's "most consequential difference"; was absent here.)
  // ─────────────────────────────────────────────────────────────
  {
    kind: "statement",
    headline: "Prayed with, not just for",
    body: [
      "Phoebe is made to be prayed in community as well as alone. Your community keeps one rule of life — a shared daily rhythm you take up in one tap — and through the week your home quietly says: you prayed with 14 people this week.",
      "Never who did or who didn't. Presence, not attendance.",
    ],
  },
  // The leader-programmed shared prayer list — the same intercessions,
  // wherever each person prays.
  {
    kind: "feature-combo",
    label: "",
    headline: "One prayer list, prayed together",
    body: [
      "Leaders set the day's intercessions for the whole community — so wherever each person prays, everyone is praying the same prayers.",
    ],
    mock: "community-intercession",
  },
  // Events alongside the daily practices.
  {
    kind: "feature-combo",
    label: "",
    headline: "Alongside the life of your church",
    body: [
      "Gatherings and services appear beside the daily practices — personal prayer, connected to the community it belongs to.",
    ],
    mock: "gatherings",
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
