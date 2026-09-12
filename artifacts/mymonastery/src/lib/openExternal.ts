// Open an outbound link. On the iOS Capacitor shell we call
// PhoebeNative.openInAppBrowser directly (synchronously, from the user's
// click handler), which calls Browser.open() under the hood and presents
// SFSafariViewController. Calling it inside the click context preserves
// the iOS user-gesture requirement that the popup blocker enforces;
// dispatching through a CustomEvent (the previous wiring) lost that
// context and got silently blocked.
//
// On the web build PhoebeNative is undefined, so we fall back to
// window.open — which iOS Safari blocks unless triggered by a click,
// but we ARE in a click handler here, so it opens a new tab.

type PhoebeNative = {
  isNative?: () => boolean;
  openInAppBrowser?: (
    url: string,
    opts?: {
      lightChrome?: boolean;
      backChrome?: boolean;
      officeChrome?: boolean;
      officeTitle?: string;
      slideLabel?: string;
      sectionLabel?: string;
      previous?: { title: string; url: string }[];
    },
  ) => Promise<void>;
  preloadInAppBrowser?: (url: string) => Promise<void>;
};

/**
 * `reader` is accepted for the callers that still pass it, and deliberately
 * does nothing.
 *
 * It used to route newsletters to SFSafariViewController with Reader mode on.
 * Owner, twice: "undo the reader-mode automation for the CAC newsletter", then
 * "I want a similar animation on CAC and all the newsletters." Reader mode was
 * a different presentation entirely — a sheet that slides up from the bottom,
 * with Safari's own chrome and a toolbar that collapses as you scroll. Sending
 * everything through the one in-app browser gives newsletters the same cross-
 * fade, the same Done button and the same Options menu as the office, so
 * outbound reading is one surface rather than two that behave differently.
 *
 * It does still carry one bit of real information, and the browser uses it:
 * these are ARTICLES, which are overwhelmingly light pages. The chrome resolves
 * its colour from the page's own background once that paints, and this says
 * which way to start so a cream article doesn't open behind a black bar for a
 * beat. Owner: "for the newsletters default to a white top bar."
 */
import { getSavedPage } from "@/lib/pageCache";
import { isOnline, osSaysOnline } from "@/lib/offline";

type OpenOpts = {
  /**
   * A page saved for offline, loaded INSTEAD of fetching the url — Safari's
   * Reading List, not a text extract (owner, 2026-09-06: "have the page
   * downloaded just like how Safari mobile has a read later, then overlay the
   * reader over the saved page, and get the same result").
   */
  savedHtml?: string;
  reader?: boolean;
  /**
   * Earlier issues of the thing being opened — the native reader shows them
   * under a "Previous" menu top right (owner: "'previous', which would list
   * the last 7"), in place of the office Options menu that a plain open
   * gets. Newest first; the reader loads whichever is picked in place.
   */
  previous?: { title: string; url: string }[];
  /**
   * Label the one top-left button "Back" instead of "Done".
   *
   * "Done" is right for a newsletter you finish reading (owner asked for that
   * pill by name). It is wrong for a page you stepped sideways into and will
   * step out of — Visio Divina's closing card offers the commentary, and
   * "Done" there would claim you had completed something. Same chrome
   * otherwise: one button, top left, and nothing else.
   */
  back?: boolean;
  /**
   * LEAVE THE APP ENTIRELY — the system browser, not Phoebe's in-app one.
   *
   * Owner, on a leader linking to a parish's own platform: "we would wanna
   * make sure it's not opening in an in-app browser, but going to the
   * ParishFul app, or going to whatever website outside the app."
   *
   * The reason is deep links. An in-app web view is a browser Phoebe owns: it
   * renders the page and nothing else. Handing the URL to the SYSTEM lets iOS
   * decide, and iOS will open an installed app when the link belongs to one —
   * a giving platform, a ticketing page, a calendar. Rendering that same URL
   * in a web view means signing in again inside a browser that forgets you.
   *
   * So this is not a styling preference; it is the difference between landing
   * in an app someone is already signed into and landing on its login page.
   */
  system?: boolean;
};

