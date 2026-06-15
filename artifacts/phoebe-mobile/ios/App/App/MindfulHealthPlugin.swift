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
import WebKit

@objc(MindfulHealthPlugin)
public class MindfulHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MindfulHealthPlugin"
    public let jsName = "MindfulHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mindfulMinutesToday", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mindfulSessionsToday", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeMindfulSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openApp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableBackgroundDelivery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stepsToday", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()

    private var mindfulType: HKCategoryType? {
        return HKObjectType.categoryType(forIdentifier: .mindfulSession)
    }

    // Daily steps (read-only) — for the "Daily steps" goal card + push.
    private var stepType: HKQuantityType? {
        return HKObjectType.quantityType(forIdentifier: .stepCount)
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
        // Apple Health so they show in the user's Mindful Minutes too. Step count
        // is read-only and bundled into the same prompt (HealthKit groups them).
        var readTypes: Set<HKObjectType> = [type]
        if let steps = stepType { readTypes.insert(steps) }
        healthStore.requestAuthorization(toShare: [type], read: readTypes) { success, error in
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
        let datePredicate = HKQuery.predicateForSamples(
            withStart: startOfDay,
            end: Date(),
            options: .strictStartDate
        )
        // excludeOwn: drop the mindful sessions Phoebe itself wrote back to
        // Health, so the caller can fold in meditation from OTHER apps (Calm,
        // Insight Timer, Apple Mindfulness) without double-counting the Phoebe
        // sits it already tracks in-app. Default false keeps the original
        // "everything today" behavior the Way of Love Pray signal relies on.
        var predicate: NSPredicate = datePredicate
        if call.getBool("excludeOwn") ?? false {
            let notFromPhoebe = NSCompoundPredicate(
                notPredicateWithSubpredicate: HKQuery.predicateForObjects(from: [HKSource.default()])
            )
            predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [datePredicate, notFromPhoebe])
        }
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

    // Today's mindful sessions as a LIST (for the Contemplation history) —
    // each with its start/end, rounded minutes, the writing app's name, and
    // whether Phoebe itself wrote it (so the client can drop its own sits,
    // which already show as in-app history cards, and surface only external
    // meditation from Calm / Insight Timer / Apple Mindfulness).
    @objc func mindfulSessionsToday(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let type = mindfulType else {
            call.resolve(["sessions": []])
            return
        }
        let startOfDay = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: sort) { _, samples, error in
            if let error = error {
                call.reject("Query failed: \(error.localizedDescription)")
                return
            }
            let own = HKSource.default()
            let out: [[String: Any]] = (samples ?? []).map { sample in
                let secs = sample.endDate.timeIntervalSince(sample.startDate)
                return [
                    "startMs": sample.startDate.timeIntervalSince1970 * 1000.0,
                    "endMs": sample.endDate.timeIntervalSince1970 * 1000.0,
                    "minutes": Int((secs / 60.0).rounded()),
                    "source": sample.sourceRevision.source.name,
                    "isOwn": sample.sourceRevision.source == own,
                ]
            }
            call.resolve(["sessions": out])
        }
        healthStore.execute(query)
    }

    // Today's step count from Apple Health (cumulative sum from start of day).
    // Read-only; powers the Daily steps goal card + the goal-reached push.
    @objc func stepsToday(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let type = stepType else {
            call.resolve(["steps": 0])
            return
        }
        let startOfDay = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
            if let error = error {
                call.reject("Query failed: \(error.localizedDescription)")
                return
            }
            let steps = result?.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0
            call.resolve(["steps": Int(steps.rounded())])
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

    // Arm background delivery of mindful minutes so the contemplation
    // goal-reached push fires even when the silence was kept ENTIRELY in
    // another app (Calm, Insight Timer, Apple Mindfulness) with Phoebe closed.
    // Idempotent — safe to call on every authenticated launch. The actual work
    // lives in MindfulBackgroundSync (below); the optional apiBase lets the JS
    // shell point us at a non-default origin (defaults to https://withphoebe.app,
    // matching native-shell's API_BASE).
    @objc func enableBackgroundDelivery(_ call: CAPPluginCall) {
        MindfulBackgroundSync.shared.enable(apiBase: call.getString("apiBase"))
        call.resolve(["enabled": true])
    }
}

