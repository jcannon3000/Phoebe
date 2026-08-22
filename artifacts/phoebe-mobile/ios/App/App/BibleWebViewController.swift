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
    // Owner: "for Venite, make the top and bottom black." venite.app renders
    // its own page on black, so Phoebe's green chrome met it at a visible seam
    // — two dark surfaces that don't match read as a rendering fault rather
    // than a frame. Black on black lets the liturgy sit in the window.
    static let bar = UIColor.black
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

    // Retained strongly here because UIViewController.transitioningDelegate
    // is a WEAK reference — without an owner the slide animation is dropped.
    // The nav controller retains this VC (its root), this VC retains the
    // delegate, so it lives as long as the browser is on screen.
    let slideDelegate = SlideTransitionDelegate()

    // Invoked (after the browser dismisses) when the user taps the bottom-bar
    // Journal button. The plugin wires this to fire a `phoebe:open-journal`
    // event into the app so the web layer can navigate to the journal.
    var onJournal: (() -> Void)?
    // Options → "Change format" / "Listen to the office". Both dismiss first,
    // then let the app route: the office intro chooser owns the formats and the
    // podcast player owns the audio, and neither belongs in a web view.
    var onChangeFormat: (() -> Void)?
    var onListen: (() -> Void)?

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
        let doneButton = UIButton(type: .system)
        doneButton.setTitle("Done", for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        doneButton.setTitleColor(PhoebeBrowserColor.text, for: .normal)
        doneButton.backgroundColor = PhoebeBrowserColor.tint.withAlphaComponent(0.22)
        doneButton.layer.cornerRadius = 15
        doneButton.layer.borderWidth = 1
        doneButton.layer.borderColor = PhoebeBrowserColor.tint.withAlphaComponent(0.45).cgColor
        doneButton.contentEdgeInsets = UIEdgeInsets(top: 6, left: 16, bottom: 6, right: 16)
        doneButton.addTarget(self, action: #selector(close), for: .touchUpInside)
        doneButton.accessibilityLabel = "Done"
        navigationItem.leftBarButtonItem = UIBarButtonItem(customView: doneButton)

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
                    self?.dismiss(animated: true) { self?.onChangeFormat?() }
                },
                UIAction(title: "Listen to the office", image: UIImage(systemName: "waveform")) { [weak self] _ in
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
        // Journal — a clearly-labelled primary action in the center of the bar,
        // so the reader can jot a reflection on what they're reading. Closes the
        // browser and asks the app to open the journal.
        let journalButton = UIBarButtonItem(
            title: "Journal", style: .plain, target: self, action: #selector(openJournal)
        )
        journalButton.accessibilityLabel = "Journal"
        let flex = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        let flex2 = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        backButton.isEnabled = false
        forwardButton.isEnabled = false
        toolbarItems = [backButton, fixedSpace(16), forwardButton, flex, journalButton, flex2, reloadButton, fixedSpace(24), shareButton]

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

    // ── Actions ───────────────────────────────────────────────────────────
    @objc private func close() { dismiss(animated: true) }
    @objc private func openJournal() {
        // Dismiss first so the browser slides away, then ask the app to open
        // the journal (completion fires after the dismiss animation).
        dismiss(animated: true) { [weak self] in self?.onJournal?() }
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
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        UIView.animate(withDuration: 0.25) { [weak self] in self?.progressView.alpha = 0 }
        updateNavButtons()
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
        let width = container.bounds.width
        let duration = transitionDuration(using: ctx)

        if presenting {
            guard let toVC = ctx.viewController(forKey: .to),
                  let toView = ctx.view(forKey: .to) else {
                ctx.completeTransition(false); return
            }
            toView.frame = ctx.finalFrame(for: toVC)
            toView.transform = CGAffineTransform(translationX: width, y: 0)
            container.addSubview(toView)
            UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseOut], animations: {
                toView.transform = .identity
            }, completion: { _ in
                ctx.completeTransition(!ctx.transitionWasCancelled)
            })
        } else {
            // The presenter's view stays behind (overFullScreen), so we just
            // slide the browser back out to the right to reveal it.
            guard let fromView = ctx.view(forKey: .from) else {
                ctx.completeTransition(false); return
            }
            UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseIn], animations: {
                fromView.transform = CGAffineTransform(translationX: width, y: 0)
            }, completion: { _ in
                if ctx.transitionWasCancelled {
                    // Released before the threshold — restore the browser in
                    // place (UIView.animate otherwise leaves the model layer
                    // at the final, off-screen transform).
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
        onListen: (() -> Void)? = nil
    ) {
        guard let presenter = presenter else { return }
        let vc = BibleWebViewController(url: url, preloadedWebView: takeWarm(for: url))
        vc.onJournal = onJournal
        vc.onDismiss = onDismiss
        vc.onChangeFormat = onChangeFormat
        vc.onListen = onListen
        let nav = UINavigationController(rootViewController: vc)
        nav.overrideUserInterfaceStyle = .dark
        // Keep the top + bottom bars pinned — never collapse/minimize on scroll
        // or tap, so the back + Journal buttons stay reachable the whole read.
        nav.hidesBarsOnSwipe = false
        nav.hidesBarsOnTap = false

        // Dark Phoebe chrome for the top navigation bar.
        let barAppearance = UINavigationBarAppearance()
        barAppearance.configureWithOpaqueBackground()
        barAppearance.backgroundColor = PhoebeBrowserColor.bar
        barAppearance.titleTextAttributes = [.foregroundColor: PhoebeBrowserColor.text]
        barAppearance.shadowColor = UIColor.white.withAlphaComponent(0.08)
        nav.navigationBar.standardAppearance = barAppearance
        nav.navigationBar.scrollEdgeAppearance = barAppearance
        nav.navigationBar.compactAppearance = barAppearance
        nav.navigationBar.tintColor = PhoebeBrowserColor.tint

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
        nav.setToolbarHidden(false, animated: false)

        // Slide in from the right (next-slide feel), over the app rather than
        // replacing it, so the dismiss can slide back to reveal it.
        nav.modalPresentationStyle = .overFullScreen
        nav.transitioningDelegate = vc.slideDelegate

        presenter.present(nav, animated: true)
    }
}
