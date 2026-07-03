import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";

// ── Prayers for the Climate ──────────────────────────────────────────────────
//
// A reading library of the collects, canticles, affirmations, litanies,
// prayers, blessings, readings, and quotes gathered in *Season of Creation: A
// Celebration Guide for Episcopal Parishes* (2025). Lives under PRACTICES.
// Data comes from /api/creation/library (shared with the Creation Prayer
// office).
//
// Shape (owner, 2026-07-03): a TITLE-FIRST list — every entry is a tappable
// title row that expands to the full text (accordion), with a SEARCH field
// filtering across titles, authors, and the prayer text itself. No more wall
// of paragraphs.

const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const BODY = "#E4EADD";

interface Collect { title: string; attribution?: string; text: string; }
interface Prayer { title: string; attribution?: string; note?: string; text: string; }
interface Blessing { text: string; attribution?: string; }
interface Reading { ref: string; note: string; }
interface Quote { author: string; source?: string; text: string; }
interface Canticle { title: string; attribution?: string; text: string; }
interface Affirmation { title: string; attribution?: string; text: string; }
interface Litany { title: string; intro?: string; lines: Array<{ v: string; r: string }>; }
interface Library { collects: Collect[]; canticles: Canticle[]; affirmations: Affirmation[]; litanies: Litany[]; prayers: Prayer[]; blessings: Blessing[]; readings: Reading[]; quotes: Quote[]; }

// One row of the library, whatever its genre: a title (+optional subtitle) that
// expands to a body. Litanies carry call-and-response lines instead of text.
type Entry = {
  id: string;
  title: string;
  subtitle?: string;
  note?: string;
  text?: string;
  lines?: Array<{ v: string; r: string }>;
  intro?: string;
};
type Section = { heading: string; entries: Entry[] };

// A blessing has no title of its own — its first line IS its name.
function blessingTitle(text: string): string {
  const first = text.split("\n")[0].trim();
  return first.length > 56 ? `${first.slice(0, 53)}…` : first;
}

function buildSections(lib: Library): Section[] {
  return [
    { heading: "Collects", entries: lib.collects.map((c, i) => ({ id: `col${i}`, title: c.title, subtitle: c.attribution, text: c.text })) },
    { heading: "Canticles", entries: lib.canticles.map((c, i) => ({ id: `can${i}`, title: c.title, subtitle: c.attribution, text: c.text })) },
    { heading: "Affirmations of Faith", entries: lib.affirmations.map((a, i) => ({ id: `aff${i}`, title: a.title, subtitle: a.attribution, text: a.text })) },
    { heading: "Litanies", entries: lib.litanies.map((l, i) => ({ id: `lit${i}`, title: l.title, lines: l.lines, intro: l.intro })) },
    { heading: "Prayers", entries: lib.prayers.map((p, i) => ({ id: `pra${i}`, title: p.title, subtitle: p.attribution, note: p.note, text: p.text })) },
    { heading: "Closing Prayers & Blessings", entries: lib.blessings.map((b, i) => ({ id: `ble${i}`, title: blessingTitle(b.text), subtitle: b.attribution, text: b.text })) },
    { heading: "Readings for Creation", entries: lib.readings.map((r, i) => ({ id: `rea${i}`, title: r.ref, text: r.note })) },
    { heading: "Words on Creation", entries: lib.quotes.map((q, i) => ({ id: `quo${i}`, title: q.author, subtitle: q.source, text: q.text })) },
  ];
}

