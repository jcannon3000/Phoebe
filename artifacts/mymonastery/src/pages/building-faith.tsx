import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { useTranslation } from "react-i18next";

// /building-faith — a reading list of faith-formation articles from Building
// Faith (Forward Movement / Virginia Theological Seminary). The list comes
// from /api/buildfaith (their WP REST API, cached server-side). Tapping an
// article opens it in the in-app browser via openExternal (the custom
// WKWebView) — we link out rather than re-host their article text.

const PALETTE = {
  bg: "#091A10",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
  border: "rgba(46,107,64,0.4)",
  cardBg: "#0F2818",
  accent: "#A8C5A0",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Article = {
  id: number;
  title: string;
  excerpt: string;
  date: string;
  url: string;
  imageUrl: string | null;
  category: string | null;
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export default function BuildingFaithPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<{ articles: Article[]; siteUrl: string }>({
    queryKey: ["/api/buildfaith"],
    queryFn: () => apiRequest("GET", "/api/buildfaith"),
    staleTime: 30 * 60_000,
  });
  const articles = data?.articles ?? [];

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: PALETTE.bg,
        color: PALETTE.warm,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          paddingTop: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))",
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 10,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          style={{ justifySelf: "start", background: "none", border: "none", color: PALETTE.sage, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}
        >
          ← {t("common.back", { defaultValue: "Back" })}
        </button>
        <span
          className="rounded-full"
          style={{
            background: "rgba(46,107,64,0.15)",
            border: `1px solid ${PALETTE.border}`,
            color: PALETTE.warm,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            padding: "6px 14px",
            whiteSpace: "nowrap",
          }}
        >
          📰 Building Faith
        </span>
        <span />
      </header>

      <main style={{ flex: 1, width: "100%", maxWidth: 560, margin: "0 auto", padding: "6px 16px 36px" }}>
        <p style={{ fontSize: 13, color: PALETTE.sage, lineHeight: 1.5, margin: "0 4px 16px" }}>
          {t("building_faith.blurb", {
            defaultValue: "Faith-formation articles from Building Faith — a resource of Forward Movement & Virginia Theological Seminary.",
          })}
        </p>

        {isLoading && articles.length === 0 ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, textAlign: "center", marginTop: 40 }}>
            {t("building_faith.loading", { defaultValue: "Loading articles…" })}
          </p>
        ) : articles.length === 0 ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, textAlign: "center", marginTop: 40, lineHeight: 1.5 }}>
            {t("building_faith.empty", { defaultValue: "Couldn't load articles right now. Please try again in a little while." })}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {articles.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => openExternal(a.url)}
                className="text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: PALETTE.cardBg,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 16,
                  overflow: "hidden",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {a.imageUrl && (
                  <img
                    src={a.imageUrl}
                    alt=""
                    loading="lazy"
                    style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }}
                  />
                )}
                <div style={{ padding: "12px 14px 14px" }}>
                  {a.category && (
                    <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: PALETTE.accent, margin: "0 0 4px" }}>
                      {a.category}
                    </p>
                  )}
                  <p style={{ fontSize: 15.5, fontWeight: 700, color: PALETTE.warm, margin: 0, lineHeight: 1.25 }}>
                    {a.title}
                  </p>
                  {a.excerpt && (
                    <p style={{ fontSize: 13, color: "rgba(200,212,192,0.8)", margin: "6px 0 0", lineHeight: 1.45 }}>
                      {a.excerpt}
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: PALETTE.faint, margin: "10px 0 0" }}>
                    {fmtDate(a.date)} · {t("building_faith.read_on", { defaultValue: "Read on Building Faith ↗" })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
