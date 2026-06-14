// CobreatheMusicPlugin.swift
//
// Native bridge for playing ONE curated Apple Music playlist during Cobreathe.
// Playback ONLY: it never reads the user's listening history (the old, removed
// integration did — this one deliberately does not).
//
// Uses MusicKit's ApplicationMusicPlayer (iOS 16+), so full tracks play for
// Apple Music subscribers through the app's own player. The app's shared
// AVAudioSession is set to .playback + .mixWithOthers (the same category
// PhoebeAudioPlugin uses) BEFORE play, so the breath's Web-Audio swell tones
// still sound OVER the music instead of ducking it.
//
// JS front door (see native-shell.ts wireCobreatheMusic):
//   CobreatheMusic.authorize()               — request Apple Music access
//   CobreatheMusic.getAuthorizationStatus()  — { status }
//   CobreatheMusic.isAvailable()             — { available }  (authorized + subscriber + iOS 16)
//   CobreatheMusic.play({ playlistId })      — shuffle + repeat-all a catalog playlist
//   CobreatheMusic.stop()                    — stop playback
//
// Requires: NSAppleMusicUsageDescription (Info.plist); MusicKit enabled for the
// App ID in the Apple Developer portal (catalog playback fails at runtime
// otherwise); UIBackgroundModes:audio (already present) for lock-screen play.

import Foundation
import Capacitor
import AVFoundation
import MusicKit

@objc(CobreatheMusicPlugin)
public class CobreatheMusicPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CobreatheMusicPlugin"
    public let jsName = "CobreatheMusic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    // Mix the breath tones over the music. Same category PhoebeAudioPlugin uses,
    // so the two are compatible/idempotent. Activated before play; never torn
    // down here — we leave the session warm, exactly like PhoebeAudio.
    private func ensureMixingSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true, options: [])
    }

    @objc func authorize(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            Task {
                let status = await MusicAuthorization.request()
                call.resolve(["status": status.phoebeString])
            }
        } else {
            call.resolve(["status": "unavailable"])
        }
    }

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            call.resolve(["status": MusicAuthorization.currentStatus.phoebeString])
        } else {
            call.resolve(["status": "unavailable"])
        }
    }

    // Available only when authorized AND the account can play catalog content
    // (i.e. an active Apple Music subscription). Non-subscribers → false → the
    // web layer simply skips music.
    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            Task {
                guard MusicAuthorization.currentStatus == .authorized else {
                    call.resolve(["available": false]); return
                }
                do {
                    let sub = try await MusicSubscription.current
                    call.resolve(["available": sub.canPlayCatalogContent])
                } catch {
                    call.resolve(["available": false])
                }
            }
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        guard let playlistId = call.getString("playlistId"), !playlistId.isEmpty else {
            call.reject("playlistId required"); return
        }
        if #available(iOS 16.0, *) {
            Task {
                do {
                    guard MusicAuthorization.currentStatus == .authorized else {
                        call.resolve(["playing": false, "reason": "not-authorized"]); return
                    }
                    var request = MusicCatalogResourceRequest<Playlist>(matching: \.id, equalTo: MusicItemID(playlistId))
                    request.limit = 1
                    let response = try await request.response()
                    guard let playlist = response.items.first else {
                        call.resolve(["playing": false, "reason": "playlist-not-found"]); return
                    }
                    self.ensureMixingSession()
                    let player = ApplicationMusicPlayer.shared
                    player.queue = [playlist]
                    player.state.shuffleMode = .songs   // shuffle…
                    player.state.repeatMode = .all      // …and loop the playlist
                    try await player.play()
                    call.resolve(["playing": true])
                } catch {
                    call.resolve(["playing": false, "reason": error.localizedDescription])
                }
            }
        } else {
            call.resolve(["playing": false, "reason": "ios-too-old"])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            ApplicationMusicPlayer.shared.stop()
        }
        call.resolve()
    }
}

@available(iOS 16.0, *)
private extension MusicAuthorization.Status {
    var phoebeString: String {
        switch self {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }
}
