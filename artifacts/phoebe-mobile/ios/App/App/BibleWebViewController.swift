// BibleWebViewController.swift
//
// Custom in-app WebView for the "Read on Bible.com" lesson links.
// SFSafariViewController auto-collapses its top toolbar when the
// reader scrolls down to make room for the page, which hides the
// Done button — users reported losing the only way back to the
// liturgy mid-passage. This controller wraps WKWebView in a
// UINavigationController so the close button stays pinned to the
// top of the screen for the whole session.
//
// Presented from JS by dispatching a `phoebe:open-bible-url`
// CustomEvent; the native shell's listener calls
// BibleBrowser.present(url:from:).

import UIKit
import WebKit

final class BibleWebViewController: UIViewController, WKNavigationDelegate {
    private let url: URL
    private var webView: WKWebView!
    private let progressView = UIProgressView(progressViewStyle: .bar)
    private var progressObservation: NSKeyValueObservation?

    init(url: URL) {
        self.url = url
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    deinit {
        progressObservation?.invalidate()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        // Title shows the host so the user knows where they are
        // without needing the URL bar.
        title = url.host ?? "Read Scripture"

        // Done button (left) — primary close, always visible. Keeping
        // it on the leading edge mirrors the Capacitor Browser /
        // SFSafariViewController layout that users are already used
        // to so the muscle memory carries over.
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done,
            target: self,
            action: #selector(close)
        )

        // Reload button (right) — handy when bible.com hiccups on
        // first load; cheap to add now since we own the chrome.
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .refresh,
            target: self,
            action: #selector(reload)
        )

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        view.addSubview(webView)

        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.tintColor = .systemGreen
        progressView.trackTintColor = .clear
        progressView.alpha = 0
        view.addSubview(progressView)

        NSLayoutConstraint.activate([
            // Top of the WebView pins to the navigation bar's
            // bottom (handled automatically by safe area).
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            // Hairline progress bar under the navigation bar.
            progressView.topAnchor.constraint(equalTo: webView.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 2),
        ])

        // Bind WKWebView's estimatedProgress → UIProgressView.
        progressObservation = webView.observe(
            \.estimatedProgress,
            options: [.new]
        ) { [weak self] _, change in
            guard let self = self, let p = change.newValue else { return }
            self.progressView.setProgress(Float(p), animated: true)
            // Reveal while loading; fade once we're past the threshold
            // and hide entirely on completion (handled in
            // didFinish below).
            if p > 0 && p < 1 {
                UIView.animate(withDuration: 0.15) { self.progressView.alpha = 1 }
            }
        }

        webView.load(URLRequest(url: url))
    }

    // ── Actions ───────────────────────────────────────────────────────────

    @objc private func close() {
        dismiss(animated: true)
    }

    @objc private func reload() {
        webView.reload()
    }

    // ── WKNavigationDelegate ──────────────────────────────────────────────

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        UIView.animate(withDuration: 0.25, animations: { [weak self] in
            self?.progressView.alpha = 0
        }) { [weak self] _ in
            self?.progressView.setProgress(0, animated: false)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        UIView.animate(withDuration: 0.25) { [weak self] in
            self?.progressView.alpha = 0
        }
    }

    // External links (target=_blank, http(s):// not navigated to in
    // this view) — let them open in the system browser instead of
    // hijacking the WebView's main frame, so a tap on a footer link
    // doesn't strand the user inside our chrome on someone else's site.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

// ── Presenter ─────────────────────────────────────────────────────────────
//
// Single entry point used from JS (via the bridge in AppDelegate).
// Wraps the controller in a UINavigationController so the title bar
// + Done button render automatically.

@objcMembers
final class BibleBrowser: NSObject {
    static let shared = BibleBrowser()
    private override init() { super.init() }

    func present(url: URL, from presenter: UIViewController?) {
        guard let presenter = presenter else { return }
        let vc = BibleWebViewController(url: url)
        let nav = UINavigationController(rootViewController: vc)
        nav.modalPresentationStyle = .fullScreen
        nav.navigationBar.prefersLargeTitles = false
        // Translucent bar with a hairline divider so the chrome
        // reads as a Safari-ish utility frame, not a full app
        // header — matches the visual weight of SFSafariViewController.
        nav.navigationBar.tintColor = .systemGreen
        presenter.present(nav, animated: true)
    }
}
