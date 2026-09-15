import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { PracticeCard, rhythmGradientRgb } from "@/components/DailyProgressBody";
import { apiRequest } from "@/lib/queryClient";
import { openExternal, openExternalThenMarkRead } from "@/lib/openExternal";
import { useAndrewsVisible, useLivingChurchVisible } from "@/lib/appSettings";
import { usePreviousIssues, PREVIOUS_ISSUES } from "@/hooks/usePreviousIssues";
import { markAndrewsRead, type InboxItem } from "@/lib/taizeInbox";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { getDay, readLesserFeastsPref } from "@/lib/liturgical/calendar";
import { getOfficeCacheEntry } from "@/lib/officeOfflineCache";
import { nextSundayYmdNY } from "@/lib/sundayDate";
import { sundayLectionaryQuery, type SundayLectionary as Sunday, type SundayTrack as Track } from "@/lib/sundayLectionary";

/**
 * /this-sunday — under Learn (owner, 2026-09-04): "a menu option that says
 * This Sunday. You click on it, and the first card says Sunday readings … the
 * same exact UI [as the Daily Scripture Readings practice] … for the upcoming
 * Sunday. The second one is Visio Divina … 'meditate on an image for this
 * Sunday'. The third one is scripture commentary from Yale … 'Dr. Andrew
 * McGowan's commentary on the lectionary' … only for admins right now."
 *
 * The Daily Scripture Readings practice opens Forward Movement's page in
 * Phoebe's reader; Sunday readings opens the coming Sunday's lectionarypage.net
 * page in that same reader — nothing new drawn. The cards are the home's own
 * PracticeCard on the green ramp, as the Newsletters pages use them.
 */

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
/** The Living Church's "Sunday's Readings" column — opened when this Sunday's post isn't up yet. */
const LIVING_CHURCH_INDEX = "https://livingchurch.org/category/scripture/sundays-readings/";

function sundayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function ThisSundayPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  // The commentary card: super admins always, everyone once the Admin Tools
  // switch is on (lib/appSettings). Kept as `isAdmin` below.
  const isAdmin = useAndrewsVisible();
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // Shared with the Menu, which warms it (lib/sundayLectionary).
  const sundayQ = useQuery<Sunday | null>(sundayLectionaryQuery);
  const sunday = sundayQ.data ?? null;
  const andrewsQ = useQuery<InboxItem | null>({
    queryKey: ["/api/andrews/latest"],
    enabled: isAdmin,
    staleTime: 15 * 60_000,
    queryFn: async () => ((await apiRequest("GET", "/api/andrews/latest")) as InboxItem | null) ?? null,
  });
  const andrewsPrevious = usePreviousIssues("andrews", isAdmin);
  // The Living Church's "Sunday's Readings" (owner, 2026-09-15: "build this
  // just like with the McGowan Comentaries"): super admins always, everyone
  // once its own Admin Tools switch is on. One list feeds both the card (the
  // post for this Sunday, picked below) and the reader's "Previous" menu.
  const livingChurchVisible = useLivingChurchVisible();
  const livingChurchQ = useQuery<InboxItem[]>({
    queryKey: ["/api/living-church/posts"],
    enabled: livingChurchVisible,
    staleTime: 15 * 60_000,
    queryFn: async () => ((await apiRequest("GET", "/api/living-church/posts")) as InboxItem[] | null) ?? [],
  });
  const livingChurchPrevious = useMemo(
    () => (livingChurchQ.data ?? []).slice(0, PREVIOUS_ISSUES).map(({ title, url }) => ({ title, url })),
    [livingChurchQ.data],
  );

  // Track 1 / Track 2 (owner: "a Track A or B toggle on the opening page that
  // would affect what readings are in the deck"). Only offered when the RCL
  // appoints two; the deck reads ?track=.
  const [track, setTrack] = useState<1 | 2>(1);
  const chosen: Track | null = sunday ? (track === 2 && sunday.track2 ? sunday.track2 : sunday.track1) : null;
  // The liturgical day as the home would name it on that Sunday, and the
  // Proper (owner, 2026-09-04: "list the liturgical day like it would be on
  // the home screen if it was Sunday, and what Proper").
  const liturgicalLine = useMemo(() => {
    if (!sunday) return null;
    const [y, m, d] = sunday.sundayDate.split("-").map(Number);
    const day = getDay(new Date(y!, (m ?? 1) - 1, d ?? 1), { observeLesserFeasts: readLesserFeastsPref() });
    const proper = /prop(\d+)/i.exec(sunday.url ?? "")?.[1];
    return [day.name, proper ? `Proper ${proper}` : null].filter(Boolean).join(" · ");
  }, [sunday]);
  /**
   * WHAT THE SAVED DECK KNOWS, when the lectionary call can't be made.
   *
   * The page always rendered its cards, so Begin worked offline and the deck
   * read its saved copy — but the blurb sat on "Finding the readings…" for
   * good, and hasTrack2 comes from this query, so a reader with BOTH tracks on
   * the phone was only ever offered Track 1. The decks carry everything needed
   * to say it: their officeDay names the Sunday and whether a second track
   * exists, and their title slides name the readings.
   */
  const [savedSunday, setSavedSunday] = useState<{ date: string; readings: string; hasTrack2: boolean } | null>(null);
  useEffect(() => {
    if (sunday) return;
    let cancelled = false;
    void (async () => {
      const date = nextSundayYmdNY();
      const read = (t: "1" | "2") => getOfficeCacheEntry({ mode: "sunday", date, confession: "", track: t }) as Promise<{
        slides?: Array<{ type?: string; title?: string }>;
        officeDay?: { sundayDate?: string | null; hasTrack2?: boolean };
      } | null>;
      const [t1, t2] = await Promise.all([read("1"), read("2")]);
      const deck = t1 ?? t2;
      if (cancelled || !deck) return;
      const readings = (deck.slides ?? [])
        .filter((sl) => typeof sl.type === "string" && sl.type.includes("title") && sl.title)
        .map((sl) => sl.title!)
        .join(" · ");
      setSavedSunday({ date: deck.officeDay?.sundayDate ?? date, readings, hasTrack2: !!t2 || !!deck.officeDay?.hasTrack2 });
    })();
    return () => { cancelled = true; };
  }, [sunday]);

  // The toggle is offered when EITHER the live answer or the saved decks say
  // there are two tracks.
  const hasTrack2 = !!sunday?.track2 || !!savedSunday?.hasTrack2;
  /**
   * THIS SUNDAY'S commentary, not merely the newest (owner: "they post on
   * monday for the coming sunday … so it should be on this sunday"). The post
   * for a Sunday is the one published in the seven days up to it. From Monday,
   * when this page moves on to the next Sunday, until that week's post goes
   * up, nothing matches — and last week's commentary under "This Sunday" would
   * be the wrong Sunday's, so the card opens the column instead.
   */
  const livingChurchPost = useMemo(() => {
    const ymd = sunday?.sundayDate ?? savedSunday?.date ?? nextSundayYmdNY();
    const [y, m, d] = ymd.split("-").map(Number);
    const weekBefore = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) - 7)).toISOString().slice(0, 10);
    return (livingChurchQ.data ?? []).find((p) => !!p.published && p.published > weekBefore && p.published <= ymd) ?? null;
  }, [livingChurchQ.data, sunday, savedSunday]);
  const readingsLine = chosen
    ? [chosen.ot, chosen.psalm, chosen.nt, chosen.gospel].filter(Boolean).join(" · ")
    : (savedSunday?.readings ?? "");
  const sundayLine = sunday
    ? [sunday.name ?? sundayLabel(sunday.sundayDate), readingsLine].filter(Boolean).join(" · ")
    : savedSunday
      ? [sundayLabel(savedSunday.date), readingsLine].filter(Boolean).join(" · ")
      : t("this_sunday.loading", { defaultValue: "Finding the readings…" });

  const cards = [
    {
      key: "readings", emoji: "📖",
      title: t("this_sunday.readings", { defaultValue: "Sunday readings" }),
      blurb: sundayLine,
      cta: t("rhythm.begin", { defaultValue: "Begin" }),
      // The Daily Scripture Reading deck (owner: "just like the Daily Scripture
      // Reading UI … bar at the bottom"), fed with this Sunday's track.
      open: () => setLocation(`/bcp/daily-office?mode=sunday&track=${track}`),
    },
    {
      key: "visio", emoji: "🖼️",
      title: t("this_sunday.visio", { defaultValue: "Visio Divina" }),
      blurb: t("this_sunday.visio_sub", { defaultValue: "Meditate on an image for this Sunday" }),
      cta: t("rhythm.begin", { defaultValue: "Begin" }),
      open: () => setLocation("/visio"),
    },
    ...(isAdmin ? [{
      key: "commentary", emoji: "📰",
      // Owner (2026-09-15): "have McGowan say "Yale Divinity Commentary" with
      // his name in the second line" (it was "Scripture Commentary").
      title: t("this_sunday.commentary", { defaultValue: "Yale Divinity Commentary" }),
      blurb: t("this_sunday.commentary_sub", { defaultValue: "Dr. Andrew McGowan" }),
      cta: t("rhythm.read", { defaultValue: "Read" }),
      open: () => {
        const post = andrewsQ.data;
        if (!post?.url) { openExternal("https://abmcg.substack.com/", { reader: true }); return; }
        openExternalThenMarkRead(post.url, () => markAndrewsRead(post.id), { reader: true, previous: andrewsPrevious });
      },
    }] : []),
    ...(livingChurchVisible ? [{
      key: "living-church", emoji: "⛪",
      // Owner (2026-09-15): "have the living church say "Living Church
      // Comentary" with a discription under". The second line is short enough
      // to show whole on an iPhone 17 Pro; the old one ran into the Read pill.
      title: t("this_sunday.living_church", { defaultValue: "Living Church Commentary" }),
      blurb: t("this_sunday.living_church_sub", { defaultValue: "Weekly reflection on the readings" }),
      cta: t("rhythm.read", { defaultValue: "Read" }),
      // In Phoebe's reader (owner: "lets try a reader view"), with the
      // column's recent posts under Previous. Nothing is marked read: no other
      // card anywhere waits on it.
      open: () => { openExternal(livingChurchPost?.url ?? LIVING_CHURCH_INDEX, { reader: true, previous: livingChurchPrevious }); },
    }] : []),
  ];

  return (
    <Layout bgPhoto={bgPhoto}>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "var(--app-dvh)" }}>
        <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", color: WARM, fontFamily: FONT, paddingBottom: 48 }}>
          <button
            type="button"
            onClick={() => setLocation("/menu")}
            // A block-level box with a 20px line, so the page starts on a whole pixel.
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, lineHeight: "20px", cursor: "pointer", padding: 0, marginBottom: 14, display: "flex", width: "fit-content", alignItems: "center", gap: 6 }}
          >
            ← {t("menu.title", { defaultValue: "Menu" })}
          </button>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
            {t("this_sunday.title", { defaultValue: "This Sunday" })} 🗓️
          </h1>
          <p style={{ fontSize: 14, color: SAGE, margin: "0 0 20px", lineHeight: 1.5 }}>
            {sunday
              ? [sundayLabel(sunday.sundayDate), liturgicalLine].filter(Boolean).join(" · ")
              : t("this_sunday.sub_loading", { defaultValue: "The coming Sunday — its readings, an image, and a word on them." })}
          </p>
          {hasTrack2 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {([1, 2] as const).map((n) => {
                const on = track === n;
                return (
                  <button key={n} type="button" onClick={() => setTrack(n)}
                    style={{ flex: 1, background: on ? "rgba(46,107,64,0.45)" : "rgba(200,212,192,0.06)", border: `1px solid ${on ? "rgba(168,197,160,0.6)" : "rgba(200,212,192,0.18)"}`,
                      color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: on ? 700 : 500, borderRadius: 999, padding: "9px 0", cursor: "pointer" }}>
                    {t(n === 1 ? "this_sunday.track1" : "this_sunday.track2", { defaultValue: n === 1 ? "Track 1" : "Track 2" })}
                  </button>
                );
              })}
            </div>
          )}
          {/* One compositing layer for the list, as on home (DailyProgressBody):
              each card's frost is its own layer, and a shared origin lands
              them on the pixel grid together. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, willChange: "transform" }}>
            {cards.map((c, i) => (
              <PracticeCard
                key={c.key}
                emoji={c.emoji}
                title={c.title}
                blurb={c.blurb}
                cta={c.cta}
                done={false}
                doneCta={c.cta}
                rgb={rhythmGradientRgb(i, cards.length)}
                onClick={c.open}
                pulseOnLoad={false}
              />
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
