import { useRoute, useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  getSaintById,
  intentionLabel,
  feastDateLabel,
  RANK_LABELS,
  PENDING_SAINT_KEY,
} from "@/data/saints";

// Saint detail — name, dates, "known for," traditional patronage (only when
// present), the BCP collect excerpt (only when present), and an Anglican note.
// Two actions: pray with the saint, or pull them into a letter you're writing.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const GREEN = "#2D5E3F";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Space Grotesk', system-ui, sans-serif";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.55)", fontFamily: SANS }}>
        {label}
      </p>
      {children}
    </div>
  );
}

export default function SaintDetail() {
  const [, params] = useRoute("/saints/:id");
  const [, setLocation] = useLocation();
  const saint = params?.id ? getSaintById(params.id) : undefined;

  if (!saint) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full text-center py-16">
          <p className="text-[15px] mb-4" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>
            That commemoration could not be found.
          </p>
          <Link href="/saints">
            <span className="text-sm" style={{ color: "#A8C5A0", fontFamily: SANS, cursor: "pointer" }}>← Back to Saints</span>
          </Link>
        </div>
      </Layout>
    );
  }

  function addToLetter() {
    try {
      sessionStorage.setItem(PENDING_SAINT_KEY, saint!.id);
    } catch {
      /* private mode — non-fatal; the composer just won't pre-insert */
    }
    setLocation("/letters/new");
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        <Link href="/saints">
          <span className="inline-block text-sm mb-5" style={{ color: SAGE, fontFamily: SANS, cursor: "pointer" }}>
            ← Saints
          </span>
        </Link>

        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SANS }}>
          {RANK_LABELS[saint.rank]} · {feastDateLabel(saint.feastDate)}
        </p>
        <h1 className="mt-2" style={{ color: WARM, fontFamily: SERIF, fontSize: 32, lineHeight: 1.12, fontWeight: 400 }}>
          {saint.name}
        </h1>
        {saint.yearsLived && (
          <p className="text-[14px] mt-1.5" style={{ color: SAGE, fontFamily: SANS }}>
            {saint.yearsLived}
          </p>
        )}

        {saint.vocation.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {saint.vocation.map((v) => (
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

        <Section label="Known for">
          <p className="text-[16px] leading-relaxed" style={{ color: "rgba(240,237,230,0.9)", fontFamily: SERIF }}>
            {saint.knownFor}
          </p>
        </Section>

        {saint.patronOf.length > 0 && (
          <Section label="Traditionally invoked for">
            <p className="text-[16px] leading-relaxed" style={{ color: "rgba(240,237,230,0.9)", fontFamily: SERIF }}>
              {saint.patronOf.join(", ")}
            </p>
          </Section>
        )}

        {saint.collectExcerpt && (
          <Section label="From the collect">
            <p
              className="text-[17px] leading-relaxed pl-3"
              style={{ color: "rgba(168,197,160,0.95)", fontFamily: SERIF, fontStyle: "italic", borderLeft: "2px solid rgba(46,107,64,0.5)" }}
            >
              {saint.collectExcerpt}
            </p>
          </Section>
        )}

        {saint.anglicanNote && (
          <Section label="In the Anglican tradition">
            <p className="text-[15px] leading-relaxed" style={{ color: "rgba(240,237,230,0.82)", fontFamily: SERIF }}>
              {saint.anglicanNote}
            </p>
          </Section>
        )}

        {saint.intercedesFor.length > 0 && (
          <Section label="A companion in">
            <div className="flex flex-wrap gap-1.5">
              {saint.intercedesFor.map((i) => (
                <Link key={i} href="/saints">
                  <span
                    className="rounded-full px-3 py-1 text-[12px] cursor-pointer transition-opacity hover:opacity-90"
                    style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)", color: SAGE, fontFamily: SANS }}
                  >
                    {intentionLabel(i)}
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* Actions */}
        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => setLocation(`/saints/${saint.id}/pray`)}
            className="w-full rounded-xl py-3.5 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: GREEN, color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: SANS, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Pray with {saint.name}
          </button>
          <button
            type="button"
            onClick={addToLetter}
            className="w-full rounded-xl py-3 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: "rgba(46,107,64,0.14)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.4)", fontFamily: SANS, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            + Add to a letter
          </button>
        </div>
      </div>
    </Layout>
  );
}
