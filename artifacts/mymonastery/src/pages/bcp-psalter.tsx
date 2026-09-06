import { useState, useEffect, useMemo } from "react";
import { boundedFetch } from "@/lib/boundedFetch";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { isOnline } from "@/lib/offline";

type Psalm = {
  number: number;
  title: string;
  bcpRef: string;
  content: string;
};

type PsalmLine = { text: string; indented: boolean };
type PsalmEntry = { number: string; lines: PsalmLine[] };

// Mirrors the parser in bcp-daily-office. Psalms in the seed are stored
// as `<n> <first hemistich> *\n  <second hemistich>` with continuation
// lines indented by two spaces. We split into numbered verses; the
// Psalter as seeded has no Gloria Patri appended (that's only added at
// office-assembly time), so this parser only handles verses.
function parsePsalmContent(content: string): PsalmEntry[] {
  const result: PsalmEntry[] = [];
  const rawLines = content.split("\n");
  let current: PsalmEntry | null = null;
  for (const raw of rawLines) {
    const line = raw.replace(/\s+$/, "");
    if (line === "") continue;
    const verseMatch = line.match(/^(\d+)\s+(.*)$/);
    if (verseMatch) {
      if (current) result.push(current);
      current = { number: verseMatch[1], lines: [{ text: verseMatch[2], indented: false }] };
    } else if (current) {
      const indented = /^\s/.test(raw);
      current.lines.push({ text: line.trim(), indented });
    }
  }
  if (current) result.push(current);
  return result;
}

