import { useMemo } from "react";
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

type Sunday = {
  sundayDate: string; name: string | null; url: string;
  gospel: string | null; psalm: string | null; nt: string[]; ot: string[];
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
    queryKey: ["/api/lectionary/sunday"],
    staleTime: 60 * 60_000,
    queryFn: async () => ((await apiRequest("GET", "/api/lectionary/sunday")) as Sunday | null) ?? null,
  });
  const sunday = sundayQ.data ?? null;
  const andrewsQ = useQuery<InboxItem | null>({
    queryKey: ["/api/andrews/latest"],
    enabled: isAdmin,
    staleTime: 15 * 60_000,
    queryFn: async () => ((await apiRequest("GET", "/api/andrews/latest")) as InboxItem | null) ?? null,
  });
  const andrewsPrevious = usePreviousIssues("andrews", isAdmin);

  const readingsLine = sunday
    ? [sunday.ot[0], sunday.psalm, sunday.nt[0], sunday.gospel].filter(Boolean).join(" · ")
    : "";
  const sundayLine = sunday
    ? [sunday.name ?? sundayLabel(sunday.sundayDate), readingsLine].filter(Boolean).join(" · ")
    : t("this_sunday.loading", { defaultValue: "Finding the readings…" });

  // The passages on oremus (owner: "use passages from oremus") — the host
  // Phoebe's reader restyles, the way the office's "Read online" pill opens a
  // lesson. Track 1 of the Old Testament where the RCL offers two.
  const passages = sunday
    ? [sunday.ot[0], sunday.psalm, sunday.nt[0], sunday.gospel].filter((p): p is string => !!p)
    : [];
  // NEWLINE-separated: oremus renders several passages on one page only that
  // way (or as repeated ?passage= params); "; " and "," return its landing
  // page — probed 2026-09-04.
  const oremusUrl = passages.length > 0
    ? `https://bible.oremus.org/?passage=${encodeURIComponent(passages.join("\n"))}`
    : null;

  const cards = [
    {
      key: "readings", emoji: "📖",
      title: t("this_sunday.readings", { defaultValue: "Sunday readings" }),
      blurb: sundayLine,
      cta: t("rhythm.read", { defaultValue: "Read" }),
      open: () => { const u = oremusUrl ?? sunday?.url; if (u) openExternal(u, { reader: true }); },
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
      // "Scripture commentary from Yale" truncated on the card; the second line
      // still carries the owner's words.
      title: t("this_sunday.commentary", { defaultValue: "Yale commentary" }),
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
            onClick={() => setLocation("/menu/learn")}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            ← {t("menu.learn", { defaultValue: "Learn" })}
          </button>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
            {t("this_sunday.title", { defaultValue: "This Sunday" })} 🗓️
          </h1>
          <p style={{ fontSize: 14, color: SAGE, margin: "0 0 20px", lineHeight: 1.5 }}>
            {sunday
              ? t("this_sunday.sub", { defaultValue: "{{when}} — the readings, an image, and a word on them.", when: sundayLabel(sunday.sundayDate) })
              : t("this_sunday.sub_loading", { defaultValue: "The coming Sunday — its readings, an image, and a word on them." })}
          </p>
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
                onOpen={c.open}
                pulseOnLoad={false}
              />
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
