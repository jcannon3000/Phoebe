// SpotifyMusicPlugin.swift
//
// Native bridge for IN-APP Spotify playback during the Listening practice
// (audio divina). Uses the Spotify iOS SDK's SPTAppRemote: it authorizes
// through, and plays full tracks via, the installed Spotify app (app-remote).
// Playback ONLY — we start a curated playlist and pause/resume it; we never
// read the listener's history. Requires Spotify Premium.
//
// JS front door (see lib/spotifyPlayer.ts):
//   SpotifyMusic.isAvailable()  -> { available }   (Spotify app installed)
//   SpotifyMusic.play({ clientId, redirectUri, playlistUri })
//                               -> authorize + play a playlist URI
//   SpotifyMusic.pause() / .resume() / .disconnect()
//
// DORMANT until four manual steps are done (this file is deliberately NOT in the
// Xcode target yet, exactly like CobreatheMusicPlugin, so the build is unaffected
// until the SDK is present). See artifacts/spotify-integration-notes.md:
//   1. Add the Spotify iOS SDK (SpotifyiOS.xcframework, via SPM or manual) to
//      the App target, and add THIS file to the target.
//   2. MainViewController.capacitorDidLoad():
//        bridge?.registerPluginInstance(SpotifyMusicPlugin())
//   3. Info.plist: LSApplicationQueriesSchemes includes "spotify" (added); add a
//      CFBundleURLTypes entry for the redirect scheme registered in the Spotify
//      dashboard (e.g. app.withphoebe.mobile).
//   4. AppDelegate.application(_:open:options:) must hand the return URL back:
//        SpotifyMusicPlugin.shared?.handleAuthURL(url)
//
// The client id + redirect uri are passed from JS (lib/spotify.ts) so there is
// no secret in native code.

import Foundation
import Capacitor
import AVFoundation
#if canImport(SpotifyiOS)
import SpotifyiOS

@objc(SpotifyMusicPlugin)
public class SpotifyMusicPlugin: CAPPlugin, CAPBridgedPlugin, SPTAppRemoteDelegate {
    public let identifier = "SpotifyMusicPlugin"
    public let jsName = "SpotifyMusic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
    ]

    // AppDelegate hands the auth-return URL back through this (step 4 above).
    public static weak var shared: SpotifyMusicPlugin?

    private var appRemote: SPTAppRemote?
    private var pendingPlaylistUri: String?

    public override func load() {
        SpotifyMusicPlugin.shared = self
    }

    // Same mixing session the rest of the app uses, so any Phoebe tones still
    // sound over the music rather than ducking it.
    private func ensureMixingSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true, options: [])
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        // Spotify app installed? Requires "spotify" in LSApplicationQueriesSchemes.
        let installed = UIApplication.shared.canOpenURL(URL(string: "spotify:")!)
        call.resolve(["available": installed])
    }

    @objc func play(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId"), !clientId.isEmpty,
              let redirect = call.getString("redirectUri"), let redirectURL = URL(string: redirect) else {
            call.reject("Missing clientId/redirectUri")
            return
        }
        let playlistUri = call.getString("playlistUri") ?? ""
        ensureMixingSession()

        let config = SPTConfiguration(clientID: clientId, redirectURL: redirectURL)
        let remote = SPTAppRemote(configuration: config, logLevel: .info)
        remote.delegate = self
        self.appRemote = remote
        self.pendingPlaylistUri = playlistUri.isEmpty ? nil : playlistUri

        DispatchQueue.main.async {
            // Opens Spotify, authorizes, plays the URI, returns to us. false =>
            // Spotify app isn't installed.
            let started = remote.authorizeAndPlayURI(playlistUri)
            if started {
                call.resolve()
            } else {
                call.reject("Spotify app is not installed")
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        appRemote?.playerAPI?.pause { _, error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        appRemote?.playerAPI?.resume { _, error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        appRemote?.disconnect()
        call.resolve()
    }

    /// Called from AppDelegate when Spotify returns to the app after authorize.
    public func handleAuthURL(_ url: URL) {
        guard let remote = appRemote else { return }
        let params = remote.authorizationParameters(from: url)
        if let token = params?[SPTAppRemoteAccessTokenKey] {
            remote.connectionParameters.accessToken = token
            remote.connect()
        }
    }

    // MARK: - SPTAppRemoteDelegate

    public func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
        // Connected for control. authorizeAndPlayURI already started playback;
        // if a URI was pending and didn't start, nudge it now.
        if let uri = pendingPlaylistUri {
            appRemote.playerAPI?.play(uri)
            pendingPlaylistUri = nil
        }
        notifyListeners("spotifyConnected", data: [:])
    }

    public func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
        notifyListeners("spotifyError", data: ["message": error?.localizedDescription ?? "connection failed"])
    }

    public func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
        notifyListeners("spotifyDisconnected", data: [:])
    }
}
#endif
