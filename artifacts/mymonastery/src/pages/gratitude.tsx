import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { apiRequest } from "@/lib/queryClient";
import { useBetaStatus } from "@/hooks/useDemo";
import { GratitudeComposer } from "@/components/GratitudeComposer";

// Frosted-glass card surface — translucent dark tint + blur so the leaf
// backdrop shows through, matching the rest of the app's photo surfaces.
const FROST_CARD = { background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)" } as const;

// Gratitude — a PRIVATE daily practice (a personal journal). Grounded in the
// BCP's General Thanksgiving. There is no sharing and no community garden: a
// practice is presence, not performance. Reachable from the side menu; the
// Daily Office close also offers a quick gratitude beat (GratitudeNudge).

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type Entry = { id: number; text: string; shared: boolean; createdAt: string };

// Local YYYY-MM-DD for a timestamp — "days of thanks" is about the
// user's calendar day.
function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function computeStats(entries: Entry[]): { days: number; total: number; today: boolean } {
  const daySet = new Set(entries.map((e) => localDay(e.createdAt)));
  const todayKey = localDay(new Date().toISOString());
  return { days: daySet.size, total: entries.length, today: daySet.has(todayKey) };
}

function formatDay(iso: string, todayLabel: string, yesterdayLabel: string, locale?: string): string {
  const d = new Date(iso);
  const t = localDay(iso);
  const today = localDay(new Date().toISOString());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (t === today) return todayLabel;
  if (t === localDay(y.toISOString())) return yesterdayLabel;
  return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-2xl px-4 py-5 text-center" style={{ ...FROST_CARD, border: "1px solid rgba(46,107,64,0.22)" }}>
      <p className="font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 22, lineHeight: 1.1, margin: 0 }}>{value}</p>
      <p className="text-[11px] mt-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK, margin: 0 }}>{label}</p>
    </div>
  );
}

export default function GratitudePage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { rawIsBeta } = useBetaStatus();

  const { data: mine } = useQuery<{ entries: Entry[]; total: number }>({
    queryKey: ["/api/gratitude/mine"],
    queryFn: () => apiRequest("GET", "/api/gratitude/mine") as Promise<{ entries: Entry[]; total: number }>,
  });

  const entries = mine?.entries ?? [];
  const stats = computeStats(entries);

  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  return (
    <Layout bgPhoto={bgPhoto}>
      <div className="max-w-xl mx-auto w-full">
        <div className="flex items-start gap-3 mb-6">
          <div className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0" style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}>
            🌾
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{t("gratitude.title")}</h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>{t("gratitude.subtitle")}</p>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <StatTile label={t("gratitude.days_of_thanks", { count: stats.days })} value={String(stats.days)} />
          <StatTile label={t("gratitude.total")} value={String(stats.total)} />
        </div>

        {/* Composer */}
        <div className="rounded-2xl p-4 mb-6" style={{ ...FROST_CARD, border: "1px solid rgba(46,107,64,0.25)" }}>
          <p className="text-[15px] font-semibold mb-3" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
            {stats.today ? t("gratitude.give_thanks_again") : t("gratitude.what_grateful")}
          </p>
          <GratitudeComposer />
        </div>

        {/* Outward gratitude — the "thank three people" practice (reaching toward
            real people; not a feed). */}
        {rawIsBeta && (
          <button
            type="button"
            onClick={() => setLocation("/thanks")}
            className="w-full rounded-2xl mb-6 flex items-center text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ ...FROST_CARD, border: "1px solid rgba(46,107,64,0.25)", gap: 14, padding: "16px 18px" }}
          >
            <span aria-hidden style={{ fontSize: 24, width: 28, textAlign: "center", flexShrink: 0, lineHeight: 1 }}>🤝</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-bold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{t("gratitude.thank_three_title", { defaultValue: "Thank three people today" })}</span>
              <span className="block text-[13px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK, marginTop: 3 }}>{t("gratitude.thank_three_sub", { defaultValue: "Reach out and tell them" })}</span>
            </span>
            <span aria-hidden style={{ color: "rgba(143,175,150,0.4)", fontSize: 22, lineHeight: 1, flexShrink: 0 }}>›</span>
          </button>
        )}

        {/* Your journal — private to you. */}
        {entries.length > 0 && (
          <>
            <p className="text-[11px] uppercase tracking-[0.16em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}>
              {t("gratitude.your_journal")}
            </p>
            <div className="space-y-2 mb-6">
              {entries.map((e) => (
                <div key={e.id} className="rounded-2xl px-4 py-3" style={{ ...FROST_CARD, border: "1px solid rgba(46,107,64,0.18)" }}>
                  <p className="text-[11px] mb-1" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>{formatDay(e.createdAt, t("common.today"), t("common.yesterday"), i18n.language)}</p>
                  <p className="text-[15px] italic" style={{ color: "#E8E4D8", fontFamily: "Georgia, 'Times New Roman', serif" }}>{e.text}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
