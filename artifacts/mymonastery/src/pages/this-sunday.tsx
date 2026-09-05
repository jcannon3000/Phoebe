import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { PracticeCard, rhythmGradientRgb } from "@/components/DailyProgressBody";
import { apiRequest } from "@/lib/queryClient";
import { openExternal, openExternalThenMarkRead } from "@/lib/openExternal";
import { useBetaStatus } from "@/hooks/useDemo";
import { usePreviousIssues } from "@/hooks/usePreviousIssues";
import { markAndrewsRead, type InboxItem } from "@/lib/taizeInbox";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { getDay, readLesserFeastsPref } from "@/lib/liturgical/calendar";

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

type Track = { ot: string | null; psalm: string | null; nt: string | null; gospel: string | null };
type Sunday = {
  sundayDate: string; name: string | null; url: string;
  gospel: string | null; psalm: string | null; nt: string[]; ot: string[];
  track1: Track | null; track2: Track | null;
};

function sundayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function ThisSundayPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { rawIsAdmin: isAdmin } = useBetaStatus();
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const sundayQ = useQuery<Sunday | null>({
    queryKey: ["/api/lectionary/sunday", 2],
    staleTime: 10 * 60_000,
    // ?v=2 busts the WebView's HTTP cache of the pre-tracks body (served
    // with an hour's max-age); harmless once every cache has rolled over.
    queryFn: async () => ((await apiRequest("GET", "/api/lectionary/sunday?v=2")) as Sunday | null) ?? null,
  });
  const sunday = sundayQ.data ?? null;
  const andrewsQ = useQuery<InboxItem | null>({
    queryKey: ["/api/andrews/latest"],
    enabled: isAdmin,
    staleTime: 15 * 60_000,
    queryFn: async () => ((await apiRequest("GET", "/api/andrews/latest")) as InboxItem | null) ?? null,
  });
  const andrewsPrevious = usePreviousIssues("andrews", isAdmin);

  // Track 1 / Track 2 (owner: "a Track A or B toggle on the opening page that
  // would affect what readings are in the deck"). Only offered when the RCL
  // appoints two; the deck reads ?track=.
  const [track, setTrack] = useState<1 | 2>(1);
  const hasTrack2 = !!sunday?.track2;
  const chosen: Track | null = sunday ? (track === 2 && sunday.track2 ? sunday.track2 : sunday.track1) : null;
  // The liturgical day as the home would name it on that Sunday, and the
  // Proper (owner, 2026-09-04: "list the liturgical day like it would be on
  // the home screen if it was Sunday, and what Proper").
  const liturgicalLine = useMemo(() => {
    if (!sunday) return null;
    const [y, m, d] = sunday.sundayDate.split("-").map(Number);
    const day = getDay(new Date(y!, (m ?? 1) - 1, d ?? 1), { observeLesserFeasts: readLesserFeastsPref() });
    const proper = /Prop(\d+)/.exec(sunday.url ?? "")?.[1];
    return [day.name, proper ? `Proper ${proper}` : null].filter(Boolean).join(" · ");
  }, [sunday]);
  const readingsLine = chosen
    ? [chosen.ot, chosen.psalm, chosen.nt, chosen.gospel].filter(Boolean).join(" · ")
    : "";
  const sundayLine = sunday
    ? [sunday.name ?? sundayLabel(sunday.sundayDate), readingsLine].filter(Boolean).join(" · ")
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
      // Owner (2026-09-04): "call Yale commentary on This Sunday Scripture
      // Commentary"; the second line still names Dr. McGowan.
      title: t("this_sunday.commentary", { defaultValue: "Scripture Commentary" }),
      blurb: t("this_sunday.commentary_sub", { defaultValue: "Dr. Andrew McGowan's commentary on the lectionary" }),
      cta: t("rhythm.read", { defaultValue: "Read" }),
      open: () => {
        const post = andrewsQ.data;
        if (!post?.url) { openExternal("https://abmcg.substack.com/", { reader: true }); return; }
        openExternalThenMarkRead(post.url, () => markAndrewsRead(post.id), { reader: true, previous: andrewsPrevious });
      },
    }] : []),
  ];

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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
