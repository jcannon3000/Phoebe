// MainViewController.swift
//
// The app's root Capacitor bridge view controller. We subclass
// CAPBridgeViewController to register PhoebeWidgetPlugin EXPLICITLY.
//
// Why: Capacitor auto-discovers app-target plugins through the
// Objective-C runtime, but that only holds for a plugin class something
// else in Swift actually REFERENCES. A plugin referenced only in its own
// definition file gets dead-stripped by this Cap 8 build's linker and
// never appears in window.Capacitor.Plugins — the JS side then silently
// no-ops through its optional chaining, with no error anywhere.
//
// Only BibleBrowser survives on its own (BibleWebViewController
// references it). Every other in-app plugin must be registered here.
// This comment used to claim PhoebeAudio and PhoebeBadge were referenced
// elsewhere too; neither was, and both were dead-stripped for it.
// Before adding a plugin, grep for a REAL (non-comment) Swift reference —
// a mention in a comment does not keep the symbol alive.

import UIKit
import Capacitor
import WebKit

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // PhoebeWidget is dead-stripped — nothing in Swift
        // references the class, so it never appeared in window.Capacitor.Plugins
        // and updateWidget() silently no-op'd (optional chaining). The Home
        // Screen widget then got NO data and fell back to the generic time-based
        // placeholder. Register it explicitly so the App Group write + the
        // WidgetKit reloadAllTimelines() actually run.
        bridge?.registerPluginInstance(PhoebeWidgetPlugin())
        // PhoebeAudio (Core-Haptics smooth swell + the prayer-bell scheduler) is
        // ALSO only referenced from comments now, so the linker dead-strips it and
        // window.Capacitor.Plugins.PhoebeAudio was undefined — which is why the
        // Cobreathe "done" payoff fell back to the JS impact-density approximation
        // (a string of taps) instead of the single continuous CHHaptic swell.
        // Register it explicitly so the native smooth swell + bells run.
        bridge?.registerPluginInstance(PhoebeAudioPlugin())
        // PhoebePrint — WKWebView has no window.print(), so the routine printout's
        // "Save as PDF" did nothing on iOS. This plugin presents the iOS print
        // sheet for the web view (Save to Files as PDF / AirPrint / share).
        // Referenced only in its own file, so register it explicitly like the rest.
        bridge?.registerPluginInstance(PhoebePrintPlugin())
        // PhoebeBadge — THE reason the app-icon badge looked "hardcoded to 1".
        // Nothing in Swift referenced PhoebeBadgePlugin (the one mention was a
        // COMMENT in AppDelegate), so it was dead-stripped and
        // window.Capacitor.Plugins.PhoebeBadge was undefined. native-shell's
        // setBadge guards on `if (plugin?.setBadge)`, so every call the
        // dashboard made — including setBadge(0) on a fully-kept day — silently
        // did nothing. The icon was therefore only ever written by APNs pushes
        // and just kept whatever number the last one sent. Registering it makes
        // the client the badge's actual author, as intended.
        bridge?.registerPluginInstance(PhoebeBadgePlugin())
        // BibleBrowser was written, wired on the JS side, and never registered
        // here — so Capacitor.Plugins.BibleBrowser did not exist, the guard in
        // native-shell's openInAppBrowser always failed, and EVERY in-app link
        // fell through to SFSafariViewController. That is why the office opened
        // with a bare ✕ and a toolbar that collapses on scroll: the custom
        // controller built to avoid exactly that has been dead code.
        bridge?.registerPluginInstance(BibleBrowserPlugin())
    }

    // Edge-to-edge: render the WebView UNDER a transparent status bar
    // (StatusBar.setOverlaysWebView(true)) so each screen's OWN background fills
    // the area behind the status bar — it adapts per surface (green splash, dark
    // home, black breath) instead of a fixed #091A10 strip. Capacitor's overlay
    // flag alone did NOT extend the WebView frame on this build, so we force it
    // to the full bounds here. The web side pads its chrome with
    // env(safe-area-inset-top) (var(--safe-top)) so nothing hides under the
    // notch / Dynamic Island.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        webView?.frame = view.bounds
        // Edge-to-edge: the WebView spans the full screen and the WEB side adds
        // the safe-area inset via env(safe-area-inset-top). If the scroll view
        // ALSO inset for the safe area we'd double-count it (the "too much room
        // above the header" gap), so force every inset to zero — .never alone
        // didn't reliably stop it on this Cap 8 build.
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        webView?.scrollView.contentInset = .zero
        webView?.scrollView.verticalScrollIndicatorInsets = .zero
        if #available(iOS 11.0, *) {
            // No extra safe-area on top of the system's — the web reads
            // env(safe-area-inset-*) directly and pads itself.
            additionalSafeAreaInsets = .zero
        }
    }
}

// PhoebePrint — WKWebView has no window.print(), so the routine printout's
// "Save as PDF" button did nothing on iOS. This plugin presents the iOS print
// sheet for the web view (Save to Files as a PDF / AirPrint / share), rendering
// the page's @media print layout. The web app dispatches `phoebe:print` and
// native-shell.ts routes it here (see wireNativePrint). Kept in this file —
// already in the App target — so it compiles without a new target membership.
@objc(PhoebePrintPlugin)
public class PhoebePrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoebePrintPlugin"
    public let jsName = "PhoebePrint"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printPage", returnType: CAPPluginReturnPromise),
    ]

    @objc func printPage(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let webView = self?.bridge?.webView else {
                call.reject("No web view available")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = call.getString("jobName") ?? "Phoebe"

            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            controller.present(animated: true) { _, completed, error in
                if let error = error {
                    call.reject("Print failed: \(error.localizedDescription)")
                } else {
                    call.resolve(["completed": completed])
                }
            }
        }
    }
}
