import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";

// ── Prayers for the Climate ──────────────────────────────────────────────────
//
// A reading library of the collects, prayers, closing blessings, and quotes on
// creation gathered in *Season of Creation: A Celebration Guide for Episcopal
// Parishes* (2025). Lives under the Book of Common Prayer. Data comes from
// /api/creation/library (a single source of truth shared with the devotion).

const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

interface Collect { title: string; attribution?: string; text: string; }
interface Prayer { title: string; attribution?: string; note?: string; text: string; }
interface Blessing { text: string; attribution?: string; }
interface Reading { ref: string; note: string; }
interface Quote { author: string; source?: string; text: string; }
interface Canticle { title: string; attribution?: string; text: string; }
interface Affirmation { title: string; attribution?: string; text: string; }
interface Litany { title: string; intro?: string; lines: Array<{ v: string; r: string }>; }
interface Library { collects: Collect[]; canticles: Canticle[]; affirmations: Affirmation[]; litanies: Litany[]; prayers: Prayer[]; blessings: Blessing[]; readings: Reading[]; quotes: Quote[]; }

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-9 mb-3" style={{ fontFamily: FONT, fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7E9A85", fontWeight: 700 }}>
      {children}
    </h2>
  );
}

function PrayerCard({ title, attribution, note, text }: { title?: string; attribution?: string; note?: string; text: string }) {
  return (
    <div className="rounded-2xl px-5 py-4 mb-3" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.18)" }}>
      {title && <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: "#F0EDE6", marginBottom: 6 }}>{title}</p>}
      <p style={{ fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.62, color: "#E4EADD", whiteSpace: "pre-line" }}>{text}</p>
      {note && <p style={{ fontFamily: FONT, fontSize: 12, lineHeight: 1.5, color: "rgba(143,175,150,0.7)", marginTop: 8, fontStyle: "italic" }}>{note}</p>}
      {attribution && <p style={{ fontFamily: FONT, fontSize: 12, color: "rgba(143,175,150,0.6)", marginTop: 8 }}>— {attribution}</p>}
    </div>
  );
}

export default function CreationPrayersPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Creation Prayer is hidden for now — bounce any direct navigation home.
    if (!CREATION_PRAYER_ENABLED) { setLocation("/"); return; }
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  const { data, isLoading: libLoading } = useQuery<Library>({
    queryKey: ["/api/creation/library"],
    queryFn: () => apiRequest("GET", "/api/creation/library"),
    staleTime: 60 * 60 * 1000,
    enabled: !!user && CREATION_PRAYER_ENABLED,
  });

  if (!CREATION_PRAYER_ENABLED) return null;
  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <header className="mb-4">
          <Link href="/menu/bcp" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>← Book of Common Prayer</Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: FONT }}>Prayers for the Climate 🌍</h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Collects, prayers, blessings, and words on creation — gathered from the Episcopal Season of Creation guide
          </p>
        </header>

        {libLoading || !data ? (
          <p className="text-sm mt-6" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>Loading…</p>
        ) : (
          <>
            <SectionHeader>Collects</SectionHeader>
            {data.collects.map((c, i) => (
              <PrayerCard key={`c${i}`} title={c.title} attribution={c.attribution} text={c.text} />
            ))}

            <SectionHeader>Canticles</SectionHeader>
            {data.canticles.map((c, i) => (
              <PrayerCard key={`ca${i}`} title={c.title} attribution={c.attribution} text={c.text} />
            ))}

            <SectionHeader>Affirmations of Faith</SectionHeader>
            {data.affirmations.map((a, i) => (
              <PrayerCard key={`af${i}`} title={a.title} attribution={a.attribution} text={a.text} />
            ))}

            <SectionHeader>Litanies</SectionHeader>
            {data.litanies.map((lit, i) => (
              <div key={`li${i}`} className="rounded-2xl px-5 py-4 mb-3" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.18)" }}>
                <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: "#F0EDE6", marginBottom: 6 }}>{lit.title}</p>
                {lit.intro && <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.55, color: "rgba(228,234,221,0.85)", fontStyle: "italic", marginBottom: 8 }}>{lit.intro}</p>}
                {lit.lines.map((ln, j) => (
                  <div key={j} style={{ marginBottom: 8 }}>
                    <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.55, color: "#E4EADD" }}>{ln.v}</p>
                    <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.55, color: "#8FAF96", fontWeight: 600 }}>{ln.r}</p>
                  </div>
                ))}
              </div>
            ))}

            <SectionHeader>Prayers</SectionHeader>
            {data.prayers.map((p, i) => (
              <PrayerCard key={`p${i}`} title={p.title} attribution={p.attribution} note={p.note} text={p.text} />
            ))}

            <SectionHeader>Closing Prayers &amp; Blessings</SectionHeader>
            {data.blessings.map((b, i) => (
              <PrayerCard key={`b${i}`} attribution={b.attribution} text={b.text} />
            ))}

            <SectionHeader>Readings for Creation</SectionHeader>
            <div className="rounded-2xl px-5 py-4 mb-3" style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.15)" }}>
              {data.readings.map((r, i) => (
                <div key={`r${i}`} className="py-1.5" style={{ borderBottom: i < data.readings.length - 1 ? "1px solid rgba(200,212,192,0.08)" : "none" }}>
                  <p style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: "#F0EDE6" }}>{r.ref}</p>
                  <p style={{ fontFamily: SERIF, fontSize: 13, color: "rgba(143,175,150,0.8)", fontStyle: "italic" }}>{r.note}</p>
                </div>
              ))}
            </div>

            <SectionHeader>Quotes on Creation</SectionHeader>
            {data.quotes.map((q, i) => (
              <div key={`q${i}`} className="mb-4 pl-4" style={{ borderLeft: "2px solid rgba(46,107,64,0.35)" }}>
                <p style={{ fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.6, color: "#E4EADD", fontStyle: "italic" }}>“{q.text}”</p>
                <p style={{ fontFamily: FONT, fontSize: 12.5, color: "rgba(143,175,150,0.7)", marginTop: 4 }}>
                  — {q.author}{q.source ? `, ${q.source}` : ""}
                </p>
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
