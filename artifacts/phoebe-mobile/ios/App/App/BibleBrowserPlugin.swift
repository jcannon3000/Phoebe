// BibleBrowserPlugin.swift
//
// Capacitor 6 plugin that exposes a single `open({ url })` method to
// JS. The plugin presents BibleWebViewController in a navigation
// controller modal so the Done button stays pinned at the top of
// the screen for the whole reading session — fixes the issue where
// SFSafariViewController auto-collapses its toolbar on scroll and
// hides the only way back to the liturgy.
//
// JS side: `window.PhoebeNative.openInAppBrowser(url)` — same JS
// front door as before — gets rerouted to this plugin via the
// native shell's `phoebe:open-url` listener (see native-shell.ts).
//
// YouVersion handoff: when the URL host is bible.com (or www.bible.com)
// we try to route through iOS's Universal Link system FIRST so users
// with the YouVersion app installed land in the app instead of the
// in-app web view. `UIApplication.open(url, options: .universalLinksOnly)`
// returns `false` in the completion when no app handles the link, at
// which point we fall back to the existing BibleBrowser web flow.
// SFSafariViewController-style in-app web views bypass Universal Link
// routing on their own — the only way to get YouVersion to receive the
// tap is to ask UIApplication directly outside any web-view chrome.

import Foundation
import Capacitor
import UIKit
import SafariServices