function entryMatches(e: Entry, q: string): boolean {
  const hay = [e.title, e.subtitle, e.note, e.text, e.intro, ...(e.lines ?? []).flatMap((l) => [l.v, l.r])]
    .filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

export default function CreationPrayersPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!CREATION_PRAYER_ENABLED) { setLocation("/"); return; }
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  const { data, isLoading: libLoading } = useQuery<Library>({
    queryKey: ["/api/creation/library"],
    queryFn: () => apiRequest("GET", "/api/creation/library"),
    staleTime: 60 * 60 * 1000,
    enabled: !!user && CREATION_PRAYER_ENABLED,
  });

  const sections = useMemo(() => (data ? buildSections(data) : []), [data]);
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => sections
      .map((s) => ({ ...s, entries: q ? s.entries.filter((e) => entryMatches(e, q)) : s.entries }))
      .filter((s) => s.entries.length > 0),
    [sections, q],
  );

  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (!CREATION_PRAYER_ENABLED) return null;
  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <header className="mb-4">
          <Link href="/menu/practices" className="text-sm mb-3 inline-block" style={{ color: SAGE }}>← Practices</Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: CREAM, fontFamily: FONT }}>Prayers for the Climate 🌍</h1>
          <p className="text-sm" style={{ color: SAGE }}>
            Collects, prayers, blessings, and words on creation — gathered from the Episcopal Season of Creation guide. Tap a title to read it.
          </p>
        </header>

        {/* Search — filters titles, authors, and the prayer text itself. */}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prayers, authors, phrases…"
          aria-label="Search the prayer library"
          className="w-full rounded-xl mb-2"
          style={{ background: "rgba(9,26,16,0.35)", border: "1px solid rgba(46,107,64,0.35)", color: CREAM, fontFamily: FONT, fontSize: 15, padding: "12px 14px", outline: "none", colorScheme: "dark" }}
        />

        {libLoading || !data ? (
          <p className="text-sm mt-6" style={{ color: SAGE_DIM, fontFamily: FONT }}>Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm mt-6" style={{ color: SAGE_DIM, fontFamily: FONT }}>Nothing matches “{query.trim()}” — try a different word.</p>
        ) : (
          <>
            {visible.map((s) => (
              <div key={s.heading}>
                <h2 className="mt-8 mb-2" style={{ fontFamily: FONT, fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7E9A85", fontWeight: 700 }}>
                  {s.heading}
                </h2>
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(46,107,64,0.18)" }}>
                  {s.entries.map((e, i) => {
                    const isOpen = open.has(e.id);
                    return (
                      <div key={e.id} style={{ background: "rgba(46,107,64,0.08)", borderTop: i > 0 ? "1px solid rgba(46,107,64,0.15)" : "none" }}>
                        <button
                          onClick={() => toggle(e.id)}
                          aria-expanded={isOpen}
                          className="w-full text-left flex items-center gap-3"
                          style={{ background: "none", border: "none", padding: "13px 16px", cursor: "pointer" }}
                        >
                          <span aria-hidden style={{ color: SAGE_DIM, fontSize: 11, flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 160ms ease" }}>▶</span>
                          <span className="flex-1 min-w-0">
                            <span style={{ display: "block", fontFamily: FONT, fontSize: 15, fontWeight: 600, color: CREAM }}>{e.title}</span>
                            {e.subtitle && <span style={{ display: "block", fontFamily: FONT, fontSize: 12, color: SAGE_DIM, marginTop: 1 }}>{e.subtitle}</span>}
                          </span>
                        </button>
                        {isOpen && (
                          <div style={{ padding: "0 16px 15px 30px" }}>
                            {e.intro && <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.55, color: "rgba(228,234,221,0.85)", fontStyle: "italic", marginBottom: 8 }}>{e.intro}</p>}
                            {e.lines
                              ? e.lines.map((ln, j) => (
                                <div key={j} style={{ marginBottom: 8 }}>
                                  <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.55, color: BODY }}>{ln.v}</p>
                                  <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.55, color: SAGE, fontWeight: 600 }}>{ln.r}</p>
                                </div>
                              ))
                              : <p style={{ fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.62, color: BODY, whiteSpace: "pre-line" }}>{e.text}</p>}
                            {e.note && <p style={{ fontFamily: FONT, fontSize: 12, lineHeight: 1.5, color: SAGE_DIM, marginTop: 8, fontStyle: "italic" }}>{e.note}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <p style={{ fontFamily: FONT, fontSize: 12, lineHeight: 1.6, color: "rgba(143,175,150,0.55)", marginTop: 28, paddingTop: 16, borderTop: "1px solid rgba(143,175,150,0.16)" }}>
              Gathered from <span style={{ fontStyle: "italic" }}>Season of Creation: A Celebration Guide for Episcopal Parishes</span> (2025), which draws prayers from across the Anglican Communion and beyond; each keeps its own attribution.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
