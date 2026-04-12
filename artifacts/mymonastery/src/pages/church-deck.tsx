import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  bg: "#091A10",
  card: "#0F2818",
  text: "#F0EDE6",
  sage: "#8FAF96",
  font: "'Space Grotesk', sans-serif",
} as const;

// ─── Slide types ────────────────────────────────────────────────────────────
type Slide =
  | { kind: "title"; headline: string; sub?: string; muted?: boolean }
  | { kind: "statement"; headline: string; body: string[] }
  | {
      kind: "preview";
      label: string;
      headline: string;
      body: string[];
      variant:
        | "prayer"
        | "bcp"
        | "fasting"
        | "meat-fast"
        | "prayer-requests"
        | "prayer-list"
        | "calendar"
        | "involvement";
    }
  | { kind: "closing"; body: string[]; featured: string[] };

// ─── Slides ─────────────────────────────────────────────────────────────────
const SLIDES: Slide[] = [
  // 1 — Title
  {
    kind: "title",
    headline: "Phoebe",
    sub: "A place set apart for connection.",
  },

  // 2 — The opening
  {
    kind: "statement",
    headline: "Your parish already has everything it needs.",
    body: [
      "People who want to be close to one another. Groups that already meet. A tradition of shared practice. Relationships that are already forming.",
      "The question is not how to build community from scratch. It is how to cultivate what is already there.",
    ],
  },

  // 3 — The real challenge
  {
    kind: "statement",
    headline: "Most parishes are good at Sunday.",
    body: [
      "The challenge is Tuesday. Wednesday. Friday. The six days when nothing is organised and people quietly return to their separate lives.",
      "Phoebe creates touchpoints between Sundays. Small, consistent, low friction. Enough to keep the community alive in the days when no one is gathering.",
    ],
  },

  // 4 — The week (centered, auto-advances after 2s)
  {
    kind: "title",
    headline: "Here is what a week looks like inside Phoebe.",
    muted: true,
  },

  // 5 — Group Intercession (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Bearing each other\u2019s burdens in prayer.",
    body: [
      "A group chooses people and intentions to pray for together. Each person prays at their own time, on their own schedule. They see who has prayed and who is holding the same things.",
      "Knowing someone is praying for you by name changes how you show up on Sunday.",
    ],
    variant: "prayer",
  },

  // 6 — Group Intercessions from the BCP (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Group Intercessions from the BCP",
    body: [
      "The Book of Common Prayer gives us prayers for every season and circumstance. Phoebe puts them in the hands of the community.",
      "A group selects prayers to hold together \u2014 for the sick, for those in trouble, for the departed. Each person carries the same words through the week.",
      "Ancient prayers, held in common. The tradition made daily.",
    ],
    variant: "bcp",
  },

  // 7 — Group Fast (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "A rhythm of restraint, held together.",
    body: [
      "A group commits to a fast on a chosen day. A calendar invite goes out the night before. On the day, each person sees who is fasting alongside them. At the close, they share what nourished them instead.",
      "Fasting was never meant to be done alone. Phoebe makes it communal again.",
    ],
    variant: "fasting",
  },

  // 8 — Fast from meat (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "One fast with a visible impact.",
    body: [
      "For groups fasting from meat, University of Colorado research shows that one person fasting for one day saves an estimated 400 gallons of water. Phoebe tracks what the group saves together.",
      "This week. This month. All time.",
      "A small act of shared faithfulness. A visible record of what the community has done together.",
    ],
    variant: "meat-fast",
  },

  // 9 — Prayer Requests (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Prayer, held in common.",
    body: [
      "People share what they are carrying. Others in the community respond with a word or a prayer. Anonymous if needed. Low vulnerability. Low friction.",
      "The doorway into the life of the community. When someone submits a request during the week, they arrive on Sunday already known.",
    ],
    variant: "prayer-requests",
  },

  // 10 — The Prayer List (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "A shared record of what the community is holding.",
    body: [
      "Every request, every intention, every name being carried in prayer \u2014 gathered in one place. The community can see what is being held together. They can add their prayer to what is already there.",
      "Intercession made visible. The invisible work of the community, given a surface.",
    ],
    variant: "prayer-list",
  },

  // 11 — What this builds
  {
    kind: "statement",
    headline: "Each practice feeds the next.",
    body: [
      "The prayer request submitted on Wednesday breaks the ice on Sunday. The Lectio reflection written on Friday deepens the sermon conversation. The fast held together on Thursday is still being felt when the group gathers. The name prayed for on Tuesday is the person who feels seen when they walk through the door.",
      "Over time the touchpoints between Sundays become the fabric of community life.",
    ],
  },

  // 12 — The parish calendar (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline:
      "Everything already happening, in front of the people most likely to come.",
    body: [
      "The parish is already running events. The problem is not a lack of things to do \u2014 it is that people do not hear about them, or forget, or never felt connected enough to show up.",
      "Phoebe puts the parish calendar in front of people who are already engaged during the week. The person who prayed on Wednesday and fasted on Friday is the most likely person to come to Thursday evening\u2019s talk. They just need to see it.",
    ],
    variant: "calendar",
  },

  // 13 — Getting more involved (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "A natural next step for people who are already connected.",
    body: [
      "When someone has been praying with a group for six weeks, they are no longer a stranger. They are ready to go deeper.",
      "The parish calendar surfaces ways to do that. A volunteer opportunity. A study group. A service project. A gathering that is just beginning.",
      "Phoebe does not recruit people into parish life. It cultivates the ground so that when the invitation comes, people are ready to say yes.",
    ],
    variant: "involvement",
  },

  // 14 — Closing
  {
    kind: "closing",
    body: [
      "The strongest parishes are not the ones with the most programs. They are the ones where people know each other.",
      "Relationships drive attendance. Relationships drive giving. Relationships drive the decision to stay when life gets hard and the invitation to bring someone new.",
      "Relationships are built through shared points of connection \u2014 a prayer held in common, a passage read together, a fast observed alongside someone else, a name carried through the week.",
    ],
    featured: ["Phoebe makes this possible.", "Every day. Between Sundays."],
  },
];

