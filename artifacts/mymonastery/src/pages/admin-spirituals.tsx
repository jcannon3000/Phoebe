/**
 * /admin/spirituals — the library of Slave Songs of the United States (1867).
 *
 * Owner: "make a library of all the negro spirituals … we want the text of
 * each like they are canticles so we could use them … and include metadata …
 * and put the library in admin tools."
 *
 * All 136 songs, searchable over everything the day's suggestion can match on:
 * title, region, where it was collected, who wrote it down, and the text
 * itself. Tapping one opens the whole canticle with its metadata, the
 * collectors' glosses, the editors' headnote, and the engraved music.
 *
 * The text shown is the EXPANDED one — the book abbreviates later verses to
 * their changing line, or trails them off into "&c.", because it was printed
 * for singers who already knew the tune. "As printed" flips any song back to
 * the book's own lines so a claim in this catalogue can be checked against the
 * source without leaving the page.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  SPIRITUALS, SPIRITUALS_SOURCE, type Spiritual,
} from "@/lib/spiritualsCatalogue";
import { openExternal } from "@/lib/openExternal";
import { apiRequest } from "@/lib/queryClient";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

function norm(s: string): string {
  try { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  catch { return s.toLowerCase(); }
}

/** Everything a search can land on, including the sung text. */
function hay(s: Spiritual): string {
  return norm([
    s.number, s.title, s.region ?? "", s.collectedAt ?? "", s.contributor ?? "",
    s.commentary ?? "", ...s.glosses,
    ...s.stanzas.flatMap((st) => st.lines),
  ].join(" "));
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sacred", label: "Spirituals" },
  { key: "I", label: "South-Eastern" },
  { key: "II", label: "Northern Seaboard" },
  { key: "III", label: "Inland" },
  { key: "IV", label: "Gulf States" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default function AdminSpiritualsPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openNo, setOpenNo] = useState<number | null>(null);
  const [asPrinted, setAsPrinted] = useState(false);

  // Super-admin gate — same endpoint and explicit queryFn as the art library.
  const { data: who, isLoading: whoLoading } = useQuery<{ isSuperAdmin: boolean }>({
    queryKey: ["/api/admin/am-super"],
    queryFn: () => apiRequest("GET", "/api/admin/am-super") as Promise<{ isSuperAdmin: boolean }>,
  });

  const results = useMemo(() => {
    const q = norm(query.trim());
    const words = q ? q.split(/\s+/).filter(Boolean) : [];
    return SPIRITUALS.filter((s) => {
      if (filter === "sacred" && !s.sacred) return false;
      if (filter !== "all" && filter !== "sacred" && s.part !== filter) return false;
      if (!words.length) return true;
      const h = hay(s);
      return words.every((w) => h.includes(w));
    });
  }, [query, filter]);

  const open = openNo != null ? SPIRITUALS.find((s) => s.number === openNo) ?? null : null;

  const meta = (label: string, value: string | null | undefined) => value ? (
    <div style={{ marginTop: 10 }}>
      <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: 0 }}>{label}</p>
      <p style={{ color: WARM, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.55, margin: "3px 0 0", overflowWrap: "anywhere" }}>{value}</p>
    </div>
  ) : null;

  if (whoLoading) return <div style={{ minHeight: "100dvh", background: BG }} />;
  if (!who?.isSuperAdmin) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15 }}>This page is for app administrators.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: BG, padding: "calc(env(safe-area-inset-top) + 14px) 16px calc(env(safe-area-inset-bottom) + 24px)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
          <button type="button" onClick={() => setLocation("/admin/tools")}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer", padding: 6 }}>
            ← Admin
          </button>
          <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>Spirituals</span>
          <span style={{ width: 60 }} />
        </div>

        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 4px" }}>
          {SPIRITUALS.length} songs from <i style={{ fontFamily: SERIF }}>{SPIRITUALS_SOURCE.title}</i> ({SPIRITUALS_SOURCE.year}) — the first
          published collection of African-American sacred song, written down from
          formerly enslaved singers. Tap one for the full text and its metadata.
        </p>
        <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11.5, lineHeight: 1.5, margin: "0 0 12px" }}>
          Spelling is the 1867 editors' own rendering of Gullah and
          African-American speech, kept verbatim as a primary source.
        </p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — title, words, place, who wrote it down…"
          inputMode="search"
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 15, padding: "12px 14px",
            borderRadius: 12, outline: "none", color: WARM, fontFamily: FONT,
            background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
          }}
        />

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 8px" }}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              style={{
                userSelect: "none", WebkitTapHighlightColor: "transparent",
                borderRadius: 999, padding: "7px 13px", fontSize: 12.5, fontWeight: 600,
                fontFamily: FONT, cursor: "pointer", color: WARM,
                background: filter === f.key ? "rgba(46,107,64,0.6)" : "rgba(240,237,230,0.06)",
                border: filter === f.key ? "1px solid rgba(143,175,150,0.65)" : `1px solid ${BORDER}`,
              }}>
              {f.label}
            </button>
          ))}
        </div>
        <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "0 0 10px" }}>{results.length} shown</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((s) => (
            <button key={s.number} type="button" onClick={() => { setOpenNo(s.number); setAsPrinted(false); }}
              style={{
                userSelect: "none", WebkitTapHighlightColor: "transparent",
                display: "flex", alignItems: "baseline", gap: 10, padding: "11px 13px",
                borderRadius: 12, cursor: "pointer", textAlign: "left", width: "100%",
                background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
              }}>
              <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11.5, minWidth: 26 }}>{s.number}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", color: WARM, fontFamily: SERIF, fontSize: 15.5, fontStyle: "italic", lineHeight: 1.3 }}>
                  {s.title}
                </span>
                <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11.5, marginTop: 3 }}>
                  {[s.collectedAt, s.contributor].filter(Boolean).join(" · ") || s.region}
                </span>
              </span>
              {!s.sacred && (
                <span style={{ color: FAINT, fontFamily: FONT, fontSize: 9.5, letterSpacing: "0.12em", border: `1px solid ${BORDER}`, borderRadius: 999, padding: "2px 7px" }}>
                  SECULAR
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <div role="dialog" aria-modal="true" onClick={() => setOpenNo(null)}
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(4,12,7,0.85)", overflowY: "auto", padding: "24px 16px" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#0c1f13", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 18, maxWidth: 620, margin: "0 auto", boxSizing: "border-box" }}>

            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", margin: 0 }}>
              No. {open.number} · Page {open.bookPage ?? "—"}
            </p>
            <p style={{ color: WARM, fontFamily: SERIF, fontSize: 22, fontStyle: "italic", margin: "5px 0 2px", lineHeight: 1.25 }}>
              {open.title}
            </p>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12.5, margin: 0 }}>
              {[open.collectedAt, open.contributor].filter(Boolean).join(" · ")}
            </p>

            {/* The canticle itself. */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
              {open.stanzas.map((st, i) => (
                <div key={i} style={{ marginBottom: 14, display: "flex", gap: 10 }}>
                  <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, minWidth: 16, paddingTop: 4 }}>
                    {st.number ?? ""}
                  </span>
                  <p style={{ margin: 0, color: WARM, fontFamily: SERIF, fontSize: 16, fontStyle: "italic", lineHeight: 1.72, whiteSpace: "pre-line" }}>
                    {(asPrinted ? st.printedAs : st.lines).join("\n")}
                    {!asPrinted && st.expanded && (
                      <span title="The book abbreviated this verse; it is written out here."
                        style={{ color: FAINT, fontFamily: FONT, fontSize: 9.5, fontStyle: "normal", letterSpacing: "0.1em", marginLeft: 8 }}>
                        ●
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>

            {open.stanzas.some((st) => st.expanded) && (
              <button type="button" onClick={() => setAsPrinted((v) => !v)}
                style={{
                  userSelect: "none", WebkitTapHighlightColor: "transparent",
                  borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 600,
                  fontFamily: FONT, cursor: "pointer", color: SAGE,
                  background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
                }}>
                {asPrinted ? "Show written out" : "Show as printed in 1867"}
              </button>
            )}

            {open.glosses.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: 0 }}>
                  The collectors' notes
                </p>
                {open.glosses.map((g, i) => (
                  <p key={i} style={{ color: SAGE, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.5, margin: "4px 0 0" }}>— {g}</p>
                ))}
              </div>
            )}

            {open.commentary && (
              <div style={{ marginTop: 14 }}>
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: 0 }}>
                  The editors' headnote
                </p>
                <p style={{ color: SAGE, fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.6, margin: "4px 0 0" }}>{open.commentary}</p>
              </div>
            )}

            {meta("Region", [open.region, open.regionIncludes].filter(Boolean).join(" — "))}
            {meta("Kind", open.sacred ? "Spiritual" : "Secular — the editors present this as a work, play or Creole song")}

            {open.sheetMusic && (
              <div style={{ marginTop: 14 }}>
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 6px" }}>
                  As engraved
                </p>
                <img src={open.sheetMusic} alt={`Music for ${open.title}`} loading="lazy" decoding="async"
                  style={{ width: "100%", borderRadius: 8, background: "#f5f2ea" }} />
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => openExternal(SPIRITUALS_SOURCE.url, { reader: false })}
                style={{ flex: 1, background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`, color: SAGE, borderRadius: 999, padding: "11px 16px", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
                The source ↗
              </button>
              <button type="button" onClick={() => setOpenNo(null)}
                style={{ flex: 1, background: "rgba(46,107,64,0.55)", border: `1px solid ${BORDER}`, color: WARM, borderRadius: 999, padding: "11px 16px", fontSize: 13.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
