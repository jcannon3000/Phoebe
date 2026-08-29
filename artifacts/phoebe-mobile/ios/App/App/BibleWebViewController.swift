// BibleWebViewController.swift
//
// Phoebe's in-app browser. It was first added for the "Read on
// Bible.com" lesson links (hence the Bible* names), but every external
// link in the app now flows through it via
// PhoebeNative.openInAppBrowser → BibleBrowser.present.
//
// Product goals it implements:
//   • Phoebe-branded top + bottom chrome (dark green), not Safari's, so
//     it reads as part of the app rather than a system browser sheet.
//   • Slides in from the right like advancing to the next slide, and
//     keeps target=_blank links INSIDE this view — never bounces the
//     user out to Safari unless they tap the explicit "open in Safari".
//   • Persists cookies + site storage across opens AND app launches (a
//     single shared persistent data store + process pool), so a site's
//     "accept cookies" choice sticks instead of re-prompting each visit.
//   • Dark appearance to match the app (also makes pages that support
//     prefers-color-scheme render dark).
//
// Presented from JS by BibleBrowserPlugin.open({ url }) →
// BibleBrowser.shared.present(url:from:).

import UIKit
import WebKit
// CTFontManagerRegisterFontsForURL — the reader's typeface is registered with
// the process rather than fetched; see readerFontsRegistered.
import CoreText

// Phoebe palette — mirrors the web app's dark-green theme so the chrome
// reads as the same product.
private enum PhoebeBrowserColor {
    // Owner: "make the top and bottom black or white depending on the
    // background of Venite." The chrome should disappear into the page — two
    // near-but-not-quite matching darks read as a rendering fault rather than
    // a frame. Resolved at runtime from the page's own background (see
    // syncChromeToPage); this is the starting value before the page paints.
    static var bar = UIColor.black
    /// The practice decks' ground — #0A1A10. In READER mode the page is
    /// transparent and we supply the background ourselves, so the chrome must
    /// come from here rather than from a page that no longer has one.
    static let deck = UIColor(red: 10/255, green: 26/255, blue: 16/255, alpha: 1)
    static let text = UIColor(red: 0.941, green: 0.929, blue: 0.902, alpha: 1)  // #F0EDE6
    static let tint = UIColor(red: 0.659, green: 0.773, blue: 0.627, alpha: 1)  // #A8C5A0
}

final class BibleWebViewController: UIViewController, WKNavigationDelegate {
    private let url: URL
    private var webView: WKWebView!
    // The leaf and its wash, painted behind a transparent web view — the page's
    // own CSP forbids loading them from inside it. See the setup in loadView.
    private var readerBackdrop: UIImageView?
    private var readerWash: UIView?
    private var readerWashLayer: CAGradientLayer?
    private let progressView = UIProgressView(progressViewStyle: .bar)
    private var progressObservation: NSKeyValueObservation?
    private var titleObservation: NSKeyValueObservation?

    // Bottom-bar web-history buttons; enabled/disabled as the user navigates.
    private var backButton: UIBarButtonItem!
    private var forwardButton: UIBarButtonItem!

    /**
     * Which way to paint the chrome BEFORE the page reports its own colour.
     *
     * Owner: "for the newsletters default to a white top bar." Newsletters are
     * cream articles and were opening behind black chrome for the beat before
     * syncChromeToPage could look at the body — a flash of the wrong frame on
     * every read. The caller knows which kind of page it is asking for, so it
     * says; the page's own background still has the last word.
     *
     * It settles the Options menu too. Owner: "these top-right options should
     * not be showing up in the newsletter" — Configure office / Change format /
     * Listen to the office are all about praying an office, and on a Richard
     * Rohr meditation they are three commands that either do nothing useful or
     * throw the reader into a liturgy they didn't ask for.
     */
    var isArticle = false

    /**
     * This reading was opened FROM an office slide (the "Read online" pill on
     * a lesson), and should feel like a continuation of the office rather than
     * a trip out of it.
     *
     * Owner: "what if the verse page operates as splash and it fades from that
     * into the web page... then it has a top bar with the same buttons the
     * office has, but in white, and a floating bottom bar with the same
     * buttons and progress, also in white... when you click forward next on
     * the bottom bar it goes to the next screen, which would be the canticle."
     *
     * Four things follow from this flag, each covered where it applies below:
     *   • the veil is a SNAPSHOT of the office slide already on screen, not
     *     the generic Splash leaf (see `snapshotVeilImage`)
     *   • the top bar shows the office's own control set (← Back / title /
     *     Display gear / close), not Done+Options or a bare Done
     *   • a floating bottom pill mirrors the office's own — Back · progress ·
     *     Next — and lives above the page for the whole read, not just while
     *     it loads
     *   • Back/Next on that pill dismiss the browser and step the OFFICE'S OWN
     *     slide index, via onOfficePrev/onOfficeNext — the office underneath
     *     is a real, already-mounted screen, not something we simulate here
     */
    var officeChrome = false
    /** The office's own title pill text — "Morning Prayer" — for the top bar. */
    var officeTitleText: String?
    /** "N of M" — mirrors the office's own bottom-pill progress label. */
    var officeSlideLabel: String?
    /** The office's own section label ("LESSON", "CANTICLE", …). */
    var officeSectionLabel: String?
    /** A screenshot of the office slide, taken just before this browser opened
     *  — the veil for `officeChrome`, in place of the Splash leaf. nil falls
     *  back to Splash, so a snapshot failure degrades rather than crashes. */
    var snapshotVeilImage: UIImage?
    var onOfficePrev: (() -> Void)?
    var onOfficeNext: (() -> Void)?
    /** The office's own Display-settings (⚙) sheet — text size, backdrop. */
    var onOfficeDisplaySettings: (() -> Void)?
    // The floating bottom pill itself, built only when officeChrome is set —
    // see buildOfficeNavPill().
    private var officeNavPill: UIView?
    private var officeNavLabel: UILabel?
    private var officeBackButton: UIButton?
    private var officeNextButton: UIButton?

    /**
     * A held veil over the page while it loads.
     *
     * Owner: "for newsletters, can you do a loading screen like an office
     * loading screen for like two seconds while you're loading the page in the
     * background — so we don't see the page flashing in, we just see it loaded
     * once the loading screen fades out."
     *
     * A remote article paints in stages — background, then unstyled text, then
     * the web font, then images reflowing what you were already reading. The
     * veil holds that offstage and reveals a settled page, the same way the
     * office holds its opening versicle rather than showing a spinner.
     *
     * Two bounds, both necessary. A FLOOR, so a cached page doesn't flash the
     * veil for 80ms (a flicker is worse than no veil at all), and a CEILING, so
     * a page that never finishes — a hung request, a redirect chain — can't
     * leave someone staring at a blank field. Whichever the page beats, it is
     * revealed on.
     */
    // Both top-bar items, held so applyChrome can tint them together. They must
    // be the same KIND and the same COLOUR — see where they are built.
    private var doneItem: UIBarButtonItem?
    private var optionsItem: UIBarButtonItem?
    // officeChrome's close-X — a second right-bar item alongside optionsItem
    // (which doubles as the Display gear there), so applyChrome can tint it too.
    private var closeXItem: UIBarButtonItem?

    private let loadingVeil = UIView()
    private lazy var veilImage = UIImageView(image: snapshotVeilImage ?? UIImage(named: "Splash"))
    // Owner: "there needs to be a circle loading animation above the splash
    // too", then: "I want the loading animation circle that is before the
    // office slideshow." So not a UIActivityIndicatorView — that is iOS's
    // pinwheel and looks nothing like it. The office's held-breath screen
    // draws its own ring, and this is that ring rebuilt in CoreAnimation:
    //
    //   22×22, a 2pt stroke, sage at 25% all the way round with the top
    //   quarter at 75%, spinning once a second, sitting 44pt above the safe
    //   area rather than centred.
    //
    // Those numbers are copied from the office's own spinner (see the
    // held-breath veil in bcp-daily-office.tsx) — if that one is ever
    // restyled, this is the second place to change.
    private let veilSpinner = OfficeSpinnerView()
    private var veilShownAt: CFTimeInterval = 0
    private var veilDismissed = false
    /**
     * The floor is ONLY an anti-flicker guard, not a duration.
     *
     * Owner: "it should fade out once the page is loaded." It always was
     * load-driven — didFinish calls hideVeil — but a 0.84s floor meant a page
     * that arrived in 200ms still sat behind the leaf for another 600, which
     * reads as a timer rather than as waiting for the page. Cut to the smallest
     * value that still stops a sub-blink flash on a cached page, so what you
     * see now tracks the load.
     */
    private let veilMinSeconds: CFTimeInterval = 0.3
    private let veilMaxSeconds: TimeInterval = 5.0

    // Retained strongly here because UIViewController.transitioningDelegate
    // is a WEAK reference — without an owner the slide animation is dropped.
    // The nav controller retains this VC (its root), this VC retains the
    // delegate, so it lives as long as the browser is on screen.
    let slideDelegate = SlideTransitionDelegate()

    // Invoked (after the browser dismisses) when the user taps the bottom-bar
    // Journal button. The plugin wires this to fire a `phoebe:open-journal`
    // event into the app so the web layer can navigate to the journal.
    // Retained for the plugin's call signature only — nothing invokes it now
    // that the Journal button is gone (the journal page was removed from the
    // app, and no web listener for phoebe:open-journal ever existed).
    var onJournal: (() -> Void)?
    // Options → "Change format" / "Listen to the office". Both dismiss first,
    // then let the app route: the office intro chooser owns the formats and the
    // podcast player owns the audio, and neither belongs in a web view.
    var onChangeFormat: (() -> Void)?
    var onListen: (() -> Void)?
    /** Article-only: "Reader" in the top-right — dismiss, then hand the
     *  CURRENT url to the plugin's own SFSafariViewController reader-mode
     *  presenter (see BibleBrowserPlugin.presentReaderView). */
    var onOpenReaderView: ((URL) -> Void)?
    /// Set when an Options action is dismissing us, so viewDidDisappear knows
    /// this is a hand-off rather than the reader finishing.
    private var handingOff = false

    // Invoked once this view controller has actually left the screen, no
    // matter HOW it got dismissed (Done button, swipe-to-dismiss, or any
    // future path) — the plugin wires this to fire `phoebe:browserfinished`,
    // exactly mirroring onJournal above. Before this existed, NOTHING fired
    // that event for this browser at all (only the separate SFSafariViewController
    // reader-view path did, via its delegate's safariViewControllerDidFinish),
    // so openExternalThenMarkRead's "wait for the user to actually close it"
    // branch just hung forever for every CAC/FDD/regular link — markRead()
    // never ran. viewDidDisappear is the single, path-agnostic hook for "this
    // screen is gone now"; guarded with `dismissFired` since it's technically
    // allowed to be called more than once by UIKit in edge cases and this
    // must fire exactly once.
    var onDismiss: (() -> Void)?
    private var dismissFired = false

    // The persistent store below is supposed to keep a site's "accept" choice,
    // but iOS tracking prevention clears the script/third-party storage these
    // sources (CAC, Bible.com, SSJE) park consent in, so the bar returns every
    // visit. This web view is OURS and the page is its top document, so we may
    // inject a stylesheet that hides the consent UI on every load — by known
    // CMP selector (Bible.com is TrustArc; OneTrust/CookieYes/Complianz/Cybot/
    // Osano/etc. are covered too) plus a constrained heuristic for the ones CAC
    // and SSJE inject at runtime — and release the scroll-lock some apply.
    private static let cookieHideJS = """
    (function () {
      var KNOWN = [
        '#onetrust-consent-sdk','#onetrust-banner-sdk',
        '.cky-consent-container','.cky-overlay',
        '#cookie-law-info-bar','#cookie-law-info-again',
        '.cc-window','.cc-banner',
        '#cookie-notice','.cookie-notice-container',
        '#cmplz-cookiebanner-container','.cmplz-cookiebanner',
        '#moove_gdpr_cookie_info_bar','.moove-gdpr-dom-on-top',
        '#hs-eu-cookie-confirmation',
        '[id^="sp_message_container"]',
        '#truste-consent-track','.truste_overlay','.truste_box_overlay','#consent_blackbar','.truste-banner',
        '.osano-cm-window','.osano-cm-dialog',
        '#usercentrics-root','.fc-consent-root',
        '#gdpr-cookie-message',
        '#CybotCookiebotDialog','#CybotCookiebotDialogBodyUnderlay',
        '#termly-code-snippet-support'
      ];
      var style = document.createElement('style');
      style.setAttribute('data-phoebe-cookie-hide','');
      style.textContent = KNOWN.join(',') + '{display:none !important;visibility:hidden !important;}'
                        + 'html,body{overflow:auto !important;}';
      (document.head || document.documentElement).appendChild(style);

      function unlock() {
        [document.documentElement, document.body].forEach(function (el) {
          if (el && el.style) { el.style.overflow = ''; el.style.position = ''; }
        });
      }
      function sweep() {
        var nodes = document.querySelectorAll('div,section,aside');
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          if (el.getAttribute('data-phoebe-swept')) continue;
          if (getComputedStyle(el).position !== 'fixed') continue;
          var txt = (el.textContent || '').toLowerCase();
          if (txt.length > 600 || !/cookie|consent|gdpr/.test(txt)) continue;
          if (!el.querySelector('button,a,[role="button"]')) continue;
          el.setAttribute('data-phoebe-swept','1');
          el.style.setProperty('display','none','important');
          unlock();
        }
      }
      var pending = false;
      function schedule() { if (pending) return; pending = true; setTimeout(function () { pending = false; try { sweep(); } catch (e) {} }, 200); }
      if (document.readyState !== 'loading') schedule();
      document.addEventListener('DOMContentLoaded', schedule);
      var obs = new MutationObserver(schedule);
      try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
      setTimeout(function () { obs.disconnect(); }, 30000);
    })();
    """

