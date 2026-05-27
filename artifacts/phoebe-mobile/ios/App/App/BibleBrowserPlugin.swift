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

@objc(BibleBrowserPlugin)
public class BibleBrowserPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BibleBrowserPlugin"
    public let jsName = "BibleBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"),
              let url = URL(string: urlStr) else {
            call.reject("Missing or invalid url")
            return
        }
        DispatchQueue.main.async { [weak self] in
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
                        from: self?.bridge?.viewController
                    )
                    call.resolve()
                }
                return
            }
            BibleBrowser.shared.present(
                url: url,
                from: self?.bridge?.viewController
            )
            call.resolve()
        }
    }
}
