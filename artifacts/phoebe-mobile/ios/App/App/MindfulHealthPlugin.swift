// MindfulHealthPlugin.swift
//
// Capacitor 6 plugin: READ-ONLY access to Apple Health "Mindful Minutes"
// (HKCategoryType .mindfulSession). Meditation apps — Calm, Insight Timer,
// Apple's own Mindfulness — write their sessions here, so reading them lets
// Phoebe count silence kept elsewhere toward the daily contemplation goal.
//
// This is the read-only prototype slice: it requests READ authorization for
// mindful sessions and sums TODAY's minutes. It never writes, and it does not
// upload anything — the JS caller decides what to do with the number (a later
// pass wires it into the goal/streak with proper de-duplication of Phoebe's
// own in-app sits).
//
// JS front door (native shell only — window.Capacitor is absent on the web):
//   window.Capacitor.Plugins.MindfulHealth
//     .isAvailable()          → { available: Bool }
//     .requestAuthorization() → { requested: Bool }
//         NB: HealthKit deliberately hides whether READ access was granted —
//         success here means the prompt was shown, not that data is readable.
//         The caller infers grant from whether mindfulMinutesToday() returns > 0.
//     .mindfulMinutesToday()  → { minutes: Int, sessions: Int }
//
// Mirrors the existing custom-plugin pattern (PhoebeBadgePlugin.swift).

import Foundation
import Capacitor
import HealthKit
import UIKit

@objc(MindfulHealthPlugin)
public class MindfulHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MindfulHealthPlugin"
    public let jsName = "MindfulHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mindfulMinutesToday", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openApp", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()

    private var mindfulType: HKCategoryType? {
        return HKObjectType.categoryType(forIdentifier: .mindfulSession)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let type = mindfulType else {
            call.resolve(["requested": false])
            return
        }
        // Read-only: empty share set, mindful sessions in the read set.
        healthStore.requestAuthorization(toShare: [], read: [type]) { success, error in
            if let error = error {
                call.reject("Authorization failed: \(error.localizedDescription)")
                return
            }
            call.resolve(["requested": success])
        }
    }

    @objc func mindfulMinutesToday(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let type = mindfulType else {
            call.resolve(["minutes": 0, "sessions": 0])
            return
        }
        let startOfDay = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(
            withStart: startOfDay,
            end: Date(),
            options: .strictStartDate
        )
        let query = HKSampleQuery(
            sampleType: type,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { _, samples, error in
            if let error = error {
                call.reject("Query failed: \(error.localizedDescription)")
                return
            }
            let sessions = samples ?? []
            // Each mindful session is an interval; "minutes" = sum of durations.
            var totalSeconds: TimeInterval = 0
            for sample in sessions {
                totalSeconds += sample.endDate.timeIntervalSince(sample.startDate)
            }
            let minutes = Int((totalSeconds / 60.0).rounded())
            call.resolve(["minutes": minutes, "sessions": sessions.count])
        }
        healthStore.execute(query)
    }

    // Launch a companion meditation app (Calm, Hallow, Insight Timer, Headspace,
    // …) by its URL scheme so the user can start a session there. Falls back to
    // a website / App Store URL when the app isn't installed. Uses
    // UIApplication.open (which — unlike canOpenURL — needs no
    // LSApplicationQueriesSchemes entry), reporting success via the completion.
    @objc func openApp(_ call: CAPPluginCall) {
        guard let scheme = call.getString("scheme"), let url = URL(string: scheme) else {
            call.reject("Missing or invalid scheme")
            return
        }
        let fallback = call.getString("fallbackUrl")
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { success in
                if success {
                    call.resolve(["opened": true, "usedFallback": false])
                    return
                }
                // App not installed (or scheme unhandled) — open the fallback.
                if let fb = fallback, let fbUrl = URL(string: fb) {
                    UIApplication.shared.open(fbUrl, options: [:]) { fbSuccess in
                        call.resolve(["opened": fbSuccess, "usedFallback": true])
                    }
                } else {
                    call.resolve(["opened": false, "usedFallback": false])
                }
            }
        }
    }
}