// First verse as a one-line teaser for the list rows. Takes everything
// before the "2 " verse marker, strips the leading "1 ", drops the
// caesura asterisk, and collapses whitespace so it lays out cleanly
// when line-clamped.
function firstVerseTeaser(content: string): string {
  const lines = content.split("\n");
  const collected: string[] = [];
  for (const line of lines) {
    if (collected.length > 0 && /^\d+\s/.test(line)) break;
    collected.push(line);
  }
  return collected
    .join(" ")
    .replace(/^\s*\d+\s+/, "")
    .replace(/\s*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function BcpPsalterPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [psalms, setPsalms] = useState<Psalm[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPsalm, setSelectedPsalm] = useState<Psalm | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    /**
     * OFFLINE IS NOT SIGNED OUT (owner, 2026-09-06: "Morning Prayer is not
     * loading offline at all — it would load before").
     *
     * /api/auth/me cannot be answered without a connection, so the query
     * resolves to null and this gate read that as "no account" and sent the
     * person home — every saved office, psalm and prayer became unreachable
     * the moment they lost signal, which is the opposite of what the offline
     * layer is for. A failed ask is not an answer: while offline, stay put and
     * let the page paint from what is saved.
     */
    if (isOnline() && !isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  // Eager-fetch the full Psalter once. ~150 psalms; small enough to
  // hold in memory and lets search run instantly across all verses.
  useEffect(() => {
    let cancelled = false;
    // Bounded, or an offline open sits on the native HTTP timeout with the
    // page's chrome over an empty psalter (audit, 2026-09-06). The saved-psalms
    // deck at /psalms is the one the offline registry points at and it caches
    // properly; this is the searchable full Psalter, which is online-only —
    // failing fast at least lets its error state show.
    boundedFetch("/api/office/psalter")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { psalms: Psalm[] }) => {
        if (!cancelled) setPsalms(data.psalms);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    if (!selectedPsalm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedPsalm(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedPsalm]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return psalms;
    return psalms.filter(
      (p) =>
        String(p.number) === needle ||
        `psalm ${p.number}`.includes(needle) ||
        p.title.toLowerCase().includes(needle) ||
        p.content.toLowerCase().includes(needle),
    );
  }, [psalms, query]);

  /**
   * OFFLINE STILL RENDERS (owner, 2026-09-06: "there is no reason why those
   * should not at least have the BCP content"). The prayer book is bundled
   * with the app and the day's deck is saved ahead, so a page that cannot ask
   * /auth/me must still paint — blanking it made every office, psalm and
   * collect a white screen the moment the signal dropped.
   */
  if (isOnline() && (isLoading || !user)) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            {t("psalter.back_dashboard")}
          </Link>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {t("psalter.title")} 📜
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            {t("psalter.subtitle")}
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("psalter.search_placeholder")}
            className="w-full text-sm px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/30 focus:border-[#8FAF96]/60 transition-all"
            style={{
              backgroundColor: "#091A10",
              borderColor: "rgba(46,107,64,0.3)",
              color: "#F0EDE6",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-sm"
              style={{ color: "#8FAF96", background: "rgba(200,212,192,0.1)" }}
            >
              ×
            </button>
          )}
        </div>

        {loadError && (
          <p className="text-sm text-center py-8" style={{ color: "rgba(218,112,124,0.8)" }}>
            {t("psalter.couldnt_load", { error: loadError })}
          </p>
        )}

        {!loadError && psalms.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
            {t("psalter.loading")}
          </p>
        )}

        {!loadError && psalms.length > 0 && (
          <>
            {query.trim() && (
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-3"
                style={{ color: "rgba(143,175,150,0.4)" }}
              >
                {t("saints.results_count", { count: filtered.length })}
              </p>
            )}
            {filtered.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
                {t("psalter.no_results", { query })}
              </p>
            ) : (
              <div className="space-y-1">
                {filtered.map((psalm) => (
                  <button
                    key={psalm.number}
                    onClick={() => setSelectedPsalm(psalm)}
                    className="w-full text-left px-4 py-3 rounded-xl transition-all hover:bg-white/5 active:scale-[0.99]"
                    style={{
                      background: "rgba(46,107,64,0.07)",
                      border: "1px solid rgba(46,107,64,0.12)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          {t("psalter.psalm_n", { n: psalm.number })}
                        </p>
                        <p
                          className="text-[13px] mt-1 line-clamp-2 italic"
                          style={{
                            color: "rgba(200,212,192,0.75)",
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            lineHeight: 1.45,
                          }}
                        >
                          {firstVerseTeaser(psalm.content)}
                        </p>
                      </div>
                      <span className="text-xs shrink-0 mt-0.5" style={{ color: "#8FAF96" }}>
                        ›
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Psalm modal overlay */}
      {selectedPsalm && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
          onClick={() => setSelectedPsalm(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />

          {/* Modal */}
          <div
            className="relative w-full max-w-lg mx-4 mb-0 sm:mb-0 rounded-t-2xl sm:rounded-2xl overflow-hidden"
            style={{
              background: "#0F2818",
              border: "1px solid rgba(46,107,64,0.3)",
              maxHeight: "85vh",
              animation: "psalter-slide-up 0.3s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes psalter-slide-up {
                from { transform: translateY(40px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}</style>

            {/* Modal header — tightened from pt-6 (24px) to pt-3 (12px)
                so the eyebrow + title sit closer to the top edge. The
                earlier value left a visible empty band above the
                eyebrow on the bottom-sheet variant. */}
            <div
              className="px-6 pt-3 pb-4 flex items-start justify-between gap-4"
              style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}
            >
              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5"
                  style={{ color: "rgba(143,175,150,0.5)" }}
                >
                  {t("psalter.psalm_n", { n: selectedPsalm.number })} · {selectedPsalm.bcpRef}
                </p>
                <h2
                  className="text-lg font-bold leading-snug"
                  style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {selectedPsalm.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedPsalm(null)}
                className="text-xl shrink-0 w-8 h-8 flex items-center justify-center rounded-full mt-1"
                style={{ color: "#8FAF96", background: "rgba(200,212,192,0.08)" }}
              >
                ×
              </button>
            </div>

            {/* Psalm body — verses with caesura indent. Bottom padding
                respects the iOS home-indicator safe area and adds a
                comfortable runway below the closing attribution. */}
            <div
              className="px-6 pt-6 overflow-y-auto"
              style={{
                maxHeight: "calc(85vh - 120px)",
                paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {parsePsalmContent(selectedPsalm.content).map((v, i) => (
                  <div key={i} style={{ display: "flex", gap: 10 }}>
                    <span
                      style={{
                        flex: "0 0 auto",
                        minWidth: 22,
                        color: "rgba(143,175,150,0.55)",
                        fontSize: 12,
                        fontFamily: "'Space Grotesk', sans-serif",
                        lineHeight: 1.6,
                        paddingTop: 3,
                      }}
                    >
                      {v.number}
                    </span>
                    <div style={{ flex: 1 }}>
                      {v.lines.map((ln, li) => (
                        <p
                          key={li}
                          style={{
                            fontSize: 15,
                            lineHeight: 1.7,
                            color: "#C8D4C0",
                            margin: 0,
                            paddingLeft: ln.indented ? 20 : 0,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                          }}
                        >
                          {ln.text}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p
                className="text-[11px] mt-6 pt-4 italic"
                style={{
                  color: "rgba(143,175,150,0.4)",
                  borderTop: "1px solid rgba(46,107,64,0.12)",
                }}
              >
                {t("psalter.modal_footer")}
              </p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
