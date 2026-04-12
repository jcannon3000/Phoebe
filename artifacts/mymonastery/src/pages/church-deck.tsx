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
  | { kind: "feature-text"; label: string; headline: string; body: string[] }
  | {
      kind: "feature-demo";
      variant:
        | "prayer-requests"
        | "bcp"
        | "prayer-list"
        | "lectio"
        | "meat-fast"
        | "calendar"
        | "involvement";
    }
  | {
      kind: "feature-combo";
      label: string;
      headline: string;
      body: string[];
      mock: "prayer-requests" | "bcp" | "prayer-list" | "lectio" | "meat-fast" | "calendar" | "involvement";
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

  // ── Feature 1: Prayer Requests ──
  // 5
  {
    kind: "feature-combo",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Prayer, held in common.",
    body: [
      "People share what they are carrying. Others in the community respond with a word or a prayer. Anonymous if needed. Low vulnerability. Low friction.",
      "The doorway into the life of the community. When someone submits a request during the week, they arrive on Sunday already known.",
    ],
    mock: "prayer-requests",
  },

  // ── Feature 2: BCP Intercessions ──
  // 6
  {
    kind: "feature-combo",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Group Intercessions from the BCP",
    body: [
      "The Book of Common Prayer gives us prayers for every season and circumstance. Phoebe puts them in the hands of the community.",
      "A group selects prayers to hold together \u2014 for the sick, for those in trouble, for the departed. Each person carries the same words through the week.",
      "Ancient prayers, held in common. The tradition made daily.",
    ],
    mock: "bcp",
  },

  // ── Feature 3: Prayer List ──
  // 7
  {
    kind: "feature-combo",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "A shared record of what the community is holding.",
    body: [
      "Every request, every intention, every name being carried in prayer \u2014 gathered in one place. The community can see what is being held together. They can add their prayer to what is already there.",
      "Intercession made visible. The invisible work of the community, given a surface.",
    ],
    mock: "prayer-list",
  },

  // ── Feature 4: Lectio Divina ──
  // 8
  {
    kind: "feature-combo",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Lectio Divina",
    body: [
      "The Sunday gospel, read together across the week.",
      "Monday \u2014 a word or phrase that is speaking to you.\nWednesday \u2014 what the passage is stirring in you.\nFriday \u2014 what it is calling you to do or to be.",
      "Each person reflects on their own. Then they see what everyone else heard in the same passage. They arrive on Sunday having already sat with the text together. The sermon lands differently.",
    ],
    mock: "lectio",
  },

  // ── Feature 5: Water Fast ──
  // 9
  {
    kind: "feature-combo",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "One fast with a visible impact.",
    body: [
      "For groups fasting from meat, University of Colorado research shows that one person fasting for one day saves an estimated 400 gallons of water. Phoebe tracks what the group saves together.",
      "This week. This month. All time.",
      "A small act of shared faithfulness. A visible record of what the community has done together. A new way to engage the parish in creation care, together.",
    ],
    mock: "meat-fast",
  },

  // 15 — What this builds
  {
    kind: "statement",
    headline: "Each practice feeds the next.",
    body: [
      "The prayer request submitted on Wednesday breaks the ice on Sunday. The Lectio reflection written on Friday deepens the sermon conversation. The fast held together on Thursday is still being felt when the group gathers. The name prayed for on Tuesday is the person who feels seen when they walk through the door.",
      "Over time the touchpoints between Sundays become the fabric of community life.",
    ],
  },

  // 16 — The community stays alive
  {
    kind: "statement",
    headline: "The community stays alive between Sundays.",
    body: [
      "Every practice is a touchpoint. A reminder that you belong to something. That people are praying for you by name. That someone fasted alongside you this week. That a passage was read and you were part of that reading.",
      "People do not drift from communities they are thinking about. Phoebe keeps the community present in the small moments of the week.",
    ],
  },

  // 17 — Parish Calendar (text + mock on one slide)
  {
    kind: "feature-combo",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "What is already happening, in front of the people most likely to come.",
    body: [
      "The parish is already running events. The person who prayed on Wednesday and fasted on Friday is the most likely person to come to Thursday evening\u2019s talk. They just need to see it.",
    ],
    mock: "calendar",
  },

  // 18 — Getting Involved (text + mock on one slide)
  {
    kind: "feature-combo",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "A natural next step.",
    body: [
      "When someone has been praying with a group for six weeks they are no longer a stranger. They are ready to go deeper. Phoebe surfaces the ways to do that \u2014 low barrier, low pressure, already in front of them.",
    ],
    mock: "involvement",
  },

  // 19 — Closing
  {
    kind: "closing",
    body: [
      "The strongest parishes are not the ones with the most programs. They are the ones where people know each other.",
      "Relationships are built through shared points of connection. A prayer held in common. A passage read together. A fast observed alongside someone else. A name carried through the week.",
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

function FeatureTextSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "feature-text" }>;
}) {
  return (
    <div className="max-w-3xl mx-auto w-full">
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
  );
}

