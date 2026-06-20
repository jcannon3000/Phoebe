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
//   CobreatheMusic.play({ playlistId, shuffle }) — play a catalog playlist
//                                            (shuffle defaults true; the
//                                            Listening practice passes false to
//                                            hear a contemplative playlist in order)
//   CobreatheMusic.pause() / .resume()       — pause/resume without losing the queue
//   CobreatheMusic.stop()                    — stop playback
//
// Shared by Cobreathe AND the Listening practice (audio divina) — both play one
// curated Apple Music playlist through the app's own player.
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
        CAPPluginMethod(name: "playItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "searchCatalog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nowPlaying", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
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
                    // shuffle defaults on (Cobreathe); Listening passes false to
                    // hear the curated playlist in its intended order.
                    let shuffle = call.getBool("shuffle") ?? true
                    player.state.shuffleMode = shuffle ? .songs : .off
                    player.state.repeatMode = .all      // loop for the length of the sit
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

    @objc func pause(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            ApplicationMusicPlayer.shared.pause()
        }
        call.resolve()
    }

    @objc func resume(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            Task {
                do { try await ApplicationMusicPlayer.shared.play(); call.resolve() }
                catch { call.reject(error.localizedDescription) }
            }
        } else {
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            ApplicationMusicPlayer.shared.stop()
        }
        call.resolve()
    }

    // Search the Apple Music CATALOG for songs, albums, and playlists the
    // listener can add to their Sacred Library. Native MusicKit search uses the
    // app's MusicKit entitlement + the user's Apple Music auth — no developer
    // JWT needed (that's only the web/MusicKit-JS path).
    @objc func searchCatalog(_ call: CAPPluginCall) {
        let term = (call.getString("term") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { call.resolve(["results": []]); return }
        if #available(iOS 16.0, *) {
            Task {
                do {
                    guard MusicAuthorization.currentStatus == .authorized else {
                        call.resolve(["results": [], "reason": "not-authorized"]); return
                    }
                    var request = MusicCatalogSearchRequest(term: term, types: [Song.self, Album.self, Playlist.self])
                    request.limit = 5
                    let response = try await request.response()
                    var results: [[String: Any]] = []
                    for song in response.songs {
                        results.append([
                            "id": song.id.rawValue, "kind": "song", "title": song.title,
                            "subtitle": song.artistName,
                            "artworkUrl": song.artwork?.url(width: 160, height: 160)?.absoluteString ?? "",
                            "url": song.url?.absoluteString ?? "",
                        ])
                    }
                    for album in response.albums {
                        results.append([
                            "id": album.id.rawValue, "kind": "album", "title": album.title,
                            "subtitle": album.artistName,
                            "artworkUrl": album.artwork?.url(width: 160, height: 160)?.absoluteString ?? "",
                            "url": album.url?.absoluteString ?? "",
                        ])
                    }
                    for playlist in response.playlists {
                        results.append([
                            "id": playlist.id.rawValue, "kind": "playlist", "title": playlist.name,
                            "subtitle": playlist.curatorName ?? "",
                            "artworkUrl": playlist.artwork?.url(width: 160, height: 160)?.absoluteString ?? "",
                            "url": playlist.url?.absoluteString ?? "",
                        ])
                    }
                    call.resolve(["results": results])
                } catch {
                    call.resolve(["results": [], "reason": error.localizedDescription])
                }
            }
        } else {
            call.resolve(["results": []])
        }
    }

    // Play ANY catalog item by id — a song, an album, or a playlist (the
    // listener's own choice, not a fixed playlist). Returns playing:false so the
    // web layer can fall back to opening Apple Music.
    @objc func playItem(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else { call.reject("id required"); return }
        let kind = call.getString("kind") ?? "song"
        if #available(iOS 16.0, *) {
            Task {
                do {
                    guard MusicAuthorization.currentStatus == .authorized else {
                        call.resolve(["playing": false, "reason": "not-authorized"]); return
                    }
                    let itemId = MusicItemID(id)
                    self.ensureMixingSession()
                    let player = ApplicationMusicPlayer.shared
                    switch kind {
                    case "album":
                        var req = MusicCatalogResourceRequest<Album>(matching: \.id, equalTo: itemId)
                        req.limit = 1
                        guard let album = try await req.response().items.first else {
                            call.resolve(["playing": false, "reason": "not-found"]); return
                        }
                        player.queue = [album]
                    case "playlist":
                        var req = MusicCatalogResourceRequest<Playlist>(matching: \.id, equalTo: itemId)
                        req.limit = 1
                        guard let playlist = try await req.response().items.first else {
                            call.resolve(["playing": false, "reason": "not-found"]); return
                        }
                        player.queue = [playlist]
                    default:
                        var req = MusicCatalogResourceRequest<Song>(matching: \.id, equalTo: itemId)
                        req.limit = 1
                        guard let song = try await req.response().items.first else {
                            call.resolve(["playing": false, "reason": "not-found"]); return
                        }
                        player.queue = [song]
                    }
                    player.state.shuffleMode = .off
                    player.state.repeatMode = (kind == "song") ? MusicPlayer.RepeatMode.one : MusicPlayer.RepeatMode.all
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

    // The currently-playing entry (title / artist / artwork) for the in-app
    // now-playing bar. Empty title when nothing is queued.
    @objc func nowPlaying(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            if let entry = ApplicationMusicPlayer.shared.queue.currentEntry {
                call.resolve([
                    "title": entry.title,
                    "subtitle": entry.subtitle ?? "",
                    "artworkUrl": entry.artwork?.url(width: 160, height: 160)?.absoluteString ?? "",
                ])
            } else {
                call.resolve(["title": ""])
            }
        } else {
            call.resolve(["title": ""])
        }
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
