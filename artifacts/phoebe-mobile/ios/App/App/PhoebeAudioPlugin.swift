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
import CoreHaptics

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
        CAPPluginMethod(name: "smoothSwell", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playPad", returnType: CAPPluginReturnPromise),
    ]

    private let bellNotificationId = "phoebe-contemplation-bell"
    // Core Haptics engine for the Cobreathe completion swell (lazy; reused).
    private var hapticEngine: CHHapticEngine?

    // ─── Chapel pad (the slide-turn chime), rendered natively ────────────────
    // A replica of lib/amenFeedback.ts playBreathTone: an open fifth (root,
    // fifth as a triangle, octave) at 110 Hz × 2^octaveStep, 2.5 s swell,
    // 0.8 s hold, 3.7 s exponential fade, through a one-pole low-pass whose
    // cutoff opens with the swell. Rendered into a buffer and played on one of
    // a small pool of player nodes so consecutive pads may overlap (the
    // routine-complete swell fires three 1.1 s apart). Plays under our own
    // .playback + .mixWithOthers session, so another app's music keeps going —
    // WebAudio in the WebView made WebKit take an exclusive session and
    // stopped it (owner, 2026-09-05).
    private var padEngine: AVAudioEngine?
    private var padPlayers: [AVAudioPlayerNode] = []
    private var padNext = 0

    @objc func playPad(_ call: CAPPluginCall) {
        let step = max(0, min(4, Int(call.getDouble("octaveStep") ?? 0)))
        do {
            try ensureSessionActive()
            let sr = 44100.0
            let swellIn = 2.5, hold = 0.8, fadeOut = 3.7
            let total = swellIn + hold + fadeOut
            let frames = AVAudioFrameCount(total * sr)
            guard let fmt = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 1),
                  let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: frames),
                  let out = buf.floatChannelData?[0] else {
                call.reject("pad buffer"); return
            }
            buf.frameLength = frames
            let octMult = pow(2.0, Double(step))
            let root = 110.0 * octMult
            let masterPeak = step >= 2 ? 0.18 : step >= 1 ? 0.20 : 0.22
            let voices: [(freq: Double, gain: Double, triangle: Bool)] = [
                (root, 0.55, false), (root * 1.5, 0.28, true), (root * 2.0, 0.22, false)
            ]
            var phase = [Double](repeating: 0, count: voices.count)
            let lpStart = 380.0 * octMult, lpPeak = 1800.0 * octMult
            var lpY = 0.0
            let n = Int(frames)
            for i in 0..<n {
                let t = Double(i) / sr
                // Master envelope: linear swell, hold, exponential fade to -80 dB.
                let env: Double
                if t < swellIn { env = masterPeak * (t / swellIn) }
                else if t < swellIn + hold { env = masterPeak }
                else { env = masterPeak * pow(0.0001 / masterPeak, (t - swellIn - hold) / fadeOut) }
                // ~0.3% upward drift over the swell, back to pitch by the end.
                let drift = t < swellIn ? 1.0 + 0.003 * (t / swellIn) : 1.0 + 0.003 * max(0.0, 1.0 - (t - swellIn) / (total - swellIn))
                var x = 0.0
                for (vi, v) in voices.enumerated() {
                    phase[vi] += v.freq * drift / sr
                    if phase[vi] >= 1.0 { phase[vi] -= 1.0 }
                    let ph = phase[vi]
                    let sample = v.triangle ? (2.0 * abs(2.0 * (ph - floor(ph + 0.5))) - 1.0) : sin(2.0 * Double.pi * ph)
                    x += sample * v.gain
                }
                // Low-pass sweep lpStart → lpPeak over the swell → 2×lpStart by the end.
                let fc = t < swellIn ? lpStart + (lpPeak - lpStart) * (t / swellIn)
                    : lpPeak + (lpStart * 2.0 - lpPeak) * ((t - swellIn) / (total - swellIn))
                let a = 1.0 - exp(-2.0 * Double.pi * fc / sr)
                lpY += a * (x - lpY)
                out[i] = Float(lpY * env)
            }
            if padEngine == nil {
                let engine = AVAudioEngine()
                var players: [AVAudioPlayerNode] = []
                for _ in 0..<3 {
                    let p = AVAudioPlayerNode()
                    engine.attach(p)
                    engine.connect(p, to: engine.mainMixerNode, format: fmt)
                    players.append(p)
                }
                padEngine = engine
                padPlayers = players
            }
            guard let engine = padEngine, !padPlayers.isEmpty else { call.reject("pad engine"); return }
            if !engine.isRunning { try engine.start() }
            let player = padPlayers[padNext % padPlayers.count]
            padNext += 1
            player.stop()
            player.scheduleBuffer(buf, completionHandler: nil)
            player.play()
            call.resolve(["ok": true])
        } catch {
            call.reject("playPad failed: \(error.localizedDescription)")
        }
    }

    // ─── Smooth completion haptic (Core Haptics) ─────────────────────────────
    // ONE continuous vibration whose intensity follows a parabola — rising from
    // nothing to a peak and falling back to nothing — like Duolingo's success
    // buzz. Capacitor's Haptics plugin can only fire discrete impacts, which
    // read as a string of taps; this is a single sustained swell. No-ops on
    // hardware without Core Haptics (older devices / most iPads); the web side
    // falls back to the impact-density approximation there.
    //   durationMs  default 1300   peak 0..1 default 1.0   sharpness 0..1 default 0.3
    @objc func smoothSwell(_ call: CAPPluginCall) {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
            call.resolve(["ok": false])
            return
        }
        let duration = (call.getDouble("durationMs") ?? 1300) / 1000.0
        let peak = Float(call.getDouble("peak") ?? 1.0)
        let sharpness = Float(call.getDouble("sharpness") ?? 0.3)
        do {
            if hapticEngine == nil {
                let e = try CHHapticEngine()
                // Restart transparently if the system resets/stops the engine.
                e.resetHandler = { [weak self] in try? self?.hapticEngine?.start() }
                e.stoppedHandler = { _ in }
                hapticEngine = e
            }
            try hapticEngine?.start()

            let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: peak)
            let sharp = CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)
            let event = CHHapticEvent(eventType: .hapticContinuous,
                                      parameters: [intensity, sharp],
                                      relativeTime: 0,
                                      duration: duration)

            // Parabolic intensity envelope: value = 1 - (2t - 1)^2 → 0 at the
            // ends, 1 at the midpoint. The engine interpolates smoothly between
            // these control points, so the buzz swells and fades as one motion.
            let steps = 18
            var points: [CHHapticParameterCurve.ControlPoint] = []
            for i in 0...steps {
                let t = Double(i) / Double(steps)
                let value = Float(max(0.0, 1.0 - pow(2.0 * t - 1.0, 2.0)))
                points.append(CHHapticParameterCurve.ControlPoint(relativeTime: t * duration, value: value))
            }
            let curve = CHHapticParameterCurve(parameterID: .hapticIntensityControl,
                                               controlPoints: points,
                                               relativeTime: 0)

            let pattern = try CHHapticPattern(events: [event], parameterCurves: [curve])
            let player = try hapticEngine?.makePlayer(with: pattern)
            try player?.start(atTime: CHHapticTimeImmediate)
            call.resolve(["ok": true])
        } catch {
            call.reject("smoothSwell failed: \(error.localizedDescription)")
        }
    }

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
        // Distinct thread so the app's willPresent delegate force-shows this as a
        // banner even in the foreground (a keep-awake sit holds the app active, so
        // without this the wrapped Capacitor delegate would suppress it).
        content.threadIdentifier = "contemplation-bell"
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
