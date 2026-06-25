import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { getPsalmCycle } from "@/lib/officePrefs";
import { markPsalmsPrayed } from "@/lib/cacReadState";

// ── /psalms — Praying the Psalms reader ─────────────────────────────────────
//
// Opens the psalms appointed for today (per the chosen cycle: the daily-office
// lectionary, or the traditional 30-day monthly Psalter) from /api/psalms/today
// and renders them from the seeded BCP Psalter. Reading them marks the day's
// Praying-the-Psalms practice done (the home card flips to "Prayed").

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

// Shown while today's psalms load — a quiet word on praying the Psalter. One is
// picked at random each time the reader opens.
const PSALM_LOADING_QUOTES: Array<{ text: string; author: string }> = [
  { text: "My strength returns to me with my cup of coffee and the reading of the psalms.", author: "Dorothy Day" },
  { text: "In the Psalter you learn about yourself. You find depicted in it all the movements of your soul, all its changes, its ups and downs, its failures and recoveries.", author: "Athanasius" },
];

type Psalm = {
  number: number;
  title: string;
  bcpRef: string;
  content: string;
  range: [number, number] | null;
  raw: string;
};

// Render one psalm's BCP text: verse lines start with "N " (the verse number),
// continuation lines are indented. Style the verse number quietly and keep the
// half-verse asterisk + line breaks of the pointed text.
function PsalmText({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div style={{ fontFamily: SERIF, color: "#E8E4D8", fontSize: 17, lineHeight: 1.65 }}>
      {lines.map((line, i) => {
        const m = line.match(/^(\d+)\s+(.*)$/);
        if (m) {
          return (
            <p key={i} style={{ margin: "0 0 2px" }}>
              <span style={{ color: "rgba(150,140,110,0.85)", fontFamily: FONT, fontSize: 12.5, fontWeight: 600, marginRight: 8, verticalAlign: "1px" }}>{m[1]}</span>
              {m[2]}
            </p>
          );
        }
        if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
        return <p key={i} style={{ margin: "0 0 2px", paddingLeft: 22 }}>{line.trim()}</p>;
      })}
    </div>
  );
}

export default function PsalmsPage() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const office: "morning" | "evening" = params.get("office") === "evening" ? "evening" : "morning";
  const cycle = getPsalmCycle();
  const today = new Date().toLocaleDateString("en-CA");

  const { data, isLoading } = useQuery<{ psalms: Psalm[] }>({
    queryKey: ["/api/psalms/today", cycle, office, today],
    queryFn: () => apiRequest("GET", `/api/psalms/today?cycle=${cycle}&office=${office}&date=${today}`),
    staleTime: 30 * 60_000,
  });
  // A stable random loading quote per open (doesn't reshuffle on re-render).
  const [loadingQuote] = useState(() => PSALM_LOADING_QUOTES[Math.floor(Math.random() * PSALM_LOADING_QUOTES.length)]);

  // Reading is praying — once today's psalms have loaded, mark the day done so
  // the home card flips to "Prayed".
  useEffect(() => {
    if ((data?.psalms?.length ?? 0) > 0) markPsalmsPrayed();
  }, [data]);

  const psalms = data?.psalms ?? [];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> Home
        </Link>
        <div className="mb-6">
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "rgba(150,140,110,0.7)" }}>
            {office === "evening" ? "Evening Psalms" : "Morning Psalms"} · {cycle === "monthly" ? "Monthly cycle" : "Daily office"}
          </p>
          <h1 style={{ color: WARM, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", fontFamily: FONT }}>
            Praying the Psalms 📜
          </h1>
        </div>

        {isLoading ? (
          <div style={{ paddingTop: 16, maxWidth: 480 }}>
            <p style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.55, margin: 0, opacity: 0.92 }}>
              &ldquo;{loadingQuote.text}&rdquo;
            </p>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12.5, letterSpacing: "0.04em", margin: "12px 0 0" }}>
              — {loadingQuote.author}
            </p>
            <p className="text-sm" style={{ color: "rgba(150,140,110,0.7)", fontFamily: FONT, marginTop: 28 }}>Gathering today's psalms…</p>
          </div>
        ) : psalms.length === 0 ? (
          <p className="text-sm" style={{ color: SAGE, fontFamily: FONT }}>
            No psalms found for today. Try again shortly.
          </p>
        ) : (
          <div className="space-y-7">
            {psalms.map((p) => (
              <div
                key={p.raw}
                className="rounded-2xl px-5 py-5"
                style={{ background: "rgba(150,140,110,0.10)", border: "1px solid rgba(150,140,110,0.28)" }}
              >
                <div className="mb-3">
                  <p style={{ color: WARM, fontSize: 18, fontWeight: 600, fontFamily: FONT, margin: 0 }}>
                    Psalm {p.raw}
                  </p>
                  {p.title && (
                    <p style={{ color: SAGE, fontSize: 13, fontStyle: "italic", fontFamily: SERIF, margin: "2px 0 0" }}>
                      {p.title}
                    </p>
                  )}
                </div>
                <PsalmText content={p.content} />
              </div>
            ))}
            <p className="text-center text-[13px] italic pt-2" style={{ color: SAGE, fontFamily: SERIF }}>
              Glory to the Father, and to the Son, and to the Holy Spirit: *<br />
              as it was in the beginning, is now, and will be for ever. Amen.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
