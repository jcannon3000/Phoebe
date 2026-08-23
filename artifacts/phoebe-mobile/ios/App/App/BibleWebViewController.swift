// BibleWebViewController.swift
//
// Phoebe's in-app browser. It was first added for the "Read on
// Bible.com" lesson links (hence the Bible* names), but every external
// link in the app now flows through it via
// PhoebeNative.openInAppBrowser → BibleBrowser.present.
//
// Product goals it implements:
//   • Phoebe-branded top + bottom chrome (dark green), not Safari's, so
//     it reads as part of the app rather than a system browser sheet.
//   • Slides in from the right like advancing to the next slide, and
//     keeps target=_blank links INSIDE this view — never bounces the
//     user out to Safari unless they tap the explicit "open in Safari".
//   • Persists cookies + site storage across opens AND app launches (a
//     single shared persistent data store + process pool), so a site's
//     "accept cookies" choice sticks instead of re-prompting each visit.
//   • Dark appearance to match the app (also makes pages that support
//     prefers-color-scheme render dark).
//
// Presented from JS by BibleBrowserPlugin.open({ url }) →
// BibleBrowser.shared.present(url:from:).

import UIKit
import WebKit

// Phoebe palette — mirrors the web app's dark-green theme so the chrome
// reads as the same product.
private enum PhoebeBrowserColor {
    // Owner: "make the top and bottom black or white depending on the
    // background of Venite." The chrome should disappear into the page — two
    // near-but-not-quite matching darks read as a rendering fault rather than
    // a frame. Resolved at runtime from the page's own background (see
    // syncChromeToPage); this is the starting value before the page paints.
    static var bar = UIColor.black
    static let text = UIColor(red: 0.941, green: 0.929, blue: 0.902, alpha: 1)  // #F0EDE6
    static let tint = UIColor(red: 0.659, green: 0.773, blue: 0.627, alpha: 1)  // #A8C5A0
}

final class BibleWebViewController: UIViewController, WKNavigationDelegate {
    private let url: URL
    private var webView: WKWebView!
    private let progressView = UIProgressView(progressViewStyle: .bar)
    private var progressObservation: NSKeyValueObservation?
    private var titleObservation: NSKeyValueObservation?

    // Bottom-bar web-history buttons; enabled/disabled as the user navigates.
    private var backButton: UIBarButtonItem!
    private var forwardButton: UIBarButtonItem!

    /**
     * Which way to paint the chrome BEFORE the page reports its own colour.
     *
     * Owner: "for the newsletters default to a white top bar." Newsletters are
     * cream articles and were opening behind black chrome for the beat before
     * syncChromeToPage could look at the body — a flash of the wrong frame on
     * every read. The caller knows which kind of page it is asking for, so it
     * says; the page's own background still has the last word.
     *
     * It settles the Options menu too. Owner: "these top-right options should
     * not be showing up in the newsletter" — Configure office / Change format /
     * Listen to the office are all about praying an office, and on a Richard
     * Rohr meditation they are three commands that either do nothing useful or
     * throw the reader into a liturgy they didn't ask for.
     */
    var isArticle = false

    /**
     * This reading was opened FROM an office slide (the "Read online" pill on
     * a lesson), and should feel like a continuation of the office rather than
     * a trip out of it.
     *
     * Owner: "what if the verse page operates as splash and it fades from that
     * into the web page... then it has a top bar with the same buttons the
     * office has, but in white, and a floating bottom bar with the same
     * buttons and progress, also in white... when you click forward next on
     * the bottom bar it goes to the next screen, which would be the canticle."
     *
     * Four things follow from this flag, each covered where it applies below:
     *   • the veil is a SNAPSHOT of the office slide already on screen, not
     *     the generic Splash leaf (see `snapshotVeilImage`)
     *   • the top bar shows the office's own control set (← Back / title /
     *     Display gear / close), not Done+Options or a bare Done
     *   • a floating bottom pill mirrors the office's own — Back · progress ·
     *     Next — and lives above the page for the whole read, not just while
     *     it loads
     *   • Back/Next on that pill dismiss the browser and step the OFFICE'S OWN
     *     slide index, via onOfficePrev/onOfficeNext — the office underneath
     *     is a real, already-mounted screen, not something we simulate here
     */
    var officeChrome = false
    /** The office's own title pill text — "Morning Prayer" — for the top bar. */
    var officeTitleText: String?
    /** "N of M" — mirrors the office's own bottom-pill progress label. */
    var officeSlideLabel: String?
    /** The office's own section label ("LESSON", "CANTICLE", …). */
    var officeSectionLabel: String?
    /** A screenshot of the office slide, taken just before this browser opened
     *  — the veil for `officeChrome`, in place of the Splash leaf. nil falls
     *  back to Splash, so a snapshot failure degrades rather than crashes. */
    var snapshotVeilImage: UIImage?
    var onOfficePrev: (() -> Void)?
    var onOfficeNext: (() -> Void)?
    /** The office's own Display-settings (⚙) sheet — text size, backdrop. */
    var onOfficeDisplaySettings: (() -> Void)?
    // The floating bottom pill itself, built only when officeChrome is set —
    // see buildOfficeNavPill().
    private var officeNavPill: UIView?
    private var officeNavLabel: UILabel?
    private var officeBackButton: UIButton?
    private var officeNextButton: UIButton?

    /**
     * A held veil over the page while it loads.
     *
     * Owner: "for newsletters, can you do a loading screen like an office
     * loading screen for like two seconds while you're loading the page in the
     * background — so we don't see the page flashing in, we just see it loaded
     * once the loading screen fades out."
     *
     * A remote article paints in stages — background, then unstyled text, then
     * the web font, then images reflowing what you were already reading. The
     * veil holds that offstage and reveals a settled page, the same way the
     * office holds its opening versicle rather than showing a spinner.
     *
     * Two bounds, both necessary. A FLOOR, so a cached page doesn't flash the
     * veil for 80ms (a flicker is worse than no veil at all), and a CEILING, so
     * a page that never finishes — a hung request, a redirect chain — can't
     * leave someone staring at a blank field. Whichever the page beats, it is
     * revealed on.
     */
    // Both top-bar items, held so applyChrome can tint them together. They must
    // be the same KIND and the same COLOUR — see where they are built.
    private var doneItem: UIBarButtonItem?
    private var optionsItem: UIBarButtonItem?
    // officeChrome's close-X — a second right-bar item alongside optionsItem
    // (which doubles as the Display gear there), so applyChrome can tint it too.
    private var closeXItem: UIBarButtonItem?

