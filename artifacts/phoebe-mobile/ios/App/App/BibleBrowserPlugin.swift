// BibleBrowserPlugin.swift
//
// Capacitor 6 plugin that exposes a single `open({ url })` method to
// JS. The plugin presents BibleWebViewController in a navigation
// controller modal so the Done button stays pinned at the top of
// the screen for the whole reading session — fixes the issue where
// SFSafariViewController auto-collapses its toolbar on scroll and
// hides the only way back to the liturgy.
//
// JS side: `window.PhoebeNative.openInAppBrowser(url)` — same JS
// front door as before — gets rerouted to this plugin via the
// native shell's `phoebe:open-url` listener (see native-shell.ts).
//
// YouVersion handoff: when the URL host is bible.com (or www.bible.com)
// we try to route through iOS's Universal Link system FIRST so users
// with the YouVersion app installed land in the app instead of the
// in-app web view. `UIApplication.open(url, options: .universalLinksOnly)`
// returns `false` in the completion when no app handles the link, at
// which point we fall back to the existing BibleBrowser web flow.
// SFSafariViewController-style in-app web views bypass Universal Link
// routing on their own — the only way to get YouVersion to receive the
// tap is to ask UIApplication directly outside any web-view chrome.

import Foundation
import Capacitor
import UIKit
import SafariServices

@objc(BibleBrowserPlugin)
public class BibleBrowserPlugin: CAPPlugin, CAPBridgedPlugin, SFSafariViewControllerDelegate {
    public let identifier = "BibleBrowserPlugin"
    public let jsName = "BibleBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openReader", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preload", returnType: CAPPluginReturnPromise),
    ]

    // Open a URL in Safari's reader view (SFSafariViewController with
    // entersReaderIfAvailable) — used for newsletters, where clean reading
    // beats the pinned Done button of the WKWebView path. The toolbar
    // auto-collapses on scroll (the documented trade), but a Done button is
    // still reachable. Emits phoebe:browserfinished on dismiss so the caller
    // can mark the newsletter read only once it's actually closed.
    @objc func openReader(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"),
              let url = URL(string: urlStr) else {
            call.reject("Missing or invalid url")
            return
        }
        DispatchQueue.main.async { [weak self] in
            let config = SFSafariViewController.Configuration()
            config.entersReaderIfAvailable = true
            let vc = SFSafariViewController(url: url, configuration: config)
            vc.delegate = self
            vc.dismissButtonStyle = .done
            vc.preferredControlTintColor = UIColor(red: 0.18, green: 0.42, blue: 0.25, alpha: 1.0)
            // Owner: "we want all forward pages to open in light mode." This
            // reader-mode path (used for FDD and other newsletter links) has
            // no explicit appearance override otherwise, so it just follows
            // the device's system dark/light setting — on a dark-mode device,
            // Forward Movement's own pages rendered dark. Force light for
            // their domain specifically; every other reader-mode source keeps
            // following the system setting as before.
            let host = url.host?.lowercased() ?? ""
            if host == "forwardmovement.org" || host.hasSuffix(".forwardmovement.org") {
                vc.overrideUserInterfaceStyle = .light
            }
            self?.bridge?.viewController?.present(vc, animated: true)
            call.resolve()
        }
    }

    public func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        bridge?.triggerWindowJSEvent(eventName: "phoebe:browserfinished")
    }

    // Warm a URL in a background web view so a later open() shows it instantly.
    // Best-effort: a bad URL just no-ops. Called when a newsletter card mounts.
    @objc func preload(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"),
              let url = URL(string: urlStr) else {
            call.reject("Missing or invalid url")
            return
        }
        DispatchQueue.main.async {
            BibleBrowser.shared.preload(url: url)
            call.resolve()
        }
    }

    @objc func open(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"),
              let url = URL(string: urlStr) else {
            call.reject("Missing or invalid url")
            return
        }
        DispatchQueue.main.async { [weak self] in
            // The Journal button in the browser's bottom bar fires this event
            // into the app's web view, which then navigates to the journal.
            let onJournal: () -> Void = { [weak self] in
                self?.bridge?.triggerWindowJSEvent(eventName: "phoebe:open-journal")
            }
            // Mirrors safariViewControllerDidFinish below (the reader-view
            // path) — fires the SAME event this plain in-app-browser path
            // never fired before, which left openExternalThenMarkRead's JS
            // listener waiting forever and CAC/FDD/most links never marked
            // read on native.
            let onDismiss: () -> Void = { [weak self] in
                self?.bridge?.triggerWindowJSEvent(eventName: "phoebe:browserfinished")
            }
            // Bible.com host detection. We only try the Universal Link
            // hop for URLs that YouVersion has actually registered —
            // sending a random outbound link through `.universalLinksOnly`
            // would just waste a round-trip before falling back.
            let host = (url.host ?? "").lowercased()
            let isBibleCom = host == "bible.com" || host == "www.bible.com"
            if isBibleCom {
                UIApplication.shared.open(
                    url,
                    options: [.universalLinksOnly: true]
                ) { [weak self] handled in
                    if handled { call.resolve(); return }
                    // No app installed for this domain → present the
                    // in-app browser, same as the non-Bible path.
                    BibleBrowser.shared.present(
                        url: url,
                        from: self?.bridge?.viewController,
                        onJournal: onJournal,
                        onDismiss: onDismiss
                    )
                    call.resolve()
                }
                return
            }
            BibleBrowser.shared.present(
                url: url,
                from: self?.bridge?.viewController,
                onJournal: onJournal,
                onDismiss: onDismiss
            )
            call.resolve()
        }
    }
}
