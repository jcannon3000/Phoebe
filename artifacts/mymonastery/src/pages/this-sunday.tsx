import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { PracticeCard, rhythmGradientRgb } from "@/components/DailyProgressBody";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { getDay, readLesserFeastsPref } from "@/lib/liturgical/calendar";
import { getOfficeCacheEntry } from "@/lib/officeOfflineCache";
import { nextSundayYmdNY } from "@/lib/sundayDate";
import { useSundayCommentaries } from "@/lib/sundayCommentaries";
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

function sundayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function ThisSundayPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // Shared with the Menu, which warms it (lib/sundayLectionary).
  const sundayQ = useQuery<Sunday | null>(sundayLectionaryQuery);
  const sunday = sundayQ.data ?? null;

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
      // ONLY the deck's own flag says whether this Sunday has two tracks.
      // "A deck exists at the track-2 key" does not: /api/office/sunday serves
      // track 1's slides for ?track=2 when the Sunday has one track
      // (assembleScriptureReading, `track === 2 && tracks.track2 ? … : track1`),
      // so the offline walk saves a track-2 deck every week and `!!t2` was
      // always true — a Track 1/2 row on a one-track Sunday whose Track 2 tap
      // changed nothing (audit, 2026-09-16).
      setSavedSunday({ date: deck.officeDay?.sundayDate ?? date, readings, hasTrack2: !!deck.officeDay?.hasTrack2 });
    })();
    return () => { cancelled = true; };
  }, [sunday]);

  // The live answer decides once it is here; the saved decks only speak for
  // the Sunday while it is not. (They used to be OR'd, so a stale saved flag
  // kept the row up after the live answer said one track.)
  const hasTrack2 = sunday ? !!sunday.track2 : !!savedSunday?.hasTrack2;
  // The two commentaries — which post is THIS Sunday's, and how each opens
  // and marks read — live in lib/sundayCommentaries, shared with the home's
  // Explore row. The Sunday this page shows is the one it looks up.
  const commentaries = useSundayCommentaries(sunday?.sundayDate ?? savedSunday?.date ?? null);
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
      // Owner (2026-09-16): Lectio Divina on any of this Sunday's readings, in
      // the daily Lectio's own deck, "above the visio divina card". Carries
      // the track so the picker offers the readings this page is showing.
      key: "lectio", emoji: "📜",
      title: t("this_sunday.lectio", { defaultValue: "Lectio Divina" }),
      blurb: t("this_sunday.lectio_sub", { defaultValue: "Meditate on this Sunday's readings" }),
      cta: t("rhythm.begin", { defaultValue: "Begin" }),
      open: () => setLocation(`/lectio?sunday=1&track=${track}`),
    },
    {
      key: "visio", emoji: "🖼️",
      title: t("this_sunday.visio", { defaultValue: "Visio Divina" }),
      blurb: t("this_sunday.visio_sub", { defaultValue: "Meditate on an image for this Sunday" }),
      cta: t("rhythm.begin", { defaultValue: "Begin" }),
      open: () => setLocation("/visio"),
    },
    ...commentaries.map((c) => ({
      key: c.key, emoji: c.emoji,
      title: c.key === "commentary"
        ? t("this_sunday.commentary", { defaultValue: c.title })
        : t("this_sunday.living_church", { defaultValue: c.title }),
      blurb: c.key === "commentary"
        ? t("this_sunday.commentary_sub", { defaultValue: c.blurb })
        : t("this_sunday.living_church_sub", { defaultValue: c.blurb }),
      cta: t("rhythm.read", { defaultValue: "Read" }),
      open: c.open,
    })),
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
              them on the pixel grid together.

              REBUILT WHEN THE READINGS ARRIVE (keyed on where they came from).
              Opened before the answer, the page paints "Finding the readings…";
              the answer then adds the Track row above, moving the list, in the
              same frame the first card's blurb changes, and WebKit moves the
              cards' composited layers without repainting that text. "Finding
              the readings…" stayed on screen under the loaded subtitle
              (2026-09-15). It happens without the list's layer too, and on a
              one-track Sunday a reserved Track row would collapse and move the
              list just the same. New layers are painted whole where they land:
              measured on the Simulator, the right blurb in every frame after
              the move, card to card still 231 device px. */}
          <div key={sunday ? "live" : savedSunday ? "saved" : "loading"} style={{ display: "flex", flexDirection: "column", gap: 10, willChange: "transform" }}>
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