/**
 * Returns whether the hand-off actually happened — true for native (the
 * plugin call always "succeeds" as far as the caller can tell; there's no
 * popup-blocker concept in a native browser), and on web, whether
 * `window.open` actually returned a window rather than null.
 *
 * Reported: "there is an issue with a pop-up blocker on web and then it just
 * goes to a green screen." A caller (bcp-daily-office.tsx's Venite hand-off)
 * was treating the CALL as the hand-off — it set its "gone to the browser,
 * show nothing" state unconditionally, with no way to notice a blocked
 * popup and no signal to recover on (the page never lost focus, since no
 * new tab actually opened, so the visibilitychange-based "they're back"
 * listener never fires either). A blocked popup left that screen stuck
 * forever. Checking the return value is what lets a caller fall back
 * instead of hanging.
 */
/**
 * Open a URL in a new TAB on the web, and say truthfully whether it opened.
 *
 * Reported: "there's still an issue with opening things like scripture reading
 * and stuff on web… possibly because it's trying to do it as a pop up and not
 * a new tab." Exactly right, and the third argument was doing both kinds of
 * damage:
 *
 *   window.open(url, "_blank", "noopener,noreferrer")
 *
 *   1. ANY windowFeatures string switches browsers from tab semantics to
 *      POPUP-WINDOW semantics. It stopped being a new tab, and popup blockers
 *      treat a popup far more harshly than a tab.
 *   2. When `noopener` is in that string, window.open is SPECIFIED to return
 *      null — on success. So `!!window.open(...)` was false every single time
 *      on web, and every caller that checks the hand-off (the Venite flow
 *      falls back on a blocked popup) was told the open had failed even when
 *      a window did appear.
 *
 * Omitting the features string restores tab semantics AND gives us back a real
 * window handle to test. Severing `opener` afterwards keeps the security
 * property the string was there for (reverse tabnabbing) without paying for it
 * in either bug. The referrer is no longer suppressed — an anchor with
 * rel="noreferrer" is the only way to do that, and it cannot report whether
 * the tab opened, which is the thing callers depend on.
 */
function openWebTab(url: string): boolean {
  const w = window.open(url, "_blank");
  if (!w) return false;
  try { w.opener = null; } catch { /* cross-origin already severed it */ }
  return true;
}

/**
 * http/https ONLY, checked at the point of opening.
 *
 * Every current writer validates the scheme — the group-post route rejects
 * anything else, and the inbound-email parser requires `https?://` — but this
 * is the read side, and it opened whatever string it was handed. A
 * `javascript:` or `data:` URL that reached the database by any other route
 * (a future writer, an import, a hand-edited row) would be opened for every
 * member who tapped the card. Validating where the action happens costs one
 * parse and doesn't depend on remembering the rule at each new write site.
 */
function isSafeExternalUrl(url: string): boolean {
  try {
    const p = new URL(url, window.location.href).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

export function openExternal(url: string, opts?: OpenOpts): boolean {
  if (!url || !isSafeExternalUrl(url)) return false;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative })
    .PhoebeNative;
  /**
   * Straight out to the system, before the in-app browser is even considered.
   * `window.open` on a Capacitor web view hands the URL to iOS, which opens
   * the owning app when there is one and Safari when there isn't — which is
   * exactly the handoff `system` exists to get.
   */
  if (opts?.system) return openWebTab(url);
  if (native?.openInAppBrowser) {
    cancelPendingRead();
    void native.openInAppBrowser(url, { lightChrome: !!opts?.reader, backChrome: !!opts?.back, ...(opts?.savedHtml ? { savedHtml: opts.savedHtml } : {}), ...(opts?.previous?.length ? { previous: opts.previous } : {}) });
    return true;
  }
  // Web fallback. noopener for security; noreferrer to keep the
  // outbound URL out of the destination's referrer logs. (Reader mode is a
  // native SFSafari affordance — a plain web tab can't be forced into it.)
  return openWebTab(url);
}

// Open a reflection / newsletter, and mark it read only once the user CLOSES
// the in-app browser (native), not the instant they open it — so the "done"
// animation waits until they've actually X'd out. On web there's no close event
// (it opens a new tab), so we mark on open, which is the best we can do.
/**
 * The reading whose close we are still waiting for. At most one — see the note
 * inside openExternalThenMarkRead.
 */
let pendingRead: { cancel: () => void } | null = null;
/**
 * ANY native browser open supersedes a pending read — not just another
 * openExternalThenMarkRead (audit, 2026-09-08).
 *
 * The supersede was wired into one of the three doors. The others
 * (openExternal, openOfficeReading) left an armed listener behind, so the
 * original bug survived end to end: open the CAC meditation, use its Options
 * menu to change format (which suppresses browserfinished), then open an
 * office lesson and close it — and the CAC read is marked, with a dwell
 * measured from the CAC open. Long enough to clear the ten-second bar, and
 * markRead credits the anchor whatever the bar says.
 */
