import { useLocation } from "wouter";
import { X } from "lucide-react";
import { Layout } from "@/components/layout";

// Instructional page for placing the Phoebe home-screen widget — reached
// from the menu's "Add Widget" row, which only shows once WidgetKit confirms
// (via PhoebeWidgetPlugin.isActive) the user doesn't already have one.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const GREEN = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";

const STEPS = [
  { title: "Touch and hold your Home Screen", body: "Press and hold any empty spot until the icons start to jiggle." },
  { title: "Tap the + in the top corner", body: "A widget gallery opens, showing every app with a widget available." },
  { title: "Search for Phoebe", body: "Type “Phoebe” and tap the app's widget to preview it." },
  // Owner: "let's not offer the small square widget, just the wide dots one."
  // This step told people to choose between two sizes; only the wide one is in
  // the gallery now, so the instruction would have sent them looking for a
  // size that isn't there.
  { title: "Tap Add Widget", body: "The wide widget shows your past 7 days — the same rhythm dots as your home screen." },
  { title: "Tap Done", body: "Your widget stays current on its own — no need to open the app first." },
];

/**
 * A MOCK OF THE HOME SCREEN WITH THE WIDGET ON IT (owner, 2026-10-02: "it shows
 * them a mock of a widget on the home screen and how they can set it up"). The
 * wide Phoebe widget sits above a grid of app icons, drawn the way the real one
 * reads: the app's name and icon, the last seven days as dots (green = kept),
 * and what is next. Decorative; the steps below are the instructions.
 */
function HomeScreenMock() {
  const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
  const KEPT = [true, true, false, true, true, true, false];
  const ICON_TINTS = ["#3b4a5a", "#5a3b3b", "#3b5a46", "#5a533b", "#463b5a", "#3b5a5a", "#5a3b50", "#4a4a4a"];
  return (
    <div
      aria-hidden
      style={{
        width: 236, margin: "0 auto 30px", borderRadius: 38, padding: 10,
        background: "#050D08", border: "2px solid rgba(143,175,150,0.28)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ borderRadius: 30, overflow: "hidden", background: "linear-gradient(160deg,#16382a 0%,#0c2218 55%,#08150f 100%)", padding: "14px 12px 12px", minHeight: 360, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: WARM, fontSize: 10.5, fontWeight: 600, padding: "0 6px 10px", opacity: 0.85 }}>
          <span>9:41</span><span>●●●</span>
        </div>

        {/* The widget — wide, with the seven dots. */}
        <div style={{ borderRadius: 20, background: "rgba(8,22,15,0.92)", border: "1px solid rgba(143,175,150,0.3)", padding: "10px 12px 12px", boxShadow: "0 0 0 2px rgba(143,175,150,0.16)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <img src="/phoebe-app-icon.png" alt="" width={18} height={18} style={{ borderRadius: 5, display: "block" }} />
            <span style={{ color: WARM, fontSize: 12, fontWeight: 700, fontFamily: FONT }}>Phoebe</span>
            <span style={{ marginLeft: "auto", color: SAGE, fontSize: 9.5, fontFamily: FONT }}>Evening Prayer next</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, padding: "0 2px" }}>
            {DAYS.map((d, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <span style={{ width: 17, height: 17, borderRadius: "50%", background: KEPT[i] ? "#3E9B5C" : "transparent", border: KEPT[i] ? "none" : "1.5px solid rgba(143,175,150,0.45)" }} />
                <span style={{ color: SAGE, fontSize: 8.5, fontFamily: FONT }}>{d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* A grid of other apps, so it reads as a Home Screen. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, padding: "16px 4px 0" }}>
          {ICON_TINTS.map((c, i) => (
            <div key={i} style={{ aspectRatio: "1 / 1", borderRadius: 12, background: c, opacity: 0.8 }} />
          ))}
        </div>
        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <div style={{ height: 46, borderRadius: 20, background: "rgba(255,255,255,0.10)" }} />
        </div>
      </div>
    </div>
  );
}

export default function AddWidgetPage() {
  const [, setLocation] = useLocation();

  return (
    <Layout>
      <div style={{ fontFamily: FONT }}>
        <div className="flex justify-end">
          <button
            onClick={() => setLocation("/dashboard")}
            aria-label="Close"
            style={{ width: 40, height: 40, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(240,237,230,0.7)", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        <main className="pb-16" style={{ maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <p style={{ fontSize: 34, marginTop: 8, marginBottom: 4 }} aria-hidden>🏠</p>
          <h1 style={{ color: WARM, fontWeight: 700, fontSize: "clamp(24px, 6vw, 30px)", lineHeight: 1.2, marginBottom: 8 }}>
            Add Phoebe to your Home Screen
          </h1>
          <p style={{ color: SAGE, fontSize: 14.5, lineHeight: 1.6, marginBottom: 28 }}>
            The widget always shows what's next in your rhythm — morning or evening prayer first, then whatever else is left — so you can see it, and begin, without opening the app.
          </p>

          <HomeScreenMock />

          <ol className="space-y-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3.5 items-start">
                <span
                  className="flex items-center justify-center rounded-full flex-shrink-0"
                  style={{ width: 26, height: 26, background: "rgba(143,175,150,0.14)", border: `1px solid ${SAGE}`, color: WARM, fontSize: 12.5, fontWeight: 700 }}
                >
                  {i + 1}
                </span>
                <div>
                  <p style={{ color: WARM, fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{step.title}</p>
                  <p style={{ color: SAGE, fontSize: 13.5, lineHeight: 1.5 }}>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={() => setLocation("/dashboard")}
            className="w-full rounded-full py-3.5 mt-10 transition-opacity hover:opacity-90"
            style={{ background: GREEN, color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}
          >
            Done
          </button>
        </main>
      </div>
    </Layout>
  );
}
