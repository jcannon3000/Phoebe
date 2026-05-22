// /offices — unified picker for all daily-prayer entry points.
//
// One screen, four cards (Morning Prayer, Morning Devotion,
// Evening Prayer, Early Evening Devotion), plus a "Daily reminders"
// link to /settings where the OfficeReminderSettings card lets the
// user pick the daily push (none / office / devotion + time) for
// each side. Reachable from the home dashboard via the "View" pill
// on PrayerOfficeCard, and also linked from Settings if the user
// wants to discover all the options without going through the home.

import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";

type CardSpec = {
  emoji: string;
  title: string;
  sub: string;
  href: string;
  /** True when the current local hour makes this option "available now"
   *  in the time-of-day sense. Drives the highlighted background +
   *  little "Available now" tag, mirroring the Daily Devotions picker. */
  available: boolean;
};

export default function OfficesPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  // Time-of-day highlight. Anything before 14:00 reads as morning,
  // anything after as evening. Both sides keep both options visible —
  // the highlight just nudges toward the time-appropriate one.
  const hour = new Date().getHours();
  const isMorning = hour < 14;

  const morningOffice: CardSpec = {
    emoji: "🌅",
    title: "Morning Prayer",
    sub: "Full Daily Office · BCP p. 75",
    href: "/bcp/daily-office?mode=morning",
    available: isMorning,
  };
  const morningDevotion: CardSpec = {
    emoji: "🌿",
    title: "Morning Devotion",
    sub: "Short form · BCP p. 137",
    href: "/bcp/daily-devotions?mode=morning-devotion",
    available: isMorning,
  };
  const eveningOffice: CardSpec = {
    emoji: "🌙",
    title: "Evening Prayer",
    sub: "Full Daily Office · BCP p. 115",
    href: "/bcp/daily-office?mode=evening",
    available: !isMorning,
  };
  const eveningDevotion: CardSpec = {
    emoji: "🌆",
    title: "Early Evening Devotion",
    sub: "Short form · BCP p. 139",
    href: "/bcp/daily-devotions?mode=early-evening-devotion",
    available: !isMorning,
  };

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4">
        <Link
          href="/dashboard"
          className="text-sm mb-3 inline-block"
          style={{ color: "#8FAF96" }}
        >
          ← Home
        </Link>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Daily Prayer
        </h1>
        <p className="text-sm mb-3" style={{ color: "#8FAF96" }}>
          The 1979 Book of Common Prayer, full and short forms.
        </p>

        {/* Entry into a brief teaching slideshow on the Daily Office —
            stabilitas, prayer-as-consent, what the Office is for. Sits
            right under the page description so it reads as the natural
            "wait, what is this?" follow-up for someone new. */}
        <Link
          href="/offices/how-to-pray"
          className="inline-flex items-center self-start px-3 py-1.5 mb-6 rounded-full text-[12px] font-medium transition-opacity hover:opacity-85"
          style={{
            background: "rgba(46,107,64,0.18)",
            border: "1px solid rgba(46,107,64,0.35)",
            color: "#C8D4C0",
          }}
        >
          📖 How to pray these →
        </Link>

        <SectionLabel>In the morning</SectionLabel>
        <div className="space-y-4 mb-8">
          <OfficeOption spec={morningOffice} />
          <OfficeOption spec={morningDevotion} />
        </div>

        <SectionLabel>In the evening</SectionLabel>
        <div className="space-y-4 mb-10">
          <OfficeOption spec={eveningOffice} />
          <OfficeOption spec={eveningDevotion} />
        </div>

        {/* Reminders entry point. The actual pickers live on /settings
            so we don't fork the source of truth — this is just a
            discoverable doorway from the offices page. */}
        <Link href="/settings">
          <div
            className="rounded-xl px-5 py-4 cursor-pointer transition-opacity hover:opacity-90"
            style={{
              background: "rgba(46,107,64,0.08)",
              border: "1px solid rgba(46,107,64,0.20)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p
                  className="text-base font-semibold"
                  style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}
                >
                  🔔 Daily reminders
                </p>
                <p
                  className="text-sm mt-0.5"
                  style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}
                >
                  Pick a morning + evening reminder time.
                </p>
              </div>
              <span style={{ color: "#8FAF96" }}>→</span>
            </div>
          </div>
        </Link>
      </div>
    </Layout>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-widest mb-2"
      style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}
    >
      {children}
    </p>
  );
}

function OfficeOption({ spec }: { spec: CardSpec }) {
  return (
    <Link href={spec.href}>
      <div
        className="w-full text-left p-4 rounded-2xl transition-all hover:shadow-md active:scale-[0.99] cursor-pointer"
        style={{
          background: spec.available ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
          border: `1px solid ${spec.available ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.18)"}`,
        }}
      >
        <div className="flex items-center gap-4">
          <span className="text-3xl">{spec.emoji}</span>
          <div className="flex-1 min-w-0">
            <p
              className="font-semibold text-base"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {spec.title}
            </p>
            <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
              {spec.sub}
            </p>
            {spec.available && (
              <p className="text-xs mt-1.5 font-medium" style={{ color: "#6FAF85" }}>
                Available now
              </p>
            )}
          </div>
          <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
        </div>
      </div>
    </Link>
  );
}
