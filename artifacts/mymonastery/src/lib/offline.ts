/**
 * offline — is the device online, and which practices work without it.
 *
 * Owner (2026-09-05): "when they are offline, anything in their routine that
 * is not available offline, put in a third category after Next and Done
 * called Not Available Offline … and a menu list with cards of everything
 * that they can do offline."
 *
 * ONE registry, read by the home (the third section), the Available Offline
 * page, and anything else that has to answer "can this be done with no
 * connection".
 *
 * SCREENS ASK THE SWITCH, SAVING ASKS THE DEVICE. isOnline() honours the Admin
 * Tools "Simulate offline" toggle so the offline surfaces can be walked on a
 * device with no Airplane Mode; isReallyOnline() ignores it, because the daily
 * save must not stop the moment someone turns the toggle on to test — that
 * guarantees the empty phone it was meant to diagnose. A practice is offline-capable when everything it needs is
 * either bundled in the app or saved on the device by the prefetch
 * (officePrefetch: the offices, the readers' passages, Visio's pictures).
 */
import { useEffect, useState } from "react";

/**
 * A FORCED OFFLINE, for testing on a device.
 *
 * The iOS Simulator has no Airplane Mode of its own — it uses the Mac's
 * network stack — so there is no way to see the offline app without taking
 * the whole machine off the network. Admin Tools carries a switch that writes
 * this key ("Simulate offline"), and every reader of the connection honours
 * it. Off by default and only reachable from an admin screen; nothing writes
 * it on its own.
 */
export const DEBUG_OFFLINE_KEY = "phoebe:debug:offline";
export const DEBUG_OFFLINE_EVENT = "phoebe:debug-offline-changed";

export function debugOfflineForced(): boolean {
  try { return localStorage.getItem(DEBUG_OFFLINE_KEY) === "1"; } catch { return false; }
}

/** Flip the forced offline and tell everything listening — the same
 *  online/offline events the browser fires, so no listener needs to know. */
export function setDebugOffline(on: boolean): void {
  try {
    if (on) localStorage.setItem(DEBUG_OFFLINE_KEY, "1");
    else localStorage.removeItem(DEBUG_OFFLINE_KEY);
  } catch { /* private mode */ }
  try {
    window.dispatchEvent(new Event(DEBUG_OFFLINE_EVENT));
    window.dispatchEvent(new Event(on ? "offline" : "online"));
  } catch { /* ignore */ }
}

/**
 * THE REAL CONNECTION, ignoring the simulate-offline switch.
 *
 * Everything the PERSON sees goes through isOnline() below, switch included —
 * that is the point of it. But the prefetch must not: someone turns the
 * switch on to walk the offline app, and from then on the daily save never
 * runs, so the phone stays empty and the switch "proves" offline is broken.
 * Saving asks the device, never the toggle.
 */