    /**
     * PHOEBE'S OWN READER VIEW — oremus only, for now.
     *
     * Owner: "let's try our own version, on a similar background with Space
     * Grotesk … we wanna get rid of those line breaks … but we wanna make sure
     * that this is still copyright legal and that we're indicating that this is
     * our reader view … we do want leaf backgrounds."
     *
     * WHAT THIS IS, LEGALLY, AND WHY THAT SHAPE WAS CHOSEN.
     * It restyles the page THE READER IS ALREADY ON, in place, in their own
     * browser. Nothing is copied, extracted, cached, re-hosted or sent
     * anywhere: the HTML is oremus's, served by oremus, to a WebView the
     * reader opened. That is a user-agent presentation choice — the same thing
     * Safari's own Reader does, and the same thing a stylesheet or a font size
     * setting does. It is NOT a reproduction, and it must never become one:
     * if you are ever tempted to scrape this text into our own page, stop —
     * the NRSV is licensed, not public domain, and that line is the whole
     * reason this is CSS and not a fetch.
     *
     * Two things follow, and both are load-bearing:
     *   1. The NRSV copyright notice (.copyright) is KEPT and styled to stay
     *      readable. It is never in the hide list. If oremus renames that
     *      block, this reader should show MORE, not less.
     *   2. The page says whose reading it is: a footer names the oremus Bible
     *      Browser as the source and this as Phoebe's reader view, with a link
     *      to the page as oremus renders it.
     *
     * The line breaks: oremus emits empty <p> blocks (a comment-only paragraph
     * per chapter/verse marker) and, in poetry, a <br> per half-line with
     * &nbsp; indents. Both read as stray gaps in a gospel. They are collapsed
     * here into ordinary prose paragraphs. Poetry is not the target — owner:
     * "we don't use the psalms so don't worry about that" — but neutralising
     * <br> costs nothing and keeps a canticle from looking broken.
     *
     * Injected at documentStart so the original never flashes, and gated on
     * hostname INSIDE the script because a WKUserScript can't be host-scoped
     * (and this config is shared with the background preloader).
     */
    private static let readerJS = """
    (function () {
      var h = (location.hostname || '').toLowerCase();
      var isOremus = (h === 'bible.oremus.org' || h.slice(-11) === '.oremus.org');
      /* THE VCS IS DELIBERATELY NOT HERE — owner: "we dont want
         reader on the visio divina … on the VCS comentary". Its exhibition
         layout puts the commentary beside the artwork it is about, and
         stripping that to text took away the thing the practice sends you
         there for. Same call as Grist, for the same reason. */
      /* SSJE's "Brother, Give Us A Word" — a daily word, a short reflection
         and the brother who wrote it, sitting inside a full WordPress page
         with a hero image, a subscribe form and a site footer. Owner: "a
         reader view for SSJE that just shows the word as a title and the
         reflection, and the monks name, but not the rest of the page." */
      var isSsje = (h === 'ssje.org' || h.slice(-9) === '.ssje.org');
      /* Henri Nouwen's daily meditation (Squarespace) and Forward Day by Day
         (an Ionic SPA). Owner asked for both "just like SSJE" — the date, the
         feast, the scripture, the reflection, Moving Forward and the diocese
         on FDD; the date, title and meditation on Nouwen. */
      var isNouwen = (h === 'henrinouwen.org' || h.slice(-16) === '.henrinouwen.org');
      var isFdd = (h === 'forwardmovement.org' || h.slice(-20) === '.forwardmovement.org');
      /* Sojourners' Verse and Voice — verse, voice and prayer of the day. */
      var isSojo = (h === 'sojo.net' || h.slice(-9) === '.sojo.net');
      /* GRIST IS DELIBERATELY NOT HERE. Owner: "Grist i dont want a reader
         just make sure its light mode and the header is light", and "take out
         the top grist the daily text too" — the masthead line goes with it.
         It is journalism, not a devotional page: its own design (the
         masthead, the lead photograph, the serif headline) IS the thing worth
         reading, and a green wash over it made it look like something it is
         not. It opens with the ordinary light newsletter chrome instead,
         which is what openExternal's `reader: true` -> lightChrome already
         asks for. */
      if (!isOremus && !isSsje && !isNouwen && !isFdd && !isSojo) return;

      /**
       * KEEP ONE BLOCK, HIDE ITS SIBLINGS — the technique three of these five
       * sites share, so it lives in one place with a selector each.
       *
       * All three are CMS pages (Beaver Builder, Squarespace, Ionic) whose
       * class names are generated per module and drift on the site's next
       * edit. Naming what to HIDE would rot; naming the single block worth
       * keeping does not, because that block is what the page is for.
       */
      /**
       * NOT Forward Day by Day. It is an Ionic SPA, and hiding siblings there
       * breaks it: ion-page / ion-router-outlet / ion-split-pane size
       * themselves through their own sibling structure, and the isolate
       * collapsed the entire app to zero height with half of it flipped to
       * visibility:hidden (measured). FDD is trimmed by stylesheet instead —
       * see the CSS arm. The failure modes decide it: a CSS selector that
       * misses leaves a strip of chrome on screen, while the isolate leaves a
       * blank page, and this is the one page here I cannot verify — its
       * `.ion-page-invisible` never clears in the automation pane, so it
       * measures 0x0 with the reader stylesheet REMOVED as well as applied.
       */
      var ISOLATE_TARGET = isSsje ? '.fl-post-feed-post'
                         : isNouwen ? '.blog-item-inner-wrapper'
                         : isSojo ? 'article.node-versevoice'
                         : null;

      var ASSETS = 'https://withphoebe.app/reader/';
      var css = [
        /**
         * THE FACE, EMBEDDED. Owner: "that still doesnt look like space
         * grotest to me on SSJE" — and it wasn't, on any host.
         *
         * Registering the .ttf with CTFontManager at .process scope makes the
         * family available to THIS process. WKWebView renders its content in a
         * SEPARATE process, so the web view never saw it: the registration
         * succeeded and changed nothing, which is why the text kept coming
         * back as system sans however the rules were written.
         *
         * So the font travels with the stylesheet, as a data: URI. No network
         * request, nothing for an offline device or a slow host to fail at,
         * and — the reason the earlier @font-face was removed — nothing for a
         * cross-origin policy to refuse, because there is no origin involved.
         *
         * MEASURED, not assumed: of the hosts the reader serves, ssje.org,
         * henrinouwen.org, sojo.net and forwardmovement.org send NO
         * Content-Security-Policy at all. Only oremus (default-src 'self') and
         * CAC (default-src 'none') do, and those two refuse a data: font as
         * firmly as a remote one — they keep the system fallback, which is
         * stated here so nobody spends another evening on it.
         */
        '@font-face{font-family:"Space Grotesk";font-style:normal;font-weight:300 700;',
        'font-display:swap;src:url(data:font/woff2;base64,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) format("woff2");}',
        'html{-webkit-text-size-adjust:100%;}',
        /* The leaf, held under a heavy wash so scripture stays legible — the
           same treatment the practice decks use. Fixed so it doesn't scroll. */
        /* THE LINE BREAKS, FINALLY: oremus's bible.css sets `body{width:600px}`
           and, inside `@media only screen and (max-device-width:480px)`,
           `body{width:300px}` — a fixed 2003-era phone measure. EVERYTHING
           inherits it, so every line wrapped at 300px with a wide empty
           gutter, however many max-widths were cleared on .bible/.bibletext
           (measured on the live page at a 375px viewport: body 300px; with
           width:auto, 359px). Clearing max-width was never going to touch a
           `width`, and the container was never the thing holding the measure.
           This is the override the reader always needed. */
        'body{width:auto!important;max-width:none!important;',
        /* TRANSPARENT, so the leaf can show through from BEHIND.
           The leaf is painted natively now (see readerBackdrop) rather than by
           this stylesheet. It has to be: the hosts we read serve
           `Content-Security-Policy: default-src 'self'`, which covers img-src,
           so a background-image from withphoebe.app — or from a data: URI —
           is refused before it is fetched. That is why the page kept coming
           back flat green however the wash was weighted. Painting it under a
           transparent web view puts it out of the page's reach entirely, the
           same move that fixed the font. */
        'margin:0!important;padding:0!important;background:transparent!important;',
        'color:#F0EDE6!important;font-family:"Space Grotesk",ui-sans-serif,system-ui,sans-serif!important;}',
      ].concat(isOremus ? [
        /* oremus's own furniture. .copyright is deliberately NOT here. */
        '#dcheck,#h1screen,#overDiv,.quicklink,hr.quicklink,.visbuttons,.another,.credits,.adj,form{display:none!important;}',
        /* The reading. */
        /* FULL WIDTH (owner: "get rid of the line breaks so it goes full
           width") — no measure cap, just the side gutters. */
        /* THE GUTTER IS SET ONCE, ON THE OUTER BOX.
           Owner: "there is a little too much room on the left side of the
           reader." Both selectors used to take `padding:0 20px`, and on oremus
           .bibletext is nested INSIDE .bible — so every passage read inside
           40px of gutter a side, not 20. The inner box carries none now and
           the outer one sets the measure. */
        '.bible{max-width:none;margin:0!important;padding:0 18px!important;background:transparent!important;}',
        '.bibletext{max-width:none;margin:0!important;padding:0!important;background:transparent!important;}',
        /* oremus's poetry indent — p.a1 is `margin-left:2em;text-indent:-1em`,
           a hanging indent built on a 2em gutter. Kept as a hanging indent
           (wrapped lines still tuck under the first) with the gutter closed
           up, so a psalm doesn't sit further right than the prose around it. */
        '.bibletext p.a1{margin-left:1em!important;text-indent:-1em!important;}',
        /* font-family is repeated HERE, not just on body: oremus sets Verdana
           on .bibletext itself, and an element's own rule beats an inherited
           one however important the ancestor's is. Caught in testing — the
           background and the tidy both landed while the type stayed Verdana. */
        '.bible,.bibletext,.bibletext *{font-family:"Space Grotesk",ui-sans-serif,system-ui,sans-serif!important;}',
        '.bibletext{font-size:19px!important;line-height:1.72!important;color:#F0EDE6!important;}',
        /* Belt and braces on the descendants — the real constraint is on
           BODY (see the width:auto there). */
        '.bible p,.bible blockquote,.bibletext p,.bibletext blockquote,.bible h2,.bible div{width:auto!important;max-width:none!important;}',
        '.bibletext p{margin:0 0 1.15em!important;}',
        'h2.passageref,.copyright,.phoebe-reader-note{font-family:"Space Grotesk",ui-sans-serif,system-ui,sans-serif!important;}',
        'h2.passageref{max-width:none;margin:0!important;padding:14px 0 6px!important;',
        'font-size:13px!important;letter-spacing:.16em;text-transform:uppercase;color:rgba(200,212,192,0.75)!important;font-weight:600!important;}',
        /* No horizontal padding of its own: these sit inside .bible, which
           owns the gutter, so 20px here stacked on top of it and set every
           section heading further right than the verses under it. */
        'h2.plus-S,h2.sectVis{max-width:none;margin:1.5em 0 0.5em!important;padding:0!important;',
        'font-size:15px!important;color:rgba(200,212,192,0.8)!important;font-weight:600!important;}',
        /* Verse numbers recede; they are wayfinding, not the text. */
        'sup.ww,sup.ii,span.cc,sup.vnumVis,span.vnumVis{color:rgba(143,175,150,0.72)!important;font-size:0.66em!important;font-weight:600!important;',
        'padding-right:2px;text-decoration:none!important;}',
        'span.cc{font-size:1.1em!important;}',
        'a,a:visited{color:#A8C5A0!important;}',
        'sup.fnote{color:rgba(143,175,150,0.5)!important;}',
        '.sc{font-variant:small-caps;}',
        /* KEPT, and legible: the NRSV notice. */
        '.copyright{max-width:none;margin:2em 0 0!important;padding:16px 20px!important;',
        'font-size:12px!important;line-height:1.6!important;color:rgba(200,212,192,0.62)!important;',
        'border-top:1px solid rgba(200,212,192,0.16);background:transparent!important;}',
      ] : isSsje ? [
        /* ---- SSJE, Brother Give Us A Word -------------------------------
           Measured on the live page, not guessed. Everything the owner asked
           to keep — the word, the reflection, the brother's name, and the
           link back to the full post — is inside ONE `.fl-post-feed-post`
           block. So the stylesheet doesn't enumerate what to hide (a Beaver
           Builder theme's classes are generated and would drift); the script
           keeps that block and hides its siblings all the way up. See
           isolate(). */
        /* NO solid ground here. The reader's backdrop — the leaf and its wash
           — is painted NATIVELY behind a transparent web view (see
           readerOwnsGround), so a page that fills its own body in green paints
           straight over it. What has to be cleared is the SITE's ground:
           SSJE's theme puts white on a wrapper, and clearing only the body
           left cream text on a white slab. So: wrappers transparent, body
           left to the shared head, and the leaf shows through. */
        'html,body{background:transparent!important;margin:0!important;padding:0!important;',
        'padding-top:calc(env(safe-area-inset-top) + 8px)!important;color:#F0EDE6!important;}',
        '.fl-page,.fl-page-content,.fl-row,.fl-row-content-wrap,.fl-row-content,',
        '.fl-col-group,.fl-col,.fl-col-content,.fl-module,.fl-module-content,',
        '.fl-post-feed,.fl-post-feed-post{background:transparent!important;border:none!important;',
        'box-shadow:none!important;margin:0!important;padding-left:0!important;padding-right:0!important;',
        'max-width:none!important;width:auto!important;}',
        '.fl-post-feed-post,.fl-post-feed-post *{background-color:transparent!important;}',
        /* THE GREY SLAB. Beaver Builder draws a row's background overlay as a
           PSEUDO-ELEMENT — `.fl-row-content-wrap:after`, position:absolute,
           inset 0, background rgba(255,255,255,0.7) — for any row with
           `fl-row-bg-overlay`. SSJE's word sits in one. Measured on the live
           page: 375x341px of 70% white lying over the reader's ground, which
           is exactly the grey block the owner kept seeing behind the word.
           Nothing else could have cleared it: a pseudo-element is out of reach
           of the isolate's inline styles, and the arm's background rules name
           the element, not its ::after. */
        '.fl-row-content-wrap:after,.fl-row-content-wrap:before{',
        'background:none!important;content:none!important;display:none!important;}',
        /* The word, as the title it is. */
        'h2.fl-post-feed-title{font-family:"Space Grotesk",ui-sans-serif,system-ui,sans-serif!important;',
        'font-size:30px!important;line-height:1.15!important;font-weight:700!important;',
        /* Down off the masthead, and in the same 20px gutter as the text
           (owner: "bring the title down and with left padding"). */
        'margin:18px 0 16px!important;padding:0 20px!important;color:#F0EDE6!important;}',
        'h2.fl-post-feed-title a{color:#F0EDE6!important;text-decoration:none!important;}',
        /* The reflection. */
        '.fl-post-feed-content{padding:0 20px!important;}',
        '.fl-post-feed-content,.fl-post-feed-content *{font-family:"Space Grotesk",ui-sans-serif,system-ui,sans-serif!important;}',
        '.fl-post-feed-content p{font-size:18px!important;line-height:1.72!important;',
        'color:#F0EDE6!important;margin:0 0 1.15em!important;}',
        /* The brother who wrote it, and the way back to the full post — the
           last paragraph of the block, set quieter and to the right, the way
           the page itself sets them. */
        '.fl-post-feed-content p:last-of-type{text-align:right!important;font-size:14px!important;',
        'line-height:1.6!important;color:rgba(200,212,192,0.72)!important;}',
        'a,a:visited{color:#A8C5A0!important;}',
      ] : [
        /* ---- Henri Nouwen · Forward Day by Day ---------------------------
           Both are isolated to one block (see ISOLATE_TARGET), so there is
           almost nothing to hide here — only the ground to lay and the type
           to set. Measured on both live pages.

           NOUWEN keeps the date (h1), the title (h3) and the meditation.
           FDD keeps, in the page's own order, the date and feast (h1), the
           scripture, the reflection ending in MOVING FORWARD, and the diocese
           — the owner's list exactly, "and then just leave everything else
           off". The day's office citations trail after the diocese and are
           dropped by the script. */
        /* Transparent, not green — the leaf is painted natively behind the web
           view and a solid body hides it. See the SSJE arm for the full note. */
        'html,body{background:transparent!important;margin:0!important;padding:0!important;',
        'padding-top:calc(env(safe-area-inset-top) + 8px)!important;color:#F0EDE6!important;}',
        /* Squarespace and Ionic both paint their own grounds several layers
           deep; the isolate clears the surviving spine, this clears the rest. */
        '.blog-item-inner-wrapper *,article.fdd *,article.node-versevoice *{background-color:transparent!important;}',
        '.blog-item-inner-wrapper,article.fdd,article.node-versevoice{background:transparent!important;',
        'max-width:none!important;width:auto!important;margin:0!important;padding:0 20px!important;}',
        /* SOJOURNERS keeps a newsletter signup INSIDE the block worth keeping,
           so the isolate can't reach it — measured: the kept article opens
           with a first-name field, an e-mail field and a fifty-state dropdown
           before a word of the verse. It goes here instead. */
        /* FDD has no isolate (see ISOLATE_TARGET), so its chrome is named
           here. Ionic's own furniture, and nothing that carries the day. */
        'ion-menu,ion-header,ion-footer,ion-toolbar,ion-tab-bar,ion-buttons,',
        'ion-title,ion-searchbar,ion-fab{display:none!important;}',
        'ion-content{--background:#0A1A10!important;}',
        /* JUSTIFIED, which is what tore the text into rivers on a phone —
           measured on the live page: `article.fdd` and its paragraphs both
           compute text-align:justify. At this measure justification opens
           word gaps wide enough to read as a layout fault, which is what the
           owner's screenshot showed. */
        'article.fdd,article.fdd *{text-align:left!important;}',
        /* Ionic sizes through its own custom elements, none of which a plain
           width rule reaches — so name them. The 20px gutter below is then
           the ONLY inset, rather than stacking on ion-content's 16px. */
        'ion-content{--padding-start:0!important;--padding-end:0!important;}',
        /* DISPLAY, not just width — this is what the narrow column was.
           Ionic's custom elements (ion-app, app-root, ion-split-pane …) have
           no default styling of their own, so with Ionic's stylesheet absent
           they compute as display:inline. An inline box SHRINK-WRAPS whatever
           its width says, so `width:auto` on them did nothing at all and the
           article kept collapsing to about 45% of the screen with a wide empty
           gutter — the owner's first screenshot. Measured on the live page:
           ION-APP, ION-SPLIT-PANE, APP-MENU and APP-ROOT all compute inline.
           The outermost of them were also missing from this list, so even a
           correct rule would not have reached the ones that mattered. */
        'ion-app,app-root,app-menu,ion-split-pane,.split-pane-main,.ion-page,.ion-padding,',
        'ion-content,ion-router-outlet,app-fdd,app-ldf-wrapper,',
        'main,.pray-container,article.fdd,article.fdd > *{display:block!important;',
        'width:auto!important;',
        'max-width:none!important;min-width:0!important;float:none!important;',
        'columns:auto!important;column-count:auto!important;}',
        /* Ionic hides a page until it routes; in a plain web view that class
           can sit there forever, leaving the reader blank. */
        '.ion-page-invisible{opacity:1!important;visibility:visible!important;}',
        /* AND UNDO IONIC'S SIZING MODEL, which is the rest of the narrow
           column. `.ion-page` is `position:absolute` with `contain:layout size
           style`; `contain:size` means the box is sized WITHOUT reference to
           its contents, and ion-split-pane reserves a side column when it
           believes the viewport is wide. Together they left the article laid
           out in a fraction of the screen with the reader's own green showing
           through beside it — which reads as a broken column rather than as a
           menu. None of this is reachable by width rules alone, which is why
           the previous two attempts moved nothing. */
        'ion-app,ion-split-pane,.split-pane-main,.ion-page,ion-router-outlet,ion-content{',
        'position:static!important;contain:none!important;inset:auto!important;',
        'width:100%!important;max-width:100%!important;height:auto!important;',
        'min-height:0!important;transform:none!important;}',
        'html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important;}',
        'article.fdd{padding:0 20px!important;}',
        'article.fdd p,article.fdd li{font-size:18px!important;line-height:1.72!important;',
        'color:#F0EDE6!important;margin:0 0 1.15em!important;}',
        /* The feast is a LINK inside the date heading; underlined and green it
           read as something to tap rather than as the day's title. */
        /* The feast onto its own line (owner: "make sure the date and the
           feast are two different lines"). Forward Movement puts the feast in
           an ANCHOR inside the date's h1, so inline it ran straight on from
           "SATURDAY, AUGUST 29" with only a wide space between them. */
        'article.fdd h1 a{color:inherit!important;text-decoration:none!important;',
        'display:block!important;margin-top:2px!important;}',
        'form,select,input,textarea,button[type="submit"],',
        '[class*="signup"],[class*="newsletter"],[class*="mailchimp"]{display:none!important;}',
        /* SOJOURNERS, stripped to what the owner asked for: "all we want is the
           three headers — verse of the day, voice of the day and prayer of the
           day — just as header text, get rid of the lines, and the body
           content text in Space Grotesk. White on green."
           So: no hero image, no icons, no rules, no borders. */
        'article.node-versevoice img,article.node-versevoice svg,',
        'article.node-versevoice picture,article.node-versevoice figure,',
        'article.node-versevoice hr,article.node-versevoice .field-name-field-image,',
        'article.node-versevoice [class*="icon"],article.node-versevoice [class*="social"],',
        'article.node-versevoice [class*="share"]{display:none!important;}',
        /* The lines: Drupal draws these as borders on the section wrappers. */
        'article.node-versevoice *{border:0!important;box-shadow:none!important;}',
        /* Verse / Voice / Prayer of the day — the three headings, as header
           text and nothing else. */
        'article.node-versevoice h2{font-size:13px!important;letter-spacing:.16em;',
        'text-transform:uppercase;font-weight:600!important;margin:1.9em 0 .6em!important;',
        'color:rgba(143,175,150,0.95)!important;}',
        /* White on green, every element, in the reader's face — a Drupal page
           colours its own text and would otherwise keep its greys. */
        'article.node-versevoice,article.node-versevoice *{',
        'font-family:"Space Grotesk",ui-sans-serif,system-ui,sans-serif!important;',
        'color:#F0EDE6!important;}',
        'article.node-versevoice h2{color:rgba(143,175,150,0.95)!important;}',
        'article.node-versevoice a,article.node-versevoice a *{color:#A8C5A0!important;}',
        'h1,h2,h3,h4,p,li,article,div{font-family:"Space Grotesk",ui-sans-serif,system-ui,sans-serif!important;}',
        /* The date, and on FDD the feast under it. */
        /* SCOPED. This is the DATE treatment — small, uppercase, letterspaced
           — and it belongs to Nouwen and FDD, whose h1 IS the date. It is
           SCOPED rather than bare because this arm is shared, and a bare h1
           rule here once set Grist's article headline in the small
           letterspaced date style. Grist has since left the reader entirely,
           but the scoping stays: the next site to join this arm will have an
           h1 of its own, and the lesson (the shipped stylesheet had drifted
           from the one I had hand-tested) is the reason to keep it. */
        '.blog-item-inner-wrapper h1,article.fdd h1{font-size:15px!important;',
        'letter-spacing:.14em;text-transform:uppercase;',
        'line-height:1.45!important;font-weight:600!important;margin:0 0 18px!important;',
        'color:rgba(200,212,192,0.75)!important;}',
        /* Nouwen's meditation title. */
        'h3{font-size:27px!important;line-height:1.18!important;font-weight:700!important;',
        'margin:6px 0 16px!important;color:#F0EDE6!important;}',
        'p,li{font-size:18px!important;line-height:1.72!important;color:#F0EDE6!important;',
        'margin:0 0 1.15em!important;}',
        /* FDD's scripture sits above the reflection — set apart, the way the
           office sets a lesson's reference. */
        'article.fdd > p:first-of-type{font-style:italic!important;',
        'color:rgba(240,237,230,0.88)!important;}',
        /* MOVING FORWARD and PRAY FOR read as small caps in the source. */
        'article.fdd > p:last-of-type{font-size:14px!important;',
        'color:rgba(200,212,192,0.72)!important;}',
        'a,a:visited{color:#A8C5A0!important;}',
        /* SCOPED, for the same reason. Nouwen illustrates its meditations with
           stock photography that adds nothing to a reading; Grist's lead photo
           is part of the story and Sojourners' images are its own. An
           unscoped `img{display:none}` blanked all three. */
        '.blog-item-inner-wrapper img,.blog-item-inner-wrapper figure,',
        '.blog-item-inner-wrapper .sqs-block-image{display:none!important;}',
      ]).concat([
        '.phoebe-reader-note{max-width:none;margin:0!important;padding:10px 20px 40px!important;',
        'font-size:12px!important;line-height:1.6!important;color:rgba(200,212,192,0.45)!important;}',
        '.phoebe-reader-note a{color:rgba(168,197,160,0.75)!important;text-decoration:underline;}',
        /* The site's name at the very top (owner: "keep the oremus title at
           the top and such so we know it's the webpage"). */
        '.phoebe-reader-masthead{padding:18px 20px 2px!important;font-family:"Space Grotesk",ui-sans-serif,system-ui,sans-serif!important;',
        'font-size:11px!important;letter-spacing:.18em;text-transform:uppercase;color:rgba(143,175,150,0.6)!important;}',
      ]).join('');

      function addStyle() {
        if (document.getElementById('phoebe-reader')) return;
        var st = document.createElement('style');
        st.id = 'phoebe-reader';
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
      }
      addStyle();
      document.addEventListener('DOMContentLoaded', addStyle);

      /** Collapse the stray gaps: comment-only <p>, <br> half-lines, nbsp indents. */
      /**
       * REVERSIBLE NOW. This used to DESTROY: it removed the empty paragraphs,
       * replaced every <br> with a text node, and rewrote the nbsp indents in
       * place. All three are one-way, so Standard showed oremus's page with
       * its poetry line breaks and indents permanently gone — not the page as
       * oremus renders it, which is what Standard is for (owner: "the standard
       * option for all readers need to show the actual page un edited").
       *
       * Same result on screen, achieved without losing anything: an empty
       * paragraph and a <br> both stop taking up space when they are display:
       * none, and hideForReader already records and restores exactly that. The
       * nbsp runs are recorded before being rewritten.
       */
      var nbspByReader = [];
      function tidy() {
        var bt = document.querySelector('.bibletext');
        if (!bt || bt.getAttribute('data-phoebe-tidied')) return;
        var ps = bt.querySelectorAll('p');
        for (var i = 0; i < ps.length; i++) {
          if (ps[i].textContent.replace(/\\u00a0|\\s/g, '') === '' && !ps[i].querySelector('img')) {
            hideForReader(ps[i]);
          }
        }
        var brs = bt.querySelectorAll('br');
        for (var j = 0; j < brs.length; j++) hideForReader(brs[j]);
        // The poetry indents, now that the breaks they followed are gone.
        var walker = document.createTreeWalker(bt, NodeFilter.SHOW_TEXT, null);
        var n;
        while ((n = walker.nextNode())) {
          if (n.nodeValue.indexOf('\\u00a0') !== -1) {
            nbspByReader.push({ node: n, was: n.nodeValue });
            n.nodeValue = n.nodeValue.replace(/\\u00a0+/g, ' ');
          }
        }
        bt.setAttribute('data-phoebe-tidied', '1');
      }
      function setNbspForReader(on) {
        for (var i = 0; i < nbspByReader.length; i++) {
          var rec = nbspByReader[i];
          rec.node.nodeValue = on ? rec.was.replace(/\\u00a0+/g, ' ') : rec.was;
        }
      }

      /** Whose reading this is — named, not implied. */
      function credit() {
        if (document.querySelector('.phoebe-reader-note')) return;
        var cp = document.querySelector('.copyright');
        if (!cp) return;
        var note = document.createElement('div');
        note.className = 'phoebe-reader-note';
        var a = '<a href="' + location.href + '">the oremus Bible Browser</a>';
        note.innerHTML = 'Shown in Phoebe\\u2019s reader view. The text is served by ' + a +
          ', which renders the NRSV under the licence above; Phoebe only changes how it looks on this screen.';
        cp.parentNode.insertBefore(note, cp.nextSibling);
      }

      /** The site named at the top of the page — it stays in BOTH views. */
      function masthead() {
        /* NO MASTHEAD. Owner: "the header doesnt need a title." The reader
           already announces itself by looking like Phoebe, and the page's own
           title follows immediately underneath — a strapline above it just
           spent the first line of every reading saying where you already knew
           you were. Kept as a no-op rather than deleted so the toggle, which
           shows and hides `.phoebe-reader-masthead`, has nothing to chase. */
        if (true) return;
        if (document.querySelector('.phoebe-reader-masthead') || !document.body) return;
        var m = document.createElement('div');
        m.className = 'phoebe-reader-masthead';
        m.textContent = isOremus ? 'the oremus Bible Browser'
                       : isSsje   ? 'Brother, Give Us A Word \\u00b7 SSJE'
                       // The owner's names for these two, not the
                       // publishers' — Sojourners' own masthead reads "Verse
                       // and Voice", and the owner asked for "Voice and
                       // Verse". His wording wins on a label his readers see.
                       : isNouwen ? 'Daily Henri Nouwen Quotes'
                       : isSojo   ? 'Voice and Verse \\u00b7 Sojourners'
                                  : 'Forward Day by Day';
        document.body.insertBefore(m, document.body.firstChild);
      }

      /**
       * The top-left "Standard" toggle (native bar) calls this: false shows
       * the page as oremus styles it, true brings the reader view back. Only
       * the STYLESHEET toggles — the empty-paragraph tidy is a DOM edit and
       * stays either way, which standard view survives fine (the removed
       * blocks were empty).
       */
      window.__phoebeReaderSet = function (on) {
        readerOn = !!on;
        var st = document.getElementById('phoebe-reader');
        if (st) st.media = on ? '' : 'not all';
        // The DOM edits, too — see hiddenByReader. Without this, Standard was
        // a stripped page with the styling switched off.
        setHiddenForReader(on);
        setClearedForReader(on);
        setNbspForReader(on);
        /**
         * EVERYTHING PHOEBE PUT ON THE PAGE COMES OFF. The masthead and the
         * credit note are ours, not the publisher's, and Standard means the
         * page as they render it — not their page with our furniture on it.
         */
        var mine = document.querySelectorAll('.phoebe-reader-masthead, .phoebe-reader-note');
        for (var i = 0; i < mine.length; i++) mine[i].style.display = on ? '' : 'none';
      };

      /**
       * Keep the one block that is what the page is FOR, hide everything else.
       *
       * Shared by SSJE, Nouwen and Forward Day by Day (ISOLATE_TARGET picks
       * the selector). Everything else on those pages — hero images, site
       * nav, straplines, subscribe forms, share buttons, next/previous, the
       * footer — is a sibling of that block at some level above it. So rather
       * than name what to HIDE in CSS, walk up from the block hiding every
       * sibling on the way; what survives is exactly the ancestors of the
       * thing we keep. Their class names are CMS-generated per module
       * (`fl-node-595680d9ad6fc`, `yui_3_17_2_1_…`) and would drift on the
       * next edit; the block itself won't.
       *
       * The backgrounds have to be cleared on that surviving spine too: SSJE
       * paints white on a wrapper, and clearing only the body left cream text
       * on a white slab (measured).
       */
      /**
       * Everything the reader has hidden, so STANDARD can put it back.
       *
       * The stylesheet toggles by itself (media="not all"), but the isolate
       * hides real content with INLINE styles, and inline styles do not care
       * what the stylesheet is doing. Standard therefore showed a page that
       * was still stripped AND no longer styled — white, system-font, most of
       * it missing. Which is the worst of both, and not what "Standard" means.
       */
      /**
       * IS THE READER ON. The settle interval re-runs the whole pass for
       * seconds after load (isolate, tidy, the trims), and every one of those
       * passes edits the DOM. Tap Standard inside that window and the next
       * tick simply re-hid everything — the page came back stripped, with the
       * button reading "Reader". Every re-entrant edit checks this now.
       */
      var readerOn = true;
      var hiddenByReader = [];
      /**
       * The OTHER inline edits — the site's own backgrounds, cleared up the
       * ancestor spine so the reader's ground shows through. These are not
       * hides, so setHiddenForReader never touched them, and they survived
       * into Standard: the publisher's page with its panels and shadows
       * stripped out. Owner: "the standard option for all readers need to
       * show the actual page un edited." Recorded, and put back.
       */
      var clearedByReader = [];
      function clearForReader(el) {
        if (!readerOn) return;
        if (!el || el.getAttribute('data-phoebe-cleared')) return;
        el.setAttribute('data-phoebe-cleared', '1');
        clearedByReader.push({
          el: el,
          bg: el.style.background || '',
          shadow: el.style.boxShadow || '',
        });
        el.style.setProperty('background', 'transparent', 'important');
        el.style.setProperty('box-shadow', 'none', 'important');
      }
      function setClearedForReader(on) {
        for (var i = 0; i < clearedByReader.length; i++) {
          var rec = clearedByReader[i];
          if (on) {
            rec.el.style.setProperty('background', 'transparent', 'important');
            rec.el.style.setProperty('box-shadow', 'none', 'important');
          } else {
            rec.el.style.background = rec.bg;
            rec.el.style.boxShadow = rec.shadow;
          }
        }
      }
      function hideForReader(el) {
        if (!readerOn) return;
        if (!el || el.getAttribute('data-phoebe-hid')) return;
        el.setAttribute('data-phoebe-hid', el.style.display || '');
        el.style.setProperty('display', 'none', 'important');
        hiddenByReader.push(el);
      }
      function setHiddenForReader(on) {
        for (var i = 0; i < hiddenByReader.length; i++) {
          var el = hiddenByReader[i];
          if (on) el.style.setProperty('display', 'none', 'important');
          else el.style.setProperty('display', el.getAttribute('data-phoebe-hid') || '');
        }
      }

      function isolate() {
        if (!ISOLATE_TARGET) return;
        var post = document.querySelector(ISOLATE_TARGET);
        if (!post) return;
        /**
         * NOT ONE-SHOT. This used to mark the post `data-phoebe-isolated` on
         * its first successful walk and bail on every later call — which meant
         * any sibling that arrived AFTER that first pass was never hidden.
         * SSJE streams the rest of its page in behind the post feed, so
         * "About Brother, Give Us A Word" appeared or didn't depending on
         * which side of the first run it landed — it survived one build and
         * vanished in the next with no code change between them. That is the
         * worst kind of bug to chase and the easiest to prevent: the walk is
         * idempotent (hideForReader no-ops on an element it has already
         * hidden), so it simply runs again on each pass of the interval.
         */
        var node = post;
        while (node && node !== document.documentElement) {
          clearForReader(node);
          var parent = node.parentElement;
          if (parent && parent !== document.documentElement) {
            var kids = parent.children;
            for (var i = 0; i < kids.length; i++) {
              if (kids[i] !== node) hideForReader(kids[i]);
            }
          }
          node = parent;
        }
      }

      /**
       * Forward Day by Day, trimmed WITHOUT an isolate.
       *
       * Owner's list: "the date, the feast if there is one, the scripture,
       * the reflection, the moving forward, and the pray for the diocese of
       * blank, and then just leave everything else off." All of those are
       * children of `article.fdd`, in that order, so the only DOM edits here
       * are inside that article plus one sibling section — nothing that
       * Ionic's layout depends on.
       *
       * A paragraph of the day's office citations ("Ps 20, 21:1-7 … | Job 9:1
       * … | Acts 11:1-18") trails after the diocese line. Anchored on the
       * PRAY line rather than on position, because a day without a feast
       * shifts everything up by one.
       */
      function fddTrim() {
        var post = document.querySelector('article.fdd');
        if (!post || post.getAttribute('data-phoebe-trimmed')) return;
        var kids = post.children;
        var seenPray = false;
        for (var k = 0; k < kids.length; k++) {
          if (seenPray) kids[k].style.setProperty('display', 'none', 'important');
          else if (/^\\s*PRAY\\b/i.test(kids[k].textContent || '')) seenPray = true;
        }
        // "More from Forward Movement" — a promo block after the day's entry.
        var heads = document.querySelectorAll('h1, h2');
        for (var i = 0; i < heads.length; i++) {
          if (/More from Forward Movement/i.test(heads[i].textContent || '')) {
            var box = heads[i].closest ? (heads[i].closest('section, ion-card, article, div')) : null;
            if (box && box !== post) hideForReader(box);
          }
        }
        post.setAttribute('data-phoebe-trimmed', '1');
      }

      function run() {
        addStyle();
        // Re-applying the stylesheet must not re-enable it — addStyle only
        // creates the node once, but a late re-render can, and the media
        // attribute is what Standard turns off.
        if (!readerOn) {
          var st0 = document.getElementById('phoebe-reader');
          if (st0) st0.media = 'not all';
          return;
        }
        if (isOremus) { tidy(); credit(); }
        else { isolate(); if (isFdd) fddTrim(); }
        masthead();
      }
      if (document.readyState !== 'loading') run();
      document.addEventListener('DOMContentLoaded', run);
      // oremus paints in one pass, but a late stylesheet or a re-render
      // shouldn't undo the tidy — cheap re-checks, then stop. VCS lazy-loads
      // its images and viewers, so it needs the longer tail: the zoom viewer
      // it hides is built after first paint.
      var tries = 0;
      var limit = isOremus ? 6 : 20;
      var iv = setInterval(function () { run(); if (++tries > limit) clearInterval(iv); }, 350);
      // Landing the page on the right commentary is the NATIVE side's job
      // (scrollToDeepLinkedWork) — it already owns the retry ladder and the
      // "never move a page the reader has taken hold of" guard. Two scrollers
      // would fight each other.
      window.addEventListener('load', function () {
        setTimeout(function () { isolate(); if (isFdd) fddTrim(); }, 400);
      });
    })();
    """

