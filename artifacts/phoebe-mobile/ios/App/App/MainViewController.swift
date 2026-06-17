// MainViewController.swift
//
// The app's root Capacitor bridge view controller. We subclass
// CAPBridgeViewController to register MindfulHealthPlugin AND
// PhoebeWidgetPlugin EXPLICITLY.
//
// Why: Capacitor auto-discovers app-target plugins through the
// Objective-C runtime, and that works for the in-app plugins that ARE
// referenced elsewhere in Swift (PhoebeAudio, BibleBrowser, PhoebeBadge).
// But MindfulHealth and PhoebeWidget are referenced ONLY in their own
// definition files, so this Cap 8 build's linker dead-strips their classes
// and they never appear in window.Capacitor.Plugins. Registering the
// instances here in capacitorDidLoad() is the path Capacitor documents for
// app-embedded plugins and guarantees the bridge is created — so the Apple
// Health UI lights up AND the Home Screen widget actually receives data
// (PhoebeWidget.update writes the App Group + reloads WidgetKit).

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(MindfulHealthPlugin())
        // PhoebeWidget is dead-stripped for the SAME reason — nothing in Swift
        // references the class, so it never appeared in window.Capacitor.Plugins
        // and updateWidget() silently no-op'd (optional chaining). The Home
        // Screen widget then got NO data and fell back to the generic time-based
        // placeholder. Register it explicitly so the App Group write + the
        // WidgetKit reloadAllTimelines() actually run.
        bridge?.registerPluginInstance(PhoebeWidgetPlugin())
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