@objc(BibleBrowserPlugin)
public class BibleBrowserPlugin: CAPPlugin, CAPBridgedPlugin, SFSafariViewControllerDelegate {
    public let identifier = "BibleBrowserPlugin"
    public let jsName = "BibleBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openReader", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preload", returnType: CAPPluginReturnPromise),
    ]

    // Open a URL in Safari's reader view (SFSafariViewController with
    // entersReaderIfAvailable) — used for newsletters, where clean reading
    // beats the pinned Done button of the WKWebView path. The toolbar
    // auto-collapses on scroll (the documented trade), but a Done button is
    // still reachable. Emits phoebe:browserfinished on dismiss so the caller
    // can mark the newsletter read only once it's actually closed.
    @objc func openReader(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"),
              let url = URL(string: urlStr) else {
            call.reject("Missing or invalid url")
            return
        }
        DispatchQueue.main.async { [weak self] in
            self?.presentReaderView(url: url)
            call.resolve()
        }
    }

    /**
     * Safari's own Reader mode (SFSafariViewController, entersReaderIfAvailable)
     * for `url`. Shared by two callers: openReader (the JS front door) and the
     * article browser's own "Reader" button (BibleWebViewController.onOpenReaderView) —
     * one builder, so the two paths can't drift into two different-looking
     * reader views.
     */
    private func presentReaderView(url: URL) {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = true
        let vc = SFSafariViewController(url: url, configuration: config)
        vc.delegate = self
        vc.dismissButtonStyle = .done
        vc.preferredControlTintColor = UIColor(red: 0.18, green: 0.42, blue: 0.25, alpha: 1.0)
        // Owner: "we want all forward pages to open in light mode." This
        // reader-mode path (used for FDD and other newsletter links) has
        // no explicit appearance override otherwise, so it just follows
        // the device's system dark/light setting — on a dark-mode device,
        // Forward Movement's own pages rendered dark. Force light for
        // their domain specifically; every other reader-mode source keeps
        // following the system setting as before.
        let host = url.host?.lowercased() ?? ""
        if host == "forwardmovement.org" || host.hasSuffix(".forwardmovement.org") {
            vc.overrideUserInterfaceStyle = .light
        }
        bridge?.viewController?.present(vc, animated: true)
    }

    public func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        bridge?.triggerWindowJSEvent(eventName: "phoebe:browserfinished")
    }

    /**
     * A snapshot of the app's own view — whatever office slide is currently on
     * screen — taken synchronously on the main thread right before the browser
     * presents over it.
     *
     * `afterScreenUpdates: false` deliberately: this should capture EXACTLY
     * what the reader is looking at at the instant they tapped, not force a
     * fresh layout pass first (which could itself take a visible beat, and
     * might not even match — a scroll position mid-animation, say).
     */
    private func snapshotBridgeView() -> UIImage? {
        guard let view = bridge?.viewController?.view, view.bounds.width > 0, view.bounds.height > 0 else { return nil }
        let renderer = UIGraphicsImageRenderer(bounds: view.bounds)
        return renderer.image { _ in
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: false)
        }
    }

    // Warm a URL in a background web view so a later open() shows it instantly.
    // Best-effort: a bad URL just no-ops. Called when a newsletter card mounts.
    @objc func preload(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"),
              let url = URL(string: urlStr) else {
            call.reject("Missing or invalid url")
            return
        }
        DispatchQueue.main.async {
            BibleBrowser.shared.preload(url: url)
            call.resolve()
        }
    }

    @objc func open(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"),
              let url = URL(string: urlStr) else {
            call.reject("Missing or invalid url")
            return
        }
        // Is this an ARTICLE (a newsletter / reflection) rather than an office?
        // Decides the starting chrome — they are light pages, and a cream page
        // opening behind a black bar flashes the wrong frame — and whether the
        // office Options menu is offered at all. See `isArticle`.
        let isArticle = call.getBool("lightChrome") ?? false
        // Is this a BIBLE PASSAGE opened from an office slide (the "Read
        // online" pill on a lesson)? See officeChrome's own doc comment on
        // BibleWebViewController for the full shape of what this turns on.
        let officeChrome = call.getBool("officeChrome") ?? false
        // One top-left button reading "Back" rather than "Done" — see
        // openExternal's OpenOpts. Only meaningful alongside lightChrome.
        let backChrome = call.getBool("backChrome") ?? false
        /// A page saved for offline (Safari Reading List model) — the reader
        /// loads this instead of fetching the URL. See BibleWebViewController.
        let savedHtml = call.getString("savedHtml")
        let officeTitle = call.getString("officeTitle")
        let officeSlideLabel = call.getString("slideLabel")
        let officeSectionLabel = call.getString("sectionLabel")
        // Earlier issues for the reader's "Previous" menu — [{title, url}],
        // newest first; anything malformed is simply left out.
        let previousIssues: [(title: String, url: URL)] = (call.getArray("previous") ?? []).compactMap { raw in
            guard let d = raw as? [String: Any],
                  let t = d["title"] as? String, !t.isEmpty,
                  let u = d["url"] as? String, let url = URL(string: u) else { return nil }
            return (title: t, url: url)
        }
        // A snapshot of the office slide already on screen — becomes the
        // loading veil in place of the generic Splash leaf, so the browser
        // opens as a continuation of what the reader was just looking at
        // rather than a jump to a different screen. Taken HERE, before
        // anything changes on screen, and only when it will actually be used.
        let snapshotVeilImage: UIImage? = officeChrome ? self.snapshotBridgeView() : nil
        DispatchQueue.main.async { [weak self] in
            // The Journal button in the browser's bottom bar fires this event
            // into the app's web view, which then navigates to the journal.
            let onJournal: () -> Void = { [weak self] in
                self?.bridge?.triggerWindowJSEvent(eventName: "phoebe:open-journal")
            }
            // Mirrors safariViewControllerDidFinish below (the reader-view
            // path) — fires the SAME event this plain in-app-browser path
            // never fired before, which left openExternalThenMarkRead's JS
            // listener waiting forever and CAC/FDD/most links never marked
            // read on native.
            let onDismiss: () -> Void = { [weak self] in
                self?.bridge?.triggerWindowJSEvent(eventName: "phoebe:browserfinished")
            }
            // Options → the two hand-offs. The browser dismisses first, then
            // the app routes: the office intro chooser owns the formats, the
            // podcast player owns the audio. Fired as window events so the web
            // layer decides WHERE, and this plugin stays ignorant of routes.
            let onChangeFormat: () -> Void = { [weak self] in
                self?.bridge?.triggerWindowJSEvent(eventName: "phoebe:office-change-format")
            }
            let onListen: () -> Void = { [weak self] in
                self?.bridge?.triggerWindowJSEvent(eventName: "phoebe:office-listen")
            }
            // The bottom pill's Back/Next and the top bar's Display gear —
            // office-chrome only. Fired as window events for the same reason
            // as onChangeFormat/onListen above: the web layer owns what
            // "previous slide" / "next slide" / "open Display settings"
            // actually DO (an already-mounted OfficeViewer underneath), this
            // plugin just reports that the reader tapped one.
            let onOfficePrev: () -> Void = { [weak self] in
                self?.bridge?.triggerWindowJSEvent(eventName: "phoebe:office-prev-slide")
            }
            let onOfficeNext: () -> Void = { [weak self] in
                self?.bridge?.triggerWindowJSEvent(eventName: "phoebe:office-next-slide")
            }
            let onOfficeDisplaySettings: () -> Void = { [weak self] in
                self?.bridge?.triggerWindowJSEvent(eventName: "phoebe:office-display-settings")
            }
            // Article's "Reader" button — stays entirely native, no JS round
            // trip needed (unlike the events above, nothing on the web side
            // has to decide anything; it's just "show reader mode for this url").
            let onOpenReaderView: (URL) -> Void = { [weak self] readerUrl in
                self?.presentReaderView(url: readerUrl)
            }
            // Bible.com host detection. We only try the Universal Link
            // hop for URLs that YouVersion has actually registered —
            // sending a random outbound link through `.universalLinksOnly`
            // would just waste a round-trip before falling back.
            let host = (url.host ?? "").lowercased()
            let isBibleCom = host == "bible.com" || host == "www.bible.com"
            if isBibleCom {
                UIApplication.shared.open(
                    url,
                    options: [.universalLinksOnly: true]
                ) { [weak self] handled in
                    if handled { call.resolve(); return }
                    // No app installed for this domain → present the
                    // in-app browser, same as the non-Bible path.
                    BibleBrowser.shared.present(
                        url: url,
                        from: self?.bridge?.viewController,
                        savedHTML: savedHtml,
                        onJournal: onJournal,
                        onDismiss: onDismiss,
                        onChangeFormat: onChangeFormat,
                        onListen: onListen,
                        isArticle: isArticle,
                        backChrome: backChrome,
                        officeChrome: officeChrome,
                        officeTitle: officeTitle,
                        officeSlideLabel: officeSlideLabel,
                        officeSectionLabel: officeSectionLabel,
                        previousIssues: previousIssues,
                        snapshotVeilImage: snapshotVeilImage,
                        onOfficePrev: onOfficePrev,
                        onOfficeNext: onOfficeNext,
                        onOfficeDisplaySettings: onOfficeDisplaySettings,
                        onOpenReaderView: onOpenReaderView
                    )
                    call.resolve()
                }
                return
            }
            BibleBrowser.shared.present(
                url: url,
                from: self?.bridge?.viewController,
                savedHTML: savedHtml,
                onJournal: onJournal,
                onDismiss: onDismiss,
                onChangeFormat: onChangeFormat,
                onListen: onListen,
                isArticle: isArticle,
                backChrome: backChrome,
                officeChrome: officeChrome,
                officeTitle: officeTitle,
                officeSlideLabel: officeSlideLabel,
                officeSectionLabel: officeSectionLabel,
                previousIssues: previousIssues,
                snapshotVeilImage: snapshotVeilImage,
                onOfficePrev: onOfficePrev,
                onOfficeNext: onOfficeNext,
                onOfficeDisplaySettings: onOfficeDisplaySettings,
                onOpenReaderView: onOpenReaderView
            )
            call.resolve()
        }
    }
}