    private static let readerScript = WKUserScript(
        source: readerJS,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
    )

    private static let cookieHideScript = WKUserScript(
        source: cookieHideJS,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
    )

    // When present() hands us a web view that was already loading in the
    // background (preloaded from the home screen), we adopt it instead of
    // creating + loading a fresh one — so the page is on screen instantly.
    /** One top-left button reading "Back" instead of "Done" — see the JS side's
     *  OpenOpts.back. Only consulted on the article (lightChrome) path, which
     *  is already "one button and nothing else". */
    var backChrome = false

    /** Set the moment the reader pans the page — see scrollToDeepLinkedWork.
     *  Sticky, deliberately: checking `isDragging` only at the instant a retry
     *  fires misses somebody who scrolled and came to rest between two of
     *  them, and being yanked back to the top mid-read is the very complaint
     *  that scroll exists to answer. */
    private var readerMovedPage = false
    /** The "couldn't load" panel, when the initial navigation failed. */
    private var loadFailureView: UIView?
    @objc private func noteReaderMovedPage() { readerMovedPage = true }

    private let preloadedWebView: WKWebView?

    init(url: URL, preloadedWebView: WKWebView? = nil) {
        self.url = url
        self.preloadedWebView = preloadedWebView
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    // Factory used by BOTH the live VC and the preloader, so a preloaded web
    // view is configured identically (shared cookie jar, consent-banner hiding,
    // dark chrome) to one created on demand.
    static func makeConfiguration() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.websiteDataStore = WKWebsiteDataStore.default()   // persistent
        let content = WKUserContentController()
        content.addUserScript(cookieHideScript)
        // Phoebe's reader view — self-gates on the oremus hostname (see readerJS).
        // Register before the first reader paint — see readerFontsRegistered.
        _ = Self.readerFontsRegistered
        content.addUserScript(readerScript)
        config.userContentController = content
        return config
    }

