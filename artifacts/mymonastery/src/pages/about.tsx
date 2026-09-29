// ── About ───────────────────────────────────────────────────────────────────
//
// Owner, 2026-09-28: "Have that be what comes up when you go to about" — the
// product page (public/landing.html, the same page a first-time web visitor
// sees) is the About page now, shown inside the app.
//
// It is framed rather than navigated to, so the person stays in the app: with
// ?embed=1 the page's own top bar reads "← Back" (owner: "if they are logged
// in the top back should be back") and returns them to wherever they came
// from, the Start praying buttons are hidden (owner: "it doesnt need the start
// praying"), the App Store link hides inside the iPhone app, and every link
// that leaves the page (Privacy, Terms, the app) opens in the app, not in the
// frame. See the embed block in landing.html.
//
// The previous About page (the essay, the slideshow button, Privacy and Terms)
// is in git history; the slideshow still lives at /overview-deck, and Privacy
// and Terms are in the page's footer.

const BG = "#091A10";

export default function AboutPage() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: BG,
        // The frame can't see the notch (env() is 0 inside it), so the page
        // sits below the safe area here, on the app's own ground.
        paddingTop: "var(--safe-top)",
        zIndex: 40,
      }}
    >
      <iframe
        src="/landing.html?embed=1"
        title="About Phoebe"
        style={{ display: "block", width: "100%", height: "100%", border: 0, background: BG }}
      />
    </div>
  );
}
