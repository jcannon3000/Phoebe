// PhoebeMusicPlugin.swift
//
// Native bridge for IN-APP Apple Music playback — a hymn from the Hymnal 1982
// catalogue (/hymns) played through the listener's OWN Apple Music
// subscription, instead of handing the link to the Music app and leaving
// Phoebe. Owner, 2026-09-18: "Could we build that apple music would be
// integrated to actually be able to play the music through the users account
// if they are logged in even though spotify is not as simple".
//
// Playback ONLY. This never reads the listener's library, history or taste
// profile; the sole request it makes of MusicKit is "play this catalog song".
// The ids come from lib/hymnsCatalogue.ts (`appleTrackId`), which is the Apple
// Music CATALOG id — the `i=` parameter on a music.apple.com link.
//
// JS front door (see mymonastery/src/lib/appleMusicNative.ts):
//   PhoebeMusic.isAvailable()        -> { available, authorized, subscribed }
//   PhoebeMusic.authorize()          -> { authorized }   (prompts once)
//   PhoebeMusic.playTrack({ id })    -> { playing }
//   PhoebeMusic.pause() / .resume() / .stop()
//
// TWO THINGS GATE THIS AT RUNTIME, and both fail softly — the JS side falls
// back to opening music.apple.com, which is what every listener gets today:
//   1. The App ID must have the MusicKit capability (Apple Developer portal →
//      Identifiers → app.withphoebe.mobile → Capabilities → MusicKit), and the
//      provisioning profile regenerated. This is NOT the same thing as the
//      MusicKit .p8 key under Keys → Media Services, which Phoebe already has
//      and which only signs the server's catalogue-SEARCH developer token
//      (api-server routes/apple-music.ts). Without the capability, catalog
//      playback fails at runtime.
//   2. The listener needs an Apple Music subscription. MusicSubscription's
//      canPlayCatalogContent is the honest check — a lapsed subscriber can
//      still be "authorized".
//
// Info.plist must carry NSAppleMusicUsageDescription or the authorization
// request traps. It is there.
//
// iOS 16+ for the async MusicKit surface (deployment target is 15.0), so every
// method gates with #available and rejects cleanly below that — the same shape
// PhoebeBadgePlugin uses for its iOS 16 badge API.

import Foundation
import Capacitor
import AVFoundation

#if canImport(MusicKit)
import MusicKit
#endif

@objc(PhoebeMusicPlugin)
public class PhoebeMusicPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoebeMusicPlugin"
    public let jsName = "PhoebeMusic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    /// Music the listener asked for, so it plays through the silent switch —
    /// .playback, like the sit's bell and unlike the ambient effects
    /// (PhoebeAudioPlugin carries the same note). `.mixWithOthers` lets
    /// Phoebe's own bells and breath tones sound over the hymn rather than
    /// ducking it out.
    private func activateAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            // Non-fatal: MusicKit generally manages its own session. If this
            // fails the hymn still plays; it may just duck other audio.
        }
    }

    // MARK: - Availability

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(MusicKit)
        if #available(iOS 16.0, *) {
            Task {
                let status = MusicAuthorization.currentStatus
                let authorized = status == .authorized
                var subscribed = false
                if authorized {
                    // Only meaningful once authorized; asking earlier throws.
                    subscribed = (try? await MusicSubscription.current)?.canPlayCatalogContent ?? false
                }
                call.resolve([
                    "available": true,
                    "authorized": authorized,
                    "subscribed": subscribed,
                ])
            }
            return
        }
        #endif
        call.resolve(["available": false, "authorized": false, "subscribed": false])
    }

    @objc func authorize(_ call: CAPPluginCall) {
        #if canImport(MusicKit)
        if #available(iOS 16.0, *) {
            Task {
                // Prompts the first time only; afterwards it returns the
                // standing answer without showing anything.
                let status = await MusicAuthorization.request()
                let authorized = status == .authorized
                var subscribed = false
                if authorized {
                    subscribed = (try? await MusicSubscription.current)?.canPlayCatalogContent ?? false
                }
                call.resolve(["authorized": authorized, "subscribed": subscribed])
            }
            return
        }
        #endif
        call.resolve(["authorized": false, "subscribed": false])
    }

    // MARK: - Playback

    @objc func playTrack(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("playTrack needs an Apple Music catalog track id")
            return
        }
        #if canImport(MusicKit)
        if #available(iOS 16.0, *) {
            Task {
                guard MusicAuthorization.currentStatus == .authorized else {
                    call.reject("not-authorized")
                    return
                }
                guard (try? await MusicSubscription.current)?.canPlayCatalogContent == true else {
                    // A lapsed or absent subscription: say so plainly rather
                    // than starting a 30-second preview the listener didn't ask
                    // for. The JS side opens music.apple.com instead.
                    call.reject("no-subscription")
                    return
                }
                do {
                    var request = MusicCatalogResourceRequest<Song>(matching: \.id, equalTo: MusicItemID(id))
                    request.limit = 1
                    let response = try await request.response()
                    guard let song = response.items.first else {
                        call.reject("not-found")
                        return
                    }
                    await MainActor.run { self.activateAudioSession() }
                    let player = ApplicationMusicPlayer.shared
                    player.queue = ApplicationMusicPlayer.Queue(for: [song])
                    try await player.prepareToPlay()
                    try await player.play()
                    call.resolve([
                        "playing": true,
                        "title": song.title,
                        "artist": song.artistName,
                    ])
                } catch {
                    call.reject("playback-failed: \(error.localizedDescription)")
                }
            }
            return
        }
        #endif
        call.reject("Apple Music playback needs iOS 16 or later")
    }

    @objc func pause(_ call: CAPPluginCall) {
        #if canImport(MusicKit)
        if #available(iOS 16.0, *) {
            ApplicationMusicPlayer.shared.pause()
            call.resolve()
            return
        }
        #endif
        call.resolve()
    }

    @objc func resume(_ call: CAPPluginCall) {
        #if canImport(MusicKit)
        if #available(iOS 16.0, *) {
            Task {
                do { try await ApplicationMusicPlayer.shared.play(); call.resolve() }
                catch { call.reject("resume-failed") }
            }
            return
        }
        #endif
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        #if canImport(MusicKit)
        if #available(iOS 16.0, *) {
            let player = ApplicationMusicPlayer.shared
            player.stop()
            player.queue = ApplicationMusicPlayer.Queue()
            call.resolve()
            return
        }
        #endif
        call.resolve()
    }
}