    private let loadingVeil = UIView()
    private lazy var veilImage = UIImageView(image: snapshotVeilImage ?? UIImage(named: "Splash"))
    // Owner: "there needs to be a circle loading animation above the splash
    // too", then: "I want the loading animation circle that is before the
    // office slideshow." So not a UIActivityIndicatorView — that is iOS's
    // pinwheel and looks nothing like it. The office's held-breath screen
    // draws its own ring, and this is that ring rebuilt in CoreAnimation:
    //
    //   22×22, a 2pt stroke, sage at 25% all the way round with the top
    //   quarter at 75%, spinning once a second, sitting 44pt above the safe
    //   area rather than centred.
    //
    // Those numbers are copied from the office's own spinner (see the
    // held-breath veil in bcp-daily-office.tsx) — if that one is ever
    // restyled, this is the second place to change.
    private let veilSpinner = OfficeSpinnerView()
    private var veilShownAt: CFTimeInterval = 0
    private var veilDismissed = false
    /**
     * The floor is ONLY an anti-flicker guard, not a duration.
     *
     * Owner: "it should fade out once the page is loaded." It always was
     * load-driven — didFinish calls hideVeil — but a 0.84s floor meant a page
     * that arrived in 200ms still sat behind the leaf for another 600, which
     * reads as a timer rather than as waiting for the page. Cut to the smallest
     * value that still stops a sub-blink flash on a cached page, so what you
     * see now tracks the load.
     */
    private let veilMinSeconds: CFTimeInterval = 0.3
    private let veilMaxSeconds: TimeInterval = 5.0

    // Retained strongly here because UIViewController.transitioningDelegate
    // is a WEAK reference — without an owner the slide animation is dropped.
    // The nav controller retains this VC (its root), this VC retains the
    // delegate, so it lives as long as the browser is on screen.
    let slideDelegate = SlideTransitionDelegate()

    // Invoked (after the browser dismisses) when the user taps the bottom-bar
    // Journal button. The plugin wires this to fire a `phoebe:open-journal`
    // event into the app so the web layer can navigate to the journal.
    // Retained for the plugin's call signature only — nothing invokes it now
    // that the Journal button is gone (the journal page was removed from the
    // app, and no web listener for phoebe:open-journal ever existed).
    var onJournal: (() -> Void)?
    // Options → "Change format" / "Listen to the office". Both dismiss first,
    // then let the app route: the office intro chooser owns the formats and the
    // podcast player owns the audio, and neither belongs in a web view.
    var onChangeFormat: (() -> Void)?
    var onListen: (() -> Void)?
    /** Article-only: "Reader" in the top-right — dismiss, then hand the
     *  CURRENT url to the plugin's own SFSafariViewController reader-mode
     *  presenter (see BibleBrowserPlugin.presentReaderView). */
    var onOpenReaderView: ((URL) -> Void)?
    /// Set when an Options action is dismissing us, so viewDidDisappear knows
    /// this is a hand-off rather than the reader finishing.
    private var handingOff = false

    // Invoked once this view controller has actually left the screen, no
    // matter HOW it got dismissed (Done button, swipe-to-dismiss, or any
    // future path) — the plugin wires this to fire `phoebe:browserfinished`,
    // exactly mirroring onJournal above. Before this existed, NOTHING fired
    // that event for this browser at all (only the separate SFSafariViewController
    // reader-view path did, via its delegate's safariViewControllerDidFinish),
    // so openExternalThenMarkRead's "wait for the user to actually close it"
    // branch just hung forever for every CAC/FDD/regular link — markRead()
    // never ran. viewDidDisappear is the single, path-agnostic hook for "this
    // screen is gone now"; guarded with `dismissFired` since it's technically
    // allowed to be called more than once by UIKit in edge cases and this
    // must fire exactly once.
    var onDismiss: (() -> Void)?
    private var dismissFired = false

    // The persistent store below is supposed to keep a site's "accept" choice,
    // but iOS tracking prevention clears the script/third-party storage these
    // sources (CAC, Bible.com, SSJE) park consent in, so the bar returns every
    // visit. This web view is OURS and the page is its top document, so we may
    // inject a stylesheet that hides the consent UI on every load — by known
    // CMP selector (Bible.com is TrustArc; OneTrust/CookieYes/Complianz/Cybot/
    // Osano/etc. are covered too) plus a constrained heuristic for the ones CAC
    // and SSJE inject at runtime — and release the scroll-lock some apply.
    private static let cookieHideJS = """
    (function () {
      var KNOWN = [
        '#onetrust-consent-sdk','#onetrust-banner-sdk',
        '.cky-consent-container','.cky-overlay',
        '#cookie-law-info-bar','#cookie-law-info-again',
        '.cc-window','.cc-banner',
        '#cookie-notice','.cookie-notice-container',
        '#cmplz-cookiebanner-container','.cmplz-cookiebanner',
        '#moove_gdpr_cookie_info_bar','.moove-gdpr-dom-on-top',
        '#hs-eu-cookie-confirmation',
        '[id^="sp_message_container"]',
        '#truste-consent-track','.truste_overlay','.truste_box_overlay','#consent_blackbar','.truste-banner',
        '.osano-cm-window','.osano-cm-dialog',
        '#usercentrics-root','.fc-consent-root',
        '#gdpr-cookie-message',
        '#CybotCookiebotDialog','#CybotCookiebotDialogBodyUnderlay',
        '#termly-code-snippet-support'
      ];
      var style = document.createElement('style');
      style.setAttribute('data-phoebe-cookie-hide','');
      style.textContent = KNOWN.join(',') + '{display:none !important;visibility:hidden !important;}'
                        + 'html,body{overflow:auto !important;}';
      (document.head || document.documentElement).appendChild(style);

      function unlock() {
        [document.documentElement, document.body].forEach(function (el) {
          if (el && el.style) { el.style.overflow = ''; el.style.position = ''; }
        });
      }
      function sweep() {
        var nodes = document.querySelectorAll('div,section,aside');
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          if (el.getAttribute('data-phoebe-swept')) continue;
          if (getComputedStyle(el).position !== 'fixed') continue;
          var txt = (el.textContent || '').toLowerCase();
          if (txt.length > 600 || !/cookie|consent|gdpr/.test(txt)) continue;
          if (!el.querySelector('button,a,[role="button"]')) continue;
          el.setAttribute('data-phoebe-swept','1');
          el.style.setProperty('display','none','important');
          unlock();
        }
      }
      var pending = false;
      function schedule() { if (pending) return; pending = true; setTimeout(function () { pending = false; try { sweep(); } catch (e) {} }, 200); }
      if (document.readyState !== 'loading') schedule();
      document.addEventListener('DOMContentLoaded', schedule);
      var obs = new MutationObserver(schedule);
      try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
      setTimeout(function () { obs.disconnect(); }, 30000);
    })();
    """

    private static let cookieHideScript = WKUserScript(
        source: cookieHideJS,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
    )

    // When present() hands us a web view that was already loading in the
    // background (preloaded from the home screen), we adopt it instead of
    // creating + loading a fresh one — so the page is on screen instantly.
    private let preloadedWebView: WKWebView?

    init(url: URL, preloadedWebView: WKWebView? = nil) {
        self.url = url
        self.preloadedWebView = preloadedWebView
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    // Factory used by BOTH the live VC and the preloader, so a preloaded web
    // view is configured identically (shared cookie jar, consent-banner hiding,
    // dark chrome) to one created on demand.
    static func makeConfiguration() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.websiteDataStore = WKWebsiteDataStore.default()   // persistent
        let content = WKUserContentController()
        content.addUserScript(cookieHideScript)
        config.userContentController = content
        return config
    }

    // Owner: "we want all forward pages to open in light mode" — any URL on
    // Forward Movement's site (forwardmovement.org, prayer.forwardmovement.org,
    // etc.), regardless of which feature opened it. Host-based rather than a
    // per-call-site flag so a NEW forwardmovement.org link (e.g. a future
    // reading page) gets this automatically without another wiring change.
    static func forcesLightMode(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "forwardmovement.org" || host.hasSuffix(".forwardmovement.org")
    }