// ─── Mock UI components ─────────────────────────────────────────────────────

function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[28px] md:rounded-[32px] p-4 md:p-5 mx-auto w-full max-w-[320px] md:max-w-[380px]"
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

/* ── Prayer Requests (the input + list view) ── */
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
          className="text-[14px] font-semibold"
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
          className="flex-1 text-[12px] px-3 py-2.5 rounded-xl"
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
          className="px-3 py-2.5 rounded-xl text-[12px]"
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
            <div className="flex-1 p-3 pl-2.5">
              <p
                className="text-[9px] font-medium uppercase tracking-widest mb-0.5"
                style={{ color: "rgba(200,212,192,0.45)" }}
              >
                From {r.from}
              </p>
              <p
                className="text-[12px] leading-relaxed mb-1"
                style={{ color: C.text, fontFamily: C.font }}
              >
                {r.body}
              </p>
              <p
                className="text-[10px]"
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

/* ── BCP Intercessions — prayer mode slideshow view ── */
function BCPPrayerModeMock() {
  return (
    <MockPhone>
      <div className="flex flex-col items-center text-center gap-4">
        <p
          className="text-[9px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Group Intercession
        </p>
        <p
          className="text-[16px] leading-[1.5] font-medium italic"
          style={{
            color: "#E8E4D8",
            fontFamily: "'Playfair Display', Georgia, serif",
          }}
        >
          For Margaret&apos;s mother, as she begins treatment this week.
        </p>
        <p className="text-[12px]" style={{ color: C.sage }}>
          with David, Anna, James
        </p>
        <p
          className="text-[11px] italic"
          style={{ color: "rgba(143,175,150,0.55)" }}
        >
          Your community is holding this. 🙏🏽
        </p>
        <div
          className="w-full rounded-xl px-4 py-4 text-left"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          <p
            className="text-[12px] italic leading-[1.75]"
            style={{ color: "#C8D4C0", fontFamily: "Georgia, serif" }}
          >
            O Father of mercies and God of all comfort, our only help in time of
            need: Look down from heaven, we humbly beseech thee, behold, visit
            and relieve thy sick servant, for whom our prayers are desired...
          </p>
          <p
            className="text-[9px] uppercase tracking-widest mt-3"
            style={{ color: "rgba(143,175,150,0.35)" }}
          >
            For the Sick &middot; BCP p. 458
          </p>
        </div>
        <div
          className="px-6 py-2.5 rounded-full text-[13px] font-medium"
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

/* ── Prayer List — the prayer list page view ── */
function PrayerListMock() {
  const items = [
    {
      name: "Margaret\u2019s mother",
      body: "Beginning treatment this week",
      held: "4 people praying",
      days: "5d left",
    },
    {
      name: "David\u2019s discernment",
      body: "About the new role",
      held: "6 people praying",
      days: "2d left",
    },
    {
      name: "Peace in a difficult season",
      body: "Anonymous request",
      held: "3 people praying",
      days: "4d left",
    },
    {
      name: "Sarah\u2019s recovery",
      body: "After surgery last week",
      held: "5 people praying",
      days: "1d left",
    },
  ];
  return (
    <MockPhone>
      <h2
        className="text-base font-bold mb-0.5"
        style={{ color: C.text, fontFamily: C.font }}
      >
        🕯️ Prayer List
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
            <div className="flex-1 p-2.5 pl-2.5">
              <div className="flex justify-between items-baseline">
                <p
                  className="text-[12px] font-medium"
                  style={{ color: C.text, fontFamily: C.font }}
                >
                  {item.name}
                </p>
                <p
                  className="text-[9px]"
                  style={{ color: "rgba(143,175,150,0.4)" }}
                >
                  {item.days}
                </p>
              </div>
              <p
                className="text-[10px] mt-0.5"
                style={{ color: "rgba(143,175,150,0.6)" }}
              >
                {item.body}
              </p>
              <p
                className="text-[9px] mt-0.5"
                style={{ color: "rgba(143,175,150,0.7)" }}
              >
                🌿 {item.held}
              </p>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

/* ── Lectio Divina — three-stage view with scripture ── */
function LectioMock() {
  const stages = [
    { day: "Mon", label: "A word or phrase", done: true },
    { day: "Wed", label: "What it stirs in you", done: true },
    { day: "Fri", label: "What it calls you to", done: false },
  ];
  return (
    <MockPhone>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-1"
        style={{ color: "rgba(200,212,192,0.5)" }}
      >
        Lectio Divina
      </p>
      <h2
        className="text-base font-semibold mb-1"
        style={{ color: C.text, fontFamily: C.font }}
      >
        📜 John 20:19-31
      </h2>
      <p className="text-[11px] mb-4" style={{ color: C.sage }}>
        Third Sunday of Easter
      </p>
      <div className="space-y-2 mb-4">
        {stages.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
            style={{
              background: s.done
                ? "rgba(46,107,64,0.18)"
                : "rgba(46,107,64,0.06)",
              border: `1px solid ${s.done ? "rgba(46,107,64,0.3)" : "rgba(46,107,64,0.12)"}`,
            }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
              style={{
                background: s.done ? "#2E6B40" : "transparent",
                border: s.done ? "none" : "1px solid rgba(143,175,150,0.3)",
                color: s.done ? C.text : C.sage,
              }}
            >
              {s.done ? "\u2713" : ""}
            </div>
            <div>
              <p
                className="text-[11px] font-semibold"
                style={{
                  color: s.done ? C.text : C.sage,
                  fontFamily: C.font,
                }}
              >
                {s.day}
              </p>
              <p
                className="text-[10px]"
                style={{ color: "rgba(143,175,150,0.6)" }}
              >
                {s.label}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background: "rgba(46,107,64,0.12)",
          border: "1px solid rgba(46,107,64,0.15)",
        }}
      >
        <p
          className="text-[11px] italic leading-[1.6]"
          style={{ color: "#C8D4C0", fontFamily: "Georgia, serif" }}
        >
          &ldquo;Peace be with you. As the Father has sent me, even so I am
          sending you.&rdquo;
        </p>
        <p
          className="text-[9px] mt-1.5"
          style={{ color: "rgba(143,175,150,0.4)" }}
        >
          John 20:21 &middot; RSV
        </p>
      </div>
    </MockPhone>
  );
}

/* ── Water Fast / Meat Fast ── */
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
        className="text-[9px] text-center italic"
        style={{ color: "rgba(143,175,150,0.35)" }}
      >
        University of Colorado research
      </p>
    </MockPhone>
  );
}

/* ── Parish Calendar ── */
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

/* ── Getting More Involved ── */
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
  "prayer-requests": PrayerRequestsMock,
  bcp: BCPPrayerModeMock,
  "prayer-list": PrayerListMock,
  lectio: LectioMock,
  "meat-fast": MeatFastMock,
  calendar: CalendarMock,
  involvement: InvolvementMock,
};

function FeatureDemoSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "feature-demo" }>;
}) {
  const Mock = MOCK_MAP[slide.variant];
  return (
    <div className="flex items-center justify-center w-full">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05, duration: 0.4 }}
      >
        {Mock ? <Mock /> : null}
      </motion.div>
    </div>
  );
}

function FeatureComboSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "feature-combo" }>;
}) {
  const Mock = MOCK_MAP[slide.mock];
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-center w-full max-w-5xl mx-auto gap-8 md:gap-16">
      {/* Text — left on desktop, full-width on mobile */}
      <div className="w-full md:max-w-md shrink-0">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          {slide.label}
        </p>
        <h2
          className="text-2xl md:text-3xl font-semibold mb-4 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.headline}
        </h2>
        <div className="space-y-3 md:space-y-4">
          {slide.body.map((p, i) => (
            <p
              key={i}
              className="text-sm md:text-base leading-relaxed font-light"
              style={{ color: C.sage, fontFamily: C.font, whiteSpace: "pre-line" }}
            >
              {p}
            </p>
          ))}
        </div>
      </div>
      {/* Mock — right on desktop, below on mobile */}
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.12, duration: 0.45 }}
        className="w-full md:w-auto flex justify-center shrink-0"
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
    case "feature-text":
      return <FeatureTextSlide slide={slide} />;
    case "feature-demo":
      return <FeatureDemoSlide slide={slide} />;
    case "feature-combo":
      return <FeatureComboSlide slide={slide} />;
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