    // Owner: "we want all forward pages to open in light mode" — any URL on
    // Forward Movement's site (forwardmovement.org, prayer.forwardmovement.org,
    // etc.), regardless of which feature opened it. Host-based rather than a
    // per-call-site flag so a NEW forwardmovement.org link (e.g. a future
    // reading page) gets this automatically without another wiring change.
    static func forcesLightMode(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "forwardmovement.org" || host.hasSuffix(".forwardmovement.org")
    }

    static func makeWebView() -> WKWebView {
        let wv = WKWebView(frame: .zero, configuration: makeConfiguration())
        wv.translatesAutoresizingMaskIntoConstraints = false
        // Off so the left screen edge is free for our swipe-to-dismiss; web
        // history is reachable via the bottom toolbar's back button instead.
        wv.allowsBackForwardNavigationGestures = false
        wv.backgroundColor = PhoebeBrowserColor.bar
        wv.isOpaque = false
        // No pageZoom (owner, after seeing it): venite.app already sizes its
        // own liturgy, and scaling the whole page pushed the Long/Short and
        // Rite II/EOW pickers toward the edges without making the prose easier
        // to read. Left at 1.0 so the site's own typography stands.
        return wv
    }

    deinit {
        progressObservation?.invalidate()
        titleObservation?.invalidate()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // No isBeingDismissed check — this VC is the ROOT of a navigation
        // controller that's what's actually presented (see the class header),
        // and isBeingDismissed reads false on a child even while the nav
        // controller containing it genuinely is being dismissed. viewDidDisappear
        // still fires correctly on children when their container is dismissed,
        // so it alone — guarded to fire once — is the reliable signal here.
        guard !dismissFired else { return }
        dismissFired = true
        // Leaving VIA an Options action is not finishing the office. UIKit runs
        // viewDidDisappear BEFORE a dismiss completion, so "Change format" and
        // "Listen to the office" fired browserfinished first — and the web
        // side's return handler credited the office and navigated home, for an
        // office the person had just said they wanted to pray a different way.
        if handingOff { return }
        onDismiss?()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // Dark chrome to match the app. Forcing .dark also makes the web
        // content report prefers-color-scheme: dark, so dark-capable sites
        // render dark too.
        overrideUserInterfaceStyle = .dark
        view.backgroundColor = PhoebeBrowserColor.bar

        // Page <title> reads as content (set below via KVO); host is the
        // first-paint fallback so the bar is never blank.
        title = url.host ?? "Reading"

        // ── Top bar: back-to-app (left) + open-in-Safari (right). ──
        // A labelled "‹ Back" so it clearly reads as returning to Phoebe,
        // distinct from the web-history back chevron in the bottom toolbar.
        // Named appBackButton (not backButton) — `backButton` is already the
        // bottom-bar web-history item; reusing the name shadows it.
        // Owner: "can we change the ✕ to a Done pill." A bare glyph reads as
        // "discard"; leaving an office you have just prayed is a completion,
        // and the word says so. A filled pill also gives it a real tap target
        // at the top of a long scrolling page.
        //
        // A PLAIN bar button item, deliberately — not a UIButton in a
        // customView. Owner: "fix the Done button, don't need the borders, no
        // green shading", then "should be as wide as Options".
        //
        // Both were symptoms of the same thing. iOS draws bar buttons as filled
        // capsules, and it sizes and insets them itself; a customView opts out
        // of all of that, so Done was carrying a hand-rolled border and tint
        // that fought the system capsule, sized by its own content insets, and
        // pushed hard against the screen edge while Options — a real bar item —
        // sat properly inset. Matching the KIND of control is what makes the two
        // match; setting a width would only have matched them at one font size.
        //
        // .plain, NOT .done. Owner: "why is the Done button blue?" A .done item
        // is the PROMINENT variant: iOS fills it with the system accent and it
        // ignores the navigation bar's tintColor entirely. Options is a plain
        // item, so while their styles differed the two could not have matched
        // whatever colour was set. Both are plain now, and applyChrome tints
        // each of them explicitly.
        // Owner: "take the settings and the X button out of the top right
        // and move the Next button in the top left to the top right." No
        // left item at all for officeChrome now — leaving is the edge-swipe
        // dismiss (still wired below) or the bottom pill's own Back/Next.
        if officeChrome {
            navigationItem.leftBarButtonItem = nil
        } else {
            // "Done" finishes a reading; "Back" leaves a page you stepped
            // sideways into. Visio Divina's closing card offers the commentary
            // that way — calling that "Done" would claim a completion the tap
            // never was.
            let leftTitle = backChrome ? "Back" : "Done"
            let doneItem = UIBarButtonItem(title: leftTitle, style: .plain, target: self, action: #selector(close))
            doneItem.accessibilityLabel = leftTitle
            self.doneItem = doneItem
            navigationItem.leftBarButtonItem = doneItem
        }

        // Owner: "at the top right could it be Options, and that brings down a
        // dropdown — kind of similar to the settings of the office slideshow."
        //
        // Praying the office on venite.app used to be a one-way trip: the only
        // controls were Safari and back. These are the three things someone
        // actually reaches for mid-office, and each hands off to the surface
        // that owns it rather than trying to reproduce it in here.
        let optionsItem = UIBarButtonItem(
            title: "Options",
            image: nil,
            primaryAction: nil,
            menu: UIMenu(children: [
                UIAction(title: "Configure office", image: UIImage(systemName: "slider.horizontal.3")) { [weak self] _ in
                    // Venite's own settings page — same site, so it stays in
                    // this browser rather than bouncing out and back.
                    guard let url = URL(string: "https://www.venite.app/home") else { return }
                    self?.webView.load(URLRequest(url: url))
                },
                UIAction(title: "Change format", image: UIImage(systemName: "arrow.triangle.2.circlepath")) { [weak self] _ in
                    self?.handingOff = true
                    self?.dismiss(animated: true) { self?.onChangeFormat?() }
                },
                UIAction(title: "Listen to the office", image: UIImage(systemName: "waveform")) { [weak self] _ in
                    self?.handingOff = true
                    self?.dismiss(animated: true) { self?.onListen?() }
                },
                UIAction(title: "Open in Safari", image: UIImage(systemName: "safari")) { [weak self] _ in
                    self?.openInSafari()
                },
            ])
        )
        optionsItem.accessibilityLabel = "Options"
        self.optionsItem = optionsItem
        /** The pages Phoebe's reader view knows how to restyle — the only
         *  ones where a Standard/Reader toggle would do anything. Kept beside
         *  readerJS's hostname gate; add to both or the button appears over a
         *  page it can't change (or, worse, doesn't appear over one it can). */
        let readerHost = (url.host ?? "").lowercased()
        let isReaderHost = Self.isReaderHostName(readerHost)
        if officeChrome {
            // Owner: "take the settings and the X button out of the top
            // right and move the Next button ... to the top right." Gear
            // and close X are gone; Next lives here instead (and still at
            // the bottom pill too, alongside Back).
            let nextItem = UIBarButtonItem(title: "Next →", style: .plain, target: self, action: #selector(officeNavNext))
            nextItem.accessibilityLabel = "Next"
            self.doneItem = nextItem
            navigationItem.rightBarButtonItem = nextItem
            // The title pill: same text the office's own header pill shows.
            title = officeTitleText
            // "Standard" flips the reading back to the page as the site
            // styles it; "Reader" brings Phoebe's view back. It began in the
            // top LEFT ("in the left top corner have some button that says
            // standard") and moved here on the owner's later word — "we need
            // the standard button in the top right". Right-hand items render
            // right-to-left, so Next keeps the corner it was moved to and
            // Standard sits just inside it.
            //
            // oremus and VCS — the two pages the reader view knows how to
            // restyle (see readerJS's hostname gate). Everywhere else the
            // button would toggle nothing.
            if isReaderHost {
                // Titled from the remembered state, not hardcoded — the button
                // names what tapping it will DO, and it can start either way.
                let standardItem = UIBarButtonItem(title: readerViewOn ? "Standard" : "Reader", style: .plain, target: self, action: #selector(toggleReaderView))
                standardItem.accessibilityLabel = "Switch between Phoebe's reader view and the standard page"
                self.standardItem = standardItem
                navigationItem.rightBarButtonItems = [nextItem, standardItem]
            }
        } else if isArticle {
            // No Options, no Reader button — owner reverted both. Every
            // Options item is about praying an office; on a newsletter they
            // are meaningless at best and actively wrong at worst ("Listen to
            // the office" would start a liturgy podcast over a Rohr
            // meditation). onOpenReaderView / openReaderMode / presentReaderView
            // are left wired below (harmless, unreachable from here) rather
            // than torn back out, in case Reader comes back later.
            // …EXCEPT on a page the reader view restyles. SSJE's "Brother,
            // Give Us A Word" opens with this chrome, and the owner asked for
            // the toggle here too — "put standard in the top right" — so a
            // reader who wants the rest of the page (the fuller post, the
            // subscribe form) can have it back in one tap.
            if isReaderHost {
                let standardItem = UIBarButtonItem(title: "Standard", style: .plain, target: self, action: #selector(toggleReaderView))
                standardItem.accessibilityLabel = "Switch between Phoebe's reader view and the standard page"
                self.standardItem = standardItem
                // LEFT (owner: "put standard to the left side of the screen").
                // It sits next to Done — the two chrome controls together, and
                // the right side left clear of the text.
                if let done = navigationItem.leftBarButtonItem, done !== standardItem {
                    navigationItem.leftBarButtonItems = [done, standardItem]
                } else {
                    navigationItem.leftBarButtonItem = standardItem
                }
                navigationItem.rightBarButtonItem = nil
            } else {
                navigationItem.rightBarButtonItem = nil
            }
            title = nil
        } else {
            // A plain office/Venite open. Every Options item genuinely
            // applies here.
            navigationItem.rightBarButtonItem = optionsItem
        }

        // ── WebView ── adopt a preloaded one when present (already loading in
        // the background, so it appears instantly), otherwise build a fresh
        // one. Either way we own it, so we drive the nav delegate + load.
        webView = preloadedWebView ?? BibleWebViewController.makeWebView()
        webView.navigationDelegate = self
        // Any pan on the page marks it as the reader's — see readerMovedPage.
        webView.scrollView.panGestureRecognizer.addTarget(self, action: #selector(noteReaderMovedPage))
        // Owner: "we want all forward pages to open in light mode." The VC
        // itself forces .dark above (so prefers-color-scheme reads dark for
        // most sites, matching the app), but forwardmovement.org's own pages
        // are designed for light backgrounds — setting overrideUserInterfaceStyle
        // on the webView itself (not the VC) stops the .dark cascade at just
        // this view, without touching the surrounding dark chrome/toolbar.
        if BibleWebViewController.forcesLightMode(url) {
            webView.overrideUserInterfaceStyle = .light
        }
        /**
         * THE LEAF, PAINTED NATIVELY (owner: "can we put leaps at the back …
         * as the background, please? I've been asking for that for a while").
         *
         * It could never work from inside the page. oremus and the VCS both
         * serve `Content-Security-Policy: default-src 'self'`, which covers
         * img-src, so a background-image pointing at withphoebe.app is refused
         * before it is fetched — and a data: URI is refused too, since 'self'
         * does not include data:. Every attempt to weight the wash differently
         * was adjusting a gradient over a photograph that had never loaded,
         * which is why it kept coming back flat green.
         *
         * So the photograph goes UNDER the web view instead of inside it: an
         * image view and the deck's own wash sit behind, the page renders on a
         * transparent background (see the stylesheet), and nothing about it is
         * the page's business. Same move as the font — stop asking the host's
         * policy for permission to show our own asset.
         *
         * Only in reader mode: Standard view keeps the plain background, since
         * a site's own design should sit on its own ground.
         */
        let backdrop = UIImageView()
        backdrop.translatesAutoresizingMaskIntoConstraints = false
        backdrop.contentMode = .scaleAspectFill
        backdrop.clipsToBounds = true
        backdrop.alpha = 0.22
        if let leaf = Bundle.main.url(forResource: "leaf", withExtension: "jpg", subdirectory: "public/reader"),
           let img = UIImage(contentsOfFile: leaf.path) {
            backdrop.image = img
        }
        let wash = UIView()
        wash.translatesAutoresizingMaskIntoConstraints = false
        wash.isUserInteractionEnabled = false
        let washLayer = CAGradientLayer()
        // The practice decks' own weights — light enough at the top that the
        // leaf reads, heavy enough at the bottom that the text stays legible.
        washLayer.colors = [
            UIColor(red: 10/255, green: 26/255, blue: 16/255, alpha: 0.62).cgColor,
            UIColor(red: 10/255, green: 26/255, blue: 16/255, alpha: 0.80).cgColor,
            UIColor(red: 10/255, green: 26/255, blue: 16/255, alpha: 0.90).cgColor,
        ]
        washLayer.locations = [0, 0.55, 1]
        wash.layer.addSublayer(washLayer)
        readerBackdrop = backdrop
        readerWash = wash
        readerWashLayer = washLayer
        view.addSubview(backdrop)
        view.addSubview(wash)

        view.addSubview(webView)
        // Transparent so the leaf behind it shows through. The page's own
        // stylesheet clears its background to match; a site rendering its own
        // opaque background simply covers this, which is correct for Standard.
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        NSLayoutConstraint.activate([
            backdrop.topAnchor.constraint(equalTo: view.topAnchor),
            backdrop.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            backdrop.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            backdrop.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            wash.topAnchor.constraint(equalTo: view.topAnchor),
            wash.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            wash.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            wash.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        syncReaderBackdrop()

        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.tintColor = PhoebeBrowserColor.tint
        progressView.trackTintColor = .clear
        progressView.alpha = 0
        view.addSubview(progressView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            progressView.topAnchor.constraint(equalTo: webView.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 2),
        ])

        // ── Bottom bar: web back / forward · reload · share. ──
        backButton = UIBarButtonItem(
            image: UIImage(systemName: "chevron.left"),
            style: .plain, target: self, action: #selector(goBack)
        )
        backButton.accessibilityLabel = "Back"
        forwardButton = UIBarButtonItem(
            image: UIImage(systemName: "chevron.right"),
            style: .plain, target: self, action: #selector(goForward)
        )
        forwardButton.accessibilityLabel = "Forward"
        let reloadButton = UIBarButtonItem(
            image: UIImage(systemName: "arrow.clockwise"),
            style: .plain, target: self, action: #selector(reload)
        )
        reloadButton.accessibilityLabel = "Reload"
        let shareButton = UIBarButtonItem(
            image: UIImage(systemName: "square.and.arrow.up"),
            style: .plain, target: self, action: #selector(share)
        )
        shareButton.accessibilityLabel = "Share"
        // The Journal button is GONE. It dismissed the browser and fired
        // phoebe:open-journal — an event nothing in the web app listens for,
        // to a /journal route that no longer exists (the journal was removed).
        // So mid-office it closed the liturgy, lost the reader's place, and
        // opened nothing. It only ever "worked" because this whole controller
        // was unregistered until today; registering the plugin made a dead
        // button reachable.
        let flex = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        let flex2 = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        backButton.isEnabled = false
        forwardButton.isEnabled = false
        toolbarItems = [backButton, fixedSpace(16), forwardButton, flex, reloadButton, flex2, shareButton]

        // Progress bar bound to the load.
        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] _, change in
            guard let self = self, let p = change.newValue else { return }
            self.progressView.setProgress(Float(p), animated: true)
            if p > 0 && p < 1 {
                UIView.animate(withDuration: 0.15) { self.progressView.alpha = 1 }
            }
        }
        // Title follows the page's <title> once it loads.
        titleObservation = webView.observe(\.title, options: [.new]) { [weak self] webView, _ in
            guard let self, !self.isArticle else { return }
            if let t = webView.title, !t.isEmpty { self.title = t }
        }

        // A preloaded web view is already loading/loaded — only kick off the
        // request for a freshly-built one.
        if preloadedWebView == nil {
            webView.load(URLRequest(url: url))
        }
        updateNavButtons()
        // Start in the chrome the caller expects, so the first frame is already
        // right; syncChromeToPage corrects it from the page's own background
        // once that paints.
        applyChrome(isLight: isArticle)

        // The veil goes on LAST so it covers the web view and the progress bar.
        loadingVeil.translatesAutoresizingMaskIntoConstraints = false
        // Owner: "I wanted it to be like how the office loads." The office
        // holds the splash leaf while it assembles, so this holds the same one
        // — the same asset, full-bleed, no spinner. A spinner says "the machine
        // is busy"; the leaf says the page is being made ready, which is the
        // same thing said in the app's own voice. The image is what the eye
        // reads, so the background colour behind it only matters if the asset
        // is ever missing.
        loadingVeil.backgroundColor = .black
        loadingVeil.clipsToBounds = true
        veilImage.translatesAutoresizingMaskIntoConstraints = false
        veilImage.contentMode = .scaleAspectFill
        loadingVeil.addSubview(veilImage)
        veilSpinner.translatesAutoresizingMaskIntoConstraints = false
        veilSpinner.startAnimating()
        loadingVeil.addSubview(veilSpinner)
        // Hosted on the NAVIGATION CONTROLLER's view, not this one. Owner: "the
        // splash needs to go over the top bar." A view controller's own view
        // begins below the navigation bar, so a veil added there left Done,
        // Options and the title sitting on a black strip above the leaf — the
        // chrome of a page you cannot see yet, which is the half-loaded look
        // the veil exists to hide. The nav controller's view is the whole
        // screen, bar included.
        let veilHost: UIView = navigationController?.view ?? view
        veilHost.addSubview(loadingVeil)
        NSLayoutConstraint.activate([
            loadingVeil.topAnchor.constraint(equalTo: veilHost.topAnchor),
            loadingVeil.bottomAnchor.constraint(equalTo: veilHost.bottomAnchor),
            loadingVeil.leadingAnchor.constraint(equalTo: veilHost.leadingAnchor),
            loadingVeil.trailingAnchor.constraint(equalTo: veilHost.trailingAnchor),
            veilImage.topAnchor.constraint(equalTo: loadingVeil.topAnchor),
            veilImage.bottomAnchor.constraint(equalTo: loadingVeil.bottomAnchor),
            veilImage.leadingAnchor.constraint(equalTo: loadingVeil.leadingAnchor),
            veilImage.trailingAnchor.constraint(equalTo: loadingVeil.trailingAnchor),
            veilSpinner.centerXAnchor.constraint(equalTo: loadingVeil.centerXAnchor),
            // Centred (owner). The office sits its ring low because there is a
            // versicle above it to read; this splash is the leaf alone, so the
            // middle is where the eye already is.
            veilSpinner.centerYAnchor.constraint(equalTo: loadingVeil.centerYAnchor),
            veilSpinner.widthAnchor.constraint(equalToConstant: 22),
            veilSpinner.heightAnchor.constraint(equalToConstant: 22),
        ])
        // The floating bottom pill — office chrome only. Built now so it can
        // be positioned relative to the same veilHost, but kept invisible
        // until the veil lifts: the SNAPSHOT already shows the office's own
        // pill baked into the image, so both on screen at once would read as
        // a duplicate. See hideVeil().
        if officeChrome { buildOfficeNavPill(in: veilHost) }

        veilShownAt = CACurrentMediaTime()
        // A warmed web view may have finished loading before this controller
        // existed, in which case didFinish has already been and gone and would
        // never fire again — the veil would sit until the ceiling. Reveal on
        // the floor instead.
        if !webView.isLoading {
            hideVeil()
            // …and the two things didFinish would have done. A warmed view has
            // ALREADY finished, so that delegate call is never coming — which
            // is why a preloaded page (Visio Divina preloads its essay) opened
            // with the caller's starting chrome, white, over a dark article.
            syncChromeToPage()
            refreshReaderChrome()
            scrollToDeepLinkedWork()
        }
        // The ceiling. A page that never reports finishing must not hold the
        // veil forever.
        DispatchQueue.main.asyncAfter(deadline: .now() + veilMaxSeconds) { [weak self] in
            self?.hideVeil()
        }

        // Swipe right from the left edge to flick the browser back out — the
        // interactive twin of the slide-in present.
        let edgePan = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleDismissPan(_:)))
        edgePan.edges = .left
        view.addGestureRecognizer(edgePan)

        // Owner: "would it be possible that if someone swipes on that screen,
        // it moves forward?" — mirroring the office deck's own "swipe left →
        // next" on the page it handed off to. A discrete swipe (not a pan),
        // so it coexists with the page's own vertical scroll rather than
        // fighting it — WKWebView's scroll view pans vertically; this only
        // fires on a clearly horizontal, leftward flick anywhere on the page.
        if officeChrome {
            let swipeNext = UISwipeGestureRecognizer(target: self, action: #selector(officeNavNext))
            swipeNext.direction = .left
            view.addGestureRecognizer(swipeNext)
        }
    }

    // Drives the interactive swipe-to-dismiss. The percent-driven interactor
    // is handed to the transition delegate for the life of the gesture so the
    // slide-out tracks the finger; on release we complete past 40% (or a fast
    // flick) and snap back otherwise.
    @objc private func handleDismissPan(_ gr: UIScreenEdgePanGestureRecognizer) {
        let width = max(view.bounds.width, 1)
        let progress = min(1, max(0, gr.translation(in: view).x / width))
        switch gr.state {
        case .began:
            slideDelegate.interactiveDismiss = UIPercentDrivenInteractiveTransition()
            dismiss(animated: true)
        case .changed:
            slideDelegate.interactiveDismiss?.update(progress)
        case .ended, .cancelled:
            let interactor = slideDelegate.interactiveDismiss
            let flick = gr.velocity(in: view).x > 600
            if gr.state == .ended && (progress > 0.4 || flick) {
                interactor?.finish()
            } else {
                interactor?.cancel()
            }
            slideDelegate.interactiveDismiss = nil
        default:
            break
        }
    }

    private func fixedSpace(_ width: CGFloat) -> UIBarButtonItem {
        let item = UIBarButtonItem(barButtonSystemItem: .fixedSpace, target: nil, action: nil)
        item.width = width
        return item
    }

    private func updateNavButtons() {
        backButton?.isEnabled = webView.canGoBack
        forwardButton?.isEnabled = webView.canGoForward
    }

    /// Match the navigation bar to the page's own background.
    ///
    /// Owner: "black or white depending on the background of Venite." Asking
    /// the page rather than hard-coding either one means the chrome keeps
    /// matching if the site changes, and it works for the other pages this
    /// browser opens too. Falls back to what's already set when the page
    /// doesn't answer — a wrong-but-stable bar beats a flashing one.
    /**
     * Paint every piece of chrome for a light or dark page, together.
     *
     * The bug this replaces: syncChromeToPage set the bar's BACKGROUND and
     * TITLE from the page, and nothing else. The nav bar's tintColor, the
     * interface style, and the Done button's own title colour all stayed on
     * their dark-mode values, so a cream newsletter got a white bar carrying
     * black capsule buttons with unreadable content — a bar half-flipped.
     *
     * Anything that depends on light-vs-dark belongs in here. A second place
     * that decides part of it is how the halves got out of step in the first
     * place.
     */
    /**
     * Reveal the page. Idempotent — called by didFinish, by didFail, and by the
     * ceiling timer, and only the first of those does anything.
     */
    private func hideVeil() {
        guard !veilDismissed else { return }
        let elapsed = CACurrentMediaTime() - veilShownAt
        if elapsed < veilMinSeconds {
            // The floor: wait out the remainder rather than flashing.
            DispatchQueue.main.asyncAfter(deadline: .now() + (veilMinSeconds - elapsed)) { [weak self] in
                self?.hideVeil()
            }
            return
        }
        veilDismissed = true
        UIView.animate(withDuration: 0.32, delay: 0, options: [.curveEaseInOut], animations: { [weak self] in
            self?.loadingVeil.alpha = 0
            // Cross-fade the REAL pill in exactly as the screenshot's baked-in
            // one fades out — the "fades from that into the web page" the
            // office-reading flavour asks for.
            self?.officeNavPill?.alpha = 1
        }, completion: { [weak self] _ in
            self?.veilSpinner.stopAnimating()
            self?.loadingVeil.isHidden = true
        })
    }

    /**
     * The floating bottom pill — Back · progress · Next — mirroring the
     * office deck's own. A UIVisualEffectView capsule rather than a UIToolbar:
     * the office's pill is sized to its content and floats centred above the
     * safe area, not a full-width bar, and a toolbar cannot do that shape.
     */
    private func buildOfficeNavPill(in host: UIView) {
        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
        blur.translatesAutoresizingMaskIntoConstraints = false
        blur.layer.cornerRadius = 22
        blur.clipsToBounds = true
        blur.layer.borderWidth = 1
        blur.alpha = 0  // see hideVeil() — hidden until the snapshot's own pill fades out
        host.addSubview(blur)
        officeNavPill = blur

        // Owner: "the bottom bar left button should still say Back" —
        // reverted to its original label and action; see the top-left button
        // above for where "Next" actually landed.
        let back = UIButton(type: .system)
        back.setTitle("Back", for: .normal)
        back.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
        back.addTarget(self, action: #selector(officeNavBack), for: .touchUpInside)
        back.layer.cornerRadius = 14
        back.layer.borderWidth = 1
        back.contentEdgeInsets = UIEdgeInsets(top: 7, left: 14, bottom: 7, right: 14)
        officeBackButton = back

        let label = UILabel()
        label.font = .systemFont(ofSize: 10, weight: .semibold)
        // `filter`, not just compactMap: callers pass "" for "no section"
        // (Visio Divina deliberately does — the artwork titles run to eighty
        // characters), and an empty string is not nil, so the pill read
        // "REFLECTION · " with a separator pointing at nothing.
        let pillText = [officeSlideLabel, officeSectionLabel]
            .compactMap { $0 }
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .joined(separator: " · ")
            .uppercased()
        label.text = pillText
        // Hidden, not merely empty: an empty UILabel still takes its share of
        // the stack's spacing, so a pill with nothing to say came out wider
        // than Back+Next with a gap floating between them. A hidden arranged
        // subview leaves the layout entirely.
        label.isHidden = pillText.isEmpty
        label.setContentCompressionResistancePriority(.required, for: .horizontal)
        officeNavLabel = label

        let next = UIButton(type: .system)
        // Always "Next →" — the lesson slide this pill is reached from is
        // never the office's last slide and never an intercession, so the
        // office's own Amen/Done relabeling never applies here.
        next.setTitle("Next →", for: .normal)
        next.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
        next.addTarget(self, action: #selector(officeNavNext), for: .touchUpInside)
        next.layer.cornerRadius = 14
        next.contentEdgeInsets = UIEdgeInsets(top: 7, left: 16, bottom: 7, right: 16)
        officeNextButton = next

        let stack = UIStackView(arrangedSubviews: [back, label, next])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.alignment = .center
        stack.spacing = 12
        blur.contentView.addSubview(stack)

        NSLayoutConstraint.activate([
            blur.centerXAnchor.constraint(equalTo: host.centerXAnchor),
            blur.bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            blur.leadingAnchor.constraint(greaterThanOrEqualTo: host.leadingAnchor, constant: 16),
            blur.trailingAnchor.constraint(lessThanOrEqualTo: host.trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: blur.contentView.topAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: blur.contentView.bottomAnchor, constant: -8),
            stack.leadingAnchor.constraint(equalTo: blur.contentView.leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: blur.contentView.trailingAnchor, constant: -12),
        ])
    }

    private func applyChrome(isLight: Bool, statusStrip: UIColor? = nil) {
        /**
         * With the top bar restored, the bar IS the strip behind the status bar
         * — a UINavigationBar extends its own background up under the clock. So
         * the page's top band goes on the bar itself, and "if the page has a top
         * bar with a colour, have that extend to the top of the page" comes out
         * as the bar simply continuing the page.
         *
         * Contrast is then a question about the BAR, not about the body: a cream
         * masthead over a dark article still needs dark labels. So the bar's own
         * colour decides its content colour, and the body only decides the web
         * view's backdrop.
         */
        /**
         * IN READER MODE THE BAR IS THE DECK'S GREEN, not the page's.
         *
         * Owner: "why are the headers not matching the color of the page?"
         * Because I only fixed half of it. The page background and the web
         * view were switched to the deck's ground for reader mode further
         * down, but the BAR is resolved here, from a probe of a page the
         * reader has just made transparent — so it came back white while the
         * page behind it was green. The bar extends up behind the status bar,
         * so that mismatch is the first thing on screen.
         */
        let readerOwnsGround = readerViewOn
            && Self.isReaderHostName(webView?.url?.host ?? url.host ?? "")
        let bar: UIColor = readerOwnsGround
            ? PhoebeBrowserColor.deck
            : (statusStrip ?? (isLight ? .white : .black))
        let barIsLight = Self.isLightColor(bar)
        let text: UIColor = barIsLight ? .black : PhoebeBrowserColor.text
        // The bar tint colours the bar-button items. On a light bar iOS renders
        // them as filled capsules, so this is the capsule's own colour — a dark
        // one on white, not the pale sage that only reads on black.
        // Owner: "white when the others are white, black when the others are
        // black." Not the app's sage — that only ever read on the dark bar, and
        // on white it was a third colour next to two that agreed.
        let tint: UIColor = barIsLight ? .black : .white
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = bar
        appearance.titleTextAttributes = [.foregroundColor: text]
        appearance.shadowColor = UIColor.clear
        let navBar = navigationController?.navigationBar
        navBar?.standardAppearance = appearance
        navBar?.scrollEdgeAppearance = appearance
        navBar?.compactAppearance = appearance
        navBar?.tintColor = tint
        // The article's Done lives down here, so the bottom bar takes the same
        // treatment — otherwise a dark page would leave black-on-black.
        let toolbarAppearance = UIToolbarAppearance()
        toolbarAppearance.configureWithOpaqueBackground()
        toolbarAppearance.backgroundColor = bar
        toolbarAppearance.shadowColor = UIColor.clear
        let toolbar = navigationController?.toolbar
        toolbar?.standardAppearance = toolbarAppearance
        toolbar?.compactAppearance = toolbarAppearance
        if #available(iOS 15.0, *) { toolbar?.scrollEdgeAppearance = toolbarAppearance }
        toolbar?.tintColor = tint
        // Carries the rest of UIKit with it — bar-button capsules, the menu
        // that drops out of Options, the scroll indicators.
        navigationController?.overrideUserInterfaceStyle = barIsLight ? .light : .dark
        // Per-item as well as on the bar. Owner: "I want it to match the other
        // buttons — white when the others are white, black when the others are
        // black." Setting it on each item is what makes them agree; the bar's
        // tintColor is only a default, and individual items can escape it.
        doneItem?.tintColor = tint
        optionsItem?.tintColor = tint
        closeXItem?.tintColor = tint
        applyOfficePillChrome(bar: bar, tint: tint, text: text)
        /**
         * IN READER MODE WE SUPPLY THE GROUND, so the page is not asked for it.
         *
         * Owner, of the screen recording: "the readers didnt have green
         * backrounds." This is where it went. The reader stylesheet makes the
         * page transparent so the leaf behind it can show — which leaves this
         * probe reading a page with no background of its own, resolving the
         * chrome to black or white, and then setting the web view's background
         * OPAQUE. That last line painted straight over the leaf and its wash,
         * so the practice's ground disappeared the moment a page finished
         * loading.
         *
         * The probe is still right for Standard view, where the site's own
         * design should own the frame.
         */
        let ground = readerOwnsGround ? PhoebeBrowserColor.deck : bar
        view.backgroundColor = ground
        navigationController?.view.backgroundColor = ground
        // The page's own body, behind the web view — not the bar's band, or a
        // cream masthead would tint the whole of a dark article's backdrop.
        // Clear in reader mode, or it hides the leaf painted behind it.
        webView?.backgroundColor = readerOwnsGround ? .clear : (isLight ? .white : .black)
    }

    /** Colour the floating bottom pill to match — see buildOfficeNavPill. */
    private func applyOfficePillChrome(bar: UIColor, tint: UIColor, text: UIColor) {
        guard officeChrome else { return }
        officeNavPill?.layer.borderColor = tint.withAlphaComponent(0.35).cgColor
        officeNavLabel?.textColor = tint.withAlphaComponent(0.85)
        officeBackButton?.setTitleColor(text, for: .normal)
        officeBackButton?.layer.borderColor = tint.withAlphaComponent(0.45).cgColor
        // Next is the pill's one FILLED control, same emphasis the office's own
        // green Next button carries — tint-filled, bar-coloured label, so it
        // reads as the primary action against either a light or dark page.
        officeNextButton?.backgroundColor = tint
        officeNextButton?.setTitleColor(bar, for: .normal)
    }

    /** Parse a CSS rgb()/rgba() string. nil for anything transparent. */
    private func parseCSSColor(_ css: String?) -> UIColor? {
        guard let css else { return nil }
        let nums = css.split(whereSeparator: { !"0123456789.".contains($0) })
            .compactMap { Double($0) }
        guard nums.count >= 3 else { return nil }
        // rgba(…, 0) tells us nothing about what the reader actually sees.
        if nums.count >= 4, nums[3] == 0 { return nil }
        return UIColor(red: nums[0] / 255, green: nums[1] / 255, blue: nums[2] / 255, alpha: 1)
    }

    private static func isLightColor(_ c: UIColor) -> Bool {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (0.299 * r + 0.587 * g + 0.114 * b) > 0.5
    }

    /**
     * Read the page's own colours and dress the app's chrome to match.
     *
     * TWO colours, not one. The BODY background decides light-vs-dark for the
     * bars and their labels. The colour of whatever sits at the very TOP of the
     * page is a separate question, and it is what fills the strip behind the
     * iPhone's status bar.
     *
     * Owner: "if the page has a top bar with a colour, have that extend to the
     * top of the page behind the iPhone top bar." CAC opens with a cream
     * masthead; the strip above it was taking the body's white, so the article
     * began with a seam across it. Sampling the header instead lets the page's
     * own band run to the top of the screen.
     *
     * The probe walks UP from whatever element is at the top-centre of the
     * viewport until it finds an opaque background — the text or logo you
     * actually hit is nearly always transparent, and its container is the thing
     * with the colour.
     */
    /**
     * Open a VCS commentary ON THE PICTURE.
     *
     * thevcs.org stacks every work of an exhibition on ONE long page and
     * deep-links each one as /<exhibition>/<work-slug>, where the slug is an
     * <article id>. Left to itself the site parks the reader inside that
     * article at the COMMENTARY — past the painting — which for Visio Divina
     * is the one place it must not open: the practice is looking at the
     * picture, and the reflection is what you read after.
     *
     * So: scroll that article's own top into view. Not "scroll to top" — the
     * page begins with the site masthead and the exhibition's own preamble,
     * and a work halfway down an exhibition would land nowhere near itself.
     *
     * Host-gated, and now TWO hosts:
     *
     *  • thevcs.org — the artwork above the deep-linked commentary (below).
     *  • bible.oremus.org — the passage TITLE (owner: "on the oremus Bible
     *    browser, have the page start scrolled to where the title of the verse
     *    is — so it'd be John 7:1-23 today"). oremus opens on its masthead: a
     *    diagnostic line, the site heading, a quick-link bar and a block of
     *    display buttons all sit above the reading, so a lesson opened from a
     *    slide begins with roughly a screen of chrome before a word of
     *    scripture. The h1 IS the reference, so landing on it puts the reading
     *    where the slide said it would be.
     *
     * Every other reading this browser opens (Bible.com, Forward Movement,
     * CAC, SSJE) is a single article that opens where it should already.
     */
    private func scrollToDeepLinkedWork() {
        guard let url = webView.url, let host = url.host?.lowercased() else { return }
        if host == "bible.oremus.org" || host.hasSuffix(".oremus.org") {
            scrollToOremusPassage()
            return
        }
        // THE FRAGMENT FIRST. VCS answers /<exhibition>/<work> with a redirect
        // to /<exhibition>#<work>, and this runs at didFinish — on the URL
        // AFTER the redirect. Reading the last path segment there yields the
        // exhibition slug, which is no element's id, so the lookup returned
        // false, the ladder ran out, and the reading opened at the top of the
        // exhibition — a different work's picture and a different work's
        // commentary. Measured on the live page: the fragment is the article
        // id, every time. The path segment stays as the fallback for a link
        // that arrives without a fragment.
        guard host == "thevcs.org" || host.hasSuffix(".thevcs.org"),
              let slug = (url.fragment?.isEmpty == false ? url.fragment
                          : url.path.split(separator: "/").last.map(String.init)),
              !slug.isEmpty,
              let slugLiteral = String(data: (try? JSONSerialization.data(withJSONObject: [slug], options: [])) ?? Data(), encoding: .utf8)
        else { return }
        // ["the-slug"] → "the-slug", already escaped for JS by JSONSerialization.
        let quoted = slugLiteral.dropFirst().dropLast()
        // Owner: "when it goes into the reflection, have the page start at the
        // picture not under [it]." The slug's element is the COMMENTARY block;
        // on VCS the artwork it discusses sits just above. Landing on the text
        // put the picture out of view — backwards for a looking practice. So:
        // find the work's image nearest above the anchor and start there, with
        // the commentary arriving as you scroll. Bounded to ~2000px so a
        // different work three screens up can never capture the landing, and
        // small images (icons, logos) never qualify. No image found → the
        // anchor, exactly as before.
        let js = """
        (function () {
          /* Never animated. VCS sets html{scroll-behavior:smooth}, which
             turns a plain scrollTo into an animation this ladder then
             restarts on its next attempt — the page ends up where it
             started. Older WebKit ignores the options form, so fall back. */
          function phoebeScrollTo(y) {
            /* Kill smooth scrolling AT THE ROOT before moving.
               This used to be handled by the reader stylesheet
               (`html{scroll-behavior:auto}`), and the VCS has since left the
               reader — so the site's own `scroll-behavior:smooth` came back
               and with it the bug it caused: every attempt in the retry
               ladder restarts an animation instead of finishing one, and the
               page ends up where it started. Measured then: eight attempts,
               final offset 0, target 2946. Set here, it holds whether or not
               a stylesheet is being injected. */
            try { document.documentElement.style.scrollBehavior = 'auto'; } catch (e) {}
            try { window.scrollTo({ top: y, behavior: 'instant' }); }
            catch (e) { window.scrollTo(0, y); }
            if (Math.abs(window.pageYOffset - y) > 2 && document.scrollingElement) {
              document.scrollingElement.scrollTop = y;
            }
          }
          var el = document.getElementById(\(quoted));
          if (!el) return false;
          /* The work's own article, top-aligned.
             Owner asked for this twice, at different times: "start at the
             picture not under [it]", then "make sure it scrolls to the top of
             the commentary for the image we are using that day". Both are the
             article's top — and now that the reader shows the commentary as
             text only, the article begins with the work's title and its
             writing, which is exactly what should be under the reader's
             thumb. No hunting for a nearby image: the pictures are hidden,
             and the nearest visible one would belong to another work. */
          var anchorTop = el.getBoundingClientRect().top + window.pageYOffset;
          phoebeScrollTo(Math.max(0, anchorTop - 8));
          return true;
        })()
        """
        func attempt(_ remaining: Int, delay: TimeInterval) {
            // Never move a page the reader has taken hold of — checked before
            // the scroll, not only before the next retry.
            guard !readerMovedPage else { return }
            webView.evaluateJavaScript(js) { [weak self] value, _ in
                guard let self, remaining > 0 else { return }
                let found = (value as? Bool) ?? false
                // Not there yet (the site renders works progressively), or there
                // but about to move as the images above it finish loading. Try
                // again.
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    attempt(remaining - 1, delay: found ? 0.7 : 0.4)
                }
            }
        }
        // Longer than it looks: VCS lazy-loads its images and OpenSeadragon
        // viewers, and the reader stylesheet reflows the whole page after
        // that, so the section's offset keeps moving for a second or more.
        // Cheap to retry, and readerMovedPage stops it the moment they scroll.
        attempt(8, delay: 0.35)
    }

    /**
     * oremus: open ON the passage title, not on the site masthead.
     *
     * `h2.passageref` is the reference itself — "John 7:1-23" — and it sits at
     * the head of the text block. NOT `h1#h1screen`, which despite the name is
     * the SITE heading ("Bible Browser"); landing there moved the page 45px
     * and left the reading exactly where it was. Verified against a live
     * lesson page: the ref sits at 289px, with the masthead, the quick-link
     * bar and a 90px block of display buttons above it.
     *
     * A small top inset is left above it so it reads as the top of a page
     * rather than a line clipped to the very edge. Falls back to the text
     * block (`.bible`) if oremus ever renames the heading — a reading that
     * opens a little low is a better failure than one that opens on the
     * masthead, so each step degrades toward "scroll less, not more".
     *
     * Shares the retry + readerMovedPage guards with the VCS path: the page
     * settles as its stylesheet lands, and a reader who has already started
     * scrolling is never yanked back.
     */
    private func scrollToOremusPassage() {
        let js = """
        (function () {
          var el = document.querySelector('h2.passageref')
                || document.querySelector('.bible');
          if (!el) return false;
          var top = el.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo(0, Math.max(0, top - 12));
          return true;
        })()
        """
        func attempt(_ remaining: Int, delay: TimeInterval) {
            guard !readerMovedPage else { return }
            webView.evaluateJavaScript(js) { [weak self] value, _ in
                guard let self, remaining > 0 else { return }
                let found = (value as? Bool) ?? false
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    attempt(remaining - 1, delay: found ? 0.7 : 0.4)
                }
            }
        }
        attempt(3, delay: 0.35)
    }

    /**
     * The reader's chrome, decided from the page we ACTUALLY landed on.
     *
     * THE BUG THIS FIXES: chrome is set up from the URL we were handed, and
     * two of these sources are our own redirect routes —
     * withphoebe.app/api/nouwen/today and /api/vts/today. At setup time the
     * host is `withphoebe.app`, which is not a reader host, so the Standard
     * button was never added and the light "newsletter" chrome stayed. The
     * page then redirected to henrinouwen.org and rendered in the reader view
     * underneath a white bar with no way back to the standard page.
     *
     * `reader: true` on openExternal is ALSO not what it sounds like: it maps
     * to lightChrome, an option older than this reader view, which is what
     * asked for the white bar in the first place.
     *
     * So: re-read the host after every navigation, and if the reader view is
     * going to restyle this page, give it dark chrome and the toggle. Safe to
     * call repeatedly — it adds the button once and applies a colour that is
     * already right.
     */
    private func refreshReaderChrome() {
        let host = (webView.url?.host ?? url.host ?? "").lowercased()
        let isReader = host.hasSuffix("oremus.org")
            || host.hasSuffix("thevcs.org")
            || host.hasSuffix("ssje.org")
            || host.hasSuffix("henrinouwen.org")
            || host.hasSuffix("forwardmovement.org")
            || host.hasSuffix("sojo.net")
        guard isReader else { return }
        // Dark, because the reader view paints the page dark green. The
        // page-sampling sync agrees once it runs; this stops the white flash
        // in between, and holds when the caller asked for light chrome.
        applyChrome(isLight: false)
        if standardItem == nil {
            let item = UIBarButtonItem(title: readerViewOn ? "Standard" : "Reader", style: .plain, target: self, action: #selector(toggleReaderView))
            item.accessibilityLabel = "Switch between Phoebe's reader view and the standard page"
            standardItem = item
            // LEFT, beside Done (owner: "put standard to the left side of the
            // screen"). Anything already on the left keeps the corner, with
            // Standard just inside it.
            if let existing = navigationItem.leftBarButtonItem, existing !== item {
                navigationItem.leftBarButtonItems = [existing, item]
            } else {
                navigationItem.leftBarButtonItem = item
            }
        }
    }

    /**
     * The hosts the reader view can restyle. ONE list — the chrome, the
     * Standard button and the stylesheet all have to agree about this, and a
     * host in one but not another shows a button over a page it can't change.
     */
    /**
     * The pages Phoebe's reader view restyles. MUST agree with readerJS's own
     * hostname gate — the chrome, the Standard button and the stylesheet all
     * read this, and a host in one list and not the other either shows a
     * toggle that changes nothing or hides one that would.
     *
     * NOT thevcs.org, and not grist.org. Both are places whose own design is
     * the thing worth seeing — the VCS lays a commentary out beside the work
     * it discusses, Grist leads with a masthead and a photograph — and the
     * owner asked for each of them plain ("we dont want reader on the visio
     * divina", "Grist i dont want a reader"). They still open in the in-app
     * browser; they simply arrive as their publishers built them.
     */
    static func isReaderHostName(_ host: String) -> Bool {
        let h = host.lowercased()
        return h.hasSuffix("oremus.org") || h.hasSuffix("ssje.org")
            || h.hasSuffix("henrinouwen.org") || h.hasSuffix("forwardmovement.org")
            || h.hasSuffix("sojo.net")
    }

    private func syncChromeToPage() {
        let probe = """
        (function () {
          var body = getComputedStyle(document.body).backgroundColor;
          var top = null;
          var el = document.elementFromPoint(window.innerWidth / 2, 3);
          while (el && el !== document.documentElement) {
            var bg = getComputedStyle(el).backgroundColor;
            var m = bg && bg.match(/[0-9.]+/g);
            if (m && m.length >= 3 && (m.length < 4 || parseFloat(m[3]) > 0.95)) { top = bg; break; }
            el = el.parentElement;
          }
          return JSON.stringify({ body: body, top: top });
        })()
        """
        webView.evaluateJavaScript(probe) { [weak self] value, _ in
            guard let self,
                  let json = value as? String,
                  let data = json.data(using: .utf8),
                  let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return }
            let bodyColor = self.parseCSSColor(parsed["body"] as? String)
            // Fall back to the body when the page has no distinct band up top —
            // then the strip simply continues the page, which is what it did
            // before and is still right.
            let topColor = self.parseCSSColor(parsed["top"] as? String) ?? bodyColor
            guard let bodyColor else { return }
            DispatchQueue.main.async {
                self.applyChrome(isLight: Self.isLightColor(bodyColor), statusStrip: topColor)
            }
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────
    @objc private func close() { dismiss(animated: true) }
    @objc private func openReaderMode() {
        handingOff = true
        let current = webView.url ?? url
        dismiss(animated: true) { [weak self] in self?.onOpenReaderView?(current) }
    }
    @objc private func openOfficeDisplaySettings() {
        handingOff = true
        dismiss(animated: true) { [weak self] in self?.onOfficeDisplaySettings?() }
    }
    // Bottom pill Back/Next — dismiss first (viewDidDisappear's onDismiss
    // still fires after these; onOfficePrev/onOfficeNext run once we're
    // actually gone, mirroring the Options actions above).
    @objc private func officeNavBack() {
        handingOff = true
        dismiss(animated: true) { [weak self] in self?.onOfficePrev?() }
    }
    /** Reader view on/off for the oremus reading — see the JS side's
     *  __phoebeReaderSet. State lives here so the button can rename itself. */
    /**
     * ALWAYS STARTS IN THE READER. Owner: "it should default to the reader."
     *
     * THIS REVERSES AN EARLIER INSTRUCTION and the reversal is deliberate:
     * the view used to be remembered between visits ("if they toggled it off,
     * it'll be off next time they open"), and it was that memory which
     * produced the report — one tap on Standard weeks ago, and every reading
     * since had opened as the publisher's own page.
     *
     * The toggle still works and still renames itself; it simply belongs to
     * the reading in front of you rather than to the app for ever. A person
     * who taps Standard to check one page against its source gets the reader
     * back on the next one, which is the point of opening a passage in Phoebe
     * rather than Safari. The stored preference is no longer read OR written,
     * so a stale `false` from before this change cannot keep anyone out.
     */
    private var readerViewOn: Bool = true
    private weak var standardItem: UIBarButtonItem?
    /**
     * THE READER'S FONT, REGISTERED WITH THE PROCESS — NOT FETCHED.
     *
     * Owner: "The reader view is not space grotesk." It never could be. The
     * stylesheet asked for the face over the network:
     *   @font-face { src: url("https://withphoebe.app/reader/space-grotesk.woff2") }
     * and oremus serves
     *   Content-Security-Policy: default-src 'self'
     * with no font-src of its own, so font-src falls back to 'self' and a font
     * from any other origin is refused before it is fetched. The file was fine
     * (200, correct MIME, CORS open) and the CSS was fine; the page simply
     * would not allow it, so every rule naming "Space Grotesk" fell through to
     * the system sans. No amount of stylesheet work could have fixed that.
     *
     * Registering the face with CoreText sidesteps the question entirely: the
     * family becomes available to this PROCESS, so the web view resolves
     * font-family:"Space Grotesk" as an installed font with no request to
     * make and nothing for a CSP to block. It also fixes the same problem for
     * any other host we ever point the reader at.
     *
     * The .ttf files ride in via the web bundle (public/reader), which is a
     * folder reference — so they ship without touching the Xcode project, and
     * cap:sync keeps them current. The widget already carried the same two.
     */
    private static let readerFontsRegistered: Bool = {
        var ok = false
        for name in ["SpaceGrotesk-Regular", "SpaceGrotesk-Bold"] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "ttf", subdirectory: "public/reader") else { continue }
            var err: Unmanaged<CFError>?
            if CTFontManagerRegisterFontsForURL(url as CFURL, .process, &err) {
                ok = true
            } else if let e = err?.takeRetainedValue() {
                // Already registered is a success for our purposes, not a fault.
                let code = CFErrorGetCode(e)
                if code == CTFontManagerError.alreadyRegistered.rawValue { ok = true }
            }
        }
        return ok
    }()

    /**
     * Push the REMEMBERED state into a freshly loaded page.
     *
     * The injected stylesheet starts enabled at document-start (that is what
     * makes the reader paint without a flash of the site's own design), so a
     * stored "off" has to be applied once the document exists — otherwise the
     * preference is written, read, and then silently ignored on every load,
     * and the toggle only appears to work until you leave the page.
     */
    private func applyReaderState() {
        webView?.evaluateJavaScript("window.__phoebeReaderSet && window.__phoebeReaderSet(\(readerViewOn))", completionHandler: nil)
        standardItem?.title = readerViewOn ? "Standard" : "Reader"
        syncReaderBackdrop()
    }

    /** The backdrop belongs to reader mode only — Standard shows the site's
     *  own ground, which is what "standard" means. */
    private func syncReaderBackdrop() {
        readerBackdrop?.isHidden = !readerViewOn
        readerWash?.isHidden = !readerViewOn
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // CAGradientLayer doesn't autolayout; without this it keeps its
        // zero frame and the wash never appears.
        readerWashLayer?.frame = readerWash?.bounds ?? .zero
    }

    @objc private func toggleReaderView() {
        readerViewOn.toggle()
        applyReaderState()
        // The item itself, not a slot: it lives in rightBarButtonItems now,
        // and reading the slot back would rename whatever else is there.
        standardItem?.title = readerViewOn ? "Standard" : "Reader"
    }

    @objc private func officeNavNext() {
        handingOff = true
        dismiss(animated: true) { [weak self] in self?.onOfficeNext?() }
    }
    @objc private func reload() { webView.reload() }
    @objc private func goBack() { if webView.canGoBack { webView.goBack() } }
    @objc private func goForward() { if webView.canGoForward { webView.goForward() } }
    @objc private func openInSafari() { UIApplication.shared.open(webView.url ?? url) }
    @objc private func share() {
        let activity = UIActivityViewController(activityItems: [webView.url ?? url], applicationActivities: nil)
        // iPad needs a popover anchor; the share button is the last toolbar item.
        activity.popoverPresentationController?.barButtonItem = toolbarItems?.last
        present(activity, animated: true)
    }

    // ── WKNavigationDelegate ────────────────────────────────────────────────
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // A later load succeeded — take the failure panel down.
        loadFailureView?.removeFromSuperview()
        loadFailureView = nil
        // The new document starts with the reader stylesheet live; if they
        // turned it off, turn it off again here.
        applyReaderState()
        UIView.animate(withDuration: 0.25, animations: { [weak self] in
            self?.progressView.alpha = 0
        }) { [weak self] _ in
            self?.progressView.setProgress(0, animated: false)
        }
        updateNavButtons()
        // The page has painted — take its background and match the chrome to it.
        syncChromeToPage()
        refreshReaderChrome()
        // …and again shortly after. Plenty of sites paint a plain body first and
        // drop their masthead in a beat later (a web font, a lazy stylesheet),
        // and the first sample would then have read the page before it had the
        // band we are trying to match.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            self?.syncChromeToPage()
            self?.refreshReaderChrome()
        }
        scrollToDeepLinkedWork()
        hideVeil()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        UIView.animate(withDuration: 0.25) { [weak self] in self?.progressView.alpha = 0 }
        updateNavButtons()
        // Reveal whatever there is — an error page they can read beats a veil
        // that never lifts.
        hideVeil()
    }

    /**
     * THE INITIAL LOAD FAILED — and a failed PROVISIONAL navigation paints
     * nothing at all.
     *
     * Reported: a blank white page with only "Back" on it, opening a Visio
     * Divina reflection. That is exactly this: WKWebView never commits the
     * navigation, so there is no error page to reveal, and the veil lifting
     * uncovers an empty white web view. This delegate method wasn't
     * implemented at all, so nothing distinguished "offline" from "loaded a
     * blank page" — and the reader was left looking at nothing with no way to
     * tell which.
     *
     * A blank screen is never an acceptable end state (this repo keeps a rule
     * about it). Say what happened, name the site, and offer the two things
     * that actually help: try again, or open it in Safari.
     */
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        UIView.animate(withDuration: 0.25) { [weak self] in self?.progressView.alpha = 0 }
        updateNavButtons()
        hideVeil()
        // -999 is "cancelled" — a redirect or a second load superseding this
        // one, which is normal and must not raise an error screen.
        if (error as NSError).code == NSURLErrorCancelled { return }
        showLoadFailure(error)
    }

