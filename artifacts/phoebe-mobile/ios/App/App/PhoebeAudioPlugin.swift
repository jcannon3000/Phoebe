// PhoebeAudioPlugin.swift
//
// Native bridge for sounds that need to play reliably even when the
// phone is locked or backgrounded — currently the contemplation
// closing bell. The plain Capacitor LocalNotifications path *can* ring
// while locked, but iOS suppresses notification sounds under Focus
// modes, alert-only permission, and (most commonly) the hardware
// silent switch — exactly the situations a meditator is in.
//
// This plugin takes the Insight-Timer / Calm approach:
//
//   1. We own an AVAudioSession with category .playback, which by
//      Apple's documentation "plays even when the device is muted
//      via the Ring/Silent switch."
//   2. We declare UIBackgroundModes:audio (Info.plist) so iOS doesn't
//      suspend our process when the screen locks.
//   3. While a bell is pending, we loop a near-zero-volume silent
//      buffer. iOS only honors background-audio mode while the app is
//      *actively* producing audio; the silent loop satisfies that
//      requirement without making any noise.
//   4. The bell itself is scheduled with AVAudioPlayer.play(atTime:),
//      which lines the playback up to the audio session clock — that
//      clock keeps running in background as long as the session is
//      active, so the bell fires precisely on the target moment even
//      if the screen is dark.
//
// JS front door (see native-shell.ts wireContemplation):
//   PhoebeAudio.prime()                        — activate session
//   PhoebeAudio.scheduleBellAt({ at, sound })  — schedule + warm
//   PhoebeAudio.cancelScheduled()              — stop silence + bell
//   PhoebeAudio.playNow({ sound })             — fire-and-forget
//
// All sound filenames are resolved against Bundle.main; the .caf bells
// (PhoebeRising-high.caf etc.) already ship as bundle resources via the
// existing LocalNotification path.

import Foundation
import Capacitor
import AVFoundation
import UserNotifications

