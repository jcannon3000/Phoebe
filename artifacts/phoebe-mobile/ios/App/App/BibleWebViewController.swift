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
     */
    var startsLight = false

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
    private let loadingVeil = UIView()
    private let veilSpinner = UIActivityIndicatorView(style: .medium)
    private var veilShownAt: CFTimeInterval = 0
    private var veilDismissed = false
    private let veilMinSeconds: CFTimeInterval = 1.2
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
        let doneItem = UIBarButtonItem(title: "Done", style: .done, target: self, action: #selector(close))
        doneItem.accessibilityLabel = "Done"
        navigationItem.leftBarButtonItem = doneItem

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
        navigationItem.rightBarButtonItem = optionsItem

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
            if let t = webView.title, !t.isEmpty { self?.title = t }
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
        applyChrome(isLight: startsLight)

        // The veil goes on LAST so it covers the web view and the progress bar.
        loadingVeil.translatesAutoresizingMaskIntoConstraints = false
        loadingVeil.backgroundColor = startsLight ? .white : .black
        veilSpinner.translatesAutoresizingMaskIntoConstraints = false
        veilSpinner.color = startsLight ? UIColor.black.withAlphaComponent(0.35) : PhoebeBrowserColor.tint
        veilSpinner.startAnimating()
        loadingVeil.addSubview(veilSpinner)
        view.addSubview(loadingVeil)
        NSLayoutConstraint.activate([
            loadingVeil.topAnchor.constraint(equalTo: view.topAnchor),
            loadingVeil.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            loadingVeil.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            loadingVeil.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            veilSpinner.centerXAnchor.constraint(equalTo: loadingVeil.centerXAnchor),
            veilSpinner.centerYAnchor.constraint(equalTo: loadingVeil.centerYAnchor),
        ])
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
        }, completion: { [weak self] _ in
            self?.veilSpinner.stopAnimating()
            self?.loadingVeil.isHidden = true
        })
    }

    private func applyChrome(isLight: Bool) {
        let bar: UIColor = isLight ? .white : .black
        let text: UIColor = isLight ? .black : PhoebeBrowserColor.text
        // The bar tint colours the bar-button items. On a light bar iOS renders
        // them as filled capsules, so this is the capsule's own colour — a dark
        // one on white, not the pale sage that only reads on black.
        let tint: UIColor = isLight ? UIColor(red: 0.11, green: 0.27, blue: 0.16, alpha: 1) : PhoebeBrowserColor.tint
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
        // Carries the rest of UIKit with it — bar-button capsules, the menu
        // that drops out of Options, the scroll indicators.
        navigationController?.overrideUserInterfaceStyle = isLight ? .light : .dark
        view.backgroundColor = bar
        webView?.backgroundColor = bar
        // …including the veil, while it is still up. Learning the page is dark
        // AFTER painting a white veil would otherwise reveal the page through a
        // colour flip — the flash this is here to prevent.
        if !veilDismissed {
            loadingVeil.backgroundColor = bar
            veilSpinner.color = isLight ? UIColor.black.withAlphaComponent(0.35) : PhoebeBrowserColor.tint
        }
    }

    private func syncChromeToPage() {
        webView.evaluateJavaScript(
            "getComputedStyle(document.body).backgroundColor"
        ) { [weak self] value, _ in
            guard let self, let css = value as? String else { return }
            let nums = css.split(whereSeparator: { !"0123456789.".contains($0) })
                .compactMap { Double($0) }
            guard nums.count >= 3 else { return }
            // rgba(…, 0) is a transparent body — it tells us nothing about what
            // the reader actually sees, so leave the bar alone.
            if nums.count >= 4, nums[3] == 0 { return }
            let luma = (0.299 * nums[0] + 0.587 * nums[1] + 0.114 * nums[2]) / 255.0
            let isLight = luma > 0.5
            DispatchQueue.main.async { self.applyChrome(isLight: isLight) }
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────
    @objc private func close() { dismiss(animated: true) }
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
        lightChrome: Bool = false
    ) {
        guard let presenter = presenter else { return }
        let vc = BibleWebViewController(url: url, preloadedWebView: takeWarm(for: url))
        vc.startsLight = lightChrome
        vc.onJournal = onJournal
        vc.onDismiss = onDismiss
        vc.onChangeFormat = onChangeFormat
        vc.onListen = onListen
        let nav = UINavigationController(rootViewController: vc)
        nav.overrideUserInterfaceStyle = lightChrome ? .light : .dark
        // Keep the top + bottom bars pinned — never collapse/minimize on scroll
        // or tap, so the back + Journal buttons stay reachable the whole read.
        nav.hidesBarsOnSwipe = false
        nav.hidesBarsOnTap = false

        // Dark Phoebe chrome for the top navigation bar.
        let barAppearance = UINavigationBarAppearance()
        barAppearance.configureWithOpaqueBackground()
        barAppearance.backgroundColor = lightChrome ? .white : PhoebeBrowserColor.bar
        barAppearance.titleTextAttributes = [.foregroundColor: lightChrome ? UIColor.black : PhoebeBrowserColor.text]
        barAppearance.shadowColor = UIColor.clear
        nav.navigationBar.standardAppearance = barAppearance
        nav.navigationBar.scrollEdgeAppearance = barAppearance
        nav.navigationBar.compactAppearance = barAppearance
        nav.navigationBar.tintColor = lightChrome
            ? UIColor(red: 0.11, green: 0.27, blue: 0.16, alpha: 1)
            : PhoebeBrowserColor.tint

        // …and the bottom toolbar.
        let toolbarAppearance = UIToolbarAppearance()
        toolbarAppearance.configureWithOpaqueBackground()
        toolbarAppearance.backgroundColor = PhoebeBrowserColor.bar
        toolbarAppearance.shadowColor = UIColor.white.withAlphaComponent(0.08)
        nav.toolbar.standardAppearance = toolbarAppearance
        nav.toolbar.compactAppearance = toolbarAppearance
        if #available(iOS 15.0, *) {
            nav.toolbar.scrollEdgeAppearance = toolbarAppearance
        }
        nav.toolbar.tintColor = PhoebeBrowserColor.tint
        // Owner: "we don't actually need the bottom bar." Everything on it is
        // either duplicated in Options (reload, share) or unused while praying
        // an office — and on a liturgy you scroll for ten minutes, a permanent
        // bar is just less page. Done and Options stay pinned at the top.
        nav.setToolbarHidden(true, animated: false)

        // Slide in from the right (next-slide feel), over the app rather than
        // replacing it, so the dismiss can slide back to reveal it.
        nav.modalPresentationStyle = .overFullScreen
        nav.transitioningDelegate = vc.slideDelegate

        presenter.present(nav, animated: true)
    }
}
