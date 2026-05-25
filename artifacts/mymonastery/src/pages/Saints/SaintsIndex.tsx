import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import {
  SAINTS,
  type Saint,
  searchSaints,
  feastDateLabel,
  intentionLabel,
  RANK_LABELS,
} from "@/data/saints";

// Saints — a browsable, searchable reference index of the Episcopal
// calendar's commemorations, built in the same shape as the BCP Prayers and
// Psalter screens: a search box, a month accordion when idle, and a modal
// that reads each commemoration like a database entry. No devotional CTA —
// just the record (dates, "known for," patronage, collect, Anglican note).

const SANS = "'Space Grotesk', sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Saints grouped by feast month (calendar order), days sorted within.
// Computed once — the seed is static.
const BY_MONTH = (() => {
  const groups: { month: number; name: string; saints: Saint[] }[] = [];
  for (let m = 1; m <= 12; m++) {
    const saints = SAINTS.filter((s) => s.feastDate.month === m).sort(
      (a, b) => a.feastDate.day - b.feastDate.day,
    );
    if (saints.length) groups.push({ month: m, name: MONTH_NAMES[m - 1], saints });
  }
  return groups;
})();

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function SaintsIndex() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Saint | null>(null);
  // Default the accordion open to the current month so today's calendar is
  // one tap away without forcing a devotional "today" surface.
  const [openMonth, setOpenMonth] = useState<number | null>(new Date().getMonth() + 1);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  useEffect(() => {
    if (!selected) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);

  if (isLoading || !user) return null;

  const results = query.trim() ? searchSaints(query) : [];

  // A list row (used in both search results and the month accordion).
  function Row({ s }: { s: Saint }) {
    return (
      <button
        onClick={() => setSelected(s)}
        className="w-full text-left px-4 py-3 rounded-xl transition-all hover:bg-white/5 active:scale-[0.99]"
        style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(46,107,64,0.12)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: "#F0EDE6", fontFamily: SERIF }}>
              {s.name}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SANS }}>
              {feastDateLabel(s.feastDate)} · {RANK_LABELS[s.rank]}
            </p>
          </div>
          <span className="text-xs shrink-0 mt-0.5" style={{ color: "#8FAF96" }}>›</span>
        </div>
      </button>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: SANS }}>
            Saints 📿
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            The Episcopal calendar of commemorations — search by name, need, or vocation
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saints by name, need, or vocation…"
            className="w-full text-sm px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/30 focus:border-[#8FAF96]/60 transition-all"
            style={{ backgroundColor: "#091A10", borderColor: "rgba(46,107,64,0.3)", color: "#F0EDE6" }}
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

        {query.trim() ? (
          results.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
              No saints found for "{query}"
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "rgba(143,175,150,0.4)" }}>
                {results.length} {results.length === 1 ? "result" : "results"}
              </p>
              {results.map((s) => <Row key={s.id} s={s} />)}
            </div>
          )
        ) : (
          /* Month accordion — shown when not searching */
          <div className="space-y-2">
            {BY_MONTH.map(({ month, name, saints }) => {
              const isOpen = openMonth === month;
              return (
                <div key={month}>
                  <button
                    onClick={() => setOpenMonth(isOpen ? null : month)}
                    className="w-full text-left p-4 rounded-xl transition-all"
                    style={{
                      background: isOpen ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
                      border: `1px solid ${isOpen ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.15)"}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: "#F0EDE6", fontFamily: SANS }}>
                          {name}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                          {saints.length} {saints.length === 1 ? "commemoration" : "commemorations"}
                        </p>
                      </div>
                      <span className="text-sm" style={{ color: "#8FAF96", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                        ›
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-1 ml-2 space-y-1">
                      {saints.map((s) => <Row key={s.id} s={s} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-center mt-8" style={{ color: "rgba(143,175,150,0.4)", fontFamily: SANS }}>
          {SAINTS.length} commemorations · Lesser Feasts &amp; Fasts (2022) and A Great Cloud of Witnesses
        </p>
      </div>

      {/* Saint modal — reads like a database entry. */}
      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
          onClick={() => setSelected(null)}
        >
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />

          <div
            className="relative w-full max-w-lg mx-4 rounded-t-2xl sm:rounded-2xl overflow-hidden"
            style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)", maxHeight: "85vh", animation: "saint-slide-up 0.3s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes saint-slide-up {
                from { transform: translateY(40px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}</style>

            {/* Modal header */}
            <div className="px-6 pt-4 pb-4 flex items-start justify-between gap-4" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "rgba(143,175,150,0.5)" }}>
                  {RANK_LABELS[selected.rank]} · {feastDateLabel(selected.feastDate)}
                </p>
                <h2 className="text-xl leading-snug" style={{ color: "#F0EDE6", fontFamily: SERIF, fontWeight: 400 }}>
                  {selected.name}
                </h2>
                {selected.yearsLived && (
                  <p className="text-[13px] mt-1" style={{ color: "#8FAF96", fontFamily: SANS }}>
                    {selected.yearsLived}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-xl shrink-0 w-8 h-8 flex items-center justify-center rounded-full mt-1"
                style={{ color: "#8FAF96", background: "rgba(200,212,192,0.08)" }}
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-6 overflow-y-auto" style={{ maxHeight: "calc(85vh - 150px)" }}>
              {selected.vocation.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {selected.vocation.map((v) => (
                    <span
                      key={v}
                      className="rounded-full px-2.5 py-0.5 text-[11px]"
                      style={{ background: "rgba(46,107,64,0.14)", border: "1px solid rgba(46,107,64,0.3)", color: "rgba(168,197,160,0.95)", fontFamily: SANS }}
                    >
                      {cap(v)}
                    </span>
                  ))}
                </div>
              )}

              {selected.knownFor && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                    Known for
                  </p>
                  <p className="text-[15px] leading-relaxed" style={{ color: "#C8D4C0", fontFamily: SERIF }}>
                    {selected.knownFor}
                  </p>
                </>
              )}

              {selected.patronOf.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mt-6 mb-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                    Traditionally invoked for
                  </p>
                  <p className="text-[15px] leading-relaxed" style={{ color: "#C8D4C0", fontFamily: SERIF }}>
                    {selected.patronOf.join(", ")}
                  </p>
                </>
              )}

              {selected.collectExcerpt && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mt-6 mb-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                    From the collect
                  </p>
                  <p className="text-[16px] leading-relaxed pl-3 italic" style={{ color: "rgba(168,197,160,0.95)", fontFamily: SERIF, borderLeft: "2px solid rgba(46,107,64,0.5)" }}>
                    {selected.collectExcerpt}
                  </p>
                </>
              )}

              {selected.anglicanNote && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mt-6 mb-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                    In the Anglican tradition
                  </p>
                  <p className="text-[14px] leading-relaxed" style={{ color: "rgba(200,212,192,0.82)", fontFamily: SERIF }}>
                    {selected.anglicanNote}
                  </p>
                </>
              )}

              {selected.intercedesFor.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mt-6 mb-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                    A companion in
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.intercedesFor.map((i) => (
                      <span
                        key={i}
                        className="rounded-full px-3 py-1 text-[12px]"
                        style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)", color: "#8FAF96", fontFamily: SANS }}
                      >
                        {intentionLabel(i)}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <p className="text-[11px] mt-7 pt-4 italic" style={{ color: "rgba(143,175,150,0.4)", borderTop: "1px solid rgba(46,107,64,0.12)" }}>
                From Lesser Feasts &amp; Fasts (2022) and A Great Cloud of Witnesses. Collect excerpts from the 1979 Book of Common Prayer (public domain).
              </p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
