// ── About ───────────────────────────────────────────────────────────────────
//
// Owner, 2026-09-28: "Have that be what comes up when you go to about" — the
// product page (public/landing.html, the same page a first-time web visitor
// sees) is the About page now, shown inside the app.
//
// It is framed rather than navigated to, so the person stays in the app. The frame
// keeps the page's own top bar (?embed=bar — see the block at the foot of this
// file's header comment and the embed script in landing.html), and every link that
// leaves the page (Privacy, Terms, the app) opens in the app, not in the frame.
//
// The previous About page (the essay, the slideshow button, Privacy and Terms)
// is in git history; the slideshow still lives at /overview-deck, and Privacy
// and Terms are in the page's footer.

const BG = "#091A10";

/**
 * THE ABOUT PAGE IS THE LANDING PAGE, WITH ITS OWN TOP BAR, FOR EVERYONE.
 *
 * Owner, 2026-10-02, with a screenshot of withphoebe.app in a browser: "I want the
 * about page to look like this" — the wordmark at the left, Your day, Practices,
 * Learn, iOS app and Start praying at the right, over the hero. The page is shown
 * framed (public/landing.html, the same page a first-time web visitor sees) so the
 * person stays in the app, and with ?embed=bar it keeps ITS OWN bar rather than
 * having the app draw anything over it.
 *
 * WHAT THIS REPLACES. About used to be the framed page with its bar hidden and two
 * floating pills over it — Back at the left, Share at the right — for anyone signed
 * in or inside the iPhone and Android apps, and the page's own bar only for a
 * signed-out visitor on the web. The pills, and the history-based Back that kept
 * needing fixes ("the back button isnt doing anything", from an address typed into
 * a tab), are gone with that split: the page's bar has no Back to get wrong, and
 * "Start praying" (and the wordmark) take a person into the app from wherever they
 * are. The App Store link hides itself inside the iPhone app (landing.html,
 * html.embed-bar.native). If a way to Share is wanted again, it belongs on Share
 * Phoebe, which has the link and the QR code.
 */
export default function AboutPage() {
  return (
    <div style={{ position: "fixed", inset: 0, background: BG, zIndex: 40 }}>
      <iframe
        src="/landing.html?embed=bar"
        title="About Phoebe"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          display: "block", border: 0, background: BG,
        }}
      />
    </div>
  );
}
