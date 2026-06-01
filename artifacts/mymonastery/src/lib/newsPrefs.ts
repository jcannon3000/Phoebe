// News & Actions prefs — per-device, same grain as officePrefs.
//
// Which partner-org news sources the user follows ("subscribes" to) and
// when they last looked at their news (for "new since"). Subscribing is
// the opt-in: a followed source's NEW stories surface as a short slide at
// the end of prayer (see prayer-mode's closing), and the source's stories
// show on /news. Empty by default — nothing appears in prayer until the
// user follows a source. Per-device (localStorage); promote to a server
// column only if cross-device sync becomes important.

import { useEffect, useState } from "react";

const KEY_SUBSCRIPTIONS = "phoebe:news:subscriptions"; // JSON string[] of source slugs
const KEY_SEEN_AT = "phoebe:news:seen-at"; // ms timestamp of last view

export const NEWS_PREFS_EVENT = "phoebe:news-prefs";

function emit(): void {
  try { window.dispatchEvent(new Event(NEWS_PREFS_EVENT)); } catch { /* noop */ }
}

export function getNewsSubscriptions(): string[] {
  try {
    const raw = localStorage.getItem(KEY_SUBSCRIPTIONS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function setNewsSubscriptions(slugs: string[]): void {
  try {
    const uniq = Array.from(new Set(slugs.filter((s) => typeof s === "string")));
    localStorage.setItem(KEY_SUBSCRIPTIONS, JSON.stringify(uniq));
    emit();
  } catch {
    /* private mode / quota — non-fatal */
  }
}

export function isNewsSubscribed(slug: string): boolean {
  return getNewsSubscriptions().includes(slug);
}

export function toggleNewsSubscription(slug: string): void {
  const cur = getNewsSubscriptions();
  setNewsSubscriptions(cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]);
}

// Last time the user looked at their news — anything newer counts as
// "new" for the end-of-prayer slide. 0 = never looked.
export function getNewsSeenAt(): number {
  try {
    const n = parseInt(localStorage.getItem(KEY_SEEN_AT) ?? "", 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
export function markNewsSeen(): void {
  try {
    localStorage.setItem(KEY_SEEN_AT, String(Date.now()));
    emit();
  } catch {
    /* non-fatal */
  }
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

// Reactive snapshot of the follow list — re-renders on change (this page
// or another tab). Use in render instead of calling the getter directly.
export function useNewsSubscriptions(): string[] {
  const [subs, setSubs] = useState<string[]>(getNewsSubscriptions);
  useEffect(() => {
    const refresh = () => setSubs(getNewsSubscriptions());
    window.addEventListener(NEWS_PREFS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(NEWS_PREFS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return subs;
}