    static func makeWebView() -> WKWebView {
        let wv = WKWebView(frame: .zero, configuration: makeConfiguration())
        wv.translatesAutoresizingMaskIntoConstraints = false
        // Off so the left screen edge is free for our swipe-to-dismiss; web
        // history is reachable via the bottom toolbar's back button instead.
        wv.allowsBackForwardNavigationGestures = false
        wv.backgroundColor = PhoebeBrowserColor.bar
        wv.isOpaque = false
        // No pageZoom (owner, after seeing it): venite.app already sizes its
        // own liturgy, and scaling the whole page pushed the Long/Short and
        // Rite II/EOW pickers toward the edges without making the prose easier
        // to read. Left at 1.0 so the site's own typography stands.
        return wv
    }

    deinit {
        progressObservation?.invalidate()
        titleObservation?.invalidate()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // No isBeingDismissed check — this VC is the ROOT of a navigation
        // controller that's what's actually presented (see the class header),
        // and isBeingDismissed reads false on a child even while the nav
        // controller containing it genuinely is being dismissed. viewDidDisappear
        // still fires correctly on children when their container is dismissed,
        // so it alone — guarded to fire once — is the reliable signal here.
        guard !dismissFired else { return }
        dismissFired = true
        // Leaving VIA an Options action is not finishing the office. UIKit runs
        // viewDidDisappear BEFORE a dismiss completion, so "Change format" and
        // "Listen to the office" fired browserfinished first — and the web
        // side's return handler credited the office and navigated home, for an
        // office the person had just said they wanted to pray a different way.
        if handingOff { return }
        onDismiss?()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // Dark chrome to match the app. Forcing .dark also makes the web
        // content report prefers-color-scheme: dark, so dark-capable sites
        // render dark too.
        overrideUserInterfaceStyle = .dark
        view.backgroundColor = PhoebeBrowserColor.bar

        // Page <title> reads as content (set below via KVO); host is the
        // first-paint fallback so the bar is never blank.
        title = url.host ?? "Reading"

        // ── Top bar: back-to-app (left) + open-in-Safari (right). ──
        // A labelled "‹ Back" so it clearly reads as returning to Phoebe,
        // distinct from the web-history back chevron in the bottom toolbar.
        // Named appBackButton (not backButton) — `backButton` is already the
        // bottom-bar web-history item; reusing the name shadows it.
        // Owner: "can we change the ✕ to a Done pill." A bare glyph reads as
        // "discard"; leaving an office you have just prayed is a completion,
        // and the word says so. A filled pill also gives it a real tap target
        // at the top of a long scrolling page.
        //
        // A PLAIN bar button item, deliberately — not a UIButton in a
        // customView. Owner: "fix the Done button, don't need the borders, no
        // green shading", then "should be as wide as Options".
        //
        // Both were symptoms of the same thing. iOS draws bar buttons as filled
        // capsules, and it sizes and insets them itself; a customView opts out
        // of all of that, so Done was carrying a hand-rolled border and tint
        // that fought the system capsule, sized by its own content insets, and
        // pushed hard against the screen edge while Options — a real bar item —
        // sat properly inset. Matching the KIND of control is what makes the two
        // match; setting a width would only have matched them at one font size.
        //
        // .plain, NOT .done. Owner: "why is the Done button blue?" A .done item
        // is the PROMINENT variant: iOS fills it with the system accent and it
        // ignores the navigation bar's tintColor entirely. Options is a plain
        // item, so while their styles differed the two could not have matched
        // whatever colour was set. Both are plain now, and applyChrome tints
        // each of them explicitly.
        // officeChrome uses "← Back" (the office's own top-left control);
        // an article uses a plain X-circle icon, matching officeChrome's own
        // close glyph — owner: "let's change Done to an X circle" — everywhere
        // "Done" used to be the label EXCEPT a plain office/Venite open, which
        // keeps the text "Done" (there's real ambiguity otherwise: is an icon
        // alone "leave" or "mark finished"? "Done" as a word says the latter,
        // which matters for something you're actively praying through).
        if officeChrome {
            let backItem = UIBarButtonItem(title: "← Back", style: .plain, target: self, action: #selector(close))
            backItem.accessibilityLabel = "Back to the office"
            self.doneItem = backItem
            navigationItem.leftBarButtonItem = backItem
        } else if isArticle {
            let closeItem = UIBarButtonItem(image: UIImage(systemName: "xmark.circle.fill"), style: .plain, target: self, action: #selector(close))
            closeItem.accessibilityLabel = "Close"
            self.doneItem = closeItem
            navigationItem.leftBarButtonItem = closeItem
        } else {
            let doneItem = UIBarButtonItem(title: "Done", style: .plain, target: self, action: #selector(close))
            doneItem.accessibilityLabel = "Done"
            self.doneItem = doneItem
            navigationItem.leftBarButtonItem = doneItem
        }

        // Owner: "at the top right could it be Options, and that brings down a
        // dropdown — kind of similar to the settings of the office slideshow."
        //
        // Praying the office on venite.app used to be a one-way trip: the only
        // controls were Safari and back. These are the three things someone
        // actually reaches for mid-office, and each hands off to the surface
        // that owns it rather than trying to reproduce it in here.
        let optionsItem = UIBarButtonItem(
            title: "Options",
            image: nil,
            primaryAction: nil,
            menu: UIMenu(children: [
                UIAction(title: "Configure office", image: UIImage(systemName: "slider.horizontal.3")) { [weak self] _ in
                    // Venite's own settings page — same site, so it stays in
                    // this browser rather than bouncing out and back.
                    guard let url = URL(string: "https://www.venite.app/home") else { return }
                    self?.webView.load(URLRequest(url: url))
                },
                UIAction(title: "Change format", image: UIImage(systemName: "arrow.triangle.2.circlepath")) { [weak self] _ in
                    self?.handingOff = true
                    self?.dismiss(animated: true) { self?.onChangeFormat?() }
                },
                UIAction(title: "Listen to the office", image: UIImage(systemName: "waveform")) { [weak self] _ in
                    self?.handingOff = true
                    self?.dismiss(animated: true) { self?.onListen?() }
                },
                UIAction(title: "Open in Safari", image: UIImage(systemName: "safari")) { [weak self] _ in
                    self?.openInSafari()
                },
            ])
        )
        optionsItem.accessibilityLabel = "Options"
        self.optionsItem = optionsItem
        if officeChrome {
            // The office's own top-right pair: the ⚙ Display sheet, and a
            // close X — same two controls, same order, as the office deck's
            // header. rightBarButtonItems lays out index 0 at the FAR right,
            // so [X, gear] reads gear-then-X left to right, matching the
            // office's own row.
            let displayItem = UIBarButtonItem(
                image: UIImage(systemName: "slider.horizontal.3"),
                style: .plain, target: self, action: #selector(openOfficeDisplaySettings)
            )
            displayItem.accessibilityLabel = "Display settings"
            let closeItem = UIBarButtonItem(
                image: UIImage(systemName: "xmark.circle.fill"),
                style: .plain, target: self, action: #selector(close)
            )
            closeItem.accessibilityLabel = "Close"
            self.optionsItem = displayItem
            self.closeXItem = closeItem
            navigationItem.rightBarButtonItems = [closeItem, displayItem]
            // The title pill: same text the office's own header pill shows.
            title = officeTitleText
        } else if isArticle {
            // No Options menu on an article — every item on it is about
            // praying an office; on a newsletter they are meaningless at best
            // and actively wrong at worst ("Listen to the office" would start
            // a liturgy podcast over a Rohr meditation).
            //
            // In its place: Reader. Owner: "on the newsletters, can we do a
            // button on the top right, same style as Done, which says Reader
            // and brings up the reader view." SFSafariViewController's own
            // Reader mode (entersReaderIfAvailable) already exists for this —
            // openReaderView(_:) below builds the identical view for the JS
            // front door; this reuses that SAME builder rather than a second
            // copy, so both paths stay in lockstep.
            let readerItem = UIBarButtonItem(title: "Reader", style: .plain, target: self, action: #selector(openReaderMode))
            readerItem.accessibilityLabel = "Reader view"
            self.optionsItem = readerItem
            navigationItem.rightBarButtonItem = readerItem
            title = nil
        } else {
            // A plain office/Venite open. Every Options item genuinely
            // applies here.
            navigationItem.rightBarButtonItem = optionsItem
        }

        // ── WebView ── adopt a preloaded one when present (already loading in
        // the background, so it appears instantly), otherwise build a fresh
        // one. Either way we own it, so we drive the nav delegate + load.
        webView = preloadedWebView ?? BibleWebViewController.makeWebView()
        webView.navigationDelegate = self
        // Owner: "we want all forward pages to open in light mode." The VC
        // itself forces .dark above (so prefers-color-scheme reads dark for
        // most sites, matching the app), but forwardmovement.org's own pages
        // are designed for light backgrounds — setting overrideUserInterfaceStyle
        // on the webView itself (not the VC) stops the .dark cascade at just
        // this view, without touching the surrounding dark chrome/toolbar.
        if BibleWebViewController.forcesLightMode(url) {
            webView.overrideUserInterfaceStyle = .light
        }
        view.addSubview(webView)

        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.tintColor = PhoebeBrowserColor.tint
        progressView.trackTintColor = .clear
        progressView.alpha = 0
        view.addSubview(progressView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            progressView.topAnchor.constraint(equalTo: webView.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 2),
        ])

        // ── Bottom bar: web back / forward · reload · share. ──
        backButton = UIBarButtonItem(
            image: UIImage(systemName: "chevron.left"),
            style: .plain, target: self, action: #selector(goBack)
        )
        backButton.accessibilityLabel = "Back"
        forwardButton = UIBarButtonItem(
            image: UIImage(systemName: "chevron.right"),
            style: .plain, target: self, action: #selector(goForward)
        )
        forwardButton.accessibilityLabel = "Forward"
        let reloadButton = UIBarButtonItem(
            image: UIImage(systemName: "arrow.clockwise"),
            style: .plain, target: self, action: #selector(reload)
        )
        reloadButton.accessibilityLabel = "Reload"
        let shareButton = UIBarButtonItem(
            image: UIImage(systemName: "square.and.arrow.up"),
            style: .plain, target: self, action: #selector(share)
        )
        shareButton.accessibilityLabel = "Share"
        // The Journal button is GONE. It dismissed the browser and fired
        // phoebe:open-journal — an event nothing in the web app listens for,
        // to a /journal route that no longer exists (the journal was removed).
        // So mid-office it closed the liturgy, lost the reader's place, and
        // opened nothing. It only ever "worked" because this whole controller
        // was unregistered until today; registering the plugin made a dead
        // button reachable.
        let flex = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        let flex2 = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        backButton.isEnabled = false
        forwardButton.isEnabled = false
        toolbarItems = [backButton, fixedSpace(16), forwardButton, flex, reloadButton, flex2, shareButton]

        // Progress bar bound to the load.
        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] _, change in
            guard let self = self, let p = change.newValue else { return }
            self.progressView.setProgress(Float(p), animated: true)
            if p > 0 && p < 1 {
                UIView.animate(withDuration: 0.15) { self.progressView.alpha = 1 }
            }
        }
        // Title follows the page's <title> once it loads.
        titleObservation = webView.observe(\.title, options: [.new]) { [weak self] webView, _ in
            guard let self, !self.isArticle else { return }
            if let t = webView.title, !t.isEmpty { self.title = t }
        }

        // A preloaded web view is already loading/loaded — only kick off the
        // request for a freshly-built one.
        if preloadedWebView == nil {
            webView.load(URLRequest(url: url))
        }
        updateNavButtons()
        // Start in the chrome the caller expects, so the first frame is already
        // right; syncChromeToPage corrects it from the page's own background
        // once that paints.
        applyChrome(isLight: isArticle)

        // The veil goes on LAST so it covers the web view and the progress bar.
        loadingVeil.translatesAutoresizingMaskIntoConstraints = false
        // Owner: "I wanted it to be like how the office loads." The office
        // holds the splash leaf while it assembles, so this holds the same one
        // — the same asset, full-bleed, no spinner. A spinner says "the machine
        // is busy"; the leaf says the page is being made ready, which is the
        // same thing said in the app's own voice. The image is what the eye
        // reads, so the background colour behind it only matters if the asset
        // is ever missing.
        loadingVeil.backgroundColor = .black
        loadingVeil.clipsToBounds = true
        veilImage.translatesAutoresizingMaskIntoConstraints = false
        veilImage.contentMode = .scaleAspectFill
        loadingVeil.addSubview(veilImage)
        veilSpinner.translatesAutoresizingMaskIntoConstraints = false
        veilSpinner.startAnimating()
        loadingVeil.addSubview(veilSpinner)
        // Hosted on the NAVIGATION CONTROLLER's view, not this one. Owner: "the
        // splash needs to go over the top bar." A view controller's own view
        // begins below the navigation bar, so a veil added there left Done,
        // Options and the title sitting on a black strip above the leaf — the
        // chrome of a page you cannot see yet, which is the half-loaded look
        // the veil exists to hide. The nav controller's view is the whole
        // screen, bar included.
        let veilHost: UIView = navigationController?.view ?? view
        veilHost.addSubview(loadingVeil)
        NSLayoutConstraint.activate([
            loadingVeil.topAnchor.constraint(equalTo: veilHost.topAnchor),
            loadingVeil.bottomAnchor.constraint(equalTo: veilHost.bottomAnchor),
            loadingVeil.leadingAnchor.constraint(equalTo: veilHost.leadingAnchor),
            loadingVeil.trailingAnchor.constraint(equalTo: veilHost.trailingAnchor),
            veilImage.topAnchor.constraint(equalTo: loadingVeil.topAnchor),
            veilImage.bottomAnchor.constraint(equalTo: loadingVeil.bottomAnchor),
            veilImage.leadingAnchor.constraint(equalTo: loadingVeil.leadingAnchor),
            veilImage.trailingAnchor.constraint(equalTo: loadingVeil.trailingAnchor),
            veilSpinner.centerXAnchor.constraint(equalTo: loadingVeil.centerXAnchor),
            // Centred (owner). The office sits its ring low because there is a
            // versicle above it to read; this splash is the leaf alone, so the
            // middle is where the eye already is.
            veilSpinner.centerYAnchor.constraint(equalTo: loadingVeil.centerYAnchor),
            veilSpinner.widthAnchor.constraint(equalToConstant: 22),
            veilSpinner.heightAnchor.constraint(equalToConstant: 22),
        ])
        // The floating bottom pill — office chrome only. Built now so it can
        // be positioned relative to the same veilHost, but kept invisible
        // until the veil lifts: the SNAPSHOT already shows the office's own
        // pill baked into the image, so both on screen at once would read as
        // a duplicate. See hideVeil().
        if officeChrome { buildOfficeNavPill(in: veilHost) }

        veilShownAt = CACurrentMediaTime()
        // A warmed web view may have finished loading before this controller
        // existed, in which case didFinish has already been and gone and would
        // never fire again — the veil would sit until the ceiling. Reveal on
        // the floor instead.
        if !webView.isLoading { hideVeil() }
        // The ceiling. A page that never reports finishing must not hold the
        // veil forever.
        DispatchQueue.main.asyncAfter(deadline: .now() + veilMaxSeconds) { [weak self] in
            self?.hideVeil()
        }

        // Swipe right from the left edge to flick the browser back out — the
        // interactive twin of the slide-in present.
        let edgePan = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleDismissPan(_:)))
        edgePan.edges = .left
        view.addGestureRecognizer(edgePan)
    }

    // Drives the interactive swipe-to-dismiss. The percent-driven interactor
    // is handed to the transition delegate for the life of the gesture so the
    // slide-out tracks the finger; on release we complete past 40% (or a fast
    // flick) and snap back otherwise.
    @objc private func handleDismissPan(_ gr: UIScreenEdgePanGestureRecognizer) {
        let width = max(view.bounds.width, 1)
        let progress = min(1, max(0, gr.translation(in: view).x / width))
        switch gr.state {
        case .began:
            slideDelegate.interactiveDismiss = UIPercentDrivenInteractiveTransition()
            dismiss(animated: true)
        case .changed:
            slideDelegate.interactiveDismiss?.update(progress)
        case .ended, .cancelled:
            let interactor = slideDelegate.interactiveDismiss
            let flick = gr.velocity(in: view).x > 600
            if gr.state == .ended && (progress > 0.4 || flick) {
                interactor?.finish()
            } else {
                interactor?.cancel()
            }
            slideDelegate.interactiveDismiss = nil
        default:
            break
        }
    }

    private func fixedSpace(_ width: CGFloat) -> UIBarButtonItem {
        let item = UIBarButtonItem(barButtonSystemItem: .fixedSpace, target: nil, action: nil)
        item.width = width
        return item
    }

    private func updateNavButtons() {
        backButton?.isEnabled = webView.canGoBack
        forwardButton?.isEnabled = webView.canGoForward
    }

    /// Match the navigation bar to the page's own background.
    ///
    /// Owner: "black or white depending on the background of Venite." Asking
    /// the page rather than hard-coding either one means the chrome keeps
    /// matching if the site changes, and it works for the other pages this
    /// browser opens too. Falls back to what's already set when the page
    /// doesn't answer — a wrong-but-stable bar beats a flashing one.
    /**
     * Paint every piece of chrome for a light or dark page, together.
     *
     * The bug this replaces: syncChromeToPage set the bar's BACKGROUND and
     * TITLE from the page, and nothing else. The nav bar's tintColor, the
     * interface style, and the Done button's own title colour all stayed on
     * their dark-mode values, so a cream newsletter got a white bar carrying
     * black capsule buttons with unreadable content — a bar half-flipped.
     *
     * Anything that depends on light-vs-dark belongs in here. A second place
     * that decides part of it is how the halves got out of step in the first
     * place.
     */
    /**
     * Reveal the page. Idempotent — called by didFinish, by didFail, and by the
     * ceiling timer, and only the first of those does anything.
     */
    private func hideVeil() {
        guard !veilDismissed else { return }
        let elapsed = CACurrentMediaTime() - veilShownAt
        if elapsed < veilMinSeconds {
            // The floor: wait out the remainder rather than flashing.
            DispatchQueue.main.asyncAfter(deadline: .now() + (veilMinSeconds - elapsed)) { [weak self] in
                self?.hideVeil()
            }
            return
        }
        veilDismissed = true
        UIView.animate(withDuration: 0.32, delay: 0, options: [.curveEaseInOut], animations: { [weak self] in
            self?.loadingVeil.alpha = 0
            // Cross-fade the REAL pill in exactly as the screenshot's baked-in
            // one fades out — the "fades from that into the web page" the
            // office-reading flavour asks for.
            self?.officeNavPill?.alpha = 1
        }, completion: { [weak self] _ in
            self?.veilSpinner.stopAnimating()
            self?.loadingVeil.isHidden = true
        })
    }

    /**
     * The floating bottom pill — Back · progress · Next — mirroring the
     * office deck's own. A UIVisualEffectView capsule rather than a UIToolbar:
     * the office's pill is sized to its content and floats centred above the
     * safe area, not a full-width bar, and a toolbar cannot do that shape.
     */
    private func buildOfficeNavPill(in host: UIView) {
        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
        blur.translatesAutoresizingMaskIntoConstraints = false
        blur.layer.cornerRadius = 22
        blur.clipsToBounds = true
        blur.layer.borderWidth = 1
        blur.alpha = 0  // see hideVeil() — hidden until the snapshot's own pill fades out
        host.addSubview(blur)
        officeNavPill = blur

        let back = UIButton(type: .system)
        back.setTitle("Back", for: .normal)
        back.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
        back.addTarget(self, action: #selector(officeNavBack), for: .touchUpInside)
        back.layer.cornerRadius = 14
        back.layer.borderWidth = 1
        back.contentEdgeInsets = UIEdgeInsets(top: 7, left: 14, bottom: 7, right: 14)
        officeBackButton = back

        let label = UILabel()
        label.font = .systemFont(ofSize: 10, weight: .semibold)
        label.text = [officeSlideLabel, officeSectionLabel].compactMap { $0 }.joined(separator: " · ").uppercased()
        label.setContentCompressionResistancePriority(.required, for: .horizontal)
        officeNavLabel = label

        let next = UIButton(type: .system)
        // Always "Next →" — the lesson slide this pill is reached from is
        // never the office's last slide and never an intercession, so the
        // office's own Amen/Done relabeling never applies here.
        next.setTitle("Next →", for: .normal)
        next.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
        next.addTarget(self, action: #selector(officeNavNext), for: .touchUpInside)
        next.layer.cornerRadius = 14
        next.contentEdgeInsets = UIEdgeInsets(top: 7, left: 16, bottom: 7, right: 16)
        officeNextButton = next

        let stack = UIStackView(arrangedSubviews: [back, label, next])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.alignment = .center
        stack.spacing = 12
        blur.contentView.addSubview(stack)

        NSLayoutConstraint.activate([
            blur.centerXAnchor.constraint(equalTo: host.centerXAnchor),
            blur.bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            blur.leadingAnchor.constraint(greaterThanOrEqualTo: host.leadingAnchor, constant: 16),
            blur.trailingAnchor.constraint(lessThanOrEqualTo: host.trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: blur.contentView.topAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: blur.contentView.bottomAnchor, constant: -8),
            stack.leadingAnchor.constraint(equalTo: blur.contentView.leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: blur.contentView.trailingAnchor, constant: -12),
        ])
    }

    private func applyChrome(isLight: Bool, statusStrip: UIColor? = nil) {
        /**
         * With the top bar restored, the bar IS the strip behind the status bar
         * — a UINavigationBar extends its own background up under the clock. So
         * the page's top band goes on the bar itself, and "if the page has a top
         * bar with a colour, have that extend to the top of the page" comes out
         * as the bar simply continuing the page.
         *
         * Contrast is then a question about the BAR, not about the body: a cream
         * masthead over a dark article still needs dark labels. So the bar's own
         * colour decides its content colour, and the body only decides the web
         * view's backdrop.
         */
        let bar: UIColor = statusStrip ?? (isLight ? .white : .black)
        let barIsLight = Self.isLightColor(bar)
        let text: UIColor = barIsLight ? .black : PhoebeBrowserColor.text
        // The bar tint colours the bar-button items. On a light bar iOS renders
        // them as filled capsules, so this is the capsule's own colour — a dark
        // one on white, not the pale sage that only reads on black.
        // Owner: "white when the others are white, black when the others are
        // black." Not the app's sage — that only ever read on the dark bar, and
        // on white it was a third colour next to two that agreed.
        let tint: UIColor = barIsLight ? .black : .white
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = bar
        appearance.titleTextAttributes = [.foregroundColor: text]
        appearance.shadowColor = UIColor.clear
        let navBar = navigationController?.navigationBar
        navBar?.standardAppearance = appearance
        navBar?.scrollEdgeAppearance = appearance
        navBar?.compactAppearance = appearance
        navBar?.tintColor = tint
        // The article's Done lives down here, so the bottom bar takes the same
        // treatment — otherwise a dark page would leave black-on-black.
        let toolbarAppearance = UIToolbarAppearance()
        toolbarAppearance.configureWithOpaqueBackground()
        toolbarAppearance.backgroundColor = bar
        toolbarAppearance.shadowColor = UIColor.clear
        let toolbar = navigationController?.toolbar
        toolbar?.standardAppearance = toolbarAppearance
        toolbar?.compactAppearance = toolbarAppearance
        if #available(iOS 15.0, *) { toolbar?.scrollEdgeAppearance = toolbarAppearance }
        toolbar?.tintColor = tint
        // Carries the rest of UIKit with it — bar-button capsules, the menu
        // that drops out of Options, the scroll indicators.
        navigationController?.overrideUserInterfaceStyle = barIsLight ? .light : .dark
        // Per-item as well as on the bar. Owner: "I want it to match the other
        // buttons — white when the others are white, black when the others are
        // black." Setting it on each item is what makes them agree; the bar's
        // tintColor is only a default, and individual items can escape it.
        doneItem?.tintColor = tint
        optionsItem?.tintColor = tint
        closeXItem?.tintColor = tint
        applyOfficePillChrome(bar: bar, tint: tint, text: text)
        view.backgroundColor = bar
        navigationController?.view.backgroundColor = bar
        // The page's own body, behind the web view — not the bar's band, or a
        // cream masthead would tint the whole of a dark article's backdrop.
        webView?.backgroundColor = isLight ? .white : .black
    }

    /** Colour the floating bottom pill to match — see buildOfficeNavPill. */
    private func applyOfficePillChrome(bar: UIColor, tint: UIColor, text: UIColor) {
        guard officeChrome else { return }
        officeNavPill?.layer.borderColor = tint.withAlphaComponent(0.35).cgColor
        officeNavLabel?.textColor = tint.withAlphaComponent(0.85)
        officeBackButton?.setTitleColor(text, for: .normal)
        officeBackButton?.layer.borderColor = tint.withAlphaComponent(0.45).cgColor
        // Next is the pill's one FILLED control, same emphasis the office's own
        // green Next button carries — tint-filled, bar-coloured label, so it
        // reads as the primary action against either a light or dark page.
        officeNextButton?.backgroundColor = tint
        officeNextButton?.setTitleColor(bar, for: .normal)
    }

    /** Parse a CSS rgb()/rgba() string. nil for anything transparent. */
    private func parseCSSColor(_ css: String?) -> UIColor? {
        guard let css else { return nil }
        let nums = css.split(whereSeparator: { !"0123456789.".contains($0) })
            .compactMap { Double($0) }
        guard nums.count >= 3 else { return nil }
        // rgba(…, 0) tells us nothing about what the reader actually sees.
        if nums.count >= 4, nums[3] == 0 { return nil }
        return UIColor(red: nums[0] / 255, green: nums[1] / 255, blue: nums[2] / 255, alpha: 1)
    }

    private static func isLightColor(_ c: UIColor) -> Bool {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (0.299 * r + 0.587 * g + 0.114 * b) > 0.5
    }

    /**
     * Read the page's own colours and dress the app's chrome to match.
     *
     * TWO colours, not one. The BODY background decides light-vs-dark for the
     * bars and their labels. The colour of whatever sits at the very TOP of the
     * page is a separate question, and it is what fills the strip behind the
     * iPhone's status bar.
     *
     * Owner: "if the page has a top bar with a colour, have that extend to the
     * top of the page behind the iPhone top bar." CAC opens with a cream
     * masthead; the strip above it was taking the body's white, so the article
     * began with a seam across it. Sampling the header instead lets the page's
     * own band run to the top of the screen.
     *
     * The probe walks UP from whatever element is at the top-centre of the
     * viewport until it finds an opaque background — the text or logo you
     * actually hit is nearly always transparent, and its container is the thing
     * with the colour.
     */
    private func syncChromeToPage() {
        let probe = """
        (function () {
          var body = getComputedStyle(document.body).backgroundColor;
          var top = null;
          var el = document.elementFromPoint(window.innerWidth / 2, 3);
          while (el && el !== document.documentElement) {
            var bg = getComputedStyle(el).backgroundColor;
            var m = bg && bg.match(/[0-9.]+/g);
            if (m && m.length >= 3 && (m.length < 4 || parseFloat(m[3]) > 0.95)) { top = bg; break; }
            el = el.parentElement;
          }
          return JSON.stringify({ body: body, top: top });
        })()
        """
        webView.evaluateJavaScript(probe) { [weak self] value, _ in
            guard let self,
                  let json = value as? String,
                  let data = json.data(using: .utf8),
                  let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return }
            let bodyColor = self.parseCSSColor(parsed["body"] as? String)
            // Fall back to the body when the page has no distinct band up top —
            // then the strip simply continues the page, which is what it did
            // before and is still right.
            let topColor = self.parseCSSColor(parsed["top"] as? String) ?? bodyColor
            guard let bodyColor else { return }
            DispatchQueue.main.async {
                self.applyChrome(isLight: Self.isLightColor(bodyColor), statusStrip: topColor)
            }
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────
    @objc private func close() { dismiss(animated: true) }
    @objc private func openReaderMode() {
        handingOff = true
        let current = webView.url ?? url
        dismiss(animated: true) { [weak self] in self?.onOpenReaderView?(current) }
    }
    @objc private func openOfficeDisplaySettings() {
        handingOff = true
        dismiss(animated: true) { [weak self] in self?.onOfficeDisplaySettings?() }
    }
    // Bottom pill Back/Next — dismiss first (viewDidDisappear's onDismiss
    // still fires after these; onOfficePrev/onOfficeNext run once we're
    // actually gone, mirroring the Options actions above).
    @objc private func officeNavBack() {
        handingOff = true
        dismiss(animated: true) { [weak self] in self?.onOfficePrev?() }
    }
    @objc private func officeNavNext() {
        handingOff = true
        dismiss(animated: true) { [weak self] in self?.onOfficeNext?() }
    }
    @objc private func reload() { webView.reload() }
    @objc private func goBack() { if webView.canGoBack { webView.goBack() } }
    @objc private func goForward() { if webView.canGoForward { webView.goForward() } }
    @objc private func openInSafari() { UIApplication.shared.open(webView.url ?? url) }
    @objc private func share() {
        let activity = UIActivityViewController(activityItems: [webView.url ?? url], applicationActivities: nil)
        // iPad needs a popover anchor; the share button is the last toolbar item.
        activity.popoverPresentationController?.barButtonItem = toolbarItems?.last
        present(activity, animated: true)
    }

    // ── WKNavigationDelegate ────────────────────────────────────────────────
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        UIView.animate(withDuration: 0.25, animations: { [weak self] in
            self?.progressView.alpha = 0
        }) { [weak self] _ in
            self?.progressView.setProgress(0, animated: false)
        }
        updateNavButtons()
        // The page has painted — take its background and match the chrome to it.
        syncChromeToPage()
        // …and again shortly after. Plenty of sites paint a plain body first and
        // drop their masthead in a beat later (a web font, a lazy stylesheet),
        // and the first sample would then have read the page before it had the
        // band we are trying to match.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            self?.syncChromeToPage()
        }
        hideVeil()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        UIView.animate(withDuration: 0.25) { [weak self] in self?.progressView.alpha = 0 }
        updateNavButtons()
        // Reveal whatever there is — an error page they can read beats a veil
        // that never lifts.
        hideVeil()
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        updateNavButtons()
    }

    // target=_blank / new-window links: load them in THIS view rather than
    // handing off to the system browser, so a footer/link tap doesn't eject
    // the user to Safari. The toolbar's Safari button is the deliberate exit.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

/**
 * The office's loading ring, in CoreAnimation.
 *
 * The web one is a CSS circle whose border is uniformly faint except for
 * `border-top-color`, spun by `animate-spin`. There is no border-side colour in
 * CoreAnimation, so it is drawn as two strokes on the same circle — the full
 * faint ring, and a quarter-arc at the top over it — and the arc is what spins.
 */
final class OfficeSpinnerView: UIView {
    // rgb(143,175,150) — the --ot-sage the office's ring uses.
    private static let sage = UIColor(red: 143.0 / 255, green: 175.0 / 255, blue: 150.0 / 255, alpha: 1)
    private let track = CAShapeLayer()
    private let head = CAShapeLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        for layer in [track, head] {
            layer.fillColor = UIColor.clear.cgColor
            layer.lineWidth = 2
            self.layer.addSublayer(layer)
        }
        track.strokeColor = Self.sage.withAlphaComponent(0.25).cgColor
        head.strokeColor = Self.sage.withAlphaComponent(0.75).cgColor
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Inset by half the stroke so the ring sits inside the bounds, the way
        // a CSS border does.
        let rect = bounds.insetBy(dx: 1, dy: 1)
        let centre = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        track.frame = bounds
        head.frame = bounds
        track.path = UIBezierPath(ovalIn: rect).cgPath
        // The top quarter: from -135° to -45°, i.e. centred on straight up.
        head.path = UIBezierPath(
            arcCenter: centre, radius: radius,
            startAngle: -3 * .pi / 4, endAngle: -.pi / 4, clockwise: true
        ).cgPath
    }

    func startAnimating() {
        guard head.animation(forKey: "spin") == nil else { return }
        let spin = CABasicAnimation(keyPath: "transform.rotation.z")
        spin.fromValue = 0
        spin.toValue = 2 * Double.pi
        spin.duration = 1            // Tailwind's animate-spin is 1s linear.
        spin.repeatCount = .infinity
        spin.timingFunction = CAMediaTimingFunction(name: .linear)
        // Rotate about the middle, not the layer's origin.
        head.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        head.add(spin, forKey: "spin")
    }
    func stopAnimating() { head.removeAnimation(forKey: "spin") }
}

