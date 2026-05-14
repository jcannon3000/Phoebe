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
                UNUserNotificationCenter.current().setBadgeCount(clamped) { _ in }
            } else {
                UIApplication.shared.applicationIconBadgeNumber = clamped
            }
            call.resolve()
        }
    }
}