    /// A readable failure in place of the blank page. Replaced on any later
    /// successful load (see didFinish).
    private func showLoadFailure(_ error: Error) {
        loadFailureView?.removeFromSuperview()
        let host = (webView.url ?? url).host ?? "that page"
        let panel = UIView()
        panel.translatesAutoresizingMaskIntoConstraints = false
        panel.backgroundColor = .clear

        let label = UILabel()
        label.numberOfLines = 0
        label.textAlignment = .center
        label.font = .systemFont(ofSize: 15)
        label.textColor = UIColor.secondaryLabel
        label.text = "Couldn't load \(host).\n\n\(error.localizedDescription)"
        label.translatesAutoresizingMaskIntoConstraints = false

        let retry = UIButton(type: .system)
        retry.setTitle("Try again", for: .normal)
        retry.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        retry.addTarget(self, action: #selector(retryLoad), for: .touchUpInside)
        retry.translatesAutoresizingMaskIntoConstraints = false

        let safari = UIButton(type: .system)
        safari.setTitle("Open in Safari", for: .normal)
        safari.titleLabel?.font = .systemFont(ofSize: 15)
        safari.addTarget(self, action: #selector(openInSafari), for: .touchUpInside)
        safari.translatesAutoresizingMaskIntoConstraints = false

        panel.addSubview(label); panel.addSubview(retry); panel.addSubview(safari)
        view.addSubview(panel)
        loadFailureView = panel
        NSLayoutConstraint.activate([
            panel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
            panel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28),
            panel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.topAnchor.constraint(equalTo: panel.topAnchor),
            label.leadingAnchor.constraint(equalTo: panel.leadingAnchor),
            label.trailingAnchor.constraint(equalTo: panel.trailingAnchor),
            retry.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 18),
            retry.centerXAnchor.constraint(equalTo: panel.centerXAnchor),
            safari.topAnchor.constraint(equalTo: retry.bottomAnchor, constant: 6),
            safari.centerXAnchor.constraint(equalTo: panel.centerXAnchor),
            safari.bottomAnchor.constraint(equalTo: panel.bottomAnchor),
        ])
    }

