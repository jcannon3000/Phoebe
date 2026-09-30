// PhoebeReviewPlugin.swift
//
// Asks iOS to show its own "rate this app" sheet — the StoreKit one, the only
// review prompt an App Store app is allowed to show.
//
// Owner, 2026-09-30: "Could we do the pop up once for people do rate the app 5
// stars on ios?" The once is ours to keep (see lib/appReview.ts, which decides
// WHEN and never asks twice). The FIVE STARS is not: App Review forbids asking
// for a particular rating, and this API gives no way to try — iOS draws the
// sheet, we cannot word it, style it, or know what the person did. That is the
// point of it, and it is why a prompt like this is allowed at all.
//
// Two more things iOS decides for us, both worth knowing before anyone reports
// this as broken:
//   · It shows at most three times a year per person, whatever we call. So a
//     call that displays nothing is NORMAL, not a failure.
//   · It never appears in a TestFlight build. Testing this needs an App Store
//     or a development build run from Xcode.
// So `shown: true` from here means "handed to iOS", never "a sheet appeared".
// Nothing in the app may treat it as proof the person was asked.
//
// JS front door:
//   window.PhoebeNative.requestAppReview() → requestReview()
// rerouted by native-shell.ts.

import Foundation
import Capacitor
import StoreKit
import UIKit

@objc(PhoebeReviewPlugin)
public class PhoebeReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoebeReviewPlugin"
    public let jsName = "PhoebeReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // The sheet belongs to a SCENE, and the scene-less API is gone in
            // recent SDKs — so find the active one rather than assume there is
            // exactly one window. A backgrounded app has no foreground scene;
            // resolving false there is honest and lets the web layer keep its
            // "not asked yet" state for a better moment.
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
                ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            guard let windowScene = scene else {
                call.resolve(["shown": false])
                return
            }
            // SKStoreReviewController rather than iOS 18's AppStore.requestReview:
            // the deployment target is iOS 15, this is available from 14, and it
            // still works where the newer one exists. Deprecated, not removed —
            // when the floor rises past 18, swap it and keep the comment above.
            SKStoreReviewController.requestReview(in: windowScene)
            call.resolve(["shown": true])
        }
    }
}
