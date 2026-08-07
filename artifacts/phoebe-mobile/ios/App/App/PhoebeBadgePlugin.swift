// PhoebeBadgePlugin.swift
//
// Capacitor 6 plugin that lets the web app set the iOS app-icon
// badge to a specific number. The default Capacitor stack only
// updates the badge via APNs pushes — meaning the badge can only
// grow when a new push arrives, never shrink to reflect that the
// user has already acted on the items.
//
// Use case: when the dashboard fetches /api/prayer-requests +
// /api/moments, it knows the current "things waiting for you"
// count. Calling PhoebeNative.setBadge(N) keeps the icon honest
// across opens, amens, and dismissals — so a user with 0 unprayed
// items sees no badge, and a user with 3 sees 3.
//
// JS front door:
//   window.PhoebeNative.setBadge(n: number) → setBadge({ count: n })
// rerouted by native-shell.ts.

import Foundation
import Capacitor
import UIKit
import UserNotifications

@objc(PhoebeBadgePlugin)
public class PhoebeBadgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoebeBadgePlugin"
    public let jsName = "PhoebeBadge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setBadge", returnType: CAPPluginReturnPromise),
    ]

    @objc func setBadge(_ call: CAPPluginCall) {
        let count = call.getInt("count") ?? 0
        let clamped = max(0, count)
        DispatchQueue.main.async {
            if #available(iOS 16.0, *) {
                // setBadgeCount silently fails (its own error, discarded by
                // the caller) when notification authorization was never
                // granted — the icon is then left wherever the last APNs
                // push set it via aps.badge, which reads as "the badge is
                // stuck/wrong" from the JS side even though this call
                // "succeeded" (call.resolve() always fired regardless of
                // the completion's result). Fall back to the older,
                // non-authorization-gated API on any error so the count
                // actually lands either way.
                UNUserNotificationCenter.current().setBadgeCount(clamped) { error in
                    if error != nil {
                        UIApplication.shared.applicationIconBadgeNumber = clamped
                    }
                }
            } else {
                UIApplication.shared.applicationIconBadgeNumber = clamped
            }
            call.resolve()
        }
    }
}