// MARK: - Background delivery
//
// The foreground sync (useSyncHealthMinutes in the web layer) only uploads
// mindful minutes while Phoebe is open, so a goal crossed in another app is
// never noticed until the next launch — and the goal-reached push (fired
// server-side from /api/me/contemplation-health-minutes) never goes out.
//
// This wires an HKObserverQuery + enableBackgroundDelivery so iOS wakes the app
// in the background whenever new mindful sessions land. We read today's EXTERNAL
// minutes (excluding Phoebe's own sits, exactly like mindfulMinutesToday's
// excludeOwn path) and PUT them to the same endpoint the web uses. The server
// detects the goal crossing and sends the APNs push, delivered as a real banner
// because the app is backgrounded.
//
// Auth: the endpoint is cookie-authenticated (connect.sid, httpOnly). The web
// view persists that cookie in WKWebsiteDataStore, which native code can read
// even in the background — so we pull it at fire time and attach it to a plain
// URLSession PUT. We store no token of our own.
final class MindfulBackgroundSync {
    static let shared = MindfulBackgroundSync()

    private let healthStore = HKHealthStore()
    private var observerQuery: HKObserverQuery?
    private var stepObserverQuery: HKObserverQuery?

    private let apiBaseKey = "phoebe.mindful.apiBase"
    private let enabledKey = "phoebe.mindful.bgEnabled"
    private let defaultApiBase = "https://withphoebe.app"

    private var mindfulType: HKCategoryType? {
        HKObjectType.categoryType(forIdentifier: .mindfulSession)
    }

    private var stepType: HKQuantityType? {
        HKObjectType.quantityType(forIdentifier: .stepCount)
    }

    private var apiBase: String {
        let stored = UserDefaults.standard.string(forKey: apiBaseKey) ?? ""
        return stored.isEmpty ? defaultApiBase : stored
    }

    /// Called from the JS plugin once the user is authenticated. Persists the
    /// API base + an "enabled" flag and arms delivery. Idempotent.
    func enable(apiBase: String?) {
        if let base = apiBase, !base.isEmpty {
            UserDefaults.standard.set(base, forKey: apiBaseKey)
        }
        UserDefaults.standard.set(true, forKey: enabledKey)
        arm()
    }

    /// Called from AppDelegate at every launch. An HKObserverQuery does not
    /// survive process death, so it must be re-registered on each cold start —
    /// including the background relaunches iOS performs to deliver HK updates.
    /// Only arms if the user previously enabled it.
    func registerObserverIfConfigured() {
        guard UserDefaults.standard.bool(forKey: enabledKey) else { return }
        arm()
    }

    private func arm() {
        guard HKHealthStore.isHealthDataAvailable() else { return }

        // Mindful minutes — wake immediately on new samples.
        if let type = mindfulType {
            healthStore.enableBackgroundDelivery(for: type, frequency: .immediate) { _, _ in }
            if observerQuery == nil {   // don't stack observers this launch
                let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, _ in
                    // ALWAYS call completion — iOS throttles (then stops) background
                    // HK delivery to apps that don't acknowledge updates.
                    self?.uploadTodayMinutes { completion() }
                }
                observerQuery = query
                healthStore.execute(query)
            }
        }

