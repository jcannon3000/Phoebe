import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { BCP_PRAYERS, type BcpPrayer } from "@/lib/bcp-prayers";


// Group prayers by category
const CATEGORIES = (() => {
  const map = new Map<string, BcpPrayer[]>();
  for (const p of BCP_PRAYERS) {
    const arr = map.get(p.category) ?? [];
    arr.push(p);
    map.set(p.category, arr);
  }
  return Array.from(map.entries()).map(([category, prayers]) => ({ category, prayers }));
})();

const CATEGORY_EMOJI: Record<string, string> = {
  "For the Church": "⛪",
  "For the Mission of the Church": "✝️",
  "For the Nation": "🏛️",
  "For the World": "🌍",
  "For the Natural Order": "🌿",
  "For the Poor and Neglected": "🤲",
  "For the Sick": "💊",
  "For the Sorrowing": "💔",
  "For Those in Need": "🕊️",
  "For Social Justice": "⚖️",
  "For the Environment": "🌎",
  "For Families": "👨‍👩‍👧‍👦",
};

export default function BcpIntercessionsPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [selectedPrayer, setSelectedPrayer] = useState<BcpPrayer | null>(null);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  // Close modal on Escape key
  useEffect(() => {
    if (!selectedPrayer) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedPrayer(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedPrayer]);

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="mb-6">
          <Link href="/bcp" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            ← Book of Common Prayer
          </Link>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Intercessions 🙏
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Prayers of the People from the Book of Common Prayer
          </p>
        </div>

        {/* Category accordion */}
        <div className="space-y-2">
          {CATEGORIES.map(({ category, prayers }) => {
            const isOpen = openCategory === category;
            const emoji = CATEGORY_EMOJI[category] ?? "🙏";

            return (
              <div key={category}>
                <button
                  onClick={() => setOpenCategory(isOpen ? null : category)}
                  className="w-full text-left p-4 rounded-xl transition-all"
                  style={{
                    background: isOpen ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
                    border: `1px solid ${isOpen ? "rgba(200,212,192,0.25)" : "rgba(200,212,192,0.1)"}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{emoji}</span>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                          {category}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                          {prayers.length} {prayers.length === 1 ? "prayer" : "prayers"}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm" style={{ color: "#8FAF96", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                      ›
                    </span>
                  </div>
                </button>

                {/* Prayers list */}
                {isOpen && (
                  <div className="mt-1 ml-4 space-y-1">
                    {prayers.map((prayer) => (
                      <button
                        key={prayer.title}
                        onClick={() => setSelectedPrayer(prayer)}
                        className="w-full text-left px-4 py-3 rounded-lg transition-all hover:bg-white/5 active:scale-[0.99]"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium" style={{ color: "#C8D4C0" }}>
                            {prayer.title}
                          </p>
                          <span className="text-xs" style={{ color: "#8FAF96" }}>
                            ›
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Prayer modal overlay */}
      {selectedPrayer && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
          onClick={() => setSelectedPrayer(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />

          {/* Modal */}
          <div
            className="relative w-full max-w-lg mx-4 mb-0 sm:mb-0 rounded-t-2xl sm:rounded-2xl overflow-hidden"
            style={{
              background: "#0F2818",
              border: "1px solid rgba(200,212,192,0.2)",
              maxHeight: "85vh",
              animation: "prayer-slide-up 0.3s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes prayer-slide-up {
                from { transform: translateY(40px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}</style>

            {/* Modal header */}
            <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4" style={{ borderBottom: "1px solid rgba(200,212,192,0.1)" }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "rgba(143,175,150,0.5)" }}>
                  {selectedPrayer.category}
                </p>
                <h2
                  className="text-lg font-bold leading-snug"
                  style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {selectedPrayer.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedPrayer(null)}
                className="text-xl shrink-0 w-8 h-8 flex items-center justify-center rounded-full mt-1"
                style={{ color: "#8FAF96", background: "rgba(200,212,192,0.08)" }}
              >
                ×
              </button>
            </div>

            {/* Prayer text */}
            <div className="px-6 py-6 overflow-y-auto" style={{ maxHeight: "calc(85vh - 120px)" }}>
              <p
                className="text-[15px] leading-[2] italic"
                style={{
                  color: "#C8D4C0",
                  fontFamily: "Playfair Display, Georgia, serif",
                }}
              >
                {selectedPrayer.text}
              </p>
              <p className="text-[11px] mt-6 pt-4 italic" style={{ color: "rgba(143,175,150,0.4)", borderTop: "1px solid rgba(200,212,192,0.08)" }}>
                From the Book of Common Prayer
              </p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