// ── Slide transition ────────────────────────────────────────────────────────
//
// Makes the browser slide in from the right (and back out to the right on
// close) like advancing to the next slide — instead of the default modal
// sheet that animates up from the bottom and reads as "leaving the app".

final class SlideTransitionDelegate: NSObject, UIViewControllerTransitioningDelegate {
    // Set by the browser's edge-pan handler while a swipe-to-dismiss is in
    // flight; nil for a button-tap dismiss (which just animates normally).
    var interactiveDismiss: UIPercentDrivenInteractiveTransition?

    func animationController(forPresented presented: UIViewController,
                             presenting: UIViewController,
                             source: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        SlideTransitionAnimator(presenting: true)
    }
    func animationController(forDismissed dismissed: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        SlideTransitionAnimator(presenting: false)
    }
    func interactionControllerForDismissal(using animator: UIViewControllerAnimatedTransitioning) -> UIViewControllerInteractiveTransitioning? {
        interactiveDismiss
    }
}

final class SlideTransitionAnimator: NSObject, UIViewControllerAnimatedTransitioning {
    private let presenting: Bool
    init(presenting: Bool) { self.presenting = presenting }

    func transitionDuration(using ctx: UIViewControllerContextTransitioning?) -> TimeInterval { 0.33 }

    func animateTransition(using ctx: UIViewControllerContextTransitioning) {
        let container = ctx.containerView
        let duration = transitionDuration(using: ctx)

        /**
         * A FADE, not a slide.
         *
         * Owner: "change the way the external website content comes in — not
         * that slide-in, but the way it transitions to other pages or
         * slideshows, like a fade."
         *
         * A horizontal slide announces "a different app opened on top of
         * yours". Everywhere else Phoebe changes what you're looking at by
         * cross-fading — the office slides, the page reveals — and the office
         * continuing on venite.app is a change of surface, not a departure. The
         * fade makes the browser feel like the next page of the liturgy rather
         * than somewhere you were sent.
         *
         * The very slight scale keeps a pure opacity fade from reading as a
         * flicker; it's small enough to feel like settling rather than zooming.
         */
        if presenting {
            guard let toVC = ctx.viewController(forKey: .to),
                  let toView = ctx.view(forKey: .to) else {
                ctx.completeTransition(false); return
            }
            toView.frame = ctx.finalFrame(for: toVC)
            toView.alpha = 0
            toView.transform = CGAffineTransform(scaleX: 1.02, y: 1.02)
            container.addSubview(toView)
            UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseOut], animations: {
                toView.alpha = 1
                toView.transform = .identity
            }, completion: { _ in
                ctx.completeTransition(!ctx.transitionWasCancelled)
            })
        } else {
            // The presenter's view stays behind (overFullScreen), so fading the
            // browser out reveals it. Driven by the same percent-based
            // interactive transition as before, so the edge-swipe still tracks
            // the finger — it dims across the drag instead of sliding.
            guard let fromView = ctx.view(forKey: .from) else {
                ctx.completeTransition(false); return
            }
            UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseIn], animations: {
                fromView.alpha = 0
                fromView.transform = CGAffineTransform(scaleX: 1.02, y: 1.02)
            }, completion: { _ in
                if ctx.transitionWasCancelled {
                    // Released before the threshold — restore it in place.
                    // UIView.animate otherwise leaves the model layer at the
                    // final (invisible) values.
                    fromView.alpha = 1
                    fromView.transform = .identity
                } else {
                    fromView.removeFromSuperview()
                }
                ctx.completeTransition(!ctx.transitionWasCancelled)
            })
        }
    }
}

