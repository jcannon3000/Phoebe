import { useTranslation } from "react-i18next";
import { openExternal } from "@/lib/openExternal";

// An event a prayer-feed manager attached to their feed (vigil, day of
// prayer, webinar, local action). Announce-only — no RSVP. Shape mirrors
// what GET /api/prayer-feeds/:slug/events returns and the upcomingEvents[]
// rows on GET /api/prayer-feeds/subscribed.
export type FeedEvent = {
  id: number;
  title: string;
  description?: string | null;
  startsAt: string;            // ISO
  endsAt?: string | null;      // ISO or null
  location?: string | null;
  joinUrl?: string | null;
  state?: "published" | "cancelled";
};

const SPACE_GROTESK = "'Space Grotesk', sans-serif";

// Human day/time label for an event's start. "Today · 7:00 PM",
// "Tomorrow · 9:00 AM", "Wed, Jun 4 · 7:00 PM". Caller passes t() and
// the active locale so today/tomorrow + the date formatting localize.
function formatWhen(iso: string, t: (k: string) => string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((startOf(d).getTime() - startOf(now).getTime()) / 86_400_000);
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  let day: string;
  if (days === 0) day = t("common.today");
  else if (days === 1) day = t("common.tomorrow");
  else if (days > 1 && days < 7) day = d.toLocaleDateString(locale, { weekday: "long" });
  else day = d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
  return `${day} · ${time}`;
}

// Compact event card reusing the gatherings visual vocabulary (left
// color bar, dark card, date eyebrow, optional video/location tag).
// Tapping a joinUrl opens external (SFSafariViewController on iOS).
// Built fresh rather than reusing GatheringCard, which reads community
// fields (groupId, RSVP) feed events don't have.
export function FeedEventCard({ event, compact = false }: { event: FeedEvent; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const cancelled = event.state === "cancelled";
  const BAR = "#6FAF85"; // CATEGORY_COLORS.gatherings.bar

  return (
    <div
      className="relative flex rounded-xl overflow-hidden"
      style={{
        // 90% fill so the home's drifting backdrop shows faintly through
        // the card; the colored bar, text, and border stay fully opaque
        // (only the background-color carries the transparency, not the
        // element's opacity).
        background: "rgba(9,26,16,0.3)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(111,175,133,0.28)",
        opacity: cancelled ? 0.6 : 1,
      }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: BAR }} />
      <div className="flex-1 px-4 py-3 min-w-0">
        <p
          className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-0.5"
          style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}
        >
          {cancelled ? t("feed_event.cancelled") : formatWhen(event.startsAt, t, i18n.language)}
        </p>
        <p
          className="text-sm font-semibold leading-snug"
          style={{
            color: "#F0EDE6",
            fontFamily: SPACE_GROTESK,
            textDecoration: cancelled ? "line-through" : undefined,
          }}
        >
          {event.title}
        </p>
        {!compact && event.description && (
          <p
            className="text-[13px] leading-snug mt-1 line-clamp-2"
            style={{ color: "rgba(200,212,192,0.75)", fontFamily: SPACE_GROTESK }}
          >
            {event.description}
          </p>
        )}
        {(event.location || event.joinUrl) && !cancelled && (
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {event.location && (
              <span className="text-[12px]" style={{ color: "rgba(143,175,150,0.85)", fontFamily: SPACE_GROTESK }}>
                📍 {event.location}
              </span>
            )}
            {event.joinUrl && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openExternal(event.joinUrl!); }}
                className="text-[12px] font-medium px-3 py-1 rounded-full transition-opacity hover:opacity-90"
                style={{
                  background: "rgba(111,175,133,0.22)",
                  border: "1px solid rgba(111,175,133,0.45)",
                  color: "#C8D4C0",
                  fontFamily: SPACE_GROTESK,
                }}
              >
                📹 {t("feed_event.join")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
