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
 * connection". A practice is offline-capable when everything it needs is
 * either bundled in the app or saved on the device by the prefetch
 * (officePrefetch: the offices, the readers' passages, Visio's pictures).
 */
import { useEffect, useState } from "react";

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/** The OS's own word — airplane mode, Wi-Fi off. (A captive portal or a
 *  dead server still reads "online"; NetworkBanner handles that separately.) */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(isOnline);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
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
  { key: "prayer-list", emoji: "🕊️", title: "Prayer List", sub: "The people and things you hold — from the last copy on your phone", href: "/prayer-list", how: "saved" },
  { key: "gratitude", emoji: "🙏🏽", title: "Express gratitude", sub: "Logged here, sent when you're back online", href: "/dashboard", how: "bundled" },
  { key: "walk", emoji: "🚶🏽", title: "Contemplative Walk", sub: "Logged here, sent when you're back online", href: "/dashboard", how: "bundled" },
  { key: "reading", emoji: "📚", title: "Reading", sub: "Logged here, sent when you're back online", href: "/reading-log", how: "bundled" },
];

const OFFLINE_KEYS = new Set(OFFLINE_PRACTICES.map((p) => p.key));

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
  if (cardKey.startsWith("custom-") || cardKey.startsWith("anchor-")) return true;
  return false;
}