// ── Presenter ─────────────────────────────────────────────────────────────
//
// Single entry point used from BibleBrowserPlugin. Wraps the controller in a
// UINavigationController (top bar + bottom toolbar render automatically) and
// presents it with the custom slide transition + dark Phoebe chrome.

@objcMembers
final class BibleBrowser: NSObject {
    static let shared = BibleBrowser()
    private override init() { super.init() }

    // A few warm, already-loading web views keyed by absolute URL, so tapping a
    // card whose page we preloaded on the home screen opens instantly. Capped
    // so we never hold more than a handful of live pages in memory.
    private var warm: [(url: String, webView: WKWebView)] = []
    private let warmCap = 3

    // Start a background load for `url` unless we're already warming it. Called
    // from JS (PhoebeNative.preloadInAppBrowser) when a newsletter card mounts.
    func preload(url: URL) {
        let key = url.absoluteString
        if warm.contains(where: { $0.url == key }) { return }
        let wv = BibleWebViewController.makeWebView()
        wv.load(URLRequest(url: url))
        warm.append((url: key, webView: wv))
        while warm.count > warmCap { warm.removeFirst() }
    }

    private func takeWarm(for url: URL) -> WKWebView? {
        let key = url.absoluteString
        guard let idx = warm.firstIndex(where: { $0.url == key }) else { return nil }
        let wv = warm[idx].webView
        warm.remove(at: idx)
        return wv
    }