        // Daily steps — hourly is plenty (steps stream constantly; immediate would
        // wake us far too often). Lets the "step goal reached" push fire passively.
        if let steps = stepType {
            healthStore.enableBackgroundDelivery(for: steps, frequency: .hourly) { _, _ in }
            if stepObserverQuery == nil {
                let q = HKObserverQuery(sampleType: steps, predicate: nil) { [weak self] _, completion, _ in
                    self?.uploadTodaySteps { completion() }
                }
                stepObserverQuery = q
                healthStore.execute(q)
            }
        }
    }

    /// Read today's EXTERNAL mindful minutes and PUT them to the server.
    /// completion() always runs exactly once.
    private func uploadTodayMinutes(completion: @escaping () -> Void) {
        guard let type = mindfulType else { completion(); return }
        let startOfDay = Calendar.current.startOfDay(for: Date())
        let datePredicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)
        let notFromPhoebe = NSCompoundPredicate(
            notPredicateWithSubpredicate: HKQuery.predicateForObjects(from: [HKSource.default()])
        )
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [datePredicate, notFromPhoebe])
        let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { [weak self] _, samples, _ in
            guard let self = self else { completion(); return }
            var seconds: TimeInterval = 0
            for s in samples ?? [] { seconds += s.endDate.timeIntervalSince(s.startDate) }
            let minutes = Int((seconds / 60.0).rounded())
            // Nothing external today → don't bother the server. The endpoint is
            // GREATEST-wins, so a 0 could never lower a real total anyway.
            if minutes <= 0 { completion(); return }
            self.put(minutes: minutes, day: self.localDayString(startOfDay), completion: completion)
        }
        healthStore.execute(q)
    }

    private func localDayString(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private func put(minutes: Int, day: String, completion: @escaping () -> Void) {
        guard let url = URL(string: apiBase + "/api/me/contemplation-health-minutes") else { completion(); return }
        let host = URL(string: apiBase)?.host ?? ""
        // Reading the web view's cookie store must happen on the main thread.
        DispatchQueue.main.async {
            // Extend our background window for the (tiny) network round-trip;
            // ended in the URLSession completion below.
            var bgTask = UIBackgroundTaskIdentifier.invalid
            bgTask = UIApplication.shared.beginBackgroundTask(withName: "mindful-upload") {
                if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid }
            }
            let finish: () -> Void = {
                if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid }
                completion()
            }
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                // Keep only cookies that apply to the API host (handles both
                // "withphoebe.app" and a leading-dot ".withphoebe.app" domain).
                let header = cookies
                    .filter { c in
                        let d = c.domain.hasPrefix(".") ? String(c.domain.dropFirst()) : c.domain
                        return host == d || host.hasSuffix("." + d)
                    }
                    .map { "\($0.name)=\($0.value)" }
                    .joined(separator: "; ")
                // No session cookie (logged out / never signed in) → nothing we
                // can authenticate with; bail without hanging the task.
                if header.isEmpty { finish(); return }
                var req = URLRequest(url: url)
                req.httpMethod = "PUT"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.setValue(header, forHTTPHeaderField: "Cookie")
                req.httpBody = try? JSONSerialization.data(withJSONObject: ["minutes": minutes, "day": day])
                URLSession.shared.dataTask(with: req) { _, _, _ in finish() }.resume()
            }
        }
    }

    /// Read today's step count and PUT it to /api/me/daily-steps. completion()
    /// always runs exactly once. Mirrors uploadTodayMinutes/put for steps.
    private func uploadTodaySteps(completion: @escaping () -> Void) {
        guard let type = stepType else { completion(); return }
        let startOfDay = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)
        let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { [weak self] _, result, _ in
            guard let self = self else { completion(); return }
            let steps = Int((result?.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0).rounded())
            // GREATEST-wins server-side, so a 0 could never lower a real total.
            if steps <= 0 { completion(); return }
            self.putSteps(steps: steps, day: self.localDayString(startOfDay), completion: completion)
        }
        healthStore.execute(q)
    }

    private func putSteps(steps: Int, day: String, completion: @escaping () -> Void) {
        guard let url = URL(string: apiBase + "/api/me/daily-steps") else { completion(); return }
        let host = URL(string: apiBase)?.host ?? ""
        DispatchQueue.main.async {
            var bgTask = UIBackgroundTaskIdentifier.invalid
            bgTask = UIApplication.shared.beginBackgroundTask(withName: "steps-upload") {
                if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid }
            }
            let finish: () -> Void = {
                if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid }
                completion()
            }
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                let header = cookies
                    .filter { c in
                        let d = c.domain.hasPrefix(".") ? String(c.domain.dropFirst()) : c.domain
                        return host == d || host.hasSuffix("." + d)
                    }
                    .map { "\($0.name)=\($0.value)" }
                    .joined(separator: "; ")
                if header.isEmpty { finish(); return }
                var req = URLRequest(url: url)
                req.httpMethod = "PUT"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.setValue(header, forHTTPHeaderField: "Cookie")
                req.httpBody = try? JSONSerialization.data(withJSONObject: ["steps": steps, "day": day])
                URLSession.shared.dataTask(with: req) { _, _, _ in finish() }.resume()
            }
        }
    }
}