// ─── Slide renderers ─────────────────────────────────────────────────────────

function TitleSlide({ slide }: { slide: Extract<Slide, { kind: "title" }> }) {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-3xl mx-auto">
      <h1
        className="text-5xl md:text-7xl font-bold mb-4 md:mb-6 tracking-tight"
        style={{ color: slide.muted ? C.sage : C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h1>
      {slide.sub && (
        <p
          className="text-lg md:text-2xl font-light"
          style={{ color: C.sage, fontFamily: C.font }}
        >
          {slide.sub}
        </p>
      )}
    </div>
  );
}

function StatementSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "statement" }>;
}) {
  return (
    <div className="max-w-3xl mx-auto w-full">
      <h2
        className="text-2xl md:text-4xl font-semibold mb-6 md:mb-10 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h2>
      <div className="space-y-4 md:space-y-6">
        {slide.body.map((p, i) => (
          <p
            key={i}
            className="text-base md:text-xl leading-relaxed font-light"
            style={{
              color: C.sage,
              fontFamily: C.font,
              whiteSpace: "pre-line",
            }}
          >
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── Mock UI components for preview slides ──────────────────────────────────

function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[28px] md:rounded-[32px] p-4 md:p-5 mx-auto w-full max-w-[290px] md:max-w-[320px]"
      style={{
        background: "#091A10",
        border: "1px solid rgba(200,212,192,0.15)",
        boxShadow:
          "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,212,192,0.05)",
      }}
    >
      {children}
    </div>
  );
}

/* ── Slide 5: Group Intercession prayer mode ── */
function PrayerPracticeMock() {
  return (
    <MockPhone>
      <div className="flex flex-col items-center text-center gap-4">
        <p
          className="text-[9px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Your Intercession
        </p>
        <p
          className="text-[15px] leading-[1.5] font-medium italic"
          style={{
            color: "#E8E4D8",
            fontFamily: "'Playfair Display', Georgia, serif",
          }}
        >
          Margaret&apos;s mother, as she begins treatment this week.
        </p>
        <p className="text-[12px]" style={{ color: C.sage }}>
          with David, Anna, James
        </p>
        <p
          className="text-[11px] italic"
          style={{ color: "rgba(143,175,150,0.55)" }}
        >
          Your community is holding this.
        </p>
        <div
          className="w-full rounded-xl px-4 py-3 text-left"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          <p
            className="text-[11px] italic leading-[1.7]"
            style={{ color: "#C8D4C0", fontFamily: "Georgia, serif" }}
          >
            O Father of mercies and God of all comfort, our only help in time of
            need...
          </p>
          <p
            className="text-[8px] uppercase tracking-widest mt-2"
            style={{ color: "rgba(143,175,150,0.3)" }}
          >
            From the Book of Common Prayer
          </p>
        </div>
        <div
          className="px-6 py-2 rounded-full text-[12px] font-medium"
          style={{
            background: "rgba(46,107,64,0.28)",
            border: "1px solid rgba(46,107,64,0.5)",
            color: "#C8D4C0",
          }}
        >
          Amen &rarr;
        </div>
        <p className="text-[10px]" style={{ color: "rgba(143,175,150,0.32)" }}>
          1 of 4
        </p>
      </div>
    </MockPhone>
  );
}

/* ── Slide 6: BCP Prayer List ── */
function BCPPrayersMock() {
  const prayers = [
    {
      title: "For the Sick",
      source: "BCP p. 458",
      snippet:
        "O Father of mercies and God of all comfort, our only help in time of need...",
    },
    {
      title: "For a Person in Trouble",
      source: "BCP p. 460",
      snippet:
        "O merciful God, who hast made all men and hatest nothing that thou hast made...",
    },
    {
      title: "For the Departed",
      source: "BCP p. 487",
      snippet: "Into thy hands, O merciful Savior, we commend thy servant...",
    },
    {
      title: "For Those Who Mourn",
      source: "BCP p. 489",
      snippet:
        "Almighty God, Father of mercies and giver of comfort...",
    },
  ];
  return (
    <MockPhone>
      <h2
        className="text-base font-bold mb-0.5"
        style={{ color: C.text, fontFamily: C.font }}
      >
        BCP Intercessions 🙏🏽
      </h2>
      <p className="text-[10px] mb-3" style={{ color: C.sage }}>
        Prayers from the Book of Common Prayer
      </p>
      <div
        className="h-px mb-3"
        style={{ background: "rgba(46,107,64,0.25)" }}
      />
      <div className="space-y-2">
        {prayers.map((p, i) => (
          <div
            key={i}
            className="rounded-xl px-3 py-2.5"
            style={{
              background: "rgba(46,107,64,0.1)",
              border: "1px solid rgba(46,107,64,0.2)",
            }}
          >
            <p
              className="text-[12px] font-semibold"
              style={{ color: C.text, fontFamily: C.font }}
            >
              {p.title}
            </p>
            <p
              className="text-[9px] mt-0.5 mb-1"
              style={{ color: "rgba(143,175,150,0.5)" }}
            >
              {p.source}
            </p>
            <p
              className="text-[10px] italic leading-[1.5]"
              style={{ color: C.sage, fontFamily: "Georgia, serif" }}
            >
              {p.snippet}
            </p>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

/* ── Slide 7: Group Fast ── */
function FastingMock() {
  return (
    <MockPhone>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "rgba(200,212,192,0.5)" }}
      >
        Today&apos;s fast
      </p>
      <h2
        className="text-base font-semibold mb-1"
        style={{ color: C.text, fontFamily: C.font }}
      >
        🌿 Lenten Fast
      </h2>
      <p className="text-[11px] mb-4" style={{ color: C.sage }}>
        Friday &middot; with Anna, David, Margaret
      </p>
      <div className="space-y-2 mb-4">
        {[
          "Anna \u2014 fasting",
          "David \u2014 fasting",
          "Margaret \u2014 not yet",
        ].map((line, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: "rgba(46,107,64,0.12)",
              border: "1px solid rgba(46,107,64,0.15)",
            }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background:
                  i < 2 ? "#2E6B40" : "rgba(143,175,150,0.25)",
              }}
            />
            <p
              className="text-[11px]"
              style={{
                color: i < 2 ? C.text : "rgba(143,175,150,0.5)",
                fontFamily: C.font,
              }}
            >
              {line}
            </p>
          </div>
        ))}
      </div>
      <div
        className="rounded-xl px-4 py-3 text-center"
        style={{
          background: "rgba(46,107,64,0.18)",
          border: "1px solid rgba(46,107,64,0.25)",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-widest mb-1"
          style={{ color: "rgba(143,175,150,0.5)" }}
        >
          Fasting together
        </p>
        <p
          className="text-xl font-bold"
          style={{ color: C.text, fontFamily: C.font }}
        >
          2 of 3
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: C.sage }}>
          holding the rhythm today
        </p>
      </div>
    </MockPhone>
  );
}

/* ── Slide 8: Meat Fast / Water Savings ── */
function MeatFastMock() {
  return (
    <MockPhone>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "rgba(200,212,192,0.5)" }}
      >
        Fast from meat
      </p>
      <h2
        className="text-base font-semibold mb-1"
        style={{ color: C.text, fontFamily: C.font }}
      >
        🌿 Water Saved Together
      </h2>
      <p className="text-[11px] mb-4" style={{ color: C.sage }}>
        Each person &middot; each day &middot; ~400 gallons
      </p>
      <div className="space-y-2 mb-3">
        {[
          { label: "This week", value: "1,200 gal", note: "3 people fasting" },
          {
            label: "This month",
            value: "4,800 gal",
            note: "3 people \u00b7 4 weeks",
          },
          {
            label: "All time",
            value: "18,400 gal",
            note: "since Ash Wednesday",
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="rounded-xl px-4 py-2.5"
            style={{
              background: "rgba(46,107,64,0.12)",
              border: "1px solid rgba(46,107,64,0.18)",
            }}
          >
            <div className="flex justify-between items-baseline">
              <p
                className="text-[10px] uppercase tracking-widest"
                style={{ color: "rgba(143,175,150,0.5)" }}
              >
                {stat.label}
              </p>
              <p
                className="text-base font-bold"
                style={{ color: C.text, fontFamily: C.font }}
              >
                {stat.value}
              </p>
            </div>
            <p
              className="text-[9px] mt-0.5"
              style={{ color: "rgba(143,175,150,0.4)" }}
            >
              {stat.note}
            </p>
          </div>
        ))}
      </div>
      <p
        className="text-[8px] text-center italic"
        style={{ color: "rgba(143,175,150,0.35)" }}
      >
        University of Colorado research
      </p>
    </MockPhone>
  );
}

/* ── Slide 9: Prayer Requests ── */
function PrayerRequestsMock() {
  const requests = [
    {
      from: "Margaret W.",
      body: "For my mother, who begins treatment this week.",
      words: 4,
    },
    { from: "David R.", body: "Discernment about the new role.", words: 6 },
    {
      from: "Anonymous",
      body: "For peace in a difficult season.",
      words: 2,
    },
  ];
  return (
    <MockPhone>
      <div className="flex items-center gap-2 mb-3">
        <h2
          className="text-[13px] font-semibold"
          style={{ color: C.text, fontFamily: C.font }}
        >
          Prayer Requests 🙏🏽
        </h2>
        <div
          className="flex-1 h-px"
          style={{ background: "rgba(200,212,192,0.15)" }}
        />
      </div>
      <div className="flex gap-2 mb-3">
        <div
          className="flex-1 text-[11px] px-3 py-2 rounded-xl"
          style={{
            background: "#091A10",
            border: "1px solid rgba(46,107,64,0.3)",
            color: "rgba(143,175,150,0.5)",
            fontFamily: C.font,
          }}
        >
          Share a prayer request... 🌿
        </div>
        <div
          className="px-2.5 py-2 rounded-xl text-[11px]"
          style={{ background: "#2D5E3F", color: C.text }}
        >
          🙏🏽
        </div>
      </div>
      <div>
        {requests.map((r, i) => (
          <div
            key={i}
            className="flex gap-0"
            style={{
              borderBottom:
                i < 2 ? "1px solid rgba(200,212,192,0.12)" : "none",
            }}
          >
            <div
              className="w-0.5 self-stretch shrink-0"
              style={{ background: "#8FAF96" }}
            />
            <div className="flex-1 p-2.5 pl-2">
              <p
                className="text-[8px] font-medium uppercase tracking-widest mb-0.5"
                style={{ color: "rgba(200,212,192,0.45)" }}
              >
                From {r.from}
              </p>
              <p
                className="text-[11px] leading-relaxed mb-1"
                style={{ color: C.text, fontFamily: C.font }}
              >
                {r.body}
              </p>
              <p
                className="text-[9px]"
                style={{ color: "rgba(143,175,150,0.7)" }}
              >
                🌿 {r.words} words of prayer
              </p>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

/* ── Slide 10: Prayer List ── */
function PrayerListMock() {
  const items = [
    {
      name: "Margaret\u2019s mother",
      held: "4 people praying",
      days: "5 days",
    },
    {
      name: "David\u2019s discernment",
      held: "6 people praying",
      days: "2 days",
    },
    {
      name: "Peace for a difficult season",
      held: "3 people praying",
      days: "4 days",
    },
    {
      name: "Sarah\u2019s recovery",
      held: "5 people praying",
      days: "1 day",
    },
  ];
  return (
    <MockPhone>
      <h2
        className="text-base font-bold mb-0.5"
        style={{ color: C.text, fontFamily: C.font }}
      >
        Prayer List 🕯️
      </h2>
      <p className="text-[10px] mb-3" style={{ color: C.sage }}>
        What the community is holding together
      </p>
      <div
        className="h-px mb-3"
        style={{ background: "rgba(46,107,64,0.25)" }}
      />
      <div className="space-y-0">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex gap-0"
            style={{
              borderBottom:
                i < items.length - 1
                  ? "1px solid rgba(200,212,192,0.1)"
                  : "none",
            }}
          >
            <div
              className="w-0.5 self-stretch shrink-0"
              style={{ background: "#8FAF96" }}
            />
            <div className="flex-1 p-2.5 pl-2">
              <p
                className="text-[11px] font-medium"
                style={{ color: C.text, fontFamily: C.font }}
              >
                {item.name}
              </p>
              <div className="flex gap-2 mt-0.5">
                <p
                  className="text-[9px]"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  🌿 {item.held}
                </p>
                <p
                  className="text-[9px]"
                  style={{ color: "rgba(143,175,150,0.4)" }}
                >
                  {item.days}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

/* ── Slide 12: Parish Calendar ── */
function CalendarMock() {
  return (
    <MockPhone>
      <h2
        className="text-base font-bold mb-0.5"
        style={{ color: C.text, fontFamily: C.font }}
      >
        Parish Calendar
      </h2>
      <p className="text-[10px] mb-3" style={{ color: C.sage }}>
        What&apos;s happening this week
      </p>
      <div
        className="h-px mb-3"
        style={{ background: "rgba(111,175,133,0.25)" }}
      />
      <div className="space-y-2">
        {[
          {
            title: "🍞 Wednesday Supper",
            when: "Wed \u00b7 6:30 PM",
            place: "Parish Hall",
            people: "12 going",
          },
          {
            title: "📖 Lenten Study",
            when: "Thu \u00b7 7 PM",
            place: "Library",
            people: "8 going",
          },
          {
            title: "🙏🏽 Morning Prayer",
            when: "Sat \u00b7 8 AM",
            place: "Chapel",
            people: "4 regulars",
          },
          {
            title: "🎵 Evensong",
            when: "Sun \u00b7 5 PM",
            place: "Nave",
            people: "Open to all",
          },
        ].map((g, i) => (
          <div
            key={i}
            className="relative flex rounded-xl overflow-hidden"
            style={{
              background: "rgba(111,175,133,0.12)",
              border: `1px solid rgba(111,175,133,${i === 0 ? "0.4" : "0.2"})`,
            }}
          >
            <div
              className="w-1 flex-shrink-0"
              style={{ background: "#6FAF85" }}
            />
            <div className="flex-1 px-3 py-2.5">
              <p
                className="text-[12px] font-semibold"
                style={{ color: C.text, fontFamily: C.font }}
              >
                {g.title}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: C.sage }}>
                {g.when}
              </p>
              <p
                className="text-[9px] mt-0.5"
                style={{ color: "rgba(143,175,150,0.5)" }}
              >
                {g.place} &middot; {g.people}
              </p>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

/* ── Slide 13: Getting More Involved ── */
function InvolvementMock() {
  return (
    <MockPhone>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "rgba(200,212,192,0.5)" }}
      >
        Go deeper
      </p>
      <h2
        className="text-base font-bold mb-3"
        style={{ color: C.text, fontFamily: C.font }}
      >
        Ways to get involved
      </h2>
      <div className="space-y-2">
        {[
          {
            title: "🤝🏽 Serve at Wednesday Supper",
            type: "Volunteer",
            note: "Next opening: Apr 16",
          },
          {
            title: "📖 Join the Lenten Study",
            type: "Study Group",
            note: "Thursdays \u00b7 6 weeks",
          },
          {
            title: "🌿 Garden Ministry",
            type: "Service Project",
            note: "Saturdays in May",
          },
          {
            title: "🙏🏽 Lead Morning Prayer",
            type: "Ministry",
            note: "Training available",
          },
        ].map((item, i) => (
          <div
            key={i}
            className="rounded-xl px-3 py-2.5"
            style={{
              background: "rgba(46,107,64,0.1)",
              border: "1px solid rgba(46,107,64,0.2)",
            }}
          >
            <p
              className="text-[12px] font-semibold"
              style={{ color: C.text, fontFamily: C.font }}
            >
              {item.title}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-[8px] px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(46,107,64,0.25)",
                  color: C.sage,
                }}
              >
                {item.type}
              </span>
              <p
                className="text-[9px]"
                style={{ color: "rgba(143,175,150,0.5)" }}
              >
                {item.note}
              </p>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

const MOCK_MAP: Record<string, () => JSX.Element> = {
  prayer: PrayerPracticeMock,
  bcp: BCPPrayersMock,
  fasting: FastingMock,
  "meat-fast": MeatFastMock,
  "prayer-requests": PrayerRequestsMock,
  "prayer-list": PrayerListMock,
  calendar: CalendarMock,
  involvement: InvolvementMock,
};

function PreviewSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "preview" }>;
}) {
  const Mock = MOCK_MAP[slide.variant];
  return (
    <div className="max-w-5xl mx-auto w-full flex flex-col md:flex-row items-center gap-6 md:gap-16">
      {/* Left: text content */}
      <div className="flex-1 min-w-0 md:max-w-[55%]">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.18em] mb-4"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          {slide.label}
        </p>
        <h2
          className="text-2xl md:text-4xl font-semibold mb-6 md:mb-10 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.headline}
        </h2>
        <div className="space-y-4 md:space-y-6">
          {slide.body.map((p, i) => (
            <p
              key={i}
              className="text-base md:text-xl leading-relaxed font-light"
              style={{
                color: C.sage,
                fontFamily: C.font,
                whiteSpace: "pre-line",
              }}
            >
              {p}
            </p>
          ))}
        </div>
      </div>

      {/* Right: live mock UI */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="shrink-0 w-full md:w-[40%] flex justify-center"
      >
        {Mock ? <Mock /> : null}
      </motion.div>
    </div>
  );
}

function ClosingSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "closing" }>;
}) {
  return (
    <div className="max-w-3xl mx-auto w-full text-center">
      <div className="space-y-4 md:space-y-6 mb-10 md:mb-16">
        {slide.body.map((line, i) => (
          <p
            key={i}
            className="text-base md:text-xl font-light leading-relaxed"
            style={{ color: C.sage, fontFamily: C.font }}
          >
            {line}
          </p>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="space-y-1"
      >
        {slide.featured.map((line, i) => (
          <p
            key={i}
            className="text-3xl md:text-5xl font-semibold leading-tight"
            style={{ color: C.text, fontFamily: C.font }}
          >
            {line}
          </p>
        ))}
      </motion.div>
    </div>
  );
}

function renderSlide(slide: Slide) {
  switch (slide.kind) {
    case "title":
      return <TitleSlide slide={slide} />;
    case "statement":
      return <StatementSlide slide={slide} />;
    case "preview":
      return <PreviewSlide slide={slide} />;
    case "closing":
      return <ClosingSlide slide={slide} />;
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ChurchDeck() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, SLIDES.length - 1)),
    [],
  );
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // Slide 4 (index 3) auto-advances after 2 seconds
  useEffect(() => {
    if (index === 3) {
      const timer = setTimeout(next, 2000);
      return () => clearTimeout(timer);
    }
  }, [index, next]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        setLocation("/dashboard");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, setLocation]);

  const slide = SLIDES[index];
  const isFirst = index === 0;
  const isLast = index === SLIDES.length - 1;

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: C.bg }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 md:px-6 pt-4 md:pt-6 pb-2">
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-100 shrink-0"
          style={{ color: C.sage, opacity: 0.75 }}
        >
          <X size={16} />
          <span className="hidden md:inline">Close</span>
        </button>

        {/* Mobile: slim progress bar */}
        <div
          className="flex-1 h-0.5 rounded-full md:hidden"
          style={{ background: "rgba(200,212,192,0.15)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: C.sage }}
            animate={{
              width: `${((index + 1) / SLIDES.length) * 100}%`,
            }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        {/* Desktop: dot row */}
        <div className="hidden md:flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className="rounded-full transition-all"
              style={{
                width: i === index ? 20 : 6,
                height: 6,
                background:
                  i <= index ? C.sage : "rgba(200,212,192,0.2)",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <span
          className="text-xs tabular-nums shrink-0"
          style={{ color: C.sage, opacity: 0.6 }}
        >
          {index + 1} / {SLIDES.length}
        </span>
      </div>

      {/* Slide */}
      <div className="flex-1 flex items-center justify-center px-5 md:px-16 py-4 md:py-8 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            {renderSlide(slide)}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between px-5 md:px-8 pb-5 md:pb-8 pt-2">
        <button
          onClick={prev}
          disabled={isFirst}
          className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-0 disabled:pointer-events-none"
          style={{ color: C.sage }}
        >
          <ChevronLeft size={18} />
          Back
        </button>
        {isLast ? (
          <button
            onClick={() => setLocation("/dashboard")}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            Done
          </button>
        ) : (
          <button
            onClick={next}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            Next
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
