// News & Actions prefs — per-device, same grain as officePrefs.
//
// Which partner-org news sources the user follows ("subscribes" to) and
// when they last looked at their news (for "new since"). Subscribing is
// the opt-in: a followed source's NEW stories surface as a short slide at
// the end of prayer (see prayer-mode's closing), and the source's stories
// show on /news. Empty by default — nothing appears in prayer until the
// user follows a source. Per-device (localStorage); promote to a server
// column only if cross-device sync becomes important.
//
// Also tracks per-story "hidden" state: the user can dismiss individual
// stories from the home-screen rail with the eye-off button. Hidden IDs
// are stored in the same event bus so NewsRail re-renders immediately.

import { useEffect, useState } from "react";

const KEY_SUBSCRIPTIONS = "phoebe:news:subscriptions"; // JSON string[] of source slugs
const KEY_SEEN_AT = "phoebe:news:seen-at"; // ms timestamp of last view
const KEY_HIDDEN_IDS = "phoebe:news:hidden-ids"; // JSON string[] of hidden story IDs

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

// ── Hidden story IDs ──────────────────────────────────────────────────────────

export function getHiddenStoryIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY_HIDDEN_IDS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

export function hideStory(id: string): void {
  try {
    const cur = getHiddenStoryIds();
    cur.add(id);
    localStorage.setItem(KEY_HIDDEN_IDS, JSON.stringify(Array.from(cur)));
    emit();
  } catch { /* non-fatal */ }
}

export function unhideStory(id: string): void {
  try {
    const cur = getHiddenStoryIds();
    cur.delete(id);
    localStorage.setItem(KEY_HIDDEN_IDS, JSON.stringify(Array.from(cur)));
    emit();
  } catch { /* non-fatal */ }
}

export function clearHiddenStories(): void {
  try {
    localStorage.removeItem(KEY_HIDDEN_IDS);
    emit();
  } catch { /* non-fatal */ }
}

/** Reactive — re-renders when any story is hidden/unhidden. */
export function useHiddenStoryIds(): Set<string> {
  const [hidden, setHidden] = useState<Set<string>>(getHiddenStoryIds);
  useEffect(() => {
    const refresh = () => setHidden(getHiddenStoryIds());
    window.addEventListener(NEWS_PREFS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(NEWS_PREFS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return hidden;
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
