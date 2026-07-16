/**
 * Parish / community invite SIGN — the printable poster.
 *
 * A leader mints their community's rule of life (which already produces a public
 * /routine/:token link), then opens /sign/:token to print a poster: the
 * community's name, an invitation, and a QR code. Laminated and set in a stand,
 * a newcomer scans it and is dropped straight into that rhythm of prayer — no
 * sign-up (the /routine/:token landing provisions an anonymous device user and
 * applies the rhythm; see routine-invite.tsx).
 *
 * Black-on-white by design so it prints cleanly at any size. Modeled on the
 * print scaffolding in routine-print.tsx (screen toolbar hidden in print,
 * window.print() on web / the native iOS print sheet in the shell).
 */
import { QRCodeSVG } from "qrcode.react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isNativeShell } from "@/lib/isNativeShell";

const FONT = "'Space Grotesk', system-ui, sans-serif";
// The QR must point at the PRODUCTION host — a printed sign can't resolve
// localhost or a preview origin. The routine landing lives at /routine/:token.
const APP_ORIGIN = "https://withphoebe.app";

type SpecLite = {
  officePrefs: { morning: string; evening: string; contemplationGoalMinutes: number };
  silenceLadderEnabled: boolean;
};
type LandingData = { label: string | null; groupName: string | null; createdByName: string | null; spec: SpecLite };

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const valid = /^[a-f0-9]{32}$/i.test(token ?? "");

  const { data, isLoading, isError } = useQuery<LandingData>({
    queryKey: [`/api/prescribed-routines/${token}`],
    queryFn: () => apiRequest("GET", `/api/prescribed-routines/${token}`),
    enabled: valid,
    retry: false,
  });

  const routineUrl = `${APP_ORIGIN}/routine/${token}`;
  const community = data?.groupName?.trim() || null;
  const pdfFileName = `${community ? `${community} — ` : ""}Pray with us — Phoebe`;

  const handlePrint = () => {
    // The native iOS shell (WKWebView) has no window.print(); route to the
    // native print sheet (Save to Files / AirPrint) via the shell event.
    if (isNativeShell()) {
      window.dispatchEvent(new CustomEvent("phoebe:print", { detail: { jobName: pdfFileName } }));
      return;
    }
    const prev = document.title;
    document.title = pdfFileName;
    const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  if (!valid || isError) {
    return (
      <div style={{ minHeight: "100dvh", background: "#091A10", color: "#F0EDE6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, fontFamily: FONT, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>This sign link isn't valid</h1>
        <p style={{ fontSize: 14, color: "#8FAF96", margin: 0 }}>Double-check the routine link, or set your community's rule of life first.</p>
      </div>
    );
  }

  return (
    <div className="sign-root" style={{ minHeight: "100dvh", background: "#EDE7D8", color: "#14241A" }}>
      <style>{`
        /* Screen toolbar only — hidden when printing. The sheet prints clean on
           the letter-writing beige (light ink) with dark text. */
        @media print {
          .sign-toolbar { display: none !important; }
          .sign-root { background: #F3ECDC !important; }
          @page { margin: 12mm; }
        }
        .sign-sheet { break-inside: avoid; }
      `}</style>

      {/* Screen-only toolbar: Back + Print. */}
      <div
        className="sign-toolbar"
        style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(9,26,16,0.92)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          style={{ background: "none", border: "none", color: "#C8D4C0", fontSize: 14, fontFamily: FONT, cursor: "pointer", padding: 6 }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={isLoading}
          style={{ background: "rgba(46,107,64,0.9)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.6)", borderRadius: 999, padding: "9px 18px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", opacity: isLoading ? 0.6 : 1 }}
        >
          🖨 Print / Save as PDF
        </button>
      </div>

      {/* The poster sheet — centered, portrait, generous margins. */}
      <div style={{ display: "flex", justifyContent: "center", padding: "28px 20px 48px" }}>
        <div
          className="sign-sheet"
          style={{ width: "100%", maxWidth: 620, background: "#F3ECDC", border: "1px solid rgba(20,36,26,0.12)", borderRadius: 18, padding: "48px 40px 44px", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.10)" }}
        >
          <p style={{ margin: 0, fontSize: 13, letterSpacing: "0.22em", textTransform: "uppercase", color: "#5C6A52", fontFamily: FONT, fontWeight: 600 }}>
            {community ?? "A daily rhythm of prayer"}
          </p>
          <h1 style={{ margin: "18px 0 0", fontSize: 46, lineHeight: 1.05, fontWeight: 700, letterSpacing: "-0.02em", color: "#14241A", fontFamily: FONT }}>
            Pray with us.
          </h1>
          <p style={{ margin: "16px auto 0", maxWidth: 420, fontSize: 17, lineHeight: 1.5, color: "#3A4A3E", fontFamily: FONT }}>
            {community ? `Join ${community}’s daily rhythm of prayer.` : "Join our daily rhythm of prayer."} Scan the code to begin — right now, on your phone.
          </p>

          {/* The QR — dark modules on the beige sheet, quiet zone built in. */}
          <div style={{ display: "flex", justifyContent: "center", margin: "34px 0 12px" }}>
            <div style={{ background: "#FFFFFF", padding: 18, borderRadius: 16, border: "1px solid rgba(20,36,26,0.10)" }}>
              <QRCodeSVG
                value={routineUrl}
                size={260}
                level="M"
                marginSize={0}
                bgColor="#FFFFFF"
                fgColor="#14241A"
                aria-label={`QR code to begin praying with ${community ?? "this community"}`}
              />
            </div>
          </div>

          <p style={{ margin: "10px 0 0", fontSize: 15, fontWeight: 600, color: "#2D5E3F", fontFamily: FONT }}>
            No account needed — start in seconds.
          </p>
          <p style={{ margin: "24px 0 0", fontSize: 12.5, letterSpacing: "0.04em", color: "#7A8A72", fontFamily: FONT }}>
            withphoebe.app · a daily companion in prayer
          </p>
        </div>
      </div>
    </div>
  );
}
