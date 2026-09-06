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
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { MenuHub, type MenuHubGroup, type MenuHubItem, type MenuHubAction } from "@/components/MenuHub";
import { isNativeShell } from "@/lib/isNativeShell";
import { openExternal } from "@/lib/openExternal";
import { isOnline } from "@/lib/offline";

const NCMP_LIVE_URL = "https://www.youtube.com/@WashingtonNationalCathedral/live";

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
  const { rawIsBeta } = useBetaStatus();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    /**
     * OFFLINE IS NOT SIGNED OUT (owner, 2026-09-06: "Morning Prayer is not
     * loading offline at all — it would load before").
     *
     * /api/auth/me cannot be answered without a connection, so the query
     * resolves to null and this gate read that as "no account" and sent the
     * person home — every saved office, psalm and prayer became unreachable
     * the moment they lost signal, which is the opposite of what the offline
     * layer is for. A failed ask is not an answer: while offline, stay put and
     * let the page paint from what is saved.
     */
    if (isOnline() && !isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  /**
   * OFFLINE STILL RENDERS (owner, 2026-09-06: "there is no reason why those
   * should not at least have the BCP content"). The prayer book is bundled
   * with the app and the day's deck is saved ahead, so a page that cannot ask
   * /auth/me must still paint — blanking it made every office, psalm and
   * collect a white screen the moment the signal dropped.
   */
  if (isOnline() && (isLoading || !user)) return null;

  // Time-of-day highlight. Anything before 14:00 reads as morning,
  // 14:00–20:00 reads as evening, 20:00+ reads as night (Compline's
  // window). Every option stays visible — the highlight just nudges
  // toward the time-appropriate one.
  const hour = new Date().getHours();
  const isMorning = hour < 14;
  const isNight = hour >= 20;
  const isEvening = !isMorning && !isNight;
  // The National Cathedral only broadcasts Morning Prayer Mon–Fri, so the
  // "Watch" option is hidden on weekends (nothing to watch live).
  const weekday = (() => { const d = new Date().getDay(); return d >= 1 && d <= 5; })();

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
  // Praying the Psalms — leads each section: the day's appointed psalms for that
  // office, from the daily-office lectionary (cycle=office), as a slideshow.
  const morningPsalms: CardSpec = {
    emoji: "📜",
    title: t("offices.morning_psalms", { defaultValue: "Morning Psalms" }),
    sub: t("offices.psalms_sub", { defaultValue: "The day's appointed psalms" }),
    href: "/psalms?office=morning&cycle=office&begin=1",
    available: isMorning,
  };
  const eveningPsalms: CardSpec = {
    emoji: "📜",
    title: t("offices.evening_psalms", { defaultValue: "Evening Psalms" }),
    sub: t("offices.psalms_sub", { defaultValue: "The day's appointed psalms" }),
    href: "/psalms?office=evening&cycle=office&begin=1",
    available: isEvening,
  };

  // Every card, expressed as MenuHub groups — the same "list of cards" page
  // language /menu and every category page under it use, rather than this
  // page's own hand-rolled card + section styling (owner: make it look like a
  // menu). The alternate formats (listen / watch) ride each item's `actions`
  // pills, and "Available now" becomes the card badge.
  const nowBadge = t("offices.available_now");
  const item = (spec: CardSpec, actions?: MenuHubAction[]): MenuHubItem => ({
    emoji: spec.emoji,
    label: spec.title,
    sub: spec.sub,
    ...(spec.available ? { badge: nowBadge } : { muted: true }),
    ...(actions && actions.length > 0 ? { actions } : {}),
    onClick: () => setLocation(spec.href),
  });

  const groups: MenuHubGroup[] = [
    {
      header: t("offices.in_the_morning"),
      items: [
        // Psalms first — the appointed psalms for the day.
        item(morningPsalms),
        // Alternate ways to pray Morning Prayer — listen to Forward Movement's
        // audio office, or watch the National Cathedral's live broadcast. Both
        // log the morning office toward the rhythm grid + streak, same as
        // reading it.
        item(morningOffice, [
          { variant: "gold", emoji: "🎧", label: t("offices.listen_forward", { defaultValue: "Listen · Forward" }), onClick: () => setLocation("/podcast/morning-office") },
          // Only Mon–Fri — the Cathedral doesn't broadcast on weekends.
          ...(weekday ? [{
            variant: "purple" as const,
            emoji: "📺",
            label: t("offices.watch_ncmp", { defaultValue: "Watch · Nat'l Cathedral" }),
            onClick: isNativeShell() ? () => openExternal(NCMP_LIVE_URL) : () => setLocation("/ncmp/watch"),
          }] : []),
        ]),
        // Watch St. John's Cathedral's daily "Morning Devotion with Dean Kate"
        // — a video devotion that logs the morning office, same as reading it.
        // Weekday-only, like the broadcast.
        item(morningDevotion, weekday ? [
          { variant: "green", emoji: "📺", label: t("offices.watch_devotion", { defaultValue: "Watch · St. John's" }), onClick: () => setLocation("/devotion/watch") },
        ] : []),
      ],
    },
    {
      header: t("offices.in_the_evening"),
      items: [
        item(eveningPsalms),
        item(eveningOffice, [
          { variant: "gold", emoji: "🎧", label: t("offices.listen_forward", { defaultValue: "Listen · Forward" }), onClick: () => setLocation("/podcast/evening-office") },
        ]),
        item(eveningDevotion),
      ],
    },
    // Compline — beta-only while the rotation + inline-lesson rendering get
    // road-tested. Non-beta users see no third "At night" section.
    ...(rawIsBeta ? [{
      header: t("offices.at_night", { defaultValue: "At night" }),
      items: [item(compline)],
    }] : []),
    {
      // Reminders entry point. The actual pickers live on /settings so we don't
      // fork the source of truth — this is just a discoverable doorway.
      items: [{
        emoji: "🔔",
        label: t("offices.daily_reminders"),
        sub: t("offices.daily_reminders_sub"),
        onClick: () => setLocation("/settings"),
      }],
    },
  ];

  return (
    <MenuHub
      title={t("offices.title")}
      subtitle={t("offices.subtitle")}
      backLabel={t("offices.back_home")}
      backHref="/dashboard"
      groups={groups}
    />
  );
}
