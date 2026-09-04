import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { MenuHub } from "@/components/MenuHub";
import { PracticeCard, PUBLICATION_NAME, REFLECTION_EMOJI, rhythmGradientRgb } from "@/components/DailyProgressBody";
import { TRACKED_REFLECTION_SOURCES } from "@/lib/officePrefs";
import { useRhythmState } from "@/hooks/useRhythmState";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { openExternal, openExternalThenMarkRead } from "@/lib/openExternal";
import { apiRequest } from "@/lib/queryClient";
import { markInboxRead, type InboxItem, type InboxSource } from "@/lib/taizeInbox";
import {
  reflectionSourceUrl,
  markCacRead, markFddRead, markSsjeRead, markVtsRead,
  markNouwenRead, markSojoRead, markGristRead,
} from "@/lib/cacReadState";
import type { TrackedReflection } from "@/lib/cacReadState";

/**
 * /menu/newsletters — the newsletters: Daily or Weekly first, then, inside
 * each, Subscriptions and All as home cards.
 *
 * Owner (2026-09-04), in order: "split those into two categories … daily and
 * [weekly] … change the menu title to newsletters … you click on that, you
 * have two options" — then "break it down into two sections … subscriptions
 * and all, just like Next and Done … show our cards like they're on the home
 * screen, and … top right, manage subscriptions" — then "I wanted the split
 * between daily and weekly first." So: /menu/newsletters is the hub with two
 * rows (MenuHub, the same page shape as Practices); /menu/newsletters/daily
 * and /weekly are the lists, each with the home's Subscriptions/All sections
 * (owner: "make sure you build all this consistent with other UIs").
 *
 * The rows are the home's own PracticeCard, and "followed"/"done" come from
 * useRhythmState — the ONE computation the home cards, header dots and widget
 * share — so a newsletter can't be followed here and absent there. Which
 * sources exist comes from TRACKED_REFLECTION_SOURCES and the inbox sources;
 * names and emoji from the home card's maps. Daily sources open today's
 * issue as their cards do; weekly ones (Taizé, Andrew's Version — the inbox
 * pattern) open the newest issue and mark it read through lib/taizeInbox, so
 * card and page agree. Andrew's is super-admin-only, the card's own gate.
 */
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type DailySource = TrackedReflection;
type Entry = {
  key: string;
  emoji: string;
  title: string;
  /** "Daily · publisher" / "Weekly · publisher" — the cadence the owner asked
   *  to be visible, carried in the sub-line rather than as a third section. */
  publisher: string;
  cadence: "daily" | "weekly";
  followed: boolean;
  done: boolean;
  /** The newest issue's title, for the weekly rows. */
  latestTitle?: string | null;
  open: () => void;
};

/**
 * NOT a second list of sources (eleanor-e7's point): which newsletters exist
 * comes from TRACKED_REFLECTION_SOURCES, and their names and emoji from the
 * home card's own maps, so a source added to the rhythm can't be missing here
 * and a rename can't leave the two disagreeing. Only the publisher line —
 * decoration this page adds under the name — lives here.
 */
const PUBLISHER: Record<DailySource, string> = {
  cac: "Center for Action & Contemplation",
  sojo: "Sojourners",
  fdd: "Forward Movement",
  ssje: "Society of St. John the Evangelist",
  nouwen: "Henri Nouwen Society",
  grist: "The day's climate reporting",
  vts: "Virginia Theological Seminary · weekdays",
};
const DAILY = TRACKED_REFLECTION_SOURCES.map((source) => ({
  source, emoji: REFLECTION_EMOJI[source], title: PUBLICATION_NAME[source], publisher: PUBLISHER[source],
}));
const MARK_READ: Record<DailySource, () => void> = {
  cac: markCacRead, fdd: markFddRead, ssje: markSsjeRead, vts: markVtsRead,
  nouwen: markNouwenRead, sojo: markSojoRead, grist: markGristRead,
};

