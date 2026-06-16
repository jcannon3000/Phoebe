// MainViewController.swift
//
// The app's root Capacitor bridge view controller. We subclass
// CAPBridgeViewController purely to register MindfulHealthPlugin
// EXPLICITLY.
//
// Why: Capacitor auto-discovers app-target plugins through the
// Objective-C runtime, and that works for our other in-app plugins
// (PhoebeAudio, BibleBrowser, PhoebeBadge, PhoebeWidget). But
// MindfulHealth has repeatedly failed to appear in
// window.Capacitor.Plugins — most likely the linker dead-strips its
// class because nothing in Swift references it. Registering the
// instance here in capacitorDidLoad() is the path Capacitor documents
// for app-embedded plugins and guarantees the bridge is created, so the
// Apple Health UI (Contemplation goal card + Settings) can light up.
//
// Only MindfulHealth is registered here; the other custom plugins keep
// auto-registering as before, so this change can't disturb them.

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(MindfulHealthPlugin())
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
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }
}