    @objc private func retryLoad() {
        loadFailureView?.removeFromSuperview()
        loadFailureView = nil
        webView.load(URLRequest(url: webView.url ?? url))
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        updateNavButtons()
    }

    // target=_blank / new-window links: load them in THIS view rather than
    // handing off to the system browser, so a footer/link tap doesn't eject
    // the user to Safari. The toolbar's Safari button is the deliberate exit.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

/**
 * The office's loading ring, in CoreAnimation.
 *
 * The web one is a CSS circle whose border is uniformly faint except for
 * `border-top-color`, spun by `animate-spin`. There is no border-side colour in
 * CoreAnimation, so it is drawn as two strokes on the same circle — the full
 * faint ring, and a quarter-arc at the top over it — and the arc is what spins.
 */
final class OfficeSpinnerView: UIView {
    // rgb(143,175,150) — the --ot-sage the office's ring uses.
    private static let sage = UIColor(red: 143.0 / 255, green: 175.0 / 255, blue: 150.0 / 255, alpha: 1)
    private let track = CAShapeLayer()
    private let head = CAShapeLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        for layer in [track, head] {
            layer.fillColor = UIColor.clear.cgColor
            layer.lineWidth = 2
            self.layer.addSublayer(layer)
        }
        track.strokeColor = Self.sage.withAlphaComponent(0.25).cgColor
        head.strokeColor = Self.sage.withAlphaComponent(0.75).cgColor
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Inset by half the stroke so the ring sits inside the bounds, the way
        // a CSS border does.
        let rect = bounds.insetBy(dx: 1, dy: 1)
        let centre = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        track.frame = bounds
        head.frame = bounds
        track.path = UIBezierPath(ovalIn: rect).cgPath
        // The top quarter: from -135° to -45°, i.e. centred on straight up.
        head.path = UIBezierPath(
            arcCenter: centre, radius: radius,
            startAngle: -3 * .pi / 4, endAngle: -.pi / 4, clockwise: true
        ).cgPath
    }

