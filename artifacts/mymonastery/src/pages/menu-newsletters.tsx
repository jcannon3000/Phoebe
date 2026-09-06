import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { MenuHub } from "@/components/MenuHub";
import { ToggleRow } from "@/components/ToggleRow";
import { useQueryClient } from "@tanstack/react-query";
import { addHomeCard, applyCachedHomeLayout, readCachedHomeLayout, saveHomeLayout, cacheHomeLayoutLocalOnly, isHomeCardOn, HOME_LAYOUT_VERSION, type HomeLayout } from "@/lib/homeLayoutCache";
import { PracticeCard, PUBLICATION_NAME, REFLECTION_EMOJI, rhythmGradientRgb } from "@/components/DailyProgressBody";
import { TRACKED_REFLECTION_SOURCES } from "@/lib/officePrefs";
import { useRhythmState } from "@/hooks/useRhythmState";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { openExternal, openExternalThenMarkRead } from "@/lib/openExternal";
import { apiRequest } from "@/lib/queryClient";
import { markInboxRead, type InboxItem, type InboxSource } from "@/lib/taizeInbox";
import { usePreviousIssues, usePreviousIssuesFor } from "@/hooks/usePreviousIssues";
import { useWeeklies, useWeeklyLatest, useSetWeeklySubscription, weeklySourceId } from "@/lib/weeklies";
import { useAndrewsVisible } from "@/lib/appSettings";
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
  /** What the publication IS, when its name alone doesn't say (owner, on
   *  Andrew's Version: "the description should be about it being a
   *  lectionary commentary from Yale Divinity"). Shown in place of the
   *  publisher wherever there is room for a sentence. */
  about?: string;
  /** A pasted-in weekly follows through the subscription API, not the layout. */
  subscribe?: (on: boolean) => void;
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
  // /menu/newsletters/:group and /menu/newsletters/:group/manage — Manage is
  // PER LIST (owner: "it should only show the ones on that page, either daily
  // or the weeklies"), so it takes its cadence from the page it was opened
  // from and returns there.
  const [, params] = useRoute<{ group?: string }>("/menu/newsletters/:group");
  const [, manageParams] = useRoute<{ group?: string }>("/menu/newsletters/:group/manage");
  const rawGroup = manageParams?.group ?? params?.group;
  const group: "daily" | "weekly" | null = rawGroup === "daily" ? "daily" : rawGroup === "weekly" ? "weekly" : null;
  const managing = !!manageParams && group !== null;
  const qc = useQueryClient();
  // Re-render after a layout write. saveHomeLayout caches the new layout
  // synchronously, but the page only re-rendered when the /api/auth/me refetch
  // returned a DIFFERENT user object — and while the PUT is still in flight
  // it returns the same one, so the switch showed the previous state until
  // the next tap. Bumping here re-reads the (dirty) cache at once.
  const [, bump] = useState(0);
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
  const andrewsVisible = useAndrewsVisible();
  const andrewsQ = useQuery<InboxItem | null>(latestOpts("/api/andrews/latest", group === "weekly" && andrewsVisible));
  const taizeLatest = rs.taizeLatest ?? taizeQ.data ?? null;
  const andrewsLatest = rs.andrewsLatest ?? andrewsQ.data ?? null;

  // Taizé opens in the reader as its home card does; Andrew's Version opens
  // the Substack page as they built it (owner: no reader on that one), so
  // both match their cards exactly.
  // The last seven issues ride along so the reader can offer "Previous"
  // top right (owner) — where the office's Options menu used to appear on
  // Andrew's, which opened as a plain page. Both weeklies now open as
  // articles.
  const taizePrevious = usePreviousIssues("taize", group === "weekly");
  const andrewsPrevious = usePreviousIssues("andrews", group === "weekly" && andrewsVisible);
  // The pasted-in Substack weeklies (lib/weeklies.ts): the list carries
  // `subscribed`, the hook carries each card's inbox state.
  const weeklySources = useWeeklies(group === "weekly");
  // The newest post of EVERY publication, followed or not. useRhythmState only
  // carries state for the ones this person follows, so on "All" an unfollowed
  // row had no latest issue: Read opened the site's front page and could never
  // mark anything read (audit 2026-09-04).
  const weeklyLatestAll = useWeeklyLatest(group === "weekly");
  const setWeeklySubscription = useSetWeeklySubscription();
  const weeklyPrevious = usePreviousIssuesFor(weeklySources.map((w) => ({ source: weeklySourceId(w.slug), enabled: group === "weekly" })));
  const openWeekly = (source: InboxSource, item: InboxItem | null, fallbackUrl: string, reader: boolean) => () => {
    const previous = source === "taize" ? taizePrevious : andrewsPrevious;
    const opts = { ...(reader ? { reader: true } : {}), ...(previous.length ? { previous } : {}) };
    if (!item?.url) { openExternal(fallbackUrl, opts); return; }
    openExternalThenMarkRead(item.url, () => markInboxRead(source, item.id), opts);
  };

  /**
   * FOLLOWED = in the home layout (order, not hidden) — the EFFECTIVE layout,
   * local cache over the server copy while a save is in flight. Not the
   * hook's active-today flags: Taizé and the Dean's Commentary are followed
   * all week but active only on their days, and reading the active flag
   * here showed them as off with nothing to turn on. DONE still comes from
   * the hook, which is the one computation for "read today".
   */
  const layoutNow = (): HomeLayout => {
    const eff = user ? applyCachedHomeLayout(user).homeLayout : readCachedHomeLayout();
    return { order: [...(eff?.order ?? [])], hidden: [...(eff?.hidden ?? [])], v: eff?.v ?? HOME_LAYOUT_VERSION };
  };
  const layout = layoutNow();
  const on = (key: string) => isHomeCardOn(layout, key);

  const entries: Entry[] = [
    ...DAILY.map((d): Entry => {
      const r = rs.reflections.find((x) => x.source === d.source);
      return {
        key: d.source, emoji: d.emoji, title: d.title, publisher: d.publisher, cadence: "daily",
        followed: on(d.source), done: !!r?.done,
        // Read-gated like the home card (owner, 2026-09-04: a long piece counts
        // only once scrolled through) — it used to mark read BEFORE opening.
        open: () => {
          if (d.source === "vts") { MARK_READ[d.source](); setLocation("/vts-reading"); return; }
          openExternalThenMarkRead(reflectionSourceUrl(d.source), () => MARK_READ[d.source](), { reader: true });
        },
      };
    }),
    {
      key: "taize", emoji: "🕯️", title: "Taizé meditation", publisher: "Taizé", cadence: "weekly",
      followed: on("taize"), done: rs.taizeDone, latestTitle: taizeLatest?.title,
      open: openWeekly("taize", taizeLatest, "https://www.taize.fr/en/tag/meditations", true),
    },
    ...(andrewsVisible ? [{
      key: "andrews", emoji: "📰", title: "Andrew's Version", publisher: "Yale Divinity School", cadence: "weekly" as const,
      about: "A lectionary commentary from Yale Divinity School",
      followed: on("andrews"), done: rs.andrewsDone, latestTitle: andrewsLatest?.title,
      open: openWeekly("andrews", andrewsLatest, andrewsLatest?.url ?? "https://abmcg.substack.com/", true),
    } satisfies Entry] : []),
    ...weeklySources.map((w): Entry => {
      const key = weeklySourceId(w.slug);
      const state = rs.weeklies.find((x) => x.slug === w.slug);
      const latest = state?.latest ?? weeklyLatestAll?.[w.slug] ?? null;
      const previous = weeklyPrevious[key] ?? [];
      return {
        key, emoji: w.emoji || "📰", title: w.title, publisher: w.subtitle || w.title, cadence: "weekly",
        about: w.description || w.subtitle || undefined,
        followed: w.subscribed, done: !!state?.done, latestTitle: latest?.title,
        // Not a layout key: following is a subscription row on the server.
        subscribe: (on: boolean) => { void setWeeklySubscription(w.slug, on); },
        open: () => {
          const opts = { reader: true, ...(previous.length ? { previous } : {}) };
          if (!latest?.url) { openExternal(w.siteUrl, opts); return; }
          openExternalThenMarkRead(latest.url, () => markInboxRead(key, latest.id), opts);
        },
      };
    }),
  ];
  const inGroup = entries.filter((e) => e.cadence === group);
  const subscribed = inGroup.filter((e) => e.followed);
  const others = inGroup.filter((e) => !e.followed);

  const cadenceWord = (c: Entry["cadence"]) =>
    c === "daily" ? t("newsletters.daily", { defaultValue: "Daily" }) : t("newsletters.publication", { defaultValue: "Publication" });
  // The GROUP's name — owner (2026-09-04): "let's call weekly newsletters
  // Publications", on the split page and everywhere else.
  const groupTitle = (c: Entry["cadence"]) =>
    c === "daily" ? t("newsletters.daily_reflections", { defaultValue: "Daily Reflections" }) : t("newsletters.publications", { defaultValue: "Publications" });
  const blurbFor = (e: Entry) => {
    const lead = e.latestTitle ? e.latestTitle : (e.about ?? e.publisher);
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
      pulseOnLoad={false}
    />
  );
  const manage = () => setLocation(`/menu/newsletters/${group}/manage`);

  /**
   * FOLLOW / UNFOLLOW — the same writes the customizer makes, nothing new.
   * The home layout is the one source of "followed": a key in `order` and not
   * in `hidden` is a card on the home, and useRhythmState reads exactly that
   * (owner: "the manage subscription needs to have its own UI, not just go to
   * shape my routine"). Follow = addHomeCard (append if missing, un-hide);
   * unfollow = put the key in `hidden`, which is how the customizer's
   * off-keys say "deliberately off" (NOT removeHomeCard, whose dropping-from-
   * order semantics are for revoking a feed's grant). Built on the EFFECTIVE
   * layout — the local cache when a save is still in flight — the way the
   * customizer's add path is, so a second toggle a moment later can't build
   * on a stale server copy. Same save split as commit(): a guest's PUT would
   * 401 forever, so guests cache locally.
   */
  const writeLayout = (l: HomeLayout) => {
    if (user && !isDeviceLocalGuest(user)) {
      // Same shape as customize-home's saveLayout mutation. The user query is
      // patched FIRST and refetched only once the PUT has settled: refetching
      // at once raced the PUT — the GET came back with the old layout, the
      // PUT then cleared the dirty flag, and the switch snapped back to off
      // (turning Taizé back on failed twice this way on the simulator).
      void qc.cancelQueries({ queryKey: ["/api/auth/me"] });
      qc.setQueryData(["/api/auth/me"], (curr: unknown) => {
        if (!curr || typeof curr !== "object") return curr;
        return { ...(curr as Record<string, unknown>), homeLayout: { order: l.order, hidden: l.hidden, v: l.v ?? HOME_LAYOUT_VERSION } };
      });
      saveHomeLayout(l).finally(() => { qc.invalidateQueries({ queryKey: ["/api/auth/me"] }); });
    } else {
      cacheHomeLayoutLocalOnly(l);
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    }
    bump((n) => n + 1);
  };
  /**
   * Every layout key on THIS page that is off goes into `hidden` on each write.
   * The server backfills every known key into `order` on save, and a key that
   * is merely absent comes back ON — Andrew's Version switched itself on
   * after a Taizé toggle that way (audit, 2026-09-04). Hidden governs.
   */
  const withOffKeysHidden = (l: HomeLayout, justTurnedOn?: string): HomeLayout => {
    const hidden = new Set(l.hidden);
    for (const e of entries) {
      if (e.subscribe || e.cadence !== group || e.key === justTurnedOn) continue;
      if (!isHomeCardOn(l, e.key)) hidden.add(e.key);
    }
    return { ...l, hidden: [...hidden] };
  };
  const setFollowed = (key: string, on: boolean) => {
    const cur = layoutNow();
    if (on) {
      const { layout, changed } = addHomeCard(cur, key);
      if (changed) writeLayout(withOffKeysHidden(layout, key));
      return;
    }
    if (cur.hidden.includes(key)) return;
    writeLayout(withOffKeysHidden({ ...cur, hidden: [...cur.hidden, key] }));
  };

  if (managing) {
    const row = (e: Entry) => (
      <ToggleRow
        key={e.key}
        emoji={e.emoji}
        label={e.title}
        description={e.followed
          ? t("newsletters.following", { defaultValue: "On your home · {{who}}", who: e.publisher })
          : (e.about ?? e.publisher)}
        enabled={e.followed}
        onToggle={() => (e.subscribe ? e.subscribe(!e.followed) : setFollowed(e.key, !e.followed))}
      />
    );
    const rows = entries.filter((e) => e.cadence === group);
    const word = groupTitle(group as "daily" | "weekly");
    return (
      <Layout bgPhoto={bgPhoto}>
        <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
          <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", color: WARM, fontFamily: FONT, paddingBottom: 48 }}>
            <button
              type="button"
              onClick={() => setLocation(`/menu/newsletters/${group}`)}
              style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              ← {word}
            </button>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
              {t("newsletters.manage", { defaultValue: "Manage subscriptions" })}
            </h1>
            <p style={{ fontSize: 14, color: SAGE, margin: "0 0 20px", lineHeight: 1.5 }}>
              {group === "daily"
                ? t("newsletters.manage_daily_sub", { defaultValue: "Switch a daily newsletter on and it gets a card on your home; off, and it comes off." })
                : t("newsletters.manage_weekly_sub", { defaultValue: "Switch a publication on and its newest issue waits on your home until you've read it." })}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map(row)}</div>
          </div>
        </div>
      </Layout>
    );
  }

  if (group === null) {
    return (
      <MenuHub
        title={t("menu.newsletters", { defaultValue: "Reflections" })}
        emoji="🌅"
        subtitle={t("menu.newsletters_sub_long", { defaultValue: "Daily words and publications, from across the church." })}
        backLabel={t("menu.title", { defaultValue: "Menu" })}
        backHref="/menu"
        groups={[{
          items: [
            {
              emoji: "☀️", label: t("newsletters.daily_reflections", { defaultValue: "Daily Reflections" }),
              // One line, not the roll of names (owner: "just have the daily vs
              // weekly options have one line for the second line description").
              sub: t("newsletters.daily_sub", { defaultValue: "A short reading for each day" }),
              onClick: () => setLocation("/menu/newsletters/daily"),
            },
            {
              emoji: "🗞️", label: t("newsletters.publications", { defaultValue: "Publications" }),
              sub: t("newsletters.publications_sub", { defaultValue: "Letters that wait until you've read them" }),
              onClick: () => setLocation("/menu/newsletters/weekly"),
            },
          ],
        }]}
      />
    );
  }

  const groupLabel = groupTitle(group as "daily" | "weekly");
  return (
    <Layout bgPhoto={bgPhoto}>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
        <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", color: WARM, fontFamily: FONT, paddingBottom: 48 }}>
          <button
            type="button"
            onClick={() => setLocation("/menu/newsletters")}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            ← {t("menu.newsletters", { defaultValue: "Reflections" })}
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