export function cancelPendingRead(): void { pendingRead?.cancel(); }
/** A reader open for longer than this is not a reading anyone came back from;
 *  the app was backgrounded, or the close event was suppressed by a handoff. */
const PENDING_READ_MAX_MS = 6 * 60 * 60 * 1000;

export function openExternalThenMarkRead(
  url: string,
  markRead: (dwellMs?: number) => void,
  opts?: OpenOpts,
): void {
  if (!url) return;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative }).PhoebeNative;
  // Gate on the method that will ACTUALLY be called. A native build where the
  // gate and the call disagree falls through to the web branch below and marks
  // read the INSTANT the link opens rather than when the person comes back —
  // that was the "newsletter dot flips at tap time" bug.
  if (native?.isNative?.() && native?.openInAppBrowser) {
    cancelPendingRead();
    void native.openInAppBrowser(url, { lightChrome: !!opts?.reader, backChrome: !!opts?.back, ...(opts?.savedHtml ? { savedHtml: opts.savedHtml } : {}), ...(opts?.previous?.length ? { previous: opts.previous } : {}) });
    // Marks read when the browser closes — the finished event. (The 2026-09-04
    // scroll-tracking outcome — "count only when scrolled to the end", a
    // Continue bar for a partial read — was removed 2026-09-05, owner: "take
    // out the scrolling feature at all levels".)
    /**
     * …AND HOW LONG THEY STAYED. The reader's open→close span is the only
     * honest measure of a read this app can take, and the home needs it for
     * ONE case: a newsletter that isn't in the person's rhythm, which only
     * lands in Done after a real read rather than a tap and a bounce (owner:
     * "make sure they read it for more the 10 seconds"). A newsletter that IS
     * in the rhythm is unaffected — opening it still keeps it.
     */
    const openedAt = Date.now();
    /**
     * ONE PENDING READ AT A TIME, AND IT EXPIRES (native audit, 2026-09-08).
     *
     * This listener used to be registered per call and removed only from
     * inside itself, which went wrong two ways.
     *
     * The browser does NOT always fire `phoebe:browserfinished`: the native
     * side suppresses it whenever it dismisses to hand off somewhere else —
     * Options → "Change format" or "Listen", the office pill's Back/Next, the
     * Display gear. So the listener outlived its reading and fired on the NEXT
     * browser close, marking the earlier item read, with a dwell measured from
     * the earlier open. That is minutes long, so it sailed straight past the
     * ten-second bar the home holds an out-of-rhythm newsletter to — the one
     * check that exists to stop a tap and a bounce counting as a read.
     *
     * Opening a second reading before the first closes attached two listeners,
     * and the first close then fired both.
     *
     * So: superseding a pending read cancels it (a handoff or a second open is
     * not a finished read), and one that never hears its event is dropped
     * after a ceiling rather than waiting all session to credit the wrong
     * thing. Nothing is marked in either case, which is the safe direction —
     * an unrecorded read costs a tap; a wrongly recorded one is a lie about
     * the person's day.
     */
    if (pendingRead) pendingRead.cancel();
    const cancel = () => {
      window.removeEventListener("phoebe:browserfinished", onDone);
      window.clearTimeout(timer);
      if (pendingRead?.cancel === cancel) pendingRead = null;
    };
    const onDone = () => {
      cancel();
      markRead(Date.now() - openedAt);
    };
    const timer = window.setTimeout(cancel, PENDING_READ_MAX_MS);
    pendingRead = { cancel };
    window.addEventListener("phoebe:browserfinished", onDone);
    return;
  }
  openWebTab(url);
  markRead();
}

/**
 * Open a Bible passage FROM inside the office — the "Read online" pill on a
 * lesson slide.
 *
 * Owner: "what if the verse page operates as splash and it fades from that
 * into the web page... then it has a top bar with the same buttons the office
 * has, but in white, and a floating bottom bar with the same buttons and
 * progress, also in white... when you click forward next on the bottom bar it
 * goes to the next screen, which would be the canticle."
 *
 * On native this is a distinct browser flavour (see BibleWebViewController's
 * `officeChrome`): the veil is a screenshot of the office slide already on
 * screen rather than the generic Splash leaf, the top bar carries the
 * office's own controls (← Back / title / Display gear / close) instead of
 * Done, and a floating bottom pill mirrors the office's — tapping its Back or
 * Next dismisses the browser and steps the OFFICE'S OWN slide index (the deck
 * underneath is a real, already-mounted screen; see the
 * phoebe:office-{prev,next}-slide listeners in bcp-daily-office.tsx).
 *
 * On web there is no native chrome to build, and injecting fixed UI into a
 * third-party origin tab isn't possible — falls back to the plain external
 * open, same as any other outbound link.
 */