    func startAnimating() {
        guard head.animation(forKey: "spin") == nil else { return }
        let spin = CABasicAnimation(keyPath: "transform.rotation.z")
        spin.fromValue = 0
        spin.toValue = 2 * Double.pi
        spin.duration = 1            // Tailwind's animate-spin is 1s linear.
        spin.repeatCount = .infinity
        spin.timingFunction = CAMediaTimingFunction(name: .linear)
        // Rotate about the middle, not the layer's origin.
        head.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        head.add(spin, forKey: "spin")
    }
    func stopAnimating() { head.removeAnimation(forKey: "spin") }
}

// ── Slide transition ────────────────────────────────────────────────────────
//
// Makes the browser slide in from the right (and back out to the right on
// close) like advancing to the next slide — instead of the default modal
// sheet that animates up from the bottom and reads as "leaving the app".

final class SlideTransitionDelegate: NSObject, UIViewControllerTransitioningDelegate {
    // Set by the browser's edge-pan handler while a swipe-to-dismiss is in
    // flight; nil for a button-tap dismiss (which just animates normally).
    var interactiveDismiss: UIPercentDrivenInteractiveTransition?

    func animationController(forPresented presented: UIViewController,
                             presenting: UIViewController,
                             source: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        SlideTransitionAnimator(presenting: true)
    }
    func animationController(forDismissed dismissed: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        SlideTransitionAnimator(presenting: false)
    }
    func interactionControllerForDismissal(using animator: UIViewControllerAnimatedTransitioning) -> UIViewControllerInteractiveTransitioning? {
        interactiveDismiss
    }
}

