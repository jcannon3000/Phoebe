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
        CAPPluginMethod(name: "writeMindfulSession", returnType: CAPPluginReturnPromise),
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
        // Read AND write mindful sessions: read pulls in minutes logged by other
        // apps (Calm, Insight Timer); write lets Phoebe save its own sits back to
        // Apple Health so they show in the user's Mindful Minutes too.
        healthStore.requestAuthorization(toShare: [type], read: [type]) { success, error in
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

    // Write a finished Phoebe sit to Apple Health as a Mindful Session so it
    // counts toward the user's Mindful Minutes (same as Calm/Insight Timer do).
    // start/end are epoch MILLISECONDS (Date.getTime() on the JS side) to avoid
    // ISO-8601 fractional-second parsing pitfalls. Best-effort: a save needs
    // write authorization, so it silently no-ops (written:false) until the user
    // has connected Apple Health.
    @objc func writeMindfulSession(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let type = mindfulType else {
            call.resolve(["written": false])
            return
        }
        guard let startMs = call.getDouble("startMs"),
              let endMs = call.getDouble("endMs"),
              endMs > startMs else {
            call.reject("Missing or invalid startMs/endMs")
            return
        }
        let start = Date(timeIntervalSince1970: startMs / 1000.0)
        let end = Date(timeIntervalSince1970: endMs / 1000.0)
        let sample = HKCategorySample(
            type: type,
            value: HKCategoryValue.notApplicable.rawValue,
            start: start,
            end: end
        )
        healthStore.save(sample) { success, error in
            if let error = error {
                call.reject("Save failed: \(error.localizedDescription)")
                return
            }
            call.resolve(["written": success])
        }
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