export function isReallyOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export function isOnline(): boolean {
  if (debugOfflineForced()) return false;
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/** The OS's own word — airplane mode, Wi-Fi off. (A captive portal or a
 *  dead server still reads "online"; NetworkBanner handles that separately.) */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(isOnline);
  useEffect(() => {
    // Always re-read isOnline() rather than trusting the event's direction —
    // the forced offline above has to win over a real "online" event.
    const sync = () => setOnline(isOnline());
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener(DEBUG_OFFLINE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener(DEBUG_OFFLINE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return online;
}

export type OfflinePractice = {
  key: string;
  emoji: string;
  title: string;
  sub: string;
  href: string;
  /** How it comes to be on the phone. */
  how: "bundled" | "saved";
};

/**
 * Everything that can be kept with no connection. "bundled" practices ship
 * inside the app; "saved" ones are copied to the device ahead of time by the
 * daily prefetch (on Wi-Fi, for the coming weeks).
 */
export const OFFLINE_PRACTICES: OfflinePractice[] = [
  { key: "office", emoji: "📖", title: "Daily Offices", sub: "Morning and Evening Prayer, Compline and the devotions — saved for the coming month", href: "/bcp/daily-office", how: "saved" },
  { key: "scripture", emoji: "📜", title: "Scripture Reading", sub: "The day's lessons, with the passages saved to read here", href: "/bcp/daily-office?mode=scripture", how: "saved" },
  { key: "lectio", emoji: "📜", title: "Lectio Divina", sub: "Three slow readings of a passage saved on your phone", href: "/lectio", how: "saved" },
  { key: "guided-prayer", emoji: "🙌🏽", title: "Simple Guided Prayer", sub: "Three minutes to start your day", href: "/guided-prayer", how: "bundled" },
  { key: "examen", emoji: "🌗", title: "The Examen", sub: "Review the day with God", href: "/examen", how: "bundled" },
  { key: "cobreathe", emoji: "🌍", title: "Creation Prayer", sub: "Breathing with creation", href: "/cobreathe", how: "bundled" },
  { key: "visio", emoji: "🖼️", title: "Visio Divina", sub: "The coming weeks' pictures and readings, saved ahead", href: "/visio", how: "saved" },
  { key: "psalms", emoji: "🎼", title: "The Psalms", sub: "The Psalter, from the prayer book", href: "/psalms", how: "bundled" },
  { key: "contemplation", emoji: "🕯️", title: "Contemplation", sub: "The silent sit and its timer", href: "/contemplation", how: "bundled" },
  { key: "pray-breath", emoji: "🫁", title: "Pray the Breath", sub: "A breath prayer", href: "/pray-breath", how: "bundled" },
  { key: "prayer-list-card", emoji: "🕊️", title: "Prayer List", sub: "The people and things you hold — from the last copy on your phone", href: "/prayer-list", how: "saved" },
  { key: "compline", emoji: "🌙", title: "Compline", sub: "The night office, saved with the others", href: "/bcp/daily-office?mode=compline", how: "saved" },
  /**
   * AUDIO DIVINA CAME BACK (owner, 2026-09-06, in two steps). First: "audio
   * divina should be in there" — the Not available section — because the
   * library is a stream and a card that cannot do the thing it names does not
   * belong in the available list. Then, once the logging page was taught to
   * work without the catalogue: "then you would want to make it available
   * offline, cause right now it's gated to offline." So it is available for
   * what it can do — you type what you listened to and log it, and the log
   * queues until you are back — and the sub-line says the rest.
   */
  { key: "listening", emoji: "🎵", title: "Audio Divina", sub: "Log what you listened to by name; searching the library needs a connection", href: "/listening", how: "bundled" },
  { key: "gratitude", emoji: "🙏🏽", title: "Express gratitude", sub: "Logged here, sent when you're back online", href: "/dashboard", how: "bundled" },
  { key: "walk", emoji: "🚶🏽", title: "Contemplative Walk", sub: "Logged here, sent when you're back online", href: "/dashboard", how: "bundled" },
  { key: "reading", emoji: "📚", title: "Reading", sub: "Logged here, sent when you're back online", href: "/reading-log", how: "bundled" },
];

/**
 * THE KEYS THE HOME ACTUALLY USES, beside the registry's own.
 *
 * The registry above is also the /offline menu, so its keys read as practice
 * names; the home's card keys are not always the same word, and every key
 * this set doesn't know falls to "Not Available Offline". A simulator walk
 * (2026-09-05) found three cards wrongly parked there for exactly that
 * reason: the daily silence card is keyed "silence", the prayer list card
 * "prayer-list-card", and Audio Divina — which is a LOG, not a stream —
 * was simply missing.
 */
const EXTRA_OFFLINE_KEYS = ["silence", "prayer-list", "contemplation", "psalms", "guided-prayer", "novena"];
const OFFLINE_KEYS = new Set([...OFFLINE_PRACTICES.map((p) => p.key), ...EXTRA_OFFLINE_KEYS]);

/**
 * DOES THIS SCREEN WORK WITH NO CONNECTION?
 *
 * The app raises "You're offline — this needs a connection" whenever a query
 * fails with nothing cached. That was written before there was an offline
 * layer, and now it fires over practices that are working perfectly from the
 * phone: the owner met it on Visio, mid-practice, with the saved picture on
 * screen (2026-09-06), and over the office. A background query failing is not
 * news to someone who is looking at the thing they asked for.
 *
 * The routes below are the practices the registry says work offline, plus the
 * decks they open. A failing query on one of these says nothing.
 */
const OFFLINE_ROUTES = [
  ...OFFLINE_PRACTICES.map((p) => p.href.split("?")[0] ?? p.href),
  "/bcp/daily-office", "/offline", "/dashboard", "/daily-progress",
];
export function pathWorksOffline(path: string): boolean {
  const p = (path.split("?")[0] ?? path).replace(/\/+$/, "") || "/";
  return p === "/" || OFFLINE_ROUTES.some((r) => r === p || p.startsWith(`${r}/`));
}

/**
 * Is a HOME CARD one of the offline practices? Card keys are the rhythm's:
 * a side ("morning"/"evening" and their extra-/contemplation- forms) is an
 * office or a bundled practice; the rest are practice keys. Newsletters,
 * publications, podcasts, the icons and the spirituals all need the
 * network — their content is a web page or a stream, not a saved copy.
 */
export function cardAvailableOffline(cardKey: string, sideLevel?: string | null, sideKind?: string | null): boolean {
  if (OFFLINE_KEYS.has(cardKey)) return true;
  if (/^(morning|evening)$/.test(cardKey) || /^extra-(morning|evening)$/.test(cardKey)) {
    // A side whose prayer IS a newsletter (the "fdd" level) reads a web page.
    if (sideLevel === "fdd") return false;
    return true;
  }
  if (/^contemplation-(morning|evening)$/.test(cardKey)) {
    // Audio Divina streams; the rest are the sit, the breath, a walk, a look
    // at a saved picture, or a saved passage.
    return sideKind !== "audio";
  }
  // A practice of the reader's own is kept with a tap — nothing to fetch.
  if (cardKey.startsWith("custom-") || cardKey.startsWith("anchor-")) return true;
  return false;
}