export default function MenuNewslettersPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [, params] = useRoute<{ group?: string }>("/menu/newsletters/:group");
  const group: "daily" | "weekly" | null = params?.group === "daily" ? "daily" : params?.group === "weekly" ? "weekly" : null;
  const rs = useRhythmState();
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // Newest issue of each weekly source, for its card's sub-line. The home
  // already knows these for FOLLOWED sources (rs.taizeLatest / andrewsLatest);
  // the queries here cover the unfollowed ones in "All" as well.
  const latestOpts = (path: string, enabled: boolean) => ({
    queryKey: [path],
    queryFn: async () => ((await apiRequest("GET", path)) ?? null) as InboxItem | null,
    staleTime: 30 * 60_000,
    enabled,
  });
  const taizeQ = useQuery<InboxItem | null>(latestOpts("/api/taize/latest", group === "weekly"));
  const andrewsQ = useQuery<InboxItem | null>(latestOpts("/api/andrews/latest", group === "weekly" && !!user?.isSuperAdmin));
  const taizeLatest = rs.taizeLatest ?? taizeQ.data ?? null;
  const andrewsLatest = rs.andrewsLatest ?? andrewsQ.data ?? null;

  // Taizé opens in the reader as its home card does; Andrew's Version opens
  // the Substack page as they built it (owner: no reader on that one), so
  // both match their cards exactly.
  const openWeekly = (source: InboxSource, item: InboxItem | null, fallbackUrl: string, reader: boolean) => () => {
    const opts = reader ? { reader: true } : undefined;
    if (!item?.url) { openExternal(fallbackUrl, opts); return; }
    openExternalThenMarkRead(item.url, () => markInboxRead(source, item.id), opts);
  };

  const entries: Entry[] = [
    ...DAILY.map((d): Entry => {
      const r = rs.reflections.find((x) => x.source === d.source);
      return {
        key: d.source, emoji: d.emoji, title: d.title, publisher: d.publisher, cadence: "daily",
        followed: !!r, done: !!r?.done,
        open: () => {
          MARK_READ[d.source]();
          if (d.source === "vts") { setLocation("/vts-reading"); return; }
          openExternal(reflectionSourceUrl(d.source), { reader: true });
        },
      };
    }),
    {
      key: "taize", emoji: "🕯️", title: "Taizé meditation", publisher: "Taizé", cadence: "weekly",
      followed: rs.taizeActive, done: rs.taizeDone, latestTitle: taizeLatest?.title,
      open: openWeekly("taize", taizeLatest, "https://www.taize.fr/en/tag/meditations", true),
    },
    ...(user?.isSuperAdmin ? [{
      key: "andrews", emoji: "📰", title: "Andrew's Version", publisher: "Andrew McGowan · Yale", cadence: "weekly" as const,
      followed: rs.andrewsActive, done: rs.andrewsDone, latestTitle: andrewsLatest?.title,
      open: openWeekly("andrews", andrewsLatest, andrewsLatest?.url ?? "https://andrewmcgowan.substack.com/", false),
    } satisfies Entry] : []),
  ];
  const inGroup = entries.filter((e) => e.cadence === group);
  const subscribed = inGroup.filter((e) => e.followed);
  const others = inGroup.filter((e) => !e.followed);

  const cadenceWord = (c: Entry["cadence"]) =>
    c === "daily" ? t("newsletters.daily", { defaultValue: "Daily" }) : t("newsletters.weekly", { defaultValue: "Weekly" });
  const blurbFor = (e: Entry) => {
    const lead = e.latestTitle ? e.latestTitle : e.publisher;
    return `${cadenceWord(e.cadence)} · ${lead}`;
  };

  // The home's own section heading (DailyProgressBody.sectionHeader), copied
  // rather than imported because it closes over that component's state.
  const sectionHeader = (label: string) => (
    <div className="flex items-center gap-3 mb-2">
      <h3 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>{label}</h3>
      <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
    </div>
  );
  // The home's palette, not a source colour: the home recolours every card
  // along its green→purple gradient by position (rhythmGradientRgb), and the
  // reflection cards' own blue never reaches the screen there — so it mustn't
  // here either (owner: "I never asked for blue UI, just green").
  const card = (e: Entry, i: number, n: number) => (
    <PracticeCard
      key={e.key}
      emoji={e.emoji}
      title={e.title}
      blurb={blurbFor(e)}
      cta={t("rhythm.read", { defaultValue: "Read" })}
      done={e.done}
      doneCta={t("rhythm.read", { defaultValue: "Read" })}
      rgb={rhythmGradientRgb(i, n)}
      onClick={e.open}
      onOpen={e.open}
      pulseOnLoad={false}
    />
  );
  const manage = () => setLocation(isDeviceLocalGuest(user) ? "/customize" : "/rule-of-life");

  if (group === null) {
    return (
      <MenuHub
        title={t("menu.newsletters", { defaultValue: "Newsletters" })}
        emoji="🌅"
        subtitle={t("menu.newsletters_sub_long", { defaultValue: "Daily words and weekly letters, from across the church." })}
        backLabel={t("menu.title", { defaultValue: "Menu" })}
        backHref="/menu"
        groups={[{
          items: [
            {
              emoji: "☀️", label: t("newsletters.daily", { defaultValue: "Daily" }),
              sub: entries.filter((e) => e.cadence === "daily").map((e) => e.title).join(", "),
              onClick: () => setLocation("/menu/newsletters/daily"),
            },
            {
              emoji: "🗓️", label: t("newsletters.weekly", { defaultValue: "Weekly" }),
              sub: entries.filter((e) => e.cadence === "weekly").map((e) => e.title).join(", "),
              onClick: () => setLocation("/menu/newsletters/weekly"),
            },
          ],
        }]}
      />
    );
  }

  const groupLabel = cadenceWord(group);
  return (
    <Layout bgPhoto={bgPhoto}>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
        <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", color: WARM, fontFamily: FONT, paddingBottom: 48 }}>
          <button
            type="button"
            onClick={() => setLocation("/menu/newsletters")}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            ← {t("menu.newsletters", { defaultValue: "Newsletters" })}
          </button>

          {/* Title row — MenuHub's h1, with the one thing this page adds: the
              Manage link at the top right (owner: "somewhere on the page, like
              the top right, manage subscriptions"). */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
              {groupLabel} {group === "daily" ? "☀️" : "🗓️"}
            </h1>
            <button
              type="button"
              onClick={manage}
              style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, whiteSpace: "nowrap", textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              {t("newsletters.manage", { defaultValue: "Manage subscriptions" })}
            </button>
          </div>
          <p style={{ fontSize: 14, color: SAGE, margin: "0 0 20px", lineHeight: 1.5 }}>
            {group === "daily"
              ? t("newsletters.daily_sub", { defaultValue: "A word for today, from across the church." })
              : t("newsletters.weekly_sub", { defaultValue: "The newest issue waits until you've read it." })}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div>
              {sectionHeader(t("newsletters.subscriptions", { defaultValue: "Subscriptions" }))}
              {subscribed.length > 0 ? (
                <div className="flex flex-col gap-2">{subscribed.map((e, i) => card(e, i, subscribed.length))}</div>
              ) : (
                <p style={{ fontSize: 14, color: SAGE, margin: "6px 0 0", lineHeight: 1.5 }}>
                  {t("newsletters.none_yet", { defaultValue: "You're not following any yet. Pick some in Manage subscriptions and they'll have a card on your home." })}
                </p>
              )}
            </div>
            {others.length > 0 && (
              <div>
                {sectionHeader(t("newsletters.all", { defaultValue: "All" }))}
                <div className="flex flex-col gap-2">{others.map((e, i) => card(e, i, others.length))}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