    func present(
        url: URL,
        from presenter: UIViewController?,
        onJournal: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        onChangeFormat: (() -> Void)? = nil,
        onListen: (() -> Void)? = nil,
        isArticle: Bool = false,
        officeChrome: Bool = false,
        officeTitle: String? = nil,
        officeSlideLabel: String? = nil,
        officeSectionLabel: String? = nil,
        snapshotVeilImage: UIImage? = nil,
        onOfficePrev: (() -> Void)? = nil,
        onOfficeNext: (() -> Void)? = nil,
        onOfficeDisplaySettings: (() -> Void)? = nil,
        onOpenReaderView: ((URL) -> Void)? = nil
    ) {
        guard let presenter = presenter else { return }
        let vc = BibleWebViewController(url: url, preloadedWebView: takeWarm(for: url))
        // officeChrome is its OWN light-chrome page (bible.com / oremus are
        // light), so it gets the article-flavoured starting posture — no dark
        // flash before the page paints — on top of its own button set below.
        vc.isArticle = isArticle || officeChrome
        vc.officeChrome = officeChrome
        vc.officeTitleText = officeTitle
        vc.officeSlideLabel = officeSlideLabel
        vc.officeSectionLabel = officeSectionLabel
        vc.snapshotVeilImage = snapshotVeilImage
        vc.onOfficePrev = onOfficePrev
        vc.onOfficeNext = onOfficeNext
        vc.onOfficeDisplaySettings = onOfficeDisplaySettings
        vc.onOpenReaderView = onOpenReaderView
        vc.onJournal = onJournal
        vc.onDismiss = onDismiss
        vc.onChangeFormat = onChangeFormat
        vc.onListen = onListen
        // Office-chrome pages are light pages too (bible.com / oremus) — one
        // flag decides the starting posture for both flavours, so it can't
        // drift the way two independent checks would.
        //
        // Venite specifically joins them. Owner: "on Venite, is it doing dark
        // mode automatically — take that out." Forcing .dark here doesn't just
        // colour our own bars; it cascades to the WEB VIEW too (see viewDidLoad's
        // own note on why — matching prefers-color-scheme so most sites render
        // dark), which was pushing Venite's OWN page into a dark rendering it
        // never asked for, on top of our chrome. Venite is normally light, so it
        // gets the same "start neutral, let syncChromeToPage correct it after
        // paint" treatment as an article — not forced into a theme it doesn't
        // choose for itself.
        let isVenite = url.host?.lowercased().hasSuffix("venite.app") ?? false
        let startsLight = isArticle || officeChrome || isVenite
        let nav = UINavigationController(rootViewController: vc)
        nav.overrideUserInterfaceStyle = startsLight ? .light : .dark
        // Keep the top + bottom bars pinned — never collapse/minimize on scroll
        // or tap, so the back + Journal buttons stay reachable the whole read.
        nav.hidesBarsOnSwipe = false
        nav.hidesBarsOnTap = false

        // Dark Phoebe chrome for the top navigation bar.
        let barAppearance = UINavigationBarAppearance()
        barAppearance.configureWithOpaqueBackground()
        barAppearance.backgroundColor = startsLight ? .white : PhoebeBrowserColor.bar
        barAppearance.titleTextAttributes = [.foregroundColor: startsLight ? UIColor.black : PhoebeBrowserColor.text]
        barAppearance.shadowColor = UIColor.clear
        nav.navigationBar.standardAppearance = barAppearance
        nav.navigationBar.scrollEdgeAppearance = barAppearance
        nav.navigationBar.compactAppearance = barAppearance
        nav.navigationBar.tintColor = startsLight ? .black : .white

        // …and the bottom toolbar.
        let toolbarAppearance = UIToolbarAppearance()
        toolbarAppearance.configureWithOpaqueBackground()
        toolbarAppearance.backgroundColor = startsLight ? .white : PhoebeBrowserColor.bar
        toolbarAppearance.shadowColor = UIColor.clear
        nav.toolbar.standardAppearance = toolbarAppearance
        nav.toolbar.compactAppearance = toolbarAppearance
        if #available(iOS 15.0, *) {
            nav.toolbar.scrollEdgeAppearance = toolbarAppearance
        }
        nav.toolbar.tintColor = startsLight ? .black : PhoebeBrowserColor.tint
        // Owner: "we don't actually need the bottom bar." Everything on it is
        // either duplicated in Options (reload, share) or unused while reading
        // — and on something you scroll for ten minutes, a permanent bar is
        // just less page. Done (and, for an office, Options) stay pinned at the
        // top.
        nav.setToolbarHidden(true, animated: false)

        // Slide in from the right (next-slide feel), over the app rather than
        // replacing it, so the dismiss can slide back to reveal it.
        nav.modalPresentationStyle = .overFullScreen
        nav.transitioningDelegate = vc.slideDelegate

        presenter.present(nav, animated: true)
    }
}