@objc(PhoebeAudioPlugin)
public class PhoebeAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoebeAudioPlugin"
    public let jsName = "PhoebeAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prime", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playNow", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleBellAt", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelScheduled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleBellNotification", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelBellNotification", returnType: CAPPluginReturnPromise),
    ]

    private let bellNotificationId = "phoebe-contemplation-bell"

    // Schedule the end bell as a TIME-SENSITIVE local notification — bypasses
    // Do Not Disturb / Focus (the entitlement is in App.entitlements). Its
    // sound still honors the hardware silent switch; the in-app .playback
    // bell (scheduleBellAt) covers the muted-while-foregrounded case. The two
    // together are the reliable backstop for "the bell actually rings."
    @objc func scheduleBellNotification(_ call: CAPPluginCall) {
        let atMs = call.getDouble("at") ?? 0
        let soundName = call.getString("sound") ?? "PhoebeRising-high.caf"
        let target = Date(timeIntervalSince1970: atMs / 1000.0)
        let delay = target.timeIntervalSinceNow
        if delay <= 0.05 {
            call.reject("target time too soon or in past")
            return
        }
        let content = UNMutableNotificationContent()
        content.title = "Contemplation"
        content.body = "Your time is complete."
        content.sound = UNNotificationSound(named: UNNotificationSoundName(soundName))
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .timeSensitive
        }
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
        let request = UNNotificationRequest(identifier: bellNotificationId, content: content, trigger: trigger)
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [bellNotificationId])
        center.add(request) { error in
            if let error = error {
                call.reject("schedule notification failed: \(error.localizedDescription)")
            } else {
                call.resolve()
            }
        }
    }

    @objc func cancelBellNotification(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [bellNotificationId])
        center.removeDeliveredNotifications(withIdentifiers: [bellNotificationId])
        call.resolve()
    }

    // The keep-alive silent loop. Volume is set just barely above 0
    // because some iOS revisions treat an exact 0-volume player as
    // "not playing" and pull background-audio privileges anyway.
    private var silencePlayer: AVAudioPlayer?

    // The actual bell. We hold a strong reference for the whole
    // schedule window so the player isn't deallocated before its
    // scheduled play(atTime:) deadline.
    private var bellPlayer: AVAudioPlayer?

    // Foreground playNow player — deliberately SEPARATE from bellPlayer.
    // playNow used to write self.bellPlayer, which dropped the last strong
    // reference to the armed play(atTime:) close-bell player the moment the
    // OPENING bell rang (startSilence schedules the end bell, then plays the
    // opening) — deallocating it and silencing the end of every backgrounded
    // sit. The two players must never share a reference.
    private var nowPlayer: AVAudioPlayer?

    // Cleanup timer that stops the silent loop a few seconds after
    // the bell rings. We don't want to keep the audio session warm
    // (and the phone awake) any longer than necessary.
    private var cleanupTimer: Timer?

    private var sessionPrimed = false
    private var cachedSilenceURL: URL?

    // MARK: - Audio session

    // Configures the shared AVAudioSession for .playback, the category
    // that ignores the silent switch. We mix with others while idle so
    // we don't yank a user's music — but the closing bell, which
    // briefly plays, is loud enough to be heard alongside.
    private func ensureSessionActive() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try session.setActive(true, options: [])
        sessionPrimed = true
    }

    // MARK: - Silent WAV generator

    // Generates a 1.0s mono 16-bit PCM WAV of pure silence, written
    // once to the app's tmp directory and reused. Looping this through
    // AVAudioPlayer is the cheapest way to keep iOS honoring the
    // background-audio mode without bundling a separate asset.
    private func silenceURL() -> URL? {
        if let cached = cachedSilenceURL,
           FileManager.default.fileExists(atPath: cached.path) {
            return cached
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("phoebe-silence.wav")
        guard let data = makeSilentWAV(durationSeconds: 1.0) else { return nil }
        do {
            try data.write(to: url)
            cachedSilenceURL = url
            return url
        } catch {
            return nil
        }
    }

    private func makeSilentWAV(durationSeconds: Double) -> Data? {
        let sampleRate: UInt32 = 44_100
        let numChannels: UInt16 = 1
        let bitsPerSample: UInt16 = 16
        let blockAlign: UInt16 = numChannels * bitsPerSample / 8
        let byteRate: UInt32 = sampleRate * UInt32(blockAlign)
        let numSamples = UInt32(Double(sampleRate) * durationSeconds)
        let dataChunkSize: UInt32 = numSamples * UInt32(blockAlign)
        let fmtChunkSize: UInt32 = 16
        let riffSize: UInt32 = 4 + (8 + fmtChunkSize) + (8 + dataChunkSize)

        var data = Data()
        func appendLE<T: FixedWidthInteger>(_ value: T) {
            var v = value.littleEndian
            withUnsafeBytes(of: &v) { data.append(contentsOf: $0) }
        }
        // RIFF header
        data.append(contentsOf: "RIFF".utf8)
        appendLE(riffSize)
        data.append(contentsOf: "WAVE".utf8)
        // fmt chunk
        data.append(contentsOf: "fmt ".utf8)
        appendLE(fmtChunkSize)
        appendLE(UInt16(1)) // PCM
        appendLE(numChannels)
        appendLE(sampleRate)
        appendLE(byteRate)
        appendLE(blockAlign)
        appendLE(bitsPerSample)
        // data chunk
        data.append(contentsOf: "data".utf8)
        appendLE(dataChunkSize)
        data.append(Data(count: Int(dataChunkSize)))
        return data
    }

    // MARK: - Sound lookup

    private func bundleURL(for soundName: String) -> URL? {
        let ns = soundName as NSString
        let base = ns.deletingPathExtension
        let ext = ns.pathExtension.isEmpty ? "caf" : ns.pathExtension
        return Bundle.main.url(forResource: base, withExtension: ext)
    }

    // MARK: - JS-callable methods

    // Activates the audio session up front so the first scheduleBellAt
    // call doesn't pay the latency of category-switch + activate. The
    // web side calls this when the contemplation timer mounts.
    @objc func prime(_ call: CAPPluginCall) {
        do {
            try ensureSessionActive()
            call.resolve()
        } catch {
            call.reject("session prime failed: \(error.localizedDescription)")
        }
    }

    // Plays a bundled sound immediately. Fire-and-forget — useful for
    // the foreground in-app close bell so it goes through the same
    // .playback session and is audible even on silent.
    @objc func playNow(_ call: CAPPluginCall) {
        guard let name = call.getString("sound") else {
            call.reject("missing sound")
            return
        }
        guard let url = bundleURL(for: name) else {
            call.reject("sound not found: \(name)")
            return
        }
        do {
            try ensureSessionActive()
            let player = try AVAudioPlayer(contentsOf: url)
            player.prepareToPlay()
            player.play()
            // Hold a reference until natural completion so the player
            // isn't deallocated mid-playback. NOT bellPlayer — that slot
            // belongs to the scheduled close bell (see nowPlayer above).
            self.nowPlayer?.stop()
            self.nowPlayer = player
            call.resolve()
        } catch {
            call.reject("play failed: \(error.localizedDescription)")
        }
    }

    // Schedules the closing bell at a future absolute time. We:
    //   1. Activate the audio session.
    //   2. Start the silent keep-alive loop NOW so iOS keeps us
    //      foregrounded-for-audio purposes through screen-lock.
    //   3. Preload the bell into an AVAudioPlayer and call
    //      play(atTime:) with the deviceCurrentTime + delay — the
    //      audio engine clock survives backgrounding while the
    //      session is active.
    //   4. Set a cleanup Timer to stop the silent loop a few seconds
    //      AFTER the bell finishes, so we don't burn battery.
    //
    // Arguments:
    //   at:    epoch milliseconds (number from Date.now() + remaining ms)
    //   sound: filename in the app bundle, e.g. "PhoebeRising-high.caf"
    @objc func scheduleBellAt(_ call: CAPPluginCall) {
        let atMs = call.getDouble("at") ?? 0
        let soundName = call.getString("sound") ?? "PhoebeRising-high.caf"
        let target = Date(timeIntervalSince1970: atMs / 1000.0)
        let delay = target.timeIntervalSinceNow
        if delay <= 0.05 {
            call.reject("target time too soon or in past")
            return
        }
        guard let bellURL = bundleURL(for: soundName) else {
            call.reject("bell sound not found in bundle: \(soundName)")
            return
        }
        // Clear any prior schedule before laying down the new one so
        // we don't end up with two overlapping bells in edge cases.
        teardownPlayers()
        do {
            try ensureSessionActive()

            // Start the silent keep-alive loop.
            if let silenceURL = silenceURL() {
                let silence = try AVAudioPlayer(contentsOf: silenceURL)
                silence.numberOfLoops = -1
                silence.volume = 0.001
                silence.prepareToPlay()
                silence.play()
                self.silencePlayer = silence
            }

            // Preload the bell on the same audio session and align
            // its playback to the device audio clock.
            let bell = try AVAudioPlayer(contentsOf: bellURL)
            bell.prepareToPlay()
            self.bellPlayer = bell
            let playAt = bell.deviceCurrentTime + delay
            bell.play(atTime: playAt)

            // Drop the silent loop ~10s after the bell — the longest
            // shipped bell is well under that. Doing this from a
            // Timer (rather than AVAudioPlayerDelegate) keeps the
            // cleanup simple and works even if the bell is interrupted.
            let cleanup = Timer(timeInterval: delay + 10.0, repeats: false) { [weak self] _ in
                guard let self = self else { return }
                self.silencePlayer?.stop()
                self.silencePlayer = nil
            }
            RunLoop.main.add(cleanup, forMode: .common)
            self.cleanupTimer = cleanup

            call.resolve()
        } catch {
            // Roll back on any error so we don't leave a silent loop
            // running with no bell behind it.
            teardownPlayers()
            call.reject("schedule failed: \(error.localizedDescription)")
        }
    }

    // Cancels everything: stops the silence loop, stops any pending
    // bell, invalidates the cleanup timer. We leave the AVAudioSession
    // active — the OS reclaims it idle quickly enough on its own, and
    // keeping it warm means a fast re-prime if the user starts another
    // sit right away.
    @objc func cancelScheduled(_ call: CAPPluginCall) {
        teardownPlayers()
        call.resolve()
    }

    private func teardownPlayers() {
        cleanupTimer?.invalidate()
        cleanupTimer = nil
        silencePlayer?.stop()
        silencePlayer = nil
        bellPlayer?.stop()
        bellPlayer = nil
    }
}
