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

import Foundation
import Capacitor

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
            BibleBrowser.shared.present(
                url: url,
                from: self?.bridge?.viewController
            )
            call.resolve()
        }
    }
}
