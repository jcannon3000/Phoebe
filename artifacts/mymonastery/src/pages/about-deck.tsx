// About deck — the About page as a swipeable slideshow. Reuses the church deck's
// shell, styling, navigation, and the real app-faithful mocks (DeckShell +
// Slide) so it looks exactly like the app; only the copy is About-specific.
import { DeckShell, type Slide } from "./church-deck";

// One paragraph of the About-page essay per slide, in order, with a mock
// wherever the paragraph names something concrete the app actually shows
// (the customizer, the home "Next" list, a rule of life, gatherings) —
// purely narrative/theological paragraphs stay text-only statements.
const SLIDES: Slide[] = [
  // 1 — Title / thesis, over the real home mock.
  {
    kind: "title",
    headline: "Phoebe",
    sub: "From distributing spiritual content to cultivating shared spiritual practice — and the belonging that grows from it.",
    mock: "dashboard",
  },
  // 2 — Not a resources problem.
  {
    kind: "statement",
    headline: "Not a lack of resources",
    body: [
      "For many Christians today, the problem is not a lack of resources about prayer. There are countless books, podcasts, devotionals, Bible apps, and studies. What is missing for many people is a way to sustain the daily habit itself.",
    ],
  },
  // 3 — Daniel.
  {
    kind: "statement",
    headline: "The same old resistance",
    body: [
      "The Prophet Daniel met resistance to praying three times a day in his own turbulent time. The causes look different for us, but we face resistance all the same: the pace of modern life, endless distractions, and the fragmentation of our attention. Many people genuinely want to pray. They simply struggle to return to it day after day.",
    ],
  },
  // 4 — Cultivating a Daily Habit: the customizable routine (Duolingo).
  {
    kind: "feature-combo",
    label: "Cultivating a Daily Habit",
    headline: "A routine, not a library",
    body: [
      "The Phoebe app makes it easier to build and sustain a daily rhythm of prayer. Drawing on principles used by habit-forming apps such as Duolingo, it guides each person through a customizable routine rather than presenting prayer as a library of resources to browse.",
    ],
    mock: "customizer",
  },
  // 5 — One step at a time, mark it complete: the real home view.
  {
    kind: "feature-combo",
    label: "",
    headline: "One step at a time",
    body: [
      "Each practice is presented one step at a time, always showing what comes next and allowing the user to mark it complete — not to reward streaks or punish inconsistency, but to reduce friction and make it easier to return the following day.",
    ],
    mock: "dashboard",
  },
  // 6 — The Way of Love framework.
  {
    kind: "feature-combo",
    label: "",
    headline: "The Way of Love",
    body: [
      "The framework is built around Bishop Michael Curry's Way of Love, offering an accessible rule of life that serves as an entry point into the lifelong process of becoming more like Jesus.",
    ],
    mock: "prayer-rhythm",
  },
  // 7 — The app carries part of the process; communities carry the rest.
  {
    kind: "statement",
    headline: "Carried day to day",
    body: [
      "The app carries part of that process. It helps hold the intention to pray from one day to the next. Across the history of the Church, communities have also helped sustain people in their walk with God.",
    ],
  },
  // 8 — Walking Together: the rabbinic yoke.
  {
    kind: "statement",
    headline: "Walking Together",
    body: [
      "When Jesus invited his disciples to take up his yoke, he was drawing on the rabbinic practice of apprenticeship: learning a way of life by walking alongside a teacher.",
    ],
  },
  // 9 — A leader's shared rhythm, ready to take up.
  {
    kind: "feature-combo",
    label: "",
    headline: "A shared rhythm",
    body: [
      "Phoebe gives churches a way to recover that pattern. Clergy and lay leaders can invite people into a shared rhythm of prayer that continues throughout the week, each person practicing within the realities of their own life while knowing that others are moving in the same direction.",
    ],
    mock: "leader-rule",
  },
  // 10 — Not a social network.
  {
    kind: "statement",
    headline: "Not a social network",
    body: [
      "Phoebe does not attempt to create connection online by becoming a social network for the Church. Instead, it sustains the daily practices people undertake in their own lives, creating a shared context for relationships to grow through in-person gatherings.",
    ],
  },
  // 11 — Different stages, same direction.
  {
    kind: "statement",
    headline: "Moving in the same direction",
    body: [
      "Members of a group using Phoebe may be at very different stages. Some may be establishing a regular prayer life for the first time. Others may have prayed the Daily Office for years. What holds them together is not following the same routine or being at the same point, but moving in the same direction — toward becoming more like Jesus.",
    ],
  },
  // 12 — Gathering, whenever fits.
  {
    kind: "feature-combo",
    label: "",
    headline: "Gather when it fits",
    body: [
      "Groups can gather whenever it best fits their context to encourage one another, reflect on what God is doing in their lives, and continue growing together. Each gathering becomes one moment within a longer process of formation. Rather than ending when a retreat, course, or parish event is over, Phoebe carries its intention into the ordinary days that follow.",
    ],
    mock: "gatherings",
  },
  // 13 — Hebrews 10.
  {
    kind: "statement",
    headline: "Hebrews 10",
    body: [
      "“And let us consider how we may spur one another on toward love and good deeds, not giving up meeting together, as some are in the habit of doing, but encouraging one another — and all the more as you see the Day approaching.”",
    ],
  },
  // 14 — The close: belonging as a byproduct of a shared process.
  {
    kind: "statement",
    headline: "The conditions for belonging",
    body: [
      "Young adults are hungry for meaningful connection, but simply gathering people in the same room is not enough to create it. Leaders can use Phoebe to create the conditions for belonging as people enter a meaningful process together — cultivating a habit of prayer in their own lives, supporting one another when they gather, and walking together in the life of discipleship.",
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
