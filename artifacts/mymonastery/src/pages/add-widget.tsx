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
  { title: "Choose a size, then Add Widget", body: "The medium size shows what's next and its subtitle at a glance; the small size fits more on a crowded screen." },
  { title: "Tap Done", body: "Your widget stays current on its own — no need to open the app first." },
];

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