final class SlideTransitionAnimator: NSObject, UIViewControllerAnimatedTransitioning {
    private let presenting: Bool
    init(presenting: Bool) { self.presenting = presenting }

    func transitionDuration(using ctx: UIViewControllerContextTransitioning?) -> TimeInterval { 0.33 }

    func animateTransition(using ctx: UIViewControllerContextTransitioning) {
        let container = ctx.containerView
        let duration = transitionDuration(using: ctx)

        /**
         * A FADE, not a slide.
         *
         * Owner: "change the way the external website content comes in — not
         * that slide-in, but the way it transitions to other pages or
         * slideshows, like a fade."
         *
         * A horizontal slide announces "a different app opened on top of
         * yours". Everywhere else Phoebe changes what you're looking at by
         * cross-fading — the office slides, the page reveals — and the office
         * continuing on venite.app is a change of surface, not a departure. The
         * fade makes the browser feel like the next page of the liturgy rather
         * than somewhere you were sent.
         *
         * The very slight scale keeps a pure opacity fade from reading as a
         * flicker; it's small enough to feel like settling rather than zooming.
         */
        if presenting {
            guard let toVC = ctx.viewController(forKey: .to),
                  let toView = ctx.view(forKey: .to) else {
                ctx.completeTransition(false); return
            }
            toView.frame = ctx.finalFrame(for: toVC)
            toView.alpha = 0
            toView.transform = CGAffineTransform(scaleX: 1.02, y: 1.02)
            container.addSubview(toView)
            UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseOut], animations: {
                toView.alpha = 1
                toView.transform = .identity
            }, completion: { _ in
                ctx.completeTransition(!ctx.transitionWasCancelled)
            })
        } else {
            // The presenter's view stays behind (overFullScreen), so fading the
            // browser out reveals it. Driven by the same percent-based
            // interactive transition as before, so the edge-swipe still tracks
            // the finger — it dims across the drag instead of sliding.
            guard let fromView = ctx.view(forKey: .from) else {
                ctx.completeTransition(false); return
            }
            UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseIn], animations: {
                fromView.alpha = 0
                fromView.transform = CGAffineTransform(scaleX: 1.02, y: 1.02)
            }, completion: { _ in
                if ctx.transitionWasCancelled {
                    // Released before the threshold — restore it in place.
                    // UIView.animate otherwise leaves the model layer at the
                    // final (invisible) values.
                    fromView.alpha = 1
                    fromView.transform = .identity
                } else {
                    fromView.removeFromSuperview()
                }
                ctx.completeTransition(!ctx.transitionWasCancelled)
            })
        }
    }
}

// ── Presenter ─────────────────────────────────────────────────────────────
//
// Single entry point used from BibleBrowserPlugin. Wraps the controller in a
// UINavigationController (top bar + bottom toolbar render automatically) and
// presents it with the custom slide transition + dark Phoebe chrome.

@objcMembers
final class BibleBrowser: NSObject {
    static let shared = BibleBrowser()
    private override init() { super.init() }

    // A few warm, already-loading web views keyed by absolute URL, so tapping a
    // card whose page we preloaded on the home screen opens instantly. Capped
    // so we never hold more than a handful of live pages in memory.
    private var warm: [(url: String, webView: WKWebView)] = []
    private let warmCap = 3

    // Start a background load for `url` unless we're already warming it. Called
    // from JS (PhoebeNative.preloadInAppBrowser) when a newsletter card mounts.
    func preload(url: URL) {
        let key = url.absoluteString
        if warm.contains(where: { $0.url == key }) { return }
        let wv = BibleWebViewController.makeWebView()
        wv.load(URLRequest(url: url))
        warm.append((url: key, webView: wv))
        while warm.count > warmCap { warm.removeFirst() }
    }

    private func takeWarm(for url: URL) -> WKWebView? {
        let key = url.absoluteString
        guard let idx = warm.firstIndex(where: { $0.url == key }) else { return nil }
        let wv = warm[idx].webView
        warm.remove(at: idx)
        return wv
    }

    func present(
        url: URL,
        from presenter: UIViewController?,
        onJournal: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        onChangeFormat: (() -> Void)? = nil,
        onListen: (() -> Void)? = nil,
        isArticle: Bool = false,
        backChrome: Bool = false,
        officeChrome: Bool = false,
        officeTitle: String? = nil,
        officeSlideLabel: String? = nil,
        officeSectionLabel: String? = nil,
        snapshotVeilImage: UIImage? = nil,
        onOfficePrev: (() -> Void)? = nil,
        onOfficeNext: (() -> Void)? = nil,
        onOfficeDisplaySettings: (() -> Void)? = nil,
        onOpenReaderView: ((URL) -> Void)? = nil
    ) {
        guard let presenter = presenter else { return }
        let vc = BibleWebViewController(url: url, preloadedWebView: takeWarm(for: url))
        // officeChrome is its OWN light-chrome page (bible.com / oremus are
        // light), so it gets the article-flavoured starting posture — no dark
        // flash before the page paints — on top of its own button set below.
        vc.isArticle = isArticle || officeChrome
        vc.backChrome = backChrome
        vc.officeChrome = officeChrome
        vc.officeTitleText = officeTitle
        vc.officeSlideLabel = officeSlideLabel
        vc.officeSectionLabel = officeSectionLabel
        vc.snapshotVeilImage = snapshotVeilImage
        vc.onOfficePrev = onOfficePrev
        vc.onOfficeNext = onOfficeNext
        vc.onOfficeDisplaySettings = onOfficeDisplaySettings
        vc.onOpenReaderView = onOpenReaderView
        vc.onJournal = onJournal
        vc.onDismiss = onDismiss
        vc.onChangeFormat = onChangeFormat
        vc.onListen = onListen
        // Office-chrome pages are light pages too (bible.com / oremus) — one
        // flag decides the starting posture for both flavours, so it can't
        // drift the way two independent checks would.
        //
        // Venite specifically joins them. Owner: "on Venite, is it doing dark
        // mode automatically — take that out." Forcing .dark here doesn't just
        // colour our own bars; it cascades to the WEB VIEW too (see viewDidLoad's
        // own note on why — matching prefers-color-scheme so most sites render
        // dark), which was pushing Venite's OWN page into a dark rendering it
        // never asked for, on top of our chrome. Venite is normally light, so it
        // gets the same "start neutral, let syncChromeToPage correct it after
        // paint" treatment as an article — not forced into a theme it doesn't
        // choose for itself.
        let isVenite = url.host?.lowercased().hasSuffix("venite.app") ?? false
        let startsLight = isArticle || officeChrome || isVenite
        let nav = UINavigationController(rootViewController: vc)
        nav.overrideUserInterfaceStyle = startsLight ? .light : .dark
        // Keep the top + bottom bars pinned — never collapse/minimize on scroll
        // or tap, so the back + Journal buttons stay reachable the whole read.
        nav.hidesBarsOnSwipe = false
        nav.hidesBarsOnTap = false

        // Dark Phoebe chrome for the top navigation bar.
        let barAppearance = UINavigationBarAppearance()
        barAppearance.configureWithOpaqueBackground()
        barAppearance.backgroundColor = startsLight ? .white : PhoebeBrowserColor.bar
        barAppearance.titleTextAttributes = [.foregroundColor: startsLight ? UIColor.black : PhoebeBrowserColor.text]
        barAppearance.shadowColor = UIColor.clear
        nav.navigationBar.standardAppearance = barAppearance
        nav.navigationBar.scrollEdgeAppearance = barAppearance
        nav.navigationBar.compactAppearance = barAppearance
        nav.navigationBar.tintColor = startsLight ? .black : .white

        // …and the bottom toolbar.
        let toolbarAppearance = UIToolbarAppearance()
        toolbarAppearance.configureWithOpaqueBackground()
        toolbarAppearance.backgroundColor = startsLight ? .white : PhoebeBrowserColor.bar
        toolbarAppearance.shadowColor = UIColor.clear
        nav.toolbar.standardAppearance = toolbarAppearance
        nav.toolbar.compactAppearance = toolbarAppearance
        if #available(iOS 15.0, *) {
            nav.toolbar.scrollEdgeAppearance = toolbarAppearance
        }
        nav.toolbar.tintColor = startsLight ? .black : PhoebeBrowserColor.tint
        // Owner: "we don't actually need the bottom bar." Everything on it is
        // either duplicated in Options (reload, share) or unused while reading
        // — and on something you scroll for ten minutes, a permanent bar is
        // just less page. Done (and, for an office, Options) stay pinned at the
        // top.
        nav.setToolbarHidden(true, animated: false)

        // Slide in from the right (next-slide feel), over the app rather than
        // replacing it, so the dismiss can slide back to reveal it.
        nav.modalPresentationStyle = .overFullScreen
        nav.transitioningDelegate = vc.slideDelegate

        presenter.present(nav, animated: true)
    }
}
