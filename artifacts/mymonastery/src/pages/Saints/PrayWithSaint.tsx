import { useRoute, useLocation } from "wouter";
import { getSaintById, feastDateLabel } from "@/data/saints";

// Pray with [Name] — a quiet, single-column screen. The appointed collect
// (when we have one) or a short prayer of remembrance, and a closing line.
// No chrome, no menu, one soft close. The restraint is the point.

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Space Grotesk', system-ui, sans-serif";

export default function PrayWithSaint() {
  const [, params] = useRoute("/saints/:id/pray");
  const [, setLocation] = useLocation();
  const saint = params?.id ? getSaintById(params.id) : undefined;

  const close = () => {
    if (saint) setLocation(`/saints/${saint.id}`);
    else setLocation("/saints");
  };

  if (!saint) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: BG }}>
        <button onClick={() => setLocation("/saints")} style={{ color: SAGE, fontFamily: SANS, cursor: "pointer" }}>
          ← Back to Saints
        </button>
      </div>
    );
  }

  // The prayer: the BCP collect excerpt if present, otherwise a gentle
  // prayer of remembrance (a paraphrase, not a quoted modern collect).
  const prayer = saint.collectExcerpt
    ? saint.collectExcerpt
    : `We give you thanks, O God, for the witness of ${saint.name}. Strengthened by this example, may we follow Christ more nearly all the days of our life.`;

  return (
    <div
      className="fixed inset-0 flex flex-col items-center overflow-y-auto"
      style={{ background: BG }}
    >
      {/* Soft close */}
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute flex items-center justify-center rounded-full transition-opacity hover:opacity-80"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          right: 16,
          width: 36,
          height: 36,
          background: "rgba(46,107,64,0.18)",
          border: "1px solid rgba(46,107,64,0.35)",
          color: "#C8D4C0",
          fontSize: 18,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ×
      </button>

      <div
        className="flex-1 flex flex-col items-center justify-center text-center px-7 w-full"
        style={{ maxWidth: 460, paddingTop: 80, paddingBottom: 60 }}
      >
        <p className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-4" style={{ color: "rgba(143,175,150,0.55)", fontFamily: SANS }}>
          {feastDateLabel(saint.feastDate)}
        </p>
        <h1 style={{ color: WARM, fontFamily: SERIF, fontSize: 30, lineHeight: 1.15, fontWeight: 400, marginBottom: 28 }}>
          {saint.name}
        </h1>

        <p style={{ color: "rgba(240,237,230,0.92)", fontFamily: SERIF, fontStyle: "italic", fontSize: 21, lineHeight: 1.6 }}>
          {prayer}
        </p>

        <p
          className="mt-12"
          style={{ color: "rgba(143,175,150,0.7)", fontFamily: SERIF, fontStyle: "italic", fontSize: 15, lineHeight: 1.6 }}
        >
          In the communion of saints, you are not alone.
        </p>
      </div>
    </div>
  );
}
