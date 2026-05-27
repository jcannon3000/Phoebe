import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { BCP_COLLECTS, type BcpCollect, localizeBcpCollect } from "@/lib/bcp-collects";

// BCP Collects index — sibling to /bcp/intercessions, structured the
// same way (category accordion + search + per-collect modal). Data
// source is the curated list in lib/bcp-collects.ts.
//
// Categories: "Morning Prayer" / "Evening Prayer" / "Daily Devotions"
// / "Other Loved Collects". Order in the dropdown follows the order
// each category first appears in BCP_COLLECTS, which is the order
// they appear in the BCP itself.

const CATEGORIES = (() => {
  const map = new Map<string, BcpCollect[]>();
  for (const c of BCP_COLLECTS) {
    const arr = map.get(c.category) ?? [];
    arr.push(c);
    map.set(c.category, arr);
  }
  return Array.from(map.entries()).map(([category, collects]) => ({ category, collects }));
})();

// Same visual language as the intercessions page — emoji per
// category keeps the index scannable.
const CATEGORY_EMOJI: Record<string, string> = {
  "Morning Prayer": "🌅",
  "Evening Prayer": "🌙",
  "Daily Devotions": "🕯️",
  "Other Loved Collects": "📜",
};

export default function BcpCollectsPage() {
  const { user, isLoading } = useAuth();
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [selectedCollect, setSelectedCollect] = useState<BcpCollect | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  // Close modal on Escape, mirroring the intercessions page.
  useEffect(() => {
    if (!selectedCollect) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedCollect(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCollect]);

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            {t("bcp_collects.back_dashboard")}
          </Link>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {t("bcp_collects.title")} 📜
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            {t("bcp_collects.subtitle")}
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("bcp_collects.search_placeholder")}
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

        {/* Search results — flat list */}
        {query.trim() ? (() => {
          const needle = query.trim().toLowerCase();
          // Match across both English and Spanish fields.
          const results = BCP_COLLECTS.filter(
            (c) =>
              c.title.toLowerCase().includes(needle) ||
              c.category.toLowerCase().includes(needle) ||
              c.text.toLowerCase().includes(needle) ||
              (c.titleEs ?? "").toLowerCase().includes(needle) ||
              (c.textEs ?? "").toLowerCase().includes(needle),
          );
          return results.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
              {t("bcp_collects.no_results", { query })}
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "rgba(143,175,150,0.4)" }}>
                {t("saints.results_count", { count: results.length })}
              </p>
              {results.map((collect) => {
                const loc = localizeBcpCollect(collect, i18n.language);
                return (
                  <button
                    key={collect.title}
                    onClick={() => setSelectedCollect(collect)}
                    className="w-full text-left px-4 py-3 rounded-xl transition-all hover:bg-white/5 active:scale-[0.99]"
                    style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(46,107,64,0.12)" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium" style={{ color: "#C8D4C0" }}>{loc.title}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.5)" }}>
                          {CATEGORY_EMOJI[collect.category] ?? "📜"} {loc.category}
                        </p>
                      </div>
                      <span className="text-xs shrink-0 mt-0.5" style={{ color: "#8FAF96" }}>›</span>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })() : (
          /* Category accordion — shown when not searching */
          <div className="space-y-2">
            {CATEGORIES.map(({ category, collects }) => {
              const isOpen = openCategory === category;
              const emoji = CATEGORY_EMOJI[category] ?? "📜";
              const localizedCategory = collects[0]
                ? localizeBcpCollect(collects[0], i18n.language).category
                : category;

              return (
                <div key={category}>
                  <button
                    onClick={() => setOpenCategory(isOpen ? null : category)}
                    className="w-full text-left p-4 rounded-xl transition-all"
                    style={{
                      background: isOpen ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
                      border: `1px solid ${isOpen ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.15)"}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{emoji}</span>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                            {localizedCategory}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                            {t("bcp_collects.collects_count", { count: collects.length })}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm" style={{ color: "#8FAF96", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                        ›
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-1 ml-4 space-y-1">
                      {collects.map((collect) => {
                        const loc = localizeBcpCollect(collect, i18n.language);
                        return (
                          <button
                            key={collect.title}
                            onClick={() => setSelectedCollect(collect)}
                            className="w-full text-left px-4 py-3 rounded-lg transition-all hover:bg-white/5 active:scale-[0.99]"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium" style={{ color: "#C8D4C0" }}>{loc.title}</p>
                              <span className="text-xs" style={{ color: "#8FAF96" }}>›</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Collect modal overlay */}
      {selectedCollect && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
          onClick={() => setSelectedCollect(null)}
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
              animation: "collect-slide-up 0.3s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes collect-slide-up {
                from { transform: translateY(40px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}</style>

            {/* Modal header — IIFE so we resolve locale once for header+body */}
            {(() => {
              const loc = localizeBcpCollect(selectedCollect, i18n.language);
              return (
                <>
                  <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "rgba(143,175,150,0.5)" }}>
                        {loc.category}
                      </p>
                      <h2
                        className="text-lg font-bold leading-snug"
                        style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {loc.title}
                      </h2>
                    </div>
                    <button
                      onClick={() => setSelectedCollect(null)}
                      className="text-xl shrink-0 w-8 h-8 flex items-center justify-center rounded-full mt-1"
                      style={{ color: "#8FAF96", background: "rgba(200,212,192,0.08)" }}
                    >
                      ×
                    </button>
                  </div>

                  {/* Collect text */}
                  <div className="px-6 py-6 overflow-y-auto" style={{ maxHeight: "calc(85vh - 120px)" }}>
                    <p
                      className="text-[15px] leading-[2] italic"
                      style={{
                        color: "#C8D4C0",
                        fontFamily: "Georgia, 'Times New Roman', serif",
                      }}
                    >
                      {loc.text}
                    </p>
                    <p className="text-[11px] mt-6 pt-4 italic" style={{ color: "rgba(143,175,150,0.4)", borderTop: "1px solid rgba(46,107,64,0.12)" }}>
                      {t("bcp_collects.from_bcp")}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </Layout>
  );
}