/**
 * Is there a native in-app browser to hand off to?
 *
 * Callers need this because the native and web hand-offs have different
 * AFTERMATHS, not just different mechanics. Native keeps the office mounted
 * underneath and steps it from the browser's own bottom bar
 * (phoebe:office-next-slide); on the web that bar cannot exist, so nothing
 * ever steps the deck and it parks on the lesson slide forever.
 */
export function hasNativeBrowser(): boolean {
  const native = (window as unknown as { PhoebeNative?: PhoebeNative }).PhoebeNative;
  return !!native?.openInAppBrowser;
}

export function openOfficeReading(
  url: string,
  ctx: { officeTitle: string; slideLabel: string; sectionLabel: string; savedHtml?: string },
): boolean {
  if (!url) return false;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative }).PhoebeNative;
  if (native?.openInAppBrowser) {
    cancelPendingRead();
    void native.openInAppBrowser(url, {
      officeChrome: true,
      officeTitle: ctx.officeTitle,
      slideLabel: ctx.slideLabel,
      sectionLabel: ctx.sectionLabel,
      ...(ctx.savedHtml ? { savedHtml: ctx.savedHtml } : {}),
    });
    return true;
  }
  // See openExternal's own note on why the return value matters — same
  // "popup blocked → don't act like the hand-off happened" reasoning.
  return openWebTab(url);
}

// Warm a URL in the native in-app browser's background so a later openExternal
// of the same URL opens instantly. No-op on web (there's nothing to preload)
// and best-effort everywhere — safe to call from a card's mount effect.
export function preloadExternal(url: string): void {
  if (!url) return;
  const native = (window as unknown as { PhoebeNative?: PhoebeNative }).PhoebeNative;
  if (native?.preloadInAppBrowser) void native.preloadInAppBrowser(url);
}

/**
 * OPEN A READING — the saved page when there is one, the live page otherwise.
 *
 * The one door for every practice that opens a publisher's page: the office
 * deck's lessons, Lectio, Visio, the Scripture and Sunday decks. Offline it
 * loads the page SAVED on the device into the same reader, so an offline
 * reading IS the online reading rather than a second rendering of someone
 * else's text (owner, 2026-09-06, on the copyright of extracting it).
 *
 * Returns false when nothing is saved and there is no connection — the caller
 * decides what to say; there is nothing useful to open.
 */
export async function openReadingPage(
  url: string,
  ctx: { officeTitle: string; slideLabel: string; sectionLabel: string },
): Promise<boolean> {
  if (!url) return false;
  /**
   * ON WEB, OPEN IN THE SAME TICK AS THE TAP — before any await.
   *
   * This function's whole job is "saved page first", and it did that by
   * awaiting IndexedDB. On the native shell that is free: the in-app browser
   * has no popup-blocker concept. On the web build it is fatal — window.open
   * is only allowed while the browser still considers itself inside the user's
   * click, and one await of an IndexedDB read is enough to lose that. The
   * reading silently didn't open (owner, 2026-09-06: "it's getting pop up
   * blocked"), which is exactly the trap this file's header warns about.
   *
   * Nothing is given up by skipping the lookup here: saved pages are written
   * only by the background walk, and the walk is native-only, so on web
   * getSavedPage has never had anything to return.
   */
  if (!hasNativeBrowser()) return openOfficeReading(url, ctx);
  const saved = await getSavedPage(url);
  if (saved?.html) return openOfficeReading(url, { ...ctx, savedHtml: saved.html });
  // Not isOnline(): that verdict stays "offline" for 20 s after any request
  // timed out, and with nothing saved (a signed-out phone) it kept the Visio
  // passage from opening at all. The reader reports its own failure; only the
  // OS's word (Airplane Mode, Wi-Fi off) refuses here.
  if (!osSaysOnline()) return false;
  return openOfficeReading(url, ctx);
}
