import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { PracticeCard, PUBLICATION_NAME, REFLECTION_EMOJI } from "@/components/DailyProgressBody";
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
 * /menu/newsletters — every newsletter, in two sections, as home cards.
 *
 * Owner (2026-09-04): "change the menu title to newsletters … break it down
 * into two sections … that says subscriptions and all, just like Next and
 * Done. Anyone that's subscribed shows up in Subscriptions, all the other
 * ones [in All], and show our cards like they're on the home screen, and
 * somewhere on the page, like the top right, Manage subscriptions."
 *
 * CONSISTENT WITH THE OTHER UIS (owner): the page chrome is MenuHub's — the
 * same back link, title and subtitle the Practices and Daily Offices pages
 * draw — and the rows are the home's own PracticeCard, not an imitation, with
 * the home's section headings above them. "Followed" is read from
 * useRhythmState, the ONE computation the home cards, the header dots and the
 * widget already share, so a newsletter can't be in Subscriptions here and
 * missing from the home (or the reverse).
 *
 * Daily sources open today's issue the way their home cards do (the reader,
 * or the Dean's in-app slideshow); weekly sources (Taizé, Andrew's Version —
 * the inbox pattern) open their newest issue and mark it read, which clears
 * the home card too. Andrew's Version is still super-admin-only, the same
 * gate useRhythmState applies to its card.
 */
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const REFLECT_RGB = "96,141,209";

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
  const taizeQ = useQuery<InboxItem | null>(latestOpts("/api/taize/latest", true));
  const andrewsQ = useQuery<InboxItem | null>(latestOpts("/api/andrews/latest", !!user?.isSuperAdmin));
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
  const subscribed = entries.filter((e) => e.followed);
  const others = entries.filter((e) => !e.followed);

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
  const card = (e: Entry) => (
    <PracticeCard
      key={e.key}
      emoji={e.emoji}
      title={e.title}
      blurb={blurbFor(e)}
      cta={t("rhythm.read", { defaultValue: "Read" })}
      done={e.done}
      doneCta={t("rhythm.read", { defaultValue: "Read" })}
      rgb={REFLECT_RGB}
      onClick={e.open}
      onOpen={e.open}
      pulseOnLoad={false}
    />
  );
  const manage = () => setLocation(isDeviceLocalGuest(user) ? "/customize" : "/rule-of-life");

  return (
    <Layout bgPhoto={bgPhoto}>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
        <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", color: WARM, fontFamily: FONT, paddingBottom: 48 }}>
          <button
            type="button"
            onClick={() => setLocation("/menu")}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            ← {t("menu.title", { defaultValue: "Menu" })}
          </button>

          {/* Title row — MenuHub's h1, with the one thing this page adds: the
              Manage link at the top right (owner: "somewhere on the page, like
              the top right, manage subscriptions"). */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
              {t("menu.newsletters", { defaultValue: "Newsletters" })} 🌅
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
            {t("menu.newsletters_sub", { defaultValue: "Daily words and weekly letters, from across the church." })}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div>
              {sectionHeader(t("newsletters.subscriptions", { defaultValue: "Subscriptions" }))}
              {subscribed.length > 0 ? (
                <div className="flex flex-col gap-2">{subscribed.map(card)}</div>
              ) : (
                <p style={{ fontSize: 14, color: SAGE, margin: "6px 0 0", lineHeight: 1.5 }}>
                  {t("newsletters.none_yet", { defaultValue: "You're not following any yet. Pick some in Manage subscriptions and they'll have a card on your home." })}
                </p>
              )}
            </div>
            {others.length > 0 && (
              <div>
                {sectionHeader(t("newsletters.all", { defaultValue: "All" }))}
                <div className="flex flex-col gap-2">{others.map(card)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
