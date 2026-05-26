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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  // Time-of-day highlight. Anything before 14:00 reads as morning,
  // 14:00–20:00 reads as evening, 20:00+ reads as night (Compline's
  // window). Every option stays visible — the highlight just nudges
  // toward the time-appropriate one.
  const hour = new Date().getHours();
  const isMorning = hour < 14;
  const isNight = hour >= 20;
  const isEvening = !isMorning && !isNight;

  const morningOffice: CardSpec = {
    emoji: "🌅",
    title: t("offices.morning_prayer"),
    sub: t("offices.full_office_75"),
    href: "/bcp/daily-office?mode=morning",
    available: isMorning,
  };
  const morningDevotion: CardSpec = {
    emoji: "🌿",
    title: t("offices.morning_devotion"),
    sub: t("offices.short_form_137"),
    href: "/bcp/daily-devotions?mode=morning-devotion",
    available: isMorning,
  };
  const eveningOffice: CardSpec = {
    emoji: "🌙",
    title: t("offices.evening_prayer"),
    sub: t("offices.full_office_115"),
    href: "/bcp/daily-office?mode=evening",
    available: isEvening,
  };
  const eveningDevotion: CardSpec = {
    emoji: "🌆",
    title: t("offices.early_evening_devotion"),
    sub: t("offices.short_form_139"),
    href: "/bcp/daily-devotions?mode=early-evening-devotion",
    available: isEvening,
  };
  // Compline — the night office. Short, contemplative, BCP pp. 127-135.
  // Available-flag flips on after 8 PM; the card stays visible
  // anytime so a user can pray it earlier if they're heading to bed.
  const compline: CardSpec = {
    emoji: "🌌",
    title: t("offices.compline", { defaultValue: "Compline" }),
    sub: t("offices.compline_sub", { defaultValue: "The night office · BCP p. 127" }),
    href: "/bcp/daily-office?mode=compline",
    available: isNight,
  };

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4">
        <Link
          href="/dashboard"
          className="text-sm mb-3 inline-block"
          style={{ color: "#8FAF96" }}
        >
          {t("offices.back_home")}
        </Link>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {t("offices.title")}
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
          {t("offices.subtitle")}
        </p>

        <SectionLabel>{t("offices.in_the_morning")}</SectionLabel>
        <div className="space-y-6 mb-10">
          <OfficeOption spec={morningOffice} />
          <OfficeOption spec={morningDevotion} />
        </div>

        <SectionLabel>{t("offices.in_the_evening")}</SectionLabel>
        <div className="space-y-6 mb-10">
          <OfficeOption spec={eveningOffice} />
          <OfficeOption spec={eveningDevotion} />
        </div>

        <SectionLabel>{t("offices.at_night", { defaultValue: "At night" })}</SectionLabel>
        <div className="space-y-6 mb-12">
          <OfficeOption spec={compline} />
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
                  {t("offices.daily_reminders")}
                </p>
                <p
                  className="text-sm mt-0.5"
                  style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}
                >
                  {t("offices.daily_reminders_sub")}
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
  const { t } = useTranslation();
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
                {t("offices.available_now")}
              </p>
            )}
          </div>
          <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
        </div>
      </div>
    </Link>
  );
}
